// Lezioni del tutorial guidato: per chi parte da zero, un passo alla volta.
// Ogni passo: type 'info' | 'wire' | 'action' | 'measure' | 'clamp' | 'quiz' | 'end'
//   title, text, todo (cosa fare), why (approfondimento), focus (cosa inquadrare/evidenziare),
//   from/to (morsetti 'SIGLA:morsetto'), target (azione), done(ctx), perform(ctx) (“Mostrami come”),
//   enter(ctx) (all'ingresso), buttons [{label, icon, run(ctx)}], options (quiz), schema (disegno).
// Le funzioni ricevono un contesto `ctx` con progetto e simulatore (vedi makeContext).
import { build } from '../presets/builder.js';

// ── Disegni semplici per le spiegazioni ─────────────────────────────────────────────
const COL = { L: '#8a4b26', N: '#1f64c8', PE: '#2f9a3a', box: '#ff5900', ink: '#1d2127' };

/** Catena in serie: [ {t:'L'}, {b:'Q1', s:'magnetotermico'}, ... , {t:'N'} ] */
function chain(items, { returnN = true } = {}) {
  const w = 110;
  const W = items.length * w + 20;
  let x = 10;
  const parts = [];
  items.forEach((it, i) => {
    const cx = x + w / 2;
    if (it.t) {
      parts.push(`<circle cx="${cx}" cy="40" r="15" fill="${COL[it.t] || COL.L}"/><text x="${cx}" y="46" text-anchor="middle" font-size="16" font-weight="800" fill="#fff">${it.t}</text>`);
    } else {
      parts.push(`<rect x="${cx - 38}" y="20" width="76" height="40" rx="8" fill="#fff" stroke="${COL.box}" stroke-width="2.5"/><text x="${cx}" y="41" text-anchor="middle" font-size="15" font-weight="800" fill="${COL.ink}">${it.b}</text><text x="${cx}" y="54" text-anchor="middle" font-size="9.5" fill="#6b7682">${it.s || ''}</text>`);
    }
    if (i < items.length - 1) parts.push(`<line x1="${cx + (it.t ? 15 : 38)}" y1="40" x2="${cx + w - (items[i + 1].t ? 15 : 38)}" y2="40" stroke="${COL.L}" stroke-width="4" stroke-linecap="round"/>`);
    x += w;
  });
  if (returnN) {
    const last = 10 + (items.length - 2) * w + w / 2;
    const first = 10 + w / 2;
    parts.push(`<path d="M ${last} 60 V 88 H ${first + 30}" fill="none" stroke="${COL.N}" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 0"/><text x="${(first + last) / 2}" y="104" text-anchor="middle" font-size="11" fill="${COL.N}" font-weight="700">ritorno dal neutro</text>`);
  }
  return `<svg viewBox="0 0 ${W} ${returnN ? 112 : 80}" width="100%" role="img" aria-label="schema" xmlns="http://www.w3.org/2000/svg" font-family="Manrope, Arial">${parts.join('')}</svg>`;
}

const SCHEMA_DEVIATORI = `<svg viewBox="0 0 360 150" width="100%" role="img" aria-label="schema deviatori" xmlns="http://www.w3.org/2000/svg" font-family="Manrope, Arial">
<circle cx="24" cy="75" r="14" fill="${COL.L}"/><text x="24" y="80" text-anchor="middle" font-size="14" font-weight="800" fill="#fff">L</text>
<line x1="38" y1="75" x2="80" y2="75" stroke="${COL.L}" stroke-width="4"/>
<circle cx="84" cy="75" r="5" fill="${COL.ink}"/><line x1="84" y1="75" x2="128" y2="50" stroke="${COL.ink}" stroke-width="4" stroke-linecap="round"/>
<text x="70" y="105" font-size="12" font-weight="800" fill="${COL.ink}">SA1 · C</text>
<circle cx="134" cy="48" r="5" fill="${COL.ink}"/><circle cx="134" cy="102" r="5" fill="${COL.ink}"/>
<text x="126" y="36" font-size="11" fill="#6b7682">1</text><text x="126" y="124" font-size="11" fill="#6b7682">2</text>
<line x1="139" y1="48" x2="221" y2="48" stroke="${COL.L}" stroke-width="3.5"/><line x1="139" y1="102" x2="221" y2="102" stroke="${COL.L}" stroke-width="3.5"/>
<text x="180" y="40" text-anchor="middle" font-size="10.5" fill="#6b7682">navetta</text><text x="180" y="120" text-anchor="middle" font-size="10.5" fill="#6b7682">navetta</text>
<circle cx="226" cy="48" r="5" fill="${COL.ink}"/><circle cx="226" cy="102" r="5" fill="${COL.ink}"/>
<circle cx="276" cy="75" r="5" fill="${COL.ink}"/><line x1="276" y1="75" x2="232" y2="50" stroke="${COL.ink}" stroke-width="4" stroke-linecap="round"/>
<text x="250" y="105" font-size="12" font-weight="800" fill="${COL.ink}">SA2 · C</text>
<line x1="281" y1="75" x2="312" y2="75" stroke="${COL.L}" stroke-width="4"/>
<circle cx="330" cy="75" r="16" fill="#fff4d6" stroke="${COL.box}" stroke-width="2.5"/><path d="M319 64 L341 86 M341 64 L319 86" stroke="${COL.box}" stroke-width="2.2"/>
<text x="330" y="112" text-anchor="middle" font-size="12" font-weight="800" fill="${COL.ink}">E1</text></svg>`;

