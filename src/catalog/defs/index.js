// Registro delle definizioni elettriche dei componenti (senza grafica: usabile anche nei test Node).
import { supply, pebar, term } from './supply.js';
import { isol2p, isol4p, mcb1pn, mcb3p, mcb4p, rcd2p, rcd4p, rcbo1pn, fr3 } from './protection.js';
import { km3, km2m, kpp, kt, kcr, hl, sbm, sel, pm1 } from './control.js';
import { lamp, xs, sa, sd, si, sp, ss, pir, hb, m3 } from './field.js';
import { genset, imd, kls } from './nautico.js';

export const DEFS = {};
for (const d of [
  supply, pebar, term,
  isol2p, isol4p, mcb1pn, mcb3p, mcb4p, rcd2p, rcd4p, rcbo1pn, fr3,
  km3, km2m, kpp, kt, kcr, hl, sbm, sel, pm1,
  lamp, xs, sa, sd, si, sp, ss, pir, hb, m3,
  genset, imd, kls,
]) {
  DEFS[d.type] = d;
}

/** Famiglie per la libreria componenti (ordine di visualizzazione) */
export const FAMILIES = [
  { id: 'protezione', label: 'Manovra e protezione', mount: 'din' },
  { id: 'comando', label: 'Comando e automazione', mount: 'din' },
  { id: 'segnalazione', label: 'Segnalazione e misura', mount: 'din' },
  { id: 'morsetti', label: 'Morsetti', mount: 'din' },
  { id: 'utenze', label: 'Utenze', mount: 'field' },
  { id: 'campo', label: 'Comandi di campo', mount: 'field' },
  { id: 'alimentazione', label: 'Generazione (impianti di bordo)', mount: 'field' },
];

export const getDef = (type) => DEFS[type];

/** Moduli DIN occupati (anche frazionari) */
export const modulesOf = (def, params) => (typeof def.modules === 'function' ? def.modules(params) : def.modules || 1);
