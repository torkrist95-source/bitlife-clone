# Life Sim (BitLife-style) — Project Plan

A personal clone of BitLife, built as a web app and hosted online so it runs on both your computer and your iPhone from one codebase. Not for publishing — just for fun, so it's fine to keep scope small and expand over time.

## Tech Stack

- **Plain web app (PWA)** — HTML/CSS/JS, no Electron. Runs in any browser: your desktop browser now, and Safari on your iPhone once it's hosted somewhere reachable. Add a web manifest + service worker so it can be "installed" to the iPhone Home Screen and opens full-screen like a real app, no App Store needed
- **Frontend**: plain HTML/CSS/JS to start. Don't reach for React/Vue until the core loop works — it just adds build tooling you don't need yet
- **Data**: JSON files for event content (fetched by the app), character save state stored in the browser via `localStorage` or `IndexedDB` instead of a filesystem save file — this is what makes saves work identically on desktop and iPhone
- **No backend/server logic needed** — it's a static app; the only "server" involved is whatever serves the files to your phone (see hosting note below)

## Hosting & Deployment

**GitHub Pages** is the simplest free option and pairs naturally with the git repo you're already going to init on day one — no separate account or service to set up beyond GitHub itself:
- Push the repo to GitHub, then flip on Pages in the repo's Settings → Pages (deploy from the `main` branch). The site goes live at `https://yourusername.github.io/repo-name/`
- HTTPS is automatic, which PWA install-to-Home-Screen requires anyway
- Every future `git push` updates the live site — Claude Code can push a change and it's playable on your phone within a minute or two

**Privacy note:** free static hosts like this serve a publicly-reachable URL — anyone with the link can open it. It won't be indexed or discoverable unless you share it or link to it somewhere public, but it isn't password-protected either. For a personal life-sim game that's low-stakes, but worth knowing. If you ever want an actual access gate, Cloudflare Pages has a free "Access" feature that can require a login before the page loads — a bigger setup than you likely need to start.

**Save data note:** since character saves live in the browser's local storage (not a server or account), a save made on your iPhone stays on your iPhone, and a save made on desktop Chrome stays there — they won't sync between devices unless a sync system gets added later. Worth knowing going in so a "missing" save on a different device doesn't seem like a bug.

## Core Concepts

**Character object** — the single source of truth for game state:
- Stats: health, happiness, smarts, looks, money, karma (0–100 scale works well)
- Age, life stage (infant / child / teenager / young adult / adult / middle-aged / elderly — see Aging & Appearance System below)
- Appearance: hair color, grayness, cosmetic procedure history (see Aging & Appearance System below)
- Flags: education level, job title, relationship status, criminal record, etc.
- History log: array of strings, one line per year, shown as the life summary

**Game loop** — turn-based by year:
1. Player clicks "Age Up"
2. Age +1, apply small passive stat drift (health/happiness decay slowly with age, etc.)
3. Check life-stage transitions (e.g. age 5 → school starts, age 18 → can work/drink/vote; each life-stage boundary also swaps the avatar — see Aging & Appearance System below)
4. Roll for random events eligible at this age/stat/flag combination
5. Display results, update history log

