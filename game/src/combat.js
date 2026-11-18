// Combat for Solmar Bay: pistol (hitscan, tracer, muzzle flash, reload),
// punch, and the particle effects (explosions, sparks, cash bursts).
import * as THREE from 'three';
import { mulberry32, clamp } from './util.js';

export function createEffects(G) {
  const scene = G.scene;
  const bursts = [];

  function burst(x, y, z, color, count, speed, size, life, gravity) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    const parts = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 5), mat.clone());
      m.position.set(x, y, z);
      scene.add(m);
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      parts.push({ mesh: m, vx: Math.cos(a) * Math.cos(b) * s, vy: Math.sin(b) * s + speed * 0.3, vz: Math.sin(a) * Math.cos(b) * s, life: life * (0.6 + Math.random() * 0.7), max: life });
    }
    bursts.push({ parts, gravity });
  }

  function update(dt) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      let alive = false;
      for (const p of b.parts) {
        if (p.life <= 0) continue;
        alive = true;
        p.life -= dt;
        p.vy -= (b.gravity ?? 6) * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.material.opacity = Math.max(0, p.life / p.max);
        if (p.life <= 0) p.mesh.visible = false;
      }
      if (!alive) {
        for (const p of b.parts) scene.remove(p.mesh);
        bursts.splice(i, 1);
      }
    }
    // tracer lines fade
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.12);
      if (t.life <= 0) { scene.remove(t.line); tracers.splice(i, 1); }
    }
  }

  const tracers = [];
  function tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 1 }));
    scene.add(line);
    tracers.push({ line, life: 0.12 });
  }

  return {
    update,
    tracer,
    explosion(x, y, z) {
      burst(x, y, z, 0xff7a1e, 26, 12, 0.55, 0.9, 4);
      burst(x, y + 0.5, z, 0x444444, 16, 6, 0.8, 1.6, -1.5);
      burst(x, y, z, 0xffd23e, 12, 9, 0.4, 0.5, 4);
    },
    sparks(x, y, z) { burst(x, y, z, 0xffe9a8, 10, 7, 0.12, 0.4, 9); },
    blood(x, y, z) { burst(x, y, z, 0xaa1111, 12, 4, 0.16, 0.6, 8); },
    cashBurst(x, y, z) { burst(x, y, z, 0x7dff9a, 14, 5, 0.2, 0.8, 5); },
  };
}

