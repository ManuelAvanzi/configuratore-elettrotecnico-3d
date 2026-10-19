// Modelli procedurali dei dispositivi del pannello utenze (serie civile da parete, lampade, motore...).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MAT, makeCanvas, canvasTexture } from '../scene/materials.js';
import { Painter } from './painter.js';
import { setEmissive } from './din.js';
import { mergeStatic } from '../scene/merge.js';
import { applianceById, fmt, fmtW } from '../sim/norms.js';
import { lampType, motorRated } from '../catalog/defs/field.js';

const STRIP_W = 0.11;
const STRIP_H = 0.024;
const STRIP_D = 0.026;

function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

const stripX = (x) => (0.14 + 0.76 * x - 0.5) * STRIP_W;

/** Morsettiera di derivazione dell'utenza, con numerazione e sigla */
function terminalStrip(terms, tag, y) {
  const g = new THREE.Group();
  g.position.y = y;
  mesh(new RoundedBoxGeometry(STRIP_W, STRIP_H, STRIP_D, 2, 0.002), MAT.plasticIvory, 0, 0, STRIP_D / 2, g);
  const p = new Painter(STRIP_W * 1000, STRIP_H * 1000, '#ebe8df', 8);
  p.text(tag, -STRIP_W * 500 + 7.5, -3.2, 5.2, { weight: 800, color: '#111' });
  const terminals = new Map();
  const sg = new THREE.CylinderGeometry(0.0033, 0.0033, 0.002, 18);
  sg.rotateX(Math.PI / 2);
  for (const t of terms) {
    const x = stripX(t.x);
    const col = t.role === 'PE' ? '#2f9a3a' : t.role === 'N' ? '#1f64c8' : '#30343a';
    p.text(t.label, x * 1000, -6.2, t.label.length > 2 ? 4.2 : 5.4, { weight: 800, color: col });
    p.circle(x * 1000, 4, 4.6, { fill: '#d6d2c6' });
    const s = mesh(sg, MAT.metalScrew, x, 0.004, STRIP_D + 0.0008, g);
    s.castShadow = false;
    const slot = mesh(new THREE.BoxGeometry(0.0048, 0.0008, 0.0006), MAT.slotDark, x, 0.004, STRIP_D + 0.0019, g);
    slot.rotation.z = 0.5;
    terminals.set(t.id, {
      screw: new THREE.Vector3(x, y + 0.004, STRIP_D + 0.0018),
      entry: new THREE.Vector3(x, y + STRIP_H / 2, STRIP_D * 0.5),
      dir: new THREE.Vector3(0, 1, 0),
      def: t,
    });
    const hole = mesh(new THREE.BoxGeometry(0.006, 0.0008, 0.008), MAT.slotDark, x, STRIP_H / 2 + 0.0002, STRIP_D * 0.5, g);
    hole.castShadow = false;
  }
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(STRIP_W - 0.002, STRIP_H - 0.002), new THREE.MeshStandardMaterial({ map: p.texture(), roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2 }));
  lab.position.z = STRIP_D + 0.0003;
  g.add(lab);
  // tubo corrugato verso l'utenza
  return { group: g, terminals };
}

function corrugated(parent, x, y0, y1, z) {
  const h = Math.abs(y1 - y0);
  if (h < 0.004) return;
  const t = mesh(new THREE.CylinderGeometry(0.0065, 0.0065, h, 12), MAT.plasticMid, x, (y0 + y1) / 2, z, parent);
  t.castShadow = false;
}

/** Scatola da parete + placca con supporto a 3 moduli */
function wallBox(parent, { dark = false, parts = null } = {}) {
  const a = mesh(new RoundedBoxGeometry(0.125, 0.085, 0.045, 2, 0.006), MAT.plasticIvory, 0, 0, 0.0225, parent);
  const plateMat = dark ? MAT.plasticDark : MAT.plasticWhite;
  const b = mesh(new RoundedBoxGeometry(0.134, 0.092, 0.008, 3, 0.004), plateMat, 0, 0, 0.049, parent);
  const c = mesh(new THREE.BoxGeometry(0.07, 0.047, 0.003), MAT.plasticGrey, 0, 0, 0.0525, parent);
  if (parts) parts.push(a, b, c);
  return 0.054; // quota del fronte del supporto
}

