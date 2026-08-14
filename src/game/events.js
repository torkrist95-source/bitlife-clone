import {
  clampStat,
  randInt,
  weightedPick,
  applyMoneyDelta,
  pushHistory,
  MIN_EARNING_AGE,
  ENROLLED_EDUCATION_STATUSES,
} from "./character.js";
import { ensureSocialCircle, getKnownNpcs, resolveDynamicChoice } from "./npc.js";
import { applyNpcLifeYear, NPC_HOBBY_POOL } from "./npcLife.js";

// ---------- Condition engine ----------
// A `requires` array on an event, choice, or outcome is a list of
// conditions that must ALL pass for it to be eligible. Each condition
// reads a dot-notation `path` off the character (e.g. "stats.smarts",
// "skills.programming", "hobbies", "job.jobId", "flags.hasLicense") and
// compares it against `value` with `op`. This is the one mechanism every
// event uses to gate itself/choices/outcomes on character state -- no
// event gets its own bespoke eligibility code. Put `requires` on the
// event itself to gate the whole thing (e.g. a payoff event that should
// only ever appear for a character with a given skill); put it on
// individual choices/outcomes to instead just hide/reweight options
// while still showing the base event to everyone.

function getPath(character, path) {
  return path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), character);
}

function evalCondition(character, condition) {
  const actual = getPath(character, condition.path);
  switch (condition.op) {
    case ">=":
      return actual >= condition.value;
    case ">":
      return actual > condition.value;
    case "<=":
      return actual <= condition.value;
    case "<":
      return actual < condition.value;
    case "==":
      return actual === condition.value;
    case "!=":
      return actual !== condition.value;
    case "includes":
      return Array.isArray(actual) && actual.includes(condition.value);
    case "truthy":
      return Boolean(actual);
    case "falsy":
      return !actual;
    default:
      // Unknown/misconfigured op fails closed (hidden), never shown broken.
      return false;
  }
}

function conditionsPass(character, requires) {
  if (!requires || requires.length === 0) return true;
  return requires.every((condition) => evalCondition(character, condition));
}

// Returns only the choices this character currently qualifies for. Choices
// with no `requires` are always eligible.
function getEligibleChoices(character, event) {
  return (event.choices ?? []).filter((choice) => conditionsPass(character, choice.requires));
}

// Picks one outcome from a weighted, requires-gated pool. If nothing
// qualifies (a content mistake -- every outcome gated too tightly), falls
// back to the full list so the event still resolves with *something*
// rather than silently doing nothing.
function rollOutcome(character, outcomes) {
  const eligible = outcomes.filter((outcome) => conditionsPass(character, outcome.requires));
  return weightedPick(eligible.length > 0 ? eligible : outcomes);
}

// True if this event has at least one choice this character could actually
// see (or has no choices at all, in which case app.js synthesizes a single
// "Continue" acknowledgement from the event's own top-level effects).
function hasResolvableContent(character, event) {
  if (!event.choices || event.choices.length === 0) return true;
  return getEligibleChoices(character, event).length > 0;
}

// How many of the most recently fired event ids to avoid repeating.
// Relaxed automatically if the eligible pool is too thin to honor it.
const RECENT_EVENT_MEMORY = 5;

function rememberEvent(character, eventId) {
  const recent = character.recentEventIds ?? [];
  character.recentEventIds = [eventId, ...recent].slice(0, RECENT_EVENT_MEMORY);
}

// Same degrading-window shape as recentEventIds/RECENT_EVENT_MEMORY above,
// generalized for any small keyed memory (NPC-update and world-update
// template ids, which previously had zero repetition tracking and could
// fire back-to-back). Since a single year can now roll multiple NPC/world
// flavor slots (see NPC_FLAVOR_SLOTS/WORLD_FLAVOR_SLOTS below), this also
// needs enough headroom that one busy year doesn't consume the entire
// window and leave the following year with no repetition protection at all.
const RECENT_UPDATE_MEMORY = 5;

