// @ts-check
/**
 * Lưu bền cho chế độ Offline: tài liệu, sổ đăng ký, sổ kiểm toán và phản hồi của người dùng
 * được giữ lại sau khi tải lại trang. Dùng IndexedDB, lùi về localStorage, cuối cùng là bộ nhớ.
 * Mọi thao tác đều bọc try/catch: trình duyệt chặn lưu trữ (chế độ riêng tư, iframe) thì ứng dụng
 * vẫn chạy, chỉ là không lưu được.
 */
(function attachPolicyStore(root, factory) {
  const api = factory();
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeStore = api;
})(typeof globalThis === 'object' ? globalThis : this, function createPolicyStore() {
  'use strict';

  const SCHEMA_VERSION = 1;

  /**
   * @typedef {{ get(key:string):Promise<string|null>, set(key:string, value:string):Promise<void>, del(key:string):Promise<void>, kind:string }} Backend
   * @typedef {{ schemaVersion:number, workspace:string, registry:any[], docs:any[], ledger:any[], feedback:any[], savedAt:string }} Snapshot
   */

  /** @returns {Backend} */
  function memoryBackend() {
    const map = new Map();
    return {
      kind: 'memory',
      async get(key) { return map.has(key) ? map.get(key) : null; },
      async set(key, value) { map.set(key, value); },
      async del(key) { map.delete(key); }
    };
  }

  /** @param {Storage} storage @returns {Backend} */
  function localStorageBackend(storage) {
    return {
      kind: 'localStorage',
      async get(key) { try { return storage.getItem(key); } catch (_) { return null; } },
      async set(key, value) { storage.setItem(key, value); },
      async del(key) { try { storage.removeItem(key); } catch (_) { /* bỏ qua */ } }
    };
  }

  /**
   * @param {IDBFactory} idb @param {string} [dbName]
   * @returns {Backend}
   */
  function indexedDbBackend(idb, dbName = 'policychange-os') {
    /** @type {Promise<IDBDatabase>|null} */
    let opening = null;
    const open = () => opening || (opening = new Promise((resolve, reject) => {
      const request = idb.open(dbName, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('kv'); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
    /** @template T @param {'readonly'|'readwrite'} mode @param {(store:IDBObjectStore) => IDBRequest} run @returns {Promise<T>} */
    const tx = async (mode, run) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const request = run(db.transaction('kv', mode).objectStore('kv'));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    };
    return {
      kind: 'indexedDB',
      async get(key) { const value = await tx('readonly', store => store.get(key)); return typeof value === 'string' ? value : null; },
      async set(key, value) { await tx('readwrite', store => store.put(value, key)); },
      async del(key) { await tx('readwrite', store => store.delete(key)); }
    };
  }

  /**
   * Chọn backend tốt nhất mà môi trường cho phép.
   * @param {any} [env] mặc định là globalThis
   * @returns {Backend}
   */
  function defaultBackend(env) {
    const g = env || (typeof globalThis === 'object' ? globalThis : {});
    try { if (g.indexedDB && typeof g.indexedDB.open === 'function') return indexedDbBackend(g.indexedDB); } catch (_) { /* tiếp */ }
    try {
      if (g.localStorage) { const probe = '__pco_probe__'; g.localStorage.setItem(probe, '1'); g.localStorage.removeItem(probe); return localStorageBackend(g.localStorage); }
    } catch (_) { /* tiếp */ }
    return memoryBackend();
  }

  /** @param {any} value @returns {value is Snapshot} */
  function isSnapshot(value) {
    return !!value && typeof value === 'object' && value.schemaVersion === SCHEMA_VERSION &&
      typeof value.workspace === 'string' && Array.isArray(value.registry) && Array.isArray(value.docs) &&
      Array.isArray(value.ledger) && Array.isArray(value.feedback) &&
      value.docs.every((/** @type {any} */ d) => d && typeof d.id === 'string' && Array.isArray(d.lines) && d.lines.every((/** @type {any} */ l) => typeof l === 'string')) &&
      value.registry.every((/** @type {any} */ r) => r && typeof r.id === 'string' && Array.isArray(r.aliases));
  }

  /**
   * @param {{ backend?:Backend, workspace?:string }} [options]
   */
  function createLocalStore(options = {}) {
    const backend = options.backend || defaultBackend();
    const workspace = options.workspace || 'demo';
    const key = 'policychange-os:v' + SCHEMA_VERSION + ':' + workspace;
    let lastError = /** @type {string|null} */ (null);
    return {
      mode: 'offline',
      backendKind: backend.kind,
      workspace,
      get lastError() { return lastError; },
      /** @returns {Promise<Snapshot|null>} */
      async load() {
        try {
          const raw = await backend.get(key);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          if (!isSnapshot(parsed)) { lastError = 'Dữ liệu lưu trên máy không đúng định dạng; đã bỏ qua.'; return null; }
          return parsed;
        } catch (_) {
          lastError = 'Không đọc được dữ liệu lưu trên máy; đã bỏ qua.';
          return null;
        }
      },
      /** @param {Omit<Snapshot,'schemaVersion'|'workspace'|'savedAt'>} data */
      async save(data) {
        const snapshot = { schemaVersion: SCHEMA_VERSION, workspace, registry: data.registry, docs: data.docs,
          ledger: data.ledger, feedback: data.feedback || [], savedAt: new Date().toISOString() };
        try { await backend.set(key, JSON.stringify(snapshot)); lastError = null; return true; }
        catch (_) { lastError = 'Trình duyệt không cho lưu dữ liệu (chế độ riêng tư hoặc hết dung lượng).'; return false; }
      },
      async clear() { await backend.del(key); }
    };
  }

  return Object.freeze({ SCHEMA_VERSION, memoryBackend, localStorageBackend, indexedDbBackend, defaultBackend, isSnapshot, createLocalStore });
});
