// Alimentazione: punto di consegna (rete + contatore con limitatore), collettore di terra, morsetti.
import { source, imp, res, sw, T, P } from './common.js';
import { csub, cabs, power } from '../../sim/complex.js';
import { SYSTEMS, fmtV, fmtA, fmtW, fmt } from '../../sim/norms.js';

const PHASES = ['L1', 'L2', 'L3'];

export const supply = {
  type: 'supply',
  name: 'Punto di consegna — arrivo linea',
  short: 'Arrivo linea',
  family: 'alimentazione',
  mount: 'din',
  modules: 3,
  fixed: true,
  tag: 'XA',
  help:
    'La linea arriva dal contatore del distributore. Il contatore limita la potenza prelevabile ' +
    '(potenza contrattuale + 10%): oltre questo valore, dopo un breve ritardo, stacca l’alimentazione. ' +
    'Il sistema di distribuzione dice come è messo a terra il neutro: TT e TN-S a terra, IT isolato (bordo nave, ospedali).',
  params: [
    P.select('sys', 'Sistema di alimentazione', [
      { value: '1F', label: 'Monofase 230 V (L-N)' },
      { value: '3F', label: 'Trifase 400 V (L1-L2-L3-N)' },
    ], '1F'),
    P.select('net', 'Tensione e frequenza', Object.values(SYSTEMS).map((s) => ({ value: s.id, label: s.label })), 'it230'),
    P.select('earth', 'Sistema di distribuzione', [
      { value: 'TT', label: 'TT — utenza alimentata in BT con dispersore proprio' },
      { value: 'TN-S', label: 'TN-S — utenza con cabina propria (PE separato)' },
      { value: 'IT', label: 'IT — neutro isolato da terra (bordo nave, locali medici)' },
    ], 'TT'),
    P.select('Pc', 'Potenza contrattuale', [3, 4.5, 6, 10, 15, 20, 30], 3, { unit: 'kW' }),
    P.select('Icc', 'Corrente di cortocircuito presunta', [1.5, 3, 4.5, 6, 10], 4.5, { unit: 'kA' }),
    P.number('Re', 'Resistenza di terra Re', 1, 500, 1, 20, 'Ω', {
      help: 'Resistenza del dispersore dell’impianto. Nel sistema TT deve valere Re · IΔn ≤ 50 V.',
    }),
    P.number('Rins', 'Resistenza di isolamento della rete (IT)', 5, 1000, 5, 200, 'kΩ', {
      teacher: true,
      help: 'Solo nel sistema IT: isolamento verso terra della rete sana, che limita la corrente del primo guasto.',
    }),
  ],
  terminals: (p) => {
    const list = p.sys === '3F'
      ? [T('L1', 'L1', 'L', 'bottom', 0.12, 'load'), T('L2', 'L2', 'L', 'bottom', 0.32, 'load'), T('L3', 'L3', 'L', 'bottom', 0.52, 'load')]
      : [T('L1', 'L', 'L', 'bottom', 0.2, 'load')];
    list.push(T('N', 'N', 'N', 'bottom', p.sys === '3F' ? 0.72 : 0.5, 'load'));
    list.push(T('PE', 'PE', 'PE', 'bottom', p.sys === '3F' ? 0.9 : 0.8, 'load'));
    return list;
  },
  init: () => ({ on: false, limiter: false, over: 0, kWh: 0, P: 0, Q: 0, I: [0, 0, 0] }),
  elements(inst) {
    const p = inst.params;
    const s = inst.state;
    const Vph = (SYSTEMS[p.net] || SYSTEMS.it230).Vph;
    const V = s.on && !s.limiter ? Vph : 0;
    const Icc = p.Icc * 1000;
    const els = [];
    let zs;
    if (p.sys === '3F') {
      const z = Vph / Icc; // corrente di cortocircuito trifase simmetrica
      zs = { re: z * 0.7071, im: z * 0.7071 };
      PHASES.forEach((t, k) => els.push(source('s' + t, t, '#s', V, -120 * k, zs)));
    } else {
      const z = Vph / Icc / 2; // anello di guasto fase-neutro
      zs = { re: z * 0.7071, im: z * 0.7071 };
      els.push(source('sL1', 'L1', '#s', V, 0, zs));
    }
    els.push(imp('zN', 'N', '#s', zs.re, zs.im));
    if (p.earth === 'IT') els.push(res('rins', '#s', 'GND', p.Rins * 1000)); // neutro isolato: solo l'isolamento della rete
    else els.push(res('rn', '#s', 'GND', 1.0)); // neutro a terra in cabina
    if (p.earth === 'TN-S') els.push(imp('zpe', 'PE', '#s', zs.re, zs.im));
    els.push(res('re', 'PE', 'GND', p.Re)); // dispersore dell'utente
    return els;
  },
  tick(inst, ctx, dt) {
    const p = inst.params;
    const s = inst.state;
    const vn = ctx.V('N');
    let Pt = 0;
    let Qt = 0;
    const phases = p.sys === '3F' ? PHASES : ['L1'];
    phases.forEach((t, k) => {
      const i = ctx.I('s' + t);
      const pw = power(csub(ctx.V(t), vn), i);
      Pt += pw.P;
      Qt += pw.Q;
      s.I[k] = cabs(i);
    });
    s.P = Pt;
    s.Q = Qt;
    s.kWh += (Math.max(0, Pt) * dt) / 3.6e6;
    if (!s.on || s.limiter) {
      s.over = 0;
      return false;
    }
    const Pc = p.Pc * 1000;
    if (Pt > Pc * 1.1) {
      s.over += dt;
      const delay = Pt > Pc * 1.27 ? 2 : 10;
      if (s.over >= delay) {
        s.limiter = true;
        s.over = 0;
        ctx.emit({
          level: 'warn',
          text: `Contatore: distacco per superamento della potenza disponibile (${fmtW(Pt)} prelevati, disponibili ${fmtW(Pc * 1.1)}). Riduci i carichi e riarma.`,
          sound: 'limiter',
        });
        return true;
      }
    } else {
      s.over = Math.max(0, s.over - dt);
    }
    return false;
  },
  interact: {
    power(inst) {
      const s = inst.state;
      if (s.limiter) {
        s.limiter = false;
        s.on = true;
        return { sound: 'switch-on', msg: 'Contatore riarmato' };
      }
      s.on = !s.on;
      return { sound: s.on ? 'switch-on' : 'switch-off' };
    },
  },
  readouts(inst, ctx) {
    const p = inst.params;
    const s = inst.state;
    const sys = SYSTEMS[p.net] || SYSTEMS.it230;
    const vln = cabs(csub(ctx.V('L1'), ctx.V('N')));
    const S = Math.hypot(s.P, s.Q);
    const out = [
      { label: 'Stato', value: s.limiter ? 'DISTACCATO (limitatore)' : s.on ? 'In servizio' : 'Spento', level: s.limiter ? 'error' : s.on ? 'ok' : 'off' },
      { label: 'Tensione L-N', value: fmtV(vln) },
      { label: 'Sistema', value: `${sys.Vph}/${sys.Vll} V · ${sys.f} Hz · ${p.earth}${p.earth === 'IT' ? ' (neutro isolato)' : ''}` },
    ];
    if (p.sys === '3F') {
      out.push({ label: 'Tensione L1-L2', value: fmtV(cabs(csub(ctx.V('L1'), ctx.V('L2')))) });
      out.push({ label: 'Correnti L1 · L2 · L3', value: s.I.map(fmtA).join(' · ') });
    } else {
      out.push({ label: 'Corrente', value: fmtA(s.I[0]) });
    }
    out.push({ label: 'Potenza attiva', value: fmtW(s.P) });
    out.push({ label: 'Potenza disponibile', value: fmtW(p.Pc * 1100), level: s.P > p.Pc * 1100 ? 'warn' : undefined });
    out.push({ label: 'Fattore di potenza', value: S > 1 ? fmt(s.P / S, 2) : '—' });
    out.push({ label: 'Energia prelevata', value: `${fmt(s.kWh, 3)} kWh` });
    return out;
  },
  paths: () => [],
  source: true,
  system: (p) => ({ ...(SYSTEMS[p.net] || SYSTEMS.it230), earth: p.earth }),
  setPower(inst, on) {
    inst.state.on = on;
    if (on) inst.state.limiter = false;
  },
};

