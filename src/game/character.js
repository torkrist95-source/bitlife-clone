const FIRST_NAMES = ["Alex", "Jordan", "Sam", "Taylor", "Casey", "Riley", "Morgan", "Jamie", "Avery", "Quinn"];
const LAST_NAMES = ["Smith", "Johnson", "Brown", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Lee", "Walker"];

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

function rollWealthTier(wealthTiers) {
  const totalWeight = wealthTiers.reduce((sum, tier) => sum + tier.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const tier of wealthTiers) {
    if (roll < tier.weight) return tier;
    roll -= tier.weight;
  }
  return wealthTiers[wealthTiers.length - 1];
}

function createCharacter({ country, gender, wealthTiers }) {
  const name = `${randChoice(FIRST_NAMES)} ${randChoice(LAST_NAMES)}`;
  const tier = rollWealthTier(wealthTiers);
  const money = randInt(tier.startingMoney[0], tier.startingMoney[1]);

  return {
    name,
    gender,
    country: country.id,
    countryName: country.name,
    age: 0,
    money,
    family: {
      wealthTier: tier.id,
      wealthTierLabel: tier.name,
      home: tier.home,
      motherJob: tier.motherJob,
      fatherJob: tier.fatherJob,
    },
    stats: {
      health: randInt(70, 100),
      happiness: randInt(60, 100),
      smarts: randInt(30, 70),
      looks: randInt(30, 70),
    },
    flags: {},
    pendingEventId: null,
    history: [`${name} was born in ${country.name} to a ${tier.name.toLowerCase()} family.`],
  };
}

function clampStat(value) {
  return Math.max(0, Math.min(100, value));
}

export { createCharacter, getLifeStage, clampStat, randInt, LIFE_STAGES };
