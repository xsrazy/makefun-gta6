// Saving: the game writes its progress to localStorage — money, finished missions,
// found packages, the player's position and health — whenever a mission ends and whenever
// the player saves from the pause menu. Loading restores it; a corrupt save is ignored.

import { SAVE_KEY } from './config.js';

export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveGame(state) {
  const data = {
    version: 1,
    savedAt: Date.now(),
    money: state.player.money,
    health: state.player.health,
    x: state.player.x,
    y: state.player.y,
    ammo: state.player.ammo,
    missionsDone: state.missionsDone,
    packagesFound: state.packagesFound,
    time: state.time,
    kills: state.kills,
    carsStolen: state.carsStolen,
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== 1 || typeof data.money !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off: nothing to clear.
  }
}
