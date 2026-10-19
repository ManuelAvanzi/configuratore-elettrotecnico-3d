// Indicatori 3D del tutorial: cerchi pulsanti sui morsetti (con numero), riquadri sui componenti
// e una freccia che indica dove cliccare. Vivono nel banco (wallRoot) e seguono la scala didattica.
import * as THREE from 'three';

function labelTexture(text, bg) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = '800 70px Manrope, Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const MARK = { start: 0xff7a1a, end: 0x2fbf6a, focus: 0xffc14d, target: 0xff5900 };

export class Markers {
  constructor(app) {
    this.app = app;
    this.root = new THREE.Group();
    this.root.name = 'tutorial-markers';
    app.world.wallRoot.add(this.root);
    this.worldRoot = new THREE.Group();
    app.world.root.add(this.worldRoot);
    this.items = [];
    this.t = 0;
    // freccia (in coordinate del banco)
    const arrow = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: MARK.target, depthTest: false, transparent: true });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.026, 20), mat);
    cone.rotation.x = Math.PI;
    cone.position.y = 0.013;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.03, 12), mat);
    shaft.position.y = 0.04;
    arrow.add(cone, shaft);
    arrow.renderOrder = 40;
    arrow.traverse((o) => {
      o.renderOrder = 40;
    });
    arrow.visible = false;
    this.arrow = arrow;
    this.root.add(arrow);
  }

  clear() {
    for (const it of this.items) {
      it.obj.parent?.remove(it.obj);
      it.obj.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
    }
    this.items = [];
    this.arrow.visible = false;
  }

  /** Cerchio pulsante su un morsetto (item della ProjectView), con numero facoltativo */
  terminal(term, { color = MARK.start, label = null } = {}) {
    const g = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0085, 0.0016, 10, 36), ringMat);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.0075, 0.014, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthTest: false, side: THREE.DoubleSide }));
    g.add(halo, ring);
    if (label) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(label, '#' + new THREE.Color(color).getHexString()), depthTest: false }));
      sp.scale.setScalar(0.018);
      sp.position.set(0.016, 0.016, 0.004);
      sp.renderOrder = 42;
      g.add(sp);
    }
    g.position.copy(term.screw);
    g.position.z += 0.002;
    g.traverse((o) => {
      o.renderOrder = Math.max(o.renderOrder, 41);
    });
    this.root.add(g);
    this.items.push({ kind: 'terminal', obj: g, ring, halo, term });
    return g;
  }

  /** Riquadro pulsante attorno a un oggetto 3D (coordinate mondo) */
  box(object, { color = MARK.focus, pad = 0.012 } = {}) {
    object.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(object);
    if (b.isEmpty()) return null;
    return this.boxFrom(b, { color, pad });
  }

  boxFrom(b, { color = MARK.focus, pad = 0.012 } = {}) {
    const size = b.getSize(new THREE.Vector3()).addScalar(pad * 2);
    const c = b.getCenter(new THREE.Vector3());
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color, transparent: true, depthTest: false }));
    edges.scale.copy(size);
    edges.position.copy(c);
    edges.renderOrder = 39;
    this.worldRoot.add(edges);
    this.items.push({ kind: 'box', obj: edges });
    return edges;
  }

  /** Freccia sopra un punto (coordinate del banco) */
  pointAt(localPos) {
    if (!localPos) {
      this.arrow.visible = false;
      return;
    }
    this.arrowBase = localPos.clone().add(new THREE.Vector3(0, 0.018, 0.03));
    this.arrow.position.copy(this.arrowBase);
    this.arrow.visible = true;
  }

  update(dt) {
    this.t += dt;
    const k = 0.5 + 0.5 * Math.sin(this.t * 5);
    for (const it of this.items) {
      if (it.kind === 'terminal') {
        it.ring.scale.setScalar(1 + 0.25 * k);
        it.halo.material.opacity = 0.2 + 0.35 * k;
      } else if (it.kind === 'box') {
        it.obj.material.opacity = 0.45 + 0.55 * k;
      }
    }
    if (this.arrow.visible && this.arrowBase) this.arrow.position.y = this.arrowBase.y + 0.012 * Math.abs(Math.sin(this.t * 3.2));
  }
}
