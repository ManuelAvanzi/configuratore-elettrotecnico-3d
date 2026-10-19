// Apparecchi di manovra e protezione: sezionatori, magnetotermici, differenziali, magnetotermici-differenziali, relè termico.
import { sw, res, T, P, thermalUpdate, clamp } from './common.js';
import { cabs, cadd, ZERO } from '../../sim/complex.js';
import { CURVES, sysOf, fmtA, fmt } from '../../sim/norms.js';

// Poli standard (lato alimentazione in alto, lato carico in basso)
const POLE = {
  L1: { top: '1', bottom: '2', lt: '1', lb: '2', role: 'L' },
  L2: { top: '3', bottom: '4', lt: '3', lb: '4', role: 'L' },
  L3: { top: '5', bottom: '6', lt: '5', lb: '6', role: 'L' },
  N: { top: 'N1', bottom: 'N2', lt: 'N', lb: 'N', role: 'N' },
};

function poleTerminals(poles) {
  const n = poles.length;
  return poles.flatMap((k, i) => {
    const pl = POLE[k];
    const x = (i + 0.5) / n;
    return [T(pl.top, pl.lt, pl.role, 'top', x, 'line'), T(pl.bottom, pl.lb, pl.role, 'bottom', x, 'load')];
  });
}

const polePaths = (poles) => poles.map((k) => [POLE[k].top, POLE[k].bottom]);
const poleElements = (poles, closed) => poles.map((k, i) => sw('p' + i, POLE[k].top, POLE[k].bottom, closed));

function leverToggle(inst) {
  const s = inst.state;
  if (s.on) {
    s.on = false;
    s.tripped = false;
    s.cause = null;
    return { sound: 'switch-off' };
  }
  if (s.damaged) return { level: 'error', msg: `${inst.tag}: apparecchio danneggiato dal cortocircuito (potere di interruzione insufficiente). Usa “Sostituisci”.` };
  if ((s.theta || 0) > 0.85) return { level: 'warn', msg: `${inst.tag}: il bimetallo è ancora caldo, attendi qualche secondo prima di riarmare.` };
  s.on = true;
  s.tripped = false;
  s.cause = null;
  return { sound: 'switch-on' };
}

function replace(inst) {
  Object.assign(inst.state, inst.def.init(inst.params), { on: false });
  return { msg: `${inst.tag}: apparecchio sostituito.`, sound: 'switch-off' };
}

const pdiParam = P.select('pdi', 'Potere di interruzione (PdI)', [4.5, 6, 10, 15], 6, {
  unit: 'kA',
  help: 'Massima corrente di cortocircuito che l’interruttore sa interrompere: deve essere ≥ Icc presunta nel punto di installazione.',
});
const curveParam = P.select('curve', 'Curva di intervento', [
  { value: 'B', label: 'B (3–5 In) — carichi resistivi, linee lunghe' },
  { value: 'C', label: 'C (5–10 In) — uso generale' },
  { value: 'D', label: 'D (10–20 In) — forti correnti di spunto (motori, trasformatori)' },
], 'C');

// ── Magnetotermico (logica condivisa) ─────────────────────────────────────────────────
function mcbEvaluate(inst, ctx, protectedIdx) {
  const s = inst.state;
  const p = inst.params;
  if (!s.on) {
    s.I = 0;
    return false;
  }
  let imax = 0;
  for (const i of protectedIdx) imax = Math.max(imax, cabs(ctx.I('p' + i)));
  s.I = imax;
  s.Ipeak = Math.max(s.Ipeak || 0, imax);
  if (imax >= CURVES[p.curve].sim * p.In) {
    s.on = false;
    s.tripped = true;
    s.cause = 'magnetico';
    s.lastFault = imax;
    const damaged = imax > p.pdi * 1000;
    if (damaged) s.damaged = true;
    ctx.emit({
      level: 'error',
      text: damaged
        ? `${inst.tag}: cortocircuito di ${fmtA(imax)} oltre il potere di interruzione (${p.pdi} kA) — apparecchio danneggiato!`
        : `${inst.tag}: intervento MAGNETICO — corrente ${fmtA(imax)} (${fmt(imax / p.In, 1)} × In): cortocircuito o forte sovracorrente.`,
      sound: 'trip-short',
    });
    return true;
  }
  return false;
}