const SCHEMA_AUTORITENUTA = `<svg viewBox="0 0 360 170" width="100%" role="img" aria-label="schema autoritenuta" xmlns="http://www.w3.org/2000/svg" font-family="Manrope, Arial">
<circle cx="22" cy="40" r="14" fill="${COL.L}"/><text x="22" y="45" text-anchor="middle" font-size="14" font-weight="800" fill="#fff">L</text>
<line x1="36" y1="40" x2="70" y2="40" stroke="${COL.L}" stroke-width="4"/>
<rect x="70" y="26" width="70" height="28" rx="7" fill="#fde8e6" stroke="#c8322b" stroke-width="2"/><text x="105" y="45" text-anchor="middle" font-size="12" font-weight="800" fill="#a31f1a">ARRESTO</text>
<line x1="140" y1="40" x2="170" y2="40" stroke="${COL.L}" stroke-width="4"/>
<rect x="170" y="26" width="70" height="28" rx="7" fill="#e3f6ec" stroke="#2f9a4a" stroke-width="2"/><text x="205" y="45" text-anchor="middle" font-size="12" font-weight="800" fill="#1d6b35">MARCIA</text>
<line x1="240" y1="40" x2="280" y2="40" stroke="${COL.L}" stroke-width="4"/>
<rect x="280" y="22" width="64" height="36" rx="7" fill="#fff" stroke="${COL.box}" stroke-width="2.5"/><text x="312" y="45" text-anchor="middle" font-size="12" font-weight="800" fill="${COL.ink}">bobina</text>
<path d="M 160 40 V 110 H 180" fill="none" stroke="${COL.box}" stroke-width="4" stroke-linecap="round"/>
<rect x="180" y="94" width="70" height="32" rx="7" fill="#fff4ea" stroke="${COL.box}" stroke-width="2.5"/><text x="215" y="115" text-anchor="middle" font-size="12" font-weight="800" fill="${COL.ink}">13 - 14</text>
<path d="M 250 110 H 262 V 40" fill="none" stroke="${COL.box}" stroke-width="4" stroke-linecap="round"/>
<text x="215" y="148" text-anchor="middle" font-size="11.5" fill="#6b7682">contatto del contattore in parallelo a MARCIA</text></svg>`;

// ── Impianti di partenza ─────────────────────────────────────────────────────────────
function startPrimaLampada() {
  return build({ sys: '1F', title: 'Tutorial · La tua prima lampada' }, (b) => {
    b.add('Q1', 'mcb1pn', 'R2:0', { In: 10 }, 'Protegge la linea della lampada.');
    b.add('SA1', 'sa', 'A1');
    b.add('E1', 'lamp', 'A2', { lt: 'led15' });
  });
}

function startPrimaLampadaCablata() {
  return build({ sys: '1F', title: 'Tutorial · Misure con il multimetro' }, (b) => {
    b.add('Q1', 'mcb1pn', 'R2:0', { In: 10 });
    b.add('SA1', 'sa', 'A1');
    b.add('E1', 'lamp', 'A2', { lt: 'led15' });
    b.wire('XA:L1', 'Q1:1', 6);
    b.wire('XA:N', 'Q1:N1', 6);
    b.wire('Q1:2', 'SA1:L', 1.5);
    b.wire('SA1:1', 'E1:L', 1.5, 'grey');
    b.wire('Q1:N2', 'E1:N', 1.5);
  });
}

function startDifferenziale() {
  return build({ sys: '1F', title: 'Tutorial · Il differenziale ti protegge', supply: { Pc: 3, Re: 20 } }, (b) => {
    b.add('Q1', 'rcbo1pn', 'R2:0', { In: 16, IDn: 0.03 });
    b.add('XS1', 'xs', 'A2', { carico: 'washer' });
    b.wire('XA:L1', 'Q1:1', 6);
    b.wire('XA:N', 'Q1:N1', 6);
    b.wire('Q1:2', 'XS1:L', 2.5);
    b.wire('Q1:N2', 'XS1:N', 2.5);
    b.wire('PE:PE1', 'XS1:PE', 2.5);
  });
}

function startDeviatori() {
  return build({ sys: '1F', title: 'Tutorial · Una luce da due punti' }, (b) => {
    b.add('Q1', 'mcb1pn', 'R2:0', { In: 10 });
    b.add('SA1', 'sd', 'A1');
    b.add('E1', 'lamp', 'A2', { lt: 'led15' });
    b.add('SA2', 'sd', 'A3');
    b.wire('XA:L1', 'Q1:1', 6);
    b.wire('XA:N', 'Q1:N1', 6);
  });
}

function startMotore() {
  return build({ sys: '3F', earth: 'TN-S', title: 'Tutorial · Avvia un motore', supply: { Pc: 10, Icc: 6, Re: 10 } }, (b) => {
    b.add('QG', 'mcb4p', 'R1:5', { In: 16 });
    b.add('QM', 'mcb3p', 'R2:0', { In: 6, curve: 'D' });
    b.add('KM1', 'km3', 'R2:4', { Uc: 230 });
    b.add('FR1', 'fr3', 'R2:8', { Ir: 2 });
    b.add('Q2', 'mcb1pn', 'R2:13', { In: 6 });
    b.add('H1', 'hl', 'R3:0', { color: 'green' });
    b.add('SB1', 'ss', 'A1');
    b.add('M1', 'm3', 'C3', { P: 0.75, conn: 'Y', load: 80 });
    b.wire('XA:L1', 'QG:1', 6);
    b.wire('XA:L2', 'QG:3', 6, 'black');
    b.wire('XA:L3', 'QG:5', 6, 'grey');
    b.wire('XA:N', 'QG:N1', 6);
    b.wire('QG:2', 'QM:1', 2.5);
    b.wire('QG:4', 'QM:3', 2.5, 'black');
    b.wire('QG:6', 'QM:5', 2.5, 'grey');
    b.wire('QM:2', 'KM1:1', 1.5);
    b.wire('QM:4', 'KM1:3', 1.5, 'black');
    b.wire('QM:6', 'KM1:5', 1.5, 'grey');
    b.wire('KM1:2', 'FR1:1', 1.5);
    b.wire('KM1:4', 'FR1:3', 1.5, 'black');
    b.wire('KM1:6', 'FR1:5', 1.5, 'grey');
    b.wire('FR1:2', 'M1:U1', 1.5);
    b.wire('FR1:4', 'M1:V1', 1.5, 'black');
    b.wire('FR1:6', 'M1:W1', 1.5, 'grey');
    b.wire('PE:PE1', 'M1:PE', 1.5);
    b.wire('QG:2', 'Q2:1', 2.5);
    b.wire('QG:N2', 'Q2:N1', 2.5);
    b.wire('Q2:2', 'FR1:95', 1, 'red');
    b.wire('FR1:96', 'SB1:1', 1, 'red');
    b.wire('SB1:2', 'SB1:3', 1, 'red');
    b.wire('SB1:4', 'KM1:A1', 1, 'red');
    b.wire('KM1:A2', 'Q2:N2', 1);
    b.wire('KM1:14', 'H1:X1', 1, 'red');
    b.wire('H1:X2', 'Q2:N2', 1, 'blue');
  });
}

