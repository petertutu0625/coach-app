// 格式化與 CSV 工具（純函式）
export function ntd(n) {
  const v = Math.round(Number(n) || 0);
  const s = Math.abs(v).toLocaleString('en-US');
  return (v < 0 ? '-' : '') + 'NT$' + s;
}
export function num(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }
export function ymLabel(ym) { const [y, m] = ym.split('-'); return `${y}年${Number(m)}月`; }
export function dateLabel(d) {
  if (!d) return '';
  const [y, m, dd] = d.slice(0, 10).split('-').map(Number);
  const w = '日一二三四五六'[new Date(y, m - 1, dd).getDay()];
  return `${y}/${String(m).padStart(2, '0')}/${String(dd).padStart(2, '0')}（${w}）`;
}
export function shortDate(d) { if (!d) return ''; const [, m, dd] = d.slice(0, 10).split('-'); return `${Number(m)}/${Number(dd)}`; }
export function timeOf(dt) { return (dt || '').slice(11, 16); }
export function todayStr(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function nowLocal(now = new Date()) {
  return `${todayStr(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/** 產生 Excel 友善 CSV（UTF-8 BOM + CRLF） */
export function toCSV(rows) {
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
