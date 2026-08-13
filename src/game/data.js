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

async function loadAgeUpEvents() {
  const pools = await Promise.all([
    loadJSON("data/events/age_up/childhood.json"),
    loadJSON("data/events/age_up/teen.json"),
    loadJSON("data/events/age_up/adult.json"),
  ]);
  return pools.flat();
}

export { loadCountries, loadWealthTiers, loadAgeUpEvents };
