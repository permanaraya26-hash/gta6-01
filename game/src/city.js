// Solmar Bay — the city itself: roads, buildings, park, beach, pier, palms.
// Written from scratch for this entry: a sun-soaked modern city on a road
// grid, with a park, a beach and a pier reaching east into the ocean.
import * as THREE from 'three';
import {
  mulberry32, randRange, pick,
  facadeTexture, roadTexture, sandTexture, waterTexture, grassTexture,
} from './util.js';

export const CITY_HALF = 195;
export const BEACH_X = 205;
export const OCEAN_X = 232;
// North-south road centre lines; the same set doubles as the east-west
// lines, so the grid is a symmetric 7x7.
export const ROAD_LINES = [-156, -104, -52, 0, 52, 104, 156];

const ROAD_HALF = 6; // half the asphalt width
const PITCH = 52;
const WALK_MIN = -205;
const WALK_MAX_Z = 205;

// Keep a position inside the walkable world (never into the ocean).
export function clampToWorld(pos) {
  if (pos.x < WALK_MIN) pos.x = WALK_MIN;
  if (pos.x > OCEAN_X) pos.x = OCEAN_X;
  if (pos.z < -WALK_MAX_Z) pos.z = -WALK_MAX_Z;
  if (pos.z > WALK_MAX_Z) pos.z = WALK_MAX_Z;
}

// Push a circle (a walker, a car) out of every axis-aligned box collider.
// Colliders are { x, z, hw, hd } — centre plus half width / half depth.
export function collideCircle(colliders, pos, r) {
  for (const c of colliders) {
    const nx = Math.max(c.x - c.hw, Math.min(pos.x, c.x + c.hw));
    const nz = Math.max(c.z - c.hd, Math.min(pos.z, c.z + c.hd));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const push = (r - d) / d;
      pos.x += dx * push;
      pos.z += dz * push;
    } else {
      // Centre is inside the box: leave along the shallowest axis.
      const px = c.hw + r - Math.abs(pos.x - c.x);
      const pz = c.hd + r - Math.abs(pos.z - c.z);
      if (px < pz) pos.x += pos.x >= c.x ? px : -px;
      else pos.z += pos.z >= c.z ? pz : -pz;
    }
  }
}

