// Modello dati del progetto (impianto configurato): componenti montati, cablaggi, dati dello studente.
// Nessuna dipendenza grafica: serializzabile in JSON e usabile nei test.
import { Emitter } from './events.js';
import { DEFS, modulesOf } from '../catalog/defs/index.js';
import { resolveParams } from '../catalog/defs/common.js';
import { LAYOUT } from './layout.js';

export const PROJECT_VERSION = 1;

/**
 * Progetto vuoto. `source`: 'supply' (arrivo linea del distributore, default) oppure 'none' (nessuna sorgente:
 * l'impianto di bordo la riceve dai gruppi elettrogeni aggiunti dall'utente).
 */
export function blankProject({ sys = '1F', title = 'Nuovo impianto', earth = 'TT', source = 'supply' } = {}) {
  const withSupply = source !== 'none';
  return {
    app: 'configuratore-elettrotecnico-3d',
    version: PROJECT_VERSION,
    meta: {
      title,
      author: '',
      school: '',
      classe: '',
      date: new Date().toISOString().slice(0, 10),
      description: '',
      justifications: {}, // risposte alle domande di giustificazione delle scelte (JUSTIFICATIONS)
      exercise: null,
      source, // 'supply' (arrivo linea) o 'none' (impianto di bordo: le sorgenti le aggiunge l'utente)
    },
    components: [
      ...(withSupply ? [{ id: 'XA', type: 'supply', tag: 'XA', mount: { kind: 'din', rail: 0, pos: 0 }, params: { sys, earth }, note: '' }] : []),
      { id: 'PE', type: 'pebar', tag: 'PE', mount: { kind: 'fixed', at: 'pebar' }, params: {}, note: '' },
    ],
    wires: withSupply ? [{ id: 'w0', a: { c: 'XA', t: 'PE' }, b: { c: 'PE', t: 'IN' }, color: 'yg', section: 16, fixed: true }] : [],
    seq: 1,
  };
}

function migrate(d) {
  if (!d || typeof d !== 'object') return blankProject();
  d.meta = { ...blankProject().meta, ...(d.meta || {}) };
  if (!d.meta.justifications || typeof d.meta.justifications !== 'object') d.meta.justifications = {};
  d.components = Array.isArray(d.components) ? d.components.filter((c) => DEFS[c.type]) : [];
  d.wires = Array.isArray(d.wires) ? d.wires : [];
  if (d.meta.source !== 'none' && !d.components.some((c) => DEFS[c.type]?.source)) {
    // nessuna sorgente: progetti vecchi o corrotti ricevono l'arrivo linea (e il collettore di terra se manca)
    const b = blankProject();
    d.components = d.components.filter((c) => c.type !== 'pebar');
    d.components.unshift(...b.components);
    d.wires.unshift(...b.wires);
  }
  if (!d.components.some((c) => c.type === 'pebar')) d.components.push({ id: 'PE', type: 'pebar', tag: 'PE', mount: { kind: 'fixed', at: 'pebar' }, params: {}, note: '' });
  let max = 0;
  for (const x of [...d.components, ...d.wires]) {
    const m = /^[cw](\d+)$/.exec(x.id);
    if (m) max = Math.max(max, +m[1]);
  }
  d.seq = Math.max(d.seq || 1, max + 1);
  d.version = PROJECT_VERSION;
  return d;
}

const sameEnd = (x, y) => x.c === y.c && x.t === y.t;

export class Project extends Emitter {
  constructor(data) {
    super();
    this.undoStack = [];
    this.redoStack = [];
    this.geomLen = new Map(); // lunghezze geometriche dei cavi (calcolate dalla vista 3D)
    this.data = migrate(structuredClone(data || blankProject()));
  }

  load(data, { keepHistory = false } = {}) {
    if (keepHistory) this.checkpoint('Carica progetto');
    else {
      this.undoStack.length = 0;
      this.redoStack.length = 0;
    }
    this.data = migrate(structuredClone(data));
    this.emit('change', { type: 'load' });
  }

  toJSON() {
    return structuredClone(this.data);
  }

  get components() {
    return this.data.components;
  }
  get wires() {
    return this.data.wires;
  }
  get meta() {
    return this.data.meta;
  }

  comp(id) {
    return this.data.components.find((c) => c.id === id);
  }
  wire(id) {
    return this.data.wires.find((w) => w.id === id);
  }
  def(id) {
    return DEFS[this.comp(id)?.type];
  }
  params(id) {
    const c = this.comp(id);
    return c ? resolveParams(DEFS[c.type], c.params) : {};
  }
  terminals(id) {
    const c = this.comp(id);
    if (!c) return [];
    return DEFS[c.type].terminals(this.params(id));
  }
  terminal(ref) {
    return this.terminals(ref.c).find((t) => t.id === ref.t);
  }
  supply() {
    return this.data.components.find((c) => c.type === 'supply');
  }
  /** Sorgenti di energia del progetto (arrivo linea, gruppi elettrogeni) */
  sources() {
    return this.data.components.filter((c) => DEFS[c.type]?.source);
  }
  /** Sistema di rete del progetto: tensioni, frequenza, messa a terra, sigle delle sorgenti */
  system() {
    const srcs = this.sources();
    const main = srcs.find((c) => c.type === 'supply') || srcs[0];
    const def = main && DEFS[main.type];
    const base = def?.system ? def.system(this.params(main.id)) : { Vph: 230, Vll: 400, f: 50, earth: 'TT' };
    const sp = main ? this.params(main.id) : {};
    return { ...base, sys: sp.sys || (main && main.type !== 'supply' ? '3F' : '1F'), Pc: sp.Pc ?? null, Icc: sp.Icc ?? null, Re: sp.Re ?? null, sources: srcs.map((c) => c.tag), kind: main?.type || 'none' };
  }

