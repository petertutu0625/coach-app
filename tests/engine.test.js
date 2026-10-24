import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { ntd, toCSV } from '../js/format.js';

const ASOF = '2026-10-24';
const pkg = (o) => ({ id: 'p1', studentId: 's1', name: '10堂', price: 10000, paidSessions: 10, bonusSessions: 0, purchaseDate: '2026-01-05', paymentType: 'full', expiryDate: null, type: '1on1', createdAt: '1', ...o });
let sid = 0;
const ses = (datetime, attendees, o = {}) => ({ id: o.id || `x${++sid}`, datetime, attendees, sharedNote: {}, ...o });
const att = (studentId, packageId) => ({ studentId, packageId, note: '' });
const sum = (arr) => arr.reduce((s, e) => s + e.amount, 0);

test('簡單方案：每堂認列、剩餘堂數、預收款', () => {
  const p = pkg();
  const sessions = [ses('2026-01-10T10:00', [att('s1', 'p1')]), ses('2026-02-03T10:00', [att('s1', 'p1')]), ses('2026-02-20T10:00', [att('s1', 'p1')])];
  const L = E.packageLedger(p, sessions, ASOF);
  assert.equal(L.used, 3); assert.equal(L.remaining, 7); assert.equal(L.recognized, 3000); assert.equal(L.deferred, 7000);
  assert.equal(L.status, 'active');
  const data = { students: [{ id: 's1' }], packages: [p], sessions };
  const jan = E.monthSummary(data, '2026-01', ASOF), feb = E.monthSummary(data, '2026-02', ASOF);
  assert.equal(jan.cashIn, 10000); assert.equal(jan.income, 1000); assert.equal(jan.endingDeferred, 9000); assert.equal(jan.classes, 1);
  assert.equal(feb.cashIn, 0); assert.equal(feb.income, 2000); assert.equal(feb.endingDeferred, 7000); assert.equal(feb.classes, 2);
});

test('贈送堂數與尾差：總認列等於售價，餘數放最後一堂', () => {
  const p = pkg({ price: 10000, paidSessions: 10, bonusSessions: 2 }); // 12 堂, 833 * 11 + 837
  assert.equal(E.sessionValue(p, 0), 833);
  assert.equal(E.sessionValue(p, 11), 10000 - 833 * 11);
  let s = 0; for (let i = 0; i < 12; i++) s += E.sessionValue(p, i); assert.equal(s, 10000);
  const sessions = Array.from({ length: 12 }, (_, i) => ses(`2026-03-${String(i + 1).padStart(2, '0')}T09:00`, [att('s1', 'p1')]));
  const L = E.packageLedger(p, sessions, ASOF);
  assert.equal(L.recognized, 10000); assert.equal(L.deferred, 0); assert.equal(L.status, 'completed');
  assert.equal(L.sessionValues[sessions[11].id], 837);
  // 多種價格/堂數組合總和皆精確
  for (const price of [1, 999, 12345, 36000, 100003]) for (let n = 1; n <= 37; n++) {
    const q = pkg({ price, paidSessions: n, bonusSessions: n % 3 });
    let t = 0; for (let i = 0; i < E.totalUnits(q); i++) t += E.sessionValue(q, i); assert.equal(t, price);
  }
});

test('過期認列：剩餘預收款於到期月份認列', () => {
  const p = pkg({ price: 9000, paidSessions: 9, expiryDate: '2026-06-30' });
  const sessions = [ses('2026-05-01T10:00', [att('s1', 'p1')]), ses('2026-07-02T10:00', [att('s1', 'p1')])];
  const data = { students: [{ id: 's1' }], packages: [p], sessions };
  const L = E.packageLedger(p, sessions, ASOF);
  assert.equal(L.status, 'expired');
  assert.equal(L.used, 1);
  assert.deepEqual(L.income.find((e) => e.type === 'expiry'), { type: 'expiry', date: '2026-06-30', amount: 8000, packageId: 'p1' });
  assert.ok(L.warnings.includes('afterExpiry')); // 7/2 那堂不認列
  assert.equal(L.deferred, 0);
  assert.equal(E.monthSummary(data, '2026-06', ASOF).incomeExpiry, 8000);
  assert.equal(E.monthSummary(data, '2026-05', ASOF).endingDeferred, 8000);
  assert.equal(E.monthSummary(data, '2026-06', ASOF).endingDeferred, 0);
  // 尚未過期（asOf 在到期日或之前）→ 不認列
  const L2 = E.packageLedger(p, sessions.slice(0, 1), '2026-06-30');
  assert.equal(L2.status, 'active'); assert.equal(L2.deferred, 8000);
});

