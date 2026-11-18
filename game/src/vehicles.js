// Solmar Bay — cars: the fleet, arcade driving, and city traffic.
// Written from scratch for this entry. A car faces local -z, so with
// group.rotation.y = angle its world heading is (-sin a, -cos a).
import * as THREE from 'three';
import { mulberry32, clamp, pick, randRange, dist2d } from './util.js';
import { ROAD_LINES, CITY_HALF, BEACH_X, OCEAN_X } from './city.js';

const TOP_SPEED = 42;
const REVERSE_SPEED = 12;
const ACCEL = 26;
const BRAKE = 34;
const REVERSE_ACCEL = 15;
const DRAG = 16;
const HANDBRAKE = 42;
const TURN_RATE = 2.3;
const SAND_CAP = 14;
const PIER = { x0: 195, x1: 320, z0: -5, z1: 12 };

const MODELS = [
  { name: 'Comet GT', color: 0xd23b2e },
  { name: 'Palm Runner', color: 0xe8c832 },
  { name: 'Bay Cruiser', color: 0x2a6ab8 },
  { name: 'Sunset Coupe', color: 0xe86a1e },
  { name: 'Marina Van', color: 0x7a8a99 },
  { name: 'Coral Taxi', color: 0xf2c200 },
  { name: 'Drift King', color: 0x8a2be2 },
  { name: 'Harbor Pickup', color: 0x3a7a4a },
];

function heading(angle) {
  return { x: -Math.sin(angle), z: -Math.cos(angle) };
}

function angleForLane(lane) {
  if (lane.along === 'z') return lane.dir > 0 ? Math.PI : 0;
  return lane.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
}

