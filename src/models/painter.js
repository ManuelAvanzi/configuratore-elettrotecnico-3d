// Disegno delle serigrafie dei dispositivi su canvas, in millimetri (origine al centro del fronte, y verso l'alto).
import { makeCanvas, canvasTexture } from '../scene/materials.js';

export const PX_PER_MM = 5.6;

export class Painter {
  /**
   * @param {number} wMm larghezza del fronte [mm]
   * @param {number} hMm altezza del fronte [mm]
   * @param {string} bg colore di fondo
   */
  constructor(wMm, hMm, bg = '#f1f1ec', pxmm = PX_PER_MM) {
    this.w = wMm;
    this.h = hMm;
    this.k = pxmm;
    this.canvas = makeCanvas(Math.max(8, Math.round(wMm * pxmm)), Math.max(8, Math.round(hMm * pxmm)));
    this.g = this.canvas.getContext('2d');
    this.g.fillStyle = bg;
    this.g.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
  X(x) {
    return (x + this.w / 2) * this.k;
  }
  Y(y) {
    return (this.h / 2 - y) * this.k;
  }
  rect(x, y, w, h, fill, radius = 0) {
    const g = this.g;
    g.fillStyle = fill;
    g.beginPath();
    g.roundRect(this.X(x - w / 2), this.Y(y + h / 2), w * this.k, h * this.k, radius * this.k);
    g.fill();
  }
  strokeRect(x, y, w, h, color, lw = 0.3, radius = 0) {
    const g = this.g;
    g.strokeStyle = color;
    g.lineWidth = lw * this.k;
    g.beginPath();
    g.roundRect(this.X(x - w / 2), this.Y(y + h / 2), w * this.k, h * this.k, radius * this.k);
    g.stroke();
  }
  text(str, x, y, size, { color = '#1d2024', weight = 700, align = 'center', font = 'Manrope', maxW = null } = {}) {
    const g = this.g;
    g.fillStyle = color;
    g.font = `${weight} ${size * this.k}px ${font}, Arial, sans-serif`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    if (maxW) {
      const m = g.measureText(str).width;
      if (m > maxW * this.k) {
        g.save();
        const s = (maxW * this.k) / m;
        g.translate(this.X(x), this.Y(y));
        g.scale(s, 1);
        g.fillText(str, 0, 0);
        g.restore();
        return;
      }
    }
    g.fillText(str, this.X(x), this.Y(y));
  }
  line(pts, color = '#1d2024', lw = 0.35) {
    const g = this.g;
    g.strokeStyle = color;
    g.lineWidth = lw * this.k;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(this.X(x), this.Y(y)) : g.moveTo(this.X(x), this.Y(y))));
    g.stroke();
  }
  circle(x, y, r, { fill = null, stroke = null, lw = 0.35 } = {}) {
    const g = this.g;
    g.beginPath();
    g.arc(this.X(x), this.Y(y), r * this.k, 0, Math.PI * 2);
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = lw * this.k;
      g.stroke();
    }
  }
  texture() {
    return canvasTexture(this.canvas);
  }

  // ── Simboli IEC semplificati ──────────────────────────────────────────────────────
  symBreaker(x, y, s = 1, { rcd = false, thermal = true, color = '#1d2024' } = {}) {
    const k = s;
    this.line([[x, y + 5 * k], [x, y + 2.2 * k]], color);
    this.line([[x, y - 5 * k], [x, y - 1.6 * k], [x - 2.2 * k, y + 1.9 * k]], color);
    this.line([[x - 0.8 * k, y + 2.9 * k], [x + 0.8 * k, y + 1.5 * k]], color);
    this.line([[x + 0.8 * k, y + 2.9 * k], [x - 0.8 * k, y + 1.5 * k]], color);
    if (thermal) this.line([[x + 1.2 * k, y - 0.4 * k], [x + 2.6 * k, y - 0.4 * k], [x + 2.6 * k, y + 0.6 * k], [x + 3.4 * k, y + 0.6 * k]], color, 0.28);
    if (rcd) {
      this.g.beginPath();
      this.g.ellipse(this.X(x), this.Y(y - 3 * k), 1.8 * k * this.k, 0.8 * k * this.k, 0, 0, Math.PI * 2);
      this.g.strokeStyle = color;
      this.g.lineWidth = 0.3 * this.k;
      this.g.stroke();
    }
  }
  symCoil(x, y, s = 1, color = '#1d2024') {
    this.line([[x, y + 4 * s], [x, y + 1.5 * s]], color);
    this.line([[x, y - 4 * s], [x, y - 1.5 * s]], color);
    this.strokeRect(x, y, 4 * s, 3 * s, color, 0.35);
  }
  symLamp(x, y, s = 1, color = '#1d2024') {
    this.circle(x, y, 2.2 * s, { stroke: color });
    this.line([[x - 1.5 * s, y - 1.5 * s], [x + 1.5 * s, y + 1.5 * s]], color);
    this.line([[x - 1.5 * s, y + 1.5 * s], [x + 1.5 * s, y - 1.5 * s]], color);
  }
  symClock(x, y, s = 1, color = '#1d2024') {
    this.circle(x, y, 2.3 * s, { stroke: color });
    this.line([[x, y + 1.5 * s], [x, y], [x + 1.2 * s, y - 0.6 * s]], color, 0.3);
  }
  symEarth(x, y, s = 1, color = '#1d2024') {
    this.line([[x, y + 2.5 * s], [x, y + 0.5 * s]], color);
    this.line([[x - 2 * s, y + 0.5 * s], [x + 2 * s, y + 0.5 * s]], color);
    this.line([[x - 1.3 * s, y - 0.5 * s], [x + 1.3 * s, y - 0.5 * s]], color);
    this.line([[x - 0.6 * s, y - 1.5 * s], [x + 0.6 * s, y - 1.5 * s]], color);
  }
  symSun(x, y, s = 1, color = '#1d2024') {
    this.circle(x, y, 1.3 * s, { stroke: color });
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      this.line([[x + Math.cos(a) * 2 * s, y + Math.sin(a) * 2 * s], [x + Math.cos(a) * 2.9 * s, y + Math.sin(a) * 2.9 * s]], color, 0.28);
    }
  }
}
