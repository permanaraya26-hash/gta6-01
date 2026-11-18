// Rico Marlow on foot: a box-built character with walk/run animation and a
// third-person orbit camera (drag to look, wheel to zoom).
import * as THREE from 'three';
import { clamp } from './rng.js';

export function makePersonMesh(shirtColor, skinColor = 0xd9a066, pantsColor = 0x2e3a4a) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const pants = new THREE.MeshLambertMaterial({ color: pantsColor });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), skin);
  head.position.y = 1.68;
  head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.38),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  cap.position.y = 1.88;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.26), pants);
  legL.position.set(-0.17, 0.36, 0);
  g.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.26), pants);
  legR.position.set(0.17, 0.36, 0);
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.22), shirt);
  armL.position.set(-0.42, 1.14, 0);
  g.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.22), shirt);
  armR.position.set(0.42, 1.14, 0);
  g.add(armR);
  g.userData = { legL, legR, armL, armR, torso, head };
  return g;
}

export class Player {
  constructor(scene) {
    this.mesh = makePersonMesh(0xd23c2e); // Rico's red shirt
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.pos.set(0, 0, 120);
    this.heading = Math.PI;
    this.speed = 0;
    this.vy = 0;
    this.onGround = true;
    this.walkPhase = 0;
    this.visible = true;
    // camera orbit state
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 9;
    this.camTarget = new THREE.Vector3();
  }

  update(dt, input, city, inCar) {
    if (inCar) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const maxSpeed = run ? 9.5 : 5.2;
    const mx = input.moveX();
    const my = input.moveY();
    // movement relative to camera yaw
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    let dx = (sin * my + cos * mx);
    let dz = (cos * my - sin * mx);
    const len = Math.hypot(dx, dz);
    if (len > 0.01) {
      dx /= len; dz /= len;
      this.heading = Math.atan2(dx, dz);
      this.speed += (maxSpeed - this.speed) * Math.min(1, dt * 10);
    } else {
      this.speed += (0 - this.speed) * Math.min(1, dt * 10);
    }
    const nx = this.pos.x + dx * this.speed * dt;
    const nz = this.pos.z + dz * this.speed * dt;
    this.pos.x = nx; this.pos.z = nz;
    city.resolveCollision(this.pos, 0.6);
    // jump
    if (input.wasPressed('Space') && this.onGround) { this.vy = 7.5; this.onGround = false; }
    if (!this.onGround) {
      this.vy -= 22 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.onGround = true; }
    }
    // walk cycle
    this.walkPhase += this.speed * dt * 1.6;
    const swing = Math.sin(this.walkPhase) * clamp(this.speed / 5, 0, 1) * 0.55;
    const u = this.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8;
    u.armR.rotation.x = swing * 0.8;
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.rotation.y = this.heading;
  }

  // Third-person orbit camera. target = player pos or car pos; returns camera pos.
  updateCamera(camera, input, dt, targetPos, inCar) {
    this.camYaw -= input.mouseDX * 0.005;
    this.camPitch = clamp(this.camPitch + input.mouseDY * 0.004, 0.05, 1.1);
    this.camDist = clamp(this.camDist + input.wheel * 0.01, 5, 18);
    const desiredYaw = inCar ? this.camYaw : this.camYaw;
    const cx = targetPos.x - Math.sin(desiredYaw) * Math.cos(this.camPitch) * this.camDist;
    const cz = targetPos.z - Math.cos(desiredYaw) * Math.cos(this.camPitch) * this.camDist;
    const cy = targetPos.y + 1.6 + Math.sin(this.camPitch) * this.camDist;
    const t = 1 - Math.pow(0.0001, dt); // smooth follow
    camera.position.x += (cx - camera.position.x) * t;
    camera.position.y += (cy - camera.position.y) * t;
    camera.position.z += (cz - camera.position.z) * t;
    camera.lookAt(targetPos.x, targetPos.y + 1.4, targetPos.z);
  }
}
