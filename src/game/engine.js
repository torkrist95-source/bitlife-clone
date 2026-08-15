import { getLifeStage, clampStat, randInt, pushHistory, pushCareerEvent, generateRandomName } from "./character.js";
import { applySchoolYear, getGradeLevelForAge } from "./school.js";
import { ensureCoworkers, endCoworkerRelationships } from "./npc.js";
import { pickJobTitle } from "./npcLife.js";

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
    // which would otherwise keep ensureCoworkers generating a roster for
    // a job that no longer exists (app.js's occupation screens already
    // treat this the same way).
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
    pushCareerEvent(character, { title, event: "laid_off" });
    return `You were laid off from your job as ${title}.`;
  }

  const hasNextLevel = character.job.levelIndex < jobDef.levels.length - 1;
  if (hasNextLevel && character.job.yearsInRole >= MIN_YEARS_BEFORE_PROMOTION && randInt(0, 99) < PROMOTION_CHANCE) {
    character.job.levelIndex += 1;
    character.job.yearsInRole = 0;
    const newLevel = jobDef.levels[character.job.levelIndex];
    pushCareerEvent(character, { title: newLevel.title, event: "promoted", salary: newLevel.salary });
    return `You got promoted to ${newLevel.title}!`;
  }

  return null;
}

// ---------- Family developments ----------
// Parents/siblings were previously static after character creation --
// their age, employment, and job never changed no matter how many years
// passed. This tick makes them keep living: parents' employment status
// can change (job titles reuse the same jobsData pool the player's own
// career draws from, rather than a parallel system), and siblings age up
// and can cross age-appropriate milestones, reusing school.js's own
// age->grade logic instead of inventing separate brackets.

const PARENT_JOB_LOSS_CHANCE = 3; // percent per year, while employed
const PARENT_JOB_CHANGE_CHANCE = 8; // percent per year, while employed
const PARENT_JOB_GAIN_CHANCE = 10; // percent per year, while unemployed
// These lines are pushed straight to history from ageUp (see below), not
// routed through rollAgeUpHappening's own MAX_BACKGROUND_LINES cap -- cap
// here too so a year where several parents/siblings all develop at once
// still reads as a short summary rather than a wall of text. Raised
// alongside MAX_BACKGROUND_LINES to make room for a birth (below) landing
// the same year as an unrelated parent/sibling development, without either
// one silently losing its slot.
const MAX_FAMILY_LINES_PER_YEAR = 3;

// Same convention npc.js's getKnownNpcs already uses for this exact field,
// so a step-parent reads as "stepfather"/"stepmother" here too instead of
// silently losing that distinction just because this is a different call
// site touching the same parent record.
function relationLabelForParent(parent) {
  if (parent.role === "guardian") return parent.guardianRelation ?? "guardian";
  return parent.relationshipType === "step" ? `step${parent.role}` : parent.role;
}

function applyParentYear(parent, jobsData) {
  if (!jobsData || jobsData.length === 0) return null;
  const relationLabel = relationLabelForParent(parent);

  if (parent.employed) {
    if (randInt(0, 99) < PARENT_JOB_LOSS_CHANCE) {
      parent.employed = false;
      parent.job = null;
      return `Your ${relationLabel}, ${parent.name}, lost their job.`;
    }
    if (randInt(0, 99) < PARENT_JOB_CHANGE_CHANCE) {
      const title = pickJobTitle(jobsData);
      parent.job = title;
      const promoted = Math.random() < 0.3;
      return promoted
        ? `Your ${relationLabel}, ${parent.name}, got promoted to ${title}.`
        : `Your ${relationLabel}, ${parent.name}, changed jobs and is now working as ${title}.`;
    }
    return null;
  }

  if (randInt(0, 99) < PARENT_JOB_GAIN_CHANCE) {
    const title = pickJobTitle(jobsData);
    parent.employed = true;
    parent.job = title;
    return `Your ${relationLabel}, ${parent.name}, got a new job as ${title}.`;
  }
  return null;
}

// Siblings age up alongside the player (nothing previously incremented
// their age at all) and can cross a school milestone the same year --
// detected by comparing this year's grade to last year's rather than
// tracking a separate persistent status field, since a sibling isn't a
// second player character with their own education record.
function applySiblingYear(sibling) {
  const previousGrade = getGradeLevelForAge(sibling.age);
  sibling.age += 1;
  const grade = getGradeLevelForAge(sibling.age);

  if (grade === 0 && previousGrade === null) {
    return `${sibling.name} started school this year.`;
  }
  if (grade === null && previousGrade === 12) {
    return `${sibling.name} graduated high school.`;
  }
  return null;
}

