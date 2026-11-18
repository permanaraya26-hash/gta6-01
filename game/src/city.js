// Solmar Bay: a procedural sun-soaked coastal city on a road grid.
// Roads run at multiples of PITCH; blocks between them hold buildings, parks and palms.
// Exports buildCity(scene, rng) -> { colliders, buildings2d, roadLines, bounds, landmarks,
//   resolveCollision(pos, radius), nearestRoadPoint(x, z), randomRoadPoint(rng) }
import * as THREE from 'three';
import { pick, range, rangeInt, clamp } from './rng.js';

export const PITCH = 62;          // distance between road centre lines
export const ROAD_HALF = 8;       // half width of a road
export const CITY_EXTENT = 186;   // last road centre line (7 roads: -186..186)
export const BOUND = 232;         // playable clamp

// Canvas-generated window texture: cheap facade variety with no image files.
function facadeTexture(rng, base, lit) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  const rows = rangeInt(rng, 6, 12);
  const cols = rangeInt(rng, 4, 6);
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = 8 + col * ((128 - 16) / cols);
      const y = 10 + r * ((256 - 20) / rows);
      const w = (128 - 16) / cols - 6;
      const h = (256 - 20) / rows - 8;
      g.fillStyle = rng() < 0.28 ? lit : 'rgba(20,32,48,0.85)';
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x, y, w, 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePalm(rng) {
  const g = new THREE.Group();
  const trunkH = range(rng, 5, 8);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.32, trunkH, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a6b4a }));
  trunk.position.y = trunkH / 2;
  trunk.rotation.z = range(rng, -0.08, 0.08);
  g.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.2, 4), leafMat);
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.1, trunkH + 0.3, Math.sin(a) * 1.1);
    leaf.rotation.z = Math.cos(a) * 1.15;
    leaf.rotation.x = -Math.sin(a) * 1.15;
    g.add(leaf);
  }
  const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5),
    new THREE.MeshLambertMaterial({ color: 0x6b4f2a }));
  nuts.position.y = trunkH + 0.2;
  g.add(nuts);
  return g;
}

function makeLamp() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6),
    new THREE.MeshLambertMaterial({ color: 0x2c2c34 }));
  pole.position.y = 3;
  g.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12),
    new THREE.MeshLambertMaterial({ color: 0x2c2c34 }));
  arm.position.set(0.7, 5.9, 0);
  g.add(arm);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  bulb.position.set(1.4, 5.8, 0);
  g.add(bulb);
  return g;
}

