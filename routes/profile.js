const express = require("express");
const { db, getStats } = require("../db");
const t = require("../teamdata");
const terrain = require("../terrain");

module.exports = function ({ requireLogin, show }) {
  const router = express.Router();

  // /profile sends you to your own public page
  router.get("/profile", requireLogin, (req, res) => {
    res.redirect("/u/" + req.profile.username);
  });

  // Public profile page (anyone can view)
  router.get("/u/:username", (req, res) => {
    // email, sub, lat and lng are deliberately NOT selected
    const row = db
      .prepare(
        `SELECT sub, username, display_name, picture, avatar, bio, created_at,
                school, major, city, looking_for_team, discord,
                experience, goal, roles
         FROM users WHERE username = ?`
      )
      .get(req.params.username.toLowerCase());
    if (!row) return res.status(404).send("User not found");

    const stats = getStats(row.sub);
    const badges = db
      .prepare(
        `SELECT b.id, b.name, b.description, ub.earned_at
         FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
         WHERE ub.sub = ? ORDER BY ub.earned_at DESC`
      )
      .all(row.sub);
    const recent = db
      .prepare("SELECT points, reason, created_at FROM activity WHERE sub = ? ORDER BY id DESC LIMIT 10")
      .all(row.sub);

    const isOwner = !!(req.profile && req.profile.sub === row.sub);
    const { sub, ...profile } = row;

    // Discord: only for logged-in viewers, and only if the owner is recruiting (or it's you)
    profile.discord = req.profile && (isOwner || row.looking_for_team) ? row.discord : null;

    const roleIds = (row.roles || "").split(",").filter(Boolean);
    profile.roles = roleIds.map((r) => t.label(t.ROLES, r));
    profile.experience = t.label(t.EXPERIENCE, row.experience);
    profile.goal = t.label(t.GOALS, row.goal);

    show(res, "profile", {
      profile, stats, badges, recent, isOwner,
      skills: t.getSkills(row.sub),
      hackathons: t.getHackathons(row.sub),
      terrain: terrain.getSummary(row.sub),
    });
  });

  // Account settings: username, name, bio
  router.get("/settings", requireLogin, (req, res) => {
    show(res, "settings", { profile: req.profile, error: null });
  });

  router.post("/settings", requireLogin, (req, res) => {
    const username = (req.body.username || "").trim().toLowerCase();
    const display_name = (req.body.display_name || "").trim().slice(0, 50);
    const bio = (req.body.bio || "").trim().slice(0, 200);
    const draft = { ...req.profile, username, display_name, bio };

    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return show(res, "settings", {
        profile: draft,
        error: "Username must be 3-20 characters: letters, numbers, or underscores.",
      });
    }

    try {
      db.prepare("UPDATE users SET username = ?, display_name = ?, bio = ? WHERE sub = ?")
        .run(username, display_name, bio, req.profile.sub);
      res.redirect("/u/" + username);
    } catch (e) {
      if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return show(res, "settings", { profile: draft, error: "That username is taken." });
      }
      throw e;
    }
  });

  return router;
};
