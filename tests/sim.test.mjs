// Collaudo del simulatore elettrico su scenari didattici reali.
// Esecuzione: npm run test:sim
import { Project, blankProject } from '../src/core/project.js';
import { Simulator } from '../src/sim/engine.js';
import { DEFS } from '../src/catalog/defs/index.js';
import { cabs } from '../src/sim/complex.js';

let pass = 0;
let fail = 0;
function ok(cond, msg, extra = '') {
  if (cond) {
    pass++;
    console.log('  ✓ ' + msg);
  } else {
    fail++;
    console.log('  ✗ ' + msg + (extra ? '  → ' + extra : ''));
  }
}
function section(t) {
  console.log('\n' + t);
}

/** Costruisce un progetto con una mini-DSL: add(tag,type,params) e wire('Q1:2','S1:L',...) */
function build(sys, fn, supplyParams = {}) {
  const p = new Project(blankProject({ sys }));
  const sup = p.supply();
  Object.assign(sup.params, supplyParams);
  const byTag = { XA: 'XA', PE: 'PE' };
  const api = {
    add(tag, type, params = {}) {
      const c = p.addComponent(type, null, params, { tag });
      if (!c) throw new Error('impossibile aggiungere ' + tag);
      byTag[tag] = c.id;
      return c;
    },
    wire(a, b, section = 1.5, color = 'brown') {
      const [ta, pa] = a.split(':');
      const [tb, pb] = b.split(':');
      const r = p.addWire({ c: byTag[ta], t: pa }, { c: byTag[tb], t: pb }, { section, color });
      if (r.error) throw new Error(r.error + ' ' + a + ' → ' + b);
      return r.wire;
    },
    id: (tag) => byTag[tag],
  };
  fn(api);
  const sim = new Simulator(DEFS);
  sim.sync(p.data, (w) => p.electricalLength(w));
  const inst = (tag) => sim.getInst(byTag[tag]);
  const power = (on = true) => {
    sim.getInst('XA').state.on = on;
    sim.settle();
  };
  const run = (secs, dt = 0.05) => {
    for (let t = 0; t < secs; t += dt) sim.step(dt);
  };
  const act = (tag, action, phase) => sim.interact(byTag[tag], action, phase);
  return { p, sim, inst, power, run, act, api };
}

const events = (sim) => sim.events.map((e) => e.text).filter(Boolean);

// ───────────────────────────────────────────────────────────────────────────────────
section('1. Punto luce interrotto (MT 10 A → interruttore → lampada)');
{
  const t = build('1F', (b) => {
    b.add('Q1', 'mcb1pn', { In: 10 });
    b.add('SA1', 'sa');
    b.add('E1', 'lamp', { lt: 'inc100' });
    b.wire('XA:L1', 'Q1:1');
    b.wire('XA:N', 'Q1:N1', 1.5, 'blue');
    b.wire('Q1:2', 'SA1:L');
    b.wire('SA1:1', 'E1:L');
    b.wire('Q1:N2', 'E1:N', 1.5, 'blue');
  });
  t.power(true);
  ok((t.inst('E1').view.bright || 0) < 0.01, 'interruttore aperto: lampada spenta');
  t.act('SA1', 'toggle');
  ok(t.inst('E1').view.bright > 0.9, 'interruttore chiuso: lampada accesa', `bright=${t.inst('E1').view.bright}`);
  const vl = t.sim.measureV({ c: t.api.id('E1'), t: 'L' }, { c: t.api.id('E1'), t: 'N' });
  ok(vl > 220 && vl < 230, `tensione alla lampada ${vl.toFixed(1)} V (caduta su linea da 12 m)`);
  const i = cabs(t.sim.I(t.api.id('Q1') + '/p0'));
  ok(Math.abs(i - 100 / vl) < 0.05, `corrente nel magnetotermico ${i.toFixed(3)} A ≈ P/V`);
  t.power(false);
  ok((t.inst('E1').view.bright || 0) < 0.01, 'rete spenta: lampada spenta');
}

