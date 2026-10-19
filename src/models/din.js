// Modelli procedurali dei dispositivi modulari su guida DIN (dimensioni reali: modulo 17,5 mm).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT, makeCanvas, canvasTexture } from '../scene/materials.js';
import { Painter } from './painter.js';
import { LAYOUT } from '../core/layout.js';

const MOD = LAYOUT.din.moduleW;

export const PROFILES = {
  modular: { h: 0.09, noseH: 0.045, shoulderZ: 0.044, noseZ: 0.066, screwY: 0.036, entryZ: 0.018 },
  industrial: { h: 0.09, noseH: 0.056, shoulderZ: 0.05, noseZ: 0.078, screwY: 0.0375, entryZ: 0.02 },
  terminal: { h: 0.056, noseH: 0.02, shoulderZ: 0.036, noseZ: 0.044, screwY: 0.0195, entryZ: 0.016 },
};

const SCREW_GEO = (() => {
  const g = new THREE.CylinderGeometry(0.0031, 0.0031, 0.0016, 18);
  g.rotateX(Math.PI / 2);
  return g;
})();
const SLOT_GEO = new THREE.BoxGeometry(0.0046, 0.0008, 0.0006);
const LEVER_COLORS = { dark: MAT.plasticDark, blue: MAT.plasticBlue, red: MAT.plasticRed, black: MAT.plasticBlack, grey: MAT.plasticMid };

function bandUV(geo, v0, v1) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
  uv.needsUpdate = true;
  return geo;
}

function emissiveMat(color, base = 0x222222) {
  return new THREE.MeshStandardMaterial({ color: base, emissive: new THREE.Color(color), emissiveIntensity: 0, roughness: 0.25, metalness: 0 });
}

export const LENS_COLORS = { green: '#35d46a', red: '#ff3b30', amber: '#ffb000', white: '#fff6e0', blue: '#3b8bff' };

/**
 * Costruisce un dispositivo modulare.
 * spec: { modules, profile, bodyMat, bg, terminals, paint(p, dims), lever, test, lens, button, lcd, dials, windowInd, led, manualLever }
 */
