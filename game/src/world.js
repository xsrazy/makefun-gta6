// The world: everything alive in Solmar Bay, and the one step that moves it all. The
// player on foot or in a car, traffic, pedestrians, police, enemies, bullets, particles,
// pickups and the mission state machine all advance here, in fixed 1/60 s steps. The
// world knows nothing about screens or sound: it returns what happened as event flags
// and the boot code reacts (sound, banners, screen changes).

import { GARAGE, PACKAGES, PEDESTRIANS, PISTOL, PLAYER, SHORE, TRAFFIC, WANTED, WORLD } from './config.js';
import { PLACES, createCity, randomRoadPoint, randomSidewalkPoint, resolveSolidCollision } from './city.js';
import { createRandom } from './random.js';
import { createCar, assignLane, collideCars, damageCar, driveCar, updateTrafficCar } from './vehicles.js';
import { createPed, knockDownPed, scarePeds, spawnPeds, updatePeds } from './pedestrians.js';
import { addHeat, maintainPolice, maybeDeployFootCop, policeCanSeePlayer, starsForHeat, updateFootCops, updatePoliceCar, updateWanted } from './police.js';
import { firePistol, punch, updateBullets } from './combat.js';
import { createMissionState, currentObjective, missionById, nextMission, startMission, updateDialog, updateMission } from './missions.js';
import { saveGame } from './save.js';

export const EVENT_SHOT = 1;
export const EVENT_PUNCH = 2;
export const EVENT_CRASH = 4;
export const EVENT_PICKUP = 8;
export const EVENT_CASH = 16;
export const EVENT_MISSION_PASSED = 32;
export const EVENT_MISSION_FAILED = 64;
export const EVENT_WASTED = 128;
export const EVENT_BUSTED = 256;
export const EVENT_WANTED_UP = 512;
export const EVENT_EXPLOSION = 1024;
export const EVENT_STEAL = 2048;

const TRAFFIC_TYPES = ['sedan', 'sedan', 'sedan', 'coupe', 'pickup', 'taxi', 'taxi', 'van', 'sports'];
const PARKED_TYPES = ['sedan', 'coupe', 'pickup', 'van', 'sports', 'sedan'];

function spawnTraffic(state, count) {
  for (let i = 0; i < count; i += 1) {
    const p = randomRoadPoint(state.random);
    const type = TRAFFIC_TYPES[Math.floor(state.random() * TRAFFIC_TYPES.length)];
    const car = createCar(type, p.x, p.y, 0, null, 'traffic');
    assignLane(car, state.random);
    car.speed = car.cruise * 0.7;
    car.id = state.nextCarId++;
    state.cars.push(car);
  }
}

function spawnParkedCars(state, count) {
  for (let i = 0; i < count; i += 1) {
    const p = randomSidewalkPoint(state.random);
    const type = PARKED_TYPES[Math.floor(state.random() * PARKED_TYPES.length)];
    const angle = state.random() < 0.5 ? 0 : Math.PI / 2;
    const car = createCar(type, p.x, p.y, angle, null, 'parked');
    car.id = state.nextCarId++;
    state.cars.push(car);
  }
}

function spawnPickups(state) {
  state.packages = [];
  for (let i = 0; i < PACKAGES.count; i += 1) {
    const p = randomSidewalkPoint(state.random);
    state.packages.push({ x: p.x, y: p.y, found: false, bob: state.random() * Math.PI * 2 });
  }
  state.healthPacks = [];
  state.ammoPacks = [];
  for (let i = 0; i < 6; i += 1) {
    const p = randomSidewalkPoint(state.random);
    state.healthPacks.push({ x: p.x, y: p.y, taken: false });
    const q = randomSidewalkPoint(state.random);
    state.ammoPacks.push({ x: q.x, y: q.y, taken: false });
  }
}

