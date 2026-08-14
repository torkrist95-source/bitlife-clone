// Fallback-only pool, used if a country's name data fails to load.
const FIRST_NAMES = ["Alex", "Jordan", "Sam", "Taylor", "Casey", "Riley", "Morgan", "Jamie", "Avery", "Quinn"];
const LAST_NAMES = ["Smith", "Johnson", "Brown", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Lee", "Walker"];

// Chance a name is drawn from a different country's pool entirely, so
// birth country doesn't rigidly determine name origin (immigrant/
// multicultural families).
const CROSS_CULTURE_NAME_CHANCE = 0.15;
const GUARDIAN_RELATIONS = ["grandmother", "grandfather", "aunt", "uncle", "older sibling", "family friend"];
const PET_TYPES = ["dog", "cat", "bird", "fish", "rabbit"];
const PET_NAMES = ["Rex", "Bella", "Max", "Luna", "Charlie", "Daisy", "Rocky", "Milo", "Coco", "Buddy"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Chronological list of each sign's start date; the latest boundary a date
// is on-or-after is that date's sign (December wraps back to Capricorn).
const ZODIAC_BOUNDARIES = [
  { sign: "Capricorn", month: 1, day: 1 },
  { sign: "Aquarius", month: 1, day: 20 },
  { sign: "Pisces", month: 2, day: 19 },
  { sign: "Aries", month: 3, day: 21 },
  { sign: "Taurus", month: 4, day: 20 },
  { sign: "Gemini", month: 5, day: 21 },
  { sign: "Cancer", month: 6, day: 21 },
  { sign: "Leo", month: 7, day: 23 },
  { sign: "Virgo", month: 8, day: 23 },
  { sign: "Libra", month: 9, day: 23 },
  { sign: "Scorpio", month: 10, day: 23 },
  { sign: "Sagittarius", month: 11, day: 22 },
  { sign: "Capricorn", month: 12, day: 22 },
];

const LIFE_STAGES = [
  { id: "infant", label: "Infant", minAge: 0, maxAge: 4, emoji: "\u{1F476}" },
  { id: "child", label: "Child", minAge: 5, maxAge: 12, emoji: "\u{1F9D2}" },
  { id: "teenager", label: "Teenager", minAge: 13, maxAge: 17, emoji: "\u{1F9D1}" },
  { id: "young_adult", label: "Young Adult", minAge: 18, maxAge: 29, emoji: "\u{1F9D1}" },
  { id: "adult", label: "Adult", minAge: 30, maxAge: 49, emoji: "\u{1F9D1}" },
  { id: "middle_aged", label: "Middle-Aged", minAge: 50, maxAge: 64, emoji: "\u{1F9D3}" },
  { id: "elderly", label: "Elderly", minAge: 65, maxAge: Infinity, emoji: "\u{1F474}" },
];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randChoice(list) {
  return list[randInt(0, list.length - 1)];
}

function getLifeStage(age) {
  return LIFE_STAGES.find((stage) => age >= stage.minAge && age <= stage.maxAge) ?? LIFE_STAGES[LIFE_STAGES.length - 1];
}

// Resolves which country's name pool to draw from for a given birth
// country: usually that country's own pool, occasionally a random other
// one, so origin biases names without hard-determining them.
function resolveNamePool(namePools, countryId) {
  if (!namePools) return null;
  const pool = namePools[countryId] ?? namePools.default;
  if (Math.random() < CROSS_CULTURE_NAME_CHANCE) {
    const ids = Object.keys(namePools).filter((id) => id !== "default");
    if (ids.length > 0) return namePools[randChoice(ids)];
  }
  return pool ?? null;
}

function randomFirstName(namePools, countryId, gender, excludeNames = []) {
  const pool = resolveNamePool(namePools, countryId);
  const resolvedGender = gender === "male" || gender === "female" ? gender : Math.random() < 0.5 ? "male" : "female";
  const candidates = pool?.[resolvedGender] ?? FIRST_NAMES;
  const filtered = candidates.filter((n) => !excludeNames.includes(n));
  return randChoice(filtered.length > 0 ? filtered : candidates);
}

function randomSurname(namePools, countryId) {
  const pool = resolveNamePool(namePools, countryId);
  return randChoice(pool?.surnames ?? LAST_NAMES);
}

function rollWeighted(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const item of items) {
    if (roll < item.weight) return item;
    roll -= item.weight;
  }
  return items[items.length - 1];
}

function randomBirthDate() {
  const year = new Date().getFullYear();
  const month = randInt(1, 12);
  const day = randInt(1, new Date(year, month, 0).getDate());
  return { year, month, day };
}

function formatBirthDate({ year, month, day }) {
  return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

function getZodiacSign(month, day) {
  let result = "Capricorn";
  for (const boundary of ZODIAC_BOUNDARIES) {
    if (month > boundary.month || (month === boundary.month && day >= boundary.day)) {
      result = boundary.sign;
    }
  }
  return result;
}

// Maps a guardian relation to the gender its first name should be drawn
// from; relations that could go either way roll randomly per character.
const GUARDIAN_GENDER = { grandmother: "female", grandfather: "male", aunt: "female", uncle: "male" };

function guardianGender(guardianRelation) {
  return GUARDIAN_GENDER[guardianRelation] ?? (Math.random() < 0.5 ? "male" : "female");
}

// Every parent/guardian resolves to exactly one concrete occupation, or
// explicit unemployment -- never an "X or Y" combined job string.
function rollParentOccupation(tier) {
  if (randInt(0, 99) < tier.unemploymentChance) {
    return { employed: false, job: null };
  }
  return { employed: true, job: randChoice(tier.occupations) };
}

function generateParent(role, relationshipType, lastName, tier, excludeNames, namePools, countryId) {
  const occupation = rollParentOccupation(tier);
  const gender = role === "mother" ? "female" : "male";
  return {
    role,
    relationshipType,
    name: `${randomFirstName(namePools, countryId, gender, excludeNames)} ${lastName}`,
    age: randInt(24, 45),
    employed: occupation.employed,
    job: occupation.job,
  };
}

function generateFamilyMembers(structureId, lastName, tier, excludeName, namePools, countryId) {
  const flags = {};
  const used = [excludeName];
  let parents;

  function addParent(role, relationshipType) {
    const parent = generateParent(role, relationshipType, lastName, tier, used, namePools, countryId);
    used.push(parent.name.split(" ")[0]);
    return parent;
  }

  function addGuardian(relationshipType, guardianRelation, ageRange) {
    const occupation = rollParentOccupation(tier);
    const guardian = {
      role: "guardian",
      relationshipType,
      guardianRelation,
      name: `${randomFirstName(namePools, countryId, guardianGender(guardianRelation), used)} ${lastName}`,
      age: randInt(ageRange[0], ageRange[1]),
      employed: occupation.employed,
      job: occupation.job,
    };
    used.push(guardian.name.split(" ")[0]);
    return guardian;
  }

  switch (structureId) {
    case "single_biological_parent": {
      const role = randChoice(["mother", "father"]);
      parents = [addParent(role, "biological")];
      break;
    }
    case "biological_plus_step": {
      const bioRole = randChoice(["mother", "father"]);
      const stepRole = bioRole === "mother" ? "father" : "mother";
      parents = [addParent(bioRole, "biological"), addParent(stepRole, "step")];
      break;
    }
    case "adopted":
      parents = [addParent("mother", "adoptive"), addParent("father", "adoptive")];
      flags.isAdopted = true;
      break;
    case "guardian":
      parents = [addGuardian("guardian", randChoice(GUARDIAN_RELATIONS), [30, 65])];
      break;
    case "foster_care":
      parents = [addGuardian("foster", "foster caregiver", [30, 60])];
      flags.inFosterCare = true;
      break;
    case "two_biological_parents":
    default:
      parents = [addParent("mother", "biological"), addParent("father", "biological")];
  }

  return { parents, flags };
}

function rollSiblingCount() {
  const roll = randInt(0, 99);
  if (roll < 45) return 0;
  if (roll < 75) return 1;
  if (roll < 90) return 2;
  return 3;
}

function generateSiblings(count, lastName, structureId, excludeNames, namePools, countryId) {
  const relationshipType = structureId === "adopted" ? "adoptive" : structureId === "biological_plus_step" ? "step" : "biological";
  const siblings = [];
  const usedNames = [...excludeNames];
  for (let i = 0; i < count; i++) {
    const gender = Math.random() < 0.5 ? "male" : "female";
    const firstName = randomFirstName(namePools, countryId, gender, usedNames);
    usedNames.push(firstName);
    siblings.push({
      name: `${firstName} ${lastName}`,
      age: randInt(1, 17),
      relationshipType,
    });
  }
  return siblings;
}

function maybeGeneratePet() {
  if (randInt(0, 99) >= 25) return null;
  return { name: randChoice(PET_NAMES), type: randChoice(PET_TYPES) };
}

function buildBirthHistoryLines({ formattedDate, country, tier, structureId, parents, siblings, pet }) {
  const lines = [];
  const tierLabel = tier.name.toLowerCase();
  const employment = (p) => (p.employed ? `works as ${p.job}` : "is currently unemployed");
  const employmentParenthetical = (p) => (p.employed ? `works as ${p.job}` : "currently unemployed");

  if (structureId === "adopted") {
    const [p1, p2] = parents;
    lines.push(
      `You were born on ${formattedDate} in ${country.name}. You were adopted into a ${tierLabel} family. ` +
        `Your ${p1.role}, ${p1.name}, is ${p1.age} and ${employment(p1)}. ` +
        `Your ${p2.role}, ${p2.name}, is ${p2.age} and ${employment(p2)}.`
    );
  } else if (structureId === "biological_plus_step") {
    const bio = parents.find((p) => p.relationshipType === "biological");
    const step = parents.find((p) => p.relationshipType === "step");
    lines.push(
      `You were born on ${formattedDate} in ${country.name}. You were born into a ${tierLabel} family. ` +
        `Your ${bio.role}, ${bio.name} (${bio.age}, ${employmentParenthetical(bio)}), raised you alongside your step${step.role}, ` +
        `${step.name} (${step.age}, ${employmentParenthetical(step)}).`
    );
  } else if (structureId === "single_biological_parent") {
    const p = parents[0];
    lines.push(
      `You were born on ${formattedDate} in ${country.name}. You were born into a ${tierLabel} family, raised by your ${p.role}, ` +
        `${p.name}, who is ${p.age} and ${employment(p)}.`
    );
  } else if (structureId === "guardian") {
    const g = parents[0];
    lines.push(
      `You were born on ${formattedDate} in ${country.name}. You were raised by your ${g.guardianRelation}, ${g.name}, ` +
        `who is ${g.age} and ${employment(g)}.`
    );
  } else if (structureId === "foster_care") {
    const g = parents[0];
    lines.push(
      `You were born on ${formattedDate} in ${country.name}. You entered foster care as an infant and were raised by ${g.name}.`
    );
  } else {
    const [p1, p2] = parents;
    lines.push(
      `You were born on ${formattedDate} in ${country.name}. You were born into a ${tierLabel} family. ` +
        `Your ${p1.role}, ${p1.name}, is ${p1.age} and ${employment(p1)}. ` +
        `Your ${p2.role}, ${p2.name}, is ${p2.age} and ${employment(p2)}.`
    );
  }

  if (siblings.length === 1) {
    lines.push(`You have an older sibling, ${siblings[0].name}, age ${siblings[0].age}.`);
  } else if (siblings.length > 1) {
    lines.push(`You have ${siblings.length} older siblings: ${siblings.map((s) => s.name).join(", ")}.`);
  }

  if (pet) {
    lines.push(`Your family has a pet ${pet.type} named ${pet.name}.`);
  }

  return lines;
}

function generateRandomName(namePools, countryId, gender) {
  const firstName = randomFirstName(namePools, countryId, gender);
  const lastName = randomSurname(namePools, countryId);
  return `${firstName} ${lastName}`;
}

// Player-typed names pass through completely unchanged; name pools only
// fill in a surname when the player provides just one word, and only
// generate a full name at all when the field was left empty.
function parsePlayerName(fullName, namePools, countryId, gender) {
  const trimmed = (fullName ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return parsePlayerName(generateRandomName(namePools, countryId, gender), namePools, countryId, gender);

  const parts = trimmed.split(" ");
  const firstName = parts[0];
  const lastName = parts.length > 1 ? parts[parts.length - 1] : randomSurname(namePools, countryId);
  return { name: trimmed, firstName, lastName };
}

function createCharacter({ name, country, gender, wealthTiers, birthCircumstances, familyStructures, namePools }) {
  const countryId = country?.id;
  const { name: playerName, firstName, lastName } = parsePlayerName(name, namePools, countryId, gender);
  const tier = rollWealthTier(wealthTiers);

  const circumstance = rollWeighted(birthCircumstances);
  const structure = circumstance.forcesSingleParent
    ? familyStructures.find((s) => s.id === "single_biological_parent") ?? rollWeighted(familyStructures)
    : rollWeighted(familyStructures);

  const { parents, flags: familyFlags } = generateFamilyMembers(structure.id, lastName, tier, firstName, namePools, countryId);
  const usedFirstNames = [firstName, ...parents.map((p) => p.name.split(" ")[0])];
  const siblings = generateSiblings(rollSiblingCount(), lastName, structure.id, usedFirstNames, namePools, countryId);
  const pet = maybeGeneratePet();

  const birthDate = randomBirthDate();
  const formattedDate = formatBirthDate(birthDate);
  const zodiacSign = getZodiacSign(birthDate.month, birthDate.day);

  const historyLines = buildBirthHistoryLines({
    formattedDate,
    country,
    tier,
    structureId: structure.id,
    parents,
    siblings,
    pet,
  });

  return {
    name: playerName,
    gender,
    country: country.id,
    countryName: country.name,
    birthDate,
    zodiacSign,
    birthCircumstances: circumstance.id,
    familyStructure: structure.id,
    age: 0,
    money: 0,
    job: null,
    family: {
      wealthTier: tier.id,
      wealthTierLabel: tier.name,
      home: tier.home,
      parents,
      siblings,
      pet,
      ...familyFlags,
    },
    stats: {
      health: randInt(70, 100),
      happiness: randInt(60, 100),
      smarts: randInt(30, 70),
      looks: randInt(30, 70),
      fame: 0,
      reputation: 0,
    },
    flags: {},
    pendingEventId: null,
    history: historyLines,
  };
}

function rollWealthTier(wealthTiers) {
  return rollWeighted(wealthTiers);
}

function clampStat(value) {
  return Math.max(0, Math.min(100, value));
}

export { createCharacter, generateRandomName, getLifeStage, clampStat, randInt, LIFE_STAGES, formatBirthDate };
