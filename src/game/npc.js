import { generateRandomName, randInt, clampStat, weightedPick, applyMoneyDelta, MIN_DATING_AGE } from "./character.js";

const SOCIAL_CIRCLE_MIN_AGE = 6;
const SOCIAL_CIRCLE_MIN_SIZE = 3;
const SOCIAL_CIRCLE_MAX_SIZE = 5;
let npcIdCounter = 0;

// Chance an NPC's attraction includes both genders, vs. just one -- mirrors
// the same "mostly one, sometimes both" shape a player picks from at
// creation, without claiming any particular real-world distribution.
const BOTH_GENDER_ATTRACTION_CHANCE = 0.1;

function randomAttractedTo() {
  if (Math.random() < BOTH_GENDER_ATTRACTION_CHANCE) return ["male", "female"];
  return [Math.random() < 0.5 ? "male" : "female"];
}

// One shared factory for a social-circle NPC, so classmates, coworkers,
// and the general social circle all use the exact same shape (age, the
// same six-stat block the player has, a friendship *tier* that has to be
// earned rather than assumed, and a separate romance track) rather than
// parallel NPC representations. Every new NPC starts as a stranger the
// character merely knows of -- an "acquaintance" -- never an instant
// friend; `friendLevel`/`romanceStatus` only advance through interaction.
function createSocialNpc(namePools, countryId, age) {
  const gender = Math.random() < 0.5 ? "male" : "female";
  npcIdCounter += 1;
  return {
    id: `npc_${Date.now().toString(36)}_${npcIdCounter}`,
    name: generateRandomName(namePools, countryId, gender),
    gender,
    attractedTo: randomAttractedTo(),
    friendLevel: "acquaintance", // "acquaintance" | "friend" | "close_friend" | "best_friend"
    romanceStatus: "none", // "none" | "crush" | "dating" | "partner"
    age,
    stats: {
      health: randInt(60, 100),
      happiness: randInt(50, 100),
      smarts: randInt(30, 70),
      looks: randInt(30, 70),
      fame: 0,
      reputation: randInt(30, 60),
    },
    closeness: randInt(10, 30),
    romance: 0,
  };
}

// Lazily generates a small, persistent group of classmate/friend NPCs the
// first time the character is old enough and something actually needs
// one -- not at birth, since a character who never triggers a social
// event shouldn't be carrying a pile of unused NPC records.
function ensureSocialCircle(character, namePools, countryId) {
  if (character.age < SOCIAL_CIRCLE_MIN_AGE) return;
  character.socialCircle ??= [];
  // Guarding on "any circle at all" can be fooled by a single coworker
  // promoted in via endCoworkerRelationships before a real circle was
  // ever generated (e.g. a job held before Friends/Classmates was first
  // opened) -- top up to the normal minimum instead of treating any
  // non-empty circle as already fully populated.
  if (character.socialCircle.length >= SOCIAL_CIRCLE_MIN_SIZE) return;

  const target = randInt(SOCIAL_CIRCLE_MIN_SIZE, SOCIAL_CIRCLE_MAX_SIZE);
  while (character.socialCircle.length < target) {
    character.socialCircle.push(createSocialNpc(namePools, countryId, character.age + randInt(-1, 1)));
  }
}

// ---------- Coworkers ----------
// Same NPC shape and relationship rules as classmates/the general social
// circle, just scoped to the current job -- a separate array (not folded
// into socialCircle) because coworkers are tied to a workplace that can
// change or disappear, unlike personal friends who persist for life.

const COWORKER_MIN_SIZE = 2;
const COWORKER_MAX_SIZE = 4;
const COWORKER_CHURN_CHANCE = 12; // percent per year while employed
// Coworkers should read as plausible working-age adults regardless of how
// young the character themselves is (jobs start at 16) -- the +/-8 jitter
// alone could otherwise roll an implausible child "coworker".
const MIN_COWORKER_AGE = 16;

