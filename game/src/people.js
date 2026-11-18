// The people of Solmar Bay: Rico on foot, and the pedestrians who stroll
// the sidewalks and scatter when trouble starts. Box-built characters.

import * as THREE from 'three';
import { mulberry32, randRange, pick, clamp, angleLerp } from './util.js';
import { ROAD_LINES, collideCircle, clampToWorld } from './city.js';

const SHIRTS = [0xe8e8e8, 0x3a6fd2, 0xd23b2e, 0x2ea88a, 0xe8a020, 0x8a4ad2, 0x555f6a, 0xf2b705];
const PANTS = [0x2a3440, 0x5a4a34, 0x33455a, 0x222222, 0x6a5a4a];
const SKIN = 0xc98a5e;

// A box person: torso, sphere head with a hair cap, two legs, two arms.
// Returns the group plus the four limbs so the walk cycle can swing them.
export function buildPersonMesh(shirt, pants, skin = SKIN) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });

  const limb = (w, h, d, mat, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, 0);
    g.add(m);
    return m;
  };

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), shirtMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skinMat);
  head.position.y = 1.78;
  head.castShadow = true;
  g.add(head);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x201812 })
  );
  hair.position.y = 1.84;
  g.add(hair);

  const legL = limb(0.22, 0.75, 0.24, pantsMat, -0.16, 0.38);
  const legR = limb(0.22, 0.75, 0.24, pantsMat, 0.16, 0.38);
  const armL = limb(0.18, 0.7, 0.2, shirtMat, -0.42, 1.15);
  const armR = limb(0.18, 0.7, 0.2, shirtMat, 0.42, 1.15);

  return { group: g, legL, legR, armL, armR };
}

