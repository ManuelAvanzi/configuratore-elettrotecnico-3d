// Esercitazioni guidate del laboratorio (dalla scheda “Dispositivi elettrotecnici: configuratore 3D”).
// Ogni passo ha una verifica automatica (`done`); i passi `live` richiedono un'azione dal vivo (dare corrente,
// premere un pulsante) e non sono soddisfatti dalla sola soluzione. Le prove di funzionamento simulano
// l'impianto in isolamento (il circuito reale dello studente non viene modificato).
import { blankProject } from '../core/project.js';
import { build } from '../presets/builder.js';
import { appartamento, motore, domotica, nave, naveVuota, cabina, naveMT } from '../presets/index.js';

/** Copia di un progetto senza i cavi che soddisfano `pred(wire, tagOf)` (impianti di partenza “da completare”) */
function withoutWires(data, pred) {
  const tagOf = (end) => data.components.find((c) => c.id === end.c)?.tag;
  data.wires = data.wires.filter((w) => !pred(w, tagOf));
  return data;
}
import { resolveParams } from '../catalog/defs/common.js';
import { DEFS } from '../catalog/defs/index.js';

// Le quattro fasi della scheda del laboratorio (modalità di svolgimento).
export const PHASES = [
  { n: 1, title: 'Fase 1', text: 'Introduzione al configuratore e ai modelli predefiniti', short: 'Introduzione e modelli' },
  { n: 2, title: 'Fase 2', text: 'Configurazione e progettazione in VR', short: 'Configurazione in VR' },
  { n: 3, title: 'Fase 3', text: 'Analisi tecnica dei parametri guidata dal docente', short: 'Analisi con il docente' },
  { n: 4, title: 'Fase 4', text: 'Verifica e presentazione finale della configurazione adottata', short: 'Verifica e presentazione' },
];

// Le cinque esercitazioni pratiche in classe previste dalla scheda del catalogo: ogni esercitazione
// del configuratore appartiene a uno di questi percorsi (campo `track`).
export const TRACKS = [
  { n: 1, id: 'base', title: 'Configurazione base di un impianto elettrico', text: 'Protezione, comando e utilizzatore; poi il quadro di un appartamento con le sue linee.' },
  { n: 2, id: 'quadro', title: 'Montaggio virtuale di un quadro con collegamenti logici tra componenti', text: 'Circuito di comando e circuito di potenza: relè, contattori, autoritenuta.' },
  { n: 3, id: 'domotica', title: 'Configurazione di un impianto domotico per uso civile', text: 'Comandi automatici per l’abitazione: temporizzatori, crepuscolare, rilevatore di presenza.' },
  { n: 4, id: 'parametri', title: 'Analisi dei parametri guidata dal docente', text: 'Si cambia un parametro alla volta e si osserva l’effetto: carichi, cadute di tensione, protezioni, guasti.' },
  { n: 5, id: 'presentazione', title: 'Presentazione dello studente della configurazione adottata', text: 'Lo studente espone l’impianto configurato e giustifica le scelte prese.' },
];
export const trackById = (id) => TRACKS.find((t) => t.id === id);

