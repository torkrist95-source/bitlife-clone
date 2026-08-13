const SAVE_KEY = "onemoreyear:save";
const SAVE_VERSION = 1;

function migrateCharacter(character) {
  if (!character.stats) character.stats = {};
  character.stats.fame ??= 0;
  character.stats.reputation ??= 0;
  character.flags ??= {};
  character.pendingEventId ??= null;
  character.history ??= [];
  return character;
}

function quarantineCorruptedSave(raw) {
  try {
    localStorage.setItem(`${SAVE_KEY}:corrupted:${Date.now()}`, raw);
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    console.error("Failed to quarantine corrupted save:", err);
  }
}

function saveCharacter(character) {
  try {
    const payload = JSON.stringify({
      saveVersion: SAVE_VERSION,
      savedAt: Date.now(),
      character,
    });
    localStorage.setItem(SAVE_KEY, payload);
    return true;
  } catch (err) {
    console.error("Failed to save game:", err);
    return false;
  }
}

function loadCharacter() {
  let raw;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (err) {
    console.error("Failed to read save:", err);
    return { character: null, corrupted: false };
  }

  if (!raw) return { character: null, corrupted: false };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("Save data is corrupted and could not be parsed:", err);
    quarantineCorruptedSave(raw);
    return { character: null, corrupted: true };
  }

  if (!parsed || typeof parsed !== "object" || !parsed.character || typeof parsed.character !== "object") {
    console.error("Save data is malformed, ignoring.");
    quarantineCorruptedSave(raw);
    return { character: null, corrupted: true };
  }

  return { character: migrateCharacter(parsed.character), corrupted: false };
}

function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    return true;
  } catch (err) {
    console.error("Failed to delete save:", err);
    return false;
  }
}

export { saveCharacter, loadCharacter, deleteSave };