function box(w, h, d, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function lambert(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

export function createCity(scene, seed) {
  const rng = mulberry32(seed);
  const colliders = [];
  const buildings = [];

  // --- sky, sun, fog ------------------------------------------------
  scene.background = new THREE.Color(0x8fc0e8);
  scene.fog = new THREE.Fog(0xa8c8e0, 260, 720);
  const sun = new THREE.DirectionalLight(0xfff1cf, 1.7);
  sun.position.set(190, 260, 130);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -260; sc.right = 340; sc.top = 260; sc.bottom = -260;
  sc.near = 10; sc.far = 800;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x9a8a68, 0.75));

  // --- ground, sand, ocean ------------------------------------------
  const groundTex = grassTexture();
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(24, 20);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(620, 540),
    new THREE.MeshLambertMaterial({ map: groundTex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(40, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  const sandTex = sandTexture();
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.repeat.set(2, 18);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(56, 540),
    new THREE.MeshLambertMaterial({ map: sandTex }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(218, 0.03, 0);
  sand.receiveShadow = true;
  scene.add(sand);

  const waterTex = waterTexture();
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(14, 18);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(380, 540),
    new THREE.MeshLambertMaterial({ map: waterTex, transparent: true, opacity: 0.92 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(422, 0.06, 0);
  scene.add(ocean);

  // --- roads ---------------------------------------------------------
  const roadTex = roadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadLen = 420;
  for (const line of ROAD_LINES) {
    // North-south road (runs along z).
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, roadLen), roadMat);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(line, 0.05, 0);
    ns.receiveShadow = true;
    scene.add(ns);
    // East-west road (runs along x). The z = 0 road reaches the pier.
    const ewLen = line === 0 ? roadLen + 40 : roadLen;
    const ewX = line === 0 ? 10 : 0;
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(ewLen, ROAD_HALF * 2), roadMat);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(ewX, 0.05, line);
    ew.receiveShadow = true;
    scene.add(ew);
  }

  // --- buildings -----------------------------------------------------
  // One palette per district, facades drawn by the util texture maker.
  const palettes = [
    [0xd9c9a8, 0x2f6ea8], [0xc9b8a0, 0x4a7a5a], [0xe0d4c0, 0x8a4a3a],
    [0xb8c4cc, 0x2a4a6a], [0xd8b8a0, 0x6a4a8a], [0xc4b090, 0x3a8a7a],
  ];
  const clearZones = [
    { x: 78, z: 118, r: 14 }, // safehouse doorstep + spawn
    { x: -130, z: 120, r: 12 }, // garage forecourt
    { x: 226, z: 8, r: 10 }, // Vera at the pier
  ];
  const inClear = (x, z, pad) => clearZones.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + pad);

  function raiseBuilding(x, z, w, d, h, palette) {
    const [base, accent] = palette;
    const tex = facadeTexture(rng, base, accent);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const body = box(w, h, d, mat, x, h / 2, z);
    scene.add(body);
    // Flat roof cap + a couple of AC boxes, so the skyline reads.
    const roof = box(w + 0.6, 0.5, d + 0.6, lambert(0x4a4440), x, h + 0.25, z);
    scene.add(roof);
    const acCount = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < acCount; i++) {
      const ax = x + randRange(rng, -w / 3, w / 3);
      const az = z + randRange(rng, -d / 3, d / 3);
      scene.add(box(1.6, 0.9, 1.6, lambert(0x8a8580), ax, h + 0.9, az));
    }
    if (h > 34 && rng() < 0.5) {
      scene.add(box(0.4, 7, 0.4, lambert(0x66605a), x + w / 4, h + 3.5, z - d / 4));
    }
    buildings.push({ x, z, w, d });
    colliders.push({ x, z, hw: w / 2 + 0.4, hd: d / 2 + 0.4 });
  }

  // Walk the 6x6 blocks; two buildings per block, placed on a diagonal so
  // every block reads differently. The park block stays green.
  for (let bi = 0; bi < 6; bi++) {
    for (let bj = 0; bj < 6; bj++) {
      const x0 = ROAD_LINES[bi] + ROAD_HALF + 2;
      const x1 = ROAD_LINES[bi + 1] - ROAD_HALF - 2;
      const z0 = ROAD_LINES[bj] + ROAD_HALF + 2;
      const z1 = ROAD_LINES[bj + 1] - ROAD_HALF - 2;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      // The park block (between the -104 and -52 roads, both ways).
      if (bi === 1 && bj === 1) continue;
      const palette = palettes[(bi * 2 + bj) % palettes.length];
      const downtown = 1 - Math.hypot(cx, cz) / 300;
      const spots = [
        [x0 + (x1 - x0) * 0.28, z0 + (z1 - z0) * 0.3],
        [x0 + (x1 - x0) * 0.72, z0 + (z1 - z0) * 0.7],
      ];
      for (const [bx, bz] of spots) {
        if (inClear(bx, bz, 9)) continue;
        const w = randRange(rng, 11, 17);
        const d = randRange(rng, 11, 17);
        const h = Math.round(randRange(rng, 9, 16) + downtown * randRange(rng, 6, 42));
        raiseBuilding(bx, bz, w, d, h, palette);
      }
    }
  }

  // Landmark towers near the middle of town.
  raiseBuilding(-26, 26, 22, 22, 58, palettes[3]);
  raiseBuilding(30, -28, 20, 20, 48, palettes[0]);

  // --- the safehouse and the garage (clear doorsteps) ---------------
  raiseBuilding(78, 136, 15, 11, 12, [0xe8dcc0, 0x2f7a6a]);
  raiseBuilding(-130, 140, 17, 11, 9, [0xcfc4b0, 0x8a5a2a]);

  // --- the park: grass, pond, trees, benches -------------------------
  const parkMat = new THREE.MeshLambertMaterial({ color: 0x5da24a });
  const park = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), parkMat);
  park.rotation.x = -Math.PI / 2;
  park.position.set(-78, 0.07, -78);
  park.receiveShadow = true;
  scene.add(park);
  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(7, 24),
    new THREE.MeshLambertMaterial({ color: 0x3a7ab8 }),
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(-86, 0.09, -86);
  scene.add(pond);
  for (let i = 0; i < 9; i++) {
    const tx = randRange(rng, -96, -60);
    const tz = randRange(rng, -96, -60);
    if (Math.hypot(tx + 86, tz + 86) < 9) continue;
    plantTree(scene, tx, tz, rng);
  }
  scene.add(box(4, 0.5, 1.2, lambert(0x7a5a34), -66, 0.25, -70));
  scene.add(box(4, 0.5, 1.2, lambert(0x7a5a34), -90, 0.25, -64));

  // --- boardwalk, pier and palms -------------------------------------
  const plankMat = lambert(0x9a7a52);
  const boardwalk = box(38, 0.4, 90, plankMat, 213, 0.2, 0, false);
  scene.add(boardwalk);
  // Pier 7: a deck out over the water, wide enough for a car.
  const pierDeck = box(126, 0.5, 17, plankMat, 258, 1.1, 3.5, false);
  scene.add(pierDeck);
  for (let px = 200; px <= 318; px += 14) {
    for (const pz of [-4, 11]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.6, 2.6, 8),
        lambert(0x6a4a2e),
      );
      post.position.set(px, -0.2, pz);
      scene.add(post);
    }
  }
  // Low rails along the pier edges.
  scene.add(box(126, 0.25, 0.3, lambert(0x7a5a3a), 258, 2.1, -4.6, false));
  scene.add(box(126, 0.25, 0.3, lambert(0x7a5a3a), 258, 2.1, 11.6, false));
  for (let px = 204; px <= 316; px += 28) {
    scene.add(box(0.3, 1.1, 0.3, lambert(0x7a5a3a), px, 1.7, -4.6, false));
    scene.add(box(0.3, 1.1, 0.3, lambert(0x7a5a3a), px, 1.7, 11.6, false));
  }
  // Palms along the beach and in the park corners.
  for (let pz = -180; pz <= 180; pz += 30) {
    plantPalm(scene, 199, pz + randRange(rng, -6, 6), rng);
  }
  plantPalm(scene, -64, -64, rng);
  plantPalm(scene, -92, -62, rng);

  // --- street lamps ---------------------------------------------------
  const lampMat = lambert(0x3a3a3a);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let i = 0; i < ROAD_LINES.length; i++) {
    for (let j = 0; j < ROAD_LINES.length; j++) {
      if ((i + j) % 2 !== 0) continue;
      const lx = ROAD_LINES[i] + ROAD_HALF + 1.5;
      const lz = ROAD_LINES[j] + ROAD_HALF + 1.5;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7, 8), lampMat);
      pole.position.set(lx, 3.5, lz);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), glowMat);
      lamp.position.set(lx, 7.2, lz);
      scene.add(lamp);
    }
  }

  // --- clouds ----------------------------------------------------------
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 9; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let p = 0; p < puffs; p++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(randRange(rng, 6, 13), 10, 8), cloudMat);
      s.position.set(p * randRange(rng, 7, 11) - puffs * 4, randRange(rng, -2, 2), randRange(rng, -4, 4));
      s.scale.y = 0.45;
      cloud.add(s);
    }
    cloud.position.set(randRange(rng, -220, 320), randRange(rng, 85, 130), randRange(rng, -220, 220));
    scene.add(cloud);
  }

  return {
    colliders,
    buildings,
    safehousePos: { x: 78, z: 118 },
    spawnPos: { x: 78, z: 112 },
    veraPos: { x: 226, z: 8 },
    garagePos: { x: -130, z: 120 },
    pierPos: { x: 228, z: 5 },
  };
}

