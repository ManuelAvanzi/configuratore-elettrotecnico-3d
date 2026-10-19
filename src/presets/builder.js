// Piccolo linguaggio per descrivere impianti predefiniti (modelli di partenza e soluzioni delle esercitazioni).
import { Project, blankProject } from '../core/project.js';

/**
 * build({ sys, earth, title, supply:{...} }, (b) => { b.add(...); b.wire(...) })
 *   b.add(tag, type, mount, params)   mount: 'R1:4' (guida 1, modulo 5) · 'A2' (pannello, riga A colonna 2)
 *   b.wire('Q1:2', 'SA1:L', sezione, colore, conduttoriInParallelo)
 */
export function build(opts, fn) {
  const p = new Project(blankProject({ sys: opts.sys || '1F', earth: opts.earth || 'TT', title: opts.title || 'Impianto', source: opts.source || 'supply' }));
  if (p.supply()) Object.assign(p.supply().params, opts.supply || {});
  if (opts.description) p.data.meta.description = opts.description;
  const byTag = { XA: 'XA', PE: 'PE' };
  const api = {
    add(tag, type, where, params = {}, note = '') {
      let mount = null;
      if (typeof where === 'string') {
        const m = /^R(\d):([\d.]+)$/.exec(where);
        if (m) mount = { kind: 'din', rail: +m[1] - 1, pos: +m[2] };
        const f = /^([ABC])(\d)$/.exec(where);
        if (f) mount = { kind: 'field', row: 'ABC'.indexOf(f[1]), col: +f[2] - 1 };
      }
      const c = p.addComponent(type, mount, params, { tag, note });
      if (!c) throw new Error(`Preset: impossibile posizionare ${tag} (${type}) in ${where}`);
      byTag[tag] = c.id;
      return c;
    },
    wire(a, b, section = 1.5, color, n = 1) {
      const [ta, pa] = a.split(':');
      const [tb, pb] = b.split(':');
      const ra = { c: byTag[ta], t: pa };
      const rb = { c: byTag[tb], t: pb };
      if (!color) {
        const role = p.terminal(ra)?.role;
        const roleB = p.terminal(rb)?.role;
        color = role === 'PE' || roleB === 'PE' ? 'yg' : role === 'N' || roleB === 'N' ? 'blue' : 'brown';
      }
      const r = p.addWire(ra, rb, { section, color, n });
      if (r.error) throw new Error(`Preset: ${r.error} (${a} → ${b})`);
      return r.wire;
    },
  };
  fn(api);
  p.undoStack.length = 0;
  return p.toJSON();
}