// Domande di giustificazione delle scelte (pannello Progetto → scheda tecnica e presentazione).
export const JUSTIFICATIONS = [
  { key: 'power', label: 'Fornitura e potenza', q: 'Perché hai scelto questa potenza contrattuale e questo sistema di distribuzione?' },
  { key: 'protection', label: 'Protezioni', q: 'Come hai scelto interruttori e differenziali (In, curva, IΔn, potere di interruzione)?' },
  { key: 'wiring', label: 'Conduttori', q: 'Come hai scelto sezioni, colori e percorsi dei conduttori?' },
  { key: 'alternatives', label: 'Varianti scartate', q: 'Quali soluzioni alternative hai considerato e perché le hai scartate?' },
];
const filled = (s, min = 15) => typeof s === 'string' && s.trim().length >= min;

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
    checkWarn: (prefix) => checks().some((r) => r.id.startsWith(prefix) && r.level === 'warn'),
    noErrors: (prefix = '') => !checks().some((r) => r.id.startsWith(prefix) && r.level === 'error'),
    noWarns: (prefix = '') => !checks().some((r) => r.id.startsWith(prefix) && (r.level === 'error' || r.level === 'warn')),
    /** segna un evento osservato durante l'esercitazione (si azzera quando si ricomincia) */
    seen: (name, now) => {
      if (!app?.flags) return !!now;
      app.flags.seen = app.flags.seen || {};
      if (now) app.flags.seen[name] = true;
      return !!app.flags.seen[name];
    },
    meta: () => p.meta,
    just: (key) => p.meta.justifications?.[key] || '',
    /** componenti montati dallo studente (esclusi arrivo linea e collettore di terra) */
    mounted: () => p.components.filter((c) => !DEFS[c.type].fixed),
    protections: () => p.components.filter((c) => DEFS[c.type].protection),
    noted: (c) => filled(c.note, 10),
    /** lampada alimentata dal morsetto (tipo, morsetto) */
    lampFrom: (type, t) => comps('lamp').find((l) => p.wires.some((w) => (endIs(w.a, type, t) && w.b.c === l.id) || (endIs(w.b, type, t) && w.a.c === l.id))),
    powered: () => !!sim.powerState?.().on,
    /** gruppi elettrogeni del progetto; genOn: in moto e chiuso sulla sbarra; bus: stato della sua sbarra */
    gens: () => comps('genset'),
    genOn: (g) => !!(sim.getInst(g.id)?.state.running && sim.getInst(g.id)?.state.closed),
    bus: (g) => sim.busAt?.(g.id, 'L1') || null,
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
    track: 'base',
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
      { live: true, text: 'Alimenta l’impianto e accendi la lampada con l’interruttore.', hint: 'Pulsante “Impianto non alimentato” in basso, poi clic sul tasto dell’interruttore.', done: (c) => c.powered() && c.anyLit() },
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
    track: 'base',
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
      { live: true, text: 'Alimenta l’impianto, collega una stufetta e una lavatrice alle prese e leggi la potenza al contatore.', hint: 'Seleziona una presa e scegli l’apparecchio collegato.', done: (c) => c.powered() && (c.sim.getInst('XA')?.state.P || 0) > 3000 },
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
    track: 'quadro',
    title: 'Luce comandata da tre punti con relè passo-passo',
    level: 'Intermedio',
    phase: 2,
    icon: 'sparkles',
    color: '#8a4fd0',
    duration: '1 ora',
    summary: 'Collegamenti logici: pulsanti in parallelo che comandano la bobina di un relè a impulsi.',
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
    track: 'domotica',
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
      { live: true, text: 'Alimenta l’impianto, premi un pulsante e osserva lo spegnimento automatico.', done: (c) => c.powered() && c.comps('kt').some((k) => (c.state(k.id).remaining || 0) > 0) },
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
    track: 'quadro',
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
      { live: true, text: 'Alimenta e avvia il motore con la pulsantiera.', done: (c) => c.comps('m3').some((m) => c.state(m.id).mode === 'run') },
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
    track: 'parametri',
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
    track: 'parametri',
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
  // ── Percorso 3: impianto domotico per uso civile ───────────────────────────────────
  {
    id: 'domotica-civile',
    track: 'domotica',
    title: 'La casa automatica: comandi domotici per uso civile',
    level: 'Intermedio',
    phase: 2,
    icon: 'house',
    color: '#1f8ad0',
    duration: '2 ore',
    summary: 'Configurazione di un impianto domotico civile: relè passo-passo, luce scale temporizzata, luce esterna con crepuscolare, garage con rilevatore di presenza.',
    goals: [
      'Suddividere l’impianto in funzioni (soggiorno, scale, esterno, garage) e automatizzarle',
      'Distinguere comando manuale, a impulsi, temporizzato e automatico',
      'Verificare l’impianto con la simulazione: luminosità esterna, presenza, tempi',
    ],
    start: () => {
      const p = blankProject({ sys: '1F', title: 'La casa automatica' });
      p.components[0].params.Pc = 4.5;
      return p;
    },
    solution: domotica,
    steps: [
      { text: 'Quadro: monta un magnetotermico-differenziale 1P+N (30 mA) come generale e un magnetotermico 1P+N da 10 A per la linea luci; collegali all’arrivo linea e tra loro.', hint: 'XA → generale (1, N); generale (2, N) → magnetotermico luci (1, N).', done: (c) => c.has('rcbo1pn', (p) => p.IDn <= 0.03) && c.has('mcb1pn', (p) => p.In === 10) && c.wired('supply', 'L1', 'rcbo1pn', '1') && c.termWired('mcb1pn', '1') && c.termWired('mcb1pn', 'N1') },
      { text: 'Soggiorno: relè passo-passo comandato da tre pulsanti in parallelo (3 sulla fase, 4 verso A1, A2 al neutro); la lampada si alimenta dal contatto 11-14.', done: (c) => c.has('kpp') && c.count('sp', (p) => p.contact === 'NA') >= 3 && c.termWired('kpp', 'A1') && c.termWired('kpp', 'A2') && c.termWired('kpp', '11') && !!c.lampFrom('kpp', '14') },
      { text: 'Scale: temporizzatore luce scale impostato a 20 s, un quarto pulsante sulla bobina (A1-A2) e una seconda lampada sul contatto 15-18.', done: (c) => c.has('kt', (p) => p.T === 20) && c.count('sp') >= 4 && c.termWired('kt', 'A1') && c.termWired('kt', 'A2') && c.termWired('kt', '15') && !!c.lampFrom('kt', '18') },
      { text: 'Esterno: interruttore crepuscolare con soglia 20 lx, alimentato tra L e N; il contatto 15-18 accende la luce esterna.', hint: 'Il crepuscolare va alimentato (L, N) e in più il morsetto 15 riceve la fase da commutare.', done: (c) => c.has('kcr', (p) => p.lux === 20) && c.termWired('kcr', 'L') && c.termWired('kcr', 'N') && c.termWired('kcr', '15') && !!c.lampFrom('kcr', '18') },
      { text: 'Garage: rilevatore di presenza (L e N per alimentarlo, OUT verso una lampada).', done: (c) => c.has('pir') && c.termWired('pir', 'L') && c.termWired('pir', 'N') && !!c.lampFrom('pir', 'OUT') },
      { live: true, text: 'Alimenta l’impianto e simula la sera: abbassa la luminosità esterna con il cursore del sole (barra in basso) sotto 20 lx. La luce esterna si accende da sola.', done: (c) => c.powered() && c.comps('kcr').some((k) => c.state(k.id).out) },
    ],
    tests: [
      {
        label: 'Ogni pulsante del soggiorno accende e spegne la lampada del relè passo-passo',
        run: (c) => {
          const ka = c.first('kpp');
          const e = c.lampFrom('kpp', '14');
          if (!ka || !e) return false;
          // pulsanti collegati (direttamente o in parallelo tra loro) alla bobina A1
          const a1 = new Set([ka.id + ':A1']);
          let grew = true;
          while (grew) {
            grew = false;
            for (const w of c.p.wires) {
              const ka_ = w.a.c + ':' + w.a.t;
              const kb_ = w.b.c + ':' + w.b.t;
              if (a1.has(ka_) !== a1.has(kb_)) {
                a1.add(ka_);
                a1.add(kb_);
                grew = true;
              }
            }
          }
          const sbs = c.comps('sp').filter((s) => a1.has(s.id + ':4') || a1.has(s.id + ':3'));
          if (sbs.length < 3) return false;
          const steps = [{ power: true }];
          for (const s of sbs.slice(0, 3)) steps.push({ act: [s.id, 'press', 'down'] }, { act: [s.id, 'press', 'up'] }, { check: (x) => lampBright(x, e.id) > 0.5 });
          const r = c.scenario(steps);
          return r.length === 3 && r[0] === true && r[1] === false && r[2] === true;
        },
      },
      {
        label: 'La luce scale si accende con un impulso e si spegne da sola dopo 20 s',
        run: (c) => {
          const kt = c.first('kt');
          const lamp = c.lampFrom('kt', '18');
          if (!kt || !lamp) return false;
          const T = c.par(kt).T;
          const sb = c.comps('sp').find((s) => c.p.wires.some((w) => (w.a.c === s.id && w.b.c === kt.id && w.b.t === 'A1') || (w.b.c === s.id && w.a.c === kt.id && w.a.t === 'A1')));
          if (!sb) return false;
          const r = c.scenario([{ power: true }, { act: [sb.id, 'press', 'down'] }, { act: [sb.id, 'press', 'up'] }, { check: (s) => lampBright(s, lamp.id) > 0.5 }, { wait: T + 1 }, { check: (s) => lampBright(s, lamp.id) < 0.05 }]);
          return r[0] && r[1];
        },
      },
      {
        label: 'La luce esterna si accende al buio e si spegne di giorno (crepuscolare)',
        run: (c) => {
          const kf = c.first('kcr');
          const lamp = c.lampFrom('kcr', '18');
          if (!kf || !lamp) return false;
          const r = c.scenario([{ power: true }, { env: { lux: 400 } }, { check: (s) => lampBright(s, lamp.id) }, { env: { lux: 2 } }, { check: (s) => lampBright(s, lamp.id) }, { env: { lux: 400 } }, { check: (s) => lampBright(s, lamp.id) }]);
          return r[0] < 0.05 && r[1] > 0.5 && r[2] < 0.05;
        },
      },
      {
        label: 'Il rilevatore di presenza accende la luce del garage',
        run: (c) => {
          const bg = c.first('pir');
          const lamp = c.lampFrom('pir', 'OUT');
          if (!bg || !lamp) return false;
          const [r] = c.scenario([{ power: true }, { act: [bg.id, 'trigger'] }, { check: (s) => lampBright(s, lamp.id) > 0.5 }]);
          return r;
        },
      },
      { label: 'Nessun errore di coordinamento e colori dei conduttori conformi', run: (c) => c.noErrors('coord-') && !c.checkErr('col-') },
    ],
    questions: [
      'Quale dei quattro comandi (passo-passo, temporizzato, crepuscolare, presenza) fa risparmiare più energia in una casa? Perché?',
      'Perché crepuscolare e rilevatore di presenza hanno bisogno del neutro mentre un interruttore no?',
      'Come cambieresti l’impianto per comandare anche la luce esterna a mano, oltre che dal crepuscolare?',
    ],
  },

  // ── Percorso 4: analisi dei parametri guidata dal docente ─────────────────────────
  {
    id: 'parametri',
    track: 'parametri',
    title: 'Analisi dei parametri: distanze, sezioni e protezioni',
    level: 'Intermedio',
    phase: 3,
    icon: 'sliders',
    color: '#0f6fa0',
    duration: '1 ora',
    summary: 'Con il docente: si cambia un parametro alla volta e si osserva l’effetto su caduta di tensione, coordinamento Ib ≤ In ≤ Iz e potere di interruzione.',
    goals: ['Legare un parametro di progetto a una grandezza misurata', 'Leggere e interpretare le verifiche tecniche', 'Motivare le scelte con i numeri'],
    start: appartamento,
    solution: null,
    teacher: true,
    steps: [
      { text: 'Alimenta l’impianto, collega una stufetta a una presa e attiva la vista “Corrente” dei conduttori (barra in basso).', done: (c) => c.powered() && c.has('xs', (p) => p.carico === 'heater') && c.app?.settings.wireMode === 'flow' },
      { text: 'Caduta di tensione: seleziona la presa con la stufetta e porta la “Distanza dal quadro” a 80 m. Nella scheda Verifiche la caduta di tensione supera il 4%.', hint: 'La caduta cresce con la lunghezza della linea e con la corrente: ΔV = 2 · ρ · L · I / S.', done: (c) => c.seen('dv', c.comps('xs').some((x) => c.par(x).carico === 'heater' && c.par(x).dist >= 80 && c.checkWarn('dv-' + x.id))) },
      { text: 'Correggi: aumenta la sezione dei conduttori di quella presa (seleziona il cavo → Sezione) finché la caduta torna sotto il 4%, senza accorciare la linea.', done: (c) => c.seen('dv') && c.comps('xs').some((x) => c.par(x).dist >= 80 && c.checkOk('dv-' + x.id)) },
      { text: 'Coordinamento: porta la corrente nominale del magnetotermico della linea prese a 25 A. La verifica Ib ≤ In ≤ Iz segnala che il cavo da 2,5 mm² non è più protetto. Poi riportalo a 16 A.', done: (c) => c.seen('coord', c.checkErr('coord-')) && c.noErrors('coord-') },
      { text: 'Potere di interruzione: nell’arrivo linea XA porta la corrente di cortocircuito presunta a 10 kA. Quali interruttori non sono più adeguati? Scegli un potere di interruzione sufficiente.', done: (c) => (c.par(c.p.supply()).Icc || 0) >= 10 && c.seen('pdi', c.checkErr('pdi-')) && c.noErrors('pdi-') },
      { text: 'Annota la motivazione (pannello Proprietà) sui componenti che hai modificato: presa, magnetotermico delle prese e generale, con il valore scelto e il perché.', done: (c) => c.mounted().filter((x) => c.noted(x)).length >= 3 },
    ],
    tests: [
      { label: 'Nessuna caduta di tensione oltre il 4%', run: (c) => c.noWarns('dv-') },
      { label: 'Coordinamento Ib ≤ In ≤ Iz e potere di interruzione corretti su tutti gli interruttori', run: (c) => c.noErrors('coord-') && c.noErrors('pdi-') },
      { label: 'Almeno tre componenti con la motivazione scritta', run: (c) => c.mounted().filter((x) => c.noted(x)).length >= 3 },
    ],
    questions: [
      'Scrivi la formula della caduta di tensione su una linea monofase: da quali grandezze dipende e come?',
      'Che cosa succede se In > Iz? E se Ib > In? Quale dei due è più pericoloso per il cavo?',
      'Che cosa rappresenta il potere di interruzione e perché dipende dal punto di consegna?',
    ],
  },

  // ── Percorso 5: presentazione dello studente con giustificazione delle scelte ──────
  {
    id: 'presentazione',
    track: 'presentazione',
    title: 'Presenta la tua configurazione e giustifica le scelte',
    level: 'Tutti i livelli',
    phase: 4,
    icon: 'present',
    color: '#ff5900',
    duration: '1 ora',
    summary: 'Lo studente espone alla classe l’impianto che ha configurato: dati del progetto, motivazione di ogni protezione, risposte alle domande di giustificazione, verifiche e scheda tecnica.',
    goals: ['Esporre una configurazione tecnica in modo ordinato', 'Giustificare ogni scelta con un criterio (norma, misura, costo, sicurezza)', 'Produrre l’output finale: impianto esplorabile e scheda tecnica'],
    keep: true,
    start: null,
    solution: null,
    steps: [
      { text: 'Parti dall’impianto che hai configurato (oppure apri un modello predefinito e personalizzalo): servono almeno tre componenti collegati.', done: (c) => c.mounted().length >= 3 && c.p.wires.filter((w) => !w.fixed).length >= 2 },
      { text: 'Compila i dati del progetto nel pannello Progetto: titolo, studente o gruppo, classe, descrizione e obiettivo dell’impianto.', hint: 'Il pannello Progetto compare quando non c’è niente di selezionato (Esc).', done: (c) => filled(c.meta().title, 3) && filled(c.meta().author, 3) && filled(c.meta().classe, 1) && filled(c.meta().description, 20) },
      { text: 'Scrivi la “Motivazione della scelta” di ogni dispositivo di protezione (In, curva, IΔn, potere di interruzione) nel pannello Proprietà.', done: (c) => c.protections().length > 0 && c.protections().every((x) => c.noted(x)) },
      { text: 'Rispondi alle quattro domande di giustificazione nel pannello Progetto: fornitura, protezioni, conduttori, varianti scartate.', done: (c) => JUSTIFICATIONS.every((j) => filled(c.just(j.key))) },
      { text: 'Apri la scheda Verifiche: nessuna non conformità. Gli avvisi che restano vanno spiegati durante la presentazione.', done: (c) => c.mounted().length >= 3 && c.noErrors() },
      { text: 'Alimenta l’impianto: durante la presentazione farai una prova di funzionamento dal vivo.', done: (c) => c.powered() },
      { text: 'Avvia la Presentazione (barra in alto) e percorri le slide: progetto, scelte, componenti uno per uno, verifiche.', done: (c) => !!c.app?.flags?.presented },
      { text: 'Genera la Scheda tecnica (stampa o PDF): è l’output finale del laboratorio insieme all’impianto esplorabile.', done: (c) => !!c.app?.flags?.reported },
    ],
    tests: [
      { label: 'Dati del progetto completi (titolo, studente, classe, descrizione)', run: (c) => filled(c.meta().title, 3) && filled(c.meta().author, 3) && filled(c.meta().classe, 1) && filled(c.meta().description, 20) },
      { label: 'Tutte le protezioni hanno una motivazione scritta', run: (c) => c.protections().length > 0 && c.protections().every((x) => c.noted(x)) },
      { label: 'Le quattro giustificazioni sono scritte', run: (c) => JUSTIFICATIONS.every((j) => filled(c.just(j.key))) },
      { label: 'Nessuna non conformità nelle verifiche', run: (c) => c.mounted().length >= 3 && c.noErrors() },
    ],
    questions: [
      'Quale alternativa hai scartato e perché? Che cosa avresti guadagnato o perso?',
      'Quale verifica o misura ti ha fatto cambiare una scelta durante il lavoro?',
      'Che cosa cambieresti se la potenza contrattuale raddoppiasse? E se il sistema fosse TN-S invece di TT?',
    ],
  },

  // ── Esercitazioni di bordo (modulo nautico) ────────────────────────────────────────
  {
    id: 'bordo-base',
    track: 'base',
    tema: 'nave',
    view: 'panoramica',
    title: 'Il primo impianto di bordo: un gruppo e due utenze',
    level: 'Intermedio',
    phase: 2,
    icon: 'waves',
    color: '#1d6fa8',
    duration: '1 ora',
    summary: 'Dal gruppo elettrogeno alla sbarra: arrivo, controllo dell’isolamento, una partenza luci e una pompa a 440 V 60 Hz.',
    goals: ['Capire che a bordo l’energia la produce un generatore, non il distributore', 'Collegare un gruppo trifase al quadro e “mettere a terra” lo scafo', 'Riconoscere il sistema IT e il controllo dell’isolamento'],
    start: naveVuota,
    solution: () => build({ sys: '3F', source: 'none', title: 'Il primo impianto di bordo — soluzione' }, (b) => {
      b.add('G1', 'genset', 'A1', { Sn: 50, net: 'nave440', earth: 'IT', auto: true });
      b.add('Q1', 'mcb4p', 'R1:0', { In: 80, curve: 'C', pdi: 6 });
      b.add('KI1', 'imd', 'R1:8', { soglia: 50 });
      b.add('Q4', 'mcb1pn', 'R2:0', { In: 10 });
      b.add('Q3', 'mcb3p', 'R2:3', { In: 32, curve: 'C', pdi: 6 });
      b.add('E1', 'lamp', 'B3', { lt: 'led15' });
      b.add('M1', 'm3', 'B1', { P: 7.5, conn: 'Y', load: 80 });
      b.wire('G1:L1', 'Q1:1', 25);
      b.wire('G1:L2', 'Q1:3', 25);
      b.wire('G1:L3', 'Q1:5', 25);
      b.wire('G1:N', 'Q1:N1', 25);
      b.wire('G1:PE', 'PE:PE1', 16);
      b.wire('Q1:2', 'Q3:1', 25);
      b.wire('Q1:4', 'Q3:3', 25);
      b.wire('Q1:6', 'Q3:5', 25);
      b.wire('Q3:1', 'Q4:1', 25);
      b.wire('Q1:N2', 'Q4:N1', 25);
      b.wire('Q4:2', 'E1:L', 1.5, 'grey');
      b.wire('Q4:N2', 'E1:N', 1.5);
      b.wire('Q4:2', 'KI1:L', 1.5);
      b.wire('Q4:N2', 'KI1:N', 1.5);
      b.wire('KI1:PE', 'PE:PE2', 1.5);
      b.wire('Q3:2', 'M1:U1', 6);
      b.wire('Q3:4', 'M1:V1', 6);
      b.wire('Q3:6', 'M1:W1', 6);
      b.wire('M1:PE', 'PE:PE3', 6);
    }),
    steps: [
      { text: 'Monta un magnetotermico 3P+N da 80 A come arrivo del gruppo e collegalo a G1 con cavi da 25 mm²: L1 → 1, L2 → 3, L3 → 5, N → N1.', hint: 'Il gruppo da 50 kVA ha una corrente nominale di 66 A: l’interruttore e i cavi devono reggerla.', done: (c) => c.has('mcb4p', (p) => p.In >= 80) && c.wired('genset', 'L1', 'mcb4p', '1') && c.wired('genset', 'L2', 'mcb4p', '3') && c.wired('genset', 'L3', 'mcb4p', '5') && c.wired('genset', 'N', 'mcb4p', 'N1') },
      { text: 'Collega il PE del gruppo al collettore di terra: a bordo la “terra” è lo scafo.', done: (c) => c.wired('genset', 'PE', 'pebar') },
      { text: 'Il neutro è isolato (sistema IT): monta il dispositivo di controllo dell’isolamento, alimentalo tra fase e neutro a valle dell’arrivo e collega il suo PE al collettore.', hint: 'Famiglia “Segnalazione e misura”. Senza controllo dell’isolamento un primo guasto a terra passerebbe inosservato.', done: (c) => c.has('imd') && c.termWired('imd', 'L') && c.termWired('imd', 'N') && c.wired('imd', 'PE', 'pebar') },
      { text: 'Monta una partenza luci (magnetotermico 1P+N da 10 A) alimentata dall’arrivo (2 → 1, N2 → N1) e una lampada a LED.', done: (c) => c.has('mcb1pn') && c.termWired('mcb1pn', '1') && c.termWired('mcb1pn', 'N1') && !!c.lampFrom('mcb1pn', '2') },
      { text: 'Monta una partenza trifase (magnetotermico 3P da 32 A, curva C) e una pompa: motore da 7,5 kW collegato a stella, con il PE.', hint: 'A 440 V un motore da 7,5 kW assorbe circa 13 A e allo spunto circa 80 A.', done: (c) => c.has('mcb3p') && c.has('m3', (p) => p.P <= 7.5 && p.conn === 'Y') && c.termWired('m3', 'U1') && c.termWired('m3', 'V1') && c.termWired('m3', 'W1') && c.termWired('m3', 'PE') },
      { live: true, text: 'Avvia il gruppo e chiudi l’interruttore di macchina (pannello Proprietà di G1 oppure il pulsante “Avvia la centrale” in basso).', done: (c) => c.gens().some((g) => c.genOn(g)) },
      { live: true, text: 'Leggi tensione (440 V) e frequenza (60 Hz) nelle Proprietà del gruppo; chiudi la partenza della pompa e osserva la caduta di tensione allo spunto.', done: (c) => c.powered() && c.comps('m3').some((m) => c.state(m.id).mode === 'run') },
    ],
    tests: [
      {
        label: 'Con il gruppo in servizio la lampada si accende a circa 254 V',
        run: (c) => {
          const e = c.first('lamp');
          if (!e) return false;
          // si aspetta che la pompa finisca lo spunto: durante l’avviamento la sbarra scende sotto i 220 V
          const [v] = c.scenario([{ power: true }, { wait: 3 }, { check: (s) => lampBright(s, e.id) > 0.5 && s.measureV({ c: e.id, t: 'L' }, { c: e.id, t: 'N' }) > 240 }]);
          return v;
        },
      },
      {
        label: 'La pompa si avvia e gira in senso diretto',
        run: (c) => {
          const m = c.first('m3');
          if (!m) return false;
          const [r] = c.scenario([{ power: true }, { wait: 2 }, { check: (s) => s.getInst(m.id).state.mode === 'run' && s.getInst(m.id).state.dir === 1 }]);
          return r;
        },
      },
      { label: 'Sistema IT con controllo dell’isolamento', run: (c) => c.checkOk('it-imd') },
      { label: 'Coordinamento cavi-interruttori senza errori', run: (c) => c.noErrors('coord-') && c.noErrors('pdi-') && c.noErrors('col-') },
    ],
    questions: ['Perché a bordo si preferisce il neutro isolato (sistema IT)?', 'Quanto vale la corrente di cortocircuito del gruppo rispetto alla sua corrente nominale? Perché è molto più bassa di quella della rete pubblica?', 'Che cosa succede alla tensione di sbarra quando la pompa parte? Con un gruppo più grande cambierebbe?'],
  },

  {
    id: 'bordo-parallelo',
    track: 'quadro',
    tema: 'nave',
    view: 'panoramica',
    title: 'Due gruppi in parallelo e riserva n−1',
    level: 'Avanzato',
    phase: 2,
    icon: 'waves',
    color: '#0f8a8a',
    duration: '2 ore',
    summary: 'Secondo gruppo, sincronizzazione e parallelo sulla sbarra, ripartizione del carico, distacco dei carichi non essenziali e avaria di un gruppo.',
    goals: ['Mettere in parallelo due generatori: tensione, frequenza e fase uguali', 'Leggere la ripartizione del carico', 'Garantire la continuità con un gruppo in avaria (n−1) e il distacco dei carichi'],
    start: () => build({ sys: '3F', source: 'none', title: 'Due gruppi in parallelo' }, (b) => {
      b.add('G1', 'genset', 'A1', { Sn: 50, net: 'nave440', earth: 'IT', auto: true }, 'Gruppo in servizio.');
      b.add('G2', 'genset', 'A3', { Sn: 50, net: 'nave440', earth: 'IT', auto: true }, 'Secondo gruppo: da collegare.');
      b.add('Q1', 'mcb4p', 'R1:0', { In: 80, curve: 'C', pdi: 6 });
      b.add('Q2', 'mcb4p', 'R1:4', { In: 80, curve: 'C', pdi: 6 }, 'Arrivo del secondo gruppo: da collegare.');
      b.add('KI1', 'imd', 'R1:8', { soglia: 50 });
      b.add('Q3', 'mcb3p', 'R2:0', { In: 32, curve: 'C', pdi: 6 });
      b.add('Q4', 'mcb1pn', 'R2:3', { In: 10 });
      b.add('Q5', 'mcb1pn', 'R2:5', { In: 16 });
      b.add('M1', 'm3', 'B1', { P: 7.5, conn: 'Y', load: 80 }, 'Pompa.');
      b.add('E1', 'lamp', 'B3', { lt: 'led15' }, 'Luci.');
      b.add('XS1', 'xs', 'C1', { carico: 'oven', tipo: 'sch' }, 'Cucina: non essenziale.');
      b.wire('G1:L1', 'Q1:1', 25);
      b.wire('G1:L2', 'Q1:3', 25);
      b.wire('G1:L3', 'Q1:5', 25);
      b.wire('G1:N', 'Q1:N1', 25);
      b.wire('G1:PE', 'PE:PE1', 16);
      b.wire('Q1:2', 'Q3:1', 25);
      b.wire('Q1:4', 'Q3:3', 25);
      b.wire('Q1:6', 'Q3:5', 25);
      b.wire('Q3:1', 'Q4:1', 25);
      b.wire('Q3:3', 'Q5:1', 25);
      b.wire('Q1:N2', 'Q4:N1', 25);
      b.wire('Q4:N1', 'Q5:N1', 25);
      b.wire('Q4:2', 'E1:L', 1.5, 'grey');
      b.wire('Q4:N2', 'E1:N', 1.5);
      b.wire('Q4:2', 'KI1:L', 1.5);
      b.wire('Q4:N2', 'KI1:N', 1.5);
      b.wire('KI1:PE', 'PE:PE3', 1.5);
      b.wire('Q3:2', 'M1:U1', 6);
      b.wire('Q3:4', 'M1:V1', 6);
      b.wire('Q3:6', 'M1:W1', 6);
      b.wire('M1:PE', 'PE:PE4', 6);
      b.wire('Q5:2', 'XS1:L', 2.5);
      b.wire('Q5:N2', 'XS1:N', 2.5);
      b.wire('XS1:PE', 'PE:PE5', 2.5);
    }),
    solution: () => build({ sys: '3F', source: 'none', title: 'Due gruppi in parallelo — soluzione' }, (b) => {
      b.add('G1', 'genset', 'A1', { Sn: 50, net: 'nave440', earth: 'IT', auto: true });
      b.add('G2', 'genset', 'A3', { Sn: 50, net: 'nave440', earth: 'IT', auto: true });
      b.add('Q1', 'mcb4p', 'R1:0', { In: 80, curve: 'C', pdi: 6 });
      b.add('Q2', 'mcb4p', 'R1:4', { In: 80, curve: 'C', pdi: 6 });
      b.add('KI1', 'imd', 'R1:8', { soglia: 50 });
      b.add('KL1', 'kls', 'R1:11', { soglia: 90, ritardo: 1 });
      b.add('Q3', 'mcb3p', 'R2:0', { In: 32, curve: 'C', pdi: 6 });
      b.add('Q4', 'mcb1pn', 'R2:3', { In: 10 });
      b.add('Q5', 'mcb1pn', 'R2:5', { In: 16 });
      b.add('M1', 'm3', 'B1', { P: 7.5, conn: 'Y', load: 80 });
      b.add('E1', 'lamp', 'B3', { lt: 'led15' });
      b.add('XS1', 'xs', 'C1', { carico: 'oven', tipo: 'sch' });
      for (const [G, Q] of [['G1', 'Q1'], ['G2', 'Q2']]) {
        b.wire(`${G}:L1`, `${Q}:1`, 25);
        b.wire(`${G}:L2`, `${Q}:3`, 25);
        b.wire(`${G}:L3`, `${Q}:5`, 25);
        b.wire(`${G}:N`, `${Q}:N1`, 25);
      }
      b.wire('G1:PE', 'PE:PE1', 16);
      b.wire('G2:PE', 'PE:PE2', 16);
      b.wire('Q1:2', 'Q2:2', 25);
      b.wire('Q1:4', 'Q2:4', 25);
      b.wire('Q1:6', 'Q2:6', 25);
      b.wire('Q1:N2', 'Q2:N2', 25);
      b.wire('Q2:2', 'Q3:1', 25);
      b.wire('Q2:4', 'Q3:3', 25);
      b.wire('Q2:6', 'Q3:5', 25);
      b.wire('Q3:1', 'Q4:1', 25);
      b.wire('Q3:3', 'KL1:11', 25);
      b.wire('KL1:12', 'Q5:1', 25);
      b.wire('Q2:N2', 'Q4:N1', 25);
      b.wire('Q4:N1', 'Q5:N1', 25);
      b.wire('Q4:2', 'E1:L', 1.5, 'grey');
      b.wire('Q4:N2', 'E1:N', 1.5);
      b.wire('Q4:2', 'KI1:L', 1.5);
      b.wire('Q4:N2', 'KI1:N', 1.5);
      b.wire('KI1:L', 'KL1:L', 1.5);
      b.wire('KI1:N', 'KL1:N', 1.5);
      b.wire('KI1:PE', 'PE:PE3', 1.5);
      b.wire('Q3:2', 'M1:U1', 6);
      b.wire('Q3:4', 'M1:V1', 6);
      b.wire('Q3:6', 'M1:W1', 6);
      b.wire('M1:PE', 'PE:PE4', 6);
      b.wire('Q5:2', 'XS1:L', 2.5);
      b.wire('Q5:N2', 'XS1:N', 2.5);
      b.wire('XS1:PE', 'PE:PE5', 2.5);
    }),
    steps: [
      { text: 'Collega il secondo gruppo G2 al suo arrivo Q2 (L1 → 1, L2 → 3, L3 → 5, N → N1, cavi da 25 mm²) e il suo PE al collettore di terra.', done: (c) => c.gens().length >= 2 && c.gens().every((g) => ['L1', 'L2', 'L3', 'N', 'PE'].every((t) => c.p.wiresAt({ c: g.id, t }).length > 0)) },
      { text: 'Realizza la sbarra: metti in parallelo le uscite dei due arrivi (2 ↔ 2, 4 ↔ 4, 6 ↔ 6, N2 ↔ N2) con cavi da 25 mm².', hint: 'Le uscite di Q1 e Q2 diventano gli stessi nodi: è la sbarra principale.', done: (c) => ['2', '4', '6', 'N2'].every((t) => c.wired('mcb4p', t, 'mcb4p', t)) },
      { live: true, text: 'Avvia G1 e chiudi il suo interruttore; poi avvia G2: la sbarra è già in tensione e il sincronizzatore impiega qualche secondo a portarlo in sincronismo.', hint: 'Se chiudessi G2 fuori fase, la corrente di circolazione farebbe intervenire la sua protezione.', done: (c) => c.gens().some((g) => c.genOn(g)) && c.gens().some((g) => c.state(g.id).running && c.state(g.id).synced && !c.state(g.id).closed) || c.gens().filter((g) => c.genOn(g)).length >= 2 },
      { live: true, text: 'Chiudi l’interruttore di G2: due gruppi in parallelo. Nelle Proprietà di ciascuno leggi la ripartizione del carico.', done: (c) => c.gens().some((g) => (c.bus(g)?.gens.length || 0) >= 2) },
      { text: 'Monta il relè di distacco carichi (soglia 90 %), alimentalo a valle della partenza luci e porta la cucina a valle del suo contatto 11-12.', hint: 'Famiglia “Comando e automazione”. Il contatto 11-12 va in serie alla fase che alimenta la partenza della cucina.', done: (c) => c.has('kls') && c.termWired('kls', 'L') && c.termWired('kls', 'N') && c.termWired('kls', '11') && c.termWired('kls', '12') },
      { live: true, text: 'Avaria: ferma G1 dal pannello Proprietà. G2 prende tutto il carico; se supera la soglia, il relè stacca la cucina. Poi riavvia G1 e rimettilo in parallelo.', done: (c) => c.seen('avaria', c.gens().some((g) => !c.state(g.id).running) && c.gens().some((g) => c.genOn(g))) },
    ],
    tests: [
      {
        label: 'I due gruppi si ripartiscono il carico in parti uguali',
        run: (c) => {
          const [g1, g2] = c.gens();
          if (!g1 || !g2) return false;
          const [r] = c.scenario([{ power: true }, { wait: 2.5 }, { check: (s) => { const a = s.getInst(g1.id).state; const b = s.getInst(g2.id).state; return a.closed && b.closed && a.P > 500 && Math.abs(a.P - b.P) / a.P < 0.1; } }]);
          return r;
        },
      },
      { label: 'Riserva n−1 verificata', run: (c) => c.checkOk('gen-n1') },
      { label: 'Relè di distacco carichi presente e collegato', run: (c) => c.has('kls') && c.termWired('kls', '12') },
      { label: 'Nessun errore di coordinamento', run: (c) => c.noErrors('coord-') && c.noErrors('pdi-') },
    ],
    questions: ['Che cosa deve coincidere prima di chiudere un gruppo su una sbarra in tensione? Che cosa succede se non coincide?', 'Perché due gruppi uguali si dividono il carico a metà? E se uno fosse da 100 kVA?', 'Con un gruppo in avaria, quali utenze staccheresti per prime?'],
  },

  {
    id: 'bordo-emergenza',
    track: 'domotica',
    tema: 'nave',
    view: 'panoramica',
    title: 'Black-out e porto: UPS, gruppo di emergenza, ATS e presa di banchina',
    level: 'Avanzato',
    phase: 2,
    icon: 'waves',
    color: '#c24a00',
    duration: '2 ore',
    summary: 'Automazione di bordo: alimentazione di emergenza entro 45 s (UPS, gruppo di emergenza, commutatore automatico) e collegamento alla banchina in porto.',
    goals: ['Distinguere utenze essenziali e non essenziali', 'Capire la sequenza del black-out: batteria, gruppo di emergenza, commutazione', 'Collegare la nave alla banchina rispettando interblocchi e sequenza delle fasi'],
    start: () => withoutWires(nave(), (w, tag) => ['G3', 'XB1'].includes(tag(w.a)) || ['G3', 'XB1'].includes(tag(w.b)) || (tag(w.a) === 'U1' && ['2', 'N2'].includes(w.a.t)) || (tag(w.b) === 'U1' && ['2', 'N2'].includes(w.b.t))),
    solution: nave,
    steps: [
      { text: 'Collega il gruppo di emergenza G3 al suo arrivo Q7 (L1 → 1, L2 → 3, L3 → 5, N → N1) con cavi da 10 mm² e il PE al collettore.', done: (c) => c.gens().filter((g) => c.par(g).emergenza).every((g) => ['L1', 'L2', 'L3', 'N', 'PE'].every((t) => c.p.wiresAt({ c: g.id, t }).length > 0)) && c.gens().some((g) => c.par(g).emergenza) },
      { text: 'Collega l’uscita dell’UPS (2, N2) alla partenza luci Q4 (1, N1): le luci di navigazione restano accese anche nei secondi del black-out.', done: (c) => c.wired('ups', '2', 'mcb1pn', '1') && c.wired('ups', 'N2', 'mcb1pn', 'N1') },
      { text: 'Collega la presa di banchina XB1 all’interruttore di banchina Q8 (L1 → 1, L2 → 3, L3 → 5, N → N1, cavi da 25 mm²) e il PE al collettore.', done: (c) => c.comps('shore').length > 0 && c.comps('shore').every((x) => ['L1', 'L2', 'L3', 'N', 'PE'].every((t) => c.p.wiresAt({ c: x.id, t }).length > 0)) },
      { live: true, text: 'Avvia la centrale e controlla nelle Proprietà: il commutatore KC1 è sulla rete normale e l’UPS è alimentato dalla rete.', done: (c) => c.powered() && c.comps('ats').some((a) => c.state(a.id).src === 'normal') && c.comps('ups').some((u) => c.state(u.id).mode === 'rete') },
      { live: true, text: 'Simula il black-out: ferma G1 e G2 dalle loro Proprietà. Osserva in sequenza: luci dalla batteria, avviamento automatico di G3, commutazione dell’ATS, timoneria di nuovo in marcia.', done: (c) => c.seen('blackout', c.comps('ats').some((a) => c.state(a.id).src === 'emerg') && c.gens().some((g) => c.par(g).emergenza && c.genOn(g))) },
      { live: true, text: 'In porto: ferma tutti i gruppi, collega il cavo della presa di banchina e chiudi il suo interruttore (trasferimento a black-out: prima si aprono i gruppi).', done: (c) => c.comps('shore').some((x) => c.state(x.id).closed) },
    ],
    tests: [
      {
        label: 'Al black-out le luci restano accese e l’alimentazione di emergenza arriva entro 45 s',
        run: (c) => {
          const gens = c.gens().filter((g) => !c.par(g).emergenza);
          const e = c.first('lamp');
          const ats = c.first('ats');
          if (gens.length < 1 || !e || !ats) return false;
          const steps = [{ power: true }, { wait: 3 }];
          for (const g of gens) steps.push({ act: [g.id, 'genStop'] });
          steps.push({ wait: 0.3 }, { check: (s) => lampBright(s, e.id) > 0.5 }, { wait: 7 }, { check: (s) => s.getInst(ats.id).state.src === 'emerg' && lampBright(s, e.id) > 0.5 });
          const r = c.scenario(steps);
          return r[0] && r[1];
        },
      },
      {
        label: 'In porto la banchina alimenta la nave con i gruppi fermi',
        run: (c) => {
          const sh = c.first('shore');
          const e = c.first('lamp');
          if (!sh || !e) return false;
          const [r] = c.scenario([{ power: false }, { act: [sh.id, 'plug'] }, { act: [sh.id, 'close'] }, { wait: 1.5 }, { check: (s) => s.getInst(sh.id).state.closed && lampBright(s, e.id) > 0.5 }]);
          return r;
        },
      },
      { label: 'Utenze essenziali alimentate tramite ATS o UPS', run: (c) => c.comps('lamp').concat(c.comps('m3')).filter((x) => c.par(x).essenziale).every((x) => c.checkOk('reg-ess-' + x.id)) },
      { label: 'Controllo della sequenza delle fasi attivo sulla banchina', run: (c) => c.checkOk('reg-shore-') },
    ],
    questions: ['Perché il gruppo di emergenza sta su un ponte alto, sopra la linea di galleggiamento?', 'A che cosa serve l’UPS se c’è già il gruppo di emergenza?', 'Che cosa succederebbe chiudendo la banchina con la sequenza delle fasi inversa? E perché l’interblocco impedisce di chiuderla con i gruppi in servizio?'],
  },

  {
    id: 'bordo-parametri',
    track: 'parametri',
    tema: 'nave',
    view: 'panoramica',
    title: 'Neutro isolato e cortocircuito dei generatori',
    level: 'Avanzato',
    phase: 3,
    icon: 'waves',
    color: '#5a3fd0',
    duration: '1 ora',
    summary: 'Con il docente: primo e secondo guasto a terra nel sistema IT, corrente di cortocircuito con uno o due gruppi, spunto dei motori su una rete in isola, scelta degli interruttori secondo i registri.',
    goals: ['Spiegare perché il primo guasto a terra in IT non è pericoloso', 'Legare la corrente di cortocircuito al numero di generatori in servizio', 'Scegliere Icu e Icm come richiedono i registri navali'],
    start: nave,
    solution: null,
    teacher: true,
    steps: [
      { live: true, text: 'Attiva la modalità docente, avvia la centrale e inserisci un “guasto franco a massa” sulla presa della cucina XS1: il controllo dell’isolamento KI1 va in allarme ma nessuna protezione interviene.', done: (c) => c.seen('g1', c.powered() && c.comps('imd').some((k) => c.state(k.id).alarm) && !c.p.components.some((x) => c.state(x.id).tripped)) },
      { live: true, text: 'Con il guasto presente attiva “una persona tocca l’involucro”: leggi la corrente nel corpo nelle Proprietà della presa (meno di 1 mA).', done: (c) => c.seen('g2', c.comps('xs').some((x) => c.par(x).persona && c.par(x).guasto === 'franco')) },
      { live: true, text: 'Togli il guasto e la persona. Ferma G2: con un solo gruppo la corrente di cortocircuito presunta si dimezza. Leggila nelle Proprietà di G1 (circa 435 A, 6,6 volte la corrente nominale).', done: (c) => c.seen('g3', c.gens().filter((g) => c.genOn(g)).length === 1 && c.gens().filter((g) => !c.par(g).emergenza).some((g) => !c.state(g.id).running)) },
      { live: true, text: 'Con un solo gruppo in servizio avvia l’elica di manovra (chiudi Q3): osserva la caduta di tensione allo spunto nelle Proprietà di G1. Poi rimetti G2 in parallelo e riprova.', done: (c) => c.seen('g4', c.comps('m3').some((m) => c.state(m.id).mode === 'start')) },
      { text: 'Apri la scheda Verifiche, gruppo “Impianto di bordo”: per ogni interruttore leggi Icu ≥ Iac e Icm ≥ Ip. Perché i registri non ammettono la protezione di back-up?', done: (c) => c.checkOk('reg-pdi-') },
      { text: 'Annota la motivazione (pannello Proprietà) su G1, KI1 e su un interruttore: valore scelto e perché.', done: (c) => c.mounted().filter((x) => c.noted(x)).length >= 3 },
    ],
    tests: [
      {
        label: 'Primo guasto a terra: allarme isolamento, nessun intervento',
        run: (c) => {
          const xs = c.first('xs');
          const ki = c.first('imd');
          if (!xs || !ki) return false;
          const [r] = c.scenario([{ power: true }, { params: [xs.id, { guasto: 'franco' }] }, { wait: 0.3 }, { check: (s) => s.getInst(ki.id).state.alarm && ![...s.inst.values()].some((i) => i.state.tripped) }]);
          return r;
        },
      },
      { label: 'Icu ≥ Iac e Icm ≥ Ip su tutti gli interruttori', run: (c) => c.checkOk('reg-pdi-') && !c.checkErr('reg-pdi-') },
      { label: 'Controllo dell’isolamento presente', run: (c) => c.checkOk('it-imd') },
      { label: 'Almeno tre motivazioni scritte', run: (c) => c.mounted().filter((x) => c.noted(x)).length >= 3 },
    ],
    questions: ['Perché il differenziale non interviene al primo guasto in un sistema IT, e perché il secondo guasto è un cortocircuito?', 'Perché la corrente di cortocircuito di un generatore è solo 5–8 volte la nominale, mentre dalla rete pubblica può essere di decine di kA?', 'Che cosa cambia nella scelta di un interruttore tra Icu e Ics? Quando i registri chiedono la Ics?'],
  },

  // ── Esercitazioni in media tensione (modulo B) ─────────────────────────────────────
  {
    id: 'mt-cabina',
    track: 'quadro',
    tema: 'mt',
    view: 'panoramica',
    title: 'Cabina MT/BT: messa in servizio e protezioni selettive',
    level: 'Avanzato',
    phase: 2,
    icon: 'zap',
    color: '#b3262c',
    duration: '1 ora e mezza',
    summary: 'Completare i collegamenti della cabina (cella del trasformatore, secondario con conduttori in parallelo), tarare il relè 50/51 sopra l’inserzione e selettivo con il generale BT, poi manovrare la cella in sicurezza.',
    goals: ['Capire la catena consegna → DG → cella trasformatore → trasformatore → generale BT', 'Regolare la soglia rapida 50 sopra la corrente di inserzione e sopra il cortocircuito BT riportato al primario', 'Ottenere la selettività cronometrica tra la 51 MT e il generale BT scatolato', 'Eseguire la sequenza di messa fuori servizio con gli interblocchi (CEI 11-27)'],
    start: () => {
      const d = withoutWires(cabina(), (w, tagOf) => (tagOf(w.a) === 'T1' || tagOf(w.b) === 'T1'));
      const qm2 = d.components.find((c) => c.tag === 'QM2');
      Object.assign(qm2.params, { I2: 60, t2: 0.05, t1: 0.1 }); // regolazioni sbagliate: scatta all'inserzione e non è selettiva
      d.meta.title = 'Cabina MT/BT da completare';
      return d;
    },
    solution: cabina,
    steps: [
      { text: 'Collega la cella QM2 al primario del trasformatore T1 con cavi da 50 mm²: 2 → 1U, 4 → 1V, 6 → 1W; poi il PE di T1 al collettore di terra.', hint: 'I cavi MT sono isolati a 20 kV: la sezione serve alla corrente di cortocircuito, non ai pochi ampere di carico (In1 = 11,5 A).', done: (c) => c.wired('mtcb', '2', 'mtx', '1') && c.wired('mtcb', '4', 'mtx', '3') && c.wired('mtcb', '6', 'mtx', '5') && c.wired('mtx', 'PE', 'pebar') },
      { text: 'Collega il secondario di T1 al generale QG (2U → 1, 2V → 3, 2W → 5, 2N → N) con due conduttori da 240 mm² per fase: la corrente nominale del secondario è 577 A.', hint: 'Scegli la sezione 240 mm² e poi “Conduttori in parallelo per fase” = 2 nelle proprietà del cavo: la portata diventa 2 × 346 = 692 A.', done: (c) => {
        const t = c.first('mtx');
        const q = c.first('mccb');
        if (!t || !q) return false;
        const pair = (a, b) => c.p.wires.find((w) => (w.a.c === t.id && w.a.t === a && w.b.c === q.id && w.b.t === b) || (w.b.c === t.id && w.b.t === a && w.a.c === q.id && w.a.t === b));
        return [['2', '1'], ['4', '3'], ['6', '5'], ['N', 'N1']].every(([a, b]) => {
          const w = pair(a, b);
          return w && w.section * (w.n || 1) >= 480;
        });
      } },
      { text: 'Regola la cella QM2: la soglia rapida 50 (I>>) deve stare sopra la corrente di inserzione del trasformatore (≈ 10 × In1 = 115 A) e sopra il cortocircuito BT riportato al primario (≈ 190 A). Portala ad almeno 200 A.', hint: 'Con I>> = 60 A il relè scatterebbe a ogni inserzione. Guarda la verifica “protezione MT del trasformatore”.', done: (c) => c.has('mtcb', (p) => p.ruolo === 'tr' && p.I2 >= 200) && !c.checkErr('mt-prot-') },
      { text: 'Selettività cronometrica: il ritardo t> della 51 di QM2 deve superare di almeno 0,15 s il ritardo tsd del generale BT (0,1 s). Imposta t> = 0,3 s e controlla la verifica “Selettività MT/BT”.', done: (c) => c.checkOk('mt-sel-') },
      { live: true, text: 'Dai tensione alla consegna (pulsante in basso o leva dell’armadio di consegna): le celle sono chiuse, il trasformatore si inserisce. Leggi nelle Proprietà di T1 la tensione al secondario (≈ 400 V) e l’evento di inserzione nel registro.', done: (c) => c.powered() && !!c.first('mtx') && !!c.state(c.first('mtx').id).live },
      { live: true, text: 'Messa fuori servizio in sicurezza di QM2 per lavori sul trasformatore: apri l’interruttore, apri il sezionatore di linea, verifica che gli indicatori di presenza tensione lato cavo siano spenti, poi chiudi il sezionatore di terra.', hint: 'Prova a sbagliare l’ordine: gli interblocchi lo impediscono e spiegano perché.', done: (c) => c.seen('mt-terra', c.comps('mtcb').some((q) => c.par(q).ruolo === 'tr' && c.state(q.id).terra && !c.state(q.id).sez && !c.state(q.id).int)) },
      { live: true, text: 'Rimetti in servizio la cella: apri il sezionatore di terra, chiudi il sezionatore di linea, chiudi l’interruttore. Il trasformatore si inserisce di nuovo senza far scattare il relè.', done: (c) => c.seen('mt-terra') && c.comps('mtcb').some((q) => c.par(q).ruolo === 'tr' && c.state(q.id).int && !c.state(q.id).terra) },
    ],
    tests: [
      {
        label: 'Inserzione del trasformatore senza intervento della cella MT',
        run: (c) => {
          const t = c.first('mtx');
          const qs = c.comps('mtcb');
          if (!t || !qs.length) return false;
          const steps = qs.map((q) => ({ set: [q.id, { sez: true, int: true, terra: false, tripped: false, cause: null }] }));
          const [r] = c.scenario([...steps, { power: true }, { wait: 0.5 }, { check: (s) => s.getInst(t.id).state.live && qs.every((q) => !s.getInst(q.id).state.tripped) && s.getInst(t.id).state.V2 > 380 }]);
          return r;
        },
      },
      {
        label: 'Cortocircuito su una presa: interviene solo la partenza, non il generale né la MT',
        run: (c) => {
          const xs = c.first('xs');
          const qg = c.first('mccb');
          const qs = c.comps('mtcb');
          if (!xs || !qg) return false;
          const [r] = c.scenario([...qs.map((q) => ({ set: [q.id, { sez: true, int: true, terra: false, tripped: false }] })), { power: true }, { wait: 0.5 }, { params: [xs.id, { carico: 'short' }] }, { wait: 0.4 }, { check: (s) => !s.getInst(qg.id).state.tripped && qs.every((q) => !s.getInst(q.id).state.tripped) && [...s.inst.values()].some((i) => i.state.tripped) }]);
          return r;
        },
      },
      {
        label: 'Interblocco: il sezionatore di terra non si chiude con la cella in servizio',
        run: (c) => {
          const q = c.comps('mtcb').find((x) => c.par(x).ruolo === 'tr');
          if (!q) return false;
          const [r] = c.scenario([{ set: [q.id, { sez: true, int: true, terra: false }] }, { act: [q.id, 'terra'] }, { check: (s) => !s.getInst(q.id).state.terra }]);
          return r;
        },
      },
      { label: 'Protezione MT del trasformatore regolata (51, 50 sopra l’inserzione, tenuta 2 s)', run: (c) => c.checkOk('mt-prot-') && !c.checkErr('mt-prot-') },
      { label: 'Selettività MT/BT amperometrica e cronometrica', run: (c) => c.checkOk('mt-sel-') },
      { label: 'Generale BT dimensionato sul trasformatore', run: (c) => c.checkOk('mt-qg-') },
      { label: 'Coordinamento cavi-interruttori e PE senza errori', run: (c) => c.noErrors('coord-') && c.noErrors('pe-') && c.noErrors('pdi-') },
    ],
    questions: ['Perché la soglia rapida I>> della cella del trasformatore deve stare sopra la corrente di inserzione e sopra il cortocircuito BT riportato al primario?', 'Che cosa succederebbe a un cortocircuito sulla sbarra BT se la 51 della cella MT avesse lo stesso ritardo del generale BT?', 'Perché il secondario di un trasformatore da 400 kVA richiede due conduttori da 240 mm² per fase, mentre il primario ne basta uno da 50?'],
  },

  {
    id: 'mt-bordo',
    track: 'parametri',
    tema: 'mt',
    view: 'panoramica',
    title: 'Quadro MT di bordo: generatori a 6,6 kV e sbarra in isola',
    level: 'Avanzato',
    phase: 3,
    icon: 'waves',
    color: '#7a2a22',
    duration: '1 ora',
    summary: 'Con il docente: generatori in media tensione, correnti di cortocircuito “piccole” della rete in isola, trasformatore di servizio con neutro BT isolato, protezioni delle celle di generatore e selettività MT/BT.',
    goals: ['Legare la corrente di cortocircuito sulla sbarra MT al numero di gruppi in servizio', 'Capire perché le soglie 50 delle celle di generatore sono basse', 'Riconoscere il sistema IT a valle del trasformatore di servizio', 'Manovrare una cella MT di bordo in sicurezza'],
    start: naveMT,
    solution: null,
    teacher: true,
    steps: [
      { live: true, text: 'Avvia G1 e chiudi il suo interruttore di macchina (Proprietà di G1): la sbarra MT è a 6,6 kV. Leggi In (175 A) e la corrente di cortocircuito del gruppo (≈ 1,2 kA, meno di 7 volte In).', done: (c) => c.seen('mt-g1', c.gens().some((g) => c.genOn(g))) },
      { live: true, text: 'Con un solo gruppo avvia l’elica di manovra (chiudi Q2): osserva la caduta di tensione sulla sbarra MT nelle Proprietà di G1 e al secondario di T1.', done: (c) => c.seen('mt-m2', c.comps('m3').some((m) => c.state(m.id).mode === 'start')) },
      { live: true, text: 'Avvia G2, attendi il sincronismo e chiudilo in parallelo: il carico si ripartisce e la corrente di cortocircuito sulla sbarra MT raddoppia. Rileggi i valori.', done: (c) => c.seen('mt-par', c.gens().filter((g) => c.genOn(g)).length === 2) },
      { text: 'Apri la scheda Verifiche, gruppo “Media tensione”: celle di generatore (51 a 1,1–1,6 In, 50 sotto il contributo del gruppo), protezione di T1, selettività MT/BT con il generale QG. Spiega perché a bordo le soglie 50 sono basse.', done: (c) => c.checkOk('mt-gen-') && c.checkOk('mt-sel-') },
      { live: true, text: 'Messa in sicurezza della cella QM3 per lavori sul trasformatore di servizio: apri l’interruttore, apri il sezionatore di linea, verifica l’assenza di tensione, chiudi il sezionatore di terra. Che cosa succede al quadro BT?', done: (c) => c.seen('mt-terra3', c.comps('mtcb').some((q) => c.par(q).ruolo === 'tr' && c.state(q.id).terra)) },
      { text: 'Annota la motivazione (pannello Proprietà) su G1, su una cella MT e su T1: valore scelto e perché.', done: (c) => c.mounted().filter((x) => c.noted(x)).length >= 3 },
    ],
    tests: [
      {
        label: 'Due gruppi in parallelo sulla sbarra MT alimentano il quadro BT a 440 V',
        run: (c) => {
          const t = c.first('mtx');
          const e = c.first('lamp');
          const qs = c.comps('mtcb');
          if (!t || !e) return false;
          const [r] = c.scenario([...qs.map((q) => ({ set: [q.id, { sez: true, int: true, terra: false, tripped: false }] })), { power: true }, { wait: 3 }, { check: (s) => c.gens().filter((g) => s.getInst(g.id).state.closed).length >= 2 && s.getInst(t.id).state.V2 > 400 && lampBright(s, e.id) > 0.5 }]);
          return r;
        },
      },
      {
        label: 'Interblocco: il sezionatore di terra non si chiude con la cella in servizio',
        run: (c) => {
          const q = c.comps('mtcb').find((x) => c.par(x).ruolo === 'tr');
          if (!q) return false;
          const [r] = c.scenario([{ set: [q.id, { sez: true, int: true, terra: false }] }, { act: [q.id, 'terra'] }, { check: (s) => !s.getInst(q.id).state.terra }]);
          return r;
        },
      },
      { label: 'Protezioni delle celle di generatore regolate per la rete in isola', run: (c) => c.checkOk('mt-gen-') && !c.checkErr('mt-gen-') },
      { label: 'Selettività MT/BT tra la cella del trasformatore e il generale BT', run: (c) => c.checkOk('mt-sel-') },
      { label: 'Controllo dell’isolamento sulla rete BT (sistema IT)', run: (c) => c.checkOk('it-imd') },
      { label: 'Almeno tre motivazioni scritte', run: (c) => c.mounted().filter((x) => c.noted(x)).length >= 3 },
    ],
    questions: ['Perché sulla sbarra MT di una nave la corrente di cortocircuito dipende da quanti gruppi sono in servizio, e che cosa comporta per le soglie 50 delle celle?', 'Perché il neutro BT a valle del trasformatore di servizio resta isolato (IT) mentre in una cabina a terra è collegato a terra (TN-S)?', 'Che cosa succede al quadro BT quando si mette a terra la cella del trasformatore? Come si garantisce la continuità per le utenze essenziali?'],
  },
];

/** Esercitazioni di un percorso del catalogo, nell'ordine dell'elenco */
export const exercisesOfTrack = (trackId) => EXERCISES.filter((e) => e.track === trackId);

export const exerciseById = (id) => EXERCISES.find((e) => e.id === id);
