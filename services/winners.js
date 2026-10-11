// Live source of real winning hackathon projects: calls the Hugging Face datasets-server API
// (twangodev/devpost-hacks) and keeps a pool in memory. The games ask for one project per round and hand it to Gemini
// as the scenario for the questions. If the API is slow/unreachable, falls back to data/winners-2025.json (if you ran
// `npm run fetch-winners`), and the games then fall back to the practice ideas.
// Turn live calls off with HF_LIVE=0 in .env. Optional HF_TOKEN avoids rate limits.
const fs = require("fs");
const log = require("./log");
const path = require("path");

const API = process.env.HF_API || "https://datasets-server.huggingface.co";
const DATASET = "twangodev/devpost-hacks";
const LIVE = process.env.HF_LIVE !== "0";
const FILE = path.join(__dirname, "..", "data", "winners-2025.json");
const headers = process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : {};
const MAX_POOL = 400;

const clean = (s) => String(s || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
const good = (p) => p && p.title && (p.tagline || p.description);

let pool = [];
try { const d = JSON.parse(fs.readFileSync(FILE, "utf-8")); if (Array.isArray(d)) pool = d.filter(good); } catch { /* no file yet */ }
if (pool.length) log("Dataset", `loaded ${pool.length} saved winners from data/winners-2025.json`);
if (!LIVE) log("Dataset", "live Hugging Face calls are OFF (HF_LIVE=0)");

let configs = null;
let filling = null;
let lastFail = 0;

async function getJson(url, ms = 8000) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}
const rowsUrl = (config, offset, length) =>
  `${API}/rows?dataset=${encodeURIComponent(DATASET)}&config=${encodeURIComponent(config)}&split=train&offset=${offset}&length=${length}`;

async function loadConfigs() {
  if (configs) return configs;
  const d = await getJson(`${API}/splits?dataset=${encodeURIComponent(DATASET)}`);
  const names = [...new Set((d.splits || []).filter((s) => s.split === "train").map((s) => s.config))].filter((n) => n !== "all");
  if (!names.length) throw new Error("no hackathons listed");
  return (configs = names);
}

// Fetch one random page of 100 projects from a random hackathon and keep the winners.
async function refill() {
  if (!LIVE) return 0;
  if (filling) return filling;
  filling = (async () => {
    try {
      log("Dataset", `calling Hugging Face API (${DATASET}) for winning projects...`);
      const names = await loadConfigs();
      const config = names[Math.floor(Math.random() * names.length)];
      const head = await getJson(rowsUrl(config, 0, 1));
      const total = head.num_rows_total || 1;
      const offset = Math.floor(Math.random() * Math.max(1, total - 100));
      const page = await getJson(rowsUrl(config, offset, 100));
      let added = 0;
      for (const { row } of page.rows || []) {
        const description = clean(row.description);
        if (row.is_winner !== true || description.length < 200 || !row.title) continue;
        if (pool.some((p) => p.title === clean(row.title) && p.hackathon === config)) continue;
        pool.push({ hackathon: config, title: clean(row.title), tagline: clean(row.tagline), description: description.slice(0, 1200), url: row.url || "" });
        added++;
      }
      if (pool.length > MAX_POOL) pool = pool.slice(-MAX_POOL);
      lastFail = 0;
      log("Dataset", `got ${added} new winners from "${config}" (pool: ${pool.length})`);
      return added;
    } catch (e) {
      lastFail = Date.now();
      log("Dataset", `Hugging Face API FAILED (${log.why(e)}). Using saved/practice projects.`);
      return 0;
    } finally {
      filling = null;
    }
  })();
  return filling;
}

// One real winning project, or null. Waits at most `waitMs` the very first time (pool empty).
async function randomWinner(waitMs = 5000) {
  if (LIVE && Date.now() - lastFail > 60000) {
    if (!pool.length) await Promise.race([refill(), new Promise((r) => setTimeout(r, waitMs))]);
    else if (pool.length < 30 || Math.random() < 0.3) refill(); // top up in the background for variety
  }
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

module.exports = { randomWinner, refill, count: () => pool.length };
