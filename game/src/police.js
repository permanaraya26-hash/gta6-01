// The SBPD: wanted stars, pursuit cars, foot cops, BUSTED / WASTED.
// Original police force for Solmar Bay — no real agency, no borrowed names.
import * as THREE from 'three';
import { mulberry32, randRange, clamp } from './util.js';
import { buildCarMesh } from './vehicles.js';

export function createPolice(G) {
  const rng = mulberry32(G.seed + 303);
  const units = [];   // pursuit cars
  const cops = [];    // foot cops
  let flashT = 0;
  let bustedTimer = 0;

  function wantedCarCount() {
    return Math.min(1 + Math.floor(G.state.wanted / 1), 5);
  }

  function spawnUnit() {
    const px = G.player.pos.x, pz = G.player.pos.z;
    const a = randRange(rng, 0, Math.PI * 2);
    const x = clamp(px + Math.cos(a) * 70, -185, 185);
    const z = clamp(pz + Math.sin(a) * 70, -185, 185);
    const { group, wheels, lightBar } = buildCarMesh(0xf0f0f0, true);
    group.position.set(x, 0, z);
    G.scene.add(group);
    const unit = { group, wheels, lightBar, pos: group.position, angle: 0, speed: 0, health: 100, stuck: 0, isPolice: true };
    units.push(unit);
    return unit;
  }

  function spawnCop() {
    const px = G.player.pos.x, pz = G.player.pos.z;
    const a = randRange(rng, 0, Math.PI * 2);
    const x = clamp(px + Math.cos(a) * 18, -190, 190);
    const z = clamp(pz + Math.sin(a) * 18, -190, 190);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), new THREE.MeshLambertMaterial({ color: 0x1a2a4a }));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshLambertMaterial({ color: 0xc98a5e }));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 12), new THREE.MeshLambertMaterial({ color: 0x101c30 }));
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.24), new THREE.MeshLambertMaterial({ color: 0x141c28 }));
    const legR = legL.clone();
    const g = new THREE.Group();
    body.position.y = 1.15; head.position.y = 1.78; cap.position.y = 2.0;
    legL.position.set(-0.16, 0.38, 0); legR.position.set(0.16, 0.38, 0);
    g.add(body, head, cap, legL, legR);
    g.position.set(x, 0, z);
    g.traverse((o) => { o.castShadow = true; });
    G.scene.add(g);
    const cop = { group: g, legL, legR, pos: g.position, angle: 0, walkPhase: 0, punchAt: -10, hp: 40 };
    cops.push(cop);
    return cop;
  }

  function clearAll() {
    for (const u of units) G.scene.remove(u.group);
    for (const c of cops) G.scene.remove(c.group);
    units.length = 0;
    cops.length = 0;
    G.audio.setSiren(false);
  }

  function update(dt) {
    const w = G.state.wanted;
    if (w <= 0) {
      if (units.length || cops.length) clearAll();
      return;
    }
    // keep the right number of pursuit cars
    const want = w >= 4 ? 3 : w >= 2 ? 2 : 1;
    while (units.length < want) spawnUnit();
    while (units.length > want) { const u = units.pop(); G.scene.remove(u.group); }
    const wantCops = w >= 3 ? 2 : 0;
    while (cops.length < wantCops) spawnCop();
    while (cops.length > wantCops) { const c = cops.pop(); G.scene.remove(c.group); }

    G.audio.setSiren(true);
    flashT += dt;
    const flash = Math.floor(flashT * 6) % 2 === 0;
    for (const u of units) {
      if (u.lightBar) {
        u.lightBar.children[0].material.color.setHex(flash ? 0xff2222 : 0x551111);
        u.lightBar.children[1].material.color.setHex(flash ? 0x111155 : 0x2244ff);
      }
      // chase the player (on foot or in a car)
      const target = G.player.car ? G.player.car.pos : G.player.pos;
      const dx = target.x - u.pos.x, dz = target.z - u.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const desired = Math.atan2(-dz, dx);
      let diff = desired - u.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      u.angle += clamp(diff, -2.2 * dt, 2.2 * dt);
      const topSpeed = d < 4 ? 0 : d < 10 ? 5 : 26 + w * 2.5;
      u.speed += clamp(topSpeed - u.speed, -18 * dt, 12 * dt);
      const nx = u.pos.x + Math.cos(u.angle) * u.speed * dt;
      const nz = u.pos.z - Math.sin(u.angle) * u.speed * dt;
      const before = { x: u.pos.x, z: u.pos.z };
      u.pos.x = nx; u.pos.z = nz;
      G.cityCollide(u.pos, 2.2);
      if (Math.hypot(u.pos.x - before.x, u.pos.z - before.z) < Math.abs(u.speed) * dt * 0.4) {
        u.stuck += dt;
        if (u.stuck > 2.5) {
          // teleport out of the jam, back onto a road near the player
          u.pos.x = clamp(target.x + (rng() < 0.5 ? -40 : 40), -185, 185);
          u.pos.z = clamp(target.z + (rng() < 0.5 ? -40 : 40), -185, 185);
          u.stuck = 0;
          u.speed = 8;
        }
      } else u.stuck = 0;
      u.group.rotation.y = u.angle;
      for (const wh of u.wheels) wh.rotation.y += u.speed * dt * 1.4;
      // ram the player (once a second at most)
      const pd = Math.hypot(u.pos.x - G.player.pos.x, u.pos.z - G.player.pos.z);
      if (pd < 3.2 && Math.abs(u.speed) > 6 && G.time - (u.ramAt || -10) > 1) {
        u.ramAt = G.time;
        if (G.player.car) {
          G.vehicles.damageCar(G.player.car, 8, 'police ram');
          G.audio.punch();
          G.effects.sparks(G.player.pos.x, 1, G.player.pos.z);
        } else {
          G.hurtPlayer(8, 'rammed by SBPD');
          G.player.pos.x += (G.player.pos.x - u.pos.x) * 0.25;
          G.player.pos.z += (G.player.pos.z - u.pos.z) * 0.25;
        }
        u.speed *= 0.4;
      }
      // busted check: a unit parked next to a player on foot arrests them
      if (!G.player.car && pd < 4.5 && Math.abs(u.speed) < 8 && G.state.wanted > 0) {
        bustedTimer += dt;
        if (bustedTimer > 2.2) { G.busted(); return; }
      } else if (pd > 6) bustedTimer = Math.max(0, bustedTimer - dt * 2);
    }

    // foot cops chase and punch
    for (const c of cops) {
      const dx = G.player.pos.x - c.pos.x, dz = G.player.pos.z - c.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      c.angle = Math.atan2(-dx, -dz);
      const speed = d > 3 ? 6.2 : 0;
      c.pos.x += Math.sin(c.angle) * speed * dt;
      c.pos.z += Math.cos(c.angle) * speed * dt;
      c.walkPhase += dt * speed * 3;
      const swing = Math.sin(c.walkPhase) * 0.5;
      c.legL.rotation.x = swing; c.legR.rotation.x = -swing;
      c.group.rotation.y = c.angle;
      if (d < 1.6 && G.time - c.punchAt > 0.9) {
        c.punchAt = G.time;
        G.hurtPlayer(7, 'SBPD officer');
        G.audio.punch();
      }
    }

    // wanted decays when the player stays out of sight / far from cops
    if (G.state.wanted > 0) {
      let nearest = 999;
      for (const u of units) nearest = Math.min(nearest, Math.hypot(u.pos.x - G.player.pos.x, u.pos.z - G.player.pos.z));
      for (const c of cops) nearest = Math.min(nearest, Math.hypot(c.pos.x - G.player.pos.x, c.pos.z - G.player.pos.z));
      if (nearest > 90) {
        G.state.wantedTimer += dt;
        if (G.state.wantedTimer > 12) {
          G.state.wanted = Math.max(0, G.state.wanted - 1);
          G.state.wantedTimer = 0;
          G.toast(G.state.wanted === 0 ? 'Heat is off' : 'Wanted level down', G.state.wanted === 0 ? 'The SBPD lost your trail.' : 'Keep a low profile.');
        }
      } else G.state.wantedTimer = 0;
    }
  }

  return { units, cops, update, clearAll, spawnUnit };
}
