// 教練帳本 — UI
import * as E from './engine.js';
import { ntd, num, ymLabel, dateLabel, shortDate, timeOf, todayStr, nowLocal, esc, toCSV } from './format.js';
import * as db from './db.js';
import { buildDemo } from './demo.js';

const APP_VERSION = '1.0.0';
const data = { students: [], packages: [], sessions: [] };
const state = { month: null, reportEnd: null, search: '' };
const $view = document.getElementById('view');
const today = () => todayStr();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const byId = (list, id) => list.find((x) => x.id === id);
const studentName = (id) => (byId(data.students, id) || {}).name || '（已刪除）';

// ---------- icons ----------
const ic = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 004 0"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/></svg>',
};

// ---------- utilities ----------
function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function back(fallback) { if (history.length > 1 && state.navCount > 0) history.back(); else go(fallback); }
function topbar(title, { backTo, action } = {}) {
  return `<header class="topbar">
    ${backTo ? `<button class="iconbtn" data-back="${esc(backTo)}" aria-label="返回">${ic.back}</button>` : '<span class="spacer"></span>'}
    <h1>${esc(title)}</h1>
    ${action || '<span class="spacer"></span>'}
  </header>`;
}
function monthNav(ym, key) {
  return `<div class="monthnav">
    <button class="iconbtn" data-month="${key}:-1" aria-label="上個月">${ic.left}</button>
    <span class="monthlabel">${ymLabel(ym)}</span>
    <button class="iconbtn" data-month="${key}:1" aria-label="下個月">${ic.right}</button>
  </div>`;
}
const ledgers = () => E.computeAll(data, today());
const statusBadge = (s) => `<span class="badge st-${s}">${E.STATUS_LABELS[s]}</span>`;
function remBadge(n, has = true) {
  if (!has) return '<span class="pill muted">無方案</span>';
  const cls = n === 0 ? 'danger' : n <= 3 ? 'warn' : 'ok';
  return `<span class="pill ${cls}">剩 ${n} 堂</span>`;
}
function field(label, inner, hint = '') {
  return `<label class="field"><span class="flabel">${label}</span>${inner}${hint ? `<span class="fhint">${hint}</span>` : ''}</label>`;
}
function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const file = new File([blob], filename, { type: mime });
  if (navigator.canShare && /iPhone|iPad|iPod/.test(navigator.userAgent) && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: filename }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---------- persistence ----------
async function reload() {
  const d = await db.loadAll();
  data.students = d.students; data.packages = d.packages; data.sessions = d.sessions;
}

// ---------- views ----------
const views = {};

views.home = () => {
  const t = today();
  const ym = state.month || t.slice(0, 7);
  const L = ledgers();
  const m = E.monthSummary(data, ym, t, L);
  const al = E.alerts(data, t);
  const warnPkgs = data.packages.filter((p) => L[p.id].warnings.length);
  const monthSessions = data.sessions.filter((s) => E.monthOf(s.datetime) === ym).sort((a, b) => (a.datetime < b.datetime ? 1 : -1));
  const empty = !data.students.length;
  const extra = [];
  if (m.incomeExpiry) extra.push(`過期認列 ${ntd(m.incomeExpiry)}`);
  if (m.incomeRefund) extra.push(`退費差額 ${ntd(m.incomeRefund)}`);
  return `
  <header class="topbar home"><h1 class="brand">教練帳本</h1>${monthNav(ym, 'home')}</header>
  <section class="stats">
    <div class="stat"><span class="slabel">實收現金</span><span class="sval ${m.cashIn < 0 ? 'neg' : ''}">${ntd(m.cashIn)}</span>
      <span class="ssub">${m.cashRefunds ? `購課 ${ntd(m.cashPurchases)}・退費 ${ntd(m.cashRefunds)}` : '購課收款（含無卡分期）'}</span></div>
    <div class="stat accent"><span class="slabel">實際收入</span><span class="sval">${ntd(m.income)}</span>
      <span class="ssub">${extra.length ? extra.join('・') : `上課認列 ${ntd(m.incomeSessions)}`}</span></div>
    <div class="stat"><span class="slabel">上課堂數</span><span class="sval">${m.classes}<small> 堂</small></span><span class="ssub">學員人次 ${m.attendances}</span></div>
    <div class="stat"><span class="slabel">期末預收款餘額</span><span class="sval">${ntd(m.endingDeferred)}</span><span class="ssub">尚未上課的已收款</span></div>
  </section>
  <a class="cta" href="#/checkin">${ic.check}<span>上課簽到</span></a>
  ${empty ? `<section class="card welcome">
      <h2>歡迎使用教練帳本 👋</h2>
      <p>先新增學生與方案，之後每次上課按「上課簽到」即可自動認列收入。</p>
      <div class="row gap"><a class="btn primary" href="#/student-new">新增學生</a><button class="btn" data-act="demo-load">載入範例資料</button></div>
    </section>` : ''}
  ${al.renew.length ? `<section class="card"><h2 class="ctitle">${ic.bell}續約提醒<span class="count">${al.renew.length}</span></h2>
    <ul class="list">${al.renew.map((r) => `<li><a href="#/student/${r.student.id}" class="li"><span class="liname">${esc(r.student.name)}</span>${remBadge(r.remaining)}</a></li>`).join('')}</ul></section>` : ''}
  ${al.expiring.length ? `<section class="card"><h2 class="ctitle">${ic.clock}14 天內到期<span class="count">${al.expiring.length}</span></h2>
    <ul class="list">${al.expiring.map((x) => `<li><a href="#/student/${x.pkg.studentId}" class="li"><span class="liname">${esc(x.student ? x.student.name : '')}<small>${esc(x.pkg.name)}・剩 ${x.ledger.remaining} 堂・到期 ${shortDateY(x.pkg.expiryDate)}</small></span><span class="pill ${x.daysLeft <= 3 ? 'danger' : 'warn'}">${x.daysLeft === 0 ? '今天到期' : `${x.daysLeft} 天後`}</span></a></li>`).join('')}</ul></section>` : ''}
  ${warnPkgs.length ? `<section class="card"><h2 class="ctitle">${ic.warn}需要注意</h2><ul class="list">${warnPkgs.map((p) => `<li><a href="#/student/${p.studentId}" class="li"><span class="liname">${esc(studentName(p.studentId))}<small>${esc(p.name)}：${L[p.id].warnings.map((w) => E.WARNING_LABELS[w]).join('、')}</small></span></a></li>`).join('')}</ul></section>` : ''}
  ${!empty ? `<section class="card"><h2 class="ctitle">本月上課紀錄<span class="count">${monthSessions.length}</span></h2>
    ${monthSessions.length ? `<ul class="list">${monthSessions.slice(0, 8).map((s) => sessionRow(s, L)).join('')}</ul>` : '<p class="muted pad">這個月還沒有上課紀錄</p>'}</section>` : ''}
  `;
};

