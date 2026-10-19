// Verifiche tecniche automatiche del progetto (analisi topologica + valori misurati in simulazione).
// Ogni verifica restituisce { id, group, level: 'ok'|'warn'|'error'|'info', title, detail, comps[], wires[] }.
import { DEFS } from '../catalog/defs/index.js';
import { resolveParams } from '../catalog/defs/common.js';
import { wireIz, sectionLabel, UL, DEFAULT_SYS, fmt, fmtA, fmtW } from './norms.js';
import { cabs, csub } from './complex.js';
import { gensetRated } from '../catalog/defs/nautico.js';
import { mtxRated } from '../catalog/defs/mt.js';
import { runMTChecks } from './mtchecks.js';

const key = (r) => r.c + '.' + r.t;

function buildGraph(project) {
  const adj = new Map();
  const info = new Map();
  const add = (a, b, e) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push({ to: b, ...e });
    adj.get(b).push({ to: a, ...e });
  };
  const comps = project.components.map((c) => {
    const def = DEFS[c.type];
    const p = resolveParams(def, c.params);
    const terms = def.terminals(p);
    for (const t of terms) {
      info.set(c.id + '.' + t.id, { comp: c, def, term: t });
      if (!adj.has(c.id + '.' + t.id)) adj.set(c.id + '.' + t.id, []);
    }
    return { c, def, p, terms, prot: def.protection?.(p) || null, load: def.load?.(p) || null };
  });
  for (const x of comps) for (const [a, b] of x.def.paths?.(x.p) || []) add(x.c.id + '.' + a, x.c.id + '.' + b, { kind: 'path', comp: x.c.id });
  for (const w of project.wires) add(key(w.a), key(w.b), { kind: 'wire', id: w.id, w });
  return { adj, info, comps, byId: new Map(comps.map((x) => [x.c.id, x])) };
}

function bfs(g, starts, allow) {
  const seen = new Set(starts);
  const parent = new Map();
  const q = [...starts];
  while (q.length) {
    const n = q.shift();
    for (const e of g.adj.get(n) || []) {
      if (seen.has(e.to)) continue;
      if (allow && !allow(e, n)) continue;
      seen.add(e.to);
      parent.set(e.to, { from: n, e });
      q.push(e.to);
    }
  }
  return { seen, parent };
}

/** Componenti attraversati lungo il percorso più breve dal morsetto di partenza a una sorgente */
function upstreamChain(g, startNode, sourceIds) {
  const { seen, parent } = bfs(g, [startNode]);
  let target = null;
  for (const n of seen) {
    const inf = g.info.get(n);
    if (inf && sourceIds.has(inf.comp.id) && inf.term.role === 'L') {
      target = n;
      break;
    }
  }
  if (!target) return null;
  const chain = [];
  let n = target;
  while (parent.has(n)) {
    const { from, e } = parent.get(n);
    if (e.kind === 'path' && !chain.includes(e.comp)) chain.push(e.comp);
    n = from;
  }
  return chain; // dal lato fornitura verso l'utenza
}

function loadCurrent(l, sys = DEFAULT_SYS) {
  if (!l || !l.P) return 0;
  if (l.phases === 3) return l.P / (Math.sqrt(3) * sys.Vll * (l.cos || 1));
  return l.P / (sys.Vph * (l.cos || 1));
}

/** Parametri “di fornitura” equivalenti quando la sorgente è una centrale di gruppi elettrogeni */
function gensetSupply(gensets) {
  let Icc = 0;
  let Sn = 0;
  let Re = Infinity;
  let earth = 'IT';
  for (const c of gensets) {
    const p = resolveParams(DEFS.genset, c.params);
    const r = gensetRated(p);
    Icc += r.Icc;
    Sn += r.Sn;
    Re = Math.min(Re, p.Re);
    earth = p.earth === 'TN' ? 'TN-S' : p.earth;
  }
  return { sys: '3F', earth, Icc: Icc / 1000, Re: Number.isFinite(Re) ? Re : 1, Pc: null, Sn };
}

/** Parametri “di fornitura” equivalenti con la consegna in media tensione (cabina MT/BT) */
function mtinSupply(mtins) {
  const p = resolveParams(DEFS.mtin, mtins[0].params);
  return { sys: '3F', earth: 'TN-S', Icc: p.Icc, Re: p.Re, Pc: null, Ig: p.Ig };
}

export const CHECK_GROUPS = [
  { id: 'sicurezza', label: 'Sicurezza delle persone' },
  { id: 'dimensionamento', label: 'Dimensionamento e coordinamento' },
  { id: 'conformita', label: 'Regola dell’arte' },
  { id: 'esercizio', label: 'Esercizio e carichi' },
  { id: 'nave', label: 'Impianto di bordo (registri navali)' },
  { id: 'mt', label: 'Media tensione (cabina MT/BT, CEI 0-16 e ABB QT2)' },
];

