import { createCharacter, getLifeStage } from "./character.js";
import { ageUp } from "./engine.js";
import { loadCountries, loadWealthTiers } from "./data.js";

let character = null;
let countries = [];
let wealthTiers = [];
let selectedGender = null;

const creation = {
  screen: document.getElementById("creation-screen"),
  countrySelect: document.getElementById("country-select"),
  countryFlavor: document.getElementById("country-flavor"),
  genderBtns: document.querySelectorAll(".gender-btn"),
  startBtn: document.getElementById("start-life-btn"),
};

const game = {
  screen: document.getElementById("game-screen"),
  portrait: document.getElementById("portrait"),
  name: document.getElementById("char-name"),
  age: document.getElementById("char-age"),
  money: document.getElementById("char-money"),
  feed: document.getElementById("event-feed"),
  ageBtn: document.getElementById("age-up-btn"),
  bars: {
    health: document.getElementById("bar-health"),
    happiness: document.getElementById("bar-happiness"),
    smarts: document.getElementById("bar-smarts"),
    looks: document.getElementById("bar-looks"),
  },
  navBtns: document.querySelectorAll(".nav-btn"),
};

function updateCountryFlavor() {
  const country = countries.find((c) => c.id === creation.countrySelect.value);
  creation.countryFlavor.textContent = country ? country.flavorText : "";
}

function updateStartButton() {
  creation.startBtn.disabled = !selectedGender;
}

async function initCreationScreen() {
  [countries, wealthTiers] = await Promise.all([loadCountries(), loadWealthTiers()]);

  creation.countrySelect.innerHTML = "";
  for (const country of countries) {
    const option = document.createElement("option");
    option.value = country.id;
    option.textContent = country.name;
    creation.countrySelect.appendChild(option);
  }
  updateCountryFlavor();

  creation.countrySelect.addEventListener("change", updateCountryFlavor);

  creation.genderBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedGender = btn.dataset.gender;
      creation.genderBtns.forEach((b) => b.classList.toggle("selected", b === btn));
      updateStartButton();
    });
  });

  creation.startBtn.addEventListener("click", startLife);
}

function startLife() {
  const country = countries.find((c) => c.id === creation.countrySelect.value);
  character = createCharacter({ country, gender: selectedGender, wealthTiers });

  creation.screen.classList.add("hidden");
  game.screen.classList.remove("hidden");
  renderGame();
}

function renderGame() {
  const stage = getLifeStage(character.age);
  game.portrait.textContent = stage.emoji;
  game.name.textContent = character.name;
  game.age.textContent = `Age ${character.age} · ${stage.label}`;
  game.money.textContent = `$${character.money.toLocaleString()}`;

  for (const [stat, value] of Object.entries(character.stats)) {
    const bar = game.bars[stat];
    if (bar) bar.style.width = `${value}%`;
  }

  game.feed.innerHTML = "";
  for (const line of character.history) {
    const entry = document.createElement("div");
    entry.className = "feed-entry";
    entry.textContent = line;
    game.feed.appendChild(entry);
  }
  game.feed.scrollTop = game.feed.scrollHeight;
}

game.ageBtn.addEventListener("click", () => {
  ageUp(character);
  renderGame();
});

game.navBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    alert(`${btn.dataset.label} is coming soon.`);
  });
});

const settings = {
  btn: document.getElementById("settings-btn"),
  panel: document.getElementById("settings-panel"),
  darkModeToggle: document.getElementById("dark-mode-toggle"),
};

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}

function initSettings() {
  const savedTheme = localStorage.getItem("theme") ?? "light";
  applyTheme(savedTheme);
  settings.darkModeToggle.checked = savedTheme === "dark";

  settings.btn.addEventListener("click", (event) => {
    event.stopPropagation();
    settings.panel.classList.toggle("open");
  });

  document.addEventListener("click", (event) => {
    if (!settings.panel.contains(event.target) && event.target !== settings.btn) {
      settings.panel.classList.remove("open");
    }
  });

  settings.darkModeToggle.addEventListener("change", () => {
    applyTheme(settings.darkModeToggle.checked ? "dark" : "light");
  });
}

initSettings();
initCreationScreen();
