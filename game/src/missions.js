// Neon Harbor — the story: six jobs for the fixer Marisol Vega, each a chain
// of objectives (go somewhere, steal a car, take out a crew, lose the heat).
// Missions start when the player reaches their marker; finishing one pays
// out, saves the game and unlocks the next.

import { setWanted } from './police.js';
import { spawnThug } from './pedestrians.js';

export const MISSIONS = [
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    giver: 'Marisol Vega',
    brief: 'A buyer in the Marina wants wheels, no questions. Steal a car and bring it to the Chop Shop.',
    reward: 500,
    start: 'safehouse',
    objectives: [
      { type: 'enter_car', label: 'Steal a car — walk up to one and press E' },
      { type: 'goto', at: 'chopshop', radius: 90, label: 'Deliver the car to the Chop Shop' },
    ],
  },
  {
    id: 'package-run',
    title: 'Package Run',
    giver: 'Marisol Vega',
    brief: 'Three packages, three drop-offs, one clock. Drive like the rent is due — because it is.',
    reward: 800,
    start: 'safehouse',
    timeLimit: 150,
    objectives: [
      { type: 'goto', at: 'marina', radius: 80, label: 'Drop-off 1 of 3 — the Marina' },
      { type: 'goto', at: 'warehouse', radius: 80, label: 'Drop-off 2 of 3 — the Warehouse' },
      { type: 'goto', at: 'tower', radius: 80, label: 'Drop-off 3 of 3 — Vega Tower' },
    ],
  },
  {
    id: 'debt-collector',
    title: 'Collect the Debt',
    giver: 'Marisol Vega',
    brief: 'The Dockside crew owes the syndicate twelve hundred and a lesson. Collect both.',
    reward: 1200,
    start: 'warehouse',
    objectives: [
      { type: 'eliminate', count: 4, label: 'Deal with the Dockside crew (0/4)' },
      { type: 'goto', at: 'safehouse', radius: 90, label: 'Bring the cash back to the Safehouse' },
    ],
    onStart(world) {
      const at = world.city.landmarks.warehouse;
      for (let i = 0; i < 4; i++) {
        spawnThug(world, at.x + (i - 1.5) * 60, at.y + (i % 2 === 0 ? 50 : -50));
      }
    },
  },
  {
    id: 'heat-wave',
    title: 'Heat Wave',
    giver: 'Marisol Vega',
    brief: 'The Harbor PD is sweeping the district tonight. Stay out of their sight until the heat dies down.',
    reward: 1000,
    start: 'safehouse',
    objectives: [
      { type: 'evade', label: 'Lose the heat — get back to zero stars' },
    ],
    onStart(world) {
      setWanted(world, 3);
    },
  },
  {
    id: 'dockside-grab',
    title: 'Dockside Grab',
    giver: 'Marisol Vega',
    brief: 'A briefcase full of leverage is sitting on the docks. Grab it and bring it home — the cops will notice.',
    reward: 2000,
    start: 'docks',
    objectives: [
      { type: 'pickup', at: 'docks', radius: 60, label: 'Grab the briefcase on the docks' },
      { type: 'goto', at: 'safehouse', radius: 90, label: 'Escape to the Safehouse with the briefcase' },
    ],
    onPickup(world) {
      setWanted(world, 2);
      world.flash('THE COPS ARE ONTO YOU', '#ff5964');
    },
  },
  {
    id: 'kingpins-fall',
    title: "The Kingpin's Fall",
    giver: 'Marisol Vega',
    brief: 'Vega Tower. The Kingpin and his whole guard. End it tonight, and Neon Harbor is yours.',
    reward: 5000,
    start: 'tower',
    objectives: [
      { type: 'eliminate', count: 7, label: 'Take down the Kingpin and his guards (0/7)' },
      { type: 'goto', at: 'safehouse', radius: 90, label: 'Drive home a legend' },
    ],
    onStart(world) {
      const at = world.city.landmarks.tower;
      for (let i = 0; i < 6; i++) {
        spawnThug(world, at.x + (i - 2.5) * 70, at.y + (i % 2 === 0 ? 60 : -60));
      }
      const boss = spawnThug(world, at.x, at.y + 110);
      boss.hp = 260;
      boss.color = '#7209b7';
      boss.speed = 175;
    },
  },
];

