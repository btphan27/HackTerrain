// Project Brainstorming: Village Crafting, two levels (same game, survival is harder).
//   Easy:     /games/craft     -> terrain reward "easy" (nature)
//   Survival: /games/survival  -> terrain reward "hard" (buildings)
const express = require("express");
const crypto = require("crypto");
const brain = require("../services/brainstorm");
const { grantReward } = require("../terrain");
const { award } = require("../db");

const TTL_MS = 2 * 60 * 60 * 1000;
const MAX_ROUNDS_PER_USER = 60; // rounds are also made in the background, so allow plenty

// How each level maps onto the world rewards
const LEVELS = {
  easy: { reward: "easy", points: 10 },     // nature
  survival: { reward: "hard", points: 40 }, // buildings (you literally built a base)
};

module.exports = function ({ requireLogin, show }) {
  const router = express.Router();
  // API calls answer 401 (not a redirect) so the page can send the player to the login screen
  const needLogin = (req, res, next) => (req.profile ? next() : res.status(401).json({ error: "Please log in first.", login: true }));
  const rounds = new Map(); // id -> { sub, kind, view, secret, stage, ..., at }

  function sweep() {
    const now = Date.now();
    for (const [id, r] of rounds) if (now - r.at > TTL_MS) rounds.delete(id);
  }
  function mine(req, kind) {
    const r = rounds.get(req.params.id);
    return r && r.sub === req.profile.sub && r.kind === kind ? r : null;
  }
  // Read an array of chosen option numbers (0-based) from the request body, or return an error message.
  function readPicks(body, key, counts) {
    const arr = body && body[key];
    if (!Array.isArray(arr) || arr.length !== counts.length) return { error: "Please answer every question." };
    const picks = arr.map((v) => (Number.isInteger(v) ? v : -1));
    const bad = picks.findIndex((v, i) => v < 0 || v >= counts[i]);
    if (bad >= 0) return { error: `Pick an answer for question ${bad + 1}.` };
    return { picks };
  }
  function startRound(req, kind, data) {
    sweep();
    let n = 0;
    for (const r of rounds.values()) if (r.sub === req.profile.sub && !r.done) n++;
    if (n >= MAX_ROUNDS_PER_USER) return null;
    const id = crypto.randomUUID();
    rounds.set(id, { sub: req.profile.sub, kind, ...data, done: false, at: Date.now() });
    return id;
  }
  function pay(req, level, id, label) {
    const cfg = LEVELS[level];
    const result = grantReward(req.profile.sub, cfg.reward, `brainstorm-${level}:${id}`);
    award(req.profile.sub, cfg.points, label);
    return { reward: result.reward, points: cfg.points };
  }
  const inspiredBy = (r) => ({ title: r.secret.inspo.title, tagline: r.secret.inspo.tagline, real: !!r.secret.inspo.real });

  // ---------- pages ----------
  router.get("/games/craft", (req, res) => show(res, "brainstorm-craft", { level: "easy" }));
  router.get("/games/survival", (req, res) => show(res, "brainstorm-craft", { level: "survival" }));

  // ---------- EASY: Village Crafting ----------
  router.post("/api/brainstorm/craft/new", needLogin, async (req, res) => {
    const level = req.body && req.body.level === "survival" ? "survival" : "easy";
    const { view, secret } = await brain.newCraftRound(level); // never throws
    const id = startRound(req, "craft", { view, secret, level });
    if (!id) return res.status(429).json({ error: "Finish a few of your open games first." });
    res.json({ id, ...view });
  });

  router.post("/api/brainstorm/craft/:id/craft", needLogin, (req, res) => {
    const r = mine(req, "craft");
    if (!r) return res.status(404).json({ error: "Game not found (it may have expired). Start a new one." });
    if (r.done) return res.status(409).json({ error: "This item is already crafted." });
    const t = readPicks(req.body, "answers", r.view.questions.map((q) => q.options.length));
    if (t.error) return res.status(400).json({ error: t.error });
    r.done = true;
    const verdict = brain.judgeCraft(r.secret, r.view, t.picks);
    const crafted = brain.craftedName(r.secret.itemId, verdict.stars);
    const paid = pay(req, r.level, req.params.id, `Crafted a ${crafted.name} for a villager (${r.level})`);
    res.json({ ok: true, crafted, stars: verdict.stars, right: verdict.right, results: verdict.results, feedback: verdict.feedback,
      tip: verdict.tip, villager: r.view.villager.name, ...paid, inspiredBy: inspiredBy(r) });
  });

  return router;
};
