// Dispositivi di campo (pannello utenze): utilizzatori e comandi dell'impianto.
import { sw, res, load, impPolar, T, P, distParam, clamp } from './common.js';
import { cabs, cmul, cconj, csub, power } from '../../sim/complex.js';
import { V_PHASE, sysOf, APPLIANCES, applianceById, bodyZone, fmtA, fmtV, fmtW, fmt } from '../../sim/norms.js';

// ── Lampada ──────────────────────────────────────────────────────────────────────────
export const LAMP_TYPES = [
  { value: 'led10', label: 'LED 10 W (≈ 75 W incand.)', P: 10, cos: 0.9, kind: 'led' },
  { value: 'led15', label: 'LED 15 W (≈ 100 W incand.)', P: 15, cos: 0.9, kind: 'led' },
  { value: 'inc60', label: 'Incandescenza 60 W', P: 60, cos: 1, kind: 'inc' },
  { value: 'inc100', label: 'Incandescenza 100 W', P: 100, cos: 1, kind: 'inc' },
  { value: 'alo300', label: 'Alogena 300 W', P: 300, cos: 1, kind: 'inc' },
];
export const lampType = (id) => LAMP_TYPES.find((l) => l.value === id) || LAMP_TYPES[0];

export const lamp = {
  type: 'lamp',
  name: 'Punto luce (portalampada E27)',
  short: 'Lampada',
  family: 'utenze',
  mount: 'field',
  span: 1,
  tag: 'E',
  help: 'Utilizzatore di illuminazione: si collega tra fase (tramite il comando) e neutro. Una lampada alimentata a 400 V (tra due fasi) brucia.',
  params: [P.select('lt', 'Tipo di lampada', LAMP_TYPES.map(({ value, label }) => ({ value, label })), 'led10'), distParam(12)],
  terminals: () => [T('L', 'L', 'L', 'top', 0.33), T('N', 'N', 'N', 'top', 0.67)],
  init: () => ({ burnt: false }),
  elements(inst, env) {
    if (inst.state.burnt) return [];
    const t = lampType(inst.params.lt);
    return [load('z', 'L', 'N', t.P, t.cos, sysOf(env).Vph)];
  },
  evaluate(inst, ctx) {
    const v = cabs(ctx.Vd('L', 'N'));
    const t = lampType(inst.params.lt);
    const V_PHASE = sysOf(ctx.env).Vph;
    inst.state.V = v;
    if (inst.state.burnt) {
      inst.view.bright = 0;
      return false;
    }
    if (v > 1.45 * V_PHASE) {
      inst.state.burnt = true;
      inst.view.bright = 0;
      ctx.emit({ level: 'error', text: `${inst.tag}: lampada alimentata a ${fmtV(v)} — bruciata! (collegata tra due fasi?)`, sound: 'burn' });
      return true;
    }
    inst.view.bright = t.kind === 'led'
      ? (v > 170 ? 1 : v > 90 ? (v - 90) / 80 : 0)
      : clamp(Math.pow(v / V_PHASE, 3.4), 0, 1.4);
    return false;
  },
  interact: { replace: (inst) => { inst.state.burnt = false; return { msg: `${inst.tag}: lampada sostituita.` }; } },
  load: (p) => { const t = lampType(p.lt); return { P: t.P, cos: t.cos, phases: 1 }; },
  paths: () => [],
  readouts(inst, ctx) {
    const v = cabs(ctx.Vd('L', 'N'));
    const i = cabs(ctx.I('z'));
    const V_PHASE = sysOf(ctx.env).Vph;
    return [
      { label: 'Stato', value: inst.state.burnt ? 'BRUCIATA' : (inst.view.bright || 0) > 0.05 ? 'Accesa' : 'Spenta', level: inst.state.burnt ? 'error' : (inst.view.bright || 0) > 0.05 ? 'ok' : 'off' },
      { label: 'Tensione ai morsetti', value: fmtV(v) },
      { label: 'Caduta di tensione', value: v > 20 ? `${fmt(((V_PHASE - v) / V_PHASE) * 100, 2)} %` : '—', level: v > 20 && (V_PHASE - v) / V_PHASE > 0.04 ? 'warn' : undefined },
      { label: 'Corrente assorbita', value: fmtA(i) },
      { label: 'Potenza', value: fmtW(power(ctx.Vd('L', 'N'), ctx.I('z')).P) },
    ];
  },
};

