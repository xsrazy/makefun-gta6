// The city of Solmar Bay: a seeded road grid, districts, blocks, buildings, parks, palms
// and the named places missions point at. Everything here is pure layout — no drawing, no
// simulation — so the world, the traffic and the missions all read the same map.

import { DISTRICT_STYLES, ROADS, SHORE, WORLD } from './config.js';

const HALF_ROAD = ROADS.width / 2;

/** Named places the story and the HUD point at. */
export const PLACES = {
  safehouse: { x: 650, y: 620, name: 'Safehouse', blurb: 'Danny\u2019s place' },
  garage: { x: 1250, y: 1250, name: 'Solano Garage', blurb: 'Marina\u2019s workshop' },
  office: { x: 2450, y: 1150, name: 'Marina\u2019s Office', blurb: 'The fixer\u2019s den' },
  docks: { x: 520, y: 3080, name: 'The Docks', blurb: 'Crates and gulls' },
  hospital: { x: 3650, y: 770, name: 'Bay General Hospital', blurb: 'You wake up here' },
  policeHQ: { x: 3050, y: 1970, name: 'SBPD Headquarters', blurb: 'Do not park here' },
  stadium: { x: 4250, y: 2450, name: 'Solmar Stadium', blurb: 'Home of the Waves' },
  plaza: { x: 2150, y: 1850, name: 'Sun Plaza', blurb: 'Downtown heart' },
};

/** The districts, as rectangles; the first one containing a point wins. */
export const DISTRICTS = [
  { id: 'downtown', name: 'Downtown', x: 1550, y: 300, w: 1800, h: 1800 },
  { id: 'oldtown', name: 'Old Town', x: 3350, y: 300, w: 1450, h: 1200 },
  { id: 'marina', name: 'Marina', x: 0, y: 2100, w: 950, h: 1150 },
  { id: 'harbor', name: 'Harbor', x: 950, y: 2700, w: 1400, h: 550 },
  { id: 'beach', name: 'Beachfront', x: 0, y: 2700, w: 4800, h: 660 },
  { id: 'northside', name: 'Northside', x: 0, y: 0, w: 4800, h: 300 },
];

export function districtAt(x, y) {
  for (const district of DISTRICTS) {
    if (x >= district.x && x < district.x + district.w && y >= district.y && y < district.y + district.h) return district;
  }
  return DISTRICTS[DISTRICTS.length - 1];
}

/** True when the point is on a road (or on an intersection). */
export function isOnRoad(x, y) {
  for (const cx of ROADS.vertical) if (Math.abs(x - cx) <= HALF_ROAD) return true;
  for (const cy of ROADS.horizontal) if (Math.abs(y - cy) <= HALF_ROAD) return true;
  return false;
}

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/**
 * Build the city from a seeded random: blocks between the roads get buildings, parks or
 * parking lots; the beach strip gets palms; the docks get crates. Returns the layout the
 * world, renderer and minimap all share.
 */