function rememberUpdate(character, field, id) {
  const recent = character[field] ?? [];
  character[field] = [id, ...recent].slice(0, RECENT_UPDATE_MEMORY);
}

function pickRecentAware(character, field, pool) {
  const recent = character[field] ?? [];
  for (let memory = RECENT_UPDATE_MEMORY; memory > 0; memory--) {
    const avoid = recent.slice(0, memory);
    const filtered = pool.filter((entry) => !avoid.includes(entry.id));
    if (filtered.length > 0) return filtered;
  }
  return pool;
}

function pickEvent(character, pool) {
  if (character.pendingEventId) {
    const forced = pool.find((event) => event.id === character.pendingEventId);
    character.pendingEventId = null;
    if (forced) {
      rememberEvent(character, forced.id);
      return forced;
    }
  }

  const baseFilter = (event) =>
    event.trigger === "age_up" &&
    (event.weight ?? 10) > 0 &&
    character.age >= event.conditions.minAge &&
    character.age <= event.conditions.maxAge &&
    conditionsPass(character, event.requires) &&
    hasResolvableContent(character, event);

  const eligible = pool.filter(baseFilter);
  if (eligible.length === 0) return null;

  // Avoid repeating recent events, but degrade gracefully: a thin pool at
  // this age might not have enough distinct events to honor the full
  // memory window, so shrink how far back we avoid one step at a time
  // rather than dropping avoidance entirely and risking an immediate
  // back-to-back repeat.
  const recent = character.recentEventIds ?? [];
  let candidates = eligible;
  for (let memory = RECENT_EVENT_MEMORY; memory > 0; memory--) {
    const avoid = recent.slice(0, memory);
    const filtered = eligible.filter((event) => !avoid.includes(event.id));
    if (filtered.length > 0) {
      candidates = filtered;
      break;
    }
  }

  const picked = weightedPick(candidates);
  rememberEvent(character, picked.id);
  return picked;
}

// Applies one resolved choice/outcome's effects to the character: stats,
// money (through the earning-age guard above), skills, hobbies, flags,
// history, and any follow-up chained event.
function applyResolved(character, resolved, fallbackText) {
  for (const [stat, delta] of Object.entries(resolved.effects ?? {})) {
    if (stat === "money") {
      applyMoneyDelta(character, delta);
    } else if (stat in character.stats) {
      character.stats[stat] = clampStat(character.stats[stat] + delta);
    }
  }

  for (const [skill, delta] of Object.entries(resolved.skills ?? {})) {
    character.skills[skill] = clampStat((character.skills[skill] ?? 0) + delta);
  }

  for (const hobby of resolved.hobbies ?? []) {
    if (!character.hobbies.includes(hobby)) character.hobbies.push(hobby);
  }

  if (resolved.flags) {
    Object.assign(character.flags, resolved.flags);
  }

  // Some dynamic generators wrap a shared NPC-interaction function (e.g.
  // askForHelp/thankTeacher, npc.js) that already pushes its own line to
  // history when called directly from an NPC profile -- when that same
  // function is wrapped by a dynamic choice instead, pushing `resultText`
  // here too would duplicate it. Those generators signal this explicitly
  // with `resultText: null` (as opposed to simply omitting it, which still
  // falls through to fallbackText/label as normal) so the skip is based on
  // an explicit "I already handled history" signal rather than guessing
  // from text equality -- two unrelated generators can legitimately
  // produce the same wording back-to-back (e.g. both `develop_crush_pursue`
  // and `develop_crush_quiet` share a "no one in mind" fallback line), and
  // a text-comparison guard would wrongly swallow the second, legitimate
  // one along with its differing effects.
  if (resolved.resultText !== null) {
    pushHistory(character, resolved.resultText ?? fallbackText ?? resolved.label ?? "");
  }

  if (resolved.next_event) {
    character.pendingEventId = resolved.next_event;
  }
}

