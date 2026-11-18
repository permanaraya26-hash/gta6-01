// HUD for Solmar Bay: cash, health, wanted stars, clock, objective, a
// live minimap, speedometer, ammo, toasts, and the start / pause menus.
// The HUD is DOM laid over the WebGL canvas; the minimap is a 2D canvas.

import { clamp } from './util.js';
import { CITY_HALF, BEACH_X, OCEAN_X } from './city.js';

const ROAD_GRID = [-156, -104, -52, 0, 52, 104, 156];
const MAP_SIZE = 180;

export function createHud(G) {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'),
    cash: $('cash'),
    wanted: $('wanted'),
    clock: $('clock'),
    healthfill: $('healthfill'),
    carbar: $('carbar'),
    carfill: $('carfill'),
    objTitle: $('obj-title'),
    objText: $('obj-text'),
    objDist: $('obj-dist'),
    speedo: $('speedo'),
    ammo: $('ammo'),
    crosshair: $('crosshair'),
    toast: $('toast'),
    subtoast: $('subtoast'),
    hint: $('hint'),
    vignette: $('vignette'),
    minimap: $('minimap'),
    menuStart: $('menu-start'),
    menuPause: $('menu-pause'),
    menuEnd: $('menu-end'),
    endTitle: $('end-title'),
    endSub: $('end-sub'),
    btnContinue: $('btn-continue'),
    pauseInfo: $('pause-info'),
  };
  const mapCtx = el.minimap.getContext('2d');
  let toastTimer = null;
  let lastClock = '';

  function toast(title, sub) {
    el.toast.textContent = title;
    el.toast.style.display = 'block';
    el.subtoast.textContent = sub || '';
    el.subtoast.style.display = sub ? 'block' : 'none';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.style.display = 'none';
      el.subtoast.style.display = 'none';
    }, 4200);
  }

  function setObjective(title, text, dist) {
    el.objTitle.textContent = title;
    el.objText.textContent = text;
    el.objDist.textContent = dist !== undefined ? Math.round(dist) + ' m away' : '';
  }

  function setAmmo(text) {
    el.ammo.textContent = text;
  }

  function showMenu(name) {
    el.menuStart.classList.toggle('hidden', name !== 'start');
    el.menuPause.classList.toggle('hidden', name !== 'pause');
    el.menuEnd.classList.toggle('hidden', name !== 'end');
    el.hud.classList.toggle('hidden', name !== 'playing');
    if (name === 'start') {
      el.btnContinue.style.display = G.hasSave() ? 'block' : 'none';
    }
    if (name === 'pause') {
      el.pauseInfo.innerHTML =
        `Cash $${G.state.cash.toLocaleString()} &nbsp;·&nbsp; Missions done ${G.state.missionsDone} / 4` +
        ` &nbsp;·&nbsp; Cars stolen ${G.state.carsStolen || 0}`;
    }
  }

  function showEnd(kind, lost) {
    el.endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    el.endTitle.style.color = kind === 'busted' ? '#6fb7ff' : '#ff5a5a';
    el.endSub.textContent = kind === 'busted'
      ? `The SBPD took $${lost} off you. You wake up at the Safehouse.`
      : `You flatlined. The medics took $${lost} and dropped you at the Safehouse.`;
    showMenu('end');
  }

  function update() {
    const s = G.state;
    el.cash.textContent = '$' + s.cash.toLocaleString();
    // wanted stars, five slots, filled up to the current level
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < s.wanted ? '★' : '☆';
    el.wanted.textContent = stars;
    el.wanted.classList.toggle('hot', s.wanted >= 5);
    // in-game clock, HH:MM, only rewritten when it changes
    const mins = Math.floor(s.clockMinutes) % (24 * 60);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    const clockStr = `${hh}:${mm}`;
    if (clockStr !== lastClock) {
      el.clock.textContent = clockStr;
      lastClock = clockStr;
    }
    // health bar, green → amber → red
    el.healthfill.style.width = clamp(s.health, 0, 100) + '%';
    el.healthfill.style.background = s.health > 50
      ? 'linear-gradient(90deg,#37d67a,#a5f2c0)'
      : s.health > 25
        ? 'linear-gradient(90deg,#e8a020,#ffd23e)'
        : 'linear-gradient(90deg,#d23b2e,#ff7a5a)';
    el.vignette.classList.toggle('hurt', s.health < 30);
    // car health bar + speedometer only while driving
    const car = G.player.car;
    el.carbar.classList.toggle('hidden', !car);
    if (car) el.carfill.style.width = clamp(car.health, 0, 100) + '%';
    el.speedo.classList.toggle('hidden', !car);
    if (car) {
      el.speedo.innerHTML = Math.round(Math.abs(car.speed) * 2.237) + ' <small>MPH</small>';
    }
    el.ammo.classList.toggle('hidden', !!car);
    el.crosshair.style.display = !car && s.mode === 'playing' ? 'block' : 'none';
    drawMinimap();
  }

  function drawMinimap() {
    const S = MAP_SIZE;
    const C = S / 2;
    const scale = S / (CITY_HALF * 2 + 90);
    const toMap = (x, z) => [C + (x - 20) * scale, C + z * scale];
    mapCtx.clearRect(0, 0, S, S);
    // sea, then sand, then the city slab
    mapCtx.fillStyle = '#1e7fa8';
    mapCtx.fillRect(0, 0, S, S);
    const [bx] = toMap(BEACH_X, 0);
    mapCtx.fillStyle = '#e8cf9e';
    mapCtx.fillRect(bx, 0, S - bx, S);
    mapCtx.fillStyle = '#3a4046';
    const [x0, y0] = toMap(-CITY_HALF - 10, -CITY_HALF - 10);
    const [x1, y1] = toMap(CITY_HALF, CITY_HALF + 10);
    mapCtx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // roads
    mapCtx.strokeStyle = '#6a7076';
    mapCtx.lineWidth = 2;
    for (const l of ROAD_GRID) {
      const [rx] = toMap(l, 0);
      const [, rz] = toMap(0, l);
      mapCtx.beginPath(); mapCtx.moveTo(rx, y0); mapCtx.lineTo(rx, y1); mapCtx.stroke();
      mapCtx.beginPath(); mapCtx.moveTo(x0, rz); mapCtx.lineTo(x1, rz); mapCtx.stroke();
    }
    // buildings
    mapCtx.fillStyle = '#9aa0a8';
    for (const b of G.city.buildings) {
      const [mx, my] = toMap(b.x - b.w / 2, b.z - b.d / 2);
      mapCtx.fillRect(mx, my, Math.max(1.5, b.w * scale), Math.max(1.5, b.d * scale));
    }
    // park
    mapCtx.fillStyle = '#4e9a44';
    const [px, py] = toMap(-98, -98);
    mapCtx.fillRect(px, py, 40 * scale, 40 * scale);
    // current mission marker, pulsing
    if (G.missions && G.state.missionIndex < 4) {
      const m = G.missions.MISSIONS[G.state.missionIndex];
      if (m) {
        const t = m.target();
        const [mx, my] = toMap(t.x, t.z);
        mapCtx.fillStyle = '#ffd23e';
        mapCtx.beginPath(); mapCtx.arc(mx, my, 5, 0, Math.PI * 2); mapCtx.fill();
        mapCtx.strokeStyle = '#ffd23e';
        mapCtx.lineWidth = 2;
        mapCtx.beginPath();
        mapCtx.arc(mx, my, 8 + Math.sin(G.time * 4) * 2, 0, Math.PI * 2);
        mapCtx.stroke();
      }
    }
    // safehouse marker
    const [sx, sy] = toMap(G.city.safehousePos.x, G.city.safehousePos.z);
    mapCtx.fillStyle = '#7dff9a';
    mapCtx.font = 'bold 13px sans-serif';
    mapCtx.fillText('H', sx - 4, sy + 5);
    // police units
    mapCtx.fillStyle = '#4a90ff';
    for (const u of G.police.units) {
      const [mx, my] = toMap(u.pos.x, u.pos.z);
      mapCtx.beginPath(); mapCtx.arc(mx, my, 3, 0, Math.PI * 2); mapCtx.fill();
    }
    // traffic as faint dots
    mapCtx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const c of G.vehicles.traffic) {
      const [mx, my] = toMap(c.pos.x, c.pos.z);
      mapCtx.fillRect(mx - 1, my - 1, 2, 2);
    }
    // player arrow, rotated to face the way the player (or their car) faces
    const [plx, ply] = toMap(G.player.pos.x, G.player.pos.z);
    const ang = G.player.car ? G.player.car.angle : G.player.angle;
    const mapAng = G.player.car ? Math.PI / 2 - ang : -ang;
    mapCtx.save();
    mapCtx.translate(plx, ply);
    mapCtx.rotate(mapAng);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.strokeStyle = '#000';
    mapCtx.lineWidth = 1;
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7);
    mapCtx.lineTo(5, 5);
    mapCtx.lineTo(-5, 5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.stroke();
    mapCtx.restore();
  }

  return { toast, setObjective, setAmmo, showMenu, showEnd, update, el };
}
