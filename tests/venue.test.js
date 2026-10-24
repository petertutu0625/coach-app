import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';

const ASOF = '2026-10-24';
const pkg = (o) => ({ id: 'p1', studentId: 's1', name: '10堂', price: 10000, paidSessions: 10, bonusSessions: 0, purchaseDate: '2026-01-05', paymentType: 'full', expiryDate: null, type: '1on1', createdAt: '1', ...o });
const att = (studentId, packageId) => ({ studentId, packageId, note: '' });
const vA = { id: 'va', name: '大安工作室', fee: 400, mode: 'perClass' };
const vB = { id: 'vb', name: '信義運動中心', fee: 150, mode: 'perPerson' };

test('場地費：每堂固定', () => {
  assert.equal(E.venueFeeFor(vA, 1), 400);
  assert.equal(E.venueFeeFor(vA, 3), 400);
  const data = { students: [{ id: 's1' }], packages: [pkg()], venues: [vA],
    sessions: [{ id: 'a', datetime: '2026-03-01T10:00', attendees: [att('s1', 'p1')], venueId: 'va', venueFee: E.venueFeeFor(vA, 1) }] };
  const m = E.monthSummary(data, '2026-03', ASOF);
  assert.equal(m.income, 1000); assert.equal(m.venueFees, 400); assert.equal(m.netIncome, 600);
  assert.deepEqual(m.feesByVenue, { va: { fee: 400, classes: 1 } });
});

test('場地費：團體課每人計費 = 單價 × 人數（整堂一筆）', () => {
  assert.equal(E.venueFeeFor(vB, 3), 450);
  assert.equal(E.venueFeeFor(null, 3), 0);
  const a = pkg({ id: 'pa', studentId: 'sa', price: 8000, paidSessions: 10 });
  const b = pkg({ id: 'pb', studentId: 'sb', price: 6000, paidSessions: 10 });
  const c = pkg({ id: 'pc', studentId: 'sc', price: 5000, paidSessions: 10 });
  const s = { id: 'g', datetime: '2026-05-05T19:00', attendees: [att('sa', 'pa'), att('sb', 'pb'), att('sc', 'pc')], venueId: 'vb', venueFee: E.venueFeeFor(vB, 3) };
  const data = { students: [], packages: [a, b, c], venues: [vB], sessions: [s] };
  const m = E.monthSummary(data, '2026-05', ASOF);
  assert.equal(m.income, 800 + 600 + 500); assert.equal(m.venueFees, 450); assert.equal(m.netIncome, 1450);
  assert.equal(m.classes, 1);
  assert.deepEqual(E.splitFee(450, 3), [150, 150, 150]);
  assert.deepEqual(E.splitFee(100, 3), [34, 33, 33]);
  assert.equal(E.splitFee(100, 3).reduce((x, y) => x + y, 0), 100);
});

test('場地費：編輯後重新計算（改金額 / 改日期 / 改為無場地）', () => {
  const s = { id: 'a', datetime: '2026-03-01T10:00', attendees: [att('s1', 'p1')], venueId: 'va', venueFee: 400 };
  let data = { students: [], packages: [pkg()], venues: [vA], sessions: [s] };
  assert.equal(E.monthSummary(data, '2026-03', ASOF).venueFees, 400);
  data = { ...data, sessions: [{ ...s, venueFee: 250 }] };
  assert.equal(E.monthSummary(data, '2026-03', ASOF).netIncome, 750);
  data = { ...data, sessions: [{ ...s, venueFee: 250, datetime: '2026-04-02T10:00' }] };
  assert.equal(E.monthSummary(data, '2026-03', ASOF).venueFees, 0);
  assert.equal(E.monthSummary(data, '2026-04', ASOF).venueFees, 250);
  data = { ...data, sessions: [{ ...s, venueId: null, venueFee: 0 }] };
  const m = E.monthSummary(data, '2026-03', ASOF);
  assert.equal(m.venueFees, 0); assert.equal(m.netIncome, 1000); assert.deepEqual(m.feesByVenue, {});
});

