// SBPD — the Solmar Bay Police Department. Wanted-level pursuit units,
// foot officers, and the BUSTED/WASTED pressure around them.
// Written fresh for the repair slice: pursuit cars now steer with
// separation and avoidance (units, traffic and the player car never pile
// into one another when they converge), rams are on a cooldown, and foot
// cops open fire at 3+ stars instead of only punching.
import * as THREE from 'three';
import { clamp, angleLerp, mulberry32, randRange, pick, dist2d } from './util.js';
import { ROAD_LINES } from './city.js';
import { buildPersonMesh } from './people.js';

// How many pursuit cars each wanted level fields.
const UNITS_PER_STAR = [0, 1, 2, 3, 4, 5];
const MAX_COPS = 4;
const COP_SHIRT = 0x1d3a6e;
const COP_PANTS = 0x141c26;

export function createPolice(G) {
  const rng = mulberry32(G.seed + 303);
  const units = [];   // pursuit cars (entries of G.vehicles.cars)
  const cops = [];    // foot officers { pos, hp, group, ... }
  let coolTimer = 0;  // time the player has been out of sight of every unit
  let sirenOn = false;

  // --- spawning ---------------------------------------------------------
  function roadSpawnPoint(nearX, nearZ, minDist) {
    // Pick a road line and a spot along it, at least minDist from (nearX, nearZ).
    for (let attempt = 0; attempt < 12; attempt++) {
      const line = pick(rng, ROAD_LINES);
      const along = randRange(rng, -175, 175);
      const horizontal = rng() < 0.5;
      const x = horizontal ? along : line;
      const z = horizontal ? line : along;
      if (dist2d(x, z, nearX, nearZ) >= minDist) return { x, z };
    }
    // Fallback: shove out along +x from the player.
    return { x: clamp(nearX + minDist, -180, 180), z: clamp(nearZ, -180, 180) };
  }

  function spawnUnit() {
    const p = G.player;
    const anchor = p.car ? p.car.pos : p.pos;
    const spot = roadSpawnPoint(anchor.x, anchor.z, 42);
    const car = G.vehicles.makeCar(spot.x, spot.z, randRange(rng, 0, Math.PI * 2), { police: true });
    car.ramAt = -10;        // last ram time (G.time)
    car.stuckAt = G.time;   // last time the unit made progress toward the player
    car.lastDist = Infinity;
    car.bustTimer = 0;      // time spent hugging an on-foot player
    car.flashAt = rng() * 0.5;
    units.push(car);
    return car;
  }

  function spawnCop() {
    const p = G.player;
    const a = randRange(rng, 0, Math.PI * 2);
    const d = randRange(rng, 9, 16);
    const mesh = buildPersonMesh(COP_SHIRT, COP_PANTS, 0x8a5a3a);
    // navy cap: flatten a dark sphere on the head
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x0d1520 })
    );
    cap.position.y = 1.86;
    mesh.group.add(cap);
    const x = clamp(p.pos.x + Math.cos(a) * d, -195, 230);
    const z = clamp(p.pos.z + Math.sin(a) * d, -195, 195);
    mesh.group.position.set(x, 0, z);
    G.scene.add(mesh.group);
    const cop = {
      mesh, group: mesh.group, pos: mesh.group.position,
      angle: 0, hp: 100, walkPhase: randRange(rng, 0, 6),
      punchAt: -10, shotAt: -10, bustTimer: 0, down: 0,
    };
    cops.push(cop);
    return cop;
  }

  function removeUnit(car) {
    const i = units.indexOf(car);
    if (i >= 0) units.splice(i, 1);
    G.vehicles.removeCar(car);
  }

  function removeCop(cop) {
    const i = cops.indexOf(cop);
    if (i >= 0) cops.splice(i, 1);
    G.scene.remove(cop.group);
  }

  function clearAll() {
    while (units.length) removeUnit(units[0]);
    while (cops.length) removeCop(cops[0]);
    coolTimer = 0;
    if (sirenOn) { G.audio.setSiren(false); sirenOn = false; }
  }

  // --- steering helpers ---------------------------------------------------
  // Repulsion from every other moving car, so converging units fan out
  // instead of stacking on the same point.
  function avoidanceVector(car, radius, strength) {
    let ax = 0, az = 0;
    const all = G.vehicles.cars;
    for (let i = 0; i < all.length; i++) {
      const other = all[i];
      if (other === car || other.dead) continue;
      const dx = car.pos.x - other.pos.x;
      const dz = car.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < radius) {
        const w = (radius - d) / radius * strength;
        ax += (dx / d) * w;
        az += (dz / d) * w;
      }
    }
    return { x: ax, z: az };
  }

  // Is a car directly ahead of `car` within `ahead` metres? Used to brake
  // instead of rear-ending traffic or another unit.
  function blockedAhead(car, ahead, halfWidth) {
    const fx = Math.cos(car.angle), fz = -Math.sin(car.angle);
    for (const other of G.vehicles.cars) {
      if (other === car || other.dead) continue;
      const dx = other.pos.x - car.pos.x, dz = other.pos.z - car.pos.z;
      const forward = dx * fx + dz * fz;
      const side = Math.abs(-dx * fz + dz * fx);
      if (forward > 0 && forward < ahead && side < halfWidth) return true;
    }
    return false;
  }

  // --- pursuit cars -------------------------------------------------------
  function updateUnit(car, dt, target, targetVel) {
    if (car.dead) return;
    const px = target.x, pz = target.z;
    const dx = px - car.pos.x, dz = pz - car.pos.z;
    const dist = Math.hypot(dx, dz) || 1;

    // Predict where the target will be, then blend in avoidance so units
    // approaching from different angles slide past each other.
    const lead = clamp(dist * 0.02, 0, 0.6);
    let tx = px + targetVel.x * lead;
    let tz = pz + targetVel.z * lead;
    const avoid = avoidanceVector(car, 10, 14);
    tx += avoid.x; tz += avoid.z;

    const desiredAngle = Math.atan2(-(tz - car.pos.z), tx - car.pos.x);
    const turnRate = 2.4;
    car.angle = angleLerp(car.angle, desiredAngle, Math.min(1, dt * turnRate));

    // Speed: chase hard from range, creep in close, and stop beside an
    // on-foot player so the arrest can happen instead of a drive-through.
    const playerOnFoot = !G.player.car;
    const topSpeed = 30 + G.state.wanted * 1.6;
    let wantSpeed = topSpeed;
    if (playerOnFoot) {
      if (dist < 4) wantSpeed = 0;
      else if (dist < 12) wantSpeed = Math.min(topSpeed, 7);
    } else if (dist < 9) {
      wantSpeed = Math.min(topSpeed, 12);
    }
    if (blockedAhead(car, 9, 2.8)) wantSpeed = Math.min(wantSpeed, 4);

    const accel = wantSpeed > car.speed ? 15 : 24;
    car.speed += clamp(wantSpeed - car.speed, -accel * dt, accel * dt);
    car.pos.x += Math.cos(car.angle) * car.speed * dt;
    car.pos.z += -Math.sin(car.angle) * car.speed * dt;
    G.cityCollide(car.pos, 2.2);
    car.pos.x = clamp(car.pos.x, -205, 232);
    car.pos.z = clamp(car.pos.z, -205, 205);
    car.group.rotation.y = car.angle;
    for (const w of car.wheels) w.rotation.y += car.speed * dt * 1.4;
    if (car.smoke) car.smoke.update(dt);

    // Flashing light bar.
    if (car.lightBar) {
      const phase = Math.floor((G.time + car.flashAt) * 6) % 2 === 0;
      car.lightBar.children[0].visible = phase;
      car.lightBar.children[1].visible = !phase;
    }

    // Ram: only when moving fast, only on a cooldown, and only against the
    // player's car — never a cheap drive-by on a pedestrian.
    if (G.player.car && dist < 5 && Math.abs(car.speed) > 6 && G.time - car.ramAt > 1.2) {
      car.ramAt = G.time;
      G.vehicles.damageCar(G.player.car, 7, 'police ram');
      G.effects.sparks(car.pos.x, 0.8, car.pos.z);
      G.audio.punch();
      // shove the player's car sideways a touch
      const nx = dx / dist, nz = dz / dist;
      G.player.car.pos.x += nx * 0.6;
      G.player.car.pos.z += nz * 0.6;
    }

    // Stuck? Teleport back onto a road near the player.
    if (dist < car.lastDist - 0.5) { car.stuckAt = G.time; car.lastDist = dist; }
    if (G.time - car.stuckAt > 5 && dist > 25) {
      const spot = roadSpawnPoint(px, pz, 38);
      car.pos.set(spot.x, 0, spot.z);
      car.speed = 0;
      car.stuckAt = G.time;
      car.lastDist = Infinity;
    }

    // BUSTED: a unit sitting beside an on-foot player makes the arrest.
    if (playerOnFoot && dist < 3.4 && Math.abs(car.speed) < 3) {
      car.bustTimer += dt;
      if (car.bustTimer > 1.2) { G.busted(); return; }
    } else {
      car.bustTimer = 0;
    }
  }

  // --- foot cops ----------------------------------------------------------
  function updateCop(cop, dt) {
    const p = G.player;
    const dx = p.pos.x - cop.pos.x, dz = p.pos.z - cop.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const wanted = G.state.wanted;

    // Keep cops from standing inside each other.
    for (const other of cops) {
      if (other === cop) continue;
      const ox = cop.pos.x - other.pos.x, oz = cop.pos.z - other.pos.z;
      const od = Math.hypot(ox, oz);
      if (od > 0.01 && od < 1.4) {
        cop.pos.x += (ox / od) * (1.4 - od) * 0.5;
        cop.pos.z += (oz / od) * (1.4 - od) * 0.5;
      }
    }

    const walkSpeed = 3.6 + wanted * 0.25;
    const desiredAngle = Math.atan2(-dx, -dz);
    cop.angle = angleLerp(cop.angle, desiredAngle, Math.min(1, dt * 8));
    cop.mesh.group.rotation.y = cop.angle;

    if (dist > 1.6) {
      // Close the distance; stop just short so the arrest timer can run.
      cop.pos.x += Math.sin(cop.angle) * walkSpeed * dt;
      cop.pos.z += Math.cos(cop.angle) * walkSpeed * dt;
      cop.walkPhase += dt * walkSpeed * 2.4;
      const swing = Math.sin(cop.walkPhase) * 0.5;
      cop.mesh.legL.rotation.x = swing;
      cop.mesh.legR.rotation.x = -swing;
      cop.mesh.armL.rotation.x = -swing * 0.7;
      cop.mesh.armR.rotation.x = swing * 0.7;
    } else {
      cop.mesh.legL.rotation.x = 0;
      cop.mesh.legR.rotation.x = 0;
    }
    G.cityCollide(cop.pos, 0.55);
    cop.pos.x = clamp(cop.pos.x, -195, 230);
    cop.pos.z = clamp(cop.pos.z, -195, 195);

    // On-foot arrest: a cop standing on the player for a second busts them.
    if (!p.car && dist < 1.6) {
      cop.bustTimer += dt;
      if (cop.bustTimer > 1.0) { G.busted(); return; }
    } else {
      cop.bustTimer = 0;
    }

    // Punch when right on top of the player.
    if (dist < 1.7 && G.time - cop.punchAt > 0.9) {
      cop.punchAt = G.time;
      cop.mesh.armR.rotation.x = -1.5;
      G.hurtPlayer(5, 'officer punch');
      G.audio.punch();
      G.peds.scarePeds(cop.pos.x, cop.pos.z, 12);
    }

    // Gunfire at 3+ stars: a cop with a sightline opens fire from range.
    // Inaccurate on purpose — a warning crack, not a sniper.
    if (wanted >= 3 && dist > 5 && dist < 30 && G.time - cop.shotAt > 1.7) {
      cop.shotAt = G.time;
      const from = new THREE.Vector3(cop.pos.x, 1.45, cop.pos.z);
      const to = new THREE.Vector3(
        p.pos.x + (Math.random() - 0.5) * 3,
        p.car ? 1 : 1.2,
        p.pos.z + (Math.random() - 0.5) * 3
      );
      G.effects.tracer(from, to);
      G.audio.gunshot();
      G.effects.sparks(to.x, to.y, to.z);
      // one shot in three lands
      if (Math.random() < 0.34) G.hurtPlayer(4, 'police gunfire');
    }
  }

  // --- main update --------------------------------------------------------
  function update(dt) {
    const wanted = G.state.wanted;
    const p = G.player;

    // Field the right number of pursuit cars for the wanted level.
    const wantUnits = UNITS_PER_STAR[clamp(wanted, 0, 5)];
    while (units.length < wantUnits) spawnUnit();
    while (units.length > wantUnits) removeUnit(units[units.length - 1]);

    // Foot cops from 3 stars up, capped so the street never floods.
    const wantCops = wanted >= 3 ? Math.min(wanted - 1, MAX_COPS) : 0;
    while (cops.length < wantCops) spawnCop();
    while (cops.length > wantCops) removeCop(cops[cops.length - 1]);

    // Target: the player's car when driving, Rico on foot otherwise.
    const target = p.car ? p.car.pos : p.pos;
    const targetVel = p.car
      ? { x: Math.cos(p.car.angle) * p.car.speed, z: -Math.sin(p.car.angle) * p.car.speed }
      : { x: 0, z: 0 };

    let nearest = Infinity;
    for (const car of [...units]) updateUnit(car, dt, target, targetVel);
    for (const car of units) {
      const d = dist2d(car.pos.x, car.pos.z, target.x, target.z);
      if (d < nearest) nearest = d;
    }
    for (const cop of [...cops]) {
      if (cop.hp <= 0) continue;
      updateCop(cop, dt);
      const d = dist2d(cop.pos.x, cop.pos.z, target.x, target.z);
      if (d < nearest) nearest = d;
    }

    // Wanted decay: stay out of every unit's sight long enough and the
    // heat drops a star.
    if (wanted > 0) {
      if (nearest > 60) {
        coolTimer += dt;
        if (coolTimer > 8) {
          G.state.wanted = wanted - 1;
          coolTimer = 0;
          if (G.state.wanted === 0) G.toast('You lost them', 'The SBPD called off the search.');
        }
      } else {
        coolTimer = 0;
      }
    }

    // Siren follows the pursuit.
    const wantSiren = units.length > 0;
    if (wantSiren !== sirenOn) {
      G.audio.setSiren(wantSiren);
      sirenOn = wantSiren;
    }
  }

  return { units, cops, update, clearAll, spawnUnit, spawnCop };
}
