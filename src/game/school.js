import { randInt, clampStat, generateRandomName, applyMoneyDelta } from "./character.js";
import { createSocialNpc, registerDynamicGenerators, askForHelp, ensureSocialCircle } from "./npc.js";
import { conditionsPass } from "./events.js";

// ---------- Grade/status mapping ----------
// A single, simple age->grade formula (K at 5, grade 1 at 6, ... grade 12
// at 17) rather than a lookup table, so every piece of the system that
// needs "what grade would this age be in" asks the same function instead
// of each guessing independently.

function getGradeLevelForAge(age) {
  if (age < 5 || age > 17) return null;
  return age - 5;
}

function getStatusForGrade(grade) {
  if (grade == null) return null;
  if (grade <= 5) return "elementary";
  if (grade <= 8) return "middle";
  return "high_school";
}

function getGradeLabel(grade) {
  if (grade == null) return "";
  return grade === 0 ? "Kindergarten" : `Grade ${grade}`;
}

const STATUS_LABELS = {
  not_started: "Not yet in school",
  elementary: "Elementary School",
  middle: "Middle School",
  high_school: "High School",
  graduated_hs: "Graduated High School",
  college: "College",
  workforce: "Working (no college)",
  graduated_college: "Graduated College",
};

function getStatusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

// ---------- School/teacher generation ----------

const SCHOOL_NAME_PREFIXES = [
  "Lincoln", "Washington", "Jefferson", "Roosevelt", "Kennedy", "Riverside",
  "Maple Grove", "Oakwood", "Sunnydale", "Fairview", "Cedar Hill", "Greenwood",
];

function generateSchoolName(status) {
  const prefix = SCHOOL_NAME_PREFIXES[randInt(0, SCHOOL_NAME_PREFIXES.length - 1)];
  const suffix = status === "elementary" ? "Elementary School" : status === "middle" ? "Middle School" : "High School";
  return `${prefix} ${suffix}`;
}

const TEACHER_SUBJECTS = ["Math", "English", "Science", "History", "Art"];

function generateTeacher(namePools, countryId, status) {
  const gender = Math.random() < 0.5 ? "male" : "female";
  const subject = status === "elementary" ? "Homeroom" : TEACHER_SUBJECTS[randInt(0, TEACHER_SUBJECTS.length - 1)];
  return {
    id: `teacher_${Date.now().toString(36)}_${randInt(0, 9999)}`,
    name: generateRandomName(namePools, countryId, gender),
    age: randInt(28, 60),
    subject,
    stats: {
      health: randInt(60, 100),
      happiness: randInt(50, 90),
      smarts: randInt(60, 95),
      looks: randInt(30, 70),
      fame: 0,
      reputation: randInt(50, 80),
    },
    // Starts at acquaintance-level rapport, same as every other new NPC --
    // has to be built up via Ask for Help / Thank Teacher, not assumed.
    closeness: randInt(10, 30),
  };
}

// ---------- Classmate churn ----------
// Occasional, low-probability roster change -- most classmates stay put
// most years. Reuses the exact same NPC factory the general social
// circle uses, so a "classmate" and a "friend" are never two different
// kinds of record.

const CLASSMATE_CHURN_CHANCE = 12; // percent per year while actively in school

function maybeChurnClassmates(character, namePools, countryId) {
  const circle = character.socialCircle ?? [];
  if (circle.length === 0) return null;
  if (randInt(0, 99) >= CLASSMATE_CHURN_CHANCE) return null;

  if (Math.random() < 0.6 && circle.length > 1) {
    const index = randInt(0, circle.length - 1);
    const [gone] = circle.splice(index, 1);
    const reasons = [
      `${gone.name} transferred to another school.`,
      `${gone.name}'s family moved away.`,
      `${gone.name} left to be homeschooled.`,
    ];
    return reasons[randInt(0, reasons.length - 1)];
  }

  const newcomer = createSocialNpc(namePools, countryId, character.age + randInt(-1, 1));
  circle.push(newcomer);
  return `${newcomer.name} joined your class as a new student.`;
}

