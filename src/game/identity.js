// Gender identity is a separate, freely-editable label from the mechanical
// `gender` field on character.js (which still drives name-pool selection
// and stays exactly as it is) -- see PROJECT_PLAN.md's Sexuality section:
// "sexualOrientation != gender / gender identity". A small fixed list
// rather than a data file, same reasoning as personality.js's trait list:
// it doesn't grow per-player and doesn't need async loading. Purely
// identity/flavor for now, the same way Zodiac is -- no mechanical effects
// elsewhere yet, but a foundation later features (avatar/pronoun
// customization) can build on without changing this shape.
const GENDER_IDENTITIES = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "trans_male", label: "Transgender Male" },
  { id: "trans_female", label: "Transgender Female" },
  { id: "non_binary", label: "Non-Binary" },
  { id: "genderfluid", label: "Genderfluid" },
  { id: "genderqueer", label: "Genderqueer" },
  { id: "agender", label: "Agender" },
  { id: "questioning", label: "Questioning" },
  { id: "other", label: "Other" },
];

// Who the character is attracted to -- the same three options offered at
// character creation (index.html), reused here so the player can revisit
// the choice later in life (coming out, at any age) rather than it being
// locked in permanently at birth. Mechanically meaningful, unlike gender
// identity above: this is what npc.js's canRomanticallyMatch filters on.
const ATTRACTION_OPTIONS = [
  { id: "male", label: "Men" },
  { id: "female", label: "Women" },
  { id: "both", label: "Both" },
];

function resolveAttractedTo(attractionId) {
  return attractionId === "both" ? ["male", "female"] : [attractionId];
}

// Inverse of resolveAttractedTo -- collapses the stored array back to
// whichever option a select should show as chosen. Falls back to "both"
// for any shape that isn't a clean single male/female pick, rather than
// leaving the control showing nothing selected.
function attractionIdFor(attractedTo) {
  if (Array.isArray(attractedTo) && attractedTo.length === 1) {
    if (attractedTo[0] === "male" || attractedTo[0] === "female") return attractedTo[0];
  }
  return "both";
}

export { GENDER_IDENTITIES, ATTRACTION_OPTIONS, resolveAttractedTo, attractionIdFor };
