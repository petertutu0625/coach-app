// 範例資料（全部標記 demo:true，可一鍵移除）
import { addDays, addMonths } from './engine.js';

export function buildDemo(today) {
  const ym = today.slice(0, 7);
  const d = (monthsAgo, day) => `${addMonths(ym, -monthsAgo)}-${String(day).padStart(2, '0')}`;
  const id = (p) => `demo-${p}`;
  const students = [
    { id: id('s1'), name: '林小美（範例）', contact: '0912-345-678 / LINE: mei', goals: '減脂 5 公斤、改善體態', health: '右膝舊傷，避免深度跳躍', createdAt: d(8, 1) },
    { id: id('s2'), name: '陳大文（範例）', contact: '0922-111-222', goals: '硬舉 150 公斤', health: '', createdAt: d(6, 3) },
    { id: id('s3'), name: '王怡君（範例）', contact: 'LINE: yijun', goals: '產後核心恢復', health: '腹直肌分離 2 指', createdAt: d(5, 10) },
    { id: id('s4'), name: '張志豪（範例）', contact: '0933-555-777', goals: '增肌', health: '', createdAt: d(4, 5) },
    { id: id('s5'), name: '黃雅婷（範例）', contact: '0955-000-123', goals: '馬拉松肌力訓練', health: '偶有下背緊繃', createdAt: d(9, 2) },
  ];
  const P = (o) => ({ paymentType: 'full', bonusSessions: 0, expiryDate: null, type: '1on1', notes: '', refund: null, demo: true, ...o });
  const packages = [
    P({ id: id('p1'), studentId: id('s1'), name: '一對一 20 堂', price: 36000, paidSessions: 20, bonusSessions: 2, purchaseDate: d(7, 5), paymentType: 'installment', notes: '分 12 期（無卡分期）', createdAt: d(7, 5) }),
    P({ id: id('p2'), studentId: id('s1'), name: '續約 10 堂', price: 18500, paidSessions: 10, purchaseDate: d(0, 2), expiryDate: addDays(today, 120), createdAt: d(0, 2) }),
    P({ id: id('p3'), studentId: id('s2'), name: '一對一 12 堂', price: 22800, paidSessions: 12, purchaseDate: d(5, 8), expiryDate: addDays(today, 9), createdAt: d(5, 8) }),
    P({ id: id('p4'), studentId: id('s3'), name: '一對二 10 堂', price: 12000, paidSessions: 10, bonusSessions: 1, purchaseDate: d(3, 1), type: '1on2', createdAt: d(3, 1) }),
    P({ id: id('p5'), studentId: id('s4'), name: '一對二 10 堂', price: 12000, paidSessions: 10, purchaseDate: d(3, 1), type: '1on2', createdAt: d(3, 1) }),
    P({ id: id('p6'), studentId: id('s5'), name: '體驗 8 堂', price: 14400, paidSessions: 8, purchaseDate: d(9, 3), expiryDate: d(5, 28), notes: '到期未上完', createdAt: d(9, 3) }),
    P({ id: id('p7'), studentId: id('s5'), name: '一對一 10 堂', price: 19000, paidSessions: 10, purchaseDate: d(4, 1), refund: { amount: 9000, date: d(2, 15) }, notes: '搬家退費', createdAt: d(4, 1) }),
  ];
  const sessions = [];
  let n = 0;
  const S = (date, time, attendees, note = {}) => sessions.push({ id: id(`c${++n}`), datetime: `${date}T${time}`, attendees: attendees.map(([s, p, nt]) => ({ studentId: id(s), packageId: id(p), note: nt || '' })), sharedNote: { content: '', sets: '', condition: '', ...note }, createdAt: `${date}T${time}`, demo: true });
  const moves = ['深蹲、臥推', '硬舉、划船', '核心、髖關節活動度', '上肢推拉', '下肢單側訓練', '體能循環'];
  // 小美：上完第一個方案 22 堂 → 續約
  for (let i = 0; i < 22; i++) S(addDays(d(7, 6), i * 9), '10:00', [['s1', 'p1']], { content: moves[i % 6], sets: '3×10', condition: i === 5 ? '膝蓋微痠' : '良好' });
  S(addDays(today, -3), '10:00', [['s1', 'p2']], { content: '深蹲、臥推', sets: '深蹲 40kg 4×8', condition: '良好' });
  // 大文：12 堂上了 10 堂（剩 2 → 續約提醒；9 天後到期）
  for (let i = 0; i < 10; i++) S(addDays(d(4, 20), i * 13), '19:30', [['s2', 'p3']], { content: '硬舉', sets: `硬舉 ${100 + i * 4}kg 5×5`, condition: '良好' });
  // 怡君 + 志豪：一對二
  for (let i = 0; i < 8; i++) S(addDays(d(2, 20), i * 7), '20:00', [['s3', 'p4', i === 2 ? '核心訓練降階' : ''], ['s4', 'p5']], { content: '一對二 全身訓練', sets: '循環 4 輪', condition: '' });
  // 雅婷：體驗 8 堂只上 5 堂即過期；第二個方案上 3 堂後退費
  for (let i = 0; i < 5; i++) S(addDays(d(9, 5), i * 12), '07:00', [['s5', 'p6']], { content: '跑者肌力', sets: '', condition: '' });
  for (let i = 0; i < 3; i++) S(addDays(d(4, 3), i * 7), '07:00', [['s5', 'p7']], { content: '跑者肌力', sets: '', condition: i === 2 ? '下背緊' : '' });
  for (const s of students) s.demo = true;
  return { students, packages, sessions };
}
