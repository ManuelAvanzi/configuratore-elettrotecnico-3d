// Simulatore dell'impianto: costruisce la rete dai componenti e dai cablaggi, la risolve (MNA complessa),
// fa evolvere gli stati (bobine, protezioni, temporizzatori) fino alla stabilità e integra nel tempo
// le grandezze lente (bimetalli, timer, avviamento motori, limitatore del contatore).
import { solveNetwork } from './mna.js';
import { ZERO, C, cabs, csub, cmul, cinv } from './complex.js';
import { RHO_CU, R_CONTACT, DEFAULT_SYS } from './norms.js';
import { resolveParams } from '../catalog/defs/common.js';

class UnionFind {
  constructor(n) {
    this.p = new Int32Array(n);
    for (let i = 0; i < n; i++) this.p[i] = i;
  }
  find(i) {
    while (this.p[i] !== i) {
      this.p[i] = this.p[this.p[i]];
      i = this.p[i];
    }
    return i;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.p[ra] = rb;
  }
}

const MAX_ITER = 24;

export class Simulator {
  /** @param {Record<string, any>} defs registro delle definizioni elettriche */
  constructor(defs) {
    this.defs = defs;
    this.inst = new Map();
    this.wires = [];
    this.env = { lux: 400, time: 0, sys: { ...DEFAULT_SYS } };
    this.sourceIds = []; // sorgenti di energia (arrivo linea, gruppi elettrogeni)
    this.bus = new Map(); // isole di rete alimentate da generatori: radice → { f, loading, S, Sn, gens }
    this.dirty = true;
    this.version = 0;
    this.net = null;
    this.res = null;
    this.events = [];
    this.listeners = new Set();
    this.muted = 0;
    this.stats = { solves: 0, lastMs: 0, nodes: 0 };
    this.lengthOf = (w) => w.length ?? 1;
    this.unstable = false;
  }

  // ── Sincronizzazione con il progetto ──────────────────────────────────────────────
  sync(project, lengthOf) {
    if (lengthOf) this.lengthOf = lengthOf;
    const seen = new Set();
    for (const c of project.components) {
      const def = this.defs[c.type];
      if (!def) continue;
      let inst = this.inst.get(c.id);
      const params = resolveParams(def, c.params);
      if (!inst || inst.type !== c.type) {
        inst = { id: c.id, type: c.type, def, tag: c.tag || c.id, params, state: def.init ? def.init(params) : {}, view: {} };
        this.inst.set(c.id, inst);
      } else {
        inst.params = params;
        inst.tag = c.tag || c.id;
      }
      seen.add(c.id);
    }
    for (const id of [...this.inst.keys()]) if (!seen.has(id)) this.inst.delete(id);
    // sistema di rete (tensione, frequenza, messa a terra) dichiarato dalla sorgente principale
    this.sourceIds = [...this.inst.values()].filter((i) => i.def.source).map((i) => i.id);
    const main = this.inst.get(this.sourceIds.find((id) => this.inst.get(id).type === 'supply')) || this.inst.get(this.sourceIds.find((id) => this.inst.get(id).type === 'genset')) || this.inst.get(this.sourceIds[0]);
    const sys = main?.def.system ? main.def.system(main.params) : { ...DEFAULT_SYS };
    this.env.sys = { ...DEFAULT_SYS, ...sys, fBus: sys.f };
    this.wires = project.wires.map((w) => ({ id: w.id, a: w.a, b: w.b, section: w.section, n: w.n || 1, fault: w.fault, len: this.lengthOf(w) }));
    this.dirty = true;
  }