function blankModule(parent, x, z, parts = null) {
  const m = mesh(new RoundedBoxGeometry(0.0215, 0.044, 0.004, 1, 0.001), MAT.plasticWhite, x, 0, z + 0.002, parent);
  if (parts) parts.push(m);
}

/** Rende azionabile un insieme di parti (tutta la placca fa da tasto) */
function actionParts(list, action, momentary, hint) {
  for (const m of list) {
    m.userData.action = action;
    m.userData.momentary = momentary;
    if (hint) m.userData.hint = hint;
  }
  return list;
}

// ── Lampada ──────────────────────────────────────────────────────────────────────────
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,245,220,1)');
  r.addColorStop(0.25, 'rgba(255,225,170,0.55)');
  r.addColorStop(1, 'rgba(255,200,140,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  glowTex = canvasTexture(c);
  glowTex.userData.shared = true;
  return glowTex;
}

function lampModel(def, p, comp, terms) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.042, 0.045, 0.018, 36).rotateX(Math.PI / 2), MAT.plasticWhite, 0, 0, 0.009, g);
  mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.036, 24).rotateX(Math.PI / 2), MAT.plasticIvory, 0, 0, 0.036, g);
  const lt = lampType(p.lt);
  const warm = lt.kind === 'inc' ? '#ffcf8a' : '#fff1d6';
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xf2f1ec, emissive: new THREE.Color(warm), emissiveIntensity: 0, roughness: 0.35 });
  const bulb = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.019, 0.016, 0.018, 24).rotateX(Math.PI / 2), bulbMat, 0, 0, 0.063, bulb);
  const sphere = mesh(new THREE.SphereGeometry(0.031, 28, 20), bulbMat, 0, 0, 0.09, bulb);
  sphere.scale.set(1, 1, 1.05);
  bulb.userData.dynamic = true;
  g.add(bulb);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(warm), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(0.26);
  glow.position.set(0, 0, 0.095);
  g.add(glow);
  const strip = terminalStrip(terms, comp.tag, 0.09);
  g.add(strip.group);
  corrugated(g, 0, 0.078, 0.042, 0.013);
  // targhetta con potenza
  const pp = new Painter(46, 10, '#ffffff', 8);
  pp.text(lt.label.split(' (')[0], 0, 0, 4.2, { weight: 700, maxW: 44 });
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.046, 0.01), new THREE.MeshStandardMaterial({ map: pp.texture(), roughness: 0.6 }));
  tag.position.set(0, -0.058, 0.0015);
  g.add(tag);
  return {
    group: g,
    terminals: strip.terminals,
    parts: { bulbMat, glow, bulbPos: new THREE.Vector3(0, 0, 0.09) },
    interactive: [],
    update(inst) {
      const b = inst?.view.bright || 0;
      bulbMat.emissiveIntensity = b * 2.2;
      bulbMat.color.setHex(inst?.state.burnt ? 0x5a5550 : 0xf2f1ec);
      glow.material.opacity = Math.min(1, b) * 0.6;
      glow.scale.setScalar(0.1 + 0.07 * Math.min(1, b));
    },
    light: { pos: new THREE.Vector3(0, 0, 0.12), color: warm },
  };
}

// ── Prese ────────────────────────────────────────────────────────────────────────────
function socketFace(parent, type, z) {
  if (type === 'sch') {
    mesh(new RoundedBoxGeometry(0.044, 0.044, 0.005, 2, 0.003), MAT.plasticWhite, 0, 0, z + 0.0025, parent);
    const rec = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.002, 36).rotateX(Math.PI / 2), MAT.plasticGrey, 0, 0, z + 0.0052, parent);
    rec.castShadow = false;
    for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(0.0024, 0.0024, 0.002, 12).rotateX(Math.PI / 2), MAT.slotDark, sx * 0.0095, 0, z + 0.0062, parent);
    for (const sy of [-1, 1]) mesh(new THREE.BoxGeometry(0.006, 0.0025, 0.002), MAT.metalScrew, 0, sy * 0.0165, z + 0.006, parent);
    blankModule(parent, -0.0228 - 0.0005, z - 0.004);
  } else {
    mesh(new RoundedBoxGeometry(0.0215, 0.044, 0.005, 2, 0.002), MAT.plasticWhite, 0, 0, z + 0.0025, parent);
    mesh(new RoundedBoxGeometry(0.014, 0.034, 0.0015, 2, 0.004), MAT.plasticGrey, 0, 0, z + 0.0055, parent);
    for (const y of [-0.0085, 0, 0.0085]) mesh(new THREE.CylinderGeometry(y === 0 ? 0.0021 : 0.0017, y === 0 ? 0.0021 : 0.0017, 0.0015, 12).rotateX(Math.PI / 2), MAT.slotDark, 0, y, z + 0.0064, parent);
    blankModule(parent, -0.0225, z - 0.004);
    blankModule(parent, 0.0225, z - 0.004);
  }
}