/** Collettore (barra) di terra: tutti i morsetti allo stesso potenziale */
export const pebar = {
  type: 'pebar',
  name: 'Collettore di terra (barra PE)',
  short: 'Barra PE',
  family: 'alimentazione',
  mount: 'fixed',
  fixedAt: 'pebar',
  fixed: true,
  tag: 'PE',
  help: 'Nodo principale di terra del quadro: qui arriva il conduttore di terra dal dispersore e partono i conduttori di protezione (PE) verso le utenze.',
  params: [],
  terminals: () => {
    const list = [T('IN', 'PE', 'PE', 'top', 0.05)];
    for (let i = 1; i <= 8; i++) list.push(T('PE' + i, String(i), 'PE', 'top', 0.05 + (i * 0.9) / 8.4));
    return list;
  },
  init: () => ({}),
  elements: () => {
    const els = [sw('in', 'IN', '#bar', true)];
    for (let i = 1; i <= 8; i++) els.push(sw('b' + i, 'PE' + i, '#bar', true));
    return els;
  },
  paths: () => {
    const p = [];
    for (let i = 1; i <= 8; i++) p.push(['IN', 'PE' + i]);
    return p;
  },
};

/** Morsetto passante componibile su guida DIN */
export const term = {
  type: 'term',
  name: 'Morsetto passante',
  short: 'Morsetto',
  family: 'morsetti',
  mount: 'din',
  modules: 0.5,
  tag: 'X',
  help: 'Morsetto componibile per la distribuzione ordinata dei conduttori. Il colore identifica la funzione: grigio (fase), blu (neutro), giallo-verde (terra).',
  params: [
    P.select('func', 'Funzione', [
      { value: 'L', label: 'Fase (grigio)' },
      { value: 'N', label: 'Neutro (blu)' },
      { value: 'PE', label: 'Terra (giallo-verde)' },
    ], 'L'),
  ],
  terminals: (p) => [T('a', '1', p.func, 'top', 0.5), T('b', '2', p.func, 'bottom', 0.5)],
  init: () => ({}),
  elements: () => [sw('c', 'a', 'b', true)],
  paths: () => [['a', 'b']],
};
