// localStorage save for Solmar Bay. One JSON slot, versioned.
const KEY = 'solmar-bay-save-v1';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      savedAt: Date.now(),
      cash: state.cash,
      health: state.health,
      missionIndex: state.missionIndex,
      missionsDone: state.missionsDone,
      player: { x: state.player.pos.x, z: state.player.pos.z, angle: state.player.angle },
      clockMinutes: state.clockMinutes,
      wanted: 0,
      carsStolen: state.carsStolen || 0,
      pedsDown: state.pedsDown || 0,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (e) { return null; }
}

export function hasSave() { return loadGame() !== null; }
export function clearSave() { try { localStorage.removeItem(KEY); } catch (e) {} }
