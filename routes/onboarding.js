const express = require("express");
const { db, award, giveBadge } = require("../db");
const t = require("../teamdata");
const Avatar = require("../public/js/avatar.js");

const TITLES = [
  "About you",
  "Where you're from",
  "Your hackathon style",
  "Your skills",
  "Hackathons you're interested in",
  "Find teammates",
];
const TOTAL = TITLES.length;

const clean = (v, max) => (v || "").toString().trim().slice(0, max);
const toArray = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const idsOf = (list) => list.map((x) => x.id);

// Each step validates and saves its own answers.
// Returns { error, draft } on a problem, or {} on success.
const handlers = {
  // 1: username, name, bio
  1: (req) => {
    const username = (req.body.username || "").trim().toLowerCase();
    const display_name = clean(req.body.display_name, 50);
    const bio = clean(req.body.bio, 200);
    const avatar = Avatar.fromChoices({
      skin: req.body.a_skin, hair: req.body.a_hair, style: req.body.a_style,
      shirt: req.body.a_shirt, bg: req.body.a_bg, acc: req.body.a_acc,
    });
    const draft = { username, display_name, bio, avatar };
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return { draft, error: "Username must be 3-20 characters: letters, numbers, or underscores." };
    }
    try {
      db.prepare("UPDATE users SET username=?, display_name=?, bio=?, avatar=? WHERE sub=?")
        .run(username, display_name, bio, avatar, req.profile.sub);
    } catch (e) {
      if (e.code === "SQLITE_CONSTRAINT_UNIQUE") return { draft, error: "That username is taken." };
      throw e;
    }
    return {};
  },

  // 2: school, major, city
  2: async (req) => {
    const school = clean(req.body.school, 80);
    const major = clean(req.body.major, 80);
    const city = clean(req.body.city, 80);
    let lat = req.profile.lat;
    let lng = req.profile.lng;
    if (city !== req.profile.city) {
      const geo = city ? await t.geocode(city) : null;
      lat = geo ? geo.lat : null;
      lng = geo ? geo.lng : null;
    }
    db.prepare("UPDATE users SET school=?, major=?, city=?, lat=?, lng=? WHERE sub=?")
      .run(school, major, city, lat, lng, req.profile.sub);
    return {};
  },

  // 3: experience, goal, roles
  3: (req) => {
    const experience = clean(req.body.experience, 20);
    const goal = clean(req.body.goal, 20);
    const roles = toArray(req.body.roles).filter((r) => idsOf(t.ROLES).includes(r));
    const draft = { experience, goal, roles };
    if (experience && !idsOf(t.EXPERIENCE).includes(experience)) return { draft, error: "Pick one of the experience options." };
    if (goal && !idsOf(t.GOALS).includes(goal)) return { draft, error: "Pick one of the goal options." };
    db.prepare("UPDATE users SET experience=?, goal=?, roles=? WHERE sub=?")
      .run(experience, goal, roles.join(","), req.profile.sub);
    return {};
  },

  // 4: skills (preset checkboxes + custom ones typed in)
  4: (req) => {
    const custom = clean(req.body.custom_skills, 400);
    const parsed = t.parseSkills(req.body.skills, custom);
    const draft = { skills: parsed.skills, custom_skills: custom };
    if (parsed.rejected.length) {
      return { draft, error: `Couldn't use: ${parsed.rejected.join(", ")}. Use letters, numbers and + # . / & ( ) - (30 characters max).` };
    }
    if (parsed.tooMany) return { draft, error: "You can add at most 10 custom skills." };
    db.transaction(() => {
      db.prepare("DELETE FROM user_skills WHERE sub = ?").run(req.profile.sub);
      const add = db.prepare("INSERT INTO user_skills (sub, skill) VALUES (?, ?)");
      parsed.skills.forEach((x) => add.run(req.profile.sub, x));
    })();
    return {};
  },

  // 5: up to 3 hackathons they're interested in
  5: (req) => {
    const picks = toArray(req.body.hackathons);
    const draft = { hackathons: picks.map((id) => ({ id })) };
    if (picks.length > 3) return { draft, error: "Pick at most 3 hackathons." };
    const valid = new Set(t.listHackathons().map((h) => h.id));
    if (!picks.every((id) => valid.has(id))) return { draft, error: "One of those hackathons is no longer available." };
    db.transaction(() => {
      db.prepare("DELETE FROM user_hackathons WHERE sub = ?").run(req.profile.sub);
      const add = db.prepare("INSERT INTO user_hackathons (sub, hackathon_id) VALUES (?, ?)");
      picks.forEach((id) => add.run(req.profile.sub, id));
    })();
    return {};
  },

  // 6: teammate search opt-in + Discord
  6: (req) => {
    const looking = req.body.looking_for_team ? 1 : 0;
    const discord = clean(req.body.discord, 40).replace(/^@/, "").toLowerCase();
    const draft = { looking_for_team: looking, discord };
    if (discord && (!/^[a-z0-9_.]{2,32}$/.test(discord) || discord.includes(".."))) {
      return { draft, error: "Discord usernames are 2-32 characters: lowercase letters, numbers, underscores, periods." };
    }
    db.prepare("UPDATE users SET looking_for_team=?, discord=? WHERE sub=?").run(looking, discord, req.profile.sub);
    return {};
  },
};

