// Combat for Solmar Bay: a hitscan pistol with tracer and muzzle flash,
// a punch, and the particle bursts (explosions, sparks, blood, cash).

import * as THREE from 'three';
import { mulberry32, clamp } from './util.js';

export function createEffects(G) {
  const scene = G.scene;
  const bursts = [];
  const tracers = [];

  // Spawn `count` small spheres that fly apart, fade and vanish.
  function burst(x, y, z, color, count, speed, size, life, gravity) {
    const parts = [];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
      const m = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 5), mat);
      m.position.set(x, y, z);
      scene.add(m);
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      parts.push({
        mesh: m,
        vx: Math.cos(a) * Math.cos(b) * s,
        vy: Math.sin(b) * s + speed * 0.3,
        vz: Math.sin(a) * Math.cos(b) * s,
        life: life * (0.6 + Math.random() * 0.7),
        max: life,
      });
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
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.12);
      if (t.life <= 0) {
        scene.remove(t.line);
        tracers.splice(i, 1);
      }
    }
  }

  function tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 1 })
    );
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
    sparks(x, y, z) {
      burst(x, y, z, 0xffe9a8, 10, 7, 0.12, 0.4, 9);
    },
    blood(x, y, z) {
      burst(x, y, z, 0xaa1111, 12, 4, 0.16, 0.6, 8);
    },
    cashBurst(x, y, z) {
      burst(x, y, z, 0x7dff9a, 14, 5, 0.2, 0.8, 5);
    },
  };
}

export function createCombat(G) {
  const rng = mulberry32(G.seed + 404);
  const MAG = 12;
  const RANGE = 60;
  let ammo = MAG;
  let reloading = 0;
  let muzzle = null;

  function muzzleFlash() {
    if (!muzzle) {
      muzzle = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 })
      );
      muzzle.visible = false;
      G.scene.add(muzzle);
    }
    return muzzle;
  }

  // Project `from` along `dir` and return the distance to the nearest
  // point of `target` (a circle in the XZ plane), or null if it misses.
  function rayCircle(from, dir, tx, tz, radius) {
    const cx = tx - from.x;
    const cz = tz - from.z;
    const t = cx * dir.x + cz * dir.z;
    if (t < 0 || t > RANGE) return null;
    const px = from.x + dir.x * t;
    const pz = from.z + dir.z * t;
    return Math.hypot(px - tx, pz - tz) < radius ? t : null;
  }

  // 2D slab test against a building collider box; null on a miss.
  function rayBox(from, dir, c) {
    let tmin = 0;
    let tmax = RANGE;
    for (const [o, d, mn, mx] of [
      [from.x, dir.x, c.x - c.hw, c.x + c.hw],
      [from.z, dir.z, c.z - c.hd, c.z + c.hd],
    ]) {
      if (Math.abs(d) < 1e-8) {
        if (o < mn || o > mx) return null;
        continue;
      }
      let t1 = (mn - o) / d;
      let t2 = (mx - o) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    return tmin;
  }

  function shoot() {
    if (G.state.mode !== 'playing') return;
    if (G.player.car) return; // no drive-by in this build
    if (reloading > 0) return;
    if (ammo <= 0) {
      reload();
      return;
    }
    ammo--;
    G.player.shootAt = G.time;
    G.audio.gunshot();
    G.peds.scarePeds(G.player.pos.x, G.player.pos.z, 40);

    const from = new THREE.Vector3(G.player.pos.x, 1.55, G.player.pos.z);
    const dir = new THREE.Vector3(-Math.sin(G.player.angle), 0, -Math.cos(G.player.angle));
    dir.x += (rng() - 0.5) * 0.03; // slight spread
    dir.z += (rng() - 0.5) * 0.03;
    dir.normalize();

    const flash = muzzleFlash();
    flash.position.copy(from).addScaledVector(dir, 0.9);
    flash.visible = true;
    setTimeout(() => { flash.visible = false; }, 60);

    const to = from.clone().addScaledVector(dir, RANGE);
    let hit = false;

    // cars first (police units are cars too)
    if (!hit) {
      for (const car of [...G.vehicles.cars, ...G.police.units]) {
        if (car.dead) continue;
        const t = rayCircle(from, dir, car.pos.x, car.pos.z, 2.4);
        if (t === null) continue;
        to.copy(from).addScaledVector(dir, t);
        hit = true;
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
    // foot cops
    if (!hit) {
      for (const cop of G.police.cops) {
        const t = rayCircle(from, dir, cop.pos.x, cop.pos.z, 1.1);
        if (t === null) continue;
        to.copy(from).addScaledVector(dir, t);
        hit = true;
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
    // pedestrians
    if (!hit) {
      for (const p of G.peds.list) {
        if (p.down > 0) continue;
        const t = rayCircle(from, dir, p.pos.x, p.pos.z, 0.9);
        if (t === null) continue;
        to.copy(from).addScaledVector(dir, t);
        hit = true;
        p.down = 8;
        G.effects.blood(to.x, 1, to.z);
        G.addWanted(1, 'shot a pedestrian');
        G.state.pedsDown++;
        G.peds.scarePeds(p.pos.x, p.pos.z, 40);
        break;
      }
    }
    // buildings stop the tracer
    if (!hit) {
      for (const c of G.city.colliders) {
        const t = rayBox(from, dir, c);
        if (t !== null) {
          to.copy(from).addScaledVector(dir, t);
          break;
        }
      }
    }
    G.effects.tracer(from, to);
    if (ammo === 0) reload();
  }

  function punch() {
    if (G.state.mode !== 'playing' || G.player.car) return;
    if (G.time - G.player.punchAt < 0.4) return;
    G.player.punchAt = G.time;
    G.audio.punch();
    const fx = -Math.sin(G.player.angle);
    const fz = -Math.cos(G.player.angle);
    const hx = G.player.pos.x + fx * 1.4;
    const hz = G.player.pos.z + fz * 1.4;
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
      if (reloading <= 0) {
        ammo = MAG;
        G.audio.click();
      }
    }
    G.hud.setAmmo(reloading > 0 ? 'RELOADING…' : `PISTOL   ${ammo} / ∞`);
  }

  return { shoot, punch, reload, update, getAmmo: () => ammo };
}
