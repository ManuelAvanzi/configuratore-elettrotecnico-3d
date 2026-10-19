// Numeri complessi (fasori) — rappresentazione {re, im}.
// Tutte le grandezze elettriche in regime sinusoidale sono fasori a valore efficace (RMS).

export const C = (re = 0, im = 0) => ({ re, im });
export const ZERO = Object.freeze(C(0, 0));

export const cadd = (a, b) => C(a.re + b.re, a.im + b.im);
export const csub = (a, b) => C(a.re - b.re, a.im - b.im);
export const cmul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const cscale = (a, k) => C(a.re * k, a.im * k);
export const cconj = (a) => C(a.re, -a.im);
export const cabs = (a) => Math.hypot(a.re, a.im);
export const carg = (a) => Math.atan2(a.im, a.re);
export const cpolar = (mag, rad) => C(mag * Math.cos(rad), mag * Math.sin(rad));
export const deg = (rad) => (rad * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;

export function cdiv(a, b) {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) return C(0, 0);
  return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}

export const cinv = (a) => cdiv(C(1, 0), a);

/** Potenza complessa S = V · I*  →  {P, Q, S} */
export function power(v, i) {
  const s = cmul(v, cconj(i));
  return { P: s.re, Q: s.im, S: Math.hypot(s.re, s.im) };
}
