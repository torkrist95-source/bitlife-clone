# Life Sim (BitLife-style) — Project Plan

A personal clone of BitLife, built as a web app and hosted online so it runs on both your computer and your iPhone from one codebase. Not for publishing — just for fun, so it's fine to keep scope small and expand over time.

## Tech Stack

- **Plain web app (PWA)** — HTML/CSS/JS, no Electron. Runs in any browser: your desktop browser now, and Safari on your iPhone once it's hosted somewhere reachable. Add a web manifest + service worker so it can be "installed" to the iPhone Home Screen and opens full-screen like a real app, no App Store needed
- **Frontend**: plain HTML/CSS/JS to start. Don't reach for React/Vue until the core loop works — it just adds build tooling you don't need yet
- **Data**: JSON files for event content (fetched by the app), character save state stored in the browser via `localStorage` or `IndexedDB` instead of a filesystem save file — this is what makes saves work identically on desktop and iPhone
- **No backend/server logic needed** — it's a static app; the only "server" involved is whatever serves the files to your phone (see hosting note below)

## Hosting & Deployment

**GitHub Pages** is the simplest free option and pairs naturally with the git repo you're already going to init on day one — no separate account or service to set up beyond GitHub itself:
- Push the repo to GitHub, then flip on Pages in the repo's Settings → Pages (deploy from the `main` branch, or via GitHub Actions if the site lives under a subfolder). The site goes live at `https://yourusername.github.io/repo-name/`
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
4. Roll for random events eligible at this age/stat/flag combination — many years roll nothing at all, which is expected (see Design Philosophy below)
5. Display results, update history log

