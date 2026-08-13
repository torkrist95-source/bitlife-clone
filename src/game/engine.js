import { getLifeStage, clampStat, randInt } from "./character.js";

function applyStatDrift(character) {
  const { age, stats } = character;
  stats.health = clampStat(stats.health + (age > 50 ? randInt(-3, 1) : randInt(-1, 1)));
  stats.happiness = clampStat(stats.happiness + randInt(-2, 2));
  stats.smarts = clampStat(stats.smarts + (age < 18 ? randInt(0, 3) : randInt(-1, 1)));
  stats.looks = clampStat(stats.looks + (age > 30 ? randInt(-2, 0) : randInt(-1, 1)));
}

function ageUp(character) {
  const previousStage = getLifeStage(character.age);
  character.age += 1;
  applyStatDrift(character);
  const currentStage = getLifeStage(character.age);

  let line = `Turned ${character.age}.`;
  if (currentStage.id !== previousStage.id) {
    line += ` ${character.name} is now a ${currentStage.label}.`;
  }

  character.history.push(line);
  return line;
}

export { ageUp };