// ───────────────────────────────────────────────────────────────────────────────────
section('2. Cortocircuito su una presa → intervento magnetico');
{
  const t = build('1F', (b) => {
    b.add('Q1', 'mcb1pn', { In: 16, curve: 'C', pdi: 6 });
    b.add('XS1', 'xs', { carico: 'short' });
    b.wire('XA:L1', 'Q1:1', 4);
    b.wire('XA:N', 'Q1:N1', 4, 'blue');
    b.wire('Q1:2', 'XS1:L', 2.5);
    b.wire('Q1:N2', 'XS1:N', 2.5, 'blue');
  });
  t.power(true);
  const q = t.inst('Q1').state;
  ok(q.tripped && q.cause === 'magnetico', 'Q1 scatta per intervento magnetico', JSON.stringify(q));
  ok(q.lastFault > 300 && q.lastFault < 4500, `corrente di cortocircuito ${q.lastFault?.toFixed(0)} A (limitata da rete e cavi)`);
  ok(!q.damaged, 'PdI 6 kA sufficiente: interruttore non danneggiato');
  ok(events(t.sim).some((e) => e.includes('MAGNETICO')), 'evento di intervento registrato');
}

// ───────────────────────────────────────────────────────────────────────────────────
section('3. Sovraccarico → intervento termico ritardato');
{
  const t = build('1F', (b) => {
    b.add('Q1', 'mcb1pn', { In: 16 });
    b.add('XS1', 'xs', { carico: 'heater' });
    b.add('XS2', 'xs', { carico: 'oven' });
    b.add('XS3', 'xs', { carico: 'kettle' });
    b.wire('XA:L1', 'Q1:1', 6);
    b.wire('XA:N', 'Q1:N1', 6, 'blue');
    for (const x of ['XS1', 'XS2', 'XS3']) {
      b.wire('Q1:2', x + ':L', 2.5);
      b.wire('Q1:N2', x + ':N', 2.5, 'blue');
    }
  }, { Pc: 10 });
  t.power(true);
  const q = t.inst('Q1').state;
  ok(q.on && q.I > 25, `circa 28 A su In = 16 A: nessun intervento istantaneo (I = ${q.I.toFixed(1)} A)`);
  t.run(20);
  ok(q.on && q.theta > 0.1, `dopo 20 s il bimetallo si scalda (θ = ${(q.theta * 100).toFixed(0)} %)`);
  t.run(120);
  ok(q.tripped && q.cause === 'termico', 'entro 2 minuti interviene lo sganciatore termico');
}

// ───────────────────────────────────────────────────────────────────────────────────
section('4. Limitatore del contatore (3 kW contrattuali)');
{
  const t = build('1F', (b) => {
    b.add('Q1', 'mcb1pn', { In: 25 });
    b.add('XS1', 'xs', { carico: 'heater' });
    b.add('XS2', 'xs', { carico: 'hairdryer' });
    b.wire('XA:L1', 'Q1:1', 6);
    b.wire('XA:N', 'Q1:N1', 6, 'blue');
    for (const x of ['XS1', 'XS2']) {
      b.wire('Q1:2', x + ':L', 2.5);
      b.wire('Q1:N2', x + ':N', 2.5, 'blue');
    }
  }, { Pc: 3 });
  t.power(true);
  t.run(1);
  ok(!t.inst('XA').state.limiter, 'subito dopo l’accensione il contatore non stacca');
  t.run(4);
  ok(!t.inst('XA').state.limiter && t.inst('XA').state.over > 3, 'tra +10% e +27%: il contatore tollera per qualche secondo');
  t.run(7);
  ok(t.inst('XA').state.limiter, `3,7 kW > 3,3 kW disponibili → distacco dopo il ritardo`);
}

