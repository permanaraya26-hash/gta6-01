// Combat: fists and a pistol. Hitscan pistol with ray-vs-target math,
// punch with a short arc, car damage and explosions.
import * as THREE from 'three';

export class Combat {
  constructor(game) {
    this.game = game;
    this.weapon = 'fists'; // 'fists' | 'pistol'
    this.ammo = 12;
    this.magSize = 12;
    this.reloadTimer = 0;
    this.cooldown = 0;
    this.punchCooldown = 0;
  }

  update(dt, input, camera) {
    this.cooldown -= dt;
    this.punchCooldown -= dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) { this.ammo = this.magSize; this.game.hud.flashAmmo(); }
    }
    if (input.wasPressed('Digit1')) { this.weapon = 'fists'; this.game.audio.click(); }
    if (input.wasPressed('Digit2')) { this.weapon = 'pistol'; this.game.audio.click(); }
    if (input.wasPressed('KeyR') && this.weapon === 'pistol' && this.ammo < this.magSize) {
      this.reloadTimer = 1.1;
      this.game.audio.click();
    }
    const inCar = !!this.game.currentCar;
    if (inCar) return; // no shooting from the car in slice 1
    if (this.weapon === 'pistol' && input.mouseDown && this.cooldown <= 0 && this.reloadTimer <= 0) {
      this.shoot(camera);
    }
    if (input.wasPressed('KeyF') && this.punchCooldown <= 0) {
      this.punch();
    }
  }

  // Ray from the camera through the screen centre; test peds, cops and cars.
  shoot(camera) {
    if (this.ammo <= 0) { this.game.audio.click(); this.reloadTimer = 1.1; return; }
    this.ammo--;
    this.cooldown = 0.28;
    const g = this.game;
    g.audio.gunshot();
    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const from = g.player.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0));
    g.effects.muzzle(from, dir);
    // find the nearest target the ray passes within ~1.2 units of
    let best = null; let bestT = 70;
    const test = (pos, radius, ref) => {
      const to = new THREE.Vector3(pos.x - origin.x, 1.2 - origin.y, pos.z - origin.z);
      const t = to.dot(dir);
      if (t < 1 || t > 70) return;
      const closest = origin.clone().addScaledVector(dir, t);
      const d = Math.hypot(closest.x - pos.x, closest.y - 1.2, closest.z - pos.z);
      if (d < radius && t < bestT) { bestT = t; best = ref; }
    };
    for (const ped of g.peds) if (!ped.down) test(ped.pos, 1.3, { kind: 'ped', ref: ped });
    for (const cop of g.police.cops) if (!cop.down) test(cop.pos, 1.3, { kind: 'cop', ref: cop });
    for (const car of [...g.parkedCars, ...g.trafficCars, ...g.police.cars]) {
      test(car.pos, 2.4, { kind: 'car', ref: car });
    }
    const end = origin.clone().addScaledVector(dir, best ? bestT : 60);
    g.effects.trace(from, end);
    if (best) {
      g.effects.burst(new THREE.Vector3(best.ref.pos.x, 1.2, best.ref.pos.z), 0xff5040, 6, 4, 3, 0.5);
      if (best.kind === 'ped') {
        best.ref.health -= 34;
        g.police.addHeat(12);
        if (best.ref.health <= 0) best.ref.knockDown();
      } else if (best.kind === 'cop') {
        best.ref.health -= 50;
        g.police.addHeat(18);
        if (best.ref.health <= 0) best.ref.knockDown();
      } else {
        best.ref.health -= 12;
        if (best.ref.health <= 0) g.explodeCar(best.ref);
      }
    }
  }

  punch() {
    this.punchCooldown = 0.45;
    const g = this.game;
    g.audio.punch();
    const p = g.player.pos;
    const fx = Math.sin(g.player.heading), fz = Math.cos(g.player.heading);
    const hit = (pos, radius) => {
      const dx = pos.x - p.x, dz = pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.4) return false;
      const dot = (dx * fx + dz * fz) / (d || 1);
      return dot > 0.3;
    };
    for (const ped of g.peds) {
      if (!ped.down && hit(ped.pos, 1.2)) {
        ped.health -= 30;
        g.effects.burst(new THREE.Vector3(ped.pos.x, 1.2, ped.pos.z), 0xffe27a, 4, 3, 2, 0.4);
        if (ped.health <= 0) { ped.knockDown(); g.police.addHeat(10); }
        return;
      }
    }
    for (const cop of g.police.cops) {
      if (!cop.down && hit(cop.pos, 1.2)) {
        cop.health -= 45;
        if (cop.health <= 0) { cop.knockDown(); g.police.addHeat(15); }
        return;
      }
    }
  }
}
