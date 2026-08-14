import { clampStat, randInt, weightedPick } from "./character.js";
import { ensureSocialCircle, getKnownNpcs, resolveDynamicChoice } from "./npc.js";

// Characters can't personally earn money before this age (the earliest
// income event is the age-14 part-time job offer). Below that, normal
// childhood expenses -- birthday parties, school costs, etc. -- are paid
// by the household/parents rather than the character's own cash.
const MIN_EARNING_AGE = 14;

function applyMoneyDelta(character, delta) {
  if (delta >= 0) {
    character.money += delta;
    return;
  }

  if (character.age < MIN_EARNING_AGE) {
    // Household/parents absorb the cost; personal money is untouched.
    return;
  }

  if (character.money + delta < 0) {
    // Can't personally afford it -- skip rather than go negative.
    return;
  }

  character.money += delta;
}

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

  character.history.push(resolved.resultText ?? fallbackText ?? resolved.label ?? "");

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

  const template = weightedPick(eligibleTemplates);
  const candidateNpcs = knownNpcs.filter((npc) => template.appliesTo.includes(npc.relation));
  const npc = candidateNpcs[randInt(0, candidateNpcs.length - 1)];
  const hobby = HOBBY_FLAVOR_WORDS[randInt(0, HOBBY_FLAVOR_WORDS.length - 1)];

  return fillTemplate(template.template, { name: npc.name, relation: npc.relationLabel, hobby });
}

function pickWorldUpdateLine(worldUpdates, countryName) {
  if (!worldUpdates || worldUpdates.length === 0) return null;
  const entry = weightedPick(worldUpdates);
  return fillTemplate(entry.template, { country: countryName ?? "your country" });
}

// The Age Up dispatcher: decides what kind of thing happens this year --
// a player decision, a passing NPC update, a world-news tidbit, more than
// one of those together, or nothing notable at all -- so Age Up doesn't
// always mean "here's a choice to make." Player-event odds fall back
// gracefully to a quieter happening when nothing is eligible at this age.
function rollAgeUpHappening(character, pools) {
  const { ageUpEvents, npcUpdates, worldUpdates, namePools, countryId, countryName } = pools;
  const roll = randInt(0, 99);

  if (roll < 45) {
    const event = pickEvent(character, ageUpEvents);
    if (event) return { type: "player_event", event };
    // Nothing eligible for this age/character right now -- fall through.
  }

  if (roll < 63) {
    const line = pickNpcUpdateLine(character, npcUpdates, namePools, countryId);
    if (line) {
      character.history.push(line);
      return { type: "quiet" };
    }
  }

  if (roll < 78) {
    const line = pickWorldUpdateLine(worldUpdates, countryName);
    if (line) {
      character.history.push(line);
      return { type: "quiet" };
    }
  }

  if (roll < 88) {
    const npcLine = pickNpcUpdateLine(character, npcUpdates, namePools, countryId);
    const worldLine = pickWorldUpdateLine(worldUpdates, countryName);
    if (npcLine) character.history.push(npcLine);
    if (worldLine) character.history.push(worldLine);
  }

  return { type: "quiet" };
}

export { pickEvent, applyChoice, getEligibleChoices, rollAgeUpHappening };
