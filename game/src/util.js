import * as THREE from 'three';

// Shared helpers: seeded random, math, and procedural canvas textures.
// Everything here is original code written for Solmar Bay.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
};
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function randRange(rng, a, b) { return a + rng() * (b - a); }

// Make a canvas texture from a draw callback. Used for building facades,
// road markings, sand and the ocean — all drawn, never loaded from files.
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function facadeTexture(rng, base, accent) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // subtle vertical shading
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    // windows
    for (let y = 18; y < h - 14; y += 30) {
      for (let x = 12; x < w - 12; x += 26) {
        const lit = rng() < 0.35;
        g.fillStyle = lit ? '#ffe9a8' : (rng() < 0.5 ? '#2b3a4d' : '#1d2733');
        g.fillRect(x, y, 16, 20);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x, y, 16, 3);
      }
    }
    // ground floor shop band
    g.fillStyle = accent; g.fillRect(0, h - 26, w, 26);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (let x = 8; x < w - 8; x += 24) g.fillRect(x, h - 20, 14, 12);
  });
}

export function roadTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#33373d'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    g.fillStyle = '#e8c832';
    g.fillRect(w / 2 - 3, 0, 6, h); // centre line
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(6, 0, 4, h); g.fillRect(w - 10, 0, 4, h);
  });
}

export function sandTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#e8cf9e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(190,150,90,0.5)' : 'rgba(255,240,200,0.5)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

export function waterTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#1e7fa8'; g.fillRect(0, 0, w, h);
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
    g.fillStyle = '#4e9a44'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1200; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(30,110,40,0.5)' : 'rgba(140,220,110,0.5)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 3);
    }
  });
}