function mcbTick(inst, ctx, dt) {
  const s = inst.state;
  const p = inst.params;
  const x = s.on ? (s.I || 0) / p.In : 0;
  if (thermalUpdate(s, x, dt, 170) && s.on) {
    s.on = false;
    s.tripped = true;
    s.cause = 'termico';
    ctx.emit({
      level: 'warn',
      text: `${inst.tag}: intervento TERMICO per sovraccarico — ${fmtA(s.I)} su In = ${p.In} A (${fmt(x, 2)} × In).`,
      sound: 'trip',
    });
    return true;
  }
  return false;
}

function stateBadge(s) {
  if (s.damaged) return { label: 'Stato', value: 'DANNEGGIATO', level: 'error' };
  if (s.tripped) return { label: 'Stato', value: `SCATTATO (${s.cause})`, level: 'error' };
  return { label: 'Stato', value: s.on ? 'Chiuso (ON)' : 'Aperto (OFF)', level: s.on ? 'ok' : 'off' };
}

function makeMCB({ type, name, short, poles, prot, modules, inOptions, defIn, help }) {
  const protectedIdx = poles.map((k, i) => (prot.includes(k) ? i : -1)).filter((i) => i >= 0);
  return {
    type,
    name,
    short,
    family: 'protezione',
    mount: 'din',
    modules,
    tag: 'Q',
    help,
    params: [P.select('In', 'Corrente nominale In', inOptions, defIn, { unit: 'A' }), curveParam, pdiParam],
    terminals: () => poleTerminals(poles),
    init: () => ({ on: true, tripped: false, cause: null, theta: 0, damaged: false, I: 0 }),
    elements: (inst) => poleElements(poles, inst.state.on),
    evaluate: (inst, ctx) => mcbEvaluate(inst, ctx, protectedIdx),
    tick: mcbTick,
    interact: { toggle: leverToggle, replace },
    protection: (p) => ({ kind: 'mcb', In: p.In, curve: p.curve, pdi: p.pdi, poles: polePaths(poles), overcurrent: true }),
    paths: () => polePaths(poles),
    readouts(inst) {
      const s = inst.state;
      const p = inst.params;
      return [
        stateBadge(s),
        { label: 'Corrente (fase)', value: fmtA(s.I || 0) },
        { label: 'Carico rispetto a In', value: `${fmt(((s.I || 0) / p.In) * 100, 0)} %`, level: (s.I || 0) > 1.13 * p.In ? 'warn' : undefined },
        { label: 'Riscaldamento bimetallo', value: `${fmt(clamp(s.theta || 0, 0, 1) * 100, 0)} %`, bar: clamp(s.theta || 0, 0, 1) },
        { label: 'Soglia magnetica', value: `${fmt(CURVES[p.curve].sim * p.In, 0)} A (curva ${p.curve})` },
      ];
    },
  };
}

export const mcb1pn = makeMCB({
  type: 'mcb1pn',
  name: 'Interruttore magnetotermico 1P+N',
  short: 'Magnetotermico 1P+N',
  poles: ['L1', 'N'],
  prot: ['L1'],
  modules: 2,
  inOptions: [6, 10, 13, 16, 20, 25, 32, 40],
  defIn: 16,
  help: 'Protegge la linea dal sovraccarico (sganciatore termico, a tempo inverso) e dal cortocircuito (sganciatore magnetico, istantaneo). Deve valere Ib ≤ In ≤ Iz.',
});

export const mcb3p = makeMCB({
  type: 'mcb3p',
  name: 'Interruttore magnetotermico 3P',
  short: 'Magnetotermico 3P',
  poles: ['L1', 'L2', 'L3'],
  prot: ['L1', 'L2', 'L3'],
  modules: 3,
  inOptions: [1, 2, 3, 4, 6, 10, 13, 16, 20, 25, 32, 40, 50, 63],
  defIn: 6,
  help: 'Protezione tripolare, tipica delle linee motore. Per i motori si usa la curva C o D per non intervenire sulla corrente di spunto.',
});

