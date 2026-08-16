import { randInt, applyMoneyDelta, formatMoney, pushHistory, generateRandomName, MIN_EARNING_AGE } from "./character.js";

// Small, fixed, stable content -- same "lives as a hardcoded module, not a
// fetched JSON file" convention as personality.js's TRAITS and school.js's
// MAJORS/COLLEGE_TIERS. Originally replaced Odd Jobs' service-type content
// (babysitting, lawn mowing, dog walking, tutoring, car washing, snow
// shoveling, and the various "freelance work online" entries, now
// consolidated into freelance_writing) -- One-Time Jobs, which the
// non-service windfalls moved to at the time, has since been retired
// entirely as redundant with this system.
const FREELANCE_SERVICES = [
  { id: "babysitting", label: "Babysitting", minAge: 14, minRate: 10, maxRate: 25, hoursMin: 3, hoursMax: 15, hiredPhrase: "hired you to babysit their kids" },
  { id: "lawn_mowing", label: "Lawn Mowing", minAge: 14, minRate: 10, maxRate: 20, hoursMin: 2, hoursMax: 10, hiredPhrase: "hired you to mow their lawn" },
  { id: "dog_walking", label: "Dog Walking", minAge: 14, minRate: 8, maxRate: 18, hoursMin: 2, hoursMax: 12, hiredPhrase: "hired you to walk their dog" },
  { id: "pet_sitting", label: "Pet Sitting", minAge: 14, minRate: 10, maxRate: 20, hoursMin: 3, hoursMax: 14, hiredPhrase: "hired you to pet-sit while they were away" },
  { id: "tutoring", label: "Tutoring", minAge: 14, minRate: 15, maxRate: 35, hoursMin: 3, hoursMax: 12, hiredPhrase: "hired you as a tutor" },
  { id: "house_cleaning", label: "House Cleaning", minAge: 14, minRate: 12, maxRate: 25, hoursMin: 2, hoursMax: 10, hiredPhrase: "hired you to clean their house" },
  { id: "car_washing", label: "Car Washing", minAge: 14, minRate: 8, maxRate: 16, hoursMin: 2, hoursMax: 8, hiredPhrase: "hired you to wash their cars" },
  { id: "snow_shoveling", label: "Snow Shoveling", minAge: 14, minRate: 10, maxRate: 20, hoursMin: 2, hoursMax: 8, hiredPhrase: "hired you to shovel snow" },
  { id: "freelance_writing", label: "Freelance Writing & Online Work", minAge: 16, minRate: 15, maxRate: 45, hoursMin: 4, hoursMax: 20, hiredPhrase: "hired you for freelance work online" },
];

// Caps the yearly total -- character.freelanceGigsCompletedThisYear, reset
// at the top of every Age Up (engine.js).
const YEARLY_FREELANCE_GIG_CAP = 3;

function isFreelanceCapReached(character) {
  return (character.freelanceGigsCompletedThisYear ?? 0) >= YEARLY_FREELANCE_GIG_CAP;
}

function getEligibleFreelanceServices(character) {
  if (character.age < MIN_EARNING_AGE) return [];
  if (isFreelanceCapReached(character)) return [];
  return FREELANCE_SERVICES.filter((service) => character.age >= service.minAge);
}

// Unlike One-Time Jobs' pass-through payout, Freelance Gigs are instant but
// not free-form: the player sets their own rate (clamped to the service's
// realistic range), then "posting the ad" rolls how many hours the gig
// actually ran and who hired them -- no simulated waiting, since this game
// only ticks in whole years; the resolution itself, including the client
// showing up, all happens the moment the ad is posted. Always succeeds (no
// application roll), so every call here is a real completion and the cap
// counter can increment unconditionally -- a rejected attempt never reaches
// this function in the first place.
//
// Returns the individual pieces (client, hours, rate, earnings) rather than
// just the prose line, so a caller can render them as a structured result
// card (app.js) instead of only the single sentence also pushed to history.
function postFreelanceAd(character, service, rate, namePools, countryId) {
  const clampedRate = Math.max(service.minRate, Math.min(service.maxRate, Math.round(rate)));
  const hours = randInt(service.hoursMin, service.hoursMax);
  const earnings = Math.round(hours * clampedRate);
  applyMoneyDelta(character, earnings);

  const clientGender = Math.random() < 0.5 ? "male" : "female";
  const clientName = generateRandomName(namePools, countryId, clientGender);

  character.freelanceGigsCompletedThisYear = (character.freelanceGigsCompletedThisYear ?? 0) + 1;

  const rateFormatted = `${formatMoney(clampedRate, character.currencyCode)}/hr`;
  const earningsFormatted = formatMoney(earnings, character.currencyCode);
  const line = `${clientName} ${service.hiredPhrase} for ${hours} hours. You earned ${earningsFormatted} (${rateFormatted}).`;
  pushHistory(character, line);
  return { line, clientName, hours, rate: clampedRate, rateFormatted, earnings, earningsFormatted };
}

export { FREELANCE_SERVICES, YEARLY_FREELANCE_GIG_CAP, isFreelanceCapReached, getEligibleFreelanceServices, postFreelanceAd };
