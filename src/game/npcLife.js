import { randInt, clampStat, weightedPick, ENROLLED_EDUCATION_STATUSES } from "./character.js";
import { createSocialNpc, coworkerAge } from "./npc.js";

// ---------- Acquaintance-tier roster churn ----------
// Shared by classmates (school.js) and coworkers (engine.js) -- the exact
// same "small yearly chance someone leaves or a newcomer arrives" shape,
// previously duplicated almost verbatim in both places. Deliberately
// scoped to ONLY friendLevel==="acquaintance" members of the roster: once
// the player actually knows someone (friend tier or above), their turnover
// is handled by the named, meaningful development tick below instead of
// silent random removal -- an established relationship shouldn't vanish
// without explanation just because a churn roll happened to land on them.

const ACQUAINTANCE_CHURN_CHANCE = 12; // percent per year

function churnAcquaintanceRoster(roster, { namePools, countryId, newcomerAge, leaveReasons, joinTemplate }) {
  const acquaintances = roster.filter((npc) => npc.friendLevel === "acquaintance");
  if (acquaintances.length === 0) return null;
  if (randInt(0, 99) >= ACQUAINTANCE_CHURN_CHANCE) return null;

  if (Math.random() < 0.6 && acquaintances.length > 1) {
    const target = acquaintances[randInt(0, acquaintances.length - 1)];
    roster.splice(roster.indexOf(target), 1);
    const reasons = leaveReasons(target);
    return reasons[randInt(0, reasons.length - 1)];
  }

  const newcomer = createSocialNpc(namePools, countryId, newcomerAge);
  roster.push(newcomer);
  return joinTemplate(newcomer);
}

// Only rolled while actually enrolled -- an adult with old school friends
// still in their socialCircle (now just "friends", post-graduation)
// shouldn't keep getting "transferred to another school" flavor for the
// rest of the game.
function maybeChurnClassmates(character, namePools, countryId) {
  if (!ENROLLED_EDUCATION_STATUSES.has(character.education?.status)) return null;
  return churnAcquaintanceRoster(character.socialCircle ?? [], {
    namePools,
    countryId,
    newcomerAge: character.age + randInt(-1, 1),
    leaveReasons: (gone) => [
      `${gone.name} transferred to another school.`,
      `${gone.name}'s family moved away.`,
      `${gone.name} left to be homeschooled.`,
    ],
    joinTemplate: (newcomer) => `${newcomer.name} joined your class as a new student.`,
  });
}

function maybeChurnCoworkers(character, namePools, countryId) {
  return churnAcquaintanceRoster(character.coworkers ?? [], {
    namePools,
    countryId,
    newcomerAge: coworkerAge(character),
    leaveReasons: (gone) => [
      `${gone.name} left the company for a new opportunity.`,
      `${gone.name} was let go.`,
      `${gone.name} transferred to a different branch.`,
    ],
    joinTemplate: (newcomer) => `${newcomer.name} joined as a new coworker.`,
  });
}

// ---------- NPC personal-life development ----------
// Once a relationship exists (friend tier or above, or any romantic
// standing), the NPC keeps living independently of the player -- the
// stronger the relationship, the more likely a real, named, state-changing
// development surfaces this year. Acquaintances never roll here at all
// (see churnAcquaintanceRoster above for their only form of turnover).

const FRIEND_TIER_CHANCE = { friend: 10, close_friend: 22, best_friend: 32 };
const ROMANCE_DEVELOPMENT_CHANCE = 32;
// Caps how many NPC developments can land in a single year so a year with
// several eligible relationships still reads as a short summary rather
// than a wall of text, per the "not everything needs reporting" goal.
const MAX_NPC_DEVELOPMENTS_PER_YEAR = 3;

function developmentChanceFor(npc) {
  const tierChance = FRIEND_TIER_CHANCE[npc.friendLevel] ?? 0;
  if (npc.romanceStatus === "crush" || npc.romanceStatus === "dating" || npc.romanceStatus === "partner") {
    return Math.max(tierChance, ROMANCE_DEVELOPMENT_CHANCE);
  }
  return tierChance;
}

const JOB_MIN_AGE = 16;

const NPC_HOBBY_POOL = [
  "photography", "painting", "chess", "theater", "volleyball", "skateboarding",
  "guitar", "coding", "swimming", "baking", "dance", "soccer", "hiking", "gaming",
];

function pickJobTitle(jobsData) {
  const jobDef = jobsData[randInt(0, jobsData.length - 1)];
  return jobDef.levels[randInt(0, jobDef.levels.length - 1)].title;
}

function developJob(npc, jobsData) {
  if (!jobsData || jobsData.length === 0) return null;
  const title = pickJobTitle(jobsData);
  if (!npc.job) {
    npc.job = title;
    return `${npc.name} started working as a ${title}.`;
  }
  const promoted = Math.random() < 0.3;
  npc.job = title;
  return promoted ? `${npc.name} got promoted to ${title}.` : `${npc.name} changed jobs and is now a ${title}.`;
}