// A choice resolves one of three ways, checked in this order:
//   1. `dynamic` -- runtime-generated (which NPCs exist, who's eligible)
//      through npc.js's generator registry; can itself resolve immediately
//      or hand back a freshly-built follow-up event to show next.
//   2. `outcomes` -- a weighted, requires-gated pool (probabilistic,
//      character-state-aware).
//   3. Neither -- resolves directly through its own effects/resultText,
//      exactly as every event written before outcomes/dynamic existed.
// Always returns { followUpEvent }: null unless a dynamic generator opened
// a new event, in which case the caller should show it immediately instead
// of closing the modal.
function applyChoice(character, choice, ctx = {}) {
  if (choice.dynamic) {
    const result = resolveDynamicChoice(character, choice.dynamic, { ...ctx, dynamicArgs: choice.dynamicArgs });
    if (result.type === "followUp") {
      return { followUpEvent: result.event };
    }
    applyResolved(character, result, choice.label);
    return { followUpEvent: null };
  }

  const resolved = choice.outcomes ? rollOutcome(character, choice.outcomes) : choice;
  applyResolved(character, resolved, choice.label);
  return { followUpEvent: null };
}

// ---------- NPC / world updates ----------
// These are the "something happened, no decision needed" half of Age Up:
// a flavor line about a real, named NPC or the wider world, pushed
// straight to history rather than opening a modal.

function fillTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

const HOBBY_FLAVOR_WORDS = [
  "soccer", "painting", "chess", "theater", "volleyball", "skateboarding",
  "guitar", "coding", "photography", "dance", "baking", "swimming",
];

// Picks a real, named NPC (family or social circle) and a flavor template
// that applies to their relation, filling in the template. Returns null if
// the character doesn't know anyone yet or no template fits who they know.
function pickNpcUpdateLine(character, templates, namePools, countryId) {
  ensureSocialCircle(character, namePools, countryId);
  const knownNpcs = getKnownNpcs(character);
  if (knownNpcs.length === 0) return null;

  const eligibleTemplates = templates.filter((t) => knownNpcs.some((npc) => t.appliesTo.includes(npc.relation)));
  if (eligibleTemplates.length === 0) return null;

  const candidates = pickRecentAware(character, "recentNpcUpdateIds", eligibleTemplates);
  const template = weightedPick(candidates);
  rememberUpdate(character, "recentNpcUpdateIds", template.id);

  const candidateNpcs = knownNpcs.filter((npc) => template.appliesTo.includes(npc.relation));
  const npc = candidateNpcs[randInt(0, candidateNpcs.length - 1)];
  const hobby = HOBBY_FLAVOR_WORDS[randInt(0, HOBBY_FLAVOR_WORDS.length - 1)];

  return fillTemplate(template.template, { name: npc.name, relation: npc.relationLabel, hobby });
}

// Fictional stand-ins filled into celebrity-flavored world updates below --
// the celebrity themselves is real (see celebrities.json), but the movie/
// character/album/song they're attached to is invented per-roll, the same
// way the game already invents fictional companies/bands/awards elsewhere
// in world_updates.json (Verdant Systems, Glass Horizon, the Lumen Awards).
const CELEBRITY_MOVIE_TITLES = [
  "The House Beyond the Pines", "Midnight in Alderwood", "Wildfire Season",
  "The Paper Kingdom", "Nocturne Falls", "The Quiet Storm", "Ashes of Tomorrow",
  "The Velvet Line", "Harbor Lights", "The Long Way Home", "Echoes of Autumn",
  "The Salt Road", "A Thousand Small Rooms", "The Ember Trail", "Lowtide",
  "The Cartographer's Daughter",
];