// ── Passi riusabili ─────────────────────────────────────────────────────────────────
const powerStep = (extra = {}) => ({
  type: 'action',
  title: 'Dai corrente all’impianto',
  text: 'Per ora il contatore tiene staccato l’impianto: non c’è tensione.',
  todo: 'Clicca l’interruttore rosso del contatore (la scatola grigia a sinistra del quadro) oppure il pulsante qui sotto.',
  focus: ['meter'],
  target: { power: true },
  buttons: [{ label: 'Alimenta l’impianto', icon: 'power', run: (c) => c.power(true) }],
  done: (c) => c.powered(),
  perform: (c) => c.power(true),
  ...extra,
});

// ── Lezioni ─────────────────────────────────────────────────────────────────────────
export const LESSONS = [
  {
    id: 'prima-lampada',
    n: 1,
    title: 'La tua prima lampada',
    subtitle: 'Il circuito più semplice: protezione, interruttore e lampada',
    duration: '10 minuti',
    level: 'Si parte da zero',
    icon: 'lamp',
    color: '#2f9a4a',
    cover: 'img/lezione-prima-lampada.jpg',
    goals: ['Riconoscere fase e neutro', 'Collegare un magnetotermico, un interruttore e una lampada', 'Capire perché l’interruttore va sulla fase'],
    start: startPrimaLampada,
    steps: [
      {
        type: 'info',
        title: 'Benvenuto nel laboratorio!',
        text: 'Davanti a te c’è un banco di elettrotecnica. A sinistra il quadro elettrico: qui si montano gli apparecchi che proteggono e comandano l’impianto. A destra il pannello delle utenze: lampade, prese, motori… le cose che vogliamo far funzionare.',
        todo: 'Premi Avanti. Puoi girare la vista trascinando con il mouse e avvicinarti con la rotellina.',
        view: 'panoramica',
        focus: ['cabinet', 'fieldboard'],
      },
      {
        type: 'info',
        title: 'Da dove arriva la corrente',
        text: 'La corrente arriva dal contatore, la scatola grigia a sinistra, ed entra nel quadro nell’arrivo linea XA. Da qui partono due conduttori: la fase L e il neutro N.',
        why: 'Tra fase e neutro ci sono 230 volt. Per accendere qualcosa la corrente deve fare un giro completo: esce dalla fase, attraversa l’apparecchio e torna indietro dal neutro. Se il giro è interrotto, la corrente non passa.',
        focus: ['meter', 'XA'],
      },
      {
        type: 'info',
        title: 'Il magnetotermico',
        text: 'Questo apparecchio, sigla Q1, protegge il circuito: se passa troppa corrente (un guasto, o troppi apparecchi accesi) si apre da solo e toglie la corrente. In alto si collega ciò che arriva, in basso ciò che riparte verso le utenze.',
        focus: ['Q1'],
      },
      {
        type: 'wire',
        title: 'Collega la fase',
        text: 'Colleghiamo la fase dall’arrivo linea al magnetotermico.',
        todo: 'Clicca il morsetto L dell’arrivo linea (cerchio 1), poi il morsetto 1 in alto del magnetotermico (cerchio 2).',
        why: 'La fase si collega con un cavo marrone (oppure nero o grigio): i colori servono a riconoscere al volo la funzione di ogni filo.',
        from: 'XA:L1',
        to: 'Q1:1',
      },
      {
        type: 'wire',
        title: 'Collega il neutro',
        text: 'Ora il neutro, che si riconosce dal colore blu.',
        todo: 'Clicca il morsetto N dell’arrivo linea, poi il morsetto N in alto del magnetotermico.',
        from: 'XA:N',
        to: 'Q1:N1',
      },
      {
        type: 'info',
        title: 'L’interruttore e la lampada',
        text: 'Sul pannello utenze ci sono un interruttore (SA1) e una lampada (E1). Sopra ognuno c’è una piccola morsettiera: le lettere dicono dove collegare i fili.',
        why: 'L’interruttore si mette sempre sulla fase: così, quando è spento, la lampada non ha tensione e si può cambiare la lampadina in sicurezza.',
        focus: ['SA1', 'E1'],
      },
      {
        type: 'wire',
        title: 'Porta la fase all’interruttore',
        text: 'La fase esce dal morsetto 2 in basso del magnetotermico e arriva all’interruttore.',
        todo: 'Clicca il morsetto 2 del magnetotermico, poi il morsetto L dell’interruttore. Il cavo passerà da solo nelle canaline.',
        from: 'Q1:2',
        to: 'SA1:L',
      },
      {
        type: 'wire',
        title: 'Dall’interruttore alla lampada',
        text: 'Dall’altra parte dell’interruttore la fase prosegue fino alla lampada: è proprio questo il tratto che l’interruttore apre e chiude.',
        todo: 'Clicca il morsetto 1 dell’interruttore, poi il morsetto L della lampada.',
        from: 'SA1:1',
        to: 'E1:L',
      },
      {
        type: 'wire',
        title: 'Chiudi il giro con il neutro',
        text: 'Manca il ritorno: il neutro va dal magnetotermico direttamente alla lampada.',
        todo: 'Clicca il morsetto N in basso del magnetotermico, poi il morsetto N della lampada.',
        from: 'Q1:N2',
        to: 'E1:N',
      },
      {
        type: 'info',
        title: 'Il circuito è completo!',
        text: 'Riassumendo: la fase passa dal magnetotermico e dall’interruttore e arriva alla lampada; il neutro torna al quadro. Adesso vediamo se funziona.',
        schema: chain([{ t: 'L' }, { b: 'Q1', s: 'protezione' }, { b: 'SA1', s: 'interruttore' }, { b: 'E1', s: 'lampada' }]),
        view: 'panoramica',
      },
      powerStep(),
      {
        type: 'action',
        title: 'Accendi la lampada',
        text: 'L’impianto ha tensione. La lampada si accende quando l’interruttore chiude il circuito.',
        todo: 'Clicca l’interruttore SA1.',
        focus: ['SA1', 'E1'],
        target: { tag: 'SA1', action: 'toggle' },
        done: (c) => c.lit('E1'),
        perform: (c) => c.act('SA1', 'toggle'),
      },
      {
        type: 'action',
        title: 'Prova la protezione',
        text: 'Adesso fai finta che ci sia un guasto: apri il magnetotermico con la sua levetta.',
        todo: 'Clicca il magnetotermico Q1 per abbassare la levetta.',
        focus: ['Q1'],
        target: { tag: 'Q1', action: 'toggle' },
        done: (c) => !c.st('Q1').on,
        perform: (c) => c.act('Q1', 'toggle'),
      },
      {
        type: 'quiz',
        title: 'Che cosa è successo alla lampada?',
        text: 'Guarda la lampada sul pannello utenze.',
        focus: ['Q1', 'E1'],
        options: [
          { text: 'Si è spenta: il magnetotermico ha interrotto la fase', correct: true, feedback: 'Esatto! Senza fase la corrente non può più passare.' },
          { text: 'È rimasta accesa', feedback: 'Guarda meglio: la lampada si è spenta.' },
          { text: 'Si è bruciata', feedback: 'No: rialzando la levetta tornerà a funzionare.' },
        ],
      },
      {
        type: 'action',
        title: 'Riaccendi il magnetotermico',
        text: 'Rialza la levetta: la lampada torna ad accendersi.',
        todo: 'Clicca di nuovo il magnetotermico Q1.',
        focus: ['Q1', 'E1'],
        target: { tag: 'Q1', action: 'toggle' },
        done: (c) => c.st('Q1').on && c.lit('E1'),
        perform: (c) => {
          if (!c.st('Q1').on) c.act('Q1', 'toggle');
          if (!c.st('SA1').on) c.act('SA1', 'toggle');
        },
      },
      {
        type: 'end',
        title: 'Hai realizzato il tuo primo impianto!',
        text: 'Complimenti: hai collegato e provato un vero circuito luce.',
        recap: ['La fase (marrone) porta la tensione, il neutro (blu) fa tornare la corrente.', 'Il magnetotermico protegge il circuito e sta all’inizio della linea.', 'L’interruttore interrompe sempre la fase.'],
        view: 'panoramica',
      },
    ],
  },

  {
    id: 'differenziale',
    n: 2,
    title: 'Il differenziale ti protegge',
    subtitle: 'Prova il “salvavita” e scopri a cosa serve il filo giallo-verde',
    duration: '10 minuti',
    level: 'Facile',
    icon: 'shield',
    color: '#2f6fd0',
    cover: 'img/lezione-differenziale.jpg',
    goals: ['Capire il ruolo del conduttore di terra (PE)', 'Provare il differenziale con il tasto T', 'Vedere come interviene durante un guasto'],
    start: startDifferenziale,
    steps: [
      {
        type: 'info',
        title: 'Una presa con la lavatrice',
        text: 'Questa volta l’impianto è già collegato: c’è una presa con attaccata una lavatrice. La lavatrice ha la carcassa di metallo, e chi la usa la tocca.',
        focus: ['XS1'],
      },
      {
        type: 'info',
        title: 'Il filo giallo-verde',
        text: 'Oltre a fase e neutro, la presa ha un terzo filo, giallo-verde: è il conduttore di protezione PE, collegato alla terra. Tiene la carcassa metallica al potenziale della terra.',
        why: 'In condizioni normali nel filo giallo-verde non passa corrente: entra in gioco solo quando qualcosa si guasta.',
        focus: ['PE', 'XS1'],
        wires: [['PE:PE1', 'XS1:PE']],
      },
      {
        type: 'info',
        title: 'Il magnetotermico-differenziale',
        text: 'Q1 fa due lavori. Come un magnetotermico protegge dalle sovracorrenti. In più controlla che tutta la corrente che esce dalla fase torni indietro dal neutro: se ne manca anche solo un po’, vuol dire che sta scappando da qualche parte… magari attraverso una persona. Allora apre il circuito.',
        why: 'Questo differenziale interviene già con 30 milliampere (0,03 A) di dispersione: è la soglia che protegge le persone.',
        focus: ['Q1'],
      },
      powerStep(),
      {
        type: 'info',
        title: 'La lavatrice sta lavorando',
        text: 'Il display del contatore segna circa 2 kW: la lavatrice sta assorbendo potenza dall’impianto.',
        focus: ['meter'],
      },
      {
        type: 'action',
        title: 'Premi il tasto di prova',
        text: 'Ogni differenziale ha un tasto T per provarlo: premendolo si crea apposta una piccola dispersione.',
        todo: 'Clicca il differenziale Q1 (oppure il pulsante qui sotto) per premere il tasto T giallo.',
        focus: ['Q1'],
        target: { tag: 'Q1', action: 'test', momentary: true },
        buttons: [{ label: 'Premi il tasto T', icon: 'activity', run: (c) => c.press('Q1', 'test') }],
        done: (c) => !!c.st('Q1').tripped,
        perform: (c) => c.press('Q1', 'test'),
      },
      {
        type: 'info',
        title: 'Il test è riuscito',
        text: 'Il differenziale ha sentito la dispersione di prova e ha aperto il circuito: la lavatrice si è fermata. Questa prova andrebbe fatta una volta al mese.',
        focus: ['Q1'],
      },
      {
        type: 'action',
        title: 'Riarma il differenziale',
        text: 'Rimettiamo in funzione l’impianto.',
        todo: 'Clicca il differenziale Q1 per rialzare la levetta.',
        focus: ['Q1'],
        target: { tag: 'Q1', action: 'toggle' },
        done: (c) => c.st('Q1').on,
        perform: (c) => c.act('Q1', 'toggle'),
      },
      {
        type: 'action',
        title: 'Simula un guasto',
        text: 'Immagina che dentro la lavatrice un filo si sia spellato e tocchi la carcassa di metallo.',
        todo: 'Premi il pulsante qui sotto e guarda che cosa succede a Q1.',
        focus: ['XS1', 'Q1'],
        target: { none: true },
        buttons: [{ label: 'Provoca il guasto', icon: 'zap', run: (c) => c.setParam('XS1', 'guasto', 'franco') }],
        done: (c) => c.par('XS1').guasto === 'franco' && !!c.st('Q1').tripped,
        perform: (c) => c.setParam('XS1', 'guasto', 'franco'),
      },
      {
        type: 'info',
        title: 'Che cosa è successo',
        text: 'La corrente è scappata dalla fase verso la carcassa e, attraverso il filo giallo-verde, verso terra. Il differenziale si è accorto che dal neutro tornava meno corrente di quella uscita e ha aperto il circuito in pochi centesimi di secondo. Nessuno ha preso la scossa!',
        focus: ['XS1', 'Q1'],
        wires: [['PE:PE1', 'XS1:PE']],
      },
      {
        type: 'quiz',
        title: 'E se il differenziale non ci fosse?',
        text: 'Pensa alla persona che tocca la lavatrice guasta.',
        options: [
          { text: 'Potrebbe prendere la scossa: la carcassa resterebbe in tensione', correct: true, feedback: 'Giusto. La corrente di guasto verso terra è di pochi ampere: troppo poca per far scattare il solo magnetotermico.' },
          { text: 'Scatterebbe comunque il magnetotermico', feedback: 'Non basta: la corrente di guasto verso terra è troppo piccola per il magnetotermico.' },
          { text: 'Non succederebbe niente di pericoloso', feedback: 'Purtroppo no: la carcassa arriverebbe a più di 200 volt verso terra.' },
        ],
      },
      {
        type: 'action',
        title: 'Ripara e riarma',
        text: 'Ripariamo la lavatrice e rimettiamo in servizio l’impianto.',
        todo: 'Premi “Ripara la lavatrice”, poi clicca Q1 per rialzare la levetta.',
        focus: ['XS1', 'Q1'],
        target: { tag: 'Q1', action: 'toggle' },
        buttons: [{ label: 'Ripara la lavatrice', icon: 'wrench', run: (c) => c.setParam('XS1', 'guasto', 'none') }],
        done: (c) => c.par('XS1').guasto === 'none' && c.st('Q1').on,
        perform: (c) => {
          c.setParam('XS1', 'guasto', 'none');
          if (!c.st('Q1').on) c.act('Q1', 'toggle');
        },
      },
      {
        type: 'end',
        title: 'Ora sai perché si chiama “salvavita”',
        text: 'Hai provato il differenziale e hai visto come protegge le persone.',
        recap: ['Il differenziale confronta la corrente che va e quella che torna: se una parte si disperde, apre il circuito.', 'Il filo giallo-verde (PE) porta a terra la corrente di guasto.', 'Il tasto T serve a provare il differenziale: va premuto ogni mese.'],
        view: 'panoramica',
      },
    ],
  },

  {
    id: 'deviatori',
    n: 3,
    title: 'Una luce da due punti',
    subtitle: 'Come si accende la luce del corridoio da entrambe le estremità',
    duration: '12 minuti',
    level: 'Facile',
    icon: 'toggle',
    color: '#8a4fd0',
    cover: 'img/lezione-deviatori.jpg',
    goals: ['Riconoscere comune e uscite del deviatore', 'Collegare le navette', 'Comandare una lampada da due punti'],
    start: startDeviatori,
    steps: [
      {
        type: 'info',
        title: 'Due comandi, una lampada',
        text: 'Nei corridoi e sulle scale la stessa luce si accende e si spegne da due punti diversi. Per farlo si usano due deviatori, SA1 e SA2. Il magnetotermico è già collegato all’arrivo linea.',
        focus: ['SA1', 'E1', 'SA2'],
      },
      {
        type: 'info',
        title: 'Com’è fatto un deviatore',
        text: 'Il deviatore ha tre morsetti: il comune C e le due uscite 1 e 2. A ogni pressione il comune passa dall’uscita 1 all’uscita 2, e viceversa.',
        schema: SCHEMA_DEVIATORI,
        focus: ['SA1'],
      },
      { type: 'wire', title: 'La fase al primo deviatore', text: 'La fase arriva al comune del primo deviatore.', todo: 'Clicca il morsetto 2 del magnetotermico, poi il morsetto C di SA1.', from: 'Q1:2', to: 'SA1:C' },
      { type: 'wire', title: 'Prima navetta', text: 'Colleghiamo le due uscite 1 tra loro.', todo: 'Clicca il morsetto 1 di SA1, poi il morsetto 1 di SA2.', from: 'SA1:1', to: 'SA2:1' },
      { type: 'wire', title: 'Seconda navetta', text: 'Ora le due uscite 2. Questi due fili tra i deviatori si chiamano “navette”.', todo: 'Clicca il morsetto 2 di SA1, poi il morsetto 2 di SA2.', from: 'SA1:2', to: 'SA2:2' },
      { type: 'wire', title: 'Dal secondo deviatore alla lampada', text: 'Dal comune del secondo deviatore la fase arriva alla lampada.', todo: 'Clicca il morsetto C di SA2, poi il morsetto L della lampada.', from: 'SA2:C', to: 'E1:L' },
      { type: 'wire', title: 'Il neutro alla lampada', text: 'Come sempre, il neutro va direttamente alla lampada.', todo: 'Clicca il morsetto N in basso del magnetotermico, poi il morsetto N della lampada.', from: 'Q1:N2', to: 'E1:N' },
      powerStep(),
      {
        type: 'action',
        title: 'Prova il primo deviatore',
        text: 'Guarda la lampada mentre azioni SA1.',
        todo: 'Clicca il deviatore SA1.',
        focus: ['SA1', 'E1'],
        target: { tag: 'SA1', action: 'toggle' },
        enter: (c) => { c.memo.sa1 = c.st('SA1').on; },
        done: (c) => c.st('SA1').on !== c.memo.sa1,
        perform: (c) => c.act('SA1', 'toggle'),
      },
      {
        type: 'action',
        title: 'Ora il secondo',
        text: 'Anche l’altro deviatore cambia lo stato della lampada, qualunque sia la posizione del primo.',
        todo: 'Clicca il deviatore SA2.',
        focus: ['SA2', 'E1'],
        target: { tag: 'SA2', action: 'toggle' },
        enter: (c) => { c.memo.sa2 = c.st('SA2').on; },
        done: (c) => c.st('SA2').on !== c.memo.sa2,
        perform: (c) => c.act('SA2', 'toggle'),
      },
      {
        type: 'quiz',
        title: 'Quando si accende la lampada?',
        text: 'Guarda lo schema dei deviatori.',
        schema: SCHEMA_DEVIATORI,
        options: [
          { text: 'Quando i due comuni sono sulla stessa navetta: il percorso fino alla lampada è chiuso', correct: true, feedback: 'Esatto! Basta cambiare la posizione di uno solo dei due per aprire o chiudere il percorso.' },
          { text: 'Quando entrambi i deviatori sono premuti', feedback: 'No: i deviatori non si tengono premuti, restano nella posizione scelta.' },
          { text: 'Dipende dal neutro', feedback: 'Il neutro non passa dai deviatori: va dritto alla lampada.' },
        ],
      },
      {
        type: 'end',
        title: 'Ora comandi la luce da due punti!',
        text: 'Hai realizzato il classico comando a deviatori.',
        recap: ['Il deviatore ha un comune (C) e due uscite (1 e 2).', 'I due deviatori sono collegati da due fili chiamati navette.', 'Per più di due punti si aggiungono gli invertitori, oppure si usa un relè passo-passo.'],
        view: 'panoramica',
      },
    ],
  },

  {
    id: 'motore',
    n: 4,
    title: 'Avvia un motore con un pulsante',
    subtitle: 'Il contattore e l’autoritenuta: il primo passo dell’automazione',
    duration: '15 minuti',
    level: 'Intermedio',
    icon: 'fan',
    color: '#c8322b',
    cover: 'img/lezione-motore.jpg',
    goals: ['Capire come funziona un contattore', 'Comandare un motore con i pulsanti', 'Realizzare l’autoritenuta'],
    start: startMotore,
    steps: [
      {
        type: 'info',
        title: 'Un motore da comandare',
        text: 'Un motore trifase muove pompe, nastri, ventilatori. Non si accende con un semplice interruttore: si comanda a distanza con un contattore e una pulsantiera. Quasi tutto è già collegato: manca un pezzo importante.',
        view: 'panoramica',
        focus: ['M1', 'SB1'],
      },
      {
        type: 'info',
        title: 'Il contattore KM1',
        text: 'È un interruttore comandato da una bobina (morsetti A1 e A2). Quando la bobina riceve corrente, i contatti principali si chiudono e il motore parte.',
        focus: ['KM1'],
      },
      {
        type: 'info',
        title: 'La pulsantiera',
        text: 'Il pulsante verde MARCIA fa arrivare corrente alla bobina solo finché lo tieni premuto. Il pulsante rosso ARRESTO, al contrario, la interrompe.',
        focus: ['SB1'],
      },
      powerStep(),
      {
        type: 'action',
        title: 'Tieni premuto MARCIA',
        text: 'Guarda il motore mentre tieni premuto il pulsante verde.',
        todo: 'Premi e tieni premuto il pulsante verde della pulsantiera.',
        focus: ['SB1', 'M1'],
        target: { tag: 'SB1', action: 'start', momentary: true, hold: true },
        done: (c) => !!c.st('KM1').coil,
        perform: (c) => c.act('SB1', 'start', 'down'),
      },
      {
        type: 'action',
        title: 'Ora rilascia il pulsante',
        text: 'Appena lo lasci, il motore si ferma: la bobina è alimentata solo finché tieni premuto.',
        todo: 'Rilascia il pulsante verde.',
        focus: ['SB1', 'M1'],
        target: { tag: 'SB1', action: 'start', momentary: true },
        done: (c) => !c.st('KM1').coil && !c.st('SB1').start,
        perform: (c) => c.act('SB1', 'start', 'up'),
      },
      {
        type: 'info',
        title: 'Serve l’autoritenuta',
        text: 'Per far restare acceso il motore si usa un contatto del contattore stesso, il 13-14, messo in parallelo al pulsante MARCIA. Quando il contattore si chiude, il 13-14 continua ad alimentare la bobina anche dopo aver lasciato il pulsante.',
        schema: SCHEMA_AUTORITENUTA,
        focus: ['KM1'],
      },
      { type: 'wire', title: 'Primo filo dell’autoritenuta', text: 'Colleghiamo l’ingresso del pulsante MARCIA al contatto 13 del contattore.', todo: 'Clicca il morsetto 3 della pulsantiera, poi il morsetto 13 del contattore KM1.', from: 'SB1:3', to: 'KM1:13' },
      { type: 'wire', title: 'Secondo filo dell’autoritenuta', text: 'Il contatto 14 va alla bobina, sul morsetto A1.', todo: 'Clicca il morsetto 14 del contattore, poi il morsetto A1 dello stesso contattore.', from: 'KM1:14', to: 'KM1:A1' },
      {
        type: 'action',
        title: 'Prova l’autoritenuta',
        text: 'Ora basta un colpo sul pulsante verde: il motore resta in marcia e la spia verde H1 si accende.',
        todo: 'Premi e rilascia MARCIA.',
        focus: ['SB1', 'M1'],
        target: { tag: 'SB1', action: 'start', momentary: true },
        done: (c) => !!c.st('KM1').coil && !c.st('SB1').start,
        perform: (c) => c.press('SB1', 'start'),
      },
      {
        type: 'action',
        title: 'Ferma il motore',
        text: 'Il pulsante rosso interrompe il circuito della bobina: il contattore si apre e l’autoritenuta si “sgancia”.',
        todo: 'Premi il pulsante rosso ARRESTO.',
        focus: ['SB1', 'M1'],
        target: { tag: 'SB1', action: 'stop', momentary: true },
        done: (c) => !c.st('KM1').coil,
        perform: (c) => c.press('SB1', 'stop'),
      },
      {
        type: 'quiz',
        title: 'A cosa serve il contatto 13-14?',
        schema: SCHEMA_AUTORITENUTA,
        options: [
          { text: 'A tenere alimentata la bobina dopo aver lasciato MARCIA', correct: true, feedback: 'Esatto: è l’autoritenuta, alla base di quasi tutti gli impianti di automazione.' },
          { text: 'A far girare il motore più veloce', feedback: 'No: la velocità non cambia. Il 13-14 riguarda solo il comando della bobina.' },
          { text: 'A proteggere il motore dal sovraccarico', feedback: 'Quello è il compito del relè termico FR1.' },
        ],
      },
      {
        type: 'end',
        title: 'Hai avviato il tuo primo motore!',
        text: 'Hai realizzato il teleavviamento con autoritenuta.',
        recap: ['Il contattore è un interruttore comandato da una bobina.', 'MARCIA (verde) chiude il circuito della bobina, ARRESTO (rosso) lo apre.', 'Il contatto 13-14 in parallelo a MARCIA realizza l’autoritenuta.'],
        view: 'panoramica',
      },
    ],
  },

  {
    id: 'multimetro',
    n: 5,
    title: 'Misura con il multimetro',
    subtitle: 'Tensione, corrente e potenza: leggi i numeri dell’impianto',
    duration: '10 minuti',
    level: 'Facile',
    icon: 'measure',
    color: '#0f8a8a',
    cover: 'img/lezione-multimetro.jpg',
    goals: ['Misurare una tensione con i puntali', 'Misurare una corrente con la pinza', 'Collegare corrente e potenza'],
    start: startPrimaLampadaCablata,
    exit: (c) => c.setTool('select'),
    steps: [
      {
        type: 'info',
        title: 'Il multimetro',
        text: 'Il multimetro serve a misurare. Con i due puntali, rosso e nero, si misura la tensione tra due punti. Con la pinza, stretta attorno a un filo, si misura la corrente che ci passa. L’impianto è quello della prima lezione, già collegato.',
        enter: (c) => c.setTool('measure'),
        view: 'panoramica',
      },
      powerStep({ enter: (c) => c.setTool('measure') }),
      {
        type: 'measure',
        title: 'Misura la tensione di rete',
        text: 'Misuriamo la tensione tra fase e neutro all’arrivo linea.',
        todo: 'Clicca il morsetto L dell’arrivo linea (puntale rosso), poi il morsetto N (puntale nero).',
        from: 'XA:L1',
        to: 'XA:N',
      },
      {
        type: 'info',
        title: '230 volt',
        text: 'Il display in alto a destra segna circa 230 V: è la tensione tra fase e neutro delle nostre case.',
        focus: ['XA'],
      },
      {
        type: 'measure',
        title: 'Neutro e terra',
        text: 'Ora misuriamo tra neutro e terra (PE).',
        todo: 'Clicca il morsetto N dell’arrivo linea, poi il morsetto PE.',
        from: 'XA:N',
        to: 'XA:PE',
      },
      {
        type: 'info',
        title: 'Quasi zero',
        text: 'Tra neutro e terra ci sono solo pochi volt, o anche zero: il neutro è collegato a terra nella cabina del distributore. È la fase il conduttore “pericoloso”.',
        focus: ['XA'],
      },
      {
        type: 'action',
        title: 'Accendi la lampada',
        text: 'Per misurare una corrente, qualcosa deve funzionare.',
        todo: 'Clicca l’interruttore SA1.',
        focus: ['SA1', 'E1'],
        target: { tag: 'SA1', action: 'toggle' },
        enter: (c) => c.setTool('select'),
        done: (c) => c.lit('E1'),
        perform: (c) => c.act('SA1', 'toggle'),
      },
      {
        type: 'clamp',
        title: 'Misura la corrente della lampada',
        text: 'Con la pinza amperometrica misuriamo la corrente nel filo che va alla lampada.',
        todo: 'Clicca sul cavo grigio che va dall’interruttore alla lampada.',
        from: 'SA1:1',
        to: 'E1:L',
        enter: (c) => c.setTool('measure'),
      },
      {
        type: 'info',
        title: 'Pochi milliampere',
        text: 'La lampada LED da 15 W assorbe circa 0,07 A (70 milliampere). Corrente e potenza sono legate: I ≈ P ÷ V, cioè 15 W ÷ 230 V.',
        focus: ['E1'],
      },
      {
        type: 'quiz',
        title: 'E una stufetta da 2000 W?',
        text: 'Usa la stessa regola: I ≈ P ÷ V.',
        options: [
          { text: 'Circa 9 A', correct: true, feedback: 'Giusto: 2000 ÷ 230 ≈ 8,7 A. Per questo le prese si proteggono con magnetotermici da 16 A.' },
          { text: 'Circa 0,9 A', feedback: 'Troppo poco: ricontrolla la divisione 2000 ÷ 230.' },
          { text: 'Circa 90 A', feedback: 'Troppo: con 90 A scatterebbe qualunque protezione domestica.' },
        ],
      },
      {
        type: 'end',
        title: 'Sai usare il multimetro!',
        text: 'Hai misurato tensioni e correnti come un tecnico.',
        recap: ['I puntali misurano la tensione tra due punti: tra fase e neutro ci sono 230 V.', 'La pinza misura la corrente in un filo senza scollegarlo.', 'La corrente dipende dalla potenza: I ≈ P ÷ V.'],
        enter: (c) => c.setTool('select'),
        view: 'panoramica',
      },
    ],
  },
];

