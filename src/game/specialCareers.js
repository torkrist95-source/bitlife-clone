import { randInt, clampStat, pushHistory, pushCareerEvent } from "./character.js";
import { conditionsPass } from "./events.js";
import { endCoworkerRelationships } from "./npc.js";

// ---------- Special Careers ----------
// A separate ladder from Main Job/Career (careers.js), reusing the exact
// same generic `requires` condition engine events.js already built rather
// than inventing bespoke gating logic. Entry is a discovery/tryout, not a
// normal application -- gated by a real skill plus (for pro_athlete) the
// existing `flags.athleticRecruit` bridge school.js already sets when a
// varsity athlete gets a big win and "a college scout was in the stands."
// Promotion through the ladder is driven by accumulated `stats.fame`
// instead of years-in-role + a flat chance roll (careers.js's
// MIN_YEARS_BEFORE_PROMOTION/PROMOTION_CHANCE) -- climbing a Special
// Career is about building a following, not seniority.

const MIN_SPECIAL_CAREER_AGE = 18;

function getEligibleSpecialCareers(character, specialCareersData) {
  if (character.specialCareer) return [];
  if (character.age < MIN_SPECIAL_CAREER_AGE) return [];
  return specialCareersData.filter((sc) => conditionsPass(character, sc.requires));
}

// Skill-driven, same clamp-and-roll shape as careers.js's rollJobApplication
// -- floor of 30% (a total unknown still gets a shot) rising with the
// relevant skill, capped at 85% (never a guarantee; this is meant to feel
// like a break, not a formality).
function rollSpecialCareerTryout(character, specialCareer) {
  const skillValue = character.skills[specialCareer.tryoutSkill] ?? 0;
  const chance = Math.max(30, Math.min(85, 30 + skillValue));
  return randInt(0, 99) < chance;
}

// A Special Career replaces Main Job -- can't hold a 9-to-5 and be a
// professional athlete at once. Part-Time Job is left alone (a rookie
// picking up a side gig is plausible and not worth blocking).
function applyForSpecialCareer(character, specialCareer) {
  const level = specialCareer.levels[0];

  if (!rollSpecialCareerTryout(character, specialCareer)) {
    character.stats.happiness = clampStat(character.stats.happiness - 2);
    const line = `You tried out for ${specialCareer.label}, but didn't make the cut this time.`;
    pushHistory(character, line);
    return { succeeded: false, resultText: line };
  }

  if (character.job) {
    endCoworkerRelationships(character);
    character.job = null;
  }

  character.specialCareer = { id: specialCareer.id, levelIndex: 0, yearsInRole: 0 };
  const line = `You made it! You're now a ${level.title} in ${specialCareer.label}.`;
  pushHistory(character, line);
  pushCareerEvent(character, { title: level.title, event: "hired", salary: level.salary });
  return { succeeded: true, resultText: line };
}

export { MIN_SPECIAL_CAREER_AGE, getEligibleSpecialCareers, rollSpecialCareerTryout, applyForSpecialCareer };