function coworkerAge(character) {
  return Math.max(MIN_COWORKER_AGE, character.age + randInt(-8, 8));
}

// Generates the starting roster the moment a job begins (called from
// app.js's hire handler), not lazily on next Age Up -- a brand-new
// coworker shouldn't require a year to pass before they exist. Also
// idempotent/safe to call from a yearly tick or from list-opening as a
// no-op safety net, same pattern as ensureSocialCircle.
function ensureCoworkers(character, namePools, countryId) {
  if (!character.job) return;
  if (character.coworkers && character.coworkers.length > 0) return;

  const count = randInt(COWORKER_MIN_SIZE, COWORKER_MAX_SIZE);
  const coworkers = [];
  for (let i = 0; i < count; i++) {
    coworkers.push(createSocialNpc(namePools, countryId, coworkerAge(character)));
  }
  character.coworkers = coworkers;
}

function maybeChurnCoworkers(character, namePools, countryId) {
  const coworkers = character.coworkers ?? [];
  if (coworkers.length === 0) return null;
  if (randInt(0, 99) >= COWORKER_CHURN_CHANCE) return null;

  if (Math.random() < 0.6 && coworkers.length > 1) {
    const index = randInt(0, coworkers.length - 1);
    const [gone] = coworkers.splice(index, 1);
    const reasons = [
      `${gone.name} left the company for a new opportunity.`,
      `${gone.name} was let go.`,
      `${gone.name} transferred to a different branch.`,
    ];
    return reasons[randInt(0, reasons.length - 1)];
  }

  const newcomer = createSocialNpc(namePools, countryId, coworkerAge(character));
  coworkers.push(newcomer);
  return `${newcomer.name} joined as a new coworker.`;
}

// Called from every place character.job becomes null (quit, layoff, stale
// job reference). A coworker relationship that was never developed beyond
// acquaintance just ends along with the job -- but anyone actually
// befriended survives it, moving into the character's real social circle
// exactly as a lasting friendship should, rather than being deleted
// wholesale just because the workplace context ended.
function endCoworkerRelationships(character) {
  const coworkers = character.coworkers ?? [];
  const keepers = coworkers.filter((npc) => npc.friendLevel !== "acquaintance");
  character.socialCircle = [...(character.socialCircle ?? []), ...keepers];
  character.coworkers = [];
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
  for (const npc of [...(character.socialCircle ?? []), ...(character.coworkers ?? [])]) {
    const relation = relationLabelFor(npc);
    if (relation) npcs.push({ name: npc.name, relation, relationLabel: relation });
  }
  return npcs;
}

// Collapses the friendLevel/romanceStatus pair back down to the flavor-text
// vocabulary `npc_updates.json`'s `appliesTo` filters already use ("friend",
// "crush", "romantic_interest"), so that content doesn't need touching.
// A plain acquaintance has no equivalent -- nobody generates "your friend
// did X" flavor about someone the character hasn't actually befriended --
// so this returns null for them, and callers skip those NPCs entirely.
function relationLabelFor(npc) {
  if (npc.romanceStatus === "crush") return "crush";
  if (npc.romanceStatus === "dating" || npc.romanceStatus === "partner") return "romantic_interest";
  if (npc.friendLevel && npc.friendLevel !== "acquaintance") return "friend";
  return null;
}

// Promotes a random existing friend to a crush, returning the NPC record
// (or null if the character has no real friends yet to develop feelings
// for -- a mere acquaintance doesn't qualify).
function developCrush(character) {
  const friends = (character.socialCircle ?? []).filter(
    (npc) => npc.friendLevel !== "acquaintance" && character.age >= MIN_DATING_AGE && canRomanticallyMatch(character, npc)
  );
  if (friends.length === 0) return null;
  const target = friends[randInt(0, friends.length - 1)];
  target.romanceStatus = "crush";
  return target;
}

