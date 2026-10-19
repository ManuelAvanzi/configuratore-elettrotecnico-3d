// Geometria logica del banco didattico: guide DIN del quadro e griglia del pannello utenze.
// (Le misure 3D corrispondenti sono in scene/World.js)

export const LAYOUT = {
  din: {
    rails: 4, // file di guide DIN nel quadro
    modules: 24, // moduli per guida (1 modulo = 17,5 mm)
    moduleW: 0.0175,
    step: 0.5, // passo di posizionamento (mezzo modulo, per i morsetti)
  },
  field: {
    cols: 5,
    rows: 3,
  },
};

export const RAIL_NAMES = ['Guida 1', 'Guida 2', 'Guida 3', 'Guida 4'];
export const FIELD_ROWS = ['A', 'B', 'C'];

export function mountLabel(m) {
  if (!m) return '—';
  if (m.kind === 'din') return `${RAIL_NAMES[m.rail]} · modulo ${String(m.pos + 1).replace('.', ',')}`;
  if (m.kind === 'field') return `Pannello utenze · ${FIELD_ROWS[m.row]}${m.col + 1}`;
  return 'Posizione fissa';
}