  // ── Costruzione della rete ────────────────────────────────────────────────────────
  build() {
    const nodes = new Map();
    let n = 0;
    const idx = (key) => {
      let i = nodes.get(key);
      if (i === undefined) {
        i = n++;
        nodes.set(key, i);
      }
      return i;
    };
    const els = [];
    const byKey = new Map();

    for (const inst of this.inst.values()) {
      const def = inst.def;
      if (!def.elements) continue;
      const list = def.elements(inst, this.env);
      const map = (t) => (t === 'GND' ? -1 : idx(inst.id + '.' + t));
      for (const e of list) {
        if (!e) continue;
        const key = inst.id + '/' + e.name;
        let el;
        if (e.kind === 'SW') {
          if (!e.closed) {
            byKey.set(key, { kind: 'OPEN', a: map(e.a), b: map(e.b) });
            continue;
          }
          el = { kind: 'Y', a: map(e.a), b: map(e.b), y: C(1 / R_CONTACT, 0), lowZ: true };
        } else if (e.kind === 'Z') {
          const d = e.z.re * e.z.re + e.z.im * e.z.im;
          el = { kind: 'Y', a: map(e.a), b: map(e.b), y: C(e.z.re / d, -e.z.im / d), lowZ: d < 1e6 };
        } else if (e.kind === 'SRC') {
          const y = cinv(e.zs);
          el = { kind: 'N', a: map(e.a), b: map(e.b), y, is: cmul(e.e, y) };
        } else if (e.kind === 'XF') {
          el = { kind: 'T', p1: map(e.p1), p2: map(e.p2), s1: map(e.s1), s2: map(e.s2), n: e.n };
        } else continue;
        el.key = key;
        els.push(el);
        byKey.set(key, el);
      }
    }

    for (const w of this.wires) {
      if (!this.inst.has(w.a.c) || !this.inst.has(w.b.c)) continue;
      const a = idx(w.a.c + '.' + w.a.t);
      const b = idx(w.b.c + '.' + w.b.t);
      const key = 'wire/' + w.id;
      if (w.fault === 'open') {
        byKey.set(key, { kind: 'OPEN', a, b });
        continue;
      }
      const R = Math.max(1e-4, (RHO_CU * Math.max(0.05, w.len)) / ((w.section || 1.5) * (w.n || 1))) + (w.fault === 'loose' ? 2.5 : 0);
      const el = { kind: 'Y', a, b, y: C(1 / R, 0), key, R };
      els.push(el);
      byKey.set(key, el);
    }

    // Isole di rete non collegate a terra (es. componenti non alimentati): riferimento ad alta impedenza
    const G = n;
    const uf = new UnionFind(n + 1);
    const u = (i) => (i < 0 ? G : i);
    for (const e of els) {
      if (e.kind === 'T') {
        uf.union(u(e.p1), u(e.p2));
        uf.union(u(e.s1), u(e.s2));
      } else uf.union(u(e.a), u(e.b));
    }
    const gRoot = uf.find(G);
    const done = new Set();
    for (let i = 0; i < n; i++) {
      const r = uf.find(i);
      if (r === gRoot || done.has(r)) continue;
      done.add(r);
      els.push({ kind: 'Y', a: i, b: -1, y: C(1e-6, 0), key: '#ref' + i });
    }

    // Isole di potenza (sbarre): nodi uniti solo da conduttori, contatti chiusi, avvolgimenti e impedenze
    // basse (sotto 1 kΩ). Le resistenze di isolamento verso terra e i carichi ad alta impedenza non uniscono
    // due sbarre: così due semisbarre con il congiuntore aperto, o la sbarra di emergenza dietro l'ATS,
    // risultano isole distinte anche se condividono il PE.
    const pw = new UnionFind(n);
    for (const e of els) {
      if (e.kind === 'T') {
        if (e.p1 >= 0 && e.p2 >= 0) pw.union(e.p1, e.p2);
        if (e.s1 >= 0 && e.s2 >= 0) pw.union(e.s1, e.s2);
        continue;
      }
      if (e.a < 0 || e.b < 0) continue;
      if (e.kind === 'N' || e.R !== undefined || e.lowZ) pw.union(e.a, e.b);
    }
    const root = new Int32Array(n);
    for (let i = 0; i < n; i++) root[i] = pw.find(i);
    return { n, nodes, els, byKey, root };
  }

