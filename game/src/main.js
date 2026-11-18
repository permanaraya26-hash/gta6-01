// Solmar Bay — main bootstrap and game loop.
// Wires the city, people, cars, police, combat, missions, HUD and audio
// into one playable open-world game. Original code written for this entry.
import * as THREE from 'three';
import { mulberry32, hashSeed, clamp } from './util.js';
import { createCity, collideCircle } from './city.js';
import { createAudio } from './audio.js';
import { createVehicles } from './vehicles.js';
import { createPeople } from './people.js';
import { createPolice } from './police.js';
import { createCombat, createEffects } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { applyShot } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = hashSeed(params.get('seed') || 'solmar-bay-1');
const shotName = params.get('shot');
const rng = mulberry32(seed);

// --- renderer / scene ---
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.className = 'webgl';
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);

// --- shared game object ---
const G = {
  scene, camera, renderer, seed, rng,
  time: 0, camYaw: 0.6, camPitch: 0.34, camDist: 13,
  camPos: new THREE.Vector3(), camLook: new THREE.Vector3(),
  shotOrbit: false, shotName,
  state: {
    mode: 'menu', cash: 0, health: 100, wanted: 0, wantedTimer: 0,
    clockMinutes: 8 * 60, missionIndex: 0, missionsDone: 0,
    carsStolen: 0, pedsDown: 0,
  },
  hasSave,
};
G.audio = createAudio();
G.city = createCity(scene, seed);
G.effects = createEffects(G);
G.cityCollide = (pos, r) => collideCircle(G.city.colliders, pos, r);

G.addWanted = (n, reason) => {
  if (G.state.mode !== 'playing') return;
  const before = G.state.wanted;
  G.state.wanted = clamp(G.state.wanted + n, 0, 5);
  if (before === 0 && G.state.wanted > 0) {
    G.toast('Wanted — ' + G.state.wanted + ' star' + (G.state.wanted > 1 ? 's' : ''), reason ? 'The SBPD is responding to: ' + reason + '.' : 'Lose the cops to cool off.');
  }
  G.state.wantedTimer = 0;
};

G.hurtPlayer = (amount, cause) => {
  if (G.state.mode !== 'playing') return;
  G.state.health = Math.max(0, G.state.health - amount);
  G.hud.update();
  if (G.state.health <= 0) G.wasted();
};

G.busted = () => {
  if (G.state.mode !== 'playing') return;
  const lost = Math.floor(G.state.cash * 0.2);
  G.state.cash -= lost;
  G.state.wanted = 0;
  G.police.clearAll();
  if (G.player.car) { G.player.car.isPlayer = false; G.player.car.speed = 0; G.player.car = null; G.player.mesh.group.visible = true; }
  G.audio.busted();
  G.audio.setSiren(false);
  G.state.mode = 'end';
  G.hud.showEnd('busted', lost);
  G.saveGame();
};

G.wasted = () => {
  if (G.state.mode !== 'playing') return;
  const lost = Math.floor(G.state.cash * 0.2);
  G.state.cash -= lost;
  G.state.wanted = 0;
  G.police.clearAll();
  if (G.player.car) { G.player.car.isPlayer = false; G.player.car.speed = 0; G.player.car = null; G.player.mesh.group.visible = true; }
  G.audio.wasted();
  G.audio.setSiren(false);
  G.state.mode = 'end';
  G.hud.showEnd('wasted', lost);
  G.saveGame();
};

G.toast = (t, s) => G.hud.toast(t, s);

G.vehicles = createVehicles(G);
G.peds = createPeople(G);
G.player = G.peds.player;
G.playerExitCar = (force) => G.peds.exitCar(force);
G.police = createPolice(G);
G.combat = createCombat(G);
G.missions = createMissions(G);
G.hud = createHud(G);

G.saveGame = () => saveGame({ ...G.state, player: G.player });

