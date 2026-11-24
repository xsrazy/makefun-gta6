// Neon Harbor — the world: one object holding every system, and the update
// that ties them together. The player, the camera, messages, damage, saving
// and the debug hooks the verification drivers use all live here.

import { CAR, PLAYER, WORLD_H, WORLD_W } from './config.js';
import { generateCity } from './city.js';
import { Rng } from './random.js';
import { drivePlayerCar, nearestCar, spawnParked, spawnTraffic, updateCars } from './vehicles.js';
import { spawnPeds, updatePeds } from './pedestrians.js';
import { addHeat, setWanted, updatePolice, wantedStars } from './police.js';
import { burst, fireBullet, updateBullets, updateParticles } from './combat.js';
import { createMissions } from './missions.js';
import { saveGame } from './save.js';
import { ACT_ENTER, ACT_RELOAD } from './input.js';

export function createWorld(seed, audio, saveData = null) {
  const rng = new Rng(seed);
  const city = generateCity(seed);
  const home = city.landmarks.safehouse;

  const world = {
    seed, rng, city, audio,
    time: 0,
    money: 0,
    heat: 0,
    lastCrimeAt: -100,
    lastDamageAt: -100,
    spawnTimer: 0,
    bustTimer: 0,
    autosaveTimer: 30,
    endState: null, // 'wasted' | 'busted' | 'complete'
    storyComplete: false,
    shake: 0,
    hurtFlash: 0,
    camera: { x: home.x, y: home.y },
    view: { w: 1280, h: 800 },
    stats: { kills: 0, carsStolen: 0, shotsFired: 0, crashes: 0 },
    flashes: [],
    feed: [],
    bullets: [],
    particles: [],
    cars: [],
    peds: [],
    player: {
      x: home.x, y: home.y,
      angle: -Math.PI / 2,
      aimAngle: 0,
      onFoot: true,
      car: null,
      health: PLAYER.maxHealth,
      ammo: PLAYER.magSize,
      reloading: false,
      reloadTimer: 0,
      shootTimer: 0,
    },
  };

  world.cars = [...spawnTraffic(city, rng), ...spawnParked(city, rng)];
  // A getaway car parked right by the safehouse, so the first job starts fast.
  const starter = world.cars.find((c) => c.driver === 'parked');
  if (starter) {
    starter.x = home.x + 40;
    starter.y = home.y + 10;
    starter.color = '#e63946';
  }
  world.peds = spawnPeds(city, rng);
  world.missions = createMissions(world);

  if (saveData) {
    world.money = saveData.money;
    world.player.health = saveData.health;
    world.player.x = saveData.x;
    world.player.y = saveData.y;
    world.camera.x = saveData.x;
    world.camera.y = saveData.y;
    world.missions.index = Math.min(saveData.missionIndex, 6);
    world.missions.completed = saveData.missionsDone || [];
    if (saveData.stats) world.stats = { ...world.stats, ...saveData.stats };
  }

  world.flash = (text, color) => {
    world.flashes.push({ text, color: color || '#ffd166', t: 0, dur: 2.6 });
    if (world.flashes.length > 2) world.flashes.shift();
  };

  world.say = (text) => {
    world.feed.push({ text, t: 0, dur: 5 });
    if (world.feed.length > 3) world.feed.shift();
  };

  world.burst = (x, y, color, count, speed) => burst(world, x, y, color, count, speed);
  world.fireBullet = (x, y, angle, opts) => fireBullet(world, x, y, angle, opts);
  world.addHeat = (amount, reason) => addHeat(world, amount, reason);
  world.wantedStars = () => wantedStars(world);
  world.save = () => saveGame(world);

  world.damagePlayer = (amount, cause) => {
    if (world.endState) return;
    world.player.health -= amount;
    world.lastDamageAt = world.time;
    world.hurtFlash = Math.min(1, world.hurtFlash + 0.55);
    if (world.player.health <= 0) {
      world.player.health = 0;
      world.endState = 'wasted';
      world.say(`Kai went down — ${cause}.`);
      audio.setSiren(false);
    }
  };

  world.onCrash = (x, y, speed) => {
    world.stats.crashes += 1;
    world.shake = Math.min(14, 4 + speed / 45);
    world.burst(x, y, '#ff9f1c', 10, 200);
    world.burst(x, y, '#e8e0c8', 6, 120);
    audio.crash();
  };

  world.onCarDestroyed = (car) => {
    world.burst(car.x, car.y, '#ff6b35', 26, 300);
    world.burst(car.x, car.y, '#3d4450', 16, 120);
    audio.crash();
    if (world.player.car === car) {
      world.exitCar();
    }
  };

  world.enterCar = (car) => {
    const player = world.player;
    if (car.driver === 'cop') {
      world.say('A patrol car? Bold. The whole force will notice.');
      world.addHeat(20, 'police car stolen');
    } else if (car.driver === 'traffic' || car.driver === 'parked') {
      world.stats.carsStolen += 1;
      const copNear = world.cars.some((c) => c.driver === 'cop' && Math.hypot(c.x - car.x, c.y - car.y) < 420);
      if (copNear) world.addHeat(10, 'car stolen in sight of police');
    }
    car.driver = 'player';
    player.car = car;
    player.onFoot = false;
    player.x = car.x;
    player.y = car.y;
    audio.pickup();
  };

  world.exitCar = () => {
    const player = world.player;
    const car = player.car;
    if (!car) return;
    car.driver = 'parked';
    car.speed = 0;
    const side = car.angle + Math.PI / 2;
    const px = car.x + Math.cos(side) * 30;
    const py = car.y + Math.sin(side) * 30;
    const placed = city.moveCircle(car.x, car.y, px - car.x, py - car.y, PLAYER.radius);
    player.x = placed.x;
    player.y = placed.y;
    player.car = null;
    player.onFoot = true;
  };

  world.respawn = () => {
    const player = world.player;
    if (player.car) {
      player.car.driver = 'parked';
      player.car.speed = 0;
    }
    player.car = null;
    player.onFoot = true;
    player.x = home.x;
    player.y = home.y;
    player.health = PLAYER.maxHealth;
    player.ammo = PLAYER.magSize;
    world.heat = 0;
    world.endState = null;
    world.bustTimer = 0;
    audio.setSiren(false);
    world.missions.fail('busted');
    world.camera.x = home.x;
    world.camera.y = home.y;
  };

  function updatePlayerOnFoot(dt, input) {
    const player = world.player;
    const axes = input.axes();
    const len = Math.hypot(axes.x, axes.y) || 1;
    const speed = input.sprint() ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const dx = (axes.x / len) * speed * dt * (axes.x || axes.y ? 1 : 0);
    const dy = (axes.y / len) * speed * dt * (axes.x || axes.y ? 1 : 0);
    const moved = city.moveCircle(player.x, player.y, dx, dy, PLAYER.radius);
    player.x = moved.x;
    player.y = moved.y;
    if (axes.x || axes.y) player.angle = Math.atan2(dy || 0.0001, dx || 0.0001);

    // Aim follows the mouse; hold click to fire.
    const wx = input.mouse.x + world.camera.x - world.view.w / 2;
    const wy = input.mouse.y + world.camera.y - world.view.h / 2;
    player.aimAngle = Math.atan2(wy - player.y, wx - player.x);
    player.shootTimer -= dt;
    if (player.reloading) {
      player.reloadTimer -= dt;
      if (player.reloadTimer <= 0) {
        player.reloading = false;
        player.ammo = PLAYER.magSize;
      }
    } else if (input.mouse.down && player.shootTimer <= 0) {
      if (player.ammo > 0) {
        player.ammo -= 1;
        player.shootTimer = 0.18;
        world.stats.shotsFired += 1;
        world.fireBullet(player.x, player.y, player.aimAngle, { from: 'player' });
        world.addHeat(0, '');
        // Firing near an officer draws attention.
        const copNear = world.cars.some((c) => c.driver === 'cop' && Math.hypot(c.x - player.x, c.y - player.y) < 500);
        if (copNear && world.heat < 100) world.addHeat(6, 'shots fired');
      } else {
        player.reloading = true;
        player.reloadTimer = PLAYER.reloadTime;
      }
    }
  }

  function updatePlayer(dt, input) {
    const player = world.player;
    const actions = input.takeActions();
    if (actions & ACT_ENTER) {
      if (player.onFoot) {
        const car = nearestCar(world.cars, player.x, player.y, 75);
        if (car) world.enterCar(car);
      } else {
        world.exitCar();
      }
    }
    if ((actions & ACT_RELOAD) && !player.reloading && player.ammo < PLAYER.magSize) {
      player.reloading = true;
      player.reloadTimer = PLAYER.reloadTime;
    }

    if (player.onFoot) {
      updatePlayerOnFoot(dt, input);
      audio.setEngine(0, false);
    } else if (player.car) {
      drivePlayerCar(player.car, dt, input, city, world);
      player.x = player.car.x;
      player.y = player.car.y;
      player.angle = player.car.angle;
      audio.setEngine(Math.abs(player.car.speed) / CAR.maxSpeed, true);
      // Drive-by: hold click to shoot from the window toward the mouse.
      player.shootTimer -= dt;
      if (input.mouse.down && player.shootTimer <= 0 && player.ammo > 0) {
        player.ammo -= 1;
        player.shootTimer = 0.24;
        world.stats.shotsFired += 1;
        const wx = input.mouse.x + world.camera.x - world.view.w / 2;
        const wy = input.mouse.y + world.camera.y - world.view.h / 2;
        world.fireBullet(player.x, player.y, Math.atan2(wy - player.y, wx - player.x), { from: 'player' });
      }
    }

    // Slow health regen out of combat; the clinic heals fast.
    const clinic = city.landmarks.hospital;
    if (Math.hypot(player.x - clinic.x, player.y - clinic.y) < 70) {
      player.health = Math.min(PLAYER.maxHealth, player.health + 25 * dt);
    } else if (world.time - world.lastDamageAt > 6) {
      player.health = Math.min(PLAYER.maxHealth, player.health + 1.5 * dt);
    }

    // Camera chases the player, clamped to the world.
    const tx = Math.max(world.view.w / 2, Math.min(WORLD_W - world.view.w / 2, player.x));
    const ty = Math.max(world.view.h / 2, Math.min(WORLD_H - world.view.h / 2, player.y));
    world.camera.x += (tx - world.camera.x) * Math.min(1, dt * 5);
    world.camera.y += (ty - world.camera.y) * Math.min(1, dt * 5);
  }

  world.update = (dt, input) => {
    if (world.endState) return;
    world.time += dt;
    world.shake = Math.max(0, world.shake - dt * 30);
    world.hurtFlash = Math.max(0, world.hurtFlash - dt * 1.4);
    for (const f of world.flashes) f.t += dt;
    world.flashes = world.flashes.filter((f) => f.t < f.dur);
    for (const m of world.feed) m.t += dt;
    world.feed = world.feed.filter((m) => m.t < m.dur);

    updatePlayer(dt, input);
    updateCars(world, dt, rng);
    updatePeds(world, dt);
    updatePolice(world, dt);
    updateBullets(world, dt);
    updateParticles(world, dt);
    world.missions.update(dt);

    world.autosaveTimer -= dt;
    if (world.autosaveTimer <= 0) {
      world.autosaveTimer = 30;
      world.save();
    }
  };

  // Debug hooks for the verification drivers (playtest.mjs, verify-missions.mjs).
  // They use the game's real functions — teleporting moves the player, kills go
  // through real damage — so the checks exercise the real state machine.
  world.debug = {
    teleport(x, y) {
      world.player.x = x;
      world.player.y = y;
      if (world.player.car) {
        world.player.car.x = x;
        world.player.car.y = y;
      }
      world.camera.x = x;
      world.camera.y = y;
    },
    startMission(i) {
      world.missions.start(i);
    },
    setHeat(value) {
      world.heat = value;
      if (value <= 0) audio.setSiren(false);
    },
    setWantedStars(stars) {
      setWanted(world, stars);
    },
    killHostiles() {
      for (const ped of world.peds) {
        if (ped.hostile && ped.state !== 'dead') {
          ped.hp = 1;
          world.missions.registerKill(ped);
          ped.state = 'dead';
          ped.hp = 0;
          world.stats.kills += 1;
        }
      }
    },
    giveCar() {
      const car = nearestCar(world.cars, world.player.x, world.player.y, 400) || world.cars[0];
      world.enterCar(car);
    },
  };

  return world;
}