  // ── Isole di rete, sbarre e sorgenti ──────────────────────────────────────────────
  /** Radice dell'isola di rete (insieme di nodi collegati) a cui appartiene un morsetto; -1 se non in rete */
  islandOf(compId, term) {
    const i = this.net?.nodes.get(compId + '.' + term);
    return i === undefined ? -1 : this.net.root[i];
  }

  /** Stato della sbarra alimentata da generatori a cui è collegato il morsetto (null se alimentata dalla rete) */
  busAt(compId, term) {
    const r = this.islandOf(compId, term);
    return r < 0 ? null : this.bus.get(r) || null;
  }

  /**
   * Aggiorna le sbarre: per ogni isola con gruppi elettrogeni in parallelo calcola carico complessivo e
   * frequenza (rete in isola: oltre la potenza nominale il regolatore non tiene e la frequenza cala).
   */
  updateBuses() {
    this.bus = new Map();
    const fn = this.env.sys.f;
    for (const inst of this.inst.values()) {
      if (inst.type !== 'genset' || !inst.state.running || !inst.state.closed) continue;
      const r = this.islandOf(inst.id, 'L1');
      if (r < 0) continue;
      let b = this.bus.get(r);
      if (!b) this.bus.set(r, (b = { f: fn, loading: 0, S: 0, Sn: 0, gens: [] }));
      b.gens.push(inst.id);
      b.S += inst.state.S || 0;
      b.Sn += inst.params.Sn * 1000;
    }
    let fmin = fn;
    for (const b of this.bus.values()) {
      b.loading = b.Sn ? b.S / b.Sn : 0;
      b.f = fn * Math.max(0.85, 1 - 0.04 * Math.max(0, b.loading - 1));
      fmin = Math.min(fmin, b.f);
    }
    this.env.sys.fBus = fmin;
  }

  /** Corrente complessiva che rientra dalla terra attraverso i dispersori delle sorgenti (= corrente di guasto a terra) */
  earthLeakage() {
    let sum = 0;
    for (const id of this.sourceIds) sum += cabs(this.I(id + '/re'));
    return sum;
  }

  /**
   * Resistenza di isolamento verso massa “misurata”: tensione del conduttore più vicino a massa diviso la
   * corrente che rientra dalla terra (come fa un controllore di isolamento). Infinity a rete sana.
   */
  /** Sorgenti e trasformatori con il neutro BT isolato (sistema IT): nodo del centro stella da cui si misura l'isolamento */
  itStars() {
    const out = [];
    for (const inst of this.inst.values()) {
      if (inst.type === 'mtx' && inst.params.earthBT === 'IT') out.push({ inst, node: inst.id + '.#n2', Rins: inst.params.Rins || 200 });
    }
    if (out.length) return out; // con i trasformatori MT/BT il sistema BT è deciso dal loro secondario
    for (const id of this.sourceIds) {
      const inst = this.inst.get(id);
      if (inst?.params.earth === 'IT') out.push({ inst, node: inst.id + (inst.type === 'supply' ? '.#s' : '.#g'), Rins: inst.params.Rins || 200 });
    }
    return out;
  }

  insulationResistance() {
    if (!this.net) return Infinity;
    const src = this.itStars()[0];
    if (!src) return Infinity;
    const star = this.net.nodes.get(src.node);
    if (star === undefined) return Infinity;
    // rete passiva (generatori a tensione nulla) + iniezione di 1 A tra il centro stella e la massa
    const els = this.net.els.map((e) => (e.kind === 'N' ? { ...e, is: ZERO } : e));
    els.push({ kind: 'N', a: star, b: -1, y: C(1e-12, 0), is: C(1, 0) });
    const res = solveNetwork(this.net.n, els);
    if (!res.ok) return Infinity;
    const v = Math.hypot(res.v[2 * star], res.v[2 * star + 1]);
    return v > 5e6 ? Infinity : v; // R = V / 1 A
  }

