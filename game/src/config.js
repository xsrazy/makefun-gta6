// Solmar Bay: every tuning number, colour and name in one place. The world is a fixed
// 4800x3600 city; the renderer shows a 1280x720 window of it through a camera that follows
// the player, so no rule below depends on the screen size.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The logical screen the HUD and menus are drawn in; the renderer scales it to the window. */
export const VIEW = { width: 1280, height: 720 };

export const WORLD = { width: 4800, height: 3600 };

/** Road grid: vertical road centre lines, horizontal road centre lines, and the road width. */
export const ROADS = {
  vertical: [350, 950, 1550, 2150, 2750, 3350, 3950, 4550],
  horizontal: [300, 900, 1500, 2100, 2700, 3250],
  width: 110,
};

/** The beach and the sea along the south edge of the map. */
export const SHORE = { sandTop: 3360, waterTop: 3460 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 175,
  runSpeed: 265,
  accel: 1400,
  health: 100,
  punchDamage: 20,
  punchRange: 42,
  punchCooldown: 0.45,
  startMoney: 250,
  startAmmo: 60,
};

export const PISTOL = {
  name: 'Pistol',
  damage: 34,
  cooldown: 0.28,
  bulletSpeed: 900,
  range: 520,
  spread: 0.03,
};

export const CAR_TYPES = {
  sedan:   { name: 'Bayside Sedan',   length: 52, width: 26, accel: 420, topSpeed: 430, turn: 2.6, grip: 6.5, health: 100, colors: ['#c94f4f', '#4f7ec9', '#c9c9c9', '#3f8f5f', '#d8a03c'] },
  coupe:   { name: 'Solstice GT',     length: 50, width: 25, accel: 560, topSpeed: 560, turn: 3.0, grip: 7.5, health: 90,  colors: ['#d8d83c', '#e85d9e', '#2fb8a6', '#f0f0f0'] },
  pickup:  { name: 'Rancher 4x4',     length: 56, width: 27, accel: 360, topSpeed: 380, turn: 2.3, grip: 6.0, health: 140, colors: ['#7a5a3a', '#4a6b8a', '#8a8a8a', '#5f7a3a'] },
  taxi:    { name: 'City Cab',        length: 52, width: 26, accel: 430, topSpeed: 440, turn: 2.6, grip: 6.5, health: 100, colors: ['#f2c230'] },
  van:     { name: 'Harbor Van',      length: 60, width: 28, accel: 300, topSpeed: 340, turn: 2.1, grip: 5.5, health: 150, colors: ['#e8e8e8', '#6b7f9e', '#b08a5a'] },
  sports:  { name: 'Vortex R',        length: 50, width: 26, accel: 680, topSpeed: 640, turn: 3.2, grip: 8.0, health: 80,  colors: ['#ff3b30', '#1f6fff', '#ffd60a', '#111111'] },
  cruiser: { name: 'SBPD Interceptor', length: 54, width: 27, accel: 580, topSpeed: 580, turn: 3.0, grip: 7.5, health: 160, colors: ['#101418'] },
};

/** Heat points at which each wanted star lights up (index = stars). */
export const WANTED_HEAT = [0, 20, 60, 130, 220, 340];
export const WANTED = {
  decayPerSecond: 3,
  graceAfterCrime: 4,
  stealCar: 20,
  hitPedestrian: 15,
  hitPoliceCar: 12,
  shootNearPolice: 10,
  killPolice: 60,
  explosion: 40,
  sightRadius: 520,
  copCarsPerStar: [0, 2, 3, 4, 5, 6],
  maxFootCops: 3,
  arrestSeconds: 1.2,
};

export const TRAFFIC = { count: 26, cruiseMin: 170, cruiseMax: 250, turnChance: 0.35, brakeGap: 95 };
export const PEDESTRIANS = { count: 64, walkMin: 55, walkMax: 95, fleeSpeed: 210 };
export const PACKAGES = { count: 8, reward: 500 };
export const GARAGE = { repairCost: 150, clearWantedCost: 150 };

export const PALETTE = {
  backdrop: '#0e1a24',
  grass: '#7fae62',
  grassDark: '#74a258',
  sidewalk: '#c9c2b4',
  road: '#3a3f46',
  roadEdge: '#2c3036',
  laneMark: '#e8d44d',
  sand: '#ecd9a0',
  water: '#2e7fa8',
  waterDeep: '#256b92',
  buildingRoof: '#8a7f74',
  text: '#f2ede2',
  muted: '#b8b0a0',
  panel: 'rgba(12, 18, 24, 0.82)',
  accent: '#ffb347',
  star: '#ffd60a',
  starEmpty: '#5a5348',
  health: '#7ee787',
  healthLow: '#ff6b5e',
  cash: '#7ee787',
  mission: '#ffd60a',
  police: '#4da3ff',
  danger: '#ff5a4d',
  crosshair: '#ffffff',
};

/** Building palettes per district: walls and roofs a district draws from. */
export const DISTRICT_STYLES = {
  downtown: { walls: ['#9fb4c8', '#b8c4cc', '#7e97ab', '#a8b8a0'], roofs: ['#5d6b78', '#4e5a66', '#6b7c8a'], floorsMin: 3, floorsMax: 9 },
  oldtown:  { walls: ['#b08a6a', '#a87a5a', '#c09a72', '#96705a'], roofs: ['#7a4a3a', '#6e4438', '#8a5a44'], floorsMin: 1, floorsMax: 3 },
  marina:   { walls: ['#e8e0d0', '#d8e4e0', '#efe8da', '#d0d8c8'], roofs: ['#b85c4a', '#c4705a', '#a8543e'], floorsMin: 1, floorsMax: 2 },
  beach:    { walls: ['#f0e6d2', '#e0d8c0', '#e8dcc8'], roofs: ['#d88a5a', '#c47a4a', '#e09a6a'], floorsMin: 1, floorsMax: 2 },
  northside:{ walls: ['#c8b8a0', '#b8a888', '#d0c0a8', '#a89880'], roofs: ['#6a5a4a', '#7a5a48', '#5a4a3a'], floorsMin: 1, floorsMax: 2 },
  harbor:   { walls: ['#8a9aa8', '#7a8a98', '#98a8b8', '#6a7a88'], roofs: ['#4a5a68', '#3f4e5c', '#556570'], floorsMin: 1, floorsMax: 2 },
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save game is kept between visits (this browser only). */
export const SAVE_KEY = 'solmar-bay.save.v1';
export const BEST_KEY = 'solmar-bay.best.v1';

export const GAME_NAME = 'SOLMAR BAY';
export const GAME_TAGLINE = 'Sun, salt, sirens — and one last getaway.';