function sessionRow(s, L, onlyStudent = null) {
  const atts = onlyStudent ? s.attendees.filter((a) => a.studentId === onlyStudent) : s.attendees;
  const names = s.attendees.map((a) => esc(studentName(a.studentId))).join('、');
  const val = atts.reduce((sum, a) => sum + (a.packageId && L[a.packageId] ? L[a.packageId].sessionValues[s.id] || 0 : 0), 0);
  const flags = atts.map((a) => (a.packageId && L[a.packageId] ? L[a.packageId].sessionFlags[s.id] : a.packageId ? null : 'none')).filter(Boolean);
  const n = s.sharedNote || {};
  const noteBits = [n.content, n.sets, n.condition && `狀況：${n.condition}`].filter(Boolean).join('｜');
  const own = onlyStudent && atts[0] && atts[0].note ? `<span class="pnote">個人備註：${esc(atts[0].note)}</span>` : '';
  return `<li><a class="li sess" href="#/session/${s.id}">
    <span class="sdate"><b>${shortDate(s.datetime)}</b><small>${timeOf(s.datetime)}</small></span>
    <span class="liname">${onlyStudent && s.attendees.length > 1 ? `<small class="tag">${s.attendees.length} 人課</small>` : ''}${onlyStudent ? '' : names}
      ${noteBits ? `<small>${esc(noteBits)}</small>` : ''}${own}
      ${flags.length ? `<small class="warntext">${flags.map((f) => (f === 'none' ? '未扣方案' : E.WARNING_LABELS[f])).join('、')}</small>` : ''}</span>
    <span class="amt">${ntd(val)}</span></a></li>`;
}

views.students = () => {
  const t = today();
  const L = ledgers();
  const q = state.search.trim().toLowerCase();
  const list = data.students
    .map((s) => {
      const pk = data.packages.filter((p) => p.studentId === s.id);
      const active = pk.filter((p) => L[p.id].available);
      return { s, rem: E.studentRemaining(data, s.id, t, L), has: pk.length > 0, active };
    })
    .filter(({ s }) => !q || [s.name, s.contact, s.goals].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (b.active.length > 0) - (a.active.length > 0) || a.s.name.localeCompare(b.s.name, 'zh-Hant'));
  return `${topbar('學生', { action: `<a class="iconbtn" href="#/student-new" aria-label="新增學生">${ic.plus}</a>` })}
  <div class="searchbar">${ic.search}<input type="search" id="search" placeholder="搜尋姓名、電話、目標" value="${esc(state.search)}" autocomplete="off"></div>
  ${list.length ? `<ul class="list card flush" id="studentList">${list.map(({ s, rem, has, active }) => `<li><a class="li" href="#/student/${s.id}">
      <span class="avatar">${esc(s.name.slice(0, 1))}</span>
      <span class="liname">${esc(s.name)}<small>${active.length ? esc(active.map((p) => p.name).join('、')) : has ? '無使用中方案' : '尚未購買方案'}</small></span>
      ${remBadge(rem, has)}</a></li>`).join('')}</ul>`
    : `<p class="empty">${data.students.length ? '找不到符合的學生' : '還沒有學生，點右上角 ＋ 新增'}</p>`}`;
};

views.student = (id) => {
  const s = byId(data.students, id);
  if (!s) return notFound();
  const t = today();
  const L = ledgers();
  const pkgs = data.packages.filter((p) => p.studentId === id).sort((a, b) => (a.purchaseDate < b.purchaseDate ? 1 : -1));
  const sess = data.sessions.filter((x) => x.attendees.some((a) => a.studentId === id)).sort((a, b) => (a.datetime < b.datetime ? 1 : -1));
  const rem = E.studentRemaining(data, id, t, L);
  const deferred = pkgs.reduce((sum, p) => sum + L[p.id].deferred, 0);
  return `${topbar(s.name, { backTo: '#/students', action: `<a class="textbtn" href="#/student-edit/${id}">編輯</a>` })}
  <section class="card profile">
    <div class="row between"><div class="bignum"><b>${rem}</b><span>剩餘堂數</span></div><div class="bignum"><b>${ntd(deferred)}</b><span>預收款餘額</span></div><div class="bignum"><b>${sess.length}</b><span>累計上課</span></div></div>
    <dl class="info">
      <dt>聯絡方式</dt><dd>${esc(s.contact) || '<span class="muted">—</span>'}</dd>
      <dt>訓練目標</dt><dd>${esc(s.goals) || '<span class="muted">—</span>'}</dd>
      <dt>健康備註</dt><dd>${esc(s.health) || '<span class="muted">—</span>'}</dd>
    </dl>
    <div class="row gap"><a class="btn primary grow" href="#/checkin?s=${id}">${ic.check}簽到上課</a><a class="btn grow" href="#/package-new/${id}">${ic.plus}新增方案</a></div>
  </section>
  <h2 class="sectiontitle">方案（${pkgs.length}）</h2>
  ${pkgs.length ? pkgs.map((p) => packageCard(p, L[p.id])).join('') : '<p class="empty small">尚未購買方案</p>'}
  <h2 class="sectiontitle">上課紀錄（${sess.length}）</h2>
  ${sess.length ? `<ul class="list card flush">${sess.map((x) => sessionRow(x, L, id)).join('')}</ul>` : '<p class="empty small">尚無上課紀錄</p>'}
  <div class="pad"><button class="btn danger ghost full" data-act="student-delete" data-id="${id}">刪除這位學生</button></div>`;
};

