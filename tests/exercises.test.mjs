// Collaudo delle esercitazioni del laboratorio completo: struttura (percorsi della scheda, passi, prove)
// e, per le esercitazioni che hanno una soluzione, la soluzione deve completare tutti i passi e superare
// tutte le prove di funzionamento. Esecuzione: node tests/exercises.test.mjs
import { Project } from '../src/core/project.js';
import { Simulator } from '../src/sim/engine.js';
import { DEFS } from '../src/catalog/defs/index.js';
import { runChecks } from '../src/sim/checks.js';
import { EXERCISES, TRACKS, PHASES, JUSTIFICATIONS, exerciseContext, exercisesOfTrack } from '../src/exercises/index.js';

let pass = 0;
let fail = 0;
const ok = (c, m, x = '') => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? '✓' : '✗'} ${m}${!c && x ? '  → ' + x : ''}`);
};

/** app finta: quanto basta a exerciseContext (niente interfaccia, niente Three) */
function fakeApp(data, { teacher = true, wireMode = 'flow', powered = true } = {}) {
  const project = new Project(data);
  const sim = new Simulator(DEFS);
  const resync = () => {
    sim.sync(project.data, (w) => project.electricalLength(w));
    sim.settle();
  };
  project.on('change', resync);
  resync();
  if (powered) sim.setPower(true);
  const app = {
    project,
    sim,
    settings: { teacher, wireMode },
    flags: { limiter: false, rcdTrip: false, presented: true, reported: true, seen: {} },
    checksPanel: { results: [], run() { this.results = runChecks(project, sim); } },
  };
  app.checksPanel.run();
  return app;
}

console.log('\nStruttura delle esercitazioni');
ok(TRACKS.length === 5, 'cinque esercitazioni pratiche della scheda del laboratorio');
ok(PHASES.length === 4 && PHASES[2].text.includes('docente') && PHASES[3].text.includes('presentazione'), 'quattro fasi con i testi della scheda');
for (const t of TRACKS) ok(exercisesOfTrack(t.id).length >= 1, `percorso ${t.n} “${t.title}”: ${exercisesOfTrack(t.id).length} esercitazion${exercisesOfTrack(t.id).length === 1 ? 'e' : 'i'}`);
for (const ex of EXERCISES) {
  const problems = [];
  if (!TRACKS.find((t) => t.id === ex.track)) problems.push('percorso sconosciuto ' + ex.track);
  if (!(ex.phase >= 1 && ex.phase <= 4)) problems.push('fase');
  if (!ex.steps?.length || ex.steps.some((s) => typeof s.done !== 'function' || !s.text)) problems.push('passi');
  if (!ex.tests?.length || ex.tests.some((t) => typeof t.run !== 'function' || !t.label)) problems.push('prove');
  if (!ex.questions?.length) problems.push('domande');
  if (!ex.keep && typeof ex.start !== 'function') problems.push('start');
  ok(!problems.length, `${ex.id}: percorso, fase, passi, prove e domande definiti`, problems.join(', '));
}
ok(EXERCISES.some((e) => e.id === 'domotica-civile' && e.track === 'domotica'), 'esiste l’esercitazione sull’impianto domotico civile');
ok(EXERCISES.some((e) => e.id === 'parametri' && e.teacher), 'esiste l’analisi dei parametri guidata dal docente');
ok(EXERCISES.some((e) => e.id === 'presentazione' && e.keep && e.phase === 4), 'esiste la presentazione dello studente (sull’impianto attuale, Fase 4)');

console.log('\nLe soluzioni completano i passi e superano le prove');
for (const ex of EXERCISES.filter((e) => e.solution)) {
  const app = fakeApp(ex.solution());
  const c = exerciseContext(app);
  // i passi `live` (dare corrente, premere, avviare) richiedono l'azione dello studente: non si valutano qui
  const undone = ex.steps.map((s, i) => {
    if (s.live) return null;
    try {
      return s.done(c) ? null : i + 1;
    } catch (e) {
      return `${i + 1} (${e.message})`;
    }
  }).filter(Boolean);
  ok(!undone.length, `${ex.id}: i ${ex.steps.filter((x) => !x.live).length} passi di configurazione (su ${ex.steps.length}) completati dalla soluzione`, 'passi non completati: ' + undone.join(', '));
  const failed = ex.tests.map((t) => {
    try {
      return t.run(c) ? null : t.label;
    } catch (e) {
      return `${t.label} (${e.message})`;
    }
  }).filter(Boolean);
  ok(!failed.length, `${ex.id}: tutte le ${ex.tests.length} prove superate dalla soluzione`, failed.join(' | '));
}

console.log('\nI passi non lanciano eccezioni su un quadro vuoto');
for (const ex of EXERCISES) {
  const app = fakeApp(ex.keep ? undefined : ex.start(), { powered: false });
  const c = exerciseContext(app);
  let thrown = null;
  for (const [i, s] of ex.steps.entries()) {
    try {
      s.done(c);
    } catch (e) {
      thrown = `${i + 1}: ${e.message}`;
    }
  }
  for (const t of ex.tests) {
    try {
      t.run(c);
    } catch (e) {
      thrown = `prova “${t.label}”: ${e.message}`;
    }
  }
  ok(!thrown, `${ex.id}: nessuna eccezione`, thrown);
}

console.log('\nPresentazione dello studente');
{
  const { appartamento } = await import('../src/presets/index.js');
  const data = appartamento();
  const app = fakeApp(data);
  const c = exerciseContext(app);
  const ex = EXERCISES.find((e) => e.id === 'presentazione');
  const before = ex.steps.map((s) => !!s.done(c));
  ok(before[0] === true, 'passo 1: il modello appartamento ha abbastanza componenti');
  ok(before[1] === false && before[3] === false, 'dati e giustificazioni mancanti all’inizio');
  app.project.setProjectMeta({ title: 'Appartamento', author: 'Mario Rossi', classe: '4ª A', description: 'Impianto monofase di un piccolo appartamento con linee luci e prese separate.' });
  for (const j of JUSTIFICATIONS) app.project.meta.justifications[j.key] = 'Risposta di prova abbastanza lunga per contare.';
  for (const p of c.protections()) p.note = 'Scelto per coordinamento con il cavo a valle.';
  app.checksPanel.run();
  const after = ex.steps.map((s) => !!s.done(c));
  ok(after.every(Boolean), 'tutti i passi completati dopo dati, motivazioni, giustificazioni, presentazione e scheda', after.map((d, i) => (d ? '' : i + 1)).filter(Boolean).join(', '));
  ok(ex.tests.every((t) => t.run(c)), 'tutte le prove superate');
}

console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
