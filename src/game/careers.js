import { randInt, clampStat, applyMoneyDelta, formatMoney, pushHistory, pushCareerEvent, MIN_EARNING_AGE } from "./character.js";
import { ensureCoworkers } from "./npc.js";

// ---------- Main Job / Career ----------
// One canonical implementation of "can this character take this job, and
// does the application actually succeed" -- app.js's Jobs accordion is a
// thin renderer over these functions, the same way school.js owns
// study/club/extracurricular mutation and app.js just wires buttons to it.

// Ranks character.education.status so a job's optional minEducationStatus
// can be compared against "at least this far along" rather than an exact
// string match -- workforce/graduated_hs are treated as equally past high
// school (this game doesn't rank "went straight to work" beneath
// "graduated and then didn't go to college"). hs_dropout ranks with
// not_started/elementary/middle, below high_school itself -- reaching
// "workforce" or "graduated_hs" both require having actually finished
// (hs_graduation only ever fires at 18 while still enrolled), so a
// dropout who left early hasn't earned that rank.
const EDUCATION_RANK = {
  not_started: 0,
  hs_dropout: 0,
  elementary: 1,
  middle: 2,
  high_school: 3,
  graduated_hs: 4,
  workforce: 4,
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

// ---------- Odd Jobs (automatic, summary-only) ----------
// The roll/trigger itself stays exactly as it was (events.js's
// pickOddJobLine, an automatic per-year background chance) -- this just
// reads the running total/log that function now maintains, for display.

function getOddJobsSummary(character) {
  return {
    total: character.oddJobsTotalEarned ?? 0,
    recent: (character.oddJobLog ?? []).slice(0, 5),
  };
}

// ---------- One-Time Jobs ----------
// A browsable pool of gigs, each completable once per character (tracked
// by id, the same "join once, remember by id" convention already used by
// character.education.clubs/extracurriculars) -- unlike Main Job
// applications, these always pay out once attempted (no pass/fail roll),
// per the explicit "browsable list, complete once" design.

function getEligibleOneTimeJobs(character, oneTimeJobsData) {
  if (character.age < MIN_EARNING_AGE) return [];
  const completed = new Set(character.completedOneTimeJobs ?? []);
  return (oneTimeJobsData ?? []).filter((job) => character.age >= job.minAge && !completed.has(job.id));
}

function resolveOneTimeJob(character, job) {
  const amount = randInt(job.moneyMin, job.moneyMax);
  applyMoneyDelta(character, amount);
  character.completedOneTimeJobs ??= [];
  character.completedOneTimeJobs.push(job.id);
  const line = job.resultText.replace("{amount}", formatMoney(amount, character.currencyCode));
  pushHistory(character, line);
  return line;
}

export { getEligibleJobs, rollJobApplication, applyForJob, getOddJobsSummary, getEligibleOneTimeJobs, resolveOneTimeJob };
