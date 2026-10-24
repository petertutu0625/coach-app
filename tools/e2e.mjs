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
const counts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('coach-ledger'); r.onsuccess = () => { const t = r.result.transaction(['students', 'packages', 'sessions', 'venues']); const o = {}; let n = 0; for (const s of ['students', 'packages', 'sessions', 'venues']) { const q = t.objectStore(s).count(); q.onsuccess = () => { o[s] = q.result; if (++n === 4) { r.result.close(); res(o); } }; } }; }));
const waitFile = async (re) => { for (let i = 0; i < 30; i++) { const f = fs.readdirSync(dl).find((x) => re.test(x) && !x.endsWith('.crdownload')); if (f) return path.join(dl, f); await wait(100); } return null; };

// ---- 1. 舊版（v1）資料庫升級到 v2：資料不可遺失，舊紀錄場地費 = 0 ----
await page.goto(BASE + 'manifest.json'); // 同網域但不載入 App
await page.evaluate(() => new Promise((res, rej) => {
  const del = indexedDB.deleteDatabase('coach-ledger');
  del.onsuccess = () => {
    const r = indexedDB.open('coach-ledger', 1);
    r.onupgradeneeded = () => { for (const s of ['students', 'packages', 'sessions']) r.result.createObjectStore(s, { keyPath: 'id' }); r.result.createObjectStore('meta', { keyPath: 'key' }); };
    r.onsuccess = () => {
      const t = r.result.transaction(['students', 'packages', 'sessions'], 'readwrite');
      t.objectStore('students').put({ id: 'old-s', name: '舊學員', contact: '', goals: '', health: '', createdAt: '2026-01-01T09:00' });
      t.objectStore('packages').put({ id: 'old-p', studentId: 'old-s', name: '舊方案 10 堂', price: 10000, paidSessions: 10, bonusSessions: 0, purchaseDate: '2026-10-01', paymentType: 'full', expiryDate: null, type: '1on1', notes: '', refund: null, createdAt: '2026-10-01T09:00' });
      t.objectStore('sessions').put({ id: 'old-c', datetime: '2026-10-03T10:00', attendees: [{ studentId: 'old-s', packageId: 'old-p', note: '' }], sharedNote: { content: '舊紀錄', sets: '', condition: '' }, createdAt: '2026-10-03T10:00' });
      t.oncomplete = () => { r.result.close(); res(); };
    };
    r.onerror = () => rej(r.error);
  };
}));
await page.goto(BASE, { waitUntil: 'networkidle0' }); await page.waitForFunction(() => window.__appReady);
const up = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('coach-ledger'); r.onsuccess = () => { const db = r.result; const out = { version: db.version, stores: [...db.objectStoreNames] }; const q = db.transaction('sessions').objectStore('sessions').getAll(); q.onsuccess = () => { out.sessions = q.result.length; db.close(); res(out); }; }; }));
ok(up.version === 2 && up.stores.includes('venues') && up.sessions === 1, `v1 → v2 升級保留資料 ${JSON.stringify(up)}`);
await goto('#/');
const homeOld = await page.$eval('#view', (e) => e.innerText);
ok(homeOld.includes('NT$1,000') && homeOld.includes('場地費 NT$0'), '舊紀錄：實際收入 1,000、場地費 0、淨收入 = 實際收入');

// ---- 2. 匯入舊格式（v1）JSON 備份 ----
const v1File = path.join(os.tmpdir(), 'coach-old-v1-backup.json');
fs.writeFileSync(v1File, JSON.stringify({ app: 'coach-ledger', version: 1, exportedAt: '2026-10-01T00:00:00Z',
  students: [{ id: 'b-s', name: '備份學員', contact: '', goals: '', health: '' }],
  packages: [{ id: 'b-p', studentId: 'b-s', name: '備份方案', price: 6000, paidSessions: 6, bonusSessions: 0, purchaseDate: '2026-10-02', paymentType: 'installment', expiryDate: null, type: '1on1', notes: '', refund: null }],
  sessions: [{ id: 'b-c', datetime: '2026-10-05T10:00', attendees: [{ studentId: 'b-s', packageId: 'b-p', note: '' }], sharedNote: {} }] }));
await goto('#/settings');
await (await page.$('#importFile')).uploadFile(v1File); await wait(800);
const ci = await counts(); ok(ci.students === 1 && ci.sessions === 1 && ci.venues === 0, `匯入 v1 備份 ${JSON.stringify(ci)}`);
await goto('#/');
const homeImp = await page.$eval('#view', (e) => e.innerText);
ok(homeImp.includes('NT$1,000') && /淨收入\s*NT\$1,000/.test(homeImp), '匯入舊備份後淨收入 = 實際收入 NT$1,000');