export function createWorld(seed, saveData) {
  const random = createRandom(seed);
  const city = createCity(random);
  const state = {
    random,
    city,
    time: 0,
    player: {
      x: PLACES.safehouse.x, y: PLACES.safehouse.y,
      vx: 0, vy: 0,
      angle: Math.PI / 2,
      radius: PLAYER.radius,
      health: PLAYER.health,
      money: PLAYER.startMoney,
      ammo: PLAYER.startAmmo,
      car: null,
      punchTimer: 0,
      shootTimer: 0,
      hurtTimer: 0,
      aimAngle: 0,
      dead: false,
    },
    cars: [],
    peds: [],
    footCops: [],
    enemies: [],
    bullets: [],
    particles: [],
    packages: [],
    healthPacks: [],
    ammoPacks: [],
    wanted: 0,
    heat: 0,
    lastCrimeAt: -100,
    missionsDone: [],
    mission: createMissionState(),
    nextMissionTimer: 1.5,
    retryMission: 0,
    storyDone: false,
    kills: 0,
    carsStolen: 0,
    camera: { x: PLACES.safehouse.x, y: PLACES.safehouse.y },
    nextCarId: 1,
    messages: [],
    garageArmed: true,
    dialog: null,
    repoCar: null,
  };

  if (saveData) {
    state.player.money = saveData.money;
    state.player.health = saveData.health;
    state.player.x = saveData.x;
    state.player.y = saveData.y;
    state.player.ammo = saveData.ammo;
    state.missionsDone = [...saveData.missionsDone];
    state.time = saveData.time || 0;
    state.kills = saveData.kills || 0;
    state.carsStolen = saveData.carsStolen || 0;
    state.camera.x = saveData.x;
    state.camera.y = saveData.y;
  }

  spawnTraffic(state, TRAFFIC.count);
  spawnParkedCars(state, 14);
  state.peds = spawnPeds(PEDESTRIANS.count, random);
  spawnPickups(state);
  if (saveData) {
    for (let i = 0; i < state.packages.length && i < (saveData.packagesFound || []).length; i += 1) {
      state.packages[i].found = saveData.packagesFound[i];
    }
  }
  // Danny's own sedan, parked outside the safehouse, facing the road east.
  const ownCar = createCar('sedan', PLACES.safehouse.x + 70, PLACES.safehouse.y + 20, 0, '#4f7ec9', 'parked');
  ownCar.id = state.nextCarId++;
  state.cars.push(ownCar);

  function addMessage(text) {
    state.messages.push({ text, timer: 4 });
    if (state.messages.length > 4) state.messages.shift();
  }

  function addParticles(x, y, count, color, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      if (state.particles.length > 320) return;
      const a = random() * Math.PI * 2;
      const s = speed * (0.3 + random() * 0.7);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * (0.6 + random() * 0.6),
        maxLife: life,
        color,
        size: size * (0.6 + random() * 0.8),
      });
    }
  }

  function beginMission(mission) {
    startMission(state.mission, mission);
    const setup = mission.setup ?? {};
    if (setup.heat) addHeat(state, setup.heat);
    if (setup.clearHeat) {
      state.heat = 0;
      state.wanted = 0;
    }
    if (setup.spawnRepoCar) {
      const car = createCar('coupe', PLACES.stadium.x + 40, PLACES.stadium.y + 60, 0, '#d8a03c', 'parked');
      car.id = 'repo';
      car.name = 'Gold Solstice GT';
      state.repoCar = car;
      state.cars.push(car);
    }
    if (setup.spawnEnemies) {
      state.enemies = [];
      for (let i = 0; i < setup.spawnEnemies; i += 1) {
        const angle = (i / setup.spawnEnemies) * Math.PI * 2;
        const enemy = createPed(
          PLACES.docks.x + Math.cos(angle) * (90 + random() * 140),
          PLACES.docks.y + Math.sin(angle) * (60 + random() * 100),
          random,
        );
        enemy.armed = true;
        enemy.shirt = '#3a2e2e';
        enemy.health = 50;
        enemy.shootTimer = 1 + random();
        state.enemies.push(enemy);
      }
      addMessage('The Vultures are at the docks. Take them down.');
    }
  }

  function failMission(reason) {
    const mission = state.mission.active;
    if (!mission) return 0;
    state.mission.active = null;
    state.mission.banner = { text: 'MISSION FAILED', sub: reason, kind: 'failed', timer: 4 };
    state.retryMission = mission.id;
    state.nextMissionTimer = 5;
    state.enemies = [];
    return EVENT_MISSION_FAILED;
  }

  function completeMission() {
    const mission = state.mission.active;
    state.missionsDone.push(mission.id);
    state.player.money += mission.reward;
    state.mission.active = null;
    state.enemies = [];
    if (state.repoCar) {
      // Handing the coupe over: if Danny is still sitting in it, he gets out first,
      // or he would be left driving a car the world no longer has.
      if (state.player.car === state.repoCar) {
        state.player.car = null;
        state.player.x = state.repoCar.x + 40;
        state.player.y = state.repoCar.y;
        addMessage('The coupe is Marina\u2019s now.');
      }
      state.cars = state.cars.filter((c) => c !== state.repoCar);
      state.repoCar = null;
    }
    saveGame(state);
    const next = nextMission(state.missionsDone);
    if (next) {
      state.nextMissionTimer = 3;
    } else {
      state.storyDone = true;
      state.mission.banner = { text: 'STORY COMPLETE', sub: 'Solmar Bay is yours. Free roam!', kind: 'passed', timer: 6 };
    }
    return EVENT_MISSION_PASSED;
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const car of state.cars) {
      if (car.dead) continue;
      const d = Math.hypot(car.x - x, car.y - y);
      if (d < bestDist) { bestDist = d; best = car; }
    }
    return best;
  }

  function witnessNearby(x, y) {
    if (policeCanSeePlayer(state)) return true;
    for (const ped of state.peds) {
      if (Math.hypot(ped.x - x, ped.y - y) < 260) return true;
    }
    return false;
  }

  function enterCar(car) {
    const p = state.player;
    if (car.driver === 'traffic') {
      // Yank the driver out: they flee on foot, and it is a crime if anyone saw it.
      const driver = createPed(car.x + 26, car.y, random);
      driver.state = 'flee';
      driver.fleeFrom = { x: p.x, y: p.y };
      driver.stateTimer = 4;
      state.peds.push(driver);
      state.carsStolen += 1;
      if (witnessNearby(car.x, car.y)) {
        addHeat(state, WANTED.stealCar);
        addMessage('Car stolen! Someone saw you.');
      } else {
        addMessage('Car stolen. Nobody saw a thing.');
      }
    } else if (car.driver === 'police') {
      state.carsStolen += 1;
      addHeat(state, 40);
      addMessage('You stole a police car!');
    } else if (car === state.repoCar) {
      addMessage('The gold coupe is yours. Get it to the garage.');
    }
    car.driver = 'player';
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    p.vx = 0;
    p.vy = 0;
    return car;
  }

  function exitCar() {
    const p = state.player;
    const car = p.car;
    if (!car) return;
    car.driver = 'parked';
    car.speed = 0;
    p.car = null;
    const side = Math.PI / 2;
    p.x = car.x + Math.cos(car.angle + side) * 34;
    p.y = car.y + Math.sin(car.angle + side) * 34;
    p.vx = 0;
    p.vy = 0;
    p.angle = car.angle;
    resolveSolidCollision(city, p);
  }

  function explodeCar(car) {
    addParticles(car.x, car.y, 40, '#ff8c2e', 260, 0.8, 7);
    addParticles(car.x, car.y, 24, '#3a3a3a', 120, 1.6, 10);
    addParticles(car.x, car.y, 18, '#ffd60a', 320, 0.4, 5);
    const p = state.player;
    const d = Math.hypot(p.x - car.x, p.y - car.y);
    if (d < 130) {
      p.health -= Math.round(70 * (1 - d / 130));
      addParticles(p.x, p.y, 10, '#ff5a4d', 160, 0.5, 5);
    }
    for (const other of state.cars) {
      if (other === car || other.dead) continue;
      if (Math.hypot(other.x - car.x, other.y - car.y) < 120) damageCar(other, 60);
    }
    // An explosion only raises the heat when the player caused it (shot the car up
    // recently, or it was the player's own car): a patrol car wrecking itself on a
    // building is the SBPD's problem, not Danny's.
    const playerCaused = car.driver === 'player' || (car.playerDamagedAt !== undefined && state.time - car.playerDamagedAt < 10);
    if (playerCaused && d < 600) addHeat(state, WANTED.explosion);
    state.cars = state.cars.filter((c) => c !== car);
    if (p.car === car) {
      p.car = null;
      p.x = car.x + 40;
      p.y = car.y;
    }
  }

  function updatePlayer(dt, controls) {
    const p = state.player;
    let events = 0;
    p.punchTimer = Math.max(0, p.punchTimer - dt);
    p.shootTimer = Math.max(0, p.shootTimer - dt);
    p.hurtTimer = Math.max(0, p.hurtTimer - dt);

    if (p.car) {
      const car = p.car;
      const crashed = driveCar(car, controls.throttle, controls.steer, dt, city, controls.handbrake);
      if (crashed) {
        events |= EVENT_CRASH;
        addParticles(car.x, car.y, 8, '#ffd60a', 140, 0.4, 4);
        if (Math.abs(car.speed) > 200) scarePeds(state.peds, car.x, car.y, 200);
      }
      p.x = car.x;
      p.y = car.y;
      p.vx = Math.cos(car.angle) * car.speed;
      p.vy = Math.sin(car.angle) * car.speed;
      p.angle = car.angle;
      if (controls.enter) exitCar();
      return events;
    }

    // On foot: accelerate toward the wish direction, face where the player aims or walks.
    const mx = controls.moveX;
    const my = controls.moveY;
    const top = controls.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    p.vx += (mx * top - p.vx) * Math.min(1, dt * 10);
    p.vy += (my * top - p.vy) * Math.min(1, dt * 10);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.x = Math.max(16, Math.min(WORLD.width - 16, p.x));
    p.y = Math.max(16, Math.min(SHORE.sandTop - 6, p.y));
    resolveSolidCollision(city, p);
    const moving = Math.hypot(p.vx, p.vy) > 20;
    if (controls.aiming) p.angle = Math.atan2(controls.aimY - p.y, controls.aimX - p.x);
    else if (moving) p.angle = Math.atan2(p.vy, p.vx);
    p.aimAngle = p.angle;

    if (controls.enter) {
      const car = nearestCar(p.x, p.y, 78);
      if (car) {
        const entered = enterCar(car);
        state.enteredCarThisFrame = entered;
        events |= EVENT_STEAL;
      }
    }
    if (controls.punch && p.punchTimer <= 0) {
      p.punchTimer = PLAYER.punchCooldown;
      events |= EVENT_PUNCH;
      const victim = punch(p.x, p.y, p.angle, { peds: state.peds, enemies: state.enemies });
      if (victim) {
        addParticles(victim.x, victim.y, 6, '#ff5a4d', 120, 0.4, 4);
        if (victim.health <= 0 && victim.armed) {
          state.kills += 1;
          state.mission.kills += 1;
        } else if (!victim.armed) {
          knockDownPed(victim, 3);
          addHeat(state, WANTED.hitPedestrian);
          scarePeds(state.peds, p.x, p.y, 260);
        }
      }
    }
    if (controls.firing && p.shootTimer <= 0 && p.ammo > 0) {
      p.shootTimer = PISTOL.cooldown;
      p.ammo -= 1;
      events |= EVENT_SHOT;
      firePistol(state.bullets, p.x, p.y, p.angle, 'player', random);
      addParticles(p.x + Math.cos(p.angle) * 24, p.y + Math.sin(p.angle) * 24, 3, '#ffd60a', 90, 0.15, 3);
      scarePeds(state.peds, p.x, p.y, 320);
      if (policeCanSeePlayer(state)) addHeat(state, WANTED.shootNearPolice);
    }
    return events;
  }

  function updateEnemies(dt) {
    const p = state.player;
    for (const enemy of state.enemies) {
      if (enemy.health <= 0) continue;
      const dx = p.x - enemy.x;
      const dy = p.y - enemy.y;
      const dist = Math.hypot(dx, dy);
      enemy.angle = Math.atan2(dy, dx);
      if (dist > 300) {
        enemy.x += Math.cos(enemy.angle) * 130 * dt;
        enemy.y += Math.sin(enemy.angle) * 130 * dt;
        enemy.stepPhase += dt * 12;
      } else if (dist < 180) {
        enemy.x -= Math.cos(enemy.angle) * 60 * dt;
        enemy.y -= Math.sin(enemy.angle) * 60 * dt;
      }
      resolveSolidCollision(city, enemy);
      enemy.shootTimer -= dt;
      if (enemy.shootTimer <= 0 && dist < 420) {
        enemy.shootTimer = 0.8 + random() * 0.9;
        firePistol(state.bullets, enemy.x, enemy.y, enemy.angle + (random() - 0.5) * 0.3, 'enemy', random);
      }
    }
    state.enemies = state.enemies.filter((e) => e.health > 0);
  }

  function updateCars(dt) {
    let events = 0;
    const p = state.player;
    for (const car of state.cars) {
      if (car.remove) continue;
      if (car.dead) {
        car.burnTimer -= dt;
        if (Math.random() < 0.3) addParticles(car.x, car.y, 1, '#3a3a3a', 40, 1.2, 8);
        if (car.burnTimer <= 0) {
          explodeCar(car);
          events |= EVENT_EXPLOSION;
        }
        continue;
      }
      if (car.driver === 'traffic') {
        updateTrafficCar(car, dt, city, state.cars, random);
        // Recycle traffic that has wandered far from the player.
        if (Math.hypot(car.x - p.x, car.y - p.y) > 1700) {
          const point = randomRoadPoint(random);
          car.x = p.x + (point.x - p.x) * 0.3 + (random() - 0.5) * 800;
          car.y = p.y + (point.y - p.y) * 0.3 + (random() - 0.5) * 600;
          car.x = Math.max(60, Math.min(WORLD.width - 60, car.x));
          car.y = Math.max(60, Math.min(SHORE.sandTop - 60, car.y));
          assignLane(car, random);
          car.speed = car.cruise * 0.7;
        }
      } else if (car.driver === 'police') {
        if (updatePoliceCar(car, state, dt)) events |= EVENT_CRASH;
      }
    }
    // Car against car.
    for (let i = 0; i < state.cars.length; i += 1) {
      for (let j = i + 1; j < state.cars.length; j += 1) {
        const a = state.cars[i];
        const b = state.cars[j];
        if (a.dead || b.dead) continue;
        const impact = collideCars(a, b);
        if (impact > 170) {
          events |= EVENT_CRASH;
          damageCar(a, (impact - 170) * 0.1);
          damageCar(b, (impact - 170) * 0.1);
          addParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#ffd60a', 130, 0.35, 4);
          if ((a.driver === 'player' && b.driver === 'police') || (b.driver === 'player' && a.driver === 'police')) {
            // Ramming a patrol car is a crime, but not one per impact: at most one
            // every few seconds, or a pile-up maxes the wanted level by itself.
            if (state.time - state.lastCrimeAt > 3) addHeat(state, WANTED.hitPoliceCar);
          }
        }
      }
    }
    // Cars against pedestrians on foot.
    for (const car of state.cars) {
      if (car.dead || Math.abs(car.speed) < 60) continue;
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - car.x, ped.y - car.y) < car.radius * 0.85) {
          if (knockDownPed(ped, 4)) {
            addParticles(ped.x, ped.y, 8, '#ff5a4d', 130, 0.5, 4);
            if (car.driver === 'player') {
              addHeat(state, WANTED.hitPedestrian);
              addMessage('You hit a pedestrian!');
            }
            scarePeds(state.peds, ped.x, ped.y, 280);
          }
        }
      }
      // Cars against the player on foot: a hit hurts, then a short grace window
      // so one car cannot run the player down in a single second.
      if (!p.car && p.hurtTimer <= 0 && Math.hypot(p.x - car.x, p.y - car.y) < car.radius * 0.85) {
        const impact = Math.abs(car.speed);
        if (impact > 60) {
          p.health -= Math.round(impact * 0.06);
          p.hurtTimer = 0.8;
          p.vx = Math.cos(car.angle) * 260;
          p.vy = Math.sin(car.angle) * 260;
          addParticles(p.x, p.y, 8, '#ff5a4d', 140, 0.5, 4);
          events |= EVENT_CRASH;
        }
      }
    }
    state.cars = state.cars.filter((c) => !c.remove);
    return events;
  }

  function updatePickups(dt) {
    const p = state.player;
    let events = 0;
    for (const pack of state.packages) {
      if (pack.found) continue;
      pack.bob += dt * 2;
      if (!p.car && Math.hypot(p.x - pack.x, p.y - pack.y) < 34) {
        pack.found = true;
        p.money += PACKAGES.reward;
        events |= EVENT_CASH;
        addMessage(`Hidden package found! +$${PACKAGES.reward}`);
        addParticles(pack.x, pack.y, 14, '#ffd60a', 140, 0.6, 5);
        const found = state.packages.filter((k) => k.found).length;
        if (found === PACKAGES.count) addMessage('All hidden packages found!');
      }
    }
    for (const pack of state.healthPacks) {
      if (pack.taken) continue;
      if (!p.car && Math.hypot(p.x - pack.x, p.y - pack.y) < 30 && p.health < PLAYER.health) {
        pack.taken = true;
        p.health = Math.min(PLAYER.health, p.health + 50);
        events |= EVENT_PICKUP;
        addMessage('Health restored +50');
      }
    }
    for (const pack of state.ammoPacks) {
      if (pack.taken) continue;
      if (!p.car && Math.hypot(p.x - pack.x, p.y - pack.y) < 30) {
        pack.taken = true;
        p.ammo += 30;
        events |= EVENT_PICKUP;
        addMessage('Ammo +30');
      }
    }
    return events;
  }

  function updateGarage() {
    const p = state.player;
    const d = Math.hypot(p.x - PLACES.garage.x, p.y - PLACES.garage.y);
    if (d > 110) {
      state.garageArmed = true;
      return 0;
    }
    if (!state.garageArmed || !p.car) return 0;
    const car = p.car;
    const needsRepair = car.health < car.maxHealth * 0.9;
    const needsClear = state.wanted > 0;
    if (!needsRepair && !needsClear) return 0;
    const cost = (needsRepair ? GARAGE.repairCost : 0) + (needsClear ? GARAGE.clearWantedCost : 0);
    if (p.money < cost) {
      addMessage(`Solano Garage: $${cost} needed. You have $${p.money}.`);
      state.garageArmed = false;
      return 0;
    }
    p.money -= cost;
    car.health = car.maxHealth;
    car.smoke = 0;
    state.heat = 0;
    state.wanted = 0;
    state.garageArmed = false;
    addMessage(`Solano Garage: repaired and resprayed. -$${cost}`);
    return EVENT_CASH;
  }

  function updateCamera(dt) {
    const p = state.player;
    const lookX = p.x + (p.vx ?? 0) * 0.35;
    const lookY = p.y + (p.vy ?? 0) * 0.35;
    const k = Math.min(1, dt * 4.5);
    state.camera.x += (lookX - state.camera.x) * k;
    state.camera.y += (lookY - state.camera.y) * k;
    state.camera.x = Math.max(640, Math.min(WORLD.width - 640, state.camera.x));
    state.camera.y = Math.max(360, Math.min(WORLD.height - 360, state.camera.y));
  }

  function step(controls, dt) {
    let events = 0;
    state.time += dt;
    state.enteredCarThisFrame = null;
    const wantedBefore = state.wanted;

    events |= updatePlayer(dt, controls);
    events |= updateCars(dt);
    const threats = [];
    if (events & EVENT_SHOT) threats.push({ x: state.player.x, y: state.player.y, radius: 340 });
    if (state.player.car && Math.abs(state.player.car.speed) > 300) {
      threats.push({ x: state.player.x, y: state.player.y, radius: 200 });
    }
    updatePeds(state.peds, dt, city, random, threats);
    updateEnemies(dt);

    // Bullets and their consequences.
    updateBullets(state.bullets, dt, city, {
      player: state.player.car ? null : state.player,
      cars: state.cars,
      peds: state.peds,
      enemies: state.enemies,
    }, {
      spark: (x, y) => addParticles(x, y, 4, '#ffd60a', 110, 0.25, 3),
      playerHit: (damage) => {
        state.player.health -= damage;
        addParticles(state.player.x, state.player.y, 6, '#ff5a4d', 120, 0.4, 4);
      },
      carHit: (car, damage, owner) => {
        damageCar(car, damage);
        if (owner === 'player') car.playerDamagedAt = state.time;
        addParticles(car.x, car.y, 4, '#ffd60a', 110, 0.3, 3);
        if (owner === 'player' && car.driver === 'police') addHeat(state, WANTED.hitPoliceCar);
        if (owner === 'player' && car.driver === 'traffic' && witnessNearby(car.x, car.y)) addHeat(state, 8);
      },
      pedHit: (ped, damage) => {
        ped.health -= damage;
        addParticles(ped.x, ped.y, 6, '#ff5a4d', 120, 0.4, 4);
        knockDownPed(ped, 5);
        addHeat(state, WANTED.hitPedestrian);
        scarePeds(state.peds, ped.x, ped.y, 300);
      },
      enemyHit: (enemy, damage) => {
        enemy.health -= damage;
        addParticles(enemy.x, enemy.y, 6, '#ff5a4d', 120, 0.4, 4);
        if (enemy.health <= 0) {
          state.kills += 1;
          state.mission.kills += 1;
          addParticles(enemy.x, enemy.y, 16, '#ff5a4d', 160, 0.6, 5);
        }
      },
    });

    // Foot cops' queued shots.
    for (const cop of state.footCops) {
      if (cop.wantsShot) {
        firePistol(state.bullets, cop.x, cop.y, cop.wantsShot.angle, 'police', random);
        cop.wantsShot = null;
        events |= EVENT_SHOT;
      }
    }

    updateWanted(state, dt);
    maintainPolice(state, random);
    maybeDeployFootCop(state, random);
    const busted = updateFootCops(state, dt, random);
    if (busted === 'busted') events |= EVENT_BUSTED;

    events |= updatePickups(dt);
    events |= updateGarage();

    // Mission flow: start the next one, advance the running one, retry a failed one.
    if (!state.mission.active && !state.storyDone) {
      state.nextMissionTimer -= dt;
      if (state.nextMissionTimer <= 0) {
        if (state.retryMission) {
          const mission = missionById(state.retryMission);
          state.retryMission = 0;
          beginMission(mission);
        } else {
          const next = nextMission(state.missionsDone);
          if (next) beginMission(next);
        }
      }
    }
    if (state.mission.active) {
      const entered = state.enteredCarThisFrame;
      const result = updateMission(state.mission, dt, {
        enteredCar: !!entered,
        enteredCarId: entered ? entered.id : null,
        playerPos: state.player,
        inCar: !!state.player.car,
        wanted: state.wanted,
      });
      if (result === 'complete') events |= completeMission();
      else if (result === 'failed') events |= failMission('Out of time.');
    }
    state.dialog = updateDialog(state.mission, dt);

    if (state.mission.banner) {
      state.mission.banner.timer -= dt;
      if (state.mission.banner.timer <= 0) state.mission.banner = null;
    }
    for (const m of state.messages) m.timer -= dt;
    state.messages = state.messages.filter((m) => m.timer > 0);

    for (const pt of state.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 1 - 2 * dt;
      pt.vy *= 1 - 2 * dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);

    if (state.wanted > wantedBefore) events |= EVENT_WANTED_UP;
    if (state.player.health <= 0 && !state.player.dead) {
      state.player.dead = true;
      events |= EVENT_WASTED;
      if (state.mission.active) failMission('Danny was wasted.');
    }
    if (events & EVENT_BUSTED) {
      if (state.mission.active) failMission('Danny was busted.');
    }

    updateCamera(dt);
    return events;
  }

  /** The title screen's backdrop: traffic and pedestrians live, the camera drifts. */
  function stepAttract(dt) {
    state.time += dt;
    for (const car of state.cars) {
      if (car.driver === 'traffic') updateTrafficCar(car, dt, city, state.cars, random);
    }
    updatePeds(state.peds, dt, city, random, []);
    const t = state.time * 0.05;
    state.camera.x = 2150 + Math.cos(t) * 700;
    state.camera.y = 1850 + Math.sin(t * 0.7) * 500;
    state.camera.x = Math.max(640, Math.min(WORLD.width - 640, state.camera.x));
    state.camera.y = Math.max(360, Math.min(WORLD.height - 360, state.camera.y));
    for (const pt of state.particles) pt.life -= dt;
    state.particles = state.particles.filter((pt) => pt.life > 0);
  }

  function respawn(place) {
    const p = state.player;
    const target = place === 'hospital' ? PLACES.hospital : PLACES.policeHQ;
    p.x = target.x;
    p.y = target.y;
    p.vx = 0;
    p.vy = 0;
    p.health = PLAYER.health;
    p.dead = false;
    p.car = null;
    state.wanted = 0;
    state.heat = 0;
    state.footCops = [];
    state.cars = state.cars.filter((c) => c.driver !== 'police');
    p.money = Math.max(0, p.money - Math.round(p.money * 0.1));
    state.camera.x = p.x;
    state.camera.y = p.y;
    addMessage(place === 'hospital' ? 'Bay General patched you up. -$10% for the bill.' : 'The SBPD let you go. -$10% in fines.');
  }

  // Note: a fresh game is a fresh createWorld call from the boot code, so the city,
  // the traffic and the random stream all regenerate together.

  /** Restart the running mission from its first step (pause menu). */
  function restartMission() {
    const mission = state.mission.active;
    if (!mission) return false;
    state.mission.active = null;
    state.enemies = [];
    state.retryMission = mission.id;
    state.nextMissionTimer = 0.5;
    state.heat = Math.max(0, state.heat - 60);
    state.wanted = starsForHeat(state.heat);
    addMessage(`Restarting: ${mission.title}`);
    return true;
  }

  return {
    state,
    step,
    stepAttract,
    respawn,
    restartMission,
    addMessage,
    addParticles,
    beginMission,
    currentObjective: () => currentObjective(state.mission),
  };
}
