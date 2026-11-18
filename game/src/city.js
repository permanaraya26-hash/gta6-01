// Solmar Bay — procedural coastal city, rewritten.
// A road grid with drawn-facade buildings, a park, beach, pier, palms and lamps.
// All layout, names and art are original to this entry.
import * as THREE from 'three';
import {
  mulberry32, randRange, pick, clamp,
  facadeTexture, roadTexture, sandTexture, waterTexture, grassTexture,
} from './util.js';

// The road grid: seven avenues each way, 52 m apart.
export const ROAD_LINES = [-156, -104, -52, 0, 52, 104, 156];
export const CITY_HALF = 190;   // half-size of the built-up city
export const WORLD_HALF = 340;  // walkable/drivable clamp (ocean edge at +x)
export const BEACH_X = 196;     // sand starts here
export const OCEAN_X = 236;     // water starts here

const WALL_COLORS = ['#c96f4a', '#d9a05b', '#7fa8c9', '#a8b8a0', '#c9b458', '#9a7fb8', '#e0d6c2', '#6f9a8a', '#b8576a', '#5b7fa8'];
const TRIM_COLORS = ['#2e6f8e', '#b3541e', '#3d7a4a', '#8e2e5b', '#d9a520'];

// Small helper: a Lambert box mesh placed at (x, y, z).
function blockMesh(w, h, d, color, x, y, z, material) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    material || new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  return mesh;
}

function tiled(material, repeatX, repeatY) {
  material.wrapS = material.wrapT = THREE.RepeatWrapping;
  material.repeat.set(repeatX, repeatY);
  return material;
}

export function createCity(scene, seed) {
  const rng = mulberry32(seed);
  const colliders = []; // {x, z, hw, hd} axis-aligned boxes the player/cars bump into
  const buildings = []; // {x, z, w, d, h} footprints, drawn on the minimap
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  paintSky(scene);
  layGround(group);
  layRoads(group);
  raiseBlocks(group, rng, colliders, buildings);
  layShore(group);
  buildPier(group);
  plantPalms(group, rng);
  plantLamps(group);
  driftClouds(group, rng);

  return {
    group,
    colliders,
    buildings,
    safehousePos: new THREE.Vector3(130, 0, 130 + 24),
    garagePos: new THREE.Vector3(130, 0, -130 + 24),
    pierPos: new THREE.Vector3(OCEAN_X + 78, 0, 0),
    parkPos: new THREE.Vector3(-78, 0, -78),
    spawnPos: new THREE.Vector3(-26, 0, 26),
    veraPos: new THREE.Vector3(OCEAN_X - 14, 0, 0),
  };
}

function paintSky(scene) {
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc8e8, 220, 700);
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1));
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
}

function layGround(group) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshLambertMaterial({ color: 0x9aa0a3 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(40, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);
}

function layRoads(group) {
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
      group.add(road);
    }
  }
}

function raiseBlocks(group, rng, colliders, buildings) {
  const centers = [];
  for (let i = 0; i < ROAD_LINES.length - 1; i++) {
    centers.push((ROAD_LINES[i] + ROAD_LINES[i + 1]) / 2);
  }
  const park = { x: -78, z: -78 };
  const safehouse = { x: 130, z: 130 };
  const garage = { x: 130, z: -130 };
  const padMat = new THREE.MeshLambertMaterial({ color: 0xb9b3a4 });
  const lawn = tiled(grassTexture(), 6, 6);
  const parkMat = new THREE.MeshLambertMaterial({ map: lawn });

  for (const bx of centers) {
    for (const bz of centers) {
      const isPark = bx === park.x && bz === park.z;
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), isPark ? parkMat : padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(bx, 0.03, bz);
      pad.receiveShadow = true;
      group.add(pad);
      if (isPark) {
        buildPark(group, bx, bz, rng, colliders);
        continue;
      }
      // 1–3 towers per block, leaving a plaza gap between them.
      const count = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < count; k++) {
        const w = randRange(rng, 10, 16);
        const d = randRange(rng, 10, 16);
        let h = randRange(rng, 9, 38);
        if (rng() < 0.18) h *= 1.6;
        const ox = (k % 2 === 0 ? -9 : 9) + randRange(rng, -2, 2);
        const oz = (k < 2 ? -9 : 9) + randRange(rng, -2, 2);
        const x = bx + ox;
        const z = bz + oz;
        const isSafe = bx === safehouse.x && bz === safehouse.z && k === 0;
        const isGarage = bx === garage.x && bz === garage.z && k === 0;
        const height = isSafe ? 7 : isGarage ? 9 : h;
        const skin = facadeTexture(rng, isSafe ? '#e8dcc0' : pick(rng, WALL_COLORS), pick(rng, TRIM_COLORS));
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
        group.add(tower);
        if (height > 14) {
          group.add(blockMesh(4, 2.5, 4, 0x8a8f94, x + w / 5, height + 1.2, z - d / 5));
        }
        colliders.push({ x, z, hw: w / 2, hd: d / 2 });
        buildings.push({ x, z, w, d, h: height });
        if (isSafe) group.add(makeSign('SAFEHOUSE', x, height + 2.5, z));
        if (isGarage) group.add(makeSign('GARAGE', x, height + 2.5, z));
      }
    }
  }
}