export function createVehicles(G) {
  const scene = G.scene;
  const rng = mulberry32((G.seed ^ 0x5f3a) >>> 0);
  const cars = [];
  const traffic = [];

  // --- mesh building ---------------------------------------------------
  function assembleCarMesh(model, color, police) {
    const group = new THREE.Group();
    const paint = new THREE.MeshLambertMaterial({ color });
    const glass = new THREE.MeshLambertMaterial({ color: 0x18242e });
    const trim = new THREE.MeshLambertMaterial({ color: 0x222222 });

    // Lower body, cabin, and a dark glass band. Front is local -z.
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.72, 4.4), paint);
    body.position.y = 0.62;
    body.castShadow = true;
    group.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.6, 2.3), glass);
    cabin.position.set(0, 1.26, 0.25);
    cabin.castShadow = true;
    group.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 2.0), paint);
    roof.position.set(0, 1.6, 0.25);
    group.add(roof);
    // Bumpers and lights.
    const front = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.18), trim);
    front.position.set(0, 0.45, -2.22);
    group.add(front);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.18), trim);
    rear.position.set(0, 0.45, 2.22);
    group.add(rear);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
    for (const sx of [-0.65, 0.65]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.08), lampMat);
      lamp.position.set(sx, 0.72, -2.24);
      group.add(lamp);
    }
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
    for (const sx of [-0.65, 0.65]) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), tailMat);
      tail.position.set(sx, 0.72, 2.24);
      group.add(tail);
    }
    if (police) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 2.6), trim);
      stripe.position.set(0, 0.62, 0.1);
      group.add(stripe);
    }

    // Wheels: a hub group per corner so the tyre can spin on its axle.
    const spins = [];
    const sinks = [];
    const tyreMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
    const hubMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc0 });
    for (const [wx, wz] of [[-0.95, -1.45], [0.95, -1.45], [-0.95, 1.45], [0.95, 1.45]]) {
      const hub = new THREE.Group();
      hub.position.set(wx, 0.38, wz);
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14), tyreMat);
      tyre.rotation.z = Math.PI / 2;
      tyre.castShadow = true;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 10), hubMat);
      cap.rotation.z = Math.PI / 2;
      hub.add(tyre);
      hub.add(cap);
      group.add(hub);
      spins.push(tyre);
      // Other systems poke car.wheels[].rotation.y; give them a harmless
      // sink so the visual wheels are never yawed by it.
      sinks.push({ rotation: { y: 0 } });
    }

    let lightBar = null;
    if (police) {
      lightBar = new THREE.Group();
      const red = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.22, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xff2020 }),
      );
      red.position.x = -0.45;
      const blue = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.22, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x2040ff }),
      );
      blue.position.x = 0.45;
      lightBar.add(red);
      lightBar.add(blue);
      lightBar.position.set(0, 1.72, 0.25);
      group.add(lightBar);
    }
    return { group, spins, sinks, lightBar };
  }

  function attachSmoke(car) {
    const puffs = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.7 });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), mat.clone());
      s.position.set((i - 1) * 0.4, 1.4 + i * 0.3, 0.6);
      puffs.add(s);
    }
    car.group.add(puffs);
    car.smoke = {
      update(dt) {
        puffs.position.y += dt * 1.2;
        if (puffs.position.y > 1.6) puffs.position.y = 0;
        for (const p of puffs.children) p.material.opacity = 0.45 + 0.25 * Math.sin(G.time * 5 + p.position.x * 8);
      },
    };
  }

  // --- the fleet --------------------------------------------------------
  function makeCar(x, z, angle, opts = {}) {
    const model = MODELS.find((m) => m.name === opts.name)
      || pick(rng, MODELS);
    const police = !!opts.police;
    const color = opts.color !== undefined ? opts.color : police ? 0xececec : model.color;
    const { group, spins, sinks, lightBar } = assembleCarMesh(model, color, police);
    group.position.set(x, 0, z);
    group.rotation.y = angle;
    scene.add(group);
    const car = {
      name: model.name,
      color,
      group,
      pos: group.position,
      angle,
      speed: 0,
      health: 100,
      dead: false,
      isPlayer: false,
      isPolice: police,
      parked: !!opts.parked,
      traffic: false,
      wheels: sinks,
      wheelSpins: spins,
      smoke: null,
      lightBar,
      flashAt: 0,
      ramAt: -10,
      lane: null,
      cruise: 0,
      crashAt: -10,
      turnAt: -10,
    };
    cars.push(car);
    return car;
  }

  function removeCar(car) {
    if (!car) return;
    scene.remove(car.group);
    const ci = cars.indexOf(car);
    if (ci >= 0) cars.splice(ci, 1);
    const ti = traffic.indexOf(car);
    if (ti >= 0) traffic.splice(ti, 1);
  }

  function damageCar(car, amount, source) {
    if (!car || car.dead) return;
    car.health -= amount;
    if (car.health <= 55 && !car.smoke) attachSmoke(car);
    if (car.health > 0) return;
    car.health = 0;
    car.dead = true;
    if (G.effects && G.effects.explosion) G.effects.explosion(car.pos.x, 1.2, car.pos.z);
    if (car.isPlayer && G.playerExitCar) G.playerExitCar(true);
    car.group.visible = false;
    const ti = traffic.indexOf(car);
    if (ti >= 0) traffic.splice(ti, 1);
  }

  function nearestCar(x, z, radius, exclude) {
    let best = null;
    let bestD = radius;
    for (const car of cars) {
      if (car.dead || car === exclude) continue;
      const d = dist2d(x, z, car.pos.x, car.pos.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function randomLane() {
    const along = rng() < 0.5 ? 'z' : 'x';
    const line = pick(rng, ROAD_LINES);
    const dir = rng() < 0.5 ? 1 : -1;
    return { along, line, dir };
  }

  function placeOnLane(car, lane, alongPos) {
    const off = lane.dir > 0 ? 2.6 : -2.6;
    if (lane.along === 'z') {
      car.pos.set(lane.line + off, 0, alongPos);
    } else {
      car.pos.set(alongPos, 0, lane.line + (lane.dir > 0 ? -off : off));
    }
    car.angle = angleForLane(lane);
    car.group.rotation.y = car.angle;
    car.lane = lane;
  }

  function spawnParked() {
    for (let i = 0; i < 14; i++) {
      const line = pick(rng, ROAD_LINES);
      const along = randRange(rng, -170, 170);
      const side = rng() < 0.5 ? 1 : -1;
      const ns = rng() < 0.5;
      const x = ns ? line + side * 8.5 : along;
      const z = ns ? along : line + side * 8.5;
      const angle = ns ? (side > 0 ? 0 : Math.PI) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
      // Keep the mission anchors clear.
      if (Math.hypot(x - 78, z - 118) < 12 || Math.hypot(x + 130, z - 120) < 12) continue;
      makeCar(x, z, angle, { parked: true });
    }
  }

  function spawnTrafficCar() {
    const lane = randomLane();
    const car = makeCar(0, 0, 0, {});
    car.traffic = true;
    car.cruise = randRange(rng, 8, 14);
    car.speed = car.cruise;
    placeOnLane(car, lane, randRange(rng, -170, 170));
    traffic.push(car);
    return car;
  }

  // --- player driving ----------------------------------------------------
  function drivePlayer(dt, input) {
    const car = G.player.car;
    if (!car || car.dead) return;
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const grip = clamp(Math.abs(car.speed) / 10, 0.12, 1);
    const turnBoost = input.handbrake ? 1.5 : 1;
    car.angle += steer * TURN_RATE * turnBoost * grip * dt * (car.speed >= 0 ? 1 : -1);
    if (input.forward) {
      car.speed = Math.min(TOP_SPEED, car.speed + ACCEL * dt);
    } else if (input.back) {
      if (car.speed > 0.5) car.speed = Math.max(0, car.speed - BRAKE * dt);
      else car.speed = Math.max(-REVERSE_SPEED, car.speed - REVERSE_ACCEL * dt);
    } else if (input.handbrake) {
      car.speed -= Math.sign(car.speed) * HANDBRAKE * dt;
      if (Math.abs(car.speed) < 0.4) car.speed = 0;
    } else {
      car.speed -= Math.sign(car.speed) * DRAG * dt;
      if (Math.abs(car.speed) < 0.3) car.speed = 0;
    }

    const onPier = car.pos.z >= PIER.z0 && car.pos.z <= PIER.z1
      && car.pos.x >= PIER.x0 && car.pos.x <= PIER.x1;
    const onSand = !onPier && car.pos.x > BEACH_X - 4;
    if (onSand) car.speed = clamp(car.speed, -SAND_CAP, SAND_CAP);

    const fwd = heading(car.angle);
    const stepX = fwd.x * car.speed * dt;
    const stepZ = fwd.z * car.speed * dt;
    const beforeX = car.pos.x;
    const beforeZ = car.pos.z;
    car.pos.x += stepX;
    car.pos.z += stepZ;
    if (G.cityCollide) G.cityCollide(car.pos, 1.3);
    // A hard stop against a building bounces the car and hurts it.
    const moved = Math.hypot(car.pos.x - beforeX, car.pos.z - beforeZ);
    const wanted = Math.hypot(stepX, stepZ);
    if (wanted > 0.25 && moved < wanted * 0.5 && Math.abs(car.speed) > 14
      && G.time - car.crashAt > 1) {
      car.crashAt = G.time;
      car.speed *= -0.25;
      damageCar(car, 6, 'crash');
    }
    // Water stops the car; the pier corridor stays open to x = 320.
    if (!onPier && car.pos.x > OCEAN_X - 2) {
      car.pos.x = OCEAN_X - 2;
      car.speed *= 0.4;
    }
    if (car.pos.x < -CITY_HALF - 10) car.pos.x = -CITY_HALF - 10;
    if (car.pos.x > 318) car.pos.x = 318;
    if (car.pos.z < -CITY_HALF - 10) car.pos.z = -CITY_HALF - 10;
    if (car.pos.z > CITY_HALF + 10) car.pos.z = CITY_HALF + 10;

    car.group.rotation.y = car.angle;
    for (const w of car.wheelSpins) w.rotation.x += car.speed * dt * 1.5;
    if (car.smoke) car.smoke.update(dt);
    if (G.audio && G.audio.setEngine) {
      G.audio.setEngine(Math.min(1, Math.abs(car.speed) / TOP_SPEED), true);
    }
  }

  // --- traffic ------------------------------------------------------------
  function blockedAhead(car) {
    const fwd = heading(car.angle);
    for (const other of cars) {
      if (other === car || other.dead) continue;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 9 && d > 0.01 && (dx * fwd.x + dz * fwd.z) / d > 0.7) return true;
    }
    if (G.peds && G.peds.list) {
      for (const p of G.peds.list) {
        if (!p.pos) continue;
        const dx = p.pos.x - car.pos.x;
        const dz = p.pos.z - car.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 7 && d > 0.01 && (dx * fwd.x + dz * fwd.z) / d > 0.75) return true;
      }
    }
    return false;
  }

  function updateTraffic(dt) {
    for (const car of [...traffic]) {
      if (car.dead) {
        const ti = traffic.indexOf(car);
        if (ti >= 0) traffic.splice(ti, 1);
        continue;
      }
      const lane = car.lane;
      if (!lane) continue;
      // Brake for whatever is ahead, otherwise cruise.
      if (blockedAhead(car)) {
        car.speed = Math.max(0, car.speed - 30 * dt);
      } else {
        car.speed = Math.min(car.cruise, car.speed + 8 * dt);
      }
      const alongNow = lane.along === 'z' ? car.pos.z : car.pos.x;
      let alongNext = alongNow + lane.dir * car.speed * dt;
      // Turn at an intersection sometimes, and U-turn at the city edge.
      const nearCross = ROAD_LINES.find((l) => Math.abs(alongNow - l) < 3.5);
      if (nearCross !== undefined && G.time - car.turnAt > 4 && rng() < 0.3) {
        const next = {
          along: lane.along === 'z' ? 'x' : 'z',
          line: nearCross,
          dir: rng() < 0.5 ? 1 : -1,
        };
        car.turnAt = G.time;
        placeOnLane(car, next, alongNow);
        alongNext = alongNow;
      } else if (Math.abs(alongNext) > 188) {
        lane.dir *= -1;
        car.angle = angleForLane(lane);
        car.group.rotation.y = car.angle;
        alongNext = lane.along === 'z' ? car.pos.z : car.pos.x;
      }
      if (lane.along === 'z') {
        car.pos.z = alongNext;
        car.pos.x = lane.line + (lane.dir > 0 ? 2.6 : -2.6);
      } else {
        car.pos.x = alongNext;
        car.pos.z = lane.line + (lane.dir > 0 ? -2.6 : 2.6);
      }
      car.group.rotation.y = car.angle;
      for (const w of car.wheelSpins) w.rotation.x += car.speed * dt * 1.5;
      if (car.smoke) car.smoke.update(dt);
    }
  }

  return {
    cars,
    traffic,
    makeCar,
    removeCar,
    damageCar,
    nearestCar,
    spawnParked,
    spawnTrafficCar,
    drivePlayer,
    updateTraffic,
  };
}
