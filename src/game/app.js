import { createCharacter, generateRandomName, getLifeStage, randInt, clampStat, formatBirthDate } from "./character.js";
import { ageUp } from "./engine.js";
import { applyChoice, getEligibleChoices, rollAgeUpHappening } from "./events.js";
import { ensureSocialCircle } from "./npc.js";
import {
  loadCountries,
  loadWealthTiers,
  loadBirthCircumstances,
  loadFamilyStructures,
  loadNamePools,
  loadJobs,
  loadAgeUpEvents,
  loadNpcUpdates,
  loadWorldUpdates,
} from "./data.js";
import { listLives, loadActiveCharacter, saveCharacter, createLife, setActiveLife, deleteLife } from "./save.js";

const MAX_FEED_ENTRIES = 6;

// Bottom-nav hierarchy: category -> systems available under it. A system
// with `id: "jobs"` opens the real Jobs page; anything else opens a
// generic "Coming soon" placeholder. Categories not listed here (or with
// an empty array) show an empty category menu -- the shell is in place
// for every category even before its systems exist.
const NAV_CATEGORIES = {
  Occupation: [
    { id: "school", label: "School" },
    { id: "jobs", label: "Jobs" },
    { id: "special_careers", label: "Special Careers" },
    { id: "career_history", label: "Career History" },
  ],
  Relationships: [
    { id: "friends", label: "Friends" },
    { id: "family", label: "Family" },
    { id: "dating", label: "Dating" },
    { id: "marriage", label: "Marriage" },
  ],
  Activities: [],
  Social: [],
  Finance: [
    { id: "finance_overview", label: "Overview" },
    { id: "savings", label: "Savings" },
    { id: "investments", label: "Investments" },
    { id: "loans", label: "Loans" },
  ],
};

let character = null;
let activeLifeId = null;
let countries = [];
let wealthTiers = [];
let birthCircumstances = [];
let familyStructures = [];
let namePools = {};
let jobsData = [];
let ageUpEvents = [];
let npcUpdates = [];
let worldUpdates = [];
let selectedGender = null;