export const lessonById = (id) => LESSONS.find((l) => l.id === id);

/**
 * Contesto per i passi: progetto, simulatore e piccole azioni.
 * `app` è facoltativo (nei test Node si passano solo project e sim).
 */
export function makeContext({ project, sim, app = null, memo = {} }) {
  const idOf = (tag) => project.components.find((c) => c.tag === tag)?.id;
  const ref = (s) => {
    const [tag, t] = s.split(':');
    return { c: idOf(tag), t };
  };
  const same = (a, b) => a.c === b.c && a.t === b.t;
  const ctx = {
    project,
    sim,
    app,
    memo,
    idOf,
    ref,
    st: (tag) => sim.getInst(idOf(tag))?.state || {},
    view: (tag) => sim.getInst(idOf(tag))?.view || {},
    par: (tag) => project.params(idOf(tag)),
    powered: () => !!sim.getInst('XA')?.state.on && !sim.getInst('XA')?.state.limiter,
    lit: (tag) => (sim.getInst(idOf(tag))?.view.bright || 0) > 0.5,
    wireBetween: (a, b) => {
      const ra = ref(a);
      const rb = ref(b);
      return project.wires.find((w) => (same(w.a, ra) && same(w.b, rb)) || (same(w.a, rb) && same(w.b, ra))) || null;
    },
    hasWire: (a, b) => !!ctx.wireBetween(a, b),
    addWire: (a, b) => {
      const ra = ref(a);
      const rb = ref(b);
      const roles = [project.terminal(ra)?.role, project.terminal(rb)?.role];
      const color = roles.includes('PE') ? 'yg' : roles.includes('N') ? 'blue' : roles.includes('coil') || roles.includes('aux') || roles.includes('ctrl') ? 'red' : 'brown';
      const types = [ra, rb].map((r) => project.comp(r.c)?.type);
      const section = types.includes('supply') ? 6 : types.includes('xs') ? 2.5 : roles.includes('coil') || roles.includes('aux') || roles.includes('ctrl') ? 1 : 1.5;
      return project.addWire(ra, rb, { color, section });
    },
    act: (tag, action, phase = 'click') => {
      const r = sim.interact(idOf(tag), action, phase);
      if (r?.sound) app?.sfx(r.sound);
      app?.emit('sim');
      return r;
    },
    press: (tag, action) => {
      ctx.act(tag, action, 'down');
      setTimeout(() => ctx.act(tag, action, 'up'), 280);
    },
    power: (on = true) => {
      const s = sim.getInst('XA')?.state;
      if (!s) return;
      if (on && (!s.on || s.limiter)) {
        if (app) app.togglePower();
        else {
          s.on = true;
          s.limiter = false;
          sim.settle();
        }
      } else if (!on && s.on) {
        if (app) app.togglePower();
        else {
          s.on = false;
          sim.settle();
        }
      }
    },
    setParam: (tag, key, value) => project.setParam(idOf(tag), key, value),
    setTool: (tool) => app?.interaction.setTool(tool),
    probes: () => app?.interaction.probes || [],
    clamp: () => app?.interaction.clamp || null,
  };
  return ctx;
}

/** Condizione di completamento di un passo (anche per i tipi con logica implicita) */
export function stepDone(step, ctx, state = {}) {
  switch (step.type) {
    case 'info':
    case 'end':
      return true;
    case 'wire':
      return ctx.hasWire(step.from, step.to);
    case 'measure': {
      const p = ctx.probes().map((t) => t.ref);
      const a = ctx.ref(step.from);
      const b = ctx.ref(step.to);
      const has = (r) => p.some((x) => x.c === r.c && x.t === r.t);
      return p.length === 2 && has(a) && has(b);
    }
    case 'clamp': {
      const w = ctx.wireBetween(step.from, step.to);
      return !!w && ctx.clamp() === w.id;
    }
    case 'quiz':
      return !!state.solved;
    default:
      return step.done ? !!step.done(ctx) : false;
  }
}