  /** Resistenza di isolamento verso terra della rete sana (sorgenti a neutro isolato in parallelo), Infinity se il neutro è a terra */
  insulationBase() {
    let g = 0;
    for (const x of this.itStars()) g += 1 / (x.Rins * 1000);
    return g > 0 ? 1 / g : Infinity;
  }

  /** C'è un'altra sorgente in servizio (per l'avviamento automatico del gruppo di emergenza)? */
  anyOtherSourceLive(exceptId) {
    for (const id of this.sourceIds) {
      if (id === exceptId) continue;
      const inst = this.inst.get(id);
      const s = inst.state;
      const live = inst.type === 'supply' ? s.on && !s.limiter : inst.type === 'mtin' ? s.on : inst.type === 'shore' ? s.closed : s.running && s.closed;
      if (live) return true;
    }
    return false;
  }

  /** Accende/spegne tutte le sorgenti (arrivo linea: contatore; gruppi: avvio + sincronizzazione + chiusura) */
  setPower(on, { settle = true } = {}) {
    for (const id of this.sourceIds) {
      const inst = this.inst.get(id);
      if (inst.def.setPower) inst.def.setPower(inst, on);
      else inst.state.on = on;
    }
    if (settle) this.settle();
  }

  /** Riassunto dello stato di alimentazione per l'interfaccia (contatore o centrale di bordo) */
  powerState() {
    const sup = this.inst.get(this.sourceIds.find((id) => this.inst.get(id).type === 'supply'));
    if (sup) {
      const s = sup.state;
      return { kind: 'supply', on: s.on && !s.limiter, fault: s.limiter, P: s.P, kWh: s.kWh, I: s.I, V: this.mainVoltage(), label: s.limiter ? 'Contatore distaccato' : s.on ? 'Impianto alimentato' : 'Impianto non alimentato', action: s.limiter ? 'Riarma contatore' : s.on ? 'Scollega impianto' : 'Alimenta impianto' };
    }
    const mt = this.inst.get(this.sourceIds.find((id) => this.inst.get(id).type === 'mtin'));
    if (mt) {
      const s = mt.state;
      return { kind: 'mtin', on: s.on, fault: false, P: s.P, kWh: s.kWh, I: s.I, V: this.mainVoltage(), label: s.on ? 'Consegna MT in tensione' : 'Consegna MT fuori tensione', action: s.on ? 'Togli tensione alla consegna' : 'Dai tensione alla consegna' };
    }
    const gens = this.sourceIds.map((id) => this.inst.get(id)).filter((i) => i.type === 'genset');
    const shores = this.sourceIds.map((id) => this.inst.get(id)).filter((i) => i.type === 'shore' && i.state.closed);
    if (!gens.length && !shores.length) return { kind: 'none', on: false, fault: false, P: 0, kWh: 0, I: [0, 0, 0], V: 0, label: 'Nessuna sorgente', action: 'Alimenta impianto' };
    if (!gens.some((g) => g.state.running && g.state.closed) && shores.length) {
      const sh = shores[0].state;
      return { kind: 'genset', on: true, fault: false, P: sh.P, kWh: sh.kWh, I: sh.I, V: this.mainVoltage(), label: 'Alimentazione dalla banchina', action: 'Avvia la centrale', fBus: this.env.sys.fBus };
    }
    const live = gens.filter((g) => g.state.running && g.state.closed);
    const fault = gens.some((g) => g.state.trip);
    const I = [0, 1, 2].map((k) => live.reduce((m, g) => Math.max(m, g.state.I?.[k] || 0), 0));
    const P = live.reduce((a, g) => a + (g.state.P || 0), 0);
    const kWh = gens.reduce((a, g) => a + (g.state.kWh || 0), 0);
    const n = live.length;
    const label = fault ? 'Gruppo scattato' : n === 1 ? 'Un gruppo in servizio' : n > 1 ? n + ' gruppi in parallelo' : gens.some((g) => g.state.running) ? 'Gruppo in moto, sbarra aperta' : 'Centrale ferma';
    return { kind: 'genset', on: n > 0, fault, P, kWh, I, V: this.mainVoltage(), label, action: n ? 'Ferma la centrale' : 'Avvia la centrale', fBus: this.env.sys.fBus };
  }

