// Solmar Bay — procedural coastal city. Original layout, names and art.
// Road grid, buildings with drawn facades, park, beach, pier, palms, lamps.
import * as THREE from 'three';
import { mulberry32, randRange, pick, clamp, facadeTexture, roadTexture, sandTexture, waterTexture, grassTexture } from './util.js';

export const ROAD_LINES = [-156, -104, -52, 0, 52, 104, 156];
export const CITY_HALF = 190;      // half-size of the built city
export const WORLD_HALF = 340;     // walkable/drivable clamp (ocean edge at +x)
export const BEACH_X = 196;        // sand starts here
export const OCEAN_X = 236;        // water starts here

const PALETTE = ['#c96f4a', '#d9a05b', '#7fa8c9', '#a8b8a0', '#c9b458', '#9a7fb8', '#e0d6c2', '#6f9a8a', '#b8576a', '#5b7fa8'];
const ACCENTS = ['#2e6f8e', '#b3541e', '#3d7a4a', '#8e2e5b', '#d9a520'];

function box(w, h, d, color, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  return m;
}

export function createCity(scene, seed) {
  const rng = mulberry32(seed);
  const colliders = [];   // {x, z, hw, hd} axis-aligned boxes
  const buildings = [];   // {x, z, w, d, h} for the minimap
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  // --- sky, light, fog ---
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc8e8, 220, 700);
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1));
  const amb = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(amb);

  // --- ground base (concrete) ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshLambertMaterial({ color: 0x9aa0a3 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(40, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // --- roads ---
  const roadTex = roadTexture();
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  for (const line of ROAD_LINES) {
    for (const horizontal of [true, false]) {
      const len = 380;
      const tex = roadTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(len / 24, 1);
      const road = new THREE.Mesh(new THREE.PlaneGeometry(len, 12), new THREE.MeshLambertMaterial({ map: tex }));
      road.rotation.x = -Math.PI / 2;
      if (horizontal) { road.rotation.z = Math.PI / 2; road.position.set(0, 0.02, line); }
      else road.position.set(line, 0.02, 0);
      road.receiveShadow = true;
      group.add(road);
    }
  }

  // --- block pads + buildings ---
  const blockCenters = [];
  for (let i = 0; i < ROAD_LINES.length - 1; i++) blockCenters.push((ROAD_LINES[i] + ROAD_LINES[i + 1]) / 2);
  const parkBlock = { x: -78, z: -78 };
  const safeBlock = { x: 130, z: 130 };
  const garageBlock = { x: 130, z: -130 };
  const padMat = new THREE.MeshLambertMaterial({ color: 0xb9b3a4 });
  const grassTex = grassTexture();
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(6, 6);
  const parkMat = new THREE.MeshLambertMaterial({ map: grassTex });

  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      const isPark = bx === parkBlock.x && bz === parkBlock.z;
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), isPark ? parkMat : padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(bx, 0.03, bz);
      pad.receiveShadow = true;
      group.add(pad);
      if (isPark) { buildPark(group, bx, bz, rng, colliders); continue; }
      // 1–3 buildings per block, leaving a plaza gap
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const w = randRange(rng, 10, 16), d = randRange(rng, 10, 16);
        const h = randRange(rng, 9, 38) * (rng() < 0.18 ? 1.6 : 1);
        const ox = (k % 2 === 0 ? -9 : 9) + randRange(rng, -2, 2);
        const oz = (k < 2 ? -9 : 9) + randRange(rng, -2, 2);
        const x = bx + ox, z = bz + oz;
        const isSafe = bx === safeBlock.x && bz === safeBlock.z && k === 0;
        const isGarage = bx === garageBlock.x && bz === garageBlock.z && k === 0;
        const height = isSafe ? 7 : isGarage ? 9 : h;
        const tex = facadeTexture(rng, isSafe ? '#e8dcc0' : pick(rng, PALETTE), pick(rng, ACCENTS));
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        const side = new THREE.MeshLambertMaterial({ map: tex });
        const top = new THREE.MeshLambertMaterial({ color: 0x6a6f75 });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, height, d),
          [side, side, top, top, side, side]);
        b.position.set(x, height / 2, z);
        b.castShadow = true; b.receiveShadow = true;
        group.add(b);
        // rooftop box (AC / stairwell)
        if (height > 14) {
          const roof = box(4, 2.5, 4, 0x8a8f94, x + w / 5, height + 1.2, z - d / 5);
          group.add(roof);
        }
        colliders.push({ x, z, hw: w / 2, hd: d / 2 });
        buildings.push({ x, z, w, d, h: height });
        if (isSafe) group.add(makeSign(group, 'SAFEHOUSE', x, height + 2.5, z));
        if (isGarage) group.add(makeSign(group, 'GARAGE', x, height + 2.5, z));
      }
    }
  }

  // --- beach + ocean ---
  const sandTex = sandTexture();
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.repeat.set(10, 10);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(160, 760), new THREE.MeshLambertMaterial({ map: sandTex }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(BEACH_X + 80, 0.01, 0);
  sand.receiveShadow = true;
  group.add(sand);
  const watTex = waterTexture();
  watTex.wrapS = watTex.wrapT = THREE.RepeatWrapping;
  watTex.repeat.set(24, 24);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(420, 760), new THREE.MeshLambertMaterial({ map: watTex }));
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(OCEAN_X + 210, 0.0, 0);
  ocean.name = 'ocean';
  group.add(ocean);
  // boardwalk strip along the beach
  const board = box(14, 0.4, 380, 0x8a6a42, BEACH_X - 4, 0.2, 0);
  board.receiveShadow = true;
  group.add(board);

  // --- pier (z = 0, out into the ocean) ---
  const pier = new THREE.Group();
  pier.position.set(0, 0, 0);
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x9a7448 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(90, 1.2, 10), deckMat);
  deck.position.set(OCEAN_X + 42, 0.9, 0);
  deck.castShadow = true; deck.receiveShadow = true;
  pier.add(deck);
  for (let x = OCEAN_X + 4; x < OCEAN_X + 86; x += 9) {
    for (const dz of [-4.4, 4.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.6, 8), new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
      post.position.set(x, -0.6, dz);
      pier.add(post);
    }
  }
  // pier rails + end hut
  for (const dz of [-4.8, 4.8]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(90, 0.5, 0.3), deckMat);
    rail.position.set(OCEAN_X + 42, 2.1, dz);
    pier.add(rail);
  }
  const hut = box(8, 5, 7, 0xd9a05b, OCEAN_X + 78, 2.5 + 0.7, 0);
  hut.castShadow = true;
  pier.add(hut);
  pier.add(makeSign(pier, 'PIER 7', OCEAN_X + 78, 6.4, 0));
  group.add(pier);

  // --- palms along beach, park and streets ---
  const palmPositions = [];
  for (let z = -170; z <= 170; z += 34) palmPositions.push([BEACH_X + 26, z + randRange(rng, -6, 6)]);
  for (let i = 0; i < 10; i++) palmPositions.push([parkBlock.x + randRange(rng, -16, 16), parkBlock.z + randRange(rng, -16, 16)]);
  for (let i = 0; i < 14; i++) palmPositions.push([pick(rng, ROAD_LINES) + 8, randRange(rng, -170, 170)]);
  for (const [px, pz] of palmPositions) group.add(makePalm(rng, px, pz));

  // --- street lamps along roads ---
  for (const line of ROAD_LINES) {
    for (let t = -170; t <= 170; t += 52) {
      group.add(makeLamp(line + 7.5, t));
      group.add(makeLamp(t, line + 7.5));
    }
  }

  // --- clouds ---
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(randRange(rng, 6, 12), 8, 6), cloudMat);
      s.position.set(k * 9 - 14 + randRange(rng, -3, 3), randRange(rng, -1, 1), randRange(rng, -4, 4));
      s.scale.y = 0.45;
      c.add(s);
    }
    c.position.set(randRange(rng, -260, 260), randRange(rng, 70, 110), randRange(rng, -260, 260));
    group.add(c);
  }

  return {
    group, colliders, buildings,
    safehousePos: new THREE.Vector3(safeBlock.x, 0, safeBlock.z + 24),
    garagePos: new THREE.Vector3(garageBlock.x, 0, garageBlock.z + 24),
    pierPos: new THREE.Vector3(OCEAN_X + 78, 0, 0),
    parkPos: new THREE.Vector3(parkBlock.x, 0, parkBlock.z),
    spawnPos: new THREE.Vector3(-26, 0, 26),
    veraPos: new THREE.Vector3(OCEAN_X - 14, 0, 0),
  };
}

