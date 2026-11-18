// Solmar Bay — the coastal city, built from scratch in code.
// Seven avenues each way, tower blocks, a park, a beach, a pier and
// a sky full of drifting cloud. Nothing here is borrowed: the layout,
// the names and the textures are all original to this game.
import * as THREE from 'three';
import {
  mulberry32, randRange, pick, clamp,
  facadeTexture, roadTexture, sandTexture, waterTexture, grassTexture,
} from './util.js';

// Grid lines the avenues run on, and the edges of the playable world.
export const ROAD_LINES = [-156, -104, -52, 0, 52, 104, 156];
export const CITY_HALF = 190;
export const WORLD_HALF = 340;
export const BEACH_X = 196;
export const OCEAN_X = 236;

// Facade and trim palettes for the tower blocks.
const FACADE_TONES = ['#c96f4a', '#d9a05b', '#7fa8c9', '#a8b8a0', '#c9b458', '#9a7fb8', '#e0d6c2', '#6f9a8a', '#b8576a', '#5b7fa8'];
const ACCENT_TONES = ['#2e6f8e', '#b3541e', '#3d7a4a', '#8e2e5b', '#d9a520'];

// One solid box, dropped at the given spot. `mat` overrides the colour.
function solidBox(w, h, d, colour, x, y, z, mat) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    mat || new THREE.MeshLambertMaterial({ color: colour }),
  );
  m.position.set(x, y, z);
  return m;
}

// Give a texture tiled wrapping with the given repeat.
function wrapRepeat(tex, rx, ry) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  return tex;
}

export function createCity(scene, seed) {
  const rnd = mulberry32(seed);
  const walls = [];
  const footprints = [];
  const root = new THREE.Group();
  root.name = 'city';
  scene.add(root);

  skyAndLights(scene);
  baseSlab(root);
  roadStrips(root);
  cityBlocks(root, rnd, walls, footprints);
  coastline(root);
  pierWalk(root);
  palmRows(root, rnd);
  lampRows(root);
  cloudDrift(root, rnd);

  return {
    group: root,
    colliders: walls,
    buildings: footprints,
    safehousePos: new THREE.Vector3(130, 0, 130 + 24),
    garagePos: new THREE.Vector3(130, 0, -130 + 24),
    pierPos: new THREE.Vector3(OCEAN_X + 78, 0, 0),
    parkPos: new THREE.Vector3(-78, 0, -78),
    spawnPos: new THREE.Vector3(-26, 0, 26),
    veraPos: new THREE.Vector3(OCEAN_X - 14, 0, 0),
  };
}

// Sun, sky colour, fog and fill lights.
function skyAndLights(scene) {
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc8e8, 220, 700);
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1));
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
}

// The big grey slab everything sits on.
function baseSlab(root) {
  const slab = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshLambertMaterial({ color: 0x9aa0a3 }),
  );
  slab.rotation.x = -Math.PI / 2;
  slab.position.set(40, 0, 0);
  slab.receiveShadow = true;
  root.add(slab);
}

// One textured strip per avenue, both directions.
function roadStrips(root) {
  const tex = roadTexture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  for (const line of ROAD_LINES) {
    for (const alongZ of [true, false]) {
      const strip = tex.clone();
      strip.needsUpdate = true;
      strip.repeat.set(380 / 24, 1);
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(380, 12),
        new THREE.MeshLambertMaterial({ map: strip }),
      );
      road.rotation.x = -Math.PI / 2;
      if (alongZ) {
        road.rotation.z = Math.PI / 2;
        road.position.set(0, 0.02, line);
      } else {
        road.position.set(line, 0.02, 0);
      }
      road.receiveShadow = true;
      root.add(road);
    }
  }
}