function plantTree(scene, x, z, rng) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.5, 3.4, 8),
    lambert(0x6a4a2e),
  );
  trunk.position.set(x, 1.7, z);
  trunk.castShadow = true;
  scene.add(trunk);
  const top = new THREE.Mesh(
    new THREE.SphereGeometry(randRange(rng, 2.2, 3.4), 10, 8),
    lambert(0x3f8a3a),
  );
  top.position.set(x, 4.6, z);
  top.castShadow = true;
  scene.add(top);
}

function plantPalm(scene, x, z, rng) {
  const lean = randRange(rng, -0.12, 0.12);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.45, 7.5, 8),
    lambert(0x8a6a42),
  );
  trunk.position.set(x, 3.75, z);
  trunk.rotation.z = lean;
  trunk.castShadow = true;
  scene.add(trunk);
  const frondMat = lambert(0x2f8a3a);
  for (let i = 0; i < 6; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.6, 4), frondMat);
    const a = (i / 6) * Math.PI * 2;
    frond.position.set(x + Math.cos(a) * 1.9, 7.4, z + Math.sin(a) * 1.9);
    frond.rotation.z = Math.cos(a) * 1.15;
    frond.rotation.x = -Math.sin(a) * 1.15;
    frond.castShadow = true;
    scene.add(frond);
  }
}
