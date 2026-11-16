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

  /* 3. 一次性提交所有文件（Git Data API：单 commit 触发单次构建）
        说明：若逐文件用 Contents API 提交，会产生 N 个 commit、触发 N 次 Pages 构建，
              密集提交容易让队列出现 "Page build failed" 中间态错误，故统一走 tree/commit。 */
  log('▶ 3/6 提交静态文件（单次提交）…');

  const payloadFiles = [];
  for (const file of FILES) {
    const full = path.resolve(file);
    if (!fs.existsSync(full)) { log('   跳过缺失文件：' + file); continue; }
    // .nojekyll 为空文件，blob API 不接受空内容，写入一个换行以保证文件存在
    const content = fs.readFileSync(full, 'utf8') || '\n';
    payloadFiles.push({ path: file, content });
  }

  // 3.1 取现有 main 引用（新仓库为空时不存在）
  let baseCommitSha = null;
  let baseTreeSha = null;
  try {
    const ref = await api('/repos/' + owner + '/' + finalName + '/git/ref/heads/main');
    baseCommitSha = ref.object.sha;
    const baseCommit = await api('/repos/' + owner + '/' + finalName + '/git/commits/' + baseCommitSha);
    baseTreeSha = baseCommit.tree.sha;
    log('   基于现有提交：' + baseCommitSha.slice(0, 7));
  } catch (e) {
    if (e.status !== 404 && e.status !== 409) throw e;
    log('   空仓库，将创建首个提交');
  }

  // 3.2 逐个文件建 blob
  const treeItems = [];
  for (const f of payloadFiles) {
    const blob = await api('/repos/' + owner + '/' + finalName + '/git/blobs', {
      method: 'POST',
      body: { content: f.content, encoding: 'utf-8' }
    });
    treeItems.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    log('   ✓ ' + f.path + '（' + f.content.length + ' 字符）');
  }

  // 3.3 建 tree
  const treeBody = { tree: treeItems };
  if (baseTreeSha) treeBody.base_tree = baseTreeSha;
  const tree = await api('/repos/' + owner + '/' + finalName + '/git/trees', {
    method: 'POST',
    body: treeBody
  });

  // 3.4 建 commit
  const commit = await api('/repos/' + owner + '/' + finalName + '/git/commits', {
    method: 'POST',
    body: {
      message: 'deploy: 聚场 GatherHub 在线活动报名管理系统\n\n' +
        '纯前端原型（活动列表 / 详情报名 / 我的报名 / 管理后台）\n' +
        '静态资源：' + payloadFiles.map(f => f.path).join('、'),
      tree: tree.sha,
      parents: baseCommitSha ? [baseCommitSha] : []
    }
  });

  // 3.5 更新或创建 main 引用
  if (baseCommitSha) {
    await api('/repos/' + owner + '/' + finalName + '/git/refs/heads/main', {
      method: 'PATCH',
      body: { sha: commit.sha, force: false }
    });
  } else {
    await api('/repos/' + owner + '/' + finalName + '/git/refs', {
      method: 'POST',
      body: { ref: 'refs/heads/main', sha: commit.sha }
    });
  }
  log('   ✓ 已提交 ' + commit.sha.slice(0, 7) + '（单 commit，仅触发一次 Pages 构建）');

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
  let erroredStreak = 0;
  if (pagesEnabled) {
    for (let i = 0; i < 20; i++) {
      await sleep(9000);
      try {
        const p = await api('/repos/' + owner + '/' + finalName + '/pages');
        const st = p.status || 'null';
        log('   [' + (i + 1) + '/20] 构建状态：' + st);
        if (st === 'built') { built = true; break; }
        if (st === 'errored') {
          erroredStreak++;
          if (erroredStreak === 1) log('   ⚠️ 当前构建报错，继续等待后续构建（可能仍在队列中）…');
          if (erroredStreak >= 6) { log('   ❌ 连续多次构建失败，请到仓库 Actions 查看日志'); break; }
        } else {
          erroredStreak = 0;
        }
      } catch (e) {
        log('   查询状态失败：' + e.status);
      }
    }
    if (!built && !erroredStreak) log('   ⏱ 等待超时，构建可能仍在排队');
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
