// Shared helpers for Solmar Bay: a seeded random stream, small vector
// maths, and the procedural canvas textures the city is painted with.
// Nothing is loaded from disk — every surface is drawn in code.

import * as THREE from 'three';

// --- deterministic random -------------------------------------------------

// mulberry32: a tiny, fast seeded generator. The seed is a 32-bit int;
// each call advances the state and returns a float in [0, 1).
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let mix = Math.imul(state ^ (state >>> 15), 1 | state);
    mix = (mix + Math.imul(mix ^ (mix >>> 7), 61 | mix)) ^ mix;
    return ((mix ^ (mix >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a over a string, for turning names into seeds.
export function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// --- small maths ----------------------------------------------------------

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Shortest-arc interpolation between two headings.
export function angleLerp(a, b, t) {
  const TAU = Math.PI * 2;
  let delta = ((b - a + Math.PI * 3) % TAU) - Math.PI;
  return a + delta * t;
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function randRange(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

// --- canvas textures ------------------------------------------------------

// Run a draw callback on a fresh canvas and wrap the result as a texture.
export function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Scatter `count` small rectangles of the given colours over the context.
function speckle(g, w, h, count, colours, size) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colours[Math.floor(Math.random() * colours.length)];
    g.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

// A building face: base colour, a soft vertical shade, lit/dark windows
// in a grid, and a shop band with awning lights along the ground floor.
export function facadeTexture(rng, base, accent) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const shade = g.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, 'rgba(255,255,255,0.18)');
    shade.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = shade;
    g.fillRect(0, 0, w, h);
    for (let y = 18; y < h - 14; y += 30) {
      for (let x = 12; x < w - 12; x += 26) {
        const roll = rng();
        g.fillStyle = roll < 0.35 ? '#ffe9a8' : roll < 0.67 ? '#2b3a4d' : '#1d2733';
        g.fillRect(x, y, 16, 20);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x, y, 16, 3);
      }
    }
    g.fillStyle = accent;
    g.fillRect(0, h - 26, w, 26);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (let x = 8; x < w - 8; x += 24) g.fillRect(x, h - 20, 14, 12);
  });
}

// Asphalt with a yellow centre line, white edge lines and grain.
export function roadTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#33373d';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 40, ['rgba(255,255,255,0.06)'], 3);
    g.fillStyle = '#e8c832';
    g.fillRect(w / 2 - 3, 0, 6, h);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(6, 0, 4, h);
    g.fillRect(w - 10, 0, 4, h);
  });
}

export function sandTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#e8cf9e';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, ['rgba(190,150,90,0.5)', 'rgba(255,240,200,0.5)'], 2);
  });
}

export function waterTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#1e7fa8';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      const y = 10 + i * 18;
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.1 + i) * 4);
      g.stroke();
    }
  });
}

export function grassTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#4e9a44';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1200; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(30,110,40,0.5)' : 'rgba(140,220,110,0.5)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 3);
    }
  });
}