function packageCard(p, L) {
  const u = E.unitPriceInfo(p);
  const pct = L.total ? Math.min(100, Math.round((L.used / L.total) * 100)) : 0;
  return `<article class="card pkg">
    <div class="row between"><h3>${esc(p.name)}</h3>${statusBadge(L.status)}</div>
    <div class="tags"><span class="tag">${E.PACKAGE_TYPES[p.type] || ''}</span><span class="tag">${E.PAYMENT_TYPES[p.paymentType] || ''}</span>${p.bonusSessions ? `<span class="tag gift">贈 ${p.bonusSessions} 堂</span>` : ''}</div>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <div class="row between small"><span>已上 <b>${L.used}</b> / ${L.total} 堂</span><span>剩 <b>${L.remaining}</b> 堂</span></div>
    <dl class="grid2">
      <div><dt>售價</dt><dd>${ntd(p.price)}</dd></div>
      <div><dt>每堂認列</dt><dd>${ntd(u.base)}${u.last !== u.base ? `<small>（末堂 ${ntd(u.last)}）</small>` : ''}</dd></div>
      <div><dt>已認列收入</dt><dd>${ntd(L.recognized)}</dd></div>
      <div><dt>預收款餘額</dt><dd>${ntd(L.deferred)}</dd></div>
      <div><dt>購買日</dt><dd>${shortDateY(p.purchaseDate)}</dd></div>
      <div><dt>到期日</dt><dd>${p.expiryDate ? shortDateY(p.expiryDate) : '無期限'}</dd></div>
    </dl>
    ${p.refund && p.refund.date ? `<p class="note">退費 ${ntd(p.refund.amount)}（${shortDateY(p.refund.date)}）・退費月認列 ${ntd(L.refundIncome)}</p>` : ''}
    ${L.status === 'expired' ? `<p class="note">過期認列 ${ntd((L.income.find((e) => e.type === 'expiry') || { amount: 0 }).amount)}（${shortDateY(p.expiryDate)}）</p>` : ''}
    ${p.notes ? `<p class="note">${esc(p.notes)}</p>` : ''}
    ${L.warnings.length ? `<p class="warntext">${ic.warn}${L.warnings.map((w) => E.WARNING_LABELS[w]).join('、')}</p>` : ''}
    <div class="row gap actions">
      <a class="btn small" href="#/package-edit/${p.id}">編輯</a>
      ${!p.refund ? `<a class="btn small" href="#/refund/${p.id}">退費</a>` : ''}
      <button class="btn small danger ghost" data-act="package-delete" data-id="${p.id}">刪除</button>
    </div>
  </article>`;
}
const shortDateY = (d) => (d ? d.replace(/-/g, '/') : '');