function layShore(group) {
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 760),
    new THREE.MeshLambertMaterial({ map: tiled(sandTexture(), 10, 10) }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(BEACH_X + 80, 0.01, 0);
  sand.receiveShadow = true;
  group.add(sand);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 760),
    new THREE.MeshLambertMaterial({ map: tiled(waterTexture(), 24, 24) }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(OCEAN_X + 210, 0.0, 0);
  ocean.name = 'ocean';
  group.add(ocean);

  const boardwalk = blockMesh(14, 0.4, 380, 0x8a6a42, BEACH_X - 4, 0.2, 0);
  boardwalk.receiveShadow = true;
  group.add(boardwalk);
}

function buildPier(group) {
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
  const hut = blockMesh(8, 5, 7, 0xd9a05b, OCEAN_X + 78, 2.5 + 0.7, 0);
  hut.castShadow = true;
  pier.add(hut);
  pier.add(makeSign('PIER 7', OCEAN_X + 78, 6.4, 0));
  group.add(pier);
}

function plantPalms(group, rng) {
  const spots = [];
  for (let z = -170; z <= 170; z += 34) {
    spots.push([BEACH_X + 26, z + randRange(rng, -6, 6)]);
  }
  for (let i = 0; i < 10; i++) {
    spots.push([-78 + randRange(rng, -16, 16), -78 + randRange(rng, -16, 16)]);
  }
  for (let i = 0; i < 14; i++) {
    spots.push([pick(rng, ROAD_LINES) + 8, randRange(rng, -170, 170)]);
  }
  for (const [px, pz] of spots) group.add(makePalm(rng, px, pz));
}

function plantLamps(group) {
  for (const line of ROAD_LINES) {
    for (let t = -170; t <= 170; t += 52) {
      group.add(makeLamp(line + 7.5, t));
      group.add(makeLamp(t, line + 7.5));
    }
  }
}

function driftClouds(group, rng) {
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 9; i++) {
    const cloud = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(randRange(rng, 6, 12), 8, 6), cloudMat);
      puff.position.set(k * 9 - 14 + randRange(rng, -3, 3), randRange(rng, -1, 1), randRange(rng, -4, 4));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(randRange(rng, -260, 260), randRange(rng, 70, 110), randRange(rng, -260, 260));
    group.add(cloud);
  }
}

// A floating text sign drawn on a canvas (SAFEHOUSE / GARAGE / PIER 7).
function makeSign(text, x, y, z) {
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
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 3),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
  );
  sign.position.set(x, y, z);
  return sign;
}

function buildPark(group, bx, bz, rng, colliders) {
  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(7, 24),
    new THREE.MeshLambertMaterial({ color: 0x2e7fa8 }),
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(bx + 6, 0.05, bz - 5);
  group.add(pond);
  for (let i = 0; i < 8; i++) {
    const x = bx + randRange(rng, -17, 17);
    const z = bz + randRange(rng, -17, 17);
    if (Math.hypot(x - (bx + 6), z - (bz - 5)) < 9) continue;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.5, 3, 8),
      new THREE.MeshLambertMaterial({ color: 0x6a4a2a }),
    );
    trunk.position.set(x, 1.5, z);
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(randRange(rng, 2.2, 3.4), 10, 8),
      new THREE.MeshLambertMaterial({ color: 0x2e7a34 }),
    );
    canopy.position.set(x, 4.4, z);
    canopy.castShadow = true;
    group.add(trunk);
    group.add(canopy);
    colliders.push({ x, z, hw: 0.6, hd: 0.6 });
  }
  for (let i = 0; i < 4; i++) {
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.5, 1),
      new THREE.MeshLambertMaterial({ color: 0x8a5a2a }),
    );
    bench.position.set(bx - 12 + i * 8, 0.6, bz + 12);
    group.add(bench);
  }
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 3, 1, 16),
    new THREE.MeshLambertMaterial({ color: 0xd8d2c0 }),
  );
  fountain.position.set(bx - 8, 0.5, bz + 2);
  group.add(fountain);
}

function makePalm(rng, x, z) {
  const palm = new THREE.Group();
  const height = randRange(rng, 5, 8);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.4, height, 8),
    new THREE.MeshLambertMaterial({ color: 0x7a5a34 }),
  );
  trunk.position.y = height / 2;
  trunk.rotation.z = randRange(rng, -0.08, 0.08);
  trunk.castShadow = true;
  palm.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8a3e, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), leafMat);
    const angle = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 1.5, height + 0.35, Math.sin(angle) * 1.5);
    leaf.rotation.y = -angle + Math.PI / 2;
    leaf.rotateX(-0.85); // droop outward
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

function makeLamp(x, z) {
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

// Push a circle of radius r out of every axis-aligned collider it overlaps.
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
      pos.x += r; // centre inside the box: shove out on +x
    }
  }
}

// True when (x, z) is on a road (within 7 m of a road line either way).
export function onRoad(x, z) {
  const nearLine = (v) => ROAD_LINES.some((l) => Math.abs(v - l) < 7);
  return nearLine(x) || nearLine(z);
}

export function clampToWorld(pos) {
  pos.x = clamp(pos.x, -CITY_HALF - 10, WORLD_HALF);
  pos.z = clamp(pos.z, -CITY_HALF - 10, CITY_HALF + 10);
}
