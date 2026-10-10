import fs from "node:fs";
import { GoogleGenAI, Type } from "@google/genai";

export const TOPICS = [
  { id: "problem-solving", name: "Problem solving",
    focus: "breaking down a hard technical or logistical obstacle and finding a workable solution under pressure" },
  { id: "teamwork", name: "Team work",
    focus: "dividing roles, communicating, resolving disagreements, and integrating work from several people" },
  { id: "project-brainstorming", name: "Project brainstorming",
    focus: "generating, comparing, and choosing a strong project idea" },
  { id: "mvp", name: "Minimum viable product",
    focus: "cutting an idea down to the smallest version that can be built and demoed in 24 to 48 hours" },
  { id: "pitching", name: "Pitching",
    focus: "explaining a project clearly and persuasively in 2 to 3 minutes" },
];
export const DIFFICULTIES = ["easy", "medium", "hard"];

const MODEL = "gemini-2.5-flash"; // check AI Studio for the current model name
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function loadJson(path) {
  try {
    return JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf-8"));
  } catch {
    return [];
  }
}
const winners = loadJson("../data/winners-2025.json");
const fallbacks = loadJson("../data/fallback-challenges.json");

function pickRandom(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

const schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    timeLimitMinutes: { type: Type.INTEGER },
    deliverable: { type: Type.STRING },
    solution: { type: Type.STRING },
  },
  required: ["title", "description", "timeLimitMinutes", "deliverable", "solution"],
};

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

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Gemini timed out")), ms)),
  ]);
}

function getFallback(topicId, difficulty) {
  const exact = fallbacks.filter((c) => c.topic === topicId && c.difficulty === difficulty);
  const sameTopic = fallbacks.filter((c) => c.topic === topicId);
  const pool = exact.length ? exact : sameTopic.length ? sameTopic : fallbacks;
  return pool.length
    ? pickRandom(pool, 1)[0]
    : { topic: topicId, difficulty, title: "Challenge unavailable",
        description: "Please try again.", timeLimitMinutes: 10,
        deliverable: "n/a", solution: "n/a" };
}

export async function generateChallenge(topicId, difficulty) {
  const topic = TOPICS.find((t) => t.id === topicId);
  try {
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
    return { ...getFallback(topicId, difficulty), source: "fallback" };
  }
}