// ── Presa a spina ────────────────────────────────────────────────────────────────────
const FAULTS = [
  { value: 'none', label: 'Nessun guasto' },
  { value: 'd10', label: 'Dispersione verso la massa 10 mA' },
  { value: 'd50', label: 'Dispersione verso la massa 50 mA' },
  { value: 'd300', label: 'Dispersione verso la massa 300 mA' },
  { value: 'franco', label: 'Guasto franco a massa (isolamento rotto)' },
];
const FAULT_I = { d10: 0.01, d50: 0.05, d300: 0.3 };
/** Resistenza del guasto: tale da far circolare la corrente indicata alla tensione di fase del sistema */
const faultR = (g, Vph) => (g === 'franco' ? 0.5 : FAULT_I[g] ? Vph / FAULT_I[g] : null);
export const R_BODY = 1000;

export const xs = {
  type: 'xs',
  name: 'Presa a spina 2P+T',
  short: 'Presa 2P+T',
  family: 'utenze',
  mount: 'field',
  span: 1,
  tag: 'XS',
  help: 'Presa per apparecchi utilizzatori. Il polo di terra deve essere collegato al conduttore di protezione (PE): se un apparecchio di classe I va in guasto, la corrente si scarica a terra e il differenziale interviene.',
  params: [
    P.select('carico', 'Apparecchio collegato', APPLIANCES.map((a) => ({ value: a.id, label: a.P ? `${a.label} — ${fmtW(a.P)}` : a.label })), 'none'),
    P.select('tipo', 'Tipo di presa', [{ value: 'bip', label: 'Bipasso 10/16 A (P17/11)' }, { value: 'sch', label: 'Schuko 16 A (P30)' }], 'bip'),
    distParam(15),
    P.select('guasto', 'Guasto sull’apparecchio (docente)', FAULTS, 'none', { teacher: true }),
    P.bool('persona', 'Una persona tocca l’involucro metallico (docente)', false, { teacher: true }),
  ],
  terminals: () => [T('L', 'L', 'L', 'top', 0.25), T('N', 'N', 'N', 'top', 0.5), T('PE', 'PE', 'PE', 'top', 0.75)],
  init: () => ({}),
  elements(inst, env) {
    const p = inst.params;
    const a = applianceById(p.carico);
    const Vph = sysOf(env).Vph;
    const els = [];
    if (a.id === 'none') return els;
    if (a.short) els.push(res('app', 'L', 'N', 0.02));
    else els.push(load('app', 'L', 'N', a.P, a.cos, Vph));
    if (a.cls === 'I') {
      els.push(sw('pe', '#m', 'PE', true)); // spina con polo di terra → massa dell'apparecchio
      const rf = faultR(p.guasto, Vph);
      if (rf) els.push(res('f', 'L', '#m', rf));
    }
    if (p.persona && a.cls === 'I') els.push(res('body', '#m', 'GND', R_BODY));
    return els;
  },
  load: (p) => {
    const a = applianceById(p.carico);
    return { P: a.P || 0, cos: a.cos || 1, phases: 1, socket: true };
  },
  paths: () => [],
  readouts(inst, ctx) {
    const p = inst.params;
    const a = applianceById(p.carico);
    const v = cabs(ctx.Vd('L', 'N'));
    const V_PHASE = sysOf(ctx.env).Vph;
    const out = [{ label: 'Tensione alla presa', value: fmtV(v) }];
    if (a.id !== 'none') {
      const i = ctx.I('app');
      out.push({ label: 'Apparecchio', value: `${a.label}${a.cls ? ` (classe ${a.cls})` : ''}` });
      out.push({ label: 'Corrente assorbita', value: fmtA(cabs(i)) });
      out.push({ label: 'Potenza', value: fmtW(power(ctx.Vd('L', 'N'), i).P) });
      if (v > 20) out.push({ label: 'Caduta di tensione', value: `${fmt(((V_PHASE - v) / V_PHASE) * 100, 2)} %`, level: (V_PHASE - v) / V_PHASE > 0.04 ? 'warn' : undefined });
    }
    if (a.cls === 'I' && (p.guasto !== 'none' || p.persona)) {
      const ut = cabs(ctx.V('#m'));
      out.push({ label: 'Tensione della massa verso terra', value: fmtV(ut), level: ut > 50 ? 'error' : ut > 25 ? 'warn' : 'ok' });
      if (p.guasto !== 'none') out.push({ label: 'Corrente di guasto', value: fmtA(cabs(ctx.I('f'))) });
      if (p.persona) {
        const ib = cabs(ctx.I('body')) * 1000;
        const z = bodyZone(ib);
        out.push({ label: 'Corrente nel corpo', value: `${fmt(ib, 1)} mA — ${z.zone}: ${z.text}`, level: ib >= 30 ? 'error' : ib >= 10 ? 'warn' : 'ok' });
      }
    }
    return out;
  },
};

