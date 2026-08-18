import { randInt, clampStat, weightedPick, generateRandomName, applyMoneyDelta, formatMoney, pushHistory } from "./character.js";
import { createSocialNpc, registerDynamicGenerators, askForHelp, ensureSocialCircle } from "./npc.js";
import { conditionsPass } from "./events.js";
import { getTrait } from "./personality.js";

// ---------- Grade/status mapping ----------
// A single, simple age->grade formula (K at 5, grade 1 at 6, ... grade 12
// at 17) rather than a lookup table, so every piece of the system that
// needs "what grade would this age be in" asks the same function instead
// of each guessing independently.

function getGradeLevelForAge(age) {
  if (age < 5 || age > 17) return null;
  return age - 5;
}

function getStatusForGrade(grade) {
  if (grade == null) return null;
  if (grade <= 5) return "elementary";
  if (grade <= 8) return "middle";
  return "high_school";
}

function getGradeLabel(grade) {
  if (grade == null) return "";
  return grade === 0 ? "Kindergarten" : `Grade ${grade}`;
}

const STATUS_LABELS = {
  not_started: "Not yet in school",
  elementary: "Elementary School",
  middle: "Middle School",
  high_school: "High School",
  graduated_hs: "Graduated High School",
  hs_dropout: "High School Dropout",
  ged: "GED / High School Equivalency",
  college: "College",
  workforce: "Working (no college)",
  graduated_college: "Graduated College",
};

function getStatusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

// ---------- School/teacher generation ----------

const SCHOOL_NAME_PREFIXES = [
  "Lincoln", "Washington", "Jefferson", "Roosevelt", "Kennedy", "Riverside",
  "Maple Grove", "Oakwood", "Sunnydale", "Fairview", "Cedar Hill", "Greenwood",
];

function generateSchoolName(status) {
  const prefix = SCHOOL_NAME_PREFIXES[randInt(0, SCHOOL_NAME_PREFIXES.length - 1)];
  const suffix = status === "elementary" ? "Elementary School" : status === "middle" ? "Middle School" : "High School";
  return `${prefix} ${suffix}`;
}

const TEACHER_SUBJECTS = ["Math", "English", "Science", "History", "Art"];

function generateTeacher(namePools, countryId, status) {
  const gender = Math.random() < 0.5 ? "male" : "female";
  const subject = status === "elementary" ? "Homeroom" : TEACHER_SUBJECTS[randInt(0, TEACHER_SUBJECTS.length - 1)];
  return {
    id: `teacher_${Date.now().toString(36)}_${randInt(0, 9999)}`,
    name: generateRandomName(namePools, countryId, gender),
    age: randInt(28, 60),
    subject,
    stats: {
      health: randInt(60, 100),
      happiness: randInt(50, 90),
      smarts: randInt(60, 95),
      looks: randInt(30, 70),
      fame: 0,
      reputation: randInt(50, 80),
    },
    // Starts at acquaintance-level rapport, same as every other new NPC --
    // has to be built up via Ask for Help / Thank Teacher, not assumed.
    closeness: randInt(10, 30),
  };
}

// ---------- Yearly tick, called from engine.js's ageUp ----------
// Deterministic grade/status progression and GPA drift happen every year
// automatically (like job income); classmate churn is a small per-year
// chance; graduation is a one-time forced event via the existing
// pendingEventId mechanism, same as any other scripted chain.

const GPA_DRIFT_MIN = -0.15;
const GPA_DRIFT_MAX = 0.2;

function applySchoolYear(character, namePools, countryId) {
  const edu = character.education;
  const lines = [];

  // Without this, a dropout younger than 18 would get silently
  // re-enrolled next year -- the grade/status logic below derives
  // everything from age alone, with no memory that this specific
  // character already left school on purpose.
  if (edu.status === "hs_dropout") return lines;

  // The automatic tick only manages ages 5-17; turning 18 while still in
  // high school is exactly when graduation happens, once, via the same
  // forced-event mechanism every other chain in this game already uses.
  if (character.age === 18 && edu.status === "high_school") {
    character.pendingEventId = "hs_graduation";
    return lines;
  }

  const grade = getGradeLevelForAge(character.age);
  const status = getStatusForGrade(grade);
  if (!status) return lines;

  if (edu.status !== status) {
    edu.status = status;
    edu.schoolName = generateSchoolName(status);
    // A new school level means a new teacher, but NOT a wiped social
    // circle -- classmates are the same `socialCircle` friends/crushes
    // system used everywhere else, and moving up a school level shouldn't
    // silently erase relationships (romantic or otherwise) built there.
    // Gradual turnover is handled by applyNpcLifeYear instead.
    edu.teacher = generateTeacher(namePools, countryId, status);
    edu.gpa ??= Number((2.6 + Math.random() * 1.2).toFixed(2));
    edu.clubs = [];
    edu.extracurriculars = [];
    edu.activityProgress = {};
    lines.push(
      status === "elementary"
        ? `You started school at ${edu.schoolName}.`
        : status === "middle"
          ? `You started middle school at ${edu.schoolName}.`
          : `You started high school at ${edu.schoolName}.`
    );
    // The feed line above is the permanent record; this also surfaces the
    // moment as a popup card the same Age Up (rollAgeUpHappening, events.js,
    // always prioritizes a pending forced event over its normal rolls) --
    // both, not one replacing the other. Same forced-event mechanism
    // hs_graduation below already uses; the actual card content is built at
    // runtime by the matching *_reveal generator since the school name isn't
    // known until this point.
    character.pendingEventId =
      status === "elementary" ? "started_elementary_school" : status === "middle" ? "started_middle_school" : "started_high_school";
  }

  edu.gradeLevel = grade;

  // Populated lazily, same rule as the general social circle (age 6+,
  // no-op once already populated) -- catches a character who started
  // school too young for classmates yet as soon as they age into it.
  ensureSocialCircle(character, namePools, countryId);

  if (edu.gpa != null) {
    const smartsPull = (character.stats.smarts - 50) / 200;
    const drift = GPA_DRIFT_MIN + Math.random() * (GPA_DRIFT_MAX - GPA_DRIFT_MIN) + smartsPull;
    edu.gpa = Math.max(0, Math.min(4, Number((edu.gpa + drift).toFixed(2))));
  }

  // Classmate turnover/development itself happens in applyNpcLifeYear
  // (called separately from rollAgeUpHappening) alongside every other
  // relationship-tier-gated NPC development, not here.

  return lines;
}

