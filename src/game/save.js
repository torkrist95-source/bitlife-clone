const SAVE_KEY = "onemoreyear:save";
const SAVE_VERSION = 2;

function generateLifeId() {
  return `life_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function migrateCharacterFields(character) {
  if (!character.stats) character.stats = {};
  character.stats.fame ??= 0;
  character.stats.reputation ??= 0;
  character.flags ??= {};
  character.skills ??= {};
  character.hobbies ??= [];
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

function emptyContainer() {
  return { saveVersion: SAVE_VERSION, activeLifeId: null, lives: {} };
}

function writeContainer(container) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...container, savedAt: Date.now() }));
    return true;
  } catch (err) {
    console.error("Failed to save game:", err);
    return false;
  }
}

// Reads the save container, transparently migrating older formats:
//   v1 (single character: { saveVersion: 1, character }) -> v2 (multi-life)
// The migrated shape is written back immediately so migration only ever
// happens once; the original character data is fully preserved either way.
function readContainer() {
  let raw;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (err) {
    console.error("Failed to read save:", err);
    return { container: null, corrupted: false };
  }

  if (!raw) return { container: null, corrupted: false };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("Save data is corrupted and could not be parsed:", err);
    quarantineCorruptedSave(raw);
    return { container: null, corrupted: true };
  }

  if (!parsed || typeof parsed !== "object") {
    console.error("Save data is malformed, ignoring.");
    quarantineCorruptedSave(raw);
    return { container: null, corrupted: true };
  }

  if (!parsed.lives) {
    if (!parsed.character || typeof parsed.character !== "object") {
      console.error("Save data is malformed, ignoring.");
      quarantineCorruptedSave(raw);
      return { container: null, corrupted: true };
    }

    const id = generateLifeId();
    const migrated = {
      saveVersion: SAVE_VERSION,
      activeLifeId: id,
      lives: {
        [id]: {
          id,
          createdAt: parsed.savedAt ?? Date.now(),
          updatedAt: parsed.savedAt ?? Date.now(),
          character: migrateCharacterFields(parsed.character),
        },
      },
    };
    writeContainer(migrated);
    return { container: migrated, corrupted: false };
  }

  for (const life of Object.values(parsed.lives)) {
    if (life && life.character) migrateCharacterFields(life.character);
  }
  parsed.saveVersion = SAVE_VERSION;
  parsed.activeLifeId ??= null;

  return { container: parsed, corrupted: false };
}

// Returns all saved lives, most recently updated first.
function listLives() {
  const { container } = readContainer();
  if (!container) return [];
  return Object.values(container.lives).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

function getActiveLifeId() {
  const { container } = readContainer();
  return container ? container.activeLifeId : null;
}

// Loads the character for whichever life is currently active, if any.
function loadActiveCharacter() {
  const { container, corrupted } = readContainer();
  if (!container || !container.activeLifeId) return { character: null, lifeId: null, corrupted };

  const life = container.lives[container.activeLifeId];
  if (!life) return { character: null, lifeId: null, corrupted };

  return { character: life.character, lifeId: life.id, corrupted };
}

// Saves a character into its life record without changing which life is active.
function saveCharacter(lifeId, character) {
  if (!lifeId) return false;
  const { container } = readContainer();
  const base = container ?? emptyContainer();
  const existing = base.lives[lifeId];
  base.lives[lifeId] = {
    id: lifeId,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    character,
  };
  return writeContainer(base);
}

// Creates a brand-new life, saves it, and makes it the active life.
// Does not touch any other life already in storage.
function createLife(character) {
  const { container } = readContainer();
  const base = container ?? emptyContainer();
  const id = generateLifeId();
  base.lives[id] = { id, createdAt: Date.now(), updatedAt: Date.now(), character };
  base.activeLifeId = id;
  writeContainer(base);
  return id;
}

// Switches which life is active without modifying any character data.
function setActiveLife(lifeId) {
  const { container } = readContainer();
  if (!container || !container.lives[lifeId]) return false;
  container.activeLifeId = lifeId;
  return writeContainer(container);
}

// Deletes one life. If it was the active life, activeLifeId is cleared
// (never auto-reassigned to another life) so the app never points at a
// character that no longer exists.
function deleteLife(lifeId) {
  const { container } = readContainer();
  if (!container) return true;
  delete container.lives[lifeId];
  if (container.activeLifeId === lifeId) container.activeLifeId = null;
  return writeContainer(container);
}

export { listLives, getActiveLifeId, loadActiveCharacter, saveCharacter, createLife, setActiveLife, deleteLife };
