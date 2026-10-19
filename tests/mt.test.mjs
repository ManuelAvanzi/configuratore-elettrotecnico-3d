// Collaudo del modulo media tensione (modulo B): sistemi MT, consegna a 20 kV, celle MT con interblocchi e relè
// 50/51/51N, trasformatore MT/BT (Dyn11, vcc, corrente di inserzione), interruttore scatolato L-S-I, cavi in
// parallelo, selettività MT/BT, verifiche della cabina (CEI 0-16, ABB QT2) e quadro MT di bordo a 6,6 kV.
// Esecuzione: npm run test:mt
import { Project } from '../src/core/project.js';
import { Simulator } from '../src/sim/engine.js';
import { DEFS } from '../src/catalog/defs/index.js';
import { runChecks, CHECK_GROUPS } from '../src/sim/checks.js';
import { SYSTEMS, BT_SYSTEMS, MT_SYSTEMS, wireIz, iz } from '../src/sim/norms.js';
import { build } from '../src/presets/builder.js';
import { cabina, naveMT, PRESETS } from '../src/presets/index.js';
import { mtxRated } from '../src/catalog/defs/mt.js';
import { gensetRated } from '../src/catalog/defs/nautico.js';

let pass = 0;
let fail = 0;
const ok = (c, m, x = '') => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? '✓' : '✗'} ${m}${!c && x ? '  → ' + x : ''}`);
};
const section = (t) => console.log('\n' + t);
const r0 = (v) => Math.round(v);

/** Progetto + simulatore con aiuti (come in nautico.test.mjs) */
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
    st: (tag) => sim.getInst(id(tag)).state,
    act: (tag, action) => sim.interact(id(tag), action),
    set: (tag, key, value) => p.setParam(id(tag), key, value),
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
    errors: () => runChecks(p, sim).filter((r) => r.level === 'error'),
  };
}

/** Rimuove dal progetto i componenti con le sigle indicate (e i loro cavi) */
function drop(data, tags) {
  const ids = new Set(data.components.filter((c) => tags.includes(c.tag)).map((c) => c.id));
  data.components = data.components.filter((c) => !ids.has(c.id));
  data.wires = data.wires.filter((w) => !ids.has(w.a.c) && !ids.has(w.b.c));
  return data;
}

// ───────────────────────────────────────────────────────────────────────────────────
section('1. Sistemi MT e dati nominali del trasformatore');
{
  ok(SYSTEMS.mt20.Vll === 20000 && SYSTEMS.mt20.mt === true && SYSTEMS.mt66.Vll === 6600 && SYSTEMS.mt66.f === 60, 'sistemi 20 kV 50 Hz e 6,6 kV 60 Hz marcati come media tensione');
  ok(BT_SYSTEMS.every((s) => !s.mt) && MT_SYSTEMS.every((s) => s.mt) && BT_SYSTEMS.length === 3 && MT_SYSTEMS.length === 3, 'tre sistemi BT e tre sistemi MT');
  ok(DEFS.supply.params.find((p) => p.key === 'net').options.length === 3 && DEFS.genset.params.find((p) => p.key === 'net').options.length === 6, 'l’arrivo linea offre solo la BT, il gruppo elettrogeno anche la MT');
  const r = mtxRated({ Sn: 400, V1: 'mt20', V2: 'it230', vcc: 6, gruppo: 'Dyn11' }, 12.5);
  ok(r0(r.In1 * 10) === 115 && r0(r.In2) === 577, `400 kVA 20 kV/400 V: In1 ${r.In1.toFixed(1)} A, In2 ${r.In2.toFixed(0)} A`);
  ok(r0(r.Icc2inf) === 9623 && r0(r.Icc2) === 9477, `Icc al secondario ${r0(r.Icc2inf)} A (rete infinita) → ${r0(r.Icc2)} A con 12,5 kA a 20 kV`);
  ok(r0(r.Icc2ref) === 190 && r0(r.inrush) === 115, `riportata al primario ${r0(r.Icc2ref)} A; corrente di inserzione ${r0(r.inrush)} A (10 × In1)`);
  ok(Math.abs(r.n - 86.96) < 0.01 && r.delta, `rapporto spire del Dyn11 n = Vll1/Vph2 = ${r.n.toFixed(2)}`);
  const y = mtxRated({ Sn: 400, V1: 'mt20', V2: 'it230', vcc: 6, gruppo: 'Yyn0' });
  ok(!y.delta && Math.abs(y.n - 50.2) < 0.1, `Yyn0: primario a stella, n = ${y.n.toFixed(1)}`);
  ok(iz(240, 3) === 346 && wireIz({ section: 240, n: 2 }, 3) === 692 && wireIz({ section: 25 }, 3) === 89, 'portate: 240 mm² = 346 A, 2 × 240 = 692 A, un cavo senza “n” vale 1');
  ok(CHECK_GROUPS.some((g) => g.id === 'mt'), 'gruppo di verifiche “Media tensione” presente');
  ok(PRESETS.some((x) => x.id === 'cabina') && PRESETS.some((x) => x.id === 'nave-mt'), 'modelli predefiniti “cabina” e “nave-mt” presenti');
}

// ───────────────────────────────────────────────────────────────────────────────────
section('2. Cabina MT/BT: sistema del progetto, consegna, inserzione del trasformatore, quadro BT');
{
  const t = rig(cabina());
  const sy = t.p.system();
  ok(sy.kind === 'mtin' && sy.sys === '3F' && sy.Vll === 400 && sy.earth === 'TN-S' && sy.mtSys.Vll === 20000, `sistema: utenze a ${sy.Vph}/${sy.Vll} V ${sy.earth}, consegna a ${sy.mtSys.Vll / 1000} kV`);
  ok(t.sim.env.sys.Vph === 230 && t.sim.env.sys.mtSys.id === 'mt20', 'il simulatore lavora a 230 V per le utenze e conosce il sistema MT a monte');
  const ps0 = t.sim.powerState();
  ok(ps0.kind === 'mtin' && !ps0.on && ps0.label.includes('fuori tensione'), `stato iniziale: ${ps0.label}`);
  ok(t.st('QM1').sez && t.st('QM1').int && !t.st('QM1').terra, 'le celle partono in servizio (sezionatore e interruttore chiusi)');
  ok(t.V('XM:L1', 'XM:L2') < 1 && !t.st('T1').live, 'consegna fuori tensione: niente tensione in cabina');
  t.sim.setPower(true);
  t.run(0.1);
  ok(t.V('XM:L1', 'XM:L2') > 19000, `consegna in tensione: ${(t.V('XM:L1', 'XM:L2') / 1000).toFixed(1)} kV tra le fasi (inserzione e spunto dei motori in corso)`);
  ok(t.st('T1').live && t.st('T1').inrush && t.events().some((e) => e.includes('inserzione')), 'inserzione del trasformatore: corrente di magnetizzazione segnalata');
  ok(t.st('QM2').Imax > 100 && t.st('QM2').Imax < 130, `la cella del trasformatore vede ≈ 10 × In1 (${t.st('QM2').Imax.toFixed(0)} A) all’inserzione`);
  t.run(0.3);
  ok(!t.st('T1').inrush && t.st('QM2').Imax < 30, `dopo un decimo di secondo l’inserzione finisce (${t.st('QM2').Imax.toFixed(1)} A al primario con i motori allo spunto)`);
  ok(!t.st('QM1').tripped && !t.st('QM2').tripped, 'nessuna cella è scattata (I>> sopra l’inserzione)');
  t.run(2);
  const v2 = t.st('T1').V2;
  ok(v2 > 390 && v2 < 405, `tensione al secondario ${v2.toFixed(0)} V`);
  ok(t.V('E1:L', 'E1:N') > 225 && t.inst('E1').view.bright > 0.5, `lampada accesa a ${t.V('E1:L', 'E1:N').toFixed(0)} V`);
  ok(t.st('M1').mode === 'run' && t.st('M2').mode === 'run', 'motori in marcia');
  ok(t.st('QG').on && t.st('QG').I > 40 && t.st('QG').I < 80, `generale BT: ${t.st('QG').I.toFixed(0)} A per fase`);
  ok(t.st('T1').loading > 0.05 && t.st('T1').loading < 0.2, `carico del trasformatore ${(t.st('T1').loading * 100).toFixed(0)} %`);
  ok(Math.abs(t.st('T1').I1 * Math.sqrt(3) * 20000 - t.st('T1').S) < 1, 'corrente al primario coerente con la potenza');
  const ps = t.sim.powerState();
  ok(ps.on && ps.kind === 'mtin' && ps.V > 11000 && ps.P > 20000, `stato: ${ps.label}, ${(ps.V / 1000).toFixed(1)} kV, ${(ps.P / 1000).toFixed(1)} kW`);
  ok(t.st('QM1').vpisLine && t.st('QM1').vpisCable && t.st('QM2').vpisCable, 'indicatori di presenza tensione accesi su linea e cavo');
  t.sim.setPower(false);
  t.run(0.1);
  ok(!t.st('T1').live && !t.st('QM2').vpisCable && t.V('E1:L', 'E1:N') < 1, 'consegna fuori tensione: cabina e quadro BT spenti, VPIS spenti');
}

// ───────────────────────────────────────────────────────────────────────────────────
section('3. Cella MT: interblocchi delle manovre (CEI 11-27) e messa a terra');
{
  const t = rig(cabina());
  t.sim.setPower(true);
  t.run(0.5);
  let r = t.act('QM2', 'terra');
  ok(r?.level === 'error' && !t.st('QM2').terra, 'in servizio: il sezionatore di terra non si chiude (interblocco)');
  r = t.act('QM2', 'sez');
  ok(r?.level === 'error' && t.st('QM2').sez, 'con l’interruttore chiuso il sezionatore di linea non si apre (aprirebbe sotto carico)');
  r = t.act('QM2', 'int');
  ok(!t.st('QM2').int && !r?.level, 'interruttore aperto');
  t.run(0.1);
  ok(!t.st('T1').live && t.st('QM2').vpisLine && !t.st('QM2').vpisCable, 'trasformatore fuori tensione: VPIS di linea acceso, VPIS lato cavo spento');
  r = t.act('QM2', 'sez');
  ok(!t.st('QM2').sez, 'sezionatore di linea aperto (regola 1)');
  r = t.act('QM2', 'terra');
  ok(t.st('QM2').terra && r?.msg.includes('regola 4'), 'sezionatore di terra chiuso: lato cavo a terra (regola 4)');
  r = t.act('QM2', 'sez');
  ok(r?.level === 'error' && !t.st('QM2').sez, 'con la terra chiusa il sezionatore di linea non si richiude');
  r = t.act('QM2', 'int');
  ok(r?.level && !t.st('QM2').int, 'con la terra chiusa l’interruttore non si chiude');
  t.act('QM2', 'terra');
  t.act('QM2', 'sez');
  r = t.act('QM2', 'int');
  t.run(0.5);
  ok(!t.st('QM2').terra && t.st('QM2').sez && t.st('QM2').int && t.st('T1').live, 'rimessa in servizio: terra aperta → sezionatore → interruttore, trasformatore di nuovo in tensione');
  ok(t.st('QM2').ops >= 2, `manovre dell’interruttore contate (${t.st('QM2').ops})`);
  // terra rifiutata se il lato cavo è in tensione (alimentazione dal lato utenza)
  const d = cabina();
  const t2 = rig(d);
  t2.sim.setPower(true);
  t2.run(0.3);
  t2.act('QM1', 'int');
  t2.act('QM1', 'sez');
  // la cella QM1 ora è sezionata ma QM2 e il trasformatore sono a valle senza tensione: terra ammessa
  ok(!t2.st('QM1').int && !t2.st('QM1').sez && t2.act('QM1', 'terra')?.sound, 'DG sezionato con il lato cavo senza tensione: messa a terra ammessa');
  ok(t2.st('QM1').terra, 'DG a terra');
}

// ───────────────────────────────────────────────────────────────────────────────────
section('4. Relè di protezione: 50 all’inserzione, 51 a tempo, ripristino');
{
  const t = rig(cabina());
  t.set('QM2', 'I2', 60); // sotto la corrente di inserzione (115 A)
  t.sim.setPower(true);
  t.run(0.3);
  ok(t.st('QM2').tripped && t.st('QM2').cause.startsWith('50') && !t.st('QM2').int, `I>> = 60 A: la cella scatta all’inserzione (${t.st('QM2').cause})`, t.events().slice(-1).join(''));
  ok(!t.st('T1').live && !t.st('QM1').tripped, 'trasformatore fuori tensione, il DG non è intervenuto (selettività tra le celle)');
  let r = t.act('QM2', 'int');
  ok(r?.level === 'error' && !t.st('QM2').int, 'con il relè scattato l’interruttore non si richiude');
  t.set('QM2', 'I2', 250);
  r = t.act('QM2', 'resetTrip');
  ok(!t.st('QM2').tripped && r?.sound, 'relè ripristinato');
  t.act('QM2', 'int');
  t.run(0.5);
  ok(t.st('QM2').int && !t.st('QM2').tripped && t.st('T1').live, 'con I>> = 250 A il trasformatore si inserisce senza intervento');
  // 51 a tempo: soglia abbassata sotto la corrente di carico
  t.run(2);
  const Iload = t.st('QM2').Imax;
  t.set('QM2', 'I1', 0.5);
  t.set('QM2', 't1', 0.3);
  t.run(0.2);
  ok(t.st('QM2').int && t.st('QM2').t1 > 0.1, `I> = 0,5 A sotto la corrente di carico (${Iload.toFixed(2)} A): il tempo della 51 sta scorrendo`);
  t.run(0.2);
  ok(t.st('QM2').tripped && t.st('QM2').cause.startsWith('51'), `dopo t> = 0,3 s la 51 interviene (${t.st('QM2').cause})`);
  ok(t.events().some((e) => e.includes('intervento 51')), 'evento di intervento emesso');
}

// ───────────────────────────────────────────────────────────────────────────────────
section('5. Interruttore scatolato L-S-I e selettività con la cella MT');
{
  // quadro minimo: consegna → DG → cella → T1 → QG → presa diretta (senza partenza) per provare la S del generale
  const mk = (t1 = 0.3) => build({ sys: '3F', source: 'none', title: 'Selettività MT/BT' }, (b) => {
    b.add('XM', 'mtin', 'A1', { net: 'mt20', Icc: 12.5, Ig: 50, bt: 'it230', Re: 2 });
    b.add('QM2', 'mtcb', 'A2', { ruolo: 'tr', In: 50, Icu: 16, I1: 15, t1, I2: 250, t2: 0.05, Io: 2, to: 0.17 });
    b.add('T1', 'mtx', 'A3', { Sn: 400, V1: 'mt20', V2: 'it230', vcc: 6, gruppo: 'Dyn11', earthBT: 'TN' });
    b.add('QG', 'mccb', 'R1:0', { In: 630, Ir: 0.95, Isd: 6, tsd: 0.1, Ii: 0, Icu: 36 });
    b.add('XS1', 'xs', 'B1', { carico: 'heater', tipo: 'sch' });
    b.wire('XM:L1', 'QM2:1', 50);
    b.wire('XM:L2', 'QM2:3', 50);
    b.wire('XM:L3', 'QM2:5', 50);
    b.wire('QM2:2', 'T1:1', 50);
    b.wire('QM2:4', 'T1:3', 50);
    b.wire('QM2:6', 'T1:5', 50);
    b.wire('XM:PE', 'PE:PE1', 50);
    b.wire('QM2:PE', 'PE:PE2', 50);
    b.wire('T1:PE', 'PE:PE3', 50);
    b.wire('T1:2', 'QG:1', 240, 'brown', 2);
    b.wire('T1:4', 'QG:3', 240, 'black', 2);
    b.wire('T1:6', 'QG:5', 240, 'grey', 2);
    b.wire('T1:N', 'QG:N1', 240, 'blue', 2);
    b.wire('QG:2', 'XS1:L', 240, 'brown', 2);
    b.wire('QG:N2', 'XS1:N', 240, 'blue', 2);
    b.wire('XS1:PE', 'PE:PE4', 16);
  });
  const t = rig(mk());
  t.sim.setPower(true);
  t.run(1);
  ok(t.st('QG').on && t.V('XS1:L', 'XS1:N') > 225, 'quadro minimo alimentato');
  const Ir = 0.95 * 630;
  ok(DEFS.mccb.protection(t.p.params(t.id('QG'))).In === Ir, `Ir = ${Ir.toFixed(0)} A è la corrente nominale per le verifiche`);
  t.set('XS1', 'carico', 'short');
  t.run(0.05);
  const Isc = t.st('QG').I;
  ok(Isc > 4000 && Isc < 9500 && t.st('QG').on, `cortocircuito a valle del generale: ${(Isc / 1000).toFixed(2)} kA (sopra Isd = ${(6 * Ir).toFixed(0)} A), la S ritardata non è ancora intervenuta`);
  t.run(0.15);
  ok(t.st('QG').tripped && t.st('QG').cause.includes('(S)'), `dopo tsd = 0,1 s interviene la funzione S del generale (${t.st('QG').cause})`, t.events().slice(-1).join(''));
  ok(!t.st('QM2').tripped && t.st('QM2').int, 'la cella MT non è intervenuta: selettività cronometrica (t> = 0,3 s > tsd + margine)');
  // con t> troppo breve la cella MT scatta insieme al generale: non selettivo
  const t2 = rig(mk(0.05));
  t2.sim.setPower(true);
  t2.run(1);
  t2.set('XS1', 'carico', 'short');
  t2.run(0.25);
  ok(t2.st('QM2').tripped && t2.st('QM2').cause.startsWith('51'), 't> = 0,05 s: la cella MT scatta per un guasto in BT (non selettiva)');
  ok(t2.checks().some((r) => r.id.startsWith('mt-sel-') && r.level === 'warn'), 'la verifica “Selettività MT/BT” lo segnala');
  // scatolato: lungo ritardo (L) e istantaneo (I)
  const t3 = rig(mk());
  t3.set('QG', 'Ir', 0.4); // 252 A
  t3.set('QG', 'Ii', 4); // 2520 A
  t3.sim.setPower(true);
  t3.run(0.5);
  t3.set('XS1', 'carico', 'short');
  t3.run(0.05);
  ok(t3.st('QG').tripped && t3.st('QG').cause.includes('(I)'), `con Ii = 4 × In il generale interviene istantaneamente (${t3.st('QG').cause})`);
  t3.set('XS1', 'carico', 'heater');
  t3.act('QG', 'toggle');
  ok(t3.st('QG').on && !t3.st('QG').tripped, 'rimosso il guasto, il generale si richiude');
  const t4 = rig(mk());
  t4.sim.setPower(true);
  t4.run(0.3);
  const q4 = t4.inst('QG');
  q4.state.theta = 0.999; // bimetallo elettronico “caldo”: basta un filo di sovraccarico
  t4.set('QG', 'Ir', 0.4);
  t4.inst('QG').state.I = 400;
  DEFS.mccb.tick(q4, t4.sim.ctxFor(q4), 0.5);
  ok(q4.state.tripped && q4.state.cause.includes('(L)'), `sovraccarico prolungato: funzione L (${q4.state.cause})`);
  const toggled = DEFS.mccb.interact.toggle(q4);
  ok(toggled?.level === 'warn' && !q4.state.on, 'da caldo non si richiude subito');
}

// ───────────────────────────────────────────────────────────────────────────────────
section('6. Verifiche della cabina (CEI 0-16, ABB QT2) e cavi in parallelo');
{
  const t = rig(cabina());
  const res = t.checks();
  const errs = res.filter((r) => r.level === 'error');
  ok(!errs.length, 'modello “cabina”: nessuna non conformità', errs.map((e) => e.title).join(' | '));
  for (const id of ['mt-icu-', 'mt-51n-', 'mt-tr-', 'mt-prot-', 'mt-qg-', 'mt-sel-']) ok(res.some((r) => r.id.startsWith(id) && r.level === 'ok'), `verifica ${id} superata`);
  ok(res.some((r) => r.id === 'mt-dg' && r.level === 'ok') && res.some((r) => r.id === 'mt-earth' && r.level === 'ok'), 'DG con regolazioni standard e tensione totale di terra entro il limite');
  ok(res.some((r) => r.id.startsWith('mt-icc2-') && r.detail.includes('9,48 kA')), 'Icc al secondario riportata nelle verifiche (9,48 kA)');
  ok(res.filter((r) => r.id.startsWith('pdi-')).every((r) => r.level !== 'error') && res.some((r) => r.id.startsWith('coord-') && r.level === 'ok' && r.detail.includes('2×240')), 'potere di interruzione BT confrontato con la Icc del trasformatore; coordinamento del generale con 2 × 240 mm²');
  ok(res.every((r) => !r.id.startsWith('coord-') || !r.title.startsWith('QM')), 'le celle MT non entrano nel coordinamento Ib ≤ In ≤ Iz della BT');
  ok(res.some((r) => r.group === 'mt'), 'le verifiche sono nel gruppo “Media tensione”');
  // regolazioni sbagliate
  t.set('QM2', 'I2', 60);
  ok(t.checks().some((r) => r.id.startsWith('mt-prot-') && r.level === 'error' && r.detail.includes('inserzione')), 'I>> sotto l’inserzione: errore');
  t.set('QM2', 'I2', 250);
  t.set('QM2', 't1', 0.1);
  ok(t.checks().some((r) => r.id.startsWith('mt-sel-') && r.level === 'warn' && r.detail.includes('Cronometrica NON')), 't> troppo breve: selettività cronometrica non garantita');
  t.set('QM2', 't1', 0.3);
  t.set('QM2', 'I2', 150);
  ok(t.checks().some((r) => r.id.startsWith('mt-sel-') && r.level === 'warn' && r.detail.includes('Amperometrica NON')), 'I>> sotto il cortocircuito BT riportato al primario: selettività amperometrica non garantita');
  t.set('QM2', 'I2', 250);
  t.set('QM2', 'Io', 40);
  ok(t.checks().some((r) => r.id === 'mt-51n-' + t.id('QM2') && r.level === 'error'), 'Io> troppo alta rispetto a Ig: errore 51N');
  t.set('QM2', 'Io', 2);
  t.set('XM', 'Icc', 16);
  t.set('QM1', 'Icu', 12.5);
  ok(t.checks().some((r) => r.id === 'mt-icu-' + t.id('QM1') && r.level === 'error'), 'Icu 12,5 kA con Icc 16 kA: errore');
  t.set('XM', 'Icc', 12.5);
  t.set('QM1', 'Icu', 16);
  t.set('XM', 'Re', 10);
  ok(t.checks().some((r) => r.id === 'mt-earth' && r.level === 'error'), 'Re · Ig = 500 V: tensione totale di terra oltre il limite');
  t.set('XM', 'Re', 2);
  t.set('QM1', 'ruolo', 'arr');
  ok(t.checks().some((r) => r.id === 'mt-dg' && r.level === 'error'), 'senza DG la CEI 0-16 non è rispettata');
  t.set('QM1', 'ruolo', 'dg');
  t.set('QM1', 'I2', 1000);
  ok(t.checks().some((r) => r.id === 'mt-dg' && r.level === 'warn'), 'DG con regolazioni fuori standard: avviso');
  t.set('QM1', 'I2', 600);
  t.set('QG', 'In', 400);
  ok(t.checks().some((r) => r.id.startsWith('mt-qg-') && r.level === 'error'), 'generale BT da 400 A sotto In2 = 577 A: errore');
  t.set('QG', 'In', 630);
  t.set('T1', 'Sn', 100);
  ok(t.checks().some((r) => r.id.startsWith('mt-tr-') && r.level === 'ok' && r.detail.includes('100 kVA')), 'trasformatore da 100 kVA con 39 kVA di utenze: ancora adeguato (39 %)');
  ok(t.checks().some((r) => r.id.startsWith('mt-qg-') && r.level === 'warn'), 'ma il generale da 598 A è ora troppo grande per In2 = 144 A: avviso');
  t.set('T1', 'Sn', 400);
  // secondario con un solo conduttore da 240: il generale non protegge il cavo
  const d = cabina();
  for (const w of d.wires) if (w.n === 2) delete w.n;
  const t2 = rig(d);
  ok(t2.checks().some((r) => r.id === 'coord-' + t2.id('QG') && r.level === 'error'), 'con un solo 240 mm² per fase (346 A) il generale da 598 A non protegge la sbarra BT');
  // trasformatore collegato direttamente alla consegna, senza celle: nessuna protezione MT
  const d2 = drop(cabina(), ['QM1', 'QM2']);
  const t3 = rig(d2);
  for (const [a, b] of [['L1', '1'], ['L2', '3'], ['L3', '5']]) t3.p.addWire({ c: t3.id('XM'), t: a }, { c: t3.id('T1'), t: b }, { section: 50 });
  ok(t3.checks().some((r) => r.id.startsWith('mt-prot-') && r.level === 'error') && t3.checks().some((r) => r.id === 'mt-dg' && r.level === 'error'), 'trasformatore collegato senza cella MT a monte: errore (e manca il DG)');
  // resistenza dei cavi in parallelo dimezzata
  const t4 = rig(cabina());
  const w2 = t4.p.wires.find((w) => w.n === 2);
  const R2 = t4.sim.net.byKey.get('wire/' + w2.id).R;
  t4.p.setWire(w2.id, { n: undefined });
  t4.sim.settle();
  const R1 = t4.sim.net.byKey.get('wire/' + w2.id).R;
  ok(Math.abs(R1 / R2 - 2) < 0.01, 'due conduttori in parallelo: resistenza dimezzata nel simulatore');
}

// ───────────────────────────────────────────────────────────────────────────────────
section('7. Quadro MT di bordo a 6,6 kV: gruppi MT, sbarra in isola, trasformatore di servizio in IT');
{
  const t = rig(naveMT());
  const sy = t.p.system();
  ok(sy.kind === 'genset' && sy.Vll === 440 && sy.f === 60 && sy.mtSys.Vll === 6600, `sistema: gruppi a ${sy.mtSys.Vll / 1000} kV, utenze a ${sy.Vll} V ${sy.f} Hz`);
  const g = gensetRated(t.p.params(t.id('G1')));
  ok(r0(g.In) === 175 && g.Icc > 1100 && g.Icc < 1250 && g.sys.mt, `gruppo da 2 MVA a 6,6 kV: In ${g.In.toFixed(0)} A, Icc ${g.Icc.toFixed(0)} A (${(g.Icc / g.In).toFixed(1)} × In)`);
  const errs = t.errors();
  ok(!errs.length, 'modello “nave-mt”: nessuna non conformità', errs.map((e) => e.title).join(' | '));
  t.sim.setPower(true);
  t.run(3);
  ok(t.st('G1').closed && t.st('G2').closed && !t.st('G1').trip && !t.st('G2').trip, 'i due gruppi sono in parallelo sulla sbarra MT');
  ok(t.V('G1:L1', 'G1:L2') > 6400 && t.V('G1:L1', 'G1:L2') < 6700, `sbarra MT a ${(t.V('G1:L1', 'G1:L2') / 1000).toFixed(2)} kV`);
  ok(t.st('T1').live && t.st('T1').V2 > 420 && t.st('T1').V2 < 445, `secondario del trasformatore di servizio a ${t.st('T1').V2.toFixed(0)} V`);
  ok(t.st('M1').mode === 'run' && t.st('M2').mode === 'run' && t.inst('E1').view.bright > 0.5, 'pompa, elica di manovra e luci in servizio');
  const bus = t.sim.busAt(t.id('G1'), 'L1');
  ok(bus && bus.gens.length === 2 && bus.loading > 0.01 && bus.loading < 0.1, `sbarra MT: due gruppi, carico ${(bus.loading * 100).toFixed(1)} %`);
  ok(Math.abs(t.st('G1').P - t.st('G2').P) / Math.max(1, t.st('G1').P) < 0.05, 'carico ripartito tra i due gruppi');
  const ki = t.st('KI1');
  ok(ki.powered && !ki.na && ki.Riso > 150e3 && !ki.alarm, `controllo isolamento sulla rete BT isolata dal trasformatore: ${(ki.Riso / 1000).toFixed(0)} kΩ`);
  ok(t.sim.powerState().kind === 'genset' && t.sim.powerState().label.includes('2 gruppi'), `stato: ${t.sim.powerState().label}`);
  const res = t.checks();
  ok(res.some((r) => r.id.startsWith('mt-gen-') && r.level === 'ok') && res.filter((r) => r.id.startsWith('mt-gen-')).length === 2, 'celle di generatore verificate');
  ok(res.some((r) => r.id.startsWith('mt-sel-') && r.level === 'ok') && res.some((r) => r.id === 'it-imd' && r.level === 'ok'), 'selettività MT/BT e controllo isolamento in IT verificati');
  ok(res.some((r) => r.id.startsWith('reg-pdi-') && r.level === 'ok' && r.detail.includes('trasformatore di servizio')), 'Icu dei BT confrontato con il cortocircuito al secondario del trasformatore di servizio');
  // guasto a terra in BT: primo guasto senza intervento (IT a valle del trasformatore)
  t.set('XS1', 'guasto', 'franco');
  t.run(0.3);
  ok(t.st('KI1').alarm && !t.st('Q3').tripped && t.st('M1').mode === 'run', 'primo guasto a terra sulla cucina: allarme isolamento, nessun intervento, nave in servizio');
  t.set('XS1', 'guasto', 'none');
  // avaria di G1: G2 regge tutto
  t.act('G1', 'genStop');
  t.run(1);
  ok(t.st('G2').closed && t.st('T1').live && t.st('M2').mode === 'run', 'con G1 fermo G2 alimenta da solo tutta la nave');
  // cella del trasformatore a terra: quadro BT spento
  t.act('QM3', 'int');
  t.act('QM3', 'sez');
  const r = t.act('QM3', 'terra');
  t.run(0.3);
  ok(r?.sound && t.st('QM3').terra && !t.st('T1').live && t.V('E1:L', 'E1:N') < 1, 'QM3 a terra: trasformatore di servizio fuori tensione, quadro BT spento');
  // cella di generatore con soglia 50 irraggiungibile
  t.set('QM1', 'I2', 1500);
  ok(t.checks().some((r) => r.id === 'mt-gen-' + t.id('QM1') && r.level === 'error'), 'I>> sopra il contributo del gruppo: errore (in isola i guasti sono piccoli)');
}

console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
