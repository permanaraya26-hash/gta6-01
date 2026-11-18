// Particles, muzzle flashes and floating markers: small pooled meshes, no assets.
import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      m.visible = false;
      scene.add(m);
      this.particles.push({ mesh: m, vel: new THREE.Vector3(), life: 0, maxLife: 1 });
    }
    // muzzle flash: a bright sprite that shows for a few frames
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(this.flash);
    this.flashTimer = 0;
    // tracer line for gunshots
    const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0 }));
    scene.add(this.tracer);
    this.tracerTimer = 0;
  }

  burst(pos, color, count, speed = 6, up = 4, life = 0.7) {
    let spawned = 0;
    for (const p of this.particles) {
      if (spawned >= count) break;
      if (p.life > 0) continue;
      p.life = p.maxLife = life * (0.6 + Math.random() * 0.8);
      p.mesh.visible = true;
      p.mesh.position.copy(pos);
      p.mesh.material.color.setHex(color);
      p.mesh.material.opacity = 1;
      const a = Math.random() * Math.PI * 2;
      p.vel.set(Math.cos(a) * speed * Math.random(), up * Math.random(), Math.sin(a) * speed * Math.random());
      spawned++;
    }
  }

  muzzle(pos, dir) {
    this.flash.position.copy(pos).addScaledVector(dir, 0.8);
    this.flash.lookAt(pos.clone().addScaledVector(dir, 2));
    this.flashTimer = 0.07;
    this.flash.material.opacity = 0.95;
  }

  trace(from, to) {
    this.tracer.geometry.setFromPoints([from, to]);
    this.tracer.material.opacity = 0.9;
    this.tracerTimer = 0.09;
  }

  update(dt) {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vel.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.vel.y = 0; }
      p.mesh.material.opacity = p.life / p.maxLife;
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.material.opacity = 0;
    }
    if (this.tracerTimer > 0) {
      this.tracerTimer -= dt;
      if (this.tracerTimer <= 0) this.tracer.material.opacity = 0;
    }
  }
}

// A pulsing yellow beacon marking a mission target.
export function makeMarker(scene, x, z, color = 0xffd23e) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.35, 8, 32),
    new THREE.MeshBasicMaterial({ color }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  g.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 30;
  g.add(beam);
  g.position.set(x, 0, z);
  scene.add(g);
  return {
    group: g,
    update(t) {
      const s = 1 + Math.sin(t * 3) * 0.12;
      ring.scale.set(s, s, 1);
      beam.material.opacity = 0.16 + Math.sin(t * 3) * 0.08;
    },
    dispose() { scene.remove(g); },
  };
}