// ---------- Dropping out of high school ----------
// Available a couple of years before graduation would normally happen
// (age 16+, per the real-world minimum this is usually legally possible),
// not at any younger K-12 stage -- elementary/middle school kids don't
// "drop out." The way back is the GED section right below.

const MIN_HS_DROPOUT_AGE = 16;

function canDropOutOfHighSchool(character) {
  return character.education.status === "high_school" && character.age >= MIN_HS_DROPOUT_AGE;
}

function dropOutOfHighSchool(character) {
  const edu = character.education;
  edu.status = "hs_dropout";
  edu.clubs = [];
  edu.extracurriculars = [];
  edu.activityProgress = {};
  const line = "You dropped out of high school without graduating.";
  pushHistory(character, line);
  character.stats.happiness = clampStat(character.stats.happiness - 3);
  return line;
}

// ---------- GED ----------
// A dropout's way back in -- retryable (a failed attempt costs a little
// happiness but never locks the option out), same shape as an
// extracurricular tryout. Passing sets a status distinct from
// graduated_hs/workforce (same EDUCATION_RANK tier, careers.js) so the
// character's real education history stays visible rather than reading as
// an ordinary graduate, while unlocking exactly the same jobs.

const GED_PASS_BASE_CHANCE = 45;

// Capped at one attempt per year (gedAttemptsThisYear, reset in engine.js's
// ageUp) -- same "infinite retries make any chance meaningless" fix already
// applied to job applications.
function canAttemptGed(character) {
  return character.education.status === "hs_dropout" && (character.gedAttemptsThisYear ?? 0) < 1;
}

function attemptGed(character) {
  character.gedAttemptsThisYear = (character.gedAttemptsThisYear ?? 0) + 1;

  const smarts = character.stats.smarts ?? 50;
  const ambitiousBonus = (getTrait(character, "ambitious") - 50) / 5;
  const chance = Math.max(20, Math.min(90, GED_PASS_BASE_CHANCE + (smarts - 50) / 2 + ambitiousBonus));

  if (randInt(0, 99) < chance) {
    character.education.status = "ged";
    character.stats.happiness = clampStat(character.stats.happiness + 8);
    character.stats.reputation = clampStat(character.stats.reputation + 2);
    const line = "You passed your GED! You now have the equivalent of a high school diploma.";
    pushHistory(character, line);
    return { succeeded: true, resultText: line };
  }

  character.stats.happiness = clampStat(character.stats.happiness - 2);
  const line = "You didn't pass the GED this time, but you can study and try again next year.";
  pushHistory(character, line);
  return { succeeded: false, resultText: line };
}

// ---------- Studying ----------

function studyHarder(character) {
  const smartsBonus = (character.stats.smarts - 50) / 10;
  const chance = Math.max(15, Math.min(85, 50 + smartsBonus * 4));
  character.stats.happiness = clampStat(character.stats.happiness - 2);

  if (randInt(0, 99) < chance) {
    const gpaGain = 0.1 + Math.random() * 0.2;
    character.education.gpa = Math.max(0, Math.min(4, Number(((character.education.gpa ?? 3) + gpaGain).toFixed(2))));
    character.stats.smarts = clampStat(character.stats.smarts + randInt(1, 3));
    const line = "You put in some real effort studying, and it showed -- your grades improved.";
    pushHistory(character, line);
    return line;
  }

  character.stats.smarts = clampStat(character.stats.smarts + 1);
  const line = "You studied hard, but it didn't translate into better grades this time. At least the material is starting to sink in.";
  pushHistory(character, line);
  return line;
}

// ---------- Clubs ----------

// A real student can't realistically carry a full course load's worth of
// clubs -- capped separately from extracurriculars below since they're
// the lower-commitment option and reasonably support carrying more than
// one at once.
const MAX_CLUBS = 2;

function getAvailableClubs(character, clubsData) {
  const joined = new Set(character.education.clubs ?? []);
  if (joined.size >= MAX_CLUBS) return [];
  return clubsData.filter(
    (club) => character.age >= club.minAge && character.age <= club.maxAge && !joined.has(club.id) && conditionsPass(character, club.requires)
  );
}

function joinClub(character, club, namePools, countryId) {
  character.education.clubs.push(club.id);
  for (const [skill, delta] of Object.entries(club.skillGrant ?? {})) {
    character.skills[skill] = clampStat((character.skills[skill] ?? 0) + delta);
  }
  if (club.hobbyGrant && !character.hobbies.includes(club.hobbyGrant)) {
    character.hobbies.push(club.hobbyGrant);
  }
  if (club.reputationEffect) {
    character.stats.reputation = clampStat(character.stats.reputation + club.reputationEffect);
  }
  character.stats.happiness = clampStat(character.stats.happiness + 3);

  let resultText = `You joined ${club.label}.`;
  const roll = randInt(0, 99);
  if (roll < 15) {
    const newcomer = createSocialNpc(namePools, countryId, character.age + randInt(-1, 1));
    character.socialCircle = character.socialCircle ?? [];
    character.socialCircle.push(newcomer);
    resultText += ` You hit it off with a new member named ${newcomer.name}.`;
  } else if (roll < 40 && (character.socialCircle ?? []).length > 0) {
    const friend = character.socialCircle[randInt(0, character.socialCircle.length - 1)];
    friend.closeness = clampStat(friend.closeness + randInt(5, 10));
    resultText += ` You bonded with ${friend.name} over it.`;
  }

  pushHistory(character, resultText);
  return resultText;
}