export function runChecks(project, sim) {
  const g = buildGraph(project);
  const out = [];
  const push = (r) => out.push({ comps: [], wires: [], ...r });
  const sources = project.components.filter((c) => DEFS[c.type]?.source);
  const sourceIds = new Set(sources.map((c) => c.id));
  const supplyComp = sources.find((c) => c.type === 'supply') || null;
  const gensets = sources.filter((c) => c.type === 'genset');
  const mtins = sources.filter((c) => c.type === 'mtin');
  const sp = supplyComp ? resolveParams(DEFS.supply, supplyComp.params) : mtins.length ? mtinSupply(mtins) : gensetSupply(gensets);
  const sys = sim?.env?.sys || DEFAULT_SYS;
  const tag = (id) => project.comp(id)?.tag || id;

  // media tensione a monte (consegna MT o generatori MT): le utenze BT vedono la Icc al secondario dei trasformatori
  // e il sistema di neutro deciso dal trasformatore; la Icc sulla sbarra MT resta per le verifiche delle celle
  const mtxs = g.comps.filter((x) => x.def.type === 'mtx' && project.wires.some((w) => w.a.c === x.c.id || w.b.c === x.c.id));
  const mtSource = mtins.length > 0 || gensets.some((c) => gensetRated(resolveParams(DEFS.genset, c.params)).sys.mt);
  const IccMT = mtSource ? sp.Icc : null;
  if (mtSource && mtxs.length) {
    sp.Icc = Math.max(...mtxs.map((x) => mtxRated(x.p, IccMT).Icc2)) / 1000;
    sp.earth = mtxs.some((x) => x.p.earthBT === 'IT') ? 'IT' : 'TN-S';
  }

  const loads = g.comps.filter((x) => x.load);
  const protections = g.comps.filter((x) => x.prot && !['isolator', 'generator', 'transformer'].includes(x.prot.kind) && !x.prot.mt);
  const mtcells = g.comps.filter((x) => x.prot?.kind === 'mtcb');
  const overcurrent = (x) => x.prot && x.prot.overcurrent && !x.prot.overloadOnly;

  // ── Collegamento alla sorgente ──────────────────────────────────────────────────
  if (!sources.length) {
    push({ id: 'supply', group: 'esercizio', level: 'warn', title: 'Impianto senza sorgente di energia', detail: 'Aggiungi un gruppo elettrogeno (pannello) o parti da un modello con l’arrivo linea.' });
  }
  for (const src of sources) {
    const wired = project.wires.some((w) => (w.a.c === src.id && w.a.t !== 'PE') || (w.b.c === src.id && w.b.t !== 'PE'));
    if (!wired) {
      push({ id: 'supply-' + src.id, group: 'esercizio', level: 'info', title: src.type === 'supply' ? 'Impianto non ancora collegato all’arrivo linea' : `${src.tag}: gruppo non collegato alla sbarra`, detail: src.type === 'supply' ? 'Collega i morsetti di uscita dell’arrivo linea (XA) all’interruttore generale.' : 'Collega L1, L2, L3 (e N) del gruppo all’interruttore generale del quadro e il PE al collettore di terra.', comps: [src.id] });
    }
  }

  // ── Colori dei conduttori ───────────────────────────────────────────────────────
  for (const w of project.wires) {
    if (w.fixed) continue;
    const ra = g.info.get(key(w.a))?.term.role;
    const rb = g.info.get(key(w.b))?.term.role;
    const roles = [ra, rb];
    const label = `${tag(w.a.c)}:${g.info.get(key(w.a))?.term.label} → ${tag(w.b.c)}:${g.info.get(key(w.b))?.term.label}`;
    if (roles.includes('PE') && w.color !== 'yg') {
      push({ id: 'col-pe-' + w.id, group: 'conformita', level: 'error', title: 'Conduttore di protezione non giallo-verde', detail: `Il cavo ${label} arriva a un morsetto di terra: deve essere giallo-verde.`, wires: [w.id] });
    } else if (w.color === 'yg' && roles.some((r) => r !== 'PE')) {
      push({ id: 'col-yg-' + w.id, group: 'conformita', level: 'error', title: 'Giallo-verde usato per un conduttore attivo', detail: `Il cavo ${label} è giallo-verde ma non collega due morsetti di terra: il giallo-verde è riservato al PE.`, wires: [w.id] });
    } else if (roles.includes('N') && w.color !== 'blue' && !roles.includes('L')) {
      push({ id: 'col-n-' + w.id, group: 'conformita', level: 'warn', title: 'Neutro non identificato col blu', detail: `Il cavo ${label} è collegato a un morsetto di neutro: usa il colore blu.`, wires: [w.id] });
    } else if (w.color === 'blue' && roles.includes('L') && !roles.includes('N')) {
      push({ id: 'col-b-' + w.id, group: 'conformita', level: 'warn', title: 'Blu usato per una fase', detail: `Il cavo ${label} collega morsetti di fase: il blu va riservato al neutro.`, wires: [w.id] });
    }
  }

  // ── Numero di conduttori per morsetto ───────────────────────────────────────────
  const count = new Map();
  for (const w of project.wires) for (const r of [w.a, w.b]) count.set(key(r), (count.get(key(r)) || 0) + 1);
  for (const [n, k] of count) {
    const inf = g.info.get(n);
    if (!inf || inf.def.type === 'pebar' || k <= 2) continue;
    push({ id: 'term-' + n, group: 'conformita', level: 'warn', title: 'Troppi conduttori sullo stesso morsetto', detail: `${inf.comp.tag}:${inf.term.label} ha ${k} conduttori: un morsetto a vite ne accetta al massimo 2. Usa una morsettiera o un ponticello a pettine.`, comps: [inf.comp.id] });
  }

  // ── Continuità del conduttore di protezione ─────────────────────────────────────
  const peBar = project.components.find((c) => c.type === 'pebar');
  const peNet = bfs(g, [peBar.id + '.IN']).seen;
  const peLive = [...peNet].map((n) => g.info.get(n)).filter((i) => i && i.term.role !== 'PE' && ['L', 'N'].includes(i.term.role));
  if (peLive.length) {
    push({ id: 'pe-live', group: 'sicurezza', level: 'error', title: 'Conduttore di protezione collegato a un conduttore attivo', detail: `La rete di terra arriva a ${peLive.map((i) => `${i.comp.tag}:${i.term.label}`).join(', ')}: il PE non deve mai toccare fase o neutro.`, comps: [...new Set(peLive.map((i) => i.comp.id))] });
  }
  for (const x of g.comps) {
    if (x.def.mount !== 'field') continue;
    const peT = x.terms.find((t) => t.role === 'PE');
    if (!peT) continue;
    const wired = project.wires.some((w) => key(w.a) === x.c.id + '.' + peT.id || key(w.b) === x.c.id + '.' + peT.id);
    if (!wired) {
      if (project.wires.some((w) => w.a.c === x.c.id || w.b.c === x.c.id)) {
        push({ id: 'pe-' + x.c.id, group: 'sicurezza', level: 'error', title: `${x.c.tag}: manca il collegamento a terra`, detail: `Il morsetto PE di ${x.def.short.toLowerCase()} ${x.c.tag} non è collegato: in caso di guasto la massa andrebbe in tensione.`, comps: [x.c.id] });
      }
    } else if (!peNet.has(x.c.id + '.' + peT.id)) {
      push({ id: 'pe-' + x.c.id, group: 'sicurezza', level: 'error', title: `${x.c.tag}: PE non collegato al collettore di terra`, detail: 'Il conduttore di protezione deve arrivare al collettore di terra del quadro.', comps: [x.c.id] });
    } else {
      push({ id: 'pe-' + x.c.id, group: 'sicurezza', level: 'ok', title: `${x.c.tag}: collegato a terra`, detail: 'Continuità del conduttore di protezione verificata.', comps: [x.c.id] });
    }
  }

  // ── Protezione delle utenze ─────────────────────────────────────────────────────
  const chains = new Map();
  for (const x of loads) {
    const lTerm = x.terms.find((t) => t.role === 'L');
    if (!lTerm) continue;
    const connected = project.wires.some((w) => w.a.c === x.c.id || w.b.c === x.c.id);
    if (!connected) continue;
    const chain = upstreamChain(g, x.c.id + '.' + lTerm.id, sourceIds);
    chains.set(x.c.id, chain);
    if (!chain) continue;
    const devs = chain.map((id) => g.byId.get(id)).filter(Boolean);
    const oc = devs.filter(overcurrent);
    if (!oc.length) {
      push({ id: 'oc-' + x.c.id, group: 'dimensionamento', level: 'error', title: `${x.c.tag}: utenza senza protezione da sovracorrente`, detail: 'Tra l’arrivo linea e l’utenza non c’è nessun interruttore magnetotermico: la linea non è protetta da sovraccarichi e cortocircuiti.', comps: [x.c.id] });
    }
    if (x.load.socket) {
      // Sezione minima dei conduttori delle prese (CEI 64-8 cap. 37, ambienti residenziali)
      const ocIn = oc.length ? oc[oc.length - 1].prot.In : 16;
      const minReq = ocIn > 10 ? 2.5 : 1.5;
      const own = project.wires.filter((w) => [w.a, w.b].some((r) => r.c === x.c.id && (r.t === 'L' || r.t === 'N')));
      const small = own.filter((w) => w.section < minReq);
      if (small.length) {
        push({ id: 'sez-' + x.c.id, group: 'dimensionamento', level: 'warn', title: `${x.c.tag}: sezione dei conduttori della presa`, detail: `Con una protezione da ${ocIn} A le prese vanno alimentate con conduttori da almeno ${fmt(minReq, 1)} mm² (CEI 64-8, cap. 37): qui ci sono cavi da ${fmt(Math.min(...small.map((w) => w.section)), 1)} mm².`, comps: [x.c.id], wires: small.map((w) => w.id) });
      }
      const rcds = devs.filter((d) => d.prot && (d.prot.kind === 'rcd' || d.prot.kind === 'rcbo'));
      const best = Math.min(...rcds.map((d) => d.prot.IDn), Infinity);
      if (!rcds.length && sp.earth === 'IT') {
        push({ id: 'rcd-' + x.c.id, group: 'sicurezza', level: 'info', title: `${x.c.tag}: presa in sistema IT senza differenziale`, detail: 'Con il neutro isolato il primo guasto a terra non è pericoloso ed è segnalato dal controllo dell’isolamento (IEC 60092 per le navi). A terra la CEI 64-8 chiede comunque un differenziale ≤ 30 mA sulle prese.', comps: [x.c.id] });
      } else if (!rcds.length) {
        push({ id: 'rcd-' + x.c.id, group: 'sicurezza', level: 'error', title: `${x.c.tag}: presa senza interruttore differenziale`, detail: 'Le prese a spina devono essere protette da un differenziale con IΔn ≤ 30 mA (protezione addizionale, CEI 64-8).', comps: [x.c.id] });
      } else if (best > 0.03) {
        push({ id: 'rcd-' + x.c.id, group: 'sicurezza', level: 'warn', title: `${x.c.tag}: differenziale non ad alta sensibilità`, detail: `A monte della presa c’è un differenziale da ${fmtA(best)}: per le prese serve IΔn ≤ 30 mA.`, comps: [x.c.id, ...rcds.map((d) => d.c.id)] });
      } else {
        push({ id: 'rcd-' + x.c.id, group: 'sicurezza', level: 'ok', title: `${x.c.tag}: protetta da differenziale 30 mA`, detail: `Differenziale a monte: ${rcds.map((d) => d.c.tag).join(', ')}.`, comps: [x.c.id] });
      }
    }
    if (x.load.motor) {
      const fr = devs.find((d) => d.prot?.overloadOnly);
      if (!fr) {
        push({ id: 'mot-' + x.c.id, group: 'dimensionamento', level: 'warn', title: `${x.c.tag}: motore senza relè termico`, detail: 'Un motore va protetto dal sovraccarico con un relè termico (o un salvamotore) regolato sulla sua corrente nominale.', comps: [x.c.id] });
      } else {
        const r = fr.prot.In / x.load.In;
        push({
          id: 'mot-' + x.c.id,
          group: 'dimensionamento',
          level: r >= 0.95 && r <= 1.2 ? 'ok' : 'warn',
          title: `${fr.c.tag}: regolazione del relè termico`,
          detail: `Ir = ${fmt(fr.prot.In, 2)} A, corrente di targa del motore ${fmt(x.load.In, 2)} A (${fmt(r * 100, 0)} %). ${r < 0.95 ? 'Regolazione troppo bassa: interventi intempestivi.' : r > 1.2 ? 'Regolazione troppo alta: il motore non è protetto dal sovraccarico.' : 'Regolazione corretta.'}`,
          comps: [fr.c.id, x.c.id],
        });
      }
    }
  }

  // ── Coordinamento Ib ≤ In ≤ Iz e potere di interruzione ─────────────────────────
  for (const x of protections) {
    const loadSide = x.terms.filter((t) => t.side === 'load').map((t) => x.c.id + '.' + t.id);
    const lineSide = x.terms.filter((t) => t.side === 'line').map((t) => x.c.id + '.' + t.id);
    const wiredOut = project.wires.some((w) => loadSide.includes(key(w.a)) || loadSide.includes(key(w.b)));
    const wiredIn = project.wires.some((w) => lineSide.includes(key(w.a)) || lineSide.includes(key(w.b)));
    if (!wiredOut && !wiredIn) continue;

    if (x.prot.pdi && x.prot.pdi < sp.Icc) {
      push({ id: 'pdi-' + x.c.id, group: 'dimensionamento', level: 'error', title: `${x.c.tag}: potere di interruzione insufficiente`, detail: `PdI = ${x.prot.pdi} kA ma la corrente di cortocircuito presunta è ${sp.Icc} kA: in caso di guasto l’interruttore potrebbe non interrompere la corrente.`, comps: [x.c.id] });
    }

    if (x.prot.kind === 'rcd' || x.prot.kind === 'rcbo') {
      const ut = sp.Re * x.prot.IDn;
      if (sp.earth === 'TT') {
        push({
          id: 'tt-' + x.c.id,
          group: 'sicurezza',
          level: ut <= UL ? 'ok' : 'error',
          title: `${x.c.tag}: protezione dai contatti indiretti (sistema TT)`,
          detail: `Re · IΔn = ${fmt(sp.Re, 0)} Ω × ${fmtA(x.prot.IDn)} = ${fmt(ut, 1)} V ${ut <= UL ? '≤' : '>'} 50 V.${ut > UL ? ' Riduci la resistenza di terra o usa un differenziale più sensibile.' : ''}`,
          comps: [x.c.id],
        });
      }
    }

    if (x.prot.kind === 'rcd') {
      // Il differenziale puro deve essere protetto da un magnetotermico a monte con In ≤ In(ID)
      const start = lineSide[0];
      const chain = start ? upstreamChain(g, start, sourceIds) : null;
      const up = (chain || []).map((id) => g.byId.get(id)).filter((d) => d && d.c.id !== x.c.id && overcurrent(d));
      if (chain && !up.length) {
        push({ id: 'rcdoc-' + x.c.id, group: 'dimensionamento', level: 'warn', title: `${x.c.tag}: differenziale puro senza magnetotermico a monte`, detail: 'Il differenziale puro non protegge dalle sovracorrenti: a monte serve un magnetotermico con In non superiore alla sua corrente nominale.', comps: [x.c.id] });
      } else if (up.length) {
        const maxIn = Math.max(...up.map((d) => d.prot.In));
        if (maxIn > x.prot.In) push({ id: 'rcdoc-' + x.c.id, group: 'dimensionamento', level: 'warn', title: `${x.c.tag}: differenziale sottodimensionato`, detail: `A monte c’è un magnetotermico da ${maxIn} A ma il differenziale è da ${x.prot.In} A: scegli In(ID) ≥ ${maxIn} A.`, comps: [x.c.id] });
      }
    }

    if (!overcurrent(x) || !wiredOut) continue;
    // Cavi protetti: a valle fino alla protezione successiva
    const stopAtOC = (e) => !(e.kind === 'path' && (e.comp === x.c.id || overcurrent(g.byId.get(e.comp)) || g.byId.get(e.comp)?.def.barrier));
    const prot = bfs(g, loadSide, stopAtOC);
    const wires = new Set();
    for (const n of prot.seen) for (const e of g.adj.get(n) || []) if (e.kind === 'wire' && prot.seen.has(e.to)) wires.add(e.id);
    // Carichi alimentati: a valle attraversando anche le protezioni successive
    const all = bfs(g, loadSide, (e) => !(e.kind === 'path' && e.comp === x.c.id));
    let Ib = 0;
    const fed = [];
    for (const l of loads) {
      if (l.c.id === x.c.id) continue;
      const lt = l.terms.filter((t) => t.role === 'L').map((t) => l.c.id + '.' + t.id);
      if (lt.some((n) => all.seen.has(n))) {
        Ib += loadCurrent(l.load, sys);
        fed.push(l);
      }
    }
    const loaded = x.prot.poles.length >= 3 ? 3 : 2;
    const ws = [...wires].map((id) => project.wire(id)).filter(Boolean);
    const weakest = ws.length ? ws.reduce((m, w) => (wireIz(w, loaded) < wireIz(m, loaded) ? w : m)) : null;
    const Iz = weakest ? wireIz(weakest, loaded) : null;
    const In = x.prot.In;
    const parts = [];
    let level = 'ok';
    if (Iz !== null) {
      if (In > Iz) {
        level = 'error';
        parts.push(`In = ${fmt(In, 0)} A > Iz = ${fmt(Iz, 1)} A del cavo da ${sectionLabel(weakest)}: il cavo NON è protetto dal sovraccarico. Aumenta la sezione o riduci In.`);
      } else parts.push(`In = ${fmt(In, 0)} A ≤ Iz = ${fmt(Iz, 1)} A (cavo più piccolo: ${sectionLabel(weakest)}).`);
    }
    if (fed.length) {
      if (Ib > In) {
        if (level === 'ok') level = 'warn';
        parts.push(`Corrente di impiego Ib = ${fmtA(Ib)} > In: con tutti i carichi accesi l’interruttore interviene.`);
      } else parts.push(`Ib = ${fmtA(Ib)} ≤ In (${fed.length} utenz${fed.length === 1 ? 'a' : 'e'}).`);
      if (fed.some((l) => l.load.motor) && x.prot.curve === 'B') {
        if (level === 'ok') level = 'warn';
        parts.push('Curva B con un motore a valle: la corrente di spunto (≈ 6 In motore) può far intervenire il magnetico. Preferisci la curva C o D.');
      }
    }
    if (!parts.length) continue;
    push({ id: 'coord-' + x.c.id, group: 'dimensionamento', level, title: `${x.c.tag}: coordinamento Ib ≤ In ≤ Iz`, detail: parts.join(' '), comps: [x.c.id], wires: [...wires] });
  }

  // ── Sistema TT senza differenziale ──────────────────────────────────────────────
  if (sp.earth === 'TT' && loads.some((l) => project.wires.some((w) => w.a.c === l.c.id || w.b.c === l.c.id))) {
    if (!protections.some((x) => x.prot.kind === 'rcd' || x.prot.kind === 'rcbo')) {
      // masse da proteggere: utenze con morsetto PE (prese, motori, apparecchi di classe I)
      const masses = loads.some((l) => l.terms.some((t) => t.role === 'PE') && project.wires.some((w) => w.a.c === l.c.id || w.b.c === l.c.id));
      push(masses
        ? { id: 'tt-none', group: 'sicurezza', level: 'error', title: 'Sistema TT senza interruttore differenziale', detail: 'Nel sistema TT la corrente di guasto verso terra è troppo bassa per far intervenire il magnetotermico: la protezione dai contatti indiretti delle masse (prese, motori, apparecchi di classe I) richiede un differenziale.' }
        : { id: 'tt-none', group: 'sicurezza', level: 'warn', title: 'Impianto senza interruttore differenziale', detail: 'Le utenze presenti sono di classe II (senza masse), ma per regola dell’arte ogni impianto va protetto da un differenziale da 30 mA (negli ambienti residenziali è obbligatorio, CEI 64-8 cap. 37).' });
    }
  }

  // ── Sistema IT: controllo dell'isolamento obbligatorio ──────────────────────────
  if (sp.earth === 'IT' && sources.length) {
    const imds = g.comps.filter((x) => x.def.type === 'imd' && project.wires.some((w) => w.a.c === x.c.id || w.b.c === x.c.id));
    if (!imds.length) {
      push({ id: 'it-imd', group: 'sicurezza', level: 'error', title: 'Sistema IT senza dispositivo di controllo dell’isolamento', detail: 'Con il neutro isolato un primo guasto a terra non fa intervenire le protezioni e passa inosservato: i registri navali (e la CEI 64-8) richiedono un dispositivo che controlli l’isolamento e dia allarme.' });
    } else {
      push({ id: 'it-imd', group: 'sicurezza', level: 'ok', title: 'Controllo dell’isolamento presente (sistema IT)', detail: `${imds.map((x) => x.c.tag).join(', ')}: al primo guasto a terra dà allarme e l’impianto resta in servizio.`, comps: imds.map((x) => x.c.id) });
    }
  }

  // ── Centrale di gruppi elettrogeni: potenza e riserva n−1 ───────────────────────
  if (gensets.length) {
    const rated = gensets.map((c) => ({ c, r: gensetRated(resolveParams(DEFS.genset, c.params)) }));
    const SnTot = rated.reduce((a, x) => a + x.r.Sn, 0);
    const SnMax = Math.max(...rated.map((x) => x.r.Sn));
    const instLoads = loads.filter((l) => project.wires.some((w) => w.a.c === l.c.id || w.b.c === l.c.id));
    const Sload = instLoads.reduce((a, l) => a + (l.load.P || 0) / Math.max(0.3, l.load.cos || 1), 0);
    if (instLoads.length) {
      push({
        id: 'gen-cap',
        group: 'nave',
        level: Sload > SnTot ? 'error' : Sload > 0.9 * SnTot ? 'warn' : 'ok',
        title: 'Potenza installata e potenza dei generatori',
        detail: `Utenze ${fmtW(Sload).replace('W', 'VA')} contro ${fmtW(SnTot).replace('W', 'VA')} di generatori (${gensets.length} grupp${gensets.length === 1 ? 'o' : 'i'}). ${Sload > SnTot ? 'Con tutti i carichi accesi la centrale è in sovraccarico.' : Sload > 0.9 * SnTot ? 'Margine scarso: i generatori lavorano al meglio attorno al 75 %.' : 'Il punto di lavoro ottimale dei generatori è attorno al 75 % della potenza nominale.'}`,
        comps: gensets.map((c) => c.id),
      });
      if (gensets.length > 1) {
        const rest = SnTot - SnMax;
        push({
          id: 'gen-n1',
          group: 'nave',
          level: Sload > rest ? 'warn' : 'ok',
          title: 'Riserva con un gruppo in avaria (n−1)',
          detail: `Con il gruppo più grande fuori servizio restano ${fmtW(rest).replace('W', 'VA')}: ${Sload > rest ? 'non bastano per tutte le utenze — servono il distacco dei carichi non essenziali o più potenza installata.' : 'sufficienti per tutte le utenze.'}`,
          comps: gensets.map((c) => c.id),
        });
      } else {
        push({ id: 'gen-n1', group: 'nave', level: 'warn', title: 'Un solo gruppo: nessuna riserva', detail: 'A bordo la continuità di servizio richiede almeno due gruppi (o un gruppo di emergenza) per i carichi essenziali.', comps: gensets.map((c) => c.id) });
      }
    }

    // potere di interruzione e di chiusura rispetto al cortocircuito dei generatori (IEC 61363 semplificata):
    // Icu ≥ Iac(T/2), Icm ≥ Ip con fattore di picco 1,7; i registri non ammettono la protezione di back-up
    const Iac = sp.Icc;
    const Ip = Iac * 1.7;
    for (const x of protections) {
      if (!x.prot.pdi || !project.wires.some((w) => w.a.c === x.c.id || w.b.c === x.c.id)) continue;
      const n = x.prot.pdi <= 6 ? 1.5 : x.prot.pdi <= 10 ? 1.7 : 2;
      const Icm = x.prot.pdi * n;
      const okI = x.prot.pdi >= Iac;
      const okM = Icm >= Ip;
      push({ id: 'reg-pdi-' + x.c.id, group: 'nave', level: okI && okM ? 'ok' : 'error', title: `${x.c.tag}: Icu ≥ Iac e Icm ≥ Ip`, detail: `${mtxs.length ? 'Cortocircuito al secondario del trasformatore di servizio' : 'Cortocircuito dei generatori'} ${fmt(Iac, 2)} kA, picco ≈ ${fmt(Ip, 2)} kA (fattore 1,7); Icu = ${x.prot.pdi} kA, Icm ≈ ${fmt(Icm, 1)} kA (n = ${n}). ${okI && okM ? 'Verificato per il singolo apparecchio: i registri non ammettono la protezione di back-up.' : 'Insufficiente: scegli un potere di interruzione maggiore.'}`, comps: [x.c.id] });
    }

    // utenze essenziali: alimentazione di emergenza tramite ATS/UPS, presenza di una sorgente di emergenza
    const ess = loads.filter((l) => l.p.essenziale && project.wires.some((w) => w.a.c === l.c.id || w.b.c === l.c.id));
    const hasEmerg = gensets.some((c) => resolveParams(DEFS.genset, c.params).emergenza) || g.comps.some((x) => x.def.type === 'ups');
    for (const l of ess) {
      const chain = chains.get(l.c.id) || [];
      const viaEm = chain.some((id) => ['ats', 'ups'].includes(g.byId.get(id)?.def.type));
      push({ id: 'reg-ess-' + l.c.id, group: 'nave', level: viaEm ? 'ok' : 'warn', title: `${l.c.tag}: utenza essenziale ${viaEm ? 'con' : 'senza'} alimentazione di emergenza`, detail: viaEm ? 'Alimentata attraverso il commutatore automatico (ATS) o l’UPS: resta in servizio al black-out.' : 'Le utenze essenziali (timoneria, pompe, luci di navigazione) vanno alimentate dal quadro di emergenza tramite commutatore automatico (ATS) o UPS.', comps: [l.c.id] });
    }
    if (ess.length && !hasEmerg) push({ id: 'reg-emerg', group: 'nave', level: 'warn', title: 'Nessuna sorgente di emergenza', detail: 'Ci sono utenze essenziali ma nessun gruppo di emergenza ad avviamento automatico né UPS: al black-out restano senza alimentazione (SOLAS: alimentazione di emergenza entro 45 s).' });
    for (const sh of g.comps.filter((x) => x.def.type === 'shore')) {
      push({ id: 'reg-shore-' + sh.c.id, group: 'nave', level: sh.p.ctrl ? 'ok' : 'warn', title: `${sh.c.tag}: controllo della sequenza delle fasi`, detail: sh.p.ctrl ? 'Attivo: l’interruttore di banchina non chiude con la sequenza inversa.' : 'Disattivato: con la sequenza inversa i motori di bordo girerebbero al contrario.', comps: [sh.c.id] });
    }
  }

  // ── Interruttori sul neutro ─────────────────────────────────────────────────────
  const nNet = bfs(g, sources.map((c) => c.id + '.N')).seen;
  for (const x of g.comps) {
    if (!['sa', 'sd', 'si'].includes(x.def.type)) continue;
    if (x.terms.some((t) => nNet.has(x.c.id + '.' + t.id))) {
      push({ id: 'sw-n-' + x.c.id, group: 'sicurezza', level: 'error', title: `${x.c.tag}: il comando interrompe il neutro`, detail: 'Gli interruttori di comando vanno inseriti sul conduttore di FASE: interrompendo il neutro la lampada resta in tensione anche da spenta.', comps: [x.c.id] });
    }
  }

  // ── Potenza installata / contrattuale ───────────────────────────────────────────
  const inst = loads.filter((l) => project.wires.some((w) => w.a.c === l.c.id || w.b.c === l.c.id));
  const Ptot = inst.reduce((s, l) => s + (l.load.P || 0), 0);
  if (inst.length && supplyComp) {
    const Pdisp = sp.Pc * 1100;
    push({
      id: 'power',
      group: 'esercizio',
      level: Ptot > Pdisp ? 'warn' : 'ok',
      title: 'Potenza installata e potenza disponibile',
      detail: `Potenza installata ${fmtW(Ptot)}; disponibile al contatore ${fmtW(Pdisp)} (${sp.Pc} kW + 10%).${Ptot > Pdisp ? ' Se tutti i carichi funzionano insieme il contatore stacca: valuta un coefficiente di contemporaneità o una potenza contrattuale maggiore.' : ''}`,
    });
  }

  // ── Cadute di tensione (misurate) ───────────────────────────────────────────────
  if (sim && sim.res?.ok) {
    let measured = 0;
    for (const l of inst) {
      if (l.load.phases === 3) continue;
      const a = l.terms.find((t) => t.role === 'L');
      const b = l.terms.find((t) => t.role === 'N');
      if (!a || !b) continue;
      const v = cabs(csub(sim.terminalV(l.c.id, a.id), sim.terminalV(l.c.id, b.id)));
      const hasLoad = l.load.P > 0;
      if (v < 100 || !hasLoad) continue;
      measured++;
      const dv = ((sys.Vph - v) / sys.Vph) * 100;
      push({
        id: 'dv-' + l.c.id,
        group: 'esercizio',
        level: dv > 4 ? 'warn' : 'ok',
        title: `${l.c.tag}: caduta di tensione ${fmt(dv, 2)} %`,
        detail: `Tensione ai morsetti ${fmt(v, 1)} V. Limite consigliato 4% (CEI 64-8). ${dv > 4 ? 'Aumenta la sezione dei cavi o riduci la lunghezza della linea.' : ''}`,
        comps: [l.c.id],
      });
    }
    if (!measured && inst.length) {
      push({ id: 'dv-none', group: 'esercizio', level: 'info', title: 'Cadute di tensione', detail: 'Alimenta l’impianto e accendi le utenze monofase (lampade, apparecchi collegati alle prese) per misurare le cadute di tensione.' });
    }
  }

  // ── Media tensione: celle, trasformatori, selettività MT/BT ─────────────────────
  runMTChecks({ g, project, sim, push, IccMT, mtins, gensets, mtxs, mtcells, loads, upstreamChain, bfs, sourceIds, overcurrent });

  // ── Componenti non collegati ────────────────────────────────────────────────────
  const orphans = g.comps.filter((x) => !x.def.fixed && !project.wires.some((w) => w.a.c === x.c.id || w.b.c === x.c.id));
  if (orphans.length) {
    push({ id: 'orphans', group: 'conformita', level: 'info', title: 'Componenti non ancora cablati', detail: orphans.map((x) => x.c.tag).join(', '), comps: orphans.map((x) => x.c.id) });
  }

  const order = { error: 0, warn: 1, info: 2, ok: 3 };
  out.sort((a, b) => order[a.level] - order[b.level]);
  return out;
}

export function summarize(results) {
  const s = { error: 0, warn: 0, ok: 0, info: 0 };
  for (const r of results) s[r.level]++;
  return s;
}