export const mcb4p = makeMCB({
  type: 'mcb4p',
  name: 'Interruttore magnetotermico 3P+N',
  short: 'Magnetotermico 3P+N',
  poles: ['L1', 'L2', 'L3', 'N'],
  prot: ['L1', 'L2', 'L3'],
  modules: 4,
  inOptions: [10, 16, 20, 25, 32, 40, 63, 80, 100, 125],
  defIn: 25,
  help: 'Interruttore generale di un quadro trifase con neutro (fino a 125 A per gli arrivi dei generatori di bordo).',
});

// ── Sezionatori ───────────────────────────────────────────────────────────────────────
function makeIsolator({ type, name, short, poles, modules }) {
  return {
    type,
    name,
    short,
    family: 'protezione',
    mount: 'din',
    modules,
    tag: 'Q',
    help: 'Interruttore di manovra-sezionatore: apre e chiude il circuito sotto carico e garantisce il sezionamento, ma NON protegge da sovraccarichi e cortocircuiti.',
    params: [P.select('In', 'Corrente nominale', [32, 40, 63, 80, 100, 125, 160], 40, { unit: 'A' })],
    terminals: () => poleTerminals(poles),
    init: () => ({ on: true }),
    elements: (inst) => poleElements(poles, inst.state.on),
    interact: { toggle: leverToggle },
    paths: () => polePaths(poles),
    protection: (p) => ({ kind: 'isolator', In: p.In, poles: polePaths(poles) }),
    readouts: (inst) => [stateBadge(inst.state)],
  };
}

export const isol2p = makeIsolator({ type: 'isol2p', name: 'Interruttore sezionatore 2P', short: 'Sezionatore 2P', poles: ['L1', 'N'], modules: 2 });
export const isol4p = makeIsolator({ type: 'isol4p', name: 'Interruttore sezionatore 4P', short: 'Sezionatore 4P', poles: ['L1', 'L2', 'L3', 'N'], modules: 4 });

// ── Differenziali ─────────────────────────────────────────────────────────────────────
const idnParam = P.select('IDn', 'Corrente differenziale IΔn', [
  { value: 0.01, label: '10 mA' },
  { value: 0.03, label: '30 mA' },
  { value: 0.1, label: '100 mA' },
  { value: 0.3, label: '300 mA' },
  { value: 0.5, label: '500 mA' },
], 0.03, { help: 'Il differenziale confronta le correnti che entrano ed escono: se la differenza (dispersione verso terra) supera la soglia, apre il circuito.' });
const rcdTypeParam = P.select('rtype', 'Tipo', [
  { value: 'AC', label: 'AC — correnti alternate' },
  { value: 'A', label: 'A — anche pulsanti (elettronica)' },
  { value: 'F', label: 'F — inverter monofase' },
], 'A');

function residual(ctx, n) {
  let sum = ZERO;
  for (let i = 0; i < n; i++) sum = cadd(sum, ctx.I('p' + i));
  return cabs(sum);
}

function rcdEvaluate(inst, ctx, n) {
  const s = inst.state;
  const p = inst.params;
  if (!s.on) {
    s.Id = 0;
    return false;
  }
  const id = residual(ctx, n);
  s.Id = id;
  if (id >= 0.8 * p.IDn) {
    s.on = false;
    s.tripped = true;
    s.cause = s.test ? 'test' : 'differenziale';
    ctx.emit({
      level: s.test ? 'info' : 'warn',
      text: s.test
        ? `${inst.tag}: prova con tasto T riuscita — il differenziale è intervenuto.`
        : `${inst.tag}: intervento DIFFERENZIALE — corrente di dispersione ${fmtA(id)} (soglia IΔn = ${fmtA(p.IDn)}).`,
      sound: 'trip',
    });
    return true;
  }
  return false;
}

function rcdTest(inst, ctx, phase) {
  inst.state.test = phase !== 'up';
  return phase === 'up' ? null : { sound: 'click' };
}

function testElement(inst, poles, env) {
  // Resistenza di prova tra fase lato carico e neutro lato alimentazione (bypassa il toroide)
  if (!inst.state.test || !inst.state.on) return null;
  const Rt = sysOf(env).Vph / (2.5 * inst.params.IDn);
  return res('test', POLE[poles[0]].bottom, POLE.N.top, Rt);
}