function leaveClub(character, clubId, clubsData) {
  character.education.clubs = (character.education.clubs ?? []).filter((id) => id !== clubId);
  const club = clubsData.find((c) => c.id === clubId);
  const line = `You left ${club?.label ?? "the club"}.`;
  pushHistory(character, line);
  return line;
}

// Repeatable, unlike joinClub above -- a smaller version of the same skill/
// happiness/bonding rewards, available every time the player wants it
// rather than once at signup. Odds of the two social rolls are lower than
// joinClub's since this can be clicked repeatedly in the same year.
function participateInClub(character, club) {
  for (const [skill, delta] of Object.entries(club.skillGrant ?? {})) {
    character.skills[skill] = clampStat((character.skills[skill] ?? 0) + Math.max(1, Math.ceil(delta / 4)));
  }
  character.stats.happiness = clampStat(character.stats.happiness + randInt(2, 4));

  let resultText = `You spent an afternoon at ${club.label}.`;
  const roll = randInt(0, 99);
  if (roll < 15 && (character.socialCircle ?? []).length > 0) {
    const friend = character.socialCircle[randInt(0, character.socialCircle.length - 1)];
    friend.closeness = clampStat(friend.closeness + randInt(3, 7));
    resultText += ` You bonded with ${friend.name} over it.`;
  }

  pushHistory(character, resultText);
  return resultText;
}

// ---------- Extracurriculars & tryouts ----------

// Extracurriculars are the bigger commitment (tryouts, practices/rehearsals,
// Varsity) -- unlike clubs above, only one at a time.
const MAX_EXTRACURRICULARS = 1;

// A failed tryout can't be re-attempted on the same activity until next
// year (extracurricularTryoutsThisYear, reset in engine.js's ageUp) -- same
// "infinite retries make any chance meaningless" fix already applied to job
// applications. Doesn't affect non-tryout activities (school_band,
// academic_team's tryout:false sibling would just always succeed anyway,
// so there's nothing to cap there) or trying a *different* activity this
// same year.
function hasAttemptedExtracurricularTryoutThisYear(character, activityId) {
  return (character.extracurricularTryoutsThisYear ?? []).includes(activityId);
}

function getAvailableExtracurriculars(character, activitiesData) {
  const joined = new Set(character.education.extracurriculars ?? []);
  if (joined.size >= MAX_EXTRACURRICULARS) return [];
  return activitiesData.filter(
    (a) =>
      character.age >= a.minAge &&
      character.age <= a.maxAge &&
      !joined.has(a.id) &&
      conditionsPass(character, a.requires) &&
      !(a.tryout && hasAttemptedExtracurricularTryoutThisYear(character, a.id))
  );
}

function applyExtracurricularRewards(character, activity) {
  for (const [skill, delta] of Object.entries(activity.skillGrant ?? {})) {
    character.skills[skill] = clampStat((character.skills[skill] ?? 0) + delta);
  }
  if (activity.hobbyGrant && !character.hobbies.includes(activity.hobbyGrant)) {
    character.hobbies.push(activity.hobbyGrant);
  }
  character.stats.happiness = clampStat(character.stats.happiness + 4);
}

// Tracks how long the character has been on a given team, separately from
// the plain `extracurriculars` id list -- needed to gate the Varsity tryout
// below on "at least a season in", and to remember which activities have
// actually made Varsity. Kept as its own small keyed object rather than
// upgrading `extracurriculars` itself to richer entries, so every existing
// reader of that plain id array (the "already joined" filter, the college
// scholarship participation check) keeps working unchanged.
function startActivityProgress(character, activityId) {
  character.education.activityProgress ??= {};
  character.education.activityProgress[activityId] = { joinedAge: character.age, varsity: false };
}

// Not deterministic either way: a highly skilled character can still
// occasionally fail a tryout, and an inexperienced one can still make it.
function attemptExtracurricular(character, activity) {
  if (!activity.tryout) {
    character.education.extracurriculars.push(activity.id);
    applyExtracurricularRewards(character, activity);
    startActivityProgress(character, activity.id);
    const line = `You joined ${activity.label}.`;
    pushHistory(character, line);
    return { succeeded: true, resultText: line };
  }

  character.extracurricularTryoutsThisYear = character.extracurricularTryoutsThisYear ?? [];
  character.extracurricularTryoutsThisYear.push(activity.id);

  const relevantStat = character.stats[activity.statCheck] ?? 50;
  const skillBonus = activity.skillCheck ? (character.skills[activity.skillCheck] ?? 0) / 5 : 0;
  const ambitiousBonus = (getTrait(character, "ambitious") - 50) / 5;
  const chance = Math.max(10, Math.min(90, 35 + (relevantStat - 50) / 2 + skillBonus + ambitiousBonus));

  if (randInt(0, 99) < chance) {
    character.education.extracurriculars.push(activity.id);
    applyExtracurricularRewards(character, activity);
    startActivityProgress(character, activity.id);
    const line = `You made the ${activity.label} team after impressing the coach with your ability.`;
    pushHistory(character, line);
    return { succeeded: true, resultText: line };
  }

  character.stats.happiness = clampStat(character.stats.happiness - 3);
  const line = `You didn't make the ${activity.label} team. The coach felt you needed more experience.`;
  pushHistory(character, line);
  return { succeeded: false, resultText: line };
}

