import { randInt, clampStat } from "./character.js";

const SAVE_KEY = "onemoreyear:save";
const SAVE_VERSION = 2;

function generateLifeId() {
  return `life_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function randomGender() {
  return Math.random() < 0.5 ? "male" : "female";
}

// Same "mostly one, sometimes both" shape npc.js uses for freshly-created
// NPCs -- duplicated rather than imported so migration stays self-contained,
// same reasoning as the NPC stat-block defaults already duplicated below.
function randomAttractedTo() {
  if (Math.random() < 0.1) return ["male", "female"];
  return [randomGender()];
}

function migrateCharacterFields(character) {
  if (!character.stats) character.stats = {};
  character.stats.fame ??= 0;
  character.stats.reputation ??= 0;
  character.flags ??= {};
  character.skills ??= {};
  character.hobbies ??= [];
  character.socialCircle ??= [];
  // Safest possible default -- doesn't retroactively invalidate any
  // romantic relationship an existing save already has, regardless of the
  // genders involved.
  character.attractedTo ??= ["male", "female"];
  // Old saves simply have none until the next hire; ensureCoworkers is
  // lazy/idempotent (same as ensureSocialCircle), so an already-employed
  // character picks up coworkers the next time the list opens or they age
  // up, no namePools-dependent generation needed here.
  character.coworkers ??= [];
  character.recentEventIds ??= [];
  // Same degrading-memory idea as recentEventIds, just for the NPC-update
  // and world-update flavor pools (see events.js's pickRecentAware) --
  // simply absent on any pre-existing save, no special handling needed
  // beyond the default.
  character.recentNpcUpdateIds ??= [];
  character.recentWorldUpdateIds ??= [];
  character.pendingEventId ??= null;
  character.history ??= [];

  for (const parent of character.family?.parents ?? []) {
    parent.closeness ??= 60;
  }
  for (const sibling of character.family?.siblings ?? []) {
    sibling.closeness ??= 60;
  }

  const hadEducation = character.education != null;
  character.education ??= {
    status: "not_started",
    schoolName: null,
    gradeLevel: null,
    gpa: null,
    clubs: [],
    extracurriculars: [],
    teacher: null,
  };
  character.education.clubs ??= [];
  character.education.extracurriculars ??= [];

  // applySchoolYear only ever progresses status forward through ages 5-17,
  // so a save from before this feature existed, for a character already
  // past school age, would otherwise be frozen showing "not old enough for
  // school" forever. Give them a sensible starting point instead.
  if (!hadEducation && character.age >= 18) {
    character.education.status = character.job ? "workforce" : "graduated_hs";
  }

  // Social-circle NPCs created before classmates existed as a richer
  // concept won't have age/stats/romance yet -- backfill plausible
  // defaults (age near the character's own, stats in a similar range to
  // how the character itself was rolled) rather than leaving them
  // undefined for code that now expects every NPC to have them.
  for (const npc of character.socialCircle ?? []) {
    npc.age ??= clampStat(character.age + randInt(-1, 1));
    npc.romance ??= 0;
    if (!npc.stats) {
      npc.stats = {
        health: randInt(60, 100),
        happiness: randInt(50, 100),
        smarts: randInt(30, 70),
        looks: randInt(30, 70),
        fame: 0,
        reputation: randInt(30, 60),
      };
    }
    // Never stored before this feature existed -- no way to recover the
    // original, so backfill plausible values the same way every other
    // missing NPC field already is above.
    npc.gender ??= randomGender();
    npc.attractedTo ??= randomAttractedTo();

    // Migrate the old single `type` field ("friend" | "crush" |
    // "romantic_interest") to the new friendLevel/romanceStatus pair
    // WITHOUT resetting anything -- every pre-existing NPC becomes at
    // least a "friend" (never demoted to acquaintance and dropped out of
    // the Friends list just because the model changed), and only
    // newly-created NPCs going forward start at "acquaintance". `type`
    // itself is left in place rather than deleted -- a harmless dead
    // field is cheaper and lower-risk than stripping it.
    if (!npc.friendLevel) {
      if (npc.type === "crush") {
        npc.friendLevel = "friend";
        npc.romanceStatus = "crush";
      } else if (npc.type === "romantic_interest") {
        npc.friendLevel = "friend";
        npc.romanceStatus = "dating";
      } else {
        // "friend" or any unexpected/missing value -- err toward not
        // resetting a relationship that already existed rather than
        // guessing it was a never-interacted-with acquaintance.
        npc.friendLevel = "friend";
        npc.romanceStatus = "none";
      }
    }
    npc.romanceStatus ??= "none";

    // Never stored before the yearly NPC-life simulation existed --
    // mirrors the player's own job/hobbies shape, same "no way to recover
    // the original, so start from a clean plausible default" reasoning
    // as gender/attractedTo above.
    npc.job ??= null;
    npc.hobbies ??= [];
  }

  // Coworkers as a concept postdate the friendLevel/romanceStatus model,
  // so every existing coworker record already has that richer shape --
  // only the newer job/hobbies fields need backfilling here.
  for (const npc of character.coworkers ?? []) {
    npc.job ??= null;
    npc.hobbies ??= [];
  }

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