export function createCity(random) {
  const buildings = [];
  const parks = [];
  const lots = [];
  const trees = [];
  const crates = [];

  // Block columns and rows: the gaps between neighbouring road edges.
  const colEdges = [0, ...ROADS.vertical.map((x) => x - HALF_ROAD), WORLD.width];
  const colStarts = [0, ...ROADS.vertical.map((x) => x + HALF_ROAD)];
  const rowEdges = [0, ...ROADS.horizontal.map((y) => y - HALF_ROAD), WORLD.height];
  const rowStarts = [0, ...ROADS.horizontal.map((y) => y + HALF_ROAD)];
  const blockW = [];
  const blockH = [];
  for (let i = 0; i < colStarts.length; i += 1) blockW.push(colEdges[i + 1] - colStarts[i]);
  for (let i = 0; i < rowStarts.length; i += 1) blockH.push(rowEdges[i + 1] - rowStarts[i]);

  for (let row = 0; row < rowStarts.length; row += 1) {
    for (let col = 0; col < colStarts.length; col += 1) {
      const bx = colStarts[col];
      const by = rowStarts[row];
      const bw = blockW[col];
      const bh = blockH[row];
      if (bw < 120 || bh < 120) continue;
      // The beach strip stays open: sand, palms, no buildings.
      if (by >= SHORE.sandTop - 130) continue;
      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      const district = districtAt(cx, cy);
      const style = DISTRICT_STYLES[district.id];
      // The safehouse block stays open: Danny's driveway, no buildings to box the car in.
      if (PLACES.safehouse.x >= bx && PLACES.safehouse.x < bx + bw && PLACES.safehouse.y >= by && PLACES.safehouse.y < by + bh) {
        lots.push({ x: bx, y: by, w: bw, h: bh });
        continue;
      }
      const roll = random();
      if (roll < 0.12) {
        // A park: grass, paths and a ring of palms.
        parks.push({ x: bx, y: by, w: bw, h: bh });
        const count = 6 + Math.floor(random() * 6);
        for (let i = 0; i < count; i += 1) {
          trees.push({ x: bx + 30 + random() * (bw - 60), y: by + 30 + random() * (bh - 60), palm: random() < 0.6 });
        }
        continue;
      }
      if (roll < 0.2) {
        lots.push({ x: bx, y: by, w: bw, h: bh });
        continue;
      }
      // A built block: one big building or a row of two to four smaller ones.
      const count = bw > 420 && random() < 0.5 ? 1 : 2 + Math.floor(random() * 3);
      const gap = 18;
      const slotW = (bw - gap * (count + 1)) / count;
      for (let i = 0; i < count; i += 1) {
        const w = Math.min(slotW, 90 + random() * (slotW - 90));
        const h = Math.min(bh - 2 * gap, 90 + random() * Math.max(30, bh - 2 * gap - 90));
        const x = bx + gap + i * (slotW + gap) + (slotW - w) / 2;
        const y = by + gap + (bh - 2 * gap - h) / 2;
        const floors = style.floorsMin + Math.floor(random() * (style.floorsMax - style.floorsMin + 1));
        buildings.push({
          x, y, w, h,
          floors,
          wall: pick(random, style.walls),
          roof: pick(random, style.roofs),
          district: district.id,
        });
      }
      // A couple of street trees on the block's corners.
      if (random() < 0.6) trees.push({ x: bx + 16, y: by + 16, palm: random() < 0.5 });
      if (random() < 0.6) trees.push({ x: bx + bw - 16, y: by + bh - 16, palm: random() < 0.5 });
    }
  }

  // Palms along the beachfront road and the sand.
  for (let x = 120; x < WORLD.width; x += 90 + random() * 120) {
    trees.push({ x, y: 3305 + random() * 30, palm: true });
    if (random() < 0.5) trees.push({ x: x + 40, y: 3390 + random() * 40, palm: true });
  }
  // Crates and containers at the docks.
  for (let i = 0; i < 14; i += 1) {
    crates.push({ x: 180 + random() * 700, y: 2920 + random() * 300, w: 46 + random() * 30, h: 30 + random() * 20 });
  }

  // Landmark buildings: the hospital and the police HQ stand out on their blocks.
  buildings.push({ x: 3520, y: 520, w: 260, h: 200, floors: 5, wall: '#e8f0f2', roof: '#c84a4a', district: 'oldtown', landmark: 'hospital' });
  buildings.push({ x: 2920, y: 1720, w: 260, h: 200, floors: 4, wall: '#b8c8d8', roof: '#2e4a6b', district: 'downtown', landmark: 'police' });

  // No building may cover a named place: every mission target must be reachable on
  // foot and by car, so clear a ring around each one.
  const clear = [];
  for (const b of buildings) {
    if (b.landmark) { clear.push(b); continue; }
    let blocked = false;
    for (const place of Object.values(PLACES)) {
      const nx = Math.max(b.x, Math.min(place.x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(place.y, b.y + b.h));
      if (Math.hypot(place.x - nx, place.y - ny) < 110) { blocked = true; break; }
    }
    if (!blocked) clear.push(b);
  }

  return { buildings: clear, parks, lots, trees, crates };
}

/** The building (or crate) containing the point, or null. */
export function solidAt(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return b;
  }
  for (const c of city.crates) {
    if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) return c;
  }
  return null;
}

/**
 * Push a circle out of any building or crate it overlaps. Returns true when it moved.
 * Call after moving an entity; the entity keeps its position otherwise.
 */
export function resolveSolidCollision(city, body) {
  const r = body.radius;
  let moved = false;
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - nx;
    const dy = body.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      body.x = nx + (dx / d) * r;
      body.y = ny + (dy / d) * r;
    } else {
      // Centre inside the box: shove out along the smallest penetration.
      const left = body.x - b.x;
      const right = b.x + b.w - body.x;
      const top = body.y - b.y;
      const bottom = b.y + b.h - body.y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) body.x = b.x - r;
      else if (min === right) body.x = b.x + b.w + r;
      else if (min === top) body.y = b.y - r;
      else body.y = b.y + b.h + r;
    }
    moved = true;
  }
  return moved;
}

/** A random point on a road centre line, for spawning traffic. */
export function randomRoadPoint(random) {
  if (random() < 0.5) {
    const cx = ROADS.vertical[Math.floor(random() * ROADS.vertical.length)];
    return { x: cx, y: 60 + random() * (WORLD.height - 320) };
  }
  const cy = ROADS.horizontal[Math.floor(random() * ROADS.horizontal.length)];
  return { x: 60 + random() * (WORLD.width - 120), y: cy };
}

/** A random point on a sidewalk (just off a road edge), for spawning pedestrians. */
export function randomSidewalkPoint(random) {
  const p = randomRoadPoint(random);
  const off = HALF_ROAD + 14;
  if (random() < 0.5) p.x += random() < 0.5 ? off : -off;
  else p.y += random() < 0.5 ? off : -off;
  p.x = Math.max(20, Math.min(WORLD.width - 20, p.x));
  p.y = Math.max(20, Math.min(SHORE.sandTop - 20, p.y));
  return p;
}
