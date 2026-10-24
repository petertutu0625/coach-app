// 教練帳本 — 會計引擎（純函式，無 DOM / IndexedDB 依賴，可在 Node 測試）
// 所有金額皆為「整數新台幣元」。所有日期為本地日期字串 'YYYY-MM-DD'，
// 上課時間為 'YYYY-MM-DDTHH:mm'。字串比較即可排序，避免時區問題。
// 原則：所有數字皆由原始紀錄推導，不儲存任何累計值。

export const PAYMENT_TYPES = { full: '一次付清', installment: '無卡分期' };
export const PACKAGE_TYPES = { '1on1': '一對一', '1on2': '一對二', group: '團體' };
export const STATUS_LABELS = { active: '使用中', completed: '已上完', expired: '已過期', refunded: '已退費' };
export const WARNING_LABELS = {
  afterRefund: '退費後仍有上課紀錄（未認列）',
  afterExpiry: '過期後仍有上課紀錄（未認列）',
  overUsed: '上課堂數超過方案總堂數（未認列）',
  beforePurchase: '上課日期早於購買日期',
  refundExceeds: '退費金額超過剩餘預收款（差額為負收入）',
};

export const dateOf = (dt) => String(dt || '').slice(0, 10);
export const monthOf = (d) => String(d || '').slice(0, 7);

export function totalUnits(pkg) {
  return Math.max(0, (Number(pkg.paidSessions) || 0) + (Number(pkg.bonusSessions) || 0));
}

/** 第 index 堂（0 起算）的認列金額；餘數放在最後一堂，總和必等於售價。 */
export function sessionValue(pkg, index) {
  const n = totalUnits(pkg);
  const price = Math.round(Number(pkg.price) || 0);
  if (n <= 0 || index < 0 || index >= n) return 0;
  const base = Math.floor(price / n);
  return index === n - 1 ? price - base * (n - 1) : base;
}

/** 一般每堂單價（顯示用）與最後一堂金額 */
export function unitPriceInfo(pkg) {
  const n = totalUnits(pkg);
  if (n <= 0) return { base: 0, last: 0, n: 0 };
  return { base: sessionValue(pkg, 0), last: sessionValue(pkg, n - 1), n };
}

/** 從上課紀錄中取出屬於某方案的出席（排序：時間、紀錄 id） */
export function attendancesForPackage(sessions, packageId) {
  const out = [];
  for (const s of sessions) {
    for (const a of s.attendees || []) {
      if (a.packageId === packageId) {
        out.push({ sessionId: s.id, studentId: a.studentId, datetime: s.datetime, date: dateOf(s.datetime) });
      }
    }
  }
  out.sort((x, y) => (x.datetime < y.datetime ? -1 : x.datetime > y.datetime ? 1 : String(x.sessionId).localeCompare(String(y.sessionId))));
  return out;
}

/**
 * 計算單一方案的完整帳務。
 * @param pkg 方案
 * @param sessions 全部上課紀錄
 * @param asOf 今天 'YYYY-MM-DD'（判斷是否已過期）
 */