function applianceTag(app, p) {
  const pt = new Painter(96, 44, '#fbfbf8', 7);
  pt.rect(-47 + 3, 0, 6, 44, '#ff5900');
  pt.text(app.label, 3, 9, 6.4, { weight: 800, align: 'center', maxW: 84 });
  pt.text(app.short ? 'GUASTO: CORTOCIRCUITO' : `${fmtW(app.P)} · classe ${app.cls}`, 3, -3, 5.6, { weight: 600, color: app.short ? '#c62828' : '#333' });
  const notes = [];
  if (p.guasto && p.guasto !== 'none' && app.cls === 'I') notes.push('guasto verso massa');
  if (p.persona && app.cls === 'I') notes.push('persona a contatto');
  if (notes.length) pt.text(notes.join(' · '), 3, -14, 5, { weight: 700, color: '#c62828', maxW: 86 });
  return pt.texture();
}

function socketModel(def, p, comp, terms) {
  const g = new THREE.Group();
  const z = wallBox(g);
  socketFace(g, p.tipo, z);
  const strip = terminalStrip(terms, comp.tag, 0.085);
  g.add(strip.group);
  corrugated(g, 0, 0.073, 0.0425, 0.013);
  const app = applianceById(p.carico);
  if (app.id !== 'none') {
    const plug = new THREE.Group();
    if (p.tipo === 'sch') mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.022, 28).rotateX(Math.PI / 2), MAT.plasticBlack, 0, 0, 0.011, plug);
    else mesh(new RoundedBoxGeometry(0.017, 0.036, 0.02, 2, 0.004), MAT.plasticWhite, 0, 0, 0.01, plug);
    plug.position.z = z + 0.006;
    g.add(plug);
    const cable = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.012, z + 0.02),
      new THREE.Vector3(0, -0.03, z + 0.028),
      new THREE.Vector3(0.01, -0.07, z + 0.03),
      new THREE.Vector3(0.015, -0.11, z + 0.022),
    ]);
    mesh(new THREE.TubeGeometry(cable, 20, 0.003, 8), app.cls === 'I' ? MAT.plasticBlack : MAT.plasticWhite, 0, 0, 0, g);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.096, 0.044), new THREE.MeshStandardMaterial({ map: applianceTag(app, p), roughness: 0.6, side: THREE.DoubleSide }));
    tag.position.set(0.015, -0.135, z + 0.02);
    tag.rotation.x = -0.12;
    tag.castShadow = true;
    g.add(tag);
  }
  return { group: g, terminals: strip.terminals, parts: {}, interactive: [], update() {} };
}

// ── Interruttori, deviatori, pulsanti ───────────────────────────────────────────────
function rockerTexture(kind, symbol) {
  const pt = new Painter(20, 42, '#f7f7f4', 10);
  if (kind === 'sa') pt.line([[-3, 15], [3, 15]], '#8a8f95', 0.8);
  if (kind === 'sd') {
    pt.line([[0, 17], [0, 12]], '#8a8f95', 0.7);
    pt.line([[-2, 14], [0, 17], [2, 14]], '#8a8f95', 0.7);
    pt.line([[0, -17], [0, -12]], '#8a8f95', 0.7);
    pt.line([[-2, -14], [0, -17], [2, -14]], '#8a8f95', 0.7);
  }
  if (kind === 'si') {
    pt.line([[-3, 16], [3, 12]], '#8a8f95', 0.7);
    pt.line([[3, 16], [-3, 12]], '#8a8f95', 0.7);
  }
  if (symbol === 'lamp') pt.symLamp(0, 0, 1.6, '#6d7278');
  if (symbol === 'bell') {
    pt.g.fillStyle = '#6d7278';
    pt.circle(0, 1, 4.5, { stroke: '#6d7278', lw: 0.8 });
    pt.line([[-5.5, -3], [5.5, -3]], '#6d7278', 0.8);
  }
  return pt.texture();
}