// A family can grow mid-game too, not just at character creation -- a
// small yearly chance per eligible mother (biological, or step -- a
// step-mother having a child with the character's biological parent is
// exactly how a "half-sibling" comes about) within a plausible childbearing
// age range. Everyone in this game's family model shares one surname (see
// generateSiblings at character creation), so the new sibling's last name is
// pulled from the mother's own name -- NOT from `character.name`, which for
// a single-word player-entered name never has a surname appended to it at
// all (parsePlayerName generates a separate `lastName` used for family
// members without ever rewriting the player's own `character.name`).
const PARENT_BIRTH_CHANCE = 3; // percent, per eligible mother, per year
const CHILDBEARING_MIN_AGE = 20;
const CHILDBEARING_MAX_AGE = 45;

function applyParentBirthYear(character, namePools, countryId) {
  const eligibleMothers = (character.family?.parents ?? []).filter(
    (p) =>
      p.role === "mother" &&
      (p.relationshipType === "biological" || p.relationshipType === "step") &&
      p.age >= CHILDBEARING_MIN_AGE &&
      p.age <= CHILDBEARING_MAX_AGE
  );
  if (eligibleMothers.length === 0) return null;
  if (randInt(0, 99) >= PARENT_BIRTH_CHANCE) return null;

  const mother = eligibleMothers[randInt(0, eligibleMothers.length - 1)];
  const gender = Math.random() < 0.5 ? "male" : "female";
  // mother.name is always "{firstName} {lastName}" (see generateParent at
  // character creation), so this reliably recovers the shared family
  // surname regardless of what the player themselves typed.
  const lastName = mother.name.trim().split(/\s+/).slice(-1)[0];
  const firstName = generateRandomName(namePools, countryId, gender).split(" ")[0];
  const name = `${firstName} ${lastName}`;

  character.family.siblings.push({
    name,
    age: 0,
    relationshipType: mother.relationshipType,
    closeness: 60,
  });

  const halfPrefix = mother.relationshipType === "step" ? "half-" : "";
  const relationWord = `${halfPrefix}${gender === "male" ? "brother" : "sister"}`;

  return `Your mother, ${mother.name}, gave birth to your new ${relationWord}, ${name}.`;
}

function applyFamilyYear(character, jobsData, namePools, countryId) {
  let lines = [];
  // A new sibling is the most significant family event that can happen in a
  // year -- checked, and pushed, first so `slice(0, MAX_FAMILY_LINES_PER_YEAR)`
  // below can never silently drop it in favor of a routine parent job change
  // or sibling milestone that happened to roll the same year.
  const birthLine = applyParentBirthYear(character, namePools, countryId);
  if (birthLine) lines.push(birthLine);
  for (const parent of character.family?.parents ?? []) {
    const line = applyParentYear(parent, jobsData);
    if (line) lines.push(line);
  }
  for (const sibling of character.family?.siblings ?? []) {
    const line = applySiblingYear(sibling);
    if (line) lines.push(line);
  }
  if (lines.length > MAX_FAMILY_LINES_PER_YEAR) {
    lines = lines.slice(0, MAX_FAMILY_LINES_PER_YEAR);
  }
  return lines;
}

function ageUp(character, jobsData, namePools, countryId) {
  const previousStage = getLifeStage(character.age);
  character.age += 1;
  applyStatDrift(character);
  const currentStage = getLifeStage(character.age);

  // The feed groups entries under an "Age N" header now, so a bare "Turned
  // N." line would be redundant with that header -- only worth a line of
  // its own when the year also crossed into a new life stage.
  if (currentStage.id !== previousStage.id) {
    pushHistory(character, `${character.name} is now a ${currentStage.label}.`);
  }

  const jobLine = applyJobYear(character, jobsData);
  if (jobLine) pushHistory(character, jobLine);

  // Coworker turnover/development itself happens in applyNpcLifeYear
  // (called separately from rollAgeUpHappening) alongside every other
  // relationship-tier-gated NPC development -- this just makes sure a
  // freshly-hired character's roster exists before that tick can act on it.
  if (character.job) {
    ensureCoworkers(character, namePools, countryId);
  }

  const schoolLines = applySchoolYear(character, namePools, countryId);
  for (const schoolLine of schoolLines) pushHistory(character, schoolLine);

  const familyLines = applyFamilyYear(character, jobsData, namePools, countryId);
  for (const familyLine of familyLines) pushHistory(character, familyLine);
}

export { ageUp };
