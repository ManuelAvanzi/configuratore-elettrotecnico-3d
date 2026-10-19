// Verifiche tecniche automatiche del progetto (analisi topologica + valori misurati in simulazione).
// Ogni verifica restituisce { id, group, level: 'ok'|'warn'|'error'|'info', title, detail, comps[], wires[] }.
import { DEFS } from '../catalog/defs/index.js';
import { resolveParams } from '../catalog/defs/common.js';
import { iz, V_PHASE, UL, fmt, fmtA, fmtW } from './norms.js';
import { cabs, csub } from './complex.js';

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

/** Componenti attraversati lungo il percorso più breve dal morsetto di partenza alla fornitura */
function upstreamChain(g, startNode, supplyId) {
  const { seen, parent } = bfs(g, [startNode]);
  let target = null;
  for (const n of seen) {
    const inf = g.info.get(n);
    if (inf && inf.comp.id === supplyId && inf.term.role === 'L') {
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

function loadCurrent(l) {
  if (!l || !l.P) return 0;
  if (l.phases === 3) return l.In || l.P / (Math.sqrt(3) * 400 * (l.cos || 1));
  return l.P / (V_PHASE * (l.cos || 1));
}

export const CHECK_GROUPS = [
  { id: 'sicurezza', label: 'Sicurezza delle persone' },
  { id: 'dimensionamento', label: 'Dimensionamento e coordinamento' },
  { id: 'conformita', label: 'Regola dell’arte' },
  { id: 'esercizio', label: 'Esercizio e carichi' },
];

export function runChecks(project, sim) {
  const g = buildGraph(project);
  const out = [];
  const push = (r) => out.push({ comps: [], wires: [], ...r });
  const supplyComp = project.components.find((c) => c.type === 'supply');
  const sp = resolveParams(DEFS.supply, supplyComp.params);
  const tag = (id) => project.comp(id)?.tag || id;
  const is3F = sp.sys === '3F';

  const loads = g.comps.filter((x) => x.load);
  const protections = g.comps.filter((x) => x.prot && x.prot.kind !== 'isolator');
  const overcurrent = (x) => x.prot && x.prot.overcurrent && !x.prot.overloadOnly;

  // ── Collegamento alla fornitura ─────────────────────────────────────────────────
  const supplyWired = project.wires.some((w) => (w.a.c === supplyComp.id && w.a.t !== 'PE') || (w.b.c === supplyComp.id && w.b.t !== 'PE'));
  if (!supplyWired) {
    push({ id: 'supply', group: 'esercizio', level: 'info', title: 'Impianto non ancora collegato all’arrivo linea', detail: 'Collega i morsetti di uscita dell’arrivo linea (XA) all’interruttore generale.' , comps: [supplyComp.id] });
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
    const chain = upstreamChain(g, x.c.id + '.' + lTerm.id, supplyComp.id);
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
      if (!rcds.length) {
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
      const chain = start ? upstreamChain(g, start, supplyComp.id) : null;
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
    const stopAtOC = (e) => !(e.kind === 'path' && (e.comp === x.c.id || overcurrent(g.byId.get(e.comp))));
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
        Ib += loadCurrent(l.load);
        fed.push(l);
      }
    }
    const loaded = x.prot.poles.length >= 3 ? 3 : 2;
    const ws = [...wires].map((id) => project.wire(id)).filter(Boolean);
    const minS = ws.length ? Math.min(...ws.map((w) => w.section)) : null;
    const Iz = minS ? iz(minS, loaded) : null;
    const In = x.prot.In;
    const parts = [];
    let level = 'ok';
    if (Iz !== null) {
      if (In > Iz) {
        level = 'error';
        parts.push(`In = ${In} A > Iz = ${fmt(Iz, 1)} A del cavo da ${fmt(minS, 1)} mm²: il cavo NON è protetto dal sovraccarico. Aumenta la sezione o riduci In.`);
      } else parts.push(`In = ${In} A ≤ Iz = ${fmt(Iz, 1)} A (cavo più piccolo: ${fmt(minS, 1)} mm²).`);
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

  // ── Interruttori sul neutro ─────────────────────────────────────────────────────
  const nNet = bfs(g, [supplyComp.id + '.N']).seen;
  for (const x of g.comps) {
    if (!['sa', 'sd', 'si'].includes(x.def.type)) continue;
    if (x.terms.some((t) => nNet.has(x.c.id + '.' + t.id))) {
      push({ id: 'sw-n-' + x.c.id, group: 'sicurezza', level: 'error', title: `${x.c.tag}: il comando interrompe il neutro`, detail: 'Gli interruttori di comando vanno inseriti sul conduttore di FASE: interrompendo il neutro la lampada resta in tensione anche da spenta.', comps: [x.c.id] });
    }
  }

  // ── Potenza installata / contrattuale ───────────────────────────────────────────
  const inst = loads.filter((l) => project.wires.some((w) => w.a.c === l.c.id || w.b.c === l.c.id));
  const Ptot = inst.reduce((s, l) => s + (l.load.P || 0), 0);
  if (inst.length) {
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
      const dv = ((V_PHASE - v) / V_PHASE) * 100;
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