// Tower blocks between the avenues, plus the park, safehouse and garage.
function cityBlocks(root, rnd, walls, footprints) {
  const mids = [];
  for (let i = 0; i < ROAD_LINES.length - 1; i++) {
    mids.push((ROAD_LINES[i] + ROAD_LINES[i + 1]) / 2);
  }
  const parkAt = { x: -78, z: -78 };
  const homeAt = { x: 130, z: 130 };
  const shopAt = { x: 130, z: -130 };
  const padMat = new THREE.MeshLambertMaterial({ color: 0xb9b3a4 });
  const lawn = wrapRepeat(grassTexture(), 6, 6);
  const parkMat = new THREE.MeshLambertMaterial({ map: lawn });

  for (const bx of mids) {
    for (const bz of mids) {
      const isPark = bx === parkAt.x && bz === parkAt.z;
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), isPark ? parkMat : padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(bx, 0.03, bz);
      pad.receiveShadow = true;
      root.add(pad);
      if (isPark) {
        parkPlot(root, bx, bz, rnd, walls);
        continue;
      }
      // One to three towers per block, with a plaza gap between them.
      const count = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < count; k++) {
        const w = randRange(rnd, 10, 16);
        const d = randRange(rnd, 10, 16);
        let h = randRange(rnd, 9, 38);
        if (rnd() < 0.18) h *= 1.6;
        const ox = (k % 2 === 0 ? -9 : 9) + randRange(rnd, -2, 2);
        const oz = (k < 2 ? -9 : 9) + randRange(rnd, -2, 2);
        const x = bx + ox;
        const z = bz + oz;
        const isHome = bx === homeAt.x && bz === homeAt.z && k === 0;
        const isShop = bx === shopAt.x && bz === shopAt.z && k === 0;
        const height = isHome ? 7 : isShop ? 9 : h;
        const skin = facadeTexture(rnd, isHome ? '#e8dcc0' : pick(rnd, FACADE_TONES), pick(rnd, ACCENT_TONES));
        skin.wrapS = skin.wrapT = THREE.RepeatWrapping;
        const side = new THREE.MeshLambertMaterial({ map: skin });
        const roof = new THREE.MeshLambertMaterial({ color: 0x6a6f75 });
        const tower = new THREE.Mesh(
          new THREE.BoxGeometry(w, height, d),
          [side, side, roof, roof, side, side],
        );
        tower.position.set(x, height / 2, z);
        tower.castShadow = true;
        tower.receiveShadow = true;
        root.add(tower);
        if (height > 14) {
          root.add(solidBox(4, 2.5, 4, 0x8a8f94, x + w / 5, height + 1.2, z - d / 5));
        }
        walls.push({ x, z, hw: w / 2, hd: d / 2 });
        footprints.push({ x, z, w, d, h: height });
        if (isHome) root.add(labelBoard('SAFEHOUSE', x, height + 2.5, z));
        if (isShop) root.add(labelBoard('GARAGE', x, height + 2.5, z));
      }
    }
  }
}

// Sand, ocean and the boardwalk where the city meets the sea.
function coastline(root) {
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 760),
    new THREE.MeshLambertMaterial({ map: wrapRepeat(sandTexture(), 10, 10) }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(BEACH_X + 80, 0.01, 0);
  sand.receiveShadow = true;
  root.add(sand);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 760),
    new THREE.MeshLambertMaterial({ map: wrapRepeat(waterTexture(), 24, 24) }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(OCEAN_X + 210, 0.0, 0);
  ocean.name = 'ocean';
  root.add(ocean);

  const walk = solidBox(14, 0.4, 380, 0x8a6a42, BEACH_X - 4, 0.2, 0);
  walk.receiveShadow = true;
  root.add(walk);
}

// The wooden pier jutting out over the water, with its hut and sign.
function pierWalk(root) {
  const pier = new THREE.Group();
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x9a7448 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(90, 1.2, 10), deckMat);
  deck.position.set(OCEAN_X + 42, 0.9, 0);
  deck.castShadow = true;
  deck.receiveShadow = true;
  pier.add(deck);
  for (let x = OCEAN_X + 4; x < OCEAN_X + 86; x += 9) {
    for (const dz of [-4.4, 4.4]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 2.6, 8),
        new THREE.MeshLambertMaterial({ color: 0x6a4a2a }),
      );
      post.position.set(x, -0.6, dz);
      pier.add(post);
    }
  }
  for (const dz of [-4.8, 4.8]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(90, 0.5, 0.3), deckMat);
    rail.position.set(OCEAN_X + 42, 2.1, dz);
    pier.add(rail);
  }
  const hut = solidBox(8, 5, 7, 0xd9a05b, OCEAN_X + 78, 2.5 + 0.7, 0);
  hut.castShadow = true;
  pier.add(hut);
  pier.add(labelBoard('PIER 7', OCEAN_X + 78, 6.4, 0));
  root.add(pier);
}

// Palms along the beach, in the park and beside the avenues.
function palmRows(root, rnd) {
  const spots = [];
  for (let z = -170; z <= 170; z += 34) {
    spots.push([BEACH_X + 26, z + randRange(rnd, -6, 6)]);
  }
  for (let i = 0; i < 10; i++) {
    spots.push([-78 + randRange(rnd, -16, 16), -78 + randRange(rnd, -16, 16)]);
  }
  for (let i = 0; i < 14; i++) {
    spots.push([pick(rnd, ROAD_LINES) + 8, randRange(rnd, -170, 170)]);
  }
  for (const [px, pz] of spots) root.add(palmTree(rnd, px, pz));
}

// A lamp at every avenue crossing.
function lampRows(root) {
  for (const line of ROAD_LINES) {
    for (let t = -170; t <= 170; t += 52) {
      root.add(streetLamp(line + 7.5, t));
      root.add(streetLamp(t, line + 7.5));
    }
  }
}

