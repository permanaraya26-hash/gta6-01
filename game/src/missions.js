// Story missions for Solmar Bay: three jobs for the fixer Vera Cruz, then
// free roam with respawning cash drops. Original story and characters.

import * as THREE from 'three';
import { mulberry32, randRange, pick, clamp } from './util.js';
import { ROAD_LINES } from './city.js';

const MISSION_PAY = [0, 250, 400, 600];
const PACKAGE_SPOTS = [[248, 0], [281, -3], [314, 3]];
const DROP_AMOUNTS = [50, 75, 100, 150];

export function createMissions(G) {
  const rng = mulberry32(G.seed + 505);

  // The yellow ring + light beam that marks the current objective.
  const markerGroup = new THREE.Group();
  G.scene.add(markerGroup);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3, 0.25, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0xffd23e })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 40, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
  );
  beam.position.y = 20;
  markerGroup.add(ring, beam);
  markerGroup.visible = false;

  const packages = [];
  const drops = [];
  let dropTimer = 20;
  let packagesCollected = 0;

  const distTo = (x, z) => {
    const px = G.player.car ? G.player.car.pos.x : G.player.pos.x;
    const pz = G.player.car ? G.player.car.pos.z : G.player.pos.z;
    return Math.hypot(px - x, pz - z);
  };

  const MISSIONS = [
    {
      title: 'The Fixer',
      text: 'Vera Cruz is waiting on the boardwalk by the pier. Go meet her.',
      target: () => G.city.veraPos,
      check: () => distTo(G.city.veraPos.x, G.city.veraPos.z) < 4,
      onStart: () => G.toast('New mission — The Fixer', 'Follow the yellow marker to the boardwalk.'),
      onDone: () => G.toast('Vera Cruz', '"Rico. You owe me a favour, and I collect."'),
    },
    {
      title: 'Hot Wheels',
      text: 'Steal any car (E) and bring it to the garage on Marina Row.',
      target: () => G.city.garagePos,
      check: () => G.player.car && distTo(G.city.garagePos.x, G.city.garagePos.z) < 9,
      onStart: () => G.toast('New mission — Hot Wheels', 'Steal a car and deliver it to the garage.'),
      onDone: () => {
        const car = G.player.car;
        if (car) {
          G.vehicles.removeCar(car);
          G.playerExitCar(true);
        }
        G.toast('Mission complete', 'Vera sold the car. Your cut is in.');
      },
    },
    {
      title: 'Pier Drops',
      text: 'Pick up 3 packages Vera stashed along Pier 7. Watch the water.',
      target: () => (packages.length ? packages[0].pos : G.city.pierPos),
      check: () => packagesCollected >= 3,
      onStart: () => {
        spawnPackages();
        G.toast('New mission — Pier Drops', 'Collect all 3 packages on the pier.');
      },
      onDone: () => G.toast('Mission complete', '"Clean work, Rico. The pier is yours tonight."'),
    },
    {
      title: 'Heat Wave',
      text: 'The SBPD is all over you. Lose them and get to the Safehouse.',
      target: () => G.city.safehousePos,
      check: () => distTo(G.city.safehousePos.x, G.city.safehousePos.z) < 8,
      onStart: () => {
        G.state.wanted = 3;
        G.toast('New mission — Heat Wave', '3 stars! Get to the Safehouse, fast.');
        G.audio.horn();
      },
      onDone: () => {
        G.state.wanted = 0;
        G.toast('Mission complete', 'You slipped the net. Vera is impressed.');
      },
    },
  ];

  function spawnPackages() {
    clearPackages();
    packagesCollected = 0;
    for (const [x, z] of PACKAGE_SPOTS) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.7, 1.1),
        new THREE.MeshLambertMaterial({ color: 0xffd23e })
      );
      box.position.set(x, 0.6, z);
      box.castShadow = true;
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(1.4, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.18 })
      );
      glow.position.copy(box.position);
      G.scene.add(box, glow);
      packages.push({ mesh: box, glow, pos: box.position, spin: 0 });
    }
  }

  function clearPackages() {
    for (const p of packages) {
      G.scene.remove(p.mesh);
      G.scene.remove(p.glow);
    }
    packages.length = 0;
  }

  function spawnDrop() {
    if (drops.length >= 5) return;
    const line = pick(rng, ROAD_LINES);
    const t = randRange(rng, -160, 160);
    const x = rng() < 0.5 ? t : line + 9;
    const z = rng() < 0.5 ? line + 9 : t;
    const amount = pick(rng, DROP_AMOUNTS);
    const stack = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.5, 0.6),
      new THREE.MeshLambertMaterial({ color: 0x2ea85e })
    );
    stack.position.set(x, 0.5, z);
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.16, 0.62),
      new THREE.MeshBasicMaterial({ color: 0x7dff9a })
    );
    band.position.set(x, 0.5, z);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.15 })
    );
    glow.position.set(x, 0.5, z);
    G.scene.add(stack, band, glow);
    drops.push({ mesh: stack, band, glow, pos: stack.position, amount, spin: rng() * 6 });
  }

  function startMission(i) {
    const m = MISSIONS[i];
    if (!m) return;
    G.state.missionIndex = i;
    m.onStart();
    G.hud.setObjective(m.title, m.text);
  }

  function completeMission() {
    const i = G.state.missionIndex;
    const m = MISSIONS[i];
    if (!m) return;
    m.onDone();
    const pay = MISSION_PAY[i];
    if (pay > 0) {
      G.state.cash += pay;
      G.toast(`+$${pay} — job paid`, 'Vera wired your cut.');
      G.audio.cash();
    }
    G.audio.mission();
    G.state.missionsDone++;
    G.saveGame();
    if (i + 1 < MISSIONS.length) {
      startMission(i + 1);
    } else {
      G.state.missionIndex = MISSIONS.length; // free roam
      G.hud.setObjective(
        'Free Roam',
        'All jobs done. Explore Solmar Bay, grab cash drops, stay out of trouble.'
      );
      G.toast('Free Roam', 'Vera will call when there is more work. For now — the city is yours.');
      markerGroup.visible = false;
    }
  }

  function update(dt) {
    const idx = G.state.missionIndex;
    // packages: bob, spin, collect
    for (let i = packages.length - 1; i >= 0; i--) {
      const p = packages[i];
      p.spin += dt;
      p.mesh.rotation.y = p.spin;
      p.mesh.position.y = 0.6 + Math.sin(p.spin * 2) * 0.15;
      if (distTo(p.pos.x, p.pos.z) < 2.2) {
        G.scene.remove(p.mesh);
        G.scene.remove(p.glow);
        packages.splice(i, 1);
        packagesCollected++;
        G.audio.pickup();
        G.effects.cashBurst(p.pos.x, 1, p.pos.z);
        G.toast(
          `Package ${packagesCollected} of 3`,
          packagesCollected < 3 ? 'Keep going down the pier.' : 'All packages collected!'
        );
      }
    }
    // cash drops: bob, spin, collect
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.spin += dt;
      d.mesh.rotation.y = d.spin;
      d.band.rotation.y = d.spin;
      d.mesh.position.y = 0.5 + Math.sin(d.spin * 2) * 0.12;
      d.band.position.y = d.mesh.position.y;
      if (distTo(d.pos.x, d.pos.z) < 2.6) {
        G.scene.remove(d.mesh);
        G.scene.remove(d.band);
        G.scene.remove(d.glow);
        drops.splice(i, 1);
        G.state.cash += d.amount;
        G.audio.cash();
        G.effects.cashBurst(d.pos.x, 1, d.pos.z);
        G.toast(`+$${d.amount} cash`, 'Found money on the street. Nice.');
      }
    }
    dropTimer -= dt;
    if (dropTimer <= 0) {
      spawnDrop();
      dropTimer = 22 + rng() * 10;
    }

    if (idx >= MISSIONS.length) {
      markerGroup.visible = false;
      return;
    }
    const m = MISSIONS[idx];
    const target = m.target();
    markerGroup.visible = true;
    markerGroup.position.set(target.x, 0, target.z);
    ring.rotation.z += dt * 1.5;
    G.hud.setObjective(m.title, m.text, distTo(target.x, target.z));
    if (m.check()) completeMission();
  }

  function resetForNewGame() {
    clearPackages();
    for (const d of drops) {
      G.scene.remove(d.mesh);
      G.scene.remove(d.band);
      G.scene.remove(d.glow);
    }
    drops.length = 0;
    packagesCollected = 0;
    dropTimer = 20;
    startMission(0);
  }

  return { update, startMission, completeMission, resetForNewGame, MISSIONS, spawnDrop };
}
