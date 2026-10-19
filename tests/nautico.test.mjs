// Collaudo del modulo nautico, fase A1: sistema di rete parametrico (440 V 60 Hz), neutro isolato (IT) con
// controllo dell'isolamento, gruppi elettrogeni con sincronizzazione e parallelo, rete in isola (caduta allo
// spunto, sovraccarico, frequenza), distacco carichi, verifiche di centrale. Esecuzione: npm run test:nautico
import { Project, blankProject } from '../src/core/project.js';
import { Simulator } from '../src/sim/engine.js';
import { DEFS } from '../src/catalog/defs/index.js';
import { runChecks } from '../src/sim/checks.js';
import { build } from '../src/presets/builder.js';
import { nave } from '../src/presets/index.js';
import { gensetRated } from '../src/catalog/defs/nautico.js';

let pass = 0;
let fail = 0;
const ok = (c, m, x = '') => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? '✓' : '✗'} ${m}${!c && x ? '  → ' + x : ''}`);
};
const section = (t) => console.log('\n' + t);
const r1 = (v) => Math.round(v * 10) / 10;

/** Progetto + simulatore con aiuti: id(tag), inst(tag), act(tag, azione), run(secondi), V(tag:morsetto, tag:morsetto) */
function rig(data) {
  const p = new Project(data);
  const sim = new Simulator(DEFS);
  const resync = () => sim.sync(p.data, (w) => p.electricalLength(w));
  p.on('change', resync);
  resync();
  sim.settle();
  const id = (tag) => p.components.find((c) => c.tag === tag)?.id;
  return {
    p,
    sim,
    id,
    inst: (tag) => sim.getInst(id(tag)),
    act: (tag, action, phase) => sim.interact(id(tag), action, phase),
    run: (secs, dt = 0.05) => {
      for (let t = 0; t < secs - 1e-9; t += dt) sim.step(dt);
    },
    V: (a, b) => {
      const [ta, pa] = a.split(':');
      const [tb, pb] = b.split(':');
      return sim.measureV({ c: id(ta), t: pa }, { c: id(tb), t: pb });
    },
    checks: () => runChecks(p, sim),
    events: () => sim.events.map((e) => e.text).filter(Boolean),
  };
}

/** Quadro di bordo minimo: gruppo G1 (e G2 se richiesto) → arrivo 4P → sbarra; extra(b) aggiunge il resto */
function board({ Sn = 50, two = false, auto = true, standby = false, extra } = {}) {
  return build({ sys: '3F', source: 'none', title: 'Prova di bordo' }, (b) => {
    b.add('G1', 'genset', 'A1', { Sn, net: 'nave440', earth: 'IT', auto });
    b.add('Q1', 'mcb4p', 'R1:0', { In: Sn >= 100 ? 125 : 80, curve: 'C', pdi: 6 });
    b.wire('G1:L1', 'Q1:1', 25);
    b.wire('G1:L2', 'Q1:3', 25);
    b.wire('G1:L3', 'Q1:5', 25);
    b.wire('G1:N', 'Q1:N1', 25);
    b.wire('G1:PE', 'PE:PE1', 16);
    if (two) {
      b.add('G2', 'genset', 'A3', { Sn, net: 'nave440', earth: 'IT', auto, standby });
      b.add('Q2', 'mcb4p', 'R1:4', { In: Sn >= 100 ? 125 : 80, curve: 'C', pdi: 6 });
      b.wire('G2:L1', 'Q2:1', 25);
      b.wire('G2:L2', 'Q2:3', 25);
      b.wire('G2:L3', 'Q2:5', 25);
      b.wire('G2:N', 'Q2:N1', 25);
      b.wire('G2:PE', 'PE:PE2', 16);
      b.wire('Q1:2', 'Q2:2', 25);
      b.wire('Q1:4', 'Q2:4', 25);
      b.wire('Q1:6', 'Q2:6', 25);
      b.wire('Q1:N2', 'Q2:N2', 25);
    }
    extra?.(b);
  });
}

/** Motore trifase M1 su partenza Q3 (già alimentata da Q1) */
function motorFeeder(b, P, load, In = 32, curve = 'C') {
  b.add('Q3', 'mcb3p', 'R2:0', { In, curve, pdi: 6 });
  b.add('M1', 'm3', 'B1', { P, conn: 'Y', load });
  b.wire('Q1:2', 'Q3:1', 6);
  b.wire('Q1:4', 'Q3:3', 6);
  b.wire('Q1:6', 'Q3:5', 6);
  b.wire('Q3:2', 'M1:U1', 6);
  b.wire('Q3:4', 'M1:V1', 6);
  b.wire('Q3:6', 'M1:W1', 6);
  b.wire('M1:PE', 'PE:PE3', 6);
}

/**
 * Carico resistivo di bordo: stufette da 2 kW sulle tre fasi (n per fase). Ogni fase ha la sua partenza
 * monofase (QA su L1, QB su L2, QC su L3). Se `shedL3` c'è un relè KL1 che stacca la fase L3.
 */
function heaters(b, perPhase, { shedL3 = false, soglia = 85, cells = ['A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'C2', 'C3', 'C4', 'C5'] } = {}) {
  const In = perPhase[2] * 9 > 32 ? 40 : 32;
  b.add('QA', 'mcb1pn', 'R2:0', { In });
  b.add('QB', 'mcb1pn', 'R2:2', { In });
  b.add('QC', 'mcb1pn', 'R2:4', { In });
  b.wire('Q1:2', 'QA:1', 10);
  b.wire('Q1:4', 'QB:1', 10);
  b.wire('Q1:N2', 'QA:N1', 10);
  b.wire('QA:N1', 'QB:N1', 10);
  b.wire('QB:N1', 'QC:N1', 10);
  if (shedL3) {
    b.add('KL1', 'kls', 'R2:6', { mode: 'carico', soglia, ritardo: 1 });
    b.wire('QA:2', 'KL1:L', 1.5);
    b.wire('QA:N2', 'KL1:N', 1.5);
    b.wire('Q1:6', 'KL1:11', 10);
    b.wire('KL1:12', 'QC:1', 10);
  } else b.wire('Q1:6', 'QC:1', 10);
  let k = 0;
  let pe = 3;
  for (const [ph, Q] of [[0, 'QA'], [1, 'QB'], [2, 'QC']]) {
    let prev = null;
    for (let j = 0; j < perPhase[ph]; j++) {
      const tag = `XS${k + 1}`;
      b.add(tag, 'xs', cells[k++], { carico: 'heater', tipo: 'sch' });
      b.wire(prev ? `${prev}:L` : `${Q}:2`, `${tag}:L`, 6);
      b.wire(prev ? `${prev}:N` : `${Q}:N2`, `${tag}:N`, 6);
      b.wire(prev ? `${prev}:PE` : `PE:PE${pe++}`, `${tag}:PE`, 6); // PE a catena (il collettore ha 8 morsetti)
      prev = tag;
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────────
section('1. Sistema di rete parametrico: arrivo linea a 254/440 V 60 Hz');
{
  const data = build({ sys: '3F', title: 'Rete 440', supply: { net: 'nave440', Pc: 30, Icc: 6 } }, (b) => {
    b.add('Q1', 'mcb1pn', 'R1:4', { In: 10 });
    b.add('E1', 'lamp', 'A1', { lt: 'inc100' });
    b.wire('XA:L1', 'Q1:1', 6);
    b.wire('XA:N', 'Q1:N1', 6);
    b.wire('Q1:2', 'E1:L', 1.5);
    b.wire('Q1:N2', 'E1:N', 1.5);
  });
  const t = rig(data);
  ok(t.sim.env.sys.Vph === 254 && t.sim.env.sys.f === 60, `il simulatore lavora a ${t.sim.env.sys.Vph} V · ${t.sim.env.sys.f} Hz (dalla sorgente)`);
  t.sim.setPower(true);
  const v = t.V('E1:L', 'E1:N');
  ok(v > 245 && v < 255, `lampada alimentata a ${r1(v)} V (fase-neutro di un sistema 440 V)`);
  const vll = t.V('XA:L1', 'XA:L2');
  ok(vll > 430 && vll < 441, `tensione concatenata ${r1(vll)} V`);
  const d = build({ sys: '1F', title: 'Rete 230' }, () => {});
  const t2 = rig(d);
  ok(t2.sim.env.sys.Vph === 230 && t2.sim.env.sys.f === 50, 'un progetto normale resta a 230 V · 50 Hz');
}

// ───────────────────────────────────────────────────────────────────────────────────
section('2. Neutro isolato (IT): primo guasto a terra senza intervento, allarme isolamento, secondo guasto');
{
  const data = build({ sys: '3F', earth: 'IT', title: 'IT', supply: { net: 'nave440', Pc: 30, Icc: 6, Rins: 200 } }, (b) => {
    b.add('Q1', 'rcbo1pn', 'R1:4', { In: 16, IDn: 0.03, curve: 'C', pdi: 6 });
    b.add('Q2', 'mcb1pn', 'R1:6', { In: 16 });
    b.add('KI1', 'imd', 'R1:8', { soglia: 50 });
    b.add('XS1', 'xs', 'A1', { carico: 'washer' });
    b.add('XS2', 'xs', 'A2', { carico: 'heater' });
    b.wire('XA:L1', 'Q1:1', 6);
    b.wire('XA:N', 'Q1:N1', 6);
    b.wire('XA:L2', 'Q2:1', 6);
    b.wire('Q1:N1', 'Q2:N1', 6);
    b.wire('Q1:2', 'XS1:L', 2.5);
    b.wire('Q1:N2', 'XS1:N', 2.5);
    b.wire('XS1:PE', 'PE:PE1', 2.5);
    b.wire('Q2:2', 'XS2:L', 2.5);
    b.wire('Q2:N2', 'XS2:N', 2.5);
    b.wire('XS2:PE', 'PE:PE2', 2.5);
    b.wire('Q1:2', 'KI1:L', 1.5);
    b.wire('Q1:N2', 'KI1:N', 1.5);
    b.wire('KI1:PE', 'PE:PE3', 1.5);
  });
  const t = rig(data);
  t.sim.setPower(true);
  const k0 = t.inst('KI1').state;
  ok(!k0.alarm && k0.Riso > 150e3, `rete sana: isolamento ${(k0.Riso / 1000).toFixed(0)} kΩ (l’isolamento della rete), nessun allarme`);
  t.p.setParam(t.id('XS1'), 'guasto', 'franco');
  t.run(0.2);
  const q1 = t.inst('Q1').state;
  const il = t.sim.earthLeakage();
  ok(q1.on && !q1.tripped, 'guasto franco a massa sulla lavatrice: il differenziale NON interviene (sistema IT)', JSON.stringify(q1));
  ok(il > 0.0005 && il < 0.003, `corrente del primo guasto limitata dall’isolamento: ${(il * 1000).toFixed(2)} mA`);
  const ki = t.inst('KI1').state;
  ok(ki.alarm && ki.Riso < 100, `controllo isolamento in allarme (Riso ≈ ${ki.Riso.toFixed(1)} Ω, neutro spostato di ${ki.Vd.toFixed(0)} V)`);
  ok(t.events().some((e) => e.includes('ALLARME ISOLAMENTO')), 'evento di allarme emesso');
  t.p.setParam(t.id('XS1'), 'persona', true);
  t.run(0.2);
  const ib = t.sim.I(t.id('XS1') + '/body');
  const ibm = Math.hypot(ib.re, ib.im) * 1000;
  ok(ibm < 2, `persona che tocca la massa in guasto: ${ibm.toFixed(2)} mA, non pericolosa`);
  // guasto resistivo: l'isolamento misurato è quello del guasto
  t.p.setParam(t.id('XS1'), 'persona', false);
  t.p.setParam(t.id('XS1'), 'guasto', 'd10');
  t.run(0.2);
  const ki2 = t.inst('KI1').state;
  ok(ki2.alarm && ki2.Riso > 15e3 && ki2.Riso < 30e3, `dispersione da 10 mA: isolamento misurato ${(ki2.Riso / 1000).toFixed(1)} kΩ (sotto la soglia di 50 kΩ)`);
  t.p.setParam(t.id('XS1'), 'guasto', 'franco');
  t.run(0.2);
  // secondo guasto su un'altra fase: cortocircuito L1-L2 attraverso il PE → intervento magnetico
  t.p.setParam(t.id('XS2'), 'guasto', 'franco');
  t.run(0.3);
  const tripped = t.inst('Q1').state.tripped || t.inst('Q2').state.tripped;
  ok(tripped, 'secondo guasto a terra su un’altra fase: cortocircuito, intervento delle protezioni', t.events().slice(-2).join(' | '));
  // verifiche
  const res = t.checks();
  ok(res.some((r) => r.id === 'it-imd' && r.level === 'ok'), 'verifica: controllo isolamento presente nel sistema IT');
  ok(!res.some((r) => r.id.startsWith('tt-')), 'nessuna verifica TT (Re·IΔn) in un sistema IT');
}

// ───────────────────────────────────────────────────────────────────────────────────
section('3. Un gruppo elettrogeno: avvio, chiusura, tensione e frequenza, spunto di un motore');
{
  const data = board({
    Sn: 50,
    extra: (b) => {
      motorFeeder(b, 7.5, 80);
      b.add('Q4', 'mcb1pn', 'R2:3', { In: 10 });
      b.add('E1', 'lamp', 'B3', { lt: 'led15' });
      b.wire('Q3:1', 'Q4:1', 2.5);
      b.wire('Q1:N2', 'Q4:N1', 2.5);
      b.wire('Q4:2', 'E1:L', 1.5);
      b.wire('Q4:N2', 'E1:N', 1.5);
    },
  });
  const t = rig(data);
  const r = gensetRated(t.inst('G1').params);
  ok(Math.round(r.In) === 66 && r.Icc > 380 && r.Icc < 470, `50 kVA a 440 V: In ${r.In.toFixed(1)} A, Icc ${r.Icc.toFixed(0)} A (${(r.Icc / r.In).toFixed(1)} × In)`);
  ok(t.sim.env.sys.Vph === 254 && t.sim.env.sys.f === 60 && t.sim.env.sys.earth === 'IT', 'sistema dichiarato dal gruppo: 254/440 V, 60 Hz, IT');
  t.inst('Q3').state.on = false; // il motore parte dopo
  t.sim.markDirty();
  ok(t.sim.powerState().kind === 'genset' && !t.sim.powerState().on, 'stato alimentazione: centrale ferma');
  let v = t.V('E1:L', 'E1:N');
  ok(v < 1, 'gruppo fermo: sbarra senza tensione');
  t.act('G1', 'close');
  ok(!t.inst('G1').state.closed, 'non si può chiudere l’interruttore con il gruppo fermo');
  t.act('G1', 'genStart');
  t.run(0.1);
  ok(t.inst('G1').state.running && t.inst('G1').state.synced, 'gruppo avviato: la sbarra è morta, il gruppo fa da riferimento');
  t.act('G1', 'close');
  t.run(0.1);
  v = t.V('E1:L', 'E1:N');
  ok(t.inst('G1').state.closed && v > 245 && v < 256, `interruttore chiuso: lampada a ${r1(v)} V`);
  const ps = t.sim.powerState();
  ok(ps.on && ps.kind === 'genset' && Math.abs(ps.fBus - 60) < 0.01, `frequenza di sbarra ${ps.fBus} Hz, ${ps.label}`);
  const bus = t.sim.busAt(t.id('G1'), 'L1');
  ok(bus && bus.gens.length === 1 && bus.loading < 0.05, `sbarra: un gruppo, carico ${(bus.loading * 100).toFixed(1)} %`);
  // spunto del motore: caduta di tensione (nessuna sbarra a potenza infinita)
  t.inst('Q3').state.on = true;
  t.sim.markDirty();
  t.run(0.3);
  const vStart = t.V('G1:L1', 'G1:L2');
  const mode = t.inst('M1').state.mode;
  ok(mode === 'start' && vStart < 0.92 * 440, `allo spunto del motore da 7,5 kW la tensione cala a ${r1(vStart)} V (${(vStart / 4.4).toFixed(0)} %)`, `mode=${mode}`);
  t.run(2);
  const vRun = t.V('G1:L1', 'G1:L2');
  ok(t.inst('M1').state.mode === 'run' && vRun > 0.96 * 440, `a regime la tensione risale a ${r1(vRun)} V`);
  const b2 = t.sim.busAt(t.id('G1'), 'L1');
  ok(b2.loading > 0.1 && b2.loading < 0.35, `carico del gruppo con il motore: ${(b2.loading * 100).toFixed(0)} %`);
  t.act('G1', 'genStop');
  t.run(0.1);
  ok(t.V('E1:L', 'E1:N') < 1 && !t.sim.powerState().on, 'gruppo fermato: sbarra senza tensione');
  // un motore troppo grande per il gruppo non riesce ad avviarsi (la tensione crolla)
  const big = rig(board({ Sn: 20, extra: (b) => motorFeeder(b, 11, 80, 40, 'D') }));
  big.sim.setPower(true);
  big.run(2);
  const vb = big.V('G1:L1', 'G1:L2');
  ok(big.inst('M1').state.mode !== 'run' && vb < 0.75 * 440, `motore da 11 kW su un gruppo da 20 kVA: la tensione crolla a ${r1(vb)} V e il motore non parte`, big.inst('M1').state.mode);
}

// ───────────────────────────────────────────────────────────────────────────────────
section('4. Rete in isola: sovraccarico, frequenza che cala, distacco dei carichi non essenziali');
{
  // 20 kVA (In 26 A): 3 stufette su L1 e L2, 6 su L3 (non essenziali, a valle del distacco carichi)
  const t = rig(board({ Sn: 20, extra: (b) => heaters(b, [3, 3, 6], { shedL3: true, soglia: 85 }) }));
  t.sim.setPower(true);
  t.run(0.3);
  const bus = t.sim.busAt(t.id('G1'), 'L1');
  ok(bus.loading > 1.05, `gruppo da 20 kVA con 24 kW di carico: ${(bus.loading * 100).toFixed(0)} %`);
  ok(bus.f < 59.9 && bus.f > 57, `la frequenza cala a ${bus.f.toFixed(2)} Hz (rete in isola)`);
  const g = t.inst('G1');
  ok(g.state.Imax / gensetRated(g.params).In > 1.5, `fase L3 a ${(g.state.Imax / gensetRated(g.params).In).toFixed(2)} × In del generatore`);
  t.run(1.5);
  ok(t.inst('KL1').state.shed, 'relè di distacco carichi intervenuto (contatto 11-12 aperto)');
  ok(t.V('XS7:L', 'XS7:N') < 1, 'utenze non essenziali staccate: prese di L3 senza tensione');
  const b2 = t.sim.busAt(t.id('G1'), 'L1');
  ok(b2.loading < 0.7 && Math.abs(b2.f - 60) < 0.01, `carico sceso al ${(b2.loading * 100).toFixed(0)} %, frequenza tornata a ${b2.f.toFixed(1)} Hz`);
  ok(t.events().some((e) => e.includes('DISTACCO CARICHI')), 'evento di distacco emesso');
  t.run(240, 0.1);
  ok(!g.state.trip && g.state.closed, 'con il distacco dei carichi il generatore resta in servizio');
  // senza distacco carichi: il generatore scatta per sovraccarico (2 In → meno di un minuto)
  const t2 = rig(board({ Sn: 20, extra: (b) => heaters(b, [3, 3, 6]) }));
  t2.sim.setPower(true);
  t2.run(0.3);
  const g2 = t2.inst('G1');
  const x = g2.state.Imax / gensetRated(g2.params).In;
  ok(x > 1.5 && x < 2.3, `senza distacco: ${x.toFixed(2)} × In sulla fase più carica`);
  t2.run(120, 0.1);
  ok(g2.state.trip === 'sovraccarico' && !g2.state.closed, `protezione di generatore intervenuta per sovraccarico (${g2.state.trip})`, t2.events().slice(-1).join(''));
  ok(t2.V('G1:L1', 'G1:L2') < 1, 'sbarra senza tensione dopo l’intervento (black-out)');
}

// ───────────────────────────────────────────────────────────────────────────────────
section('5. Due gruppi: chiusura fuori fase, sincronizzazione, parallelo e ripartizione del carico');
{
  const mk = (auto) => board({
    Sn: 50,
    two: true,
    auto,
    extra: (b) => {
      b.add('Q3', 'mcb1pn', 'R2:0', { In: 16 });
      b.add('Q4', 'mcb1pn', 'R2:2', { In: 16 });
      b.add('XS1', 'xs', 'C1', { carico: 'oven' });
      b.add('XS2', 'xs', 'C2', { carico: 'oven' });
      b.wire('Q1:2', 'Q3:1', 2.5);
      b.wire('Q1:4', 'Q4:1', 2.5);
      b.wire('Q1:N2', 'Q3:N1', 2.5);
      b.wire('Q3:N1', 'Q4:N1', 2.5);
      b.wire('Q3:2', 'XS1:L', 2.5);
      b.wire('Q3:N2', 'XS1:N', 2.5);
      b.wire('Q4:2', 'XS2:L', 2.5);
      b.wire('Q4:N2', 'XS2:N', 2.5);
      b.wire('XS1:PE', 'PE:PE3', 2.5);
      b.wire('XS2:PE', 'PE:PE4', 2.5);
    },
  });
  // senza sincronizzatore: chiusura fuori fase
  const t = rig(mk(false));
  t.act('G1', 'genStart');
  t.run(0.1);
  t.act('G1', 'close');
  t.run(0.1);
  t.act('G2', 'genStart');
  t.run(0.1);
  const g2 = t.inst('G2').state;
  ok(g2.running && g2.busLive && !g2.synced && g2.phase > 0, `G2 in moto con la sbarra in tensione: non sincronizzato (sfasamento ${g2.phase.toFixed(0)}°)`);
  t.act('G2', 'close');
  t.run(0.5);
  ok(g2.trip === 'parallelo fuori fase' && !g2.closed, 'chiusura fuori fase: corrente di circolazione e intervento della protezione di G2', t.events().slice(-1).join(''));
  ok(t.inst('G1').state.closed && !t.inst('G1').state.trip && t.V('XS1:L', 'XS1:N') > 240, 'G1 resta in servizio e alimenta le utenze');
  t.act('G2', 'resetTrip');
  t.act('G2', 'sync');
  t.act('G2', 'close');
  t.run(0.5);
  const s1 = t.inst('G1').state;
  const s2 = t.inst('G2').state;
  ok(s1.closed && s2.closed && !s2.trip, 'dopo sincronizzazione manuale: entrambi i gruppi in parallelo');
  ok(s1.P > 1000 && Math.abs(s1.P - s2.P) / s1.P < 0.05, `carico ripartito: G1 ${(s1.P / 1000).toFixed(2)} kW, G2 ${(s2.P / 1000).toFixed(2)} kW`);
  const bus = t.sim.busAt(t.id('G1'), 'L1');
  ok(bus.gens.length === 2, 'la sbarra vede due gruppi');
  ok(t.sim.powerState().label.includes('2 gruppi'), `stato: ${t.sim.powerState().label}`);
  // con sincronizzatore automatico: la chiusura è bloccata finché non c'è sincronismo
  const ta = rig(mk(true));
  ta.act('G1', 'genStart');
  ta.run(0.1);
  ta.act('G1', 'close');
  ta.act('G2', 'genStart');
  ta.run(0.5);
  const r = ta.act('G2', 'close');
  ok(!ta.inst('G2').state.closed && r?.level === 'warn', 'sincronizzatore: chiusura rifiutata prima del sincronismo');
  ta.run(4.5);
  ok(ta.inst('G2').state.synced, 'dopo qualche secondo il sincronizzatore segnala il sincronismo');
  ta.act('G2', 'close');
  ta.run(0.3);
  ok(ta.inst('G2').state.closed && !ta.inst('G2').state.trip, 'chiusura accettata: parallelo senza corrente di circolazione');
  // scorciatoia “alimenta” e spegnimento
  ta.sim.setPower(false);
  ok(!ta.sim.powerState().on, 'setPower(false): centrale ferma');
  ta.sim.setPower(true);
  ok(ta.sim.powerState().on && ta.sim.busAt(ta.id('G1'), 'L1').gens.length === 2, 'setPower(true): entrambi i gruppi in parallelo');
}

// ───────────────────────────────────────────────────────────────────────────────────
section('6. Gruppo di riserva: avviamento automatico quando il carico supera l’85 %');
{
  const t = rig(board({ Sn: 20, two: true, auto: true, standby: true, extra: (b) => heaters(b, [4, 4, 3], { cells: ['A5', 'B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'C2', 'C3', 'C4', 'C5'] }) }));
  t.act('G1', 'genStart');
  t.run(0.1);
  t.act('G1', 'close');
  t.run(0.5);
  const b1 = t.sim.busAt(t.id('G1'), 'L1');
  ok(b1.gens.length === 1 && b1.loading > 0.85, `G1 solo: carico ${(b1.loading * 100).toFixed(0)} %`);
  t.run(12);
  const g2 = t.inst('G2').state;
  ok(g2.running && g2.closed, 'G2 si è avviato, sincronizzato e chiuso da solo', JSON.stringify({ running: g2.running, synced: g2.synced, closed: g2.closed }));
  const b2 = t.sim.busAt(t.id('G1'), 'L1');
  ok(b2.gens.length === 2 && b2.loading < 0.7, `due gruppi in parallelo: carico ${(b2.loading * 100).toFixed(0)} %`);
  ok(t.events().some((e) => e.includes('avviamento automatico')), 'evento di avviamento automatico emesso');
}

// ───────────────────────────────────────────────────────────────────────────────────
section('7. Modello “Centrale elettrica di bordo” e verifiche di centrale');
{
  const t = rig(nave());
  ok(t.p.sources().length === 2 && !t.p.supply(), 'il modello ha due gruppi e nessun arrivo linea');
  const sy = t.p.system();
  ok(sy.kind === 'genset' && sy.Vll === 440 && sy.f === 60 && sy.earth === 'IT', `sistema del progetto: ${sy.Vph}/${sy.Vll} V ${sy.f} Hz ${sy.earth}`);
  const res = t.checks();
  const errs = res.filter((r) => r.level === 'error');
  ok(!errs.length, 'nessuna non conformità', errs.map((e) => e.title).join(' | '));
  ok(res.some((r) => r.id === 'gen-cap' && r.level === 'ok'), 'verifica potenza installata / generatori superata');
  ok(res.some((r) => r.id === 'gen-n1' && r.level === 'ok'), 'riserva n−1 verificata');
  ok(res.some((r) => r.id === 'it-imd' && r.level === 'ok'), 'controllo isolamento presente');
  t.sim.setPower(true);
  t.run(3);
  ok(t.sim.powerState().on && t.V('E1:L', 'E1:N') > 240 && t.inst('M1').state.mode === 'run', 'centrale avviata: luci accese ed elica in marcia');
  ok(!t.inst('KI1').state.alarm && t.inst('KI1').state.Riso > 50e3, 'controllo isolamento a riposo');
  // senza controllo isolamento → non conformità
  const data2 = nave();
  data2.components = data2.components.filter((c) => c.tag !== 'KI1');
  const ids = new Set(data2.components.map((c) => c.id));
  data2.wires = data2.wires.filter((w) => ids.has(w.a.c) && ids.has(w.b.c));
  const t2 = rig(data2);
  ok(t2.checks().some((r) => r.id === 'it-imd' && r.level === 'error'), 'senza dispositivo di controllo isolamento la verifica segnala l’errore');
  // progetto vecchio senza sorgente: riceve l'arrivo linea
  const old = { app: 'x', version: 1, meta: { title: 'vecchio' }, components: [{ id: 'PE', type: 'pebar', tag: 'PE', mount: { kind: 'fixed', at: 'pebar' }, params: {}, note: '' }], wires: [] };
  const po = new Project(old);
  ok(po.supply() && po.sources().length === 1, 'un progetto senza sorgenti riceve l’arrivo linea di default');
  const bp = new Project(blankProject({ sys: '3F', source: 'none' }));
  ok(!bp.supply() && bp.sources().length === 0 && bp.components.some((c) => c.type === 'pebar'), 'progetto vuoto senza sorgente: solo il collettore di terra');
}

console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
