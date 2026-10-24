// 以 iPhone 尺寸（390×844）開啟 App 截圖並做基本流程驗證
// 用法：先 `npm run serve`，再 `node tools/screenshots.mjs`（需要 puppeteer-core，安裝於 ../coach-tools）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
import { createRequire } from 'node:module';
const puppeteer = createRequire(process.env.TOOLS_DIR || '/workspace/coach-tools/')('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8080/';
const OUT = path.join(here, '..', 'screenshots');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--lang=zh-TW'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '清除' : undefined));
await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// 先捲到畫面中央再點（避免被固定的底部分頁列擋住）
const click = async (sel) => { await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' })); await wait(50); await page.click(sel); };
const goto = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await wait(350); };
const shot = async (name, full = false, keepToast = false) => {
  if (!keepToast) await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  if (full) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewport({ width: 390, height: Math.max(844, h), deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await wait(150);
  }
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  if (full) { await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await wait(100); }
  console.log('📸', name);
};
const text = (sel) => page.$eval(sel, (e) => e.innerText);
const assert = (c, m) => { if (!c) { console.error('❌', m); process.exitCode = 1; } else console.log('✅', m); };

await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__appReady);
// 清空（若之前跑過）
await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('coach-ledger'); q.onsuccess = q.onerror = q.onblocked = r; }));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__appReady);
await shot('00-home-empty');

await click('[data-act="demo-load"]');
await wait(500);
await shot('01-home');
await shot('01-home-full', true);
const stats = await page.$$eval('.stat .sval', (els) => els.map((e) => e.innerText));
console.log('本月：', stats.join(' | '));

await goto('#/students');
await shot('02-students');
const firstStudent = await page.$eval('#studentList a', (a) => a.getAttribute('href'));
await goto('#/student/demo-s1');
await shot('03-student-detail');
await shot('03-student-detail-full', true);

// 一對二簽到流程
await goto('#/checkin');
await click('[data-chip="demo-s3"]');
await click('[data-chip="demo-s4"]');
await page.type('textarea[name="content"]', '一對二：壺鈴擺盪、推雪橇');
await page.type('textarea[name="sets"]', '壺鈴 16kg 5×15');
await page.type('input[name="condition"]', '良好');
await page.type('[data-pnote="0"]', '核心降階');
await page.select('select[name="venue"]', 'demo-v2'); await wait(200);
const feeVal = await page.$eval('input[name="venueFee"]', (e) => e.value);
assert(feeVal === '300', `每人計費場地：150 × 2 人 = 300（${feeVal}）`);
await page.evaluate(() => window.scrollTo(0, 0));
await wait(200);
await shot('04-checkin');
await page.$eval('#venueBox', (e) => e.scrollIntoView({ block: 'center' })); await wait(200);
await shot('04b-checkin-venue');
await shot('04-checkin-full', true);
const beforeClasses = await page.evaluate(() => document.querySelectorAll('[data-pkg]').length);
assert(beforeClasses === 2, '一對二：兩位學生各自有扣抵方案選單');
await click('#ckSave');
await wait(600);
const toastText = await page.$eval('.toast', (e) => e.innerText).catch(() => '');
await shot('05-after-checkin', false, true);
assert(/已簽到/.test(toastText), `簽到成功提示：${toastText}`);

await goto('#/package-new/demo-s2');
await page.type('input[name="name"]', '續約 12 堂');
await page.type('input[name="price"]', '22000');
await page.$eval('input[name="paidSessions"]', (e) => { e.value = ''; });
await page.type('input[name="paidSessions"]', '12');
await page.$eval('input[name="bonusSessions"]', (e) => { e.value = ''; });
await page.type('input[name="bonusSessions"]', '1');
await wait(150);
await shot('06-package-form');
assert(/1,692/.test(await text('#unitPreview')), '方案預覽：22,000 ÷ 13 = 每堂 1,692，尾差在最後一堂');

await goto('#/refund/demo-p2');
await page.type('input[name="amount"]', '20000');
await wait(150);
await shot('07-refund-form');
assert(/超過/.test(await text('#refundPreview')), '退費超過剩餘預收款會顯示警示');

await goto('#/reports');
await shot('08-reports');
await shot('08-reports-full', true);
await goto('#/settings');
await shot('09-settings');
await shot('09-settings-full', true);
await page.$eval('#venueList', (e) => e.scrollIntoView({ block: 'start' })); await page.evaluate(() => window.scrollBy(0, -70)); await wait(200);
await shot('13-venue-settings');
await goto('#/venue-edit/demo-v2');
await shot('14-venue-edit');

// 深色模式
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
await goto('#/');
await shot('10-home-dark');
await goto('#/student/demo-s1');
await shot('11-student-dark');
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

// Service worker + 離線
await page.goto(BASE, { waitUntil: 'networkidle0' });
const swOk = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
assert(swOk, 'Service worker 已啟用');
await page.setOfflineMode(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__appReady, { timeout: 5000 }).catch(() => {});
const offlineOk = await page.evaluate(() => !!document.querySelector('.stats'));
assert(offlineOk, '離線狀態重新整理仍可使用（資料來自 IndexedDB）');
await shot('12-offline-home');
await page.setOfflineMode(false);

// 溢出檢查：任何頁面不得出現水平捲動
for (const h of ['#/', '#/students', '#/student/demo-s1', '#/checkin', '#/reports', '#/settings', '#/venue-new', '#/venue-edit/demo-v1']) {
  await goto(h);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(ov <= 0, `${h} 無水平溢出（${ov}px）`);
}
assert(errors.length === 0, `主控台無錯誤 ${errors.length ? JSON.stringify(errors) : ''}`);
void firstStudent;
await browser.close();
