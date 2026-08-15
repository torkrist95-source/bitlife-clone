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

// The one shared source of truth for "is this character currently enrolled
// in school" -- previously copy-pasted independently into app.js, npcLife.js,
// and events.js (each with a comment pointing at whichever copy came before
// it). Lives here, a dependency-free leaf module every one of those already
// imports from, so there's exactly one place to update if the set of
// enrolled statuses ever changes.
const ENROLLED_EDUCATION_STATUSES = new Set(["elementary", "middle", "high_school"]);

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

// Shared by createCharacter (new characters) and ensureBirthLocation
// (backfilling old saves) so city selection follows identical rules in
// both places -- returns null rather than picking something implausible if
// a country entry is ever missing its curated city pool.
function pickCity(country) {
  return country?.cities?.length ? randChoice(country.cities) : null;
}

// Shared weighted-random selection: picks one item from a list, where each
// item's `weight` (default 10) is its relative chance of being picked.
function weightedPick(items) {
  const totalWeight = items.reduce((sum, item) => sum + (item.weight ?? 10), 0);
  let roll = Math.random() * totalWeight;
  for (const item of items) {
    const weight = item.weight ?? 10;
    if (roll < weight) return item;
    roll -= weight;
  }
  return items[items.length - 1];
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
    closeness: randInt(40, 70),
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
      closeness: randInt(40, 70),
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
      closeness: randInt(40, 70),
    });
  }
  return siblings;
}

function maybeGeneratePet() {
  if (randInt(0, 99) >= 25) return null;
  return { name: randChoice(PET_NAMES), type: randChoice(PET_TYPES) };
}