function makeSign(parent, text, x, y, z) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#10233a'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#ffd23e'; g.font = 'bold 34px Verdana, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  m.position.set(x, y, z);
  return m;
}

function buildPark(group, bx, bz, rng, colliders) {
  // pond
  const pond = new THREE.Mesh(new THREE.CircleGeometry(7, 24), new THREE.MeshLambertMaterial({ color: 0x2e7fa8 }));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(bx + 6, 0.05, bz - 5);
  group.add(pond);
  // trees (round canopy)
  for (let i = 0; i < 8; i++) {
    const x = bx + randRange(rng, -17, 17), z = bz + randRange(rng, -17, 17);
    if (Math.hypot(x - (bx + 6), z - (bz - 5)) < 9) continue;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 3, 8), new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
    trunk.position.set(x, 1.5, z);
    const top = new THREE.Mesh(new THREE.SphereGeometry(randRange(rng, 2.2, 3.4), 10, 8), new THREE.MeshLambertMaterial({ color: 0x2e7a34 }));
    top.position.set(x, 4.4, z);
    top.castShadow = true;
    group.add(trunk); group.add(top);
    colliders.push({ x, z, hw: 0.6, hd: 0.6 });
  }
  // benches
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 1), new THREE.MeshLambertMaterial({ color: 0x8a5a2a }));
    b.position.set(bx - 12 + i * 8, 0.6, bz + 12);
    group.add(b);
  }
  // fountain centre
  const f = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, 1, 16), new THREE.MeshLambertMaterial({ color: 0xd8d2c0 }));
  f.position.set(bx - 8, 0.5, bz + 2);
  group.add(f);
}

