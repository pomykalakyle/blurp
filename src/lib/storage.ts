// @ts-nocheck
const STORAGE_PREFIX = 'weekly-review:';
const storageKey = (key: string) => `${STORAGE_PREFIX}${key}`;

export const storage = {
  async _get(key: string) {
    try {
      const value = window.localStorage.getItem(storageKey(key));
      return value != null ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  },
  async _set(key: string, value: unknown) {
    window.localStorage.setItem(storageKey(key), JSON.stringify(value));
    return null;
  },
  async _delete(key: string) {
    try {
      window.localStorage.removeItem(storageKey(key));
    } catch {
      return null;
    }
    return null;
  },
  getMeta() { return this._get('app:meta'); },
  saveMeta(m: unknown) { return this._set('app:meta', m); },
  getWeek(id: string) { return this._get(`week:${id}`); },
  saveWeek(w: { id: string }) { return this._set(`week:${w.id}`, w); },
  getLtg(id: string) { return this._get(`ltg:${id}`); },
  saveLtg(l: { id: string }) { return this._set(`ltg:${l.id}`, l); },
  deleteLtg(id: string) { return this._delete(`ltg:${id}`); },
};
