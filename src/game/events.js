import { clampStat } from "./character.js";

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
      character.money += delta;
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