// ───────────────────────────────────────────────────────────────────────────────────
section('5. Guasto a terra in sistema TT');
{
  const mk = (withRCD, withPE, persona) => build('1F', (b) => {
    b.add('Q1', 'mcb1pn', { In: 16 });
    if (withRCD) b.add('Q2', 'rcd2p', { IDn: 0.03 });
    b.add('XS1', 'xs', { carico: 'washer', guasto: 'franco', persona });
    b.wire('XA:L1', 'Q1:1', 6);
    b.wire('XA:N', 'Q1:N1', 6, 'blue');
    if (withRCD) {
      b.wire('Q1:2', 'Q2:1', 6);
      b.wire('Q1:N2', 'Q2:N1', 6, 'blue');
      b.wire('Q2:2', 'XS1:L', 2.5);
      b.wire('Q2:N2', 'XS1:N', 2.5, 'blue');
    } else {
      b.wire('Q1:2', 'XS1:L', 2.5);
      b.wire('Q1:N2', 'XS1:N', 2.5, 'blue');
    }
    if (withPE) b.wire('PE:PE1', 'XS1:PE', 2.5, 'yg');
  }, { Re: 20 });

  let t = mk(true, true, false);
  t.power(true);
  ok(t.inst('Q2').state.tripped && t.inst('Q2').state.cause === 'differenziale', 'con PE e differenziale 30 mA: interviene il differenziale');
  ok(t.inst('Q1').state.on, 'il magnetotermico NON interviene (If ≈ 11 A < In): serve il differenziale!');

  t = mk(false, true, false);
  t.power(true);
  const ut = cabs(t.sim.terminalV(t.api.id('XS1'), '#m'));
  ok(t.inst('Q1').state.on && ut > 150, `senza differenziale la massa resta a ${ut.toFixed(0)} V verso terra (pericolo)`);

  t = mk(false, false, true);
  t.power(true);
  const ib = cabs(t.sim.I(t.api.id('XS1') + '/body'));
  ok(ib > 0.1, `senza PE né differenziale: corrente nel corpo ${(ib * 1000).toFixed(0)} mA (zona AC-4)`);

  t = mk(true, false, true);
  t.power(true);
  ok(t.inst('Q2').state.tripped, 'senza PE ma con differenziale: il differenziale interviene alla dispersione nel corpo');
}

// ───────────────────────────────────────────────────────────────────────────────────
section('6. Tasto di prova del differenziale');
{
  const t = build('1F', (b) => {
    b.add('Q1', 'rcd2p', { IDn: 0.03 });
    b.wire('XA:L1', 'Q1:1', 6);
    b.wire('XA:N', 'Q1:N1', 6, 'blue');
  });
  t.power(true);
  t.act('Q1', 'test', 'down');
  ok(t.inst('Q1').state.tripped && t.inst('Q1').state.cause === 'test', 'premendo T il differenziale scatta');
  t.act('Q1', 'test', 'up');
}

// ───────────────────────────────────────────────────────────────────────────────────
section('7. Teleavviamento motore trifase con autoritenuta');
function motorPlant(swap = false, conn = 'Y') {
  return build('3F', (b) => {
    b.add('QM', 'mcb3p', { In: 6, curve: 'D' });
    b.add('KM1', 'km3', { Uc: 230 });
    b.add('FR1', 'fr3', { Ir: 2 });
    b.add('Q2', 'mcb1pn', { In: 6 });
    b.add('SB', 'ss');
    b.add('M1', 'm3', { P: 0.75, conn });
    b.wire('XA:L1', 'QM:1', 2.5);
    b.wire('XA:L2', 'QM:3', 2.5);
    b.wire('XA:L3', 'QM:5', 2.5);
    b.wire('QM:2', 'KM1:1', 1.5);
    b.wire('QM:4', 'KM1:3', 1.5);
    b.wire('QM:6', 'KM1:5', 1.5);
    b.wire('KM1:2', 'FR1:1', 1.5);
    b.wire('KM1:4', 'FR1:3', 1.5);
    b.wire('KM1:6', 'FR1:5', 1.5);
    b.wire('FR1:2', 'M1:U1', 1.5);
    b.wire('FR1:4', swap ? 'M1:W1' : 'M1:V1', 1.5);
    b.wire('FR1:6', swap ? 'M1:V1' : 'M1:W1', 1.5);
    b.wire('PE:PE1', 'M1:PE', 1.5, 'yg');
    // circuito di comando 230 V
    b.wire('XA:L1', 'Q2:1', 1.5);
    b.wire('XA:N', 'Q2:N1', 1.5, 'blue');
    b.wire('Q2:2', 'FR1:95', 1, 'red');
    b.wire('FR1:96', 'SB:1', 1, 'red');
    b.wire('SB:2', 'SB:3', 1, 'red');
    b.wire('SB:4', 'KM1:A1', 1, 'red');
    b.wire('SB:3', 'KM1:13', 1, 'red');
    b.wire('KM1:14', 'KM1:A1', 1, 'red');
    b.wire('KM1:A2', 'Q2:N2', 1, 'blue');
  }, { Pc: 10, earth: 'TN-S' });
}
{
  const t = motorPlant();
  t.power(true);
  ok(!t.inst('KM1').state.coil && t.inst('M1').state.mode === 'stop', 'all’accensione il motore è fermo');
  t.act('SB', 'start', 'down');
  ok(t.inst('KM1').state.coil, 'premendo MARCIA il contattore si eccita');
  ok(t.inst('M1').state.mode === 'start', 'il motore è in avviamento');
  const Istart = t.inst('FR1').state.I[0];
  t.run(0.3);
  t.act('SB', 'start', 'up');
  ok(t.inst('KM1').state.coil, 'rilasciando MARCIA il contattore resta eccitato (autoritenuta 13-14)');
  t.run(2);
  const r = t.inst('M1').state;
  ok(r.mode === 'run' && r.dir === 1, 'dopo l’avviamento il motore gira in senso orario');
  const Irun = t.inst('FR1').state.I[0];
  ok(Istart > 4 * Irun, `corrente di spunto ${Istart.toFixed(1)} A ≈ 6 volte quella di regime ${Irun.toFixed(2)} A`);
  ok(Irun > 1.2 && Irun < 2.2, `corrente di regime plausibile per 0,75 kW all’80% di carico (${Irun.toFixed(2)} A)`);
  ok(t.inst('QM').state.on, 'il magnetotermico curva D non interviene sullo spunto');
  t.act('SB', 'stop', 'down');
  ok(!t.inst('KM1').state.coil, 'premendo ARRESTO il contattore si diseccita');
  t.act('SB', 'stop', 'up');
  ok(!t.inst('KM1').state.coil, 'rilasciando ARRESTO resta diseccitato');
  t.run(3);
  ok(t.inst('M1').state.mode === 'stop', 'il motore si ferma');

  // sovraccarico meccanico → relè termico
  t.p.comp(t.api.id('M1')).params.load = 150;
  t.sim.sync(t.p.data, (w) => t.p.electricalLength(w));
  t.act('SB', 'start', 'down');
  t.act('SB', 'start', 'up');
  t.run(3);
  t.run(240, 0.1);
  ok(t.inst('FR1').state.tripped, 'con carico al 150% interviene il relè termico');
  ok(!t.inst('KM1').state.coil, 'il 95-96 apre il circuito di comando: il contattore si diseccita');
}

