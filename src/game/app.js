import { createCharacter, getLifeStage } from "./character.js";
import { ageUp } from "./engine.js";
import { pickEvent, applyChoice } from "./events.js";
import { loadCountries, loadWealthTiers, loadAgeUpEvents } from "./data.js";
import { listLives, loadActiveCharacter, saveCharacter, createLife, setActiveLife, deleteLife } from "./save.js";

const MAX_FEED_ENTRIES = 6;

let character = null;
let activeLifeId = null;
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

const home = {
  screen: document.getElementById("home-screen"),
  livesList: document.getElementById("lives-list"),
  empty: document.getElementById("lives-empty"),
  createBtn: document.getElementById("create-life-btn"),
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

const confirmModal = {
  overlay: document.getElementById("confirm-modal-overlay"),
  title: document.getElementById("confirm-modal-title"),
  message: document.getElementById("confirm-modal-message"),
  cancelBtn: document.getElementById("confirm-modal-cancel"),
  confirmBtn: document.getElementById("confirm-modal-confirm"),
};

const toast = document.getElementById("toast");

// ---------- Screen switching ----------

const screens = { home: home.screen, creation: creation.screen, game: game.screen };

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle("hidden", key !== name);
  }
}

// ---------- Toast ----------

let toastTimeout = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("visible");
  }, 1400);
}

// ---------- Save / autosave ----------

function autosave() {
  const ok = saveCharacter(activeLifeId, character);
  showToast(ok ? "Saved" : "Couldn't save your progress");
}

function manualSave() {
  if (!character || !activeLifeId) return;
  const ok = saveCharacter(activeLifeId, character);
  showToast(ok ? "Game saved." : "Couldn't save your progress");
}

// ---------- Confirm modal ----------

let pendingConfirmAction = null;

function showConfirm({ title, message, confirmLabel, onConfirm }) {
  confirmModal.title.textContent = title;
  confirmModal.message.textContent = message;
  confirmModal.confirmBtn.textContent = confirmLabel;
  pendingConfirmAction = onConfirm;
  confirmModal.overlay.classList.remove("hidden");
}

function hideConfirm() {
  confirmModal.overlay.classList.add("hidden");
  pendingConfirmAction = null;
}

confirmModal.cancelBtn.addEventListener("click", hideConfirm);
confirmModal.confirmBtn.addEventListener("click", () => {
  const action = pendingConfirmAction;
  hideConfirm();
  if (action) action();
});

// ---------- Home / My Lives screen ----------

function renderHomeScreen() {
  const lives = listLives();
  home.empty.classList.toggle("hidden", lives.length > 0);
  home.livesList.innerHTML = "";

  for (const life of lives) {
    const stage = getLifeStage(life.character.age);
    const isCurrent = life.id === activeLifeId;

    const card = document.createElement("div");
    card.className = isCurrent ? "life-card current" : "life-card";

    const info = document.createElement("div");
    info.innerHTML = `
      <p class="life-card-name"></p>
      <p class="life-card-meta"></p>
      <p class="life-card-money"></p>
    `;
    info.querySelector(".life-card-name").textContent = life.character.name;
    info.querySelector(".life-card-meta").textContent = `Age ${life.character.age} · ${stage.label}`;
    info.querySelector(".life-card-money").textContent = `$${life.character.money.toLocaleString()}`;

    if (isCurrent) {
      const badge = document.createElement("span");
      badge.className = "life-card-badge";
      badge.textContent = "✓ Current Life";
      info.appendChild(badge);
    }

    const actions = document.createElement("div");
    actions.className = "life-card-actions";

    const continueBtn = document.createElement("button");
    continueBtn.type = "button";
    continueBtn.className = "life-card-continue-btn";
    continueBtn.textContent = "Continue";
    continueBtn.addEventListener("click", () => continueLife(life.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "life-card-delete-btn";
    deleteBtn.setAttribute("aria-label", `Delete ${life.character.name}'s life`);
    deleteBtn.textContent = "🗑️";
    deleteBtn.addEventListener("click", () => requestDeleteLife(life.id, life.character.name));

    actions.appendChild(continueBtn);
    actions.appendChild(deleteBtn);

    card.appendChild(info);
    card.appendChild(actions);
    home.livesList.appendChild(card);
  }
}

function showHomeScreen() {
  if (character && activeLifeId) {
    saveCharacter(activeLifeId, character);
  }
  renderHomeScreen();
  showScreen("home");
  settings.panel.classList.remove("open");
}

function continueLife(lifeId) {
  const life = listLives().find((l) => l.id === lifeId);
  if (!life) return;

  if (character && activeLifeId && activeLifeId !== lifeId) {
    saveCharacter(activeLifeId, character);
  }

  character = life.character;
  activeLifeId = life.id;
  setActiveLife(lifeId);

  showScreen("game");
  renderGame();
}

function requestDeleteLife(lifeId, name) {
  showConfirm({
    title: `Delete ${name}'s life?`,
    message: "This saved life will be permanently deleted. This cannot be undone.",
    confirmLabel: "Delete",
    onConfirm: () => {
      deleteLife(lifeId);
      if (lifeId === activeLifeId) {
        character = null;
        activeLifeId = null;
      }
      renderHomeScreen();
    },
  });
}

home.createBtn.addEventListener("click", () => {
  resetCreationForm();
  showScreen("creation");
  settings.panel.classList.remove("open");
});

// ---------- Creation screen ----------

function updateCountryFlavor() {
  const country = countries.find((c) => c.id === creation.countrySelect.value);
  creation.countryFlavor.textContent = country ? country.flavorText : "";
}

function updateStartButton() {
  creation.startBtn.disabled = !selectedGender;
}

function populateCountrySelect() {
  creation.countrySelect.innerHTML = "";
  for (const country of countries) {
    const option = document.createElement("option");
    option.value = country.id;
    option.textContent = country.name;
    creation.countrySelect.appendChild(option);
  }
  updateCountryFlavor();
}

function wireCreationScreen() {
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

function resetCreationForm() {
  selectedGender = null;
  creation.genderBtns.forEach((b) => b.classList.remove("selected"));
  updateStartButton();
}

function startLife() {
  const country = countries.find((c) => c.id === creation.countrySelect.value);
  character = createCharacter({ country, gender: selectedGender, wealthTiers });
  activeLifeId = createLife(character);

  showScreen("game");
  renderGame();
  showToast("Saved");
}

// ---------- Game screen rendering ----------

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
      autosave();
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
  autosave();

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

// ---------- Settings (theme + save button + My Lives) ----------

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

document.getElementById("save-btn").addEventListener("click", manualSave);
document.getElementById("my-lives-btn").addEventListener("click", showHomeScreen);

// ---------- Startup ----------

async function init() {
  [countries, wealthTiers, ageUpEvents] = await Promise.all([
    loadCountries(),
    loadWealthTiers(),
    loadAgeUpEvents(),
  ]);

  populateCountrySelect();
  wireCreationScreen();
  initSettings();

  const { character: savedCharacter, lifeId, corrupted } = loadActiveCharacter();
  if (corrupted) showToast("Your previous save couldn't be loaded. Starting fresh.");

  if (savedCharacter) {
    character = savedCharacter;
    activeLifeId = lifeId;
    showScreen("game");
    renderGame();
  } else {
    showHomeScreen();
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && character && activeLifeId) {
    saveCharacter(activeLifeId, character);
  }
});

init();