**Event system** — this is the heart of the game, keep it data-driven. Events have two trigger types, both running through the same engine and JSON schema:
- **Age-up events** — rolled once per year on the Age button, from the age-bracket pools (`infant.json`, `childhood.json`, `teen.json`, `adult.json`)
- **Activity events** — rolled when the player picks an activity from the menu (vacation, gym, date night, etc.), from that activity's own pool. An activity click first applies its small guaranteed base effect (e.g. vacation always costs some money and gives a happiness bump), then rolls a chance for a special sub-event on top — that's where "your flight gets cancelled" or "you meet someone at the resort" comes from, complete with its own choices
- Events live in JSON files, not hardcoded in JS, regardless of trigger type
- Each event: `id`, `trigger` (`age_up`, `activity:<id>`, or `relationship:<id>`), `conditions` (age range, required flags/stat thresholds, and optionally `requires_memory_tag` to gate on an NPC's past history — see Relationships & Memories below), `text`, `choices[]`
- `conditions` can grow to check whatever a given system needs — family structure, adoption/foster/guardian status, an NPC's relationship type or sexual orientation, education status (including GED/leave/dropout/return), major, GPA, sexual orientation, attraction, dating status, aspiration state, location/country, or any other flag — all through this same schema. A new feature should extend this condition schema, not invent a second one.
- Each choice: `label`, `effects` (stat deltas *and* personality trait deltas — see Personality System below — plus flags to set), optional `memory` (records a new entry in the relevant NPC's memory log), optional `next_event` for chains — this is how a vacation event can branch into a follow-up (e.g. accept the stranger's invite → a second event next year referencing it)
- Weighted random selection so rare/dramatic events show up less often, independently tuned per activity (vacation might have a 30% chance of a sub-event, a doctor visit maybe 10%)

**Activities menu** — things the player can trigger anytime at the current life stage (job search, dating, doctor visit, crime, shopping/assets, vacation). Each activity is a base effect plus a chance at its own random event, per the trigger system above.

**NPCs** — not just static labels. Each NPC quietly lives their own life in the background and surfaces updates to the player. Full design below.

## Design Philosophy

Before diving into individual systems, a few cross-cutting principles govern how all of them should behave together. Every section below should be read through this lens, and every new system going forward should be checked against it before it's added.

**The world exists beyond the player.** Parents, siblings, classmates, friends, coworkers, partners, and exes are not static labels — they age, change jobs, move, marry, have their own children, get rich, go broke, and die on their own timelines, mostly off-screen (see NPC Life Events). The player doesn't control any of it; they only see the moments that surface as events.

**Not every year is a headline.** Most age-ups should be quiet. The event engine already supports "no eligible event fires" — lean into that instead of fighting it. A reasonable rough distribution across a full life:
- Many uneventful years (`"You turned 12."` with no event modal at all)
- Frequent minor events (1–2 sentences, low-stakes)
- Occasional normal events (2–4 sentences, a real choice)
- Rare major events (4–7 sentences, meaningful consequences)
- Very rare life-changing events (an adoption discovery, a biological parent's death, a windfall)

Tune event weights so the mix trends toward the quiet end. A character whose parents divorce, gets into a car crash, and discovers a secret sibling all in the same year reads as a soap opera, not a life sim. Exact numbers can be tuned through playtesting once there's enough content to feel the pacing.

**Random events create circumstances; the player decides the response.** The engine's job is to generate situations ("your parents are getting divorced," "you met someone while on vacation," "your biological mother has contacted you"). The `choices[]` array is the player's job. Never resolve a meaningful moment with a single guaranteed outcome when a real choice would work instead.

**Meeting someone attractive never auto-creates a relationship.** This applies everywhere a character could meet a potential partner — the Dating App, random encounters, vacations, school, college, work, parties, and social media (see Relationships & Memories). Every one of those produces an *opportunity* NPC, not an instant partner. The player has to actually pursue it.

**Prefer extending an existing system over building a new one.** This is still a solo project; every system below should default to "existing system + small extension" rather than a bespoke engine. In practice:
- Classmates, dating candidates, and biological relatives are all just NPCs — use the existing NPC object and background simulation, don't invent a second character type.
- Infant events, world news, and dating-app encounters all run through the existing event engine and JSON schema — don't build a second event pipeline.
- Student loans are Bank Loans (Finance System) with a different label, not a new debt type.
- GED and returning to college extend the existing education/college system, not a parallel one.
- Biological-family reunions and reconnecting with an old classmate both use the existing relationship + memory system.
- Childhood trait development (a bullied kid trending introverted) is just the existing Personality System's `trait_effects`, seeded earlier in life — not a separate "child psychology" system.

**Event writing length** scales with weight:
- *Minor* — 1–2 sentences
- *Normal* — 2–4 sentences
- *Major* — 4–7 sentences
- Chains can run longer across their steps, but no single event should read like a short story.

**Emergent storytelling, not scripted storylines.** The systems below are building blocks, not plot outlines. A few examples of what should be *possible*, not guaranteed:
- *Adoption reunion:* Age 8, adoptive parents share the adoption story. Age 16, curiosity about biological family surfaces. Age 25, a biological parent makes contact. Age 30, a biological half-sibling turns up. None of this is scripted — each step is its own probabilistic event, gated on the last.
- *Education, the long way:* Dropped out at 16 → GED at 19 → enrolled in college at 20 → dropped out again at 22 → returned at 28 → graduated at 31. The education history log (see School System → Education History) makes the whole path visible without erasing any of it.
- *Friend-to-partner:* Met at a coffee shop at 23, stayed friends for a year, mutual attraction surfaced at 24, the player asked them out, they started dating.
- *Vacation romance:* Met someone at 27 while traveling, exchanged contact info, kept it going long-distance, they visited a few months later, and it grew into something real.
- *Old friend, years later:* A childhood best friend moved away at 10, resurfaced on social media at 15, and the two ran into each other by chance at 22.

None of these are hardcoded — they're what falls out of the systems below interacting over a lifetime.

## Character Creation

Right now a new life starts as a full random roll. Adding a few deliberate choices up front, BitLife-style, without turning it into a full character builder:

**At the start of a new life, the player picks:**
- **Country of birth** — from a shared country pool (`/data/world/countries.json` — the same list Vacation and Relocation events use), setting a starting cost-of-living baseline and some light cultural flavor text
- **Gender** — feeds the avatar variant chosen in the Aging & Appearance System below
- Everything else — name, starting stats, personality traits, Looks, family — stays randomized, keeping the "roll a life and see what you get" spirit rather than turning this into a full builder

**Family wealth tier** — rolled, not chosen, at birth: Poor / Working-Class / Middle-Class / Wealthy. This describes the *family's* circumstances, not the character's own wallet, and sets:
- The starting home the character's family lives in
- Parents' starting jobs and rough income
- The household's overall financial situation — what the parents can and can't afford, and how much financial help, if any, they can offer later (an allowance, college costs, a car at 16, an eventual inheritance)

**Family wealth ≠ character money.** A character's personal `money` always starts at **$0**, regardless of family wealth tier — a newborn into a Wealthy family is not personally holding cash, their parents are. The character accumulates their own money the way people actually do: allowance, birthday gifts, an age-appropriate job, a sideline, selling something, or other legitimate income, all through the normal event/activity/career systems elsewhere in this plan. Family wealth instead shapes *opportunity* — a Wealthy family's kid gets offered a bigger allowance event, an easier "ask parents to pay for college" roll, or a nicer inherited car — not a lump of starting cash.

### Birth Details

A new life should read like the start of a story, not a stat dump. Generate and be able to surface:
- **Full name** (already randomized)
- **Exact birth date** — a random date within the appropriate range for the character's current age, giving `character.birthDate`
- **Zodiac sign** — derived automatically from the birth date (see Zodiac Sign below)
- **Country of birth** (player-picked, existing) and, where supported, a specific **city/location** within it
- **Gender** (player-picked, existing)
- **Family wealth/class** (rolled, existing)
- **Parents** — see Parents & Household below
- **Siblings**, if any
- **Pets**, if any
- **Basic household/living situation**

**Birth announcement** — the opening history-log line should read like the beginning of a life, not a database dump:

> "You were born on March 17, 2004, in Chicago, Illinois. You were born into a middle-class family. Your mother, Sarah Carter, is 27 and works as a nurse. Your father, Michael Carter, is 31 and works as an accountant."

Exact wording can vary — this is a template pattern, not a single hardcoded sentence.

### Zodiac Sign

Derived automatically from `birthDate` — no player input, no separate astrology system. It's identity flavor first: shown on the character's Bio/Identity screen (see UI Design) alongside name and birthday. If it ever gets gameplay effects later, keep them minor and optional (a small flavor-text bias on an event, never a personality replacement) — don't build a horoscope system unless there's a clear gameplay reason to.

### Birth & Conception Circumstances

Most births are ordinary. A smaller, weighted pool of circumstances adds variety:
- Planned pregnancy
- Unplanned pregnancy
- One-night stand
- Affair
- Long-term relationship
- Single-parent birth
- Other plausible circumstances

These are rolled probabilistically, weighted heavily toward "ordinary" — an affair or one-night-stand origin should be rare, not a coin flip. Where relevant, the circumstance can shape:
- Whether both biological parents are present in the household
- The parents' relationship/status
- Household structure
- Starting family finances
- Starting closeness with each parent
- Whether a biological parent is absent from the start
- Whether the character ends up raised by someone other than their biological parents (see Birth & Family Circumstances below)

An unusual circumstance is not automatically a *bad* one — a single-parent household or a child of a one-night stand can still start with a perfectly warm, stable home.

### Birth & Family Circumstances

The starting household structure the character is actually raised in:
- Two biological parents
- Single biological parent
- Biological parent + stepparent
- Adopted at birth
- Adopted shortly after birth
- Raised by relatives (see Guardianship)
- Raised by a legal guardian
- Other plausible household structures

This rolls alongside — and is informed by — the conception circumstances above, and it feeds directly into the existing NPC and family systems below. It is not a separate family-simulation engine; it just determines which NPCs get generated as the character's household at birth and how they're tagged (`relation`, and a new `relationshipType` — see Data Model Reference).

### Adoption at Birth

If the roll produces an adopted character:
- **Adoptive parents** become the primary household and are generated exactly like normal parents — names, ages, occupations, wealth tier, personalities, relationships.
- **Biological parents** remain distinguishable from adoptive parents in the data model (`biologicalParentReferences` vs `parentReferences`) and may exist as separate, dormant NPC records that only become active if the character later searches for or is contacted by them (see Biological Family below).
- The character may have **biological siblings** (children of the biological parents, not necessarily raised alongside the character), **adoptive siblings** (other children of the adoptive parents, biological or also adopted), or **step-siblings**.

Adoption is not automatically a sad origin. An adopted character can have a completely ordinary, happy childhood — the roll only determines the household shape, not its quality.

### Knowledge of Adoption

An adopted character does not necessarily know from the start. How and when they find out is itself probabilistic:
- Adoptive parents tell the child during early childhood
- Parents tell the child during adolescence
- Parents tell the character during adulthood
- The character discovers it independently (finds records, notices inconsistencies)
- A relative reveals it
- Another NPC accidentally reveals it
- The character never discovers it at all

If discovery happens through the character's own doing rather than a parent's disclosure, it can run as a normal event chain using the existing event/choice/memory pattern:

> "You found an old document that suggests your parents may not be your biological parents."

Choices: *Ask your parents about it* / *Investigate on your own* / *Ignore it*

Possible consequences (via normal `effects` plus a written `memory`): parent closeness, happiness, a `curious_about_biological_family` flag that gates later biological-family events, and a relationship shift with adoptive parents. No dramatic discovery is guaranteed — plenty of adopted characters simply grow up knowing, or never find out at all.

### Biological Family

Where biological parents are known and represented (adoption, foster care, single-parent-with-absent-parent circumstances), they should keep living their own lives through the existing NPC background simulation (see NPC Life Events): marrying, remarrying, having more children, changing careers, moving, gaining or losing money, getting sick, retiring, dying. This is what makes biological half-siblings and extended biological family possible later. The character should never automatically meet them — contact has to be initiated by an event (see Biological Family Contact below).

### Biological Family Contact / Reunion

An adopted (or otherwise separated) character may eventually:
- Search for biological relatives
- Be contacted by a biological parent
- Be contacted by a biological sibling
- Discover a biological half-sibling
- Discover biological relatives through records
- Find relatives through social media (see Social Media System)
- Meet a biological relative
- Have contact refused — by the character or the relative
- Discover the biological parent is deceased

These are possible event chains gated on flags like `curious_about_biological_family` and the character's age, not a guaranteed storyline. The first time a biological relative becomes actually relevant (contact is made, not just referenced), promote them from a dormant reference into a full persistent NPC record with the existing relationship and memory systems — don't treat them as disposable event text.

### Foster Care

A lightweight pathway, not a child-welfare simulator. A child can enter foster care from circumstances such as parent death, abandonment, incarceration, severe neglect, or inability to care for the child. Possible outcomes: returned to a biological parent, placed with a relative, placed with a guardian, adopted, or remains in foster care until adulthood. The point is believable life circumstances and transitions — not a systems-heavy government simulation.

### Guardianship

Distinct from adoption. A child can instead be raised by a grandparent, aunt/uncle, older sibling, family friend, or other appropriate guardian, who becomes the primary caregiver/household relationship while biological parents can remain separately represented. Guardianship can affect household, caregiver relationship, finances, education support, family events, inheritance, and living situation — using the existing Family/NPC/Finance systems, not a duplicate one.

**Content additions:**
- `/data/world/countries.json` — existing, shared list used by Character Creation, Vacation, and relationship-relocation events
- `/data/character_creation/wealth_tiers.json` — existing, the four tiers and what each grants
- `/data/character_creation/birth_circumstances.json` *(new)* — the conception-circumstance pool and weights
- `/data/character_creation/family_structures.json` *(new)* — the household-structure pool (two bio parents / single parent / adopted / foster / guardian / etc.) and weights
- Reuses the existing shared `names.json` for parents and siblings

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
  "relationshipType": "biological | adoptive | step | foster | guardian | half | null",
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

### Family Household Changes

The starting household from Character Creation shouldn't stay frozen. The existing background simulation above should be able to flip additional flags/events on parent and guardian NPCs:
- Parent promoted / loses a job / changes careers / starts a business / retires
- Parents divorce / remarry
- Family moves / buys a different home / downsizes
- Family becomes wealthier / hits financial hardship
- New sibling is born (see Parents Having Additional Children below)
- A grandparent or other relative moves in
- Parent dies — a guardian or the other parent takes over care
- Custody/guardianship changes as a result of any of the above

These surface to the player the same way any other NPC event does — most stay invisible, a subset become a real notification event, capped per year same as above. Custody or household changes triggered by a player's own divorce (see Marriage, Divorce & Kids) feed into this exact same mechanism rather than a separate resolution path.

### Parents Having Additional Children

Parents (biological or adoptive) can independently have more children through the same background simulation, gated on reasonable conditions: parent age, relationship status, household, existing number of children, and family circumstances. Not guaranteed — just a small yearly chance when conditions are met. The resulting sibling gets tagged with the correct relationship type (see Sibling Types below) based on which parents are involved — e.g. a child born to the biological mother after the character was adopted out is a biological half-sibling, not a full sibling.

### Sibling Types

Sibling relationships should distinguish:
- Biological sibling
- Half-sibling
- Adoptive sibling
- Step-sibling
- Foster sibling

All of them are persistent NPCs using the existing architecture (just the `relationshipType` field alongside `relation: "sibling"`), and all of them can go on to have their own education, careers, relationships, marriages, children, finances, life events, and deaths — same as any other NPC.

**Content additions:**
- `/data/events/npc_life.json` — or split into `parents.json`, `siblings.json`, `friends.json`, `extended_family.json` if the list grows large
- `/data/events/family_changes.json` *(new)* — the household-change event pool described above, same schema as `npc_life.json`
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

**Where traits are shown:** the visible BitLife-style stat bars stay exactly as designed (Health/Happiness/Smarts/Looks/Money) — traits live on a separate Personality/Identity/Bio screen instead (alongside Zodiac Sign and Sexuality — see those sections), summarized as the character's top 3–4 dominant traits (e.g. "Ambitious, Kind, Loyal") rather than fourteen raw numbers, matching how BitLife keeps its main screen simple. The full 0–100 values still drive behavior under the hood.

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

**Early personality development** — this doesn't need a separate infant/child personality system. Choices in the Infancy and Childhood event pools (see Infancy & Early Childhood Events and School System below) carry the exact same `trait_effects` as any other event: a tantrum choice nudges `shortTempered` up, sharing nudges `kind`/`generous` up, repeated bullying nudges `introverted` up and `extroverted` down. One event should never define a character — it's the same compounding drift described above, just starting earlier in life.

**Content/code impact:** no new data files needed — this extends the existing event schema (`choices[].effects.traits`) and adds a `personality` block to the character object. The only new code is a `personality.js` module with helpers like `getDominantTraits(character)` for the UI and `getTraitModifier(character, trait)` for event weighting.

## Aspirations & Goals

A lightweight aspirations layer sitting on top of Personality, Education, and Career rather than a new simulation.

**Aspirations** are what the character wants to become or achieve, starting in childhood and evolving with age:

> Age 8: *"I want to become a famous singer."*
> Age 15: *"You dream of becoming a professional musician."*
> Age 25: *"You've decided you no longer want to pursue music."*

Childhood examples: become a doctor, actor, musician, athlete; become famous; become wealthy; help people; become an artist; have a large family; travel the world.

**What influences them:** personality, talents, school activities/clubs, family, life events, success and failure, relationships, and career — the same signals that already drive club/talent mapping (School System) and Special Career eligibility.

**Goals, dreams, and life wishes** can share one unified state model rather than three separate systems:
- *Aspiration:* "Become a famous actor."
- *Goal:* "Buy a house before age 30."
- *Dream:* "Travel to Japan."
- *Life wish:* "Have three children."

Each has a state: `active`, `completed`, `abandoned`, `replaced`, or `failed`/expired where that makes sense. Keep the implementation simple — one `aspirations[]` array on the character with `{ id, text, category, state, createdAge, resolvedAge }`, checked the same way Achievements are (see Achievements & Challenges).

The player should eventually be able to pursue, change, or abandon an aspiration — none of this needs to be enforced or scored; it's mostly flavor and event-gating (an aspiration can raise the weight of related events, the same way a personality trait does).

**Content additions:**
- `/data/aspirations/aspirations.json` — the aspiration pool by life stage/category, plus which stat/talent/personality signals it reads from

## Infancy & Early Childhood Events (Ages 0–4)

The Infant life stage (0–4, see Aging & Appearance System) currently has no dedicated event pool — age-up events start at Child (5+). This adds one.

**Infant event pool** (`/data/events/age_up/infant.json`), using the exact same event schema as every other age-up pool: vaccinations, doctor visits, getting sick, teething, first smile, first word, first steps, first haircut, learning to eat, sleep problems, a favorite toy, being scared, visiting relatives, starting preschool/daycare, making a young friend, harmless trouble, breaking something, getting attached to a toy, getting praised, an early interest emerging, a parent changing jobs, moving homes, a new sibling arriving, parents separating, and other ordinary early-life moments.

**Infant choices** should match the character's actual age — no adult-level reasoning for a toddler:

> "You are getting your vaccinations today. You don't like the idea of getting a shot."

Choices: *Cry* / *Stay brave* / *Try to run away* / *Throw a tantrum*

**Personality seeding** — these choices feed the exact same `trait_effects` mechanism as every other event (see Personality System → Early personality development). No separate infant-personality system.

**Content additions:**
- `/data/events/age_up/infant.json` — the infant/toddler event pool described above

## School System

**Age-gated stages**, same as BitLife:
- Elementary school: starts around age 5
- Middle school: roughly ages 11–13
- High school: roughly ages 14–18
- Each transition is a life-stage check in the existing game loop, not a player choice — school just starts automatically at the right age

**School content by stage** — random school events aren't a separate system, they're age-up events in the existing `childhood.json`/`teen.json` pools, gated by an `in_school` flag and the specific stage in `conditions`:
- **Elementary school:** friends, bullying, teachers, tests, recess, birthday parties, school projects, field trips, getting in trouble, academic success/failure
- **Middle school:** stronger friendships, cliques, bullying, changing interests, early crushes, clubs, academic pressure, social conflicts
- **High school:** dating/crushes, friend groups, parties, academic pressure, sports, clubs, teen jobs, college prep, graduation, driving-related events

**Childhood milestones** round out the major random events with ordinary ones, so childhood feels lived-in rather than disaster-driven: first birthday, losing a first tooth, learning to ride a bike, first sleepover, first day of school, a school award, a favorite teacher, a best friend, an age-appropriate first crush, a first pet, a new hobby, a family vacation, a strong childhood interest. These coexist with the bigger events — see Design Philosophy for the intended ratio of ordinary to extraordinary years.

**Clubs & after-school activities** unlock at high school:
- Activities-menu entries: Drama Club, Sports Team, Debate Team, Band/Music, Art Club, Coding Club, etc.
- Joining a club is itself an activity with a small recurring effect each year it's active (Sports Team raises Athleticism, Drama Club raises the acting-talent stat, Debate raises Smarts/Charisma)
- This is the natural on-ramp into several Special Careers — Drama Club feeds Actor, Sports Team feeds Pro Athlete, Band feeds Musician — so a club's stat gains should map directly onto whatever talent stat that Special Career checks for eligibility later
- A club can also have its own small event pool (a talent show, a big game, a rivalry) using the same activity-event trigger pattern as Vacation below

### Persistent but Changing Classmates

Classmates are persistent NPCs, but the class roster isn't permanently fixed. The player should have a recognizable school social circle that naturally changes over time rather than either staying frozen or reshuffling completely.

**At each school-year transition, the game can change the roster**, weighted so most classmates stay put and only a smaller slice changes:
- A classmate stays in the player's class (the common case)
- A classmate moves to another class at the same school
- A classmate transfers to another school
- A classmate's family moves to another city/country
- A classmate leaves school entirely
- A new student joins the school, and possibly the player's specific class
- A classmate repeats a grade, where appropriate
- A classmate graduates and leaves (high school only)
- Rarely, a classmate dies

Example: at age 10 the player has 15 classmates; at age 11, 11 of them remain, 2 transfer schools, 1 moves away, and 1 new student joins. Most of the roster carries over year to year — this isn't a reshuffle.

**Classmates who remain** keep their name, personality, relationship with the player, memories, academic history, and other life events — nothing resets on a school-year transition.

**Classmates who leave the class don't disappear from the simulation.** They keep existing as persistent NPCs elsewhere, and can still message the player, remain a friend, visit, show up on social media, reconnect years later, or become a romantic interest later in life if age-appropriate (see Relationships & Memories → Meeting People).

**New classmates** are generated through the existing NPC system with a name, age, gender, personality, family circumstances, relevant interests, and relationship status — not disposable event text.

**Classmate interactions** — the player can ask to be friends, talk, play, compliment, tease, mess with them, ignore, give a gift, invite them over, or (age-appropriately) develop a crush. NPCs can also initiate:

> "Emma asked if you'd like to be friends." · "Jake keeps bothering you during lunch." · "Sarah invited you to her birthday party."

The player's response affects closeness, same as any other relationship event. Not every classmate becomes meaningful — most stay background NPCs; a few become friends, best friends, rivals, bullies, crushes, future coworkers, or lasting acquaintances.

**Content additions:**
- `/data/school/clubs.json` — club list, the stat/talent it feeds, and which Special Career (if any) it's a prerequisite boost for
- `/data/events/school/roster_changes.json` *(new)* — the weighted roster-change pool described above
- School-specific age-up events stay inside the existing `childhood.json`/`teen.json` files rather than a new file, just tagged with `in_school`/stage conditions

### Higher Education

Education is a **branching path**, not a single staircase:

```
Normal:          High School → College → Graduation → Career
Dropout:         High School → Dropout → GED → College or Workforce
Workforce:       High School → Workforce → Career
College dropout: High School → College → Leave → Dropout → Workforce
Return:          High School → College → Dropout → Workforce → Return to College → Graduation
Alternative:     High School → Trade/technical education → Career
```

**College & University** — after high school, a character with strong enough Smarts (and ideally some club/extracurricular history) can apply. Colleges are tiered (`colleges.json`): community college (easy admission, cheap), state school (moderate), prestigious/Ivy-tier (hard admission, expensive, better career payoff later) — admission odds scale with Smarts, club participation, and (where relevant) GED status instead of a normal diploma.

**Choosing a major** does more than add flavor: each major (`majors.json`) maps to which regular jobs and Special Careers become eligible after graduation — Pre-Med → the Doctor ladder, Business → CEO/Business System eligibility, Theater → Actor, Computer Science → tech jobs — replacing a vague "Bachelor's degree" gate with something the player actually chooses.

**GPA** is tracked through college years, moved by a yearly study-vs-socialize choice (an explicit Happiness/relationships-vs-GPA tradeoff). Higher GPA improves post-grad job quality and is a prerequisite for grad school admission.

**Greek life** is an optional college activity: joining a fraternity/sorority builds closeness with new friend NPCs fast, at the cost of occasional hazing-risk flavor events and a reputation swing either direction.

**High school dropout** — available starting around age 16–17. Not a yearly popup — it lives behind a menu path that requires confirmation: **Occupation → Education → Drop Out of High School.** Consequences: education history records leaving without a diploma, no normal high school diploma, some jobs become unavailable or harder to get, college admission may become unavailable or harder depending on the institution, and education status becomes `"High School Dropout"` (or equivalent). Not a permanent lockout — see GED below.

**GED / high-school equivalency** — a dropout can pursue this later via **Education → Take GED / High School Equivalency**, available at an appropriate age after dropping out. It has eligibility requirements, can require preparation/study, can be passed or failed, and permanently records the result in education history. Passing restores eligibility for some jobs and can reopen college admission at institutions that accept the credential — it doesn't erase the fact that the character originally dropped out. Use country-appropriate terminology where relevant.

**High school graduation** — when the character graduates normally, this gets its own dedicated event ("Congratulations! You graduated from high school.") that offers: attend college, enter the workforce, take a gap year, or decline college outright.

**College funding** — after acceptance, the player chooses how to pay: ask parents to pay, apply for a scholarship, apply for a student loan, or pay personally. None of these are guaranteed approval.
- **Parent funding** depends on relationship/closeness, parent income and savings, family wealth, parent personality, existing financial obligations, and the tuition cost itself — not a simple coin flip. Example outcomes: *"Your mother agreed to pay your tuition."* / *"Your father refused to pay for your college education."* / *"Your parents can afford to contribute $8,000 per year."*
- **Scholarships** consider GPA, Smarts, extracurriculars, sports/artistic talent, achievements, and family financial need for need-based awards. They reduce tuition — they don't generate free cash.
- **Student loans** go through the existing Finance System (Bank Loans) rather than a separate architecture: principal, interest, real debt that survives graduation *or* dropping out, requires repayment, and feeds the same `creditScore`/debt mechanics as any other loan.

**College leave of absence** — a temporary pause, distinct from dropping out, via **Education → Take Leave of Absence.** Preserves enrollment/academic history and completed credits where appropriate, may create financial or academic consequences depending on circumstances, and the character can return later. Not treated as a dropout.

**College dropout / withdrawal** — leaving college before graduating, via **Education → Drop Out of College** (requires confirmation). Education history records the attendance and completed credits/years where appropriate; the character doesn't receive the degree; any student loans remain; careers requiring the degree stay unavailable; and the character may return later.

**Returning to college** — a character who previously dropped out can return if they meet the relevant requirements: return to the same college or apply elsewhere, resume the previous major or change it, and transfer eligible credits where supported. Dropping out never erases the character's entire education history.

**Education history** — a persistent, append-only record capable of holding elementary/middle/high school, dropout, GED/equivalency, college enrollment, leave, dropout, major changes, transfers, degrees, and (once supported) grad school. Example:

```
Age 16: High School — Dropped Out
Age 19: GED — Passed
Age 20: College — Business Administration
Age 22: College — Dropped Out
Age 28: Returned to College — Computer Science
Age 31: Bachelor's Degree — Computer Science
```

**College life** — college shouldn't reduce to *choose major → pay tuition → age up*. Give it its own flavor-event pool around acceptance/rejection, choosing a school, moving away vs. living with parents, dorm life and roommates, making friends, clubs, dating, academic pressure, changing majors, leave of absence, dropping out, returning, graduation, and student debt — same event schema, own pool.

**Dropping out & grad school** — grad school (med school, law school, MBA, PhD) is its own multi-year, higher-cost stage on top of a completed bachelor's, and is what actually unlocks the top of the Doctor and Lawyer/Judge Special Career ladders, rather than those being gated by a generic "professional school" flag.

**Content additions:**
- `/data/school/colleges.json`, `/data/school/majors.json` — existing
- `/data/school/ged.json` *(new)* — GED eligibility, prep requirements, and pass/fail odds
- `/data/events/school/college_life.json` *(new)* — the richer college flavor-event pool described above

## Sexuality

A persistent character (and NPC) attribute, chosen by the player rather than assigned.

**Player selection** — once the character reaches an age where romantic/sexual identity is appropriate (generally during the teenage years, per the existing life-stage system), an event offers the choice:

> "You're starting to understand who you're attracted to."

Choices: *Men* / *Women* / *Men and women* / *People regardless of gender* / *I'm not interested in sexual relationships* / *I'm not sure yet*

This sets a persistent `sexualOrientation` value: `straight`, `gay`, `lesbian`, `bisexual`, `pansexual`, `asexual`, or `questioning`. The player explicitly chooses — it's never rolled for them.

**Questioning is a valid, stable state**, not a placeholder that must resolve. A character who picks Questioning can revisit the selection later; if the design allows revisiting it, changing orientation never erases existing relationships or memories — existing relationships are just re-evaluated for compatibility going forward, never retroactively invalidated.

**Kept separate from other systems:**
- `sexualOrientation` ≠ gender / gender identity
- `sexualOrientation` ≠ the `romantic` personality trait (Personality System) — `romantic` is *how romantic* a character tends to be; `sexualOrientation` is *who* they're attracted to. Don't conflate them.

**NPCs get the same field**, generated probabilistically when the NPC is created (not uniform — vary it across the population). NPC orientation governs who they can date, who they're attracted to, whether they accept a romantic advance, marriage/partner possibilities, and breakup/relationship-compatibility events.

**Dating pool filtering** — sexual orientation directly filters the dating pool (Dating App and natural encounters both — see Relationships & Memories), alongside gender, NPC orientation, age/life stage, relationship status, and location. A lesbian character's pool skews toward women; a bisexual or pansexual character's pool spans a wider compatible set; an asexual character can still pursue romantic relationships, just without sexual attraction as the basis for them. Compatibility never guarantees chemistry — it only determines who's eligible to appear.

**UI** — surfaced on the character's Bio/Identity screen (see UI Design) alongside Personality and Zodiac Sign, not on the main BitLife-style stat screen:

```
Identity
Gender: Female
Sexuality: Bisexual
```

**Content additions:**
- `/data/sexuality/orientations.json` *(new)* — the small, centrally-defined orientation list (id + label) referenced everywhere instead of hardcoding string literals throughout the game

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

### Relationship States

Extend the existing relationship model (it's still one NPC object with a `relation`/`relationshipType` and closeness — not a second system) to distinguish: Stranger, Acquaintance, Friend, Close Friend, Best Friend, Crush, Romantic Interest, Dating, Partner, Engaged, Married, Ex, Casual Connection, Long-Distance Partner. Progression through these is optional at every step — a character can plateau at "Friend" forever, or skip straight from meeting someone to dating if the player chooses.

### Meeting People

Dating never requires a single dedicated feature — it should fall naturally out of the character's life. Potential romantic interests can originate from school (age-appropriate), college, work, parties, friends and friends-of-friends, family/social gatherings, restaurants, bars/nightlife (age-appropriate), hobbies, sports, gyms, vacations, social media, random encounters, and the Dating App below. All of it runs through the existing event system — a random encounter is just an event like any other:

> "You were waiting for your coffee when you struck up a conversation with someone named Alex. You immediately felt attracted to them."

Choices: *Ask for their number* / *Ask them out* / *Keep talking* / *Become friends* / *Say goodbye*

When a character is met through a random event, school, work, or vacation, they should usually start as a friend or acquaintance rather than an instant partner (see Attraction & Dating Progression below) — the player decides whether to pursue it further.

**Vacation romance** — vacations (see Vacation System) can generate their own unique social/romantic encounters:

> "You met someone named Maya while visiting Barcelona. The two of you spent the afternoon talking and you felt an immediate attraction."

Choices: *Exchange contact information* / *Ask them out* / *Spend more time together* / *Become friends* / *Move on*

Possible outcomes range from a brief vacation fling to a lasting friendship, a one-time encounter, a long-distance relationship, or a serious relationship that continues after returning home. The NPC persists if the player exchanges contact info or otherwise makes a real connection — and once home, they can continue messaging, visit, start a long-distance relationship, or gradually lose touch. Distance should matter. Not every vacation produces a romance — see Random Encounter Weighting below.

**Dating App** — an Activities/Relationships feature that unlocks once the character reaches an appropriate age. It generates a rotating pool of compatible NPC profiles (name, age, gender, occupation, location, personality highlights, interests, relationship status, a compatibility indicator, and a short description — never every hidden NPC stat). The player can like, pass, message, match, start a conversation, ask them on a date, or stop messaging. **A match never automatically creates a relationship** — it just opens the door to messaging, flirting, and (eventually, if the player pursues it) a date. Dating App candidates are generated through the existing NPC system and become persistent the moment the interaction becomes meaningful, exactly like any other romantic NPC.

### Attraction & Dating Progression

Attraction, a crush, friendship, and an actual relationship are all separate states, not synonyms:

```
Met NPC → Friend → Attraction develops → Romantic interest → Date → Dating → Partner → Engagement → Marriage
```

The player can stop at any stage. NPCs can also initiate:

> "Alex has been flirting with you lately." · "Jordan asked if you'd like to go on a date." · "Taylor told you they have feelings for you."

— with the player free to accept, decline, ask to stay friends, or ignore it. NPC personality, orientation, attraction, and the existing relationship all weight these.

**Dates** are their own distinct interaction, not an instant relationship — coffee, dinner, a movie, a park, a concert, a museum, the beach, or a shared hobby, each resolving to great chemistry, a good date, an awkward date, no chemistry, or "let's just be friends" (with the NPC having their own independent reaction, not always matching the player's).

**Casual encounters** — adult characters can optionally choose a casual one-night encounter when the moment presents itself (e.g. while traveling). This is always a player choice, never automatic, and resolves through the existing event/relationship system without graphic content:

> "You've been talking with someone you met while traveling, and there's a strong mutual attraction."

Choices: *Spend the evening together* / *Ask them on a proper date* / *Exchange contact information* / *Remain friends* / *Say goodbye*

Consequences can include the encounter simply ending there, a friendship, continued dating, developing feelings, the NPC reaching out later, or pregnancy where biologically applicable — a casual encounter never automatically becomes a relationship.

**Romance is never automatic.** Meeting someone attractive should never resolve to "Congratulations! You are now dating" on its own — not from the Dating App, a random encounter, vacation, school/college, work, a party, a friend, or a social-media connection. The event always creates an opportunity; the player always decides what happens with it.

### Breakups & Exes

Relationships aren't permanent. A partner can break up with the player, be broken up with, drift apart, lose interest, separate over distance, or reconcile later. After a breakup, the NPC stays in the character's history and can remain a friend, become an enemy, stay a distant acquaintance, or reconnect — sometimes romantically — years later.

**Exes keep living their own lives** through the existing NPC simulation: they can marry, have kids, change careers, get rich, move away, become famous, get back in touch years later, become a friend again, become a rival, or potentially rekindle things. None of this is scripted; it emerges the same way any other NPC's background life does.

### Romantic History

The character maintains a relationship history compatible with the existing Memories system: first crush, first date, first relationship, ex-partners, long-term relationships, engagements, marriages, divorces, and other significant romantic moments — the same memory-log mechanism already described above, just read back as a timeline.

### Random Encounter Weighting

Romantic opportunities stay genuinely random. Not every vacation produces a love interest, not every friend becomes a romantic interest, and not every Dating App match goes anywhere. Weight the odds by age, life stage, relationship status, sexual orientation, location, personality, social activity, and existing relationships — and let some years pass with no romantic opportunity at all. That's expected, not a bug (see Design Philosophy).

### Cross-System Notes

- **Dating + career** — coworkers can become romantic interests; the player can stay professional, become friends, date, or decline an advance.
- **Dating + social media** — a follow, a message, a post getting attention, or an online community can occasionally create a romantic opportunity, same weighting caveats as everywhere else (see Social Media System).
- **Dating + family** — introducing a serious partner to the family can trigger approval/disapproval events, using the existing Family and Relationship systems rather than a new one.
- **Dating + marriage** — dating naturally feeds into the existing Marriage system below, but progression is always optional: a character can date casually across multiple relationships, stay single for life, remain friends with old romantic interests, or have long-term relationships without ever marrying.

**Content additions:** no new top-level data files for the core mechanics — memories and relationship state live on the NPC objects, same as before. New content pools:
- `/data/events/romance/random_encounters.json` *(new)* — the "met someone" event pool referenced above (coffee shop, party, social gathering, etc.)
- `/data/events/romance/dating_app.json` *(new)* — Dating App message/date flavor events
- `/data/events/romance/casual_encounters.json` *(new)* — the adult-only casual-encounter pool

## Marriage, Divorce & Kids

Builds directly on the closeness/memory system above — this is what a serious relationship eventually turns into.

**Proposing & the wedding:**
- Once closeness and relationship duration clear a threshold, a "Propose" option appears in the relationship's activity menu. Accept/decline odds scale with closeness and the partner's own personality (a Loyal, Romantic NPC says yes more readily)
- A wedding event follows: pick a budget (small courthouse ceremony through lavish, the same cost-tier pattern as Vacation's flight/accommodation choices below), invite family/friend NPCs (closeness affects who shows and how it goes), writes a milestone memory for both people
- `character.spouse` is set to the NPC's id and `maritalStatus` updates; the NPC's `relation` becomes `"spouse"`

**Having kids:**
- **Pregnancy** — a "Try for a baby" activity where applicable, a pregnancy event chain over roughly a year, ending in a birth event that creates a new NPC with `relation: "child"`. A small complication-risk roll here is exactly what Health Insurance from the Finance System is for.
- **Adoption** — an alternate path: browse an adoption agency (cost, a waiting-period event or two), ending the same way with a new child NPC.

**Same-sex couples** follow the same proposal/wedding/divorce mechanics as any other couple. Family-building uses the existing Adoption path above rather than the Pregnancy path (which stays reserved for couples where it's biologically applicable); a same-sex couple can also foster or gain guardianship of a child through the pathways described in Character Creation. The family/NPC model supports two-mother, two-father, and other parental structures without special-casing — a child's parent references just point at whichever NPCs are actually the parents.

**Divorce:**
- Triggered either by player choice (an "Ask for a divorce" activity) or by relationship breakdown — closeness collapsing after repeated negative events or an unresolved betrayal memory
- Resolves three things: an asset split (touches `finances` — checking/savings/property divided), custody of any kids (joint, or one parent primary — affecting future closeness growth and visitation-style events with the non-primary parent), and alimony (a recurring payment either direction, sized by income disparity)
- The NPC's `relation` flips to `"ex-spouse"`; the whole thing writes a heavy memory — exactly the kind of thing the "still hasn't forgiven you" callback pattern from above can reference for years afterward. Custody/household changes from this feed into the Family Household Changes mechanism (NPC Life Events) rather than a separate resolution path.

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

**Vacation romance** is one of the possible sub-events this pool can roll — see Relationships & Memories → Meeting People for the full mechanic (meeting an NPC, exchanging contact info, and what can follow). The Vacation System just supplies the setting and the destination's flavor tag as an eligibility bias; the romance mechanics themselves live in Relationships & Memories so there's only one dating/relationship engine.

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

**Education feeds eligibility, not just a diploma flag** — see School System → Higher Education for the full branching education path (dropout, GED, leave of absence, dropout/return). Career/job eligibility should check the character's actual education history rather than a single "has degree: true/false" flag, so a GED-holder or a returning dropout isn't permanently locked out.

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

**System compatibility** — crime should stay wired into the rest of the simulation rather than existing in its own bubble: finances (fines, lost income while incarcerated), career (blocked entry to certain careers), education (harder to complete a degree while inside), relationships (closeness strain, breakups), family (a household change per NPC Life Events), reputation/Fame, housing, credit score, and travel (a criminal record can block entry to some vacation destinations, already noted above). A criminal history should have real long-term weight without permanently foreclosing every future option.

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

### Everyday Income & Expenses

Money shouldn't only move when the player manually buys something — it should function as the character's actual life economy, all still flowing through the same `character.finances` object above.

**Income** can come from salary, sideline jobs, businesses, investment income, rental income, inheritance, or gifts — all processed through the existing Finance System, not a separate income pipeline.

**Recurring expenses** resolve automatically on every age-up: housing, food, transportation, utilities, healthcare, insurance premiums, education, child expenses, pet expenses, debt payments, and entertainment.

**One-time expenses** happen when the player takes the relevant action, through whichever system already owns it — buying a car (Assets), buying a house or property (Investments → Real Estate), college tuition (School System), medical bills (uninsured health events), vacations (Vacation System), weddings (Marriage), moving, major repairs, or gifts. No separate spending engine — everything already routes through `finances`.

**Financial age-up summary** — once enough income/expense sources exist, surface a yearly breakdown so the player can actually see where money moved:

```
AGE 28 FINANCIAL SUMMARY
Salary:                +$72,000
Investment income:      +$3,200
Rent:                  -$18,000
Food/living expenses:   -$9,600
Insurance:              -$4,200
Student loan payments:  -$6,000
Net change:            +$37,400
```

Exact UI TBD — this can be a simple end-of-year modal or a line on the Bank screen.

### Family & Household Finances

Starting family wealth (Character Creation) is a *starting condition*, not a lifetime guarantee. Parents and guardians have their own ongoing finances through the same NPC + Finance systems, which can influence housing quality, school opportunities, family vacations, gift-giving, college tuition support, emergency financial help, and inheritance. A wealthy family generally has more resources, but individual family members can still lose a job, take on debt, go through a business failure or divorce, face medical expenses, go bankrupt, or land a windfall or inheritance — all via the Family Household Changes mechanism in NPC Life Events, not a separate family-finance model.

### Cash vs. Net Worth

Keep checking balance, savings, investments, property, other assets, debt, and net worth clearly distinct in the UI (see Assets → Net worth). A character can have a $500,000 net worth while carrying only $4,000 in checking, or a high salary while sitting on negative net worth because of debt. Never treat checking balance alone as a proxy for "is this character rich."

### Banking

- **Checking** — opens automatically once a character starts earning (a basic teen checking account can open earlier). Salary/job income deposits here each year; everyday activity costs deduct from here. Minimal or no interest. Spending past zero triggers a small overdraft-fee event rather than silently blocking the purchase.
- **Savings** — a "Transfer to Savings" activity moves money from checking; earns a modest interest rate calculated once per age-up (`balance × rate`). Withdrawal limits/penalties and tiered accounts unlocked by balance thresholds are reasonable depth to add later, not required for a first pass.
- **High-Yield Savings** — same shape as Savings but a higher rate and a minimum-balance requirement to open/maintain — the natural place to park a large emergency fund.
- **Certificates of Deposit (CDs)** — lock an amount for a term (1/3/5 years) at a fixed rate higher than savings; cashing out early costs a penalty; at maturity (checked on age-up), principal + interest returns automatically unless the player rolls it into a new CD.
- **Bank Loans** — Personal, Auto, Mortgage, Student, and Business loan types, each with its own typical rate/term range. Approval is gated by `creditScore` plus income and existing debt; missed payments hurt `creditScore` and can trigger repossession/foreclosure events, paying one off in full helps it. This is also exactly what backs Student Loans in the Higher Education system above — there's no separate student-loan architecture.
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
- **Romantic opportunities** — same as any other social platform (see Relationships & Memories → Cross-System Notes), a follow, message, or viral post can occasionally surface a potential romantic connection. Rare, and never automatic.

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

## World & Country Events

The character's country of birth (and any country they later live in or visit) shouldn't just set a cost multiplier — it should shape what's happening around them.

**Country-specific content**, driven by extensions to the existing `/data/world/countries.json`: holidays, festivals, cultural events, national celebrations, school holidays, elections, major sporting events, weather, natural disasters, economic events, and other locally-relevant happenings. Keep this data-driven — never hardcode a specific country's events directly in JavaScript.

**World events & news** — a layer that exists independently of the player, distinguishing three tiers:
1. **Purely informational news** — flavor only, no mechanical effect (an election result, a scientific discovery)
2. **News that creates a chance of a personal event** — a recession *can* trigger a parent's job loss or an investment dip, it doesn't automatically
3. **News that directly affects the player** — rare, reserved for major/life-changing-tier events

Possible categories: elections and political developments, economic recessions, wars/conflicts, pandemics, scientific/technological breakthroughs, natural disasters, major sporting events, and cultural events. Possible personal consequences when tier 2/3 news actually lands on the player: parent or player job loss, reduced income, investment losses, business problems, housing problems, or education-funding problems. Most news should stay tier 1 — see Design Philosophy for why the world shouldn't dominate every year.

**News feed** — the event feed (see UI Design) should be able to show world news alongside personal events while clearly distinguishing personal, family/NPC, school, local, and world-news entries (a different icon/style per category, matching the existing icon-by-type pattern). Weight and frequency-limit world news so it never crowds out the character's own life.

**Content additions:**
- `/data/world/holidays.json` *(new)* — per-country holiday/festival/cultural-event list, referenced by id from `countries.json`
- `/data/events/world/news.json` *(new)* — the world-news pool, tagged with its tier (informational / chance-of-personal-event / direct) and, where relevant, which personal-consequence event it can trigger

## Death & Legacy

When a character dies (old age or an event), the game doesn't just end — it offers to continue.

**On death:**
1. Check the player's living children (`relation: "child"`, `alive: true`)
2. If there are none, the life simply ends with the usual life-summary screen
3. If there are one or more, offer a choice: **Continue as [child's name]** (pick one if there's more than one) or **End this life and start a new one**

**Family-type compatibility** — every relationship type introduced above (adoptive parent, biological parent, guardian, biological/adoptive/step/foster sibling, partner, spouse) remains historically meaningful when that NPC dies: the relationship and its memories stay intact in the character's history regardless of which family-structure path produced it. Inheritance and Life Insurance payouts (Finance System) resolve exactly the same way regardless of family structure.

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

The underlying record should be capable of representing biological, adoptive, step, guardian, half-, and foster relationships without a future redesign — the MVP viewer doesn't need to render every relationship type, but the data shape shouldn't block adding that later.

## Achievements & Challenges

A lightweight, separate layer on top of everything else — a checklist of goals, most spanning a single life, a few spanning the family tree across lives.

**Achievement definition** (`achievements.json`):
```json
{ "id": "billionaire", "name": "Billionaire", "description": "Reach a net worth of $1B", "condition": { "netWorth_min": 1000000000 } }
```
Checked using the same `conditions` pattern already used for events — evaluated on age-up (or right after specific triggers like a birth, a career promotion, a death) rather than every frame. Examples that fall out naturally from the systems already built: "Become a billionaire," "Have 3 kids with 3 different partners," "Retire before 40," "Get elected President," "Own 5 properties."

A few more fall out naturally from this revision's systems: "Adopted at birth," "Reunited with biological family," "Raised by a guardian," "Graduated college without student debt," "Passed a GED after dropping out," "Returned to college after dropping out," "Achieved a childhood aspiration," "Maintained a friendship for decades," "Met a spouse through the Dating App," "Married a same-sex partner," "Remained single for an entire life," "Reconnected with an ex years later."

**On completion:** a small notification, and the achievement gets added to a persistent list in the same cross-life `meta_save.js` storage as the Family Tree above — a few achievements ("unlock every Special Career across all your lives") are meant to span more than one life.

**Rewards:** keep it to bragging rights for a first pass — a checklist with no gameplay effect. Small permanent perks unlocked by achievements are a reasonable stretch goal later, not something to design up front.

**Content additions:** `/data/achievements/achievements.json`

## UI Design — Match BitLife's Look

BitLife's whole visual identity is built around a single phone-shaped screen, so even though this is a desktop app, the window itself should stay narrow and portrait — don't build a wide desktop layout and shrink BitLife's UI into a corner of it.

**Layout, top to bottom:**
- **Character portrait** — a flat-vector cartoon avatar that swaps at each life stage (see Aging & Appearance System), with hair gradually graying with age and cosmetic procedures able to offset the decline. Name and age shown right above or below it; tapping the portrait/name is the natural entry point into the Personality/Identity/Bio screen (dominant traits, Zodiac Sign, Sexuality — see those sections).
- **Stat bars** — four horizontal bars directly under the portrait, each a fixed color: Health (red/pink), Happiness (yellow), Smarts (blue), Looks (purple/magenta). A fifth bar appears contextually — gold for Fame once a character is famous, a different color for political Approval.
- **Money** — shown as a plain text line/label, not a bar; reflects the checking account balance specifically. The fuller financial picture (savings, investments, property, insurance) lives in the new Bank screen — see Finance System.
- **Event feed** — a scrolling, chat-log-style list filling the middle of the screen. Each year's events appear as separate text lines, each with a small icon for the event type (job, birth, death, crime, world news, etc.), newest entry at the bottom, auto-scrolls down as new lines are added.
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

## Data Model Reference

A consolidated summary of the fields this revision adds across the character, NPC, education, and relationship objects — the authoritative shape for each still lives in its own section above; this is just a single place to check for consistency before adding a new field elsewhere.

**Character — new top-level fields:**
```
birthDate                          // exact random birth date
birthCountry, birthLocation        // country (existing) + optional city
zodiacSign                         // derived from birthDate
birthCircumstances                 // conception-circumstance id (Character Creation)
familyStructure                    // household-structure id at birth (Character Creation)
parentReferences[]                 // active/raising parent(s) or guardian(s)
biologicalParentReferences[]       // present only when different from parentReferences (adoption/foster)
guardianReferences[]               // present only for guardianship households
siblingReferences[]                // sibling NPC ids, each tagged with relationshipType
aspirations[]                      // { id, text, category, state, createdAge, resolvedAge }
educationHistory[]                 // append-only log, see School System
sexualOrientation                  // see Sexuality
```

**NPC — new/extended fields** (extends the existing NPC object from NPC Life Events):
```
relationshipType     // biological | adoptive | step | foster | guardian | half | null
sexualOrientation    // same enum as the character
attraction           // present only where relevant (romantic-interest NPCs)
```

**Education history entry:**
```
{ institution, type, startAge, endAge, status, major, credits, degree, gpa }
```

**Relationship fields** (on a romantic-interest NPC, alongside the existing `closeness`/`memories`):
```
{ relationshipType, closeness, attraction, romanticInterest, status, startedAt, endedAt, memories[] }
```

Only add a field when a section above actually reads or writes it — this list should never grow ahead of the systems that use it.

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
        infant.json         # infancy/toddler events (ages 0-4)
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
      /romance                # dating/romance flavor pools, see Relationships & Memories
        random_encounters.json
        dating_app.json
        casual_encounters.json
      /school
        roster_changes.json   # classmate roster churn pool
        college_life.json      # college flavor-event pool
      /crime
        prison_life.json      # prison-specific event pool
      /pets
        pet_events.json
      /world
        news.json             # world-news pool, tagged by tier
      npc_life.json         # family/friend background-life events
      family_changes.json   # household-change event pool (job changes, moves, divorce, etc.)
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
      ged.json                 # GED eligibility, prep requirements, pass/fail odds
    /world
      countries.json        # shared destination/birth/relocation pool, cost multiplier, flavor tag
      holidays.json          # per-country holidays/festivals/cultural events
    /character_creation
      wealth_tiers.json     # the four starting-family wealth tiers and what each grants
      birth_circumstances.json  # conception-circumstance pool and weights
      family_structures.json     # starting household-structure pool and weights
    /aspirations
      aspirations.json      # aspiration pool by life stage/category
    /sexuality
      orientations.json     # centrally-defined sexual-orientation list
    /appearance
      /avatars              # life-stage avatar image set (SVG), per gender
    /achievements
      achievements.json     # achievement list with declarative conditions
    names.json
```

## System Dependencies

A quick reference for what has to exist before what — useful when deciding build order (below) or when a new system's events start referencing another system's data.

```
Birth (Character Creation)
  → NPC generation, Family, Wealth, Personality, World/country

Infancy events
  → Event engine, Personality, Family, NPCs

School
  → NPCs, Personality, Relationships, Education

Persistent classmates
  → NPCs, School, Relationships, Memories, World/location

Higher Education
  → Education, Finance, Family, Scholarships, Student loans

Aspirations
  → Personality, Talents, Education, Careers, Relationships, Life events

Adoption / foster / guardianship
  → NPCs, Family, Relationships, Memories, Family Tree

GED
  → Education, Career eligibility, College admission

College dropout / return
  → Education history, Finance (student debt), Career eligibility, Future education

Sexuality
  → Dating pool, Dating App, Attraction, Relationships, Marriage, Family

Dating
  → NPCs, Sexuality, Personality, Relationships, Memories, Marriage, Family

Vacation romance
  → Vacation System, NPCs, Relationships, Dating, Location

Everyday money
  → Careers, Finance, Education, Housing, Family, Crime, Relationships, Assets, Death & Legacy
```

## Current Implementation Status

This document describes the intended *full* game. The actual `src/` implementation is still early — treat everything above as planned design unless it's listed here.

**Built so far:**
- Skeleton age-up loop (character portrait, stat bars, money, event feed, Age Up button)
- Character creation: player-picked country of birth and gender, randomly-rolled family wealth tier (family circumstances only — the character's personal `money` starts at $0 regardless of tier) — the *basic* version from the Character Creation section above, not yet the expanded Birth Details/Family Circumstances/Adoption/Foster/Guardianship content added in this revision
- 15 hand-written age-up events across the childhood/teen/adult age brackets, using the real event schema (`conditions`, `choices[]`, `effects`, `next_event`) and a working bottom-sheet choice modal
- One working `next_event` chain (proving the follow-up-event mechanism works)
- Six primary stat bars (Health/Happiness/Smarts/Looks/Fame/Reputation) — Fame and Reputation are UI/data foundation only (both start at 0, no gameplay system moves them yet)
- Header/navigation pass: "One More Year" branding, a tappable avatar/name area as a future Character Profile entry point (currently a placeholder), and bottom nav consolidated to Occupation / Relationships / Activities / Social / Finance
- Settings menu with a Light/Dark/Retro theme picker, persisted via `localStorage`
- **Save/load**: the full `character` object autosaves to `localStorage` after character creation, every Age Up, and every event choice, plus a manual Save button with a toast confirmation; loading on startup resumes the saved life instead of showing character creation; New Life and Delete Save both require confirmation before replacing/clearing the save; saves carry a version number and missing fields are defaulted on load rather than crashing; corrupted save data is quarantined (not destroyed) and the player falls back to a fresh life
- GitHub Pages deployment via GitHub Actions, auto-deploying on every push to `main`

**Not yet built:** Personality, Aspirations, Infancy events, School/classmates, Higher Education, Sexuality, Dating, Marriage/Divorce/Kids, NPC background simulation, Finance, Crime, Assets, Pets, Business, Social Media, Fame/Reputation *gameplay* effects, World/Country events, Death & Legacy, Family Tree, Achievements, and the actual Character Profile screen are all still design-stage only.

Don't assume a system exists in `src/` just because it's documented above — check the Build Order below for what's actually next.

## Build Order (MVP → full game)

Steps 1–4 are already implemented (see Current Implementation Status above) and are marked ✅. Everything after that is planned, ordered by actual dependency rather than by section order in this document — review this list before starting a new step, since a step's position may have shifted as systems were added in this revision.

1. ✅ **Skeleton loop** — character creation, an "Age Up" button, stat display, no events yet. Shell already matches the BitLife layout (portrait-locked page, stat bars, bottom menu icons, cream palette).
2. ✅ **Deploy immediately** — pushed to GitHub Pages via GitHub Actions; every `git push` to `main` redeploys automatically.
3. ✅ **Character creation (basic)** — country of birth, gender, and the rolled family-wealth tier. *The expanded Birth Details/Family Circumstances/Adoption/Foster/Guardianship content from this revision is still planned — see step 5.*
4. ✅ **First age-up events** — 15 hand-written events across childhood/teen/adult, the event → choice → effect → history-log pipeline, the real bottom-sheet choice modal, and one working `next_event` chain.
5. **Birth & family generation** — expand Character Creation into the full birth announcement: exact birth date, zodiac sign, conception/family circumstances, parents (names/ages/occupations), siblings, pets, and household. Foundational for almost everything below, so it comes right after the basics.
6. **Personality foundation** — the `personality` block plus a couple of `trait_effects` on existing events. Needs to exist before Infancy/Aspirations/School start reading from it.
7. **Infancy event pool (ages 0–4)** — `infant.json`, age-appropriate choices, proving personality drift starts this early.
8. **Aspirations foundation** — the `aspirations[]` field and a handful of childhood aspiration events, now that Personality exists to feed them.
9. **Activity events** — reuse the event engine for one activity (gym is a simple first one) to confirm the activity-trigger pattern generalizes beyond age-up.
10. ✅ **Save/load** — implemented ahead of steps 5–9 (needed to actually test the deployed build without losing progress on every reload). Full `character` object saved to `localStorage` (sufficient for the current data size — no need for IndexedDB yet), autosaving after character creation, Age Up, and event choices, plus a manual save button, New Life / Delete Save with confirmation, save versioning with default-filling migration, and corrupted-save recovery. Still to verify: real iPhone Safari testing (only checked in the local dev preview and deployed desktop browser so far).
11. **Aging & appearance system** — refined life stages, avatar swap per transition, hair graying, Looks decline curve.
12. **School system** — age-gated stages, stage-specific content, clubs, and the persistent-but-changing classmate roster.
13. **Higher education** — admission, majors, GPA, Greek life, high school dropout, GED, funding (parents/scholarships/loans), leave of absence, college dropout/return, and the education history log.
14. **NPC life events** — background yearly aging, the `npc_life` pool, family household changes, and parents having additional children.
15. **Relationships & memories** — closeness, the memory log, relationship states, and one full escalation event (e.g. move-in-together) working end to end.
16. **Sexuality & dating pool** — player-selected orientation, NPC orientation generation, and dating-pool filtering.
17. **Dating** — natural encounters, attraction/dating progression, the Dating App, casual encounters, breakups and exes.
18. **Marriage, divorce & kids** — proposing, the wedding, pregnancy/adoption (including same-sex family-building paths), divorce/custody/alimony.
19. **Adoption, foster care & guardianship depth** — the knowledge-of-adoption event chain and biological-family reunion chains, now that Relationships/Memories/NPCs are in place to support them.
20. **Pets** — lightweight and mostly self-contained; a good change of pace before the bigger financial systems ahead.
21. **Basic career** — job search, a handful of regular jobs, promotion checks.
22. **Banking basics** — checking auto-opens once income exists, salary deposits, savings + interest on age-up.
23. **Teen jobs** — the 13–15 / 16–17 tiered pool, transitioning into the adult job system at 18.
24. **Sideline system** — second job slot, sideline pool, overwork drain and burnout event.
25. **Special careers** — the ladder-based careers, then Streamer and ESports Pro as their own ladders.
26. **Crime & prison** — the general Crime activity and arrest/trial/prison flow, then the Organized Crime career on the same engine.
27. **Business system** — start-from-scratch and buy-existing flows, yearly management, the business event pool.
28. **Investing system** — Stocks + one Index Fund first, then Bonds, Mutual Funds, Real Estate, and Crypto.
29. **Assets** — cars and valuables, plus the net-worth rollup.
30. **Everyday income & expenses** — automatic recurring-expense resolution and the financial age-up summary, now that most income/expense sources actually exist.
31. **Social media system** — account creation, posting, engagement rolls, follower growth/decay. Start with Twitch, since Streamer depends on it.
32. **Monetization & scandals** — sponsorships, ad revenue, viral controversy events.
33. **Fame & recognition events** — the public-recognition roll and its posted-outcome branch.
34. **Cosmetic procedures** — botox, facelift, hair dye/transplant, and the botched-procedure/Scandal tie-in.
35. **Vacation trip builder** — country/flight-class/accommodation picker, tiered event pool, vacation romance hook into the Dating system.
36. **World & country events** — country-specific holidays/cultural events and the world-news layer, now that there's a real event feed and enough systems for news to meaningfully affect.
37. **Insurance system** — Health first (hooks into aging/health events already built), then Auto/Home/Disability, then Life last since its payout needs Death & Legacy.
38. **Death & legacy** — continue-as-child flow, inheritance, and life insurance payout, now covering every family-structure type from this revision.
39. **Family tree viewer** — the cross-life log and viewer screen.
40. **Achievements & challenges** — checked against everything built above.
41. **Content pass** — bulk out every event/career/social/vacation/school/business/finance/crime/pet/romance/world JSON library.
42. **Polish** — animations, transitions, sound, icon set refinement.

## Tips for Working with Claude Code on This

- Ask it to scaffold just a bare click-to-age-up loop first, as plain HTML/CSS/JS. Don't let it write events or UI polish before that loop runs.
- Keep all event content in JSON, never hardcoded in JS — it's much easier to bulk-generate more events later (for both you and Claude Code) if the schema is consistent from the start.
- Init a git repo immediately and commit often. Game-logic changes are easy to regression-test if you can diff them.
- Once the event schema is stable, you can ask Claude Code to generate a batch of 20-30 events at once for a given age bracket rather than one at a time.
- Test on your actual iPhone early and often, not just desktop Chrome — layout quirks (safe-area insets around the notch/home indicator, tap-target sizing, `localStorage` limits) only show up on the real device.
- This document is now the single source of truth for every schema (event fields, personality traits, NPC memory format, job data shapes). Keep it updated as the schemas evolve in code, and paste the relevant section back into a fresh Claude Code session rather than assuming it remembers earlier ones — with this many interlocking systems, a stale shared understanding of a schema is the most likely source of bugs.
- Build and test each new system (personality, memories, teen jobs, vacation) against a couple of hand-written fake events before generating a full content library for it — much cheaper to catch a schema mistake in 3 events than in 100.
- After a plan revision like this one, re-read the whole document before generating new content — cross-references between sections (e.g. Sexuality → Dating Pool, Character Creation → NPC Life Events) are easy to miss if you only skim the section you're about to implement.
