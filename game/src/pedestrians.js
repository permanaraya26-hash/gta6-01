// Pedestrians: sidewalk walkers who flee from crimes, and foot cops who chase
// the player at high wanted levels.
import * as THREE from 'three';
import { pick, range, clamp } from './rng.js';
import { makePersonMesh } from './player.js';
import { CITY_EXTENT } from './city.js';

const SHIRTS = [0x3a7bd5, 0xe8b73a, 0x7a4fd2, 0x3aa655, 0xe8e8e8, 0xd2702e, 0x4fc9d2, 0xd23c8e];

export class Ped {
  constructor(scene, rng, x, z, isCop = false) {
    this.isCop = isCop;
    this.mesh = makePersonMesh(isCop ? 0x1a3a8a : pick(rng, SHIRTS), isCop ? 0xc98e5f : pick(rng, [0xd9a066, 0x8a5a3a, 0xe8c39a]));
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.pos.set(x, 0, z);
    this.heading = rng() * Math.PI * 2;
    this.speed = 0;
    this.walkPhase = rng() * 6;
    this.health = 100;
    this.down = false;
    this.downTimer = 0;
    this.fleeing = false;
    this.fleeFrom = null;
    this.axis = rng() < 0.5 ? 'x' : 'z';
    this.dir = rng() < 0.5 ? 1 : -1;
    this.laneOff = range(rng, 10.5, 12.5);
    this.turnTimer = range(rng, 2, 8);
    this.punchCooldown = 0;
    this.rng = rng;
  }

  update(dt, city, playerPos, threatPos) {
    this.punchCooldown -= dt;
    if (this.down) {
      this.downTimer -= dt;
      this.mesh.rotation.x = -Math.PI / 2 + 0.15;
      if (this.downTimer <= 0) {
        this.down = false;
        this.health = 100;
        this.mesh.rotation.x = 0;
        this.mesh.visible = true;
      }
      return;
    }
    const distToPlayer = Math.hypot(this.pos.x - playerPos.x, this.pos.z - playerPos.z);
    // cops chase the player; civilians flee a nearby threat
    if (this.isCop) {
      if (distToPlayer < 60) {
        const dx = playerPos.x - this.pos.x, dz = playerPos.z - this.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        this.heading = Math.atan2(dx, dz);
        this.speed = 7.2;
        this.pos.x += (dx / d) * this.speed * dt;
        this.pos.z += (dz / d) * this.speed * dt;
      } else {
        this.wander(dt, city);
      }
    } else if (threatPos && Math.hypot(this.pos.x - threatPos.x, this.pos.z - threatPos.z) < 18) {
      this.fleeing = true;
      const dx = this.pos.x - threatPos.x, dz = this.pos.z - threatPos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.heading = Math.atan2(dx, dz);
      this.speed = 8.5;
      this.pos.x += (dx / d) * this.speed * dt;
      this.pos.z += (dz / d) * this.speed * dt;
      city.resolveCollision(this.pos, 0.6);
    } else {
      this.fleeing = false;
      this.wander(dt, city);
    }
    this.walkPhase += this.speed * dt * 1.8;
    const swing = Math.sin(this.walkPhase) * clamp(this.speed / 5, 0, 1) * 0.5;
    const u = this.mesh.userData;
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8; u.armR.rotation.x = swing * 0.8;
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.heading;
  }

  wander(dt, city) {
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.turnTimer = range(this.rng, 3, 9);
      if (this.rng() < 0.4) { this.axis = this.axis === 'x' ? 'z' : 'x'; this.dir = this.rng() < 0.5 ? 1 : -1; }
      else this.dir *= -1;
    }
    this.speed = 1.6;
    const road = this.axis === 'x'
      ? city.roadLines.reduce((a, b) => Math.abs(b - this.pos.z) < Math.abs(a - this.pos.z) ? b : a)
      : city.roadLines.reduce((a, b) => Math.abs(b - this.pos.x) < Math.abs(a - this.pos.x) ? b : a);
    if (this.axis === 'x') {
      this.pos.x += this.dir * this.speed * dt;
      this.pos.z += ((road + this.laneOff) - this.pos.z) * Math.min(1, dt * 2);
      this.heading = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (this.pos.x > CITY_EXTENT + 10) this.dir = -1;
      if (this.pos.x < -CITY_EXTENT - 10) this.dir = 1;
    } else {
      this.pos.z += this.dir * this.speed * dt;
      this.pos.x += ((road + this.laneOff) - this.pos.x) * Math.min(1, dt * 2);
      this.heading = this.dir > 0 ? 0 : Math.PI;
      if (this.pos.z > CITY_EXTENT + 10) this.dir = -1;
      if (this.pos.z < -CITY_EXTENT - 10) this.dir = 1;
    }
    city.resolveCollision(this.pos, 0.6);
  }

  knockDown() {
    this.down = true;
    this.downTimer = 6;
    this.health = 0;
  }

  remove(scene) { scene.remove(this.mesh); }
}

export function spawnPedestrians(scene, city, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const p = city.randomRoadPoint(rng);
    peds.push(new Ped(scene, rng, p.x + range(rng, -10, 10), p.z + range(rng, -10, 10)));
  }
  return peds;
}
