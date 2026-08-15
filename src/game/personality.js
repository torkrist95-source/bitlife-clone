import { randInt, clampStat } from "./character.js";

// Display label for each trait -- camelCase id to a readable name, used
// anywhere traits get shown to the player (profile screen, future event
// text). Order here also defines the canonical trait list everything else
// iterates over.
const TRAIT_LABELS = {
  ambitious: "Ambitious",
  lazy: "Lazy",
  romantic: "Romantic",
  jealous: "Jealous",
  generous: "Generous",
  materialistic: "Materialistic",
  introverted: "Introverted",
  extroverted: "Extroverted",
  reckless: "Reckless",
  kind: "Kind",
  shortTempered: "Short-Tempered",
  loyal: "Loyal",
  manipulative: "Manipulative",
  creative: "Creative",
};

const TRAITS = Object.keys(TRAIT_LABELS);

// How many of the top traits summarize a character on the profile screen.
const DOMINANT_TRAIT_COUNT = 4;

// Rolled at birth, one independent value per trait -- no correlation between
// them (a character can be both Kind and Manipulative). Kept away from the
// extremes (10-90 rather than 0-100) so there's room for events to push a
// trait further in either direction later via trait_effects.
function generatePersonality() {
  const personality = {};
  for (const trait of TRAITS) {
    personality[trait] = randInt(10, 90);
  }
  return personality;
}

// Returns the character's most pronounced traits, highest value first, as
// display labels -- e.g. ["Ambitious", "Kind", "Loyal"]. This is what the UI
// shows instead of all fourteen raw numbers.
function getDominantTraits(character, count = DOMINANT_TRAIT_COUNT) {
  const personality = character?.personality;
  if (!personality) return [];

  return TRAITS
    .slice()
    .sort((a, b) => (personality[b] ?? 0) - (personality[a] ?? 0))
    .slice(0, count)
    .map((trait) => TRAIT_LABELS[trait]);
}

function getTrait(character, trait) {
  return clampStat(character?.personality?.[trait] ?? 50);
}

// Backfills `personality` on saves created before this system existed.
// Mirrors character.js's ensureBirthLocation: returns whether it changed
// anything, so callers only persist the save when there was actually a
// migration to write.
function ensurePersonality(character) {
  if (character.personality) return false;
  character.personality = generatePersonality();
  return true;
}

export { TRAITS, TRAIT_LABELS, generatePersonality, getDominantTraits, getTrait, ensurePersonality };