section('8. Inversione di due fasi → rotazione antioraria');
{
  const t = motorPlant(true);
  t.power(true);
  t.act('SB', 'start', 'down');
  t.act('SB', 'start', 'up');
  t.run(2);
  ok(t.inst('M1').state.dir === -1 && t.inst('M1').state.mode === 'run', 'scambiando V1 e W1 il motore gira al contrario');
}

section('9. Motore collegato a triangolo sulla rete 400 V');
{
  const t = motorPlant(false, 'D');
  t.power(true);
  t.act('SB', 'start', 'down');
  t.act('SB', 'start', 'up');
  t.run(2);
  ok(events(t.sim).some((e) => e.includes('sovratensione')), 'viene segnalata la sovratensione sugli avvolgimenti');
  t.run(120, 0.1);
  ok(t.inst('FR1').state.tripped, `il relè termico protegge il motore (correnti ${t.inst('FR1').state.I.map((x) => x.toFixed(1)).join('/')} A)`);
}

// ───────────────────────────────────────────────────────────────────────────────────
section('10. Relè passo-passo comandato da due pulsanti');
{
  const t = build('1F', (b) => {
    b.add('Q1', 'mcb1pn', { In: 10 });
    b.add('KA1', 'kpp');
    b.add('SB1', 'sp');
    b.add('SB2', 'sp');
    b.add('E1', 'lamp');
    b.wire('XA:L1', 'Q1:1');
    b.wire('XA:N', 'Q1:N1', 1.5, 'blue');
    b.wire('Q1:2', 'SB1:3');
    b.wire('Q1:2', 'SB2:3');
    b.wire('SB1:4', 'KA1:A1');
    b.wire('SB2:4', 'KA1:A1');
    b.wire('KA1:A2', 'Q1:N2', 1.5, 'blue');
    b.wire('Q1:2', 'KA1:11');
    b.wire('KA1:14', 'E1:L');
    b.wire('E1:N', 'Q1:N2', 1.5, 'blue');
  });
  t.power(true);
  const lit = () => (t.inst('E1').view.bright || 0) > 0.5;
  ok(!lit(), 'lampada inizialmente spenta');
  t.act('SB1', 'press', 'down');
  t.act('SB1', 'press', 'up');
  ok(lit(), 'impulso da SB1: la lampada si accende');
  t.act('SB2', 'press', 'down');
  ok(!lit(), 'impulso da SB2: la lampada si spegne (commuta sul fronte di salita)');
  t.act('SB2', 'press', 'up');
  ok(!lit(), 'al rilascio resta spenta');
}

