// Comando, automazione, segnalazione e misura su guida DIN.
import { sw, res, coil, T, P, coilUpdate, clamp } from './common.js';
import { cabs, csub, power } from '../../sim/complex.js';
import { V_PHASE, fmtA, fmtV, fmtW, fmt } from '../../sim/norms.js';

const ucParam = (def = 230) => P.select('Uc', 'Tensione della bobina Uc', [
  { value: 230, label: '230 V c.a.' },
  { value: 24, label: '24 V c.a.' },
], def, { help: 'La bobina va alimentata alla sua tensione nominale: con tensione troppo bassa non si eccita, con tensione troppo alta brucia.' });

const coilReadouts = (s, Uc) => [
  { label: 'Bobina', value: s.burnt ? 'BRUCIATA' : s.coil ? 'Eccitata' : 'Diseccitata', level: s.burnt ? 'error' : s.coil ? 'ok' : 'off' },
  { label: 'Tensione ai capi della bobina', value: `${fmtV(s.vcoil || 0)} (nominale ${Uc} V)` },
];

const replaceCoil = (inst) => {
  inst.state.burnt = false;
  return { msg: `${inst.tag}: bobina sostituita.` };
};

// ── Contattore tripolare con contatti ausiliari ──────────────────────────────────────
export const km3 = {
  type: 'km3',
  name: 'Contattore tripolare + ausiliari 1NA 1NC',
  short: 'Contattore 3P',
  family: 'comando',
  mount: 'din',
  modules: 3,
  style: 'industrial',
  tag: 'KM',
  help: 'Interruttore comandato a distanza: quando la bobina A1-A2 è alimentata chiude i contatti principali (1-2, 3-4, 5-6) e l’ausiliario NA 13-14, e apre l’ausiliario NC 21-22. Il 13-14 si usa per l’autoritenuta, il 21-22 per gli interblocchi.',
  params: [ucParam(230), P.select('Ie', 'Corrente di impiego AC-3', [9, 12, 18, 25, 32], 9, { unit: 'A' })],
  terminals: () => [
    T('A1', 'A1', 'coil', 'top', 0.07), T('1', '1', 'L', 'top', 0.24, 'line'), T('3', '3', 'L', 'top', 0.41, 'line'), T('5', '5', 'L', 'top', 0.58, 'line'),
    T('13', '13', 'aux', 'top', 0.76), T('21', '21', 'aux', 'top', 0.93),
    T('A2', 'A2', 'coil', 'bottom', 0.07), T('2', '2', 'L', 'bottom', 0.24, 'load'), T('4', '4', 'L', 'bottom', 0.41, 'load'), T('6', '6', 'L', 'bottom', 0.58, 'load'),
    T('14', '14', 'aux', 'bottom', 0.76), T('22', '22', 'aux', 'bottom', 0.93),
  ],
  init: () => ({ coil: false, burnt: false, vcoil: 0 }),
  elements(inst) {
    const s = inst.state;
    const on = s.coil;
    return [
      s.burnt ? null : coil('coil', 'A1', 'A2', inst.params.Uc, 7.5, 0.3),
      sw('m1', '1', '2', on), sw('m2', '3', '4', on), sw('m3', '5', '6', on),
      sw('no', '13', '14', on), sw('nc', '21', '22', !on),
    ];
  },
  evaluate: (inst, ctx) => coilUpdate(inst, ctx, 'A1', 'A2', inst.params.Uc),
  interact: { replaceCoil },
  paths: () => [['1', '2'], ['3', '4'], ['5', '6'], ['13', '14'], ['21', '22']],
  coilTerms: ['A1', 'A2'],
  readouts(inst, ctx) {
    const s = inst.state;
    return [
      ...coilReadouts(s, inst.params.Uc),
      { label: 'Contatti principali', value: s.coil ? 'Chiusi' : 'Aperti' },
      { label: 'Correnti 1-2 · 3-4 · 5-6', value: ['m1', 'm2', 'm3'].map((m) => fmtA(cabs(ctx.I(m)))).join(' · ') },
    ];
  },
};

