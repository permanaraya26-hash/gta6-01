// Staged screenshot scenes for Solmar Bay. ?shot=cover|foot|mission|start
// arranges a real, playable game state and points the camera — the
// screenshots are renders of the game itself, never composites.

export function applyShot(G, name) {
  const P = G.player;

  function frameCamera(x, y, z, lookX, lookY, lookZ, dist) {
    G.camYaw = Math.atan2(-(lookX - x), -(lookZ - z));
    G.camPitch = 0.32;
    G.camDist = dist ?? (Math.hypot(x - P.pos.x, z - P.pos.z) || 12);
    G.camPos.set(x, y, z);
    G.camLook.set(lookX, lookY, lookZ);
  }

  if (name === 'start') {
    // title screen with the camera slowly orbiting the city
    G.state.mode = 'menu';
    G.hud.showMenu('start');
    G.shotOrbit = true;
    return 'start';
  }

  // every gameplay shot: HUD on, menus off, playing state
  G.state.mode = 'playing';
  G.hud.showMenu('playing');
  G.audio.setMuted(true);

  if (name === 'cover') {
    // police chase: Rico in a red Comet GT at speed, 3 stars, SBPD behind
    const car = G.vehicles.makeCar(52, 0, 0, { name: 'Comet GT', color: 0xd23b2e });
    G.player.car = car;
    car.isPlayer = true;
    car.speed = 30;
    P.mesh.group.visible = false;
    G.state.wanted = 3;
    G.state.cash = 4820;
    G.state.health = 82;
    G.state.clockMinutes = 17 * 60 + 24;
    G.missions.startMission(3);
    const tail = G.police.spawnUnit();
    tail.pos.set(30, 0, 2);
    tail.angle = 0;
    tail.speed = 28;
    const headOn = G.police.spawnUnit();
    headOn.pos.set(88, 0, -3);
    headOn.angle = Math.PI;
    headOn.speed = 24;
    G.vehicles.spawnTrafficCar();
    frameCamera(52 - 14, 7, 12, 52, 1.5, 0, 15);
    return 'cover';
  }

  if (name === 'foot') {
    // Rico on foot in a plaza, a pedestrian and a parked car nearby
    P.pos.set(-70, 0, -60);
    P.angle = Math.PI * 0.75;
    G.state.cash = 1250;
    G.state.clockMinutes = 9 * 60 + 40;
    G.missions.startMission(1);
    const ped = G.peds.list[0];
    ped.pos.set(-64, 0, -58);
    const parked = G.vehicles.makeCar(-52, -40, 0, { name: 'Palm Runner', color: 0xe8c832 });
    parked.speed = 0;
    frameCamera(-70 - 9, 5, -60 + 9, -70, 1.5, -60, 13);
    return 'foot';
  }

  if (name === 'mission') {
    // mission 2: package pickup on Pier 7, a police car in the distance
    G.state.missionIndex = 2;
    G.missions.startMission(2);
    P.pos.set(246, 0, 9);
    P.angle = -Math.PI / 2 - 0.35;
    G.state.cash = 3120;
    G.state.wanted = 1;
    G.state.clockMinutes = 15 * 60 + 5;
    const patrol = G.police.spawnUnit();
    patrol.pos.set(190, 0, 24);
    patrol.angle = Math.PI / 2;
    patrol.speed = 12;
    // camera on the boardwalk, looking east along the pier at the package
    G.camYaw = Math.atan2(-(262 - 236), -(0 - 16));
    G.camPitch = 0.3;
    G.camDist = 15;
    G.camPos.set(236, 6, 16);
    G.camLook.set(262, 1, 0);
    return 'mission';
  }

  return null;
}