// ---------- Yearly tick, called from engine.js's ageUp ----------
// Deterministic grade/status progression and GPA drift happen every year
// automatically (like job income); classmate churn is a small per-year
// chance; graduation is a one-time forced event via the existing
// pendingEventId mechanism, same as any other scripted chain.

const GPA_DRIFT_MIN = -0.15;
const GPA_DRIFT_MAX = 0.2;

function applySchoolYear(character, namePools, countryId) {
  const edu = character.education;
  const lines = [];

  // The automatic tick only manages ages 5-17; turning 18 while still in
  // high school is exactly when graduation happens, once, via the same
  // forced-event mechanism every other chain in this game already uses.
  if (character.age === 18 && edu.status === "high_school") {
    character.pendingEventId = "hs_graduation";
    return lines;
  }

  const grade = getGradeLevelForAge(character.age);
  const status = getStatusForGrade(grade);
  if (!status) return lines;

  if (edu.status !== status) {
    edu.status = status;
    edu.schoolName = generateSchoolName(status);
    // A new school level means a new teacher, but NOT a wiped social
    // circle -- classmates are the same `socialCircle` friends/crushes
    // system used everywhere else, and moving up a school level shouldn't
    // silently erase relationships (romantic or otherwise) built there.
    // Gradual turnover is handled by maybeChurnClassmates below instead.
    edu.teacher = generateTeacher(namePools, countryId, status);
    edu.gpa ??= Number((2.6 + Math.random() * 1.2).toFixed(2));
    edu.clubs = [];
    edu.extracurriculars = [];
    lines.push(
      status === "elementary"
        ? `You started school at ${edu.schoolName}.`
        : status === "middle"
          ? `You started middle school at ${edu.schoolName}.`
          : `You started high school at ${edu.schoolName}.`
    );
  }

  edu.gradeLevel = grade;

  // Populated lazily, same rule as the general social circle (age 6+,
  // no-op once already populated) -- catches a character who started
  // school too young for classmates yet as soon as they age into it.
  ensureSocialCircle(character, namePools, countryId);

  if (edu.gpa != null) {
    const smartsPull = (character.stats.smarts - 50) / 200;
    const drift = GPA_DRIFT_MIN + Math.random() * (GPA_DRIFT_MAX - GPA_DRIFT_MIN) + smartsPull;
    edu.gpa = Math.max(0, Math.min(4, Number((edu.gpa + drift).toFixed(2))));
  }

  const churnLine = maybeChurnClassmates(character, namePools, countryId);
  if (churnLine) lines.push(churnLine);

  return lines;
}

// ---------- Studying ----------

function studyHarder(character) {
  const smartsBonus = (character.stats.smarts - 50) / 10;
  const chance = Math.max(15, Math.min(85, 50 + smartsBonus * 4));
  character.stats.happiness = clampStat(character.stats.happiness - 2);

  if (randInt(0, 99) < chance) {
    const gpaGain = 0.1 + Math.random() * 0.2;
    character.education.gpa = Math.max(0, Math.min(4, Number(((character.education.gpa ?? 3) + gpaGain).toFixed(2))));
    character.stats.smarts = clampStat(character.stats.smarts + randInt(1, 3));
    const line = "You put in some real effort studying, and it showed -- your grades improved.";
    character.history.push(line);
    return line;
  }

  character.stats.smarts = clampStat(character.stats.smarts + 1);
  const line = "You studied hard, but it didn't translate into better grades this time. At least the material is starting to sink in.";
  character.history.push(line);
  return line;
}

// ---------- Clubs ----------

function getAvailableClubs(character, clubsData) {
  const joined = new Set(character.education.clubs ?? []);
  return clubsData.filter(
    (club) => character.age >= club.minAge && character.age <= club.maxAge && !joined.has(club.id) && conditionsPass(character, club.requires)
  );
}