// ── Contattore modulare 2NA (uso civile) ─────────────────────────────────────────────
export const km2m = {
  type: 'km2m',
  name: 'Contattore modulare 2NA 25 A',
  short: 'Contattore modulare',
  family: 'comando',
  mount: 'din',
  modules: 2,
  tag: 'KM',
  help: 'Contattore modulare silenzioso per il comando di carichi civili (scaldacqua, riscaldamento, gruppi luce) tramite un contatto di comando.',
  params: [ucParam(230)],
  terminals: () => [
    T('A1', 'A1', 'coil', 'top', 0.14), T('1', '1', 'L', 'top', 0.5, 'line'), T('3', '3', 'L', 'top', 0.86, 'line'),
    T('A2', 'A2', 'coil', 'bottom', 0.14), T('2', '2', 'L', 'bottom', 0.5, 'load'), T('4', '4', 'L', 'bottom', 0.86, 'load'),
  ],
  init: () => ({ coil: false, burnt: false, vcoil: 0 }),
  elements(inst) {
    const s = inst.state;
    return [s.burnt ? null : coil('coil', 'A1', 'A2', inst.params.Uc, 4, 0.4), sw('m1', '1', '2', s.coil), sw('m2', '3', '4', s.coil)];
  },
  evaluate: (inst, ctx) => coilUpdate(inst, ctx, 'A1', 'A2', inst.params.Uc),
  interact: { replaceCoil },
  paths: () => [['1', '2'], ['3', '4']],
  coilTerms: ['A1', 'A2'],
  readouts: (inst) => [...coilReadouts(inst.state, inst.params.Uc), { label: 'Contatti', value: inst.state.coil ? 'Chiusi' : 'Aperti' }],
};

// ── Relè passo-passo ──────────────────────────────────────────────────────────────────
export const kpp = {
  type: 'kpp',
  name: 'Relè passo-passo (interruttore a impulsi)',
  short: 'Relè passo-passo',
  family: 'comando',
  mount: 'din',
  modules: 1,
  tag: 'KA',
  help: 'A ogni impulso sulla bobina (pressione di un pulsante) il contatto 11-14 cambia stato e resta nella nuova posizione. Permette di comandare una luce da quanti punti si vuole con semplici pulsanti in parallelo.',
  params: [ucParam(230)],
  terminals: () => [
    T('A1', 'A1', 'coil', 'top', 0.27), T('11', '11', 'L', 'top', 0.73, 'line'),
    T('A2', 'A2', 'coil', 'bottom', 0.27), T('14', '14', 'L', 'bottom', 0.73, 'load'),
  ],
  init: () => ({ coil: false, burnt: false, out: false, vcoil: 0 }),
  elements(inst) {
    const s = inst.state;
    return [s.burnt ? null : coil('coil', 'A1', 'A2', inst.params.Uc, 5, 0.5), sw('c', '11', '14', s.out)];
  },
  evaluate(inst, ctx) {
    const s = inst.state;
    const was = s.coil;
    const ch = coilUpdate(inst, ctx, 'A1', 'A2', inst.params.Uc);
    if (ch && s.coil && !was) {
      s.out = !s.out;
      ctx.emit({ level: 'trace', sound: 'relay' });
    }
    return ch;
  },
  interact: {
    toggle(inst) {
      inst.state.out = !inst.state.out;
      return { sound: 'relay' };
    },
    replaceCoil,
  },
  paths: () => [['11', '14']],
  coilTerms: ['A1', 'A2'],
  readouts: (inst) => [...coilReadouts(inst.state, inst.params.Uc), { label: 'Contatto 11-14', value: inst.state.out ? 'Chiuso' : 'Aperto', level: inst.state.out ? 'ok' : 'off' }],
};

