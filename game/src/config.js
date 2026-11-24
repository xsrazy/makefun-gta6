// Neon Harbor — tuning constants and shared palette. Every system reads its
// numbers from here so a balance pass touches one file.

export const WORLD_W = 3200;
export const WORLD_H = 2400;
export const ROAD_W = 96;
export const ROAD_GAP = 320; // distance between parallel road centrelines
export const BEACH_Y = 2180; // sand starts here; the sea is below SEA_Y
export const SEA_Y = 2320;

export const PLAYER = {
  walkSpeed: 210,
  sprintSpeed: 320,
  radius: 11,
  maxHealth: 100,
  magSize: 12,
  reloadTime: 1.1,
};

export const CAR = {
  accel: 300,
  brake: 480,
  maxSpeed: 540,
  reverseMax: 190,
  turnRate: 2.5, // radians per second at full lock, scaled by speed
  grip: 3.2,
  radius: 20,
};

export const TRAFFIC = {
  count: 26,
  parked: 14,
  speedMin: 110,
  speedMax: 185,
};

export const PEDS = { count: 42, walkMin: 45, walkMax: 85, fleeSpeed: 210 };

export const POLICE = {
  heatPerStar: 20,
  maxStars: 5,
  decayPerSec: 3.5, // heat lost while no officer can see the player
  sightRange: 620,
  maxCopCars: 8,
  maxFootCops: 6,
  bustTime: 1.4, // seconds a foot cop must hold the player to bust them
};

export const COMBAT = {
  bulletSpeed: 950,
  bulletLife: 0.9,
  pistolDamage: 34,
  copDamage: 9,
  thugDamage: 12,
  thugRange: 360,
};

// Sun-soaked coastal palette: warm ground, teal sea, pastel buildings.
export const PALETTE = {
  ground: '#d9c48f',
  grass: '#8fbf6f',
  road: '#3d4450',
  roadEdge: '#565e6c',
  sidewalk: '#c9b98a',
  lane: '#e8e0c8',
  sand: '#f2dfa7',
  sea: '#2fa8b8',
  seaDeep: '#1e7f9e',
  building: ['#f4a261', '#e76f51', '#2a9d8f', '#e9c46a', '#f4f1de', '#90be6d', '#577590', '#f28482', '#84a59d', '#b56576'],
  roof: ['#c96f4a', '#b5503c', '#227a6e', '#c9a227', '#cfc9a8', '#6d9a52', '#42586e', '#c96a68', '#64807a', '#8d4a5c'],
  car: ['#e63946', '#457b9d', '#f4a261', '#2a9d8f', '#e9c46a', '#f1faee', '#6c757d', '#8338ec', '#ffbe0b', '#3a86ff'],
  ped: ['#ff6b6b', '#4ecdc4', '#ffe66d', '#95d5b2', '#b8c0ff', '#ffafcc', '#a3b18a', '#fca311'],
};

export const DISTRICTS = [
  { name: 'Old Town', x: 0, y: 0, w: 1100, h: 1100 },
  { name: 'Marina District', x: 1100, y: 0, w: 1100, h: 1100 },
  { name: 'The Docks', x: 2200, y: 0, w: 1000, h: 1100 },
  { name: 'Palm Heights', x: 0, y: 1100, w: 1100, h: 1080 },
  { name: 'Downtown', x: 1100, y: 1100, w: 1100, h: 1080 },
  { name: 'South Beach', x: 2200, y: 1100, w: 1000, h: 1080 },
];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d.name;
  }
  return 'Neon Harbor';
}
