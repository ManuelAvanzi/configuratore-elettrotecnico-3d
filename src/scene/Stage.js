// Palcoscenico 3D: renderer (WebGL2 + WebXR), telecamera, controlli orbitali, luci e ambiente.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export class Stage {
  constructor(container) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    container.appendChild(renderer.domElement);
    renderer.domElement.classList.add('stage-canvas');
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd8dde2);
    this.scene = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.38;
    pmrem.dispose();

    // Rig del giocatore (in VR la telecamera è figlia del rig; da desktop il rig resta nell'origine)
    this.rig = new THREE.Group();
    this.rig.name = 'rig';
    scene.add(this.rig);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.02, 60);
    camera.position.set(0.25, 1.75, 3.7);
    this.rig.add(camera);
    this.camera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0.3, 1.38, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.minDistance = 0.18;
    controls.maxDistance = 8;
    controls.maxPolarAngle = Math.PI * 0.53;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.update();
    this.controls = controls;

    this.buildLights();

    this.timer = new THREE.Timer();
    this.callbacks = new Set();
    this.tween = null;
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);

    renderer.setAnimationLoop((t, frame) => this.frame(t, frame));
  }

  buildLights() {
    const s = this.scene;
    const hemi = new THREE.HemisphereLight(0xe8eef6, 0x8d877b, 0.32);
    s.add(hemi);

    // Luce principale sopra il banco (con ombre morbide)
    const key = new THREE.SpotLight(0xfff6ea, 24, 7, 0.95, 0.75, 1.4);
    key.position.set(0.35, 2.95, 2.0);
    key.target.position.set(0.3, 1.25, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.015;
    key.shadow.radius = 3;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 6;
    s.add(key, key.target);
    this.keyLight = key;

    // Luce naturale dalle finestre (sinistra)
    const sun = new THREE.DirectionalLight(0xfff1dc, 0.8);
    sun.position.set(-8, 6, 4);
    sun.target.position.set(1, 0.8, 2);
    s.add(sun, sun.target);
    this.sun = sun;

    // Riempimento dalla zona LIM
    const fill = new THREE.PointLight(0xe6efff, 2.2, 8, 1.6);
    fill.position.set(2.8, 2.6, 2.4);
    s.add(fill);
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    if (this.renderer.xr.isPresenting) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  onFrame(fn) {
    this.callbacks.add(fn);
    return () => this.callbacks.delete(fn);
  }

  /** Transizione morbida della telecamera verso una vista */
  flyTo(pos, target, duration = 0.8) {
    this.tween = {
      t: 0,
      d: duration,
      p0: this.camera.position.clone(),
      t0: this.controls.target.clone(),
      p1: pos.clone(),
      t1: target.clone(),
    };
  }

  frame(time, xrFrame) {
    this.timer.update(time);
    const dt = Math.min(0.1, this.timer.getDelta());
    const xr = this.renderer.xr.isPresenting;
    if (!xr) {
      if (this.tween) {
        const tw = this.tween;
        tw.t += dt;
        const k = Math.min(1, tw.t / tw.d);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        this.camera.position.lerpVectors(tw.p0, tw.p1, e);
        this.controls.target.lerpVectors(tw.t0, tw.t1, e);
        if (k >= 1) this.tween = null;
      }
      this.controls.update();
    }
    for (const fn of this.callbacks) fn(dt, time, xrFrame);
    this.renderer.render(this.scene, this.camera);
  }

  /** Cattura un'immagine della vista corrente (per la scheda tecnica) */
  snapshot(width = 1600, height = 900) {
    const r = this.renderer;
    const prevSize = r.getSize(new THREE.Vector2());
    const prevAspect = this.camera.aspect;
    const prevRatio = r.getPixelRatio();
    r.setPixelRatio(1);
    r.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    r.render(this.scene, this.camera);
    const url = r.domElement.toDataURL('image/jpeg', 0.9);
    r.setPixelRatio(prevRatio);
    r.setSize(prevSize.x, prevSize.y, false);
    this.camera.aspect = prevAspect;
    this.camera.updateProjectionMatrix();
    return url;
  }
}