function makePalm(rng, x, z) {
  const g = new THREE.Group();
  const h = randRange(rng, 5, 8);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, h, 8), new THREE.MeshLambertMaterial({ color: 0x7a5a34 }));
  trunk.position.y = h / 2;
  trunk.rotation.z = randRange(rng, -0.08, 0.08);
  trunk.castShadow = true;
  g.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8a3e, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), leafMat);
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.5, h + 0.35, Math.sin(a) * 1.5);
    leaf.rotation.y = -a + Math.PI / 2;
    leaf.rotateX(-0.85); // droop outward
    g.add(leaf);
  }
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
  nut.position.y = h - 0.2;
  g.add(nut);
  g.position.set(x, 0, z);
  return g;
}

function makeLamp(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 8), new THREE.MeshLambertMaterial({ color: 0x2a2f36 }));
  pole.position.y = 3;
  g.add(pole);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  head.position.y = 6.1;
  g.add(head);
  g.position.set(x, 0, z);
  return g;
}

// Point-vs-AABB collision: push a circle of radius r out of every collider.
export function collideCircle(colliders, pos, r) {
  for (const c of colliders) {
    const dx = pos.x - clamp(pos.x, c.x - c.hw, c.x + c.hw);
    const dz = pos.z - clamp(pos.z, c.z - c.hd, c.z + c.hd);
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x += (dx / d) * (r - d);
      pos.z += (dz / d) * (r - d);
    } else if (d2 <= 0.0001) {
      pos.x += r; // centre inside box: shove out on +x
    }
  }
}

export function onRoad(x, z) {
  const near = (v) => ROAD_LINES.some((l) => Math.abs(v - l) < 7);
  return near(x) || near(z);
}
export function clampToWorld(pos) {
  pos.x = clamp(pos.x, -CITY_HALF - 10, WORLD_HALF);
  pos.z = clamp(pos.z, -CITY_HALF - 10, CITY_HALF + 10);
}