export function packageLedger(pkg, sessions, asOf) {
  const n = totalUnits(pkg);
  const price = Math.round(Number(pkg.price) || 0);
  const refund = pkg.refund && pkg.refund.date ? { amount: Math.round(Number(pkg.refund.amount) || 0), date: pkg.refund.date } : null;
  const expiry = pkg.expiryDate || null;
  const atts = attendancesForPackage(sessions, pkg.id);

  const income = [];   // { type:'session'|'expiry'|'refund', date, amount, sessionId? }
  const cash = [{ type: 'purchase', date: pkg.purchaseDate, amount: price, packageId: pkg.id }];
  const warnings = [];
  const sessionValues = {}; // sessionId -> 認列金額
  const sessionFlags = {};  // sessionId -> warning key
  let used = 0;
  let recognized = 0;

  for (const a of atts) {
    let flag = null;
    if (refund && a.date > refund.date) flag = 'afterRefund';
    else if (expiry && a.date > expiry) flag = 'afterExpiry';
    else if (used >= n) flag = 'overUsed';
    if (flag) {
      sessionValues[a.sessionId] = 0;
      sessionFlags[a.sessionId] = flag;
      if (!warnings.includes(flag)) warnings.push(flag);
      continue;
    }
    if (pkg.purchaseDate && a.date < pkg.purchaseDate && !warnings.includes('beforePurchase')) warnings.push('beforePurchase');
    const v = sessionValue(pkg, used);
    used += 1;
    recognized += v;
    sessionValues[a.sessionId] = v;
    income.push({ type: 'session', date: a.date, amount: v, sessionId: a.sessionId, packageId: pkg.id });
  }

  let status = 'active';
  // 過期認列：過期日已過（asOf > expiry），且在退費之前過期
  const expiredPassed = !!(expiry && asOf && asOf > expiry);
  if (expiredPassed && (!refund || refund.date > expiry)) {
    const rest = price - recognized;
    if (rest !== 0) {
      income.push({ type: 'expiry', date: expiry, amount: rest, packageId: pkg.id });
      recognized += rest;
    }
    status = 'expired';
  }

  let refundIncome = 0;
  if (refund) {
    const deferredAtRefund = price - recognized;
    refundIncome = deferredAtRefund - refund.amount;
    if (refundIncome < 0) warnings.push('refundExceeds');
    if (refundIncome !== 0) income.push({ type: 'refund', date: refund.date, amount: refundIncome, packageId: pkg.id });
    recognized += refundIncome;
    cash.push({ type: 'refund', date: refund.date, amount: -refund.amount, packageId: pkg.id });
    status = 'refunded';
  } else if (status === 'active' && used >= n) {
    status = 'completed';
  }

  const cashTotal = cash.reduce((s, c) => s + c.amount, 0);
  const remaining = Math.max(0, n - used);
  return {
    packageId: pkg.id,
    studentId: pkg.studentId,
    total: n,
    used,
    remaining,
    available: status === 'active' && remaining > 0,
    status,
    income,
    cash,
    recognized,
    deferred: cashTotal - recognized, // 目前（含所有紀錄）的預收款餘額
    refundIncome,
    warnings,
    sessionValues,
    sessionFlags,
  };
}

/** 計算所有方案帳務 */
export function computeAll(data, asOf) {
  const sessions = data.sessions || [];
  const ledgers = {};
  for (const p of data.packages || []) ledgers[p.id] = packageLedger(p, sessions, asOf);
  return ledgers;
}

function sumUntil(events, endDate) {
  let s = 0;
  for (const e of events) if (e.date <= endDate) s += e.amount;
  return s;
}

export function lastDayOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 0).getDate();
  return `${ym}-${String(d).padStart(2, '0')}`;
}