// ---------- Friendship & romance tier progression ----------
// Both tracks only ever move up through interaction -- there's no other
// way to skip from Acquaintance straight to Best Friend, or from a crush
// straight to a partner. `friendLevel` advances automatically once
// closeness crosses a threshold (checked after every closeness-raising
// interaction below); the one exception is Acquaintance -> Friend, which
// requires the player to actually ask (askToBecomeFriends) rather than
// drifting there passively. `romanceStatus` works the same way one tier
// higher up (Dating -> Partner), on top of the explicit Develop Romance /
// Ask Out gestures that start the romantic track in the first place.

const CLOSE_FRIEND_THRESHOLD = 70;
const BEST_FRIEND_THRESHOLD = 90;
const PARTNER_THRESHOLD = 70;

// Returns an extra sentence to append to an interaction's result line when
// a promotion happens, or "" otherwise -- callers just do `line += ...`
// rather than juggling a second return value.
function maybeTierUpFriendship(npc) {
  if (npc.friendLevel === "friend" && npc.closeness >= CLOSE_FRIEND_THRESHOLD) {
    npc.friendLevel = "close_friend";
    return ` You and ${npc.name} have grown into close friends!`;
  }
  if (npc.friendLevel === "close_friend" && npc.closeness >= BEST_FRIEND_THRESHOLD) {
    npc.friendLevel = "best_friend";
    return ` You and ${npc.name} have become best friends!`;
  }
  return "";
}

function maybeTierUpRomance(npc) {
  if (npc.romanceStatus === "dating" && npc.romance >= PARTNER_THRESHOLD) {
    npc.romanceStatus = "partner";
    return ` You and ${npc.name} have become partners!`;
  }
  return "";
}

// Whether the player and this NPC are mutually eligible to romantically
// pursue each other, gender-wise. Defensive fallbacks (both genders) cover
// any character/NPC predating this field so nobody gets wrongly excluded.
function canRomanticallyMatch(character, npc) {
  const playerAttraction = character.attractedTo ?? ["male", "female"];
  const npcAttraction = npc.attractedTo ?? ["male", "female"];
  return playerAttraction.includes(npc.gender) && npcAttraction.includes(character.gender);
}

// ---------- Shared NPC interactions ----------
// One canonical implementation of each interaction, reused everywhere an
// NPC can be interacted with (Friends list, Family, classmates, coworkers,
// teacher) instead of every screen reimplementing its own version. Each
// mutates `character`/`npc` directly and returns the result line, so
// callers can either just show a toast or feed it into a modal.

function talk(character, npc) {
  npc.closeness = clampStat(npc.closeness + randInt(1, 4));
  character.stats.happiness = clampStat(character.stats.happiness + 1);
  let line = `You talked with ${npc.name} for a while.`;
  line += maybeTierUpFriendship(npc);
  character.history.push(line);
  return line;
}

// Acquaintance-tier equivalent of Hang Out -- a lower-commitment way to
// build initial rapport before asking to become friends outright.
function getToKnow(character, npc) {
  npc.closeness = clampStat(npc.closeness + randInt(3, 7));
  character.stats.happiness = clampStat(character.stats.happiness + 1);
  let line = `You spent some time getting to know ${npc.name}.`;
  line += maybeTierUpFriendship(npc);
  character.history.push(line);
  return line;
}

function hangOut(character, npc) {
  npc.closeness = clampStat(npc.closeness + randInt(3, 8));
  character.stats.happiness = clampStat(character.stats.happiness + 2);
  let line = `You hung out with ${npc.name}.`;
  line += maybeTierUpFriendship(npc);
  // Once actually dating, spending time together is also what deepens the
  // relationship toward Partner -- without this, romance only ever moves
  // via Develop Romance/Ask Out and Partner would be unreachable, since
  // nothing else raises `romance` after the relationship starts.
  if (npc.romanceStatus === "dating" || npc.romanceStatus === "partner") {
    npc.romance = clampStat((npc.romance ?? 0) + randInt(3, 8));
    line += maybeTierUpRomance(npc);
  }
  character.history.push(line);
  return line;
}