// ── Comandi di campo ─────────────────────────────────────────────────────────────────
const toggleOn = (inst) => {
  inst.state.on = !inst.state.on;
  return { sound: 'rocker' };
};

export const sa = {
  type: 'sa',
  name: 'Interruttore unipolare',
  short: 'Interruttore',
  family: 'campo',
  mount: 'field',
  span: 1,
  tag: 'SA',
  help: 'Interrompe il conduttore di FASE che va alla lampada (mai il neutro): comando da un solo punto.',
  params: [distParam(8)],
  terminals: () => [T('L', 'L', 'L', 'top', 0.35), T('1', '1', 'L', 'top', 0.65)],
  init: () => ({ on: false }),
  elements: (inst) => [sw('c', 'L', '1', inst.state.on)],
  interact: { toggle: toggleOn },
  paths: () => [['L', '1']],
  readouts: (inst) => [{ label: 'Posizione', value: inst.state.on ? 'Chiuso (acceso)' : 'Aperto (spento)', level: inst.state.on ? 'ok' : 'off' }],
};

export const sd = {
  type: 'sd',
  name: 'Deviatore',
  short: 'Deviatore',
  family: 'campo',
  mount: 'field',
  span: 1,
  tag: 'SA',
  help: 'Commutatore a due vie: il morsetto comune C si collega alternativamente a 1 o a 2. Con due deviatori si comanda una lampada da due punti.',
  params: [distParam(8)],
  terminals: () => [T('C', 'C', 'L', 'top', 0.25), T('1', '1', 'L', 'top', 0.5), T('2', '2', 'L', 'top', 0.75)],
  init: () => ({ on: false }),
  elements: (inst) => [sw('c1', 'C', '1', !inst.state.on), sw('c2', 'C', '2', inst.state.on)],
  interact: { toggle: toggleOn },
  paths: () => [['C', '1'], ['C', '2']],
  readouts: (inst) => [{ label: 'Posizione', value: inst.state.on ? 'C → 2' : 'C → 1' }],
};

export const si = {
  type: 'si',
  name: 'Invertitore',
  short: 'Invertitore',
  family: 'campo',
  mount: 'field',
  span: 1,
  tag: 'SA',
  help: 'Inserito tra due deviatori, incrocia o lascia dritti i due conduttori “navette”: permette il comando da tre o più punti.',
  params: [distParam(8)],
  terminals: () => [T('A1', 'A1', 'L', 'top', 0.2), T('A2', 'A2', 'L', 'top', 0.4), T('B1', 'B1', 'L', 'top', 0.6), T('B2', 'B2', 'L', 'top', 0.8)],
  init: () => ({ on: false }),
  elements: (inst) => (inst.state.on
    ? [sw('x1', 'A1', 'B2', true), sw('x2', 'A2', 'B1', true)]
    : [sw('d1', 'A1', 'B1', true), sw('d2', 'A2', 'B2', true)]),
  interact: { toggle: toggleOn },
  paths: () => [['A1', 'B1'], ['A2', 'B2'], ['A1', 'B2'], ['A2', 'B1']],
  readouts: (inst) => [{ label: 'Posizione', value: inst.state.on ? 'Incrociata (A1-B2, A2-B1)' : 'Diritta (A1-B1, A2-B2)' }],
};

