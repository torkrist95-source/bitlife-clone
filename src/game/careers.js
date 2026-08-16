import { randInt, clampStat, applyMoneyDelta, formatMoney, pushHistory, pushCareerEvent, MIN_EARNING_AGE } from "./character.js";
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
// stays a pure extension rather than a behavior change for those.
function getEligibleJobs(character, jobsData) {
  return jobsData.filter((job) => {
    if (character.age < job.minAge) return false;
    if (job.minSmarts && character.stats.smarts < job.minSmarts) return false;
    if (job.minEducationStatus && EDUCATION_RANK[character.education.status] < EDUCATION_RANK[job.minEducationStatus]) return false;
    if (job.minSkill && (character.skills[job.minSkill.skill] ?? 0) < job.minSkill.value) return false;
    if (job.requiredMajors && !job.requiredMajors.includes(character.education.major)) return false;
    return true;
  });
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

// ---------- One-Time Jobs ----------
// A browsable pool of gigs, each completable once per character (tracked
// by id, the same "join once, remember by id" convention already used by
// character.education.clubs/extracurriculars) -- unlike Main Job
// applications, these always pay out once attempted (no pass/fail roll),
// per the explicit "browsable list, complete once" design. Also capped at
// a handful of completions per Age Up year (character.jobCaps, reset
// alongside Freelance Gigs' own counter in engine.js's ageUp) -- since
// this path never fails a roll, every call to resolveOneTimeJob is by
// definition a real completion, so the counter can increment unconditionally
// there without risking a rejected attempt consuming a slot.

const YEARLY_ONE_TIME_JOB_CAP = 3;

function isOneTimeJobCapReached(character) {
  return (character.jobCaps?.oneTimeJobsCompleted ?? 0) >= YEARLY_ONE_TIME_JOB_CAP;
}

function getEligibleOneTimeJobs(character, oneTimeJobsData) {
  if (character.age < MIN_EARNING_AGE) return [];
  if (isOneTimeJobCapReached(character)) return [];
  const completed = new Set(character.completedOneTimeJobs ?? []);
  return (oneTimeJobsData ?? []).filter((job) => character.age >= job.minAge && !completed.has(job.id));
}

function resolveOneTimeJob(character, job) {
  const amount = randInt(job.moneyMin, job.moneyMax);
  applyMoneyDelta(character, amount);
  character.completedOneTimeJobs ??= [];
  character.completedOneTimeJobs.push(job.id);
  character.jobCaps ??= { oneTimeJobsCompleted: 0, freelanceGigsCompleted: 0 };
  character.jobCaps.oneTimeJobsCompleted += 1;
  const line = job.resultText.replace("{amount}", formatMoney(amount, character.currencyCode));
  pushHistory(character, line);
  return line;
}

export {
  getEligibleJobs,
  rollJobApplication,
  applyForJob,
  YEARLY_ONE_TIME_JOB_CAP,
  isOneTimeJobCapReached,
  getEligibleOneTimeJobs,
  resolveOneTimeJob,
};