function switchModel(def, p, comp, terms) {
  const g = new THREE.Group();
  const plate = [];
  const z = wallBox(g, { parts: plate });
  const kind = def.type;
  const isBtn = kind === 'sp';
  blankModule(g, -0.0225, z - 0.004, plate);
  blankModule(g, 0.0225, z - 0.004, plate);
  const pivot = new THREE.Group();
  pivot.position.set(0, 0, z + 0.002);
  const mat = new THREE.MeshStandardMaterial({ map: rockerTexture(kind, isBtn ? p.symbol : null), roughness: 0.4 });
  const rocker = mesh(new RoundedBoxGeometry(0.0205, 0.042, 0.0065, 2, 0.0022), mat, 0, 0, 0.0035, pivot);
  g.add(pivot);
  const hint = isBtn ? 'Tieni premuto il pulsante' : 'Clic per commutare';
  actionParts([rocker, ...plate], isBtn ? 'press' : 'toggle', isBtn, hint);
  const strip = terminalStrip(terms, comp.tag, 0.085);
  g.add(strip.group);
  corrugated(g, 0, 0.073, 0.0425, 0.013);
  let angle = 0;
  return {
    group: g,
    terminals: strip.terminals,
    parts: { rocker, pivot },
    interactive: [rocker, ...plate],
    update(inst, dt) {
      if (!inst) return;
      if (isBtn) {
        pivot.position.z = z + 0.002 - (inst.state.pressed ? 0.0028 : 0);
        return;
      }
      const target = inst.state.on ? -0.09 : 0.09;
      angle += (target - angle) * Math.min(1, dt * 25);
      pivot.rotation.x = angle;
    },
  };
}

// ── Pulsantiera marcia-arresto ──────────────────────────────────────────────────────
function stationModel(def, p, comp, terms) {
  const g = new THREE.Group();
  mesh(new RoundedBoxGeometry(0.08, 0.15, 0.055, 3, 0.008), MAT.plasticGrey, 0, -0.01, 0.0275, g);
  const pt = new Painter(80, 150, '#c6cacd', 6);
  pt.rect(0, 58, 60, 14, '#ffffff', 2);
  pt.text(comp.tag, 0, 58, 7, { weight: 800 });
  pt.text('MARCIA', 0, 34, 6, { weight: 800, color: '#1d6b35' });
  pt.text('ARRESTO', 0, -52, 6, { weight: 800, color: '#a31f1a' });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.15), new THREE.MeshStandardMaterial({ map: pt.texture(), roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2 }));
  face.position.set(0, -0.01, 0.0552);
  g.add(face);
  const mk = (y, mat, action, r, h) => {
    const ring = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 28).rotateX(Math.PI / 2), MAT.aluminium, 0, y, 0.058, g);
    ring.castShadow = false;
    const b = mesh(new THREE.CylinderGeometry(r, r * 0.95, h, 28).rotateX(Math.PI / 2), mat, 0, y, 0.061 + h / 2, g);
    b.userData.action = action;
    b.userData.momentary = true;
    b.userData.hint = action === 'start' ? 'MARCIA (NA 3-4)' : 'ARRESTO (NC 1-2)';
    return b;
  };
  const start = mk(0.012, MAT.plasticGreen, 'start', 0.0135, 0.008);
  const stop = mk(-0.038, MAT.plasticRed, 'stop', 0.017, 0.012);
  const z0s = start.position.z;
  const z0t = stop.position.z;
  const strip = terminalStrip(terms, comp.tag, 0.1);
  g.add(strip.group);
  corrugated(g, 0, 0.088, 0.065, 0.013);
  return {
    group: g,
    terminals: strip.terminals,
    parts: {},
    interactive: [start, stop],
    update(inst) {
      if (!inst) return;
      start.position.z = z0s - (inst.state.start ? 0.004 : 0);
      stop.position.z = z0t - (inst.state.stop ? 0.005 : 0);
    },
  };
}

