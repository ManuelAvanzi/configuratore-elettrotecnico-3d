// Scheda tecnica del progetto (output finale del laboratorio): documento stampabile / salvabile in PDF
// con immagini del banco, dati di fornitura, distinta, collegamenti, verifiche, misure e motivazioni.
import { DEFS } from '../catalog/defs/index.js';
import { resolveParams } from '../catalog/defs/common.js';
import { mountLabel } from '../core/layout.js';
import { colorById, fmt, fmtA, fmtV, fmtW, V_PHASE } from '../sim/norms.js';
import { cabs, csub, power } from '../sim/complex.js';
import { summarize, CHECK_GROUPS } from '../sim/checks.js';
import { exerciseById, exerciseContext } from '../exercises/index.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const svg = (d) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px">${d}</svg>`;
const ICO = {
  ok: svg('<path d="M20 6 9 17l-5-5"/>'),
  ko: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  todo: svg('<circle cx="12" cy="12" r="8"/>'),
};

function paramText(def, params) {
  return (def.params || [])
    .filter((p) => !p.teacher && p.key !== 'dist')
    .map((p) => {
      const v = params[p.key];
      const o = p.options?.find((q) => (typeof q === 'object' ? q.value : q) === v);
      const val = o && typeof o === 'object' ? o.label.split(' — ')[0] : `${String(v).replace('.', ',')}${p.unit ? ' ' + p.unit : ''}`;
      return `${p.label}: ${val}`;
    })
    .join('; ');
}

function snapshots(app) {
  const st = app.stage;
  const cam = st.camera;
  const pos = cam.position.clone();
  const tgt = st.controls.target.clone();
  const out = {};
  const views = app.world.views(1400 / 788, cam.fov);
  for (const id of ['panoramica', 'quadro', 'utenze']) {
    cam.position.copy(views[id].pos);
    st.controls.target.copy(views[id].target);
    cam.lookAt(views[id].target);
    cam.updateMatrixWorld();
    out[id] = st.snapshot(1400, 788);
  }
  cam.position.copy(pos);
  st.controls.target.copy(tgt);
  cam.lookAt(tgt);
  st.controls.update();
  return out;
}

