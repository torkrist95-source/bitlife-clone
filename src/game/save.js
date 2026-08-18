import { randInt, clampStat, getZodiacSign } from "./character.js";
import { coworkerAge } from "./npc.js";

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

// Captures any text appended after the marker itself -- old `ageUp` combined
// the marker and a life-stage-change announcement into one string, e.g.
// "Turned 18. Bob Smith is now a Young Adult.", so a marker match can carry
// real content of its own, not just a bare age counter.
const TURNED_LINE = /^Turned (\d+)\.\s*(.*)$/s;

// Old saves stored `history` as a flat array of plain strings, with a
// "Turned N." line marking the start of each year (see engine.js's ageUp,
// pre-history-grouping). The feed now needs every entry tagged with the age
// it happened at (`{age, text}`) so it can group entries under an "Age N"
// header -- migrate by walking the old array and tracking age via those
// markers. The bare marker prefix is dropped (the Age header now plays that
// role), but any life-stage-change text appended to the same line is kept
// as its own entry rather than discarded along with the prefix. If a year
// ends up with nothing at all -- e.g. the save was closed with an
// interactive event still unresolved -- a single filler line is added so
// that year's header never renders empty.
function migrateHistory(history) {
  if (!Array.isArray(history)) return [];
  if (history.length === 0 || typeof history[0] !== "string") return history;

  const migrated = [];
  let age = 0;
  let sawMarker = false;
  let sawEntryThisYear = false;

  for (const text of history) {
    const match = text.match(TURNED_LINE);
    if (match) {
      if (sawMarker && !sawEntryThisYear) {
        migrated.push({ age, text: "You had a relatively quiet year." });
      }
      age = Number(match[1]);
      sawMarker = true;
      const trailing = match[2].trim();
      if (trailing) {
        migrated.push({ age, text: trailing });
        sawEntryThisYear = true;
      } else {
        sawEntryThisYear = false;
      }
      continue;
    }
    migrated.push({ age, text });
    sawEntryThisYear = true;
  }
  if (sawMarker && !sawEntryThisYear) {
    migrated.push({ age, text: "You had a relatively quiet year." });
  }

  return migrated;
}