// ── Rilevatore di presenza ─────────────────────────────────────────────────────────
function pirModel(def, p, comp, terms) {
  const g = new THREE.Group();
  const plate = [];
  const z = wallBox(g, { parts: plate });
  const dome = mesh(new THREE.SphereGeometry(0.02, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.25 }), 0, 0.002, z, g);
  actionParts([dome, ...plate], 'trigger', false, 'Clic per simulare una persona che passa');
  const led = mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.002, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x331111, emissive: 0xff3322, emissiveIntensity: 0 }), 0.024, -0.018, z + 0.002, g);
  led.userData.dynamic = true;
  const strip = terminalStrip(terms, comp.tag, 0.085);
  g.add(strip.group);
  corrugated(g, 0, 0.073, 0.0425, 0.013);
  return {
    group: g,
    terminals: strip.terminals,
    parts: {},
    interactive: [dome, ...plate],
    update(inst, dt, t) {
      setEmissive(led, inst?.state.out ? (Math.sin(t * 10) > 0 ? 2.5 : 0.6) : 0);
    },
  };
}

// ── Suoneria ─────────────────────────────────────────────────────────────────────────
function bellModel(def, p, comp, terms) {
  const g = new THREE.Group();
  const z = wallBox(g);
  mesh(new THREE.SphereGeometry(0.03, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), MAT.brass, 0, 0, z, g);
  const hammer = new THREE.Group();
  mesh(new THREE.BoxGeometry(0.004, 0.022, 0.004), MAT.plasticDark, 0, -0.011, 0, hammer);
  mesh(new THREE.SphereGeometry(0.0045, 12, 8), MAT.plasticDark, 0, -0.022, 0, hammer);
  hammer.position.set(0.034, 0.012, z + 0.012);
  hammer.userData.dynamic = true;
  g.add(hammer);
  const strip = terminalStrip(terms, comp.tag, 0.085);
  g.add(strip.group);
  corrugated(g, 0, 0.073, 0.0425, 0.013);
  return {
    group: g,
    terminals: strip.terminals,
    parts: {},
    interactive: [],
    update(inst, dt, t) {
      hammer.rotation.z = inst?.view.ring ? Math.sin(t * 90) * 0.35 : 0;
    },
  };
}