export function buildCity(scene, rng) {
  const colliders = [];   // {minX,maxX,minZ,maxZ}
  const buildings2d = []; // {x,z,w,d,color} for the minimap
  const roadLines = [];
  for (let i = -3; i <= 3; i++) roadLines.push(i * PITCH);

  // ---- sky, sun, ground ----
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc8e8, 180, 520);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1c4, 2.1);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 600;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshLambertMaterial({ color: 0x9aa88a }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 40);
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- roads (dark asphalt strips + dashed centre lines) ----
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf7d774 });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
  for (const r of roadLines) {
    for (const horiz of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(2 * CITY_EXTENT + 2 * ROAD_HALF, ROAD_HALF * 2), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(horiz ? 0 : r, 0, horiz ? r : 0);
      if (!horiz) road.rotation.z = Math.PI / 2;
      road.receiveShadow = true;
      scene.add(road);
      // sidewalks: lighter strips flanking the road
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(2 * CITY_EXTENT + 2 * ROAD_HALF, 3), walkMat);
        walk.rotation.x = -Math.PI / 2;
        walk.position.set(horiz ? 0 : r + side * (ROAD_HALF + 1.5), 0.01, horiz ? r + side * (ROAD_HALF + 1.5) : 0);
        if (!horiz) walk.rotation.z = Math.PI / 2;
        scene.add(walk);
      }
      // dashed centre line
      for (let d = -CITY_EXTENT; d < CITY_EXTENT; d += 12) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.5), lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(horiz ? d : r, 0.02, horiz ? r : d);
        if (!horiz) dash.rotation.z = Math.PI / 2;
        scene.add(dash);
      }
    }
  }

  // ---- beach + ocean on the south edge ----
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(560, 60),
    new THREE.MeshLambertMaterial({ color: 0xe8d29a }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, CITY_EXTENT + 34);
  scene.add(sand);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(900, 300),
    new THREE.MeshLambertMaterial({ color: 0x1e7fa8 }));
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.05, CITY_EXTENT + 210);
  scene.add(ocean);
  // boardwalk pier at the south beach
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 70),
    new THREE.MeshLambertMaterial({ color: 0x9a7b52 }));
  pier.position.set(0, 0.6, CITY_EXTENT + 70);
  pier.castShadow = true;
  scene.add(pier);

  // ---- buildings ----
  const palette = ['#f2e3c6', '#f7c9a0', '#a8d8d0', '#f2a594', '#e8d8a8', '#c9d6e8', '#e8b7c9', '#d8c9a8'];
  const facadeMats = palette.map((c) => new THREE.MeshLambertMaterial({ map: facadeTexture(rng, c, '#ffe9a8') }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5a62 });
  const blockCenters = [];
  for (let i = -2.5; i <= 2.5; i++) blockCenters.push(i * PITCH);
  const parkBlock = { x: -31, z: -31 }; // one block becomes a park

  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      if (bx === parkBlock.x && bz === parkBlock.z) {
        // Central park: grass, trees, pond, benches.
        const grass = new THREE.Mesh(new THREE.PlaneGeometry(44, 44),
          new THREE.MeshLambertMaterial({ color: 0x5da24a }));
        grass.rotation.x = -Math.PI / 2;
        grass.position.set(bx, 0.03, bz);
        scene.add(grass);
        const pond = new THREE.Mesh(new THREE.CircleGeometry(7, 20),
          new THREE.MeshLambertMaterial({ color: 0x3a9ac4 }));
        pond.rotation.x = -Math.PI / 2;
        pond.position.set(bx + 8, 0.05, bz - 6);
        scene.add(pond);
        for (let t = 0; t < 8; t++) {
          const palm = makePalm(rng);
          palm.position.set(bx + range(rng, -18, 18), 0, bz + range(rng, -18, 18));
          scene.add(palm);
        }
        continue;
      }
      const count = rangeInt(rng, 1, 3);
      for (let b = 0; b < count; b++) {
        const w = range(rng, 12, 20);
        const d = range(rng, 12, 20);
        const h = range(rng, 8, 30) * (1 + (1 - Math.abs(bx) / 200) * 0.9 + (1 - Math.abs(bz) / 200) * 0.5);
        const ox = count === 1 ? 0 : (b - (count - 1) / 2) * 16;
        const oz = count === 1 ? 0 : range(rng, -8, 8);
        const x = bx + ox, z = bz + oz;
        const mat = pick(rng, facadeMats);
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        box.position.set(x, h / 2, z);
        box.castShadow = true; box.receiveShadow = true;
        scene.add(box);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), roofMat);
        roof.position.set(x, h + 0.25, z);
        scene.add(roof);
        // rooftop AC box on tall buildings
        if (h > 20) {
          const ac = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 3),
            new THREE.MeshLambertMaterial({ color: 0x8a8a92 }));
          ac.position.set(x + w / 4, h + 1.2, z - d / 4);
          scene.add(ac);
        }
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        buildings2d.push({ x, z, w, d, color: '#8a94a3' });
      }
    }
  }

  // ---- palms + lamps along sidewalks and the beach ----
  for (const r of roadLines) {
    for (let d = -CITY_EXTENT; d <= CITY_EXTENT; d += 31) {
      if (rng() < 0.5) {
        const palm = makePalm(rng);
        palm.position.set(r + (rng() < 0.5 ? -11 : 11), 0, d + range(rng, -6, 6));
        scene.add(palm);
      }
      if (rng() < 0.35) {
        const lamp = makeLamp();
        lamp.position.set(d + range(rng, -6, 6), 0, r + (rng() < 0.5 ? -10 : 10));
        lamp.rotation.y = rng() * Math.PI;
        scene.add(lamp);
      }
    }
  }
  for (let x = -220; x <= 220; x += 24) {
    const palm = makePalm(rng);
    palm.position.set(x, 0, CITY_EXTENT + 14);
    scene.add(palm);
  }

  // ---- landmarks (mission anchors) ----
  const landmarks = {
    garage: { x: -93, z: 155, name: "Vera's Garage" },
    pier: { x: 0, z: CITY_EXTENT + 62, name: 'Solmar Pier' },
    safehouse: { x: 155, z: -155, name: 'Rico\'s Safehouse' },
    park: { x: parkBlock.x, z: parkBlock.z, name: 'Palm Court Park' },
    plaza: { x: 93, z: 31, name: 'Marina Plaza' },
  };
  // Garage building marker: a low teal block with a sign band.
  const garage = new THREE.Mesh(new THREE.BoxGeometry(26, 7, 16),
    new THREE.MeshLambertMaterial({ color: 0x2e8b8b }));
  garage.position.set(landmarks.garage.x, 3.5, landmarks.garage.z);
  garage.castShadow = true;
  scene.add(garage);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(26.4, 1.6, 0.4),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }));
  sign.position.set(landmarks.garage.x, 6.2, landmarks.garage.z - 8.2);
  scene.add(sign);
  colliders.push({ minX: landmarks.garage.x - 13, maxX: landmarks.garage.x + 13, minZ: landmarks.garage.z - 8, maxZ: landmarks.garage.z + 8 });
  buildings2d.push({ x: landmarks.garage.x, z: landmarks.garage.z, w: 26, d: 16, color: '#2e8b8b' });
  // Safehouse: small house with a red roof.
  const house = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 10),
    new THREE.MeshLambertMaterial({ color: 0xf2e3c6 }));
  house.position.set(landmarks.safehouse.x, 2.5, landmarks.safehouse.z);
  house.castShadow = true;
  scene.add(house);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(9, 4, 4),
    new THREE.MeshLambertMaterial({ color: 0xb3541e }));
  roof.position.set(landmarks.safehouse.x, 7, landmarks.safehouse.z);
  roof.rotation.y = Math.PI / 4;
  scene.add(roof);
  colliders.push({ minX: landmarks.safehouse.x - 6, maxX: landmarks.safehouse.x + 6, minZ: landmarks.safehouse.z - 5, maxZ: landmarks.safehouse.z + 5 });
  buildings2d.push({ x: landmarks.safehouse.x, z: landmarks.safehouse.z, w: 12, d: 10, color: '#f2e3c6' });

  // ---- helpers ----
  function resolveCollision(pos, radius) {
    pos.x = clamp(pos.x, -BOUND, BOUND);
    pos.z = clamp(pos.z, -BOUND, BOUND + 90);
    for (const c of colliders) {
      if (pos.x > c.minX - radius && pos.x < c.maxX + radius &&
          pos.z > c.minZ - radius && pos.z < c.maxZ + radius) {
        const dxl = pos.x - (c.minX - radius);
        const dxr = (c.maxX + radius) - pos.x;
        const dzl = pos.z - (c.minZ - radius);
        const dzr = (c.maxZ + radius) - pos.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) pos.x = c.minX - radius;
        else if (m === dxr) pos.x = c.maxX + radius;
        else if (m === dzl) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }

  function nearestRoadPoint(x, z) {
    let best = null; let bd = 1e9;
    for (const r of roadLines) {
      const d1 = Math.abs(z - r), d2 = Math.abs(x - r);
      if (d1 < bd) { bd = d1; best = { x: clamp(x, -CITY_EXTENT, CITY_EXTENT), z: r }; }
      if (d2 < bd) { bd = d2; best = { x: r, z: clamp(z, -CITY_EXTENT, CITY_EXTENT) }; }
    }
    return best;
  }

  function randomRoadPoint(rngFn) {
    const horiz = rngFn() < 0.5;
    const r = pick(rngFn, roadLines);
    const along = range(rngFn, -CITY_EXTENT, CITY_EXTENT);
    return horiz ? { x: along, z: r } : { x: r, z: along };
  }

  return { colliders, buildings2d, roadLines, bounds: BOUND, landmarks, resolveCollision, nearestRoadPoint, randomRoadPoint };
}
