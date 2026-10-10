const express = require("express");
const { db } = require("../db");
const T = require("../terrain");

module.exports = function ({ requireLogin, show }) {
  const router = express.Router();
  const DEV = process.env.TERRAIN_DEV === "true";

  // Your own terrain (full page; the home page also embeds it as a tab)
  router.get("/terrain", requireLogin, (req, res) => {
    show(res, "terrain", { terrain: T.getTerrain(req.profile.sub), owner: req.profile.username, isOwner: true });
  });

  // Anyone's terrain, read-only
  router.get("/u/:username/terrain", (req, res) => {
    const row = db.prepare("SELECT sub, username, display_name FROM users WHERE username = ?").get(req.params.username.toLowerCase());
    if (!row) return res.status(404).send("User not found");
    const isOwner = !!(req.profile && req.profile.sub === row.sub);
    show(res, "terrain", { terrain: T.getTerrain(row.sub), owner: row.username, isOwner });
  });

  // ----- JSON API (used by the page, and by a frontend if you build your own) -----
  router.get("/api/terrain", requireLogin, (req, res) => res.json(T.getTerrain(req.profile.sub)));

  router.get("/api/terrain/u/:username", (req, res) => {
    const row = db.prepare("SELECT sub FROM users WHERE username = ?").get(req.params.username.toLowerCase());
    if (!row) return res.status(404).json({ error: "User not found" });
    res.json(T.getTerrain(row.sub));
  });

  router.post("/api/terrain/place", requireLogin, (req, res) => {
    const r = T.place(req.profile.sub, Number(req.body.id), Number(req.body.x), Number(req.body.y));
    if (r.error) return res.status(r.status).json({ error: r.error });
    res.json({ ok: true, terrain: T.getTerrain(req.profile.sub) });
  });

  router.post("/api/terrain/remove", requireLogin, (req, res) => {
    const r = T.remove(req.profile.sub, Number(req.body.id));
    if (r.error) return res.status(r.status).json({ error: r.error });
    res.json({ ok: true, terrain: T.getTerrain(req.profile.sub) });
  });

  // TESTING ONLY: pretend a challenge was completed. Off unless TERRAIN_DEV=true in .env
  // (otherwise anyone could give themselves rewards).
  if (DEV) {
    router.post("/api/terrain/dev-grant", requireLogin, (req, res) => {
      const source = "dev-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      try {
        const result = T.grantReward(req.profile.sub, req.body.difficulty, source);
        res.json({ ...result, terrain: T.getTerrain(req.profile.sub) });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    });
    console.log("Terrain: DEV grant endpoint is ON (TERRAIN_DEV=true). Turn it off before your demo.");
  }

  return router;
};
