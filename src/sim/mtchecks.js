// Verifiche del modulo media tensione (gruppo “mt”): potere di interruzione delle celle, protezione di terra
// 51N, dispositivo generale (CEI 0-16), tensione totale di terra della cabina (CEI 99-3), dimensionamento del
// trasformatore e della sua protezione MT (sovraccarico, inserzione, tenuta al guasto secondario), interruttore
// generale BT, selettività MT/BT amperometrica e cronometrica, celle di generatore della sbarra MT di bordo.
// Riferimento didattico: ABB, Quaderno di applicazione tecnica n. 2 “Cabine MT/BT”, cap. 2-3.
import { mtxRated } from '../catalog/defs/mt.js';
import { gensetRated } from '../catalog/defs/nautico.js';
import { CURVES, fmt, fmtA, fmtW } from './norms.js';

const kA = (a) => `${fmt(a / 1000, 2)} kA`;

/**
 * @param c contesto preparato da runChecks: g (grafo), project, push, IccMT (kA sulla sbarra MT, null se non c'è MT),
 *   mtins, gensets, mtxs, mtcells (componenti del grafo), loads, upstreamChain, bfs, sourceIds, overcurrent
 */
export function runMTChecks(c) {
  const { g, project, push, IccMT, mtins, gensets, mtxs, mtcells, loads, upstreamChain, bfs, sourceIds, overcurrent } = c;
  if (!mtins.length && !mtxs.length && !mtcells.length) return;
  const wired = (x) => project.wires.some((w) => w.a.c === x.c.id || w.b.c === x.c.id);
  const mtIn = mtins[0] ? g.byId.get(mtins[0].id) : null;
  const Ig = mtIn ? mtIn.p.Ig : gensets.some((gs) => g.byId.get(gs.id)?.p.earth === 'NR') ? 50 : null;

  // ── Celle MT: potere di interruzione e protezione di terra ───────────────────────
  for (const x of mtcells.filter(wired)) {
    if (IccMT) {
      const ok = x.p.Icu >= IccMT;
      push({ id: 'mt-icu-' + x.c.id, group: 'mt', level: ok ? 'ok' : 'error', title: `${x.c.tag}: potere di interruzione in MT`, detail: `Icu = ${fmt(x.p.Icu, 1)} kA ${ok ? '≥' : '<'} Icc presunta sulla sbarra MT ${fmt(IccMT, 2)} kA.${ok ? '' : ' Scegli una cella con Icu maggiore.'}`, comps: [x.c.id] });
    }
    if (Ig) {
      const ok = x.p.Io <= 0.5 * Ig;
      push({ id: 'mt-51n-' + x.c.id, group: 'mt', level: ok ? 'ok' : 'error', title: `${x.c.tag}: protezione di terra 51N`, detail: `Soglia Io> = ${fmtA(x.p.Io)} con una corrente di guasto monofase a terra di ${Ig} A: ${ok ? 'il guasto a terra viene rilevato (soglia ≤ 50 % di Ig).' : 'la soglia è troppo alta e un guasto a terra in MT non verrebbe rilevato. Abbassa Io> (CEI 0-16: tipicamente 2 A).'}`, comps: [x.c.id] });
    }
  }

  // ── Cabina con consegna: dispositivo generale e terra ────────────────────────────
  if (mtIn) {
    const dg = mtcells.find((x) => x.p.ruolo === 'dg' && wired(x));
    if (!dg) {
      push({ id: 'mt-dg', group: 'mt', level: 'error', title: 'Manca il dispositivo generale (DG)', detail: 'La CEI 0-16 richiede subito a valle della consegna un interruttore MT con protezione generale (51, 50, 51N), regolata come concordato con il distributore: senza DG un guasto in cabina resta sulla rete del distributore.' });
    } else {
      const r = dg.p;
      const std = r.I2 <= 600 + 1e-9 && r.t2 <= 0.12 + 1e-9 && r.Io <= 2 + 1e-9 && r.t1 <= 0.5 + 1e-9 && r.I1 <= 250 + 1e-9;
      push({ id: 'mt-dg', group: 'mt', level: std ? 'ok' : 'warn', title: `${dg.c.tag}: dispositivo generale (DG)`, detail: std ? 'Regolazioni entro i valori standard CEI 0-16 (51 a 250 A / 0,5 s, 50 a 600 A / 0,12 s, 51N a 2 A / 0,17 s).' : 'Le regolazioni superano i valori standard della CEI 0-16 (51 a 250 A / 0,5 s, 50 a 600 A / 0,12 s, 51N a 2 A / 0,17 s): vanno concordate con il distributore, altrimenti un guasto in cabina resterebbe troppo a lungo sulla rete MT.', comps: [dg.c.id] });
    }
    const UE = mtIn.p.Re * mtIn.p.Ig;
    const ok = UE <= 220;
    push({ id: 'mt-earth', group: 'mt', level: ok ? 'ok' : 'error', title: 'Tensione totale di terra della cabina', detail: `UE = Re · Ig = ${fmt(mtIn.p.Re, 1)} Ω × ${mtIn.p.Ig} A = ${fmt(UE, 0)} V ${ok ? '≤' : '>'} 220 V (limite CEI 99-3 per guasti eliminati entro 0,5 s).${ok ? '' : ' Riduci la resistenza di terra del dispersore o chiedi al distributore un tempo di eliminazione più breve.'}`, comps: [mtIn.c.id] });
  }

  // ── Trasformatori: dimensionamento, protezione MT, generale BT, selettività ─────
  const instLoads = loads.filter((l) => project.wires.some((w) => w.a.c === l.c.id || w.b.c === l.c.id));
  const Sload = instLoads.reduce((a, l) => a + (l.load.P || 0) / Math.max(0.3, l.load.cos || 1), 0);
  const VA = (v) => fmtW(v).replace('W', 'VA');
  for (const x of mtxs) {
    const r = mtxRated(x.p, IccMT);
    push({
      id: 'mt-tr-' + x.c.id,
      group: 'mt',
      level: Sload > r.Sn ? 'error' : Sload > 0.8 * r.Sn ? 'warn' : 'ok',
      title: `${x.c.tag}: potenza del trasformatore`,
      detail: `Utenze installate ${VA(Sload)} contro ${x.p.Sn} kVA del trasformatore (In1 = ${fmtA(r.In1)}, In2 = ${fmtA(r.In2)}). ${Sload > r.Sn ? 'Con tutti i carichi accesi il trasformatore è in sovraccarico: scegli una taglia maggiore.' : Sload > 0.8 * r.Sn ? 'Margine scarso: in cabina si lascia riserva per gli ampliamenti (QT2: carico ≈ 70-80 %).' : 'Taglia adeguata, con riserva per gli ampliamenti.'}`,
      comps: [x.c.id],
    });
    push({ id: 'mt-icc2-' + x.c.id, group: 'mt', level: 'info', title: `${x.c.tag}: corrente di cortocircuito in BT`, detail: `Icc al secondario ≈ ${kA(r.Icc2)} (In2 / vcc = ${kA(r.Icc2inf)} con rete MT infinita${IccMT ? `, ${kA(r.Icc2)} con ${fmt(IccMT, 1)} kA sulla sbarra MT` : ''}); riportata al primario ${fmtA(r.Icc2ref)}. Gli interruttori BT a valle devono avere Icu ≥ ${kA(r.Icc2)}.`, comps: [x.c.id] });

    // protezione MT a monte: la cella più vicina al trasformatore lungo il percorso verso la sorgente
    const chain = upstreamChain(g, x.c.id + '.1', sourceIds);
    const cells = (chain || []).map((id) => g.byId.get(id)).filter((d) => d?.prot?.kind === 'mtcb');
    const near = cells[cells.length - 1];
    if (!chain) continue; // primario non collegato alla sorgente: lo segnalano le altre verifiche
    if (!near) {
      push({ id: 'mt-prot-' + x.c.id, group: 'mt', level: 'error', title: `${x.c.tag}: trasformatore senza protezione MT a monte`, detail: 'Tra la sorgente MT e il trasformatore serve una cella con interruttore e relè di protezione (50/51, 51N): il primario non è protetto.', comps: [x.c.id] });
    } else {
      const q = near.p;
      const parts = [];
      let level = 'ok';
      const warn = (t) => {
        if (level === 'ok') level = 'warn';
        parts.push(t);
      };
      const err = (t) => {
        level = 'error';
        parts.push(t);
      };
      if (q.I1 < 1.1 * r.In1) warn(`51: I> = ${fmtA(q.I1)} è sotto 1,1 × In1 (${fmtA(r.In1)}): interventi intempestivi a pieno carico.`);
      else if (q.I1 > 2 * r.In1 && q.ruolo !== 'dg') warn(`51: I> = ${fmtA(q.I1)} è oltre 2 × In1 (${fmtA(r.In1)}): il sovraccarico del trasformatore non è protetto (QT2: 1,2–1,5 × In1).`);
      else parts.push(`51: I> = ${fmtA(q.I1)} (${fmt(q.I1 / r.In1, 1)} × In1) protegge dal sovraccarico.`);
      if (q.I2 < r.inrush) err(`50: I>> = ${fmtA(q.I2)} è sotto la corrente di inserzione (≈ 10 × In1 = ${fmtA(r.inrush)}): il relè scatta a ogni inserzione del trasformatore.`);
      else parts.push(`50: I>> = ${fmtA(q.I2)} sopra la corrente di inserzione (${fmtA(r.inrush)}).`);
      if (q.I1 > 0.8 * r.Icc2ref) err(`Un cortocircuito ai morsetti BT (${fmtA(r.Icc2ref)} riportati al primario) non raggiunge con margine la soglia I> = ${fmtA(q.I1)}: il trasformatore non è protetto dal guasto secondario (tenuta 2 s).`);
      else if (q.t1 > 2) err(`t> = ${fmt(q.t1, 2)} s supera la tenuta al cortocircuito del trasformatore (2 s).`);
      else parts.push(`Un guasto ai morsetti BT (${fmtA(r.Icc2ref)} al primario) viene eliminato dalla 51 in ${fmt(q.t1, 2)} s, entro la tenuta di 2 s.`);
      push({ id: 'mt-prot-' + x.c.id, group: 'mt', level, title: `${near.c.tag}: protezione MT del trasformatore ${x.c.tag}`, detail: parts.join(' '), comps: [near.c.id, x.c.id] });

      // interruttore generale BT: primo dispositivo di sovracorrente a valle del secondario
      const sec = x.terms.filter((t) => t.side === 'load').map((t) => x.c.id + '.' + t.id);
      const down = bfs(g, sec, (e) => !(e.kind === 'path' && (e.comp === x.c.id || overcurrent(g.byId.get(e.comp)))));
      const qg = g.comps.find((d) => overcurrent(d) && !d.prot.mt && d.terms.some((t) => t.side === 'line' && down.seen.has(d.c.id + '.' + t.id)));
      if (!qg) {
        push({ id: 'mt-qg-' + x.c.id, group: 'mt', level: 'error', title: `${x.c.tag}: secondario senza interruttore generale BT`, detail: 'Subito a valle del trasformatore serve l’interruttore generale BT (scatolato con sganciatore elettronico L-S-I): protegge i cavi del secondario e dà la selettività con la protezione MT.', comps: [x.c.id] });
        continue;
      }
      const pq = qg.prot;
      const frame = pq.frame || pq.In;
      const Ir = pq.In;
      const pq2 = [];
      let lv = 'ok';
      if (frame < r.In2) {
        lv = 'error';
        pq2.push(`In = ${fmt(frame, 0)} A è minore della corrente nominale del secondario (${fmtA(r.In2)}): il generale non porta la corrente del trasformatore. Serve uno scatolato con sganciatore elettronico.`);
      } else if (Ir < 0.9 * r.In2) {
        lv = 'warn';
        pq2.push(`Ir = ${fmtA(Ir)} è regolata sotto il 90 % di In2 (${fmtA(r.In2)}): il generale interviene prima che il trasformatore sia a pieno carico.`);
      } else if (Ir > 1.1 * r.In2) {
        lv = 'warn';
        pq2.push(`Ir = ${fmtA(Ir)} supera In2 (${fmtA(r.In2)}) di oltre il 10 %: il trasformatore può lavorare in sovraccarico senza che il generale intervenga.`);
      } else pq2.push(`Ir = ${fmtA(Ir)} ≈ In2 (${fmtA(r.In2)}): il generale BT è dimensionato sul trasformatore.`);
      if (pq.pdi && pq.pdi * 1000 < r.Icc2) {
        lv = 'error';
        pq2.push(`Icu = ${pq.pdi} kA < Icc al secondario ${kA(r.Icc2)}.`);
      } else if (pq.pdi) pq2.push(`Icu = ${pq.pdi} kA ≥ ${kA(r.Icc2)}.`);
      push({ id: 'mt-qg-' + x.c.id, group: 'mt', level: lv, title: `${qg.c.tag}: interruttore generale BT di ${x.c.tag}`, detail: pq2.join(' '), comps: [qg.c.id, x.c.id] });

      // selettività MT/BT: amperometrica (I>> sopra il guasto BT riportato al primario) e cronometrica (t> oltre il ritardo del generale BT)
      const tBT = pq.lsi ? pq.lsi.tsd : 0.02;
      const okT = q.t1 >= tBT + 0.15 - 1e-9;
      const okI = q.I2 > r.Icc2ref;
      const IiBT = pq.lsi ? pq.lsi.Ii || pq.lsi.Isd : (CURVES[pq.curve]?.sim || 7.5) * pq.In;
      push({
        id: 'mt-sel-' + x.c.id,
        group: 'mt',
        level: okT && okI ? 'ok' : 'warn',
        title: `Selettività MT/BT tra ${near.c.tag} e ${qg.c.tag}`,
        detail: `${okI ? `Amperometrica: I>> = ${fmtA(q.I2)} sta sopra il cortocircuito BT riportato al primario (${fmtA(r.Icc2ref)}): i guasti in BT non fanno scattare la soglia rapida MT.` : `Amperometrica NON garantita: I>> = ${fmtA(q.I2)} è sotto il cortocircuito BT riportato al primario (${fmtA(r.Icc2ref)}): un guasto sulla sbarra BT farebbe scattare la cella MT insieme al generale BT. Alza I>>.`} ${okT ? `Cronometrica: t> = ${fmt(q.t1, 2)} s ≥ ${fmt(tBT, 2)} s del generale BT + 0,15 s di margine.` : `Cronometrica NON garantita: t> = ${fmt(q.t1, 2)} s è troppo vicino al ritardo del generale BT (${fmt(tBT, 2)} s): servono almeno 0,15 s di margine.`} Il generale BT interviene senza ritardo oltre ${fmtA(IiBT)}.`,
        comps: [near.c.id, qg.c.id],
      });
    }
  }

  // ── Sbarra MT di bordo: celle di generatore ──────────────────────────────────────
  for (const x of mtcells.filter((d) => d.p.ruolo === 'gen' && wired(d))) {
    const gens = gensets.filter((gs) => project.wires.some((w) => (w.a.c === gs.id && w.b.c === x.c.id) || (w.b.c === gs.id && w.a.c === x.c.id)));
    if (!gens.length) {
      push({ id: 'mt-gen-' + x.c.id, group: 'mt', level: 'warn', title: `${x.c.tag}: cella di generatore senza generatore`, detail: 'La cella è dichiarata “interruttore di generatore” ma nessun gruppo è collegato ai suoi morsetti di arrivo.', comps: [x.c.id] });
      continue;
    }
    const r = gensetRated(g.byId.get(gens[0].id).p);
    const parts = [];
    let level = 'ok';
    if (x.p.I1 < 1.1 * r.In || x.p.I1 > 1.6 * r.In) {
      level = 'warn';
      parts.push(`51: I> = ${fmtA(x.p.I1)} fuori dall’intervallo 1,1–1,6 × In del gruppo (${fmtA(r.In)}; registri: sovraccarico tra il 10 e il 50 % oltre In).`);
    } else parts.push(`51: I> = ${fmtA(x.p.I1)} (${fmt(x.p.I1 / r.In, 2)} × In del gruppo).`);
    if (x.p.I2 > 0.8 * r.Icc) {
      level = 'error';
      parts.push(`50: I>> = ${fmtA(x.p.I2)} supera l’80 % del contributo di cortocircuito del gruppo (${fmtA(r.Icc)}, ≈ ${fmt(r.Icc / r.In, 1)} × In): la soglia rapida non verrebbe mai raggiunta. In isola le correnti di guasto sono piccole.`);
    } else parts.push(`50: I>> = ${fmtA(x.p.I2)} sotto il contributo di cortocircuito del gruppo (${fmtA(r.Icc)}).`);
    push({ id: 'mt-gen-' + x.c.id, group: 'mt', level, title: `${x.c.tag}: protezioni della cella di generatore ${gens.map((gs) => gs.tag).join(', ')}`, detail: parts.join(' '), comps: [x.c.id, ...gens.map((gs) => gs.id)] });
  }
}