// ---------- Extracurricular practice (recurring) ----------
// The repeatable counterpart to attemptExtracurricular's one-time tryout --
// small recurring skill/happiness gains, plus an occasional themed "big
// moment" roll (a game, a performance, a meet) instead of the flat generic
// sports_competition age-up event this replaces, which used to fire the
// same "your team has a big game" text for a Chess Club member as for a
// varsity athlete. Varsity participants (see attemptVarsityTryout below)
// get bigger gains and better big-moment odds on the same pool.

const BIG_MOMENT_CHANCE = 20; // percent, per participate call
const VARSITY_BIG_MOMENT_BONUS = 10; // added to the roll above, varsity only
const VARSITY_EFFECT_MULTIPLIER = 1.5;
const ATHLETIC_RECRUIT_THRESHOLD = 60;
const ATHLETIC_RECRUIT_CHANCE = 25; // percent, once eligible

// One themed pool per category (see extracurriculars.json's `category`)
// instead of per-individual-activity content -- keeps authoring
// manageable while still giving a sports team, a theater troupe, and an
// academic team their own flavor instead of sharing one mismatched pool.
const BIG_MOMENT_POOLS = {
  sport: [
    { weight: 5, minHealth: 55, happiness: 7, reputation: 3, fame: 1, text: "{activity} had a big game, and you played the game of your life -- a big win." },
    { weight: 6, happiness: 2, text: "{activity} had a big game. You gave it your all, but came up just short." },
    { weight: 3, health: -4, happiness: -1, text: "You pushed hard during a big {activity} game and picked up a minor injury." },
  ],
  performance: [
    { weight: 5, happiness: 7, reputation: 3, fame: 1, text: "You had a big {activity} performance and nailed it -- the crowd loved it." },
    { weight: 6, happiness: 2, text: "You had a big {activity} performance. It went fine, nothing special." },
    { weight: 3, happiness: -2, text: "You froze up during a big {activity} performance. Rough night." },
  ],
  academic: [
    { weight: 5, happiness: 6, reputation: 3, smarts: 1, text: "{activity} had a big competition, and your team took first place." },
    { weight: 6, happiness: 2, text: "{activity} competed, but didn't place this time." },
    { weight: 3, happiness: -2, text: "You blanked on a question during a big {activity} competition. Embarrassing, but you'll get the next one." },
  ],
};

// "Practiced with the Basketball team" / "rehearsed for Theater" / "put in
// a study session with Academic Competition Team" -- one natural phrasing
// per category for the common (non-big-moment) case.
function routineParticipationLine(activity, activityLabel) {
  if (activity.category === "sport") return `You practiced with the ${activityLabel} team.`;
  if (activity.category === "performance") return `You rehearsed for ${activityLabel}.`;
  if (activity.category === "academic") return `You put in a solid study session with ${activityLabel}.`;
  return `You spent some time on ${activityLabel}.`;
}

function participateInExtracurricular(character, activity) {
  const progress = character.education.activityProgress?.[activity.id];
  const isVarsity = progress?.varsity === true;
  const activityLabel = isVarsity ? `Varsity ${activity.label}` : activity.label;

  for (const [skill, delta] of Object.entries(activity.skillGrant ?? {})) {
    character.skills[skill] = clampStat((character.skills[skill] ?? 0) + Math.max(1, Math.ceil(delta / (isVarsity ? 3 : 4))));
  }
  if (activity.category === "sport") {
    character.skills.athleticism = clampStat((character.skills.athleticism ?? 0) + (isVarsity ? 3 : 2));
  }
  character.stats.happiness = clampStat(character.stats.happiness + randInt(2, 4));

  const pool = BIG_MOMENT_POOLS[activity.category];
  const bigMomentRoll = BIG_MOMENT_CHANCE + (isVarsity ? VARSITY_BIG_MOMENT_BONUS : 0);
  if (pool && randInt(0, 99) < bigMomentRoll) {
    const eligible = pool.filter((o) => o.minHealth == null || character.stats.health >= o.minHealth);
    const picked = weightedPick(eligible.length > 0 ? eligible : pool);
    const multiplier = isVarsity ? VARSITY_EFFECT_MULTIPLIER : 1;
    for (const stat of ["happiness", "health", "reputation", "fame", "smarts"]) {
      if (picked[stat] != null) {
        character.stats[stat] = clampStat(character.stats[stat] + Math.round(picked[stat] * multiplier));
      }
    }
    let line = picked.text.replace("{activity}", activityLabel);

    // Rare, one-time bridge toward a future Pro Athlete Special Career --
    // this only ever sets a flag/skill signal, it doesn't grant a career
    // itself (that ladder doesn't exist yet). Gated on a real win
    // (picked.happiness > 0) so it reads as earned, not handed out on a
    // rough night.
    if (
      isVarsity &&
      activity.category === "sport" &&
      picked.happiness > 0 &&
      !character.flags.athleticRecruit &&
      (character.skills.athleticism ?? 0) >= ATHLETIC_RECRUIT_THRESHOLD &&
      randInt(0, 99) < ATHLETIC_RECRUIT_CHANCE
    ) {
      character.flags.athleticRecruit = true;
      line += " A college scout was in the stands and seemed impressed by what they saw.";
    }

    pushHistory(character, line);
    return line;
  }

  const line = routineParticipationLine(activity, activityLabel);
  pushHistory(character, line);
  return line;
}

// ---------- Varsity tryouts ----------
// A second, harder tryout layered on top of the base team -- only offered
// once the character has actually put in a season, and only for the sport
// category (matches "varsity" as a term; performance/academic activities
// don't get this second tier). Feeds `skills.athleticism`, the same signal
// participateInExtracurricular already builds toward the recruitment
// moment above, rather than inventing a separate stat.

const VARSITY_MIN_SEASONS = 1;

// A failed Varsity tryout can't be re-attempted on the same activity until
// next year (varsityTryoutsThisYear, reset in engine.js's ageUp) -- same
// yearly cap already applied to the base tryout above.
function hasAttemptedVarsityTryoutThisYear(character, activityId) {
  return (character.varsityTryoutsThisYear ?? []).includes(activityId);
}

