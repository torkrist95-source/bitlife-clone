import { randInt, clampStat, pushHistory, pushCareerEvent } from "./character.js";
import { ensureCoworkers } from "./npc.js";

// ---------- Main Job / Career ----------
// One canonical implementation of "can this character take this job, and
// does the application actually succeed" -- app.js's Jobs accordion is a
// thin renderer over these functions, the same way school.js owns
// study/club/extracurricular mutation and app.js just wires buttons to it.

// Ranks character.education.status so a job's optional minEducationStatus
// can be compared against "at least this far along" rather than an exact
// string match -- workforce/graduated_hs/ged are treated as equally past
// high school (this game doesn't rank "went straight to work", "graduated
// and then didn't go to college", or "passed the GED" beneath each other --
// all three clear the same bar). hs_dropout ranks with not_started/
// elementary/middle, below high_school itself -- reaching any of the
// three above requires having actually finished one way or another, so a
// dropout who hasn't yet passed their GED (school.js's attemptGed) hasn't
// earned that rank.
const EDUCATION_RANK = {
  not_started: 0,
  hs_dropout: 0,
  elementary: 1,
  middle: 2,
  high_school: 3,
  graduated_hs: 4,
  workforce: 4,
  ged: 4,
  college: 5,
  graduated_college: 6,
};

// Hard gates only -- age and smarts, plus optional ones a job can declare:
// education status, a specific skill, and (for the graduated_college tier)
// a required college major. Absent on jobs that don't need them, so this
// stays a pure extension rather than a behavior change for those. Separated
// from getEligibleJobs below so app.js can tell "not qualified at all"
// apart from "qualified but already applied this year" for its empty-state
// messaging, without duplicating this requirement logic.
function isQualifiedForJob(character, job) {
  if (character.age < job.minAge) return false;
  if (job.minSmarts && character.stats.smarts < job.minSmarts) return false;
  if (job.minEducationStatus && EDUCATION_RANK[character.education.status] < EDUCATION_RANK[job.minEducationStatus]) return false;
  if (job.minSkill && (character.skills[job.minSkill.skill] ?? 0) < job.minSkill.value) return false;
  if (job.requiredMajors && !job.requiredMajors.includes(character.education.major)) return false;
  return true;
}

function hasAppliedToJobThisYear(character, jobId) {
  return (character.jobApplicationsThisYear ?? []).includes(jobId);
}

// Everything the player can actually apply to right now -- qualified AND
// not already attempted this year. A rejection isn't infinitely
// re-attemptable in the same year (jobApplicationsThisYear, reset in
// engine.js's ageUp) -- without this cap, any nonzero chance eventually
// succeeds just by spam-clicking Apply, which made the whole roll pointless.
function getEligibleJobs(character, jobsData) {
  // A Special Career (specialCareers.js) replaces Main Job entirely -- no
  // applying for a normal job while pursuing one.
  if (character.specialCareer) return [];
  return jobsData.filter((job) => isQualifiedForJob(character, job) && !hasAppliedToJobThisYear(character, job.id));
}

// The actual "meeting requirements isn't a guarantee" roll -- same
// clamp-and-roll shape as school.js's attemptExtracurricular, just driven
// by smarts/skill/education instead of a single stat check. Experience is
// deliberately not a factor here: every application starts at entry level
// (levelIndex 0) regardless, and real experience-gating already exists for
// *promotions* (engine.js's MIN_YEARS_BEFORE_PROMOTION/PROMOTION_CHANCE),
// not initial hiring.
function rollJobApplication(character, job) {
  const smartsBonus = (character.stats.smarts - 50) / 4;
  const skillBonus = job.minSkill ? Math.floor((character.skills[job.minSkill.skill] ?? 0) / 4) : 0;
  const eduBonus = job.minEducationStatus
    ? Math.min(15, (EDUCATION_RANK[character.education.status] - EDUCATION_RANK[job.minEducationStatus]) * 5)
    : 0;
  const chance = Math.max(30, Math.min(90, 50 + smartsBonus + skillBonus + eduBonus));
  return randInt(0, 99) < chance;
}

// Applies to whichever job the player picked from the eligible list --
// resolves the roll, mutates character.job/coworkers/happiness/history on
// either branch, and returns the same {succeeded, resultText} shape
// attemptExtracurricular already uses, so app.js's UI wiring is identical.
function applyForJob(character, job, namePools, countryId) {
  const level = job.levels[0];
  character.jobApplicationsThisYear = character.jobApplicationsThisYear ?? [];
  character.jobApplicationsThisYear.push(job.id);

  if (!rollJobApplication(character, job)) {
    character.stats.happiness = clampStat(character.stats.happiness - 2);
    const line = `You interviewed for the ${level.title} role, but they went with another candidate.`;
    pushHistory(character, line);
    return { succeeded: false, resultText: line };
  }

  character.job = { jobId: job.id, levelIndex: 0, yearsInRole: 0 };
  const line = `You got a job as ${level.title}.`;
  pushHistory(character, line);
  pushCareerEvent(character, { title: level.title, event: "hired", salary: level.salary });
  ensureCoworkers(character, namePools, countryId);
  return { succeeded: true, resultText: line };
}

export { getEligibleJobs, isQualifiedForJob, hasAppliedToJobThisYear, rollJobApplication, applyForJob };
