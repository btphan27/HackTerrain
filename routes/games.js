import { Router } from "express";
import { randomUUID } from "node:crypto";
import { TOPICS, DIFFICULTIES, generateChallenge } from "../services/gemini.js"; 

//idk yet
const router = Router();
const store = new Map(); // id -> full challenge, including the solution

//get request for topics on the json file from the huggingface dataset
router.get("/topics", (req, res) => {
  res.json(TOPICS.map(({ id, name }) => ({ id, name })));
});

//post the challanges to the webpage
router.post("/challenges/generate", async (req, res) => {
  const { topic, difficulty } = req.body;
  if (!TOPICS.some((t) => t.id === topic)) {
    return res.status(400).json({ error: "Unknown topic" });
  }
  if (!DIFFICULTIES.includes(difficulty)) {
    return res.status(400).json({ error: "Unknown difficulty" });
  }

  //generate challange
  const full = await generateChallenge(topic, difficulty); // never throws
  const id = randomUUID();
  store.set(id, full);

  const { solution, ...publicChallenge } = full; // hide the solution for now
  res.json({ id, ...publicChallenge });
});

//get the solution?
router.get("/challenges/:id/solution", (req, res) => {
  const challenge = store.get(req.params.id);
  if (!challenge) return res.status(404).json({ error: "Challenge not found" });
  res.json({ solution: challenge.solution });
});

export default router;