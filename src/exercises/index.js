// Esercitazioni guidate del laboratorio (dalla scheda “Dispositivi elettrotecnici: configuratore 3D”).
// Ogni passo ha una verifica automatica; le prove di funzionamento simulano l'impianto in isolamento
// (il circuito reale dello studente non viene modificato).
import { blankProject } from '../core/project.js';
import { build } from '../presets/builder.js';
import { appartamento, motore } from '../presets/index.js';
import { resolveParams } from '../catalog/defs/common.js';
import { DEFS } from '../catalog/defs/index.js';

export const PHASES = [
  { n: 1, title: 'Fase 1', text: 'Introduzione al configuratore e ai modelli' },
  { n: 2, title: 'Fase 2', text: 'Configurazione e progettazione' },
  { n: 3, title: 'Fase 3', text: 'Simulazione e analisi tecnica' },
  { n: 4, title: 'Fase 4', text: 'Verifica e presentazione' },
];

// ── Contesto per le verifiche ────────────────────────────────────────────────────────
export function exerciseContext(app) {
  const p = app.project;
  const sim = app.sim;
  const comps = (type) => p.components.filter((c) => c.type === type);
  const par = (c) => resolveParams(DEFS[c.type], c.params);
  const checks = () => app.checksPanel?.results || [];
  const endIs = (end, type, t) => {
    const c = p.comp(end.c);
    return c && (Array.isArray(type) ? type.includes(c.type) : c.type === type) && (t === undefined || (Array.isArray(t) ? t.includes(end.t) : end.t === t));
  };
  const ctx = {
    app,
    p,
    sim,
    comps,
    par,
    has: (type, pred) => comps(type).some((c) => !pred || pred(par(c), c)),
    count: (type, pred) => comps(type).filter((c) => !pred || pred(par(c), c)).length,
    /** esiste un cavo tra (tipo, morsetto) e (tipo, morsetto) */
    wired: (ta, a, tb, b) => p.wires.some((w) => (endIs(w.a, ta, a) && endIs(w.b, tb, b)) || (endIs(w.a, tb, b) && endIs(w.b, ta, a))),
    termWired: (type, t) => p.wires.some((w) => endIs(w.a, type, t) || endIs(w.b, type, t)),
    allWired: (type, t) => comps(type).length > 0 && comps(type).every((c) => p.wires.some((w) => (w.a.c === c.id && w.a.t === t) || (w.b.c === c.id && w.b.t === t))),
    checkOk: (prefix) => checks().some((r) => r.id.startsWith(prefix) && r.level === 'ok'),
    checkErr: (prefix) => checks().some((r) => r.id.startsWith(prefix) && r.level === 'error'),
    noErrors: (prefix = '') => !checks().some((r) => r.id.startsWith(prefix) && r.level === 'error'),
    powered: () => !!sim.getInst('XA')?.state.on,
    lit: (id) => (sim.getInst(id)?.view.bright || 0) > 0.5,
    anyLit: () => comps('lamp').some((c) => (sim.getInst(c.id)?.view.bright || 0) > 0.5),
    state: (id) => sim.getInst(id)?.state || {},
    scenario: (steps) => sim.scenario(steps),
    first: (type) => comps(type)[0],
  };
  return ctx;
}

const lampBright = (sim, id) => sim.getInst(id)?.view.bright || 0;
const anyTripped = (sim) => [...sim.inst.values()].some((i) => i.state.tripped);

