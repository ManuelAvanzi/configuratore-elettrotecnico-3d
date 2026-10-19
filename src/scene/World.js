// Ambiente 3D: aula-laboratorio di elettrotecnica con il banco didattico
// (quadro elettrico con guide DIN e canaline + pannello utenze + contatore del distributore) e la LIM.
//
// Coordinate del banco (wallRoot, metri): x lungo la parete, y in alto, z uscente dalla parete.
// Il banco può essere scalato (scala didattica) attorno a un perno ad altezza occhi.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  MAT, floorMaterial, wallMaterial, woodMaterial, laminateMaterial, ductMaterial, ductBaseMaterial,
  skyTexture, makeCanvas, canvasTexture,
} from './materials.js';
import { LAYOUT, FIELD_ROWS } from '../core/layout.js';
import { mergeStatic } from './merge.js';

/** Lamiera mandorlata del ponte (sala quadri di bordo) */
let deckMat = null;
function deckMaterial() {
  if (deckMat) return deckMat;
  const c = makeCanvas(512, 512);
  const g = c.getContext('2d');
  g.fillStyle = '#5f6569';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 3;
  for (let y = 0; y < 512; y += 64) {
    for (let x = 0; x < 512; x += 64) {
      const ox = (y / 64) % 2 ? 32 : 0;
      g.beginPath();
      g.moveTo(x + ox + 8, y + 32);
      g.lineTo(x + ox + 32, y + 8);
      g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.moveTo(x + ox + 12, y + 36);
      g.lineTo(x + ox + 36, y + 12);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.18)';
    }
  }
  const t = canvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 10);
  deckMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.35 });
  return deckMat;
}

// ── Quote del banco didattico ─────────────────────────────────────────────────────────
export const CAB = {
  cx: -0.62, cy: 1.36, w: 0.6, h: 0.9, d: 0.21,
  plateZ: 0.03, // fronte della piastra di montaggio
  railZ: 0.0375, // fronte della guida DIN (origine dei dispositivi)
  rails: [0.255, 0.085, -0.085, -0.255], // quota delle guide rispetto al centro
  ducts: [0.34, 0.17, 0, -0.17, -0.34], // canaline orizzontali
  ductXL: -0.235, ductXR: 0.235,
  railX0: -0.21, // bordo sinistro del modulo 0
  laneZ: 0.052,
  pebar: { x: -0.2, y: -0.395, w: 0.3 },
};

export const FIELD = {
  x0: -0.14, colW: 0.34, top: 1.87, rowH: 0.33,
  board: { x: -0.2, y: 0.86, w: 1.8, h: 1.1 },
  yTrunk: 1.925,
  laneZ: 0.04,
};

export const colX0 = (c) => FIELD.x0 + FIELD.colW * c;
export const colDuctX = (c) => colX0(c) + 0.02;
export const rowTop = (r) => FIELD.top - FIELD.rowH * r;
export const rowRaceY = (r) => rowTop(r) - 0.02;

const PIVOT_Y = 1.3;

function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}

function rbox(w, h, d, r, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), mat);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}

