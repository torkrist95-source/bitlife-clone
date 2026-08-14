import { clampStat } from "./character.js";

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

function weightedPick(items) {
  const totalWeight = items.reduce((sum, item) => sum + (item.weight ?? 10), 0);
  let roll = Math.random() * totalWeight;
  for (const item of items) {
    const weight = item.weight ?? 10;
    if (roll < weight) return item;
    roll -= weight;
  }
  return items[items.length - 1];
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

function pickEvent(character, pool) {
  if (character.pendingEventId) {
    const forced = pool.find((event) => event.id === character.pendingEventId);
    character.pendingEventId = null;
    if (forced) return forced;
  }

  const candidates = pool.filter(
    (event) =>
      event.trigger === "age_up" &&
      (event.weight ?? 10) > 0 &&
      character.age >= event.conditions.minAge &&
      character.age <= event.conditions.maxAge &&
      conditionsPass(character, event.requires) &&
      hasResolvableContent(character, event)
  );

  if (candidates.length === 0) return null;
  return weightedPick(candidates);
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

// A choice resolves either through a weighted, requires-gated `outcomes`
// pool (probabilistic, character-state-aware) or, if it has none, directly
// through its own effects/resultText -- fully backward compatible with
// every event written before outcomes existed.
function applyChoice(character, choice) {
  const resolved = choice.outcomes ? rollOutcome(character, choice.outcomes) : choice;
  applyResolved(character, resolved, choice.label);
}

export { pickEvent, applyChoice, getEligibleChoices };