// Close-friend+ interaction -- a deeper, more vulnerable exchange than
// Hang Out, so it pays out more but isn't available any earlier.
function confide(character, npc) {
  npc.closeness = clampStat(npc.closeness + randInt(5, 10));
  character.stats.happiness = clampStat(character.stats.happiness + 4);
  let line = `You confided in ${npc.name} about something that's been on your mind. It brought you closer.`;
  line += maybeTierUpFriendship(npc);
  character.history.push(line);
  return line;
}

const GIFT_COST = 20;

function giveGift(character, npc) {
  const paid = applyMoneyDelta(character, -GIFT_COST);
  if (!paid) {
    const line = `You wanted to get ${npc.name} a gift, but you don't have enough money right now.`;
    character.history.push(line);
    return line;
  }
  npc.closeness = clampStat(npc.closeness + randInt(8, 15));
  character.stats.happiness = clampStat(character.stats.happiness + 3);
  let line = `You gave ${npc.name} a small gift. They seemed to really appreciate it.`;
  line += maybeTierUpFriendship(npc);
  character.history.push(line);
  return line;
}

// The one explicitly earned promotion: Acquaintance -> Friend requires
// asking, and can be turned down. Odds lean on closeness (how much rapport
// has already been built via Talk/Get to Know) and the NPC's own mood --
// the closest existing stand-in for "personality" without inventing a new
// one. Never auto-retries; the player can ask again later, same as any
// other retryable interaction in this game.
function askToBecomeFriends(character, npc) {
  const chance = Math.max(20, Math.min(85, 25 + npc.closeness / 2 + (npc.stats.happiness - 50) / 5));

  if (randInt(0, 99) < chance) {
    npc.friendLevel = "friend";
    npc.closeness = clampStat(npc.closeness + randInt(20, 30));
    const line = `${npc.name} agreed to become friends with you.`;
    character.history.push(line);
    return line;
  }

  const declineLines = [
    `${npc.name} said they'd rather just stay acquaintances for now.`,
    `${npc.name} politely declined. You two remain acquaintances.`,
    `${npc.name} wasn't ready to call it a friendship just yet.`,
  ];
  const line = declineLines[randInt(0, declineLines.length - 1)];
  character.history.push(line);
  return line;
}

// Nudges a friend toward a crush -- distinct from developCrush() above,
// which picks a *random* friend for a scripted event; this targets the
// specific NPC the player selected from a profile. Guarded the same way
// the UI already gates the button (friend-tier+, dating age, mutual
// attraction) so calling this directly can never bypass those rules.
function developRomance(character, npc) {
  if (npc.friendLevel === "acquaintance" || character.age < MIN_DATING_AGE || !canRomanticallyMatch(character, npc)) {
    const line = `You don't feel that way about ${npc.name}.`;
    character.history.push(line);
    return line;
  }
  npc.romanceStatus = "crush";
  npc.romance = clampStat((npc.romance ?? 0) + 15);
  character.stats.happiness = clampStat(character.stats.happiness + 5);
  const line = `You started developing feelings for ${npc.name}.`;
  character.history.push(line);
  return line;
}

// Shared ask-out success roll: higher closeness and already being a
// crush both raise the odds, but it's never guaranteed either way. Used
// anywhere a character asks an NPC out, whatever the occasion.
function rollAskOutSuccess(npc) {
  const closenessBonus = Math.floor((npc.closeness - 50) / 4);
  return randInt(0, 99) < (npc.romanceStatus === "crush" ? 65 : 45) + closenessBonus;
}

