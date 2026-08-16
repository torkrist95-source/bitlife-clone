// Single source of truth for the game's version. Imported normally for
// display (game header, Settings -> Game); also re-fetched as raw TEXT
// (not re-imported as a module) by app.js's checkForUpdates, which parses
// this same constant back out with a regex. That's what makes the network
// copy meaningful to compare against: a fresh fetch reflects whatever is
// actually deployed right now, while the already-loaded page only knows
// the value it was built with -- re-importing the module would just
// return the cached copy already in memory, defeating the check.
const GAME_VERSION = "1.0.0";

export { GAME_VERSION };