**Event system** — this is the heart of the game, keep it data-driven. Events have two trigger types, both running through the same engine and JSON schema:
- **Age-up events** — rolled once per year on the Age button, from the age-bracket pools (`childhood.json`, `teen.json`, `adult.json`)
- **Activity events** — rolled when the player picks an activity from the menu (vacation, gym, date night, etc.), from that activity's own pool. An activity click first applies its small guaranteed base effect (e.g. vacation always costs some money and gives a happiness bump), then rolls a chance for a special sub-event on top — that's where "your flight gets cancelled" or "you meet someone at the resort" comes from, complete with its own choices
- Events live in JSON files, not hardcoded in JS, regardless of trigger type
- Each event: `id`, `trigger` (`age_up`, `activity:<id>`, or `relationship:<id>`), `conditions` (age range, required flags/stat thresholds, and optionally `requires_memory_tag` to gate on an NPC's past history — see Relationships & Memories below), `text`, `choices[]`
- Each choice: `label`, `effects` (stat deltas *and* personality trait deltas — see Personality System below — plus flags to set), optional `memory` (records a new entry in the relevant NPC's memory log), optional `next_event` for chains — this is how a vacation event can branch into a follow-up (e.g. accept the stranger's invite → a second event next year referencing it)
- Weighted random selection so rare/dramatic events show up less often, independently tuned per activity (vacation might have a 30% chance of a sub-event, a doctor visit maybe 10%)

**Activities menu** — things the player can trigger anytime at the current life stage (job search, dating, doctor visit, crime, shopping/assets, vacation). Each activity is a base effect plus a chance at its own random event, per the trigger system above.

**NPCs** — not just static labels. Each NPC quietly lives their own life in the background and surfaces updates to the player. Full design below.

## Character Creation

Right now a new life starts as a full random roll. Adding a few deliberate choices up front, BitLife-style, without turning it into a full character builder:

**At the start of a new life, the player picks:**
- **Country of birth** — from a shared country pool (`/data/world/countries.json` — the same list Vacation and Relocation events use), setting a starting cost-of-living baseline and some light cultural flavor text
- **Gender** — feeds the avatar variant chosen in the Aging & Appearance System below
- Everything else — name, starting stats, personality traits, Looks, family — stays randomized, keeping the "roll a life and see what you get" spirit rather than turning this into a full builder

**Family wealth tier** — rolled, not chosen, at birth: Poor / Working-Class / Middle-Class / Wealthy. This sets:
- The starting home the character's family lives in
- Parents' starting jobs and rough income (affects how much financial help, if any, they can offer later — college costs, a car at 16, an eventual inheritance)
- A small starting-money nudge for the player character themselves

**Content additions:**
- `/data/world/countries.json` — a shared list used by Character Creation, Vacation, and relationship-relocation events (see the note in Vacation System about consolidating from the earlier vacation-only file)
- `/data/character_creation/wealth_tiers.json` — the four tiers and what each grants

## Aging & Appearance System

**Refined life stages** (giving the life-stage flag from Core Concepts more granularity):
- Infant: 0–4
- Child: 5–12
- Teenager: 13–17
- Young Adult: 18–29
- Adult: 30–49
- Middle-Aged: 50–64
- Elderly: 65+

Each transition runs through the existing life-stage check in the game loop — this just adds more stages and hooks the appearance changes below onto those same transition points.

**Avatar aging** — the portrait swaps to a different base image at each life-stage transition, not just once at "adult." Practical approach for a solo build, roughly in order of effort:
1. **Simplest, recommended to start with:** one flat-vector avatar image per life stage (× a couple of gender variants) swapped outright at each transition — no layering or parametrics, just around seven static images per gender, which Claude Code can help generate as SVGs from a clear style spec matching the BitLife look above.
2. **Layered (stretch goal once the simple version works):** split the avatar into swappable SVG layers — base body/face per life stage, hair as its own layer (color + style), and a small "modifiers" layer for cosmetic-procedure results — so new appearance combinations don't each need a brand-new image.

**Hair changes with age:**
- `appearance.hairColor` starts as the character's natural color
- Past a threshold (say mid-40s), a small yearly chance of `appearance.grayness` ticking up; by the elderly stage it's mostly or fully gray unless dyed
- A hair-dye cosmetic procedure (below) resets `grayness` toward 0 temporarily — it grows back out over a few years, same as real life

**Looks decline:** the passive stat drift already in the Game Loop gets more specific for Looks — little to no natural decline through Young Adult, then a small yearly dip starting in Adult, accelerating through Middle-Aged and Elderly. Health, gym activity, and cosmetic procedures can all offset it; a starting-Looks value rolled at birth (genetics) sets the baseline it drifts down from.

**Health issues become more likely with age:** age-up events lean more heavily toward health scares — heart issues, joint problems, hearing/vision decline, memory issues — as a character enters Middle-Aged and especially Elderly, gated and weighted by age bracket the same way other age-up events are. The Health stat still moderates severity and odds either way — a character who's kept Health high fares better than one who hasn't, at any age.

**Cosmetic procedures** — a new Activities-menu category (`cosmetic_procedures.json`): Botox, facelift, hair dye, hair transplant, and similar. Each has a cost, a Looks effect (some temporary and needing repeat visits, some more lasting), and a small chance of a botched-procedure event on the downside — worse odds for older or lower-Health characters. For a famous character, a botched procedure can leak and escalate into a full Scandal via the existing scandal-response system.

**People react differently to appearance** — this isn't a new mechanic so much as making sure Looks is actually wired into everything that should care about it: dating/relationship success odds, the Actor Special Career's eligibility checks, and social media engagement rolls should all reference Looks already. Aging naturally shifts those odds over a character's life unless it's actively maintained or restored.

**Content additions:**
- `/data/appearance/avatars/` — the life-stage avatar image set (see approach above)
- `/data/activities/cosmetic_procedures.json` — the procedure list, costs, effects, and risk
- `character.appearance` block: `{ lifeStage, hairColor, grayness, cosmeticHistory: [] }`

## NPC Life Events

Family and friends shouldn't just sit there — they should age, change jobs, get married, retire, and occasionally die, off-screen, and surface the moments that matter as their own events with choices, the way BitLife's family/friends do.

**NPC state** — expand the lightweight NPC object:
```json
{
  "id": "...",
  "name": "...",
  "relation": "mother | father | sibling | child | friend | coworker | ...",
  "closeness": 0-100,
  "age": 0,
  "alive": true,
  "flags": { "married": false, "retired": false, "employed": true }
}
```

**Background simulation** — each age-up, before rolling the player's own event, quietly advance every NPC by one year: age +1, small chance of a life flag flipping (gets a job, gets married, retires, has a health scare, dies of old age). Most of this stays invisible — only a subset of it surfaces as an actual notification event for the player.

**NPC event pool** — a separate weighted pool (`npc_life.json`), rolled once per age-up alongside the player's own event, using the same schema as regular events:
- `applies_to` — which relation types are eligible (e.g. `["mother","father"]` for a retirement event)
- `conditions` — NPC age range / flags required (e.g. retirement only past a certain age)
- `text` — templated with the NPC's name and relation, e.g. `"{name}, your {relation}, is retiring after 30 years at {job}."`
- `choices[]` — same schema as regular events; effects can touch closeness, the player's money (a wedding gift), or set flags on the NPC or the player

**Example: sibling's wedding**, as a two-step chain using the existing `next_event` field:
1. Invitation event fires. If closeness is high enough, the player is offered a role (best man / maid of honor / bridesmaid) instead of just "guest"
2. Accepting sets a flag and queues a follow-up wedding-day event (same year or next), with its own choices — give a toast, get too drunk, reconnect with an ex who's also there — and its own closeness/money effects

**Cap per year** — with several NPCs in a character's life, more than one could be eligible for an event in the same year. Cap it (e.g. max 2 surfaced per age-up) so the feed doesn't get spammed, and let the rest wait in the pool for next year rather than dropping them.

**Content additions:**
- `/data/events/npc_life.json` — or split into `parents.json`, `siblings.json`, `friends.json`, `extended_family.json` if the list grows large
- Reuses `names.json` for any newly-generated NPCs (spouse's family, a sibling's kid, etc.)

## Personality System

Not just stat bars — every character also has a personality made of independent traits, each scored 0–100, chosen at birth and drifting over the course of the character's life based on what happens to them.

**Trait list** (starting set, easy to extend later): `ambitious, lazy, romantic, jealous, generous, materialistic, introverted, extroverted, reckless, kind, shortTempered, loyal, manipulative, creative`

**Data model:**
```json
"personality": {
  "ambitious": 50, "lazy": 30, "romantic": 60, "jealous": 20,
  "generous": 55, "materialistic": 40, "introverted": 45, "extroverted": 55,
  "reckless": 25, "kind": 65, "shortTempered": 20, "loyal": 70,
  "manipulative": 10, "creative": 50
}
```

**Where traits are shown:** the visible BitLife-style stat bars stay exactly as designed (Health/Happiness/Smarts/Looks/Money) — traits live on a separate Personality/Bio screen instead, summarized as the character's top 3–4 dominant traits (e.g. "Ambitious, Kind, Loyal") rather than fourteen raw numbers, matching how BitLife keeps its main screen simple. The full 0–100 values still drive behavior under the hood.

**How traits affect gameplay:**
- **Event eligibility & weighting** — an event's `conditions` can require a trait threshold (`reckless_min: 60` gates extreme-sports-accident events) or use a trait as a weight multiplier on how often it's picked
- **Choice outcomes** — success odds on some choices scale with a relevant trait (a flirting choice succeeds more with high Romantic/Extroverted; talking your way out of trouble scales with Manipulative)
- **Passive career effects** — Lazy reduces the promotion-roll odds at a job; Ambitious increases them; Generous occasionally triggers a flavor event where the character helps family financially (small money cost, closeness/karma gain)
- **NPC reactions** — Jealous characters get sharper dialogue branches when a partner's behavior looks suspicious; Short-tempered raises the odds a disagreement escalates into a real fight event

**Trait drift — personality isn't fixed:**
- Event choices can carry `trait_effects` alongside their normal stat effects, e.g. `{ "introverted": +5 }`
- Repeated similar experiences compound: getting bullied across several school-age events nudges `introverted` up and `extroverted` down each time, so a shy kid who keeps getting bullied gradually becomes more withdrawn
- Big one-off moments can shift traits sharply — surviving a serious accident drops `reckless`; a run of major success (fame, a big promotion) can raise `materialistic` and lower `kind`, modeling someone getting a little full of themselves
- Trait deltas clamp to 0–100 like any other stat; decay-over-time isn't needed at first, it's a nice-to-have if traits feel too static once it's playable

**Content/code impact:** no new data files needed — this extends the existing event schema (`choices[].effects.traits`) and adds a `personality` block to the character object. The only new code is a `personality.js` module with helpers like `getDominantTraits(character)` for the UI and `getTraitModifier(character, trait)` for event weighting.

## School System

**Age-gated stages**, same as BitLife:
- Elementary school: starts around age 5
- Middle school: roughly ages 11–13
- High school: roughly ages 14–18
- Each transition is a life-stage check in the existing game loop, not a player choice — school just starts automatically at the right age

**Random school events** aren't a separate system — they're age-up events in the existing `childhood.json`/`teen.json` pools, gated by an `in_school` flag and the specific stage in `conditions`. Bullying, making a best friend, a crush, getting in trouble, acing or bombing a test — all standard age-up events, just conditioned on being enrolled.

**Clubs & after-school activities** unlock at high school:
- Activities-menu entries: Drama Club, Sports Team, Debate Team, Band/Music, Art Club, Coding Club, etc.
- Joining a club is itself an activity with a small recurring effect each year it's active (Sports Team raises Athleticism, Drama Club raises the acting-talent stat, Debate raises Smarts/Charisma)
- This is the natural on-ramp into several Special Careers — Drama Club feeds Actor, Sports Team feeds Pro Athlete, Band feeds Musician — so a club's stat gains should map directly onto whatever talent stat that Special Career checks for eligibility later
- A club can also have its own small event pool (a talent show, a big game, a rivalry) using the same activity-event trigger pattern as Vacation below

**Content additions:**
- `/data/school/clubs.json` — club list, the stat/talent it feeds, and which Special Career (if any) it's a prerequisite boost for
- School-specific age-up events stay inside the existing `childhood.json`/`teen.json` files rather than a new file, just tagged with `in_school`/stage conditions

### Higher Education

**College & University** — after high school, a character with strong enough Smarts (and ideally some club/extracurricular history) can apply. Colleges are tiered (`colleges.json`): community college (easy admission, cheap), state school (moderate), prestigious/Ivy-tier (hard admission, expensive, better career payoff later) — admission odds scale with Smarts and the club participation from above.

**Choosing a major** does more than add flavor: each major (`majors.json`) maps to which regular jobs and Special Careers become eligible after graduation — Pre-Med → the Doctor ladder, Business → CEO/Business System eligibility, Theater → Actor, Computer Science → tech jobs — replacing the vague "Bachelor's degree" gate used earlier in the Career System with something the player actually chooses.

**GPA** is tracked through college years, moved by a yearly study-vs-socialize choice (an explicit Happiness/relationships-vs-GPA tradeoff). Higher GPA improves post-grad job quality and is a prerequisite for grad school admission.

**Greek life** is an optional college activity: joining a fraternity/sorority builds closeness with new friend NPCs fast, at the cost of occasional hazing-risk flavor events and a reputation swing either direction.

**Dropping out & grad school** — dropping out early is always an option (forfeits the degree; any student loan already taken stays on the books regardless). Grad school (med school, law school, MBA, PhD) is its own multi-year, higher-cost stage on top of a bachelor's, and is what actually unlocks the top of the Doctor and Lawyer/Judge Special Career ladders, rather than those just being gated by a generic "professional school" flag.

**Content additions:** `/data/school/colleges.json`, `/data/school/majors.json`

## Relationships & Memories

Romantic relationships get a deeper layer than the general NPC Life Events above: every relationship remembers its own history, and later events can reference that history by name.

**Memory log on each NPC:**
```json
"memories": [
  { "id": "met", "year": 2031, "text": "You met Maya at a coffee shop downtown.", "tags": ["milestone"] },
  { "id": "cheated_2031", "year": 2036, "text": "You cheated on Maya.", "tags": ["betrayal", "negative"], "resolved": false }
]
```
- Any relationship event can optionally write a `memory` entry when it resolves — meeting, first date, moving in together, marriage, a big fight, infidelity, forgiveness — not every event needs one, just the ones that would actually stick
- Later events can gate on a memory's existence and tag via `conditions.requires_memory_tag`, and use its `year` to compute elapsed time for dynamic text: an event conditioned on `requires_memory_tag: "betrayal"` and `resolved: false` can generate a line like *"Maya still hasn't completely forgiven you for what happened five years ago"* by templating `{currentYear - memory.year}` into the text
- Some events can resolve a memory (an apology/reconciliation arc sets `resolved: true` on the matching entry), which stops it being referenced as an open wound going forward — it stays in the log as history either way

**Relationship escalation events** — the big asks from a serious partner, using the same event/choice/memory pattern:
- "Move in together?" — accept (updates living situation, writes a positive memory) or decline (may hurt closeness or end the relationship, depending on how it's framed)
- "I got a job offer in {city/state/country}, come with me?" — choices: **Agree & go** (relocates the player, updates a `location` flag, writes a memory), **Stay** (partner may go alone — sets up a breakup or long-distance flag), **Break up now**, or **"I need to think about it"** (defers via `next_event`, queues a follow-up next year rather than forcing an immediate answer)

**Content additions:** no new top-level data files — memories live on the NPC objects in save data, and the events that read/write them live in the existing relationship/dating event pools with the schema extension above.

## Marriage, Divorce & Kids

Builds directly on the closeness/memory system above — this is what a serious relationship eventually turns into.

**Proposing & the wedding:**
- Once closeness and relationship duration clear a threshold, a "Propose" option appears in the relationship's activity menu. Accept/decline odds scale with closeness and the partner's own personality (a Loyal, Romantic NPC says yes more readily)
- A wedding event follows: pick a budget (small courthouse ceremony through lavish, the same cost-tier pattern as Vacation's flight/accommodation choices below), invite family/friend NPCs (closeness affects who shows and how it goes), writes a milestone memory for both people
- `character.spouse` is set to the NPC's id and `maritalStatus` updates; the NPC's `relation` becomes `"spouse"`

**Having kids:**
- **Pregnancy** — a "Try for a baby" activity where applicable, a pregnancy event chain over roughly a year, ending in a birth event that creates a new NPC with `relation: "child"`. A small complication-risk roll here is exactly what Health Insurance from the Finance System is for.
- **Adoption** — an alternate path: browse an adoption agency (cost, a waiting-period event or two), ending the same way with a new child NPC.

**Divorce:**
- Triggered either by player choice (an "Ask for a divorce" activity) or by relationship breakdown — closeness collapsing after repeated negative events or an unresolved betrayal memory
- Resolves three things: an asset split (touches `finances` — checking/savings/property divided), custody of any kids (joint, or one parent primary — affecting future closeness growth and visitation-style events with the non-primary parent), and alimony (a recurring payment either direction, sized by income disparity)
- The NPC's `relation` flips to `"ex-spouse"`; the whole thing writes a heavy memory — exactly the kind of thing the "still hasn't forgiven you" callback pattern from above can reference for years afterward

**Content additions:**
- `/data/events/relationships/marriage.json` — proposal and wedding events
- `/data/events/relationships/family.json` — pregnancy, birth, adoption events
- `/data/events/relationships/divorce.json` — divorce, custody, and alimony events

## Vacation System

Expanding the vacation activity into a real trip builder instead of one flat "go on vacation" click.

**Booking flow**, a short sequence of choice screens when "Vacation" is picked from the Activities menu:
1. **Destination** — pick a country from the shared `/data/world/countries.json` pool (the same one used at Character Creation and in relationship-relocation events), each with a base cost multiplier and a flavor tag (beach, city, adventure, historic) that biases which vacation sub-events are eligible
2. **Flight class** — Economy / Business / First Class, each a cost multiplier and a small immediate Happiness bump (bigger for First Class)
3. **Accommodation rating** — 1 star (very cheap) through 5 star (expensive as hell), same pattern: cost multiplier and Happiness bump scale together

**Cost formula:** `total cost = country base cost × flight multiplier × accommodation multiplier`, deducted from money on booking.

**Event resolution:** after booking, roll the vacation event pool (`vacation.json`), weighted/filtered by the trip's tier — budget trips lean toward grittier or funnier mishaps (lost luggage, bad street food, a sketchy hostel night), luxury trips lean toward glamorous ones (rubbing shoulders with someone famous, a resort romance). The destination's flavor tag further biases which specific events are eligible.

**Content additions:**
- `/data/world/countries.json` — shared country list with cost multiplier + flavor tag (see Character Creation — this replaced an earlier vacation-only file once Character Creation and Relationships also needed a country list)
- Flight class and accommodation tiers can stay as a small fixed config table in code rather than JSON, since that list won't need frequent content updates the way countries/events will

## Career System

Two tiers, same as BitLife:

**Regular jobs** — gated by education level, picked from a pool, promotion happens by staying in a role and rolling a "years served" check:
- No diploma: fast food, retail, custodial, farmhand, etc.
- High school diploma: office assistant, sales rep, mail carrier, etc.
- Bachelor's: accountant, engineer, teacher, nurse, software developer, journalist, etc.
- Master's/PhD/professional school: doctor, lawyer, professor, scientist, executive track

**Special Careers** — unlocked through stats/talents rather than just education, each with its own progression ladder and events:
- **Actor** — background roles → supporting → lead → A-list, tied to a Looks/talent stat
- **Musician** — singer/rapper/composer, tied to a Musical talent stat, album releases, tours
- **Professional Athlete** — sport-specific, built on Athleticism from school sports
- **Politician** — city council → mayor → governor → president/PM, needs money + reputation
- **Organized Crime** — street hustler → made member → boss, tied to Karma/criminal record
- **Business/CEO** — start a business after saving capital, grow it, eventually go corporate
- **Royalty** — inherited, not chosen; separate "Respect" stat instead of Fame
- **Law/Medicine ladder** — Lawyer → Judge, Doctor → Surgeon/Chief of Staff
- **Detective, Stuntman, Dancer, Model, Voice Actor, Game Developer, Author, Magician, Reporter** — smaller special tracks, each with one or two flavor events rather than a deep ladder
- **Streamer** *(new)* — starts as a small Twitch streamer, grows via the social media system below (subs, bits, viewer counts), can eventually get an org contract or a sponsorship deal
- **ESports Pro** *(new)* — pick a game/title, grind an in-game "Skill" stat via practice, try out for amateur teams → pro teams, compete in tournaments for prize money and rankings, career ends in retirement or a coaching/analyst role

Streamer and ESports Pro are fully separate careers — separate ladder files (`streamer.js` / `esports.js`), separate data, no shared base class beyond generic career utilities (promotion checks, quitting, etc.). Streamer's income and progression run almost entirely on the Twitch data in the social media system below. ESports Pro is independent of social media entirely — progression comes from a Skill stat, team tryouts, contracts, and tournament results. A character could do both, but neither requires the other.

**Teen jobs** — before the adult regular-job pool kicks in at 18, teens get their own smaller, age-tiered job pool (`teen_jobs.json`), using one job slot rather than the main+sideline pair below:
- Ages 13–15: a small, low-responsibility pool — babysitting, dog walking, lawn mowing, paper route, pet sitting
- Ages 16–17: unlocks most of the wider teen job list on top of that — waiting tables, retail cashier, movie theater usher, fast food, lifeguard, tutoring
- At 18, the teen job ends automatically and the character moves into the adult job system (regular jobs / Special Careers / sideline) below

**Main Job + Sideline** — once employed as an adult, a character can also pick up a second job on the side, same as real life:
- `jobs.main` — the primary career: any regular job or Special Career ladder above
- `jobs.sideline` — a second, smaller job held at the same time, pulled from a separate, flexible-hours pool: food delivery driver, rideshare driver, freelance writer/designer, tutor, dog walker/pet sitter, street musician, warehouse picker, event/catering staff, online reseller, etc.
- Only one sideline at a time, and it's optional — most characters won't bother unless money is tight or the player wants the flavor
- Sideline income stacks additively on top of main job income each year, but is meaningfully smaller
- Holding both applies a small passive Happiness/Health drain per year (overwork), separate from either job's own events
- If Happiness or Health drop too low while both are active, trigger a "Burnout" event offering to quit the sideline (or, less often, the main job)
- A Special Career can be held as either the main job or the sideline, but not both roles at once — e.g. Streamer works well as a sideline for a character with a boring main job, which is a natural on-ramp into that career later if it takes off
- Occupation menu gets a second tab/section for the sideline, separate "Find Sideline" / "Quit Sideline" actions from the main job's "Find Job" / "Quit Job"

**Content addition:** `/data/careers/sideline_jobs.json` — the gig/part-time job pool, plus a small flavor-event pool for sideline-specific moments (bad customer, good tips, schedule conflict with the main job).

## Crime & Prison System

Crime has been a placeholder activity since the very first draft of this plan — here's the actual system behind it, open to any character, not just the Organized Crime Special Career.

**Committing a crime** — a Crime tab in the Activities menu, tiered by risk/reward: petty theft and pickpocketing at the low end, up through burglary, grand theft auto, drug dealing, fraud, armed robbery. Each has:
- A success roll, influenced by personality (Reckless raises how often the option even gets taken, Manipulative helps fraud-type crimes, Smarts helps planning-heavy ones)
- A get-caught roll on top, influenced by Karma, any existing criminal record, and how serious the crime is
- On success: money or an item gained, Karma drops a little
- On failure: straight into arrest

**Arrest, trial, sentencing:**
- Arrest triggers a trial event: plead guilty for a reduced but certain sentence, or fight the charges (costs money for a lawyer, odds scale with Smarts and how much was spent — a better lawyer meaningfully helps)
- Sentencing length scales with the crime's severity and the trial outcome
- A `criminalRecord` flag gets set — this is what already blocks entry to careers like Doctor, Lawyer, Judge, and Politician elsewhere in the plan, and can also block entry to certain vacation-destination countries later, a nice bit of cross-system consequence for free

**Prison life:**
- While incarcerated, the age-up loop keeps running but Activities are swapped for a prison-specific set: yard time, cafeteria conflicts, joining or avoiding a gang, an education/work program that can shave time off the sentence, or attempting an escape (high risk — getting caught adds time)
- Parole becomes available partway through a sentence with good behavior; violating parole conditions sends the character back

**Organized Crime tie-in:** the Special Career from above runs on this same crime-resolution engine underneath, just with a career-progression wrapper (street hustler → made member → boss) layered on top rather than a separate system — committing crimes for the mob uses the exact same success/arrest rolls as any other character's crime activity.

**Content additions:**
- `/data/crime/crime_types.json` — the tiered crime list: base success odds, payout range, sentence range
- `/data/events/crime/prison_life.json` — the prison-specific event pool
- `crime.js` module for the roll/arrest/sentence logic, reused by both the general Crime activity and the Organized Crime career

## Finance System

Money has grown well past a single number. Here's the full picture — banking, investing, and insurance — all hanging off the same `character.finances` object.

**Data model** — the visible Money stat in the main UI reflects the checking account balance specifically; everything else (savings, investments, property, insurance) lives in a dedicated Bank screen rather than the top-level stat bar:
```json
"finances": {
  "checking": { "balance": 0 },
  "savings": { "balance": 0, "interestRate": 0.01 },
  "creditScore": 650,
  "loans": [],
  "creditCards": [],
  "investments": { "stocks": [], "etfs": [], "bonds": [], "mutualFunds": [], "realEstate": [], "crypto": [] },
  "insurance": { "health": null, "life": null, "auto": null, "home": null, "disability": null }
}
```

### Banking

- **Checking** — opens automatically once a character starts earning (a basic teen checking account can open earlier). Salary/job income deposits here each year; everyday activity costs deduct from here. Minimal or no interest. Spending past zero triggers a small overdraft-fee event rather than silently blocking the purchase.
- **Savings** — a "Transfer to Savings" activity moves money from checking; earns a modest interest rate calculated once per age-up (`balance × rate`). Withdrawal limits/penalties and tiered accounts unlocked by balance thresholds are reasonable depth to add later, not required for a first pass.
- **High-Yield Savings** — same shape as Savings but a higher rate and a minimum-balance requirement to open/maintain — the natural place to park a large emergency fund.
- **Certificates of Deposit (CDs)** — lock an amount for a term (1/3/5 years) at a fixed rate higher than savings; cashing out early costs a penalty; at maturity (checked on age-up), principal + interest returns automatically unless the player rolls it into a new CD.
- **Bank Loans** — Personal, Auto, Mortgage, Student, and Business loan types, each with its own typical rate/term range. Approval is gated by `creditScore` plus income and existing debt; missed payments hurt `creditScore` and can trigger repossession/foreclosure events, paying one off in full helps it.
- **Credit cards** — random financial events (`financial_events.json`) periodically offer a card with a given limit and APR — **Accept** (adds it to `creditCards[]`, usable for purchases elsewhere) or **Decline**. Carried balances accrue interest yearly; missed payments or a maxed-out card hurt `creditScore`, paying one down helps it. `creditScore` ends up being the one number that quietly gates loan approval and credit limits everywhere else — worth building early since so much else reads from it.

### Investments

A proper Invest menu, resolved yearly rather than simulated day-to-day: **on every age-up, the engine walks every held investment and applies one year's worth of change to it** — a price roll, dividends, rent collected, interest — rather than the player managing anything in real time.

- **Stocks** — a pool of fictional companies (`companies.json`: ticker, name, sector, volatility profile). Buy/sell shares anytime via the Invest menu. Each age-up rolls a price-change % per held company (weighted by its volatility plus a market-wide modifier), applies dividends where relevant, and occasionally fires a company-specific event — bankruptcy (holding goes to zero), a stock split (share count changes, no value change), or an acquisition (holding converts to a cash payout). Market-wide crashes/booms are their own rare event affecting most holdings at once.
- **Index Funds / ETFs** — same buy/sell/yearly-roll pattern as stocks but tracking one smoothed "market index" roll instead of individual company risk — lower volatility, modest dividends, the natural "safe default" option.
- **Bonds** — Government (very low risk, low fixed return) and Corporate (a bit more return, a small issuer-default risk), fixed or variable rate, held to a term.
- **Mutual Funds** — same shape as ETFs, but actively managed: a small yearly expense-ratio fee eats into returns in exchange for occasionally beating the index roll — a light way to make the two feel meaningfully different without much extra code.
- **Real Estate** — buy a rental property from a small generated pool (`real_estate_listings.json`: price, location, estimated rent, condition), same "browse and buy" pattern as the Business System. Yearly resolution: collect rent (minus a vacancy-chance roll), apply property-value appreciation/depreciation, deduct property tax and the occasional repair event. Can be financed with a mortgage (ties into Bank Loans) and sold later at current appraised value.
- **Crypto** — a pool of fictional coins (`crypto.json`) with a much wider yearly price-change roll than stocks, plus its own flavor risks: scam tokens (total loss), an exchange collapse (loses holdings kept there), and occasional huge pump events.

**Content additions:** `/data/finance/companies.json`, `bonds.json`, `crypto.json`, `real_estate_listings.json`, `loan_types.json` — plus an `investing.js` module that runs the once-per-age-up portfolio resolution described above.

### Insurance

Every policy type shares the same shape — premium in, coverage/payout logic when a matching risk event fires — so this is one generic resolver (`insurance.js`) rather than five bespoke systems:

- **Health Insurance** — premium (monthly/annual), coverage %, deductible. When a health-related age-up event fires (these already scale with age via the Aging & Appearance System), an insured character pays only the deductible plus their coverage share; an uninsured one pays the full bill, which can force a loan or credit-card debt if they can't cover it outright.
- **Auto Insurance** — premium, coverage level. A car-accident event checks for coverage the same way — insured pays the deductible, uninsured pays full repair/replacement cost or loses the vehicle.
- **Home Insurance** — same pattern for fire/flood/theft/damage events against an owned home.
- **Disability Insurance** — premium, income-replacement %. If an event results in a temporary or permanent "can't work" flag, this pays out a percentage of lost income for the duration instead of the character's income dropping to zero.
- **Life Insurance** — Term (cheaper, fixed period, no payout if the term expires first) or Whole (pricier, lifetime coverage). Premium, coverage amount, and a beneficiary picked from the character's NPCs. **On death, if a policy is active, its payout goes to the named beneficiary as part of the Death & Legacy resolution** — shown in the life summary as its own line ("Life Insurance Payout: $500,000") and folded into whatever that beneficiary inherits. That lines up directly with the continue-as-child system: a well-insured parent can set their successor up regardless of what other assets existed.

**Content additions:** `/data/finance/insurance_types.json` — premium formulas and default coverage/deductible values per type. No new event pools needed — insurance just changes how existing risk events (health, auto accident, home damage, disability) get resolved financially.

### UI note

This is enough content to earn its own bottom-menu icon rather than living inside Assets — add a **Bank** icon (Occupation / Relationships / Activities / Assets / Bank) opening a tabbed screen for Accounts, Invest, and Insurance, following the same "menu icon → full-screen submenu" pattern as everything else.

## Assets

The Assets icon has been sitting in the bottom nav since the first UI draft — here's what actually lives behind it, separate from the Investing System's real estate above.

**Cars:**
- Buy from a tiered pool (`cars.json`: economy, mid-range, luxury, exotic), financeable via an Auto Loan (Banking) and, sensibly, needing Auto Insurance to be fully covered in an accident
- Depreciates yearly, unlike real estate which appreciates — a straightforward inverse of the property-value drift already built for Real Estate
- Can be in an accident (the same event pool Auto Insurance resolves against), can be customized for a small Looks/flavor bump, and can be resold anytime at current depreciated value

**Valuables:**
- Jewelry, watches, art, collectibles, electronics (`valuables.json`) — bought outright, most just hold flat sentimental/flex value, a few rare ones can appreciate over time
- Can be stolen — a nice tie-in to being a crime *victim*, the flip side of the Crime & Prison System above — and optionally insured

**Net worth:** worth surfacing as a single number on the Bank screen — total assets (cars + valuables + real estate + business + investment holdings + bank balances) minus all debts (loans, credit cards, mortgages). Doesn't need its own system, just a rollup calculation reading from everything else already tracked.

**Content additions:** `/data/assets/cars.json`, `/data/assets/valuables.json`

## Pets

**Adopting/buying a pet** — an Activities menu category, a pool of pet types (`pet_types.json`: dogs, cats, birds, fish, reptiles, and a few exotic options), each with a cost and a care-difficulty flavor.

**Pet object:**
```json
{ "id": "...", "name": "...", "type": "dog", "age": 0, "health": 80, "happiness": 80, "alive": true }
```

**Care activities:** feed, walk, vet visits (costs money, helps prevent illness), play — a well-cared-for pet gives the player character a small passive Happiness bonus for as long as it's alive, which is what makes neglect an actual tradeoff rather than a free background detail.

**Neglect:** an uncared-for pet's health/happiness drifts down over time, risking it running away or getting sick.

**Random pet events** (`pet_events.json`): illness, getting lost, a cute moment that goes viral if posted (nice tie-in to Social Media), a bite/aggression incident with liability implications, or — for a purebred — entering a pet show for a bit of prestige and prize money.

**Death:** old age or neglect-driven illness ends it, with a small grief event affecting Happiness — no need for anything heavier than that.

**Content additions:** `/data/pets/pet_types.json`, `/data/events/pets/pet_events.json`

## Business System

Extends the Business/CEO Special Career from a title into something the player actually runs. Owning a profitable business is what unlocks that career ladder — the career track is the prestige/title layer, this system is the mechanics underneath it.

**Two ways in:**
- **Start from scratch** — pick a business type from a pool (`business_types.json`: restaurant, retail store, tech startup, gym, salon, food truck, real estate, etc.), pay its base startup cost, begin at "Startup" stage with low revenue and low reputation
- **Buy an existing business** — browse a small randomly-generated list of businesses for sale, each with an asking price, current yearly revenue, and a condition rating. Costs more upfront than starting from scratch, but comes with an existing revenue stream instead of starting from zero

**Business object:**
```json
{
  "id": "...",
  "type": "restaurant",
  "stage": "startup | growing | established | chain",
  "revenue": 0,
  "expenses": 0,
  "reputation": 50,
  "employees": 0
}
```

**Yearly management** (a Business tab in the Activities/Occupation menu):
- Reinvest profits to grow (raises stage/revenue ceiling over time)
- Hire or cut staff (more staff raises both the revenue ceiling and expenses)
- Run a marketing push (costs money, temporary reputation/revenue bump)
- Cut costs (short-term profit boost, long-term reputation risk)

**Random business events** — a dedicated pool (`business_events.json`): an economic downturn, a health-inspection scandal, employee theft, a competitor opening nearby, a lawsuit, or — a nice tie-in with the social media system — a customer's viral post that spikes business overnight.

**Risk and exit:** a business losing money for too many consecutive years can go bankrupt, losing the invested capital. A healthy business can be sold later for a payout based on current profitability — the "buy" flow's numbers running in reverse.

**Scope note:** keep it to owning one business at a time for a first pass. An empire of multiple businesses is a natural expansion later once the single-business loop feels good, but multiplies the bookkeeping fast.

**Content additions:**
- `/data/business/business_types.json` — the type pool with startup cost, revenue potential, risk profile
- `/data/business/business_events.json` — the random event pool for owned businesses

## Social Media System

Four platforms, each with a distinct posting type and monetization path. (These map to Facebook/TikTok/YouTube/Twitch — since this is just for you, using the real names is fine; if you ever wanted to share the project publicly you'd swap in original names, but that's not a concern for a personal build.)

**Per-platform data model:**
```json
{
  "facebook":  { "followers": 0, "verified": false, "posts": [], "monetized": false },
  "tiktok":    { "followers": 0, "verified": false, "posts": [], "monetized": false },
  "youtube":   { "followers": 0, "verified": false, "posts": [], "monetized": false },
  "twitch":    { "followers": 0, "verified": false, "posts": [], "monetized": false, "subs": 0 }
}
```

**Core mechanics:**
- **Account creation** — age-gated (13+), one activity menu entry per platform once unlocked
- **Posting** — each platform has its own content type: status/photo (Facebook), short video (TikTok), video upload (YouTube), stream session (Twitch). Each post is an activity-menu action, not a yearly event, so the player can post whenever
- **Engagement roll** — on each post, roll an outcome (flop / normal / viral) weighted by: current follower count (bigger accounts have more reach but harder viral odds), relevant stats (Looks for TikTok/Instagram-style content, Smarts/Charisma for commentary content, career synergy — a Streamer career boosts Twitch rolls specifically), and a flat luck factor
- **Follower growth/decay** — small passive follower loss if inactive for a stretch (models algorithm decay), gain per post scaled by the engagement roll, big one-time spikes on a "viral" result
- **Monetization** — unlocks at follower thresholds per platform (e.g. YouTube Partner-style ad revenue, Twitch sub revenue split, TikTok Creator Fund, Facebook page monetization); once unlocked, yearly/passive income scales with followers and post frequency
- **Affiliations & sponsorships** — at follower milestones, sponsors offer brand deals (accept for a payout + possible follower bump, or decline to protect authenticity/reputation); deals can be pulled if a scandal follows
- **Scandals / viral controversies** — random negative events (leaked drama, a bad take, a cancel-culture pile-on) that spike or crater followers; player picks a response (apologize, ignore, double down), each with different follower/reputation outcomes
- **Verified status** — cosmetic milestone at a high follower count, small trust/credibility bonus for sponsorship offers

**Content additions this needs:**
- `/data/social_media/facebook.json`, `tiktok.json`, `youtube.json`, `twitch.json` — post flavor text pools and scandal event pools per platform
- `/data/careers/streamer.json`, `esports.json` — career ladder definitions

## Fame & Public Recognition

Fame stops being just a number once it's high enough — it starts interrupting ordinary life.

**Recognition rolls:** once Fame passes a threshold (say 20+), any "public" activity — walking, gym, shopping, dining out, vacationing, anything not done in private — has a chance, scaling with the Fame stat, of triggering a recognition event on top of that activity's normal outcome. The higher the Fame, the more often it happens.

**The event:** a fan recognizes the character and asks for a photo (or an autograph, or just to say hi). Choices:
- **Happily agree** — small Happiness/Fame bump
- **Decline politely** — usually no penalty, maybe a tiny Fame dip
- **Decline rudely / brush past them** — bigger Fame/reputation risk, especially for a Short-tempered character

Personality feeds into the odds here too: a Kind/Extroverted character gets better odds on a warm interaction, while a Short-tempered one has a higher chance of an "annoyed celebrity" moment even when trying to agree.

**It gets posted, and that gets its own outcome roll** — the same flop/normal/viral pattern as the player's own social media posts:
- **Positive** — the post reads as wholesome ("celebrity stopped to take a photo with a fan"), Fame and reputation go up, occasionally a small follower bump on the player's own accounts
- **Negative** — the post reads badly ("celebrity looked annoyed / refused a fan"), Fame or reputation takes a hit, and on a bad enough roll it escalates into a full Scandal using the existing scandal-response system above

**Content additions:**
- `/data/events/fame_recognition.json` — the recognition event pool
- Add a `public: true/false` flag to activity definitions so the engine knows which ones are eligible to roll a recognition check

## Death & Legacy

When a character dies (old age or an event), the game doesn't just end — it offers to continue.

**On death:**
1. Check the player's living children (`relation: "child"`, `alive: true`)
2. If there are none, the life simply ends with the usual life-summary screen
3. If there are one or more, offer a choice: **Continue as [child's name]** (pick one if there's more than one) or **End this life and start a new one**

**Inheritance, if continuing:**
- Split from the player's assets at death — house, car, savings — weighted by closeness to each child rather than an even split, with some randomness so it's not fully predictable
- A child with low closeness to the deceased parent might inherit little or nothing — that's an intentional and fair outcome reflecting how the relationship was actually played, not a bug
- Simple version for a first pass: one asset (or a cash amount) goes to the closest child; a full "write a will" activity later in life is a reasonable stretch goal, not needed up front

**Continuing as the child:**
- The chosen child becomes the new active character, at whatever age they currently are, keeping all their existing relationships and history — they don't restart from birth
- Their personality traits, memories, and stats (already tracked as an NPC) carry forward into being the new playable character

**Content/code impact:** no new data files for the core flow — this is engine logic (`legacy.js`, or folded into `engine.js`) that runs once at the death event, reading existing character/NPC state rather than needing its own content pool.

### Family Tree Viewer

A payoff screen for all the multi-generational play the Continue-as-Child flow enables. Unlike the active character's save, this needs a small log that persists across lives in the same browser rather than resetting with each new life:
```json
{ "name": "...", "birthYear": 0, "deathYear": 0, "cause": "...", "job": "...", "netWorth": 0, "achievements": [], "parentId": "...", "childrenIds": [] }
```
Each time a life ends and the player continues as a child, the old character's summary gets appended to this log before the new one takes over. The viewer itself can be as simple as a scrollable list or a basic branching tree diagram — tapping an ancestor shows their life summary. No new event pool needed, just a small `meta_save.js` module reading/writing this log (shared with Achievements below, since both live in the same cross-life storage).

## Achievements & Challenges

A lightweight, separate layer on top of everything else — a checklist of goals, most spanning a single life, a few spanning the family tree across lives.

**Achievement definition** (`achievements.json`):
```json
{ "id": "billionaire", "name": "Billionaire", "description": "Reach a net worth of $1B", "condition": { "netWorth_min": 1000000000 } }
```
Checked using the same `conditions` pattern already used for events — evaluated on age-up (or right after specific triggers like a birth, a career promotion, a death) rather than every frame. Examples that fall out naturally from the systems already built: "Become a billionaire," "Have 3 kids with 3 different partners," "Retire before 40," "Get elected President," "Own 5 properties."

**On completion:** a small notification, and the achievement gets added to a persistent list in the same cross-life `meta_save.js` storage as the Family Tree above — a few achievements ("unlock every Special Career across all your lives") are meant to span more than one life.

**Rewards:** keep it to bragging rights for a first pass — a checklist with no gameplay effect. Small permanent perks unlocked by achievements are a reasonable stretch goal later, not something to design up front.

**Content additions:** `/data/achievements/achievements.json`

## UI Design — Match BitLife's Look

BitLife's whole visual identity is built around a single phone-shaped screen, so even though this is a desktop app, the window itself should stay narrow and portrait — don't build a wide desktop layout and shrink BitLife's UI into a corner of it.

**Layout, top to bottom:**
- **Character portrait** — a flat-vector cartoon avatar that swaps at each life stage (see Aging & Appearance System), with hair gradually graying with age and cosmetic procedures able to offset the decline. Name and age shown right above or below it.
- **Stat bars** — four horizontal bars directly under the portrait, each a fixed color: Health (red/pink), Happiness (yellow), Smarts (blue), Looks (purple/magenta). A fifth bar appears contextually — gold for Fame once a character is famous, a different color for political Approval.
- **Money** — shown as a plain text line/label, not a bar; reflects the checking account balance specifically. The fuller financial picture (savings, investments, property, insurance) lives in the new Bank screen — see Finance System.
- **Event feed** — a scrolling, chat-log-style list filling the middle of the screen. Each year's events appear as separate text lines, each with a small icon for the event type (job, birth, death, crime, etc.), newest entry at the bottom, auto-scrolls down as new lines are added.
- **Age button** — a circular or pill-shaped button, high-contrast green, usually bottom-right, advances one year per tap.
- **Bottom menu icons** — Occupation (briefcase), Relationships (heart), Activities (star/lightning bolt), Assets (house), Bank (piggy bank/dollar sign — see Finance System). Tapping one opens a full-screen or modal submenu list rather than an inline panel.
- **Choice prompts** — when an event needs a decision, a bottom-sheet-style modal slides up with a list of tappable options (sometimes a simple Yes/No, sometimes a longer list, each option occasionally paired with a small icon).

**Visual language:**
- Warm cream/off-white background, not pure white
- Flat, pastel accent colors — minimal gradients or drop shadows
- Rounded corners throughout (buttons, cards, modals)
- Rounded, friendly sans-serif font, bold for headers/names
- Simple flat vector icons, not photographic or skeuomorphic

**Implementation notes for the web app:**
- Lock the page layout to a portrait phone-like max-width (e.g. ~420px) with `viewport` meta tags set correctly, so it looks right both in a desktop browser window and full-screen on an iPhone
- Centralize the color palette as CSS custom properties so the theme lives in one place
- Build "menu icon → full-screen submenu" as one reusable component, since Occupation/Relationships/Activities/Assets all use the same pattern
- Build a reusable `StatBar` component (label, value 0–100, color) rather than four hand-coded bars
- Build the event feed as one reusable scrolling-list component with auto-scroll-to-bottom on new entries, and a small icon-by-type lookup table

## Suggested Folder Structure

```
/src
  index.html
  manifest.json          # PWA manifest — icon, name, "installable" config
  service-worker.js       # caches assets so it works offline once loaded
  /styles
  /game
    character.js         # character state + stat logic
    engine.js             # the age-up loop, event resolution
    events.js             # event loading/filtering/weighting
    save.js                # localStorage/IndexedDB read/write (single active character)
    meta_save.js            # persistent cross-life storage: family tree log, achievements
    personality.js         # trait storage, drift, dominant-trait/weighting helpers
    npc.js                  # NPC background aging, memory log read/write
    legacy.js                # death handling, continue-as-child, inheritance
    business.js               # business start/buy/manage logic
    appearance.js              # life-stage avatar selection, hair/grayness drift, Looks curve
    banking.js                  # checking/savings/CDs/loans/credit cards, creditScore
    investing.js                 # yearly portfolio resolution across all investment types
    insurance.js                  # generic premium-in/coverage-out resolver for all policy types
    crime.js                       # crime success/arrest/sentencing rolls, shared with Organized Crime career
  /data
    /events
      /age_up              # yearly age-up event pools, by age bracket
        childhood.json
        teen.json
        adult.json
      /activities          # per-activity sub-event pools, rolled when the activity is used
        vacation.json
        gym.json
        dating.json
        doctor.json
        cosmetic_procedures.json  # botox, facelift, hair dye/transplant, etc.
      /relationships         # marriage, family, and divorce event pools
        marriage.json
        family.json
        divorce.json
      /crime
        prison_life.json      # prison-specific event pool
      /pets
        pet_events.json
      npc_life.json         # family/friend background-life events
      fame_recognition.json  # public recognition events, gated by Fame
      financial_events.json   # credit card offers, rate changes, scam attempts, etc.
    /careers
      regular_jobs.json   # education-tiered job pool
      special_careers.json  # actor, musician, mafia, politician, etc.
      sideline_jobs.json  # part-time/gig pool for the sideline system
      teen_jobs.json        # age-tiered 13-15 / 16-17 teen job pool
      streamer.json
      esports.json
    /business
      business_types.json    # start/buy pool: cost, revenue potential, risk profile
      business_events.json    # random events for owned businesses
    /finance
      companies.json          # stock pool: ticker, name, sector, volatility
      bonds.json                # government/corporate bond offerings
      crypto.json                 # coin pool with volatility profile
      real_estate_listings.json    # properties available to buy
      loan_types.json               # personal/auto/mortgage/student/business rate & term ranges
      insurance_types.json           # premium formulas, default coverage/deductible per type
    /assets
      cars.json               # tiered car pool
      valuables.json           # jewelry, watches, art, collectibles, electronics
    /pets
      pet_types.json          # dogs, cats, birds, fish, reptiles, exotics
    /crime
      crime_types.json        # tiered crime list: success odds, payout, sentence range
    /social_media
      facebook.json
      tiktok.json
      youtube.json
      twitch.json
    /school
      clubs.json            # club list, stat/talent feed, career prerequisites
      colleges.json          # college tiers, admission difficulty, cost
      majors.json             # major list + career-unlock mapping
    /world
      countries.json        # shared destination/birth/relocation pool, cost multiplier, flavor tag
    /character_creation
      wealth_tiers.json     # the four starting-family wealth tiers and what each grants
    /appearance
      /avatars              # life-stage avatar image set (SVG), per gender
    /achievements
      achievements.json     # achievement list with declarative conditions
    names.json
```

## Build Order (MVP → full game)

1. **Skeleton loop** — character creation, an "Age Up" button, stat display, no events yet. Build the shell to already match the BitLife layout (portrait-locked page, stat bars, bottom menu icons, cream palette) rather than a generic layout you reskin later.
2. **Deploy immediately** — push the skeleton to GitHub Pages and add it to your iPhone Home Screen. Every step after this is a `git push` away from being testable on your actual phone.
3. **Character creation options** — country of birth, gender, and the rolled family-wealth tier, wired into the skeleton from step 1 before anything else builds on top of it.
4. **First age-up events** — hand-write 10–15 events across 2–3 age brackets to prove out the event → choice → effect → history-log pipeline, using the real bottom-sheet choice modal.
5. **Personality foundation** — add the `personality` block to the character object and a couple of `trait_effects` on existing events. Prove trait drift works now, before other systems start depending on it.
6. **Activity events** — reuse the event engine for one activity (gym is a simple first one) to confirm the activity-trigger pattern generalizes beyond age-up.
7. **Save/load** — `localStorage`/`IndexedDB`, tested specifically on your iPhone before building much more on top (mobile Safari's storage behaves a little differently than desktop).
8. **Aging & appearance system** — the refined life stages, the avatar swap at each transition (start with the simplest static-image approach), hair graying, and the Looks decline curve. Foundational and mostly self-contained, so worth doing before diving into content-heavy systems.
9. **School system** — age-gated stages, a handful of school age-up events, then clubs once the base loop feels right.
10. **Higher education** — college admission, majors, GPA, Greek life, once the club pattern from School feels solid.
11. **NPC life events** — background yearly aging for NPCs, plus the npc_life event pool.
12. **Relationships & memories** — closeness, the memory log, and one full escalation event (e.g. move-in-together) working end to end before adding more.
13. **Marriage, divorce & kids** — proposing, the wedding, pregnancy/adoption, and divorce/custody/alimony, all extending the relationship system from the previous step.
14. **Pets** — lightweight and mostly self-contained; a good change of pace before the bigger career and finance systems ahead.
15. **Basic career** — job search, a handful of regular jobs, promotion checks. One career type fully working before Special Careers or the sideline system.
16. **Banking basics** — checking auto-opens once income exists, salary deposits, savings + interest on age-up. Get this working before Investing or Insurance, since both extend the same `finances` object.
17. **Teen jobs** — the 13–15 / 16–17 tiered pool, transitioning into the adult job system at 18.
18. **Sideline system** — second job slot, sideline job pool, the overwork drain and burnout event.
19. **Special Careers** — the ladder-based careers (Actor, Musician, Politician, etc.), then Streamer and ESports Pro as their own separate ladders.
20. **Crime & Prison** — the general Crime activity and arrest/trial/prison flow, then wiring the Organized Crime Special Career's progression on top of the same engine.
21. **Business system** — start-from-scratch and buy-existing flows, yearly management decisions, the business event pool. Builds on the Business/CEO Special Career from step 19.
22. **Investing system** — start with Stocks plus one Index Fund to prove the yearly-portfolio-resolution pattern, then add Bonds, Mutual Funds, Real Estate, and Crypto once that's solid.
23. **Assets** — cars and valuables, plus the net-worth rollup across everything financial built so far.
24. **Social media system** — account creation, posting, engagement rolls, follower growth/decay. Start with Twitch, since Streamer depends on it.
25. **Monetization & scandals** — sponsorships, ad revenue, viral controversy events.
26. **Fame & recognition events** — the public-recognition roll and its posted-outcome branch, reusing the scandal-response system from the previous step. Only makes sense once Fame is actually being generated by careers/social media, so it comes after both.
27. **Cosmetic procedures** — botox, facelift, hair dye/transplant, and the botched-procedure risk, including the tie-in to Scandal for famous characters. Comes after Fame/Scandal since that's what gives a botched procedure its bite.
28. **Vacation trip builder** — country/flight-class/accommodation picker, tiered event pool.
29. **Insurance system** — start with Health Insurance since it hooks straight into the aging/health-issue events already built, then Auto/Home/Disability, then Life last since its payout needs Death & Legacy (next step) to actually resolve.
30. **Death & legacy** — continue-as-child flow and inheritance, now also resolving any active life insurance payout to the named beneficiary.
31. **Family tree viewer** — the cross-life log and viewer screen, once Death & Legacy is actually producing past lives to log.
32. **Achievements & challenges** — checked against everything built above, so it comes last among gameplay systems rather than earlier.
33. **Content pass** — bulk out every event/career/social/vacation/school/business/finance/crime/pet JSON library. Great to batch-generate with Claude Code once every schema above is locked.
34. **Polish** — animations, transitions, sound, icon set refinement.

## Tips for Working with Claude Code on This

- Ask it to scaffold just a bare click-to-age-up loop first, as plain HTML/CSS/JS. Don't let it write events or UI polish before that loop runs.
- Keep all event content in JSON, never hardcoded in JS — it's much easier to bulk-generate more events later (for both you and Claude Code) if the schema is consistent from the start.
- Init a git repo immediately and commit often. Game-logic changes are easy to regression-test if you can diff them.
- Once the event schema is stable, you can ask Claude Code to generate a batch of 20-30 events at once for a given age bracket rather than one at a time.
- Test on your actual iPhone early and often, not just desktop Chrome — layout quirks (safe-area insets around the notch/home indicator, tap-target sizing, `localStorage` limits) only show up on the real device.
- This document is now the single source of truth for every schema (event fields, personality traits, NPC memory format, job data shapes). Keep it updated as the schemas evolve in code, and paste the relevant section back into a fresh Claude Code session rather than assuming it remembers earlier ones — with this many interlocking systems, a stale shared understanding of a schema is the most likely source of bugs.
- Build and test each new system (personality, memories, teen jobs, vacation) against a couple of hand-written fake events before generating a full content library for it — much cheaper to catch a schema mistake in 3 events than in 100.