function developHobby(npc) {
  const available = NPC_HOBBY_POOL.filter((h) => !npc.hobbies.includes(h));
  if (available.length === 0) return null;
  const hobby = available[randInt(0, available.length - 1)];
  npc.hobbies.push(hobby);
  return `${npc.name} started getting into ${hobby}.`;
}

function developStatShift(npc) {
  const statKeys = ["health", "happiness", "smarts", "looks", "reputation"];
  const stat = statKeys[randInt(0, statKeys.length - 1)];
  const delta = randInt(-5, 8);
  npc.stats[stat] = clampStat(npc.stats[stat] + delta);
  return delta >= 0 ? `${npc.name} has been doing well lately.` : `${npc.name} has been going through a rough patch.`;
}

// Text-only -- deliberately doesn't spin up a third NPC object to track
// who they're seeing, keeping this a background flavor of the relationship
// rather than a second social graph to simulate.
function developRelationshipFlavor(npc) {
  const lines = [`${npc.name} started seeing someone new.`, `${npc.name} went through a breakup.`];
  return lines[randInt(0, lines.length - 1)];
}

// Only offered for the player's OWN crush/dating/partner -- a positive
// check-in rather than risking an unwelcome unilateral breakup the player
// never had a chance to influence.
function developRomanceCheckIn(character, npc) {
  npc.closeness = clampStat(npc.closeness + randInt(2, 6));
  npc.romance = clampStat((npc.romance ?? 0) + randInt(2, 6));
  const lines = [`You and ${npc.name} have been growing closer.`, `Things with ${npc.name} have been going well.`];
  return lines[randInt(0, lines.length - 1)];
}

function developMovedAway(character, npc, roster) {
  roster.splice(roster.indexOf(npc), 1);
  // Losing someone you were actually close to should sting a little --
  // scaled by how close the relationship was, not a flat penalty.
  character.stats.happiness = clampStat(character.stats.happiness - Math.floor(npc.closeness / 20));
  return `${npc.name} moved away this year.`;
}

function buildDevelopmentPool(character, npc, roster, jobsData) {
  const pool = [
    { weight: 6, run: () => developHobby(npc) },
    { weight: 5, run: () => developStatShift(npc) },
    { weight: 2, run: () => developMovedAway(character, npc, roster) },
  ];
  if (npc.age >= JOB_MIN_AGE) {
    pool.push({ weight: 6, run: () => developJob(npc, jobsData) });
  }
  if (npc.romanceStatus === "none") {
    pool.push({ weight: 3, run: () => developRelationshipFlavor(npc) });
  } else {
    pool.push({ weight: 5, run: () => developRomanceCheckIn(character, npc) });
  }
  return pool;
}

// Runs the tier-gated development tick across every friend+/romantic NPC
// in socialCircle and coworkers, returning the resulting lines (already
// capped -- see MAX_NPC_DEVELOPMENTS_PER_YEAR), followed by the
// acquaintance churn pass for both rosters. Development lines are ordered
// *before* churn deliberately: the caller (rollAgeUpHappening) applies its
// own overall cap on top of this, and a Best Friend's meaningful,
// tier-prioritized development shouldn't lose that slot to a stranger
// quietly transferring schools just because churn happened to be checked
// first.
function applyNpcLifeYear(character, namePools, countryId, jobsData) {
  const lines = [];

  const candidates = [
    ...(character.socialCircle ?? []).map((npc) => ({ npc, roster: character.socialCircle })),
    ...(character.coworkers ?? []).map((npc) => ({ npc, roster: character.coworkers })),
  ];

  // Decide *which* NPCs get to develop this year before running anything
  // -- breaking out of the loop early (or running a development that then
  // gets discarded by a cap) would either silently favor whichever NPCs
  // sit first in the roster array, or mutate an NPC's state for a
  // development the player is never told about (e.g. quietly removing a
  // "moved away" friend with no explanation). When there's more eligible
  // than the cap allows, keep the closest relationships (highest
  // development chance) -- a Best Friend's turn shouldn't be crowded out
  // by a Friend's just because the Friend rolled first.
  const hits = [];
  for (const { npc, roster } of candidates) {
    const chance = developmentChanceFor(npc);
    if (chance === 0) continue;
    if (randInt(0, 99) >= chance) continue;
    hits.push({ npc, roster });
  }
  hits.sort((a, b) => developmentChanceFor(b.npc) - developmentChanceFor(a.npc));

  for (const { npc, roster } of hits.slice(0, MAX_NPC_DEVELOPMENTS_PER_YEAR)) {
    const pool = buildDevelopmentPool(character, npc, roster, jobsData);
    const picked = weightedPick(pool);
    const line = picked.run();
    if (line) lines.push(line);
  }

  const classmateChurnLine = maybeChurnClassmates(character, namePools, countryId);
  if (classmateChurnLine) lines.push(classmateChurnLine);
  if (character.job) {
    const coworkerChurnLine = maybeChurnCoworkers(character, namePools, countryId);
    if (coworkerChurnLine) lines.push(coworkerChurnLine);
  }

  return lines;
}

export { applyNpcLifeYear, pickJobTitle, NPC_HOBBY_POOL };