export function buildModular(spec) {
  const P = PROFILES[spec.profile || 'modular'];
  const W = spec.modules * MOD - 0.0006;
  const group = new THREE.Group();
  const parts = {};
  const interactive = [];

  // Corpo: blocco di base + “naso” frontale
  const base = new RoundedBoxGeometry(W, P.h, P.shoulderZ, 2, 0.0012);
  base.translate(0, 0, P.shoulderZ / 2);
  const noseD = P.noseZ - P.shoulderZ + 0.002;
  const nose = new RoundedBoxGeometry(W - 0.0006, P.noseH, noseD, 2, 0.0012);
  nose.translate(0, 0, P.shoulderZ - 0.001 + noseD / 2);
  const body = new THREE.Mesh(mergeGeometries([base, nose]), spec.bodyMat || MAT.plasticWhite);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  parts.body = body;
  base.dispose();
  nose.dispose();

  // Serigrafia (fronte + spalle) su un'unica texture
  const hMm = P.h * 1000;
  const wMm = W * 1000;
  const painter = new Painter(wMm, hMm, spec.bg || '#f1f1ec');
  const dims = { w: wMm, h: hMm, noseH: P.noseH * 1000, screwY: P.screwY * 1000 };
  const terms = spec.terminals || [];
  // numeri dei morsetti sulle spalle
  if (spec.termLabels !== false) {
    for (const t of terms) {
      const x = (t.x - 0.5) * wMm;
      const y = (t.pos === 'top' ? 1 : -1) * (dims.noseH / 2 + 3.2);
      painter.text(t.label, x, y, t.label.length > 2 ? 2.2 : 2.8, { color: spec.ink || '#30343a', weight: 800 });
    }
  }
  spec.paint?.(painter, dims);
  const tex = painter.texture();
  const labelMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const v = (y) => (y + P.h / 2) / P.h;
  const bandH = (P.h - P.noseH) / 2;
  const g1 = bandUV(new THREE.PlaneGeometry(W - 0.0004, bandH), v(P.noseH / 2), 1);
  g1.translate(0, P.noseH / 2 + bandH / 2, P.shoulderZ + 0.0002);
  const g2 = bandUV(new THREE.PlaneGeometry(W - 0.0012, P.noseH), v(-P.noseH / 2), v(P.noseH / 2));
  g2.translate(0, 0, P.noseZ + 0.0012);
  const g3 = bandUV(new THREE.PlaneGeometry(W - 0.0004, bandH), 0, v(-P.noseH / 2));
  g3.translate(0, -P.noseH / 2 - bandH / 2, P.shoulderZ + 0.0002);
  const labels = new THREE.Mesh(mergeGeometries([g1, g2, g3]), labelMat);
  labels.receiveShadow = true;
  group.add(labels);
  [g1, g2, g3].forEach((g) => g.dispose());

  // Viti dei morsetti e imbocchi dei cavi
  const screws = [];
  const darks = [];
  const terminals = new Map();
  for (const t of terms) {
    const s = t.pos === 'top' ? 1 : -1;
    const x = (t.x - 0.5) * W;
    const sg = SCREW_GEO.clone();
    sg.translate(x, s * P.screwY, P.shoulderZ + 0.0008);
    screws.push(sg);
    const slot = SLOT_GEO.clone();
    slot.rotateZ(0.6);
    slot.translate(x, s * P.screwY, P.shoulderZ + 0.0017);
    darks.push(slot);
    const hole = new THREE.BoxGeometry(0.0056, 0.0006, 0.0075);
    hole.translate(x, s * (P.h / 2 + 0.0002), P.entryZ);
    darks.push(hole);
    terminals.set(t.id, {
      screw: new THREE.Vector3(x, s * P.screwY, P.shoulderZ + 0.0016),
      entry: new THREE.Vector3(x, s * (P.h / 2), P.entryZ),
      dir: new THREE.Vector3(0, s, 0),
      def: t,
    });
  }
  if (screws.length) {
    const sm = new THREE.Mesh(mergeGeometries(screws), MAT.metalScrew);
    sm.castShadow = true;
    group.add(sm);
    screws.forEach((g) => g.dispose());
  }
  if (darks.length) {
    group.add(new THREE.Mesh(mergeGeometries(darks), MAT.slotDark));
    darks.forEach((g) => g.dispose());
  }

  const noseFront = P.noseZ + 0.001;

  // Leva di manovra
  if (spec.lever) {
    const lv = spec.lever;
    const pivot = new THREE.Group();
    pivot.position.set(lv.x || 0, lv.y || 0, noseFront - 0.004);
    const lw = lv.width || Math.max(0.006, W - (spec.modules > 1 ? 0.006 : 0.007));
    const lever = new THREE.Mesh(new RoundedBoxGeometry(lw, 0.0068, 0.0135, 2, 0.0012), LEVER_COLORS[lv.color || 'dark']);
    lever.position.z = 0.0072;
    lever.castShadow = true;
    lever.userData.action = lv.action || 'toggle';
    pivot.add(lever);
    group.add(pivot);
    parts.lever = pivot;
    parts.leverAngle = 0.5;
    interactive.push(lever);
  }
  // Tasto di prova del differenziale
  if (spec.test) {
    const tb = new THREE.Mesh(new RoundedBoxGeometry(0.0048, 0.0048, 0.004, 1, 0.0008), MAT.plasticYellow);
    tb.position.set(W / 2 - 0.0052, -0.0165, noseFront + 0.0012);
    tb.userData.action = 'test';
    tb.userData.momentary = true;
    tb.userData.hint = 'Tasto di prova T';
    group.add(tb);
    parts.test = tb;
    interactive.push(tb);
  }
  // Lente della spia
  if (spec.lens) {
    const mat = emissiveMat(spec.lens, 0x3a3a3a);
    mat.color = new THREE.Color(spec.lens).multiplyScalar(0.45);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.0063, 0.0066, 0.0045, 28), mat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.002, noseFront + 0.0018);
    group.add(lens);
    parts.lens = lens;
  }
  // Pulsante
  if (spec.button) {
    const b = spec.button;
    const bm = { green: MAT.plasticGreen, red: MAT.plasticRed, black: MAT.plasticBlack, amber: MAT.plasticYellow, blue: MAT.plasticBlue }[b.color] || MAT.plasticGreen;
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.007, 28), bm);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(0, b.y || 0, noseFront + 0.0025);
    btn.userData.action = b.action || 'press';
    btn.userData.momentary = true;
    btn.castShadow = true;
    group.add(btn);
    parts.button = btn;
    parts.buttonZ = btn.position.z;
    interactive.push(btn);
  }
  // Display LCD
  if (spec.lcd) {
    const c = makeCanvas(256, 112);
    const t = canvasTexture(c);
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(0.028, W - 0.005), 0.012), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    lcd.position.set(0, spec.lcd.y || 0.006, noseFront + 0.0004);
    group.add(lcd);
    parts.lcd = { canvas: c, tex: t, mesh: lcd, last: '' };
  }
  // Manopole di regolazione
  for (const d of spec.dials || []) {
    const dial = new THREE.Group();
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(d.r || 0.0042, (d.r || 0.0042) * 1.08, 0.004, 20), d.color === 'blue' ? MAT.plasticBlue : MAT.plasticMid);
    knob.rotation.x = Math.PI / 2;
    dial.add(knob);
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.0008, (d.r || 0.0042) * 0.9, 0.0008), MAT.plasticWhite);
    notch.position.set(0, (d.r || 0.0042) * 0.45, 0.0022);
    dial.add(notch);
    dial.position.set(d.x || 0, d.y || 0, noseFront + 0.002);
    dial.rotation.z = d.angle ?? 0;
    group.add(dial);
  }
  // Finestra di stato (contattori, relè)
  if (spec.windowInd) {
    const wi = spec.windowInd;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(wi.w || 0.009, wi.h || 0.005, 0.001), MAT.slotDark);
    frame.position.set(wi.x || 0, wi.y || 0, noseFront + 0.0003);
    group.add(frame);
    const ind = new THREE.Mesh(new THREE.BoxGeometry((wi.w || 0.009) * 0.8, (wi.h || 0.005) * 0.7, 0.0016), emissiveMat('#ff5a3c', 0x2b5d33));
    ind.position.set(wi.x || 0, wi.y || 0, noseFront + 0.0006);
    group.add(ind);
    parts.window = ind;
    parts.windowZ = ind.position.z;
  }
  // LED di stato
  if (spec.led) {
    const l = spec.led;
    const led = new THREE.Mesh(new THREE.CylinderGeometry(0.0017, 0.0017, 0.0018, 12), emissiveMat(l.color || '#35d46a', 0x283028));
    led.rotation.x = Math.PI / 2;
    led.position.set(l.x || 0, l.y || 0, noseFront + 0.0008);
    group.add(led);
    parts.led = led;
  }
  // Pulsanti extra (relè termico: ripristino e prova)
  for (const b of spec.extraButtons || []) {
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(b.r || 0.0036, b.r || 0.0036, 0.004, 20), b.mat);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(b.x, b.y, noseFront + 0.0018);
    btn.userData.action = b.action;
    btn.userData.hint = b.hint;
    group.add(btn);
    interactive.push(btn);
  }

  return { group, parts, interactive, terminals, labelMat, W, H: P.h, D: noseFront, profile: P };
}