// ---- 3. 從空白開始的完整流程 ----
await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('coach-ledger'); q.onsuccess = q.onerror = q.onblocked = r; }));
await page.reload({ waitUntil: 'networkidle0' }); await page.waitForFunction(() => window.__appReady);
await goto('#/settings'); await click('[data-act="demo-load"]'); await wait(500);
const c0 = await counts(); ok(c0.students === 5 && c0.packages === 7 && c0.venues === 3, `範例資料載入 ${JSON.stringify(c0)}`);

// 自己新增一位學生 + 方案 + 簽到
await goto('#/student-new'); await page.type('input[name="name"]', '測試學員'); await click('#studentForm button[type=submit]'); await wait(400);
ok(/package-new/.test(await page.evaluate(() => location.hash)), '新增學生後直接進入新增方案');
await page.type('input[name="name"]', '一對一 5 堂'); await page.type('input[name="price"]', '10001');
await page.$eval('input[name="paidSessions"]', (e) => { e.value = '5'; }); await click('#packageForm button[type=submit]'); await wait(400);
const sid = await page.evaluate(() => location.hash.split('/')[2]);
// 新增自己的場地（每人計費 200）
await goto('#/venue-new'); await page.type('#venueForm input[name="name"]', '測試場館');
await click('#venueForm input[value="perPerson"] + span'); await page.type('#venueForm input[name="fee"]', '200');
await click('#venueForm button[type=submit]'); await wait(400);
const vid = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('coach-ledger'); r.onsuccess = () => { const q = r.result.transaction('venues').objectStore('venues').getAll(); q.onsuccess = () => { r.result.close(); res(q.result.find((v) => v.name === '測試場館')?.id); }; }; }));
ok(!!vid, '新增場地成功');
await goto(`#/checkin?s=${sid}`);
await page.select('select[name="venue"]', vid); await wait(150);
ok((await page.$eval('input[name="venueFee"]', (e) => e.value)) === '200', '選擇場地後自動帶入場地費 200');
await page.$eval('input[name="venueFee"]', (e) => { e.value = ''; }); await page.type('input[name="venueFee"]', '250');
await click('#ckSave'); await wait(400);
const sfee = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('coach-ledger'); r.onsuccess = () => { const q = r.result.transaction('sessions').objectStore('sessions').getAll(); q.onsuccess = () => { r.result.close(); res(q.result.filter((x) => !x.demo).map((x) => [x.venueId, x.venueFee])); }; }; }));
ok(sfee.length === 1 && sfee[0][0] === vid && sfee[0][1] === 250, `手動修改場地費後儲存 ${JSON.stringify(sfee)}`);
await goto(`#/checkin`);
ok((await page.$eval('select[name="venue"]', (e) => e.value)) === vid, '下次簽到預設上次使用的場地');
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
ok(backup.version === 2 && backup.students.length === 6 && backup.packages.length === 8 && backup.venues.length === 4, '備份內容完整（含場地）');
const sessCsv = fs.readFileSync(await waitFile(/^上課明細/), 'utf8'); ok(sessCsv.split('\r\n')[0].includes('場地費（本堂合計）') && sessCsv.includes('大安健身工作室（範例）,400'), '上課明細 CSV 含場地與場地費');
const monCsv = fs.readFileSync(await waitFile(/^月報表/), 'utf8'); ok(/場地費,淨收入/.test(monCsv.split('\r\n')[0]), '月報表 CSV 含場地費 / 淨收入');
const ledgerCsv = fs.readFileSync(await waitFile(/^帳務明細/), 'utf8');
console.log('   帳務明細前 3 行：\n   ' + ledgerCsv.split('\r\n').slice(0, 3).join('\n   '));

// 移除範例 → 只剩自己的資料
await click('[data-act="demo-remove"]'); await wait(500);
const c1 = await counts(); ok(c1.students === 1 && c1.packages === 1 && c1.venues === 1, `移除範例資料後 ${JSON.stringify(c1)}`);
// 清除全部
await click('[data-act="clear-all"]'); await wait(500);
const c2 = await counts(); ok(c2.students === 0 && c2.packages === 0 && c2.sessions === 0, '清除全部資料');
// 匯入備份
await goto('#/settings');
const input = await page.$('#importFile'); await input.uploadFile(jf); await wait(800);
const c3 = await counts(); ok(c3.students === 6 && c3.packages === 8 && c3.venues === 4, `匯入備份後 ${JSON.stringify(c3)}`);
ok(errors.length === 0, `無 JS 錯誤 ${errors.join(' | ')}`);
await browser.close();
process.exit(fails ? 1 : 0);