function askOut(character, npc) {
  if (npc.romanceStatus !== "crush" || character.age < MIN_DATING_AGE || !canRomanticallyMatch(character, npc)) {
    const line = `Now isn't the right time to ask ${npc.name} out.`;
    character.history.push(line);
    return { succeeded: false, resultText: line };
  }

  const succeeded = rollAskOutSuccess(npc);

  if (succeeded) {
    npc.romanceStatus = "dating";
    npc.romance = clampStat((npc.romance ?? 0) + 20);
    npc.closeness = clampStat(npc.closeness + 10);
    character.stats.happiness = clampStat(character.stats.happiness + 8);
    let line = `You asked ${npc.name} out, and they said yes!`;
    line += maybeTierUpRomance(npc);
    character.history.push(line);
    return { succeeded: true, resultText: line };
  }

  npc.closeness = clampStat(npc.closeness - 5);
  character.stats.happiness = clampStat(character.stats.happiness - 3);
  const line = `You asked ${npc.name} out, but they turned you down.`;
  character.history.push(line);
  return { succeeded: false, resultText: line };
}

function askForHelp(character, teacher) {
  const closenessBonus = Math.floor((teacher.closeness - 50) / 5);
  const succeeded = randInt(0, 99) < 55 + closenessBonus;
  if (succeeded) {
    character.stats.smarts = clampStat(character.stats.smarts + randInt(2, 4));
    teacher.closeness = clampStat(teacher.closeness + 3);
    const line = `${teacher.name} took some extra time to help you understand the material.`;
    character.history.push(line);
    return line;
  }
  const line = `${teacher.name} was too busy to help today, but suggested you try again another time.`;
  character.history.push(line);
  return line;
}

function thankTeacher(character, teacher) {
  teacher.closeness = clampStat(teacher.closeness + randInt(3, 7));
  character.stats.happiness = clampStat(character.stats.happiness + 1);
  const line = `You thanked ${teacher.name} for their help this year.`;
  character.history.push(line);
  return line;
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
    // Same eligibility rules as the profile's own Ask Out button -- a
    // dance date is a romantic overture, not just a friend outing (that's
    // what "Go with friends" is for), so it shouldn't be able to pick
    // someone outside the character's dating age or mutual attraction.
    const prospects = (character.socialCircle ?? []).filter(
      (npc) => npc.friendLevel !== "acquaintance" && character.age >= MIN_DATING_AGE && canRomanticallyMatch(character, npc)
    );
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
          label: npc.romanceStatus === "crush" ? `${npc.name} (your crush)` : npc.name,
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
    // Defense in depth -- ask_to_dance's own prospect filter already
    // excludes ineligible NPCs, but this generator resolves a specific
    // NPC by id and shouldn't trust that filter was the only path here.
    if (character.age < MIN_DATING_AGE || !canRomanticallyMatch(character, npc)) {
      return { type: "resolve", effects: { happiness: -1 }, resultText: `You decided not to ask ${npc.name} after all.` };
    }
    const isCrush = npc.romanceStatus === "crush";
    const succeeded = rollAskOutSuccess(npc);

    if (succeeded) {
      npc.closeness = clampStat(npc.closeness + 15);
      if (isCrush) npc.romanceStatus = "dating";
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
    const pool = (character.socialCircle ?? []).filter((npc) => npc.friendLevel !== "acquaintance");
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

// Lets other modules (school.js, and anything added later) contribute
// their own `dynamic` choice generators without app.js/events.js needing
// to know those modules exist, and without a circular import back into
// this file.
function registerDynamicGenerators(extra) {
  Object.assign(DYNAMIC_GENERATORS, extra);
}

export {
  ensureSocialCircle,
  ensureCoworkers,
  maybeChurnCoworkers,
  endCoworkerRelationships,
  getKnownNpcs,
  developCrush,
  resolveDynamicChoice,
  registerDynamicGenerators,
  createSocialNpc,
  canRomanticallyMatch,
  talk,
  getToKnow,
  hangOut,
  confide,
  giveGift,
  askToBecomeFriends,
  developRomance,
  askOut,
  askForHelp,
  thankTeacher,
  GIFT_COST,
};
