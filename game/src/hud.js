// HUD: cash, health, wanted stars, clock, objective, minimap, speedo, messages.
export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.cashEl = this.el('cash');
    this.healthEl = this.el('healthBar');
    this.armorEl = this.el('armorBar');
    this.starsEl = this.el('stars');
    this.clockEl = this.el('clock');
    this.objTitle = this.el('objectiveTitle');
    this.objText = this.el('objectiveText');
    this.objDist = this.el('objectiveDist');
    this.msgEl = this.el('message');
    this.subEl = this.el('subMessage');
    this.speedo = this.el('speedo');
    this.speedVal = this.el('speedVal');
    this.carName = this.el('carName');
    this.hintEl = this.el('hint');
    this.ammoEl = this.el('ammo');
    this.crossEl = this.el('crosshair');
    this.wastedEl = this.el('wasted');
    this.wastedTitle = this.el('wastedTitle');
    this.wastedText = this.el('wastedText');
    this.map = this.el('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.msgTimer = 0;
    this.mapFlash = 0;
  }

  showMessage(text, sub = '', dur = 3) {
    this.msgEl.textContent = text;
    this.subEl.textContent = sub;
    this.msgTimer = dur;
  }

  flashAmmo() { this.ammoEl.style.color = '#ffe27a'; setTimeout(() => { this.ammoEl.style.color = ''; }, 300); }

  showWasted(title, text) {
    this.wastedTitle.textContent = title;
    this.wastedText.textContent = text;
    this.wastedEl.classList.remove('hidden');
  }

  hideWasted() { this.wastedEl.classList.add('hidden'); }

  update(game, dt) {
    this.cashEl.innerHTML = `$${game.cash.toLocaleString('en-US')} <small>SOLMAR BAY</small>`;
    this.healthEl.style.width = `${Math.max(0, game.health)}%`;
    const carHealth = game.currentCar ? game.currentCar.health : 0;
    this.armorEl.style.width = `${carHealth}%`;
    // stars
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < game.police.stars ? '★' : '<span class="off">★</span>';
    this.starsEl.innerHTML = stars;
    // clock: 12:00 + 1 game-hour per 2 real minutes
    const mins = 12 * 60 + Math.floor(game.elapsed * 0.5);
    const hh = Math.floor(mins / 60) % 24;
    const mm = mins % 60;
    this.clockEl.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    // objective
    const obj = game.missions.objectiveText();
    this.objTitle.textContent = obj.title;
    this.objText.textContent = obj.text;
    this.objDist.textContent = obj.dist != null ? `${obj.dist} m` : '';
    // message fade
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) { this.msgEl.textContent = ''; this.subEl.textContent = ''; }
    }
    // speedo / ammo / crosshair
    if (game.currentCar) {
      this.speedo.classList.remove('hidden');
      this.speedVal.textContent = Math.round(Math.abs(game.currentCar.speed) * 2.2);
      this.carName.textContent = `${game.currentCar.name} · ${Math.round(game.currentCar.health)}%`;
      this.hintEl.innerHTML = '<b>E</b> exit car · <b>Space</b> handbrake';
      this.ammoEl.classList.add('hidden');
      this.crossEl.classList.add('hidden');
    } else {
      this.speedo.classList.add('hidden');
      this.hintEl.innerHTML = '<b>E</b> enter car · <b>F</b> punch · <b>Click</b> shoot · <b>1/2</b> weapon';
      if (game.combat.weapon === 'pistol') {
        this.ammoEl.classList.remove('hidden');
        this.ammoEl.textContent = game.combat.reloadTimer > 0 ? 'RELOADING…' : `PISTOL · ${game.combat.ammo} / ${game.combat.magSize}`;
        this.crossEl.classList.remove('hidden');
      } else {
        this.ammoEl.classList.add('hidden');
        this.crossEl.classList.add('hidden');
      }
    }
    this.drawMinimap(game);
  }

  drawMinimap(game) {
    const ctx = this.mapCtx;
    const S = 200, MIN = -245, MAX = 265, span = MAX - MIN;
    const px = (x) => ((x - MIN) / span) * S;
    const py = (z) => ((z - MIN) / span) * S;
    ctx.fillStyle = '#0e2a3a';
    ctx.fillRect(0, 0, S, S);
    // ocean + sand at the south
    ctx.fillStyle = '#1e7fa8';
    ctx.fillRect(0, py(210), S, S - py(210));
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(0, py(196), S, py(210) - py(196));
    // ground
    ctx.fillStyle = '#3d4a3a';
    ctx.fillRect(0, 0, S, py(196));
    // park
    ctx.fillStyle = '#5da24a';
    ctx.fillRect(px(-53), py(-53), px(9) - px(-53), py(9) - py(-53));
    // roads
    ctx.strokeStyle = '#20242c';
    ctx.lineWidth = 7;
    for (const r of game.city.roadLines) {
      ctx.beginPath(); ctx.moveTo(px(-186), py(r)); ctx.lineTo(px(186), py(r)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px(r), py(-186)); ctx.lineTo(px(r), py(186)); ctx.stroke();
    }
    // buildings
    ctx.fillStyle = '#8a94a3';
    for (const b of game.city.buildings2d) {
      ctx.fillRect(px(b.x - b.w / 2), py(b.z - b.d / 2), (b.w / span) * S, (b.d / span) * S);
    }
    // mission target (pulsing)
    const target = game.missions.currentTarget();
    if (target) {
      this.mapFlash += 0.08;
      const r = 5 + Math.sin(this.mapFlash) * 2;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(px(target.x), py(target.z), r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px(target.x), py(target.z), r + 3, 0, Math.PI * 2); ctx.stroke();
    }
    // traffic dots
    ctx.fillStyle = '#c8c8c8';
    for (const c of game.trafficCars) {
      ctx.fillRect(px(c.pos.x) - 1.5, py(c.pos.z) - 1.5, 3, 3);
    }
    // police (flashing)
    const flash = Math.floor(performance.now() / 300) % 2 === 0;
    ctx.fillStyle = flash ? '#ff4040' : '#4080ff';
    for (const c of game.police.cars) {
      ctx.beginPath(); ctx.arc(px(c.pos.x), py(c.pos.z), 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#4080ff';
    for (const c of game.police.cops) {
      ctx.beginPath(); ctx.arc(px(c.pos.x), py(c.pos.z), 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // player arrow
    const p = game.playerPos();
    const heading = game.currentCar ? game.currentCar.heading : game.player.heading;
    ctx.save();
    ctx.translate(px(p.x), py(p.z));
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