const CELEBRITY_CHARACTER_NAMES = [
  "Eleanor Vance", "Marcus Reyes", "Isla Bennett", "Dahlia Frost", "Theo Marsh",
  "Corinne Blackwood", "Simon Delacroix", "Winnie Sharpe", "Adrian Pierce",
  "Nadia Osei", "Elliot Graves", "Rosalind Hale", "Desmond Cray", "Junie Alvarez",
  "Felix Duran", "Marisol Vega",
];

const CELEBRITY_ALBUM_TITLES = [
  "Wildflower Hour", "Neon Static", "Golden Hour Rewind", "Paper Moons",
  "Afterglow", "Velvet Skyline", "Midnight Radio", "Slow Bloom", "Electric Heart",
  "Blue November", "Firelight", "Kaleidoscope Heart", "Runaway Season",
  "Static & Stardust", "Better Days Ahead", "Undertow",
];

const CELEBRITY_SONG_TITLES = [
  "Weightless", "Neon Blue", "Falling Slow", "Better Than This", "Windows Down",
  "Slow Burn", "Halfway Gone", "Little Storms", "Learning to Fly Again",
  "Bright Sky, Dark Room", "Paper Hearts", "Wildflower",
];

// Picks a real celebrity/band (celebrities.json) matching the template's
// required category, avoiding whoever's been picked recently -- same
// degrading-window mechanism as everything else in this file, just keyed by
// a dedicated `recentCelebrityIds` field so celebrity repetition is tracked
// independently of which *template* got used.
function pickCelebrityForCategory(character, celebrities, category) {
  const eligible = (celebrities ?? []).filter((c) => c.category === category);
  if (eligible.length === 0) return null;
  const candidates = pickRecentAware(character, "recentCelebrityIds", eligible);
  const celeb = candidates[randInt(0, candidates.length - 1)];
  rememberUpdate(character, "recentCelebrityIds", celeb.id);
  return celeb;
}

function pickWorldUpdateLine(character, worldUpdates, countryName, celebrities) {
  if (!worldUpdates || worldUpdates.length === 0) return null;
  const candidates = pickRecentAware(character, "recentWorldUpdateIds", worldUpdates);
  const entry = weightedPick(candidates);

  if (entry.celebrityCategory) {
    const celeb = pickCelebrityForCategory(character, celebrities, entry.celebrityCategory);
    // No eligible celebrity for this category (data not loaded, or an
    // exhausted pool) -- skip rather than render a broken line; the caller
    // already treats a null return the same as any other missed roll.
    if (!celeb) return null;
    rememberUpdate(character, "recentWorldUpdateIds", entry.id);
    return fillTemplate(entry.template, {
      celebrity: celeb.name,
      title: CELEBRITY_MOVIE_TITLES[randInt(0, CELEBRITY_MOVIE_TITLES.length - 1)],
      character: CELEBRITY_CHARACTER_NAMES[randInt(0, CELEBRITY_CHARACTER_NAMES.length - 1)],
      album: CELEBRITY_ALBUM_TITLES[randInt(0, CELEBRITY_ALBUM_TITLES.length - 1)],
      song: CELEBRITY_SONG_TITLES[randInt(0, CELEBRITY_SONG_TITLES.length - 1)],
    });
  }

  rememberUpdate(character, "recentWorldUpdateIds", entry.id);
  return fillTemplate(entry.template, { country: countryName ?? "your country" });
}

// A small side-income roll, independent of the character's main job (or
// lack of one) -- same MIN_EARNING_AGE gate every other personal-money
// system already respects, so a young child never turns up with cash from
// "odd jobs" no other system would let them earn. Routed through the same
// recent-repetition tracking as NPC/world flavor (via a dedicated
// `recentOddJobIds` field) so the same odd job can't fire two years running.
function pickOddJobLine(character, oddJobsData) {
  if (!oddJobsData || oddJobsData.length === 0) return null;
  if (character.age < MIN_EARNING_AGE) return null;
  const candidates = pickRecentAware(character, "recentOddJobIds", oddJobsData);
  const entry = weightedPick(candidates);
  rememberUpdate(character, "recentOddJobIds", entry.id);
  const amount = randInt(entry.moneyMin, entry.moneyMax);
  applyMoneyDelta(character, amount);
  return fillTemplate(entry.template, { amount: amount.toLocaleString() });
}