function migrateCharacterFields(character) {
  if (!character.stats) character.stats = {};
  character.stats.fame ??= 0;
  character.stats.reputation ??= 0;
  // Predates zodiacSign existing -- unlike birthCity/currencyCode (which
  // lazily resolve via ensureBirthLocation once country data loads), this
  // never had a self-healing path, so an old save just showed "Unknown"
  // forever even though birthDate (which it's derived from) was right
  // there. Self-heals here now instead.
  if (!character.zodiacSign && character.birthDate) {
    character.zodiacSign = getZodiacSign(character.birthDate.month, character.birthDate.day);
  }
  character.flags ??= {};
  character.skills ??= {};
  character.hobbies ??= [];
  character.activeHobbies ??= [];
  character.hobbyPracticeCounts ??= {};
  character.specialCareer ??= null;
  character.jobApplicationsThisYear ??= [];
  character.partTimeJobApplicationsThisYear ??= [];
  character.friendAsksThisYear ??= [];
  character.extracurricularTryoutsThisYear ??= [];
  character.varsityTryoutsThisYear ??= [];
  character.gedAttemptsThisYear ??= 0;
  character.socialCircle ??= [];
  // Safest possible default -- doesn't retroactively invalidate any
  // romantic relationship an existing save already has, regardless of the
  // genders involved.
  character.attractedTo ??= ["male", "female"];
  // Same default createCharacter uses for a brand-new character (see
  // character.js) -- duplicated rather than imported, same reasoning as
  // every other self-contained default in this function.
  character.genderIdentity ??= character.gender === "female" ? "female" : "male";
  // Old saves simply have none until the next hire; ensureCoworkers is
  // lazy/idempotent (same as ensureSocialCircle), so an already-employed
  // character picks up coworkers the next time the list opens or they age
  // up, no namePools-dependent generation needed here.
  character.coworkers ??= [];
  // Part-Time Jobs (partTimeJobs.js) are a fully separate slot from Main
  // Job -- old saves simply have neither until the next hire, same "lazy,
  // idempotent ensure*" reasoning as coworkers above.
  character.partTimeJob ??= null;
  character.partTimeCoworkers ??= [];
  // Always recomputed (not `??=`) rather than backfilled once -- this stays
  // self-healing against romanceStatus itself, the actual source of truth,
  // instead of trusting every code path that can set/clear "partner" to
  // also remember npc.js's recomputeHasPartner. Cheap given how few NPCs a
  // character ever has. Duplicated here rather than imported, same
  // self-contained-migration reasoning as everything else in this function.
  character.flags.hasPartner = [...character.socialCircle, ...character.coworkers, ...character.partTimeCoworkers].some(
    (npc) => npc.romanceStatus === "partner"
  );
  character.recentEventIds ??= [];
  // Same degrading-memory idea as recentEventIds, just for the NPC-update
  // and world-update flavor pools (see events.js's pickRecentAware) --
  // simply absent on any pre-existing save, no special handling needed
  // beyond the default.
  character.recentNpcUpdateIds ??= [];
  character.recentWorldUpdateIds ??= [];
  character.recentCelebrityIds ??= [];
  // Real values get resolved lazily by character.js's ensureBirthLocation
  // once the character actually becomes the active one being played (see
  // app.js) -- this file has no synchronous access to countries.json's
  // city/currency data (it's loaded async, only guaranteed resolved by
  // then), so these just get placeholder-initialized here.
  character.birthCity ??= null;
  character.currencyCode ??= null;
  // Freelance Gigs caps at a few completions per Age Up year (freelance.js)
  // -- old saves simply start at zero for whatever year they're in; the
  // counter gets reset for real the next time this character ages up.
  character.freelanceGigsCompletedThisYear ??= 0;
  // Same "no way to reconstruct the past" limitation as Odd Jobs above --
  // career milestones that happened before this feature existed only live
  // in the free-text history, so Career History simply starts tracking from
  // here going forward rather than trying to backfill it.
  character.careerHistory ??= [];
  character.pendingEventId ??= null;
  character.history = migrateHistory(character.history);

  for (const parent of character.family?.parents ?? []) {
    parent.closeness ??= 60;
    // Only "guardian"-role parents ever lacked this -- mother/father
    // already imply gender through `role` itself. Never stored before
    // formal adoption (engine.js) needed to know which role to assign.
    if (parent.role === "guardian") parent.gender ??= randomGender();
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
  // Never existed before Varsity tryouts -- old saves' existing
  // extracurriculars just have no season/varsity history to backfill, they
  // simply start being tracked from here going forward, same as every
  // other "no way to reconstruct the past" field in this function.
  character.education.activityProgress ??= {};
  // Same reasoning -- College predates these, so an existing save's
  // "college"/"graduated_college" status (if it somehow reached that with
  // the old dead-end version) just starts from a clean slate rather than
  // trying to reconstruct a major/college choice that was never made.
  character.education.collegeName ??= null;
  character.education.collegeTier ??= null;
  character.education.major ??= null;
  character.education.collegeYear ??= null;

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

  // One-time correction for saves from before NPCs aged up alongside the
  // player (see npcLife.js's applyNpcLifeYear) -- every existing roster
  // member's age was frozen at whatever it rolled at creation, so it could
  // be arbitrarily stale (e.g. classmates still reading 5-7 while the
  // character reached 11). Snap each roster to a plausible age relative to
  // the character's CURRENT age, using the same formulas they'd have been
  // created with, then never touch it again -- the yearly tick keeps them
  // in sync from here on, and re-rolling on every load would make ages
  // visibly jump around each time the game reopens.
  if (!character.socialCircleAgesFixed) {
    for (const npc of character.socialCircle ?? []) {
      npc.age = clampStat(character.age + randInt(-1, 1));
    }
    for (const npc of character.coworkers ?? []) {
      npc.age = coworkerAge(character);
    }
    character.socialCircleAgesFixed = true;
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
