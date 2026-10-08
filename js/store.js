// ---------------------------------------------------------------------------
// store.js — local persistence. Tries IndexedDB, falls back to localStorage,
// then to an in-memory map so the app still runs inside a locked-down iframe.
// All reads are async and go through one small API.
// ---------------------------------------------------------------------------

const DB_NAME = 'mmt-prompter';
const DB_VERSION = 1;
const STORES = ['tx', 'days', 'kv'];

let db = null;
let mode = 'memory';
const memory = new Map(); // storeName -> Map(id -> value)

const memStore = (name) => {
  if (!memory.has(name)) memory.set(name, new Map());
  return memory.get(name);
};

/* ---------------- IndexedDB ---------------- */

function openIDB() {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      return reject(err);
    }
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const s of STORES) {
        if (!d.objectStoreNames.contains(s)) {
          d.createObjectStore(s, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
}

function tx(storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ---------------- localStorage fallback ---------------- */

const LS_PREFIX = 'mmt:';
function lsAll(storeName) {
  const raw = localStorage.getItem(LS_PREFIX + storeName);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function lsWrite(storeName, rows) {
  localStorage.setItem(LS_PREFIX + storeName, JSON.stringify(rows));
}

/* ---------------- public API ---------------- */

export async function init() {
  try {
    db = await openIDB();
    mode = 'idb';
    // Verify we can actually read (opaque-origin iframes open but throw).
    await wrap(tx('kv').get('__probe__'));
    return mode;
  } catch { /* fall through */ }

  try {
    const probe = '__mmt_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    mode = 'localstorage';
  } catch {
    mode = 'memory';
  }
  return mode;
}

export const storageMode = () => mode;

export async function all(storeName) {
  if (mode === 'idb') return (await wrap(tx(storeName).getAll())) || [];
  if (mode === 'localstorage') return lsAll(storeName);
  return Array.from(memStore(storeName).values());
}

export async function get(storeName, id) {
  if (mode === 'idb') return (await wrap(tx(storeName).get(id))) || null;
  if (mode === 'localstorage') return lsAll(storeName).find((r) => r.id === id) || null;
  return memStore(storeName).get(id) || null;
}

export async function put(storeName, record) {
  const row = { ...record, id: record.id ?? record.key ?? `${storeName}_${Date.now()}` };
  if (mode === 'idb') { await wrap(tx(storeName, 'readwrite').put(row)); return row; }
  if (mode === 'localstorage') {
    const rows = lsAll(storeName).filter((r) => r.id !== row.id);
    rows.push(row);
    lsWrite(storeName, rows);
    return row;
  }
  memStore(storeName).set(row.id, row);
  return row;
}

export async function putMany(storeName, records) {
  for (const r of records) await put(storeName, r);
  return records.length;
}

export async function remove(storeName, id) {
  if (mode === 'idb') { await wrap(tx(storeName, 'readwrite').delete(id)); return true; }
  if (mode === 'localstorage') {
    lsWrite(storeName, lsAll(storeName).filter((r) => r.id !== id));
    return true;
  }
  memStore(storeName).delete(id);
  return true;
}

export async function clearStore(storeName) {
  if (mode === 'idb') { await wrap(tx(storeName, 'readwrite').clear()); return true; }
  if (mode === 'localstorage') { lsWrite(storeName, []); return true; }
  memStore(storeName).clear();
  return true;
}

/* ---------------- typed helpers ---------------- */

export const listTx = () => all('tx');
export const saveTx = (t) => put('tx', t);
export const deleteTx = (id) => remove('tx', id);

export const listDays = () => all('days');
export const saveDay = (d) => put('days', d);
export const getDay = (k) => get('days', `day_${k}`);
export const deleteDay = (k) => remove('days', `day_${k}`);

export const getSetting = async (key, fallback = null) => {
  const row = await get('kv', key);
  return row ? row.value : fallback;
};
export const setSetting = (key, value) => put('kv', { id: key, value });

export async function exportAll() {
  const [txs, days, kv] = await Promise.all([listTx(), listDays(), all('kv')]);
  return {
    app: 'mmt-prompter',
    version: 1,
    exportedAt: new Date().toISOString(),
    storageMode: mode,
    tx: txs,
    days,
    settings: Object.fromEntries(kv.map((r) => [r.id, r.value])),
  };
}

export async function importAll(payload, { merge = true } = {}) {
  if (!payload || typeof payload !== 'object') throw new Error('Unrecognised backup file.');
  const { tx = [], days = [], settings = {} } = payload;
  if (merge) {
    const [existingTx, existingDays] = await Promise.all([listTx(), listDays()]);
    await putMany('tx', dedupeById([...existingTx, ...tx]));
    await putMany('days', dedupeById([...existingDays, ...days]));
  } else {
    await clearStore('tx');
    await clearStore('days');
    await putMany('tx', tx);
    await putMany('days', days);
  }
  for (const [k, v] of Object.entries(settings || {})) await setSetting(k, v);
  return { tx: tx.length, days: days.length, settings: Object.keys(settings || {}).length };
}

function dedupeById(rows) {
  const m = new Map();
  for (const r of rows) if (r && r.id) m.set(r.id, r);
  return Array.from(m.values());
}