// ── Relè temporizzato luce scale ─────────────────────────────────────────────────────
export const kt = {
  type: 'kt',
  name: 'Relè temporizzato luce scale',
  short: 'Temporizzatore luce scale',
  family: 'comando',
  mount: 'din',
  modules: 1,
  tag: 'KT',
  help: 'Un impulso sulla bobina chiude il contatto 15-18 per il tempo impostato, poi lo riapre da solo (tipico delle luci di scale e corridoi). Un nuovo impulso fa ripartire il conteggio.',
  params: [P.select('T', 'Tempo di accensione', [5, 10, 20, 30, 60, 120, 180], 20, { unit: 's' })],
  terminals: () => [
    T('A1', 'A1', 'coil', 'top', 0.27), T('15', '15', 'L', 'top', 0.73, 'line'),
    T('A2', 'A2', 'coil', 'bottom', 0.27), T('18', '18', 'L', 'bottom', 0.73, 'load'),
  ],
  init: () => ({ coil: false, burnt: false, remaining: 0, vcoil: 0 }),
  elements(inst) {
    const s = inst.state;
    return [s.burnt ? null : coil('coil', 'A1', 'A2', V_PHASE, 3, 0.6), sw('c', '15', '18', s.remaining > 0)];
  },
  evaluate(inst, ctx) {
    const s = inst.state;
    const was = s.coil;
    const wasBurnt = s.burnt;
    coilUpdate(inst, ctx, 'A1', 'A2', V_PHASE);
    if (s.burnt !== wasBurnt) return true;
    if (s.coil && !was) {
      const wasOn = s.remaining > 0;
      s.remaining = inst.params.T;
      if (!wasOn) {
        ctx.emit({ level: 'trace', sound: 'relay' });
        return true;
      }
    }
    return false;
  },
  tick(inst, ctx, dt) {
    const s = inst.state;
    if (s.remaining > 0) {
      if (s.coil) s.remaining = inst.params.T;
      else {
        s.remaining -= dt;
        if (s.remaining <= 0) {
          s.remaining = 0;
          ctx.emit({ level: 'trace', sound: 'relay' });
          return true;
        }
      }
    }
    return false;
  },
  paths: () => [['15', '18']],
  coilTerms: ['A1', 'A2'],
  readouts: (inst) => [
    ...coilReadouts(inst.state, V_PHASE),
    { label: 'Uscita 15-18', value: inst.state.remaining > 0 ? `Chiusa — ancora ${fmt(inst.state.remaining, 0)} s` : 'Aperta', level: inst.state.remaining > 0 ? 'ok' : 'off' },
  ],
};

// ── Interruttore crepuscolare ────────────────────────────────────────────────────────
export const kcr = {
  type: 'kcr',
  name: 'Interruttore crepuscolare',
  short: 'Crepuscolare',
  family: 'comando',
  mount: 'din',
  modules: 2,
  tag: 'KF',
  help: 'Misura la luminosità esterna con una fotocellula: quando scende sotto la soglia chiude il contatto 15-18 (accensione automatica delle luci esterne). Va alimentato tra L e N.',
  params: [P.select('lux', 'Soglia di intervento', [2, 5, 10, 20, 50, 100, 200], 20, { unit: 'lx' })],
  terminals: () => [
    T('L', 'L', 'L', 'top', 0.25), T('N', 'N', 'N', 'top', 0.75),
    T('15', '15', 'L', 'bottom', 0.25, 'line'), T('18', '18', 'L', 'bottom', 0.75, 'load'),
  ],
  init: () => ({ out: false, powered: false }),
  elements: (inst) => [res('aux', 'L', 'N', (V_PHASE * V_PHASE) / 1.5), sw('c', '15', '18', inst.state.out)],
  evaluate(inst, ctx) {
    const s = inst.state;
    s.powered = cabs(ctx.Vd('L', 'N')) > 0.8 * V_PHASE;
    const lux = ctx.env.lux ?? 400;
    // isteresi del 30% per evitare accensioni intermittenti al tramonto
    const dark = s.out ? lux < inst.params.lux * 1.3 : lux < inst.params.lux;
    const out = s.powered && dark;
    if (out !== s.out) {
      s.out = out;
      ctx.emit({ level: 'trace', sound: 'relay' });
      return true;
    }
    return false;
  },
  paths: () => [['15', '18']],
  readouts: (inst, ctx) => [
    { label: 'Alimentazione', value: inst.state.powered ? 'Presente' : 'Assente', level: inst.state.powered ? 'ok' : 'off' },
    { label: 'Luminosità esterna', value: `${fmt(ctx.env.lux ?? 400, 0)} lx (soglia ${inst.params.lux} lx)` },
    { label: 'Contatto 15-18', value: inst.state.out ? 'Chiuso' : 'Aperto', level: inst.state.out ? 'ok' : 'off' },
  ],
};

