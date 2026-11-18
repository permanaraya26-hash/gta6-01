// Cars: build, drive physics, traffic AI and parked-car spawns.
// A car is a box-built low-poly vehicle: body, cabin, wheels, lights, bumpers.
import * as THREE from 'three';
import { pick, range, clamp } from './rng.js';
import { ROAD_HALF, CITY_EXTENT } from './city.js';

export const CAR_NAMES = ['Comet GT', 'Sundown Cruiser', 'Bayline Sedan', 'Palm Runner', 'Marina Coupe', 'Tide Van', 'Solstice Sport', 'Harbor Pickup'];
const CAR_COLORS = [0xd23c2e, 0x2e6fd2, 0xe8b73a, 0x3aa655, 0xe8e8e8, 0x222226, 0xd2702e, 0x7a4fd2, 0x4fc9d2, 0xc2c9d2];

export function makeCarMesh(color, isPolice = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0xf2f2f2 : color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x181c22 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), new THREE.MeshLambertMaterial({ color: isPolice ? 0x181c22 : 0x2a3542 }));
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  g.add(cabin);
  // hood + trunk hints
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.9), bodyMat);
  hood.position.set(0, 0.9, 1.7);
  g.add(hood);
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.38, z);
    g.add(w); wheels.push(w);
  }
  // headlights / taillights
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const x of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), headMat);
    h.position.set(x, 0.62, 2.22);
    g.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
  for (const x of [-0.65, 0.65]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), tailMat);
    t.position.set(x, 0.62, -2.22);
    g.add(t);
  }
  if (isPolice) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 1.4),
      new THREE.MeshLambertMaterial({ color: 0x1a3a8a }));
    door.position.set(0, 0.62, 0.3);
    g.add(door);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.48, -0.2);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.32), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.set(-0.3, 1.6, -0.2);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.32), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    blue.position.set(0.3, 1.6, -0.2);
    g.add(blue);
    g.userData.lightRed = red; g.userData.lightBlue = blue;
  }
  g.userData.wheels = wheels;
  return g;
}

export class Car {
  constructor(scene, opts = {}) {
    this.isPolice = !!opts.police;
    this.color = opts.color ?? pick(opts.rng ?? Math.random, CAR_COLORS);
    this.name = this.isPolice ? 'SBPD Interceptor' : (opts.name ?? pick(opts.rng ?? Math.random, CAR_NAMES));
    this.mesh = makeCarMesh(this.color, this.isPolice);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.pos.set(opts.x ?? 0, 0, opts.z ?? 0);
    this.heading = opts.heading ?? 0;
    this.speed = 0;
    this.steer = 0;
    this.maxSpeed = this.isPolice ? 40 : range(opts.rng ?? Math.random, 30, 38);
    this.health = 100;
    this.occupied = false;   // player inside
    this.isTraffic = !!opts.traffic;
    this.isParked = !!opts.parked;
    this.driver = opts.driver ?? null; // pedestrian driving it (traffic)
    // traffic AI state
    this.axis = opts.axis ?? 'x';
    this.dir = opts.dir ?? 1;
    this.lane = 4;           // right-hand lane offset
    this.cruise = range(opts.rng ?? Math.random, 8, 13);
    this.turnCooldown = 0;
    this.stuckTimer = 0;
    this.smokeTimer = 0;
    this.syncMesh();
  }

  syncMesh() {
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * 0.016 * 2.6;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    if (this.isPolice) {
      const on = Math.floor(performance.now() / 260) % 2 === 0;
      this.mesh.userData.lightRed.material.color.setHex(on ? 0xff2020 : 0x551111);
      this.mesh.userData.lightBlue.material.color.setHex(on ? 0x2233aa : 0x2040ff);
    }
  }