// ── Esercitazioni ─────────────────────────────────────────────────────────────────────
export const EXERCISES = [
  {
    id: 'punto-luce',
    title: 'Il primo impianto: un punto luce',
    level: 'Base',
    phase: 2,
    icon: 'lamp',
    color: '#2f9a4a',
    duration: '1 ora',
    summary: 'Configurazione base di un impianto: protezione, comando e utilizzatore.',
    goals: [
      'Riconoscere arrivo linea, protezione, comando e utilizzatore',
      'Collegare fase e neutro rispettando colori e sezioni',
      'Capire perché il comando interrompe la fase',
    ],
    start: () => blankProject({ sys: '1F', title: 'Punto luce interrotto' }),
    solution: () => build({ sys: '1F', title: 'Punto luce interrotto — soluzione' }, (b) => {
      b.add('Q1', 'mcb1pn', 'R2:0', { In: 10 });
      b.add('SA1', 'sa', 'A1');
      b.add('E1', 'lamp', 'A2');
      b.wire('XA:L1', 'Q1:1', 6);
      b.wire('XA:N', 'Q1:N1', 6);
      b.wire('Q1:2', 'SA1:L', 1.5);
      b.wire('SA1:1', 'E1:L', 1.5, 'grey');
      b.wire('Q1:N2', 'E1:N', 1.5);
    }),
    steps: [
      { text: 'Dalla libreria monta un magnetotermico 1P+N su una guida DIN del quadro.', hint: 'Famiglia “Manovra e protezione”. Clic sulla copertina, poi clic su una guida libera.', done: (c) => c.has('mcb1pn') },
      { text: 'Imposta la corrente nominale a 10 A: la linea luce sarà in cavo da 1,5 mm².', hint: 'Seleziona il magnetotermico e cambia “Corrente nominale In” nel pannello Proprietà.', done: (c) => c.has('mcb1pn', (p) => p.In === 10) },
      { text: 'Collega l’arrivo linea ai morsetti superiori del magnetotermico: L → 1 e N → N.', hint: 'Strumento Cabla (W): clic sul morsetto L di XA, poi sul morsetto 1 del magnetotermico. Stessa cosa per il neutro.', done: (c) => c.wired('supply', 'L1', 'mcb1pn', '1') && c.wired('supply', 'N', 'mcb1pn', 'N1') },
      { text: 'Sul pannello utenze monta un interruttore e un punto luce.', done: (c) => c.has('sa') && c.has('lamp') },
      { text: 'Collega la fase dal magnetotermico (2) all’interruttore, dall’interruttore alla lampada (L), e il neutro dal magnetotermico (N) alla lampada.', hint: 'Il comando deve interrompere la fase, mai il neutro.', done: (c) => c.termWired('lamp', 'L') && c.termWired('lamp', 'N') && c.termWired('sa', 'L') && c.termWired('sa', '1') },
      { text: 'Alimenta l’impianto e accendi la lampada con l’interruttore.', hint: 'Pulsante “Impianto non alimentato” in basso, poi clic sul tasto dell’interruttore.', done: (c) => c.powered() && c.anyLit() },
    ],
    tests: [
      {
        label: 'La lampada si accende con l’interruttore chiuso e si spegne con l’interruttore aperto',
        run: (c) => {
          const sa = c.first('sa');
          const e = c.first('lamp');
          if (!sa || !e) return false;
          const [a, b] = c.scenario([{ power: true }, { set: [sa.id, { on: false }] }, { check: (s) => lampBright(s, e.id) }, { set: [sa.id, { on: true }] }, { check: (s) => lampBright(s, e.id) }]);
          return a < 0.05 && b > 0.5;
        },
      },
      { label: 'Il comando interrompe la fase (non il neutro)', run: (c) => !c.checkErr('sw-n-') },
      { label: 'Colori dei conduttori conformi (fase, neutro blu, PE giallo-verde)', run: (c) => !c.checkErr('col-') },
      { label: 'Coordinamento Ib ≤ In ≤ Iz del magnetotermico', run: (c) => c.comps('mcb1pn').every((m) => !c.checkErr('coord-' + m.id)) && c.comps('mcb1pn').some((m) => c.checkOk('coord-' + m.id)) },
    ],
    questions: [
      'Perché l’interruttore di comando va inserito sul conduttore di fase?',
      'Misura con la pinza amperometrica la corrente della lampada: è coerente con P = V · I · cosφ?',
      'Porta la distanza della lampada a 60 m: come cambia la caduta di tensione? Quale sezione la riporterebbe sotto il 4%?',
    ],
  },

  {
    id: 'appartamento',
    title: 'Il quadro di un appartamento',
    level: 'Intermedio',
    phase: 2,
    icon: 'house',
    color: '#2f6fd0',
    duration: '2 ore',
    summary: 'Generale differenziale, linee luci e prese separate, conduttore di protezione.',
    goals: [
      'Suddividere l’impianto in linee protette separatamente',
      'Applicare la protezione differenziale e il collegamento a terra',
      'Verificare il coordinamento tra interruttori e cavi',
    ],
    start: () => blankProject({ sys: '1F', title: 'Quadro di un appartamento' }),
    solution: appartamento,
    steps: [
      { text: 'Come interruttore generale monta un magnetotermico-differenziale 1P+N da 25 A con IΔn = 30 mA.', done: (c) => c.has('rcbo1pn', (p) => p.In >= 25 && p.IDn <= 0.03) },
      { text: 'Aggiungi due magnetotermici: linea luci da 10 A e linea prese da 16 A.', done: (c) => c.has('mcb1pn', (p) => p.In === 10) && c.has('mcb1pn', (p) => p.In === 16) },
      { text: 'Alimenta le due linee dal generale (2 → 1, N → N) con cavi da 4 mm².', done: (c) => c.allWired('mcb1pn', '1') && c.allWired('mcb1pn', 'N1') && c.termWired('rcbo1pn', '2') },
      { text: 'Sulla linea luci realizza un punto luce comandato da interruttore.', done: (c) => c.has('lamp') && c.has('sa') && c.termWired('lamp', 'L') },
      { text: 'Sulla linea prese installa due prese 2P+T in cavo da 2,5 mm², con il PE collegato al collettore di terra.', hint: 'Il PE parte da un morsetto libero della barra di terra (PE) e arriva al morsetto PE della presa.', done: (c) => c.count('xs') >= 2 && c.comps('xs').every((x) => c.checkOk('pe-' + x.id)) },
      { text: 'Alimenta l’impianto, collega una stufetta e una lavatrice alle prese e leggi la potenza al contatore.', hint: 'Seleziona una presa e scegli l’apparecchio collegato.', done: (c) => c.powered() && (c.sim.getInst('XA')?.state.P || 0) > 3000 },
    ],
    tests: [
      { label: 'Ogni presa è protetta da un differenziale da 30 mA', run: (c) => c.count('xs') > 0 && c.comps('xs').every((x) => c.checkOk('rcd-' + x.id)) },
      { label: 'Continuità del conduttore di protezione verso tutte le prese', run: (c) => c.count('xs') > 0 && c.comps('xs').every((x) => c.checkOk('pe-' + x.id)) },
      { label: 'Nessun errore di coordinamento Ib ≤ In ≤ Iz', run: (c) => c.noErrors('coord-') && c.noErrors('sez-') },
      {
        label: 'Un guasto verso massa su un apparecchio fa intervenire il differenziale',
        run: (c) => {
          const x = c.first('xs');
          if (!x) return false;
          const [t] = c.scenario([{ power: true }, { params: [x.id, { carico: 'washer', guasto: 'd50' }] }, { check: (s) => anyTripped(s) }]);
          return t;
        },
      },
      {
        label: 'Il tasto di prova T del generale funziona',
        run: (c) => {
          const q = c.first('rcbo1pn');
          if (!q) return false;
          const [t] = c.scenario([{ power: true }, { act: [q.id, 'test', 'down'] }, { check: (s) => s.getInst(q.id).state.tripped }]);
          return t;
        },
      },
    ],
    questions: [
      'Perché conviene separare la linea luci dalla linea prese?',
      'Calcola la corrente di impiego Ib della linea prese con stufetta e lavatrice accese: il magnetotermico da 16 A è adeguato?',
      'Con 3 kW contrattuali, cosa succede se accendi insieme forno, lavatrice e stufetta? Come si potrebbe evitare?',
    ],
  },

  {
    id: 'passo-passo',
    title: 'Luce comandata da tre punti con relè passo-passo',
    level: 'Intermedio',
    phase: 2,
    icon: 'sparkles',
    color: '#8a4fd0',
    duration: '1 ora',
    summary: 'Impianto domotico di base: pulsanti in parallelo e relè a impulsi.',
    goals: ['Distinguere circuito di comando e circuito di potenza', 'Usare pulsanti in parallelo per comandare una bobina', 'Comprendere il funzionamento “a impulsi”'],
    start: () => blankProject({ sys: '1F', title: 'Relè passo-passo' }),
    solution: () => build({ sys: '1F', title: 'Relè passo-passo — soluzione' }, (b) => {
      b.add('Q1', 'mcb1pn', 'R2:0', { In: 10 });
      b.add('KA1', 'kpp', 'R2:3');
      b.add('SB1', 'sp', 'A1');
      b.add('SB2', 'sp', 'A2');
      b.add('SB3', 'sp', 'A3');
      b.add('E1', 'lamp', 'A4');
      b.wire('XA:L1', 'Q1:1', 6);
      b.wire('XA:N', 'Q1:N1', 6);
      b.wire('Q1:2', 'SB1:3');
      b.wire('SB1:3', 'SB2:3');
      b.wire('SB2:3', 'SB3:3');
      b.wire('SB1:4', 'KA1:A1', 1, 'red');
      b.wire('SB1:4', 'SB2:4', 1.5, 'red');
      b.wire('SB2:4', 'SB3:4', 1.5, 'red');
      b.wire('KA1:A2', 'Q1:N2');
      b.wire('Q1:2', 'KA1:11');
      b.wire('KA1:14', 'E1:L', 1.5, 'grey');
      b.wire('E1:N', 'KA1:A2');
    }),
    steps: [
      { text: 'Monta un magnetotermico 1P+N da 10 A e collegalo all’arrivo linea.', done: (c) => c.has('mcb1pn') && c.wired('supply', 'L1', 'mcb1pn', '1') },
      { text: 'Monta un relè passo-passo sulla guida DIN.', done: (c) => c.has('kpp') },
      { text: 'Sul pannello installa tre pulsanti NA e una lampada.', done: (c) => c.count('sp', (p) => p.contact === 'NA') >= 3 && c.has('lamp') },
      { text: 'Collega i tre pulsanti in parallelo tra la fase e la bobina (A1); A2 va al neutro.', hint: 'Morsetto 3 di tutti i pulsanti sulla fase, morsetto 4 di tutti i pulsanti verso A1.', done: (c) => c.termWired('kpp', 'A1') && c.termWired('kpp', 'A2') && c.count('sp') >= 3 && c.comps('sp').every((s) => c.p.wiresAt({ c: s.id, t: '4' }).length > 0) },
      { text: 'Alimenta la lampada attraverso il contatto 11-14 del relè.', done: (c) => c.termWired('kpp', '11') && c.termWired('kpp', '14') },
    ],
    tests: [
      {
        label: 'Ogni pulsante accende e spegne la lampada',
        run: (c) => {
          const e = c.first('lamp');
          const sbs = c.comps('sp');
          if (!e || sbs.length < 3) return false;
          const steps = [{ power: true }];
          for (const s of sbs.slice(0, 3)) steps.push({ act: [s.id, 'press', 'down'] }, { act: [s.id, 'press', 'up'] }, { check: (x) => lampBright(x, e.id) > 0.5 });
          const r = c.scenario(steps);
          return r.length === 3 && r[0] === true && r[1] === false && r[2] === true;
        },
      },
      { label: 'Colori dei conduttori conformi', run: (c) => !c.checkErr('col-') },
    ],
    questions: ['Perché con il relè passo-passo si possono aggiungere punti di comando senza cambiare il circuito di potenza?', 'Che differenza c’è con il comando a deviatori e invertitori?'],
  },

  {
    id: 'luce-scale',
    title: 'Luce scale temporizzata e sensore di presenza',
    level: 'Intermedio',
    phase: 3,
    icon: 'timer',
    color: '#d08a1f',
    duration: '1 ora',
    summary: 'Automatismi per l’abitazione: temporizzatore e rilevatore di presenza.',
    goals: ['Usare un relè temporizzato', 'Collegare un rilevatore di presenza a tre fili', 'Valutare il risparmio energetico dei comandi automatici'],
    start: () => blankProject({ sys: '1F', title: 'Luce scale e presenza' }),
    solution: () => build({ sys: '1F', title: 'Luce scale — soluzione' }, (b) => {
      b.add('Q1', 'mcb1pn', 'R2:0', { In: 10 });
      b.add('KT1', 'kt', 'R2:3', { T: 20 });
      b.add('SB1', 'sp', 'A1');
      b.add('SB2', 'sp', 'A2');
      b.add('E1', 'lamp', 'A3');
      b.add('BG1', 'pir', 'B1');
      b.add('E2', 'lamp', 'B2');
      b.wire('XA:L1', 'Q1:1', 6);
      b.wire('XA:N', 'Q1:N1', 6);
      b.wire('Q1:2', 'SB1:3');
      b.wire('SB1:3', 'SB2:3');
      b.wire('SB1:4', 'KT1:A1', 1.5, 'red');
      b.wire('SB2:4', 'SB1:4', 1.5, 'red');
      b.wire('KT1:A2', 'Q1:N2');
      b.wire('Q1:2', 'KT1:15');
      b.wire('KT1:18', 'E1:L', 1.5, 'grey');
      b.wire('E1:N', 'KT1:A2');
      b.wire('KT1:15', 'BG1:L');
      b.wire('BG1:N', 'E1:N');
      b.wire('BG1:OUT', 'E2:L', 1.5, 'grey');
      b.wire('E2:N', 'BG1:N');
    }),
    steps: [
      { text: 'Monta un magnetotermico 10 A e un relè temporizzato luce scale; imposta il tempo a 20 s.', done: (c) => c.has('mcb1pn') && c.has('kt', (p) => p.T === 20) },
      { text: 'Collega due pulsanti in parallelo sulla bobina del temporizzatore (A1-A2).', done: (c) => c.termWired('kt', 'A1') && c.termWired('kt', 'A2') && c.count('sp') >= 2 },
      { text: 'Alimenta una lampada attraverso il contatto 15-18.', done: (c) => c.termWired('kt', '15') && c.termWired('kt', '18') && c.has('lamp') },
      { text: 'Aggiungi un rilevatore di presenza: L e N per alimentarlo, OUT verso una seconda lampada.', done: (c) => c.has('pir') && c.termWired('pir', 'L') && c.termWired('pir', 'N') && c.termWired('pir', 'OUT') },
      { text: 'Alimenta l’impianto, premi un pulsante e osserva lo spegnimento automatico.', done: (c) => c.powered() && c.comps('kt').some((k) => (c.state(k.id).remaining || 0) > 0) },
    ],
    tests: [
      {
        label: 'La luce si accende con un impulso e si spegne da sola dopo il tempo impostato',
        run: (c) => {
          const kt = c.first('kt');
          if (!kt) return false;
          const T = c.par(kt).T;
          const lamp = c.comps('lamp').find((l) => c.p.wires.some((w) => (w.a.c === kt.id && w.a.t === '18' && w.b.c === l.id) || (w.b.c === kt.id && w.b.t === '18' && w.a.c === l.id))) || c.first('lamp');
          const sb = c.first('sp');
          if (!lamp || !sb) return false;
          const r = c.scenario([{ power: true }, { act: [sb.id, 'press', 'down'] }, { act: [sb.id, 'press', 'up'] }, { check: (s) => lampBright(s, lamp.id) > 0.5 }, { wait: T + 1 }, { check: (s) => lampBright(s, lamp.id) < 0.05 }]);
          return r[0] && r[1];
        },
      },
      {
        label: 'Il rilevatore di presenza accende la sua lampada',
        run: (c) => {
          const bg = c.first('pir');
          if (!bg) return false;
          const lamp = c.comps('lamp').find((l) => c.p.wires.some((w) => (w.a.c === bg.id && w.a.t === 'OUT' && w.b.c === l.id) || (w.b.c === bg.id && w.b.t === 'OUT' && w.a.c === l.id)));
          if (!lamp) return false;
          const [r] = c.scenario([{ power: true }, { act: [bg.id, 'trigger'] }, { check: (s) => lampBright(s, lamp.id) > 0.5 }]);
          return r;
        },
      },
    ],
    questions: ['Quanta energia si risparmia in un anno se la luce scale resta accesa 20 s invece di 10 minuti a ogni passaggio?', 'Perché il rilevatore di presenza ha bisogno anche del neutro?'],
  },

  {
    id: 'motore',
    title: 'Teleavviamento di un motore asincrono trifase',
    level: 'Avanzato',
    phase: 2,
    icon: 'fan',
    color: '#c8322b',
    duration: '3 ore',
    summary: 'Progettazione di un sistema di automazione semplice: contattore, autoritenuta, relè termico.',
    goals: ['Distinguere circuito di potenza e circuito di comando', 'Realizzare l’autoritenuta con il contatto 13-14', 'Proteggere il motore da sovraccarico e cortocircuito'],
    start: () => {
      const p = blankProject({ sys: '3F', earth: 'TN-S', title: 'Teleavviamento motore' });
      p.components[0].params.Pc = 10;
      p.components[0].params.Icc = 6;
      return p;
    },
    solution: motore,
    steps: [
      { text: 'Monta l’interruttore generale 3P+N e un magnetotermico 3P in curva D per la linea motore.', done: (c) => c.has('mcb4p') && c.has('mcb3p', (p) => p.curve === 'D' || p.curve === 'C') },
      { text: 'Monta contattore e relè termico; regola il relè sulla corrente di targa del motore.', done: (c) => c.has('km3') && c.has('fr3') },
      { text: 'Installa il motore sul pannello (collegamento a stella) e la pulsantiera marcia-arresto.', done: (c) => c.has('m3', (p) => p.conn === 'Y') && c.has('ss') },
      { text: 'Circuito di potenza: magnetotermico → contattore (1-3-5 / 2-4-6) → relè termico → motore (U1-V1-W1), più il PE al motore.', done: (c) => c.termWired('m3', 'U1') && c.termWired('m3', 'V1') && c.termWired('m3', 'W1') && c.termWired('m3', 'PE') },
      { text: 'Circuito di comando a 230 V: magnetotermico 1P+N → 95-96 del relè termico → ARRESTO (NC) → MARCIA (NA) → A1; A2 al neutro.', done: (c) => c.termWired('km3', 'A1') && c.termWired('km3', 'A2') && c.termWired('fr3', '95') && c.termWired('ss', '1') },
      { text: 'Realizza l’autoritenuta: contatto 13-14 del contattore in parallelo al pulsante di MARCIA.', done: (c) => c.termWired('km3', '13') && c.termWired('km3', '14') },
      { text: 'Alimenta e avvia il motore con la pulsantiera.', done: (c) => c.comps('m3').some((m) => c.state(m.id).mode === 'run') },
    ],
    tests: [
      {
        label: 'MARCIA avvia il motore e l’autoritenuta lo mantiene in moto',
        run: (c) => {
          const ss = c.first('ss');
          const m = c.first('m3');
          if (!ss || !m) return false;
          const r = c.scenario([{ power: true }, { act: [ss.id, 'start', 'down'] }, { act: [ss.id, 'start', 'up'] }, { wait: 2 }, { check: (s) => s.getInst(m.id).state.mode === 'run' }]);
          return r[0];
        },
      },
      {
        label: 'ARRESTO ferma il motore',
        run: (c) => {
          const ss = c.first('ss');
          const m = c.first('m3');
          const km = c.first('km3');
          if (!ss || !m || !km) return false;
          const r = c.scenario([{ power: true }, { act: [ss.id, 'start', 'down'] }, { act: [ss.id, 'start', 'up'] }, { wait: 2 }, { act: [ss.id, 'stop', 'down'] }, { act: [ss.id, 'stop', 'up'] }, { check: (s) => !s.getInst(km.id).state.coil }]);
          return r[0];
        },
      },
      {
        label: 'Il motore gira in senso orario (sequenza delle fasi corretta)',
        run: (c) => {
          const ss = c.first('ss');
          const m = c.first('m3');
          if (!ss || !m) return false;
          const r = c.scenario([{ power: true }, { act: [ss.id, 'start', 'down'] }, { act: [ss.id, 'start', 'up'] }, { wait: 2 }, { check: (s) => s.getInst(m.id).state.dir === 1 && s.getInst(m.id).state.mode === 'run' }]);
          return r[0];
        },
      },
      {
        label: 'In sovraccarico interviene il relè termico e il motore si ferma',
        run: (c) => {
          const ss = c.first('ss');
          const m = c.first('m3');
          const fr = c.first('fr3');
          const km = c.first('km3');
          if (!ss || !m || !fr || !km) return false;
          const r = c.scenario([{ power: true }, { params: [m.id, { load: 150 }] }, { act: [ss.id, 'start', 'down'] }, { act: [ss.id, 'start', 'up'] }, { wait: 240 }, { check: (s) => s.getInst(fr.id).state.tripped && !s.getInst(km.id).state.coil }]);
          return r[0];
        },
      },
      { label: 'Relè termico regolato sulla corrente del motore', run: (c) => c.comps('m3').every((m) => c.checkOk('mot-' + m.id)) },
    ],
    questions: ['Perché per la linea motore si sceglie la curva D (o C) e non la B?', 'Cosa succede se si scambiano due fasi del motore? Provalo.', 'Perché il contatto 95-96 del relè termico è nel circuito di comando e non in quello di potenza?'],
  },

  {
    id: 'carichi',
    title: 'Valutazione dei carichi e potenza impegnata',
    level: 'Base',
    phase: 3,
    icon: 'activity',
    color: '#0f8a8a',
    duration: '1 ora',
    summary: 'Simulazione del flusso energetico: contemporaneità dei carichi e limitatore del contatore.',
    goals: ['Leggere tensione, corrente e potenza', 'Capire il limitatore del contatore', 'Scegliere la potenza contrattuale'],
    start: appartamento,
    solution: null,
    steps: [
      { text: 'Alimenta l’impianto e attiva la vista “Corrente” dei conduttori (barra in basso).', done: (c) => c.powered() && c.app?.settings.wireMode === 'flow' },
      { text: 'Collega alle prese forno e lavatrice: leggi la potenza sul contatore di energia P1.', done: (c) => c.comps('xs').filter((x) => ['oven', 'washer'].includes(c.par(x).carico)).length >= 2 },
      { text: 'Aspetta: il contatore del distributore stacca per superamento della potenza disponibile. Annota dopo quanto tempo.', done: (c) => c.app?.flags?.limiter },
      { text: 'Trova una soluzione: aumenta la potenza contrattuale dell’arrivo linea (XA) oppure riduci i carichi contemporanei.', done: (c) => c.powered() && !(c.state('XA').limiter) && (c.state('XA').P || 0) > 3300 },
    ],
    tests: [{ label: 'La potenza installata è compatibile con la potenza disponibile', run: (c) => !c.p.components.length || !(c.app?.checksPanel?.results || []).some((r) => r.id === 'power' && r.level === 'warn') }],
    questions: ['Qual è la potenza disponibile con 3 kW contrattuali? E con 4,5 kW?', 'Che cos’è il coefficiente di contemporaneità?'],
  },

  {
    id: 'guasto-terra',
    title: 'Guasto a terra e protezione delle persone',
    level: 'Intermedio',
    phase: 3,
    icon: 'shield',
    color: '#b8322b',
    duration: '1 ora',
    summary: 'Analisi dei parametri guidata dal docente: sistema TT, differenziale e conduttore di protezione.',
    goals: ['Comprendere il percorso della corrente di guasto nel sistema TT', 'Verificare Re · IΔn ≤ 50 V', 'Capire il ruolo di PE e differenziale'],
    start: appartamento,
    solution: null,
    teacher: true,
    steps: [
      { text: 'Attiva la modalità docente (Impostazioni) e alimenta l’impianto.', done: (c) => c.app?.settings.teacher && c.powered() },
      { text: 'Seleziona la presa XS2 e inserisci un “guasto franco a massa”: osserva l’intervento del generale differenziale.', done: (c) => c.comps('xs').some((x) => c.par(x).guasto === 'franco') && c.app?.flags?.rcdTrip },
      { text: 'Misura con il multimetro la tensione tra la massa e la terra prima dell’intervento: la protezione è efficace?', done: () => true },
      { text: 'Rimuovi il conduttore PE della presa, attiva “persona a contatto” e riarma: leggi la corrente nel corpo e la zona di pericolosità.', done: (c) => c.comps('xs').some((x) => c.par(x).persona) },
      { text: 'Aumenta la resistenza di terra Re dell’arrivo linea (es. 200 Ω): con IΔn = 30 mA la condizione Re · IΔn ≤ 50 V è ancora rispettata? E con un differenziale da 300 mA? Controlla la scheda Verifiche.', done: (c) => (c.par(c.p.supply()).Re || 0) >= 200 },
    ],
    tests: [{ label: 'Tutte le masse sono collegate a terra', run: (c) => c.noErrors('pe-') }],
    questions: ['Perché nel sistema TT il magnetotermico da solo non basta contro i contatti indiretti?', 'Qual è la massima resistenza di terra ammessa con un differenziale da 30 mA?'],
  },
];

export const exerciseById = (id) => EXERCISES.find((e) => e.id === id);
