// Lavagna interattiva (LIM) nell'aula 3D: cruscotto dell'impianto visibile a tutta la classe,
// anche dentro la realtà virtuale e sul proiettore.
import { DEFS } from '../catalog/defs/index.js';
import { summarize } from '../sim/checks.js';
import { exerciseById } from '../exercises/index.js';
import { fmt, fmtA, fmtW, fmtV } from '../sim/norms.js';
import { drawIcon } from './icons.js';

const W = 1920;
const H = 1080;

export class LimBoard {
  constructor(app) {
    this.app = app;
    this.t = 1;
    this.sig = '';
  }

  update(dt) {
    this.t += dt;
    if (this.t < 1) return;
    this.t = 0;
    const app = this.app;
    const sup = app.sim.getInst('XA');
    if (!sup) return;
    if (!app.isLab) return this.updateTutorial();
    const prot = app.project.components.filter((c) => DEFS[c.type].protection || c.type === 'km3' || c.type === 'km2m');
    const rows = prot.map((c) => {
      const s = app.sim.getInst(c.id)?.state || {};
      return [c.tag, c.type, s.on, s.tripped, s.cause, s.coil];
    });
    const res = app.checksPanel?.results || [];
    const ex = app.project.meta.exercise?.id ? exerciseById(app.project.meta.exercise.id) : null;
    const sig = JSON.stringify([sup.state.on, sup.state.limiter, Math.round(sup.state.P / 10), Math.round(sup.state.kWh * 1000), rows, summarize(res), res.slice(0, 5).map((r) => r.id), app.project.meta.title, ex?.id, app.guide.stepState, app.sim.events.at(-1)?.text]);
    if (sig === this.sig) return;
    this.sig = sig;
    this.draw(sup.state, prot, res, ex);
  }

