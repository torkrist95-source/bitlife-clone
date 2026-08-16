import {
  createCharacter,
  generateRandomName,
  getLifeStage,
  randInt,
  formatBirthDate,
  formatMoney,
  resolveCountry,
  ensureBirthLocation,
  pushHistory,
  pushCareerEvent,
  MIN_DATING_AGE,
  MIN_EARNING_AGE,
  ENROLLED_EDUCATION_STATUSES as ENROLLED_STATUSES,
} from "./character.js";
import { ageUp } from "./engine.js";
import { applyChoice, getEligibleChoices, rollAgeUpHappening } from "./events.js";
import {
  ensureSocialCircle,
  ensureCoworkers,
  endCoworkerRelationships,
  canRomanticallyMatch,
  talk,
  getToKnow,
  hangOut,
  confide,
  giveGift,
  askToBecomeFriends,
  developRomance,
  askOut,
  askForHelp,
  thankTeacher,
  askFamilyForHelp,
  borrowMoney,
} from "./npc.js";
import { getEligibleJobs, applyForJob, getOddJobsSummary, getEligibleOneTimeJobs, resolveOneTimeJob } from "./careers.js";
import { generatePersonality, getDominantTraits, ensurePersonality } from "./personality.js";
import { GENDER_IDENTITIES, ATTRACTION_OPTIONS, resolveAttractedTo, attractionIdFor } from "./identity.js";
import {
  getGradeLabel,
  getStatusLabel,
  studyHarder,
  getAvailableClubs,
  joinClub,
  leaveClub,
  getAvailableExtracurriculars,
  attemptExtracurricular,
  leaveExtracurricular,
} from "./school.js";
import {
  loadCountries,
  loadWealthTiers,
  loadBirthCircumstances,
  loadFamilyStructures,
  loadNamePools,
  loadJobs,
  loadOneTimeJobs,
  loadAgeUpEvents,
  loadNpcUpdates,
  loadWorldUpdates,
  loadOddJobs,
  loadCelebrities,
  loadClubs,
  loadExtracurriculars,
} from "./data.js";
import { listLives, loadActiveCharacter, saveCharacter, createLife, setActiveLife, deleteLife } from "./save.js";