function getVarsityEligibility(character, activity) {
  if (activity.category !== "sport" || !activity.varsityEligible) return false;
  const progress = character.education.activityProgress?.[activity.id];
  if (!progress || progress.varsity) return false;
  if (hasAttemptedVarsityTryoutThisYear(character, activity.id)) return false;
  return character.age - progress.joinedAge >= VARSITY_MIN_SEASONS;
}

function attemptVarsityTryout(character, activity) {
  character.varsityTryoutsThisYear = character.varsityTryoutsThisYear ?? [];
  character.varsityTryoutsThisYear.push(activity.id);

  const relevantStat = character.stats[activity.statCheck] ?? 50;
  const athleticism = character.skills.athleticism ?? 0;
  const ambitiousBonus = (getTrait(character, "ambitious") - 50) / 5;
  const chance = Math.max(10, Math.min(70, 20 + (relevantStat - 50) / 2 + athleticism / 4 + ambitiousBonus));

  if (randInt(0, 99) < chance) {
    character.education.activityProgress[activity.id].varsity = true;
    character.skills.athleticism = clampStat(athleticism + 15);
    character.stats.happiness = clampStat(character.stats.happiness + 8);
    character.stats.reputation = clampStat(character.stats.reputation + 4);
    const line = `You made Varsity ${activity.label}!`;
    pushHistory(character, line);
    return { succeeded: true, resultText: line };
  }

  character.stats.happiness = clampStat(character.stats.happiness - 3);
  const line = `You didn't make Varsity ${activity.label} this time, but you can try out again next season.`;
  pushHistory(character, line);
  return { succeeded: false, resultText: line };
}

function leaveExtracurricular(character, activityId, activitiesData) {
  character.education.extracurriculars = (character.education.extracurriculars ?? []).filter((id) => id !== activityId);
  if (character.education.activityProgress) delete character.education.activityProgress[activityId];
  const activity = activitiesData.find((a) => a.id === activityId);
  const line = `You left ${activity?.label ?? "the activity"}.`;
  pushHistory(character, line);
  return line;
}

// ---------- College ----------
// A small, fixed list rather than its own data file -- same reasoning as
// personality.js's trait list: doesn't need per-content-update JSON
// treatment, and majors.json would just be duplicating ids that already
// have to live on jobs.json's `requiredMajors` anyway.

const MAJORS = [
  { id: "business", label: "Business Administration" },
  { id: "computer_science", label: "Computer Science" },
  { id: "nursing", label: "Nursing" },
  { id: "education", label: "Education" },
  { id: "engineering", label: "Engineering" },
  { id: "journalism", label: "Journalism" },
  { id: "liberal_arts", label: "Liberal Arts" },
];

function getMajorLabel(majorId) {
  return MAJORS.find((m) => m.id === majorId)?.label ?? null;
}

// admissionBonus shapes how hard each tier actually is to get into --
// community college is a near-lock for most students, prestigious is a
// real risk even for a strong one. Same three used both for admission odds
// and as the character's ongoing collegeTier/collegeName after enrolling.
const COLLEGE_TIERS = {
  community: { label: "Community College", admissionBonus: 40 },
  state: { label: "State University", admissionBonus: 0 },
  prestigious: { label: "Prestigious University", admissionBonus: -25 },
};

const COLLEGE_YEARS_TO_GRADUATE = 4;
const COLLEGE_GPA_DRIFT_MIN = -0.15;
const COLLEGE_GPA_DRIFT_MAX = 0.15;

function rollCollegeAdmission(character, tierId) {
  const gpa = character.education.gpa ?? 2.5;
  const gpaBonus = (gpa - 2.5) * 20;
  const smartsBonus = (character.stats.smarts - 50) / 2;
  const wasInvolved = (character.education.clubs?.length ?? 0) + (character.education.extracurriculars?.length ?? 0) > 0;
  const chance = Math.max(5, Math.min(98, 50 + gpaBonus + smartsBonus + (wasInvolved ? 10 : 0) + COLLEGE_TIERS[tierId].admissionBonus));
  return randInt(0, 99) < chance;
}

// Shared by hs_graduation_college below (a followUp from the forced
// graduation chain) and app.js's standalone "Apply to College" menu button
// (for a GED holder, or anyone who graduated but skipped college at the
// time) -- both need the exact same choice, just reached differently.
function collegeChoiceEvent() {
  return {
    id: "college_choice",
    trigger: "age_up",
    conditions: { minAge: 0, maxAge: 200 },
    text: "Which college are you applying to?",
    choices: [
      { label: "Community College", dynamic: "apply_community_college" },
      { label: "State University", dynamic: "apply_state_university" },
      { label: "Prestigious University", dynamic: "apply_prestigious_university" },
    ],
  };
}

// Reachable any time the character has a diploma-equivalent but hasn't
// already gone -- a fresh graduated_hs (chose "Don't Go to College" at the
// time) or a GED holder (attemptGed above). Once in college, status moves
// off both of these, so this naturally stops applying without needing its
// own flag.
function canApplyToCollege(character) {
  const status = character.education.status;
  return status === "graduated_hs" || status === "ged";
}

function fundingChoiceEvent() {
  return {
    id: "college_funding_choice",
    trigger: "age_up",
    conditions: { minAge: 0, maxAge: 200 },
    text: "How will you pay for college?",
    choices: [
      { label: "Ask Parents to Pay", dynamic: "college_fund_parents" },
      { label: "Apply for Student Loan", dynamic: "college_fund_loan" },
      { label: "Apply for Scholarship", dynamic: "college_fund_scholarship" },
    ],
  };
}

