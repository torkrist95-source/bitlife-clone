import { createCharacter, getLifeStage } from "./character.js";
import { ageUp } from "./engine.js";
import { pickEvent, applyChoice } from "./events.js";
import { loadCountries, loadWealthTiers, loadAgeUpEvents } from "./data.js";

const MAX_FEED_ENTRIES = 6;

let character = null;
let countries = [];
let wealthTiers = [];
let ageUpEvents = [];
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
  profileEntry: document.getElementById("profile-entry"),
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
    fame: document.getElementById("bar-fame"),
    reputation: document.getElementById("bar-reputation"),
  },
  navBtns: document.querySelectorAll(".nav-btn"),
};

const eventModal = {
  overlay: document.getElementById("event-modal-overlay"),
  text: document.getElementById("event-modal-text"),
  choices: document.getElementById("event-modal-choices"),
};

function updateCountryFlavor() {
  const country = countries.find((c) => c.id === creation.countrySelect.value);
  creation.countryFlavor.textContent = country ? country.flavorText : "";
}

function updateStartButton() {
  creation.startBtn.disabled = !selectedGender;
}

async function initCreationScreen() {
  [countries, wealthTiers, ageUpEvents] = await Promise.all([
    loadCountries(),
    loadWealthTiers(),
    loadAgeUpEvents(),
  ]);

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
  game.age.textContent = `Age ${character.age} · ${stage.label} ›`;
  game.money.textContent = `$${character.money.toLocaleString()}`;

  for (const [stat, value] of Object.entries(character.stats)) {
    const bar = game.bars[stat];
    if (bar) bar.style.width = `${value}%`;
  }

  game.feed.innerHTML = "";
  const recentHistory = character.history.slice(-MAX_FEED_ENTRIES);
  for (const line of recentHistory) {
    const entry = document.createElement("div");
    entry.className = "feed-entry";
    entry.textContent = line;
    game.feed.appendChild(entry);
  }
}

function showEventModal(event) {
  eventModal.text.textContent = event.text;
  eventModal.choices.innerHTML = "";

  for (const choice of event.choices) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "event-choice-btn";
    btn.textContent = choice.label;
    btn.addEventListener("click", () => {
      applyChoice(character, choice);
      hideEventModal();
      renderGame();
      game.ageBtn.disabled = false;
    });
    eventModal.choices.appendChild(btn);
  }

  eventModal.overlay.classList.remove("hidden");
}

function hideEventModal() {
  eventModal.overlay.classList.add("hidden");
}

game.ageBtn.addEventListener("click", () => {
  ageUp(character);
  renderGame();

  const event = pickEvent(character, ageUpEvents);
  if (event) {
    game.ageBtn.disabled = true;
    showEventModal(event);
  }
});

game.navBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    alert(`${btn.dataset.label} is coming soon.`);
  });
});

function openProfile() {
  alert("Character Profile is coming soon.");
}

game.profileEntry.addEventListener("click", openProfile);
game.profileEntry.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openProfile();
  }
});

const settings = {
  btn: document.getElementById("settings-btn"),
  panel: document.getElementById("settings-panel"),
  themeBtns: document.querySelectorAll(".theme-btn"),
};

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  settings.themeBtns.forEach((btn) => btn.classList.toggle("selected", btn.dataset.theme === theme));
}

function initSettings() {
  const savedTheme = localStorage.getItem("theme") ?? "light";
  applyTheme(savedTheme);

  settings.btn.addEventListener("click", (event) => {
    event.stopPropagation();
    settings.panel.classList.toggle("open");
  });

  document.addEventListener("click", (event) => {
    if (!settings.panel.contains(event.target) && event.target !== settings.btn) {
      settings.panel.classList.remove("open");
    }
  });

  settings.themeBtns.forEach((btn) => {
    btn.addEventListener("click", () => applyTheme(btn.dataset.theme));
  });
}

initSettings();
initCreationScreen();
