// Mattoncini comuni per le definizioni dei componenti (solo parte elettrica: nessuna dipendenza da Three.js).
import { cpolar, rad, cabs } from '../../sim/complex.js';
import { V_PHASE, thermalTripTime, fmtV } from '../../sim/norms.js';

// ── Elementi circuitali ───────────────────────────────────────────────────────────────
/** Contatto (chiuso = resistenza di contatto, aperto = nessun collegamento) */
export const sw = (name, a, b, closed) => ({ kind: 'SW', name, a, b, closed: !!closed });
/** Resistenza [Ω] */
export const res = (name, a, b, ohm) => ({ kind: 'Z', name, a, b, z: { re: ohm, im: 0 } });
/** Impedenza R + jX [Ω] */
export const imp = (name, a, b, re, im) => ({ kind: 'Z', name, a, b, z: { re, im } });
/** Impedenza in forma polare |Z|∠φ */
export const impPolar = (name, a, b, mag, phi) => imp(name, a, b, mag * Math.cos(phi), mag * Math.sin(phi));
/** Carico a potenza nominale P [W] e cosφ (induttivo), dimensionato alla tensione V */
export function load(name, a, b, P, cos = 1, V = V_PHASE) {
  const S = P / Math.max(0.05, cos);
  return impPolar(name, a, b, (V * V) / S, Math.acos(Math.min(1, cos)));
}
/** Generatore di tensione V∠φ con impedenza interna zs (equivalente di Norton) */
export const source = (name, a, b, V, phaseDeg, zs) => ({ kind: 'SRC', name, a, b, e: cpolar(V, rad(phaseDeg)), zs });
/** Trasformatore ideale con rapporto n = V1/V2 */
export const xfmr = (name, p1, p2, s1, s2, n) => ({ kind: 'XF', name, p1, p2, s1, s2, n });
/** Bobina di contattore/relè: potenza di mantenimento VA, cosφ */
export const coil = (name, a, b, Uc, VA = 7.5, cos = 0.3) => impPolar(name, a, b, (Uc * Uc) / VA, Math.acos(cos));

// ── Morsetti e parametri ──────────────────────────────────────────────────────────────
/**
 * Morsetto. role: 'L' | 'N' | 'PE' | 'coil' | 'aux' | 'ctrl'  ·  pos: 'top' | 'bottom'  ·  x: 0..1 sulla larghezza
 * side: 'line' (lato alimentazione) | 'load' (lato carico) — per l'analisi di coordinamento.
 */
export const T = (id, label, role, pos, x, side) => ({ id, label, role, pos, x, side });

export const P = {
  select: (key, label, options, def, extra = {}) => ({ key, label, type: 'select', options, default: def, ...extra }),
  number: (key, label, min, max, step, def, unit, extra = {}) => ({ key, label, type: 'number', min, max, step, default: def, unit, ...extra }),
  bool: (key, label, def = false, extra = {}) => ({ key, label, type: 'bool', default: def, ...extra }),
  text: (key, label, def = '', extra = {}) => ({ key, label, type: 'text', default: def, ...extra }),
};

export const distParam = (def) => P.number('dist', 'Distanza dal quadro', 1, 120, 1, def, 'm', {
  help: 'Lunghezza della linea tra il quadro e l’utenza: entra nel calcolo della caduta di tensione.',
});

/** Parametri risolti (default + valori del progetto) */
export function resolveParams(def, values = {}) {
  const out = {};
  for (const p of def.params || []) {
    const v = values[p.key];
    out[p.key] = v === undefined ? p.default : v;
  }
  return out;
}

// ── Logiche riusabili ────────────────────────────────────────────────────────────────
/**
 * Aggiorna lo stato di una bobina con isteresi (attrazione 80% Uc, rilascio 45% Uc)
 * e rileva la bobina bruciata per sovratensione. Ritorna true se lo stato è cambiato.
 */
export function coilUpdate(inst, ctx, a, b, Uc, { pull = 0.8, drop = 0.45, burn = 1.35 } = {}) {
  const s = inst.state;
  const v = cabs(ctx.Vd(a, b));
  s.vcoil = v;
  if (s.burnt) {
    if (s.coil) {
      s.coil = false;
      return true;
    }
    return false;
  }
  if (v > burn * Uc) {
    s.burnt = true;
    s.coil = false;
    ctx.emit({
      level: 'error',
      text: `${inst.tag}: bobina da ${Uc} V alimentata a ${fmtV(v)} — bobina bruciata! Controlla la tensione di comando.`,
      sound: 'burn',
    });
    return true;
  }
  if (!s.coil && v >= pull * Uc) {
    s.coil = true;
    return true;
  }
  if (s.coil && v < drop * Uc) {
    s.coil = false;
    return true;
  }
  return false;
}

/**
 * Integratore termico (bimetallo). θ = 1 → intervento. Ritorna true quando raggiunge la soglia.
 */
export function thermalUpdate(s, x, dt, k = 170, coolTime = 40) {
  const t = thermalTripTime(x, k);
  if (Number.isFinite(t)) s.theta = (s.theta || 0) + dt / t;
  else s.theta = Math.max(0, (s.theta || 0) - dt / coolTime);
  return s.theta >= 1;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