function joinClub(character, club, namePools, countryId) {
  character.education.clubs.push(club.id);
  for (const [skill, delta] of Object.entries(club.skillGrant ?? {})) {
    character.skills[skill] = clampStat((character.skills[skill] ?? 0) + delta);
  }
  if (club.hobbyGrant && !character.hobbies.includes(club.hobbyGrant)) {
    character.hobbies.push(club.hobbyGrant);
  }
  if (club.reputationEffect) {
    character.stats.reputation = clampStat(character.stats.reputation + club.reputationEffect);
  }
  character.stats.happiness = clampStat(character.stats.happiness + 3);

  let resultText = `You joined ${club.label}.`;
  const roll = randInt(0, 99);
  if (roll < 15) {
    const newcomer = createSocialNpc(namePools, countryId, character.age + randInt(-1, 1));
    character.socialCircle = character.socialCircle ?? [];
    character.socialCircle.push(newcomer);
    resultText += ` You hit it off with a new member named ${newcomer.name}.`;
  } else if (roll < 40 && (character.socialCircle ?? []).length > 0) {
    const friend = character.socialCircle[randInt(0, character.socialCircle.length - 1)];
    friend.closeness = clampStat(friend.closeness + randInt(5, 10));
    resultText += ` You bonded with ${friend.name} over it.`;
  }

  character.history.push(resultText);
  return resultText;
}

function leaveClub(character, clubId, clubsData) {
  character.education.clubs = (character.education.clubs ?? []).filter((id) => id !== clubId);
  const club = clubsData.find((c) => c.id === clubId);
  const line = `You left ${club?.label ?? "the club"}.`;
  character.history.push(line);
  return line;
}

// ---------- Extracurriculars & tryouts ----------

function getAvailableExtracurriculars(character, activitiesData) {
  const joined = new Set(character.education.extracurriculars ?? []);
  return activitiesData.filter(
    (a) => character.age >= a.minAge && character.age <= a.maxAge && !joined.has(a.id) && conditionsPass(character, a.requires)
  );
}

function applyExtracurricularRewards(character, activity) {
  for (const [skill, delta] of Object.entries(activity.skillGrant ?? {})) {
    character.skills[skill] = clampStat((character.skills[skill] ?? 0) + delta);
  }
  if (activity.hobbyGrant && !character.hobbies.includes(activity.hobbyGrant)) {
    character.hobbies.push(activity.hobbyGrant);
  }
  character.stats.happiness = clampStat(character.stats.happiness + 4);
}

// Not deterministic either way: a highly skilled character can still
// occasionally fail a tryout, and an inexperienced one can still make it.
function attemptExtracurricular(character, activity) {
  if (!activity.tryout) {
    character.education.extracurriculars.push(activity.id);
    applyExtracurricularRewards(character, activity);
    const line = `You joined ${activity.label}.`;
    character.history.push(line);
    return { succeeded: true, resultText: line };
  }

  const relevantStat = character.stats[activity.statCheck] ?? 50;
  const skillBonus = activity.skillCheck ? (character.skills[activity.skillCheck] ?? 0) / 5 : 0;
  const chance = Math.max(10, Math.min(90, 35 + (relevantStat - 50) / 2 + skillBonus));

  if (randInt(0, 99) < chance) {
    character.education.extracurriculars.push(activity.id);
    applyExtracurricularRewards(character, activity);
    const line = `You made the ${activity.label} team after impressing the coach with your ability.`;
    character.history.push(line);
    return { succeeded: true, resultText: line };
  }

  character.stats.happiness = clampStat(character.stats.happiness - 3);
  const line = `You didn't make the ${activity.label} team. The coach felt you needed more experience.`;
  character.history.push(line);
  return { succeeded: false, resultText: line };
}