views['student-new'] = () => studentForm(null);
views['student-edit'] = (id) => studentForm(byId(data.students, id));
function studentForm(s) {
  return `${topbar(s ? '編輯學生' : '新增學生', { backTo: s ? `#/student/${s.id}` : '#/students' })}
  <form class="form card" id="studentForm" data-id="${s ? s.id : ''}">
    ${field('姓名 *', `<input name="name" required value="${esc(s?.name)}" placeholder="例：林小美" autocomplete="off">`)}
    ${field('聯絡方式', `<input name="contact" value="${esc(s?.contact)}" placeholder="電話 / LINE ID">`)}
    ${field('訓練目標', `<textarea name="goals" rows="2" placeholder="例：減脂、增肌、比賽準備">${esc(s?.goals)}</textarea>`)}
    ${field('健康 / 傷病備註', `<textarea name="health" rows="2" placeholder="舊傷、禁忌動作、用藥…">${esc(s?.health)}</textarea>`)}
    <button class="btn primary full big" type="submit">${s ? '儲存' : '新增學生'}</button>
    ${!s ? '<p class="fhint center">新增後可直接建立方案</p>' : ''}
  </form>`;
}

views['package-new'] = (studentId) => packageForm(null, studentId);
views['package-edit'] = (id) => { const p = byId(data.packages, id); return p ? packageForm(p, p.studentId) : notFound(); };
function packageForm(p, studentId) {
  const st = byId(data.students, studentId);
  if (!st) return notFound();
  const v = p || { name: '', price: '', paidSessions: 10, bonusSessions: 0, purchaseDate: today(), paymentType: 'full', expiryDate: '', type: '1on1', notes: '' };
  const seg = (name, opts, cur) => `<div class="seg">${Object.entries(opts).map(([k, l]) => `<label><input type="radio" name="${name}" value="${k}" ${cur === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
  return `${topbar(p ? '編輯方案' : '新增方案', { backTo: `#/student/${studentId}` })}
  <form class="form card" id="packageForm" data-id="${p ? p.id : ''}" data-student="${studentId}">
    <p class="muted">學生：<b>${esc(st.name)}</b></p>
    ${field('方案名稱 *', `<input name="name" required value="${esc(v.name)}" placeholder="例：一對一 10 堂">`)}
    ${field('類型', seg('type', E.PACKAGE_TYPES, v.type))}
    ${field('實付金額（NT$）*', `<input name="price" inputmode="numeric" pattern="[0-9,]*" required value="${v.price === '' ? '' : num(v.price)}" placeholder="例：18,000">`)}
    <div class="row gap">
      ${field('付費堂數 *', `<input name="paidSessions" type="number" inputmode="numeric" min="0" step="1" required value="${v.paidSessions}">`)}
      ${field('贈送堂數', `<input name="bonusSessions" type="number" inputmode="numeric" min="0" step="1" value="${v.bonusSessions || 0}">`)}
    </div>
    <div class="preview" id="unitPreview"></div>
    ${field('付款方式', seg('paymentType', E.PAYMENT_TYPES, v.paymentType), '無卡分期：由分期公司於購買日一次撥付全額，金額全數列為當日實收現金')}
    <div class="row gap">
      ${field('購買日期 *', `<input name="purchaseDate" type="date" required value="${v.purchaseDate}">`)}
      ${field('到期日（選填）', `<input name="expiryDate" type="date" value="${v.expiryDate || ''}">`)}
    </div>
    ${field('備註', `<textarea name="notes" rows="2">${esc(v.notes)}</textarea>`)}
    ${p && p.refund ? `<div class="note">此方案已退費 ${ntd(p.refund.amount)}（${shortDateY(p.refund.date)}）。<a href="#/refund/${p.id}">修改或取消退費</a></div>` : ''}
    <div class="errors" id="formErrors"></div>
    <button class="btn primary full big" type="submit">${p ? '儲存方案' : '建立方案'}</button>
  </form>`;
}
function updateUnitPreview(form) {
  const el = document.getElementById('unitPreview');
  if (!el) return;
  const price = parseInt(String(form.price.value).replace(/[^\d]/g, ''), 10) || 0;
  const pkg = { price, paidSessions: +form.paidSessions.value || 0, bonusSessions: +form.bonusSessions.value || 0 };
  const u = E.unitPriceInfo(pkg);
  el.innerHTML = u.n ? `共 <b>${u.n}</b> 堂・每堂認列 <b>${ntd(u.base)}</b>${u.last !== u.base ? `（尾差：最後一堂 ${ntd(u.last)}）` : ''}` : '請輸入堂數';
}

views.refund = (id) => {
  const p = byId(data.packages, id);
  if (!p) return notFound();
  const L = E.packageLedger({ ...p, refund: null }, data.sessions, today());
  const r = p.refund || { amount: '', date: today() };
  return `${topbar('退費', { backTo: `#/student/${p.studentId}` })}
  <form class="form card" id="refundForm" data-id="${id}">
    <p><b>${esc(studentName(p.studentId))}</b>・${esc(p.name)}</p>
    <p class="muted small">售價 ${ntd(p.price)}・已上 ${L.used}/${L.total} 堂・目前預收款餘額 ${ntd(L.deferred)}</p>
    ${field('退費金額（NT$）*', `<input name="amount" inputmode="numeric" required value="${r.amount === '' ? '' : num(r.amount)}" placeholder="例：5,000">`)}
    ${field('退費日期 *', `<input name="date" type="date" required value="${r.date}">`)}
    <div class="preview" id="refundPreview"></div>
    <p class="fhint">退費後方案即結案；已上課認列的收入保留。剩餘預收款扣除退費後的差額，於退費月份認列為收入。</p>
    <div class="errors" id="formErrors"></div>
    <button class="btn primary full big" type="submit">確認退費</button>
    ${p.refund ? `<button class="btn danger ghost full" type="button" data-act="refund-cancel" data-id="${id}">取消退費（恢復方案）</button>` : ''}
  </form>`;
};
function updateRefundPreview(form) {
  const p = byId(data.packages, form.dataset.id);
  const amount = parseInt(String(form.amount.value).replace(/[^\d]/g, ''), 10) || 0;
  const date = form.date.value;
  const el = document.getElementById('refundPreview');
  if (!date) { el.innerHTML = ''; return; }
  const pv = E.refundPreview({ ...p, refund: null }, data.sessions, today(), amount, date);
  el.classList.toggle('warnbox', pv.exceeds);
  el.innerHTML = `退費日剩餘預收款 <b>${ntd(pv.deferredAtRefund)}</b><br>退費月（${ymLabel(date.slice(0, 7))}）認列收入 <b class="${pv.exceeds ? 'neg' : ''}">${ntd(pv.refundIncome)}</b>
   ${pv.exceeds ? `<div class="warntext">${ic.warn}退費金額超過剩餘預收款 ${ntd(-pv.refundIncome)}，將在退費月列為負收入</div>` : ''}`;
}

// ---------- 上課簽到 ----------
let ck = null; // 簽到表單狀態
function initCheckin(sessionId, preStudent) {
  if (sessionId) {
    const s = byId(data.sessions, sessionId);
    if (!s) return false;
    ck = { id: s.id, datetime: s.datetime, note: { content: '', sets: '', condition: '', ...(s.sharedNote || {}) }, sel: s.attendees.map((a) => ({ ...a, manual: true })), search: '' };
  } else {
    ck = { id: null, datetime: nowLocal(), note: { content: '', sets: '', condition: '' }, sel: [], search: '' };
    if (preStudent && byId(data.students, preStudent)) addSel(preStudent);
  }
  return true;
}
function addSel(studentId) {
  ck.sel.push({ studentId, packageId: E.defaultPackageFor(data, studentId, E.dateOf(ck.datetime), today(), ck.id), note: '', manual: false });
}
function recentStudents() {
  const last = {};
  for (const s of data.sessions) for (const a of s.attendees) if (!last[a.studentId] || last[a.studentId] < s.datetime) last[a.studentId] = s.datetime;
  const L = ledgers();
  return [...data.students].sort((a, b) => {
    const aa = data.packages.some((p) => p.studentId === a.id && L[p.id].available), bb = data.packages.some((p) => p.studentId === b.id && L[p.id].available);
    if (aa !== bb) return bb - aa;
    return (last[b.id] || '').localeCompare(last[a.id] || '');
  });
}
views.checkin = (_, params) => {
  if (!ck || ck.id || ck.fresh !== location.hash) { initCheckin(null, params.get('s')); ck.fresh = location.hash; }
  return checkinView();
};
views.session = (id) => {
  if (!ck || ck.id !== id) { if (!initCheckin(id)) return notFound(); }
  return checkinView();
};
function checkinView() {
  const editing = !!ck.id;
  return `${topbar(editing ? '編輯上課紀錄' : '上課簽到', { backTo: '#/' })}
  <form class="form" id="checkinForm" autocomplete="off">
    <section class="card">
      ${field('上課時間', `<input type="datetime-local" name="datetime" value="${ck.datetime}" required>`)}
    </section>
    <section class="card">
      <div class="row between"><h2 class="ctitle">選擇學生<small class="muted">可多選（一對二 / 團體）</small></h2><a class="textbtn small" href="#/student-new">＋新學生</a></div>
      ${data.students.length > 8 ? `<div class="searchbar inner">${ic.search}<input type="search" id="ckSearch" placeholder="搜尋學生" value="${esc(ck.search)}"></div>` : ''}
      <div class="chips" id="chips">${chipsHTML()}</div>
    </section>
    <section id="selected">${selectedHTML()}</section>
    <section class="card">
      <h2 class="ctitle">課堂紀錄<small class="muted">${ck.sel.length > 1 ? '共同備註，套用全部學生' : ''}</small></h2>
      ${field('訓練內容', `<textarea name="content" rows="2" placeholder="例：下肢日：深蹲、羅馬尼亞硬舉">${esc(ck.note.content)}</textarea>`)}
      ${field('重量 / 組數 / 次數', `<textarea name="sets" rows="2" placeholder="例：深蹲 60kg 4×8">${esc(ck.note.sets)}</textarea>`)}
      ${field('身體狀況', `<input name="condition" value="${esc(ck.note.condition)}" placeholder="例：良好 / 下背緊">`)}
    </section>
    ${editing ? `<div class="pad"><button type="button" class="btn danger ghost full" data-act="session-delete" data-id="${ck.id}">刪除這筆紀錄</button></div>` : ''}
    <div class="savebar"><button class="btn primary full big" type="submit" id="ckSave" ${ck.sel.length ? '' : 'disabled'}>${ic.check}${editing ? '儲存變更' : ck.sel.length ? `簽到（${ck.sel.length} 位）` : '請選擇學生'}</button></div>
  </form>`;
}
function chipsHTML() {
  const q = ck.search.trim().toLowerCase();
  const t = today();
  const L = ledgers();
  const list = recentStudents().filter((s) => !q || s.name.toLowerCase().includes(q));
  if (!list.length) return `<p class="muted">${data.students.length ? '找不到學生' : '還沒有學生，請先新增'}</p>`;
  return list.map((s) => {
    const on = ck.sel.some((x) => x.studentId === s.id);
    const rem = E.studentRemaining(data, s.id, t, L);
    return `<button type="button" class="chip ${on ? 'on' : ''}" data-chip="${s.id}" aria-pressed="${on}">${on ? ic.check : ''}${esc(s.name)}<small>${rem}</small></button>`;
  }).join('');
}
function selectedHTML() {
  if (!ck.sel.length) return '';
  const date = E.dateOf(ck.datetime);
  const multi = ck.sel.length > 1;
  return `<div class="card"><h2 class="ctitle">扣抵方案</h2><ul class="sel">${ck.sel.map((a, i) => {
    const avail = E.availablePackages(data, a.studentId, date, today(), ck.id);
    const opts = avail.map(({ pkg, ledger }) => ({ id: pkg.id, label: `${pkg.name}｜剩 ${ledger.remaining} 堂｜每堂 ${ntd(E.sessionValue(pkg, ledger.used))}${pkg.expiryDate ? `｜到期 ${shortDate(pkg.expiryDate)}` : ''}` }));
    if (a.packageId && !opts.some((o) => o.id === a.packageId)) {
      const p = byId(data.packages, a.packageId);
      if (p) opts.push({ id: p.id, label: `${p.name}（${E.STATUS_LABELS[E.packageLedger(p, data.sessions, today()).status]}）` });
    }
    return `<li data-idx="${i}">
      <div class="row between"><b>${esc(studentName(a.studentId))}</b><button type="button" class="textbtn small" data-unsel="${a.studentId}">移除</button></div>
      <select data-pkg="${i}">${opts.map((o) => `<option value="${o.id}" ${o.id === a.packageId ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}<option value="" ${!a.packageId ? 'selected' : ''}>不扣方案（體驗 / 補課，不認列收入）</option></select>
      ${!avail.length && !a.packageId ? `<p class="warntext small">${ic.warn}沒有可用方案，<a href="#/package-new/${a.studentId}">新增方案</a></p>` : ''}
      ${multi ? `<input class="pnoteinput" data-pnote="${i}" placeholder="個人備註（選填）" value="${esc(a.note)}">` : ''}
    </li>`;
  }).join('')}</ul></div>`;
}
function refreshCheckin() {
  document.getElementById('chips').innerHTML = chipsHTML();
  document.getElementById('selected').innerHTML = selectedHTML();
  const b = document.getElementById('ckSave');
  b.disabled = !ck.sel.length;
  if (!ck.id) b.innerHTML = `${ic.check}${ck.sel.length ? `簽到（${ck.sel.length} 位）` : '請選擇學生'}`;
}

views.reports = () => {
  const t = today();
  const end = state.reportEnd || t.slice(0, 7);
  const rows = E.monthlyReport(data, end, 12, t);
  const years = yearsWithData();
  const yt = years.map((y) => E.yearTotals(data, y, t));
  const tot = rows.reduce((a, r) => ({ cashIn: a.cashIn + r.cashIn, income: a.income + r.income, classes: a.classes + r.classes }), { cashIn: 0, income: 0, classes: 0 });
  return `${topbar('報表')}
  ${monthNav(end, 'report').replace('monthnav', 'monthnav center')}
  <section class="card"><h2 class="ctitle">近 12 個月<small class="muted">${ymLabel(rows[0].month)} – ${ymLabel(end)}</small></h2>
    ${chartSVG(rows)}
    <div class="legend"><span class="lg cash"></span>實收現金<span class="lg inc"></span>實際收入<span class="lg def"></span>期末預收款</div>
  </section>
  <section class="card flush"><div class="tablewrap"><table class="report">
    <thead><tr><th>月份</th><th>實收現金</th><th>實際收入</th><th>堂數</th><th>期末預收</th></tr></thead>
    <tbody>${rows.slice().reverse().map((r) => `<tr><td>${r.month.replace('-', '/')}</td><td class="${r.cashIn < 0 ? 'neg' : ''}">${num(r.cashIn)}</td><td class="${r.income < 0 ? 'neg' : ''}">${num(r.income)}</td><td>${r.classes}</td><td>${num(r.endingDeferred)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>合計</td><td>${num(tot.cashIn)}</td><td>${num(tot.income)}</td><td>${tot.classes}</td><td>${num(rows[11].endingDeferred)}</td></tr></tfoot>
  </table></div><p class="fhint pad">單位：新台幣元。期末預收 = 已收款但尚未上課（尚未認列）的金額。</p></section>
  <h2 class="sectiontitle">年度合計</h2>
  ${yt.map((y) => `<section class="card year"><h3>${y.year} 年</h3><dl class="grid2">
    <div><dt>實收現金</dt><dd>${ntd(y.cashIn)}</dd></div><div><dt>實際收入</dt><dd>${ntd(y.income)}</dd></div>
    <div><dt>上課堂數</dt><dd>${y.classes} 堂（${y.attendances} 人次）</dd></div><div><dt>${y.year == t.slice(0, 4) ? '目前預收款' : '年底預收款'}</dt><dd>${ntd(y.year == t.slice(0, 4) ? E.monthSummary(data, t.slice(0, 7), t).endingDeferred : y.endingDeferred)}</dd></div>
  </dl></section>`).join('')}`;
};
function yearsWithData() {
  const t = today();
  const dates = [...data.packages.map((p) => p.purchaseDate), ...data.sessions.map((s) => s.datetime)].filter(Boolean).sort();
  const first = dates.length ? +dates[0].slice(0, 4) : +t.slice(0, 4);
  const ys = [];
  for (let y = +t.slice(0, 4); y >= first; y--) ys.push(y);
  return ys;
}
function chartSVG(rows) {
  const W = 340, H = 180, pl = 4, pb = 22, pt = 10;
  const vals = rows.flatMap((r) => [r.cashIn, r.income, r.endingDeferred]);
  const max = Math.max(1, ...vals), min = Math.min(0, ...vals);
  const y = (v) => pt + (H - pt - pb) * (max - v) / (max - min);
  const bw = (W - pl * 2) / rows.length;
  const bar = (x, v, cls) => { const y0 = y(0), y1 = y(v); return `<rect class="${cls}" x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${(bw * 0.34).toFixed(1)}" height="${Math.max(0.5, Math.abs(y1 - y0)).toFixed(1)}" rx="2"/>`; };
  const pts = rows.map((r, i) => `${(pl + bw * i + bw / 2).toFixed(1)},${y(r.endingDeferred).toFixed(1)}`).join(' ');
  const fmtK = (v) => (Math.abs(v) >= 10000 ? `${Math.round(v / 1000) / 10}萬` : num(v));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="近12個月實收現金與實際收入長條圖">
    <line class="axis" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>
    <text class="maxlabel" x="${W - 2}" y="${pt + 2}" text-anchor="end">${fmtK(max)}</text>
    ${rows.map((r, i) => { const x = pl + bw * i + bw * 0.14; return bar(x, r.cashIn, 'b-cash') + bar(x + bw * 0.36, r.income, 'b-inc') + `<text x="${(pl + bw * i + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${Number(r.month.slice(5))}月</text>`; }).join('')}
    <polyline class="l-def" points="${pts}"/>
  </svg>`;
}

views.settings = async () => {
  const lastBackup = await db.getMeta('lastBackup');
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
  const hasDemo = [...data.students, ...data.packages, ...data.sessions].some((x) => x.demo);
  const days = lastBackup ? E.diffDays(lastBackup.slice(0, 10), today()) : null;
  return `${topbar('設定')}
  <section class="card notice">
    <h2 class="ctitle">${ic.warn}資料只存在這支手機</h2>
    <p>所有學生、方案與上課紀錄都儲存在本機（不會上傳任何伺服器）。刪除 App、清除 Safari 資料或換手機都會遺失資料，請<b>定期匯出備份</b>並存到「檔案 / iCloud 雲碟」或傳給自己。</p>
    <p class="small ${days === null || days > 14 ? 'warntext' : 'muted'}">上次備份：${lastBackup ? `${dateLabel(lastBackup)}${days > 0 ? `（${days} 天前）` : '（今天）'}` : '從未備份'}</p>
    ${persisted === false ? '<button class="btn small" data-act="persist">要求瀏覽器保留資料</button>' : ''}
  </section>
  <h2 class="sectiontitle">備份與匯出</h2>
  <section class="card menu">
    <button class="mi" data-act="export-json"><span>匯出完整備份（JSON）<small>可用於還原 / 換手機</small></span>${ic.right}</button>
    <button class="mi" data-act="csv-monthly"><span>匯出月報表（CSV）<small>Excel 可直接開啟</small></span>${ic.right}</button>
    <button class="mi" data-act="csv-sessions"><span>匯出上課明細（CSV）</span>${ic.right}</button>
    <button class="mi" data-act="csv-packages"><span>匯出方案明細（CSV）</span>${ic.right}</button>
    <button class="mi" data-act="csv-ledger"><span>匯出帳務明細（CSV）<small>每筆現金與收入認列</small></span>${ic.right}</button>
    <label class="mi"><span>匯入備份（JSON）<small>會取代目前所有資料</small></span>${ic.right}<input type="file" id="importFile" accept="application/json,.json" hidden></label>
  </section>
  <h2 class="sectiontitle">範例資料</h2>
  <section class="card menu">
    ${hasDemo ? `<button class="mi" data-act="demo-remove"><span>移除範例資料<small>只刪除標示「範例」的資料</small></span>${ic.right}</button>`
      : `<button class="mi" data-act="demo-load"><span>載入範例資料<small>5 位範例學生，可隨時移除</small></span>${ic.right}</button>`}
  </section>
  <h2 class="sectiontitle">危險區</h2>
  <section class="card menu"><button class="mi danger" data-act="clear-all"><span>清除全部資料</span>${ic.right}</button></section>
  <section class="card about small muted">
    <p><b>計算方式</b></p>
    <p>・每堂認列 = 實付金額 ÷（付費堂數 + 贈送堂數），尾差放在最後一堂，加總必等於實付金額。</p>
    <p>・購課（含無卡分期）全額於購買日列為實收現金與預收款；每次上課將一堂金額轉為實際收入。</p>
    <p>・過期仍有剩餘堂數：剩餘預收款於到期月份「過期認列」。退費：剩餘預收款扣除退費金額的差額於退費月份認列。</p>
    <p>・安裝到 iPhone：用 Safari 開啟 → 分享 → 加入主畫面。</p>
    <p>版本 ${APP_VERSION}</p>
  </section>`;
};

function notFound() { return `${topbar('找不到資料', { backTo: '#/' })}<p class="empty">這筆資料不存在或已刪除</p>`; }

// ---------- 匯出 ----------
function stamp() { return today().replace(/-/g, ''); }
async function exportJSON() {
  const payload = { app: 'coach-ledger', version: 1, exportedAt: new Date().toISOString(), students: data.students, packages: data.packages, sessions: data.sessions };
  download(`教練帳本備份-${stamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  await db.setMeta('lastBackup', nowLocal());
  toast('已匯出備份');
  render();
}
function csvMonthly() {
  const t = today();
  const dates = [...data.packages.flatMap((p) => [p.purchaseDate, p.refund?.date, p.expiryDate]), ...data.sessions.map((s) => s.datetime)].filter(Boolean).sort();
  const first = dates.length ? dates[0].slice(0, 7) : t.slice(0, 7);
  let count = 1; while (E.addMonths(first, count - 1) < t.slice(0, 7)) count++;
  const rows = E.monthlyReport(data, t.slice(0, 7), count, t);
  download(`月報表-${stamp()}.csv`, toCSV([['月份', '實收現金', '購課收款', '退費支出', '實際收入', '上課認列', '過期認列', '退費差額認列', '上課堂數', '學員人次', '期末預收款餘額'],
    ...rows.map((r) => [r.month, r.cashIn, r.cashPurchases, r.cashRefunds, r.income, r.incomeSessions, r.incomeExpiry, r.incomeRefund, r.classes, r.attendances, r.endingDeferred])]), 'text/csv;charset=utf-8');
}
function csvSessions() {
  const L = ledgers();
  const rows = [['日期', '時間', '學生', '方案', '認列金額', '同堂人數', '訓練內容', '重量/組數/次數', '身體狀況', '個人備註', '狀態']];
  for (const s of [...data.sessions].sort((a, b) => (a.datetime < b.datetime ? -1 : 1))) {
    for (const a of s.attendees) {
      const p = a.packageId && byId(data.packages, a.packageId);
      const lg = p && L[p.id];
      const flag = !p ? '未扣方案' : lg.sessionFlags[s.id] ? E.WARNING_LABELS[lg.sessionFlags[s.id]] : '';
      rows.push([E.dateOf(s.datetime), timeOf(s.datetime), studentName(a.studentId), p ? p.name : '', lg ? lg.sessionValues[s.id] || 0 : 0, s.attendees.length, s.sharedNote?.content, s.sharedNote?.sets, s.sharedNote?.condition, a.note, flag]);
    }
  }
  download(`上課明細-${stamp()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
}
function csvPackages() {
  const L = ledgers();
  const rows = [['學生', '方案名稱', '類型', '付款方式', '實付金額', '付費堂數', '贈送堂數', '每堂認列', '購買日', '到期日', '已上堂數', '剩餘堂數', '已認列收入', '預收款餘額', '狀態', '退費金額', '退費日期', '備註']];
  for (const p of [...data.packages].sort((a, b) => (a.purchaseDate < b.purchaseDate ? -1 : 1))) {
    const l = L[p.id];
    rows.push([studentName(p.studentId), p.name, E.PACKAGE_TYPES[p.type], E.PAYMENT_TYPES[p.paymentType], p.price, p.paidSessions, p.bonusSessions || 0, E.unitPriceInfo(p).base, p.purchaseDate, p.expiryDate || '', l.used, l.remaining, l.recognized, l.deferred, E.STATUS_LABELS[l.status], p.refund?.amount ?? '', p.refund?.date ?? '', p.notes]);
  }
  download(`方案明細-${stamp()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
}
function csvLedger() {
  const L = ledgers();
  const ev = [];
  const lbl = { purchase: '購課收款', refund: '退費', session: '上課認列', expiry: '過期認列' };
  for (const p of data.packages) {
    for (const c of L[p.id].cash) ev.push([c.date, lbl[c.type], studentName(p.studentId), p.name, c.amount, '']);
    for (const e of L[p.id].income) ev.push([e.date, e.type === 'refund' ? '退費差額認列' : lbl[e.type], studentName(p.studentId), p.name, '', e.amount]);
  }
  ev.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  download(`帳務明細-${stamp()}.csv`, toCSV([['日期', '類別', '學生', '方案', '現金（收入+ / 支出−）', '認列收入'], ...ev]), 'text/csv;charset=utf-8');
}
async function importJSON(file) {
  try {
    const obj = JSON.parse(await file.text());
    if (!obj || !Array.isArray(obj.students) || !Array.isArray(obj.packages) || !Array.isArray(obj.sessions)) throw new Error('格式不符');
    if (!confirm(`將以備份取代目前所有資料：\n學生 ${obj.students.length} 位、方案 ${obj.packages.length} 個、上課紀錄 ${obj.sessions.length} 筆\n確定匯入？`)) return;
    await db.replaceAll(obj);
    await reload();
    toast('匯入完成', 'ok');
    render();
  } catch (e) {
    toast('匯入失敗：' + e.message, 'err');
  }
}

// ---------- 動作 ----------
const actions = {
  async 'demo-load'() {
    const d = buildDemo(today());
    await db.batch({ put: d });
    await reload();
    toast('已載入範例資料', 'ok');
    render();
  },
  async 'demo-remove'() {
    if (!confirm('移除所有「範例」資料？（你自己輸入的資料不受影響）')) return;
    const dels = {};
    for (const s of db.STORES) dels[s] = data[s].filter((x) => x.demo).map((x) => x.id);
    // 自己的上課紀錄若扣到範例方案，改為未扣方案
    const demoPk = new Set(dels.packages);
    const demoSt = new Set(dels.students);
    const fix = data.sessions.filter((s) => !s.demo && s.attendees.some((a) => demoPk.has(a.packageId) || demoSt.has(a.studentId)))
      .map((s) => ({ ...s, attendees: s.attendees.filter((a) => !demoSt.has(a.studentId)).map((a) => (demoPk.has(a.packageId) ? { ...a, packageId: null } : a)) }));
    await db.batch({ del: dels, put: { sessions: fix.filter((s) => s.attendees.length) } });
    await db.batch({ del: { sessions: fix.filter((s) => !s.attendees.length).map((s) => s.id) } });
    await reload();
    toast('已移除範例資料');
    render();
  },
  'export-json': exportJSON,
  'csv-monthly': csvMonthly,
  'csv-sessions': csvSessions,
  'csv-packages': csvPackages,
  'csv-ledger': csvLedger,
  async persist() { const ok = await navigator.storage.persist(); toast(ok ? '已設定保留資料' : '瀏覽器未同意（加入主畫面後再試）'); render(); },
  async 'clear-all'() {
    if (!confirm('確定清除全部資料？此動作無法復原。\n建議先匯出備份。')) return;
    const ans = prompt('請輸入「清除」兩個字確認');
    if (ans !== '清除') { toast('已取消'); return; }
    await db.replaceAll({});
    await reload();
    toast('已清除全部資料');
    go('#/');
  },
  async 'student-delete'(el) {
    const id = el.dataset.id;
    const n = data.packages.filter((p) => p.studentId === id).length;
    if (!confirm(`刪除「${studentName(id)}」？\n其 ${n} 個方案與上課出席紀錄都會一併刪除，相關收入會重新計算。`)) return;
    const next = E.removeStudent(data, id);
    const removedSess = data.sessions.filter((s) => !next.sessions.some((x) => x.id === s.id)).map((s) => s.id);
    await db.batch({ del: { students: [id], packages: data.packages.filter((p) => p.studentId === id).map((p) => p.id), sessions: removedSess }, put: { sessions: next.sessions.filter((s) => s.attendees.length !== byId(data.sessions, s.id).attendees.length) } });
    await reload();
    toast('已刪除學生');
    go('#/students');
  },
  async 'package-delete'(el) {
    const id = el.dataset.id;
    const p = byId(data.packages, id);
    const used = data.sessions.filter((s) => s.attendees.some((a) => a.packageId === id));
    if (!confirm(`刪除方案「${p.name}」？${used.length ? `\n已有 ${used.length} 筆上課紀錄會改為「未扣方案」（不再認列收入）。` : ''}\n購課現金與收入將重新計算。`)) return;
    await db.batch({ del: { packages: [id] }, put: { sessions: E.detachPackage(used, id) } });
    await reload();
    toast('已刪除方案');
    render();
  },
  async 'refund-cancel'(el) {
    const p = byId(data.packages, el.dataset.id);
    if (!confirm('取消這筆退費，恢復方案？')) return;
    await db.put('packages', { ...p, refund: null });
    await reload();
    toast('已取消退費');
    go(`#/student/${p.studentId}`);
  },
  async 'session-delete'(el) {
    if (!confirm('刪除這筆上課紀錄？相關學生的堂數與收入會重新計算。')) return;
    await db.del('sessions', el.dataset.id);
    const sid = ck && ck.sel[0] && ck.sel[0].studentId;
    ck = null;
    await reload();
    toast('已刪除紀錄');
    go(sid ? `#/student/${sid}` : '#/');
  },
};

// ---------- 事件 ----------
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act],[data-back],[data-month],[data-chip],[data-unsel]');
  if (!el) return;
  if (el.dataset.back !== undefined) { ev.preventDefault(); back(el.dataset.back); return; }
  if (el.dataset.month) {
    const [key, d] = el.dataset.month.split(':');
    const t = today().slice(0, 7);
    if (key === 'home') state.month = E.addMonths(state.month || t, +d);
    else state.reportEnd = E.addMonths(state.reportEnd || t, +d);
    render();
    return;
  }
  if (el.dataset.chip) {
    const id = el.dataset.chip;
    const i = ck.sel.findIndex((x) => x.studentId === id);
    if (i >= 0) ck.sel.splice(i, 1); else addSel(id);
    refreshCheckin();
    return;
  }
  if (el.dataset.unsel) { ck.sel = ck.sel.filter((x) => x.studentId !== el.dataset.unsel); refreshCheckin(); return; }
  const fn = actions[el.dataset.act];
  if (fn) { ev.preventDefault(); fn(el); }
});

document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'search') {
    state.search = t.value;
    const pos = t.selectionStart;
    render().then(() => { const s = document.getElementById('search'); s.focus(); try { s.setSelectionRange(pos, pos); } catch {} });
    return;
  }
  if (t.id === 'ckSearch') { ck.search = t.value; document.getElementById('chips').innerHTML = chipsHTML(); return; }
  const f = t.form;
  if (!f) return;
  if (f.id === 'packageForm') {
    if (t.name === 'price') { const raw = t.value.replace(/[^\d]/g, ''); t.value = raw ? Number(raw).toLocaleString('en-US') : ''; }
    updateUnitPreview(f);
  }
  if (f.id === 'refundForm') {
    if (t.name === 'amount') { const raw = t.value.replace(/[^\d]/g, ''); t.value = raw ? Number(raw).toLocaleString('en-US') : ''; }
    updateRefundPreview(f);
  }
  if (f.id === 'checkinForm') {
    if (['content', 'sets', 'condition'].includes(t.name)) ck.note[t.name] = t.value;
    if (t.dataset.pnote !== undefined) ck.sel[+t.dataset.pnote].note = t.value;
  }
});
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'importFile' && t.files[0]) { importJSON(t.files[0]); t.value = ''; return; }
  if (!t.form || t.form.id !== 'checkinForm') return;
  if (t.name === 'datetime') {
    ck.datetime = t.value;
    for (const a of ck.sel) if (!a.manual) a.packageId = E.defaultPackageFor(data, a.studentId, E.dateOf(ck.datetime), today(), ck.id);
    document.getElementById('selected').innerHTML = selectedHTML();
  }
  if (t.dataset.pkg !== undefined) { const a = ck.sel[+t.dataset.pkg]; a.packageId = t.value || null; a.manual = true; }
});