function chooseMajorEvent() {
  return {
    id: "college_major_choice",
    trigger: "age_up",
    conditions: { minAge: 0, maxAge: 200 },
    text: "What will you major in?",
    choices: MAJORS.map((m) => ({ label: m.label, dynamic: `choose_major_${m.id}` })),
  };
}

// Deliberately leaves the old HS clubs/extracurriculars arrays alone --
// college doesn't have its own version of them yet (Greek life etc. is a
// later addition), but college_fund_scholarship below still needs to read
// them for its "extracurricular involvement" bonus, and nothing else
// consumes them once education.status stops being a K-12 status (see
// ENROLLED_EDUCATION_STATUSES, character.js), so leaving them as-is is
// harmless rather than something that needs clearing.
function enrollInCollege(character, tierId) {
  const tier = COLLEGE_TIERS[tierId];
  character.education.status = "college";
  character.education.collegeTier = tierId;
  character.education.collegeName = tier.label;
  character.education.collegeYear = 1;
  character.education.gpa = Number((2.6 + Math.random() * 1.2).toFixed(2));
}

function applyToCollege(character, tierId) {
  const tier = COLLEGE_TIERS[tierId];
  if (rollCollegeAdmission(character, tierId)) {
    enrollInCollege(character, tierId);
    const line = `You got into ${tier.label}!`;
    pushHistory(character, line);
    // A quick reveal card before the major picker, same shell->reveal shape
    // as the milestone cards above -- `dynamic` (not `choices`) on the card
    // itself means showEventModal synthesizes a single "Continue" button
    // that chains straight into the existing major-choice screen, so the
    // rest of the admission -> major -> funding -> enrollment flow is
    // completely unchanged.
    return {
      type: "followUp",
      event: {
        id: "college_acceptance_card",
        trigger: "age_up",
        conditions: { minAge: 0, maxAge: 200 },
        icon: "🎉",
        text: `You got into ${tier.label}!`,
        statRows: [{ label: "College", value: tier.label }],
        resultText: null,
        dynamic: "college_acceptance_continue",
      },
    };
  }

  character.education.status = "workforce";
  const line = `You applied to ${tier.label}, but weren't accepted. You decided to enter the workforce instead.`;
  pushHistory(character, line);
  return { type: "resolve", effects: { happiness: -3 }, resultText: null };
}

// ---------- Graduation & college (dynamic choice generators) ----------
// Registered into the shared dynamic-choice registry (npc.js) rather
// than requiring events.js/app.js to know school.js exists -- any module
// can extend the same mechanism this way.

