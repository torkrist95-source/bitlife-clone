import { getLifeStage, clampStat, randInt } from "./character.js";
import { applySchoolYear } from "./school.js";
import { ensureCoworkers, maybeChurnCoworkers, endCoworkerRelationships } from "./npc.js";

// Once promoted into a role, a character needs at least this many years in
// it before another promotion can be rolled.
const MIN_YEARS_BEFORE_PROMOTION = 2;
const PROMOTION_CHANCE = 20; // percent, per year once eligible
const LAYOFF_CHANCE = 3; // percent, per year while employed

function applyStatDrift(character) {
  const { age, stats } = character;
  stats.health = clampStat(stats.health + (age > 50 ? randInt(-3, 1) : randInt(-1, 1)));
  stats.happiness = clampStat(stats.happiness + randInt(-2, 2));
  stats.smarts = clampStat(stats.smarts + (age < 18 ? randInt(0, 3) : randInt(-1, 1)));
  stats.looks = clampStat(stats.looks + (age > 30 ? randInt(-2, 0) : randInt(-1, 1)));
}

// Pays the year's salary, then rolls for a layoff or promotion. Returns a
// history line describing what happened, or null if the character has no
// job or nothing beyond the paycheck occurred.
function applyJobYear(character, jobsData) {
  if (!character.job) return null;

  const jobDef = jobsData?.find((j) => j.id === character.job.jobId);
  const level = jobDef?.levels[character.job.levelIndex];
  if (!jobDef || !level) {
    // A job/level that no longer resolves against jobsData -- treat it the
    // same as unemployed rather than silently leaving character.job set,
    // which would otherwise keep ensureCoworkers/maybeChurnCoworkers
    // generating and churning coworkers for a job that no longer exists
    // (app.js's occupation screens already treat this the same way).
    character.job = null;
    endCoworkerRelationships(character);
    return null;
  }

  character.money += level.salary;
  character.job.yearsInRole += 1;

  if (randInt(0, 99) < LAYOFF_CHANCE) {
    const title = level.title;
    character.job = null;
    endCoworkerRelationships(character);
    return `You were laid off from your job as ${title}.`;
  }

  const hasNextLevel = character.job.levelIndex < jobDef.levels.length - 1;
  if (hasNextLevel && character.job.yearsInRole >= MIN_YEARS_BEFORE_PROMOTION && randInt(0, 99) < PROMOTION_CHANCE) {
    character.job.levelIndex += 1;
    character.job.yearsInRole = 0;
    return `You got promoted to ${jobDef.levels[character.job.levelIndex].title}!`;
  }

  return null;
}

function ageUp(character, jobsData, namePools, countryId) {
  const previousStage = getLifeStage(character.age);
  character.age += 1;
  applyStatDrift(character);
  const currentStage = getLifeStage(character.age);

  let line = `Turned ${character.age}.`;
  if (currentStage.id !== previousStage.id) {
    line += ` ${character.name} is now a ${currentStage.label}.`;
  }

  character.history.push(line);

  const jobLine = applyJobYear(character, jobsData);
  if (jobLine) character.history.push(jobLine);

  if (character.job) {
    ensureCoworkers(character, namePools, countryId);
    const coworkerLine = maybeChurnCoworkers(character, namePools, countryId);
    if (coworkerLine) character.history.push(coworkerLine);
  }

  const schoolLines = applySchoolYear(character, namePools, countryId);
  for (const schoolLine of schoolLines) character.history.push(schoolLine);

  return line;
}

export { ageUp };