function buildBirthHistoryLines({ formattedDate, country, city, tier, structureId, parents, siblings, pet }) {
  const lines = [];
  const tierLabel = tier.name.toLowerCase();
  const birthplace = city ? `${city}, ${country.name}` : country.name;
  const employment = (p) => (p.employed ? `works as ${p.job}` : "is currently unemployed");
  const employmentParenthetical = (p) => (p.employed ? `works as ${p.job}` : "currently unemployed");

  if (structureId === "adopted") {
    const [p1, p2] = parents;
    lines.push(
      `You were born on ${formattedDate} in ${birthplace}. You were adopted into a ${tierLabel} family. ` +
        `Your ${p1.role}, ${p1.name}, is ${p1.age} and ${employment(p1)}. ` +
        `Your ${p2.role}, ${p2.name}, is ${p2.age} and ${employment(p2)}.`
    );
  } else if (structureId === "biological_plus_step") {
    const bio = parents.find((p) => p.relationshipType === "biological");
    const step = parents.find((p) => p.relationshipType === "step");
    lines.push(
      `You were born on ${formattedDate} in ${birthplace}. You were born into a ${tierLabel} family. ` +
        `Your ${bio.role}, ${bio.name} (${bio.age}, ${employmentParenthetical(bio)}), raised you alongside your step${step.role}, ` +
        `${step.name} (${step.age}, ${employmentParenthetical(step)}).`
    );
  } else if (structureId === "single_biological_parent") {
    const p = parents[0];
    lines.push(
      `You were born on ${formattedDate} in ${birthplace}. You were born into a ${tierLabel} family, raised by your ${p.role}, ` +
        `${p.name}, who is ${p.age} and ${employment(p)}.`
    );
  } else if (structureId === "guardian") {
    const g = parents[0];
    lines.push(
      `You were born on ${formattedDate} in ${birthplace}. You were raised by your ${g.guardianRelation}, ${g.name}, ` +
        `who is ${g.age} and ${employment(g)}.`
    );
  } else if (structureId === "foster_care") {
    const g = parents[0];
    lines.push(
      `You were born on ${formattedDate} in ${birthplace}. You entered foster care as an infant and were raised by ${g.name}.`
    );
  } else {
    const [p1, p2] = parents;
    lines.push(
      `You were born on ${formattedDate} in ${birthplace}. You were born into a ${tierLabel} family. ` +
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

function createCharacter({ name, country, gender, attractedTo, wealthTiers, birthCircumstances, familyStructures, namePools }) {
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

  // The player only chooses the country; the game picks a specific city from
  // its curated pool, once, at creation -- resolved and stored here (never
  // re-rolled) the same way countryName is, so the birth narrative and the
  // rest of the character's life consistently reference the same place.
  const city = pickCity(country);

  const historyLines = buildBirthHistoryLines({
    formattedDate,
    country,
    city,
    tier,
    structureId: structure.id,
    parents,
    siblings,
    pet,
  });

  return {
    name: playerName,
    gender,
    attractedTo: attractedTo?.length ? attractedTo : ["male", "female"],
    country: country.id,
    countryName: country.name,
    birthCity: city,
    // Resolved once here from the country's own currency, never a live
    // exchange rate -- every financial display formats character.money
    // through this code via formatMoney below.
    currencyCode: country?.currency?.code ?? "USD",
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
    skills: {},
    hobbies: [],
    socialCircle: [],
    coworkers: [],
    recentEventIds: [],
    education: {
      status: "not_started",
      schoolName: null,
      gradeLevel: null,
      gpa: null,
      clubs: [],
      extracurriculars: [],
      teacher: null,
    },
    pendingEventId: null,
    // Birth narrative happens at age 0, before the first Age Up.
    history: historyLines.map((text) => ({ age: 0, text })),
  };
}

function rollWealthTier(wealthTiers) {
  return rollWeighted(wealthTiers);
}

function clampStat(value) {
  return Math.max(0, Math.min(100, value));
}

// Every history entry is tagged with the age it happened at so the feed can
// group entries under an "Age N" header instead of showing a flat list --
// callers keep building their own line text exactly as before, they just
// push through this instead of `character.history.push` directly. Returns
// the text back so `return pushHistory(character, "...")` reads naturally
// at call sites that previously did `const line = "..."; character.history
// .push(line); return line;`.
function pushHistory(character, text) {
  character.history.push({ age: character.age, text });
  return text;
}

// Characters can't personally earn money before this age (the earliest
// income event is the age-14 part-time job offer). Below that, normal
// childhood expenses -- birthday parties, school costs, etc. -- are paid
// by the household/parents rather than the character's own cash. Shared
// by any system that moves money in or out of the character's own pocket
// (events, gifts, tuition, etc.) so this guard only lives in one place.
const MIN_EARNING_AGE = 14;

// Earliest age romance-track interactions (Develop Romance, Ask Out) can
// appear at all -- shared by npc.js's own gating (not just which buttons
// app.js renders) so nothing can bypass it by calling the functions directly.
const MIN_DATING_AGE = 12;

// Returns whether the delta was actually applied, so a caller granting some
// other benefit alongside a cost (a gift's closeness boost, say) can check
// the character actually paid for it instead of assuming success.
function applyMoneyDelta(character, delta) {
  if (delta >= 0) {
    character.money += delta;
    return true;
  }

  if (character.age < MIN_EARNING_AGE) {
    // Household/parents absorb the cost; personal money is untouched.
    return false;
  }

  if (character.money + delta < 0) {
    // Can't personally afford it -- skip rather than go negative.
    return false;
  }

  character.money += delta;
  return true;
}

// Intl.NumberFormat resolves a currency's symbol/grouping/decimal
// conventions correctly on its own -- EXCEPT that under a generic locale
// (the browser's own UI language) many currencies fall back to printing
// their bare ISO code instead of a real symbol (e.g. "ZAR 1,234" instead of
// "R 1 234"). Keyed by currency code (not country) since a code has one
// canonical display locale regardless of which of the 46 countries uses it.
// -u-nu-latn forces Latin digits for locales that would otherwise use a
// native digit system (Arabic, Bengali), so amounts stay readable.
const CURRENCY_LOCALES = {
  THB: "th-TH",
  ZAR: "en-ZA",
  NOK: "nb-NO",
  NGN: "en-NG",
  ARS: "es-AR",
  CLP: "es-CL",
  COP: "es-CO",
  PEN: "es-PE",
  RUB: "ru-RU",
  PLN: "pl-PL",
  SEK: "sv-SE",
  CHF: "de-CH",
  TRY: "tr-TR",
  IDR: "id-ID",
  PKR: "ur-PK",
  BDT: "bn-BD-u-nu-latn",
  KES: "en-KE",
  SGD: "en-SG",
  MYR: "ms-MY",
};

// EGP/SAR/MAD only have a real "authentic" Intl currency representation in
// native Arabic script (e.g. SAR -> "ر.س."), which would inject RTL Arabic
// text into this otherwise all-English game -- an English-region locale for
// these falls back to the bare ISO code instead (the exact problem
// CURRENCY_LOCALES exists to avoid). ISK is here for a different reason:
// empirically, no locale reliably resolves it to "kr" rather than the bare
// code (verified directly against the browser this game actually runs in --
// ICU/CLDR data differs by JS engine, so Node behavior alone isn't
// trustworthy here). This is a currency-level workaround (keyed by code, not
// by country) for these specific Intl gaps -- the values happen to match
// countries.json's own `currency.symbol` for these currencies today, but
// aren't derived from it; the two are independent and would need updating
// together if either changes. (AED deliberately isn't listed here: unlike
// the others, its default Intl output is already "AED 1,234" with no
// locale override needed.)
const MANUAL_CURRENCY_SYMBOLS = {
  EGP: "E£",
  SAR: "SR",
  MAD: "DH",
  ISK: "kr",
};

// The single place money ever gets turned into displayed text -- every
// screen in the game (header, jobs, banking, loans, gifts, odd jobs) routes
// through this instead of hardcoding "$", so a character's own currency
// (set once at creation from their country, see createCharacter above)
// actually determines what they see. No live exchange rate: `amount` is
// always the character's own raw money value, just relabeled/formatted in
// its own currency, never converted. `maximumFractionDigits: 0` because
// every money value in this game (salaries, gifts, odd-job earnings, loans)
// is already a whole number -- this game has no concept of cents.
function formatMoney(amount, currencyCode) {
  const code = currencyCode ?? "USD";
  if (MANUAL_CURRENCY_SYMBOLS[code]) {
    return `${MANUAL_CURRENCY_SYMBOLS[code]} ${amount.toLocaleString("en-US")}`;
  }
  const locale = CURRENCY_LOCALES[code] ?? "en-US";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `$${amount.toLocaleString()}`;
  }
}

// Shared by ensureBirthLocation and app.js's home-screen life-card display,
// so "which country does this character belong to" is resolved identically
// (and in one place) everywhere it's needed, rather than each call site
// re-implementing the same countries.find(...) lookup.
function resolveCountry(character, countries) {
  return countries?.find((c) => c.id === character.country);
}

// Backfills birthCity/currencyCode for characters saved before this feature
// existed (save.js's migration can only set them to `null` placeholders --
// it has no synchronous access to countries.json's data). Called from the
// choke points where a character becomes the one actively being played and
// `countries` is expected to already be loaded, so the assignment can
// happen once and be saved permanently rather than re-rolling every load.
//
// Deliberately does NOT fall back to a default (e.g. "USD") when a real
// value can't be resolved -- if `countries` hasn't finished loading yet, or
// the character's country id doesn't match any entry, this leaves the field
// untouched (formatMoney's own `?? "USD"` already covers display in the
// meantime) and reports no change, so a bad/missing lookup here can never
// get permanently written to the save, and the real value can still be
// backfilled correctly on a later call once real data is available.
function ensureBirthLocation(character, countries) {
  if (character.birthCity && character.currencyCode) return false;
  if (!countries || countries.length === 0) return false;

  const country = resolveCountry(character, countries);
  let changed = false;

  if (!character.birthCity) {
    const city = pickCity(country);
    if (city) {
      character.birthCity = city;
      changed = true;
    }
  }
  if (!character.currencyCode && country?.currency?.code) {
    character.currencyCode = country.currency.code;
    changed = true;
  }

  return changed;
}

export {
  createCharacter,
  generateRandomName,
  getLifeStage,
  clampStat,
  randInt,
  weightedPick,
  applyMoneyDelta,
  formatMoney,
  resolveCountry,
  ensureBirthLocation,
  pushHistory,
  MIN_DATING_AGE,
  MIN_EARNING_AGE,
  ENROLLED_EDUCATION_STATUSES,
  LIFE_STAGES,
  formatBirthDate,
};
