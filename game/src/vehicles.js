// Cars for Solmar Bay — built, parked, driven and crashed in code.
// Every car model is boxes and cylinders assembled here: original art,
// nothing borrowed. Arcade handling, traffic AI and damage included.
import * as THREE from 'three';
import { ROAD_LINES } from './city.js';
import { mulberry32, randRange, pick, clamp } from './util.js';

export const CAR_NAMES = ['Comet GT', 'Palm Runner', 'Bay Cruiser', 'Sunset Van', 'Dune Buggy', 'Marina Sedan', 'Coral Coupe', 'Harbor Taxi'];
export const CAR_COLORS = [0xd23b2e, 0xe8c832, 0x2e6fd2, 0x2ea88a, 0xe87a1e, 0xe8e8e8, 0xd24a8a, 0xf2b705];

// Body dimensions every car in the game shares.
const BODY_LEN = 4.6;
const BODY_WID = 2.0;

// Assemble a car from boxes and cylinders. A police car gets a white
// body, a roof light bar and dark door stripes; a civilian car gets paint.
export function buildCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: isPolice ? 0xf0f0f0 : color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a2027 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(BODY_LEN, 0.85, BODY_WID), paint);
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.75, 1.8), isPolice ? paint : dark);
  cabin.position.set(-0.25, 1.4, 0);
  cabin.castShadow = true;
  g.add(cabin);

  const trimMat = new THREE.MeshLambertMaterial({ color: 0x22262c });
  for (const sx of [-BODY_LEN / 2 - 0.05, BODY_LEN / 2 + 0.05]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, BODY_WID), trimMat);
    bumper.position.set(sx, 0.45, 0);
    g.add(bumper);
  }

  const frontMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const rearMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const dz of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.4), frontMat);
    head.position.set(BODY_LEN / 2 + 0.02, 0.7, dz);
    g.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.4), rearMat);
    tail.position.set(-BODY_LEN / 2 - 0.02, 0.7, dz);
    g.add(tail);
  }

  const tyreGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x14181c });
  const wheels = [];
  for (const [wx, wz] of [[1.5, 0.95], [1.5, -0.95], [-1.5, 0.95], [-1.5, -0.95]]) {
    const wheel = new THREE.Mesh(tyreGeo, tyreMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    g.add(wheel);
    wheels.push(wheel);
  }

  let lightBar = null;
  if (isPolice) {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.8), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.45;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.8), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.x = 0.45;
    lightBar.add(red);
    lightBar.add(blue);
    lightBar.position.set(-0.25, 1.9, 0);
    g.add(lightBar);
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0x14181c });
    for (const side of [1, -1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 0.06), stripeMat);
      stripe.position.set(-0.25, 0.75, (BODY_WID / 2 + 0.01) * side);
      g.add(stripe);
    }
  }
  return { group: g, wheels, lightBar };
}