export const sp = {
  type: 'sp',
  name: 'Pulsante da parete',
  short: 'Pulsante',
  family: 'campo',
  mount: 'field',
  span: 1,
  tag: 'SB',
  help: 'Pulsante a ritorno automatico. Si usa per inviare impulsi a relè passo-passo, temporizzatori, suonerie.',
  params: [
    P.select('contact', 'Contatto', [{ value: 'NA', label: 'NA — normalmente aperto' }, { value: 'NC', label: 'NC — normalmente chiuso' }], 'NA'),
    P.select('symbol', 'Simbolo sul tasto', [{ value: 'lamp', label: 'Luce' }, { value: 'bell', label: 'Campanello' }, { value: 'none', label: 'Nessuno' }], 'lamp'),
    distParam(8),
  ],
  terminals: (p) => (p.contact === 'NC'
    ? [T('1', '1', 'L', 'top', 0.35), T('2', '2', 'L', 'top', 0.65)]
    : [T('3', '3', 'L', 'top', 0.35), T('4', '4', 'L', 'top', 0.65)]),
  init: () => ({ pressed: false }),
  elements: (inst) => (inst.params.contact === 'NC'
    ? [sw('c', '1', '2', !inst.state.pressed)]
    : [sw('c', '3', '4', inst.state.pressed)]),
  interact: { press: (inst, ctx, phase) => { inst.state.pressed = phase !== 'up'; return { sound: phase === 'up' ? 'button-up' : 'button' }; } },
  paths: (p) => (p.contact === 'NC' ? [['1', '2']] : [['3', '4']]),
  readouts: (inst) => [{ label: 'Pulsante', value: inst.state.pressed ? 'Premuto' : 'Rilasciato' }],
};

export const ss = {
  type: 'ss',
  name: 'Pulsantiera marcia-arresto',
  short: 'Pulsantiera',
  family: 'campo',
  mount: 'field',
  span: 1,
  tag: 'SB',
  help: 'Stazione di comando con pulsante di ARRESTO rosso (NC, 1-2) e di MARCIA verde (NA, 3-4). L’arresto si collega in serie, la marcia in parallelo al contatto di autoritenuta.',
  params: [distParam(10)],
  terminals: () => [T('1', '1', 'ctrl', 'top', 0.2), T('2', '2', 'ctrl', 'top', 0.4), T('3', '3', 'ctrl', 'top', 0.6), T('4', '4', 'ctrl', 'top', 0.8)],
  init: () => ({ stop: false, start: false }),
  elements: (inst) => [sw('stop', '1', '2', !inst.state.stop), sw('start', '3', '4', inst.state.start)],
  interact: {
    stop: (inst, ctx, phase) => { inst.state.stop = phase !== 'up'; return { sound: phase === 'up' ? 'button-up' : 'button' }; },
    start: (inst, ctx, phase) => { inst.state.start = phase !== 'up'; return { sound: phase === 'up' ? 'button-up' : 'button' }; },
  },
  paths: () => [['1', '2'], ['3', '4']],
  readouts: (inst) => [
    { label: 'Arresto (NC 1-2)', value: inst.state.stop ? 'Premuto (aperto)' : 'Rilasciato (chiuso)' },
    { label: 'Marcia (NA 3-4)', value: inst.state.start ? 'Premuto (chiuso)' : 'Rilasciato (aperto)' },
  ],
};

