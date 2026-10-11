// Pitching game "Creeper Puncher" (pages + API).
//   Easy:     /games/pitch           -> terrain reward "easy" (nature) if you beat the Baby Creeper
//   Survival: /games/pitch-survival  -> terrain reward "hard" (buildings) if you beat the Charged Creeper
const express = require("express");
const crypto = require("crypto");
const pitching = require("../services/pitching");
const { grantReward } = require("../terrain");
const { award } = require("../db");

const TTL_MS = 2 * 60 * 60 * 1000;
const MAX_ROUNDS_PER_USER = 60;
const PAY = { easy: { reward: "easy", points: 10 }, survival: { reward: "hard", points: 40 } };

module.exports = function ({ show }) {
  const router = express.Router();
  const rounds = new Map();
  const needLogin = (req, res, next) => (req.profile ? next() : res.status(401).json({ error: "Please log in first.", login: true }));

  function sweep() {
    const now = Date.now();
    for (const [id, r] of rounds) if (now - r.at > TTL_MS) rounds.delete(id);
  }

  router.get("/games/pitch", (req, res) => show(res, "pitching", { level: "easy" }));
  router.get("/games/pitch-survival", (req, res) => show(res, "pitching", { level: "survival" }));

  router.post("/api/pitch/new", needLogin, async (req, res) => {
    const level = req.body && req.body.level === "survival" ? "survival" : "easy";
    sweep();
    let open = 0;
    for (const r of rounds.values()) if (r.sub === req.profile.sub && !r.over) open++;
    if (open >= MAX_ROUNDS_PER_USER) return res.status(429).json({ error: "Finish a few of your open games first." });
    const { view, secret } = await pitching.newRound(level); // never throws
    const id = crypto.randomUUID();
    rounds.set(id, { sub: req.profile.sub, level, view, secret, hp: view.hp, lives: view.lives, idx: 0, over: false, at: Date.now() });
    res.json({ id, ...view });
  });

  // One answer at a time. The server keeps score, so the browser can't cheat.
  router.post("/api/pitch/:id/answer", needLogin, (req, res) => {
    const r = rounds.get(req.params.id);
    if (!r || r.sub !== req.profile.sub) return res.status(404).json({ error: "Game not found (it may have expired). Start a new one." });
    if (r.over) return res.status(409).json({ error: "This fight is over." });
    const q = r.view.questions[r.idx];
    const choice = req.body && req.body.choice;
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return res.status(400).json({ error: "Pick an answer first." });

    const key = r.secret.key[r.idx];
    const correctIndex = key.findIndex((o) => o.correct);
    const correct = choice === correctIndex;
    if (correct) r.hp -= 1; else r.lives -= 1;
    r.idx += 1;
    const won = r.hp <= 0;
    const lost = !won && (r.lives <= 0 || r.idx >= r.view.questions.length);
    r.over = won || lost;

    const out = { ok: true, correct, correctIndex, why: key[choice].why, correctWhy: key[correctIndex].why, hp: r.hp, lives: Math.max(0, r.lives), over: r.over, won, next: r.idx };
    if (won) {
      const cfg = PAY[r.level];
      const result = grantReward(req.profile.sub, cfg.reward, `pitch-${r.level}:${req.params.id}`);
      award(req.profile.sub, cfg.points, `Beat the ${r.view.creeperName} in the pitching arena`, `pitch-${r.level}:${req.params.id}`);
      out.reward = result.reward; out.points = cfg.points;
    }
    if (r.over) out.inspiredBy = { title: r.secret.inspo.title, tagline: r.secret.inspo.tagline, real: !!r.secret.inspo.real };
    res.json(out);
  });

  return router;
};