document.addEventListener('submit', async (ev) => {
  const f = ev.target;
  ev.preventDefault();
  if (f.id === 'studentForm') {
    const id = f.dataset.id || uid();
    const old = byId(data.students, id) || { createdAt: nowLocal() };
    const s = { ...old, id, name: f.name.value.trim(), contact: f.contact.value.trim(), goals: f.goals.value.trim(), health: f.health.value.trim() };
    if (!s.name) return toast('請輸入姓名', 'err');
    await db.put('students', s);
    await reload();
    toast(f.dataset.id ? '已儲存' : '已新增學生', 'ok');
    go(f.dataset.id ? `#/student/${id}` : `#/package-new/${id}`);
  }
  if (f.id === 'packageForm') {
    const id = f.dataset.id || uid();
    const old = byId(data.packages, id) || { createdAt: nowLocal(), refund: null };
    const p = { ...old, id, studentId: f.dataset.student, name: f.name.value.trim(), type: f.type.value, price: parseInt(f.price.value.replace(/[^\d]/g, ''), 10),
      paidSessions: parseInt(f.paidSessions.value, 10), bonusSessions: parseInt(f.bonusSessions.value || '0', 10), paymentType: f.paymentType.value,
      purchaseDate: f.purchaseDate.value, expiryDate: f.expiryDate.value || null, notes: f.notes.value.trim() };
    const errs = E.validatePackage(p);
    const usedNow = E.packageLedger(p, data.sessions, today()).used;
    const attCount = E.attendancesForPackage(data.sessions, id).length;
    if (f.dataset.id && attCount > E.totalUnits(p)) errs.push(`此方案已有 ${attCount} 筆上課紀錄，總堂數不可少於此數`);
    if (errs.length) { document.getElementById('formErrors').innerHTML = errs.map((e) => `<p>${esc(e)}</p>`).join(''); return; }
    void usedNow;
    await db.put('packages', p);
    await reload();
    toast(f.dataset.id ? '方案已更新，數字已重新計算' : '已建立方案', 'ok');
    go(`#/student/${p.studentId}`);
  }
  if (f.id === 'refundForm') {
    const p = byId(data.packages, f.dataset.id);
    const amount = parseInt(f.amount.value.replace(/[^\d]/g, ''), 10);
    const next = { ...p, refund: { amount, date: f.date.value } };
    const errs = Number.isNaN(amount) ? ['請輸入退費金額'] : E.validatePackage(next);
    if (errs.length) { document.getElementById('formErrors').innerHTML = errs.map((e) => `<p>${esc(e)}</p>`).join(''); return; }
    const pv = E.refundPreview(p, data.sessions, today(), amount, f.date.value);
    if (pv.exceeds && !confirm(`退費金額超過剩餘預收款 ${ntd(-pv.refundIncome)}，差額會在退費月份列為負收入。仍要儲存？`)) return;
    await db.put('packages', next);
    await reload();
    toast('已記錄退費，方案已結案', 'ok');
    go(`#/student/${p.studentId}`);
  }
  if (f.id === 'checkinForm') {
    if (!ck.sel.length) return toast('請選擇學生', 'err');
    if (!ck.datetime) return toast('請輸入上課時間', 'err');
    const old = ck.id ? byId(data.sessions, ck.id) : null;
    const s = { ...(old || { createdAt: nowLocal() }), id: ck.id || uid(), datetime: ck.datetime, sharedNote: { ...ck.note },
      attendees: ck.sel.map((a) => ({ studentId: a.studentId, packageId: a.packageId || null, note: ck.sel.length > 1 ? a.note.trim() : '' })) };
    if (old && old.demo) s.demo = true;
    await db.put('sessions', s);
    await reload();
    const L = ledgers();
    const msg = s.attendees.map((a) => `${studentName(a.studentId)}${a.packageId ? ` 剩 ${L[a.packageId].remaining} 堂` : '（未扣方案）'}`).join('、');
    const wasEdit = !!ck.id;
    ck = null;
    toast(`${wasEdit ? '已更新' : '已簽到'} ✓ ${msg}`, 'ok');
    go(wasEdit && s.attendees.length === 1 ? `#/student/${s.attendees[0].studentId}` : '#/');
  }
});