const creation = {
  screen: document.getElementById("creation-screen"),
  nameInput: document.getElementById("name-input"),
  randomizeNameBtn: document.getElementById("randomize-name-btn"),
  randomizeCharacterBtn: document.getElementById("randomize-character-btn"),
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

const profileModal = {
  overlay: document.getElementById("profile-modal-overlay"),
  portrait: document.getElementById("profile-modal-portrait"),
  name: document.getElementById("profile-modal-name"),
  stage: document.getElementById("profile-modal-stage"),
  birthDate: document.getElementById("profile-modal-birthdate"),
  zodiac: document.getElementById("profile-modal-zodiac"),
  closeBtn: document.getElementById("profile-modal-close"),
};

const occupationModal = {
  overlay: document.getElementById("occupation-modal-overlay"),
  employedView: document.getElementById("occupation-employed-view"),
  unemployedView: document.getElementById("occupation-unemployed-view"),
  jobTitle: document.getElementById("occupation-job-title"),
  jobSalary: document.getElementById("occupation-job-salary"),
  jobList: document.getElementById("occupation-job-list"),
  quitBtn: document.getElementById("occupation-quit-btn"),
  backBtn: document.getElementById("occupation-modal-back"),
  closeBtn: document.getElementById("occupation-modal-close"),
};

const categoryMenu = {
  overlay: document.getElementById("category-menu-overlay"),
  title: document.getElementById("category-menu-title"),
  list: document.getElementById("category-menu-list"),
  empty: document.getElementById("category-menu-empty"),
  backBtn: document.getElementById("category-menu-back"),
  closeBtn: document.getElementById("category-menu-close"),
};

const systemPlaceholder = {
  overlay: document.getElementById("system-placeholder-overlay"),
  title: document.getElementById("system-placeholder-title"),
  backBtn: document.getElementById("system-placeholder-back"),
  closeBtn: document.getElementById("system-placeholder-close"),
};

const financeModal = {
  overlay: document.getElementById("finance-modal-overlay"),
  balanceAmount: document.getElementById("finance-balance-amount"),
  employedView: document.getElementById("finance-income-employed"),
  unemployedView: document.getElementById("finance-income-unemployed"),
  incomeTitle: document.getElementById("finance-income-title"),
  incomeSalary: document.getElementById("finance-income-salary"),
  backBtn: document.getElementById("finance-modal-back"),
  closeBtn: document.getElementById("finance-modal-close"),
};

const friendsModal = {
  overlay: document.getElementById("friends-modal-overlay"),
  list: document.getElementById("friends-list"),
  empty: document.getElementById("friends-empty"),
  backBtn: document.getElementById("friends-modal-back"),
  closeBtn: document.getElementById("friends-modal-close"),
};

const familyModal = {
  overlay: document.getElementById("family-modal-overlay"),
  list: document.getElementById("family-list"),
  backBtn: document.getElementById("family-modal-back"),
  closeBtn: document.getElementById("family-modal-close"),
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
  if (!ok) showToast("Couldn't save your progress");
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
      if (listLives().length === 0) {
        resetCreationForm();
        showScreen("creation");
        settings.panel.classList.remove("open");
      } else {
        renderHomeScreen();
      }
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
  creation.startBtn.disabled = !selectedGender || !creation.nameInput.value.trim();
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

function selectGender(gender) {
  selectedGender = gender;
  creation.genderBtns.forEach((b) => b.classList.toggle("selected", b.dataset.gender === gender));
  updateStartButton();
}

function randomizeCharacter() {
  const gender = Math.random() < 0.5 ? "male" : "female";
  selectGender(gender);
  if (countries.length > 0) {
    creation.countrySelect.value = countries[randInt(0, countries.length - 1)].id;
    updateCountryFlavor();
  }
  creation.nameInput.value = generateRandomName(namePools, creation.countrySelect.value, gender);
  updateStartButton();
}

function wireCreationScreen() {
  creation.countrySelect.addEventListener("change", updateCountryFlavor);
  creation.nameInput.addEventListener("input", updateStartButton);

  creation.randomizeNameBtn.addEventListener("click", () => {
    creation.nameInput.value = generateRandomName(namePools, creation.countrySelect.value, selectedGender);
    updateStartButton();
  });

  creation.randomizeCharacterBtn.addEventListener("click", randomizeCharacter);

  creation.genderBtns.forEach((btn) => {
    btn.addEventListener("click", () => selectGender(btn.dataset.gender));
  });

  creation.startBtn.addEventListener("click", startLife);
}

function resetCreationForm() {
  creation.nameInput.value = "";
  selectedGender = null;
  creation.genderBtns.forEach((b) => b.classList.remove("selected"));
  updateStartButton();
}

function startLife() {
  const country = countries.find((c) => c.id === creation.countrySelect.value);
  const name = creation.nameInput.value.trim();
  character = createCharacter({ name, country, gender: selectedGender, wealthTiers, birthCircumstances, familyStructures, namePools });
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

  const eligibleChoices = getEligibleChoices(character, event);
  // Events with no choices (or none eligible for this character) resolve
  // through a single acknowledgement button, applying the event's own
  // top-level effects/outcomes -- the same applyChoice pipeline either way.
  const renderedChoices =
    eligibleChoices.length > 0
      ? eligibleChoices
      : [
          {
            label: "Continue",
            effects: event.effects,
            outcomes: event.outcomes,
            flags: event.flags,
            skills: event.skills,
            hobbies: event.hobbies,
            resultText: event.resultText,
            next_event: event.next_event,
            dynamic: event.dynamic,
            dynamicArgs: event.dynamicArgs,
          },
        ];

  for (const choice of renderedChoices) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "event-choice-btn";
    btn.textContent = choice.label;
    btn.addEventListener("click", () => {
      const { followUpEvent } = applyChoice(character, choice, { namePools, countryId: character.country });
      renderGame();
      autosave();
      if (followUpEvent) {
        // A dynamic choice opened another event (e.g. "who do you want to
        // ask?") -- show it immediately in the same modal instead of
        // closing; Age Up stays disabled until a choice fully resolves.
        showEventModal(followUpEvent);
      } else {
        hideEventModal();
        game.ageBtn.disabled = false;
      }
    });
    eventModal.choices.appendChild(btn);
  }

  eventModal.overlay.classList.remove("hidden");
}

function hideEventModal() {
  eventModal.overlay.classList.add("hidden");
}

game.ageBtn.addEventListener("click", () => {
  ageUp(character, jobsData);

  const happening = rollAgeUpHappening(character, {
    ageUpEvents,
    npcUpdates,
    worldUpdates,
    namePools,
    countryId: character.country,
    countryName: character.countryName,
  });

  renderGame();
  autosave();

  if (happening.type === "player_event") {
    game.ageBtn.disabled = true;
    showEventModal(happening.event);
  }
});

game.navBtns.forEach((btn) => {
  btn.addEventListener("click", () => openCategoryMenu(btn.dataset.label));
});

// ---------- Bottom-nav hierarchy: category menu -> system page ----------
//
// Gameplay -> [Category Menu] -> [System Page] -> actions
// The category menu stays open underneath a system page (same stacking
// pattern the confirm modal already uses over other modals), so a system
// page's Back button just hides itself -- the menu is still there -- and
// Close hides both, returning straight to gameplay.

function openCategoryMenu(categoryLabel) {
  const systems = NAV_CATEGORIES[categoryLabel] ?? [];
  categoryMenu.title.textContent = categoryLabel;
  categoryMenu.list.innerHTML = "";
  categoryMenu.empty.classList.toggle("hidden", systems.length > 0);

  for (const system of systems) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "category-menu-btn";

    const label = document.createElement("span");
    label.textContent = system.label;
    const arrow = document.createElement("span");
    arrow.className = "category-menu-btn-arrow";
    arrow.textContent = "›";

    btn.appendChild(label);
    btn.appendChild(arrow);
    btn.addEventListener("click", () => openSystemPage(system));
    categoryMenu.list.appendChild(btn);
  }

  categoryMenu.overlay.classList.remove("hidden");
}

