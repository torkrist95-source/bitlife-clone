import { randInt, pushHistory, MIN_EARNING_AGE } from "./character.js";
import { ensurePartTimeCoworkers, endPartTimeCoworkerRelationships } from "./npc.js";

// ---------- Part-Time Jobs ----------
// A second, independent job slot alongside Main Job/Career (careers.js) --
// a character can hold both at once. Deliberately simpler than a Main Job:
// no application roll (these are easy-to-get teen jobs, not a competitive
// hire) and no promotion ladder (a fixed hourly wage/weekly-hours pair
// rolled once at hire, same "fixed number once hired" idea as a Main Job
// level's salary, just never advancing). Income is real hourly-wage math,
// but only ever applied once per year at Age Up -- this game has no
// week/day granularity to actually simulate weekly paychecks.

const WEEKS_PER_YEAR = 52;
const PART_TIME_LAYOFF_CHANCE = 4; // percent, per year while employed

function getEligiblePartTimeJobs(character, partTimeJobsData) {
  if (character.age < MIN_EARNING_AGE) return [];
  return (partTimeJobsData ?? []).filter((job) => character.age >= job.minAge);
}

// Always succeeds -- no rejection roll, matching Freelance Gigs/One-Time
// Jobs' "casual, no interview" tone rather than Main Job's competitive
// applyForJob.
function applyForPartTimeJob(character, job, namePools, countryId) {
  const hourlyWage = randInt(job.wageMin, job.wageMax);
  const weeklyHours = randInt(job.hoursMin, job.hoursMax);
  character.partTimeJob = { jobId: job.id, hourlyWage, weeklyHours, yearsInRole: 0 };
  const line = `You got a part-time job as a ${job.title}.`;
  pushHistory(character, line);
  ensurePartTimeCoworkers(character, namePools, countryId);
  return { resultText: line };
}

// Pays the year's income, then rolls for a layoff -- the same yearly-tick
// shape as careers.js's applyJobYear, minus the promotion half (no ladder
// to climb here). Returns a history line, or null if unemployed or nothing
// beyond the paycheck happened.
function applyPartTimeJobYear(character, partTimeJobsData) {
  if (!character.partTimeJob) return null;

  const jobDef = partTimeJobsData?.find((j) => j.id === character.partTimeJob.jobId);
  if (!jobDef) {
    // A job that no longer resolves against partTimeJobsData -- treat as
    // unemployed rather than leaving a stale reference in place.
    character.partTimeJob = null;
    endPartTimeCoworkerRelationships(character);
    return null;
  }

  const { hourlyWage, weeklyHours } = character.partTimeJob;
  character.money += hourlyWage * weeklyHours * WEEKS_PER_YEAR;
  character.partTimeJob.yearsInRole += 1;

  if (randInt(0, 99) < PART_TIME_LAYOFF_CHANCE) {
    const title = jobDef.title;
    character.partTimeJob = null;
    endPartTimeCoworkerRelationships(character);
    return `You were let go from your part-time job as a ${title}.`;
  }

  return null;
}

export { getEligiblePartTimeJobs, applyForPartTimeJob, applyPartTimeJobYear };
