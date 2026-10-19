// Emettitore di eventi minimale.
export class Emitter {
  constructor() {
    this._h = new Map();
  }
  on(type, fn) {
    if (!this._h.has(type)) this._h.set(type, new Set());
    this._h.get(type).add(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) {
    this._h.get(type)?.delete(fn);
  }
  emit(type, detail) {
    const set = this._h.get(type);
    if (set) for (const fn of [...set]) fn(detail);
    const any = this._h.get('*');
    if (any) for (const fn of [...any]) fn(type, detail);
  }
}