function hideCategoryMenu() {
  categoryMenu.overlay.classList.add("hidden");
}

function openSystemPage(system) {
  if (system.id === "jobs") {
    openOccupationModal();
  } else if (system.id === "finance_overview") {
    openFinanceOverview();
  } else if (system.id === "friends") {
    openFriendsModal();
  } else if (system.id === "family") {
    openFamilyModal();
  } else {
    openSystemPlaceholder(system.label);
  }
}

function openSystemPlaceholder(label) {
  systemPlaceholder.title.textContent = label;
  systemPlaceholder.overlay.classList.remove("hidden");
}

function hideSystemPlaceholder() {
  systemPlaceholder.overlay.classList.add("hidden");
}

categoryMenu.backBtn.addEventListener("click", hideCategoryMenu);
categoryMenu.closeBtn.addEventListener("click", hideCategoryMenu);
systemPlaceholder.backBtn.addEventListener("click", hideSystemPlaceholder);
systemPlaceholder.closeBtn.addEventListener("click", () => {
  hideSystemPlaceholder();
  hideCategoryMenu();
});

// ---------- Occupation ----------

function getJobLevel(jobId, levelIndex) {
  const jobDef = jobsData.find((j) => j.id === jobId);
  return jobDef ? jobDef.levels[levelIndex] : null;
}

function renderJobList() {
  occupationModal.jobList.innerHTML = "";
  const eligible = jobsData.filter(
    (j) => character.age >= j.minAge && (!j.minSmarts || character.stats.smarts >= j.minSmarts)
  );

  for (const job of eligible) {
    const entryLevel = job.levels[0];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "occupation-job-btn";

    const title = document.createElement("span");
    title.textContent = entryLevel.title;
    const salary = document.createElement("span");
    salary.className = "occupation-job-btn-salary";
    salary.textContent = `$${entryLevel.salary.toLocaleString()}/yr`;

    btn.appendChild(title);
    btn.appendChild(salary);
    btn.addEventListener("click", () => applyForJob(job.id));
    occupationModal.jobList.appendChild(btn);
  }

  if (eligible.length === 0) {
    const empty = document.createElement("p");
    empty.className = "occupation-empty";
    empty.textContent = character.age < 16 ? "You're not old enough to work yet." : "No jobs available to you right now.";
    occupationModal.jobList.appendChild(empty);
  }
}

function renderOccupationModal() {
  const level = character.job ? getJobLevel(character.job.jobId, character.job.levelIndex) : null;
  if (!level) {
    // Either unemployed, or character.job refers to a job/level that no
    // longer exists in jobsData -- treat that the same as unemployed
    // rather than crashing on a stale reference.
    character.job = null;
    occupationModal.employedView.classList.add("hidden");
    occupationModal.unemployedView.classList.remove("hidden");
    renderJobList();
    return;
  }

  occupationModal.jobTitle.textContent = level.title;
  occupationModal.jobSalary.textContent = `$${level.salary.toLocaleString()} / year`;
  occupationModal.employedView.classList.remove("hidden");
  occupationModal.unemployedView.classList.add("hidden");
}

