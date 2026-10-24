// IndexedDB 儲存層：資料只存在這支手機上
const DB_NAME = 'coach-ledger';
// v1：students / packages / sessions / meta
// v2：新增 venues（場地）。升級只「新增」缺少的資料表，既有資料完全不動。
const VERSION = 2;
export const STORES = ['students', 'packages', 'sessions', 'venues'];
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => { const db = req.result; db.onversionchange = () => { db.close(); dbp = null; }; resolve(db); };
    req.onerror = () => {
      const err = req.error;
      dbp = null;
      reject(err && err.name === 'VersionError' ? new Error('資料庫版本較新，請完全關閉 App 後重新開啟') : err);
    };
    req.onblocked = () => console.warn('資料庫升級等待其他分頁關閉');
  });
  return dbp;
}

function tx(stores, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
    result = fn(t);
  }));
}

const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function loadAll() {
  const db = await open();
  const t = db.transaction(STORES, 'readonly');
  const out = {};
  await Promise.all(STORES.map(async (s) => { out[s] = await reqP(t.objectStore(s).getAll()); }));
  return out;
}

export function put(store, obj) { return tx([store], 'readwrite', (t) => { t.objectStore(store).put(obj); }); }
export function del(store, id) { return tx([store], 'readwrite', (t) => { t.objectStore(store).delete(id); }); }

/** 一次寫入多筆變更：{ put: {store:[objs]}, del: {store:[ids]} } */
export function batch({ put: puts = {}, del: dels = {} }) {
  const stores = [...new Set([...Object.keys(puts), ...Object.keys(dels)])];
  if (!stores.length) return Promise.resolve();
  return tx(stores, 'readwrite', (t) => {
    for (const [s, list] of Object.entries(puts)) for (const o of list) t.objectStore(s).put(o);
    for (const [s, ids] of Object.entries(dels)) for (const id of ids) t.objectStore(s).delete(id);
  });
}

/** 以完整資料取代（匯入 / 清除） */
export function replaceAll(data) {
  return tx(STORES, 'readwrite', (t) => {
    for (const s of STORES) {
      t.objectStore(s).clear();
      for (const o of data[s] || []) t.objectStore(s).put(o);
    }
  });
}

export async function getMeta(key) {
  const db = await open();
  const r = await reqP(db.transaction('meta').objectStore('meta').get(key));
  return r ? r.value : undefined;
}
export function setMeta(key, value) { return tx(['meta'], 'readwrite', (t) => { t.objectStore('meta').put({ key, value }); }); }
