const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
// On a host with a persistent disk, point DB_PATH at it (e.g. /var/data/app.db). Locally it stays app.db.
const DB_PATH = process.env.DB_PATH || "app.db";
fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  sub TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  email TEXT,
  picture TEXT,
  bio TEXT DEFAULT '',
  country TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sub TEXT NOT NULL,
  points INTEGER NOT NULL,
  reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS completions (
  sub TEXT NOT NULL,
  item_id TEXT NOT NULL,
  completed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sub, item_id)
);
CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT
);
CREATE TABLE IF NOT EXISTS user_badges (
  sub TEXT NOT NULL,
  badge_id TEXT NOT NULL,
  earned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sub, badge_id)
);
`);

// Badges available in the app (edit freely)
const seed = db.prepare("INSERT OR IGNORE INTO badges (id, name, description) VALUES (?, ?, ?)");
[
  ["first_steps", "First Steps", "Completed your first challenge"],
  ["century", "Century", "Reached 100 points"],
  ["on_fire", "On Fire", "Kept a 3-day streak"],
  ["profile_complete", "Ready to Hack", "Finished setting up your profile"],
].forEach((b) => seed.run(...b));

const RANKS = ["Noob", "Script Kiddie", "Hacker", "Pro Hacker", "Elite", "Guru", "Omniscient"];

// Create a profile row the first time someone logs in
function getOrCreateUser(authUser) {
  const existing = db.prepare("SELECT * FROM users WHERE sub = ?").get(authUser.sub);
  if (existing) return existing;

  let base = (authUser.nickname || (authUser.email || "user").split("@")[0])
    .toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16);
  if (base.length < 3) base += "user";

  let username = base;
  let n = 1;
  const taken = db.prepare("SELECT 1 FROM users WHERE username = ?");
  while (taken.get(username)) username = base + ++n;

  db.prepare(
    "INSERT INTO users (sub, username, display_name, email, picture) VALUES (?, ?, ?, ?, ?)"
  ).run(authUser.sub, username, authUser.name || username, authUser.email || "", authUser.picture || "");

  return db.prepare("SELECT * FROM users WHERE sub = ?").get(authUser.sub);
}

function getStreak(sub) {
  const days = db
    .prepare("SELECT DISTINCT date(created_at) AS d FROM activity WHERE sub = ? ORDER BY d DESC")
    .all(sub)
    .map((r) => r.d);
  if (!days.length) return 0;

  const DAY = 86400000;
  const toMs = (d) => Date.parse(d + "T00:00:00Z");
  const today = toMs(new Date().toISOString().slice(0, 10));
  let cursor = toMs(days[0]);
  if (today - cursor > DAY) return 0; // streak broken

  let streak = 0;
  for (const d of days) {
    if (toMs(d) === cursor) { streak++; cursor -= DAY; } else break;
  }
  return streak;
}

function getStats(sub) {
  const points = db.prepare("SELECT COALESCE(SUM(points), 0) AS p FROM activity WHERE sub = ?").get(sub).p;
  const completed = db.prepare("SELECT COUNT(*) AS c FROM completions WHERE sub = ?").get(sub).c;

  const level = Math.floor(Math.sqrt(points / 100)) + 1;
  const levelStart = (level - 1) ** 2 * 100;
  const nextLevelAt = level ** 2 * 100;
  const progress = Math.round(((points - levelStart) / (nextLevelAt - levelStart)) * 100);

  return {
    points,
    completed,
    level,
    rank: RANKS[Math.min(level - 1, RANKS.length - 1)],
    nextLevelAt,
    progress, // 0-100, for a progress bar
    streak: getStreak(sub),
  };
}

function giveBadge(sub, id) {
  db.prepare("INSERT OR IGNORE INTO user_badges (sub, badge_id) VALUES (?, ?)").run(sub, id);
}

// Call this from the code that verifies a challenge was really completed
function award(sub, points, reason) {
  db.prepare("INSERT INTO activity (sub, points, reason) VALUES (?, ?, ?)").run(sub, points, reason);
  const s = getStats(sub);
  if (s.completed >= 1) giveBadge(sub, "first_steps");
  if (s.points >= 100) giveBadge(sub, "century");
  if (s.streak >= 3) giveBadge(sub, "on_fire");
}

module.exports = { db, getOrCreateUser, getStats, award, giveBadge };