function respawnAtSafehouse() {
  G.player.pos.set(G.city.safehousePos.x, 0, G.city.safehousePos.z);
  G.player.angle = Math.PI;
  G.player.vy = 0;
  G.state.health = 100;
  G.state.mode = 'playing';
  G.hud.showMenu('playing');
  G.toast('Safehouse', 'You got away — this time. Vera left a note on the door.');
}

// --- input ---
const keys = {};
const input = {
  get forward() { return keys.KeyW || keys.ArrowUp; },
  get back() { return keys.KeyS || keys.ArrowDown; },
  get left() { return keys.KeyA || keys.ArrowLeft; },
  get right() { return keys.KeyD || keys.ArrowRight; },
  get run() { return keys.ShiftLeft || keys.ShiftRight; },
  get jump() { return keys.Space && !G.player.car; },
  get handbrake() { return keys.Space && !!G.player.car; },
};
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyM') G.audio.setMuted(!G.audio.isMuted());
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (G.state.mode === 'playing') pauseGame();
    else if (G.state.mode === 'paused') resumeGame();
  }
  if (e.code === 'KeyE' && G.state.mode === 'playing') toggleCar();
  if (e.code === 'KeyF' && G.state.mode === 'playing') G.combat.punch();
  if (e.code === 'KeyR' && G.state.mode === 'playing') G.combat.reload();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (G.state.mode !== 'playing') return;
  G.audio.unlock();
  if (e.button === 0) G.combat.shoot();
  G.dragging = true;
  G.dragX = e.clientX; G.dragY = e.clientY;
});
addEventListener('pointermove', (e) => {
  if (!G.dragging || G.state.mode !== 'playing') return;
  G.camYaw -= (e.clientX - G.dragX) * 0.005;
  G.camPitch = clamp(G.camPitch + (e.clientY - G.dragY) * 0.003, 0.08, 1.05);
  G.dragX = e.clientX; G.dragY = e.clientY;
});
addEventListener('pointerup', () => { G.dragging = false; });
addEventListener('wheel', (e) => {
  if (G.state.mode !== 'playing') return;
  G.camDist = clamp(G.camDist + Math.sign(e.deltaY) * 1.5, 7, 26);
}, { passive: true });

function toggleCar() {
  if (G.player.car) { G.peds.exitCar(false); return; }
  const car = G.vehicles.nearestCar(G.player.pos.x, G.player.pos.z, 4.5, null);
  if (car) G.peds.enterCar(car);
}

function pauseGame() {
  G.state.mode = 'paused';
  G.hud.showMenu('pause');
  G.audio.setEngine(0, false);
  G.audio.setSiren(false);
}
function resumeGame() {
  G.state.mode = 'playing';
  G.hud.showMenu('playing');
  G.audio.unlock();
}

// --- menus ---
document.getElementById('btn-new').addEventListener('click', () => {
  G.audio.unlock(); G.audio.click();
  newGame();
});
document.getElementById('btn-continue').addEventListener('click', () => {
  G.audio.unlock(); G.audio.click();
  continueGame();
});
document.getElementById('btn-how').addEventListener('click', () => {
  const h = document.getElementById('howto');
  h.style.display = h.style.display === 'none' ? 'block' : 'none';
});
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-save').addEventListener('click', () => {
  if (G.saveGame()) G.toast('Game saved', 'Progress stored in this browser.');
});
document.getElementById('btn-restart').addEventListener('click', () => { newGame(); });
document.getElementById('btn-quit').addEventListener('click', () => {
  G.state.mode = 'menu';
  G.police.clearAll();
  G.hud.showMenu('start');
});
document.getElementById('btn-respawn').addEventListener('click', () => {
  G.audio.click();
  respawnAtSafehouse();
});

