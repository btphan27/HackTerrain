import { Router } from "express";
import { randomUUID } from "node:crypto";
import { TOPICS, DIFFICULTIES, generateChallenge } from "../services/gemini.js";

const router = Router();
const store = new Map();

router.get("/topics", (req, res) => {
  res.json(TOPICS.map(({ id, name }) => ({ id, name })));
});

router.post("/games/generate", async (req, res) => {
  const { topic, difficulty } = req.body;
  if (!TOPICS.some((t) => t.id === topic)) {
    return res.status(400).json({ error: "Unknown topic" });
  }
  if (!DIFFICULTIES.includes(difficulty)) {
    return res.status(400).json({ error: "Unknown difficulty" });
  }
  const full = await generateChallenge(topic, difficulty);
  const id = randomUUID();
  store.set(id, full);
  const { solution, ...publicChallenge } = full;
  res.json({ id, ...publicChallenge });
});

router.get("/games/:id/solution", (req, res) => {
  const challenge = store.get(req.params.id);
  if (!challenge) return res.status(404).json({ error: "Game not found" });
  res.json({ solution: challenge.solution });
});

export default router;