// Bottom-nav hierarchy: category -> the full roadmap of systems under it.
// Each system expands (accordion-style) to reveal its content inline --
// nothing here is a separate navigation page. A system has either:
//   - `actions`: a list of buttons that open an existing modal/interaction
//   - `render(container)`: builds custom content directly into the
//     expanded area (e.g. the Friends list with Hang Out buttons)
// Systems not yet built just use `render: renderComingSoon`, so the full
// planned shape stays visible without pretending unbuilt features work.
// Handlers/renderers reference functions defined later in this file --
// safe, since none of this is called until the player expands a system.
const NAV_CATEGORIES = {
  Occupation: [
    { id: "school", label: "School", render: (container) => renderSchoolInto(container) },
    { id: "jobs", label: "Jobs", render: (container) => renderJobsInto(container) },
    { id: "special_careers", label: "Special Careers", render: renderComingSoon },
    { id: "career_history", label: "Career History", render: (container) => renderCareerHistoryInto(container) },
  ],
  Relationships: [
    { id: "family", label: "Family", render: (container) => renderFamilyListInto(container) },
    { id: "friends", label: "Friends", render: (container) => renderFriendsInto(container) },
    { id: "partner", label: "Partner", render: (container) => renderPartnerInto(container) },
  ],
  Activities: [
    { id: "hobbies", label: "Hobbies", render: renderComingSoon },
    { id: "skills", label: "Skills", render: renderComingSoon },
    { id: "exercise", label: "Exercise", render: renderComingSoon },
    { id: "travel", label: "Travel/Vacation", render: renderComingSoon },
    { id: "dating", label: "Go on a Date", render: renderComingSoon },
  ],
  Social: [
    { id: "facepage", label: "Facepage", render: renderComingSoon },
    { id: "instagrin", label: "Instagrin", render: renderComingSoon },
    { id: "tikpop", label: "TikPop", render: renderComingSoon },
    { id: "viewtube", label: "ViewTube", render: renderComingSoon },
    { id: "readit", label: "Readit", render: renderComingSoon },
    { id: "sparq", label: "Sparq", render: renderComingSoon },
  ],
  Finance: [
    { id: "bank", label: "Bank", actions: [{ label: "View Balance", handler: () => openFinanceOverview() }] },
    { id: "investments", label: "Investments", render: renderComingSoon },
    { id: "assets", label: "Assets", render: renderComingSoon },
    { id: "debt", label: "Debt", render: renderComingSoon },
    { id: "insurance", label: "Insurance", render: renderComingSoon },
    { id: "net_worth", label: "Net Worth", render: renderComingSoon },
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
let oneTimeJobsData = [];
let ageUpEvents = [];
let npcUpdates = [];
let worldUpdates = [];
let oddJobsData = [];
let celebrities = [];
let clubsData = [];
let extracurricularsData = [];
let selectedGender = null;
let selectedAttraction = null;

const creation = {
  screen: document.getElementById("creation-screen"),
  nameInput: document.getElementById("name-input"),
  randomizeNameBtn: document.getElementById("randomize-name-btn"),
  randomizeCharacterBtn: document.getElementById("randomize-character-btn"),
  countrySelect: document.getElementById("country-select"),
  countryFlavor: document.getElementById("country-flavor"),
  // Both button groups share the .gender-btn style, so each is scoped by
  // its own data attribute rather than the shared class alone.
  genderBtns: document.querySelectorAll(".gender-btn[data-gender]"),
  attractionBtns: document.querySelectorAll(".gender-btn[data-attraction]"),
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
  personality: document.getElementById("profile-modal-personality"),
  genderIdentitySelect: document.getElementById("profile-modal-gender-identity"),
  attractionSelect: document.getElementById("profile-modal-attraction"),
  closeBtn: document.getElementById("profile-modal-close"),
};

const navDrawer = {
  overlay: document.getElementById("nav-drawer-overlay"),
  title: document.getElementById("nav-drawer-title"),
  list: document.getElementById("nav-drawer-list"),
  empty: document.getElementById("nav-drawer-empty"),
  closeBtn: document.getElementById("nav-drawer-close"),
};

const financeModal = {
  overlay: document.getElementById("finance-modal-overlay"),
  balanceAmount: document.getElementById("finance-balance-amount"),
  employedView: document.getElementById("finance-income-employed"),
  unemployedView: document.getElementById("finance-income-unemployed"),
  incomeTitle: document.getElementById("finance-income-title"),
  incomeSalary: document.getElementById("finance-income-salary"),
  closeBtn: document.getElementById("finance-modal-close"),
};

const clubsModal = {
  overlay: document.getElementById("clubs-modal-overlay"),
  list: document.getElementById("clubs-list"),
  closeBtn: document.getElementById("clubs-modal-close"),
};

const activitiesModal = {
  overlay: document.getElementById("activities-modal-overlay"),
  result: document.getElementById("activities-result"),
  list: document.getElementById("activities-list"),
  closeBtn: document.getElementById("activities-modal-close"),
};

const classmatesModal = {
  overlay: document.getElementById("classmates-modal-overlay"),
  list: document.getElementById("classmates-list"),
  closeBtn: document.getElementById("classmates-modal-close"),
};

const coworkersModal = {
  overlay: document.getElementById("coworkers-modal-overlay"),
  list: document.getElementById("coworkers-list"),
  closeBtn: document.getElementById("coworkers-modal-close"),
};

const npcProfileModal = {
  overlay: document.getElementById("npc-profile-modal-overlay"),
  portrait: document.getElementById("npc-profile-portrait"),
  name: document.getElementById("npc-profile-name"),
  meta: document.getElementById("npc-profile-meta"),
  barsWrap: document.getElementById("npc-profile-bars-wrap"),
  bars: {
    health: document.getElementById("npc-profile-bar-health"),
    happiness: document.getElementById("npc-profile-bar-happiness"),
    smarts: document.getElementById("npc-profile-bar-smarts"),
    looks: document.getElementById("npc-profile-bar-looks"),
    fame: document.getElementById("npc-profile-bar-fame"),
    reputation: document.getElementById("npc-profile-bar-reputation"),
  },
  occupationRow: document.getElementById("npc-profile-occupation-row"),
  occupationValue: document.getElementById("npc-profile-occupation-value"),
  friendshipRow: document.getElementById("npc-profile-friendship-row"),
  friendshipLabel: document.getElementById("npc-profile-friendship-label"),
  friendshipValue: document.getElementById("npc-profile-friendship-value"),
  romanceRow: document.getElementById("npc-profile-romance-row"),
  romanceValue: document.getElementById("npc-profile-romance-value"),
  interactions: document.getElementById("npc-profile-interactions"),
  closeBtn: document.getElementById("npc-profile-modal-close"),
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
    // Not-yet-opened lives may still carry the migration placeholder
    // (currencyCode: null) -- resolve it for display here rather than
    // turning listLives() into a write path; ensureBirthLocation persists
    // the real value permanently the first time the life is actually opened.
    const displayCurrency = life.character.currencyCode ?? resolveCountry(life.character, countries)?.currency?.code;
    info.querySelector(".life-card-money").textContent = formatMoney(life.character.money, displayCurrency);

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

  const locationChanged = ensureBirthLocation(character, countries);
  const personalityChanged = ensurePersonality(character);
  if (locationChanged || personalityChanged) {
    saveCharacter(activeLifeId, character);
  }

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
  creation.startBtn.disabled = !selectedGender || !selectedAttraction || !creation.nameInput.value.trim();
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

// Both lists are small and fixed (see identity.js), so they're populated
// once at startup rather than re-built every time the profile opens.
function populateIdentitySelects() {
  for (const { id, label } of GENDER_IDENTITIES) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label;
    profileModal.genderIdentitySelect.appendChild(option);
  }
  for (const { id, label } of ATTRACTION_OPTIONS) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label;
    profileModal.attractionSelect.appendChild(option);
  }
}

function selectGender(gender) {
  selectedGender = gender;
  creation.genderBtns.forEach((b) => b.classList.toggle("selected", b.dataset.gender === gender));
  updateStartButton();
}

function selectAttraction(attraction) {
  selectedAttraction = attraction;
  creation.attractionBtns.forEach((b) => b.classList.toggle("selected", b.dataset.attraction === attraction));
  updateStartButton();
}

function randomizeCharacter() {
  const gender = Math.random() < 0.5 ? "male" : "female";
  selectGender(gender);
  const attractionOptions = ["male", "female", "both"];
  selectAttraction(attractionOptions[randInt(0, attractionOptions.length - 1)]);
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

  creation.attractionBtns.forEach((btn) => {
    btn.addEventListener("click", () => selectAttraction(btn.dataset.attraction));
  });

  creation.startBtn.addEventListener("click", startLife);
}

function resetCreationForm() {
  creation.nameInput.value = "";
  selectedGender = null;
  selectedAttraction = null;
  creation.genderBtns.forEach((b) => b.classList.remove("selected"));
  creation.attractionBtns.forEach((b) => b.classList.remove("selected"));
  updateStartButton();
}

function startLife() {
  const country = countries.find((c) => c.id === creation.countrySelect.value);
  const name = creation.nameInput.value.trim();
  character = createCharacter({
    name,
    country,
    gender: selectedGender,
    attractedTo: resolveAttractedTo(selectedAttraction),
    wealthTiers,
    birthCircumstances,
    familyStructures,
    namePools,
  });
  character.personality = generatePersonality();
  activeLifeId = createLife(character);

  showScreen("game");
  renderGame();
  showToast("Saved");
}

// ---------- Game screen rendering ----------

function renderStatBars(stats, barsMap) {
  for (const [stat, value] of Object.entries(stats)) {
    const bar = barsMap[stat];
    if (bar) bar.style.width = `${value}%`;
  }
}

function renderGame() {
  const stage = getLifeStage(character.age);
  game.portrait.textContent = stage.emoji;
  game.name.textContent = character.name;
  game.age.textContent = `Age ${character.age} · ${stage.label} ›`;
  game.money.textContent = formatMoney(character.money, character.currencyCode);

  renderStatBars(character.stats, game.bars);

  // The full life, grouped under an "Age N" header per year -- history is
  // already strictly chronological (nothing ever reorders it), so a single
  // forward pass grouping consecutive same-age entries is all that's
  // needed, no re-sort. Rendering everything (rather than only the most
  // recent few) is what makes the feed read as a scrollable biography
  // instead of a rolling window onto only the current year.
  game.feed.innerHTML = "";
  for (const { age, entries } of groupHistoryByAge(character.history)) {
    const header = document.createElement("div");
    header.className = "feed-age-header";
    header.textContent = age === 0 ? "Birth" : `Age ${age}`;
    game.feed.appendChild(header);

    for (const text of entries) {
      const entry = document.createElement("div");
      entry.className = "feed-entry";
      entry.textContent = text;
      game.feed.appendChild(entry);
    }
  }
  // Land on the newest year automatically rather than leaving the player
  // scrolled wherever they were on the previous, shorter render.
  game.feed.scrollTop = game.feed.scrollHeight;
}

function groupHistoryByAge(history) {
  const groups = [];
  for (const { age, text } of history) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.age === age) {
      lastGroup.entries.push(text);
    } else {
      groups.push({ age, entries: [text] });
    }
  }
  return groups;
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
  ageUp(character, jobsData, namePools, character.country);

  const happening = rollAgeUpHappening(character, {
    ageUpEvents,
    npcUpdates,
    worldUpdates,
    oddJobsData,
    celebrities,
    clubsData,
    extracurricularsData,
    namePools,
    countryId: character.country,
    countryName: character.countryName,
    jobsData,
  });

  renderGame();
  autosave();

  if (happening.type === "player_event") {
    game.ageBtn.disabled = true;
    showEventModal(happening.event);
  }
});

