// Save / load through localStorage. One slot, auto-saved on mission completion
// and on pause; Continue on the title screen restores it.
const KEY = 'solmar-bay-save-v1';

export function saveGame(state) {
  try {
    const data = {
      v: 1,
      cash: state.cash,
      health: state.health,
      missionIndex: state.missions.index,
      missionStep: state.missions.step,
      storyDone: state.missions.storyDone,
      collected: state.missions.collected,
      pos: { x: state.player.pos.x, z: state.player.pos.z },
      elapsed: state.elapsed,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