section('11. Luce scale temporizzata');
{
  const t = build('1F', (b) => {
    b.add('Q1', 'mcb1pn', { In: 10 });
    b.add('KT1', 'kt', { T: 10 });
    b.add('SB1', 'sp');
    b.add('E1', 'lamp');
    b.wire('XA:L1', 'Q1:1');
    b.wire('XA:N', 'Q1:N1', 1.5, 'blue');
    b.wire('Q1:2', 'SB1:3');
    b.wire('SB1:4', 'KT1:A1');
    b.wire('KT1:A2', 'Q1:N2', 1.5, 'blue');
    b.wire('Q1:2', 'KT1:15');
    b.wire('KT1:18', 'E1:L');
    b.wire('E1:N', 'Q1:N2', 1.5, 'blue');
  });
  t.power(true);
  t.act('SB1', 'press', 'down');
  t.run(0.5);
  t.act('SB1', 'press', 'up');
  const lit = () => (t.inst('E1').view.bright || 0) > 0.5;
  ok(lit(), 'dopo l’impulso la luce è accesa');
  t.run(8);
  ok(lit(), 'dopo 8 s è ancora accesa');
  t.run(3);
  ok(!lit(), 'dopo 10 s si spegne da sola');
}

section('12. Errori tipici: bobina a 24 V su 230 V, lampada tra due fasi');
{
  const t = build('1F', (b) => {
    b.add('KM1', 'km2m', { Uc: 24 });
    b.wire('XA:L1', 'KM1:A1');
    b.wire('XA:N', 'KM1:A2', 1.5, 'blue');
  });
  t.power(true);
  ok(t.inst('KM1').state.burnt, 'la bobina da 24 V alimentata a 230 V brucia');

  const t2 = build('3F', (b) => {
    b.add('E1', 'lamp');
    b.wire('XA:L1', 'E1:L');
    b.wire('XA:L2', 'E1:N');
  });
  t2.power(true);
  ok(t2.inst('E1').state.burnt, 'la lampada collegata tra L1 e L2 (400 V) brucia');
}

section('13. Deviatori: comando da due punti');
{
  const t = build('1F', (b) => {
    b.add('Q1', 'mcb1pn', { In: 10 });
    b.add('S1', 'sd');
    b.add('S2', 'sd');
    b.add('E1', 'lamp');
    b.wire('XA:L1', 'Q1:1');
    b.wire('XA:N', 'Q1:N1', 1.5, 'blue');
    b.wire('Q1:2', 'S1:C');
    b.wire('S1:1', 'S2:1');
    b.wire('S1:2', 'S2:2');
    b.wire('S2:C', 'E1:L');
    b.wire('E1:N', 'Q1:N2', 1.5, 'blue');
  });
  t.power(true);
  const lit = () => (t.inst('E1').view.bright || 0) > 0.5;
  const a = lit();
  t.act('S1', 'toggle');
  const b1 = lit();
  t.act('S2', 'toggle');
  const c = lit();
  ok(a === true && b1 === false && c === true, 'ogni deviatore commuta lo stato della lampada', `${a} ${b1} ${c}`);
}

section('14. Scenario what-if (usato dalle verifiche delle esercitazioni)');
{
  const t = build('1F', (b) => {
    b.add('Q1', 'mcb1pn', { In: 10 });
    b.add('SA1', 'sa');
    b.add('E1', 'lamp');
    b.wire('XA:L1', 'Q1:1');
    b.wire('XA:N', 'Q1:N1', 1.5, 'blue');
    b.wire('Q1:2', 'SA1:L');
    b.wire('SA1:1', 'E1:L');
    b.wire('Q1:N2', 'E1:N', 1.5, 'blue');
  });
  const E1 = t.api.id('E1');
  const SA1 = t.api.id('SA1');
  const [off, on] = t.sim.scenario([
    { power: true },
    { check: (s) => s.getInst(E1).view.bright },
    { act: [SA1, 'toggle'] },
    { check: (s) => s.getInst(E1).view.bright },
  ]);
  ok(off < 0.05 && on > 0.9, 'lo scenario verifica spenta/accesa');
  ok(!t.inst('XA').state.on && !t.inst('SA1').state.on, 'lo stato reale viene ripristinato dopo lo scenario');
  ok(t.sim.stats.nodes > 0, `prestazioni: ${t.sim.stats.nodes} nodi, ultima soluzione ${t.sim.stats.lastMs.toFixed(2)} ms`);
}