function shadowAll(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);

    this.wallPivot = new THREE.Group();
    this.wallPivot.position.set(0, PIVOT_Y, 0);
    this.wallRoot = new THREE.Group();
    this.wallRoot.position.set(0, -PIVOT_Y, 0);
    this.wallPivot.add(this.wallRoot);
    this.root.add(this.wallPivot);

    this.pickSurfaces = []; // guide e righe del pannello (posizionamento)
    this.teleportSurfaces = [];
    this.interactive = []; // parti cliccabili fisse (interruttore del contatore)
    this.theme = 'aula'; // 'aula' (laboratorio scolastico) oppure 'nave' (sala quadri di bordo)

    this.buildRoom();
    this.buildCabinet();
    this.buildEarthPit();
    this.buildMeterBox();
    this.buildFieldBoard();
    this.buildTrunking();
    this.buildLIM();
    this.buildFurniture();
    this.optimize();
  }

  /** Unisce le geometrie statiche per ridurre le chiamate di disegno (importante per i visori) */
  optimize() {
    for (const g of [this.room, this.furniture]) {
      g.traverse((o) => {
        if (o.isMesh) o.castShadow = false; // arredi lontani dal banco: non serve che proiettino ombre
      });
      mergeStatic(g);
    }
    mergeStatic(this.cabinet);
    mergeStatic(this.fieldBoard);
    mergeStatic(this.trunking, { exclude: [this.trunkCover] });
    mergeStatic(this.meter);
  }

  setScale(s) {
    this.wallPivot.scale.setScalar(s);
    this.wallPivot.updateMatrixWorld(true);
    this.updateEarth();
  }
  get scale() {
    return this.wallPivot.scale.x;
  }

  /**
   * Cambia l'ambiente: aula-laboratorio oppure sala quadri di bordo. Quadro, pannello utenze e LIM restano gli
   * stessi (le posizioni logiche non cambiano); si ricostruiscono stanza, arredi e contatore/comando centrale.
   */
  setTheme(theme) {
    if (theme === this.theme) return;
    this.theme = theme;
    const kill = (grp) => {
      if (!grp) return;
      grp.traverse((o) => {
        if (o.isMesh) o.geometry?.dispose();
      });
      grp.parent?.remove(grp);
    };
    const ti = this.teleportSurfaces.indexOf(this.floor);
    if (ti >= 0) this.teleportSurfaces.splice(ti, 1);
    const ii = this.interactive.indexOf(this.meterLever);
    if (ii >= 0) this.interactive.splice(ii, 1);
    kill(this.room);
    kill(this.furniture);
    kill(this.meter);
    kill(this.meterCable);
    this.buildRoom();
    this.buildMeterBox();
    this.buildFurniture();
    for (const g of [this.room, this.furniture]) {
      g.traverse((o) => {
        if (o.isMesh) o.castShadow = false;
      });
      mergeStatic(g);
    }
    mergeStatic(this.meter);
    this.updateEarth();
  }

  /** Converte coordinate del banco in coordinate mondo */
  toWorld(v) {
    this.wallRoot.updateMatrixWorld(true);
    return this.wallRoot.localToWorld(v.clone());
  }

  // ── Aula ──────────────────────────────────────────────────────────────────────────
  buildRoom() {
    if (this.theme === 'nave') return this.buildRoomNave();
    const g = new THREE.Group();
    g.name = 'room';
    const X0 = -3.6;
    const X1 = 4.8;
    const Z1 = 7.2;
    const H = 3.0;
    const W = X1 - X0;
    const cx = (X0 + X1) / 2;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, Z1), floorMaterial());
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, Z1 / 2);
    floor.receiveShadow = true;
    floor.userData.teleport = true;
    g.add(floor);
    this.teleportSurfaces.push(floor);
    this.floor = floor;

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, Z1), wallMaterial('#f4f4f2'));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, H, Z1 / 2);
    g.add(ceil);

    const wm = wallMaterial('#eceae4');
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wm);
    back.position.set(cx, H / 2, 0);
    back.receiveShadow = true;
    g.add(back);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wm);
    front.rotation.y = Math.PI;
    front.position.set(cx, H / 2, Z1);
    g.add(front);
    const right = new THREE.Mesh(new THREE.PlaneGeometry(Z1, H), wallMaterial('#e6e8e6'));
    right.rotation.y = -Math.PI / 2;
    right.position.set(X1, H / 2, Z1 / 2);
    right.receiveShadow = true;
    g.add(right);

    // Parete sinistra con tre finestre
    const left = new THREE.Group();
    const lw = wallMaterial('#e6e8e6');
    const winY0 = 0.95;
    const winY1 = 2.45;
    const wins = [[1.2, 2.6], [3.1, 4.5], [5.0, 6.4]];
    let zc = 0;
    const seg = (z0, z1, y0, y1) => {
      if (z1 - z0 < 1e-3 || y1 - y0 < 1e-3) return;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, y1 - y0), lw);
      p.rotation.y = Math.PI / 2;
      p.position.set(X0, (y0 + y1) / 2, (z0 + z1) / 2);
      p.receiveShadow = true;
      left.add(p);
    };
    for (const [z0, z1] of wins) {
      seg(zc, z0, 0, H);
      seg(z0, z1, 0, winY0);
      seg(z0, z1, winY1, H);
      zc = z1;
      // cielo, telaio e davanzale
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, winY1 - winY0), new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false }));
      sky.rotation.y = Math.PI / 2;
      sky.position.set(X0 - 0.12, (winY0 + winY1) / 2, (z0 + z1) / 2);
      left.add(sky);
      const fm = MAT.aluminium;
      box(0.1, 0.05, z1 - z0, fm, X0 - 0.04, winY0, (z0 + z1) / 2, left);
      box(0.1, 0.05, z1 - z0, fm, X0 - 0.04, winY1, (z0 + z1) / 2, left);
      box(0.1, winY1 - winY0, 0.05, fm, X0 - 0.04, (winY0 + winY1) / 2, z0, left);
      box(0.1, winY1 - winY0, 0.05, fm, X0 - 0.04, (winY0 + winY1) / 2, z1, left);
      box(0.08, winY1 - winY0, 0.03, fm, X0 - 0.05, (winY0 + winY1) / 2, (z0 + z1) / 2, left);
      box(0.22, 0.03, z1 - z0 + 0.1, MAT.plasticIvory, X0 + 0.08, winY0 - 0.02, (z0 + z1) / 2, left);
      // termosifone sotto la finestra
      const rad = new THREE.Group();
      for (let i = 0; i < 14; i++) box(0.07, 0.55, 0.05, MAT.plasticWhite, 0, 0, i * 0.075, rad);
      rad.position.set(X0 + 0.12, 0.5, (z0 + z1) / 2 - 0.49);
      left.add(rad);
    }
    seg(zc, Z1, 0, H);
    g.add(left);

    // Battiscopa
    const sk = MAT.plasticDark;
    box(W, 0.08, 0.015, sk, cx, 0.04, 0.008, g);
    box(0.015, 0.08, Z1, sk, X1 - 0.008, 0.04, Z1 / 2, g);
    box(0.015, 0.08, Z1, sk, X0 + 0.008, 0.04, Z1 / 2, g);

    // Plafoniere LED
    const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f6ff, emissiveIntensity: 1.6, roughness: 0.4 });
    for (const x of [-1.6, 0.6, 2.8]) {
      for (const z of [1.6, 3.9, 6.0]) {
        const p = box(0.6, 0.02, 0.6, led, x, H - 0.01, z, g);
        box(0.64, 0.025, 0.64, MAT.aluminium, x, H - 0.005, z, g);
        p.renderOrder = 1;
      }
    }

    this.floorTape(g);
    this.room = g;
    this.root.add(g);
    this.bounds = { x0: X0, x1: X1, z0: 0, z1: Z1, h: H };
  }

  /** Striscia di sicurezza gialla e nera a pavimento davanti al banco */
  floorTape(g) {
    const c = makeCanvas(512, 32);
    const x2 = c.getContext('2d');
    x2.fillStyle = '#1b1b1b';
    x2.fillRect(0, 0, 512, 32);
    x2.fillStyle = '#f2c200';
    for (let i = -32; i < 512; i += 32) {
      x2.beginPath();
      x2.moveTo(i, 32);
      x2.lineTo(i + 16, 32);
      x2.lineTo(i + 32, 0);
      x2.lineTo(i + 16, 0);
      x2.fill();
    }
    const tapeTex = canvasTexture(c);
    tapeTex.wrapS = THREE.RepeatWrapping;
    tapeTex.repeat.set(8, 1);
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.06), new THREE.MeshStandardMaterial({ map: tapeTex, roughness: 0.6 }));
    tape.rotation.x = -Math.PI / 2;
    tape.position.set(0.15, 0.002, 1.35);
    tape.receiveShadow = true;
    g.add(tape);
  }

  /** Sala quadri di bordo: paratie in acciaio con rinforzi, ponte in lamiera mandorlata, oblò, tubazioni e passerelle cavi */
  buildRoomNave() {
    const g = new THREE.Group();
    g.name = 'room';
    const X0 = -3.6;
    const X1 = 4.8;
    const Z1 = 7.2;
    const H = 2.6;
    const W = X1 - X0;
    const cx = (X0 + X1) / 2;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, Z1), deckMaterial());
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, Z1 / 2);
    floor.receiveShadow = true;
    floor.userData.teleport = true;
    g.add(floor);
    this.teleportSurfaces.push(floor);
    this.floor = floor;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, Z1), wallMaterial('#b7bdbf'));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, H, Z1 / 2);
    g.add(ceil);
    for (let z = 0.6; z < Z1; z += 1.2) box(W, 0.12, 0.08, MAT.industrialGrey, cx, H - 0.06, z, g); // bagli
    // paratie
    const wm = wallMaterial('#cfd5d3');
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wm);
    back.position.set(cx, H / 2, 0);
    back.receiveShadow = true;
    g.add(back);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wm);
    front.rotation.y = Math.PI;
    front.position.set(cx, H / 2, Z1);
    g.add(front);
    const right = new THREE.Mesh(new THREE.PlaneGeometry(Z1, H), wm);
    right.rotation.y = -Math.PI / 2;
    right.position.set(X1, H / 2, Z1 / 2);
    right.receiveShadow = true;
    g.add(right);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(Z1, H), wm);
    left.rotation.y = Math.PI / 2;
    left.position.set(X0, H / 2, Z1 / 2);
    left.receiveShadow = true;
    g.add(left);
    const stiff = MAT.industrialGrey;
    for (const x of [-3.2, -2.5, 1.5, 2.3, 3.1, 3.9, 4.6]) box(0.08, H, 0.06, stiff, x, H / 2, 0.03, g);
    for (let z = 0.8; z < Z1 - 0.3; z += 0.8) {
      box(0.06, H, 0.08, stiff, X1 - 0.03, H / 2, z, g);
      if (Math.abs(z - 1.9) > 0.5 && Math.abs(z - 3.6) > 0.5 && Math.abs(z - 5.3) > 0.5) box(0.06, H, 0.08, stiff, X0 + 0.03, H / 2, z, g);
    }
    // oblò
    for (const z of [1.9, 3.6, 5.3]) {
      const sky = new THREE.Mesh(new THREE.CircleGeometry(0.26, 32), new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false }));
      sky.rotation.y = Math.PI / 2;
      sky.position.set(X0 + 0.006, 1.75, z);
      g.add(sky);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 12, 36), MAT.brass);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(X0 + 0.03, 1.75, z);
      g.add(ring);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 8), MAT.brass);
        bolt.rotation.z = Math.PI / 2;
        bolt.position.set(X0 + 0.055, 1.75 + Math.sin(a) * 0.3, z + Math.cos(a) * 0.3);
        g.add(bolt);
      }
    }
    // tubazioni e passerella portacavi a soffitto
    const pipe = (r, x, y, mat) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Z1, 14), mat);
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, Z1 / 2);
      g.add(m);
    };
    pipe(0.06, 1.3, H - 0.32, MAT.plasticMid);
    pipe(0.04, 1.52, H - 0.3, MAT.plasticRed);
    pipe(0.05, 2.9, H - 0.32, MAT.plasticBlue);
    box(0.4, 0.04, Z1, MAT.galvanized, -2.4, H - 0.3, Z1 / 2, g);
    for (let z = 0.3; z < Z1; z += 0.6) box(0.4, 0.06, 0.02, MAT.galvanized, -2.4, H - 0.28, z, g);
    // plafoniere stagne con gabbia
    const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 1.4, roughness: 0.4 });
    for (const x of [-1.6, 0.6, 2.8]) {
      for (const z of [1.6, 3.9, 6.0]) {
        const p = box(0.36, 0.08, 0.14, led, x, H - 0.14, z, g);
        p.renderOrder = 1;
        box(0.4, 0.04, 0.18, MAT.industrialDark, x, H - 0.08, z, g);
        for (const sx of [-0.12, 0, 0.12]) box(0.012, 0.1, 0.012, MAT.industrialDark, x + sx, H - 0.15, z + 0.08, g);
      }
    }
    this.floorTape(g);
    this.room = g;
    this.root.add(g);
    this.bounds = { x0: X0, x1: X1, z0: 0, z1: Z1, h: H };
  }

  // ── Quadro elettrico ──────────────────────────────────────────────────────────────
  buildCabinet() {
    const cab = new THREE.Group();
    cab.name = 'cabinet';
    cab.position.set(CAB.cx, CAB.cy, 0);
    const { w, h, d } = CAB;
    const t = 0.012;
    const m = MAT.steelCabinet;
    box(w, h, t, m, 0, 0, t / 2, cab);
    box(t, h, d, m, -w / 2 + t / 2, 0, d / 2, cab);
    box(t, h, d, m, w / 2 - t / 2, 0, d / 2, cab);
    box(w, t, d, m, 0, h / 2 - t / 2, d / 2, cab);
    box(w, t, d, m, 0, -h / 2 + t / 2, d / 2, cab);
    // bordo frontale
    const lip = 0.022;
    box(w, lip, 0.004, m, 0, h / 2 - lip / 2, d, cab);
    box(w, lip, 0.004, m, 0, -h / 2 + lip / 2, d, cab);
    box(lip, h, 0.004, m, -w / 2 + lip / 2, 0, d, cab);
    box(lip, h, 0.004, m, w / 2 - lip / 2, 0, d, cab);
    // guarnizione
    // piastra di montaggio
    box(0.54, 0.86, 0.003, MAT.galvanized, 0, 0, CAB.plateZ - 0.0015, cab);

    // Guide DIN (profilo a cappello con asole)
    const rc = makeCanvas(512, 32);
    const r2 = rc.getContext('2d');
    r2.fillStyle = '#c7cbcf';
    r2.fillRect(0, 0, 512, 32);
    r2.fillStyle = '#6e7378';
    for (let x = 8; x < 512; x += 24) {
      r2.beginPath();
      r2.roundRect(x, 11, 14, 10, 5);
      r2.fill();
    }
    r2.fillStyle = 'rgba(255,255,255,0.35)';
    r2.fillRect(0, 2, 512, 2);
    r2.fillRect(0, 28, 512, 2);
    const railTex = canvasTexture(rc);
    const railMat = new THREE.MeshStandardMaterial({ map: railTex, metalness: 0.7, roughness: 0.4 });
    for (const ry of CAB.rails) {
      const rail = box(0.46, 0.035, 0.0075, railMat, 0, ry, CAB.plateZ + 0.00375, cab);
      rail.receiveShadow = true;
    }

    // Canaline (a U, con pettine)
    const dm = ductMaterial();
    const db = ductBaseMaterial();
    const hDuct = (y, x0, x1) => {
      const L = x1 - x0;
      const gd = new THREE.Group();
      box(L, 0.04, 0.002, db, 0, 0, 0.001, gd);
      const wallGeo = new THREE.PlaneGeometry(L, 0.06);
      for (const s of [1, -1]) {
        const wmesh = new THREE.Mesh(wallGeo, dm);
        wmesh.rotation.x = s * Math.PI / 2;
        wmesh.position.set(0, s * 0.02, 0.03);
        wmesh.material.side = THREE.DoubleSide;
        dm.map.repeat.set(L / 0.02 / 16, 1);
        gd.add(wmesh);
      }
      gd.position.set((x0 + x1) / 2, y, CAB.plateZ);
      cab.add(gd);
    };
    const vDuct = (x, y0, y1) => {
      const L = y1 - y0;
      const gd = new THREE.Group();
      box(0.04, L, 0.002, db, 0, 0, 0.001, gd);
      const wallGeo = new THREE.PlaneGeometry(L, 0.06);
      for (const s of [1, -1]) {
        const wmesh = new THREE.Mesh(wallGeo, dm);
        wmesh.rotation.set(0, s * Math.PI / 2, Math.PI / 2);
        wmesh.position.set(s * 0.02, 0, 0.03);
        gd.add(wmesh);
      }
      gd.position.set(x, (y0 + y1) / 2, CAB.plateZ);
      cab.add(gd);
    };
    dm.side = THREE.DoubleSide;
    dm.map.repeat.set(12, 1);
    for (const y of CAB.ducts) hDuct(y, CAB.ductXL + 0.02, CAB.ductXR - 0.02);
    vDuct(CAB.ductXL, -0.36, 0.36);
    vDuct(CAB.ductXR, -0.36, 0.36);

    // Collettore di terra: barra in ottone su isolatori
    const pb = CAB.pebar;
    box(pb.w, 0.012, 0.006, MAT.brass, pb.x + pb.w / 2, pb.y, CAB.plateZ + 0.022, cab);
    for (const s of [0, 1]) {
      const iso = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.02, 12), MAT.plasticRed);
      iso.rotation.x = Math.PI / 2;
      iso.position.set(pb.x + 0.012 + s * (pb.w - 0.024), pb.y, CAB.plateZ + 0.01);
      cab.add(iso);
    }
    // targhetta del quadro
    const lc = makeCanvas(512, 96);
    const l2 = lc.getContext('2d');
    l2.fillStyle = '#f5f5f0';
    l2.fillRect(0, 0, 512, 96);
    l2.fillStyle = '#222';
    l2.font = '700 34px Manrope, Arial';
    l2.fillText('QUADRO ELETTRICO  Q.E.', 18, 42);
    l2.font = '500 22px Inter, Arial';
    l2.fillText('Banco didattico · CEI EN 61439', 18, 76);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.03), new THREE.MeshStandardMaterial({ map: canvasTexture(lc), roughness: 0.5 }));
    plate.position.set(0.12, h / 2 - 0.011, d + 0.0025);
    cab.add(plate);
    // pressacavi in alto (arrivo linea e uscita verso le utenze)
    for (const x of [-0.18, CAB.ductXR]) {
      const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.02, 20), MAT.plasticBlack);
      gl.position.set(x, h / 2 + 0.008, 0.06);
      cab.add(gl);
    }

    shadowAll(cab, true, true);
    this.cabinet = cab;
    this.wallRoot.add(cab);

    // Superfici di posizionamento sulle guide
    const pm = new THREE.MeshBasicMaterial({ visible: false });
    CAB.rails.forEach((ry, i) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.14), pm);
      p.position.set(CAB.cx, CAB.cy + ry, 0.075);
      p.userData.place = { kind: 'din', rail: i };
      this.wallRoot.add(p);
      this.pickSurfaces.push(p);
    });

    // Cavo di arrivo decorativo con i conduttori verso l'arrivo linea
    this.supplyCores = new THREE.Group();
    this.wallRoot.add(this.supplyCores);
  }

  /** Conduttori decorativi dal pressacavo all'arrivo linea (dipendono da mono/trifase) */
  setSupplyCores(xs, colors) {
    const grp = this.supplyCores;
    while (grp.children.length) {
      const c = grp.children.pop();
      c.geometry.dispose();
    }
    const gx = CAB.cx - 0.18;
    const top = CAB.cy + CAB.h / 2;
    const y1 = CAB.cy + CAB.rails[0] + 0.047;
    xs.forEach((x, i) => {
      const pts = [
        new THREE.Vector3(gx + (i - xs.length / 2) * 0.004, top + 0.01, 0.06),
        new THREE.Vector3(gx + (i - xs.length / 2) * 0.004, top - 0.05, 0.06),
        new THREE.Vector3(x, y1 + 0.03, 0.058),
        new THREE.Vector3(x, y1, 0.056),
      ];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const col = colors[i];
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.0028, 6), new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 }));
      mesh.castShadow = true;
      grp.add(mesh);
    });
  }

  // ── Contatore del distributore ────────────────────────────────────────────────────
  buildMeterBox() {
    const nave = this.theme === 'nave';
    const g = new THREE.Group();
    g.name = 'meter';
    g.position.set(-1.14, 1.5, 0);
    rbox(0.2, 0.3, 0.09, 0.008, MAT.plasticGrey, 0, 0, 0.045, g);
    rbox(0.17, 0.12, 0.012, 0.004, MAT.plasticIvory, 0, 0.05, 0.094, g);
    // display LCD
    this.meterCanvas = makeCanvas(256, 128);
    this.meterTex = canvasTexture(this.meterCanvas);
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.06), new THREE.MeshBasicMaterial({ map: this.meterTex, toneMapped: false }));
    lcd.position.set(0, 0.055, 0.1005);
    lcd.userData.dynamic = true;
    g.add(lcd);
    // pulsante di riarmo / interruttore di consegna
    const btnBase = rbox(0.06, 0.05, 0.02, 0.004, MAT.plasticDark, 0, -0.07, 0.1, g);
    void btnBase;
    const lever = rbox(0.036, 0.022, 0.018, 0.003, MAT.plasticRed, 0, -0.07, 0.115, g);
    lever.userData = { compId: 'XA', action: 'power', hint: nave ? 'Comando della centrale: avvia / ferma i gruppi' : 'Interruttore del contatore: alimenta / scollega l’impianto' };
    this.meterLever = lever;
    this.interactive.push(lever);
    // targa
    const tc = makeCanvas(256, 64);
    const t2 = tc.getContext('2d');
    t2.fillStyle = '#e9e7df';
    t2.fillRect(0, 0, 256, 64);
    t2.fillStyle = '#333';
    t2.font = '700 22px Manrope, Arial';
    t2.fillText(nave ? 'CENTRALE' : 'CONTATORE', 12, 28);
    t2.font = '500 17px Inter, Arial';
    t2.fillText(nave ? 'Comando generatori' : 'Punto di consegna', 12, 52);
    const tp = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.03), new THREE.MeshStandardMaterial({ map: canvasTexture(tc), roughness: 0.6 }));
    tp.position.set(0, 0.125, 0.0905);
    g.add(tp);
    // cavo verso il quadro
    const top = CAB.cy + CAB.h / 2;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.14, 1.65, 0.05),
      new THREE.Vector3(-1.14, 1.9, 0.05),
      new THREE.Vector3(-1.0, 1.95, 0.05),
      new THREE.Vector3(CAB.cx - 0.25, 1.95, 0.06),
      new THREE.Vector3(CAB.cx - 0.18, 1.9, 0.06),
      new THREE.Vector3(CAB.cx - 0.18, top + 0.015, 0.06),
    ], false, 'centripetal');
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.009, 10), new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.55 }));
    this.wallRoot.add(cable);
    this.meterCable = cable;
    shadowAll(g);
    this.meter = g;
    this.wallRoot.add(g);
  }

  /** Pozzetto del dispersore (in coordinate mondo, a pavimento) e conduttore di terra */
  buildEarthPit() {
    const pit = new THREE.Group();
    box(0.3, 0.02, 0.3, MAT.plasticMid, 0, 0.01, 0, pit);
    const sc = makeCanvas(128, 128);
    const s2 = sc.getContext('2d');
    s2.fillStyle = '#e8b400';
    s2.fillRect(0, 0, 128, 128);
    s2.strokeStyle = '#111';
    s2.lineWidth = 7;
    s2.beginPath();
    s2.moveTo(64, 18);
    s2.lineTo(64, 62);
    s2.moveTo(30, 62);
    s2.lineTo(98, 62);
    s2.moveTo(42, 80);
    s2.lineTo(86, 80);
    s2.moveTo(54, 98);
    s2.lineTo(74, 98);
    s2.stroke();
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshStandardMaterial({ map: canvasTexture(sc) }));
    sign.rotation.x = -Math.PI / 2;
    sign.position.y = 0.021;
    pit.add(sign);
    this.earthPit = pit;
    this.root.add(pit);
    this.peDown = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0x3fae3a, roughness: 0.45 }));
    this.peDown.castShadow = true;
    this.root.add(this.peDown);
  }

  /** Conduttore di terra dal quadro al pozzetto del dispersore (in coordinate mondo: dipende dalla scala) */
  updateEarth() {
    const a = this.toWorld(new THREE.Vector3(CAB.cx - 0.25, CAB.cy - CAB.h / 2 - 0.004, 0.05));
    const pitPos = new THREE.Vector3(a.x, 0, 0.32);
    this.earthPit.position.copy(pitPos);
    const curve = new THREE.CatmullRomCurve3([
      a,
      new THREE.Vector3(a.x, a.y - 0.25, 0.035),
      new THREE.Vector3(a.x, 0.12, 0.035),
      new THREE.Vector3(a.x, 0.03, 0.16),
      new THREE.Vector3(a.x, 0.02, 0.3),
    ], false, 'centripetal');
    this.peDown.geometry.dispose();
    this.peDown.geometry = new THREE.TubeGeometry(curve, 40, 0.0045, 8);
  }

  updateMeterDisplay({ on, limiter, P }) {
    const c = this.meterCanvas;
    const g = c.getContext('2d');
    g.fillStyle = on && !limiter ? '#a9c79a' : '#6f7f69';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#1d2a18';
    g.font = '600 20px Inter, Arial';
    g.fillText(limiter ? 'DISTACCO' : on ? 'IN SERVIZIO' : 'APERTO', 14, 30);
    g.font = '700 52px "Courier New", monospace';
    const kw = Math.max(0, P || 0) / 1000;
    g.fillText(kw.toFixed(2).replace('.', ','), 14, 96);
    g.font = '600 24px Inter, Arial';
    g.fillText('kW', 190, 96);
    this.meterTex.needsUpdate = true;
    if (this.meterLever) this.meterLever.position.y = on && !limiter ? -0.062 : -0.078;
  }

  // ── Pannello utenze ───────────────────────────────────────────────────────────────
  buildFieldBoard() {
    const g = new THREE.Group();
    g.name = 'fieldboard';
    const B = FIELD.board;
    const board = new THREE.Mesh(new THREE.BoxGeometry(B.w, B.h, 0.018), woodMaterial());
    board.position.set(B.x + B.w / 2, B.y + B.h / 2, 0.009);
    board.receiveShadow = true;
    g.add(board);
    // cornice in alluminio
    const fr = MAT.aluminium;
    box(B.w + 0.03, 0.02, 0.024, fr, B.x + B.w / 2, B.y - 0.005, 0.012, g);
    box(B.w + 0.03, 0.02, 0.024, fr, B.x + B.w / 2, B.y + B.h + 0.005, 0.012, g);
    box(0.02, B.h, 0.024, fr, B.x - 0.005, B.y + B.h / 2, 0.012, g);
    box(0.02, B.h, 0.024, fr, B.x + B.w + 0.005, B.y + B.h / 2, 0.012, g);

    // griglia serigrafata con le posizioni
    const W = 2048;
    const H = Math.round((W * B.h) / B.w);
    const c = makeCanvas(W, H);
    const x2 = c.getContext('2d');
    const sx = W / B.w;
    const toPx = (x, y) => [(x - B.x) * sx, (B.y + B.h - y) * sx];
    x2.strokeStyle = 'rgba(80,60,30,0.28)';
    x2.lineWidth = 3;
    x2.setLineDash([14, 10]);
    x2.font = '600 30px Manrope, Arial';
    x2.fillStyle = 'rgba(80,60,30,0.55)';
    for (let r = 0; r < LAYOUT.field.rows; r++) {
      for (let col = 0; col < LAYOUT.field.cols; col++) {
        const [px, py] = toPx(colX0(col) + 0.04, rowTop(r) - 0.04);
        x2.strokeRect(px, py, 0.29 * sx, 0.285 * sx);
        x2.fillText(`${FIELD_ROWS[r]}${col + 1}`, px + 10, py + 0.285 * sx - 12);
      }
    }
    const ov = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), new THREE.MeshStandardMaterial({ map: canvasTexture(c), transparent: true, roughness: 0.8, depthWrite: false }));
    ov.position.set(B.x + B.w / 2, B.y + B.h / 2, 0.0185);
    ov.receiveShadow = true;
    g.add(ov);

    // canaline di colonna e di riga
    const dm = ductMaterial().clone();
    dm.map = dm.map.clone();
    dm.map.needsUpdate = true;
    const db = ductBaseMaterial();
    const depth = 0.035;
    const ductV = (x, y0, y1) => {
      const L = y1 - y0;
      const gd = new THREE.Group();
      box(0.03, L, 0.002, db, 0, 0, 0.001, gd);
      for (const s of [1, -1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(L, depth), dm);
        p.rotation.set(0, s * Math.PI / 2, Math.PI / 2);
        p.position.set(s * 0.015, 0, depth / 2);
        gd.add(p);
      }
      gd.position.set(x, (y0 + y1) / 2, 0.018);
      g.add(gd);
    };
    const ductH = (y, x0, x1) => {
      const L = x1 - x0;
      const gd = new THREE.Group();
      box(L, 0.03, 0.002, db, 0, 0, 0.001, gd);
      for (const s of [1, -1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(L, depth), dm);
        p.rotation.x = s * Math.PI / 2;
        p.position.set(0, s * 0.015, depth / 2);
        gd.add(p);
      }
      gd.position.set((x0 + x1) / 2, y, 0.018);
      g.add(gd);
    };
    dm.side = THREE.DoubleSide;
    for (let col = 0; col < LAYOUT.field.cols; col++) ductV(colDuctX(col), rowRaceY(LAYOUT.field.rows - 1) - 0.015, FIELD.yTrunk - 0.03);
    for (let r = 0; r < LAYOUT.field.rows; r++) ductH(rowRaceY(r), colDuctX(0) + 0.015, colX0(LAYOUT.field.cols - 1) + FIELD.colW - 0.01);

    // Titolo
    const tc = makeCanvas(1024, 96);
    const t2 = tc.getContext('2d');
    t2.fillStyle = '#20252b';
    t2.fillRect(0, 0, 1024, 96);
    t2.fillStyle = '#ff5900';
    t2.fillRect(0, 0, 12, 96);
    t2.fillStyle = '#fff';
    t2.font = '800 44px Manrope, Arial';
    t2.fillText('PANNELLO UTENZE', 36, 62);
    t2.font = '500 28px Inter, Arial';
    t2.fillStyle = '#b8c0c8';
    t2.fillText('Laboratorio di Elettrotecnica · Banco didattico', 440, 60);
    const title = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.084), new THREE.MeshStandardMaterial({ map: canvasTexture(tc), roughness: 0.5 }));
    title.position.set(B.x + B.w - 0.46, B.y + B.h + 0.08, 0.004);
    g.add(title);

    shadowAll(g, true, true);
    board.castShadow = false;
    ov.castShadow = false;
    this.fieldBoard = g;
    this.wallRoot.add(g);

    // superfici di posizionamento (una per riga)
    const pm = new THREE.MeshBasicMaterial({ visible: false });
    for (let r = 0; r < LAYOUT.field.rows; r++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.colW * LAYOUT.field.cols, FIELD.rowH), pm);
      p.position.set(colX0(0) + (FIELD.colW * LAYOUT.field.cols) / 2, rowTop(r) - FIELD.rowH / 2, 0.06);
      p.userData.place = { kind: 'field', row: r };
      this.wallRoot.add(p);
      this.pickSurfaces.push(p);
    }
  }

  // ── Canalina di collegamento quadro → pannello utenze ─────────────────────────────
  buildTrunking() {
    const g = new THREE.Group();
    const x0 = CAB.cx + CAB.ductXR - 0.03;
    const x1 = FIELD.board.x + FIELD.board.w - 0.01;
    const y = FIELD.yTrunk;
    const L = x1 - x0;
    const m = MAT.plasticWhite;
    box(L, 0.06, 0.003, m, (x0 + x1) / 2, y, 0.0195, g);
    box(L, 0.003, 0.06, m, (x0 + x1) / 2, y + 0.0285, 0.049, g);
    box(L, 0.003, 0.06, m, (x0 + x1) / 2, y - 0.0285, 0.049, g);
    // coperchio (semitrasparente per vedere i cavi)
    const cover = new THREE.Mesh(new THREE.BoxGeometry(L, 0.064, 0.003), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.2, depthWrite: false }));
    cover.position.set((x0 + x1) / 2, y, 0.081);
    g.add(cover);
    this.trunkCover = cover;
    // tratto verticale dal quadro alla canalina
    const top = CAB.cy + CAB.h / 2;
    const xr = CAB.cx + CAB.ductXR;
    box(0.05, y - 0.03 - top, 0.003, m, xr, (top + y - 0.03) / 2, 0.0195, g);
    box(0.003, y - 0.03 - top, 0.06, m, xr - 0.025, (top + y - 0.03) / 2, 0.049, g);
    box(0.003, y - 0.03 - top, 0.06, m, xr + 0.025, (top + y - 0.03) / 2, 0.049, g);
    shadowAll(g, true, true);
    cover.castShadow = false;
    this.trunking = g;
    this.wallRoot.add(g);
  }

  // ── LIM (lavagna interattiva) ─────────────────────────────────────────────────────
  buildLIM() {
    const g = new THREE.Group();
    g.position.set(3.45, 1.58, 0.03);
    const W = 1.92;
    const H = 1.08;
    rbox(W + 0.08, H + 0.08, 0.05, 0.01, MAT.plasticBlack, 0, 0, 0, g);
    this.limCanvas = makeCanvas(1920, 1080);
    this.limTex = canvasTexture(this.limCanvas);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: this.limTex, toneMapped: false }));
    screen.position.z = 0.026;
    g.add(screen);
    box(0.5, 0.03, 0.08, MAT.plasticGrey, 0, -H / 2 - 0.07, 0.03, g);
    this.limScreen = screen;
    this.lim = g;
    this.root.add(g);
  }

  // ── Arredi ────────────────────────────────────────────────────────────────────────
  buildFurniture() {
    if (this.theme === 'nave') return this.buildFurnitureNave();
    const g = new THREE.Group();
    const lam = laminateMaterial();
    const leg = MAT.plasticMid;
    const bench = (x, z, w = 1.8, d = 0.75, h = 0.9, monitor = true) => {
      const b = new THREE.Group();
      box(w, 0.04, d, lam, 0, h - 0.02, 0, b);
      for (const sx of [-1, 1]) {
        box(0.05, h - 0.04, d - 0.1, leg, sx * (w / 2 - 0.06), (h - 0.04) / 2, 0, b);
      }
      box(w - 0.12, 0.08, 0.03, leg, 0, h - 0.12, -d / 2 + 0.06, b);
      if (monitor) {
        const mon = new THREE.Group();
        rbox(0.56, 0.34, 0.03, 0.006, MAT.plasticBlack, 0, 0.28, 0, mon);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.3), new THREE.MeshStandardMaterial({ color: 0x1b2330, emissive: 0x1c3552, emissiveIntensity: 0.6, roughness: 0.3 }));
        scr.position.set(0, 0.28, 0.016);
        mon.add(scr);
        box(0.04, 0.12, 0.03, MAT.plasticDark, 0, 0.06, -0.02, mon);
        box(0.2, 0.012, 0.14, MAT.plasticDark, 0, 0.006, 0, mon);
        mon.position.set(-0.35, h, -0.12);
        b.add(mon);
        box(0.42, 0.015, 0.14, MAT.plasticDark, -0.35, h + 0.008, 0.16, b);
      }
      // sgabelli
      for (const sx of [-0.45, 0.45]) {
        const st = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 24), MAT.plasticDark);
        seat.position.y = 0.66;
        st.add(seat);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.62, 10), MAT.aluminium);
        pole.position.y = 0.33;
        st.add(pole);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.03, 24), MAT.plasticMid);
        base.position.y = 0.015;
        st.add(base);
        st.position.set(sx, 0, d / 2 + 0.3);
        b.add(st);
      }
      b.position.set(x, 0, z);
      g.add(b);
    };
    bench(-1.5, 3.7);
    bench(1.1, 3.7);
    bench(-1.5, 5.4);
    bench(1.1, 5.4);

    // cattedra con portatile accanto alla LIM
    const desk = new THREE.Group();
    box(1.5, 0.04, 0.72, lam, 0, 0.74, 0, desk);
    box(1.44, 0.68, 0.03, MAT.plasticMid, 0, 0.38, -0.33, desk);
    for (const sx of [-1, 1]) box(0.04, 0.72, 0.68, MAT.plasticMid, sx * 0.72, 0.36, 0, desk);
    const lap = new THREE.Group();
    box(0.34, 0.015, 0.24, MAT.aluminium, 0, 0.0075, 0, lap);
    const lid = new THREE.Group();
    box(0.34, 0.22, 0.01, MAT.aluminium, 0, 0.11, 0, lid);
    const ls = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.19), new THREE.MeshStandardMaterial({ color: 0x14202c, emissive: 0x2a4d70, emissiveIntensity: 0.7 }));
    ls.position.set(0, 0.11, 0.0055);
    lid.add(ls);
    lid.position.set(0, 0.012, -0.115);
    lid.rotation.x = -0.25;
    lap.add(lid);
    lap.position.set(-0.3, 0.76, 0.02);
    desk.add(lap);
    desk.position.set(3.35, 0, 1.55);
    desk.rotation.y = -0.18;
    g.add(desk);

    // armadio attrezzi
    const cab = new THREE.Group();
    box(1.0, 1.95, 0.45, MAT.steelCabinet, 0, 0.975, 0, cab);
    box(0.004, 1.85, 0.002, MAT.plasticMid, 0, 0.975, 0.226, cab);
    for (const sx of [-0.06, 0.06]) box(0.02, 0.18, 0.02, MAT.aluminium, sx, 1.05, 0.235, cab);
    cab.position.set(-3.05, 0, 0.6);
    cab.rotation.y = Math.PI / 2;
    g.add(cab);

    // estintore e cartello
    const ext = new THREE.Group();
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 20), MAT.plasticRed);
    bottle.position.y = 0.25;
    ext.add(bottle);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.08, 12), MAT.plasticBlack);
    head.position.y = 0.54;
    ext.add(head);
    ext.position.set(4.66, 0.9, 2.9);
    g.add(ext);
    box(0.02, 0.9, 0.35, MAT.aluminium, 4.79, 0.45, 2.9, g);

    // porta
    const door = new THREE.Group();
    box(0.05, 2.15, 1.0, MAT.plasticIvory, 0, 1.075, 0, door);
    box(0.07, 2.2, 0.06, MAT.aluminium, 0, 1.1, 0.53, door);
    box(0.07, 2.2, 0.06, MAT.aluminium, 0, 1.1, -0.53, door);
    box(0.07, 0.06, 1.12, MAT.aluminium, 0, 2.2, 0, door);
    box(0.06, 0.03, 0.16, MAT.aluminium, -0.04, 1.05, -0.35, door);
    door.position.set(4.78, 0, 5.2);
    g.add(door);

    // cartello di sicurezza sopra il banco
    const sc = makeCanvas(1024, 256);
    const s2 = sc.getContext('2d');
    s2.fillStyle = '#ffffff';
    s2.fillRect(0, 0, 1024, 256);
    s2.fillStyle = '#f2c200';
    s2.beginPath();
    s2.moveTo(128, 30);
    s2.lineTo(230, 220);
    s2.lineTo(26, 220);
    s2.closePath();
    s2.fill();
    s2.strokeStyle = '#111';
    s2.lineWidth = 12;
    s2.stroke();
    s2.fillStyle = '#111';
    s2.beginPath();
    s2.moveTo(140, 80);
    s2.lineTo(104, 150);
    s2.lineTo(132, 150);
    s2.lineTo(114, 200);
    s2.lineTo(158, 128);
    s2.lineTo(130, 128);
    s2.closePath();
    s2.fill();
    s2.font = '800 64px Manrope, Arial';
    s2.fillText('TENSIONE PERICOLOSA', 270, 120);
    s2.font = '500 38px Inter, Arial';
    s2.fillText('Lavori solo con impianto sezionato · CEI 11-27', 272, 188);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshStandardMaterial({ map: canvasTexture(sc), roughness: 0.6 }));
    sign.position.set(-2.1, 2.2, 0.005);
    g.add(sign);

    shadowAll(g, true, true);
    this.furniture = g;
    this.root.add(g);
  }

  /** Arredi della sala quadri di bordo: consolle, armadietti, salvagente, estintore, porta stagna, cartello */
  buildFurnitureNave() {
    const g = new THREE.Group();
    const Z1 = this.bounds.z1;
    // consolle di controllo della centrale
    const con = new THREE.Group();
    box(1.6, 0.9, 0.7, MAT.industrialDark, 0, 0.45, 0, con);
    const top = box(1.6, 0.06, 0.5, MAT.industrialGrey, 0, 1.0, -0.15, con);
    top.rotation.x = -0.35;
    for (const sx of [-0.45, 0.15]) {
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshStandardMaterial({ color: 0x14202c, emissive: 0x2a5d3a, emissiveIntensity: 0.7 }));
      scr.position.set(sx, 1.1, -0.1);
      scr.rotation.x = -0.35;
      con.add(scr);
    }
    for (let i = 0; i < 8; i++) box(0.05, 0.02, 0.05, i % 3 ? MAT.plasticDark : MAT.plasticRed, -0.7 + i * 0.08, 0.95, 0.15, con);
    con.position.set(0.2, 0, 2.6);
    g.add(con);
    // armadietti in acciaio
    for (const z of [0.5, 1.6]) {
      const c = new THREE.Group();
      box(1.0, 1.95, 0.45, MAT.steelCabinet, 0, 0.975, 0, c);
      box(0.004, 1.85, 0.002, MAT.plasticMid, 0, 0.975, 0.226, c);
      for (const sx of [-0.06, 0.06]) box(0.02, 0.18, 0.02, MAT.aluminium, sx, 1.05, 0.235, c);
      c.position.set(-3.05, 0, z);
      c.rotation.y = Math.PI / 2;
      g.add(c);
    }
    // salvagente
    const bg = new THREE.Group();
    bg.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 12, 36), MAT.plasticOrange));
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.085, 8, 36, 0.5), MAT.plasticWhite);
      s.rotation.z = (k / 4) * Math.PI * 2;
      bg.add(s);
    }
    bg.rotation.y = -Math.PI / 2;
    bg.position.set(4.73, 1.6, 2.2);
    g.add(bg);
    // estintore
    const ext = new THREE.Group();
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 20), MAT.plasticRed);
    bottle.position.y = 0.25;
    ext.add(bottle);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.08, 12), MAT.plasticBlack);
    head.position.y = 0.54;
    ext.add(head);
    ext.position.set(4.66, 0.9, 3.6);
    g.add(ext);
    // porta stagna con volantino
    const door = new THREE.Group();
    box(1.0, 1.9, 0.08, MAT.industrialGrey, 0, 1.25, 0, door);
    for (const [w, h, x, y] of [[1.14, 0.07, 0, 2.235], [1.14, 0.07, 0, 0.265], [0.07, 2.04, -0.535, 1.25], [0.07, 2.04, 0.535, 1.25]]) box(w, h, 0.12, MAT.industrialDark, x, y, -0.01, door);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 10, 28), MAT.aluminium);
    wheel.position.set(0, 1.25, 0.08);
    door.add(wheel);
    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
      const sp = box(0.3, 0.02, 0.02, MAT.aluminium, 0, 1.25, 0.08, door);
      sp.rotation.z = a;
    }
    door.position.set(2.4, 0, Z1 - 0.06);
    g.add(door);
    // cartello della sala quadri
    const sc = makeCanvas(1024, 256);
    const s2 = sc.getContext('2d');
    s2.fillStyle = '#ffffff';
    s2.fillRect(0, 0, 1024, 256);
    s2.fillStyle = '#1d4e89';
    s2.fillRect(0, 0, 220, 256);
    s2.fillStyle = '#ffffff';
    s2.beginPath();
    s2.moveTo(110, 40);
    s2.lineTo(70, 130);
    s2.lineTo(100, 130);
    s2.lineTo(80, 200);
    s2.lineTo(150, 110);
    s2.lineTo(118, 110);
    s2.closePath();
    s2.fill();
    s2.fillStyle = '#111';
    s2.font = '800 60px Manrope, Arial';
    s2.fillText('CENTRALE ELETTRICA', 250, 110);
    s2.font = '500 36px Inter, Arial';
    s2.fillText('Sala quadri · sistema IT 440 V 60 Hz · personale autorizzato', 252, 180);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshStandardMaterial({ map: canvasTexture(sc), roughness: 0.6 }));
    sign.position.set(-2.1, 2.05, 0.07);
    g.add(sign);
    shadowAll(g, true, true);
    this.furniture = g;
    this.root.add(g);
  }

  // ── Geometria del posizionamento ──────────────────────────────────────────────────
  /** Origine (coordinate banco) di un dispositivo DIN largo `w` moduli nella posizione `mount` */
  dinOrigin(mount, w) {
    const x = CAB.cx + CAB.railX0 + (mount.pos + w / 2) * LAYOUT.din.moduleW;
    const y = CAB.cy + CAB.rails[mount.rail];
    return new THREE.Vector3(x, y, CAB.railZ);
  }

  /** Origine (coordinate banco) di un dispositivo di campo che occupa `span` colonne */
  fieldOrigin(mount, span) {
    const x = colX0(mount.col) + 0.04 + (0.29 + FIELD.colW * (span - 1)) / 2;
    const y = rowTop(mount.row) - 0.17;
    return new THREE.Vector3(x, y, 0.018);
  }

  fixedOrigin(at) {
    if (at === 'pebar') return new THREE.Vector3(CAB.cx + CAB.pebar.x, CAB.cy + CAB.pebar.y, CAB.plateZ + 0.025);
    return new THREE.Vector3();
  }

  /** Posizione del modulo DIN a partire da una x (coordinate banco) */
  dinPosFromX(x, w) {
    return (x - (CAB.cx + CAB.railX0)) / LAYOUT.din.moduleW - w / 2;
  }
  fieldColFromX(x, span) {
    return Math.round((x - colX0(0) - 0.04 - (0.29 + FIELD.colW * (span - 1)) / 2) / FIELD.colW);
  }

  /** Rete delle canaline per l'instradamento dei cavi (coordinate banco) */
  ductNetwork() {
    const nodes = new Map();
    const edges = [];
    const node = (id, x, y, z) => {
      nodes.set(id, { id, x, y, z });
      return id;
    };
    const edge = (a, b) => edges.push([a, b]);
    const cz = CAB.laneZ;
    const xL = CAB.cx + CAB.ductXL;
    const xR = CAB.cx + CAB.ductXR;
    CAB.ducts.forEach((dy, k) => {
      node(`PL${k}`, xL, CAB.cy + dy, cz);
      node(`PR${k}`, xR, CAB.cy + dy, cz);
      edge(`PL${k}`, `PR${k}`);
      if (k > 0) {
        edge(`PL${k - 1}`, `PL${k}`);
        edge(`PR${k - 1}`, `PR${k}`);
      }
    });
    node('EXIT', xR, FIELD.yTrunk, FIELD.laneZ + 0.008);
    edge('PR0', 'EXIT');
    const { cols, rows } = LAYOUT.field;
    for (let c = 0; c < cols; c++) {
      node(`T${c}`, colDuctX(c), FIELD.yTrunk, FIELD.laneZ + 0.008);
      edge(c === 0 ? 'EXIT' : `T${c - 1}`, `T${c}`);
      for (let r = 0; r < rows; r++) {
        node(`F${c}_${r}`, colDuctX(c), rowRaceY(r), FIELD.laneZ);
        edge(r === 0 ? `T${c}` : `F${c}_${r - 1}`, `F${c}_${r}`);
        if (c > 0) edge(`F${c - 1}_${r}`, `F${c}_${r}`);
      }
    }
    return {
      nodes,
      edges,
      panelDuctY: CAB.ducts.map((dy) => CAB.cy + dy),
      xL,
      xR,
      rowRaceY: Array.from({ length: rows }, (_, r) => rowRaceY(r)),
      colDuctX: Array.from({ length: cols }, (_, c) => colDuctX(c)),
      fieldRight: colX0(cols - 1) + FIELD.colW - 0.01,
    };
  }

  /**
   * Viste predefinite della telecamera (coordinate mondo). Ogni vista inquadra un'area (w × h metri)
   * adattando la distanza alle proporzioni del riquadro: `fit(aspect, fov)` restituisce { pos, target }.
   */
  views(aspect = 1.6, fovDeg = 50) {
    const s = this.scale;
    const w = (x, y, z) => this.toWorld(new THREE.Vector3(x, y, z));
    const frame = (target, width, height, dir, minDist = 0.4) => {
      const t = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
      const dist = Math.max(minDist, height / 2 / t, width / 2 / (t * aspect)) * 1.08;
      const d = dir.clone().normalize();
      return { pos: target.clone().addScaledVector(d, dist), target };
    };
    return {
      panoramica: { label: 'Panoramica', ...frame(w(0.25, 1.4, 0), 3.3 * s, 1.5 * s, new THREE.Vector3(0.02, 0.12, 1)) },
      quadro: { label: 'Quadro', ...frame(w(CAB.cx, CAB.cy, 0.05), 0.72 * s, 0.98 * s, new THREE.Vector3(0.05, 0.05, 1)) },
      utenze: { label: 'Utenze', ...frame(w(0.7, 1.4, 0.02), 1.95 * s, 1.2 * s, new THREE.Vector3(0.05, 0.08, 1)) },
      lim: { label: 'LIM', ...frame(new THREE.Vector3(3.45, 1.58, 0.03), 2.1, 1.3, new THREE.Vector3(-0.12, 0.02, 1)) },
      aula: { label: 'Aula', pos: new THREE.Vector3(1.8, 2.35, 6.8), target: new THREE.Vector3(0.4, 1.1, 0.5) },
    };
  }
}
