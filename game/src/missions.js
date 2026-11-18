// Story missions for Solmar Bay: three jobs for the fixer Vera Cruz, then free
// roam with repeatable cash drops. Each step has a target, a marker and a HUD line.
import * as THREE from 'three';
import { makeMarker } from './effects.js';

const PACKAGE_SPOTS = [
  { x: 124, z: 62, name: 'Marina Plaza' },
  { x: -124, z: -62, name: 'North Docks' },
  { x: 62, z: -124, name: 'Hilltop View' },
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.index = 0;          // mission index
    this.step = 0;           // step inside the mission
    this.marker = null;
    this.packages = [];      // {mesh, taken}
    this.collected = 0;
    this.cashDrops = [];     // free-roam pickups {mesh, taken, timer}
    this.storyDone = false;
    this.defs = [
      {
        id: 'first-gear', title: 'MISSION 1 — FIRST GEAR', reward: 200,
        briefing: "Vera Cruz needs a driver. Steal any car, then bring it to her garage.",
        steps: [
          { text: 'Steal a car — walk up to one and press E', type: 'enterCar' },
          { text: "Drive to Vera's Garage (yellow marker)", type: 'reach', target: { x: -93, z: 155 }, radius: 10 },
        ],
      },
      {
        id: 'pier-drop', title: 'MISSION 2 — THE PIER DROP', reward: 350,
        briefing: 'Three packages are stashed around the city. Collect them all, then drop them at Solmar Pier.',
        steps: [
          { text: 'Collect the packages (0/3)', type: 'collect', count: 3 },
          { text: 'Deliver the packages to Solmar Pier', type: 'reach', target: { x: 0, z: 248 }, radius: 10 },
        ],
      },
      {
        id: 'heat-wave', title: 'MISSION 3 — HEAT WAVE', reward: 500,
        briefing: 'The drop was a setup — SBPD is all over you. Lose the heat: get to the safehouse.',
        steps: [
          { text: 'Reach the safehouse — lose the cops on the way', type: 'reach', target: { x: 155, z: -155 }, radius: 10 },
        ],
      },
    ];
    this.startMission(0);
  }

  current() { return this.defs[this.index]; }
  currentStep() { return this.defs[this.index]?.steps[this.step]; }

  startMission(i) {
    this.index = i;
    this.step = 0;
    this.collected = 0;
    this.clearPackages();
    const def = this.defs[i];
    if (!def) return;
    this.game.hud.showMessage(def.title, def.briefing, 5);
    this.game.audio.missionDone();
    if (def.id === 'pier-drop') this.spawnPackages();
    if (def.id === 'heat-wave') this.game.police.setHeat(55);
    this.refreshMarker();
  }

  spawnPackages() {
    const g = this.game;
    for (const spot of PACKAGE_SPOTS) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.5),
        new THREE.MeshBasicMaterial({ color: 0xffd23e }));
      mesh.position.set(spot.x, 1.2, spot.z);
      g.scene.add(mesh);
      this.packages.push({ mesh, taken: false, x: spot.x, z: spot.z, name: spot.name });
    }
  }

  clearPackages() {
    for (const p of this.packages) this.game.scene.remove(p.mesh);
    this.packages = [];
  }

  spawnCashDrops() {
    const g = this.game;
    for (let i = 0; i < 5; i++) {
      const p = g.city.randomRoadPoint(g.rng);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x7dff9a }));
      mesh.position.set(p.x, 0.9, p.z);
      g.scene.add(mesh);
      this.cashDrops.push({ mesh, taken: false, timer: 0, x: p.x, z: p.z });
    }
  }

  clearMarker() {
    if (this.marker) { this.marker.dispose(); this.marker = null; }
  }

  refreshMarker() {
    this.clearMarker();
    const target = this.currentTarget();
    if (target) this.marker = makeMarker(this.game.scene, target.x, target.z);
  }

  currentTarget() {
    if (this.storyDone) return null;
    const step = this.currentStep();
    if (!step) return null;
    if (step.type === 'reach') return step.target;
    if (step.type === 'collect') {
      const next = this.packages.find((p) => !p.taken);
      return next ? { x: next.x, z: next.z } : null;
    }
    return null;
  }

  objectiveText() {
    if (this.storyDone) return { title: 'FREE ROAM', text: 'Story complete! Grab the green cash drops, steal cars, dodge the SBPD.', dist: null };
    const def = this.current();
    const step = this.currentStep();
    if (!def || !step) return { title: '', text: '', dist: null };
    let text = step.text;
    if (step.type === 'collect') text = `Collect the packages (${this.collected}/${step.count})`;
    const target = this.currentTarget();
    let dist = null;
    if (target) {
      const p = this.game.playerPos();
      dist = Math.round(Math.hypot(target.x - p.x, target.z - p.z));
    }
    return { title: def.title, text, dist };
  }

  completeStep() {
    const def = this.current();
    const step = this.currentStep();
    this.step++;
    if (this.step >= def.steps.length) {
      this.completeMission(def);
    } else {
      this.game.audio.pickup();
      this.refreshMarker();
    }
  }

  completeMission(def) {
    const g = this.game;
    g.addCash(def.reward);
    g.hud.showMessage(`${def.title} COMPLETE`, `Vera paid you $${def.reward}`, 4);
    g.audio.cash();
    g.saveGame();
    this.clearPackages();
    this.clearMarker();
    if (this.index + 1 < this.defs.length) {
      this.startMission(this.index + 1);
    } else {
      this.storyDone = true;
      g.hud.showMessage('STORY COMPLETE', 'You bought your way out. Solmar Bay is yours — free roam!', 6);
      this.spawnCashDrops();
    }
  }

  update(dt) {
    const g = this.game;
    const p = g.playerPos();
    // spin packages + cash drops
    for (const pkg of this.packages) {
      if (pkg.taken) continue;
      pkg.mesh.rotation.y += dt * 2;
      pkg.mesh.position.y = 1.2 + Math.sin(performance.now() / 300) * 0.15;
    }
    for (const drop of this.cashDrops) {
      if (drop.taken) {
        drop.timer -= dt;
        if (drop.timer <= 0) {
          drop.taken = false;
          const np = g.city.randomRoadPoint(g.rng);
          drop.x = np.x; drop.z = np.z;
          drop.mesh.position.set(np.x, 0.9, np.z);
          drop.mesh.visible = true;
        }
        continue;
      }
      drop.mesh.rotation.y += dt * 2;
      if (Math.hypot(drop.x - p.x, drop.z - p.z) < 2.5) {
        drop.taken = true;
        drop.timer = 45;
        drop.mesh.visible = false;
        g.addCash(50);
        g.audio.cash();
        g.hud.showMessage('CASH DROP +$50', '', 1.5);
      }
    }
    if (this.marker) this.marker.update(performance.now() / 1000);
    if (this.storyDone) return;
    const step = this.currentStep();
    if (!step) return;
    if (step.type === 'enterCar' && g.currentCar) {
      this.completeStep();
    } else if (step.type === 'reach' && step.target) {
      if (Math.hypot(step.target.x - p.x, step.target.z - p.z) < step.radius) this.completeStep();
    } else if (step.type === 'collect') {
      for (const pkg of this.packages) {
        if (!pkg.taken && Math.hypot(pkg.x - p.x, pkg.z - p.z) < 3) {
          pkg.taken = true;
          g.scene.remove(pkg.mesh);
          this.collected++;
          g.audio.pickup();
          g.hud.showMessage(`PACKAGE ${this.collected}/${step.count}`, pkg.name, 2);
          this.refreshMarker();
        }
      }
      if (this.collected >= step.count) this.completeStep();
    }
  }
}
