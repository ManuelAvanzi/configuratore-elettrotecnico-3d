// Simulatore dell'impianto: costruisce la rete dai componenti e dai cablaggi, la risolve (MNA complessa),
// fa evolvere gli stati (bobine, protezioni, temporizzatori) fino alla stabilità e integra nel tempo
// le grandezze lente (bimetalli, timer, avviamento motori, limitatore del contatore).
import { solveNetwork } from './mna.js';
import { ZERO, C, cabs, csub, cmul, cinv } from './complex.js';
import { RHO_CU, R_CONTACT } from './norms.js';
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
    this.env = { lux: 400, time: 0 };
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
    this.wires = project.wires.map((w) => ({ id: w.id, a: w.a, b: w.b, section: w.section, fault: w.fault, len: this.lengthOf(w) }));
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
          el = { kind: 'Y', a: map(e.a), b: map(e.b), y: C(1 / R_CONTACT, 0) };
        } else if (e.kind === 'Z') {
          const d = e.z.re * e.z.re + e.z.im * e.z.im;
          el = { kind: 'Y', a: map(e.a), b: map(e.b), y: C(e.z.re / d, -e.z.im / d) };
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
      const R = Math.max(1e-4, (RHO_CU * Math.max(0.05, w.len)) / (w.section || 1.5)) + (w.fault === 'loose' ? 2.5 : 0);
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
    return { n, nodes, els, byKey };
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
          const sup = [...this.inst.values()].find((i) => i.type === 'supply');
          if (sup) Object.assign(sup.state, { on: st.power, limiter: false });
          this.settle();
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