// ── Rilevatore di presenza ───────────────────────────────────────────────────────────
export const pir = {
  type: 'pir',
  name: 'Rilevatore di presenza (PIR)',
  short: 'Sensore di presenza',
  family: 'campo',
  mount: 'field',
  span: 1,
  tag: 'BG',
  help: 'Sensore a infrarossi passivi: rileva il movimento e alimenta l’uscita (fase commutata) per il tempo impostato. Si alimenta tra L e N. Clicca sul sensore per simulare il passaggio di una persona.',
  params: [P.select('T', 'Tempo di mantenimento', [5, 10, 20, 30, 60], 10, { unit: 's' }), distParam(10)],
  terminals: () => [T('L', 'L', 'L', 'top', 0.25), T('N', 'N', 'N', 'top', 0.5), T('OUT', 'OUT', 'L', 'top', 0.75)],
  init: () => ({ remaining: 0, out: false, powered: false }),
  elements: (inst, env) => [res('aux', 'L', 'N', (sysOf(env).Vph ** 2) / 0.8), sw('c', 'L', 'OUT', inst.state.out)],
  evaluate(inst, ctx) {
    const s = inst.state;
    s.powered = cabs(ctx.Vd('L', 'N')) > 0.8 * sysOf(ctx.env).Vph;
    const out = s.powered && s.remaining > 0;
    if (out !== s.out) {
      s.out = out;
      ctx.emit({ level: 'trace', sound: 'relay' });
      return true;
    }
    return false;
  },
  tick(inst, ctx, dt) {
    const s = inst.state;
    if (s.remaining > 0) {
      s.remaining -= dt;
      if (s.remaining <= 0) {
        s.remaining = 0;
        return true;
      }
    }
    return false;
  },
  interact: { trigger: (inst) => { inst.state.remaining = inst.params.T; return { msg: `${inst.tag}: presenza rilevata`, sound: 'click' }; } },
  paths: () => [],
  readouts: (inst) => [
    { label: 'Alimentazione', value: inst.state.powered ? 'Presente' : 'Assente', level: inst.state.powered ? 'ok' : 'off' },
    { label: 'Uscita', value: inst.state.out ? `Attiva — ancora ${fmt(inst.state.remaining, 0)} s` : 'Non attiva', level: inst.state.out ? 'ok' : 'off' },
  ],
};

// ── Suoneria ─────────────────────────────────────────────────────────────────────────
export const hb = {
  type: 'hb',
  name: 'Suoneria (campanello)',
  short: 'Suoneria',
  family: 'utenze',
  mount: 'field',
  span: 1,
  tag: 'HA',
  help: 'Segnalatore acustico comandato da un pulsante NA.',
  params: [distParam(10)],
  terminals: () => [T('1', '1', 'L', 'top', 0.35), T('2', '2', 'N', 'top', 0.65)],
  init: () => ({}),
  elements: (inst, env) => [load('z', '1', '2', 8, 0.6, sysOf(env).Vph)],
  evaluate(inst, ctx) {
    inst.view.ring = cabs(ctx.Vd('1', '2')) > 0.7 * sysOf(ctx.env).Vph;
    return false;
  },
  load: () => ({ P: 8, cos: 0.6, phases: 1 }),
  paths: () => [],
  readouts: (inst, ctx) => [{ label: 'Tensione', value: fmtV(cabs(ctx.Vd('1', '2'))) }, { label: 'Stato', value: inst.view.ring ? 'Suona' : 'Muta' }],
};

// ── Motore asincrono trifase ─────────────────────────────────────────────────────────
const MOTOR_DATA = {
  0.37: [0.72, 0.7], 0.55: [0.75, 0.73], 0.75: [0.77, 0.77], 1.1: [0.79, 0.79], 1.5: [0.8, 0.81], 2.2: [0.81, 0.83], 3: [0.82, 0.84], 4: [0.83, 0.85],
  5.5: [0.84, 0.86], 7.5: [0.85, 0.87], 11: [0.86, 0.88], 15: [0.86, 0.89], 22: [0.87, 0.9], 30: [0.87, 0.91], 45: [0.88, 0.92], 75: [0.88, 0.93],
};
export const MOTOR_POWERS = Object.keys(MOTOR_DATA).map(Number);

/** Dati di targa del motore alla tensione concatenata del sistema (400 V se non indicata) */
export function motorRated(p, Vll = 400) {
  const [cos, eta] = MOTOR_DATA[p.P] || [0.8, 0.8];
  const Pel = (p.P * 1000) / eta;
  const In = Pel / (Math.sqrt(3) * Vll * cos);
  return { cos, eta, Pel, In };
}

