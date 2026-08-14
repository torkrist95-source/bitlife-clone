async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function loadCountries() {
  return loadJSON("data/world/countries.json");
}

function loadWealthTiers() {
  return loadJSON("data/character_creation/wealth_tiers.json");
}

function loadBirthCircumstances() {
  return loadJSON("data/character_creation/birth_circumstances.json");
}

function loadFamilyStructures() {
  return loadJSON("data/character_creation/family_structures.json");
}

function loadNamePools() {
  return loadJSON("data/character_creation/names.json");
}

function loadJobs() {
  return loadJSON("data/careers/jobs.json");
}

async function loadAgeUpEvents() {
  const pools = await Promise.all([
    loadJSON("data/events/age_up/infant.json"),
    loadJSON("data/events/age_up/childhood.json"),
    loadJSON("data/events/age_up/teen.json"),
    loadJSON("data/events/age_up/adult.json"),
    loadJSON("data/events/age_up/school.json"),
  ]);
  return pools.flat();
}

function loadNpcUpdates() {
  return loadJSON("data/events/npc_updates.json");
}

function loadWorldUpdates() {
  return loadJSON("data/events/world_updates.json");
}

function loadClubs() {
  return loadJSON("data/school/clubs.json");
}

function loadExtracurriculars() {
  return loadJSON("data/school/extracurriculars.json");
}

export {
  loadCountries,
  loadWealthTiers,
  loadBirthCircumstances,
  loadFamilyStructures,
  loadNamePools,
  loadJobs,
  loadAgeUpEvents,
  loadNpcUpdates,
  loadWorldUpdates,
  loadClubs,
  loadExtracurriculars,
};