// ── Spia luminosa modulare ───────────────────────────────────────────────────────────
export const hl = {
  type: 'hl',
  name: 'Spia luminosa modulare',
  short: 'Spia luminosa',
  family: 'segnalazione',
  mount: 'din',
  modules: 1,
  tag: 'H',
  help: 'Segnala la presenza di tensione o lo stato di un’apparecchiatura (es. verde = marcia, rosso = intervento termico).',
  params: [
    P.select('color', 'Colore', [
      { value: 'green', label: 'Verde' }, { value: 'red', label: 'Rosso' }, { value: 'amber', label: 'Giallo' },
      { value: 'white', label: 'Bianco' }, { value: 'blue', label: 'Blu' },
    ], 'green'),
    P.select('Un', 'Tensione nominale', [{ value: 230, label: '230 V c.a.' }, { value: 24, label: '24 V c.a.' }], 230),
  ],
  terminals: () => [T('X1', 'X1', 'ctrl', 'top', 0.5), T('X2', 'X2', 'ctrl', 'bottom', 0.5)],
  init: () => ({ burnt: false }),
  elements: (inst) => [inst.state.burnt ? null : res('z', 'X1', 'X2', (inst.params.Un * inst.params.Un) / 0.6)],
  evaluate(inst, ctx) {
    const v = cabs(ctx.Vd('X1', 'X2'));
    const Un = inst.params.Un;
    inst.view.bright = inst.state.burnt ? 0 : clamp((v / Un - 0.35) / 0.55, 0, 1.2);
    if (!inst.state.burnt && v > 1.5 * Un) {
      inst.state.burnt = true;
      ctx.emit({ level: 'error', text: `${inst.tag}: spia da ${Un} V alimentata a ${fmtV(v)} — bruciata.`, sound: 'burn' });
      return true;
    }
    return false;
  },
  interact: { replaceCoil: (inst) => { inst.state.burnt = false; return { msg: `${inst.tag}: spia sostituita.` }; } },
  paths: () => [],
  readouts: (inst, ctx) => [{ label: 'Tensione', value: fmtV(cabs(ctx.Vd('X1', 'X2'))) }, { label: 'Stato', value: inst.state.burnt ? 'BRUCIATA' : (inst.view.bright || 0) > 0.3 ? 'Accesa' : 'Spenta' }],
};

// ── Pulsante modulare ────────────────────────────────────────────────────────────────
export const sbm = {
  type: 'sbm',
  name: 'Pulsante modulare da quadro',
  short: 'Pulsante modulare',
  family: 'comando',
  mount: 'din',
  modules: 1,
  tag: 'SB',
  help: 'Pulsante a ritorno automatico montato sul quadro. NA: chiude mentre è premuto (marcia). NC: apre mentre è premuto (arresto).',
  params: [
    P.select('contact', 'Contatto', [{ value: 'NA', label: 'NA — normalmente aperto' }, { value: 'NC', label: 'NC — normalmente chiuso' }], 'NA'),
    P.select('color', 'Colore', [{ value: 'green', label: 'Verde (marcia)' }, { value: 'red', label: 'Rosso (arresto)' }, { value: 'black', label: 'Nero' }, { value: 'amber', label: 'Giallo' }], 'green'),
  ],
  terminals: (p) => (p.contact === 'NC'
    ? [T('11', '11', 'ctrl', 'top', 0.5), T('12', '12', 'ctrl', 'bottom', 0.5)]
    : [T('13', '13', 'ctrl', 'top', 0.5), T('14', '14', 'ctrl', 'bottom', 0.5)]),
  init: () => ({ pressed: false }),
  elements: (inst) => (inst.params.contact === 'NC'
    ? [sw('c', '11', '12', !inst.state.pressed)]
    : [sw('c', '13', '14', inst.state.pressed)]),
  interact: {
    press(inst, ctx, phase) {
      inst.state.pressed = phase !== 'up';
      return { sound: phase === 'up' ? 'button-up' : 'button' };
    },
  },
  paths: (p) => (p.contact === 'NC' ? [['11', '12']] : [['13', '14']]),
  readouts: (inst) => [{ label: 'Pulsante', value: inst.state.pressed ? 'Premuto' : 'Rilasciato' }],
};