game.navBtns.forEach((btn) => {
  btn.addEventListener("click", () => openNavDrawer(btn.dataset.label));
});

// ---------- Bottom-nav hierarchy: category drawer with accordion systems ----------
//
// Gameplay -> [Category Drawer] -> tap a system to expand/collapse its
// actions inline -> tap an action to open that system's existing
// modal/interaction. There's no separate "system page" to navigate to and
// no Back stack -- the drawer stays open underneath (same stacking
// pattern the confirm modal already uses over other modals) while an
// action's modal is open on top, and that modal's own Close hides both,
// returning straight to gameplay.

function openNavDrawer(categoryLabel) {
  const systems = NAV_CATEGORIES[categoryLabel] ?? [];
  navDrawer.title.textContent = categoryLabel;
  navDrawer.list.innerHTML = "";
  navDrawer.empty.classList.toggle("hidden", systems.length > 0);

  for (const system of systems) {
    const item = document.createElement("div");
    item.className = "nav-system";

    const header = document.createElement("button");
    header.type = "button";
    header.className = "nav-system-header";

    const arrow = document.createElement("span");
    arrow.className = "nav-system-arrow";
    arrow.textContent = "▸";

    const label = document.createElement("span");
    label.textContent = system.label;

    header.appendChild(arrow);
    header.appendChild(label);

    const actionsWrap = document.createElement("div");
    actionsWrap.className = "nav-system-actions hidden";
    actionsWrap.dataset.systemId = system.id;

    if (system.render) {
      system.render(actionsWrap);
    } else {
      for (const action of system.actions ?? []) {
        const actionBtn = document.createElement("button");
        actionBtn.type = "button";
        actionBtn.className = "nav-action-btn";
        actionBtn.textContent = action.label;
        actionBtn.addEventListener("click", () => action.handler());
        actionsWrap.appendChild(actionBtn);
      }
    }

    header.addEventListener("click", () => {
      const isExpanded = !actionsWrap.classList.contains("hidden");
      // Accordion: only one system open at a time within this drawer.
      navDrawer.list.querySelectorAll(".nav-system-actions").forEach((el) => el.classList.add("hidden"));
      navDrawer.list.querySelectorAll(".nav-system-arrow").forEach((el) => (el.textContent = "▸"));
      if (!isExpanded) {
        actionsWrap.classList.remove("hidden");
        arrow.textContent = "▾";
      }
    });

    item.appendChild(header);
    item.appendChild(actionsWrap);
    navDrawer.list.appendChild(item);
  }

  navDrawer.overlay.classList.remove("hidden");
}

function hideNavDrawer() {
  navDrawer.overlay.classList.add("hidden");
}

navDrawer.closeBtn.addEventListener("click", hideNavDrawer);

// ---------- Occupation ----------

function getJobLevel(jobId, levelIndex) {
  const jobDef = jobsData.find((j) => j.id === jobId);
  return jobDef ? jobDef.levels[levelIndex] : null;
}

// ---------- Occupation: Jobs ----------
//
// Main Job/Career -> Odd Jobs (automatic, summary only) -> One-Time Jobs
// (browsable, complete once) -> People (Coworkers), all inline in one
// accordion panel, mirroring renderSchoolInto's shape/section pattern
// exactly -- no separate "Manage Jobs"/"View Coworkers" modal anymore.

function renderJobsInto(container) {
  container.innerHTML = "";

  renderMainJobSection(container);
  renderOddJobsSection(container);
  renderOneTimeJobsSection(container);

  const peopleTitle = document.createElement("p");
  peopleTitle.className = "school-section-title";
  peopleTitle.textContent = "People";
  container.appendChild(peopleTitle);

  const peopleList = document.createElement("div");
  peopleList.className = "school-action-list";
  peopleList.appendChild(buildSchoolActionBtn("View Coworkers", openCoworkersModal));
  container.appendChild(peopleList);
}

function renderMainJobSection(container) {
  const title = document.createElement("p");
  title.className = "school-section-title";
  title.textContent = "Main Job / Career";
  container.appendChild(title);

  const level = character.job ? getJobLevel(character.job.jobId, character.job.levelIndex) : null;
  if (character.job && !level) {
    // character.job refers to a job/level that no longer exists in
    // jobsData -- treat that the same as unemployed rather than crashing
    // on a stale reference (matches the old modal's existing safety net).
    endCoworkerRelationships(character);
    character.job = null;
  }

  if (character.job && level) {
    const jobTitle = document.createElement("p");
    jobTitle.className = "occupation-job-title";
    jobTitle.textContent = level.title;
    const jobSalary = document.createElement("p");
    jobSalary.className = "occupation-job-salary";
    jobSalary.textContent = `${formatMoney(level.salary, character.currencyCode)} / year`;
    container.appendChild(jobTitle);
    container.appendChild(jobSalary);

    const actionList = document.createElement("div");
    actionList.className = "school-action-list";
    actionList.appendChild(buildSchoolActionBtn("Quit Job", () => requestQuitJob(container)));
    container.appendChild(actionList);
    return;
  }

  const eligible = getEligibleJobs(character, jobsData);
  if (eligible.length === 0) {
    const empty = document.createElement("p");
    empty.className = "occupation-empty";
    empty.textContent = character.age < 16 ? "You're not old enough to work yet." : "No jobs available to you right now.";
    container.appendChild(empty);
    return;
  }

  const jobList = document.createElement("div");
  jobList.className = "occupation-job-list";
  for (const job of eligible) {
    const entryLevel = job.levels[0];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "occupation-job-btn";

    const titleSpan = document.createElement("span");
    titleSpan.textContent = entryLevel.title;
    const salarySpan = document.createElement("span");
    salarySpan.className = "occupation-job-btn-salary";
    salarySpan.textContent = `${formatMoney(entryLevel.salary, character.currencyCode)}/yr`;

    btn.appendChild(titleSpan);
    btn.appendChild(salarySpan);
    btn.addEventListener("click", () => doApplyForJob(job, container));
    jobList.appendChild(btn);
  }
  container.appendChild(jobList);
}

