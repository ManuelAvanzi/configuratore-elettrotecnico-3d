// Dati tecnici e tabelle normative (valori didattici semplificati).
// Riferimenti: CEI 64-8, CEI EN 60898-1 (interruttori automatici), CEI EN 61008/61009 (differenziali),
// CEI-UNEL 35024/1 (portate dei cavi), CEI EN 60204-1 (colori dei conduttori).

/** Tensioni nominali del sistema BT */
export const V_PHASE = 230;
export const V_LINE = 400;
export const FREQ = 50;

/** Resistività del rame alla temperatura di esercizio (70 °C) [Ω·mm²/m] */
export const RHO_CU = 0.0214;

/** Resistenza di un contatto chiuso [Ω] */
export const R_CONTACT = 1e-3;

/** Sezioni commerciali [mm²] */
export const SECTIONS = [1, 1.5, 2.5, 4, 6, 10, 16];

/**
 * Portata Iz [A] — cavi unipolari in PVC in tubo su parete (metodo B1), 30 °C.
 * `2`: circuiti monofase (2 conduttori caricati) · `3`: circuiti trifase (3 conduttori caricati)
 */
export const IZ_TABLE = {
  2: { 1: 13.5, 1.5: 17.5, 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76 },
  3: { 1: 12, 1.5: 15.5, 2.5: 21, 4: 28, 6: 36, 10: 50, 16: 68 },
};

export function iz(section, loaded = 2) {
  const t = IZ_TABLE[loaded] || IZ_TABLE[2];
  return t[section] ?? 0;
}

/** Diametro esterno indicativo del cavo unipolare [mm] (per il disegno 3D) */
export function wireOuterDiameter(section) {
  return { 1: 2.6, 1.5: 3.0, 2.5: 3.6, 4: 4.2, 6: 4.8, 10: 6.2, 16: 7.3 }[section] ?? 3;
}

/** Colori dei conduttori (CEI EN 60446 / 60204-1) */
export const WIRE_COLORS = [
  { id: 'brown', label: 'Marrone', hex: '#6b3f24', use: 'fase' },
  { id: 'black', label: 'Nero', hex: '#1d1f22', use: 'fase' },
  { id: 'grey', label: 'Grigio', hex: '#8b9096', use: 'fase' },
  { id: 'blue', label: 'Blu', hex: '#1f64c8', use: 'neutro' },
  { id: 'yg', label: 'Giallo-verde', hex: '#3fae3a', stripe: '#f2d21b', use: 'protezione (PE)' },
  { id: 'red', label: 'Rosso', hex: '#c62828', use: 'circuiti ausiliari c.a.' },
  { id: 'white', label: 'Bianco', hex: '#e9e9e4', use: 'comandi / segnali' },
];

export const colorById = (id) => WIRE_COLORS.find((c) => c.id === id) || WIRE_COLORS[0];

/**
 * Soglie di intervento magnetico (multipli di In) — CEI EN 60898-1.
 * `lo`: nessun intervento sotto questa soglia · `hi`: intervento certo · `sim`: soglia usata dal simulatore
 */
export const CURVES = {
  B: { lo: 3, hi: 5, sim: 4 },
  C: { lo: 5, hi: 10, sim: 7.5 },
  D: { lo: 10, hi: 20, sim: 15 },
};

/**
 * Tempo di intervento termico indicativo [s] per un sovraccarico x = I/In.
 * Curva a tempo inverso “didattica”: 1,13·In non interviene, 1,45·In interviene in qualche minuto,
 * 2·In in circa un minuto, 5·In in pochi secondi. (Valori semplificati, NON da catalogo.)
 */
export function thermalTripTime(x, k = 170) {
  if (x <= 1.13) return Infinity;
  return k / (x * x - 1.1);
}

/**
 * Zone tempo-corrente degli effetti della corrente sul corpo umano (CEI/IEC 60479-1), semplificate.
 */
export function bodyZone(mA) {
  if (mA < 0.5) return { zone: 'AC-1', text: 'nessuna percezione' };
  if (mA < 10) return { zone: 'AC-2', text: 'percezione, di solito nessun effetto pericoloso' };
  if (mA < 30) return { zone: 'AC-3', text: 'contrazioni muscolari, difficoltà a staccarsi' };
  return { zone: 'AC-4', text: 'PERICOLO: rischio di fibrillazione ventricolare' };
}

/** Tensione di contatto limite convenzionale (ambienti ordinari) */
export const UL = 50;

/** Apparecchi utilizzatori collegabili alle prese */
export const APPLIANCES = [
  { id: 'none', label: 'Nessun apparecchio', P: 0 },
  { id: 'charger', label: 'Caricabatterie smartphone', P: 10, cos: 0.6, cls: 'II' },
  { id: 'desklamp', label: 'Lampada da scrivania', P: 40, cos: 1, cls: 'II' },
  { id: 'tv', label: 'Televisore', P: 120, cos: 0.95, cls: 'II' },
  { id: 'fridge', label: 'Frigorifero', P: 150, cos: 0.75, cls: 'I' },
  { id: 'pc', label: 'Personal computer', P: 300, cos: 0.95, cls: 'I' },
  { id: 'drill', label: 'Trapano', P: 750, cos: 0.85, cls: 'II' },
  { id: 'aircon', label: 'Condizionatore', P: 1200, cos: 0.85, cls: 'I' },
  { id: 'vacuum', label: 'Aspirapolvere', P: 1500, cos: 0.9, cls: 'II' },
  { id: 'hairdryer', label: 'Asciugacapelli', P: 1800, cos: 1, cls: 'II' },
  { id: 'washer', label: 'Lavatrice', P: 2000, cos: 0.9, cls: 'I' },
  { id: 'heater', label: 'Stufetta elettrica', P: 2000, cos: 1, cls: 'I' },
  { id: 'oven', label: 'Forno elettrico', P: 2200, cos: 1, cls: 'I' },
  { id: 'kettle', label: 'Bollitore', P: 2200, cos: 1, cls: 'I' },
  { id: 'short', label: 'Apparecchio in cortocircuito', P: 0, cls: 'I', short: true },
];

export const applianceById = (id) => APPLIANCES.find((a) => a.id === id) || APPLIANCES[0];

/** Formattazione numeri all'italiana */
export function fmt(v, digits = 1) {
  if (v === undefined || v === null || Number.isNaN(v)) return '—';
  if (!Number.isFinite(v)) return '∞';
  return v.toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtA(i) {
  if (i < 0.001) return '0 A';
  if (i < 1) return `${fmt(i * 1000, 0)} mA`;
  if (i >= 1000) return `${fmt(i / 1000, 2)} kA`;
  return `${fmt(i, i < 10 ? 2 : 1)} A`;
}

export function fmtW(p) {
  const a = Math.abs(p);
  if (a >= 1000) return `${fmt(p / 1000, 2)} kW`;
  return `${fmt(p, 0)} W`;
}

export function fmtV(v) {
  if (v < 1) return `${fmt(v, 2)} V`;
  return `${fmt(v, v < 100 ? 1 : 0)} V`;
}