test('月淨收入與年度合計（含過期認列、退費差額；場地費不影響預收款）', () => {
  const p = pkg({ price: 9000, paidSessions: 9, expiryDate: '2026-06-30' });
  const data = { students: [], packages: [p], venues: [vA], sessions: [
    { id: 'a', datetime: '2026-06-01T10:00', attendees: [att('s1', 'p1')], venueId: 'va', venueFee: 400 },
    { id: 'b', datetime: '2026-06-08T10:00', attendees: [att('s1', 'p1')], venueId: 'va', venueFee: 400 },
  ] };
  const m = E.monthSummary(data, '2026-06', ASOF);
  assert.equal(m.income, 9000); // 2 堂 2000 + 過期認列 7000
  assert.equal(m.venueFees, 800); assert.equal(m.netIncome, 8200);
  assert.equal(m.endingDeferred, 0);
  const may = E.monthSummary(data, '2026-01', ASOF);
  assert.equal(may.endingDeferred, 9000); assert.equal(may.cashIn, 9000);
  const y = E.yearTotals(data, 2026, ASOF);
  assert.equal(y.income, 9000); assert.equal(y.venueFees, 800); assert.equal(y.netIncome, 8200);
  const rows = E.monthlyReport(data, '2026-06', 6, ASOF);
  assert.deepEqual(rows.map((r) => r.netIncome), [0, 0, 0, 0, 0, 8200]);
});

test('舊資料相容：沒有 venueId / venueFee 的紀錄 → 場地費 0', () => {
  const data = { students: [], packages: [pkg()], sessions: [
    { id: 'old', datetime: '2026-02-01T10:00', attendees: [att('s1', 'p1')], sharedNote: {} },
    { id: 'bad', datetime: '2026-02-02T10:00', attendees: [att('s1', 'p1')], venueFee: 'abc' },
    { id: 'neg', datetime: '2026-02-03T10:00', attendees: [att('s1', 'p1')], venueFee: -50 },
  ] }; // 注意：沒有 venues 陣列
  const m = E.monthSummary(data, '2026-02', ASOF);
  assert.equal(m.venueFees, 0); assert.equal(m.netIncome, m.income); assert.equal(m.income, 3000);
  assert.equal(E.sessionFee({}), 0); assert.equal(E.sessionFee(undefined), 0);
  assert.equal(E.yearTotals(data, 2026, ASOF).venueFees, 0);
});

test('匯入舊格式（v1）JSON 備份', () => {
  const v1 = JSON.parse(JSON.stringify({
    app: 'coach-ledger', version: 1, exportedAt: '2026-10-01T00:00:00.000Z',
    students: [{ id: 's1', name: '林小美', contact: '', goals: '', health: '', createdAt: '2026-01-01T09:00' }],
    packages: [pkg()],
    sessions: [{ id: 'a', datetime: '2026-03-01T10:00', attendees: [att('s1', 'p1')], sharedNote: { content: '深蹲', sets: '', condition: '' }, createdAt: '2026-03-01T10:00' }],
  }));
  const d = E.normalizeBackup(v1);
  assert.deepEqual(d.venues, []);
  assert.equal(d.students.length, 1); assert.equal(d.sessions[0].sharedNote.content, '深蹲');
  const m = E.monthSummary(d, '2026-03', ASOF);
  assert.equal(m.income, 1000); assert.equal(m.venueFees, 0); assert.equal(m.netIncome, 1000);
  // v2 備份保留場地
  const v2 = E.normalizeBackup({ ...v1, version: 2, venues: [vA], sessions: [{ ...v1.sessions[0], venueId: 'va', venueFee: 400 }] });
  assert.equal(v2.venues.length, 1); assert.equal(E.monthSummary(v2, '2026-03', ASOF).netIncome, 600);
  assert.throws(() => E.normalizeBackup({ students: [] }), /格式不符/);
  assert.throws(() => E.normalizeBackup(null));
});

test('場地驗證', () => {
  assert.deepEqual(E.validateVenue({ name: 'A', fee: 300, mode: 'perClass' }), []);
  assert.equal(E.validateVenue({ name: '', fee: -1, mode: 'x' }).length, 3);
});
