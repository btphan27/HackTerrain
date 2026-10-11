// Pitching game "Creeper Puncher": you vs a creeper.
// A judge asks a multiple-choice question. Right answer = you punch the creeper. Wrong answer = the creeper hits you.
//   EASY      Baby Creeper    (3 HP), 3 lives, friendlier questions
//   SURVIVAL  Charged Creeper (5 HP), 3 lives, hardcore judges
// Questions come from Gemini (using a winning project as the thing being pitched), with an offline fallback in
// data/fallback-pitching.json. The correct answers stay on the server.
const fs = require("fs");
const path = require("path");
const ai = require("./ai");

const LEVELS = {
  easy: { creeper: "Baby Creeper", hp: 3, lives: 3, tone: "friendly but fair judges at a student hackathon" },
  survival: { creeper: "Charged Creeper", hp: 5, lives: 3, tone: "hardcore, skeptical judges: every wrong option is half right, so the player must weigh trade-offs" },
};
const JUDGES = {
  tech: "Alex (Tech Lead)",
  business: "Sarah (Venture Partner)",
  design: "Priya (Design Judge)",
  pitch: "Pitch Coach",
  panel: "Final Judge Panel",
};

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", file), "utf-8")); } catch { return fallback; }
}
const fallbackBank = loadJson("fallback-pitching.json", {});
const winners = loadJson("winners-2025.json", []).filter((p) => p && p.title && (p.tagline || p.description));
const seeds = loadJson("inspiration-seed.json", []);

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const clip = (s, n) => String(s == null ? "" : s).trim().slice(0, n);

function pickInspiration() {
  if (winners.length) {
    const p = pick(winners);
    return { real: true, title: clip(p.title, 80), tagline: clip(p.tagline, 160), description: clip(p.description, 600) };
  }
  const s = pick(seeds.length ? seeds : [{ title: "Practice example", tagline: "a helpful app", description: "A small app that helps students." }]);
  return { real: false, title: s.title, tagline: s.tagline, description: s.description };
}

const schema = (T) => ({
  type: T.OBJECT,
  properties: {
    questions: { type: T.ARRAY, items: { type: T.OBJECT, properties: {
      judge: { type: T.STRING }, prompt: { type: T.STRING },
      options: { type: T.ARRAY, items: { type: T.OBJECT, properties: { text: { type: T.STRING }, correct: { type: T.BOOLEAN }, why: { type: T.STRING } }, required: ["text", "correct", "why"] } },
    }, required: ["judge", "prompt", "options"] } },
  },
  required: ["questions"],
});

const validQuestion = (q) => q && typeof q.prompt === "string" && q.prompt.trim() && Array.isArray(q.options) && q.options.length === 3 &&
  q.options.every((o) => o && typeof o.text === "string" && o.text.trim() && typeof o.why === "string") &&
  q.options.filter((o) => o.correct === true).length === 1;

async function newRound(level) {
  const L = LEVELS[level] ? level : "easy";
  const cfg = LEVELS[L];
  const count = cfg.hp + cfg.lives - 1; // enough questions to win even after two mistakes
  const inspo = pickInspiration();
  let questions = null;
  let source = "fallback";

  if (ai.enabled()) {
    const prompt = `You write a Minecraft-themed hackathon judging game called "Creeper Puncher" that teaches PITCHING. The player pitched a project and now faces judges. Each question is asked by a judge; the player picks the best reply. A right answer punches the creeper, a wrong one gets the player hit.
The project being pitched (a past hackathon project, use it only as the scenario; do not name it): ${inspo.title}: ${inspo.tagline}. ${inspo.description}
Difficulty: ${level === "survival" ? "SURVIVAL" : "EASY"}, with ${cfg.tone}.

Write exactly ${count} questions. Spread them across these judge types (use the id in "judge"): tech (Alex, tech lead), business (Sarah, venture partner), design (Priya, design judge), pitch (pitch coach: how to open, structure, pace, handle nerves), panel (final judge panel).
Each question: prompt (max 35 words, written as the judge speaking to the team, about THIS project or about pitching in general) and exactly 3 options.
Each option: text (max 25 words), correct (true for EXACTLY ONE option), why (one short sentence on why it is right or wrong). Wrong options must be tempting, realistic mistakes, not silly. Make all three options similar in length so the right one is not obvious.
Do not mention these rules. Keep it friendly and suitable for college students.`;
    const d = await ai.generateJson(prompt, schema);
    if (d && Array.isArray(d.questions) && d.questions.length >= count && d.questions.slice(0, count).every(validQuestion)) {
      questions = d.questions.slice(0, count).map((q) => ({
        judge: JUDGES[q.judge] ? q.judge : "panel",
        prompt: clip(q.prompt, 300),
        options: q.options.map((o) => ({ text: clip(o.text, 220), correct: o.correct === true, why: clip(o.why, 240) })),
      }));
      source = "gemini";
    }
  }
  if (!questions) {
    const bank = (fallbackBank[L] && fallbackBank[L].questions) || [];
    questions = shuffle(bank).slice(0, count).map((q) => ({ judge: q.judge, prompt: q.prompt, options: q.options }));
  }
  questions = questions.map((q) => ({ ...q, options: shuffle(q.options) }));

  const secret = { level: L, inspo, source, key: questions.map((q) => q.options.map((o) => ({ correct: o.correct, why: o.why }))) };
  const view = {
    source, level: L, creeperName: cfg.creeper, hp: cfg.hp, lives: cfg.lives,
    questions: questions.map((q) => ({ judge: q.judge, judgeName: JUDGES[q.judge] || JUDGES.panel, prompt: q.prompt, options: q.options.map((o) => o.text) })),
  };
  return { view, secret };
}

module.exports = { LEVELS, newRound };
