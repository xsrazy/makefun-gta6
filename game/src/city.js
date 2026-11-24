// Neon Harbor — the procedural city. Pure data, no DOM: a seeded grid of
// roads, blocks of buildings, a park, a beach and the docks, plus the
// collision and road queries the rest of the game asks. generateCity(seed)
// always returns the same city for the same seed.
import { BEACH_Y, PALETTE, ROAD_GAP, ROAD_W, SEA_Y, WORLD_H, WORLD_W } from './config.js';
import { Rng } from './random.js';

export function generateCity(seed) {
  const rng = new Rng(seed);
  const roadsV = [];
  const roadsH = [];
  for (let x = 160; x < WORLD_W - 80; x += ROAD_GAP) roadsV.push(x);
  for (let y = 160; y < BEACH_Y - 80; y += ROAD_GAP) roadsH.push(y);

  const buildings = [];
  const trees = [];
  const parks = [];
  const half = ROAD_W / 2 + 14; // road edge to buildable block edge

  // One block per cell between neighbouring roads.
  for (let i = 0; i < roadsV.length - 1; i++) {
    for (let j = 0; j < roadsH.length - 1; j++) {
      const bx = roadsV[i] + half;
      const by = roadsH[j] + half;
      const bw = roadsV[i + 1] - roadsV[i] - half * 2;
      const bh = roadsH[j + 1] - roadsH[j] - half * 2;
      // The centre block is the city park; the block by the marina is a plaza.
      if (i === 4 && j === 3) {
        parks.push({ x: bx, y: by, w: bw, h: bh });
        for (let t = 0; t < 14; t++) {
          trees.push({ x: bx + rng.range(10, bw - 10), y: by + rng.range(10, bh - 10), r: rng.range(9, 15) });
        }
        continue;
      }
      if (i === 7 && j === 1) {
        parks.push({ x: bx, y: by, w: bw, h: bh, plaza: true });
        continue;
      }
      const count = rng.int(1, 3);
      const colorIndex = rng.int(0, PALETTE.building.length - 1);
      for (let k = 0; k < count; k++) {
        const w = rng.range(bw * 0.3, bw * 0.62);
        const h = rng.range(bh * 0.3, bh * 0.62);
        const x = bx + rng.range(4, Math.max(5, bw - w - 4));
        const y = by + rng.range(4, Math.max(5, bh - h - 4));
        buildings.push({
          x, y, w, h,
          color: PALETTE.building[colorIndex],
          roof: PALETTE.roof[colorIndex],
          height: rng.range(14, 46),
        });
      }
      if (rng.chance(0.5)) {
        trees.push({ x: bx + rng.range(8, bw - 8), y: by + rng.range(8, bh - 8), r: rng.range(8, 13) });
      }
    }
  }

  // Landmarks the missions and the minimap point at. All sit on roads.
  const landmarks = {
    safehouse: { x: roadsV[1], y: roadsH[5], label: 'Safehouse' },
    chopshop: { x: roadsV[8], y: roadsH[2], label: 'Chop Shop' },
    docks: { x: roadsV[9], y: roadsH[1], label: 'The Docks' },
    warehouse: { x: roadsV[2], y: roadsH[1], label: 'Warehouse' },
    tower: { x: roadsV[5], y: roadsH[2], label: 'Vega Tower' },
    hospital: { x: roadsV[3], y: roadsH[4], label: 'Clinic' },
    marina: { x: roadsV[6], y: roadsH[5], label: 'Marina' },
  };

  function onRoadX(x) {
    return roadsV.some((rx) => Math.abs(x - rx) <= ROAD_W / 2);
  }
  function onRoadY(y) {
    return roadsH.some((ry) => Math.abs(y - ry) <= ROAD_W / 2);
  }

  function isRoad(x, y) {
    return onRoadX(x) || onRoadY(y);
  }

  // The road a point is on, if any: its direction and centreline.
  function roadAt(x, y) {
    for (const rx of roadsV) {
      if (Math.abs(x - rx) <= ROAD_W / 2) return { dir: 'v', at: rx };
    }
    for (const ry of roadsH) {
      if (Math.abs(y - ry) <= ROAD_W / 2) return { dir: 'h', at: ry };
    }
    return null;
  }

  function nearestRoadPoint(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const rx of roadsV) {
      const d = Math.abs(x - rx);
      if (d < bestD) { bestD = d; best = { x: rx, y }; }
    }
    for (const ry of roadsH) {
      const d = Math.abs(y - ry);
      if (d < bestD) { bestD = d; best = { x, y: ry }; }
    }
    return best;
  }

  // Circle-vs-building collision; the sea and the map edge block too.
  function hitsBuilding(x, y, r) {
    if (x < r || x > WORLD_W - r || y < r || y > WORLD_H - r) return true;
    if (y > SEA_Y - 6) return true;
    for (const b of buildings) {
      const cx = Math.max(b.x, Math.min(x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(y, b.y + b.h));
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }

  // Slide a circle out of whatever it overlaps: try each axis alone first.
  function moveCircle(x, y, dx, dy, r) {
    let nx = x + dx;
    let ny = y + dy;
    if (hitsBuilding(nx, y, r)) nx = x;
    if (hitsBuilding(nx, ny, r)) ny = y;
    if (hitsBuilding(nx, ny, r)) { nx = x; ny = y; }
    return { x: nx, y: ny, blocked: nx === x && ny === y && (dx !== 0 || dy !== 0) };
  }

  function randomRoadPoint(r) {
    if (r.chance(0.5)) {
      return { x: r.pick(roadsV), y: r.range(80, BEACH_Y - 80) };
    }
    return { x: r.range(80, WORLD_W - 80), y: r.pick(roadsH) };
  }

  return {
    seed, roadsV, roadsH, buildings, trees, parks, landmarks,
    isRoad, roadAt, nearestRoadPoint, hitsBuilding, moveCircle, randomRoadPoint,
  };
}
