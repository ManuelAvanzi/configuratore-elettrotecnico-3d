// Pannello di interfaccia per la VR disegnato su canvas (texture su un piano), con pulsanti cliccabili
// tramite il raggio del controller. Modalità “immediata”: a ogni ridisegno si ricostruisce la lista dei widget.
import * as THREE from 'three';
import { drawIcon } from '../ui/icons.js';

export const UI = {
  bg: '#12161b',
  panel: '#1a2028',
  panel2: '#232a34',
  line: '#2c3440',
  text: '#e9eef3',
  muted: '#a1acb8',
  dim: '#6f7a86',
  accent: '#ff5900',
  ok: '#38c77f',
  warn: '#f3b640',
  error: '#ff5d62',
};

export class CanvasPanel {
  constructor({ px = [1024, 768], size = [0.3, 0.225] } = {}) {
    this.w = px[0];
    this.h = px[1];
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, transparent: true }));
    this.mesh.userData.panel = this;
    this.widgets = [];
    this.hovered = null;
    this.pressed = null;
    this.dirty = true;
  }

  // ── Primitive di disegno ──────────────────────────────────────────────────────────
  rect(x, y, w, h, fill, r = 14) {
    const g = this.g;
    g.fillStyle = fill;
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.fill();
  }
  text(t, x, y, { size = 26, color = UI.text, weight = 600, align = 'left', font = 'Inter', maxW } = {}) {
    const g = this.g;
    g.fillStyle = color;
    g.font = `${weight} ${size}px ${font}, Arial, sans-serif`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    let s = String(t);
    if (maxW) while (s.length > 2 && g.measureText(s).width > maxW) s = s.slice(0, -2) + '…';
    g.fillText(s, x, y);
    g.textAlign = 'left';
  }
  icon(name, x, y, size, color = UI.text) {
    drawIcon(this.g, name, x, y, size, color, 2.2);
  }

  /** Testo su più righe; ritorna la y dopo l'ultima riga */
  wrap(t, x, y, maxW, lh, maxLines, { size = 24, color = UI.text, weight = 500, font = 'Inter' } = {}) {
    const g = this.g;
    g.font = `${weight} ${size}px ${font}, Arial, sans-serif`;
    g.fillStyle = color;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    const words = String(t).split(' ');
    let line = '';
    let n = 0;
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (g.measureText(test).width > maxW && line) {
        const last = n === maxLines - 1;
        g.fillText(last ? line + ' …' : line, x, y + n * lh);
        n++;
        line = words[i];
        if (n >= maxLines) return y + n * lh;
      } else line = test;
    }
    if (line) {
      g.fillText(line, x, y + n * lh);
      n++;
    }
    return y + n * lh;
  }

  /** Pulsante: registra l'area cliccabile e lo disegna */
  button(id, x, y, w, h, { label, icon, active = false, color, onClick, onDown, onUp, small = false, disabled = false } = {}) {
    const hov = this.hovered === id && !disabled;
    const bg = active ? (color || UI.accent) : hov ? UI.panel2 : UI.panel;
    this.rect(x, y, w, h, bg, 14);
    if (hov && !active) {
      this.g.strokeStyle = UI.dim;
      this.g.lineWidth = 2;
      this.g.beginPath();
      this.g.roundRect(x + 1, y + 1, w - 2, h - 2, 13);
      this.g.stroke();
    }
    const col = disabled ? UI.dim : active ? '#fff' : UI.text;
    const fs = small ? 22 : 26;
    if (icon && label) {
      const iconSize = small ? 26 : 32;
      this.icon(icon, x + 16, y + h / 2 - iconSize / 2, iconSize, col);
      this.text(label, x + 24 + iconSize, y + h / 2 + 1, { size: fs, color: col, weight: 700, font: 'Manrope', maxW: w - iconSize - 36 });
    } else if (icon) {
      const s = Math.min(w, h) * 0.5;
      this.icon(icon, x + w / 2 - s / 2, y + h / 2 - s / 2, s, col);
    } else if (label) {
      this.text(label, x + w / 2, y + h / 2 + 1, { size: fs, color: col, weight: 700, align: 'center', font: 'Manrope', maxW: w - 12 });
    }
    if (!disabled) this.widgets.push({ id, x, y, w, h, onClick, onDown, onUp });
  }

  begin(bg = UI.bg) {
    this.widgets = [];
    const g = this.g;
    g.clearRect(0, 0, this.w, this.h);
    this.rect(0, 0, this.w, this.h, bg, 34);
  }

  end() {
    this.tex.needsUpdate = true;
    this.dirty = false;
  }

  // ── Interazione ───────────────────────────────────────────────────────────────────
  hit(uv) {
    const x = uv.x * this.w;
    const y = (1 - uv.y) * this.h;
    for (let i = this.widgets.length - 1; i >= 0; i--) {
      const w = this.widgets[i];
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return w;
    }
    return null;
  }

  hover(uv) {
    const w = uv ? this.hit(uv) : null;
    const id = w?.id || null;
    if (id !== this.hovered) {
      this.hovered = id;
      this.dirty = true;
    }
  }

  down(uv) {
    const w = this.hit(uv);
    this.pressed = w;
    w?.onDown?.();
    return !!w;
  }

  up(uv) {
    const w = uv ? this.hit(uv) : null;
    const p = this.pressed;
    this.pressed = null;
    p?.onUp?.();
    if (p && w && w.id === p.id) p.onClick?.();
    this.dirty = true;
  }
}

/** Etichetta fluttuante (tooltip in VR) */
export class FloatLabel {
  constructor() {
    this.panel = new CanvasPanel({ px: [640, 150], size: [0.2, 0.047] });
    this.panel.mesh.renderOrder = 30;
    this.panel.mesh.material.depthTest = false;
    this.mesh = this.panel.mesh;
    this.mesh.visible = false;
    this.last = '';
  }
  set(title, sub) {
    const key = title + '|' + (sub || '');
    if (key === this.last) return;
    this.last = key;
    const p = this.panel;
    p.begin('rgba(16,20,25,0.92)');
    p.text(title, 26, sub ? 50 : 75, { size: 38, weight: 800, font: 'Manrope', maxW: 590 });
    if (sub) p.text(sub, 26, 108, { size: 28, color: UI.muted, maxW: 590 });
    p.end();
  }
}