// A spontaneous personal hobby, independent of anything club/extracurricular
// membership already grants -- reuses npcLife.js's own hobby pool rather
// than maintaining a second list, since the concept ("picked up a new
// hobby") is identical for the player and for NPCs. Age-gated the same way
// NPCs implicitly are (npc.js's SOCIAL_CIRCLE_MIN_AGE): a toddler shouldn't
// be able to roll "You became interested in skateboarding."
const MIN_HOBBY_INTEREST_AGE = 5;

function pickHobbyInterestLine(character, hobbyPool) {
  if (character.age < MIN_HOBBY_INTEREST_AGE) return null;
  const available = hobbyPool.filter((h) => !character.hobbies.includes(h));
  if (available.length === 0) return null;
  const hobby = available[randInt(0, available.length - 1)];
  character.hobbies.push(hobby);
  return `You became interested in ${hobby}.`;
}

const SCHOOL_ACTIVITY_FLAVOR_TEMPLATES = [
  "You had a great year with {label}.",
  "{label} was one of the highlights of your year.",
  "You kept up with {label} throughout the year.",
  "You've been really enjoying your time with {label} lately.",
];

// A single independent per-year roll referencing whichever club/activity the
// character is actually enrolled in -- never fires with nothing real to
// reference, and never uses generic "participated in a school activity"
// wording.
function pickSchoolActivityFlavorLine(character, clubsData, extracurricularsData) {
  const edu = character.education;
  if (!ENROLLED_EDUCATION_STATUSES.has(edu.status)) return null;

  const labels = [
    ...(edu.clubs ?? []).map((id) => clubsData?.find((c) => c.id === id)?.label),
    ...(edu.extracurriculars ?? []).map((id) => extracurricularsData?.find((a) => a.id === id)?.label),
  ].filter(Boolean);
  if (labels.length === 0) return null;

  const label = labels[randInt(0, labels.length - 1)];
  const template = SCHOOL_ACTIVITY_FLAVOR_TEMPLATES[randInt(0, SCHOOL_ACTIVITY_FLAVOR_TEMPLATES.length - 1)];
  return template.replace("{label}", label);
}

// A year that produced no background developments and no interactive
// event still needs to feel like a year passed, not a silent no-op.
const QUIET_YEAR_LINES = [
  "You had a relatively quiet year.",
  "Nothing major happened this year -- just the ordinary rhythm of life.",
  "It was a calm year, mostly spent on the everyday stuff.",
];

// Keeps a year readable even if several independent rolls all hit at
// once -- a sanity ceiling, not a target: the feed now shows a full,
// scrollable life grouped by Age, so a busy year is expected to genuinely
// read as busy (the user's own examples run 5-10+ lines) rather than being
// trimmed down to a handful every time. Development-tick lines (real,
// state-changing) are pushed into `lines` before the lighter flavor-only
// channels below, so slicing to this cap drops the least meaningful lines
// first. Job/family lines (engine.js's ageUp) are pushed separately and are
// never subject to this cap at all.
const MAX_BACKGROUND_LINES = 10;