// ── Interruttore di comando modulare ─────────────────────────────────────────────────
export const sel = {
  type: 'sel',
  name: 'Interruttore di comando modulare 0-I',
  short: 'Interruttore modulare',
  family: 'comando',
  mount: 'din',
  modules: 1,
  tag: 'SA',
  help: 'Interruttore da quadro a due posizioni (0-I) per abilitare un circuito o scegliere il funzionamento manuale.',
  params: [],
  terminals: () => [T('1', '1', 'L', 'top', 0.5, 'line'), T('2', '2', 'L', 'bottom', 0.5, 'load')],
  init: () => ({ on: false }),
  elements: (inst) => [sw('c', '1', '2', inst.state.on)],
  interact: { toggle: (inst) => { inst.state.on = !inst.state.on; return { sound: inst.state.on ? 'switch-on' : 'switch-off' }; } },
  paths: () => [['1', '2']],
  readouts: (inst) => [{ label: 'Posizione', value: inst.state.on ? 'I (chiuso)' : '0 (aperto)', level: inst.state.on ? 'ok' : 'off' }],
};

// ── Contatore di energia modulare ────────────────────────────────────────────────────
export const pm1 = {
  type: 'pm1',
  name: 'Contatore di energia monofase',
  short: 'Contatore di energia',
  family: 'segnalazione',
  mount: 'din',
  modules: 2,
  tag: 'P',
  help: 'Misura tensione, corrente, potenza ed energia della linea a valle: utile per valutare i carichi e il loro contemporaneo funzionamento.',
  params: [],
  terminals: () => [
    T('Lin', 'L', 'L', 'top', 0.25, 'line'), T('Nin', 'N', 'N', 'top', 0.75, 'line'),
    T('Lout', 'L', 'L', 'bottom', 0.25, 'load'), T('Nout', 'N', 'N', 'bottom', 0.75, 'load'),
  ],
  init: () => ({ kWh: 0, P: 0, V: 0, I: 0, cos: 1 }),
  elements: () => [sw('pL', 'Lin', 'Lout', true), sw('pN', 'Nin', 'Nout', true)],
  evaluate(inst, ctx) {
    const s = inst.state;
    const v = ctx.Vd('Lin', 'Nin');
    const i = ctx.I('pL');
    const pw = power(v, i);
    s.V = cabs(v);
    s.I = cabs(i);
    s.P = pw.P;
    s.cos = pw.S > 1 ? Math.abs(pw.P / pw.S) : 1;
    return false;
  },
  tick(inst, ctx, dt) {
    inst.state.kWh += (Math.max(0, inst.state.P) * dt) / 3.6e6;
    return false;
  },
  interact: { resetEnergy: (inst) => { inst.state.kWh = 0; return { msg: `${inst.tag}: contatore azzerato.` }; } },
  paths: () => [['Lin', 'Lout'], ['Nin', 'Nout']],
  readouts: (inst) => {
    const s = inst.state;
    return [
      { label: 'Tensione', value: fmtV(s.V) },
      { label: 'Corrente', value: fmtA(s.I) },
      { label: 'Potenza attiva', value: fmtW(s.P) },
      { label: 'Fattore di potenza', value: fmt(s.cos, 2) },
      { label: 'Energia', value: `${fmt(s.kWh, 3)} kWh` },
    ];
  },
};

export const lineVoltage = (ctx, a, b) => cabs(csub(ctx.V(a), ctx.V(b)));
