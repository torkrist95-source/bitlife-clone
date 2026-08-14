import { generateRandomName, randInt, clampStat, weightedPick } from "./character.js";

const SOCIAL_CIRCLE_MIN_AGE = 6;
const SOCIAL_CIRCLE_MIN_SIZE = 3;
const SOCIAL_CIRCLE_MAX_SIZE = 5;

// Lazily generates a small, persistent group of classmate/friend NPCs the
// first time the character is old enough and something actually needs
// one -- not at birth, since a character who never triggers a social
// event shouldn't be carrying a pile of unused NPC records.
function ensureSocialCircle(character, namePools, countryId) {
  if (character.age < SOCIAL_CIRCLE_MIN_AGE) return;
  if (character.socialCircle && character.socialCircle.length > 0) return;

  const count = randInt(SOCIAL_CIRCLE_MIN_SIZE, SOCIAL_CIRCLE_MAX_SIZE);
  const circle = [];
  for (let i = 0; i < count; i++) {
    const gender = Math.random() < 0.5 ? "male" : "female";
    circle.push({
      id: `npc_${Date.now().toString(36)}_${i}`,
      name: generateRandomName(namePools, countryId, gender),
      type: "friend", // "friend" | "crush" | "romantic_interest"
      closeness: randInt(40, 70),
    });
  }
  character.socialCircle = circle;
}

// Every NPC the character actually knows by name: family (already
// generated at birth) plus the social circle above. Used to pick a
// specific, real subject for NPC-update flavor lines and dynamic events,
// instead of ever inventing a nameless "someone."
function getKnownNpcs(character) {
  const npcs = [];
  for (const parent of character.family?.parents ?? []) {
    // `relation` stays the base role ("mother"/"father") so templates can
    // still match on it regardless of relationship type; `relationLabel`
    // is what actually gets displayed, matching the birth narrative's
    // existing "step" prefixing.
    const relationLabel = parent.relationshipType === "step" ? `step${parent.role}` : parent.role;
    npcs.push({ name: parent.name, relation: parent.role, relationLabel });
  }
  for (const sibling of character.family?.siblings ?? []) {
    npcs.push({ name: sibling.name, relation: "sibling", relationLabel: "sibling" });
  }
  for (const npc of character.socialCircle ?? []) {
    npcs.push({ name: npc.name, relation: npc.type, relationLabel: npc.type });
  }
  return npcs;
}

// Promotes a random existing friend to a crush, returning the NPC record
// (or null if the character has no friends to develop feelings for yet).
function developCrush(character) {
  const friends = (character.socialCircle ?? []).filter((npc) => npc.type === "friend");
  if (friends.length === 0) return null;
  const target = friends[randInt(0, friends.length - 1)];
  target.type = "crush";
  return target;
}

// ---------- Dynamic choice generators ----------
// A choice with `dynamic: "<id>"` resolves through one of these instead of
// static effects/outcomes, because the right options (which NPCs exist,
// who's eligible) can only be known at the moment the player picks it --
// not authored in advance in JSON. Each generator returns either:
//   { type: "resolve", effects?, resultText, flags?, skills?, hobbies? }
//     -- resolves immediately, same shape as a normal choice/outcome
//   { type: "followUp", event }
//     -- opens another event (with its own choices) right away
// New events needing this kind of runtime-dependent behavior register
// their own generator here rather than special-casing the engine.