export function createMissions(world) {
  const manager = {
    index: 0,
    completed: [],
    active: null, // { def, objective: number, kills: number, timer: number }

    next() {
      return MISSIONS[manager.index] || null;
    },

    currentObjective() {
      if (!manager.active) return null;
      return manager.active.def.objectives[manager.active.objective] || null;
    },

    objectiveLabel() {
      const obj = manager.currentObjective();
      if (!obj) return '';
      if (obj.type === 'eliminate') {
        return obj.label.replace(/\(\d+\/\d+\)/, `(${manager.active.kills}/${obj.count})`);
      }
      return obj.label;
    },

    // The world position an objective points at, for the beacon and minimap.
    objectiveTarget() {
      const obj = manager.currentObjective();
      if (!obj || !obj.at) return null;
      const mark = world.city.landmarks[obj.at];
      return mark ? { x: mark.x, y: mark.y, label: mark.label } : null;
    },

    startAt() {
      const next = manager.next();
      if (!next) return null;
      return world.city.landmarks[next.start] || null;
    },

    start(i) {
      const def = MISSIONS[i];
      if (!def) return false;
      manager.active = { def, objective: 0, kills: 0, timer: def.timeLimit || 0 };
      manager.index = i;
      world.flash(`MISSION: ${def.title.toUpperCase()}`, '#ffd166');
      world.say(`${def.giver}: ${def.brief}`);
      world.audio.missionStart();
      if (def.onStart) def.onStart(world);
      return true;
    },

    registerKill(ped) {
      const obj = manager.currentObjective();
      if (manager.active && obj && obj.type === 'eliminate' && ped.hostile) {
        manager.active.kills += 1;
      }
    },

    advance() {
      const active = manager.active;
      if (!active) return;
      active.objective += 1;
      world.audio.pickup();
      if (active.objective >= active.def.objectives.length) manager.complete();
    },

    complete() {
      const active = manager.active;
      if (!active) return;
      world.money += active.def.reward;
      manager.completed.push(active.def.id);
      manager.index = MISSIONS.indexOf(active.def) + 1;
      manager.active = null;
      world.flash(`MISSION COMPLETE — $${active.def.reward.toLocaleString('en-US')}`, '#4ecdc4');
      world.say(`${active.def.giver}: Nice work. The money is yours.`);
      world.audio.missionDone();
      world.audio.cash();
      world.save();
      if (manager.index >= MISSIONS.length) {
        world.storyComplete = true;
        world.endState = 'complete';
      }
    },

    fail(reason) {
      if (!manager.active) return;
      world.flash(`MISSION FAILED — ${reason.toUpperCase()}`, '#ff5964');
      world.audio.failed();
      manager.active = null;
    },

    update(dt) {
      // Start the next mission when the player reaches its marker.
      if (!manager.active) {
        const next = manager.next();
        const at = manager.startAt();
        if (next && at) {
          const d = Math.hypot(world.player.x - at.x, world.player.y - at.y);
          if (d < 90) manager.start(manager.index);
        }
        return;
      }
      const active = manager.active;
      if (active.def.timeLimit) {
        active.timer -= dt;
        if (active.timer <= 0) {
          manager.fail('out of time');
          return;
        }
      }
      const obj = manager.currentObjective();
      if (!obj) return;
      const player = world.player;
      if (obj.type === 'goto' || obj.type === 'pickup') {
        const mark = world.city.landmarks[obj.at];
        const d = Math.hypot(player.x - mark.x, player.y - mark.y);
        if (d < (obj.radius || 80)) {
          if (obj.type === 'pickup' && active.def.onPickup) active.def.onPickup(world);
          manager.advance();
        }
      } else if (obj.type === 'enter_car') {
        if (!player.onFoot) manager.advance();
      } else if (obj.type === 'eliminate') {
        if (active.kills >= obj.count) manager.advance();
      } else if (obj.type === 'evade') {
        if (world.heat <= 0) manager.advance();
      }
    },
  };
  return manager;
}
