import { createCharacter, getLifeStage } from "./character.js";
import { ageUp } from "./engine.js";

const character = createCharacter();

const el = {
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

function render() {
  const stage = getLifeStage(character.age);
  el.portrait.textContent = stage.emoji;
  el.name.textContent = character.name;
  el.age.textContent = `Age ${character.age} · ${stage.label}`;
  el.money.textContent = `$${character.money.toLocaleString()}`;

  for (const [stat, value] of Object.entries(character.stats)) {
    const bar = el.bars[stat];
    if (bar) bar.style.width = `${value}%`;
  }

  el.feed.innerHTML = "";
  for (const line of character.history) {
    const entry = document.createElement("div");
    entry.className = "feed-entry";
    entry.textContent = line;
    el.feed.appendChild(entry);
  }
  el.feed.scrollTop = el.feed.scrollHeight;
}

el.ageBtn.addEventListener("click", () => {
  ageUp(character);
  render();
});

el.navBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    alert(`${btn.dataset.label} is coming soon.`);
  });
});

render();