function makeRCD({ type, name, short, poles, modules }) {
  return {
    type,
    name,
    short,
    family: 'protezione',
    mount: 'din',
    modules,
    tag: 'Q',
    help: 'Interruttore differenziale puro: protegge le persone dai contatti indiretti (e come protezione addizionale dai diretti con IΔn ≤ 30 mA). Non protegge da sovraccarichi e cortocircuiti: va coordinato con un magnetotermico.',
    params: [P.select('In', 'Corrente nominale In', [25, 40, 63], 40, { unit: 'A' }), idnParam, rcdTypeParam],
    terminals: () => poleTerminals(poles),
    init: () => ({ on: true, tripped: false, cause: null, test: false, Id: 0 }),
    elements: (inst, env) => [...poleElements(poles, inst.state.on), testElement(inst, poles, env)],
    evaluate: (inst, ctx) => rcdEvaluate(inst, ctx, poles.length),
    interact: { toggle: leverToggle, test: rcdTest },
    protection: (p) => ({ kind: 'rcd', In: p.In, IDn: p.IDn, poles: polePaths(poles), overcurrent: false }),
    paths: () => polePaths(poles),
    readouts(inst) {
      const s = inst.state;
      const p = inst.params;
      return [
        stateBadge(s),
        { label: 'Corrente differenziale', value: fmtA(s.Id || 0), level: (s.Id || 0) > 0.5 * p.IDn ? 'warn' : undefined },
        { label: 'Soglia IΔn', value: fmtA(p.IDn) },
        { label: 'Tensione di contatto limite', value: `Re · IΔn ≤ 50 V` },
      ];
    },
  };
}

export const rcd2p = makeRCD({ type: 'rcd2p', name: 'Interruttore differenziale 2P', short: 'Differenziale 2P', poles: ['L1', 'N'], modules: 2 });
export const rcd4p = makeRCD({ type: 'rcd4p', name: 'Interruttore differenziale 4P', short: 'Differenziale 4P', poles: ['L1', 'L2', 'L3', 'N'], modules: 4 });

// ── Magnetotermico differenziale 1P+N ────────────────────────────────────────────────
export const rcbo1pn = {
  type: 'rcbo1pn',
  name: 'Interruttore magnetotermico-differenziale 1P+N',
  short: 'Magnetotermico-diff. 1P+N',
  family: 'protezione',
  mount: 'din',
  modules: 2,
  tag: 'Q',
  help: 'Riunisce in un solo apparecchio la protezione magnetotermica (sovraccarico e cortocircuito) e quella differenziale (dispersioni verso terra). Tipico come generale di un appartamento.',
  params: [P.select('In', 'Corrente nominale In', [6, 10, 16, 20, 25, 32], 25, { unit: 'A' }), curveParam, pdiParam, idnParam, rcdTypeParam],
  terminals: () => poleTerminals(['L1', 'N']),
  init: () => ({ on: true, tripped: false, cause: null, theta: 0, damaged: false, test: false, I: 0, Id: 0 }),
  elements: (inst, env) => [...poleElements(['L1', 'N'], inst.state.on), testElement(inst, ['L1', 'N'], env)],
  evaluate(inst, ctx) {
    if (mcbEvaluate(inst, ctx, [0])) return true;
    return rcdEvaluate(inst, ctx, 2);
  },
  tick: mcbTick,
  interact: { toggle: leverToggle, test: rcdTest, replace },
  protection: (p) => ({ kind: 'rcbo', In: p.In, curve: p.curve, pdi: p.pdi, IDn: p.IDn, poles: polePaths(['L1', 'N']), overcurrent: true }),
  paths: () => polePaths(['L1', 'N']),
  readouts(inst) {
    const s = inst.state;
    const p = inst.params;
    return [
      stateBadge(s),
      { label: 'Corrente (fase)', value: fmtA(s.I || 0) },
      { label: 'Corrente differenziale', value: fmtA(s.Id || 0), level: (s.Id || 0) > 0.5 * p.IDn ? 'warn' : undefined },
      { label: 'Riscaldamento bimetallo', value: `${fmt(clamp(s.theta || 0, 0, 1) * 100, 0)} %`, bar: clamp(s.theta || 0, 0, 1) },
    ];
  },
};

// ── Relè termico (protezione motore) ─────────────────────────────────────────────────
const IR_OPTIONS = [0.8, 1, 1.25, 1.6, 2, 2.5, 3.2, 4, 5, 6.3, 8, 10];

