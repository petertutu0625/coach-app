// 資料操作端對端測試：匯出 JSON/CSV、匯入、編輯/刪除紀錄、移除範例、清除全部
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const puppeteer = createRequire(process.env.TOOLS_DIR || '/workspace/coach-tools/')('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8080/';
const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-dl-'));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '清除' : undefined));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// 先捲到畫面中央再點（避免被固定的底部分頁列擋住）
const click = async (sel) => { await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' })); await wait(50); await page.click(sel); };
const goto = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await wait(300); };
let fails = 0;
const ok = (c, m) => { console.log(c ? '✅' : '❌', m); if (!c) fails++; };
const counts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('coach-ledger'); r.onsuccess = () => { const t = r.result.transaction(['students', 'packages', 'sessions']); const o = {}; let n = 0; for (const s of ['students', 'packages', 'sessions']) { const q = t.objectStore(s).count(); q.onsuccess = () => { o[s] = q.result; if (++n === 3) { r.result.close(); res(o); } }; } }; }));
const waitFile = async (re) => { for (let i = 0; i < 30; i++) { const f = fs.readdirSync(dl).find((x) => re.test(x) && !x.endsWith('.crdownload')); if (f) return path.join(dl, f); await wait(100); } return null; };

await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('coach-ledger'); q.onsuccess = q.onerror = q.onblocked = r; }));
await page.reload({ waitUntil: 'networkidle0' }); await page.waitForFunction(() => window.__appReady);
await goto('#/settings'); await click('[data-act="demo-load"]'); await wait(500);
const c0 = await counts(); ok(c0.students === 5 && c0.packages === 7, `範例資料載入 ${JSON.stringify(c0)}`);

// 自己新增一位學生 + 方案 + 簽到
await goto('#/student-new'); await page.type('input[name="name"]', '測試學員'); await click('#studentForm button[type=submit]'); await wait(400);
ok(/package-new/.test(await page.evaluate(() => location.hash)), '新增學生後直接進入新增方案');
await page.type('input[name="name"]', '一對一 5 堂'); await page.type('input[name="price"]', '10001');
await page.$eval('input[name="paidSessions"]', (e) => { e.value = '5'; }); await click('#packageForm button[type=submit]'); await wait(400);
const sid = await page.evaluate(() => location.hash.split('/')[2]);
await goto(`#/checkin?s=${sid}`); await click('#ckSave'); await wait(400);
await goto(`#/student/${sid}`);
let body = await page.$eval('#view', (e) => e.innerText);
ok(/剩 4 堂|剩 \n?4/.test(body.replace(/\s+/g, ' ')) || body.includes('4\n剩餘堂數'), '簽到後剩餘 4 堂');
ok(body.includes('NT$2,000'), '每堂認列 NT$2,000（尾差 1 元在最後一堂）');

// 編輯紀錄日期 → 刪除紀錄
const sessHref = await page.$eval('a.sess', (a) => a.getAttribute('href'));
await goto(sessHref);
await page.$eval('input[name="datetime"]', (e) => { e.value = '2026-09-15T08:00'; e.dispatchEvent(new Event('change', { bubbles: true })); });
await click('#ckSave'); await wait(400);
const stored = await page.evaluate((id) => new Promise((res) => { const r = indexedDB.open('coach-ledger'); r.onsuccess = () => { const q = r.result.transaction('sessions').objectStore('sessions').get(id); q.onsuccess = () => res(q.result.datetime); }; }), sessHref.split('/')[2]);
ok(stored === '2026-09-15T08:00', '編輯上課時間已儲存');
await goto(sessHref); await click('[data-act="session-delete"]'); await wait(400);
body = await page.$eval('#view', (e) => e.innerText);
ok(body.includes('尚無上課紀錄'), '刪除紀錄後重新計算');

// 匯出
await goto('#/settings');
for (const act of ['export-json', 'csv-monthly', 'csv-sessions', 'csv-packages', 'csv-ledger']) { await click(`[data-act="${act}"]`); await wait(300); }
const jf = await waitFile(/\.json$/); ok(!!jf, `JSON 備份已下載 ${jf && path.basename(jf)}`);
for (const re of [/^月報表/, /^上課明細/, /^方案明細/, /^帳務明細/]) {
  const f = await waitFile(re); const buf = f ? fs.readFileSync(f) : Buffer.alloc(0);
  ok(f && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, `${f ? path.basename(f) : re} 含 UTF-8 BOM（${buf.length} bytes）`);
}
const backup = JSON.parse(fs.readFileSync(jf, 'utf8'));
ok(backup.students.length === 6 && backup.packages.length === 8, '備份內容完整');
const ledgerCsv = fs.readFileSync(await waitFile(/^帳務明細/), 'utf8');
console.log('   帳務明細前 3 行：\n   ' + ledgerCsv.split('\r\n').slice(0, 3).join('\n   '));

// 移除範例 → 只剩自己的資料
await click('[data-act="demo-remove"]'); await wait(500);
const c1 = await counts(); ok(c1.students === 1 && c1.packages === 1, `移除範例資料後 ${JSON.stringify(c1)}`);
// 清除全部
await click('[data-act="clear-all"]'); await wait(500);
const c2 = await counts(); ok(c2.students === 0 && c2.packages === 0 && c2.sessions === 0, '清除全部資料');
// 匯入備份
await goto('#/settings');
const input = await page.$('#importFile'); await input.uploadFile(jf); await wait(800);
const c3 = await counts(); ok(c3.students === 6 && c3.packages === 8, `匯入備份後 ${JSON.stringify(c3)}`);
ok(errors.length === 0, `無 JS 錯誤 ${errors.join(' | ')}`);
await browser.close();
process.exit(fails ? 1 : 0);