function windingZ(p, mode, Vph) {
  const { cos, Pel } = motorRated(p);
  const Zr = (3 * Vph * Vph * cos) / Pel; // |Z| di un avvolgimento a pieno carico (tensione di fase per avvolgimento)
  if (mode !== 'run') return { mag: Zr / 6, phi: Math.acos(0.4) }; // rotore bloccato / avviamento
  const L = Math.max(0, p.load) / 100;
  // corrente ≈ 45% a vuoto, 100% a pieno carico; in sovraccarico cresce più che linearmente (aumenta lo scorrimento)
  const k = L <= 1 ? 0.45 + 0.55 * L : 1 + 1.3 * (L - 1);
  const c = Math.max(0.15, Math.min(cos, 0.2 + (cos - 0.2) * Math.min(1, L)));
  return { mag: Zr / k, phi: Math.acos(c) };
}

export const m3 = {
  type: 'm3',
  name: 'Motore asincrono trifase 230/400 V',
  short: 'Motore trifase',
  family: 'utenze',
  mount: 'field',
  span: 2,
  tag: 'M',
  help: 'Motore con avvolgimenti da 230 V: a 400 V va collegato a STELLA. Il senso di rotazione dipende dalla sequenza delle fasi: scambiando due fasi si inverte. All’avviamento assorbe circa 6 volte la corrente nominale.',
  params: [
    P.select('P', 'Potenza nominale', MOTOR_POWERS, 0.75, { unit: 'kW' }),
    P.select('conn', 'Collegamento degli avvolgimenti', [{ value: 'Y', label: 'Stella (Y) — per rete a 400 V' }, { value: 'D', label: 'Triangolo (Δ) — per rete a 230 V' }], 'Y'),
    P.number('load', 'Carico meccanico', 0, 150, 5, 80, '%', { help: 'Oltre il 100% il motore è in sovraccarico: la corrente cresce e il relè termico deve intervenire.' }),
    distParam(20),
  ],
  terminals: () => [T('U1', 'U1', 'L', 'top', 0.3), T('V1', 'V1', 'L', 'top', 0.42), T('W1', 'W1', 'L', 'top', 0.54), T('PE', 'PE', 'PE', 'top', 0.68)],
  init: () => ({ mode: 'stop', t: 0, dir: 1, speed: 0, vline: [0, 0, 0] }),
  elements(inst, env) {
    const p = inst.params;
    const z = windingZ(p, inst.state.mode, sysOf(env).Vph);
    const els = p.conn === 'D'
      ? [impPolar('wU', 'U1', 'V1', z.mag, z.phi), impPolar('wV', 'V1', 'W1', z.mag, z.phi), impPolar('wW', 'W1', 'U1', z.mag, z.phi)]
      : [impPolar('wU', 'U1', '#st', z.mag, z.phi), impPolar('wV', 'V1', '#st', z.mag, z.phi), impPolar('wW', 'W1', '#st', z.mag, z.phi)];
    els.push(sw('pe', '#m', 'PE', true));
    return els;
  },
  evaluate(inst, ctx) {
    const s = inst.state;
    const p = inst.params;
    const sys = sysOf(ctx.env);
    const Vn = p.conn === 'D' ? sys.Vph : sys.Vll;
    const uv = ctx.Vd('U1', 'V1');
    const vw = ctx.Vd('V1', 'W1');
    const wu = ctx.Vd('W1', 'U1');
    const m = [cabs(uv), cabs(vw), cabs(wu)];
    s.vline = m;
    const vmax = Math.max(...m);
    const all = Math.min(...m) > 0.75 * Vn;
    const some = vmax > 0.4 * Vn;
    if (all) s.dir = cmul(uv, cconj(vw)).im >= 0 ? 1 : -1;
    if (vmax > 1.3 * Vn && !s.overWarned) {
      s.overWarned = true;
      ctx.emit({ level: 'error', text: `${inst.tag}: avvolgimenti in sovratensione (${fmtV(vmax)} tra le fasi con collegamento a ${p.conn === 'D' ? 'triangolo' : 'stella'}): collegamento errato, il motore si surriscalda!` });
    } else if (vmax < 1.1 * Vn) s.overWarned = false;
    let mode = s.mode;
    if (all) mode = mode === 'stop' || mode === 'stall' ? 'start' : mode;
    else if (some) mode = 'stall';
    else mode = 'stop';
    if (mode !== s.mode) {
      s.mode = mode;
      s.t = 0;
      if (mode === 'stall') ctx.emit({ level: 'warn', text: `${inst.tag}: manca una fase — il motore non si avvia (marcia in monofase) e assorbe una corrente elevata.`, sound: 'hum' });
      return true;
    }
    return false;
  },
  tick(inst, ctx, dt) {
    const s = inst.state;
    let ch = false;
    if (s.mode === 'start') {
      s.t += dt;
      if (s.t >= 1.2) {
        s.mode = 'run';
        s.t = 0;
        ch = true;
      }
    } else if (s.mode === 'stall') {
      s.t += dt;
      if (s.t > 12 && !s.stallWarned) {
        s.stallWarned = true;
        ctx.emit({ level: 'error', text: `${inst.tag}: motore bloccato da ${fmt(s.t, 0)} s — senza protezione termica gli avvolgimenti si danneggiano!` });
      }
    }
    if (s.mode !== 'stall') s.stallWarned = false;
    const target = s.mode === 'run' ? s.dir : s.mode === 'start' ? s.dir * Math.min(1, s.t / 1.2) * 0.85 : 0;
    s.speed += (target - s.speed) * Math.min(1, dt * (s.mode === 'stop' ? 0.7 : 2.5));
    if (Math.abs(s.speed) < 1e-3 && target === 0) s.speed = 0;
    return ch;
  },
  load: (p) => { const r = motorRated(p); return { P: r.Pel, cos: r.cos, phases: 3, In: r.In, motor: true }; },
  paths: () => [],
  lineCurrents(inst, ctx) {
    if (inst.params.conn === 'D') {
      const u = ctx.I('wU'), v = ctx.I('wV'), w = ctx.I('wW');
      return [cabs(csub(u, w)), cabs(csub(v, u)), cabs(csub(w, v))];
    }
    return ['wU', 'wV', 'wW'].map((n) => cabs(ctx.I(n)));
  },
  readouts(inst, ctx) {
    const s = inst.state;
    const r = motorRated(inst.params, sysOf(ctx.env).Vll);
    const I = m3.lineCurrents(inst, ctx);
    const modeText = { stop: 'Fermo', start: 'Avviamento', run: 'In marcia', stall: 'BLOCCATO (manca una fase)' }[s.mode];
    let Pabs = 0;
    const w = inst.params.conn === 'D' ? [['U1', 'V1'], ['V1', 'W1'], ['W1', 'U1']] : [['U1', '#st'], ['V1', '#st'], ['W1', '#st']];
    ['wU', 'wV', 'wW'].forEach((n, k) => { Pabs += power(ctx.Vd(w[k][0], w[k][1]), ctx.I(n)).P; });
    return [
      { label: 'Stato', value: modeText, level: s.mode === 'stall' ? 'error' : s.mode === 'run' ? 'ok' : s.mode === 'start' ? 'warn' : 'off' },
      { label: 'Senso di rotazione', value: s.mode === 'run' || s.mode === 'start' ? (s.dir > 0 ? 'Orario (sequenza diretta)' : 'Antiorario (sequenza inversa)') : '—' },
      { label: 'Velocità', value: `${fmt(Math.abs(s.speed) * 1420, 0)} giri/min` },
      { label: 'Tensioni U-V · V-W · W-U', value: s.vline.map((v) => fmt(v, 0)).join(' · ') + ' V' },
      { label: 'Correnti di linea', value: I.map(fmtA).join(' · ') },
      { label: 'Corrente nominale di targa', value: fmtA(r.In) },
      { label: 'Potenza assorbita', value: fmtW(Pabs) },
    ];
  },
};