function leaveExtracurricular(character, activityId, activitiesData) {
  character.education.extracurriculars = (character.education.extracurriculars ?? []).filter((id) => id !== activityId);
  const activity = activitiesData.find((a) => a.id === activityId);
  const line = `You left ${activity?.label ?? "the activity"}.`;
  character.history.push(line);
  return line;
}

// ---------- Graduation & college (dynamic choice generators) ----------
// Registered into the shared dynamic-choice registry (npc.js) rather
// than requiring events.js/app.js to know school.js exists -- any module
// can extend the same mechanism this way.

registerDynamicGenerators({
  ask_classmate_for_help(character) {
    const circle = character.socialCircle ?? [];
    if (circle.length === 0) {
      const line = "You didn't have anyone in mind to ask, so you muddled through on your own.";
      character.history.push(line);
      return { type: "resolve", effects: { smarts: -1 }, resultText: line };
    }

    const classmate = circle[randInt(0, circle.length - 1)];
    const helperSmarts = classmate.stats?.smarts ?? 50;
    const chance = Math.max(20, Math.min(85, 40 + (helperSmarts - 50) / 2 + (classmate.closeness - 50) / 4));

    if (randInt(0, 99) < chance) {
      classmate.closeness = clampStat(classmate.closeness + 5);
      character.stats.smarts = clampStat(character.stats.smarts + 2);
      const line = `${classmate.name} walked you through the parts you were stuck on, and it really helped.`;
      character.history.push(line);
      return { type: "resolve", effects: { happiness: 2 }, resultText: line };
    }

    const line = `${classmate.name} tried to help, but honestly seemed just as confused as you were.`;
    character.history.push(line);
    return { type: "resolve", effects: {}, resultText: line };
  },

  ask_teacher_for_help(character) {
    const teacher = character.education.teacher;
    if (!teacher) {
      const line = "You didn't have a teacher available to ask, so you did your best on your own.";
      character.history.push(line);
      return { type: "resolve", effects: {}, resultText: line };
    }
    const line = askForHelp(character, teacher);
    return { type: "resolve", effects: {}, resultText: line };
  },

  teacher_praise_reveal(character) {
    const teacher = character.education.teacher;
    if (!teacher) {
      return { type: "resolve", effects: { happiness: 2 }, resultText: "A teacher complimented your work, which felt good to hear." };
    }
    teacher.closeness = clampStat(teacher.closeness + randInt(4, 8));
    character.stats.reputation = clampStat(character.stats.reputation + 2);
    const line = `${teacher.name} told you that you've been doing excellent work lately and encouraged you to keep it up.`;
    character.history.push(line);
    return { type: "resolve", effects: { happiness: 5 }, resultText: line };
  },

  hs_graduation_reveal(character) {
    const gpaText = character.education.gpa != null ? character.education.gpa.toFixed(2) : "N/A";
    return {
      type: "followUp",
      event: {
        id: "hs_graduation_choice",
        trigger: "age_up",
        conditions: { minAge: 0, maxAge: 200 },
        text: `Congratulations!\n\nYou graduated from high school!\n\nFinal GPA: ${gpaText}`,
        choices: [
          { label: "Apply to College", dynamic: "hs_graduation_college" },
          { label: "Enter the Workforce", dynamic: "hs_graduation_workforce" },
          { label: "Don't Go to College", dynamic: "hs_graduation_no_college" },
        ],
      },
    };
  },

  hs_graduation_college(character) {
    character.education.status = "college";
    return {
      type: "followUp",
      event: {
        id: "college_funding_choice",
        trigger: "age_up",
        conditions: { minAge: 0, maxAge: 200 },
        text: "How will you pay for college?",
        choices: [
          { label: "Ask Parents to Pay", dynamic: "college_fund_parents" },
          { label: "Apply for Student Loan", dynamic: "college_fund_loan" },
          { label: "Apply for Scholarship", dynamic: "college_fund_scholarship" },
        ],
      },
    };
  },

  hs_graduation_workforce(character) {
    character.education.status = "workforce";
    const line = "You decided to skip college for now and jump straight into the workforce. Time to start your career.";
    character.history.push(line);
    return { type: "resolve", effects: { happiness: 3 }, resultText: line };
  },

  hs_graduation_no_college(character) {
    character.education.status = "graduated_hs";
    const line = "You decided not to go to college, at least for now. There's no rush -- you can always change your mind later.";
    character.history.push(line);
    return { type: "resolve", effects: {}, resultText: line };
  },

  college_fund_parents(character) {
    const parents = character.family?.parents ?? [];
    const avgCloseness = parents.length > 0 ? parents.reduce((sum, p) => sum + (p.closeness ?? 50), 0) / parents.length : 50;
    const unemployedParent = parents.find((p) => !p.employed);
    const employedParent = parents.find((p) => p.employed);

    const chance = Math.max(10, Math.min(85, 35 + (avgCloseness - 50) / 2 + (employedParent ? 15 : -10)));
    if (randInt(0, 99) < chance) {
      const line = "Your parents agreed to pay your college tuition.";
      character.history.push(line);
      return { type: "resolve", effects: { happiness: 6 }, resultText: line };
    }

    let reason = "your family isn't currently able to cover the cost.";
    if (unemployedParent) {
      reason = `your ${unemployedParent.role} recently lost their job, and your family isn't currently able to cover the cost.`;
    } else if (avgCloseness < 45) {
      reason = "your relationship with them has been strained lately.";
    }
    const line = `Your parents declined to pay your tuition. Unfortunately, ${reason}`;
    character.history.push(line);
    return { type: "resolve", effects: { happiness: -4 }, resultText: line };
  },

  college_fund_loan(character) {
    const chance = Math.max(15, Math.min(90, 55 + (character.stats.smarts - 50) / 3));
    if (randInt(0, 99) < chance) {
      const amount = randInt(15, 42) * 1000;
      applyMoneyDelta(character, amount);
      const line = `Your student loan application was approved. You were approved for $${amount.toLocaleString()} in student loans.`;
      character.history.push(line);
      return { type: "resolve", effects: {}, resultText: line };
    }
    const line = "Your student loan application was rejected because you did not meet the lender's eligibility requirements.";
    character.history.push(line);
    return { type: "resolve", effects: { happiness: -2 }, resultText: line };
  },

  college_fund_scholarship(character) {
    const gpa = character.education.gpa ?? 0;
    const minGpa = 3.0;
    if (gpa < minGpa) {
      const line = `Your scholarship application was rejected because the minimum GPA requirement was ${minGpa.toFixed(1)} and your GPA was ${gpa.toFixed(1)}.`;
      character.history.push(line);
      return { type: "resolve", effects: { happiness: -2 }, resultText: line };
    }

    const hasParticipation = (character.education.extracurriculars?.length ?? 0) > 0 || (character.education.clubs?.length ?? 0) > 0;
    const competitionChance = hasParticipation ? 55 : 35;

    if (randInt(0, 99) < competitionChance) {
      const amount = randInt(3, 15) * 1000;
      applyMoneyDelta(character, amount);
      const note = hasParticipation ? " Your academic record and extracurricular involvement helped your application stand out." : "";
      const line = `You were awarded a $${amount.toLocaleString()} scholarship.${note}`;
      character.history.push(line);
      return { type: "resolve", effects: { happiness: 5, reputation: 2 }, resultText: line };
    }

    const line = "You met the scholarship's requirements, but the award was given to another applicant.";
    character.history.push(line);
    return { type: "resolve", effects: { happiness: -1 }, resultText: line };
  },
});

export {
  getGradeLevelForAge,
  getStatusForGrade,
  getGradeLabel,
  getStatusLabel,
  applySchoolYear,
  studyHarder,
  getAvailableClubs,
  joinClub,
  leaveClub,
  getAvailableExtracurriculars,
  attemptExtracurricular,
  leaveExtracurricular,
};
