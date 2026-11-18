// Solmar Bay — an original open-world crime game (three.js, static files, offline).
// Boots the world, owns the game state machine and the frame loop.
import * as THREE from 'three';
import { makeRng } from './rng.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { buildCity } from './city.js';
import { Car, spawnParkedCars, spawnTrafficCars } from './vehicles.js';
import { Player } from './player.js';
import { spawnPedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { Effects } from './effects.js';
import { saveGame, loadGame, clearSave } from './save.js';
import { stageShot } from './shots.js';

const SEED = 20261117;

class Game {
  constructor() {
    this.state = 'loading'; // loading | menu | playing | paused | busted | wasted
    this.cash = 120;
    this.health = 100;
    this.elapsed = 0;
    this.rng = makeRng(SEED);
    this.currentCar = null;
    this.invulnTimer = 0;
    this.lastDamageAt = -99;
    this.autoSaveTimer = 0;
    this.frame = 0;
    this.stagedDrive = false; // screenshot mode: the staged car cruises on its own
  }

  init() {
    window.addEventListener('error', (e) => {
      const l = document.getElementById('loading');
      if (l) { l.classList.remove('hidden'); l.textContent = `Error: ${e.message}`; }
    });
    const app = document.getElementById('app');
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.classList.add('webgl');
    app.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(0, 40, 180);

    this.input = new Input(this.renderer.domElement);
    this.audio = new AudioSys();
    this.city = buildCity(this.scene, this.rng);
    this.effects = new Effects(this.scene);
    this.player = new Player(this.scene);
    this.parkedCars = spawnParkedCars(this.scene, this.city, this.rng, 14);
    this.trafficCars = spawnTrafficCars(this.scene, this.city, this.rng, 10);
    this.peds = spawnPedestrians(this.scene, this.city, this.rng, 26);
    this.police = new Police(this.scene, this.city, this.rng);
    this.combat = new Combat(this);
    this.hud = new HUD();
    this.missions = new Missions(this);

    this.bindMenus();
    window.addEventListener('resize', () => this.onResize());
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frameLoop());
    document.getElementById('loading').classList.add('hidden');

    // Screenshot mode: ?shot=cover|foot|mission|start stages a live scene.
    const params = new URLSearchParams(location.search);
    const shot = params.get('shot');
    if (shot) {
      stageShot(shot, this);
      if (shot !== 'start') document.getElementById('hud').classList.remove('hidden');
    } else {
      this.showStartMenu();
    }
    window.__solmar = this;
    window.__solmarReady = true;
  }

  // ---- state helpers ----
  playerPos() {
    return this.currentCar ? this.currentCar.pos : this.player.pos;
  }

  addCash(n) {
    this.cash = Math.max(0, this.cash + n);
    this.hud.showMessage(`+$${n}`, '', 1.2);
  }

  damagePlayer(n, src) {
    if (this.invulnTimer > 0 || this.state !== 'playing') return;
    this.health -= n;
    this.invulnTimer = 0.4;
    this.lastDamageAt = this.elapsed;
    if (this.health <= 0) {
      this.health = 0;
      this.wasted();
    }
  }

  explodeCar(car) {
    if (car.wrecked) return;
    car.wrecked = true;
    car.speed = 0;
    this.effects.burst(new THREE.Vector3(car.pos.x, 1, car.pos.z), 0xff6a00, 40, 10, 8, 1.2);
    this.effects.burst(new THREE.Vector3(car.pos.x, 1, car.pos.z), 0x333333, 20, 5, 9, 1.6);
    this.audio.noiseBurst(0.5, 0.6, 900);
    if (car === this.currentCar) {
      this.exitCar();
      this.damagePlayer(25, 'explosion');
    }
    this.trafficCars = this.trafficCars.filter((c) => c !== car);
    this.police.cars = this.police.cars.filter((c) => c !== car);
  }

  busted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.cash = Math.max(0, this.cash - 150);
    this.police.clearAll();
    this.audio.busted();
    this.audio.setSiren(false, 0);
    this.audio.setEngine(0, false);
    this.hud.showWasted('BUSTED', 'The SBPD caught you. $150 bail — press Enter to walk free.');
  }

  wasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.cash = Math.max(0, this.cash - 200);
    this.police.clearAll();
    this.audio.busted();
    this.audio.setSiren(false, 0);
    this.audio.setEngine(0, false);
    this.hud.showWasted('WASTED', 'You got taken out. $200 hospital bill — press Enter to get back up.');
  }

  respawn() {
    const sh = this.city.landmarks.safehouse;
    if (this.currentCar) { this.currentCar.occupied = false; this.currentCar = null; }
    this.player.pos.set(sh.x, 0, sh.z + 12);
    this.player.heading = Math.PI;
    this.player.camYaw = Math.PI;
    this.health = 100;
    this.hud.hideWasted();
    this.state = 'playing';
    this.saveGame();
  }

  // ---- cars ----
  nearestCar(maxDist = 4.5) {
    const p = this.player.pos;
    let best = null; let bd = maxDist;
    for (const car of [...this.parkedCars, ...this.trafficCars]) {
      if (car.occupied || car.wrecked || car.isPolice) continue;
      const d = Math.hypot(car.pos.x - p.x, car.pos.z - p.z);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }

  enterCar(car, silent = false) {
    this.currentCar = car;
    car.occupied = true;
    car.isTraffic = false;
    car.isParked = false;
    this.player.mesh.visible = false;
    if (!silent) {
      const wasTraffic = this.trafficCars.includes(car);
      this.police.addHeat(wasTraffic ? 12 : 10);
      this.hud.showMessage(wasTraffic ? 'CARJACKED!' : 'CAR STOLEN!', wasTraffic ? 'The driver ran off — the cops noticed.' : 'The SBPD noticed.', 2.5);
      this.audio.horn();
    }
  }

  exitCar() {
    if (!this.currentCar) return;
    const car = this.currentCar;
    car.occupied = false;
    car.isParked = true;
    car.speed = 0;
    const side = car.heading + Math.PI / 2;
    this.player.pos.set(car.pos.x + Math.sin(side) * 2.2, 0, car.pos.z + Math.cos(side) * 2.2);
    this.player.heading = car.heading;
    this.player.mesh.visible = true;
    this.currentCar = null;
  }

  tryEnterExit() {
    if (this.currentCar) this.exitCar();
    else {
      const car = this.nearestCar();
      if (car) this.enterCar(car);
    }
  }

  // ---- menus ----
  bindMenus() {
    const $ = (id) => document.getElementById(id);
    $('btnNew').addEventListener('click', () => { this.audio.ensure(); this.audio.click(); this.newGame(); });
    $('btnContinue').addEventListener('click', () => { this.audio.ensure(); this.audio.click(); this.continueGame(); });
    $('btnHow').addEventListener('click', () => { this.audio.click(); $('howPanel').classList.toggle('hidden'); });
    $('btnResume').addEventListener('click', () => { this.audio.click(); this.togglePause(); });
    $('btnSave').addEventListener('click', () => { this.audio.click(); this.saveGame(); $('pauseStats').textContent = 'Game saved.'; });
    $('btnRestart').addEventListener('click', () => { this.audio.click(); clearSave(); location.reload(); });
    $('btnQuit').addEventListener('click', () => { this.audio.click(); this.saveGame(); this.showStartMenu(); });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && (this.state === 'busted' || this.state === 'wasted')) this.respawn();
      if ((e.code === 'KeyP' || e.code === 'Escape') && (this.state === 'playing' || this.state === 'paused')) this.togglePause();
      if (e.code === 'KeyM' && this.state === 'playing') {
        const muted = this.audio.toggleMute();
        this.hud.showMessage(muted ? 'SOUND OFF' : 'SOUND ON', '', 1);
      }
    });
  }

  showStartMenu() {
    this.state = 'menu';
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('pauseMenu').classList.add('hidden');
    const save = loadGame();
    const btn = document.getElementById('btnContinue');
    if (save) {
      btn.classList.remove('hidden');
      document.getElementById('continueInfo').textContent =
        `$${save.cash.toLocaleString('en-US')} · Mission ${save.missionIndex + 1}`;
    } else {
      btn.classList.add('hidden');
    }
    document.getElementById('startMenu').classList.remove('hidden');
  }

  hideMenus() {
    document.getElementById('startMenu').classList.add('hidden');
    document.getElementById('pauseMenu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
  }

  newGame() {
    clearSave();
    this.cash = 120;
    this.health = 100;
    this.elapsed = 0;
    this.police.clearAll();
    this.missions = new Missions(this);
    this.player.pos.set(0, 0, 120);
    this.player.heading = Math.PI;
    this.player.camYaw = Math.PI;
    this.hideMenus();
    this.state = 'playing';
    this.hud.showMessage('WELCOME TO SOLMAR BAY', "Vera's first job is waiting — steal a car.", 4);
  }

  continueGame() {
    const save = loadGame();
    if (!save) { this.newGame(); return; }
    this.cash = save.cash;
    this.health = save.health;
    this.elapsed = save.elapsed || 0;
    this.missions = new Missions(this);
    this.missions.index = Math.min(save.missionIndex, 2);
    this.missions.step = save.missionStep || 0;
    this.missions.storyDone = !!save.storyDone;
    this.missions.collected = save.collected || 0;
    this.missions.refreshMarker();
    if (save.pos) this.player.pos.set(save.pos.x, 0, save.pos.z);
    this.hideMenus();
    this.state = 'playing';
    this.hud.showMessage('WELCOME BACK', 'Your save was loaded.', 3);
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      const stats = document.getElementById('pauseStats');
      stats.innerHTML = `Cash $${this.cash.toLocaleString('en-US')} · ${this.missions.objectiveText().title}<br>Wanted: ${this.police.stars} star(s) · Health ${Math.round(this.health)}%`;
      document.getElementById('pauseMenu').classList.remove('hidden');
      this.audio.setEngine(0, false);
      this.audio.setSiren(false, 0);
    } else if (this.state === 'paused') {
      this.state = 'playing';
      document.getElementById('pauseMenu').classList.add('hidden');
    }
  }

  saveGame() {
    saveGame(this);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---- frame loop ----
  frameLoop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.frame++;
    const input = this.input;
    if (this.state === 'menu') {
      // Slow orbit over the city behind the title screen.
      const t = performance.now() / 1000;
      this.camera.position.set(Math.sin(t * 0.05) * 150, 70, Math.cos(t * 0.05) * 150);
      this.camera.lookAt(0, 0, 0);
      for (const c of this.trafficCars) c.updateTraffic(dt, this.city, this.rng, this.trafficCars);
      for (const p of this.peds) p.update(dt, this.city, this.player.pos, null);
      this.effects.update(dt);
    } else if (this.state === 'playing') {
      this.elapsed += dt;
      this.invulnTimer -= dt;
      this.audio.ensure();
      // enter / exit car
      if (input.wasPressed('KeyE')) this.tryEnterExit();
      const inCar = !!this.currentCar;
      // player / driving
      if (inCar) {
        const car = this.currentCar;
        // In staged screenshot scenes the car cruises on its own.
        const throttle = this.stagedDrive ? 1 : input.moveY();
        car.drive(dt, throttle, input.moveX(), input.down('Space'), this.city);
        this.audio.setEngine(Math.abs(car.speed) / car.maxSpeed, true);
        // ease chase camera behind the car
        if (!input.dragging) {
          let dh = car.heading - this.player.camYaw;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          this.player.camYaw += dh * Math.min(1, dt * 1.6);
        }
        // running over pedestrians
        if (Math.abs(car.speed) > 3) {
          for (const ped of this.peds) {
            if (ped.down) continue;
            if (Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z) < 2.3) {
              ped.knockDown();
              this.effects.burst(new THREE.Vector3(ped.pos.x, 1, ped.pos.z), 0xff5040, 8, 4, 3, 0.6);
              this.police.addHeat(15);
              this.hud.showMessage('YOU HIT A PEDESTRIAN!', 'The SBPD saw that.', 2);
              this.audio.punch();
            }
          }
        }
        // bump traffic / parked cars
        for (const other of [...this.trafficCars, ...this.parkedCars, ...this.police.cars]) {
          if (other === car || other.wrecked) continue;
          const d = Math.hypot(other.pos.x - car.pos.x, other.pos.z - car.pos.z);
          if (d < 3.6 && d > 0.01) {
            const push = (3.6 - d) * 0.5;
            const nx = (other.pos.x - car.pos.x) / d, nz = (other.pos.z - car.pos.z) / d;
            other.pos.x += nx * push; other.pos.z += nz * push;
            car.speed *= 0.92;
            car.health = Math.max(0, car.health - 2);
            other.health = Math.max(0, other.health - 2);
            if (other.health <= 0) this.explodeCar(other);
            if (car.health <= 0) this.explodeCar(car);
          }
        }
        if (car.health <= 0) this.explodeCar(car);
      } else {
        this.player.update(dt, input, this.city, false);
        this.audio.setEngine(0, false);
      }
      // traffic + pedestrians
      for (const c of this.trafficCars) {
        if (!c.occupied && !c.wrecked) c.updateTraffic(dt, this.city, this.rng, [...this.trafficCars, ...this.police.cars]);
      }
      const threat = this.police.stars > 0 ? this.playerPos() : null;
      for (const p of this.peds) p.update(dt, this.city, this.playerPos(), threat);
      // systems
      this.police.update(dt, this);
      this.combat.update(dt, input, this.camera);
      this.missions.update(dt);
      this.effects.update(dt);
      // health regen out of combat
      if (this.elapsed - this.lastDamageAt > 6 && this.health > 0 && this.health < 100) {
        this.health = Math.min(100, this.health + 4 * dt);
      }
      // camera
      const target = this.currentCar ? this.currentCar.pos : this.player.pos;
      this.player.updateCamera(this.camera, input, dt, target, inCar);
      // HUD + autosave
      this.hud.update(this, dt);
      this.autoSaveTimer += dt;
      if (this.autoSaveTimer > 30) { this.autoSaveTimer = 0; this.saveGame(); }
    }
    this.renderer.render(this.scene, this.camera);
    input.endFrame();
  }
}

const game = new Game();
game.init();