test('部分退費：差額於退費月份認列；已認列的堂數保留', () => {
  const p = pkg({ price: 10000, paidSessions: 10, refund: { amount: 5000, date: '2026-04-15' } });
  const sessions = [1, 2, 3].map((d) => ses(`2026-03-0${d}T10:00`, [att('s1', 'p1')]));
  const data = { students: [{ id: 's1' }], packages: [p], sessions };
  const L = E.packageLedger(p, sessions, ASOF);
  assert.equal(L.status, 'refunded'); assert.equal(L.available, false);
  assert.equal(L.refundIncome, 2000); // 剩餘預收 7000 - 退 5000
  assert.equal(L.deferred, 0);
  const apr = E.monthSummary(data, '2026-04', ASOF);
  assert.equal(apr.cashIn, -5000); assert.equal(apr.income, 2000); assert.equal(apr.endingDeferred, 0);
  assert.equal(E.monthSummary(data, '2026-03', ASOF).income, 3000);
  // 退費超過剩餘預收款 → 警示 + 負收入
  const p2 = pkg({ refund: { amount: 8000, date: '2026-04-15' } });
  const L2 = E.packageLedger(p2, sessions, ASOF);
  assert.ok(L2.warnings.includes('refundExceeds')); assert.equal(L2.refundIncome, -1000); assert.equal(L2.deferred, 0);
  const pv = E.refundPreview(pkg(), sessions, ASOF, 8000, '2026-04-15');
  assert.equal(pv.deferredAtRefund, 7000); assert.equal(pv.exceeds, true);
  // 全部 0 元退費 → 剩餘全認列
  assert.equal(E.packageLedger(pkg({ refund: { amount: 0, date: '2026-04-15' } }), sessions, ASOF).refundIncome, 7000);
});

test('續約：預設扣最舊的可用方案，用完自動換下一個；可手動指定', () => {
  const old = pkg({ id: 'old', paidSessions: 2, price: 2000, purchaseDate: '2026-01-01' });
  const neu = pkg({ id: 'new', paidSessions: 10, price: 12000, purchaseDate: '2026-02-01' });
  const expd = pkg({ id: 'exp', paidSessions: 5, price: 5000, purchaseDate: '2025-06-01', expiryDate: '2025-12-31' });
  const data = { students: [{ id: 's1' }], packages: [neu, old, expd], sessions: [] };
  assert.equal(E.defaultPackageFor(data, 's1', '2026-03-01', ASOF), 'old');
  data.sessions.push(ses('2026-03-01T10:00', [att('s1', 'old')]), ses('2026-03-02T10:00', [att('s1', 'old')]));
  assert.equal(E.defaultPackageFor(data, 's1', '2026-03-03', ASOF), 'new');
  assert.equal(E.studentRemaining(data, 's1', ASOF), 10);
  // 編輯某筆時排除自身 → 舊方案仍有一堂
  assert.equal(E.defaultPackageFor(data, 's1', '2026-03-03', ASOF, data.sessions[1].id), 'old');
  // 手動指定新方案
  data.sessions.push(ses('2026-03-04T10:00', [att('s1', 'new')]));
  assert.equal(E.packageLedger(neu, data.sessions, ASOF).used, 1);
  assert.equal(E.availablePackages(data, 's1', '2026-03-05', ASOF).length, 1);
});

test('團體 / 一對二：一筆紀錄多位學生，各扣各的方案與單價', () => {
  const a = pkg({ id: 'pa', studentId: 'sa', price: 8000, paidSessions: 10, type: '1on2' });
  const b = pkg({ id: 'pb', studentId: 'sb', price: 6000, paidSessions: 8, bonusSessions: 1, type: '1on2' });
  const s = ses('2026-05-05T19:00', [{ studentId: 'sa', packageId: 'pa', note: '膝蓋不適' }, { studentId: 'sb', packageId: 'pb', note: '' }], { sharedNote: { content: '深蹲' } });
  const data = { students: [{ id: 'sa' }, { id: 'sb' }], packages: [a, b], sessions: [s] };
  const m = E.monthSummary(data, '2026-05', ASOF);
  assert.equal(m.classes, 1); assert.equal(m.attendances, 2);
  assert.equal(m.income, 800 + 666);
  assert.equal(E.packageLedger(a, data.sessions, ASOF).remaining, 9);
  assert.equal(E.packageLedger(b, data.sessions, ASOF).remaining, 8);
});