export function createCombat(G) {
  const rng = mulberry32(G.seed + 404);
  let ammo = 12;
  const MAG = 12;
  let reloading = 0;
  let muzzle = null;

  function ensureMuzzle() {
    if (muzzle) return muzzle;
    muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 })
    );
    muzzle.visible = false;
    G.scene.add(muzzle);
    return muzzle;
  }

  function shoot() {
    if (G.state.mode !== 'playing') return;
    if (G.player.car) return; // no drive-by in this build
    if (reloading > 0) return;
    if (ammo <= 0) { reload(); return; }
    ammo--;
    G.player.shootAt = G.time;
    G.audio.gunshot();
    G.peds.scarePeds(G.player.pos.x, G.player.pos.z, 40);
    const from = new THREE.Vector3(G.player.pos.x, 1.55, G.player.pos.z);
    const dir = new THREE.Vector3(-Math.sin(G.player.angle), 0, -Math.cos(G.player.angle));
    // slight spread
    dir.x += (rng() - 0.5) * 0.03; dir.z += (rng() - 0.5) * 0.03;
    dir.normalize();
    const m = ensureMuzzle();
    m.position.copy(from).addScaledVector(dir, 0.9);
    m.visible = true;
    setTimeout(() => { m.visible = false; }, 60);
    const range = 60;
    const to = from.clone().addScaledVector(dir, range);
    let hitSomething = false;
    // ray vs police cars / traffic cars (circle test in the XZ plane)
    const cars = [...G.vehicles.cars, ...G.police.units];
    for (const car of cars) {
      if (car.dead) continue;
      const cx = car.pos.x - from.x, cz = car.pos.z - from.z;
      const t = cx * dir.x + cz * dir.z;
      if (t < 0 || t > range) continue;
      const px = from.x + dir.x * t, pz = from.z + dir.z * t;
      if (Math.hypot(px - car.pos.x, pz - car.pos.z) < 2.4) {
        to.copy(from).addScaledVector(dir, t);
        hitSomething = true;
        if (car.isPolice || G.police.units.includes(car)) {
          G.addWanted(1, 'shot at SBPD');
        } else {
          G.vehicles.damageCar(car, 18, 'gunfire');
          if (car.traffic) G.addWanted(1, 'shot a car');
        }
        G.effects.sparks(to.x, 1, to.z);
        break;
      }
    }
    if (!hitSomething) {
      // ray vs foot cops
      for (const cop of G.police.cops) {
        const cx = cop.pos.x - from.x, cz = cop.pos.z - from.z;
        const t = cx * dir.x + cz * dir.z;
        if (t < 0 || t > range) continue;
        const px = from.x + dir.x * t, pz = from.z + dir.z * t;
        if (Math.hypot(px - cop.pos.x, pz - cop.pos.z) < 1.1) {
          to.copy(from).addScaledVector(dir, t);
          hitSomething = true;
          cop.hp -= 34;
          G.effects.blood(to.x, 1.2, to.z);
          G.addWanted(1, 'shot an officer');
          if (cop.hp <= 0) {
            G.scene.remove(cop.group);
            G.police.cops.splice(G.police.cops.indexOf(cop), 1);
            G.toast('Officer down', 'That will not help your wanted level.');
          }
          break;
        }
      }
    }
    if (!hitSomething) {
      // ray vs pedestrians
      for (const p of G.peds.list) {
        if (p.down > 0) continue;
        const cx = p.pos.x - from.x, cz = p.pos.z - from.z;
        const t = cx * dir.x + cz * dir.z;
        if (t < 0 || t > range) continue;
        const px = from.x + dir.x * t, pz = from.z + dir.z * t;
        if (Math.hypot(px - p.pos.x, pz - p.pos.z) < 0.9) {
          to.copy(from).addScaledVector(dir, t);
          hitSomething = true;
          p.down = 8;
          G.effects.blood(to.x, 1, to.z);
          G.addWanted(1, 'shot a pedestrian');
          G.state.pedsDown++;
          G.peds.scarePeds(p.pos.x, p.pos.z, 40);
          break;
        }
      }
    }
    if (!hitSomething) {
      // ray vs buildings: stop the tracer at the wall
      for (const c of G.city.colliders) {
        const t = rayBox(from, dir, c, range);
        if (t !== null) { to.copy(from).addScaledVector(dir, t); break; }
      }
    }
    G.effects.tracer(from, to);
    if (ammo === 0) reload();
  }

  function rayBox(from, dir, c, range) {
    // 2D slab test on the XZ plane
    let tmin = 0, tmax = range;
    for (const [o, d, mn, mx] of [[from.x, dir.x, c.x - c.hw, c.x + c.hw], [from.z, dir.z, c.z - c.hd, c.z + c.hd]]) {
      if (Math.abs(d) < 1e-8) { if (o < mn || o > mx) return null; continue; }
      let t1 = (mn - o) / d, t2 = (mx - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    return tmin;
  }

  function punch() {
    if (G.state.mode !== 'playing' || G.player.car) return;
    if (G.time - G.player.punchAt < 0.4) return;
    G.player.punchAt = G.time;
    G.audio.punch();
    const fx = -Math.sin(G.player.angle), fz = -Math.cos(G.player.angle);
    const hx = G.player.pos.x + fx * 1.4, hz = G.player.pos.z + fz * 1.4;
    // punch a pedestrian
    for (const p of G.peds.list) {
      if (p.down > 0) continue;
      if (Math.hypot(p.pos.x - hx, p.pos.z - hz) < 1.2) {
        p.down = 5;
        G.effects.blood(p.pos.x, 1, p.pos.z);
        G.addWanted(1, 'assault');
        G.peds.scarePeds(p.pos.x, p.pos.z, 25);
        G.toast('You decked a pedestrian', 'The SBPD noticed that.');
        return;
      }
    }
    // punch a foot cop
    for (const cop of G.police.cops) {
      if (Math.hypot(cop.pos.x - hx, cop.pos.z - hz) < 1.3) {
        cop.hp -= 20;
        G.effects.sparks(cop.pos.x, 1.2, cop.pos.z);
        G.addWanted(1, 'hit an officer');
        if (cop.hp <= 0) {
          G.scene.remove(cop.group);
          G.police.cops.splice(G.police.cops.indexOf(cop), 1);
        }
        return;
      }
    }
  }

  function reload() {
    if (reloading > 0 || ammo === MAG) return;
    reloading = 1.1;
    G.hud.setAmmo('RELOADING…');
  }

  function update(dt) {
    if (reloading > 0) {
      reloading -= dt;
      if (reloading <= 0) { ammo = MAG; G.audio.click(); }
    }
    G.hud.setAmmo(reloading > 0 ? 'RELOADING…' : `PISTOL   ${ammo} / ∞`);
  }

  return { shoot, punch, reload, update, getAmmo: () => ammo };
}
