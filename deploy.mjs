#!/usr/bin/env node
/**
 * GitHub Pages 一键部署脚本（走 REST API，不需要 git push）
 *
 * 用途：当前网络环境下 github.com 不可达，但 api.github.com 可用，
 *      因此使用 Contents API 上传文件、Pages API 开启托管。
 *
 * 用法：
 *   Windows CMD :  set GITHUB_TOKEN=ghp_xxx && node deploy.mjs
 *   PowerShell  :  $env:GITHUB_TOKEN="ghp_xxx"; node deploy.mjs
 *   Git Bash    :  GITHUB_TOKEN=ghp_xxx node deploy.mjs
 *
 * Token 权限：fine-grained token 需 Repository permissions -> Administration(读写)
 *            + Contents(读写) + Pages(读写)；classic token 勾选 repo 即可。
 *            Token 只存在内存与环境变量中，本脚本不会写入任何文件。
 */

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.github.com';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const REPO_NAME = process.env.REPO_NAME || 'activity-signup-system';

const FILES = ['index.html', 'styles.css', 'app.js', 'README.md', '.nojekyll', 'deploy.mjs'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!TOKEN) {
  console.error('❌ 未检测到 GITHUB_TOKEN 环境变量。');
  console.error('   请先设置：set GITHUB_TOKEN=ghp_xxx  (Windows CMD)');
  process.exit(1);
}