export function addMonths(ym, k) {
  let [y, m] = ym.split('-').map(Number);
  m += k;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** 月份摘要：實收現金、實際收入（含明細）、上課堂數、人次、期末預收款餘額 */
export function monthSummary(data, ym, asOf, ledgers = computeAll(data, asOf)) {
  let cashIn = 0, cashPurchases = 0, cashRefunds = 0;
  let income = 0, incomeSessions = 0, incomeExpiry = 0, incomeRefund = 0;
  const allCash = [], allIncome = [];
  for (const L of Object.values(ledgers)) {
    for (const c of L.cash) {
      allCash.push(c);
      if (monthOf(c.date) === ym) {
        cashIn += c.amount;
        if (c.type === 'purchase') cashPurchases += c.amount; else cashRefunds += -c.amount;
      }
    }
    for (const e of L.income) {
      allIncome.push(e);
      if (monthOf(e.date) === ym) {
        income += e.amount;
        if (e.type === 'session') incomeSessions += e.amount;
        else if (e.type === 'expiry') incomeExpiry += e.amount;
        else incomeRefund += e.amount;
      }
    }
  }
  let classes = 0, attendances = 0;
  for (const s of data.sessions || []) {
    if (monthOf(s.datetime) === ym) { classes += 1; attendances += (s.attendees || []).length; }
  }
  const end = lastDayOfMonth(ym);
  const endingDeferred = sumUntil(allCash, end) - sumUntil(allIncome, end);
  return { month: ym, cashIn, cashPurchases, cashRefunds, income, incomeSessions, incomeExpiry, incomeRefund, classes, attendances, endingDeferred };
}

/** 最近 count 個月（含 endYm），由舊到新 */
export function monthlyReport(data, endYm, count, asOf) {
  const ledgers = computeAll(data, asOf);
  const rows = [];
  for (let i = count - 1; i >= 0; i--) rows.push(monthSummary(data, addMonths(endYm, -i), asOf, ledgers));
  return rows;
}

export function yearTotals(data, year, asOf) {
  const ledgers = computeAll(data, asOf);
  const t = { year, cashIn: 0, income: 0, classes: 0, attendances: 0, endingDeferred: 0 };
  for (let m = 1; m <= 12; m++) {
    const r = monthSummary(data, `${year}-${String(m).padStart(2, '0')}`, asOf, ledgers);
    t.cashIn += r.cashIn; t.income += r.income; t.classes += r.classes; t.attendances += r.attendances;
    if (m === 12) t.endingDeferred = r.endingDeferred;
  }
  return t;
}

function comparePkgAge(a, b) {
  if (a.purchaseDate !== b.purchaseDate) return a.purchaseDate < b.purchaseDate ? -1 : 1;
  return String(a.createdAt || a.id).localeCompare(String(b.createdAt || b.id));
}

/**
 * 某學生在某日期可用的方案（未退費、未過期、仍有剩餘堂數），由舊到新。
 * excludeSessionId：編輯紀錄時，不把該紀錄本身算作已使用。
 */
export function availablePackages(data, studentId, date, asOf, excludeSessionId = null) {
  const sessions = excludeSessionId ? (data.sessions || []).filter((s) => s.id !== excludeSessionId) : data.sessions || [];
  return (data.packages || [])
    .filter((p) => p.studentId === studentId)
    .filter((p) => !p.refund || !p.refund.date || p.refund.date >= date)
    .filter((p) => !p.expiryDate || p.expiryDate >= date)
    .map((p) => ({ pkg: p, ledger: packageLedger(p, sessions, asOf) }))
    .filter(({ pkg, ledger }) => ledger.remaining > 0 && !(pkg.refund && pkg.refund.date))
    .sort((x, y) => comparePkgAge(x.pkg, y.pkg));
}

/** 預設扣抵：最舊的可用方案 */
export function defaultPackageFor(data, studentId, date, asOf, excludeSessionId = null) {
  const list = availablePackages(data, studentId, date, asOf, excludeSessionId);
  return list.length ? list[0].pkg.id : null;
}

/** 學生剩餘可用堂數（所有可用方案加總） */
export function studentRemaining(data, studentId, asOf, ledgers = computeAll(data, asOf)) {
  let r = 0;
  for (const p of data.packages || []) {
    if (p.studentId !== studentId) continue;
    const L = ledgers[p.id];
    if (L && L.available) r += L.remaining;
  }
  return r;
}

export function addDays(d, k) {
  const [y, m, dd] = d.split('-').map(Number);
  const x = new Date(y, m - 1, dd + k);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** 首頁提醒：續約提醒（剩餘 ≤ threshold 堂）與 14 天內到期 */
export function alerts(data, asOf, { threshold = 3, days = 14, recentDays = 60 } = {}) {
  const ledgers = computeAll(data, asOf);
  const renew = [];
  const recentCut = addDays(asOf, -recentDays);
  for (const st of data.students || []) {
    const pkgs = (data.packages || []).filter((p) => p.studentId === st.id);
    if (!pkgs.length) continue;
    const hasActive = pkgs.some((p) => ledgers[p.id].available);
    const lastSession = (data.sessions || [])
      .filter((s) => (s.attendees || []).some((a) => a.studentId === st.id))
      .map((s) => dateOf(s.datetime)).sort().pop();
    if (!hasActive && !(lastSession && lastSession >= recentCut)) continue; // 久未上課的舊學生不提醒
    const rem = studentRemaining(data, st.id, asOf, ledgers);
    if (rem <= threshold) renew.push({ student: st, remaining: rem });
  }
  renew.sort((a, b) => a.remaining - b.remaining);
  const until = addDays(asOf, days);
  const expiring = [];
  for (const p of data.packages || []) {
    const L = ledgers[p.id];
    if (!L.available || !p.expiryDate) continue;
    if (p.expiryDate >= asOf && p.expiryDate <= until) {
      expiring.push({ pkg: p, ledger: L, student: (data.students || []).find((s) => s.id === p.studentId), daysLeft: diffDays(asOf, p.expiryDate) });
    }
  }
  expiring.sort((a, b) => (a.pkg.expiryDate < b.pkg.expiryDate ? -1 : 1));
  return { renew, expiring };
}

export function diffDays(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** 退費試算（不寫入）：給表單即時預覽 */
export function refundPreview(pkg, sessions, asOf, amount, date) {
  const L = packageLedger({ ...pkg, refund: { amount, date } }, sessions, asOf);
  const deferredAtRefund = L.refundIncome + Math.round(Number(amount) || 0);
  return { deferredAtRefund, refundIncome: L.refundIncome, exceeds: L.refundIncome < 0 };
}

/** 方案欄位驗證，回傳錯誤訊息陣列 */
export function validatePackage(p) {
  const e = [];
  if (!p.studentId) e.push('請選擇學生');
  if (!p.name || !String(p.name).trim()) e.push('請輸入方案名稱');
  if (!Number.isInteger(Number(p.price)) || Number(p.price) < 0) e.push('金額需為 0 以上的整數');
  if (!Number.isInteger(Number(p.paidSessions)) || Number(p.paidSessions) < 0) e.push('付費堂數需為 0 以上的整數');
  if (!Number.isInteger(Number(p.bonusSessions || 0)) || Number(p.bonusSessions || 0) < 0) e.push('贈送堂數需為 0 以上的整數');
  if (totalUnits(p) <= 0) e.push('總堂數需大於 0');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.purchaseDate || '')) e.push('請輸入購買日期');
  if (p.expiryDate && p.expiryDate < p.purchaseDate) e.push('到期日不可早於購買日期');
  if (p.refund && p.refund.date && p.refund.date < p.purchaseDate) e.push('退費日期不可早於購買日期');
  if (p.refund && (!Number.isInteger(Number(p.refund.amount)) || Number(p.refund.amount) < 0)) e.push('退費金額需為 0 以上的整數');
  return e;
}

/** 刪除方案後的上課紀錄：引用該方案的出席改為「未扣方案」 */
export function detachPackage(sessions, packageId) {
  return sessions.map((s) => ({ ...s, attendees: s.attendees.map((a) => (a.packageId === packageId ? { ...a, packageId: null } : a)) }));
}

/** 刪除學生：移除其方案與出席；無人出席的紀錄一併刪除 */
export function removeStudent(data, studentId) {
  return {
    students: data.students.filter((s) => s.id !== studentId),
    packages: data.packages.filter((p) => p.studentId !== studentId),
    sessions: data.sessions
      .map((s) => ({ ...s, attendees: s.attendees.filter((a) => a.studentId !== studentId) }))
      .filter((s) => s.attendees.length > 0),
  };
}