function applyForJob(jobId) {
  character.job = { jobId, levelIndex: 0, yearsInRole: 0 };
  const level = getJobLevel(jobId, 0);
  character.history.push(`You got a job as ${level.title}.`);
  renderOccupationModal();
  renderGame();
  autosave();
  showToast(`Hired as ${level.title}!`);
}

function requestQuitJob() {
  const level = character.job ? getJobLevel(character.job.jobId, character.job.levelIndex) : null;
  if (!level) {
    character.job = null;
    renderOccupationModal();
    return;
  }
  showConfirm({
    title: "Quit your job?",
    message: `Are you sure you want to quit your job as ${level.title}?`,
    confirmLabel: "Quit",
    onConfirm: () => {
      character.job = null;
      character.history.push(`You quit your job as ${level.title}.`);
      renderOccupationModal();
      renderGame();
      autosave();
    },
  });
}

function openOccupationModal() {
  if (!character) return;
  renderOccupationModal();
  occupationModal.overlay.classList.remove("hidden");
}

function hideOccupationModal() {
  occupationModal.overlay.classList.add("hidden");
}

occupationModal.quitBtn.addEventListener("click", requestQuitJob);
occupationModal.backBtn.addEventListener("click", hideOccupationModal);
occupationModal.closeBtn.addEventListener("click", () => {
  hideOccupationModal();
  hideCategoryMenu();
});

// ---------- Finance ----------

function renderFinanceOverview() {
  financeModal.balanceAmount.textContent = `$${character.money.toLocaleString()}`;

  const level = character.job ? getJobLevel(character.job.jobId, character.job.levelIndex) : null;
  if (level) {
    financeModal.incomeTitle.textContent = level.title;
    financeModal.incomeSalary.textContent = `$${level.salary.toLocaleString()} / year`;
    financeModal.employedView.classList.remove("hidden");
    financeModal.unemployedView.classList.add("hidden");
  } else {
    financeModal.employedView.classList.add("hidden");
    financeModal.unemployedView.classList.remove("hidden");
  }
}

function openFinanceOverview() {
  if (!character) return;
  renderFinanceOverview();
  financeModal.overlay.classList.remove("hidden");
}

function hideFinanceOverview() {
  financeModal.overlay.classList.add("hidden");
}

financeModal.backBtn.addEventListener("click", hideFinanceOverview);
financeModal.closeBtn.addEventListener("click", () => {
  hideFinanceOverview();
  hideCategoryMenu();
});

// ---------- Relationships: Friends & Family ----------

const SOCIAL_TYPE_LABELS = { friend: "Friend", crush: "Crush", romantic_interest: "Romantic Interest" };

function buildPersonCard({ name, meta, action }) {
  const card = document.createElement("div");
  card.className = "friend-card";

  const info = document.createElement("div");
  const nameEl = document.createElement("p");
  nameEl.className = "friend-card-name";
  nameEl.textContent = name;
  const metaEl = document.createElement("p");
  metaEl.className = "friend-card-meta";
  metaEl.textContent = meta;
  info.appendChild(nameEl);
  info.appendChild(metaEl);
  card.appendChild(info);

  if (action) card.appendChild(action);
  return card;
}

function renderFriendsList() {
  ensureSocialCircle(character, namePools, character.country);
  friendsModal.list.innerHTML = "";
  const circle = character.socialCircle ?? [];
  friendsModal.empty.classList.toggle("hidden", circle.length > 0);

  for (const npc of circle) {
    const hangoutBtn = document.createElement("button");
    hangoutBtn.type = "button";
    hangoutBtn.className = "friend-hangout-btn";
    hangoutBtn.textContent = "Hang Out";
    hangoutBtn.addEventListener("click", () => hangOutWith(npc.id));

    const meta = `${SOCIAL_TYPE_LABELS[npc.type] ?? npc.type} · Closeness ${npc.closeness}`;
    friendsModal.list.appendChild(buildPersonCard({ name: npc.name, meta, action: hangoutBtn }));
  }
}

