// Neon Harbor — save and continue via localStorage. The save holds money,
// mission progress, health and the player's last position; a corrupt or
// missing save just starts a fresh run.

export const SAVE_KEY = 'neon-harbor.save.v1';

export function saveGame(world) {
  try {
    const data = {
      version: 1,
      savedAt: Date.now(),
      money: world.money,
      health: world.player.health,
      missionsDone: world.missions.completed,
      missionIndex: world.missions.index,
      x: Math.round(world.player.x),
      y: Math.round(world.player.y),
      seed: world.seed,
      stats: world.stats,
    };
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

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch { /* nothing to clear */ }
}