export const fr3 = {
  type: 'fr3',
  name: 'Relè termico di protezione motore',
  short: 'Relè termico',
  family: 'protezione',
  mount: 'din',
  modules: 3,
  tag: 'F',
  help: 'Protegge il motore dal sovraccarico: si regola sulla corrente di targa del motore (Ir). Quando interviene apre il contatto 95-96 (nel circuito di comando) e chiude 97-98 (segnalazione). È sensibile alla mancanza di una fase.',
  params: [P.select('Ir', 'Corrente di regolazione Ir', IR_OPTIONS, 2, { unit: 'A' })],
  terminals: () => [
    T('1', '1', 'L', 'top', 0.12, 'line'), T('3', '3', 'L', 'top', 0.3, 'line'), T('5', '5', 'L', 'top', 0.48, 'line'),
    T('95', '95', 'aux', 'top', 0.7), T('97', '97', 'aux', 'top', 0.88),
    T('2', '2', 'L', 'bottom', 0.12, 'load'), T('4', '4', 'L', 'bottom', 0.3, 'load'), T('6', '6', 'L', 'bottom', 0.48, 'load'),
    T('96', '96', 'aux', 'bottom', 0.7), T('98', '98', 'aux', 'bottom', 0.88),
  ],
  init: () => ({ tripped: false, theta: 0, I: [0, 0, 0] }),
  elements: (inst) => [
    sw('p0', '1', '2', true), sw('p1', '3', '4', true), sw('p2', '5', '6', true),
    sw('nc', '95', '96', !inst.state.tripped), sw('no', '97', '98', inst.state.tripped),
  ],
  evaluate(inst, ctx) {
    inst.state.I = [0, 1, 2].map((i) => cabs(ctx.I('p' + i)));
    return false;
  },
  tick(inst, ctx, dt) {
    const s = inst.state;
    const Ir = inst.params.Ir;
    const I = s.I;
    const imax = Math.max(...I);
    const imin = Math.min(...I);
    // Sensibilità alla mancanza di fase: squilibrio forte → intervento accelerato
    const phaseLoss = imax > 0.5 * Ir && imin < 0.1 * imax;
    const x = (imax / Ir) * (phaseLoss ? 1.3 : 1);
    if (thermalUpdate(s, x, dt, 180, 60) && !s.tripped) {
      s.tripped = true;
      ctx.emit({
        level: 'warn',
        text: phaseLoss
          ? `${inst.tag}: intervento per MANCANZA DI FASE (correnti ${I.map(fmtA).join(' · ')}).`
          : `${inst.tag}: intervento per SOVRACCARICO del motore — ${fmtA(imax)} con Ir = ${Ir} A.`,
        sound: 'trip',
      });
      return true;
    }
    return false;
  },
  interact: {
    reset(inst) {
      const s = inst.state;
      if (!s.tripped) return { msg: `${inst.tag}: il relè non è intervenuto.` };
      if (s.theta > 0.6) return { level: 'warn', msg: `${inst.tag}: attendi il raffreddamento prima del ripristino.` };
      s.tripped = false;
      return { sound: 'click', msg: `${inst.tag}: relè termico ripristinato.` };
    },
    trip(inst) {
      inst.state.tripped = true;
      inst.state.theta = 1;
      return { sound: 'trip', msg: `${inst.tag}: prova di intervento (tasto STOP/TEST).` };
    },
  },
  protection: (p) => ({ kind: 'thermal', In: p.Ir, poles: [['1', '2'], ['3', '4'], ['5', '6']], overcurrent: true, overloadOnly: true }),
  paths: () => [['1', '2'], ['3', '4'], ['5', '6'], ['95', '96'], ['97', '98']],
  readouts(inst) {
    const s = inst.state;
    return [
      { label: 'Stato', value: s.tripped ? 'INTERVENUTO (95-96 aperto)' : 'Armato', level: s.tripped ? 'error' : 'ok' },
      { label: 'Correnti 1 · 3 · 5', value: s.I.map(fmtA).join(' · ') },
      { label: 'Riscaldamento', value: `${fmt(clamp(s.theta, 0, 1) * 100, 0)} %`, bar: clamp(s.theta, 0, 1) },
    ];
  },
};