function hangOutWith(npcId) {
  const npc = (character.socialCircle ?? []).find((n) => n.id === npcId);
  if (!npc) return;
  npc.closeness = clampStat(npc.closeness + randInt(3, 8));
  character.stats.happiness = clampStat(character.stats.happiness + 2);
  character.history.push(`You hung out with ${npc.name}.`);
  renderFriendsList();
  renderGame();
  autosave();
}

function openFriendsModal() {
  if (!character) return;
  renderFriendsList();
  friendsModal.overlay.classList.remove("hidden");
}

function hideFriendsModal() {
  friendsModal.overlay.classList.add("hidden");
}

friendsModal.backBtn.addEventListener("click", hideFriendsModal);
friendsModal.closeBtn.addEventListener("click", () => {
  hideFriendsModal();
  hideCategoryMenu();
});

function parentRelationLabel(parent) {
  if (parent.role === "guardian") {
    const relation = parent.guardianRelation ?? "guardian";
    return relation.charAt(0).toUpperCase() + relation.slice(1);
  }
  const base = parent.role.charAt(0).toUpperCase() + parent.role.slice(1);
  return parent.relationshipType === "step" ? `Step${parent.role}` : base;
}

function renderFamilyList() {
  familyModal.list.innerHTML = "";

  for (const parent of character.family?.parents ?? []) {
    const jobText = parent.employed ? `works as ${parent.job}` : "unemployed";
    const meta = `${parentRelationLabel(parent)} · Age ${parent.age} · ${jobText}`;
    familyModal.list.appendChild(buildPersonCard({ name: parent.name, meta }));
  }

  for (const sibling of character.family?.siblings ?? []) {
    familyModal.list.appendChild(buildPersonCard({ name: sibling.name, meta: `Sibling · Age ${sibling.age}` }));
  }
}

function openFamilyModal() {
  if (!character) return;
  renderFamilyList();
  familyModal.overlay.classList.remove("hidden");
}

function hideFamilyModal() {
  familyModal.overlay.classList.add("hidden");
}

familyModal.backBtn.addEventListener("click", hideFamilyModal);
familyModal.closeBtn.addEventListener("click", () => {
  hideFamilyModal();
  hideCategoryMenu();
});

function openProfile() {
  if (!character) return;
  const stage = getLifeStage(character.age);
  profileModal.portrait.textContent = stage.emoji;
  profileModal.name.textContent = character.name;
  profileModal.stage.textContent = `Age ${character.age} · ${stage.label}`;
  profileModal.birthDate.textContent = character.birthDate ? formatBirthDate(character.birthDate) : "Unknown";
  profileModal.zodiac.textContent = character.zodiacSign ?? "Unknown";
  profileModal.overlay.classList.remove("hidden");
}

function hideProfile() {
  profileModal.overlay.classList.add("hidden");
}

game.profileEntry.addEventListener("click", openProfile);
game.profileEntry.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openProfile();
  }
});

profileModal.closeBtn.addEventListener("click", hideProfile);

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
  [countries, wealthTiers, birthCircumstances, familyStructures, namePools, jobsData, ageUpEvents, npcUpdates, worldUpdates] =
    await Promise.all([
      loadCountries(),
      loadWealthTiers(),
      loadBirthCircumstances(),
      loadFamilyStructures(),
      loadNamePools(),
      loadJobs(),
      loadAgeUpEvents(),
      loadNpcUpdates(),
      loadWorldUpdates(),
    ]);

  populateCountrySelect();
  wireCreationScreen();
  initSettings();

  const { character: savedCharacter, lifeId, corrupted } = loadActiveCharacter();
  if (corrupted) showToast("Your previous save couldn't be loaded. Starting fresh.");

  if (savedCharacter) {
    // Returning player with an active life: go straight into gameplay.
    character = savedCharacter;
    activeLifeId = lifeId;
    showScreen("game");
    renderGame();
  } else if (listLives().length > 0) {
    // Lives exist but none is active (e.g. the active life was deleted last
    // session) -- let the player pick one instead of guessing.
    showHomeScreen();
  } else {
    // First-time player: no saved lives at all, so skip My Lives entirely.
    resetCreationForm();
    showScreen("creation");
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && character && activeLifeId) {
    saveCharacter(activeLifeId, character);
  }
});

init();
