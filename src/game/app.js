import { createCharacter, generateRandomName, getLifeStage, randInt, formatBirthDate } from "./character.js";
import { ageUp } from "./engine.js";
import { applyChoice, getEligibleChoices, rollAgeUpHappening } from "./events.js";
import { ensureSocialCircle, talk, hangOut, giveGift, developRomance, askOut, askForHelp, thankTeacher } from "./npc.js";
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
  loadAgeUpEvents,
  loadNpcUpdates,
  loadWorldUpdates,
  loadClubs,
  loadExtracurriculars,
} from "./data.js";
import { listLives, loadActiveCharacter, saveCharacter, createLife, setActiveLife, deleteLife } from "./save.js";

const MAX_FEED_ENTRIES = 6;

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
    { id: "school", label: "School", actions: [{ label: "View School", handler: () => openSchoolModal() }] },
    { id: "jobs", label: "Jobs", actions: [{ label: "Manage Jobs", handler: () => openOccupationModal() }] },
    { id: "special_careers", label: "Special Careers", render: renderComingSoon },
    { id: "career_history", label: "Career History", render: renderComingSoon },
  ],
  Relationships: [
    { id: "family", label: "Family", render: (container) => renderFamilyListInto(container) },
    { id: "friends", label: "Friends", render: (container) => renderFriendsListInto(container) },
    { id: "partner", label: "Partner", render: renderComingSoon },
    { id: "children", label: "Children", render: renderComingSoon },
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
let ageUpEvents = [];
let npcUpdates = [];
let worldUpdates = [];
let clubsData = [];
let extracurricularsData = [];
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
  closeBtn: document.getElementById("occupation-modal-close"),
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

const schoolModal = {
  overlay: document.getElementById("school-modal-overlay"),
  name: document.getElementById("school-name"),
  gradeGpa: document.getElementById("school-grade-gpa"),
  emptyText: document.getElementById("school-empty-text"),
  contentView: document.getElementById("school-content-view"),
  studyBtn: document.getElementById("school-study-btn"),
  clubsBtn: document.getElementById("school-clubs-btn"),
  activitiesBtn: document.getElementById("school-activities-btn"),
  classmatesBtn: document.getElementById("school-classmates-btn"),
  teacherBtn: document.getElementById("school-teacher-btn"),
  closeBtn: document.getElementById("school-modal-close"),
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

const npcProfileModal = {
  overlay: document.getElementById("npc-profile-modal-overlay"),
  portrait: document.getElementById("npc-profile-portrait"),
  name: document.getElementById("npc-profile-name"),
  meta: document.getElementById("npc-profile-meta"),
  bars: {
    health: document.getElementById("npc-profile-bar-health"),
    happiness: document.getElementById("npc-profile-bar-happiness"),
    smarts: document.getElementById("npc-profile-bar-smarts"),
    looks: document.getElementById("npc-profile-bar-looks"),
    fame: document.getElementById("npc-profile-bar-fame"),
    reputation: document.getElementById("npc-profile-bar-reputation"),
  },
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
  game.money.textContent = `$${character.money.toLocaleString()}`;

  renderStatBars(character.stats, game.bars);

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
  ageUp(character, jobsData, namePools, character.country);

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
occupationModal.closeBtn.addEventListener("click", () => {
  hideOccupationModal();
  hideNavDrawer();
});

// ---------- Occupation: School ----------
//
// Overview -> Things To Do (Study/Clubs/Activities) + People (Classmates/
// Teacher). Clubs/Activities/Classmates open on top of the overview;
// the NPC Profile modal opens on top of either Classmates or the overview
// directly (for the teacher), reusing the exact same profile+interactions
// UI in both cases so classmates and the teacher aren't two parallel
// person-detail systems.

const SCHOOL_STATUS_MESSAGES = {
  not_started: "You're not old enough for school yet.",
  graduated_hs: "You graduated high school and are taking some time before deciding what's next.",
  college: "You're off at college. (More to come here soon.)",
  workforce: "You skipped college and went straight into the workforce.",
  graduated_college: "You graduated college.",
};

const ENROLLED_STATUSES = new Set(["elementary", "middle", "high_school"]);
const CLASSMATE_ROMANCE_MIN_AGE = 12;

function renderSchoolModal() {
  const edu = character.education;
  const enrolled = ENROLLED_STATUSES.has(edu.status);

  schoolModal.name.textContent = enrolled ? edu.schoolName : getStatusLabel(edu.status);
  schoolModal.gradeGpa.textContent =
    enrolled && edu.gradeLevel != null && edu.gpa != null ? `${getGradeLabel(edu.gradeLevel)} · GPA ${edu.gpa.toFixed(2)}` : "";

  schoolModal.contentView.classList.toggle("hidden", !enrolled);
  schoolModal.emptyText.classList.toggle("hidden", enrolled);
  if (!enrolled) {
    schoolModal.emptyText.textContent = SCHOOL_STATUS_MESSAGES[edu.status] ?? "Not currently in school.";
  }
}

function openSchoolModal() {
  if (!character) return;
  renderSchoolModal();
  schoolModal.overlay.classList.remove("hidden");
}

function hideSchoolModal() {
  schoolModal.overlay.classList.add("hidden");
}

function doStudyHarder() {
  const line = studyHarder(character);
  renderGame();
  renderSchoolModal();
  autosave();
  showToast(line);
}

schoolModal.studyBtn.addEventListener("click", doStudyHarder);
schoolModal.clubsBtn.addEventListener("click", openClubsModal);
schoolModal.activitiesBtn.addEventListener("click", openActivitiesModal);
schoolModal.classmatesBtn.addEventListener("click", openClassmatesModal);
schoolModal.teacherBtn.addEventListener("click", () => openNpcProfile(character.education.teacher, "teacher"));
schoolModal.closeBtn.addEventListener("click", () => {
  hideSchoolModal();
  hideNavDrawer();
});

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

  const showRomance = character.age >= CLASSMATE_ROMANCE_MIN_AGE;

  for (const npc of circle) {
    const meta = showRomance
      ? `Age ${npc.age} · Student · Friendship ${npc.closeness} · Romance ${npc.romance ?? 0}`
      : `Age ${npc.age} · Student · Friendship ${npc.closeness}`;
    const card = buildPersonCard({ name: npc.name, meta });
    card.classList.add("classmate-card");
    card.addEventListener("click", () => openNpcProfile(npc, "classmate"));
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

// ---------- NPC Profile (reused for classmates and the teacher) ----------

let currentNpcProfile = null;

function getNpcInteractions(npc, kind) {
  if (kind === "teacher") {
    return [
      { label: "Talk", run: () => talk(character, npc) },
      { label: "Ask for Help", run: () => askForHelp(character, npc) },
      { label: "Thank Teacher", run: () => thankTeacher(character, npc) },
    ];
  }

  const interactions = [
    { label: "Talk", run: () => talk(character, npc) },
    { label: "Hang Out", run: () => hangOut(character, npc) },
  ];
  if (npc.closeness < 40) {
    interactions.push({ label: "Make Friends", run: () => hangOut(character, npc) });
  }
  interactions.push({ label: "Give Gift", run: () => giveGift(character, npc) });
  interactions.push({ label: "Ask for Help", run: () => askForHelp(character, npc) });

  if (character.age >= CLASSMATE_ROMANCE_MIN_AGE) {
    if (npc.type === "friend" && npc.closeness >= 40) {
      interactions.push({ label: "Develop Romance", run: () => developRomance(character, npc) });
    }
    if (npc.type === "crush") {
      interactions.push({ label: "Ask Out", run: () => askOut(character, npc).resultText });
    }
  }

  return interactions;
}

function renderNpcProfile() {
  if (!currentNpcProfile) return;
  const { npc, kind } = currentNpcProfile;
  const stage = getLifeStage(npc.age);
  npcProfileModal.portrait.textContent = kind === "teacher" ? "🧑‍🏫" : stage.emoji;
  npcProfileModal.name.textContent = npc.name;
  npcProfileModal.meta.textContent =
    kind === "teacher" ? `Age ${npc.age} · ${npc.subject} Teacher` : `Age ${npc.age} · Student`;

  renderStatBars(npc.stats, npcProfileModal.bars);

  npcProfileModal.friendshipValue.textContent = npc.closeness;

  const showRomance = kind === "classmate" && character.age >= CLASSMATE_ROMANCE_MIN_AGE;
  npcProfileModal.romanceRow.classList.toggle("hidden", !showRomance);
  if (showRomance) npcProfileModal.romanceValue.textContent = npc.romance ?? 0;

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
      if (kind === "classmate" && !classmatesModal.overlay.classList.contains("hidden")) {
        renderClassmatesList();
      }
      autosave();
      showToast(line);
    });
    npcProfileModal.interactions.appendChild(btn);
  }
}

function openNpcProfile(npc, kind) {
  if (!npc) return;
  currentNpcProfile = { npc, kind };
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

financeModal.closeBtn.addEventListener("click", () => {
  hideFinanceOverview();
  hideNavDrawer();
});

// ---------- Relationships: Friends & Family ----------
//
// Both render directly into the accordion's expanded area (no separate
// "View Friends"/"View Family" click-through) so the list is right there
// the moment the section opens.

const SOCIAL_TYPE_LABELS = { friend: "Friend", crush: "Crush", romantic_interest: "Romantic Interest" };

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

function renderFriendsListInto(container) {
  ensureSocialCircle(character, namePools, character.country);
  container.innerHTML = "";
  const circle = character.socialCircle ?? [];

  if (circle.length === 0) {
    const empty = document.createElement("p");
    empty.className = "occupation-unemployed-label";
    empty.textContent = "You don't have anyone in your circle yet.";
    container.appendChild(empty);
    return;
  }

  for (const npc of circle) {
    const hangoutBtn = document.createElement("button");
    hangoutBtn.type = "button";
    hangoutBtn.className = "friend-hangout-btn";
    hangoutBtn.textContent = "Hang Out";
    hangoutBtn.addEventListener("click", () => hangOutWithFriend(npc.id, container));

    const meta = `${SOCIAL_TYPE_LABELS[npc.type] ?? npc.type} · Closeness ${npc.closeness}`;
    container.appendChild(buildPersonCard({ name: npc.name, meta, action: hangoutBtn }));
  }
}

function hangOutWithFriend(npcId, container) {
  const npc = (character.socialCircle ?? []).find((n) => n.id === npcId);
  if (!npc) return;
  hangOut(character, npc);
  renderFriendsListInto(container);
  renderGame();
  autosave();
}

function parentRelationLabel(parent) {
  if (parent.role === "guardian") {
    const relation = parent.guardianRelation ?? "guardian";
    return relation.charAt(0).toUpperCase() + relation.slice(1);
  }
  const base = parent.role.charAt(0).toUpperCase() + parent.role.slice(1);
  return parent.relationshipType === "step" ? `Step${parent.role}` : base;
}

function renderFamilyListInto(container) {
  container.innerHTML = "";
  const members = [...(character.family?.parents ?? []), ...(character.family?.siblings ?? [])];

  for (const member of members) {
    const isParent = "role" in member;
    const jobText = isParent ? (member.employed ? `works as ${member.job}` : "unemployed") : null;
    const relationLabel = isParent ? parentRelationLabel(member) : "Sibling";
    const meta = isParent
      ? `${relationLabel} · Age ${member.age} · Closeness ${member.closeness} · ${jobText}`
      : `${relationLabel} · Age ${member.age} · Closeness ${member.closeness}`;

    const hangoutBtn = document.createElement("button");
    hangoutBtn.type = "button";
    hangoutBtn.className = "friend-hangout-btn";
    hangoutBtn.textContent = "Hang Out";
    hangoutBtn.addEventListener("click", () => hangOutWithFamilyMember(member, container));

    container.appendChild(buildPersonCard({ name: member.name, meta, action: hangoutBtn }));
  }
}

function hangOutWithFamilyMember(member, container) {
  member.closeness ??= 60;
  hangOut(character, member);
  renderFamilyListInto(container);
  renderGame();
  autosave();
}

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
  [countries, wealthTiers, birthCircumstances, familyStructures, namePools, jobsData, ageUpEvents, npcUpdates, worldUpdates, clubsData, extracurricularsData] =
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
      loadClubs(),
      loadExtracurriculars(),
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
