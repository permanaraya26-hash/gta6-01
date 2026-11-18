// Wanted level + Solmar Bay Police Department: heat, stars, pursuit cars,
// foot cops, busted / wasted outcomes.
import * as THREE from 'three';
import { Car } from './vehicles.js';
import { Ped } from './pedestrians.js';
import { clamp } from './rng.js';

export function starsForHeat(heat) {
  if (heat < 10) return 0;
  if (heat < 30) return 1;
  if (heat < 50) return 2;
  if (heat < 70) return 3;
  if (heat < 90) return 4;
  return 5;
}

export class Police {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.heat = 0;
    this.stars = 0;
    this.calmTimer = 0;      // seconds since last crime
    this.cars = [];          // pursuing SBPD cars
    this.cops = [];          // foot cops
    this.bustTimer = 0;      // seconds a cop/car has been touching the player on foot
    this.stuckTimers = new Map();
  }

  addHeat(n) {
    this.heat = clamp(this.heat + n, 0, 100);
    this.calmTimer = 0;
    this.stars = starsForHeat(this.heat);
  }

  setHeat(n) {
    this.heat = clamp(n, 0, 100);
    this.calmTimer = 0;
    this.stars = starsForHeat(this.heat);
  }

  wantedCount() {
    return [0, 1, 1, 2, 3, 4][this.stars];
  }

  update(dt, game) {
    const playerPos = game.playerPos();
    const inCar = !!game.currentCar;
    // heat decays when the player stays clean
    this.calmTimer += dt;
    if (this.calmTimer > 8 && this.heat > 0) {
      this.heat = Math.max(0, this.heat - dt * 1.6);
      const s = starsForHeat(this.heat);
      if (s !== this.stars) this.stars = s;
    }
    // spawn / despawn pursuit cars
    const want = this.wantedCount();
    while (this.cars.length < want) this.spawnCar(game);
    while (this.cars.length > want) {
      const c = this.cars.pop();
      this.scene.remove(c.mesh);
    }
    // foot cops at 3+ stars
    const wantCops = this.stars >= 3 ? 2 : this.stars >= 2 ? 1 : 0;
    while (this.cops.length < wantCops) this.spawnCop(game);
    while (this.cops.length > wantCops) {
      const c = this.cops.pop();
      c.remove(this.scene);
    }
    // chase
    for (const car of this.cars) this.chaseCar(dt, car, game, playerPos);
    for (const cop of this.cops) {
      cop.update(dt, this.city, playerPos, null);
      // cop punches the player on foot
      if (!inCar) {
        const d = Math.hypot(cop.pos.x - playerPos.x, cop.pos.z - playerPos.z);
        if (d < 1.8 && cop.punchCooldown <= 0) {
          cop.punchCooldown = 1.1;
          game.damagePlayer(9, 'cop');
        }
      }
    }
    // busted: police touching the player on foot
    if (!inCar && this.stars > 0) {
      let touching = false;
      for (const car of this.cars) {
        if (Math.hypot(car.pos.x - playerPos.x, car.pos.z - playerPos.z) < 3.2) touching = true;
      }
      for (const cop of this.cops) {
        if (Math.hypot(cop.pos.x - playerPos.x, cop.pos.z - playerPos.z) < 2.2) touching = true;
      }
      this.bustTimer = touching ? this.bustTimer + dt : 0;
      if (this.bustTimer > 2.2) {
        this.bustTimer = 0;
        game.busted();
      }
    } else {
      this.bustTimer = 0;
    }
    // siren volume follows nearest police car
    let nearest = 1e9;
    for (const car of this.cars) nearest = Math.min(nearest, Math.hypot(car.pos.x - playerPos.x, car.pos.z - playerPos.z));
    game.audio.setSiren(this.cars.length > 0 && nearest < 90, dt);
  }

  spawnCar(game) {
    const p = game.playerPos();
    const spot = this.city.randomRoadPoint(this.rng);
    // try to spawn on a road 45-80 units away
    let best = spot;
    for (let i = 0; i < 8; i++) {
      const cand = this.city.randomRoadPoint(this.rng);
      const d = Math.hypot(cand.x - p.x, cand.z - p.z);
      if (d > 45 && d < 90) { best = cand; break; }
    }
    const car = new Car(this.scene, { police: true, rng: this.rng, x: best.x, z: best.z, heading: 0 });
    car.maxSpeed = 39;
    this.cars.push(car);
    this.stuckTimers.set(car, 0);
  }

  spawnCop(game) {
    const p = game.playerPos();
    const a = this.rng() * Math.PI * 2;
    const cop = new Ped(this.scene, this.rng, p.x + Math.cos(a) * 22, p.z + Math.sin(a) * 22, true);
    this.cops.push(cop);
  }

  chaseCar(dt, car, game, playerPos) {
    const dx = playerPos.x - car.pos.x;
    const dz = playerPos.z - car.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const targetHeading = Math.atan2(dx, dz);
    let dh = targetHeading - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += clamp(dh, -2.2 * dt, 2.2 * dt);
    const targetSpeed = dist > 8 ? car.maxSpeed : car.maxSpeed * 0.55;
    car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
    const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
    car.pos.x = nx; car.pos.z = nz;
    const beforeX = nx, beforeZ = nz;
    this.city.resolveCollision(car.pos, 2.2);
    const blocked = Math.abs(car.pos.x - beforeX) > 0.01 || Math.abs(car.pos.z - beforeZ) > 0.01;
    if (blocked) {
      car.speed *= 0.5;
      car.heading += 0.6 * dt; // scrape along the wall
      const st = (this.stuckTimers.get(car) || 0) + dt;
      this.stuckTimers.set(car, st);
      if (st > 3) {
        // teleport the unit to a road near the player instead of staying stuck
        const spot = this.city.randomRoadPoint(this.rng);
        car.pos.x = spot.x; car.pos.z = spot.z;
        car.speed = 0;
        this.stuckTimers.set(car, 0);
      }
    } else {
      this.stuckTimers.set(car, 0);
    }
    // ram the player's car / knock the player
    if (game.currentCar) {
      const d = Math.hypot(car.pos.x - game.currentCar.pos.x, car.pos.z - game.currentCar.pos.z);
      if (d < 3.4) {
        game.currentCar.health = Math.max(0, game.currentCar.health - 12 * dt);
        game.currentCar.speed *= 0.98;
        if (Math.random() < dt * 8) game.effects.burst(new THREE.Vector3(car.pos.x, 1, car.pos.z), 0xffa040, 2, 3, 2, 0.4);
      }
    } else if (dist < 3.0) {
      game.damagePlayer(14 * dt, 'ram');
    }
    car.syncMesh();
  }

  clearAll() {
    for (const c of this.cars) this.scene.remove(c.mesh);
    for (const c of this.cops) c.remove(this.scene);
    this.cars = []; this.cops = [];
    this.heat = 0; this.stars = 0; this.bustTimer = 0;
  }
}
