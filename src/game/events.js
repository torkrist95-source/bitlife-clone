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

function weightedPick(events) {
  const totalWeight = events.reduce((sum, event) => sum + (event.weight ?? 10), 0);
  let roll = Math.random() * totalWeight;
  for (const event of events) {
    const weight = event.weight ?? 10;
    if (roll < weight) return event;
    roll -= weight;
  }
  return events[events.length - 1];
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
      character.age <= event.conditions.maxAge
  );

  if (candidates.length === 0) return null;
  return weightedPick(candidates);
}

function applyChoice(character, choice) {
  for (const [stat, delta] of Object.entries(choice.effects ?? {})) {
    if (stat === "money") {
      applyMoneyDelta(character, delta);
    } else if (stat in character.stats) {
      character.stats[stat] = clampStat(character.stats[stat] + delta);
    }
  }

  if (choice.flags) {
    Object.assign(character.flags, choice.flags);
  }

  character.history.push(choice.resultText ?? choice.label);

  if (choice.next_event) {
    character.pendingEventId = choice.next_event;
  }
}

export { pickEvent, applyChoice };
