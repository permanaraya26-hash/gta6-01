// Save slot for Solmar Bay: one versioned JSON blob in localStorage.
// The wanted level is never saved — a fresh session always starts clean.

const SLOT = 'solmar-bay-save-v1';
const VERSION = 1;

function readSlot() {
  try {
    const raw = localStorage.getItem(SLOT);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== VERSION) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function saveGame(state) {
  try {
    const snapshot = {
      version: VERSION,
      savedAt: Date.now(),
      cash: state.cash,
      health: state.health,
      missionIndex: state.missionIndex,
      missionsDone: state.missionsDone,
      player: {
        x: state.player.pos.x,
        z: state.player.pos.z,
        angle: state.player.angle,
      },
      clockMinutes: state.clockMinutes,
      wanted: 0,
      carsStolen: state.carsStolen || 0,
      pedsDown: state.pedsDown || 0,
    };
    localStorage.setItem(SLOT, JSON.stringify(snapshot));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  return readSlot();
}

export function hasSave() {
  return readSlot() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(SLOT);
  } catch (e) {
    // storage unavailable (private mode, blocked) — nothing to clear
  }
}
