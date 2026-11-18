// Staged scenes for real screenshots (?shot=cover|foot|mission|start).
// Each one drives the real game into a state that shows its systems at their best,
// then the screenshot is taken from the live render — nothing is faked.
export function stageShot(name, game) {
  const g = game;
  if (name === 'start') {
    g.state = 'menu';
    g.showStartMenu();
    return;
  }
  g.hideMenus();
  g.state = 'playing';
  g.elapsed = 3600; // 13:00, golden afternoon light in the HUD clock
  g.stagedDrive = false;
  const p = g.player;

  if (name === 'cover') {
    // Police chase: Rico driving north through downtown, 3 stars, SBPD on his tail,
    // mission 2 (the Pier Drop) active with a package marker ahead.
    g.missions.startMission(1);
    g.cash = 1240;
    g.stagedDrive = true;
    const car = g.parkedCars[0];
    g.enterCar(car, true);
    car.pos.set(0, 0, 62);
    car.heading = Math.PI; // north, into the city
    car.speed = 22;
    p.camYaw = Math.PI;
    p.camPitch = 0.24;
    p.camDist = 12;
    g.police.setHeat(55); // 3 stars
    g.police.update(0.01, g); // spawn the pursuit units
    g.police.cars.forEach((c, i) => {
      // behind the player car but clear of the chase camera
      c.pos.set((i % 2 === 0 ? -4.5 : 4.5), 0, 62 + 24 + i * 10);
      c.heading = Math.PI;
      c.speed = 22;
      c.syncMesh();
    });
    // one SBPD unit comes at the player head-on, down the same avenue
    if (g.police.cars[0]) {
      const lead = g.police.cars[0];
      lead.pos.set(-4, 0, 62 - 75);
      lead.heading = 0;
      lead.speed = 20;
      lead.syncMesh();
    }
    // the mission banner has served its purpose in the staged shot
    g.hud.msgTimer = 0; g.hud.msgEl.textContent = ''; g.hud.subEl.textContent = '';
    // traffic ahead for depth
    g.trafficCars.slice(0, 3).forEach((c, i) => {
      c.pos.set(i === 0 ? -4 : 4, 0, 62 - 34 - i * 12);
      c.heading = Math.PI;
      c.speed = 10;
      c.syncMesh();
    });
  } else if (name === 'foot') {
    // On foot downtown by Palm Court Park: pedestrians, traffic, garage marker.
    g.missions.startMission(0);
    g.cash = 120;
    p.pos.set(-31, 0, 8);
    p.heading = Math.PI * 0.15;
    p.camYaw = Math.PI * 0.9;
    p.camPitch = 0.3;
    p.camDist = 9;
    g.peds.slice(0, 6).forEach((ped, i) => {
      ped.pos.set(-31 + (i - 3) * 7, 0, 8 + (i % 2 ? 22 : -20));
      ped.heading = i % 2 ? 0 : Math.PI;
    });
    g.trafficCars.slice(0, 4).forEach((c, i) => {
      c.pos.set(-62 + i * 2, 0, 31 - 30 + i * 16);
      c.axis = 'z'; c.dir = 1; c.heading = 0; c.speed = 9;
      c.syncMesh();
    });
    g.hud.msgTimer = 0; g.hud.msgEl.textContent = ''; g.hud.subEl.textContent = '';
  } else if (name === 'mission') {
    // The Pier Drop pickup: Rico on foot at the Marina Plaza package, the yellow
    // marker beam above it, traffic and the city behind him.
    g.missions.startMission(1);
    g.cash = 890;
    p.pos.set(112, 0, 78);
    p.heading = 2.5; // facing the package at the intersection ahead
    p.camYaw = Math.PI - 0.25;
    p.camPitch = 0.38;
    p.camDist = 11;
    g.peds.slice(0, 5).forEach((ped, i) => {
      ped.pos.set(112 + (i - 2) * 7, 0, 78 + (i % 2 ? 20 : -18));
      ped.heading = i % 2 ? 0 : Math.PI;
    });
    g.trafficCars.slice(0, 3).forEach((c, i) => {
      c.pos.set(62 - 44 + i * 22, 0, 58 + i * 2);
      c.axis = 'x'; c.dir = 1; c.heading = Math.PI / 2; c.speed = 9;
      c.syncMesh();
    });
    g.police.setHeat(12); // 1 star, one unit in the distance
    g.police.update(0.01, g);
    if (g.police.cars[0]) {
      g.police.cars[0].pos.set(130, 0, 14);
      g.police.cars[0].heading = 0;
      g.police.cars[0].speed = 12;
      g.police.cars[0].syncMesh();
    }
    g.hud.msgTimer = 0; g.hud.msgEl.textContent = ''; g.hud.subEl.textContent = '';
  }
}