// ── Motore asincrono trifase ────────────────────────────────────────────────────────
function motorModel(def, p, comp, terms) {
  const g = new THREE.Group();
  // mensola
  mesh(new THREE.BoxGeometry(0.44, 0.012, 0.2), MAT.aluminium, 0, -0.105, 0.1, g);
  for (const sx of [-0.18, 0.18]) mesh(new THREE.BoxGeometry(0.01, 0.06, 0.16), MAT.aluminium, sx, -0.14, 0.08, g);
  const m = new THREE.Group();
  m.position.set(-0.02, -0.03, 0.1);
  g.add(m);
  const R = 0.058;
  const bodyMat = MAT.motorBody;
  mesh(new THREE.CylinderGeometry(R, R, 0.2, 40).rotateZ(Math.PI / 2), bodyMat, 0, 0, 0, m);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    if (Math.sin(a) < -0.75) continue;
    const fin = mesh(new THREE.BoxGeometry(0.19, 0.012, 0.004), bodyMat, 0, Math.sin(a) * (R + 0.004), Math.cos(a) * (R + 0.004), m);
    fin.rotation.x = -a;
  }
  for (const sx of [-0.06, 0.06]) mesh(new THREE.BoxGeometry(0.035, 0.03, 0.12), bodyMat, sx, -R - 0.004, 0, m);
  mesh(new THREE.CylinderGeometry(R * 0.98, R * 0.98, 0.05, 36).rotateZ(Math.PI / 2), MAT.industrialDark, -0.125, 0, 0, m);
  const grille = mesh(new THREE.CircleGeometry(R * 0.9, 32).rotateY(-Math.PI / 2), MAT.slotDark, -0.151, 0, 0, m);
  grille.castShadow = false;
  mesh(new THREE.CylinderGeometry(R * 1.02, R * 1.02, 0.014, 36).rotateZ(Math.PI / 2), bodyMat, 0.106, 0, 0, m);
  mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.05, 16).rotateZ(Math.PI / 2), MAT.metalScrew, 0.136, 0, 0, m);
  // giunto (per vedere la rotazione)
  const rotor = new THREE.Group();
  rotor.position.set(0.162, 0, 0);
  const disc = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.014, 36).rotateZ(Math.PI / 2), MAT.plasticOrange, 0, 0, 0, rotor);
  void disc;
  mesh(new THREE.BoxGeometry(0.016, 0.06, 0.012), MAT.plasticBlack, 0.001, 0, 0, rotor);
  m.add(rotor);
  rotor.userData.dynamic = true;
  // scatola morsetti con schema di collegamento
  const tbY = R + 0.016;
  mesh(new RoundedBoxGeometry(0.078, 0.032, 0.072, 2, 0.004), bodyMat, 0.01, tbY, 0, m);
  const tri = p.conn === 'D';
  const pt = new Painter(78, 32, '#dfe3e8', 8);
  const xs = [-20, 0, 20];
  const top = ['U1', 'V1', 'W1'];
  const bot = ['W2', 'U2', 'V2'];
  xs.forEach((x, i) => {
    pt.circle(x, 6, 3.4, { fill: '#b87333', stroke: '#6b4a2b', lw: 0.4 });
    pt.circle(x, -7, 3.4, { fill: '#b87333', stroke: '#6b4a2b', lw: 0.4 });
    pt.text(top[i], x + 7.5, 10.5, 3.1, { weight: 800 });
    pt.text(bot[i], x + 7.5, -11.5, 3.1, { weight: 800 });
  });
  if (tri) xs.forEach((x) => pt.rect(x, -0.5, 2.6, 13, '#8c9197', 0.8));
  else pt.rect(0, -7, 42, 2.8, '#8c9197', 0.8);
  pt.text(tri ? 'Δ' : 'Y', -33, 0, 8, { weight: 800, color: '#0f3d80' });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.078, 0.032), new THREE.MeshStandardMaterial({ map: pt.texture(), roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }));
  face.position.set(0.01, tbY, 0.0365);
  m.add(face);
  // targa
  const r = motorRated(p);
  const np = new Painter(64, 30, '#d9dcdf', 8);
  np.text('3~ MOT', -18, 10, 3.6, { weight: 800 });
  np.text(`${fmt(p.P, 2)} kW`, 14, 10, 3.6, { weight: 800 });
  np.text('230/400 V  Δ/Y  50 Hz', 0, 2.5, 3, { weight: 600 });
  np.text(`${fmt(r.In * Math.sqrt(3), 2)}/${fmt(r.In, 2)} A  cosφ ${fmt(r.cos, 2)}`, 0, -4.5, 3, { weight: 600 });
  np.text('1420 giri/min  IP55', 0, -11, 3, { weight: 600 });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.03), new THREE.MeshStandardMaterial({ map: np.texture(), metalness: 0.4, roughness: 0.4 }));
  plate.position.set(-0.03, -0.004, R + 0.0015);
  m.add(plate);
  // morsettiera sulla scatola
  const strip = terminalStrip(terms, comp.tag, 0);
  strip.group.position.set(0.01 - 0.02, -0.03 + tbY + 0.016 + STRIP_H / 2, 0.1 - STRIP_D / 2);
  g.add(strip.group);
  const terminals = new Map();
  for (const [id, t] of strip.terminals) {
    terminals.set(id, {
      screw: t.screw.clone().add(new THREE.Vector3(-0.01, strip.group.position.y, strip.group.position.z)),
      entry: t.entry.clone().add(new THREE.Vector3(-0.01, strip.group.position.y, strip.group.position.z)),
      dir: t.dir,
      def: t.def,
    });
  }
  mergeStatic(m, { exclude: [rotor] });
  m.userData.dynamic = true;
  let angle = 0;
  const base = m.position.clone();
  return {
    group: g,
    terminals,
    parts: { rotor },
    interactive: [],
    update(inst, dt, t) {
      if (!inst) return;
      const s = inst.state;
      angle += (s.speed || 0) * dt * 14;
      rotor.rotation.x = angle;
      if (s.mode === 'stall' || s.mode === 'start') {
        m.position.set(base.x + Math.sin(t * 157) * 0.0006, base.y + Math.cos(t * 131) * 0.0005, base.z);
      } else m.position.copy(base);
    },
  };
}

export function buildFieldModel(def, params, comp) {
  const terms = def.terminals(params);
  const map = { lamp: lampModel, xs: socketModel, sa: switchModel, sd: switchModel, si: switchModel, sp: switchModel, ss: stationModel, pir: pirModel, hb: bellModel, m3: motorModel };
  const fn = map[def.type];
  const m = fn(def, params, comp, terms);
  m.type = def.type;
  mergeStatic(m.group);
  return m;
}