// Nine soft cloud clusters drifting high above the city.
function cloudDrift(root, rnd) {
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 9; i++) {
    const cloud = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(randRange(rnd, 6, 12), 8, 6), cloudMat);
      puff.position.set(k * 9 - 14 + randRange(rnd, -3, 3), randRange(rnd, -1, 1), randRange(rnd, -4, 4));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(randRange(rnd, -260, 260), randRange(rnd, 70, 110), randRange(rnd, -260, 260));
    root.add(cloud);
  }
}

// A floating text board drawn on a canvas (SAFEHOUSE / GARAGE / PIER 7).
function labelBoard(text, x, y, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#10233a';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 34px Verdana, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 3),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
  );
  board.position.set(x, y, z);
  return board;
}

// The park block: pond, trees, benches and a fountain.
function parkPlot(root, bx, bz, rnd, walls) {
  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(7, 24),
    new THREE.MeshLambertMaterial({ color: 0x2e7fa8 }),
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(bx + 6, 0.05, bz - 5);
  root.add(pond);
  for (let i = 0; i < 8; i++) {
    const x = bx + randRange(rnd, -17, 17);
    const z = bz + randRange(rnd, -17, 17);
    if (Math.hypot(x - (bx + 6), z - (bz - 5)) < 9) continue;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.5, 3, 8),
      new THREE.MeshLambertMaterial({ color: 0x6a4a2a }),
    );
    trunk.position.set(x, 1.5, z);
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(randRange(rnd, 2.2, 3.4), 10, 8),
      new THREE.MeshLambertMaterial({ color: 0x2e7a34 }),
    );
    canopy.position.set(x, 4.4, z);
    canopy.castShadow = true;
    root.add(trunk);
    root.add(canopy);
    walls.push({ x, z, hw: 0.6, hd: 0.6 });
  }
  for (let i = 0; i < 4; i++) {
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.5, 1),
      new THREE.MeshLambertMaterial({ color: 0x8a5a2a }),
    );
    bench.position.set(bx - 12 + i * 8, 0.6, bz + 12);
    root.add(bench);
  }
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 3, 1, 16),
    new THREE.MeshLambertMaterial({ color: 0xd8d2c0 }),
  );
  fountain.position.set(bx - 8, 0.5, bz + 2);
  root.add(fountain);
}

// One palm: leaning trunk, drooping fronds, a coconut on top.
function palmTree(rnd, x, z) {
  const palm = new THREE.Group();
  const height = randRange(rnd, 5, 8);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.4, height, 8),
    new THREE.MeshLambertMaterial({ color: 0x7a5a34 }),
  );
  trunk.position.y = height / 2;
  trunk.rotation.z = randRange(rnd, -0.08, 0.08);
  trunk.castShadow = true;
  palm.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8a3e, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), leafMat);
    const angle = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 1.5, height + 0.35, Math.sin(angle) * 1.5);
    leaf.rotation.y = -angle + Math.PI / 2;
    leaf.rotateX(-0.85);
    palm.add(leaf);
  }
  const nut = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x6a4a2a }),
  );
  nut.position.y = height - 0.2;
  palm.add(nut);
  palm.position.set(x, 0, z);
  return palm;
}

// One street lamp: dark pole, warm glowing bulb.
function streetLamp(x, z) {
  const lamp = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, 6, 8),
    new THREE.MeshLambertMaterial({ color: 0x2a2f36 }),
  );
  pole.position.y = 3;
  lamp.add(pole);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
  );
  bulb.position.y = 6.1;
  lamp.add(bulb);
  lamp.position.set(x, 0, z);
  return lamp;
}

// Push a circle of radius r out of every axis-aligned wall it overlaps.
export function collideCircle(walls, pos, r) {
  for (const c of walls) {
    const dx = pos.x - clamp(pos.x, c.x - c.hw, c.x + c.hw);
    const dz = pos.z - clamp(pos.z, c.z - c.hd, c.z + c.hd);
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x += (dx / d) * (r - d);
      pos.z += (dz / d) * (r - d);
    } else if (d2 <= 0.0001) {
      pos.x += r;
    }
  }
}

// True when (x, z) sits on a road — within 7 m of a grid line either way.
export function onRoad(x, z) {
  const nearLine = (v) => ROAD_LINES.some((l) => Math.abs(v - l) < 7);
  return nearLine(x) || nearLine(z);
}

export function clampToWorld(pos) {
  pos.x = clamp(pos.x, -CITY_HALF - 10, WORLD_HALF);
  pos.z = clamp(pos.z, -CITY_HALF - 10, CITY_HALF + 10);
}