export function createPeople(G) {
  const rng = mulberry32(G.seed + 202);

  // ---- Rico, the player ----
  const rico = buildPersonMesh(0xffffff, 0x2a3440, SKIN);
  // teal jacket instead of the plain white shirt
  rico.group.children[0].material = new THREE.MeshLambertMaterial({ color: 0x1e8a8a });
  G.scene.add(rico.group);

  const player = {
    mesh: rico,
    pos: rico.group.position,
    angle: 0,
    vy: 0,
    grounded: true,
    car: null,
    walkPhase: 0,
    speed: 0,
    punchAt: -10,
    shootAt: -10,
  };
  player.pos.set(G.city.spawnPos.x, 0, G.city.spawnPos.z);

  function swingLimbs(mesh, phase, amount) {
    const swing = Math.sin(phase) * amount;
    mesh.legL.rotation.x = swing;
    mesh.legR.rotation.x = -swing;
    mesh.armL.rotation.x = -swing * 0.8;
    mesh.armR.rotation.x = swing * 0.8;
  }

  function updatePlayer(dt, input) {
    if (player.car) return; // driving is handled by vehicles.js
    const camYaw = G.camYaw;
    // movement is relative to where the camera looks
    const fwd = { x: -Math.sin(camYaw), z: -Math.cos(camYaw) };
    const strafe = { x: -Math.cos(camYaw), z: Math.sin(camYaw) };
    let mx = 0, mz = 0;
    if (input.forward) { mx += fwd.x; mz += fwd.z; }
    if (input.back) { mx -= fwd.x; mz -= fwd.z; }
    if (input.left) { mx += strafe.x; mz += strafe.z; }
    if (input.right) { mx -= strafe.x; mz -= strafe.z; }
    const len = Math.hypot(mx, mz);
    const speed = input.run ? 8.5 : 4.2;
    if (len > 0.01) {
      mx /= len; mz /= len;
      player.pos.x += mx * speed * dt;
      player.pos.z += mz * speed * dt;
      player.angle = angleLerp(player.angle, Math.atan2(-mx, -mz), Math.min(1, dt * 12));
      player.walkPhase += dt * speed * 1.6;
      player.speed = speed;
    } else {
      player.walkPhase += dt * 1.2;
      player.speed = 0;
    }
    // jump + gravity
    if (input.jump && player.grounded) {
      player.vy = 7.5;
      player.grounded = false;
    }
    if (!player.grounded) {
      player.vy -= 22 * dt;
      player.pos.y += player.vy * dt;
      if (player.pos.y <= 0) {
        player.pos.y = 0;
        player.vy = 0;
        player.grounded = true;
      }
    }
    collideCircle(G.city.colliders, player.pos, 0.55);
    clampToWorld(player.pos);
    if (player.pos.x > 232) player.pos.x = 232; // never walk into the ocean
    const swing = player.speed > 0.1
      ? Math.sin(player.walkPhase) * 0.55
      : Math.sin(player.walkPhase * 0.3) * 0.04;
    rico.legL.rotation.x = swing;
    rico.legR.rotation.x = -swing;
    rico.armL.rotation.x = -swing * 0.8;
    rico.armR.rotation.x = swing * 0.8;
    // punch animation: right arm snaps forward
    const sincePunch = G.time - player.punchAt;
    if (sincePunch < 0.25) {
      rico.armR.rotation.x = -1.6 * (1 - sincePunch / 0.25);
    }
    rico.group.rotation.y = player.angle;
    G.audio.setEngine(0, false);
  }

  function enterCar(car) {
    player.car = car;
    car.isPlayer = true;
    car.parked = false;
    car.traffic = false;
    const ti = G.vehicles.traffic.indexOf(car);
    if (ti >= 0) G.vehicles.traffic.splice(ti, 1);
    rico.group.visible = false;
    G.audio.horn();
    G.addWanted(1, 'car theft');
    G.toast('Car stolen — ' + car.name, 'The SBPD is on to you. Lose them or lay low.');
    G.state.carsStolen++;
  }

  function exitCar(force) {
    const car = player.car;
    if (!car) return;
    player.car = null;
    car.isPlayer = false;
    car.speed = 0;
    rico.group.visible = true;
    const side = force ? 0 : 1;
    const out = car.angle + Math.PI / 2;
    player.pos.set(
      car.pos.x + Math.cos(out) * 2.2 * side, 0,
      car.pos.z - Math.sin(out) * 2.2 * side
    );
    collideCircle(G.city.colliders, player.pos, 0.55);
    G.audio.setEngine(0, false);
  }

  // ---- pedestrians ----
  const list = [];

  function spawnPed(x, z) {
    const m = buildPersonMesh(pick(rng, SHIRTS), pick(rng, PANTS));
    m.group.position.set(x, 0, z);
    G.scene.add(m.group);
    const p = {
      mesh: m,
      pos: m.group.position,
      angle: randRange(rng, 0, Math.PI * 2),
      speed: randRange(rng, 1.1, 1.8),
      walkPhase: randRange(rng, 0, 6),
      flee: 0,
      down: 0,
      axis: rng() < 0.5 ? 'x' : 'z',
      line: pick(rng, ROAD_LINES),
      dir: rng() < 0.5 ? 1 : -1,
      side: rng() < 0.5 ? 8.5 : -8.5,
    };
    list.push(p);
    return p;
  }

  for (let i = 0; i < 26; i++) {
    const line = pick(rng, ROAD_LINES);
    const t = randRange(rng, -170, 170);
    const offset = rng() < 0.5 ? 8.5 : -8.5;
    if (rng() < 0.5) spawnPed(t, line + offset);
    else spawnPed(line + offset, t);
  }
  // a few beach strollers on the sand
  for (let i = 0; i < 4; i++) {
    spawnPed(randRange(rng, 200, 225), randRange(rng, -140, 140));
  }

  function scarePeds(x, z, radius) {
    for (const p of list) {
      if (p.down > 0) continue;
      if (Math.hypot(p.pos.x - x, p.pos.z - z) < radius) {
        p.flee = 2.5 + Math.random();
      }
    }
  }

  function updatePeds(dt) {
    for (const p of list) {
      if (p.down > 0) {
        // knocked down: lie flat, then get up somewhere else in the city
        p.down -= dt;
        p.mesh.group.rotation.x = p.down > 0 ? (-Math.PI / 2) * Math.min(1, 3 - p.down) : 0;
        if (p.down <= 0) {
          p.mesh.group.rotation.x = 0;
          p.mesh.group.position.set(pick(rng, ROAD_LINES) + 8.5, 0, randRange(rng, -170, 170));
          p.flee = 0;
        }
        continue;
      }
      let speed = p.speed;
      if (p.flee > 0) {
        p.flee -= dt;
        speed = 6.5;
        const dx = p.pos.x - G.player.pos.x;
        const dz = p.pos.z - G.player.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        p.angle = Math.atan2(-dx / d, -dz / d);
      } else {
        // stroll the sidewalk; sometimes turn at an intersection
        const along = p.axis === 'x' ? p.pos.x : p.pos.z;
        const nearLine = ROAD_LINES.find((l) => Math.abs(along - l) < 0.8);
        if (nearLine !== undefined && rng() < 0.4 * dt) {
          p.axis = p.axis === 'x' ? 'z' : 'x';
          p.dir = rng() < 0.5 ? 1 : -1;
          p.line = nearLine;
        }
        p.angle = p.axis === 'x'
          ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
          : (p.dir > 0 ? 0 : Math.PI);
      }
      p.pos.x += Math.sin(p.angle) * speed * dt;
      p.pos.z += Math.cos(p.angle) * speed * dt;
      // drift back onto the sidewalk lane
      if (p.flee <= 0) {
        if (p.axis === 'x') p.pos.z += (p.line + p.side - p.pos.z) * Math.min(1, dt * 4);
        else p.pos.x += (p.line + p.side - p.pos.x) * Math.min(1, dt * 4);
      }
      p.pos.x = clamp(p.pos.x, -195, 230);
      p.pos.z = clamp(p.pos.z, -195, 195);
      p.walkPhase += dt * speed * 3.2;
      swingLimbs(p.mesh, p.walkPhase, 0.5);
      p.mesh.group.rotation.y = p.angle;
      // run over by a fast car?
      for (const car of G.vehicles.cars) {
        if (car.dead || Math.abs(car.speed) < 5) continue;
        if (Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z) < 2.4) {
          p.down = 6;
          G.effects.blood(p.pos.x, 0.4, p.pos.z);
          G.audio.punch();
          if (car.isPlayer) {
            G.addWanted(1, 'hit a pedestrian');
            G.state.pedsDown++;
            scarePeds(p.pos.x, p.pos.z, 30);
          }
        }
      }
    }
  }

  return { player, list, updatePlayer, updatePeds, enterCar, exitCar, scarePeds, spawnPed };
}