  /** Tensione fase-neutro ai morsetti della sorgente principale (o della prima sbarra in tensione) */
  mainVoltage() {
    const sup = this.inst.get(this.sourceIds.find((id) => this.inst.get(id).type === 'supply'));
    if (sup) return this.measureV({ c: sup.id, t: 'L1' }, { c: sup.id, t: 'N' });
    let best = 0;
    for (const id of this.sourceIds) {
      const inst = this.inst.get(id);
      // le sorgenti MT non hanno il neutro: tensione di fase ricavata dalla concatenata
      best = Math.max(best, inst.type === 'mtin' ? this.measureV({ c: id, t: 'L1' }, { c: id, t: 'L2' }) / Math.sqrt(3) : this.measureV({ c: id, t: 'L1' }, { c: id, t: 'N' }));
    }
    return best;
  }

  solve() {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const net = this.build();
    const res = solveNetwork(net.n, net.els);
    this.net = net;
    this.res = res;
    this.stats.solves++;
    this.stats.nodes = net.n;
    this.stats.lastMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    if (!res.ok && !this.muted) this.emit({ level: 'error', text: 'La rete non è risolvibile (configurazione degenere).' });
  }

  // ── Letture ───────────────────────────────────────────────────────────────────────
  Vnode(i) {
    if (i < 0 || !this.res || !this.res.ok) return ZERO;
    return C(this.res.v[2 * i], this.res.v[2 * i + 1]);
  }
  V(key) {
    if (!this.net) return ZERO;
    const i = this.net.nodes.get(key);
    return i === undefined ? ZERO : this.Vnode(i);
  }
  I(key) {
    if (!this.net || !this.res || !this.res.ok) return ZERO;
    const e = this.net.byKey.get(key);
    if (!e || e.kind === 'OPEN') return ZERO;
    if (e.kind === 'Y') return cmul(csub(this.Vnode(e.a), this.Vnode(e.b)), e.y);
    if (e.kind === 'N') return csub(e.is, cmul(csub(this.Vnode(e.a), this.Vnode(e.b)), e.y));
    if (e.kind === 'T') {
      const k = this.res.extraIndex.get(e);
      return C(this.res.x[2 * k], this.res.x[2 * k + 1]);
    }
    return ZERO;
  }
  terminalV(compId, term) {
    return this.V(compId + '.' + term);
  }
  wireCurrent(wireId) {
    return this.I('wire/' + wireId);
  }
  /** Tensione (modulo) tra due morsetti qualsiasi */
  measureV(a, b) {
    return cabs(csub(this.V(a.c + '.' + a.t), this.V(b.c + '.' + b.t)));
  }

  ctxFor(inst) {
    if (!inst._ctx) {
      const sim = this;
      const pre = inst.id + '.';
      const preE = inst.id + '/';
      inst._ctx = {
        V: (t) => sim.V(pre + t),
        Vd: (a, b) => csub(sim.V(pre + a), sim.V(pre + b)),
        I: (name) => sim.I(preE + name),
        env: sim.env,
        sim,
        emit: (e) => sim.emit({ ...e, comp: inst.id, tag: inst.tag }),
      };
    }
    return inst._ctx;
  }

