/* ============================================================
 * 聚场 GatherHub · 在线活动报名管理系统
 * 纯前端演示原型（localStorage 持久化 · 哈希路由）
 * ------------------------------------------------------------
 * 模块顺序：
 *   1. 常量与工具函数   2. 图标库        3. 数据层（种子/读写）
 *   4. 业务规则         5. 视图渲染      6. 表单与交互
 *   7. 弹窗/抽屉/Toast  8. 路由与全局事件 9. 启动
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------- 1. 常量与工具函数 ---------------- */

  const STORAGE_KEY = 'gatherhub.demo.v1';
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  // 封面配色方案：纯 CSS 渐变 + 图标，不依赖任何外链图片
  const COVERS = [
    { from: '#4f46e5', to: '#06b6d4', tag: 'TECH', icon: 'code' },
    { from: '#0d9488', to: '#65a30d', tag: 'OUTDOOR', icon: 'route' },
    { from: '#7c3aed', to: '#db2777', tag: 'WORKSHOP', icon: 'layers' },
    { from: '#334155', to: '#4f46e5', tag: 'AI', icon: 'spark' },
    { from: '#f59e0b', to: '#ea580c', tag: 'CHARITY', icon: 'gift' },
    { from: '#e11d48', to: '#7c3aed', tag: 'GROWTH', icon: 'chart' }
  ];

  // 活动状态元信息
  const STATUS = {
    open:     { label: '报名中', cls: 'pill-open' },
    full:     { label: '已满',   cls: 'pill-full' },
    upcoming: { label: '未开始', cls: 'pill-upcoming' },
    ongoing:  { label: '进行中', cls: 'pill-ongoing' },
    ended:    { label: '已结束', cls: 'pill-ended' }
  };

  const $ = (sel, root) => (root || document).querySelector(sel);

  function pad2(n) { return String(n).padStart(2, '0'); }
  function pad4(n) { return String(n).padStart(4, '0'); }

  /** HTML 转义，防止模拟数据中的特殊字符破坏结构 */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  /** Date -> 'YYYY-MM-DDTHH:mm'（与 datetime-local 的 value 格式一致） */
  function toLocalInput(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /** 解析本地时间字符串，避免浏览器对时区的不同解释 */
  function parseLocal(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!m) {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
  }

  /** 完整时间：2026-11-19 周四 14:00 */
  function fmtDT(v) {
    const d = parseLocal(v);
    if (!d) return '—';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + WEEK[d.getDay()] + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /** 短时间：11-19 14:00 */
  function fmtShort(v) {
    const d = parseLocal(v);
    if (!d) return '—';
    return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /** 时间区间：同一天折叠为 "11-19 周四 14:00 - 17:30" */
  function fmtRange(a, b) {
    const d1 = parseLocal(a), d2 = parseLocal(b);
    if (!d1 || !d2) return '—';
    const day1 = pad2(d1.getMonth() + 1) + '-' + pad2(d1.getDate());
    const day2 = pad2(d2.getMonth() + 1) + '-' + pad2(d2.getDate());
    const t1 = pad2(d1.getHours()) + ':' + pad2(d1.getMinutes());
    const t2 = pad2(d2.getHours()) + ':' + pad2(d2.getMinutes());
    if (day1 === day2) return day1 + ' ' + WEEK[d1.getDay()] + ' ' + t1 + ' - ' + t2;
    return day1 + ' ' + t1 + ' - ' + day2 + ' ' + t2;
  }

  /** 相对现在的时间描述，用于辅助文案 */
  function relText(v) {
    const d = parseLocal(v);
    if (!d) return '';
    const diff = d.getTime() - Date.now();
    const abs = Math.abs(diff);
    const suffix = diff >= 0 ? '后' : '前';
    const days = Math.floor(abs / 86400000);
    const hours = Math.floor(abs / 3600000);
    const mins = Math.floor(abs / 60000);
    if (days >= 1) return days + ' 天' + suffix;
    if (hours >= 1) return hours + ' 小时' + suffix;
    if (mins >= 1) return mins + ' 分钟' + suffix;
    return diff >= 0 ? '即将开始' : '刚刚结束';
  }

  /* ---------------- 2. 图标库（内联 SVG，离线可用） ---------------- */

  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
    users: '<circle cx="9" cy="8" r="3.4"/><path d="M3 20c0-3.3 2.7-5.6 6-5.6s6 2.3 6 5.6"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.4"/><path d="M18.4 20c0-2.5-.8-4.4-2-5.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14.5 5.5l3 3"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 13h9l1-13"/><path d="M10.5 11v5.5M13.5 11v5.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.6 2.6L16 9.6"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.6v5.2M12 16.3v.1"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11.2v5M12 7.7v.1"/>',
    arrowLeft: '<path d="M15 18l-6-6 6-6"/>',
    arrowRight: '<path d="M9 6l6 6-6 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.4V12l3.4 2"/>',
    ticket: '<path d="M3 9.2V6h18v3.2a2.8 2.8 0 0 0 0 5.6V18H3v-3.2a2.8 2.8 0 0 0 0-5.6z"/><path d="M14.5 6.8v1.6M14.5 11.2v1.6M14.5 15.6v1.6"/>',
    inbox: '<path d="M3.5 13h4l1.6 2.4h5.8L16.5 13h4"/><path d="M5.6 5h12.8l2.1 8v6H3.5v-6l2.1-8z"/>',
    shield: '<path d="M12 3l8 3v5.6c0 5-3.4 8.3-8 9.6-4.6-1.3-8-4.6-8-9.6V6l8-3z"/><path d="M8.8 12l2.3 2.3 4.1-4.3"/>',
    code: '<path d="M9 18l-6-6 6-6"/><path d="M15 6l6 6-6 6"/>',
    route: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="7" r="3"/><path d="M9 17h4.5a3.5 3.5 0 0 0 0-7H10a3.5 3.5 0 0 1 0-7"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
    spark: '<path d="M12 3v3.6M12 17.4V21M3 12h3.6M17.4 12H21M5.8 5.8l2.5 2.5M15.7 15.7l2.5 2.5M18.2 5.8l-2.5 2.5M8.3 15.7l-2.5 2.5"/>',
    gift: '<rect x="3" y="8.4" width="18" height="12.6" rx="2"/><path d="M3 12.6h18M12 8.4V21"/><path d="M12 8.4S10.6 3.6 8.2 3.6 6.2 8.4 12 8.4zM12 8.4s1.4-4.8 3.8-4.8 2 4.8-3.8 4.8z"/>',
    chart: '<path d="M3.5 3.5v17h17"/><path d="M7 15.5l3.6-3.8 2.8 2.6 4.6-5.4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.1M3.5 12h.1M3.5 18h.1"/>',
    filter: '<path d="M3 5h18l-7 8.2V20l-4-2v-4.8L3 5z"/>'
  };

  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || ICONS.info) + '</svg>';
  }

  /* ---------------- 3. 数据层 ---------------- */

  const SEED_NAMES = ['张伟', '李娜', '王芳', '刘洋', '陈静', '杨帆', '赵磊', '周敏',
    '吴桐', '徐畅', '孙悦', '马超', '胡蝶', '高远', '林一', '郑楠',
    '何欢', '曾雨', '罗宇', '谢听', '唐宁', '冯宇', '董晓', '蒋岩'];

  /** 生成初始演示数据（所有时间以「当前时间」为基准，保证任何时候打开状态都正确） */
  function seedDB() {
    const p = pad2;

    function atDay(dayOffset, hour, minute) {
      const d = new Date();
      d.setDate(d.getDate() + dayOffset);
      d.setHours(hour, minute, 0, 0);
      return toLocalInput(d);
    }
    function atDelta(hours) {
      const d = new Date();
      d.setTime(d.getTime() + hours * 3600000);
      return toLocalInput(d);
    }

    const specs = [
      {
        id: 'act-01',
        title: '2026 厦门前端工程化实战分享会',
        cover: 0,
        signupStart: atDay(-8, 9, 0),
        startTime: atDay(3, 14, 0),
        endTime: atDay(3, 17, 30),
        location: '厦门市思明区软件园二期 观日路 33 号 · 创新大厦 3F 报告厅',
        capacity: 80,
        intro: '围绕「构建速度」「产物质量」「团队协作」三个方向，拆解中大型前端项目在工程化落地中的真实问题。\n\n本次分享包含三个主题：构建工具链的取舍与迁移、Monorepo 下的依赖治理、以及前端监控体系从 0 到 1 的搭建路径。每个主题后留 15 分钟现场问答。',
        notice: '1. 13:30 开始签到，建议提前 20 分钟到场。\n2. 现场提供饮用水，不提供餐食。\n3. 报告厅内请将手机调至静音。\n4. 如需取消报名，请在活动开始前操作，以便释放名额给其他参与者。',
        seed: { total: 50, cancelled: 3 }
      },
      {
        id: 'act-02',
        title: '城市骑行 · 环岛路晨间打卡',
        cover: 1,
        signupStart: atDay(-5, 10, 0),
        startTime: atDay(6, 7, 0),
        endTime: atDay(6, 10, 30),
        location: '厦门环岛路 · 音乐广场雕塑前集合点',
        capacity: 30,
        intro: '从音乐广场出发，沿环岛路骑行至会展中心折返，全程约 22 公里，平均配速休闲级。\n\n队伍分为快慢两组，各配一名领骑和一名收尾，新手也可以放心参加。沿途设置两个补给点，提供饮用水和能量补给。',
        notice: '1. 请自备自行车或共享单车，佩戴头盔。\n2. 集合时间为 6:40，7:00 准时出发。\n3. 如遇雨天活动顺延，会提前一天在报名页说明。\n4. 未满 16 周岁需家长陪同。',
        seed: { total: 20, cancelled: 2 }
      },
      {
        id: 'act-03',
        title: '产品经理实战工作坊：从 0 到 1 拆解需求',
        cover: 2,
        signupStart: atDay(-9, 9, 0),
        startTime: atDay(8, 13, 30),
        endTime: atDay(8, 18, 0),
        location: '厦门市湖里区高崎南五路 208 号 · 火炬众创空间 2F',
        capacity: 20,
        intro: '小班制工作坊，用真实业务案例完整走一遍「需求收集 → 价值判断 → 方案设计 → 评审」的流程。\n\n参与者需携带笔记本电脑，现场分组完成一份可评审的需求文档，讲师逐组点评。为保证互动质量，本场仅开放 20 个名额。',
        notice: '1. 请自带笔记本电脑，现场提供 WiFi 与插座。\n2. 课程含实操作业，请预留完整 4.5 小时。\n3. 报名后如需取消，请在活动开始前操作。\n4. 现场不设儿童看护，请勿携带家属。',
        seed: { total: 20, cancelled: 0 }
      },
      {
        id: 'act-04',
        title: 'AI 应用开发闭门沙龙（往期回顾）',
        cover: 3,
        signupStart: atDay(-26, 9, 0),
        startTime: atDay(-12, 14, 0),
        endTime: atDay(-12, 17, 0),
        location: '厦门市集美区软件园三期 B 区 · 创新驿站',
        capacity: 60,
        intro: '面向一线开发者的闭门交流，聚焦大模型应用在真实业务中的落地成本、效果评估与工程化实践。\n\n本场活动已结束，页面保留用于查看往期信息与报名存档。',
        notice: '1. 本场活动已结束，报名通道关闭。\n2. 往期资料不对外公开。\n3. 后续场次请关注活动列表更新。',
        seed: { total: 60, cancelled: 2 }
      },
      {
        id: 'act-05',
        title: '社区公益市集 · 旧物交换日',
        cover: 4,
        signupStart: atDay(5, 10, 0),
        startTime: atDay(14, 9, 0),
        endTime: atDay(14, 17, 0),
        location: '厦门市思明区中山公园 · 南门广场',
        capacity: 100,
        intro: '把家里闲置但仍有价值的物品带来交换，让物品找到下一个主人。现场划分图书、衣物、玩具、小家电四个区域。\n\n摊位免费，报名后将获得一个 2 米标准摊位，可与其他摊主自由交换。',
        notice: '1. 报名将于活动前 9 天开放。\n2. 每个摊位限 2 米，请自备地垫与展示牌。\n3. 禁止交易食品、药品及违禁物品。\n4. 活动结束后请自行清理摊位区域。',
        seed: { total: 0, cancelled: 0 }
      },
      {
        id: 'act-06',
        title: '年度用户增长复盘会（内部场）',
        cover: 5,
        signupStart: atDay(-15, 9, 0),
        startTime: atDelta(-2),
        endTime: atDelta(4),
        location: '厦门市思明区鹭江道 100 号 · 国际中心 18F 大会议室',
        capacity: 50,
        intro: '复盘全年增长策略的执行情况，拆解拉新、留存、召回三条链路的数据表现与关键动作。\n\n本场为内部复盘会，外部参与者可旁听上午场，下午场为闭门讨论。',
        notice: '1. 活动已开始，签到通道关闭，报名不可取消。\n2. 请凭报名编号在 18F 前台换取访客证。\n3. 会议内容涉及内部数据，请勿录音录像。',
        seed: { total: 43, cancelled: 1 }
      }
    ];

    const activities = [];
    const registrations = [];
    let seq = 0;

    specs.forEach((spec, si) => {
      const item = {
        id: spec.id,
        title: spec.title,
        cover: spec.cover,
        signupStart: spec.signupStart,
        startTime: spec.startTime,
        endTime: spec.endTime,
        location: spec.location,
        capacity: spec.capacity,
        intro: spec.intro,
        notice: spec.notice
      };
      activities.push(item);

      const cfg = spec.seed || { total: 0, cancelled: 0 };
      const total = cfg.total || 0;
      if (!total) return;

      const ss = parseLocal(spec.signupStart).getTime();
      const st = parseLocal(spec.startTime).getTime();
      const limit = Math.min(Date.now(), st - 3600000);
      const span = Math.max(limit - ss, 5 * 60000);

      for (let i = 0; i < total; i++) {
        seq += 1;
        const t = new Date(ss + Math.round(span * (i + 1) / (total + 1)));
        const cancelled = i >= total - (cfg.cancelled || 0);
        const phone = '138' + String(10000000 + si * 20000 + i * 137).slice(-8);

        registrations.push({
          id: 'reg-' + pad4(seq),
          activityId: spec.id,
          name: SEED_NAMES[(si * 5 + i) % SEED_NAMES.length],
          phone: phone,
          code: 'RG-' + String(t.getFullYear()).slice(2) + p(t.getMonth() + 1) +
            p(t.getDate()) + '-' + pad4(seq),
          createdAt: toLocalInput(t),
          status: cancelled ? 'cancelled' : 'confirmed'
        });
      }
    });

    return {
      version: 1,
      activities: activities,
      registrations: registrations,
      seq: seq,
      role: 'user'
    };
  }

  let db = null;

  function loadDB() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.activities) && parsed.activities.length) {
          parsed.registrations = Array.isArray(parsed.registrations) ? parsed.registrations : [];
          parsed.seq = typeof parsed.seq === 'number' ? parsed.seq : parsed.registrations.length;
          parsed.role = parsed.role === 'admin' ? 'admin' : 'user';
          return parsed;
        }
      }
    } catch (err) {
      // 数据损坏时直接重建，不影响演示
    }
    const fresh = seedDB();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)); } catch (err) { /* 存储不可用时降级为内存模式 */ }
    return fresh;
  }

  function saveDB() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (err) {
      toast('本地存储不可用，本次修改仅在当前页面生效', 'error');
    }
  }

  /* ---------------- 4. 业务规则 ---------------- */

  function getActivity(id) {
    return db.activities.find(a => a.id === id) || null;
  }

  /** 取某活动的报名记录；默认只取「已报名」 */
  function regsOf(activityId, includeCancelled) {
    return db.registrations.filter(r =>
      r.activityId === activityId && (includeCancelled || r.status === 'confirmed')
    );
  }

  function confirmedCount(activityId) {
    let n = 0;
    for (let i = 0; i < db.registrations.length; i++) {
      const r = db.registrations[i];
      if (r.activityId === activityId && r.status === 'confirmed') n++;
    }
    return n;
  }

  /** 动态计算活动状态 */
  function activityStatus(act) {
    const now = Date.now();
    const start = parseLocal(act.startTime);
    const end = parseLocal(act.endTime);
    const signup = parseLocal(act.signupStart || act.startTime);
    if (!start || !end) return 'ended';
    if (now >= end.getTime()) return 'ended';
    if (now >= start.getTime()) return 'ongoing';
    if (signup && now < signup.getTime()) return 'upcoming';
    if (confirmedCount(act.id) >= act.capacity) return 'full';
    return 'open';
  }

  /** 是否可报名：返回 {ok, reason} */
  function canSignup(act) {
    const st = activityStatus(act);
    if (st === 'ended') return { ok: false, reason: '活动已结束，报名通道已关闭' };
    if (st === 'ongoing') return { ok: false, reason: '活动已开始，报名通道已关闭' };
    if (st === 'upcoming') return { ok: false, reason: '报名尚未开放，开放时间 ' + fmtDT(act.signupStart) };
    if (st === 'full') return { ok: false, reason: '报名人数已达上限，名额已满' };
    return { ok: true, reason: '' };
  }

  /** 是否可取消：活动开始后或已结束时不可取消 */
  function canCancel(reg) {
    if (reg.status !== 'confirmed') return { ok: false, reason: '该报名已取消' };
    const act = getActivity(reg.activityId);
    if (!act) return { ok: false, reason: '活动已不存在' };
    if (Date.now() >= parseLocal(act.startTime).getTime()) {
      return { ok: false, reason: '活动已开始，无法取消报名' };
    }
    return { ok: true, reason: '' };
  }

  function nextRegCode() {
    db.seq = (db.seq || 0) + 1;
    const d = new Date();
    return 'RG-' + String(d.getFullYear()).slice(2) + pad2(d.getMonth() + 1) +
      pad2(d.getDate()) + '-' + pad4(db.seq);
  }

  function barClass(st, pct) {
    if (st === 'ended') return 'done';
    if (pct >= 100 || st === 'full') return 'warn';
    return '';
  }

  /* ---------------- 5. 视图渲染 ---------------- */

  const state = {
    keyword: '',
    statusFilter: 'all',
    myPhone: '',
    adminKeyword: '',
    roster: { actId: null, keyword: '', onlyConfirmed: true }
  };

  function sortedActivities() {
    return db.activities.slice().sort((a, b) => {
      const ea = activityStatus(a) === 'ended' ? 1 : 0;
      const eb = activityStatus(b) === 'ended' ? 1 : 0;
      if (ea !== eb) return ea - eb;
      return parseLocal(a.startTime) - parseLocal(b.startTime);
    });
  }

  function statusPill(st) {
    const meta = STATUS[st] || STATUS.open;
    return '<span class="pill ' + meta.cls + '">' + meta.label + '</span>';
  }

  /* ---- 5.1 活动卡片 ---- */
  function cardHTML(act) {
    const st = activityStatus(act);
    const meta = STATUS[st];
    const used = confirmedCount(act.id);
    const pct = act.capacity > 0 ? Math.min(100, Math.round(used / act.capacity * 100)) : 0;
    const cover = COVERS[act.cover] || COVERS[0];
    const rest = Math.max(act.capacity - used, 0);
    const restText = (st === 'ended' || st === 'full') ? meta.label : '剩 ' + rest + ' 个名额';

    return ''
      + '<article class="act-card">'
      + '  <div class="act-cover" style="background-image:linear-gradient(135deg,' + cover.from + ',' + cover.to + ')">'
      + '    <span class="cover-shape s1"></span><span class="cover-shape s2"></span>'
      + '    <span class="cover-glyph">' + icon(cover.icon) + '</span>'
      + '    <span class="cover-tag">' + esc(cover.tag) + '</span>'
      + '    <span class="pill ' + meta.cls + ' status-pill">' + meta.label + '</span>'
      + '  </div>'
      + '  <div class="act-body">'
      + '    <h3 class="act-title">' + esc(act.title) + '</h3>'
      + '    <ul class="act-meta">'
      + '      <li>' + icon('calendar') + '<span>' + esc(fmtRange(act.startTime, act.endTime)) + '</span></li>'
      + '      <li>' + icon('pin') + '<span>' + esc(act.location) + '</span></li>'
      + '    </ul>'
      + '    <div class="act-progress">'
      + '      <div class="bar"><div class="bar-fill ' + barClass(st, pct) + '" style="width:' + pct + '%"></div></div>'
      + '      <div class="act-progress-text">'
      + '        <span><strong>' + used + '</strong> / ' + act.capacity + ' 人已报名</span>'
      + '        <span>' + esc(restText) + '</span>'
      + '      </div>'
      + '    </div>'
      + '    <div class="act-foot">'
      + '      <a class="btn btn-primary btn-block" href="#/detail/' + encodeURIComponent(act.id) + '">查看详情</a>'
      + '    </div>'
      + '  </div>'
      + '</article>';
  }

  function filteredActivities() {
    const kw = state.keyword.trim().toLowerCase();
    return sortedActivities().filter(act => {
      if (state.statusFilter !== 'all' && activityStatus(act) !== state.statusFilter) return false;
      if (!kw) return true;
      return (act.title + ' ' + act.location + ' ' + act.intro).toLowerCase().indexOf(kw) > -1;
    });
  }

  function gridHTML() {
    const list = filteredActivities();
    if (!list.length) {
      return ''
        + '<div class="empty">'
        + '  <div class="empty-icon">' + icon('inbox') + '</div>'
        + '  <p class="empty-title">没有找到符合条件的活动</p>'
        + '  <p class="empty-desc">试试更换关键词，或把筛选条件切回「全部」</p>'
        + '  <button class="btn btn-secondary" type="button" data-action="clear-filter">清空筛选条件</button>'
        + '</div>';
    }
    return '<div class="card-grid">' + list.map(cardHTML).join('') + '</div>';
  }

  function viewList() {
    const all = sortedActivities();
    const counts = { all: all.length };
    ['open', 'upcoming', 'full', 'ongoing', 'ended'].forEach(k => { counts[k] = 0; });
    all.forEach(a => { counts[activityStatus(a)] = (counts[activityStatus(a)] || 0) + 1; });

    const tabs = [
      ['all', '全部'],
      ['open', '报名中'],
      ['upcoming', '未开始'],
      ['full', '已满'],
      ['ongoing', '进行中'],
      ['ended', '已结束']
    ];

    const segHTML = tabs.map(([key, label]) => {
      const n = counts[key] || 0;
      return '<button type="button" class="seg-btn' + (state.statusFilter === key ? ' active' : '') +
        '" data-action="filter-status" data-status="' + key + '" aria-pressed="' +
        (state.statusFilter === key) + '">' + label +
        '<span class="count">' + n + '</span></button>';
    }).join('');

    const openCount = counts.open || 0;

    return ''
      + '<div class="page-head">'
      + '  <div>'
      + '    <h1 class="page-title">活动列表</h1>'
      + '    <p class="page-desc">共 ' + all.length + ' 场活动，其中 ' + openCount + ' 场正在接受报名 · 全部为模拟数据</p>'
      + '  </div>'
      + '</div>'
      + '<div class="toolbar">'
      + '  <div class="search-field">' + icon('search')
      + '    <input class="input" type="search" id="keywordInput" placeholder="搜索活动名称、地点或介绍关键字" '
      + 'value="' + esc(state.keyword) + '" aria-label="搜索活动">'
      + '  </div>'
      + '  <div class="segmented" role="group" aria-label="按状态筛选">' + segHTML + '</div>'
      + '</div>'
      + '<div id="gridWrap">' + gridHTML() + '</div>';
  }

  /* ---- 5.2 活动详情 ---- */
  function viewDetail(id) {
    const act = getActivity(id);
    if (!act) return viewNotFound('该活动不存在或已被删除');

    const st = activityStatus(act);
    const meta = STATUS[st];
    const used = confirmedCount(act.id);
    const pct = act.capacity > 0 ? Math.min(100, Math.round(used / act.capacity * 100)) : 0;
    const rest = Math.max(act.capacity - used, 0);
    const cover = COVERS[act.cover] || COVERS[0];
    const gate = canSignup(act);

    let sideHTML = '';
    if (gate.ok) {
      sideHTML = ''
        + '<div class="signup-panel-head">'
        + '  <span class="signup-panel-title">报名通道</span>' + statusPill(st)
        + '</div>'
        + '<div class="seat-row">'
        + '  <span class="seat-num">' + rest + '</span><span class="seat-unit">个名额剩余</span>'
        + '</div>'
        + '<button class="btn btn-primary btn-block" type="button" data-action="open-signup" data-id="' + esc(act.id) + '">'
        + icon('ticket') + '立即报名</button>'
        + '<p class="side-footnote">报名成功后将生成电子凭证<br>可在「我的报名」中查看与取消</p>';
    } else {
      sideHTML = ''
        + '<div class="signup-panel-head">'
        + '  <span class="signup-panel-title">报名通道</span>' + statusPill(st)
        + '</div>'
        + '<div class="notice-box">' + icon('alert') + '<span>' + esc(gate.reason) + '</span></div>'
        + '<button class="btn btn-secondary btn-block" type="button" disabled>当前不可报名</button>'
        + '<p class="side-footnote">已报名的用户仍可在「我的报名」中查看凭证</p>';
    }

    const ongoingTip = st === 'ongoing'
      ? '<div class="notice-box info">' + icon('info') + '<span>活动正在进行中，已开始 ' + esc(relText(act.startTime).replace('前', '')) + '</span></div>'
      : '';

    return ''
      + '<a class="back-link" href="#/list">' + icon('arrowLeft') + '返回活动列表</a>'
      + '<div class="detail-grid">'
      + '  <div class="detail-main">'
      + '    <div class="detail-cover" style="background-image:linear-gradient(135deg,' + cover.from + ',' + cover.to + ')">'
      + '      <span class="cover-shape s1"></span><span class="cover-shape s2"></span>'
      + '      <span class="cover-glyph">' + icon(cover.icon) + '</span>'
      + '      <span class="cover-tag">' + esc(cover.tag) + ' · ' + esc(meta.label) + '</span>'
      + '    </div>'
      + '    <div class="card detail-card">'
      + '      <div class="detail-head">'
      + '        <h1 class="detail-title">' + esc(act.title) + '</h1>'
      + '        ' + statusPill(st)
      + '      </div>'
      + '      <div class="meta-grid">'
      + '        <div class="meta-item">' + icon('clock')
      + '          <div><div class="meta-label">活动时间</div><div class="meta-value">' + esc(fmtDT(act.startTime)) + ' 起<br>' + esc(fmtDT(act.endTime)) + ' 结束</div></div>'
      + '        </div>'
      + '        <div class="meta-item">' + icon('pin')
      + '          <div><div class="meta-label">活动地点</div><div class="meta-value">' + esc(act.location) + '</div></div>'
      + '        </div>'
      + '        <div class="meta-item">' + icon('users')
      + '          <div><div class="meta-label">报名情况</div><div class="meta-value">' + used + ' / ' + act.capacity + ' 人（' + pct + '%）</div></div>'
      + '        </div>'
      + '        <div class="meta-item">' + icon('calendar')
      + '          <div><div class="meta-label">报名开放时间</div><div class="meta-value">' + esc(fmtDT(act.signupStart)) + '</div></div>'
      + '        </div>'
      + '      </div>'
      + '      <div class="progress-block">'
      + '        <div class="progress-top"><span>已报名 <strong>' + used + '</strong> 人</span>'
      + '          <span>上限 ' + act.capacity + ' 人 · ' + (st === 'ended' ? '已结束' : '余 ' + rest + ' 位') + '</span>'
      + '        </div>'
      + '        <div class="bar"><div class="bar-fill ' + barClass(st, pct) + '" style="width:' + pct + '%"></div></div>'
      + '      </div>'
      + '      <h2 class="section-title">活动介绍</h2>'
      + '      <div class="prose">' + esc(act.intro) + '</div>'
      + '      <h2 class="section-title">报名须知</h2>'
      + '      <div class="prose">' + esc(act.notice) + '</div>'
      + '    </div>'
      + '  </div>'
      + '  <aside class="detail-side">'
      + '    <div class="card signup-panel">' + sideHTML + '</div>'
      + '    ' + (ongoingTip ? '<div style="margin-top:12px">' + ongoingTip + '</div>' : '')
      + '  </aside>'
      + '</div>';
  }

  /* ---- 5.3 我的报名 ---- */
  function myRegs() {
    const kw = state.myPhone.trim();
    return db.registrations
      .filter(r => !kw || r.phone.indexOf(kw) > -1)
      .slice()
      .sort((a, b) => (parseLocal(b.createdAt) - parseLocal(a.createdAt)));
  }

  function regCardHTML(reg) {
    const act = getActivity(reg.activityId);
    const cancelled = reg.status === 'cancelled';
    const actSt = act ? activityStatus(act) : 'ended';
    const gate = canCancel(reg);

    const statusHTML = cancelled
      ? '<span class="pill pill-cancelled">已取消</span>'
      : '<span class="pill pill-open">已报名</span>';

    const actStatusNote = (!cancelled && act && actSt === 'ended')
      ? '<span class="pill pill-neutral">活动已结束</span>' : '';

    const cancelBtn = cancelled
      ? '<button class="btn btn-secondary btn-sm" type="button" disabled>已取消</button>'
      : (gate.ok
        ? '<button class="btn btn-danger-ghost btn-sm" type="button" data-action="cancel-reg" data-id="' + esc(reg.id) + '">取消报名</button>'
        : '<button class="btn btn-secondary btn-sm" type="button" disabled title="' + esc(gate.reason) + '">不可取消</button>');

    return ''
      + '<article class="reg-card' + (cancelled ? ' is-cancelled' : '') + '">'
      + '  <div class="reg-top">'
      + '    <div style="min-width:0">'
      + '      <h3 class="reg-title">' + esc(act ? act.title : '活动已删除') + '</h3>'
      + '      <p class="reg-sub">报名人：' + esc(reg.name) + ' · ' + esc(reg.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')) + '</p>'
      + '    </div>'
      + '    <div style="display:flex;gap:6px;flex-wrap:wrap">' + statusHTML + actStatusNote + '</div>'
      + '  </div>'
      + '  <div class="ticket">'
      + '    <span class="ticket-label">报名编号</span>'
      + '    <span class="ticket-code">' + esc(reg.code) + '</span>'
      + '    <span class="ticket-label" style="margin-left:auto">' + esc(fmtShort(reg.createdAt)) + ' 提交</span>'
      + '  </div>'
      + '  <dl class="reg-meta">'
      + '    <div><dt>活动时间</dt><dd>' + esc(act ? fmtRange(act.startTime, act.endTime) : '—') + '</dd></div>'
      + '    <div><dt>活动地点</dt><dd>' + esc(act ? act.location : '—') + '</dd></div>'
      + '  </dl>'
      + '  <div class="reg-actions">'
      + (act ? '<a class="btn btn-secondary btn-sm" href="#/detail/' + encodeURIComponent(act.id) + '">查看活动详情</a>'
        : '<button class="btn btn-secondary btn-sm" type="button" disabled>活动已删除</button>')
      + cancelBtn
      + '  </div>'
      + '</article>';
  }

  function regListHTML() {
    const list = myRegs();
    if (!list.length) {
      const tip = state.myPhone.trim()
        ? '没有找到该手机号相关的报名记录，请检查号码是否完整'
        : '你还没有报名任何活动。浏览活动列表，选择一场感兴趣的活动报名吧';
      return ''
        + '<div class="empty">'
        + '  <div class="empty-icon">' + icon('ticket') + '</div>'
        + '  <p class="empty-title">暂无报名记录</p>'
        + '  <p class="empty-desc">' + esc(tip) + '</p>'
        + '  <a class="btn btn-primary" href="#/list">去看看活动</a>'
        + '</div>';
    }
    return '<div class="reg-list">' + list.map(regCardHTML).join('') + '</div>';
  }

  function viewMy() {
    const total = db.registrations.length;
    const active = db.registrations.filter(r => r.status === 'confirmed').length;

    return ''
      + '<div class="page-head">'
      + '  <div>'
      + '    <h1 class="page-title">我的报名</h1>'
      + '    <p class="page-desc">共 ' + total + ' 条报名记录，其中 ' + active + ' 条有效 · 可在此查看电子凭证或取消报名</p>'
      + '  </div>'
      + '</div>'
      + '<div class="filter-bar">'
      + '  <div class="field">'
      + '    <label class="field-label" for="phoneFilter">按手机号筛选</label>'
      + '    <input class="input" id="phoneFilter" type="tel" inputmode="numeric" maxlength="11" '
      + 'placeholder="输入报名时使用的手机号，留空显示全部" value="' + esc(state.myPhone) + '">'
      + '  </div>'
      + '  <div class="filter-actions">'
      + '    <button class="btn btn-secondary" type="button" data-action="clear-phone">清空</button>'
      + '  </div>'
      + '</div>'
      + '<div id="regListWrap">' + regListHTML() + '</div>';
  }

  /* ---- 5.4 管理后台 ---- */
  function filteredAdminActivities() {
    const kw = state.adminKeyword.trim().toLowerCase();
    const list = sortedActivities();
    if (!kw) return list;
    return list.filter(a => (a.title + ' ' + a.location).toLowerCase().indexOf(kw) > -1);
  }

  function adminRowHTML(act) {
    const st = activityStatus(act);
    const cover = COVERS[act.cover] || COVERS[0];
    const used = confirmedCount(act.id);
    const cancelled = regsOf(act.id, true).length - used;

    return ''
      + '<tr>'
      + '  <td>'
      + '    <div style="display:flex;gap:10px;align-items:center;min-width:0">'
      + '      <span class="mini-cover" style="background-image:linear-gradient(135deg,' + cover.from + ',' + cover.to + ')">' + icon(cover.icon) + '</span>'
      + '      <div style="min-width:0">'
      + '        <div class="row-title">' + esc(act.title) + '</div>'
      + '        <div class="row-sub">' + esc(act.id) + '</div>'
      + '      </div>'
      + '    </div>'
      + '  </td>'
      + '  <td class="cell-nowrap">' + esc(fmtRange(act.startTime, act.endTime)) + '</td>'
      + '  <td><div class="row-sub" style="max-width:200px">' + esc(act.location) + '</div></td>'
      + '  <td class="cell-nowrap cell-num">' + used + ' / ' + act.capacity
      + (cancelled > 0 ? '<div class="row-sub">已取消 ' + cancelled + '</div>' : '') + '</td>'
      + '  <td>' + statusPill(st) + '</td>'
      + '  <td>'
      + '    <div class="row-actions">'
      + '      <button class="btn btn-secondary btn-sm" type="button" data-action="open-roster" data-id="' + esc(act.id) + '">名单</button>'
      + '      <a class="btn btn-secondary btn-sm" href="#/admin/edit/' + encodeURIComponent(act.id) + '">编辑</a>'
      + '      <button class="btn btn-danger-ghost btn-sm" type="button" data-action="delete-activity" data-id="' + esc(act.id) + '">删除</button>'
      + '    </div>'
      + '  </td>'
      + '</tr>';
  }

  function adminTableHTML() {
    const list = filteredAdminActivities();
    if (!list.length) {
      return ''
        + '<div class="empty" style="border:0;border-radius:0">'
        + '  <div class="empty-icon">' + icon('inbox') + '</div>'
        + '  <p class="empty-title">没有匹配的活动</p>'
        + '  <p class="empty-desc">请调整搜索关键词，或新建一场活动</p>'
        + '</div>';
    }
    return ''
      + '<div class="table-wrap">'
      + '  <table class="data-table">'
      + '    <thead><tr>'
      + '      <th>活动</th><th>活动时间</th><th>地点</th><th>报名</th><th>状态</th><th>操作</th>'
      + '    </tr></thead>'
      + '    <tbody>' + list.map(adminRowHTML).join('') + '</tbody>'
      + '  </table>'
      + '</div>';
  }

  function adminStatsHTML() {
    const totalRegs = db.registrations.filter(r => r.status === 'confirmed').length;
    const totalSeats = db.activities.reduce((s, a) => s + Number(a.capacity || 0), 0);
    const openActs = db.activities.filter(a => activityStatus(a) === 'open').length;
    return ''
      + '<div class="stat-card"><div class="stat-num">' + db.activities.length + '</div><div class="stat-label">活动总数</div></div>'
      + '<div class="stat-card"><div class="stat-num">' + totalRegs + '</div><div class="stat-label">有效报名人数</div></div>'
      + '<div class="stat-card"><div class="stat-num">' + totalSeats + '</div><div class="stat-label">总名额</div></div>'
      + '<div class="stat-card"><div class="stat-num">' + openActs + '</div><div class="stat-label">报名中活动</div></div>';
  }

  function viewAdmin() {
    return ''
      + '<div class="page-head">'
      + '  <div>'
      + '    <h1 class="page-title">活动管理</h1>'
      + '    <p class="page-desc">创建、编辑活动并查看报名名单 · 当前为' +
      (db.role === 'admin' ? '管理员' : '普通用户') + '视角（演示环境不校验权限）</p>'
      + '  </div>'
      + '  <div class="page-actions">'
      + '    <a class="btn btn-primary" href="#/admin/new">' + icon('plus') + '新建活动</a>'
      + '  </div>'
      + '</div>'
      + '<div class="stat-row" id="adminStats">' + adminStatsHTML() + '</div>'
      + '<div class="card table-card">'
      + '  <div class="table-card-head">'
      + '    <span class="table-card-title">全部活动（' + db.activities.length + '）</span>'
      + '    <div class="search-field" style="flex:0 1 260px">' + icon('search')
      + '      <input class="input" id="adminSearch" type="search" placeholder="搜索活动名称或地点" '
      + 'value="' + esc(state.adminKeyword) + '" aria-label="搜索活动">'
      + '    </div>'
      + '  </div>'
      + '  <div id="adminTableWrap">' + adminTableHTML() + '</div>'
      + '</div>';
  }

  function viewNotFound(msg) {
    return ''
      + '<div class="empty" style="margin-top:24px">'
      + '  <div class="empty-icon">' + icon('alert') + '</div>'
      + '  <p class="empty-title">' + esc(msg || '页面不存在') + '</p>'
      + '  <p class="empty-desc">请检查链接是否正确，或返回活动列表重新选择</p>'
      + '  <a class="btn btn-primary" href="#/list">返回活动列表</a>'
      + '</div>';
  }

  /* ---------------- 6. 活动表单 ---------------- */

  function viewAdminForm(id) {
    const isEdit = !!id;
    const act = isEdit ? getActivity(id) : null;
    if (isEdit && !act) return viewNotFound('该活动不存在或已被删除');

    const used = act ? confirmedCount(act.id) : 0;
    const coverIdx = act ? act.cover : 0;
    const signupStart = act ? act.signupStart : toLocalInput(new Date());

    const dots = COVERS.map((c, i) =>
      '<button type="button" class="cover-dot" data-cover="' + i + '" aria-pressed="' + (i === coverIdx) + '" '
      + 'aria-label="封面配色 ' + (i + 1) + '" title="' + esc(c.tag) + '" '
      + 'style="background-image:linear-gradient(135deg,' + c.from + ',' + c.to + ')"></button>'
    ).join('');

    return ''
      + '<a class="back-link" href="#/admin">' + icon('arrowLeft') + '返回活动管理</a>'
      + '<div class="card form-card">'
      + '  <div class="form-head">'
      + '    <h1 class="form-title">' + (isEdit ? '编辑活动' : '新建活动') + '</h1>'
      + '    <p class="form-sub">' + (isEdit
        ? '当前已有 ' + used + ' 人报名，人数上限不可低于该数值'
        : '填写完整信息后保存，活动将立即出现在活动列表与管理后台') + '</p>'
      + '  </div>'
      + '  <form id="activityForm" novalidate>'
      + '    <div class="form-alert" id="formAlert" role="alert">' + icon('alert') + '<span id="formAlertText"></span></div>'
      + '    <input type="hidden" id="fCover" value="' + coverIdx + '">'
      + '    <div class="form-grid">'
      + '      <div class="field full">'
      + '        <label class="field-label" for="fTitle">活动名称 <span class="req">*</span></label>'
      + '        <input class="input" id="fTitle" type="text" maxlength="40" placeholder="例如：2026 厦门前端工程化实战分享会" '
      + 'value="' + esc(act ? act.title : '') + '" aria-describedby="eTitle">'
      + '        <p class="field-error" id="eTitle"></p>'
      + '      </div>'
      + '      <div class="field">'
      + '        <label class="field-label" for="fStart">活动开始时间 <span class="req">*</span></label>'
      + '        <input class="input" id="fStart" type="datetime-local" value="' + esc(act ? act.startTime : '') + '" aria-describedby="eStart">'
      + '        <p class="field-error" id="eStart"></p>'
      + '      </div>'
      + '      <div class="field">'
      + '        <label class="field-label" for="fEnd">活动结束时间 <span class="req">*</span></label>'
      + '        <input class="input" id="fEnd" type="datetime-local" value="' + esc(act ? act.endTime : '') + '" aria-describedby="eEnd">'
      + '        <p class="field-error" id="eEnd"></p>'
      + '      </div>'
      + '      <div class="field">'
      + '        <label class="field-label" for="fSignup">报名开放时间 <span class="req">*</span></label>'
      + '        <input class="input" id="fSignup" type="datetime-local" value="' + esc(signupStart) + '" aria-describedby="eSignup">'
      + '        <p class="field-hint">早于该时间时，活动状态显示为「未开始」</p>'
      + '        <p class="field-error" id="eSignup"></p>'
      + '      </div>'
      + '      <div class="field">'
      + '        <label class="field-label" for="fCapacity">报名人数上限 <span class="req">*</span></label>'
      + '        <input class="input" id="fCapacity" type="number" min="1" step="1" inputmode="numeric" '
      + 'placeholder="例如：80" value="' + esc(act ? act.capacity : '') + '" aria-describedby="eCapacity">'
      + '        <p class="field-error" id="eCapacity"></p>'
      + '      </div>'
      + '      <div class="field full">'
      + '        <label class="field-label" for="fLocation">活动地点 <span class="req">*</span></label>'
      + '        <input class="input" id="fLocation" type="text" maxlength="60" placeholder="例如：厦门市思明区软件园二期 · 创新大厦 3F" '
      + 'value="' + esc(act ? act.location : '') + '" aria-describedby="eLocation">'
      + '        <p class="field-error" id="eLocation"></p>'
      + '      </div>'
      + '      <div class="field full">'
      + '        <span class="field-label">封面配色</span>'
      + '        <div class="cover-picker" role="group" aria-label="选择封面配色">' + dots + '</div>'
      + '      </div>'
      + '      <div class="field full">'
      + '        <label class="field-label" for="fIntro">活动介绍 <span class="req">*</span></label>'
      + '        <textarea class="textarea" id="fIntro" rows="5" maxlength="600" '
      + 'placeholder="介绍活动内容、亮点与适合人群，换行会被保留" aria-describedby="eIntro">'
      + esc(act ? act.intro : '') + '</textarea>'
      + '        <p class="field-error" id="eIntro"></p>'
      + '      </div>'
      + '      <div class="field full">'
      + '        <label class="field-label" for="fNotice">报名须知</label>'
      + '        <textarea class="textarea" id="fNotice" rows="4" maxlength="500" '
      + 'placeholder="签到时间、携带物品、取消规则等，换行会被保留">' + esc(act ? act.notice : '') + '</textarea>'
      + '        <p class="field-hint">选填，建议包含签到与取消规则</p>'
      + '      </div>'
      + '    </div>'
      + '    <div class="form-actions">'
      + '      <a class="btn btn-secondary" href="#/admin">取消</a>'
      + '      <button class="btn btn-primary" type="submit">' + (isEdit ? '保存修改' : '创建活动') + '</button>'
      + '    </div>'
      + '  </form>'
      + '</div>';
  }

  function setFieldError(inputId, errId, msg) {
    const input = document.getElementById(inputId);
    const err = document.getElementById(errId);
    if (err) err.textContent = msg || '';
    if (input) {
      input.classList.toggle('invalid', !!msg);
      if (msg) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  function clearFormErrors() {
    ['Title', 'Start', 'End', 'Signup', 'Capacity', 'Location', 'Intro'].forEach(k => {
      setFieldError('f' + k, 'e' + k, '');
    });
    const alertBox = document.getElementById('formAlert');
    if (alertBox) alertBox.classList.remove('show');
  }

  function showFormAlert(msg) {
    const alertBox = document.getElementById('formAlert');
    const text = document.getElementById('formAlertText');
    if (text) text.textContent = msg;
    if (alertBox) alertBox.classList.add('show');
    if (alertBox) alertBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function bindActivityForm(editId) {
    const form = document.getElementById('activityForm');
    if (!form) return;

    const coverBox = document.getElementById('fCover');

    form.addEventListener('click', function (e) {
      const dot = e.target.closest('[data-cover]');
      if (!dot) return;
      const idx = dot.getAttribute('data-cover');
      if (coverBox) coverBox.value = idx;
      Array.prototype.forEach.call(form.querySelectorAll('[data-cover]'), el => {
        el.setAttribute('aria-pressed', String(el === dot));
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearFormErrors();

      const title = document.getElementById('fTitle').value.trim();
      const start = document.getElementById('fStart').value;
      const end = document.getElementById('fEnd').value;
      const signup = document.getElementById('fSignup').value;
      const capRaw = document.getElementById('fCapacity').value.trim();
      const place = document.getElementById('fLocation').value.trim();
      const intro = document.getElementById('fIntro').value.trim();
      const notice = document.getElementById('fNotice').value.trim();
      const cover = Number(coverBox ? coverBox.value : 0) || 0;

      let firstError = null;
      const fail = (inputId, errId, msg) => {
        setFieldError(inputId, errId, msg);
        if (!firstError) firstError = inputId;
      };

      if (!title) fail('fTitle', 'eTitle', '请填写活动名称');
      else if (title.length < 2) fail('fTitle', 'eTitle', '活动名称至少 2 个字符');
      else if (title.length > 40) fail('fTitle', 'eTitle', '活动名称不能超过 40 个字符');

      if (!start) fail('fStart', 'eStart', '请选择活动开始时间');
      if (!end) fail('fEnd', 'eEnd', '请选择活动结束时间');
      if (!signup) fail('fSignup', 'eSignup', '请选择报名开放时间');

      if (start && end) {
        const s = parseLocal(start), en = parseLocal(end);
        if (s && en && en.getTime() <= s.getTime()) {
          fail('fEnd', 'eEnd', '结束时间必须晚于开始时间');
        }
      }
      if (signup && start) {
        const sg = parseLocal(signup), s = parseLocal(start);
        if (sg && s && sg.getTime() > s.getTime()) {
          fail('fSignup', 'eSignup', '报名开放时间不能晚于活动开始时间');
        }
      }

      if (!capRaw) {
        fail('fCapacity', 'eCapacity', '请填写报名人数上限');
      } else if (!/^\d+$/.test(capRaw) || Number(capRaw) <= 0) {
        fail('fCapacity', 'eCapacity', '人数上限必须是大于 0 的整数');
      } else if (Number(capRaw) > 9999) {
        fail('fCapacity', 'eCapacity', '人数上限不能超过 9999');
      } else if (editId) {
        const used = confirmedCount(editId);
        if (Number(capRaw) < used) {
          fail('fCapacity', 'eCapacity', '当前已有 ' + used + ' 人报名，上限不能小于该数值');
        }
      }

      if (!place) fail('fLocation', 'eLocation', '请填写活动地点');
      else if (place.length > 60) fail('fLocation', 'eLocation', '活动地点不能超过 60 个字符');

      if (!intro) fail('fIntro', 'eIntro', '请填写活动介绍');
      else if (intro.length < 10) fail('fIntro', 'eIntro', '活动介绍至少 10 个字符');

      if (firstError) {
        showFormAlert('表单填写有误，请按提示修改标红的字段');
        const el = document.getElementById(firstError);
        if (el) { el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        return;
      }

      const payload = {
        title: title,
        cover: cover,
        startTime: start,
        endTime: end,
        signupStart: signup,
        location: place,
        capacity: Number(capRaw),
        intro: intro,
        notice: notice || '1. 请按活动时间准时到场。\n2. 如需取消报名，请在活动开始前操作。'
      };

      if (editId) {
        const act = getActivity(editId);
        if (!act) { toast('活动不存在，可能已被删除', 'error'); window.location.hash = '#/admin'; return; }
        Object.assign(act, payload);
        saveDB();
        toast('活动已更新', 'success');
      } else {
        const id = 'act-' + Date.now().toString(36);
        payload.id = id;
        db.activities.push(payload);
        saveDB();
        toast('活动创建成功', 'success');
      }
      window.location.hash = '#/admin';
    });
  }

  /* ---------------- 7. 弹窗 / 抽屉 / Toast ---------------- */

  let lastFocused = null;

  function closeLayer() {
    const root = document.getElementById('layerRoot');
    if (!root) return;
    root.innerHTML = '';
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') {
      try { lastFocused.focus(); } catch (err) { /* 元素可能已移除 */ }
    }
    lastFocused = null;
  }

  function openLayer(cfg) {
    closeLayer();
    lastFocused = document.activeElement;

    const root = document.getElementById('layerRoot');
    const isDrawer = !!cfg.drawer;
    const panelCls = isDrawer ? 'drawer' : ('modal' + (cfg.wide ? ' wide' : ''));

    const overlay = document.createElement('div');
    overlay.className = 'overlay' + (isDrawer ? ' drawer-overlay' : '');
    overlay.innerHTML = ''
      + '<div class="' + panelCls + '" role="dialog" aria-modal="true" aria-labelledby="layerTitle">'
      + '  <div class="' + (isDrawer ? 'drawer-head' : 'modal-head') + '">'
      + '    <div style="min-width:0">'
      + '      <h2 class="modal-title" id="layerTitle">' + esc(cfg.title || '') + '</h2>'
      + (cfg.sub ? '      <p class="modal-sub">' + esc(cfg.sub) + '</p>' : '')
      + '    </div>'
      + '    <button class="icon-btn" type="button" data-close aria-label="关闭弹窗">' + icon('close') + '</button>'
      + '  </div>'
      + '  <div class="' + (isDrawer ? 'drawer-body' : 'modal-body') + '">' + (cfg.bodyHTML || '') + '</div>'
      + (cfg.footHTML ? '  <div class="modal-foot">' + cfg.footHTML + '</div>' : '')
      + '</div>';

    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) closeLayer();
    });

    root.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    if (typeof cfg.onMount === 'function') cfg.onMount(overlay);

    const focusTarget = overlay.querySelector('input:not([type="hidden"]), textarea, select');
    if (focusTarget) {
      focusTarget.focus();
    } else {
      const btn = overlay.querySelector('.modal-foot .btn, .icon-btn');
      if (btn) btn.focus();
    }
    return overlay;
  }

  function confirmDialog(cfg) {
    return new Promise(resolve => {
      let settled = false;
      const done = v => {
        if (settled) return;
        settled = true;
        closeLayer();
        resolve(v);
      };

      const overlay = openLayer({
        title: cfg.title || '请确认',
        bodyHTML: ''
          + '<div class="confirm-body">'
          + '  <div class="confirm-icon' + (cfg.danger === false ? ' info' : '') + '">'
          + icon(cfg.icon || (cfg.danger === false ? 'info' : 'alert'))
          + '  </div>'
          + '  <div class="confirm-text">' + (cfg.message || '') + '</div>'
          + '</div>',
        footHTML: ''
          + '<button class="btn btn-secondary" type="button" data-confirm-no>取消</button>'
          + '<button class="btn ' + (cfg.danger === false ? 'btn-primary' : 'btn-danger') + '" type="button" data-confirm-yes>'
          + esc(cfg.confirmText || '确认') + '</button>',
        onMount(root) {
          root.addEventListener('click', function (e) {
            if (e.target.closest('[data-confirm-yes]')) done(true);
            else if (e.target.closest('[data-confirm-no]') || e.target.closest('[data-close]')) done(false);
          });
        }
      });

      overlay.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') done(false);
      });
    });
  }

  const TOAST_ICON = { success: 'checkCircle', error: 'alert', info: 'info' };

  function toast(message, type) {
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.setAttribute('role', 'status');
    el.innerHTML = icon(TOAST_ICON[type] || TOAST_ICON.info) + '<span>' + esc(message) + '</span>';
    stack.appendChild(el);

    window.setTimeout(function () {
      el.classList.add('leaving');
      window.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 200);
    }, 3000);
  }

  /* ---------------- 8. 业务动作 ---------------- */

  function openSignupModal(activityId) {
    const act = getActivity(activityId);
    if (!act) { toast('活动不存在', 'error'); return; }

    const gate = canSignup(act);
    if (!gate.ok) { toast(gate.reason, 'error'); return; }

    const used = confirmedCount(act.id);
    const rest = Math.max(act.capacity - used, 0);

    openLayer({
      title: '填写报名信息',
      sub: act.title,
      bodyHTML: ''
        + '<form id="signupForm" novalidate>'
        + '  <div class="notice-box info" style="margin-bottom:16px">' + icon('info')
        + '    <span>本场剩余 <strong>' + rest + '</strong> 个名额 · 活动时间 ' + esc(fmtRange(act.startTime, act.endTime)) + '</span>'
        + '  </div>'
        + '  <div class="field">'
        + '    <label class="field-label" for="suName">姓名 <span class="req">*</span></label>'
        + '    <input class="input" id="suName" name="name" type="text" maxlength="20" autocomplete="name" '
        + 'placeholder="请输入真实姓名，用于现场核验" aria-describedby="eSuName">'
        + '    <p class="field-error" id="eSuName"></p>'
        + '  </div>'
        + '  <div class="field" style="margin-top:14px">'
        + '    <label class="field-label" for="suPhone">手机号 <span class="req">*</span></label>'
        + '    <input class="input" id="suPhone" name="phone" type="tel" inputmode="numeric" maxlength="11" '
        + 'autocomplete="tel" placeholder="11 位大陆手机号" aria-describedby="eSuPhone suHint">'
        + '    <p class="field-hint" id="suHint">同一活动同一手机号只能报名一次；演示环境可填写 13800138000 等模拟号码</p>'
        + '    <p class="field-error" id="eSuPhone"></p>'
        + '  </div>'
        + '</form>',
      footHTML: ''
        + '<button class="btn btn-secondary" type="button" data-close>取消</button>'
        + '<button class="btn btn-primary" type="submit" form="signupForm">确认报名</button>',
      onMount(root) {
        const form = root.querySelector('#signupForm');

        form.addEventListener('submit', function (e) {
          e.preventDefault();

          const nameEl = root.querySelector('#suName');
          const phoneEl = root.querySelector('#suPhone');
          const name = nameEl.value.trim();
          const phone = phoneEl.value.trim();

          setFieldError('suName', 'eSuName', '');
          setFieldError('suPhone', 'eSuPhone', '');

          if (!name) { setFieldError('suName', 'eSuName', '请填写姓名'); nameEl.focus(); return; }
          if (name.length < 2) { setFieldError('suName', 'eSuName', '姓名至少 2 个字符'); nameEl.focus(); return; }
          if (!phone) { setFieldError('suPhone', 'eSuPhone', '请填写手机号'); phoneEl.focus(); return; }
          if (!/^1[3-9]\d{9}$/.test(phone)) {
            setFieldError('suPhone', 'eSuPhone', '请输入正确的 11 位大陆手机号');
            phoneEl.focus();
            return;
          }

          // 重复报名校验
          const dup = db.registrations.find(r =>
            r.activityId === act.id && r.phone === phone && r.status === 'confirmed'
          );
          if (dup) {
            setFieldError('suPhone', 'eSuPhone', '该手机号已报名本活动，报名编号 ' + dup.code);
            phoneEl.focus();
            return;
          }

          // 名额兜底校验（防止弹窗期间名额被占满）
          const fresh = canSignup(act);
          if (!fresh.ok) {
            toast(fresh.reason, 'error');
            closeLayer();
            render();
            return;
          }

          const reg = {
            id: 'reg-' + Date.now().toString(36),
            activityId: act.id,
            name: name,
            phone: phone,
            code: nextRegCode(),
            createdAt: toLocalInput(new Date()),
            status: 'confirmed'
          };
          db.registrations.push(reg);
          saveDB();

          showSignupSuccess(reg, act);
          render(true);
        });

        // 手机号只允许数字
        const phoneEl = root.querySelector('#suPhone');
        phoneEl.addEventListener('input', function () {
          const v = this.value.replace(/\D/g, '').slice(0, 11);
          if (v !== this.value) this.value = v;
        });
      }
    });
  }

  function showSignupSuccess(reg, act) {
    openLayer({
      title: '报名成功',
      bodyHTML: ''
        + '<div class="success-panel">'
        + '  <div class="success-mark">' + icon('check') + '</div>'
        + '  <p class="success-title">报名已提交成功</p>'
        + '  <p class="success-desc">请保存下方报名编号，现场核验时出示</p>'
        + '  <div class="success-ticket">'
        + '    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px">'
        + '      <span class="ticket-label">报名编号</span>'
        + '      <span class="ticket-code">' + esc(reg.code) + '</span>'
        + '    </div>'
        + '    <dl style="margin:0;display:grid;gap:8px">'
        + '      <div class="ticket-line"><dt>活动</dt><dd>' + esc(act.title) + '</dd></div>'
        + '      <div class="ticket-line"><dt>时间</dt><dd>' + esc(fmtRange(act.startTime, act.endTime)) + '</dd></div>'
        + '      <div class="ticket-line"><dt>地点</dt><dd>' + esc(act.location) + '</dd></div>'
        + '      <div class="ticket-line"><dt>报名人</dt><dd>' + esc(reg.name) + ' · ' + esc(reg.phone) + '</dd></div>'
        + '    </dl>'
        + '  </div>'
        + '</div>',
      footHTML: ''
        + '<button class="btn btn-secondary" type="button" data-close>继续浏览</button>'
        + '<a class="btn btn-primary" href="#/my" data-close>查看我的报名</a>'
    });
    toast('报名成功，编号 ' + reg.code, 'success');
  }

  function openRosterDrawer(activityId) {
    const act = getActivity(activityId);
    if (!act) { toast('活动不存在', 'error'); return; }

    state.roster.actId = activityId;
    state.roster.keyword = '';
    state.roster.onlyConfirmed = true;

    openLayer({
      drawer: true,
      title: '报名名单',
      sub: act.title,
      bodyHTML: '<div id="rosterBody">' + rosterHTML() + '</div>',
      onMount(root) {
        root.addEventListener('click', function (e) {
          const tab = e.target.closest('[data-roster-mode]');
          if (tab) {
            state.roster.onlyConfirmed = tab.getAttribute('data-roster-mode') === 'confirmed';
            refreshRoster();
          }
        });
        root.addEventListener('input', function (e) {
          if (e.target.id === 'rosterSearch') {
            state.roster.keyword = e.target.value;
            refreshRoster(true);
          }
        });
      }
    });
  }

  function rosterHTML() {
    const act = getActivity(state.roster.actId);
    if (!act) return '<p class="muted">活动不存在</p>';

    const all = regsOf(act.id, true);
    const confirmed = all.filter(r => r.status === 'confirmed');
    const cancelled = all.length - confirmed.length;

    const kw = state.roster.keyword.trim().toLowerCase();
    const source = state.roster.onlyConfirmed ? confirmed : all;
    const rows = source
      .filter(r => !kw || (r.name + ' ' + r.phone + ' ' + r.code).toLowerCase().indexOf(kw) > -1)
      .sort((a, b) => parseLocal(b.createdAt) - parseLocal(a.createdAt));

    const head = ''
      + '<div class="drawer-stats">'
      + '  <div class="drawer-stat"><b>' + confirmed.length + '</b><span>已报名</span></div>'
      + '  <div class="drawer-stat"><b>' + cancelled + '</b><span>已取消</span></div>'
      + '  <div class="drawer-stat"><b>' + act.capacity + '</b><span>人数上限</span></div>'
      + '</div>'
      + '<div class="drawer-toolbar">'
      + '  <div class="search-field">' + icon('search')
      + '    <input class="input" id="rosterSearch" type="search" placeholder="搜索姓名 / 手机号 / 报名编号" '
      + 'value="' + esc(state.roster.keyword) + '" aria-label="搜索报名人员">'
      + '  </div>'
      + '</div>'
      + '<div class="segmented" style="margin-bottom:14px;width:auto">'
      + '  <button type="button" class="seg-btn' + (state.roster.onlyConfirmed ? ' active' : '') + '" data-roster-mode="confirmed">仅已报名</button>'
      + '  <button type="button" class="seg-btn' + (!state.roster.onlyConfirmed ? ' active' : '') + '" data-roster-mode="all">全部记录</button>'
      + '</div>';

    if (!rows.length) {
      return head + ''
        + '<div class="empty" style="padding:40px 16px">'
        + '  <div class="empty-icon">' + icon('users') + '</div>'
        + '  <p class="empty-title">' + (kw ? '没有匹配的报名人员' : '暂无报名记录') + '</p>'
        + '  <p class="empty-desc">' + (kw ? '换个关键词试试，或切换为「全部记录」' : '活动尚未收到报名，分享活动详情页即可收集报名') + '</p>'
        + '</div>';
    }

    const body = rows.map(r => ''
      + '<tr>'
      + '  <td class="cell-nowrap">' + esc(r.name) + '</td>'
      + '  <td class="cell-nowrap mono">' + esc(r.phone) + '</td>'
      + '  <td class="cell-nowrap">' + esc(fmtShort(r.createdAt)) + '</td>'
      + '  <td class="cell-nowrap mono">' + esc(r.code) + '</td>'
      + '  <td class="cell-nowrap">' + (r.status === 'confirmed'
        ? '<span class="pill pill-open">已报名</span>'
        : '<span class="pill pill-cancelled">已取消</span>') + '</td>'
      + '</tr>').join('');

    return head + ''
      + '<div class="table-wrap">'
      + '  <table class="mini-table">'
      + '    <thead><tr><th>姓名</th><th>手机号</th><th>报名时间</th><th>报名编号</th><th>状态</th></tr></thead>'
      + '    <tbody>' + body + '</tbody>'
      + '  </table>'
      + '</div>'
      + '<p class="side-footnote" style="text-align:left;margin-top:14px">共 ' + rows.length + ' 条记录</p>';
  }

  function refreshRoster(keepFocus) {
    const wrap = document.getElementById('rosterBody');
    if (!wrap) return;
    wrap.innerHTML = rosterHTML();
    if (keepFocus) {
      const input = document.getElementById('rosterSearch');
      if (input) {
        input.focus();
        const len = input.value.length;
        try { input.setSelectionRange(len, len); } catch (err) { /* 部分浏览器不支持 */ }
      }
    }
  }

  function cancelRegistration(regId) {
    const reg = db.registrations.find(r => r.id === regId);
    if (!reg) { toast('报名记录不存在', 'error'); return; }
    const act = getActivity(reg.activityId);
    const gate = canCancel(reg);
    if (!gate.ok) { toast(gate.reason, 'error'); return; }

    confirmDialog({
      title: '取消报名',
      danger: true,
      confirmText: '确认取消',
      message: '确定要取消 <strong>' + esc(act ? act.title : '该活动') + '</strong> 的报名吗？<br>'
        + '报名编号 <strong>' + esc(reg.code) + '</strong> 将失效，名额会立即释放给其他参与者。'
    }).then(ok => {
      if (!ok) return;
      reg.status = 'cancelled';
      saveDB();
      toast('已取消报名，名额已释放', 'success');
      refreshRegList();
      const desc = document.querySelector('.page-desc');
      if (desc) {
        const total = db.registrations.length;
        const active = db.registrations.filter(r => r.status === 'confirmed').length;
        desc.textContent = '共 ' + total + ' 条报名记录，其中 ' + active + ' 条有效 · 可在此查看电子凭证或取消报名';
      }
    });
  }

  function refreshRegList() {
    const wrap = document.getElementById('regListWrap');
    if (wrap) wrap.innerHTML = regListHTML();
  }

  function deleteActivity(actId) {
    const act = getActivity(actId);
    if (!act) return;
    const count = regsOf(actId, true).length;

    confirmDialog({
      title: '删除活动',
      danger: true,
      confirmText: '删除活动',
      message: '确定删除 <strong>' + esc(act.title) + '</strong> 吗？<br>'
        + (count > 0 ? '该活动下的 <strong>' + count + '</strong> 条报名记录将一并删除，' : '')
        + '此操作不可撤销。'
    }).then(ok => {
      if (!ok) return;
      db.activities = db.activities.filter(a => a.id !== actId);
      db.registrations = db.registrations.filter(r => r.activityId !== actId);
      saveDB();
      toast('活动已删除', 'success');
      render(true);
    });
  }

  /* ---------------- 9. 路由 ---------------- */

  function parseRoute() {
    const raw = (location.hash || '#/list').replace(/^#/, '');
    const seg = raw.split('/').filter(Boolean);
    if (!seg.length) return { name: 'list' };
    const head = seg[0];
    if (head === 'list') return { name: 'list' };
    if (head === 'detail' && seg[1]) return { name: 'detail', id: decodeURIComponent(seg[1]) };
    if (head === 'my') return { name: 'my' };
    if (head === 'admin') {
      if (seg[1] === 'new') return { name: 'admin-form', id: null };
      if (seg[1] === 'edit' && seg[2]) return { name: 'admin-form', id: decodeURIComponent(seg[2]) };
      return { name: 'admin' };
    }
    return { name: 'list' };
  }

  function syncChrome(routeName) {
    const navKey = (routeName === 'detail') ? 'list'
      : (routeName === 'admin-form' ? 'admin' : routeName);

    Array.prototype.forEach.call(document.querySelectorAll('.main-nav a'), a => {
      a.classList.toggle('active', a.getAttribute('data-nav') === navKey);
      if (a.getAttribute('data-nav') === navKey) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    Array.prototype.forEach.call(document.querySelectorAll('.role-switch button'), b => {
      b.classList.toggle('active', b.getAttribute('data-role') === db.role);
      b.setAttribute('aria-pressed', String(b.getAttribute('data-role') === db.role));
    });

    const titles = {
      list: '活动列表',
      detail: '活动详情',
      my: '我的报名',
      admin: '活动管理',
      'admin-form': '编辑活动'
    };
    document.title = (titles[routeName] || '活动列表') + ' · 聚场 GatherHub';
  }

  function render(keepScroll) {
    const route = parseRoute();
    syncChrome(route.name);
    const app = document.getElementById('app');

    let html = '';
    switch (route.name) {
      case 'list': html = viewList(); break;
      case 'detail': html = viewDetail(route.id); break;
      case 'my': html = viewMy(); break;
      case 'admin': html = viewAdmin(); break;
      case 'admin-form': html = viewAdminForm(route.id); break;
      default: html = viewNotFound('页面不存在');
    }

    app.innerHTML = html;

    if (route.name === 'admin-form') bindActivityForm(route.id);
    if (!keepScroll) window.scrollTo(0, 0);

    // 视图切换后关闭移动端菜单
    const nav = document.getElementById('mainNav');
    const roleBox = document.querySelector('.role-switch');
    const toggle = document.getElementById('navToggle');
    if (nav) nav.classList.remove('open');
    if (roleBox) roleBox.classList.remove('open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  /* ---------------- 10. 全局事件 ---------------- */

  function handleAction(e) {
    // 关闭按钮（弹窗/抽屉）
    const closer = e.target.closest('[data-close]');
    if (closer) {
      // 若同时是链接，保留跳转
      closeLayer();
      if (closer.tagName !== 'A') { e.preventDefault(); }
      return;
    }

    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.getAttribute('data-action');

    switch (action) {
      case 'filter-status': {
        e.preventDefault();
        state.statusFilter = el.getAttribute('data-status');
        Array.prototype.forEach.call(document.querySelectorAll('[data-action="filter-status"]'), b => {
          const on = b === el;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', String(on));
        });
        const wrap = document.getElementById('gridWrap');
        if (wrap) wrap.innerHTML = gridHTML();
        break;
      }
      case 'clear-filter': {
        e.preventDefault();
        state.keyword = '';
        state.statusFilter = 'all';
        render(true);
        break;
      }
      case 'clear-phone': {
        e.preventDefault();
        state.myPhone = '';
        const input = document.getElementById('phoneFilter');
        if (input) input.value = '';
        refreshRegList();
        break;
      }
      case 'open-signup': {
        e.preventDefault();
        openSignupModal(el.getAttribute('data-id'));
        break;
      }
      case 'cancel-reg': {
        e.preventDefault();
        cancelRegistration(el.getAttribute('data-id'));
        break;
      }
      case 'open-roster': {
        e.preventDefault();
        openRosterDrawer(el.getAttribute('data-id'));
        break;
      }
      case 'delete-activity': {
        e.preventDefault();
        deleteActivity(el.getAttribute('data-id'));
        break;
      }
      default: break;
    }
  }

  function handleInput(e) {
    const t = e.target;

    if (t.id === 'keywordInput') {
      state.keyword = t.value;
      const wrap = document.getElementById('gridWrap');
      if (wrap) wrap.innerHTML = gridHTML();
      return;
    }
    if (t.id === 'phoneFilter') {
      state.myPhone = t.value.replace(/[^\d]/g, '').slice(0, 11);
      if (t.value !== state.myPhone) t.value = state.myPhone;
      refreshRegList();
      return;
    }
    if (t.id === 'adminSearch') {
      state.adminKeyword = t.value;
      const wrap = document.getElementById('adminTableWrap');
      if (wrap) wrap.innerHTML = adminTableHTML();
      return;
    }
  }

  function init() {
    db = loadDB();

    document.addEventListener('click', handleAction);
    document.addEventListener('input', handleInput);

    // 角色切换
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('.role-switch button');
      if (!btn) return;
      const role = btn.getAttribute('data-role');
      if (role === db.role) return;
      db.role = role;
      saveDB();
      syncChrome(parseRoute().name);
      toast(role === 'admin' ? '已切换为管理员视角' : '已切换为普通用户视角', 'info');
      if (parseRoute().name === 'admin' || parseRoute().name === 'admin-form') render(true);
    });

    // 移动端菜单
    const toggle = document.getElementById('navToggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        const nav = document.getElementById('mainNav');
        const roleBox = document.querySelector('.role-switch');
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        if (nav) nav.classList.toggle('open', open);
        if (roleBox) roleBox.classList.toggle('open', open);
      });
    }

    // 重置演示数据
    const resetBtn = document.getElementById('resetDemo');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        confirmDialog({
          title: '重置演示数据',
          danger: true,
          confirmText: '重置并刷新',
          message: '将清除本浏览器中所有活动与报名记录，恢复为初始演示数据。<br>此操作不可撤销。'
        }).then(ok => {
          if (!ok) return;
          try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* 忽略 */ }
          location.hash = '#/list';
          location.reload();
        });
      });
    }

    // Esc 关闭浮层
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        const root = document.getElementById('layerRoot');
        if (root && root.children.length) closeLayer();
      }
    });

    window.addEventListener('hashchange', function () { render(); });

    if (!location.hash) location.hash = '#/list';
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