// Each flavor channel gets several independent per-year opportunities
// rather than one single "pick one from the whole pool" roll -- a year
// can genuinely surface more than one NPC tidbit or more than one world
// headline, same as applyNpcLifeYear already evaluates every eligible NPC
// independently and applyFamilyYear already evaluates every family member
// independently. The MAX_BACKGROUND_LINES cap below is what keeps a year
// readable; it must never be the thing limiting how many candidates get
// *evaluated* in the first place.
const NPC_FLAVOR_SLOTS = 2;
const NPC_FLAVOR_CHANCE_PER_SLOT = 22; // percent, per independent slot
const WORLD_FLAVOR_SLOTS = 3;
const WORLD_FLAVOR_CHANCE_PER_SLOT = 25; // percent, per independent slot
// Lower-frequency, one-shot concepts (unlike NPC/world flavor above, these
// aren't worth multiple slots) -- each is its own single independent roll.
const ODD_JOB_CHANCE = 12; // percent, independent roll
const HOBBY_INTEREST_CHANCE = 10; // percent, independent roll
const SCHOOL_ACTIVITY_FLAVOR_CHANCE = 20; // percent, independent roll
const INTERACTIVE_EVENT_CHANCE = 40; // percent, independent roll

// The Age Up dispatcher: assembles the year as a bundle of independently-
// rolled developments (NPC personal-life ticks, lighter NPC/world flavor)
// plus, separately, a chance at an interactive event -- not mutually
// exclusive, so a year can contain a major decision *and* several smaller
// things, just several smaller things, or be quiet. Player-event odds
// fall back gracefully to nothing when no event is eligible at this age.
function rollAgeUpHappening(character, pools) {
  const {
    ageUpEvents,
    npcUpdates,
    worldUpdates,
    oddJobsData,
    celebrities,
    clubsData,
    extracurricularsData,
    namePools,
    countryId,
    countryName,
    jobsData,
  } = pools;

  let lines = applyNpcLifeYear(character, namePools, countryId, jobsData);

  for (let i = 0; i < NPC_FLAVOR_SLOTS; i++) {
    if (randInt(0, 99) < NPC_FLAVOR_CHANCE_PER_SLOT) {
      const line = pickNpcUpdateLine(character, npcUpdates, namePools, countryId);
      if (line) lines.push(line);
    }
  }
  for (let i = 0; i < WORLD_FLAVOR_SLOTS; i++) {
    if (randInt(0, 99) < WORLD_FLAVOR_CHANCE_PER_SLOT) {
      const line = pickWorldUpdateLine(character, worldUpdates, countryName, celebrities);
      if (line) lines.push(line);
    }
  }
  if (randInt(0, 99) < ODD_JOB_CHANCE) {
    const line = pickOddJobLine(character, oddJobsData);
    if (line) lines.push(line);
  }
  if (randInt(0, 99) < HOBBY_INTEREST_CHANCE) {
    const line = pickHobbyInterestLine(character, NPC_HOBBY_POOL);
    if (line) lines.push(line);
  }
  if (randInt(0, 99) < SCHOOL_ACTIVITY_FLAVOR_CHANCE) {
    const line = pickSchoolActivityFlavorLine(character, clubsData, extracurricularsData);
    if (line) lines.push(line);
  }

  if (lines.length > MAX_BACKGROUND_LINES) {
    lines = lines.slice(0, MAX_BACKGROUND_LINES);
  }
  for (const line of lines) pushHistory(character, line);

  // A forced/chained event (e.g. graduation, set by the yearly school tick
  // before this runs) must fire the year it's set -- checked *after* the
  // background bundle above so a forced-event year still gets its NPC/
  // world developments too, instead of skipping them entirely the way an
  // early-return here would.
  if (character.pendingEventId) {
    const event = pickEvent(character, ageUpEvents);
    if (event) return { type: "player_event", event };
  }

  if (randInt(0, 99) < INTERACTIVE_EVENT_CHANCE) {
    const event = pickEvent(character, ageUpEvents);
    if (event) return { type: "player_event", event };
  }

  if (lines.length === 0) {
    pushHistory(character, QUIET_YEAR_LINES[randInt(0, QUIET_YEAR_LINES.length - 1)]);
  }

  return { type: "quiet" };
}

export { pickEvent, applyChoice, getEligibleChoices, rollAgeUpHappening, conditionsPass };