export function createVehicles(G) {
  const rnd = mulberry32(G.seed + 101);
  const cars = [];
  const traffic = [];

  function assembleCar(x, z, angle, opts = {}) {
    const color = opts.color ?? pick(rnd, CAR_COLORS);
    const name = opts.name ?? pick(rnd, CAR_NAMES);
    const { group, wheels, lightBar } = buildCarMesh(color, !!opts.police);
    group.position.set(x, 0, z);
    group.rotation.y = angle;
    G.scene.add(group);
    const car = {
      group,
      wheels,
      lightBar,
      name,
      color,
      pos: group.position,
      angle,
      speed: 0,
      health: 100,
      maxHealth: 100,
      isPolice: !!opts.police,
      isPlayer: false,
      traffic: !!opts.traffic,
      parked: !!opts.parked,
      axis: opts.axis || 'x',
      line: opts.line ?? z,
      dir: opts.dir ?? 1,
      brake: false,
      smoke: null,
      dead: false,
      honkAt: 0,
    };
    cars.push(car);
    return car;
  }

  // Ten parked cars along the avenues, waiting to be stolen.
  function parkRow() {
    const spots = [
      [-52, 8.5], [0, -60.5], [52, 60.5], [104, -8.5], [-104, 60.5],
      [-156, -60.5], [156, 8.5], [52, -108.5], [-52, 108.5], [104, 108.5],
    ];
    for (const [x, z] of spots) {
      const alongX = Math.abs(z) % 52 < 26;
      assembleCar(x, z, alongX ? 0 : Math.PI / 2, { parked: true });
    }
  }

  function addTrafficCar() {
    const line = pick(rnd, ROAD_LINES);
    const axis = rnd() < 0.5 ? 'x' : 'z';
    const dir = rnd() < 0.5 ? 1 : -1;
    const t = randRange(rnd, -170, 170);
    const angle = axis === 'x'
      ? (dir > 0 ? 0 : Math.PI)
      : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    const car = assembleCar(
      axis === 'x' ? t : line,
      axis === 'x' ? line : t,
      angle,
      { traffic: true, axis, line, dir },
    );
    car.speed = randRange(rnd, 7, 11);
    traffic.push(car);
    return car;
  }

  function dropCar(car) {
    G.scene.remove(car.group);
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
    const j = traffic.indexOf(car);
    if (j >= 0) traffic.splice(j, 1);
  }

  function closestCar(x, z, maxD, exclude) {
    let best = null;
    let bestD = maxD;
    for (const c of cars) {
      if (c === exclude || c.dead) continue;
      const d = Math.hypot(c.pos.x - x, c.pos.z - z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  function hurtCar(car, amount, cause) {
    if (car.dead) return;
    car.health -= amount;
    if (car.health <= 40 && !car.smoke) {
      car.smoke = new SmokeTrail(G.scene);
      car.smoke.attach(car);
    }
    if (car.health <= 0) blowUpCar(car, cause);
  }

  function blowUpCar(car, cause) {
    if (car.dead) return;
    car.dead = true;
    G.effects.explosion(car.pos.x, 1, car.pos.z);
    G.audio.gunshot();
    if (car.isPlayer) {
      G.playerExitCar(true);
      G.hurtPlayer(25, 'car explosion');
    }
    if (car.smoke) {
      car.smoke.dispose();
      car.smoke = null;
    }
    dropCar(car);
  }

  // Is anything stopped in front of `car` within `ahead` metres?
  function obstacleAhead(car, ahead, halfWidth, includePeds) {
    const fx = Math.cos(car.angle);
    const fz = -Math.sin(car.angle);
    for (const other of cars) {
      if (other === car || other.dead) continue;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      if (dx * fx + dz * fz > 0 && dx * fx + dz * fz < ahead && Math.abs(-dx * fz + dz * fx) < halfWidth) return true;
    }
    if (includePeds && G.peds) {
      for (const p of G.peds.list) {
        const dx = p.pos.x - car.pos.x;
        const dz = p.pos.z - car.pos.z;
        if (dx * fx + dz * fz > 0 && dx * fx + dz * fz < 8 && Math.abs(-dx * fz + dz * fx) < 2.2) return true;
      }
    }
    return false;
  }

  // Traffic AI: follow the grid, turn at crossings, brake for whatever is
  // ahead, and wrap around at the city edge instead of driving into the sea.
  function moveTraffic(dt) {
    for (const car of traffic) {
      if (car.dead) continue;
      const blocked = obstacleAhead(car, 11, 2.6, true);
      const targetSpeed = blocked ? 0 : 9;
      car.speed += clamp(targetSpeed - car.speed, -14 * dt, 6 * dt);
      car.pos.x += Math.cos(car.angle) * car.speed * dt;
      car.pos.z += -Math.sin(car.angle) * car.speed * dt;
      // At a crossing, sometimes turn onto a new avenue.
      const along = car.axis === 'x' ? car.pos.x : car.pos.z;
      const nearLine = ROAD_LINES.find((l) => Math.abs(along - l) < 1.2);
      if (nearLine !== undefined && rnd() < 0.35 * dt) {
        if (rnd() < 0.3) {
          const newLine = pick(rnd, ROAD_LINES);
          const newAxis = car.axis === 'x' ? 'z' : 'x';
          const newDir = rnd() < 0.5 ? 1 : -1;
          car.axis = newAxis;
          car.line = newLine;
          car.dir = newDir;
          car.angle = newAxis === 'x'
            ? (newDir > 0 ? 0 : Math.PI)
            : (newDir > 0 ? -Math.PI / 2 : Math.PI / 2);
          if (newAxis === 'x') car.pos.z = newLine;
          else car.pos.x = newLine;
        }
      }
      if (car.pos.x > 200 || car.pos.x < -200 || car.pos.z > 200 || car.pos.z < -200) {
        car.pos.x = clamp(car.pos.x, -180, 180);
        car.pos.z = clamp(car.pos.z, -180, 180);
        car.dir *= -1;
        car.angle += Math.PI;
      }
      for (const w of car.wheels) w.rotation.y += car.speed * dt * 1.4;
    }
    // Gentle car-car separation, with a crash penalty for the player.
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        if (a.dead || b.dead) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01 && d < 4.4) {
          const push = (4.4 - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          if (!a.traffic || a.isPlayer) {
            a.pos.x -= nx * push;
            a.pos.z -= nz * push;
          }
          if (!b.traffic || b.isPlayer) {
            b.pos.x += nx * push;
            b.pos.z += nz * push;
          }
          if ((a.isPlayer || b.isPlayer) && Math.abs(a.speed - b.speed) > 3) {
            hurtCar(a.isPlayer ? a : b, 4, 'crash');
            G.audio.punch();
          }
        }
      }
    }
  }

  // Arcade driving for the player's car: accelerate, brake, steer, bounce
  // off walls, slow down on sand and stop at the water.
  function steerPlayer(dt, input) {
    const car = G.player.car;
    if (!car) return;
    const fwd = input.forward ? 1 : input.back ? -1 : 0;
    const maxSpeed = 42;
    const maxReverse = 12;
    if (fwd > 0) car.speed += 16 * dt;
    else if (fwd < 0) car.speed -= (car.speed > 0.5 ? 26 : 12) * dt;
    else car.speed -= Math.sign(car.speed) * 8 * dt;
    if (input.handbrake) car.speed -= Math.sign(car.speed) * 30 * dt;
    if (Math.abs(car.speed) < 0.15 && fwd === 0) car.speed = 0;
    car.speed = clamp(car.speed, -maxReverse, maxSpeed);
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const steerAmount = steer * 1.7 * dt * clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed < 0 ? -1 : 1);
    car.angle += steerAmount * (input.handbrake ? 1.6 : 1);
    car.pos.x += Math.cos(car.angle) * car.speed * dt;
    car.pos.z += -Math.sin(car.angle) * car.speed * dt;
    const beforeX = car.pos.x;
    const beforeZ = car.pos.z;
    G.cityCollide(car.pos, 2.2);
    if (beforeX !== car.pos.x || beforeZ !== car.pos.z) {
      if (Math.abs(car.speed) > 6) {
        hurtCar(car, Math.abs(car.speed) * 0.5, 'wall');
        G.effects.sparks(car.pos.x, 0.8, car.pos.z);
        G.audio.punch();
      }
      car.speed *= 0.35;
    }
    if (car.pos.x > 196) car.speed *= (1 - 0.8 * dt);
    if (car.pos.x > 232) {
      car.pos.x = 232;
      car.speed = 0;
    }
    car.pos.x = clamp(car.pos.x, -205, 232);
    car.pos.z = clamp(car.pos.z, -205, 205);
    car.group.rotation.y = car.angle;
    car.group.rotation.z = -steer * clamp(Math.abs(car.speed) / 40, 0, 1) * 0.06;
    for (const w of car.wheels) w.rotation.y += car.speed * dt * 1.4;
    if (car.smoke) car.smoke.update(dt);
    G.audio.setEngine(Math.abs(car.speed) / maxSpeed, true);
  }

  return {
    cars,
    traffic,
    makeCar: assembleCar,
    spawnParked: parkRow,
    spawnTrafficCar: addTrafficCar,
    removeCar: dropCar,
    nearestCar: closestCar,
    damageCar: hurtCar,
    explodeCar: blowUpCar,
    updateTraffic: moveTraffic,
    drivePlayer: steerPlayer,
  };
}

// A small smoke emitter that rides on a damaged car until it is gone.
class SmokeTrail {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.55 });
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 5), mat.clone());
      m.visible = false;
      scene.add(m);
      this.parts.push({ mesh: m, life: 0, max: 1 });
    }
    this.car = null;
    this.t = 0;
  }

  attach(car) {
    this.car = car;
  }

  update(dt) {
    if (!this.car) return;
    this.t += dt;
    for (const p of this.parts) {
      p.life -= dt;
      if (p.life <= 0) {
        if (this.t > 0.12) {
          this.t = 0;
          p.life = p.max = 0.9 + Math.random() * 0.6;
          p.mesh.position.set(
            this.car.pos.x + (Math.random() - 0.5),
            1.4,
            this.car.pos.z + (Math.random() - 0.5),
          );
          p.mesh.visible = true;
          p.mesh.scale.setScalar(0.5);
        } else {
          p.mesh.visible = false;
          continue;
        }
      }
      p.mesh.position.y += dt * 2.2;
      p.mesh.scale.multiplyScalar(1 + dt * 1.6);
      p.mesh.material.opacity = 0.55 * (p.life / p.max);
    }
  }

  dispose() {
    for (const p of this.parts) this.scene.remove(p.mesh);
  }
}
