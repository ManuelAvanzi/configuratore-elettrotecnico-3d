// Collaudo delle lezioni del tutorial: ogni lezione viene percorsa eseguendo il “Mostrami come” di ogni passo;
// alla fine di ciascun passo la condizione di completamento deve essere vera.
// Esecuzione: node tests/lessons.test.mjs
import { Project } from '../src/core/project.js';
import { Simulator } from '../src/sim/engine.js';
import { DEFS } from '../src/catalog/defs/index.js';
import { LESSONS, makeContext, stepDone } from '../src/tutorial/lessons.js';

let pass = 0;
let fail = 0;
const ok = (c, m, x = '') => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? '✓' : '✗'} ${m}${!c && x ? '  → ' + x : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

for (const lesson of LESSONS) {
  console.log(`\nLezione ${lesson.n}: ${lesson.title} (${lesson.steps.length} passi)`);
  const project = new Project(lesson.start());
  const sim = new Simulator(DEFS);
  const resync = () => {
    sim.sync(project.data, (w) => project.electricalLength(w));
    sim.settle();
  };
  project.on('change', resync);
  resync();
  // simulazione degli strumenti di misura (in Node non c'è l'interfaccia)
  const fake = { probes: [], clamp: null };
  const ctx = makeContext({ project, sim });
  ctx.probes = () => fake.probes;
  ctx.clamp = () => fake.clamp;
  ctx.setTool = () => {};
  for (const [i, step] of lesson.steps.entries()) {
    step.enter?.(ctx);
    const state = { solved: false };
    if (!stepDone(step, ctx, state)) {
      if (step.type === 'wire') ctx.addWire(step.from, step.to);
      else if (step.type === 'measure') fake.probes = [{ ref: ctx.ref(step.from) }, { ref: ctx.ref(step.to) }];
      else if (step.type === 'clamp') fake.clamp = ctx.wireBetween(step.from, step.to)?.id;
      else if (step.type === 'quiz') state.solved = !!step.options.find((o) => o.correct);
      else step.perform?.(ctx);
      await wait(350); // i pulsanti “premi e rilascia” completano dopo un attimo
      for (let k = 0; k < 20 + Math.round((step.settle || 0) * 30); k++) sim.step(1 / 30); // `settle`: secondi di simulazione che il passo richiede
    }
    const done = stepDone(step, ctx, state);
    ok(done, `${i + 1}. ${step.title}`, step.type);
    if (step.type === 'quiz') ok(step.options.filter((o) => o.correct).length === 1, `   una sola risposta corretta`);
  }
  lesson.exit?.(ctx);
}

console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