  draw(s, prot, res, ex) {
    const app = this.app;
    const c = app.world.limCanvas;
    const g = c.getContext('2d');
    g.fillStyle = '#0f141a';
    g.fillRect(0, 0, W, H);
    // intestazione
    g.fillStyle = '#ff5900';
    g.fillRect(0, 0, 14, 120);
    g.fillStyle = '#ffffff';
    g.font = '800 54px Manrope, Arial';
    g.fillText(app.project.meta.title || 'Impianto', 60, 72);
    g.fillStyle = '#9aa6b2';
    g.font = '500 30px Inter, Arial';
    const sub = [app.project.meta.author, app.project.meta.classe, 'Configuratore elettrotecnico 3D · CarraroLab'].filter(Boolean).join(' · ');
    g.fillText(sub, 62, 112);

    // Alimentazione
    const on = s.on && !s.limiter;
    this.card(g, 40, 160, 560, 400, 'ALIMENTAZIONE', 'power');
    g.fillStyle = s.limiter ? '#ff5d62' : on ? '#38c77f' : '#6f7a86';
    g.beginPath();
    g.arc(90, 262, 16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e9eef3';
    g.font = '700 36px Manrope, Arial';
    g.fillText(s.limiter ? 'Contatore distaccato' : on ? 'Impianto alimentato' : 'Non alimentato', 122, 275);
    const vln = app.sim.measureV({ c: 'XA', t: 'L1' }, { c: 'XA', t: 'N' });
    const big = (label, value, x, y) => {
      g.fillStyle = '#6f7a86';
      g.font = '700 22px Manrope, Arial';
      g.fillText(label, x, y);
      g.fillStyle = '#ffffff';
      g.font = '600 50px Inter, Arial';
      g.fillText(value, x, y + 56);
    };
    big('TENSIONE', fmtV(vln), 72, 350);
    big('CORRENTE', fmtA(Math.max(...s.I)), 330, 350);
    big('POTENZA', fmtW(s.P), 72, 470);
    big('ENERGIA', `${fmt(s.kWh, 3)} kWh`, 330, 470);

    // Protezioni
    this.card(g, 640, 160, 620, 870, 'PROTEZIONI E COMANDI', 'shield');
    let y = 250;
    const list = prot.slice(0, 11);
    for (const comp of list) {
      const st = app.sim.getInst(comp.id)?.state || {};
      const def = DEFS[comp.type];
      const tripped = st.tripped;
      const isKm = comp.type === 'km3' || comp.type === 'km2m';
      const isOn = comp.type === 'fr3' ? !tripped : isKm ? st.coil : st.on;
      g.fillStyle = tripped ? '#ff5d62' : isOn ? '#38c77f' : '#6f7a86';
      g.beginPath();
      g.roundRect(676, y - 30, 16, 40, 5);
      g.fill();
      g.fillStyle = '#ffffff';
      g.font = '800 32px Manrope, Arial';
      g.fillText(comp.tag, 710, y);
      g.fillStyle = '#a1acb8';
      g.font = '500 24px Inter, Arial';
      g.fillText(def.short, 820, y);
      g.textAlign = 'right';
      g.fillStyle = tripped ? '#ff5d62' : '#e9eef3';
      g.font = '600 26px Inter, Arial';
      g.fillText(tripped ? `SCATTATO${st.cause ? ' · ' + st.cause : ''}` : comp.type === 'fr3' ? 'armato' : isKm ? (st.coil ? 'eccitato' : 'a riposo') : isOn ? 'ON' : 'OFF', 1224, y);
      g.textAlign = 'left';
      y += 70;
    }
    if (!list.length) {
      g.fillStyle = '#6f7a86';
      g.font = '500 28px Inter, Arial';
      g.fillText('Nessuna protezione installata', 676, y);
    }

    // Verifiche
    const sm = summarize(res);
    this.card(g, 1300, 160, 580, 470, 'VERIFICHE TECNICHE', 'checks');
    const stat = (n, label, col, x) => {
      g.fillStyle = col;
      g.font = '800 70px Manrope, Arial';
      g.fillText(String(n), x, 300);
      g.fillStyle = '#a1acb8';
      g.font = '500 24px Inter, Arial';
      g.fillText(label, x, 336);
    };
    stat(sm.error, 'errori', '#ff5d62', 1340);
    stat(sm.warn, 'avvisi', '#f3b640', 1520);
    stat(sm.ok, 'superate', '#38c77f', 1700);
    y = 400;
    for (const r of res.filter((x) => x.level === 'error' || x.level === 'warn').slice(0, 4)) {
      drawIcon(g, r.level === 'error' ? 'error' : 'warn', 1340, y - 26, 30, r.level === 'error' ? '#ff5d62' : '#f3b640', 2.2);
      g.fillStyle = '#e9eef3';
      g.font = '600 24px Inter, Arial';
      g.fillText(this.clip(g, r.title, 480), 1384, y);
      y += 52;
    }

    // Esercitazione
    this.card(g, 1300, 660, 580, 370, 'ESERCITAZIONE', 'school');
    g.font = '700 30px Manrope, Arial';
    g.fillStyle = '#ffffff';
    if (ex) {
      g.fillText(this.clip(g, ex.title, 520), 1340, 760);
      const st = app.guide.stepState || [];
      const done = st.filter(Boolean).length;
      g.fillStyle = '#28303b';
      g.fillRect(1340, 790, 500, 16);
      g.fillStyle = '#ff5900';
      g.fillRect(1340, 790, (500 * done) / ex.steps.length, 16);
      g.fillStyle = '#a1acb8';
      g.font = '500 24px Inter, Arial';
      g.fillText(`Passo ${Math.min(done + 1, ex.steps.length)} di ${ex.steps.length}`, 1340, 850);
      const cur = ex.steps[st.findIndex((d) => !d)];
      if (cur) this.wrap(g, cur.text, 1340, 900, 510, 32, 3, '#e9eef3', '500 25px Inter, Arial');
      else this.wrap(g, 'Tutti i passi completati: verifica il funzionamento!', 1340, 900, 510, 32, 2, '#38c77f', '600 26px Inter, Arial');
    } else {
      this.wrap(g, 'Nessuna esercitazione in corso. Scegline una nella scheda Esercitazioni.', 1340, 760, 510, 34, 3, '#a1acb8', '500 26px Inter, Arial');
    }

    // Ultimo evento
    this.card(g, 40, 590, 560, 440, 'ULTIMO EVENTO', 'activity');
    const ev = app.sim.events[app.sim.events.length - 1];
    this.wrap(g, ev?.text || 'Nessun evento: alimenta l’impianto e prova i comandi.', 72, 690, 500, 38, 7, ev?.level === 'error' ? '#ff8a8e' : ev?.level === 'warn' ? '#f5c86a' : '#e9eef3', '500 28px Inter, Arial');
    app.world.limTex.needsUpdate = true;
  }

  /** Nel tutorial la LIM mostra il passo corrente, grande, per tutta la classe */
  updateTutorial() {
    const app = this.app;
    const snap = app.tutorial?.snapshot();
    const sig = JSON.stringify(snap ? [snap.lesson.id, snap.index, snap.done, snap.quiz] : null);
    if (sig === this.sig) return;
    this.sig = sig;
    const g = app.world.limCanvas.getContext('2d');
    g.fillStyle = '#0f141a';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ff5900';
    g.fillRect(0, 0, 14, H);
    if (!snap) {
      g.fillStyle = '#ffffff';
      g.font = '800 72px Manrope, Arial';
      g.fillText('Tutorial guidato', 90, 250);
      this.wrap(g, 'Scegli una lezione per iniziare: una spiegazione alla volta, fino a far funzionare il circuito.', 90, 360, 1700, 64, 3, '#a1acb8', '500 46px Inter, Arial');
      app.world.limTex.needsUpdate = true;
      return;
    }
    const s = snap.step;
    g.fillStyle = '#ff7c3a';
    g.font = '800 38px Manrope, Arial';
    g.fillText(`LEZIONE ${snap.lesson.n} · ${snap.lesson.title.toUpperCase()}`, 90, 110);
    g.fillStyle = '#28303b';
    g.fillRect(90, 150, 1740, 16);
    g.fillStyle = '#ff5900';
    g.fillRect(90, 150, (1740 * (snap.index + 1)) / snap.total, 16);
    g.fillStyle = '#a1acb8';
    g.font = '600 32px Inter, Arial';
    g.fillText(`Passo ${snap.index + 1} di ${snap.total}`, 90, 222);
    g.fillStyle = '#ffffff';
    g.font = '800 86px Manrope, Arial';
    g.fillText(this.clip(g, s.title, 1740), 90, 350);
    this.wrap(g, s.text || '', 90, 450, 1740, 62, 5, '#dfe6ed', '500 46px Inter, Arial');
    if (s.todo && !snap.done) {
      g.fillStyle = '#2a1a10';
      g.beginPath();
      g.roundRect(90, 800, 1740, 170, 24);
      g.fill();
      drawIcon(g, 'pointer', 130, 848, 64, '#ff7c3a', 3);
      this.wrap(g, s.todo, 230, 872, 1560, 54, 2, '#ffd9bf', '600 40px Inter, Arial');
    } else if (snap.done && s.type !== 'info') {
      g.fillStyle = '#123524';
      g.beginPath();
      g.roundRect(90, 820, 1740, 130, 24);
      g.fill();
      drawIcon(g, 'ok', 130, 852, 64, '#38c77f', 3);
      g.fillStyle = '#b9f0d2';
      g.font = '700 48px Manrope, Arial';
      g.fillText(s.type === 'end' ? 'Lezione completata!' : 'Fatto! Si passa al prossimo passo.', 230, 900);
    }
    app.world.limTex.needsUpdate = true;
  }

  card(g, x, y, w, h, title, ic) {
    g.fillStyle = '#171d25';
    g.beginPath();
    g.roundRect(x, y, w, h, 22);
    g.fill();
    g.strokeStyle = '#28303b';
    g.lineWidth = 2;
    g.stroke();
    drawIcon(g, ic, x + 30, y + 26, 30, '#ff7c3a', 2.2);
    g.fillStyle = '#a1acb8';
    g.font = '800 24px Manrope, Arial';
    g.fillText(title, x + 74, y + 51);
  }

  clip(g, text, maxW) {
    if (g.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 3 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  wrap(g, text, x, y, maxW, lh, maxLines, color, font) {
    g.fillStyle = color;
    g.font = font;
    const words = text.split(' ');
    let line = '';
    let n = 0;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (g.measureText(test).width > maxW && line) {
        g.fillText(n === maxLines - 1 ? this.clip(g, line + ' ' + w, maxW) : line, x, y + n * lh);
        n++;
        line = w;
        if (n >= maxLines) return;
      } else line = test;
    }
    if (line && n < maxLines) g.fillText(line, x, y + n * lh);
  }
}
