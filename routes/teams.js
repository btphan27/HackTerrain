const express = require("express");
const { db } = require("../db");
const t = require("../teamdata");

const clean = (v, max) => (v || "").toString().trim().slice(0, max);
const toArray = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

// The viewer's saved location (if any), used for "within X miles" on the catalog
const nearOf = (profile) => (profile && profile.lat != null ? { lat: profile.lat, lng: profile.lng } : null);

const filtersFrom = (q) => ({
  q: clean(q.q, 60),
  region: t.REGIONS.some((r) => r.id === q.region) ? q.region : "",
  format: ["in-person", "online", "hybrid"].includes(q.format) ? q.format : "",
  month: /^\d{4}-\d{2}$/.test(q.month || "") ? q.month : "",
  tag: t.HACK_TAGS.some((x) => x.id === q.tag) ? q.tag : "",
  radius: [25, 50, 100, 250, 500].includes(Number(q.radius)) ? Number(q.radius) : "",
});

module.exports = function ({ requireLogin, show }) {
  const router = express.Router();

  function pickerData(profileRow) {
    const near = nearOf(profileRow);
    return { hackathons: t.listHackathons({}, near), hasLocation: !!near, regions: t.REGIONS, tags: t.HACK_TAGS };
  }

  router.get("/settings/team", requireLogin, (req, res) => {
    const profile = t.getProfile(req.profile.sub);
    show(res, "team-settings", { profile, allSkills: t.SKILLS, error: null, ...pickerData(profile) });
  });

  router.post("/settings/team", requireLogin, async (req, res) => {
    const sub = req.profile.sub;
    const school = clean(req.body.school, 80);
    const major = clean(req.body.major, 80);
    const city = clean(req.body.city, 80);
    const discord = clean(req.body.discord, 40).replace(/^@/, "").toLowerCase();
    const looking = req.body.looking_for_team ? 1 : 0;
    const custom = clean(req.body.custom_skills, 400);
    const parsed = t.parseSkills(req.body.skills, custom);
    const picks = t.parsePicks(req.body);

    const fail = (error) => {
      const profile = {
        ...t.getProfile(sub), school, major, city, discord, looking_for_team: looking,
        skills: parsed.skills, custom_skills: custom, hackathons: picks,
      };
      res.status(400);
      show(res, "team-settings", { profile, allSkills: t.SKILLS, error, ...pickerData(req.profile) });
    };

    if (parsed.rejected.length) {
      return fail(`Couldn't use these skills: ${parsed.rejected.join(", ")}. Use letters, numbers and + # . / & ( ) - (30 characters max).`);
    }
    if (parsed.tooMany) return fail("You can add at most 10 custom skills.");
    if (picks.length > t.MAX_PICKS) return fail("Pick at most " + t.MAX_PICKS + " hackathons.");
    const validIds = new Set(t.listHackathons().map((h) => h.id));
    if (!picks.every((p) => validIds.has(p.id))) return fail("One of those hackathons is no longer available.");
    if (discord && (!/^[a-z0-9_.]{2,32}$/.test(discord) || discord.includes(".."))) {
      return fail("Discord usernames are 2-32 characters: lowercase letters, numbers, underscores, periods.");
    }

    // Only look up coordinates when the city actually changed
    let lat = req.profile.lat;
    let lng = req.profile.lng;
    if (city !== req.profile.city) {
      const geo = city ? await t.geocode(city) : null;
      lat = geo ? geo.lat : null;
      lng = geo ? geo.lng : null;
    }

    db.transaction(() => {
      db.prepare(
        "UPDATE users SET school=?, major=?, city=?, lat=?, lng=?, looking_for_team=?, discord=? WHERE sub=?"
      ).run(school, major, city, lat, lng, looking, discord, sub);

      db.prepare("DELETE FROM user_skills WHERE sub = ?").run(sub);
      const addSkill = db.prepare("INSERT INTO user_skills (sub, skill) VALUES (?, ?)");
      parsed.skills.forEach((x) => addSkill.run(sub, x));

      t.savePicks(sub, picks, [...validIds]);
    })();

    res.redirect("/u/" + req.profile.username);
  });

  // /teammates?radius=50&skill=python
  router.get("/teammates", requireLogin, (req, res) => {
    const radius = Number(req.query.radius) || null;
    const skill = t.normalizeSkill(req.query.skill) || null;
    const me = t.getProfile(req.profile.sub);
    const matches = t.findTeammates(req.profile.sub, { radius, skill });
    show(res, "teammates", { matches, filters: { radius, skill }, allSkills: t.SKILLS, hasLocation: me.lat != null });
  });

  // Public catalog page: /hackathons?q=hack&region=europe&format=in-person&month=2026-11&tag=diversity&radius=100&page=2
  const PER_PAGE = 12;
  router.get("/hackathons", (req, res) => {
    const filters = filtersFrom(req.query);
    const near = nearOf(req.profile);
    const all = t.listHackathons({}, near);
    const matches = t.listHackathons(filters, near);
    const pages = Math.max(1, Math.ceil(matches.length / PER_PAGE));
    const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), pages);
    // the filters as a query string, so the Previous/Next links keep them
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== "")).toString();
    show(res, "hackathons", {
      hackathons: matches.slice((page - 1) * PER_PAGE, page * PER_PAGE),
      total: matches.length, totalActive: all.length, page, pages, qs,
      months: [...new Set(all.map((h) => h.month).filter(Boolean))],
      filters, regions: t.REGIONS, tags: t.HACK_TAGS, hasLocation: !!near,
    });
  });

  // Same data as JSON, same filters
  router.get("/api/hackathons", (req, res) => res.json(t.listHackathons(filtersFrom(req.query), nearOf(req.profile))));

  return router;
};
