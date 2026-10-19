// Instradamento dei cavi: dal morsetto si entra nella canalina più vicina, si percorre la rete di canaline
// (quadro → uscita → canalina di collegamento → colonne e righe del pannello utenze) e si scende al morsetto di arrivo.
// Morsetti vicini sulla stessa guida e sullo stesso lato vengono uniti con un ponticello diretto.
import * as THREE from 'three';

const JUMPER_MAX = 0.075;

export class Router {
  constructor(net) {
    this.net = net;
    this.adj = new Map();
    for (const id of net.nodes.keys()) this.adj.set(id, []);
    for (const [a, b] of net.edges) this.link(this.adj, a, b);
  }

  link(adj, a, b) {
    const na = this.pt(a);
    const nb = this.pt(b);
    const w = Math.hypot(na.x - nb.x, na.y - nb.y);
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push({ to: b, w });
    adj.get(b).push({ to: a, w });
  }

  pt(id) {
    return this.tmp?.get(id) || this.net.nodes.get(id);
  }

  /** Punto di aggancio di un morsetto alla rete di canaline */
  attach(end, key) {
    const n = this.net;
    const p = end.pos;
    if (end.zone === 'field') {
      let r = -1;
      let best = Infinity;
      n.rowRaceY.forEach((y, i) => {
        const d = y - p.y;
        if (d > -0.005 && d < best) {
          best = d;
          r = i;
        }
      });
      if (r < 0) r = n.rowRaceY.length - 1;
      let c = 0;
      n.colDuctX.forEach((x, i) => {
        if (x <= p.x) c = i;
      });
      const node = { id: key, x: p.x, y: n.rowRaceY[r], z: this.net.nodes.get(`F${c}_${r}`).z, kind: 'race', r };
      const links = [`F${c}_${r}`];
      if (c + 1 < n.colDuctX.length) links.push(`F${c + 1}_${r}`);
      return { node, links };
    }
    // quadro: canalina sopra (morsetti in alto) o sotto (morsetti in basso)
    const ys = n.panelDuctY;
    let k = -1;
    if (end.dir.y > 0) {
      let best = Infinity;
      ys.forEach((y, i) => {
        if (y > p.y && y - p.y < best) {
          best = y - p.y;
          k = i;
        }
      });
    } else {
      let best = Infinity;
      ys.forEach((y, i) => {
        if (y < p.y && p.y - y < best) {
          best = p.y - y;
          k = i;
        }
      });
    }
    if (k < 0) k = end.dir.y > 0 ? 0 : ys.length - 1;
    const node = { id: key, x: THREE.MathUtils.clamp(p.x, n.xL, n.xR), y: ys[k], z: this.net.nodes.get(`PL${k}`).z, kind: 'duct', k };
    return { node, links: [`PL${k}`, `PR${k}`] };
  }