async function api(pathname, { method = 'GET', body, accept = 'application/vnd.github+json' } = {}) {
  const res = await fetch(API + pathname, {
    method,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'gatherhub-deploy'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!res.ok) {
    const err = new Error('GitHub API ' + res.status + ' ' + method + ' ' + pathname);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

function b64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

(async function main() {
  const log = (...a) => console.log(...a);

  /* 1. 校验 Token 与账号 */
  log('▶ 1/6 校验 Token …');
  let me;
  try {
    me = await api('/user');
  } catch (e) {
    if (e.status === 401) {
      console.error('❌ Token 无效或已过期（401）。请重新生成后重试。');
      process.exit(1);
    }
    throw e;
  }
  const owner = me.login;
  log('   账号：' + owner + '（' + (me.name || '未设置昵称') + '）');

  /* 2. 创建或复用仓库（名称被占用时自动追加短后缀） */
  log('▶ 2/6 准备仓库 …');
  let repo = null;
  let finalName = REPO_NAME;

  // 先尝试复用自己名下已存在的同名仓库，避免重复建仓
  try {
    const existing = await api('/repos/' + owner + '/' + REPO_NAME);
    if (existing && existing.owner && existing.owner.login === owner) {
      repo = existing;
      finalName = REPO_NAME;
      log('   仓库已存在，复用：' + existing.full_name + '（本次为更新部署）');
    }
  } catch (e) {
    if (e.status !== 404) throw e;
  }

  const candidates = [REPO_NAME, REPO_NAME + '-' + Math.random().toString(36).slice(2, 6)];

  for (const name of (repo ? [] : candidates)) {
    try {
      repo = await api('/user/repos', {
        method: 'POST',
        body: {
          name,
          description: '聚场 GatherHub · 在线活动报名管理系统（纯前端演示原型）',
          homepage: '',
          private: false,
          has_issues: true,
          has_wiki: false,
          has_projects: false,
          auto_init: false
        }
      });
      finalName = name;
      log('   已创建公开仓库：' + repo.full_name);
      break;
    } catch (e) {
      const msg = (e.payload && e.payload.message) || '';
      if (e.status === 422 && /already exists/i.test(msg)) {
        log('   仓库名 ' + name + ' 已被占用，尝试下一个名称 …');
        continue;
      }
      if (e.status === 403) {
        console.error('❌ 权限不足（403）：Token 缺少「创建仓库」权限。');
        console.error('   fine-grained token 需要 Administration: Read and write；classic token 需要 repo 勾选。');
        process.exit(1);
      }
      throw e;
    }
  }

  if (!repo) {
    console.error('❌ 所有候选仓库名均被占用，请改用 REPO_NAME 环境变量指定新名称。');
    process.exit(1);
  }

  /* 3. 上传文件（已存在则带 sha 覆盖，实现增量更新） */
  log('▶ 3/6 上传静态文件 …');
  for (const file of FILES) {
    const full = path.resolve(file);
    if (!fs.existsSync(full)) {
      log('   跳过缺失文件：' + file);
      continue;
    }
    const content = fs.readFileSync(full, 'utf8');
    const filePath = '/repos/' + owner + '/' + finalName + '/contents/' + encodeURIComponent(file);

    // 取已有文件的 sha，存在则视为更新
    let sha = null;
    try {
      const cur = await api(filePath + '?ref=main');
      sha = cur && cur.sha;
    } catch (e) {
      if (e.status !== 404) throw e;
    }

    const body = {
      message: (sha ? 'update ' : 'add ') + file,
      content: b64(content),
      branch: 'main'
    };
    if (sha) body.sha = sha;

    await api(filePath, { method: 'PUT', body });
    log('   ✓ ' + file + '（' + content.length + ' 字符' + (sha ? '，已覆盖旧版本' : '，新增') + '）');
    await sleep(300);
  }

  /* 4. 开启 GitHub Pages（main 分支根目录） */
  log('▶ 4/6 开启 GitHub Pages …');
  let pagesEnabled = false;
  try {
    await api('/repos/' + owner + '/' + finalName + '/pages', {
      method: 'POST',
      body: { source: { branch: 'main', path: '/' } }
    });
    pagesEnabled = true;
    log('   已开启 Pages：source = main / (root)');
  } catch (e) {
    if (e.status === 409) {
      log('   Pages 已存在，改为更新配置 …');
      await api('/repos/' + owner + '/' + finalName + '/pages', {
        method: 'PUT',
        body: { source: { branch: 'main', path: '/' } }
      });
      pagesEnabled = true;
    } else if (e.status === 403) {
      console.error('❌ 权限不足（403）：Token 缺少 Pages 写权限。');
    } else {
      console.error('⚠️ 开启 Pages 失败：' + e.status + ' ' +
        ((e.payload && e.payload.message) || ''));
      if (e.status === 422) {
        console.error('   提示：部分账号需先在网页端 Settings → Pages 手动启用一次。');
      }
    }
  }

  /* 5. 等待构建 */
  const url = 'https://' + owner.toLowerCase() + '.github.io/' + finalName + '/';
  log('▶ 5/6 等待 Pages 构建 …（最多约 3 分钟）');

  let built = false;
  if (pagesEnabled) {
    for (let i = 0; i < 20; i++) {
      await sleep(9000);
      try {
        const p = await api('/repos/' + owner + '/' + finalName + '/pages');
        const st = p.status || 'null';
        log('   [' + (i + 1) + '/20] 构建状态：' + st + (p.html_url ? ' | ' + p.html_url : ''));
        if (st === 'built') { built = true; break; }
        if (st === 'errored') { log('   ⚠️ 构建报错，请到仓库 Actions 查看日志'); break; }
      } catch (e) {
        log('   查询状态失败：' + e.status);
      }
    }
  }

  /* 6. 验证可访问性 */
  log('▶ 6/6 验证预览地址 …');
  let httpCode = 0;
  for (let i = 0; i < 8; i++) {
    try {
      const res = await fetch(url + 'index.html?t=' + Date.now(), { method: 'GET' });
      httpCode = res.status;
      if (res.ok) {
        const html = await res.text();
        const okTitle = /聚场/.test(html);
        log('   HTTP ' + httpCode + ' · 页面' + (okTitle ? '内容正常（含「聚场」标题）' : '已返回但未匹配到预期标题'));
        break;
      }
    } catch (e) {
      /* 继续重试 */
    }
    await sleep(8000);
  }

  log('\n────────────────────────────────────────');
  log('仓库地址：https://github.com/' + owner + '/' + finalName);
  log('Pages 配置：Settings → Pages → main / (root)');
  log('预览地址：' + url);
  log('验证结果：' + (httpCode === 200
    ? 'HTTP 200，页面可正常加载（已验证）'
    : 'HTTP ' + httpCode + '，地址已生成但未验证通过（可能需要再等 1-2 分钟）'));
  log('────────────────────────────────────────');
})().catch(err => {
  console.error('\n❌ 部署中断：' + err.message);
  if (err.payload) console.error(JSON.stringify(err.payload, null, 2));
  process.exit(1);
});