function newGame() {
  const s = G.state;
  s.cash = 150; s.health = 100; s.wanted = 0; s.wantedTimer = 0;
  s.clockMinutes = 8 * 60; s.missionIndex = 0; s.missionsDone = 0;
  s.carsStolen = 0; s.pedsDown = 0;
  G.police.clearAll();
  G.player.pos.set(G.city.spawnPos.x, 0, G.city.spawnPos.z);
  G.player.angle = Math.PI;
  G.player.car = null;
  G.player.mesh.group.visible = true;
  G.camYaw = 0.6; G.camPitch = 0.34; G.camDist = 13;
  G.missions.resetForNewGame();
  s.mode = 'playing';
  G.hud.showMenu('playing');
  G.toast('Welcome to Solmar Bay', 'Go meet Vera Cruz at the pier. Follow the yellow marker.');
}

function continueGame() {
  const data = loadGame();
  if (!data) { newGame(); return; }
  const s = G.state;
  s.cash = data.cash; s.health = data.health; s.missionIndex = data.missionIndex;
  s.missionsDone = data.missionsDone; s.clockMinutes = data.clockMinutes;
  s.carsStolen = data.carsStolen || 0; s.pedsDown = data.pedsDown || 0;
  s.wanted = 0; s.wantedTimer = 0;
  G.police.clearAll();
  G.player.pos.set(data.player.x, 0, data.player.z);
  G.player.angle = data.player.angle || 0;
  G.player.car = null;
  G.player.mesh.group.visible = true;
  G.missions.startMission(Math.min(data.missionIndex, 3));
  s.mode = 'playing';
  G.hud.showMenu('playing');
  G.toast('Welcome back', 'Your save was loaded. The city kept spinning without you.');
}

// --- world setup ---
G.vehicles.spawnParked();
for (let i = 0; i < 10; i++) G.vehicles.spawnTrafficCar();
G.missions.startMission(0);
G.state.mode = 'menu';
G.hud.showMenu('start');
G.hud.setObjective('Solmar Bay', 'Meet Vera at the pier.');

if (shotName) {
  applyShot(G, shotName);
  // let the shot scene settle a few frames before screenshots
  G.shotSettle = 0;
}

let lastSave = 0;
const clock = new THREE.Clock();

function updateCamera(dt) {
  if (G.state.mode === 'menu') {
    // slow orbit over the city for the title screen
    const t = G.time * 0.045;
    camera.position.set(40 + Math.cos(t) * 210, 125, Math.sin(t) * 210);
    camera.lookAt(50, 0, 0);
    return;
  }
  const target = G.player.car ? G.player.car.pos : G.player.pos;
  const ty = (G.player.car ? 1.2 : 1.6);
  const ox = Math.sin(G.camYaw) * G.camDist;
  const oz = Math.cos(G.camYaw) * G.camDist;
  const oy = 2.2 + Math.sin(G.camPitch) * G.camDist;
  const desired = new THREE.Vector3(target.x + ox, oy, target.z + oz);
  camera.position.lerp(desired, Math.min(1, dt * 8));
  camera.lookAt(target.x, ty, target.z);
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (G.state.mode === 'playing') {
    G.time += dt;
    G.state.clockMinutes += dt * 0.5;
    G.peds.updatePlayer(dt, input);
    if (G.player.car) G.vehicles.drivePlayer(dt, input);
    G.vehicles.updateTraffic(dt);
    G.peds.updatePeds(dt);
    G.police.update(dt);
    G.combat.update(dt);
    G.missions.update(dt);
    G.effects.update(dt);
    G.hud.update();
    if (G.time - lastSave > 30) { lastSave = G.time; G.saveGame(); }
  } else if (G.state.mode === 'menu') {
    G.time += dt;
    // idle city life behind the menu
    G.vehicles.updateTraffic(dt);
    G.peds.updatePeds(dt);
    G.effects.update(dt);
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// test hook: lets the automated playtest read game state
window.__solmar = {
  G,
  get state() { return G.state.mode; },
  get errors() { return window.__errors || []; },
};
window.addEventListener('error', (e) => {
  (window.__errors = window.__errors || []).push(String(e.message));
});

tick();