// A handful of these generators push their own line to history directly
// (either because they build it themselves, or because they call a shared
// NPC-interaction function like askForHelp that already self-pushes when
// used from an NPC profile too) -- those return `resultText: null` to tell
// applyResolved (events.js) "I already handled history, don't push this
// again" instead of leaving it to guess from the text.
registerDynamicGenerators({
  ask_classmate_for_help(character) {
    const circle = character.socialCircle ?? [];
    if (circle.length === 0) {
      const line = "You didn't have anyone in mind to ask, so you muddled through on your own.";
      pushHistory(character, line);
      return { type: "resolve", effects: { smarts: -1 }, resultText: null };
    }

    const classmate = circle[randInt(0, circle.length - 1)];
    const helperSmarts = classmate.stats?.smarts ?? 50;
    const chance = Math.max(20, Math.min(85, 40 + (helperSmarts - 50) / 2 + (classmate.closeness - 50) / 4));

    if (randInt(0, 99) < chance) {
      classmate.closeness = clampStat(classmate.closeness + 5);
      character.stats.smarts = clampStat(character.stats.smarts + 2);
      const line = `${classmate.name} walked you through the parts you were stuck on, and it really helped.`;
      pushHistory(character, line);
      return { type: "resolve", effects: { happiness: 2 }, resultText: null };
    }

    const line = `${classmate.name} tried to help, but honestly seemed just as confused as you were.`;
    pushHistory(character, line);
    return { type: "resolve", effects: {}, resultText: null };
  },

  ask_teacher_for_help(character) {
    const teacher = character.education.teacher;
    if (!teacher) {
      const line = "You didn't have a teacher available to ask, so you did your best on your own.";
      pushHistory(character, line);
      return { type: "resolve", effects: {}, resultText: null };
    }
    askForHelp(character, teacher);
    return { type: "resolve", effects: {}, resultText: null };
  },

  // Milestone reveal cards for school.js's own started_elementary_school/
  // started_middle_school/started_high_school forced events (applySchoolYear
  // above) -- same shell -> reveal shape as hs_graduation below, needed
  // because the school name isn't known until runtime and the static JSON
  // shell event can't embed it. `resultText: null` on the card itself is
  // required, not decorative: with no choices of its own, showEventModal
  // synthesizes a single "Continue" button from the card's own top-level
  // fields, and without this, applyResolved would push the button's own
  // label ("Continue") as a bogus second history line alongside the real
  // one applySchoolYear already pushed.
  started_elementary_school_reveal(character) {
    return {
      type: "followUp",
      event: {
        id: "started_elementary_school_card",
        trigger: "age_up",
        conditions: { minAge: 0, maxAge: 200 },
        icon: "🎒",
        text: "You started school!",
        statRows: [{ label: "School", value: character.education.schoolName }],
        resultText: null,
      },
    };
  },

  started_middle_school_reveal(character) {
    return {
      type: "followUp",
      event: {
        id: "started_middle_school_card",
        trigger: "age_up",
        conditions: { minAge: 0, maxAge: 200 },
        icon: "🏫",
        text: "You started middle school!",
        statRows: [{ label: "School", value: character.education.schoolName }],
        resultText: null,
      },
    };
  },

  started_high_school_reveal(character) {
    return {
      type: "followUp",
      event: {
        id: "started_high_school_card",
        trigger: "age_up",
        conditions: { minAge: 0, maxAge: 200 },
        icon: "🏫",
        text: "You started high school!",
        statRows: [{ label: "School", value: character.education.schoolName }],
        resultText: null,
      },
    };
  },

  teacher_praise_reveal(character) {
    const teacher = character.education.teacher;
    if (!teacher) {
      return { type: "resolve", effects: { happiness: 2 }, resultText: "A teacher complimented your work, which felt good to hear." };
    }
    teacher.closeness = clampStat(teacher.closeness + randInt(4, 8));
    character.stats.reputation = clampStat(character.stats.reputation + 2);
    const line = `${teacher.name} told you that you've been doing excellent work lately and encouraged you to keep it up.`;
    pushHistory(character, line);
    return { type: "resolve", effects: { happiness: 5 }, resultText: null };
  },

  hs_graduation_reveal(character) {
    const gpaText = character.education.gpa != null ? character.education.gpa.toFixed(2) : "N/A";
    return {
      type: "followUp",
      event: {
        id: "hs_graduation_choice",
        trigger: "age_up",
        conditions: { minAge: 0, maxAge: 200 },
        icon: "🎓",
        text: "Congratulations! You graduated from high school!",
        statRows: [{ label: "Final GPA", value: gpaText }],
        choices: [
          { label: "Apply to College", dynamic: "hs_graduation_college" },
          { label: "Enter the Workforce", dynamic: "hs_graduation_workforce" },
          { label: "Don't Go to College", dynamic: "hs_graduation_no_college" },
        ],
      },
    };
  },

  hs_graduation_college() {
    return { type: "followUp", event: collegeChoiceEvent() };
  },

  // The Continue button on applyToCollege's acceptance card (above) --
  // chains into the same major picker every acceptance already led to
  // before that card existed.
  college_acceptance_continue() {
    return { type: "followUp", event: chooseMajorEvent() };
  },

  apply_community_college(character) {
    return applyToCollege(character, "community");
  },

  apply_state_university(character) {
    return applyToCollege(character, "state");
  },

  apply_prestigious_university(character) {
    return applyToCollege(character, "prestigious");
  },

  hs_graduation_workforce(character) {
    character.education.status = "workforce";
    const line = "You decided to skip college for now and jump straight into the workforce. Time to start your career.";
    pushHistory(character, line);
    return { type: "resolve", effects: { happiness: 3 }, resultText: null };
  },

  hs_graduation_no_college(character) {
    character.education.status = "graduated_hs";
    const line = "You decided not to go to college, at least for now. There's no rush -- you can always change your mind later.";
    pushHistory(character, line);
    return { type: "resolve", effects: {}, resultText: null };
  },

  college_fund_parents(character) {
    const parents = character.family?.parents ?? [];
    const avgCloseness = parents.length > 0 ? parents.reduce((sum, p) => sum + (p.closeness ?? 50), 0) / parents.length : 50;
    const unemployedParent = parents.find((p) => !p.employed);
    const employedParent = parents.find((p) => p.employed);

    const chance = Math.max(10, Math.min(85, 35 + (avgCloseness - 50) / 2 + (employedParent ? 15 : -10)));
    if (randInt(0, 99) < chance) {
      const line = "Your parents agreed to pay your college tuition.";
      pushHistory(character, line);
      return { type: "resolve", effects: { happiness: 6 }, resultText: null };
    }

    let reason = "your family isn't currently able to cover the cost.";
    if (unemployedParent) {
      reason = `your ${unemployedParent.role} recently lost their job, and your family isn't currently able to cover the cost.`;
    } else if (avgCloseness < 45) {
      reason = "your relationship with them has been strained lately.";
    }
    const line = `Your parents declined to pay your tuition. Unfortunately, ${reason}`;
    pushHistory(character, line);
    return { type: "resolve", effects: { happiness: -4 }, resultText: null };
  },

  college_fund_loan(character) {
    const chance = Math.max(15, Math.min(90, 55 + (character.stats.smarts - 50) / 3));
    if (randInt(0, 99) < chance) {
      const amount = randInt(15, 42) * 1000;
      applyMoneyDelta(character, amount);
      const line = `Your student loan application was approved. You were approved for ${formatMoney(amount, character.currencyCode)} in student loans.`;
      pushHistory(character, line);
      return { type: "resolve", effects: {}, resultText: null };
    }
    const line = "Your student loan application was rejected because you did not meet the lender's eligibility requirements.";
    pushHistory(character, line);
    return { type: "resolve", effects: { happiness: -2 }, resultText: null };
  },

  college_fund_scholarship(character) {
    const gpa = character.education.gpa ?? 0;
    const minGpa = 3.0;
    if (gpa < minGpa) {
      const line = `Your scholarship application was rejected because the minimum GPA requirement was ${minGpa.toFixed(1)} and your GPA was ${gpa.toFixed(1)}.`;
      pushHistory(character, line);
      return { type: "resolve", effects: { happiness: -2 }, resultText: null };
    }

    const hasParticipation = (character.education.extracurriculars?.length ?? 0) > 0 || (character.education.clubs?.length ?? 0) > 0;
    const competitionChance = hasParticipation ? 55 : 35;

    if (randInt(0, 99) < competitionChance) {
      const amount = randInt(3, 15) * 1000;
      applyMoneyDelta(character, amount);
      const note = hasParticipation ? " Your academic record and extracurricular involvement helped your application stand out." : "";
      const line = `You were awarded a ${formatMoney(amount, character.currencyCode)} scholarship.${note}`;
      pushHistory(character, line);
      return { type: "resolve", effects: { happiness: 5, reputation: 2 }, resultText: null };
    }

    const line = "You met the scholarship's requirements, but the award was given to another applicant.";
    pushHistory(character, line);
    return { type: "resolve", effects: { happiness: -1 }, resultText: null };
  },

  college_graduation_reveal(character) {
    character.education.status = "graduated_college";
    const majorLabel = getMajorLabel(character.education.major) ?? "your field";
    const gpaText = character.education.gpa != null ? character.education.gpa.toFixed(2) : "N/A";
    const collegeName = character.education.collegeName ?? "college";
    const line = `Congratulations! You graduated from ${collegeName} with a degree in ${majorLabel}! Final GPA: ${gpaText}`;
    pushHistory(character, line);
    // Effects applied directly here (rather than via the returned `effects`
    // field) because a followUp -- unlike `resolve` -- doesn't run
    // applyResolved for this generator's own return value; the followUp
    // card just displays, it doesn't separately re-apply anything.
    character.stats.happiness = clampStat(character.stats.happiness + 10);
    character.stats.reputation = clampStat(character.stats.reputation + 3);
    return {
      type: "followUp",
      event: {
        id: "college_graduation_card",
        trigger: "age_up",
        conditions: { minAge: 0, maxAge: 200 },
        icon: "🎓",
        text: `You graduated from ${collegeName}!`,
        statRows: [
          { label: "Major", value: majorLabel },
          { label: "Final GPA", value: gpaText },
        ],
        resultText: null,
      },
    };
  },
});