// ---------- 路由 ----------
const TAB_OF = { home: 'home', students: 'students', student: 'students', 'student-new': 'students', 'student-edit': 'students', 'package-new': 'students', 'package-edit': 'students', refund: 'students', checkin: 'checkin', session: 'checkin', reports: 'reports', settings: 'settings' };
state.navCount = -1;
async function render() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const [name, arg] = path.split('/');
  const key = views[name] ? name : 'home';
  if (key !== 'checkin' && key !== 'session') ck = null;
  const html = await views[key](arg, new URLSearchParams(qs || ''));
  $view.innerHTML = html;
  $view.dataset.view = key;
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === TAB_OF[key]));
  document.body.classList.toggle('has-savebar', key === 'checkin' || key === 'session');
  if (key === 'package-new' || key === 'package-edit') updateUnitPreview(document.getElementById('packageForm'));
  if (key === 'refund') updateRefundPreview(document.getElementById('refundForm'));
}
window.addEventListener('hashchange', () => { state.navCount++; render().then(() => window.scrollTo(0, 0)); });

(async function start() {
  try {
    await reload();
  } catch (e) {
    $view.innerHTML = `<p class="empty">無法開啟本機資料庫：${esc(e.message)}<br>（Safari 無痕模式可能不支援）</p>`;
    return;
  }
  state.navCount = 0;
  await render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  window.__appReady = true;
})();