const DYNAMIC_GENERATORS = {
  develop_crush_pursue(character, ctx) {
    ensureSocialCircle(character, ctx.namePools, ctx.countryId);
    const target = developCrush(character);
    if (!target) {
      return { type: "resolve", effects: { happiness: 1 }, resultText: "You don't really have anyone specific in mind right now." };
    }
    target.closeness = clampStat(target.closeness + 10);
    return {
      type: "resolve",
      effects: { happiness: 8, looks: 1 },
      resultText: `You started spending more time with ${target.name}, and it grew into a real crush. Things between you have been great.`,
    };
  },

  develop_crush_quiet(character, ctx) {
    ensureSocialCircle(character, ctx.namePools, ctx.countryId);
    const target = developCrush(character);
    if (!target) {
      return { type: "resolve", effects: { happiness: -1 }, resultText: "You don't really have anyone specific in mind right now." };
    }
    return {
      type: "resolve",
      effects: { happiness: -2 },
      resultText: `You've developed a crush on ${target.name}, but you're keeping it to yourself for now.`,
    };
  },

  ask_to_dance(character, ctx) {
    ensureSocialCircle(character, ctx.namePools, ctx.countryId);
    const prospects = (character.socialCircle ?? []).filter((npc) => npc.type === "friend" || npc.type === "crush");
    if (prospects.length === 0) {
      return { type: "resolve", effects: { happiness: -1 }, resultText: "You couldn't think of anyone in particular to ask, so you let the moment pass." };
    }
    return {
      type: "followUp",
      event: {
        id: "dance_ask_choice",
        trigger: "age_up",
        conditions: { minAge: 0, maxAge: 200 },
        text: "Who do you want to ask to the dance?",
        choices: prospects.map((npc) => ({
          label: npc.type === "crush" ? `${npc.name} (your crush)` : npc.name,
          dynamic: "resolve_dance_ask",
          dynamicArgs: { npcId: npc.id },
        })),
      },
    };
  },

  resolve_dance_ask(character, ctx) {
    const npc = (character.socialCircle ?? []).find((n) => n.id === ctx.dynamicArgs?.npcId);
    if (!npc) {
      return { type: "resolve", effects: {}, resultText: "You looked for them, but couldn't find them in time." };
    }
    const isCrush = npc.type === "crush";
    const closenessBonus = Math.floor((npc.closeness - 50) / 4);
    const succeeded = randInt(0, 99) < (isCrush ? 65 : 45) + closenessBonus;

    if (succeeded) {
      npc.closeness = clampStat(npc.closeness + 15);
      if (isCrush) npc.type = "romantic_interest";
      return {
        type: "resolve",
        effects: { happiness: 8, looks: 1 },
        resultText: `You finally asked ${npc.name} to the dance. They smiled and said yes.`,
      };
    }

    npc.closeness = clampStat(npc.closeness - 5);
    return {
      type: "resolve",
      effects: { happiness: -4 },
      resultText: `You asked ${npc.name} to the dance, but they turned you down. Awkward, but you'll survive.`,
    };
  },

  dance_with_friends(character, ctx) {
    ensureSocialCircle(character, ctx.namePools, ctx.countryId);
    const pool = character.socialCircle ?? [];
    const groupSize = Math.min(pool.length, randInt(2, 4));
    if (groupSize === 0) {
      return { type: "resolve", effects: { happiness: 2 }, resultText: "You ended up going alone and just people-watched most of the night." };
    }
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const group = shuffled.slice(0, groupSize);
    const names = group.map((npc) => npc.name);
    const namesText = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

    // closenessDelta reflects how the night actually went for the group --
    // a fight shouldn't quietly strengthen the friendship just because a
    // group event happened.
    const outcomes = [
      { weight: 8, effects: { happiness: 6 }, closenessDelta: 8, text: `You went to the dance with ${namesText}. You spent most of the night laughing and taking terrible photos.` },
      { weight: 4, effects: { happiness: -2 }, closenessDelta: 0, text: `You went with ${namesText}, but the night felt a little flat and you left early.` },
      { weight: 3, effects: { happiness: -3 }, closenessDelta: -8, text: `You went with ${namesText}, but a stupid argument over nothing put a damper on the whole night.` },
      { weight: 3, effects: { happiness: 4, reputation: 1 }, closenessDelta: 12, text: `You went with ${namesText}, and the group ended up being the center of attention on the dance floor all night.` },
    ];
    const picked = weightedPick(outcomes);

    for (const npc of group) npc.closeness = clampStat(npc.closeness + picked.closenessDelta);

    return { type: "resolve", effects: picked.effects, resultText: picked.text };
  },

  skip_dance_alternative(character) {
    if (character.hobbies.includes("photography")) {
      return { type: "resolve", effects: { happiness: 2 }, skills: {}, resultText: "You skipped the dance and spent the evening working on your photography instead." };
    }
    if ((character.skills.programming ?? 0) >= 15) {
      return { type: "resolve", effects: { happiness: 2 }, skills: { programming: 2 }, resultText: "You skipped the dance and spent the night tinkering with code instead." };
    }
    if (character.stats.smarts >= 60) {
      return { type: "resolve", effects: { happiness: 1, smarts: 1 }, resultText: "You skipped the dance and got ahead on some reading instead." };
    }
    return { type: "resolve", effects: { happiness: 2 }, resultText: "You skipped the dance and watched movies with your family instead." };
  },
};

function resolveDynamicChoice(character, dynamicId, ctx) {
  const generator = DYNAMIC_GENERATORS[dynamicId];
  if (!generator) {
    return { type: "resolve", effects: {}, resultText: "" };
  }
  return generator(character, ctx);
}

export { ensureSocialCircle, getKnownNpcs, developCrush, resolveDynamicChoice };
