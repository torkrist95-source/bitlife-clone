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

export { loadCountries, loadWealthTiers };
