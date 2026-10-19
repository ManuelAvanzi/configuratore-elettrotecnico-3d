// Realtà virtuale (WebXR): sessione immersiva, controller con raggio, teletrasporto e rotazione a scatti,
// tablet sul controller sinistro, etichette fluttuanti e messaggi. Funziona nel browser del visore (Meta Quest)
// senza installare app; con ?xr=emula si attiva un visore emulato per provarla sul PC.
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { XRTablet } from './XRTablet.js';
import { CanvasPanel, FloatLabel, UI } from './CanvasPanel.js';
import { DEFS } from '../catalog/defs/index.js';

const Y = new THREE.Vector3(0, 1, 0);
const STANDS = {
  panoramica: { x: 0.25, z: 1.55 },
  quadro: { x: -0.78, z: 0.95 },
  utenze: { x: 0.9, z: 1.15 },
  lim: { x: 3.35, z: 1.6 },
};

export class XRManager {
  constructor(app) {
    this.app = app;
    this.renderer = app.stage.renderer;
    this.rig = app.stage.rig;
    this.camera = app.stage.camera;
    this.session = null;
    this.supported = false;
    this.ctrl = [];
    this.turnLatch = false;
    this.tp = null;

    this.tablet = new XRTablet(app);
    this.tablet.mesh.visible = false;
    this.label = new FloatLabel();
    app.stage.scene.add(this.label.mesh);
    this.toastPanel = new CanvasPanel({ px: [900, 150], size: [0.54, 0.09] });
    this.toastPanel.mesh.visible = false;
    this.toastPanel.mesh.renderOrder = 31;
    this.toastPanel.mesh.material.depthTest = false;
    this.camera.add(this.toastPanel.mesh);
    this.toastPanel.mesh.position.set(0, -0.22, -0.8);
    this.toastT = 0;

    this.setupControllers();
    this.setupTeleport();
    this.checkSupport();
    app.on('hover', (x) => this.onHover(x));
  }

  async checkSupport() {
    const params = new URLSearchParams(location.search);
    if (params.get('xr') === 'emula' || location.hash.includes('xr=emula') || this.app.settings.xrEmulator) {
      try {
        const { XRDevice, metaQuest3 } = await import('iwer');
        this.emuDevice = new XRDevice(metaQuest3);
        this.emuDevice.installRuntime({ forceInstall: true });
        this.emuDevice.stereoEnabled = false;
        this.emuDevice.position.set(0, 1.6, 0);
        this.app.xrEmulated = true;
        window.__xrDevice = this.emuDevice;
      } catch (e) {
        console.warn('Emulatore WebXR non disponibile', e);
      }
    }
    try {
      this.supported = !!(await navigator.xr?.isSessionSupported('immersive-vr'));
    } catch {
      this.supported = false;
    }
    this.setVRState(this.supported ? 'supported' : 'unsupported');
  }

  /** Stato del pulsante VR: 'supported' | 'unsupported' | 'active' */
  setVRState(state) {
    this.vrState = state;
    this.app.topbar?.setVR(state);
    this.app.emit('vr', state);
  }