  dijkstra(adj, from, to) {
    const dist = new Map([[from, 0]]);
    const prev = new Map();
    const open = new Set([from]);
    while (open.size) {
      let u = null;
      let bd = Infinity;
      for (const x of open) {
        const d = dist.get(x);
        if (d < bd) {
          bd = d;
          u = x;
        }
      }
      open.delete(u);
      if (u === to) break;
      for (const e of adj.get(u) || []) {
        const nd = bd + e.w;
        if (nd < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, nd);
          prev.set(e.to, u);
          open.add(e.to);
        }
      }
    }
    if (!dist.has(to)) return null;
    const path = [to];
    let c = to;
    while (prev.has(c)) {
      c = prev.get(c);
      path.push(c);
    }
    return path.reverse();
  }

  /**
   * @param a,b { pos:Vector3, dir:Vector3, zone:'panel'|'field', rail? }
   * @param lane indice di corsia (per distribuire i cavi nella canalina)
   * @returns {{ points: THREE.Vector3[], jumper: boolean }}
   */
  route(a, b, lane = 0) {
    const out0 = a.pos.clone().addScaledVector(a.dir, 0.007);
    const out1 = b.pos.clone().addScaledVector(b.dir, 0.007);

    // Ponticello diretto tra morsetti vicini (stessa guida, stesso lato)
    if (a.zone === 'panel' && b.zone === 'panel' && a.rail !== undefined && a.rail === b.rail && Math.sign(a.dir.y) === Math.sign(b.dir.y) && Math.abs(a.pos.x - b.pos.x) < JUMPER_MAX) {
      const h = 0.009 + (lane % 3) * 0.0035;
      const z = Math.max(a.pos.z, b.pos.z) + 0.004;
      const pts = [
        a.pos.clone(),
        a.pos.clone().addScaledVector(a.dir, h).setZ(z),
        b.pos.clone().addScaledVector(b.dir, h).setZ(z),
        b.pos.clone(),
      ];
      return { points: pts, jumper: true };
    }

    // Rete + nodi temporanei
    const adj = new Map();
    for (const [k, v] of this.adj) adj.set(k, v.slice());
    this.tmp = new Map();
    const A = this.attach(a, '#A');
    const B = this.attach(b, '#B');
    this.tmp.set('#A', A.node);
    this.tmp.set('#B', B.node);
    for (const l of A.links) this.link(adj, '#A', l);
    for (const l of B.links) this.link(adj, '#B', l);
    const sameDuct = (A.node.kind === 'duct' && B.node.kind === 'duct' && A.node.k === B.node.k) || (A.node.kind === 'race' && B.node.kind === 'race' && A.node.r === B.node.r);
    if (sameDuct) this.link(adj, '#A', '#B');
    const ids = this.dijkstra(adj, '#A', '#B') || ['#A', '#B'];
    const nodes = ids.map((id) => this.pt(id));
    this.tmp = null;

    // Corsia: sfalsamento nel piano della canalina e in profondità
    const o = ((lane % 7) - 3) * 0.0042;
    const dz = (Math.floor(lane / 7) % 3) * 0.009;
    const duct = nodes.map((n) => new THREE.Vector3(n.x + o, n.y + o, n.z + dz));
    // L'aggancio al primo/ultimo tratto resta sulla verticale del morsetto
    duct[0].x = a.pos.x;
    duct[duct.length - 1].x = b.pos.x;
    const pts = [a.pos.clone(), out0, ...duct, out1, b.pos.clone()];
    return { points: dedupe(pts), jumper: false };
  }
}

function dedupe(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].distanceToSquared(out[out.length - 1]) > 1e-8) out.push(pts[i]);
  }
  // rimuove punti allineati
  const res = [out[0]];
  for (let i = 1; i < out.length - 1; i++) {
    const d1 = out[i].clone().sub(res[res.length - 1]).normalize();
    const d2 = out[i + 1].clone().sub(out[i]).normalize();
    if (d1.dot(d2) < 0.9999) res.push(out[i]);
  }
  res.push(out[out.length - 1]);
  return res;
}

/** Curva con raccordi sugli spigoli */
export function smoothCurve(pts, radius = 0.012) {
  const path = new THREE.CurvePath();
  if (pts.length === 2) {
    path.add(new THREE.LineCurve3(pts[0], pts[1]));
    return path;
  }
  let prev = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const n = pts[i + 1];
    const d1 = p.clone().sub(prev);
    const d2 = n.clone().sub(p);
    const l1 = d1.length();
    const l2 = d2.length();
    const r = Math.min(radius, l1 * 0.5, l2 * 0.5);
    const a = p.clone().addScaledVector(d1.divideScalar(l1 || 1), -r);
    const b = p.clone().addScaledVector(d2.divideScalar(l2 || 1), r);
    if (a.distanceToSquared(prev) > 1e-10) path.add(new THREE.LineCurve3(prev.clone(), a));
    path.add(new THREE.QuadraticBezierCurve3(a, p.clone(), b));
    prev = b;
  }
  path.add(new THREE.LineCurve3(prev.clone(), pts[pts.length - 1].clone()));
  return path;
}

export function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
  return L;
}
