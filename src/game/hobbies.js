import { randInt, clampStat, pushHistory } from "./character.js";

// ---------- Hobbies ----------
// Small, fixed, stable content -- same "lives as a hardcoded module, not a
// fetched JSON file" convention as personality.js's TRAITS and freelance.js's
// FREELANCE_SERVICES. Player-driven (choose, then repeatedly Practice), and
// -- unlike clubs/extracurriculars -- available at any age and not tied to
// school enrollment, so an adult with no school-club history can still pick
// one up and build the matching skill.
//
// `skill` maps a hobby onto one of the existing skill keys clubs/
// extracurriculars already grant (school.js), so a hobby-built skill and a
// club-built skill are the exact same number -- reusing the signal rather
// than inventing a parallel one. Not every hobby has a clean skill match;
// those stay flavor-only (still practiceable for happiness, just no skill
// growth), which is the deliberate scope here rather than inventing new
// skills nothing else reads. Reading/Astronomy exist specifically so every
// skill a skill-gated Age Up event checks (events.js's requires) has SOME
// hobby path to it -- academics/science previously only came from school
// clubs, leaving their events (e.g. citizen_science_project) permanently
// unreachable for any adult who never joined that specific club as a kid.
const HOBBIES = [
  { id: "chess", label: "Chess", skill: "chess" },
  { id: "theater", label: "Theater", skill: "acting" },
  { id: "guitar", label: "Guitar", skill: "music" },
  { id: "coding", label: "Coding", skill: "programming" },
  { id: "swimming", label: "Swimming", skill: "swimming" },
  { id: "soccer", label: "Soccer", skill: "athleticism" },
  { id: "volleyball", label: "Volleyball", skill: "athleticism" },
  { id: "hiking", label: "Hiking", skill: "athleticism" },
  { id: "reading", label: "Reading", skill: "academics" },
  { id: "astronomy", label: "Astronomy", skill: "science" },
  { id: "photography", label: "Photography", skill: null },
  { id: "painting", label: "Painting", skill: null },
  { id: "skateboarding", label: "Skateboarding", skill: null },
  { id: "baking", label: "Baking", skill: null },
  { id: "dance", label: "Dance", skill: null },
  { id: "gaming", label: "Gaming", skill: null },
];

const MAX_ACTIVE_HOBBIES = 3;
const MIN_HOBBY_AGE = 5;
// Caps how many times a single hobby can be practiced per Age Up year --
// reset in engine.js's ageUp, same "yearly counter, zeroed on the only thing
// that ever advances the year" shape as freelance.js's
// freelanceGigsCompletedThisYear. Per-hobby (keyed by hobby id) rather than
// one shared counter, since practicing Chess shouldn't eat into Guitar's
// budget for the same year.
const MAX_PRACTICES_PER_YEAR = 3;

function practicesRemaining(character, hobbyId) {
  const used = character.hobbyPracticeCounts?.[hobbyId] ?? 0;
  return Math.max(0, MAX_PRACTICES_PER_YEAR - used);
}

function getAvailableHobbies(character) {
  if (character.age < MIN_HOBBY_AGE) return [];
  const active = new Set(character.activeHobbies ?? []);
  if (active.size >= MAX_ACTIVE_HOBBIES) return [];
  return HOBBIES.filter((hobby) => !active.has(hobby.id));
}

function chooseHobby(character, hobby) {
  character.activeHobbies = character.activeHobbies ?? [];
  character.activeHobbies.push(hobby.id);
  if (!character.hobbies.includes(hobby.id)) {
    character.hobbies.push(hobby.id);
  }
  character.stats.happiness = clampStat(character.stats.happiness + 3);

  const line = `You picked up ${hobby.label} as a new hobby.`;
  pushHistory(character, line);
  return line;
}

// Only clears the active slot -- the hobby stays in character.hobbies (and
// any skill already built stays too), same "quitting doesn't erase history"
// idea as ending a job. Free to pick back up later as a fresh active slot.
function dropHobby(character, hobbyId, hobbiesData) {
  character.activeHobbies = (character.activeHobbies ?? []).filter((id) => id !== hobbyId);
  const hobby = hobbiesData.find((h) => h.id === hobbyId);
  const line = `You stepped back from ${hobby?.label ?? "that hobby"} for now.`;
  pushHistory(character, line);
  return line;
}

// Repeatable, unlike chooseHobby above -- always succeeds (no roll, matching
// participateInClub's tone), a small skill bump for hobbies with a mapped
// skill, plus a modest happiness gain and an occasional bonding moment
// either way, so a flavor-only hobby is still worth practicing. Callers
// should check practicesRemaining first (the UI hides/disables Practice
// once it hits 0); this still enforces the cap itself rather than trusting
// the caller, same defensive shape as every other capped action in this
// codebase (e.g. freelance.js's isFreelanceCapReached).
function practiceHobby(character, hobby) {
  if (practicesRemaining(character, hobby.id) <= 0) {
    return `You've practiced ${hobby.label} as much as you can for now this year.`;
  }
  character.hobbyPracticeCounts = character.hobbyPracticeCounts ?? {};
  character.hobbyPracticeCounts[hobby.id] = (character.hobbyPracticeCounts[hobby.id] ?? 0) + 1;

  if (hobby.skill) {
    character.skills[hobby.skill] = clampStat((character.skills[hobby.skill] ?? 0) + randInt(1, 3));
  }
  character.stats.happiness = clampStat(character.stats.happiness + randInt(2, 4));

  let resultText = `You spent some time on ${hobby.label}.`;
  const roll = randInt(0, 99);
  if (roll < 15 && (character.socialCircle ?? []).length > 0) {
    const friend = character.socialCircle[randInt(0, character.socialCircle.length - 1)];
    friend.closeness = clampStat(friend.closeness + randInt(3, 7));
    resultText += ` You bonded with ${friend.name} over it.`;
  }

  pushHistory(character, resultText);
  return resultText;
}

export {
  HOBBIES,
  MAX_ACTIVE_HOBBIES,
  MIN_HOBBY_AGE,
  MAX_PRACTICES_PER_YEAR,
  practicesRemaining,
  getAvailableHobbies,
  chooseHobby,
  dropHobby,
  practiceHobby,
};
