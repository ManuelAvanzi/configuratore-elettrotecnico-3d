// Materiali condivisi e texture procedurali (nessun file immagine esterno: tutto generato su canvas).
import * as THREE from 'three';

const cache = new Map();

function std(key, params) {
  if (!cache.has(key)) {
    const m = new THREE.MeshStandardMaterial(params);
    m.userData.shared = true;
    cache.set(key, m);
  }
  return cache.get(key);
}

/** Marca un materiale/texture come condiviso (non va liberato con il modello) */
export function shared(x) {
  x.userData.shared = true;
  return x;
}

export const MAT = {
  get plasticWhite() { return std('pw', { color: 0xf1f1ec, roughness: 0.42, metalness: 0 }); },
  get plasticIvory() { return std('pi', { color: 0xe9e6dc, roughness: 0.5 }); },
  get plasticGrey() { return std('pg', { color: 0xc3c7cb, roughness: 0.5 }); },
  get plasticMid() { return std('pm', { color: 0x8a9096, roughness: 0.5 }); },
  get plasticDark() { return std('pd', { color: 0x33373c, roughness: 0.45 }); },
  get plasticBlack() { return std('pb', { color: 0x16181b, roughness: 0.5 }); },
  get plasticBlue() { return std('pbl', { color: 0x2f6fd0, roughness: 0.45 }); },
  get plasticRed() { return std('pr', { color: 0xc8322b, roughness: 0.4 }); },
  get plasticGreen() { return std('pgr', { color: 0x2f9a4a, roughness: 0.4 }); },
  get plasticYellow() { return std('py', { color: 0xf0c419, roughness: 0.45 }); },
  get plasticOrange() { return std('po', { color: 0xff5900, roughness: 0.45 }); },
  get industrialGrey() { return std('ig', { color: 0x9aa1a8, roughness: 0.55 }); },
  get industrialDark() { return std('id', { color: 0x4b5157, roughness: 0.5 }); },
  get metalScrew() { return std('ms', { color: 0xcfd3d8, roughness: 0.28, metalness: 1 }); },
  get brass() { return std('br', { color: 0xc9a44a, roughness: 0.32, metalness: 1 }); },
  get copper() { return std('cu', { color: 0xc47a4a, roughness: 0.3, metalness: 1 }); },
  get galvanized() { return std('gv', { color: 0xb9bec3, roughness: 0.42, metalness: 0.75 }); },
  get steelCabinet() { return std('sc', { color: 0xd6d8d8, roughness: 0.55, metalness: 0.08 }); },
  get aluminium() { return std('al', { color: 0xc3c7cc, roughness: 0.35, metalness: 0.85 }); },
  get rubber() { return std('rb', { color: 0x202225, roughness: 0.8 }); },
  get slotDark() { return std('sd', { color: 0x0c0d0f, roughness: 0.9 }); },
  get motorBody() { return std('mb', { color: 0x375a86, roughness: 0.5, metalness: 0.3 }); },
  get glass() {
    return std('gl', { color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35 });
  },
};

// ── Texture procedurali ───────────────────────────────────────────────────────────────
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function tex(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Pavimento vinilico da laboratorio (piastrelle 60×60 con puntinatura) */
export function floorMaterial() {
  if (cache.has('floor')) return cache.get('floor');
  const c = canvas(1024, 1024);
  const g = c.getContext('2d');
  const r = rng(7);
  g.fillStyle = '#c9ccc8';
  g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 26000; i++) {
    const v = 150 + Math.floor(r() * 90);
    g.fillStyle = `rgba(${v},${v + 2},${v},${0.25 + r() * 0.3})`;
    g.fillRect(r() * 1024, r() * 1024, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  g.strokeStyle = 'rgba(90,95,95,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * 256, 0);
    g.lineTo(i * 256, 1024);
    g.moveTo(0, i * 256);
    g.lineTo(1024, i * 256);
    g.stroke();
  }
  const m = new THREE.MeshStandardMaterial({ map: tex(c, { repeat: [4, 4] }), roughness: 0.62, metalness: 0 });
  cache.set('floor', m);
  return m;
}

/** Parete intonacata leggermente irregolare */
export function wallMaterial(color = '#ecebe6') {
  const key = 'wall' + color;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(512, 512);
  const g = c.getContext('2d');
  const r = rng(11);
  g.fillStyle = color;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.025})`;
    g.fillRect(r() * 512, r() * 512, 2, 2);
  }
  const m = new THREE.MeshStandardMaterial({ map: tex(c, { repeat: [6, 3] }), roughness: 0.92 });
  cache.set(key, m);
  return m;
}

/** Pannello in multistrato di betulla per il banco utenze */
export function woodMaterial() {
  if (cache.has('wood')) return cache.get('wood');
  const c = canvas(1024, 512);
  const g = c.getContext('2d');
  const r = rng(3);
  g.fillStyle = '#dcc7a1';
  g.fillRect(0, 0, 1024, 512);
  for (let y = 0; y < 512; y += 2) {
    const k = Math.sin(y * 0.05 + Math.sin(y * 0.013) * 3) * 0.5 + 0.5;
    g.fillStyle = `rgba(150,110,60,${0.05 + k * 0.08})`;
    g.fillRect(0, y, 1024, 1 + r() * 1.5);
  }
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(140,95,50,${0.05 + r() * 0.08})`;
    g.lineWidth = 1 + r() * 2;
    g.beginPath();
    const y0 = r() * 512;
    g.moveTo(0, y0);
    for (let x = 0; x <= 1024; x += 32) g.lineTo(x, y0 + Math.sin(x * 0.01 + i) * 6);
    g.stroke();
  }
  const m = new THREE.MeshStandardMaterial({ map: tex(c, { repeat: [1, 1] }), roughness: 0.7 });
  cache.set('wood', m);
  return m;
}

/** Piano di lavoro dei banchi (laminato grigio chiaro) */
export function laminateMaterial() {
  return std('lam', { color: 0xdfe2e3, roughness: 0.55 });
}

/** Canalina forata: pettine di finestrature sulle pareti laterali */
export function ductMaterial() {
  if (cache.has('duct')) return cache.get('duct');
  const c = canvas(256, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#a9aeb3';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#62676c';
  for (let x = 6; x < 256; x += 16) g.fillRect(x, 10, 7, 54);
  const t = tex(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.65 });
  cache.set('duct', m);
  return m;
}

export function ductBaseMaterial() {
  return std('ductb', { color: 0x9da2a7, roughness: 0.7 });
}

/** Texture a trattini per il flusso di corrente sui cavi */
export function flowTexture() {
  if (cache.has('flow')) return cache.get('flow');
  const c = canvas(64, 8);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 64, 0);
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(0.55, 'rgba(0,0,0,1)');
  grd.addColorStop(0.7, 'rgba(255,255,255,1)');
  grd.addColorStop(0.85, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 8);
  const t = tex(c, { srgb: false });
  cache.set('flow', t);
  return t;
}

/** Cielo per le finestre (gradiente) */
export function skyTexture() {
  if (cache.has('sky')) return cache.get('sky');
  const c = canvas(8, 256);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#6fa5e0');
  grd.addColorStop(0.6, '#b9d5ef');
  grd.addColorStop(0.62, '#b7c6a4');
  grd.addColorStop(1, '#8aa06e');
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 256);
  const t = tex(c);
  cache.set('sky', t);
  return t;
}

export function makeCanvas(w, h) {
  return canvas(w, h);
}

export function canvasTexture(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