section('15. Verifiche normative automatiche');
{
  const { runChecks } = await import('../src/sim/checks.js');
  // Circuito corretto: generale MTD 30 mA, linea prese 16 A su 2,5 mm² con PE
  const good = build('1F', (b) => {
    b.add('Q1', 'rcbo1pn', { In: 25, IDn: 0.03 });
    b.add('Q2', 'mcb1pn', { In: 16 });
    b.add('XS1', 'xs', { carico: 'heater' });
    b.wire('XA:L1', 'Q1:1', 6);
    b.wire('XA:N', 'Q1:N1', 6, 'blue');
    b.wire('Q1:2', 'Q2:1', 4);
    b.wire('Q1:N2', 'Q2:N1', 4, 'blue');
    b.wire('Q2:2', 'XS1:L', 2.5);
    b.wire('Q2:N2', 'XS1:N', 2.5, 'blue');
    b.wire('PE:PE1', 'XS1:PE', 2.5, 'yg');
  });
  good.power(true);
  const r1 = runChecks(good.p, good.sim);
  const errs = r1.filter((r) => r.level === 'error');
  ok(errs.length === 0, 'impianto corretto: nessun errore', errs.map((e) => e.title).join(' | '));
  ok(r1.some((r) => r.id.startsWith('rcd-') && r.level === 'ok'), 'presa protetta da differenziale 30 mA riconosciuta');
  ok(r1.some((r) => r.id.startsWith('tt-') && r.level === 'ok'), 'verifica Re·IΔn ≤ 50 V superata');
  ok(r1.some((r) => r.id === 'coord-' + good.api.id('Q2') && r.level === 'ok'), 'coordinamento Ib ≤ In ≤ Iz della linea prese');

  // Circuito con errori tipici
  const bad = build('1F', (b) => {
    b.add('Q1', 'mcb1pn', { In: 16 });
    b.add('SA1', 'sa');
    b.add('E1', 'lamp');
    b.add('XS1', 'xs', { carico: 'heater' });
    b.wire('XA:L1', 'Q1:1', 1.5);
    b.wire('XA:N', 'Q1:N1', 1.5, 'blue');
    b.wire('Q1:2', 'E1:L', 1.5);
    b.wire('Q1:N2', 'SA1:L', 1.5, 'blue');
    b.wire('SA1:1', 'E1:N', 1.5, 'blue');
    b.wire('Q1:2', 'XS1:L', 1.5);
    b.wire('Q1:N2', 'XS1:N', 1.5, 'blue');
    b.wire('PE:PE1', 'XS1:PE', 1.5, 'brown');
  });
  const r2 = runChecks(bad.p, bad.sim);
  const has = (prefix, level = 'error') => r2.some((r) => r.id.startsWith(prefix) && r.level === level);
  ok(has('sez-', 'warn'), 'segnalata la presa da 16 A alimentata con cavi da 1,5 mm²');
  ok(has('rcd-'), 'segnalata la presa senza differenziale');
  ok(has('tt-none'), 'segnalato il sistema TT senza differenziale');
  ok(has('sw-n-'), 'segnalato l’interruttore sul neutro');
  ok(has('col-pe-'), 'segnalato il PE di colore sbagliato');
}

section('16. Modelli predefiniti e soluzioni delle esercitazioni senza non conformità');
{
  const { runChecks } = await import('../src/sim/checks.js');
  const { PRESETS } = await import('../src/presets/index.js');
  const { EXERCISES } = await import('../src/exercises/index.js');
  const cases = [
    ...PRESETS.filter((p) => !p.id.startsWith('vuoto')).map((p) => [p.title, p.make()]),
    ...EXERCISES.filter((e) => e.solution).map((e) => ['Soluzione: ' + e.title, e.solution()]),
  ];
  for (const [title, data] of cases) {
    const p = new Project(data);
    const sim = new Simulator(DEFS);
    sim.sync(p.data, (w) => p.electricalLength(w));
    sim.setPower(true); // arrivo linea o centrale di gruppi elettrogeni
    const errs = runChecks(p, sim).filter((r) => r.level === 'error');
    ok(errs.length === 0, `${title}: nessun errore`, errs.map((e) => e.title + ' — ' + e.detail).join(' | '));
  }
}

console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