module.exports = function ({ requireLogin, show }) {
  const router = express.Router();

  function render(res, req, step, error = null, draft = {}) {
    const me = t.getProfile(req.profile.sub);
    const near = me.lat != null ? { lat: me.lat, lng: me.lng } : null;
    show(res, "onboarding", {
      step,
      total: TOTAL,
      titles: TITLES,
      error,
      profile: { ...me, ...draft },
      options: {
        experience: t.EXPERIENCE,
        roles: t.ROLES,
        goals: t.GOALS,
        skills: t.SKILLS,
        hackathons: t.listHackathons({}, near),
        hasLocation: !!near,
        regions: t.REGIONS,
        tags: t.HACK_TAGS,
      },
    });
  }

  const parseStep = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= TOTAL ? n : null;
  };

  // /onboarding resumes where the user left off
  router.get("/onboarding", requireLogin, (req, res) => {
    if (req.profile.onboarded) return res.redirect("/profile");
    res.redirect("/onboarding/" + (parseStep(req.profile.onboarding_step) || 1));
  });

  // Any step can be opened directly (also used to retake the survey later)
  router.get("/onboarding/:step", requireLogin, (req, res) => {
    const step = parseStep(req.params.step);
    if (!step) return res.redirect("/onboarding");
    render(res, req, step);
  });

  router.post("/onboarding/:step", requireLogin, async (req, res) => {
    const step = parseStep(req.params.step);
    if (!step) return res.redirect("/onboarding");

    // Step 1 is required; every other step can be skipped
    const skipping = !!req.body.skip && step > 1;
    if (!skipping) {
      const { error, draft } = await handlers[step](req);
      if (error) {
        res.status(400);
        return render(res, req, step, error, draft);
      }
    }

    if (step < TOTAL) {
      db.prepare("UPDATE users SET onboarding_step = MAX(onboarding_step, ?) WHERE sub = ?")
        .run(step + 1, req.profile.sub);
      return res.redirect("/onboarding/" + (step + 1));
    }

    // Last step: finish. Reward only the first time.
    const sub = req.profile.sub;
    const row = db.prepare("SELECT onboarded, username FROM users WHERE sub = ?").get(sub);
    if (!row.onboarded) {
      db.transaction(() => {
        db.prepare("UPDATE users SET onboarded = 1 WHERE sub = ?").run(sub);
        award(sub, 20, "Completed your profile");
        giveBadge(sub, "profile_complete");
      })();
    }
    res.redirect("/u/" + row.username);
  });

  return router;
};
