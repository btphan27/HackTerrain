const express = require("express");
const crypto = require("crypto");
const { TOPICS, DIFFICULTIES, generateChallenge } = require("../services/challenges");
const { grantReward } = require("../terrain");
const { award } = require("../db");

const POINTS = { easy: 10, medium: 20, hard: 40 };
const TTL_MS = 2 * 60 * 60 * 1000; // forget challenges after 2 hours
const MIN_ANSWER = 40;             // characters needed before a challenge counts as attempted

module.exports = function ({ requireLogin }) {
  const router = express.Router();
  const store = new Map(); // id -> { sub, full, revealed, done, at }

  function sweep() {
    const now = Date.now();
    for (const [id, c] of store) if (now - c.at > TTL_MS) store.delete(id);
  }

  router.get("/api/topics", (req, res) => {
    res.json(TOPICS.map(({ id, name }) => ({ id, name })));
  });

  // Logged in only: each call may use Gemini quota
  router.post("/api/challenges/generate", requireLogin, async (req, res) => {
    const { topic, difficulty } = req.body || {};
    if (!TOPICS.some((t) => t.id === topic)) return res.status(400).json({ error: "Unknown topic" });
    if (!DIFFICULTIES.includes(difficulty)) return res.status(400).json({ error: "Unknown difficulty" });
    sweep();
    const full = await generateChallenge(topic, difficulty); // never throws
    const id = crypto.randomUUID();
    store.set(id, { sub: req.profile.sub, full, revealed: false, done: false, at: Date.now() });
    const { solution, ...publicChallenge } = full; // the solution stays on the server
    res.json({ id, ...publicChallenge });
  });

  // Giving up shows the model answer, but that challenge no longer earns a reward
  router.get("/api/challenges/:id/solution", requireLogin, (req, res) => {
    const c = store.get(req.params.id);
    if (!c || c.sub !== req.profile.sub) return res.status(404).json({ error: "Challenge not found" });
    c.revealed = true;
    res.json({ solution: c.full.solution });
  });

  // Submit your own answer -> terrain reward (easy = nature, medium = animals, hard = buildings)
  router.post("/api/challenges/:id/complete", requireLogin, (req, res) => {
    const c = store.get(req.params.id);
    if (!c || c.sub !== req.profile.sub) return res.status(404).json({ error: "Challenge not found (it may have expired)" });
    if (c.done) return res.status(409).json({ error: "You already finished this challenge." });
    if (c.revealed) return res.status(409).json({ error: "You looked at the solution, so this one has no reward. Generate a new challenge!" });
    const answer = String((req.body && req.body.answer) || "").trim();
    if (answer.length < MIN_ANSWER) {
      return res.status(400).json({ error: `Write your answer first (at least ${MIN_ANSWER} characters).` });
    }
    c.done = true;
    const difficulty = c.full.difficulty;
    const result = grantReward(req.profile.sub, difficulty, "challenge:" + req.params.id);
    award(req.profile.sub, POINTS[difficulty] || 10, `Completed a ${difficulty} challenge: ${c.full.title}`);
    res.json({ ok: true, reward: result.reward, points: POINTS[difficulty] || 10 });
  });

  return router;
};