// One generator per major, all doing the same thing -- registered
// separately from the object literal above rather than 7 nearly-identical
// entries typed out by hand. Chains straight into the existing funding
// choice, same next step hs_graduation_college always led to.
const majorGenerators = {};
for (const major of MAJORS) {
  majorGenerators[`choose_major_${major.id}`] = (character) => {
    character.education.major = major.id;
    const line = `You declared ${major.label} as your major.`;
    pushHistory(character, line);
    return { type: "followUp", event: fundingChoiceEvent() };
  };
}
registerDynamicGenerators(majorGenerators);

// ---------- College: yearly tick, studying, dropping out ----------

function applyCollegeYear(character) {
  const edu = character.education;
  if (edu.status !== "college") return null;

  // Defensive default for a save that somehow reached "college" before
  // this system existed (the old dead-end version) -- treat it as freshly
  // enrolled rather than crashing on a missing collegeYear.
  edu.collegeYear ??= 1;

  if (edu.collegeYear >= COLLEGE_YEARS_TO_GRADUATE) {
    character.pendingEventId = "college_graduation";
    return null;
  }

  edu.collegeYear += 1;
  if (edu.gpa != null) {
    const smartsPull = (character.stats.smarts - 50) / 200;
    const drift = COLLEGE_GPA_DRIFT_MIN + Math.random() * (COLLEGE_GPA_DRIFT_MAX - COLLEGE_GPA_DRIFT_MIN) + smartsPull;
    edu.gpa = Math.max(0, Math.min(4, Number((edu.gpa + drift).toFixed(2))));
  }
  return null;
}

// Reuses studyHarder as-is -- it already just moves gpa/smarts off
// character.education.gpa/character.stats without caring whether the
// character is in high school or college.
function collegeSocialize(character) {
  character.stats.happiness = clampStat(character.stats.happiness + randInt(4, 8));
  const drop = 0.05 + Math.random() * 0.15;
  character.education.gpa = Math.max(0, Math.min(4, Number(((character.education.gpa ?? 3) - drop).toFixed(2))));

  let line = "You spent the week hanging out with friends instead of hitting the books.";
  if ((character.socialCircle ?? []).length > 0 && randInt(0, 99) < 30) {
    const friend = character.socialCircle[randInt(0, character.socialCircle.length - 1)];
    friend.closeness = clampStat(friend.closeness + randInt(3, 8));
    line += ` You and ${friend.name} had a great time.`;
  }
  pushHistory(character, line);
  return line;
}

function dropOutOfCollege(character) {
  const edu = character.education;
  edu.status = "workforce";
  const line = `You dropped out of ${edu.collegeName ?? "college"} without finishing your degree.`;
  pushHistory(character, line);
  character.stats.happiness = clampStat(character.stats.happiness - 5);
  return line;
}

// dropOutOfCollege deliberately never clears major/collegeTier/
// collegeName/collegeYear/gpa -- they're what makes returning possible.
// `collegeYear != null` is what distinguishes "workforce because they
// dropped out of college" from "workforce because they never went"
// (hs_graduation_workforce), which never sets those fields at all.
function canReturnToCollege(character) {
  return character.education.status === "workforce" && character.education.collegeYear != null;
}

// Resuming rather than reapplying -- picks back up at the exact year/GPA/
// major they left at (applyCollegeYear, engine.js, needs nothing new to
// keep ticking once status is "college" again), not a fresh admission
// roll. They already got in once.
function returnToCollege(character) {
  const edu = character.education;
  edu.status = "college";
  const line = `You decided to go back to ${edu.collegeName ?? "college"} to finish your degree.`;
  pushHistory(character, line);
  character.stats.happiness = clampStat(character.stats.happiness + 5);
  return line;
}

export {
  getGradeLevelForAge,
  getStatusForGrade,
  getGradeLabel,
  getStatusLabel,
  applySchoolYear,
  canDropOutOfHighSchool,
  dropOutOfHighSchool,
  canAttemptGed,
  attemptGed,
  canApplyToCollege,
  collegeChoiceEvent,
  studyHarder,
  MAX_CLUBS,
  getAvailableClubs,
  joinClub,
  leaveClub,
  participateInClub,
  MAX_EXTRACURRICULARS,
  getAvailableExtracurriculars,
  attemptExtracurricular,
  participateInExtracurricular,
  getVarsityEligibility,
  attemptVarsityTryout,
  leaveExtracurricular,
  MAJORS,
  getMajorLabel,
  applyCollegeYear,
  collegeSocialize,
  dropOutOfCollege,
  canReturnToCollege,
  returnToCollege,
};