export function openReport(app) {
  const win = window.open('', '_blank');
  if (!win) {
    app.toast('Il browser ha bloccato la finestra della scheda tecnica: consenti i popup per questo sito.', 'warn');
    return;
  }
  app.view.flag([], []);
  const p = app.project;
  const m = p.meta;
  const sp = p.params('XA');
  const imgs = snapshots(app);
  app.checksPanel.run();
  const checks = app.checksPanel.results;
  const sm = summarize(checks);
  const date = m.date ? new Date(m.date).toLocaleDateString('it-IT') : new Date().toLocaleDateString('it-IT');

  // Distinta
  const order = (c) => (c.type === 'supply' ? -1 : c.type === 'pebar' ? 998 : c.mount.kind === 'din' ? c.mount.rail * 100 + c.mount.pos : 500 + c.mount.row * 10 + c.mount.col);
  const comps = [...p.components].sort((a, b) => order(a) - order(b));
  const bom = comps.map((c) => {
    const def = DEFS[c.type];
    const prm = resolveParams(def, c.params);
    return `<tr><td class="tag">${esc(c.tag)}</td><td>${esc(def.name)}${c.label ? `<div class="sub">${esc(c.label)}</div>` : ''}</td><td>${esc(mountLabel(c.mount))}</td><td class="small">${esc(paramText(def, prm)) || '—'}</td></tr>`;
  }).join('');

  // Collegamenti
  const wires = p.wires.map((w, i) => {
    const a = `${p.comp(w.a.c)?.tag}:${p.terminal(w.a)?.label}`;
    const b = `${p.comp(w.b.c)?.tag}:${p.terminal(w.b)?.label}`;
    const col = colorById(w.color);
    return `<tr><td>${i + 1}</td><td class="tag">${esc(a)}</td><td class="tag">${esc(b)}</td><td><span class="dot" style="background:${col.stripe ? `linear-gradient(135deg, ${col.hex} 50%, ${col.stripe} 50%)` : col.hex}"></span>${esc(col.label)}</td><td>${fmt(w.section, 1)} mm²</td><td>${fmt(p.electricalLength(w), p.electricalLength(w) < 1 ? 2 : 1)} m${w.lengthMode === 'manual' ? '' : ' (auto)'}</td></tr>`;
  }).join('');

  // Verifiche
  const lvl = { ok: 'Superata', warn: 'Attenzione', error: 'Non conforme', info: 'Informazione' };
  const chk = CHECK_GROUPS.map((g) => {
    const items = checks.filter((r) => r.group === g.id);
    if (!items.length) return '';
    return `<h3>${esc(g.label)}</h3><table><tbody>${items.map((r) => `<tr class="lv-${r.level}"><td class="badge"><span>${lvl[r.level]}</span></td><td><b>${esc(r.title)}</b><div class="sub">${esc(r.detail)}</div></td></tr>`).join('')}</tbody></table>`;
  }).join('');

  // Misure in esercizio
  const sup = app.sim.getInst('XA')?.state;
  let meas = '';
  if (sup?.on) {
    const rows = [];
    for (const c of comps) {
      const def = DEFS[c.type];
      if (!def.load) continue;
      const terms = def.terminals(p.params(c.id));
      const L = terms.find((t) => t.role === 'L');
      const N = terms.find((t) => t.role === 'N');
      if (!L || !N) continue;
      const v = cabs(csub(app.sim.terminalV(c.id, L.id), app.sim.terminalV(c.id, N.id)));
      const inst = app.sim.getInst(c.id);
      const el = c.type === 'lamp' ? 'z' : c.type === 'xs' ? 'app' : c.type === 'hb' ? 'z' : null;
      const i = el ? app.sim.I(c.id + '/' + el) : { re: 0, im: 0 };
      const pw = el ? power(csub(app.sim.terminalV(c.id, L.id), app.sim.terminalV(c.id, N.id)), i).P : 0;
      void inst;
      rows.push(`<tr><td class="tag">${esc(c.tag)}</td><td>${esc(def.short)}${c.label ? ` · ${esc(c.label)}` : ''}</td><td>${fmtV(v)}</td><td>${fmtA(cabs(i))}</td><td>${fmtW(pw)}</td><td>${v > 20 ? fmt(((V_PHASE - v) / V_PHASE) * 100, 2) + ' %' : '—'}</td></tr>`);
    }
    meas = `<p>Impianto alimentato al momento della generazione: potenza prelevata <b>${fmtW(sup.P)}</b>, energia ${fmt(sup.kWh, 3)} kWh.</p>
      ${rows.length ? `<table><thead><tr><th>Sigla</th><th>Utenza</th><th>Tensione</th><th>Corrente</th><th>Potenza</th><th>ΔV</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : ''}`;
  } else meas = '<p class="muted">Impianto non alimentato al momento della generazione: alimentalo per riportare tensioni, correnti e cadute di tensione misurate.</p>';

  // Motivazioni
  const notes = comps.filter((c) => c.note?.trim()).map((c) => `<div class="note"><b>${esc(c.tag)} · ${esc(DEFS[c.type].short)}</b><p>${esc(c.note).replace(/\n/g, '<br>')}</p></div>`).join('') || '<p class="muted">Nessuna motivazione inserita. Scrivile nel pannello Proprietà di ogni componente (“Motivazione della scelta”).</p>';

  // Esercitazione
  let exHtml = '';
  const ex = m.exercise?.id ? exerciseById(m.exercise.id) : null;
  if (ex) {
    const c = exerciseContext(app);
    const steps = ex.steps.map((s) => {
      let d = false;
      try {
        d = s.done(c);
      } catch {
        d = false;
      }
      return `<li class="${d ? 'done' : ''}">${d ? ICO.ok : ICO.todo}${esc(s.text)}</li>`;
    }).join('');
    const res = app.guide.results?.id === ex.id ? app.guide.results.out : null;
    exHtml = `<section><h2>Esercitazione: ${esc(ex.title)}</h2>
      <p class="sub">${esc(ex.level)} · ${esc(ex.duration)}${m.exercise.completed ? ' · prove superate il ' + new Date(m.exercise.completed).toLocaleDateString('it-IT') : ''}</p>
      <h3>Passi</h3><ul class="steps">${steps}</ul>
      ${res ? `<h3>Prove di funzionamento</h3><ul class="steps">${res.map((r) => `<li class="${r.ok ? 'done' : 'ko'}">${r.ok ? ICO.ok : ICO.ko}${esc(r.label)}</li>`).join('')}</ul>` : ''}
      <h3>Analisi guidata</h3>${ex.questions.map((q) => `<div class="q"><b>${esc(q)}</b><div class="lines"></div></div>`).join('')}</section>`;
  }

  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scheda tecnica — ${esc(m.title)}</title>
<style>
:root{--acc:#ff5900;--ink:#1d2127;--mut:#5d6773;--line:#dfe3e8}
*{box-sizing:border-box} body{margin:0;background:#eef0f3;color:var(--ink);font:13px/1.5 'Segoe UI',Inter,Arial,sans-serif}
.bar{position:sticky;top:0;background:#12161b;color:#fff;display:flex;gap:10px;align-items:center;padding:10px 18px;z-index:2}
.bar b{font-family:Manrope,'Segoe UI',Arial;margin-right:auto} .bar button{background:var(--acc);color:#fff;border:0;border-radius:7px;padding:8px 14px;font-weight:700;cursor:pointer}
.bar button.sec{background:#2a313a}
.page{max-width:900px;margin:22px auto;background:#fff;padding:40px 46px;box-shadow:0 6px 30px rgba(0,0,0,.08)}
header{display:flex;gap:18px;align-items:center;border-bottom:3px solid var(--acc);padding-bottom:18px;margin-bottom:22px}
.mark{width:54px;height:54px;border-radius:12px;background:var(--acc);display:grid;place-items:center;flex:none}
h1{font-family:Manrope,'Segoe UI',Arial;font-size:26px;margin:0} h2{font-family:Manrope,'Segoe UI',Arial;font-size:18px;margin:26px 0 10px;border-left:4px solid var(--acc);padding-left:10px}
h3{font-size:14px;margin:16px 0 6px} .sub{color:var(--mut);font-size:12px} .muted{color:var(--mut)}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px 16px;margin:4px 0 8px} .meta div span{display:block;color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.imgs{display:grid;grid-template-columns:1fr 1fr;gap:10px} .imgs img{width:100%;border-radius:8px;border:1px solid var(--line)} .imgs img:first-child{grid-column:1/-1}
table{width:100%;border-collapse:collapse;margin:6px 0 4px} th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut)} td.tag{font-weight:800;font-family:Manrope,'Segoe UI',Arial;white-space:nowrap} td.small{font-size:12px}
.dot{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:6px;vertical-align:-1px;border:1px solid rgba(0,0,0,.2)}
.badge span{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;white-space:nowrap}
.lv-ok .badge span{background:#e3f6ec;color:#1c7a47} .lv-warn .badge span{background:#fff4dc;color:#9a6a00} .lv-error .badge span{background:#fde6e7;color:#b3262c} .lv-info .badge span{background:#e6f1fe;color:#1d5fa8}
.summary{display:flex;gap:10px;margin:6px 0} .summary div{flex:1;border:1px solid var(--line);border-radius:8px;padding:8px 12px} .summary b{font-size:22px;display:block}
.note{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:8px 0} .note p{margin:4px 0 0}
.steps{list-style:none;padding:0} .steps li{padding:3px 0;color:var(--mut)} .steps li.done{color:#1c7a47} .steps li.ko{color:#b3262c}
.q{margin:10px 0} .lines{height:64px;background:repeating-linear-gradient(transparent 0 20px,#d5d9de 20px 21px)}
footer{margin-top:30px;padding-top:12px;border-top:1px solid var(--line);color:var(--mut);font-size:11px;display:flex;justify-content:space-between}
@media print{body{background:#fff}.bar{display:none}.page{box-shadow:none;margin:0;max-width:none;padding:0 4mm}section,table,.note{break-inside:avoid}h2{break-after:avoid}}
@page{size:A4;margin:14mm}
</style></head><body>
<div class="bar"><b>Scheda tecnica — ${esc(m.title)}</b><button onclick="window.print()">Stampa / Salva PDF</button><button class="sec" id="dl">Scarica HTML</button></div>
<div class="page">
<header><div class="mark"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>
<div><div class="sub">CarraroLab · Dispositivi elettrotecnici: configuratore 3D</div><h1>${esc(m.title)}</h1><div class="sub">Scheda tecnica del progetto impiantistico</div></div></header>
<div class="meta"><div><span>Studente / gruppo</span>${esc(m.author) || '—'}</div><div><span>Classe</span>${esc(m.classe) || '—'}</div><div><span>Istituto</span>${esc(m.school) || '—'}</div><div><span>Data</span>${date}</div></div>
${m.description ? `<p>${esc(m.description).replace(/\n/g, '<br>')}</p>` : ''}
<section><h2>Il banco configurato</h2><div class="imgs"><img src="${imgs.panoramica}" alt="Vista d'insieme"><img src="${imgs.quadro}" alt="Quadro elettrico"><img src="${imgs.utenze}" alt="Pannello utenze"></div></section>
<section><h2>Dati di fornitura</h2><table><tbody>
<tr><td>Sistema</td><td><b>${sp.sys === '3F' ? 'Trifase 400 V + N' : 'Monofase 230 V'}</b>, 50 Hz</td><td>Distribuzione</td><td><b>${esc(sp.earth)}</b></td></tr>
<tr><td>Potenza contrattuale</td><td><b>${fmt(sp.Pc, sp.Pc % 1 ? 1 : 0)} kW</b> (disponibile ${fmt(sp.Pc * 1.1, 2)} kW)</td><td>Icc presunta</td><td><b>${fmt(sp.Icc, 1)} kA</b></td></tr>
<tr><td>Resistenza di terra Re</td><td><b>${fmt(sp.Re, 0)} Ω</b></td><td></td><td></td></tr></tbody></table></section>
<section><h2>Distinta dei componenti</h2><table><thead><tr><th>Sigla</th><th>Componente</th><th>Posizione</th><th>Parametri</th></tr></thead><tbody>${bom}</tbody></table></section>
<section><h2>Elenco dei collegamenti</h2><table><thead><tr><th>N.</th><th>Da</th><th>A</th><th>Colore</th><th>Sezione</th><th>Lunghezza</th></tr></thead><tbody>${wires}</tbody></table></section>
<section><h2>Verifiche tecniche</h2><div class="summary"><div><b style="color:#b3262c">${sm.error}</b>non conformità</div><div><b style="color:#9a6a00">${sm.warn}</b>avvisi</div><div><b style="color:#1c7a47">${sm.ok}</b>verifiche superate</div></div>${chk}
<p class="sub">Verifiche semplificate a scopo didattico (CEI 64-8, CEI EN 60898-1, CEI EN 61008/61009, CEI-UNEL 35024/1).</p></section>
<section><h2>Misure in esercizio</h2>${meas}</section>
<section><h2>Motivazione delle scelte progettuali</h2>${notes}</section>
${exHtml}
<footer><span>Generato con il Configuratore elettrotecnico 3D — laboratorio immersivo CarraroLab</span><span>${new Date().toLocaleString('it-IT')}</span></footer>
</div>
<script>document.getElementById('dl').onclick=function(){var b=new Blob(['<!doctype html>'+document.documentElement.outerHTML],{type:'text/html'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=${JSON.stringify((m.title || 'impianto').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '-scheda-tecnica.html')};a.click();};</script>
</body></html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