function doApplyForJob(job, container) {
  const { succeeded, resultText } = applyForJob(character, job, namePools, character.country);
  renderGame();
  renderJobsInto(container);
  if (succeeded) refreshCareerHistoryPanel();
  autosave();
  showToast(succeeded ? `Hired as ${job.levels[0].title}!` : resultText);
}

function requestQuitJob(container) {
  const level = character.job ? getJobLevel(character.job.jobId, character.job.levelIndex) : null;
  if (!level) {
    if (character.job) endCoworkerRelationships(character);
    character.job = null;
    renderJobsInto(container);
    return;
  }
  showConfirm({
    title: "Quit your job?",
    message: `Are you sure you want to quit your job as ${level.title}?`,
    confirmLabel: "Quit",
    onConfirm: () => {
      character.job = null;
      endCoworkerRelationships(character);
      pushHistory(character, `You quit your job as ${level.title}.`);
      pushCareerEvent(character, { title: level.title, event: "quit" });
      renderJobsInto(container);
      refreshCareerHistoryPanel();
      renderGame();
      autosave();
    },
  });
}

// Odd Jobs stays a fully automatic background roll (events.js's
// pickOddJobLine, unchanged) -- this section is read-only, no buttons,
// just the running total/log that roll now maintains.
function renderOddJobsSection(container) {
  const title = document.createElement("p");
  title.className = "school-section-title";
  title.textContent = "Odd Jobs";
  container.appendChild(title);

  const { total, recent } = getOddJobsSummary(character);
  const totalLine = document.createElement("p");
  totalLine.className = "occupation-job-salary";
  totalLine.textContent =
    total > 0 ? `Lifetime earnings: ${formatMoney(total, character.currencyCode)}` : "No odd-job income yet.";
  container.appendChild(totalLine);

  for (const entry of recent) {
    const line = document.createElement("p");
    line.className = "occupation-unemployed-label";
    line.textContent = `Age ${entry.age}: ${entry.text}`;
    container.appendChild(line);
  }
}

