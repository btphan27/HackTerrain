// Challenge generator (teammate's Gemini code, ported to CommonJS).
// Uses Gemini when GEMINI_API_KEY is set; otherwise (or on any error) it falls back
// to the ready-made challenges in data/fallback.json. It never throws.
const fs = require("fs");
const path = require("path");

const TOPICS = [
  { id: "problem-solving", name: "Problem solving",
    focus: "breaking down a hard technical or logistical obstacle and finding a workable solution under pressure" },
  { id: "teamwork", name: "Team work",
    focus: "dividing roles, communicating, resolving disagreements, and integrating work from several people" },
  { id: "pitching", name: "Pitching",
    focus: "explaining a project clearly and persuasively in 2 to 3 minutes" },
];
const DIFFICULTIES = ["easy", "medium", "hard"];
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash"; // check AI Studio for the current model name

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", file), "utf-8"));
  } catch {
    return [];
  }
}
const winners = loadJson("winners-2025.json"); // optional: made by scripts/prepare-data.py
const fallbacks = loadJson("fallback.json");

const pickRandom = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);

// The Gemini client is created lazily so the app still starts without the key or the package.
let client = null;
let SchemaType = null;
function getClient() {
  if (client) return client;
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const { GoogleGenAI, Type } = require("@google/genai");
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    SchemaType = Type;
    return client;
  } catch (e) {
    console.error("Gemini unavailable (is @google/genai installed?):", e.message);
    return null;
  }
}

function buildPrompt(topic, difficulty, projects) {
  const inspiration = projects
    .map((p, i) => `Project ${i + 1} (${p.title}): ${p.tagline}\n${p.description}`)
    .join("\n\n");
  return `You create practice challenges for hackathon participants.
Topic: ${topic.name} (${topic.focus}).
Difficulty: ${difficulty}.

Below are real award-winning hackathon projects. Use them only as inspiration
for realistic scenarios. Do not copy them.

${inspiration || "(no projects available, invent a realistic scenario)"}

Write ONE challenge a participant can complete.
- title: short and specific
- description: the scenario and exactly what the participant must do
- deliverable: what they should produce
- solution: a strong model answer, shown only if they give up`;
}

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("Gemini timed out")), ms))]);

function getFallback(topicId, difficulty) {
  const exact = fallbacks.filter((c) => c.topic === topicId && c.difficulty === difficulty);
  const sameTopic = fallbacks.filter((c) => c.topic === topicId);
  const pool = exact.length ? exact : sameTopic.length ? sameTopic : fallbacks;
  return pool.length
    ? pickRandom(pool, 1)[0]
    : { topic: topicId, difficulty, title: "Challenge unavailable", description: "Please try again.",
        timeLimitMinutes: 10, deliverable: "n/a", solution: "n/a" };
}

async function generateChallenge(topicId, difficulty) {
  const topic = TOPICS.find((t) => t.id === topicId);
  const ai = getClient();
  if (ai) {
    try {
      const schema = {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING }, description: { type: SchemaType.STRING },
          timeLimitMinutes: { type: SchemaType.INTEGER }, deliverable: { type: SchemaType.STRING },
          solution: { type: SchemaType.STRING },
        },
        required: ["title", "description", "timeLimitMinutes", "deliverable", "solution"],
      };
      const response = await withTimeout(
        ai.models.generateContent({
          model: MODEL,
          contents: buildPrompt(topic, difficulty, pickRandom(winners, 3)),
          config: { responseMimeType: "application/json", responseSchema: schema },
        }),
        15000
      );
      const data = JSON.parse(response.text);
      return { topic: topicId, difficulty, source: "gemini", ...data };
    } catch (err) {
      console.error("Gemini failed, using fallback:", err.message);
    }
  }
  return { ...getFallback(topicId, difficulty), topic: topicId, difficulty, source: "fallback" };
}

module.exports = { TOPICS, DIFFICULTIES, generateChallenge };