test('編輯 / 刪除後重新計算（全由紀錄推導）', () => {
  const p = pkg({ price: 1000, paidSessions: 3 }); // 333, 333, 334
  const s1 = ses('2026-02-01T10:00', [att('s1', 'p1')], { id: 'a' });
  const s2 = ses('2026-03-01T10:00', [att('s1', 'p1')], { id: 'b' });
  const s3 = ses('2026-04-01T10:00', [att('s1', 'p1')], { id: 'c' });
  let data = { students: [{ id: 's1' }], packages: [p], sessions: [s1, s2, s3] };
  assert.equal(E.monthSummary(data, '2026-04', ASOF).income, 334);
  // 把第一堂改到 5 月 → 尾差移到 5 月
  data = { ...data, sessions: [{ ...s1, datetime: '2026-05-01T10:00' }, s2, s3] };
  assert.equal(E.monthSummary(data, '2026-05', ASOF).income, 334);
  assert.equal(E.monthSummary(data, '2026-04', ASOF).income, 333);
  assert.equal(E.monthSummary(data, '2026-02', ASOF).income, 0);
  // 刪除一堂 → 剩餘 +1、預收款回增
  data = { ...data, sessions: data.sessions.filter((s) => s.id !== 'b') };
  const L = E.packageLedger(p, data.sessions, ASOF);
  assert.equal(L.remaining, 1); assert.equal(L.deferred, 334);
  // 修改方案價格 → 全部重算
  const p2 = { ...p, price: 1500 };
  data = { ...data, packages: [p2] };
  assert.equal(E.packageLedger(p2, data.sessions, ASOF).recognized, 1000);
  // 刪除方案 → 出席改為未扣方案，不再認列
  data = { ...data, packages: [], sessions: E.detachPackage(data.sessions, 'p1') };
  assert.equal(E.monthSummary(data, '2026-04', ASOF).income, 0);
  assert.equal(E.monthSummary(data, '2026-04', ASOF).classes, 1);
  // 刪除學生
  const d2 = E.removeStudent({ students: [{ id: 's1' }, { id: 's2' }], packages: [p], sessions: [ses('2026-01-01T10:00', [att('s1', 'p1'), att('s2', null)])] }, 's1');
  assert.equal(d2.packages.length, 0); assert.equal(d2.sessions[0].attendees.length, 1);
});

test('超堂 / 不變式：累計現金 − 累計收入 = 預收款餘額', () => {
  const p = pkg({ price: 3000, paidSessions: 2, bonusSessions: 1 });
  const sessions = [1, 2, 3, 4].map((d) => ses(`2026-06-0${d}T10:00`, [att('s1', 'p1')]));
  const L = E.packageLedger(p, sessions, ASOF);
  assert.equal(L.used, 3); assert.ok(L.warnings.includes('overUsed')); assert.equal(L.recognized, 3000);
  assert.equal(sum(L.cash) - sum(L.income), L.deferred);
});

test('提醒：剩餘 ≤3 堂與 14 天內到期', () => {
  const p = pkg({ paidSessions: 4, expiryDate: '2026-11-01' });
  const q = pkg({ id: 'p2', studentId: 's2', paidSessions: 20, expiryDate: '2027-06-01' });
  const data = { students: [{ id: 's1', name: 'A' }, { id: 's2', name: 'B' }], packages: [p, q], sessions: [ses('2026-10-01T10:00', [att('s1', 'p1')])] };
  const al = E.alerts(data, ASOF);
  assert.deepEqual(al.renew.map((r) => [r.student.id, r.remaining]), [['s1', 3]]);
  assert.deepEqual(al.expiring.map((x) => [x.pkg.id, x.daysLeft]), [['p1', 8]]);
});

test('年度合計與 12 個月報表', () => {
  const data = { students: [{ id: 's1' }], packages: [pkg({ purchaseDate: '2025-12-20' })], sessions: [ses('2026-01-03T10:00', [att('s1', 'p1')])] };
  const rows = E.monthlyReport(data, '2026-10', 12, ASOF);
  assert.equal(rows.length, 12); assert.equal(rows[0].month, '2025-11'); assert.equal(rows[11].month, '2026-10');
  assert.equal(rows[1].cashIn, 10000); assert.equal(rows[2].income, 1000); assert.equal(rows[11].endingDeferred, 9000);
  const y = E.yearTotals(data, 2026, ASOF); assert.equal(y.income, 1000); assert.equal(y.cashIn, 0); assert.equal(y.endingDeferred, 9000);
});

test('格式：NT$ 千分位、CSV BOM 與跳脫', () => {
  assert.equal(ntd(1234567), 'NT$1,234,567'); assert.equal(ntd(-500), '-NT$500'); assert.equal(ntd(0), 'NT$0');
  const c = toCSV([['名稱', '備註'], ['A', '含,逗號 "引號"']]);
  assert.ok(c.startsWith('\uFEFF')); assert.ok(c.includes('"含,逗號 ""引號"""'));
});