// A browsable pool of gigs, each completable once -- resolves immediately
// for a payout (no pass/fail roll, unlike Main Job applications) and never
// reappears for this character once done.
function renderOneTimeJobsSection(container) {
  const title = document.createElement("p");
  title.className = "school-section-title";
  title.textContent = "One-Time Jobs";
  container.appendChild(title);

  const eligible = getEligibleOneTimeJobs(character, oneTimeJobsData);
  if (eligible.length === 0) {
    const empty = document.createElement("p");
    empty.className = "occupation-unemployed-label";
    empty.textContent = "No one-time opportunities available right now.";
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "school-action-list";
  for (const job of eligible) {
    list.appendChild(buildSchoolActionBtn(job.label, () => doResolveOneTimeJob(job, container)));
  }
  container.appendChild(list);
}

function doResolveOneTimeJob(job, container) {
  const line = resolveOneTimeJob(character, job);
  renderGame();
  renderJobsInto(container);
  autosave();
  showToast(line);
}

// ---------- Occupation: Career History ----------
// Read-only timeline built from character.careerHistory, the structured log
// pushCareerEvent adds alongside the existing prose history line at every
// Main Job/Career milestone (hire/promotion/quit/layoff) -- kept separate
// from the free-text history feed so this view doesn't need to pattern-match
// sentences to find job events.

// Jobs and Career History are sibling accordion panels, each rendered once
// when the Occupation drawer opens (see openNavDrawer) -- a hire/quit inside
// the already-open Jobs panel has no other way to reach Career History's
// separate container, so without this it would keep showing stale data
// until the whole drawer is closed and reopened. Only called from hire/quit
// (both happen while the drawer is open); promotions/layoffs happen during
// Age Up, which requires the drawer to already be closed.
function refreshCareerHistoryPanel() {
  const panel = navDrawer.list.querySelector('[data-system-id="career_history"]');
  if (panel) renderCareerHistoryInto(panel);
}

// Turns the flat hired/promoted/quit/laid_off event log into one card per
// stint at a given title/salary -- "hired" and "promoted" each start a new
// stint, and whatever event comes right after it (of any kind) marks when
// that stint ended; a stint with nothing after it is still ongoing, so it
// runs through to the character's current age instead. "quit"/"laid_off"
// never start a stint of their own -- they're only ever an end boundary for
// the one before them.
function buildCareerStints(character) {
  const events = character.careerHistory ?? [];
  const stints = [];
  for (let i = 0; i < events.length; i++) {
    const entry = events[i];
    if (entry.event !== "hired" && entry.event !== "promoted") continue;
    const next = events[i + 1];
    const endAge = next ? next.age : character.age;
    stints.push({ title: entry.title, salary: entry.salary, startAge: entry.age, endAge });
  }
  return stints.reverse();
}

function formatDuration(years) {
  if (years <= 0) return "Less than a year";
  return `${years} year${years === 1 ? "" : "s"}`;
}

function renderCareerHistoryInto(container) {
  container.innerHTML = "";
  const stints = buildCareerStints(character);

  if (stints.length === 0) {
    const empty = document.createElement("p");
    empty.className = "occupation-empty";
    empty.textContent = "No career history yet.";
    container.appendChild(empty);
    return;
  }

  for (const stint of stints) {
    // Entries logged before salary was added to pushCareerEvent's call sites
    // won't have one -- fall back to omitting it rather than formatMoney
    // throwing on an undefined amount.
    const salaryText = stint.salary != null ? `${formatMoney(stint.salary, character.currencyCode)}/year` : "salary not recorded";
    const meta = `${formatDuration(stint.endAge - stint.startAge)} · ${salaryText}`;
    container.appendChild(buildPersonCard({ name: stint.title, meta }));
  }
}

// ---------- Occupation: School ----------
//
// Renders directly into the accordion's expanded area, same as Family/
// Friends below, instead of a separate "View School" click-through modal
// -- the status/grade overview and Study/Clubs/Activities/Classmates/
// Teacher actions are all right there the moment School expands. Clubs/
// Activities/Classmates open their own modals on top (same stacking
// pattern as before); the NPC Profile modal opens on top for the teacher,
// reusing the exact same profile+interactions UI classmates already use.

const SCHOOL_STATUS_MESSAGES = {
  not_started: "You're not old enough for school yet.",
  graduated_hs: "You graduated high school and are taking some time before deciding what's next.",
  college: "You're off at college. (More to come here soon.)",
  workforce: "You skipped college and went straight into the workforce.",
  graduated_college: "You graduated college.",
};

function buildSchoolActionBtn(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nav-action-btn";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function renderSchoolInto(container) {
  container.innerHTML = "";
  const edu = character.education;
  const enrolled = ENROLLED_STATUSES.has(edu.status);

  const header = document.createElement("div");
  header.className = "school-header";
  const name = document.createElement("h3");
  name.className = "occupation-modal-title";
  name.textContent = enrolled ? edu.schoolName : getStatusLabel(edu.status);
  header.appendChild(name);
  if (enrolled && edu.gradeLevel != null && edu.gpa != null) {
    const gradeGpa = document.createElement("p");
    gradeGpa.className = "occupation-job-salary";
    gradeGpa.textContent = `${getGradeLabel(edu.gradeLevel)} · GPA ${edu.gpa.toFixed(2)}`;
    header.appendChild(gradeGpa);
  }
  container.appendChild(header);

  if (!enrolled) {
    const empty = document.createElement("p");
    empty.className = "occupation-unemployed-label";
    empty.textContent = SCHOOL_STATUS_MESSAGES[edu.status] ?? "Not currently in school.";
    container.appendChild(empty);
    return;
  }

  const thingsTitle = document.createElement("p");
  thingsTitle.className = "school-section-title";
  thingsTitle.textContent = "Things To Do";
  container.appendChild(thingsTitle);

  const thingsList = document.createElement("div");
  thingsList.className = "school-action-list";
  thingsList.appendChild(buildSchoolActionBtn("Study Harder", () => doStudyHarder(container)));
  thingsList.appendChild(buildSchoolActionBtn("Join a Club", openClubsModal));
  thingsList.appendChild(buildSchoolActionBtn("Join an After-School Activity", openActivitiesModal));
  container.appendChild(thingsList);

  const peopleTitle = document.createElement("p");
  peopleTitle.className = "school-section-title";
  peopleTitle.textContent = "People";
  container.appendChild(peopleTitle);

  const peopleList = document.createElement("div");
  peopleList.className = "school-action-list";
  peopleList.appendChild(buildSchoolActionBtn("View Classmates", openClassmatesModal));
  peopleList.appendChild(
    buildSchoolActionBtn("View Current Teacher", () => openNpcProfile(character.education.teacher, "teacher"))
  );
  container.appendChild(peopleList);
}

function doStudyHarder(container) {
  const line = studyHarder(character);
  renderGame();
  renderSchoolInto(container);
  autosave();
  showToast(line);
}

function buildActionCard({ name, meta, actionLabel, onAction }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "friend-hangout-btn";
  btn.textContent = actionLabel;
  btn.addEventListener("click", onAction);
  return buildPersonCard({ name, meta, action: btn });
}

// ---------- Clubs ----------

function renderClubsList() {
  clubsModal.list.innerHTML = "";
  const joinedIds = character.education.clubs ?? [];
  const joined = clubsData.filter((c) => joinedIds.includes(c.id));
  const available = getAvailableClubs(character, clubsData);

  if (joined.length === 0 && available.length === 0) {
    const empty = document.createElement("p");
    empty.className = "occupation-empty";
    empty.textContent = "No clubs available right now.";
    clubsModal.list.appendChild(empty);
    return;
  }

  for (const club of joined) {
    clubsModal.list.appendChild(
      buildActionCard({
        name: club.label,
        meta: "Joined",
        actionLabel: "Leave",
        onAction: () => {
          const line = leaveClub(character, club.id, clubsData);
          renderClubsList();
          renderGame();
          autosave();
          showToast(line);
        },
      })
    );
  }

  for (const club of available) {
    clubsModal.list.appendChild(
      buildActionCard({
        name: club.label,
        meta: `Ages ${club.minAge}-${club.maxAge}`,
        actionLabel: "Join",
        onAction: () => {
          const line = joinClub(character, club, namePools, character.country);
          renderClubsList();
          renderGame();
          autosave();
          showToast(line);
        },
      })
    );
  }
}

function openClubsModal() {
  renderClubsList();
  clubsModal.overlay.classList.remove("hidden");
}

function hideClubsModal() {
  clubsModal.overlay.classList.add("hidden");
}

clubsModal.closeBtn.addEventListener("click", hideClubsModal);

// ---------- Extracurriculars & tryouts ----------

function renderActivitiesList() {
  activitiesModal.list.innerHTML = "";
  const joinedIds = character.education.extracurriculars ?? [];
  const joined = extracurricularsData.filter((a) => joinedIds.includes(a.id));
  const available = getAvailableExtracurriculars(character, extracurricularsData);

  if (joined.length === 0 && available.length === 0) {
    const empty = document.createElement("p");
    empty.className = "occupation-empty";
    empty.textContent = "No activities available right now.";
    activitiesModal.list.appendChild(empty);
    return;
  }

  for (const activity of joined) {
    activitiesModal.list.appendChild(
      buildActionCard({
        name: activity.label,
        meta: "Joined",
        actionLabel: "Leave",
        onAction: () => {
          const line = leaveExtracurricular(character, activity.id, extracurricularsData);
          renderActivitiesList();
          renderGame();
          autosave();
          showToast(line);
        },
      })
    );
  }

  for (const activity of available) {
    activitiesModal.list.appendChild(
      buildActionCard({
        name: activity.label,
        meta: activity.tryout ? "Tryout required" : "Open enrollment",
        actionLabel: activity.tryout ? "Try Out" : "Join",
        onAction: () => {
          const { resultText } = attemptExtracurricular(character, activity);
          activitiesModal.result.textContent = resultText;
          activitiesModal.result.classList.remove("hidden");
          renderActivitiesList();
          renderGame();
          autosave();
          showToast(resultText);
        },
      })
    );
  }
}

function openActivitiesModal() {
  activitiesModal.result.classList.add("hidden");
  renderActivitiesList();
  activitiesModal.overlay.classList.remove("hidden");
}

function hideActivitiesModal() {
  activitiesModal.overlay.classList.add("hidden");
}

activitiesModal.closeBtn.addEventListener("click", hideActivitiesModal);

// ---------- Classmates ----------

// Shared meta-line builder for any list of non-family relationship NPCs
// (classmates, coworkers) -- shows the friendship tier alongside its raw
// closeness number so the tier itself is visible at a glance, not just
// buried in a number the player would have to know the thresholds for.
function buildRelationshipMeta(npc, roleLabel = null) {
  const tierLabel = FRIEND_LEVEL_LABELS[npc.friendLevel] ?? npc.friendLevel;
  const roleSegment = roleLabel ? `${roleLabel} · ` : "";
  let meta = `Age ${npc.age} · ${roleSegment}${tierLabel} (${npc.closeness})`;
  const showRomance = character.age >= MIN_DATING_AGE && npc.romanceStatus && npc.romanceStatus !== "none";
  if (showRomance) {
    meta += ` · ${ROMANCE_STATUS_LABELS[npc.romanceStatus]} (${npc.romance ?? 0})`;
  }
  return meta;
}

function renderClassmatesList() {
  ensureSocialCircle(character, namePools, character.country);
  classmatesModal.list.innerHTML = "";
  const circle = character.socialCircle ?? [];

  if (circle.length === 0) {
    const empty = document.createElement("p");
    empty.className = "occupation-empty";
    empty.textContent = "You don't have any classmates yet.";
    classmatesModal.list.appendChild(empty);
    return;
  }

  for (const npc of circle) {
    const card = buildPersonCard({ name: npc.name, meta: buildRelationshipMeta(npc, "Student") });
    card.classList.add("classmate-card");
    card.addEventListener("click", () => openNpcProfile(npc, "classmate", renderClassmatesList));
    classmatesModal.list.appendChild(card);
  }
}

function openClassmatesModal() {
  renderClassmatesList();
  classmatesModal.overlay.classList.remove("hidden");
}

function hideClassmatesModal() {
  classmatesModal.overlay.classList.add("hidden");
}

classmatesModal.closeBtn.addEventListener("click", hideClassmatesModal);

// ---------- Coworkers ----------

function renderCoworkersList() {
  if (character.job) ensureCoworkers(character, namePools, character.country);
  coworkersModal.list.innerHTML = "";
  const coworkers = character.coworkers ?? [];

  if (coworkers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "occupation-empty";
    empty.textContent = character.job ? "You don't have any coworkers yet." : "You don't have a job right now.";
    coworkersModal.list.appendChild(empty);
    return;
  }

  for (const npc of coworkers) {
    const card = buildPersonCard({ name: npc.name, meta: buildRelationshipMeta(npc, "Coworker") });
    card.classList.add("classmate-card");
    card.addEventListener("click", () => openNpcProfile(npc, "coworker", renderCoworkersList));
    coworkersModal.list.appendChild(card);
  }
}

function openCoworkersModal() {
  renderCoworkersList();
  coworkersModal.overlay.classList.remove("hidden");
}

function hideCoworkersModal() {
  coworkersModal.overlay.classList.add("hidden");
}

coworkersModal.closeBtn.addEventListener("click", () => {
  hideCoworkersModal();
  hideNavDrawer();
});

// ---------- NPC Profile (reused for classmates, coworkers, and the teacher) ----------

let currentNpcProfile = null;

// Cumulative by friendship tier -- each tier keeps everything the one
// below it had, per the interaction lists in the spec (Best Friend never
// loses something Close Friend could already do). The one gesture that
// isn't automatic is Acquaintance -> Friend itself: everything else above
// that is reached by closeness crossing a threshold (see
// maybeTierUpFriendship in npc.js), not by asking again.
function getNpcInteractions(npc, kind) {
  if (kind === "teacher") {
    return [
      { label: "Talk", run: () => talk(character, npc) },
      { label: "Ask for Help", run: () => askForHelp(character, npc) },
      { label: "Thank Teacher", run: () => thankTeacher(character, npc) },
    ];
  }

  // Family keeps its own closeness-based relationship model, never the
  // Acquaintance -> Friend hierarchy below -- so this never falls through
  // to the friendLevel-driven branch, and never offers Ask to Become
  // Friends / Develop Romance / Ask Out.
  if (kind === "family") {
    const familyInteractions = [
      { label: "Talk", run: () => talk(character, npc) },
      { label: "Hang Out", run: () => hangOut(character, npc) },
      { label: "Give Gift", run: () => giveGift(character, npc) },
      { label: "Ask for Help", run: () => askFamilyForHelp(character, npc) },
    ];
    // Borrowing real money follows the same MIN_EARNING_AGE convention every
    // other personal-money system in the game respects (see character.js) --
    // a young child shouldn't be able to pocket cash this way.
    if (character.age >= MIN_EARNING_AGE) {
      familyInteractions.push({ label: "Borrow Money", run: () => borrowMoney(character, npc) });
    }
    return familyInteractions;
  }

  const interactions = [{ label: "Talk", run: () => talk(character, npc) }];

  if (npc.friendLevel === "acquaintance") {
    interactions.push({ label: "Get to Know", run: () => getToKnow(character, npc) });
    interactions.push({ label: "Ask to Become Friends", run: () => askToBecomeFriends(character, npc) });
    return interactions;
  }

  interactions.push({ label: "Hang Out", run: () => hangOut(character, npc) });
  interactions.push({ label: "Give Gift", run: () => giveGift(character, npc) });
  interactions.push({ label: "Ask for Help", run: () => askForHelp(character, npc) });

  if (npc.friendLevel === "close_friend" || npc.friendLevel === "best_friend") {
    interactions.push({ label: "Confide", run: () => confide(character, npc) });
  }

  if (character.age >= MIN_DATING_AGE && canRomanticallyMatch(character, npc)) {
    if (npc.romanceStatus === "none") {
      interactions.push({ label: "Develop Romance", run: () => developRomance(character, npc) });
    } else if (npc.romanceStatus === "crush") {
      interactions.push({ label: "Ask Out", run: () => askOut(character, npc).resultText });
    }
  }

  return interactions;
}

const FRIEND_LEVEL_LABELS = {
  acquaintance: "Acquaintance",
  friend: "Friend",
  close_friend: "Close Friend",
  best_friend: "Best Friend",
};

const ROMANCE_STATUS_LABELS = {
  crush: "Crush",
  dating: "Dating",
  partner: "Partner",
};

function renderNpcProfile() {
  if (!currentNpcProfile) return;
  const { npc, kind } = currentNpcProfile;
  const isFamily = kind === "family";
  const stage = getLifeStage(npc.age);
  npcProfileModal.portrait.textContent = kind === "teacher" ? "🧑‍🏫" : stage.emoji;
  npcProfileModal.name.textContent = npc.name;
  const roleLabel = kind === "teacher" ? `${npc.subject} Teacher` : kind === "coworker" ? "Coworker" : kind === "classmate" ? "Student" : isFamily ? familyRoleLabel(npc) : "";
  const tierSuffix = kind === "teacher" || isFamily ? "" : ` · ${FRIEND_LEVEL_LABELS[npc.friendLevel] ?? npc.friendLevel}`;
  const metaLine = [`Age ${npc.age}`, roleLabel].filter(Boolean).join(" · ") + tierSuffix;
  npcProfileModal.meta.textContent = metaLine;

  // Family members don't carry a stats block (a lighter shape than
  // social-circle NPCs, by design -- see character.js) -- hide the whole
  // section rather than rendering broken/empty bars for it.
  npcProfileModal.barsWrap.classList.toggle("hidden", isFamily);
  if (!isFamily) renderStatBars(npc.stats, npcProfileModal.bars);

  // Occupation only makes sense for a parent (siblings/guardians' siblings
  // have no employed/job fields at all).
  const showOccupation = isFamily && "role" in npc;
  npcProfileModal.occupationRow.classList.toggle("hidden", !showOccupation);
  if (showOccupation) {
    npcProfileModal.occupationValue.textContent = npc.employed ? `Works as ${npc.job}` : "Unemployed";
  }

  // Family's closeness already reads correctly through this same field --
  // just relabel it since "Friendship" doesn't quite fit a parent/sibling.
  npcProfileModal.friendshipLabel.textContent = isFamily ? "Closeness" : "Friendship";
  npcProfileModal.friendshipValue.textContent = npc.closeness;

  // Mirrors the exact gate getNpcInteractions uses to decide whether
  // Develop Romance/Ask Out are even offered -- acquaintances and orientation
  // mismatches never reach that romance branch, so the row shouldn't claim a
  // "Romance: 0" that no interaction could ever move.
  const showRomance =
    (kind === "classmate" || kind === "coworker" || kind === "friend") &&
    npc.friendLevel !== "acquaintance" &&
    character.age >= MIN_DATING_AGE &&
    canRomanticallyMatch(character, npc);
  npcProfileModal.romanceRow.classList.toggle("hidden", !showRomance);
  if (showRomance) {
    npcProfileModal.romanceValue.textContent =
      npc.romanceStatus && npc.romanceStatus !== "none"
        ? `${ROMANCE_STATUS_LABELS[npc.romanceStatus]} (${npc.romance ?? 0})`
        : npc.romance ?? 0;
  }

  npcProfileModal.interactions.innerHTML = "";
  for (const interaction of getNpcInteractions(npc, kind)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "event-choice-btn";
    btn.textContent = interaction.label;
    btn.addEventListener("click", () => {
      const line = interaction.run();
      renderGame();
      renderNpcProfile();
      currentNpcProfile?.onUpdate?.();
      autosave();
      showToast(line);
    });
    npcProfileModal.interactions.appendChild(btn);
  }
}

// Family lists (and Friends' 4-way split) are inline accordion content with
// no persistent container reference the way classmatesModal.list/
// coworkersModal.list have -- onUpdate lets the caller supply its own
// "re-render whatever list is showing this NPC" callback so a closeness
// change made from inside the profile is reflected there too.
function openNpcProfile(npc, kind, onUpdate) {
  if (!npc) return;
  currentNpcProfile = { npc, kind, onUpdate };
  renderNpcProfile();
  npcProfileModal.overlay.classList.remove("hidden");
}

function hideNpcProfileModal() {
  npcProfileModal.overlay.classList.add("hidden");
  currentNpcProfile = null;
}

npcProfileModal.closeBtn.addEventListener("click", hideNpcProfileModal);

// ---------- Finance ----------

function renderFinanceOverview() {
  financeModal.balanceAmount.textContent = formatMoney(character.money, character.currencyCode);

  const level = character.job ? getJobLevel(character.job.jobId, character.job.levelIndex) : null;
  if (level) {
    financeModal.incomeTitle.textContent = level.title;
    financeModal.incomeSalary.textContent = `${formatMoney(level.salary, character.currencyCode)} / year`;
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

financeModal.closeBtn.addEventListener("click", () => {
  hideFinanceOverview();
  hideNavDrawer();
});

// ---------- Relationships: Friends & Family ----------
//
// Both render directly into the accordion's expanded area (no separate
// "View Friends"/"View Family" click-through) so the list is right there
// the moment the section opens.

function renderComingSoon(container) {
  container.innerHTML = "";
  const message = document.createElement("p");
  message.className = "occupation-unemployed-label";
  message.textContent = "Coming soon.";
  container.appendChild(message);
}

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

// Friends is one unified list of the whole social circle -- Acquaintance /
// Friend / Close Friend / Best Friend / Romantic Interest are all shown as
// the NPC's own relationship level (via buildRelationshipMeta), not split
// into separate nav sections. No quick-action button on the card itself;
// every interaction (including Hang Out) lives inside the NPC profile so
// there's exactly one place bonding actions happen.
function renderFriendsInto(container) {
  ensureSocialCircle(character, namePools, character.country);
  container.innerHTML = "";
  const npcs = character.socialCircle ?? [];

  if (npcs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "occupation-unemployed-label";
    empty.textContent = "You don't have any friends yet.";
    container.appendChild(empty);
    return;
  }

  for (const npc of npcs) {
    const card = buildPersonCard({ name: npc.name, meta: buildRelationshipMeta(npc) });
    card.classList.add("classmate-card");
    card.addEventListener("click", () => openNpcProfile(npc, "friend", () => renderFriendsInto(container)));
    container.appendChild(card);
  }
}

// A partner is just whichever NPC(s) reached romanceStatus "partner" via
// the normal Develop Romance -> Ask Out -> partner progression (npc.js) --
// no separate data model, this only searches the same social circle/
// coworker lists Friends and Coworkers already read from. Checks coworkers
// too, and labels a partner met at work "Coworker" rather than the
// generic Friend-tier label, purely cosmetic (getNpcInteractions doesn't
// branch on it) -- same interactions either way.
function renderPartnerInto(container) {
  container.innerHTML = "";
  const partners = [
    ...(character.socialCircle ?? []).map((npc) => ({ npc, kind: "friend" })),
    ...(character.coworkers ?? []).map((npc) => ({ npc, kind: "coworker" })),
  ].filter(({ npc }) => npc.romanceStatus === "partner");

  if (partners.length === 0) {
    const empty = document.createElement("p");
    empty.className = "occupation-unemployed-label";
    empty.textContent = "You don't have a partner right now.";
    container.appendChild(empty);
    return;
  }

  for (const { npc, kind } of partners) {
    const card = buildPersonCard({ name: npc.name, meta: buildRelationshipMeta(npc) });
    card.classList.add("classmate-card");
    card.addEventListener("click", () => openNpcProfile(npc, kind, () => renderPartnerInto(container)));
    container.appendChild(card);
  }
}

function parentRelationLabel(parent) {
  if (parent.role === "guardian") {
    const relation = parent.guardianRelation ?? "guardian";
    return relation.charAt(0).toUpperCase() + relation.slice(1);
  }
  const base = parent.role.charAt(0).toUpperCase() + parent.role.slice(1);
  return parent.relationshipType === "step" ? `Step${parent.role}` : base;
}

// Shared by the NPC profile modal (renderNpcProfile) and the Family list
// itself -- "role" in npc distinguishes a parent/guardian record (which
// has one) from a sibling record (which doesn't).
function familyRoleLabel(npc) {
  return "role" in npc ? parentRelationLabel(npc) : "Sibling";
}

function renderFamilyListInto(container) {
  container.innerHTML = "";
  const parents = character.family?.parents ?? [];
  const siblings = character.family?.siblings ?? [];

  if (parents.length === 0 && siblings.length === 0) {
    const empty = document.createElement("p");
    empty.className = "occupation-unemployed-label";
    empty.textContent = "You don't have any family on record.";
    container.appendChild(empty);
    return;
  }

  if (parents.length > 0) {
    const title = document.createElement("p");
    title.className = "school-section-title";
    title.textContent = "Parents";
    container.appendChild(title);
    for (const member of parents) appendFamilyCard(container, member);
  }

  if (siblings.length > 0) {
    const title = document.createElement("p");
    title.className = "school-section-title";
    title.textContent = "Siblings";
    container.appendChild(title);
    for (const member of siblings) appendFamilyCard(container, member);
  }
}

function appendFamilyCard(container, member) {
  member.closeness ??= 60;
  const isParent = "role" in member;
  const relationLabel = familyRoleLabel(member);
  const jobText = isParent ? (member.employed ? `works as ${member.job}` : "unemployed") : null;
  const meta = isParent
    ? `${relationLabel} · Age ${member.age} · Closeness ${member.closeness} · ${jobText}`
    : `${relationLabel} · Age ${member.age} · Closeness ${member.closeness}`;

  const hangoutBtn = document.createElement("button");
  hangoutBtn.type = "button";
  hangoutBtn.className = "friend-hangout-btn";
  hangoutBtn.textContent = "Hang Out";
  hangoutBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    hangOut(character, member);
    renderFamilyListInto(container);
    renderGame();
    autosave();
  });

  const card = buildPersonCard({ name: member.name, meta, action: hangoutBtn });
  card.classList.add("classmate-card");
  card.addEventListener("click", () => openNpcProfile(member, "family", () => renderFamilyListInto(container)));
  container.appendChild(card);
}

function openProfile() {
  if (!character) return;
  const stage = getLifeStage(character.age);
  profileModal.portrait.textContent = stage.emoji;
  profileModal.name.textContent = character.name;
  profileModal.stage.textContent = `Age ${character.age} · ${stage.label}`;
  profileModal.birthDate.textContent = character.birthDate ? formatBirthDate(character.birthDate) : "Unknown";
  profileModal.zodiac.textContent = character.zodiacSign ?? "Unknown";
  const dominantTraits = getDominantTraits(character);
  profileModal.personality.textContent = dominantTraits.length ? dominantTraits.join(", ") : "Unknown";
  profileModal.genderIdentitySelect.value = character.genderIdentity ?? "male";
  profileModal.attractionSelect.value = attractionIdFor(character.attractedTo);
  profileModal.overlay.classList.remove("hidden");
}

function hideProfile() {
  profileModal.overlay.classList.add("hidden");
}

// Both selects write straight through on change, same low-friction pattern
// as the theme toggle -- no separate save button. Changing attraction never
// touches any existing NPC's romanceStatus (canRomanticallyMatch only gates
// *new* romantic interactions going forward, in npc.js), so an existing
// partner who wouldn't match under the new value stays exactly as they are.
profileModal.genderIdentitySelect.addEventListener("change", () => {
  if (!character) return;
  character.genderIdentity = profileModal.genderIdentitySelect.value;
  autosave();
});

profileModal.attractionSelect.addEventListener("change", () => {
  if (!character) return;
  character.attractedTo = resolveAttractedTo(profileModal.attractionSelect.value);
  autosave();
});

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
  [
    countries,
    wealthTiers,
    birthCircumstances,
    familyStructures,
    namePools,
    jobsData,
    oneTimeJobsData,
    ageUpEvents,
    npcUpdates,
    worldUpdates,
    oddJobsData,
    celebrities,
    clubsData,
    extracurricularsData,
  ] = await Promise.all([
    loadCountries(),
    loadWealthTiers(),
    loadBirthCircumstances(),
    loadFamilyStructures(),
    loadNamePools(),
    loadJobs(),
    loadOneTimeJobs(),
    loadAgeUpEvents(),
    loadNpcUpdates(),
    loadWorldUpdates(),
    loadOddJobs(),
    loadCelebrities(),
    loadClubs(),
    loadExtracurriculars(),
  ]);

  populateCountrySelect();
  populateIdentitySelects();
  wireCreationScreen();
  initSettings();

  const { character: savedCharacter, lifeId, corrupted } = loadActiveCharacter();
  if (corrupted) showToast("Your previous save couldn't be loaded. Starting fresh.");

  if (savedCharacter) {
    // Returning player with an active life: go straight into gameplay.
    character = savedCharacter;
    activeLifeId = lifeId;
    const locationChanged = ensureBirthLocation(character, countries);
    const personalityChanged = ensurePersonality(character);
    if (locationChanged || personalityChanged) {
      saveCharacter(activeLifeId, character);
    }
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