  // ── Annulla / ripeti ──────────────────────────────────────────────────────────────
  checkpoint(label) {
    this.undoStack.push({ label, json: JSON.stringify(this.data) });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  undo() {
    const s = this.undoStack.pop();
    if (!s) return null;
    this.redoStack.push({ label: s.label, json: JSON.stringify(this.data) });
    this.data = JSON.parse(s.json);
    this.emit('change', { type: 'load', history: true });
    return s.label;
  }
  redo() {
    const s = this.redoStack.pop();
    if (!s) return null;
    this.undoStack.push({ label: s.label, json: JSON.stringify(this.data) });
    this.data = JSON.parse(s.json);
    this.emit('change', { type: 'load', history: true });
    return s.label;
  }

  // ── Sigle (CEI EN 81346) ──────────────────────────────────────────────────────────
  nextTag(prefix) {
    let max = 0;
    const re = new RegExp('^' + prefix + '(\\d+)$');
    for (const c of this.data.components) {
      const m = re.exec(c.tag || '');
      if (m) max = Math.max(max, +m[1]);
    }
    return prefix + (max + 1);
  }

  // ── Posizionamento ────────────────────────────────────────────────────────────────
  widthOf(type, params) {
    const def = DEFS[type];
    if (def.mount === 'din') return modulesOf(def, resolveParams(def, params));
    return def.span || 1;
  }

  /** Verifica se un componente può stare in una posizione (ignora eventualmente se stesso) */
  canPlace(type, params, mount, ignoreId = null) {
    const def = DEFS[type];
    if (!def || !mount || def.mount !== mount.kind) return false;
    const w = this.widthOf(type, params);
    if (mount.kind === 'din') {
      const { rails, modules } = LAYOUT.din;
      if (mount.rail < 0 || mount.rail >= rails || mount.pos < 0 || mount.pos + w > modules + 1e-6) return false;
      for (const c of this.data.components) {
        if (c.id === ignoreId || c.mount.kind !== 'din' || c.mount.rail !== mount.rail) continue;
        const cw = this.widthOf(c.type, c.params);
        if (mount.pos < c.mount.pos + cw - 1e-6 && c.mount.pos < mount.pos + w - 1e-6) return false;
      }
      return true;
    }
    if (mount.kind === 'field') {
      const { cols, rows } = LAYOUT.field;
      if (mount.row < 0 || mount.row >= rows || mount.col < 0 || mount.col + w > cols) return false;
      for (const c of this.data.components) {
        if (c.id === ignoreId || c.mount.kind !== 'field' || c.mount.row !== mount.row) continue;
        const cw = this.widthOf(c.type, c.params);
        if (mount.col < c.mount.col + cw && c.mount.col < mount.col + w) return false;
      }
      return true;
    }
    return false;
  }

  /** Posizione libera più vicina su una guida DIN */
  nearestFreeDin(type, params, rail, pos, ignoreId = null) {
    const step = LAYOUT.din.step;
    const w = this.widthOf(type, params);
    const max = LAYOUT.din.modules - w;
    const start = Math.round(Math.max(0, Math.min(max, pos)) / step) * step;
    for (let d = 0; d <= LAYOUT.din.modules; d += step) {
      for (const p of [start - d, start + d]) {
        if (p < 0 || p > max + 1e-6) continue;
        const m = { kind: 'din', rail, pos: p };
        if (this.canPlace(type, params, m, ignoreId)) return m;
      }
    }
    return null;
  }

  /** Prima posizione libera nell'intero quadro / pannello */
  firstFree(type, params = {}) {
    const def = DEFS[type];
    if (def.mount === 'din') {
      for (let r = 0; r < LAYOUT.din.rails; r++) {
        for (let p = 0; p <= LAYOUT.din.modules; p += LAYOUT.din.step) {
          const m = { kind: 'din', rail: r, pos: p };
          if (this.canPlace(type, params, m)) return m;
        }
      }
    } else if (def.mount === 'field') {
      for (let r = 0; r < LAYOUT.field.rows; r++) {
        for (let c = 0; c < LAYOUT.field.cols; c++) {
          const m = { kind: 'field', row: r, col: c };
          if (this.canPlace(type, params, m)) return m;
        }
      }
    }
    return null;
  }

  // ── Componenti ────────────────────────────────────────────────────────────────────
  addComponent(type, mount, params = {}, { tag, note = '', label = '' } = {}) {
    const def = DEFS[type];
    if (!def) return null;
    const m = mount || this.firstFree(type, params);
    if (!m || !this.canPlace(type, params, m)) return null;
    this.checkpoint(`Aggiungi ${def.short}`);
    const c = { id: 'c' + this.data.seq++, type, tag: tag || this.nextTag(def.tag), mount: m, params: { ...params }, note, label };
    this.data.components.push(c);
    this.emit('change', { type: 'add', id: c.id });
    return c;
  }

  removeComponent(id) {
    const c = this.comp(id);
    if (!c || DEFS[c.type].fixed) return false;
    this.checkpoint(`Rimuovi ${c.tag}`);
    this.data.components = this.data.components.filter((x) => x.id !== id);
    this.data.wires = this.data.wires.filter((w) => w.a.c !== id && w.b.c !== id);
    this.emit('change', { type: 'remove', id });
    return true;
  }

  moveComponent(id, mount) {
    const c = this.comp(id);
    if (!c || DEFS[c.type].fixed) return false;
    if (!this.canPlace(c.type, c.params, mount, id)) return false;
    this.checkpoint(`Sposta ${c.tag}`);
    c.mount = mount;
    this.emit('change', { type: 'move', id });
    return true;
  }

  setParam(id, key, value) {
    const c = this.comp(id);
    if (!c) return;
    const def = DEFS[c.type];
    const next = { ...c.params, [key]: value };
    // Se cambia la larghezza, verifica che il componente stia ancora nella sua posizione
    if (def.mount === 'din' && !this.canPlace(c.type, next, c.mount, id)) return { error: 'Non c’è spazio sulla guida per questa variante.' };
    this.checkpoint(`${c.tag}: ${key}`);
    c.params = next;
    // Rimuove i cablaggi verso morsetti che non esistono più (es. monofase → trifase)
    const ids = new Set(def.terminals(resolveParams(def, next)).map((t) => t.id));
    const before = this.data.wires.length;
    this.data.wires = this.data.wires.filter((w) => !((w.a.c === id && !ids.has(w.a.t)) || (w.b.c === id && !ids.has(w.b.t))));
    this.emit('change', { type: 'param', id, key, removedWires: before - this.data.wires.length });
    return { ok: true };
  }

  setMeta(id, patch) {
    const c = this.comp(id);
    if (!c) return;
    Object.assign(c, patch);
    this.emit('change', { type: 'meta', id });
  }

  setProjectMeta(patch) {
    Object.assign(this.data.meta, patch);
    this.emit('change', { type: 'project-meta' });
  }

  // ── Cablaggi ──────────────────────────────────────────────────────────────────────
  wiresAt(ref) {
    return this.data.wires.filter((w) => sameEnd(w.a, ref) || sameEnd(w.b, ref));
  }

  addWire(a, b, { color = 'brown', section = 1.5, n = 1 } = {}) {
    if (sameEnd(a, b)) return { error: 'Scegli due morsetti diversi.' };
    if (!this.terminal(a) || !this.terminal(b)) return { error: 'Morsetto non valido.' };
    if (this.data.wires.some((w) => (sameEnd(w.a, a) && sameEnd(w.b, b)) || (sameEnd(w.a, b) && sameEnd(w.b, a)))) {
      return { error: 'Questi due morsetti sono già collegati.' };
    }
    this.checkpoint('Nuovo collegamento');
    const w = { id: 'w' + this.data.seq++, a: { ...a }, b: { ...b }, color, section };
    if (n > 1) w.n = n; // conduttori in parallelo per fase (secondari dei trasformatori MT/BT)
    this.data.wires.push(w);
    this.emit('change', { type: 'wire-add', id: w.id });
    return { wire: w };
  }

  removeWire(id) {
    const w = this.wire(id);
    if (!w || w.fixed) return false;
    this.checkpoint('Rimuovi collegamento');
    this.data.wires = this.data.wires.filter((x) => x.id !== id);
    this.emit('change', { type: 'wire-remove', id });
    return true;
  }

  setWire(id, patch) {
    const w = this.wire(id);
    if (!w) return;
    this.checkpoint('Modifica collegamento');
    Object.assign(w, patch);
    this.emit('change', { type: 'wire-param', id });
  }

  /** Lunghezza elettrica del cavo [m]: manuale, oppure geometrica + distanza dell'utenza dal quadro */
  electricalLength(w) {
    if (w.lengthMode === 'manual' && w.length > 0) return w.length;
    const geo = this.geomLen.get(w.id) ?? 0.6;
    const da = this.fieldDistance(w.a.c);
    const db = this.fieldDistance(w.b.c);
    let extra = 0;
    if (da !== null && db !== null) extra = Math.abs(da - db) + 2;
    else if (da !== null) extra = da;
    else if (db !== null) extra = db;
    return geo + extra;
  }

  fieldDistance(id) {
    const c = this.comp(id);
    if (!c || DEFS[c.type].mount !== 'field') return null;
    return this.params(id).dist ?? 10;
  }
}