// ── Aggiornamenti visivi comuni ────────────────────────────────────────────────────
export function animateLever(parts, on, dt, tripped = false) {
  if (!parts.lever) return;
  const target = on ? -0.52 : tripped ? 0.2 : 0.52;
  parts.leverAngle += (target - parts.leverAngle) * Math.min(1, dt * 22);
  parts.lever.rotation.x = parts.leverAngle;
}

export function setEmissive(mesh, k) {
  if (!mesh) return;
  const m = mesh.material;
  const v = Math.max(0, k);
  if (Math.abs(m.emissiveIntensity - v) > 0.01) m.emissiveIntensity = v;
}

export function drawLCD(lcd, lines, { bg = '#9fb98f', fg = '#18230f' } = {}) {
  const key = lines.join('|');
  if (lcd.last === key) return;
  lcd.last = key;
  const g = lcd.canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 112);
  g.fillStyle = fg;
  g.textBaseline = 'middle';
  g.font = '700 50px "Courier New", monospace';
  g.textAlign = 'right';
  g.fillText(lines[0] || '', 244, 44);
  g.font = '600 24px Inter, Arial';
  g.textAlign = 'left';
  g.fillText(lines[1] || '', 12, 92);
  g.textAlign = 'right';
  g.fillText(lines[2] || '', 244, 92);
  lcd.tex.needsUpdate = true;
}