  // ── Controller ────────────────────────────────────────────────────────────────────
  setupControllers() {
    const factory = new XRControllerModelFactory();
    const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    for (let i = 0; i < 2; i++) {
      const c = this.renderer.xr.getController(i);
      const grip = this.renderer.xr.getControllerGrip(i);
      try {
        grip.add(factory.createControllerModel(grip));
      } catch {
        /* modelli dei controller non disponibili offline */
      }
      const line = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0xff7c3a, transparent: true, opacity: 0.85 }));
      line.scale.z = 3;
      line.name = 'ray';
      c.add(line);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
      dot.renderOrder = 32;
      dot.visible = false;
      this.app.stage.scene.add(dot);
      const st = { i, c, grip, line, dot, hand: null, gamepad: null, ray: new THREE.Ray(), uiDown: false, pressed: false };
      c.addEventListener('connected', (e) => {
        st.hand = e.data.handedness;
        st.gamepad = e.data.gamepad;
        st.source = e.data;
        this.assignTablet();
      });
      c.addEventListener('disconnected', () => {
        st.hand = null;
        st.source = null;
      });
      c.addEventListener('selectstart', () => this.onSelect(st, true));
      c.addEventListener('selectend', () => this.onSelect(st, false));
      this.rig.add(c, grip);
      this.ctrl.push(st);
    }
  }

  assignTablet() {
    const left = this.ctrl.find((s) => s.hand === 'left') || null;
    if (this.tablet.mesh.parent) this.tablet.mesh.parent.remove(this.tablet.mesh);
    if (left) {
      left.grip.add(this.tablet.mesh);
      this.tablet.mesh.position.set(0.0, 0.075, -0.04);
      this.tablet.mesh.rotation.set(-0.55, 0, 0);
      this.tablet.mesh.visible = !!this.session;
    }
    this.app.picker.extra = this.session && left ? [this.tablet.mesh] : [];
  }

  rayOf(st) {
    st.c.updateMatrixWorld(true);
    const m = st.c.matrixWorld;
    st.ray.origin.setFromMatrixPosition(m);
    st.ray.direction.set(0, 0, -1).transformDirection(m).normalize();
    return st.ray;
  }

  isTabletHand(st) {
    return st.hand === 'left' && this.tablet.mesh.visible;
  }

  onSelect(st, down) {
    if (!this.session || this.isTabletHand(st)) return;
    const ray = this.rayOf(st);
    const pid = 'xr-' + st.i;
    if (down) {
      const ui = this.uiHit(ray);
      if (ui) {
        st.uiDown = true;
        ui.panel.down(ui.uv);
        ui.panel.dirty = true;
        return;
      }
      st.pressed = true;
      this.app.interaction.down({ id: pid, ray });
      this.vibrate(st, 0.3, 20);
    } else {
      if (st.uiDown) {
        st.uiDown = false;
        const ui = this.uiHit(ray);
        this.tablet.panel.up(ui?.uv || null);
        this.vibrate(st, 0.2, 15);
        return;
      }
      if (st.pressed) {
        st.pressed = false;
        this.app.interaction.up({ id: pid, ray });
      }
    }
  }

  uiHit(ray) {
    if (!this.tablet.mesh.visible) return null;
    const rc = new THREE.Raycaster(ray.origin, ray.direction, 0, 3);
    const h = rc.intersectObject(this.tablet.mesh, false)[0];
    return h ? { panel: this.tablet.panel, uv: h.uv, point: h.point, distance: h.distance } : null;
  }

  vibrate(st, intensity, ms) {
    const act = st.source?.gamepad?.hapticActuators?.[0];
    act?.pulse?.(intensity, ms);
  }

  // ── Teletrasporto ─────────────────────────────────────────────────────────────────
  setupTeleport() {
    const pts = new Float32Array(40 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.arc = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x46d17f }));
    this.arc.visible = false;
    this.arc.frustumCulled = false;
    this.app.stage.scene.add(this.arc);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x46d17f, transparent: true, opacity: 0.8 }));
    this.marker.visible = false;
    this.app.stage.scene.add(this.marker);
  }

  updateArc(st) {
    const ray = this.rayOf(st);
    const p = this.arc.geometry.attributes.position;
    const v = ray.direction.clone().multiplyScalar(6.5);
    const g = -9.8;
    const pos = ray.origin.clone();
    let hit = null;
    let n = 0;
    const b = this.app.world.bounds;
    for (let i = 0; i < 40; i++) {
      const t = i * 0.03;
      const q = new THREE.Vector3(ray.origin.x + v.x * t, ray.origin.y + v.y * t + 0.5 * g * t * t, ray.origin.z + v.z * t);
      if (q.y <= 0.001) {
        const k = pos.y / Math.max(1e-4, pos.y - q.y);
        q.lerpVectors(pos, q, k);
        q.y = 0;
        p.setXYZ(i, q.x, q.y, q.z);
        n = i + 1;
        const inside = q.x > b.x0 + 0.3 && q.x < b.x1 - 0.3 && q.z > 0.45 && q.z < b.z1 - 0.3;
        hit = inside ? q : null;
        break;
      }
      p.setXYZ(i, q.x, q.y, q.z);
      pos.copy(q);
      n = i + 1;
    }
    this.arc.geometry.setDrawRange(0, n);
    p.needsUpdate = true;
    this.arc.material.color.setHex(hit ? 0x46d17f : 0xff5d62);
    this.arc.visible = true;
    this.marker.visible = !!hit;
    if (hit) this.marker.position.copy(hit);
    return hit;
  }

  teleportTo(target) {
    const head = new THREE.Vector3().setFromMatrixPosition(this.camera.matrixWorld);
    this.rig.position.x += target.x - head.x;
    this.rig.position.z += target.z - head.z;
  }

  snapTurn(angle) {
    const head = new THREE.Vector3().setFromMatrixPosition(this.camera.matrixWorld);
    this.rig.position.sub(head).applyAxisAngle(Y, angle).add(head);
    this.rig.rotation.y += angle;
  }

  teleportToView(id) {
    const s = STANDS[id] || STANDS.panoramica;
    this.teleportTo(new THREE.Vector3(s.x, 0, s.z));
    // orienta verso la parete
    const head = new THREE.Vector3().setFromMatrixPosition(this.camera.matrixWorld);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const yaw = Math.atan2(-dir.x, -dir.z);
    const want = id === 'lim' ? 0 : 0;
    this.rig.position.sub(head).applyAxisAngle(Y, want - yaw).add(head);
    this.rig.rotation.y += want - yaw;
  }

  // ── Sessione ──────────────────────────────────────────────────────────────────────
  async toggle() {
    if (this.session) {
      await this.session.end();
      return;
    }
    if (!this.supported) {
      this.app.modals.vrInfo();
      return;
    }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await this.renderer.xr.setSession(session);
      this.onStart(session);
    } catch (e) {
      console.error(e);
      this.app.toast('Impossibile avviare la sessione VR: ' + e.message, 'error');
    }
  }

  onStart(session) {
    this.session = session;
    this.app.xrActive = true;
    const st = this.app.stage;
    this.saved = { pos: st.camera.position.clone(), target: st.controls.target.clone() };
    st.controls.enabled = false;
    this.renderer.xr.setFoveation?.(1);
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    this.camera.position.set(0, 1.6, 0);
    this.camera.rotation.set(0, 0, 0);
    // la posa della testa è nota solo dopo i primi fotogrammi XR: il posizionamento iniziale avviene in update()
    this.pendingStand = { id: 'panoramica', frames: 3 };
    // Visori standalone: niente ombre dinamiche (dimezza le chiamate di disegno e mantiene 72+ fps)
    this.renderer.shadowMap.enabled = false;
    this.app.stage.keyLight.castShadow = false;
    this.app.stage.scene.traverse((o) => {
      if (o.isMesh && o.material) o.material.needsUpdate = true;
    });
    this.assignTablet();
    this.tablet.panel.dirty = true;
    this.setVRState('active');
    this.app.emit('xr', true);
    session.addEventListener('end', () => this.onEnd());
    this.app.toast('Benvenuto nel laboratorio: tablet sul controller sinistro, grilletto destro per interagire, levetta per muoverti.', 'info');
  }

  onEnd() {
    this.session = null;
    this.app.xrActive = false;
    const st = this.app.stage;
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    st.camera.position.copy(this.saved?.pos || st.camera.position);
    st.controls.target.copy(this.saved?.target || st.controls.target);
    st.controls.enabled = true;
    st.controls.update();
    this.tablet.mesh.visible = false;
    this.app.picker.extra = [];
    this.label.mesh.visible = false;
    this.arc.visible = false;
    this.marker.visible = false;
    for (const s of this.ctrl) s.dot.visible = false;
    this.app.applySettings(); // ripristina le ombre secondo le impostazioni
    st.resize();
    this.setVRState(this.supported ? 'supported' : 'unsupported');
    this.app.emit('xr', false);
  }

  toast(text, level) {
    if (!this.session) return;
    const p = this.toastPanel;
    p.begin('rgba(16,20,25,0.94)');
    const col = level === 'error' ? UI.error : level === 'warn' ? UI.warn : level === 'ok' ? UI.ok : UI.accent;
    p.rect(0, 0, 14, 150, col, 0);
    const words = text.split(' ');
    const lines = [''];
    p.g.font = '600 30px Inter, Arial';
    for (const w of words) {
      const t = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + w : w;
      if (p.g.measureText(t).width > 840 && lines[lines.length - 1]) lines.push(w);
      else lines[lines.length - 1] = t;
    }
    lines.slice(0, 3).forEach((l, i) => p.text(l, 34, 38 + i * 38, { size: 30, maxW: 850 }));
    p.end();
    p.mesh.visible = true;
    this.toastT = 5;
    this.tablet.message(text, level);
  }

  onHover(x) {
    if (!this.session) return;
    const lab = this.label;
    if (!x || !x.point || !x.kind) {
      lab.mesh.visible = false;
      return;
    }
    const p = this.app.project;
    let title = '';
    let sub = '';
    if (x.kind === 'terminal') {
      const c = p.comp(x.term.compId);
      title = `${c?.tag} · morsetto ${x.term.def.label}`;
      sub = `${DEFS[c.type].short} · ${p.wiresAt(x.term.ref).length ? 'collegato' : 'libero'}`;
    } else if (x.kind === 'part') {
      const c = p.comp(x.compId);
      title = c ? c.tag : 'Contatore';
      sub = x.hint || (x.momentary ? 'Tieni premuto il grilletto' : 'Grilletto per azionare');
    } else if (x.kind === 'device') {
      const c = p.comp(x.compId);
      if (!c) return;
      title = `${c.tag}${c.label ? ' · ' + c.label : ''}`;
      sub = DEFS[c.type].short;
    } else if (x.kind === 'wire') {
      const w = p.wire(x.wireId);
      if (!w) return;
      title = `${p.comp(w.a.c)?.tag}:${p.terminal(w.a)?.label} → ${p.comp(w.b.c)?.tag}:${p.terminal(w.b)?.label}`;
      sub = `${w.section} mm²`;
    } else {
      lab.mesh.visible = false;
      return;
    }
    lab.set(title, sub);
    const head = new THREE.Vector3().setFromMatrixPosition(this.camera.matrixWorld);
    const pos = x.point.clone().lerp(head, 0.12);
    pos.y += 0.05;
    lab.mesh.position.copy(pos);
    lab.mesh.lookAt(head);
    const d = head.distanceTo(pos);
    lab.mesh.scale.setScalar(Math.max(0.6, Math.min(2.2, d / 0.7)));
    lab.mesh.visible = true;
  }

  // ── Aggiornamento per fotogramma ──────────────────────────────────────────────────
  update(dt) {
    if (!this.session) return;
    if (this.pendingStand && --this.pendingStand.frames <= 0) {
      this.teleportToView(this.pendingStand.id);
      this.pendingStand = null;
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastPanel.mesh.visible = false;
    }
    this.tablet.update(dt);
    let hoverDone = false;
    for (const st of this.ctrl) {
      if (!st.hand) continue;
      const tabletHand = this.isTabletHand(st);
      st.line.visible = !tabletHand;
      if (tabletHand) {
        st.dot.visible = false;
      } else {
        const ray = this.rayOf(st);
        const ui = this.uiHit(ray);
        if (ui) {
          this.tablet.panel.hover(ui.uv);
          st.line.scale.z = ui.distance;
          st.dot.position.copy(ui.point);
          st.dot.visible = true;
          if (!hoverDone) this.app.emit('hover', null);
        } else {
          if (this.tablet.panel.hovered && !st.uiDown) this.tablet.panel.hover(null);
          if (!hoverDone || st.pressed) this.app.interaction.move({ id: 'xr-' + st.i, ray });
          const hit = this.app.interaction.hover;
          const pt = hit?.point;
          if (pt) {
            st.line.scale.z = ray.origin.distanceTo(pt);
            st.dot.position.copy(pt);
            st.dot.visible = true;
          } else {
            st.line.scale.z = 3;
            st.dot.visible = false;
          }
        }
        hoverDone = true;
      }
      // Levette e pulsanti
      const gp = st.source?.gamepad;
      if (!gp) continue;
      const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] || 0;
      const ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1] || 0;
      if (st.hand === 'right' || !this.tablet.mesh.visible) {
        if (ay < -0.6) this.tpActive = st;
        if (this.tpActive === st) {
          const hit = this.updateArc(st);
          if (ay > -0.3) {
            if (hit) this.teleportTo(hit);
            this.tpActive = null;
            this.arc.visible = false;
            this.marker.visible = false;
          }
        }
        if (Math.abs(ax) > 0.7 && !st.turnLatch) {
          st.turnLatch = true;
          this.snapTurn(ax > 0 ? -Math.PI / 6 : Math.PI / 6);
        } else if (Math.abs(ax) < 0.3) st.turnLatch = false;
      } else if (st.hand === 'left') {
        // spostamento continuo con la levetta sinistra
        if (Math.abs(ax) > 0.15 || Math.abs(ay) > 0.15) {
          const dir = new THREE.Vector3();
          this.camera.getWorldDirection(dir);
          dir.y = 0;
          dir.normalize();
          const right = new THREE.Vector3().crossVectors(dir, Y);
          const b = this.app.world.bounds;
          this.rig.position.addScaledVector(dir, -ay * dt * 1.3).addScaledVector(right, ax * dt * 1.3);
          this.rig.position.x = Math.max(b.x0 - 2, Math.min(b.x1 + 2, this.rig.position.x));
        }
      }
      // A/X: cambia strumento · B/Y: mostra/nascondi tablet (sinistro) o annulla (destro)
      const bA = gp.buttons[4]?.pressed;
      const bB = gp.buttons[5]?.pressed;
      if (bA && !st.aLatch) {
        const order = ['select', 'wire', 'measure'];
        const it = this.app.interaction;
        it.setTool(order[(order.indexOf(it.tool) + 1) % order.length] || 'select');
        this.toast(`Strumento: ${{ select: 'Seleziona', wire: 'Cabla', measure: 'Misura' }[it.tool]}`, 'info');
      }
      if (bB && !st.bLatch) {
        if (st.hand === 'left') {
          this.tablet.mesh.visible = !this.tablet.mesh.visible;
          this.app.picker.extra = this.tablet.mesh.visible ? [this.tablet.mesh] : [];
        } else this.app.interaction.cancel();
      }
      st.aLatch = bA;
      st.bLatch = bB;
    }
  }
}