  // ── Evoluzione ────────────────────────────────────────────────────────────────────
  settle() {
    let changed = true;
    let iter = 0;
    while (changed && iter < MAX_ITER) {
      this.solve();
      changed = false;
      for (const inst of this.inst.values()) {
        const ev = inst.def.evaluate;
        if (ev && ev(inst, this.ctxFor(inst))) changed = true;
      }
      iter++;
    }
    this.unstable = changed;
    if (changed) {
      this.solve();
      if (!this.muted) this.emit({ level: 'warn', text: 'Circuito instabile: un contattore o un relè si eccita e si diseccita di continuo (ronzio). Controlla il circuito di comando.', sound: 'hum' });
    }
    this.updateBuses();
    this.dirty = false;
    this.version++;
    return iter;
  }

  step(dt) {
    if (this.dirty) this.settle();
    this.env.time += dt;
    let ch = false;
    for (const inst of this.inst.values()) {
      const tk = inst.def.tick;
      if (tk && tk(inst, this.ctxFor(inst), dt)) ch = true;
    }
    if (ch) this.settle();
    return ch;
  }

  interact(compId, action, phase = 'click') {
    const inst = this.inst.get(compId);
    const fn = inst?.def.interact?.[action];
    if (!fn) return null;
    const r = fn(inst, this.ctxFor(inst), phase);
    this.settle();
    return r;
  }

  markDirty() {
    this.dirty = true;
  }

  getInst(id) {
    return this.inst.get(id);
  }

  // ── Eventi ────────────────────────────────────────────────────────────────────────
  emit(e) {
    if (this.muted) return;
    const ev = { t: this.env.time, level: 'info', ...e };
    if (ev.level !== 'trace') {
      this.events.push(ev);
      if (this.events.length > 200) this.events.shift();
    }
    for (const fn of this.listeners) fn(ev);
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ── Prove funzionali “what-if” (per le verifiche delle esercitazioni) ─────────────
  snapshot() {
    const s = new Map();
    for (const [id, inst] of this.inst) s.set(id, { state: structuredClone(inst.state), view: { ...inst.view } });
    return { s, env: { ...this.env } };
  }
  restore(snap) {
    for (const [id, v] of snap.s) {
      const inst = this.inst.get(id);
      if (inst) {
        inst.state = v.state;
        inst.view = v.view;
      }
    }
    Object.assign(this.env, snap.env);
    this.settle();
  }

  /**
   * Esegue una sequenza di azioni in isolamento e ripristina lo stato alla fine.
   * steps: { power:true } | { act:[id, action, phase] } | { set:[id, patch] } | { wait:s } | { check:(sim)=>any }
   */
  scenario(steps) {
    const snap = this.snapshot();
    const paramRestore = [];
    this.muted++;
    const results = [];
    try {
      this.settle();
      for (const st of steps) {
        if (st.params) {
          const [id, patch] = st.params;
          const inst = this.inst.get(id);
          if (inst) {
            paramRestore.push([inst, { ...inst.params }]);
            Object.assign(inst.params, patch);
          }
          this.settle();
        } else if (st.power !== undefined) {
          this.setPower(st.power);
        } else if (st.act) {
          const [id, action, phase] = st.act;
          const inst = this.inst.get(id);
          const fn = inst?.def.interact?.[action];
          if (fn) fn(inst, this.ctxFor(inst), phase || 'click');
          this.settle();
        } else if (st.set) {
          const [id, patch] = st.set;
          const inst = this.inst.get(id);
          if (inst) Object.assign(inst.state, patch);
          this.settle();
        } else if (st.env) {
          // ambiente (es. luminosità esterna per il crepuscolare); ripristinato dallo snapshot
          Object.assign(this.env, st.env);
          this.markDirty();
          this.settle();
        } else if (st.wait) {
          let t = st.wait;
          while (t > 0) {
            const dt = Math.min(0.1, t);
            this.step(dt);
            t -= dt;
          }
        } else if (st.check) {
          results.push(st.check(this));
        }
      }
    } finally {
      for (const [inst, p] of paramRestore.reverse()) inst.params = p;
      this.muted--;
      this.restore(snap);
    }
    return results;
  }
}
