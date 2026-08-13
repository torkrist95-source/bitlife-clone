const FIRST_NAMES = ["Alex", "Jordan", "Sam", "Taylor", "Casey", "Riley", "Morgan", "Jamie", "Avery", "Quinn"];
const LAST_NAMES = ["Smith", "Johnson", "Brown", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Lee", "Walker"];
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

function randFamilyFirstName(excludeNames) {
  const pool = FIRST_NAMES.filter((n) => !excludeNames.includes(n));
  return randChoice(pool.length > 0 ? pool : FIRST_NAMES);
}

function generateParent(role, relationshipType, lastName, job, excludeNames) {
  return {
    role,
    relationshipType,
    name: `${randFamilyFirstName(excludeNames)} ${lastName}`,
    age: randInt(24, 45),
    job,
  };
}

function generateFamilyMembers(structureId, lastName, tier, excludeName) {
  const flags = {};
  const used = [excludeName];
  let parents;

  function addParent(role, relationshipType, job) {
    const parent = generateParent(role, relationshipType, lastName, job, used);
    used.push(parent.name.split(" ")[0]);
    return parent;
  }

  switch (structureId) {
    case "single_biological_parent": {
      const role = randChoice(["mother", "father"]);
      const job = role === "mother" ? tier.motherJob : tier.fatherJob;
      parents = [addParent(role, "biological", job)];
      break;
    }
    case "biological_plus_step": {
      const bioRole = randChoice(["mother", "father"]);
      const stepRole = bioRole === "mother" ? "father" : "mother";
      const bioJob = bioRole === "mother" ? tier.motherJob : tier.fatherJob;
      const stepJob = stepRole === "mother" ? tier.motherJob : tier.fatherJob;
      parents = [addParent(bioRole, "biological", bioJob), addParent(stepRole, "step", stepJob)];
      break;
    }
    case "adopted":
      parents = [
        addParent("mother", "adoptive", tier.motherJob),
        addParent("father", "adoptive", tier.fatherJob),
      ];
      flags.isAdopted = true;
      break;
    case "guardian":
      parents = [
        {
          role: "guardian",
          relationshipType: "guardian",
          guardianRelation: randChoice(GUARDIAN_RELATIONS),
          name: `${randFamilyFirstName(used)} ${lastName}`,
          age: randInt(30, 65),
          job: tier.motherJob,
        },
      ];
      break;
    case "foster_care":
      parents = [
        {
          role: "guardian",
          relationshipType: "foster",
          guardianRelation: "foster caregiver",
          name: `${randFamilyFirstName(used)} ${lastName}`,
          age: randInt(30, 60),
          job: tier.motherJob,
        },
      ];
      flags.inFosterCare = true;
      break;
    case "two_biological_parents":
    default:
      parents = [
        addParent("mother", "biological", tier.motherJob),
        addParent("father", "biological", tier.fatherJob),
      ];
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

function generateSiblings(count, lastName, structureId, excludeNames) {
  const relationshipType = structureId === "adopted" ? "adoptive" : structureId === "biological_plus_step" ? "step" : "biological";
  const siblings = [];
  const usedNames = [...excludeNames];
  for (let i = 0; i < count; i++) {
    const pool = FIRST_NAMES.filter((n) => !usedNames.includes(n));
    const firstName = randChoice(pool.length > 0 ? pool : FIRST_NAMES);
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

  if (structureId === "adopted") {
    const [p1, p2] = parents;
    lines.push(
      `You were born on ${formattedDate} in ${country.name}. You were adopted into a ${tierLabel} family. ` +
        `Your ${p1.role}, ${p1.name}, is ${p1.age} and works as ${p1.job}. ` +
        `Your ${p2.role}, ${p2.name}, is ${p2.age} and works as ${p2.job}.`
    );
  } else if (structureId === "biological_plus_step") {
    const bio = parents.find((p) => p.relationshipType === "biological");
    const step = parents.find((p) => p.relationshipType === "step");
    lines.push(
      `You were born on ${formattedDate} in ${country.name}. You were born into a ${tierLabel} family. ` +
        `Your ${bio.role}, ${bio.name} (${bio.age}, works as ${bio.job}), raised you alongside your step${step.role}, ` +
        `${step.name} (${step.age}, works as ${step.job}).`
    );
  } else if (structureId === "single_biological_parent") {
    const p = parents[0];
    lines.push(
      `You were born on ${formattedDate} in ${country.name}. You were born into a ${tierLabel} family, raised by your ${p.role}, ` +
        `${p.name}, who is ${p.age} and works as ${p.job}.`
    );
  } else if (structureId === "guardian") {
    const g = parents[0];
    lines.push(
      `You were born on ${formattedDate} in ${country.name}. You were raised by your ${g.guardianRelation}, ${g.name}, ` +
        `who is ${g.age} and works as ${g.job}.`
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
        `Your ${p1.role}, ${p1.name}, is ${p1.age} and works as ${p1.job}. ` +
        `Your ${p2.role}, ${p2.name}, is ${p2.age} and works as ${p2.job}.`
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

function createCharacter({ country, gender, wealthTiers, birthCircumstances, familyStructures }) {
  const lastName = randChoice(LAST_NAMES);
  const firstName = randChoice(FIRST_NAMES);
  const name = `${firstName} ${lastName}`;
  const tier = rollWealthTier(wealthTiers);

  const circumstance = rollWeighted(birthCircumstances);
  const structure = circumstance.forcesSingleParent
    ? familyStructures.find((s) => s.id === "single_biological_parent") ?? rollWeighted(familyStructures)
    : rollWeighted(familyStructures);

  const { parents, flags: familyFlags } = generateFamilyMembers(structure.id, lastName, tier, firstName);
  const usedFirstNames = [firstName, ...parents.map((p) => p.name.split(" ")[0])];
  const siblings = generateSiblings(rollSiblingCount(), lastName, structure.id, usedFirstNames);
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
    name,
    gender,
    country: country.id,
    countryName: country.name,
    birthDate,
    zodiacSign,
    birthCircumstances: circumstance.id,
    familyStructure: structure.id,
    age: 0,
    money: 0,
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

export { createCharacter, getLifeStage, clampStat, randInt, LIFE_STAGES };
