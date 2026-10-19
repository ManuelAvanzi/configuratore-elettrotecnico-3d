// Risolutore di reti in regime sinusoidale (analisi nodale modificata, MNA) con numeri complessi.
//
// Elementi supportati (indici di nodo: -1 = terra/riferimento):
//   Y  : ammettenza tra a e b                       { kind:'Y', a, b, y:{re,im} }
//   N  : generatore di Norton (V dietro Zs)         { kind:'N', a, b, y, is:{re,im} }  (is entra nel nodo a)
//   T  : trasformatore ideale V(p1-p2) = n·V(s1-s2) { kind:'T', p1, p2, s1, s2, n }   (1 incognita di corrente)
//
// La matrice è densa (Float64Array re/im interlacciati): per le dimensioni di un quadro didattico
// (qualche centinaio di nodi) l'eliminazione di Gauss con pivoting parziale è più che sufficiente,
// e il simulatore risolve solo quando qualcosa cambia (event-driven).

export class ComplexSystem {
  constructor(size) {
    this.n = size;
    this.A = new Float64Array(2 * size * size);
    this.b = new Float64Array(2 * size);
  }
  addA(i, j, re, im) {
    if (i < 0 || j < 0) return;
    const k = 2 * (i * this.n + j);
    this.A[k] += re;
    this.A[k + 1] += im;
  }
  addB(i, re, im) {
    if (i < 0) return;
    this.b[2 * i] += re;
    this.b[2 * i + 1] += im;
  }
  /** Stampa un'ammettenza tra i nodi a e b. */
  stampY(a, b, yr, yi) {
    this.addA(a, a, yr, yi);
    this.addA(b, b, yr, yi);
    this.addA(a, b, -yr, -yi);
    this.addA(b, a, -yr, -yi);
  }
  solve() {
    return solveComplexInPlace(this.n, this.A, this.b);
  }
}

/** Eliminazione di Gauss con pivoting parziale. Ritorna Float64Array(2n) oppure null se singolare. */
export function solveComplexInPlace(n, A, b) {
  for (let col = 0; col < n; col++) {
    let piv = col;
    let best = -1;
    for (let r = col; r < n; r++) {
      const k = 2 * (r * n + col);
      const m = A[k] * A[k] + A[k + 1] * A[k + 1];
      if (m > best) {
        best = m;
        piv = r;
      }
    }
    if (!(best > 1e-40)) return null;
    if (piv !== col) {
      const ra = 2 * piv * n;
      const rb = 2 * col * n;
      for (let c = 2 * col; c < 2 * n; c++) {
        const t = A[ra + c];
        A[ra + c] = A[rb + c];
        A[rb + c] = t;
      }
      let t = b[2 * piv];
      b[2 * piv] = b[2 * col];
      b[2 * col] = t;
      t = b[2 * piv + 1];
      b[2 * piv + 1] = b[2 * col + 1];
      b[2 * col + 1] = t;
    }
    const pk = 2 * (col * n + col);
    const pr = A[pk];
    const pi = A[pk + 1];
    const pd = pr * pr + pi * pi;
    const rowC = 2 * col * n;
    for (let r = col + 1; r < n; r++) {
      const rk = 2 * (r * n + col);
      const ar = A[rk];
      const ai = A[rk + 1];
      if (ar === 0 && ai === 0) continue;
      const fr = (ar * pr + ai * pi) / pd;
      const fi = (ai * pr - ar * pi) / pd;
      const rowR = 2 * r * n;
      for (let c = col; c < n; c++) {
        const xr = A[rowC + 2 * c];
        const xi = A[rowC + 2 * c + 1];
        if (xr === 0 && xi === 0) continue;
        A[rowR + 2 * c] -= fr * xr - fi * xi;
        A[rowR + 2 * c + 1] -= fr * xi + fi * xr;
      }
      const br = b[2 * col];
      const bi = b[2 * col + 1];
      b[2 * r] -= fr * br - fi * bi;
      b[2 * r + 1] -= fr * bi + fi * br;
    }
  }
  const x = new Float64Array(2 * n);
  for (let r = n - 1; r >= 0; r--) {
    let sr = b[2 * r];
    let si = b[2 * r + 1];
    const row = 2 * r * n;
    for (let c = r + 1; c < n; c++) {
      const ar = A[row + 2 * c];
      const ai = A[row + 2 * c + 1];
      if (ar === 0 && ai === 0) continue;
      const xr = x[2 * c];
      const xi = x[2 * c + 1];
      sr -= ar * xr - ai * xi;
      si -= ar * xi + ai * xr;
    }
    const pr = A[row + 2 * r];
    const pi = A[row + 2 * r + 1];
    const pd = pr * pr + pi * pi;
    x[2 * r] = (sr * pr + si * pi) / pd;
    x[2 * r + 1] = (si * pr - sr * pi) / pd;
  }
  return x;
}

/**
 * Risolve una rete descritta da elementi con indici di nodo già risolti.
 * @param {number} nNodes numero di nodi (esclusa la terra)
 * @param {Array} elements
 * @returns {{ ok:boolean, v:Float64Array, x:Float64Array, extra:Map }}
 */
export function solveNetwork(nNodes, elements) {
  // Incognite extra: una per ogni trasformatore ideale
  let m = 0;
  const extraIndex = new Map();
  for (const e of elements) {
    if (e.kind === 'T') extraIndex.set(e, nNodes + m++);
  }
  const size = nNodes + m;
  if (size === 0) return { ok: true, v: new Float64Array(0), x: new Float64Array(0), extraIndex };
  const sys = new ComplexSystem(size);
  for (const e of elements) {
    if (e.kind === 'Y') {
      sys.stampY(e.a, e.b, e.y.re, e.y.im);
    } else if (e.kind === 'N') {
      sys.stampY(e.a, e.b, e.y.re, e.y.im);
      sys.addB(e.a, e.is.re, e.is.im);
      sys.addB(e.b, -e.is.re, -e.is.im);
    } else if (e.kind === 'T') {
      const k = extraIndex.get(e);
      // KCL: corrente I1 entra in p1 ed esce da p2; al secondario I2 = -n·I1 entra in s1
      sys.addA(e.p1, k, 1, 0);
      sys.addA(e.p2, k, -1, 0);
      sys.addA(e.s1, k, -e.n, 0);
      sys.addA(e.s2, k, e.n, 0);
      // Vincolo: V(p1) - V(p2) - n·(V(s1) - V(s2)) = 0
      sys.addA(k, e.p1, 1, 0);
      sys.addA(k, e.p2, -1, 0);
      sys.addA(k, e.s1, -e.n, 0);
      sys.addA(k, e.s2, e.n, 0);
    }
  }
  const x = sys.solve();
  if (!x) return { ok: false, v: new Float64Array(2 * nNodes), x: new Float64Array(2 * size), extraIndex };
  return { ok: true, v: x.subarray(0, 2 * nNodes), x, extraIndex };
}
