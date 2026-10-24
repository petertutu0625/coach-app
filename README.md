# 教練帳本（Coach Ledger）v1.0.0

私人教練用的 iPhone 主畫面 Web App（PWA）。純靜態檔案、零執行期依賴、資料只存在手機的 IndexedDB。

## 檔案結構
```
index.html            App 外殼（iOS meta、safe-area、底部分頁列）
manifest.json         PWA 設定（教練帳本、standalone、圖示 180/192/512/maskable）
sw.js                 Service Worker（預先快取全部檔案，離線可用；改版時請修改 CACHE 版本字串）
css/app.css           樣式（淺色 / 深色 prefers-color-scheme）
js/engine.js          會計引擎（純函式，單元測試對象）
js/format.js          NT$ 格式、日期、CSV（UTF-8 BOM）
js/db.js              IndexedDB 存取
js/demo.js            範例資料（demo:true，可一鍵移除）
js/app.js             畫面與互動（hash 路由）
icons/                apple-touch-icon(180)、icon-192、icon-512、icon-maskable-512
tests/engine.test.js  會計引擎單元測試（node --test）
tools/                make_icons.py、screenshots.mjs、e2e.mjs（開發用，非執行期）
screenshots/          iPhone 390×844 截圖
```

## 指令
- 單元測試：`npm test`（Node 20+，不需安裝任何套件）
- 本機預覽：`npm run serve` → http://127.0.0.1:8080/
- 截圖 / 端對端：需 puppeteer-core 與 Chrome：`node tools/screenshots.mjs`、`node tools/e2e.mjs`

## 會計規則
- 購課（一次付清或無卡分期）：購買日全額 = 實收現金，同時記為預收款。
- 每堂認列 = 實付 ÷（付費 + 贈送堂數），無條件捨去，尾差放最後一堂 → 全部上完時認列總額 = 實付。
- 上課：依上課日期所在月份認列一堂；多人課每位學生扣自己的方案、認列自己的單價。
- 過期：到期日已過（今天 > 到期日）仍有剩餘 → 剩餘預收款於到期月份「過期認列」。到期日當天上課仍有效。
- 退費：方案結案；退費日剩餘預收款 − 退費金額 = 退費月認列收入；若為負數則警示並列為負收入（使累計收入 = 實收 − 退費）。
- 不變式：任一時點 預收款餘額 = 累計實收現金 − 累計認列收入。
- 所有數字皆由原始紀錄即時推導，不存累計值；編輯/刪除後自動重算。

## 部署
必須透過 HTTPS（Service Worker 要求）。把整個資料夾上傳到任一靜態主機即可（使用相對路徑，可放在子目錄）。
iPhone：Safari 開啟網址 → 分享 → 加入主畫面。