  // Arcade driving for the player. Returns nothing; reads input axes.
  drive(dt, throttle, steerInput, handbrake, city) {
    const accel = 16;
    const brake = 26;
    if (throttle > 0) this.speed += accel * throttle * dt;
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= brake * dt;
      else this.speed = Math.max(this.speed - 9 * dt, -10);
    } else {
      this.speed -= Math.sign(this.speed) * 6 * dt;
      if (Math.abs(this.speed) < 0.3) this.speed = 0;
    }
    if (handbrake) this.speed *= Math.pow(0.12, dt);
    this.speed = clamp(this.speed, -11, this.maxSpeed);
    const steerTarget = steerInput * 0.55 * clamp(Math.abs(this.speed) / 8, 0.25, 1);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    if (Math.abs(this.speed) > 0.2) {
      this.heading += (this.steer * this.speed * 0.055) * dt * (this.speed >= 0 ? 1 : -1);
    }
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x = nx; this.pos.z = nz;
    city.resolveCollision(this.pos, 2.2);
    if (Math.abs(this.pos.x - nx) > 0.01 || Math.abs(this.pos.z - nz) > 0.01) {
      // hit a building: scrape speed off
      this.speed *= 0.55;
      this.health = Math.max(0, this.health - Math.abs(this.speed) * 0.4);
    }
    void before;
    this.syncMesh();
  }

  // Traffic: follow the road grid, turn at intersections, brake for cars ahead.
  updateTraffic(dt, city, rng, carsAhead) {
    this.turnCooldown -= dt;
    let targetSpeed = this.cruise;
    // brake if a car is close ahead on the same lane
    const aheadX = this.pos.x + Math.sin(this.heading) * 9;
    const aheadZ = this.pos.z + Math.cos(this.heading) * 9;
    for (const other of carsAhead) {
      if (other === this) continue;
      const d = Math.hypot(other.pos.x - aheadX, other.pos.z - aheadZ);
      if (d < 5) { targetSpeed = 0; break; }
    }
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 2);
    // at an intersection, maybe turn onto the crossing road
    const nearCross = city.roadLines.some((r) => Math.abs(this.pos.x - r) < 2.5 || Math.abs(this.pos.z - r) < 2.5);
    const onRoadCenter = city.roadLines.some((r) => Math.abs(this.axis === 'x' ? this.pos.z - r : this.pos.x - r) < 1.2);
    if (nearCross && onRoadCenter && this.turnCooldown <= 0 && rng() < 0.012) {
      this.axis = this.axis === 'x' ? 'z' : 'x';
      this.dir = rng() < 0.5 ? 1 : -1;
      this.turnCooldown = 2;
    }
    // heading follows axis/dir, lane offset to the right of travel
    const targetHeading = this.axis === 'x' ? (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (this.dir > 0 ? 0 : Math.PI);
    let dh = targetHeading - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += clamp(dh, -1.6 * dt, 1.6 * dt);
    // move along current road with lane offset
    const laneOff = this.axis === 'x' ? (this.dir > 0 ? this.lane : -this.lane) : (this.dir > 0 ? -this.lane : this.lane);
    if (this.axis === 'x') {
      this.pos.x += this.dir * this.speed * dt;
      const roadZ = city.roadLines.reduce((a, b) => Math.abs(b - this.pos.z) < Math.abs(a - this.pos.z) ? b : a);
      this.pos.z += (roadZ + laneOff - this.pos.z) * Math.min(1, dt * 3);
      if (this.pos.x > CITY_EXTENT + 4) { this.pos.x = -CITY_EXTENT - 4; }
      if (this.pos.x < -CITY_EXTENT - 4) { this.pos.x = CITY_EXTENT + 4; }
    } else {
      this.pos.z += this.dir * this.speed * dt;
      const roadX = city.roadLines.reduce((a, b) => Math.abs(b - this.pos.x) < Math.abs(a - this.pos.x) ? b : a);
      this.pos.x += (roadX + laneOff - this.pos.x) * Math.min(1, dt * 3);
      if (this.pos.z > CITY_EXTENT + 4) { this.pos.z = -CITY_EXTENT - 4; }
      if (this.pos.z < -CITY_EXTENT - 4) { this.pos.z = CITY_EXTENT + 4; }
    }
    this.syncMesh();
  }
}

export function spawnParkedCars(scene, city, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const p = city.randomRoadPoint(rng);
    const horiz = rng() < 0.5;
    const car = new Car(scene, {
      rng, parked: true,
      x: horiz ? p.x : p.x + (rng() < 0.5 ? -6.2 : 6.2),
      z: horiz ? p.z + (rng() < 0.5 ? -6.2 : 6.2) : p.z,
      heading: horiz ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI),
    });
    cars.push(car);
  }
  return cars;
}

export function spawnTrafficCars(scene, city, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const p = city.randomRoadPoint(rng);
    const axis = rng() < 0.5 ? 'x' : 'z';
    const dir = rng() < 0.5 ? 1 : -1;
    const car = new Car(scene, {
      rng, traffic: true, axis, dir,
      x: axis === 'x' ? p.x : p.x,
      z: axis === 'x' ? p.z : p.z,
      heading: axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
    });
    cars.push(car);
  }
  return cars;
}
