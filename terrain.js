// HackTerrain: the environment that grows as users complete challenges.
//
// HOW THE CHALLENGE CODE CONNECTS (one call, after a challenge is verified as completed):
//
//     const { grantReward } = require("./terrain");
//     const result = grantReward(sub, "easy", challengeId);   // "easy" | "medium" | "hard"
//     // result.reward -> { id, type, kind, name, emoji, rarity }   (show "You earned a Pig!")
//     // result.isNew  -> false if this challenge already gave its reward (safe to call twice)
//
// Easy challenges give nature (trees, plants, flowers), medium give animals, hard give buildings.
// The reward is picked at random (weighted: common things show up more than rare ones).
const crypto = require("crypto");
const { db } = require("./db");

db.exec(`
CREATE TABLE IF NOT EXISTS terrain_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sub TEXT NOT NULL,
  type TEXT NOT NULL,
  kind TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  source_id TEXT NOT NULL,
  x INTEGER,
  y INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (sub, source_id)
);
CREATE INDEX IF NOT EXISTS idx_terrain_sub ON terrain_items (sub);
`);
// The land is a free-form scene now: px/py are the item's position in percent (0-100).
// (The old x/y grid columns are no longer used.)
for (const col of ["px REAL", "py REAL"]) {
  try { db.exec("ALTER TABLE terrain_items ADD COLUMN " + col); } catch (e) { /* already there */ }
}

// ---------- What can be won ----------
// `type` is the stable id the theme/art uses (e.g. a Minecraft texture per type). `emoji` is a placeholder look.
// Higher `weight` = more common.
const CATALOG = {
  easy: {
    kind: "nature",
    items: [
      { type: "oak_tree", name: "Oak Tree", emoji: "🌳", weight: 30 },
      { type: "spruce_tree", name: "Spruce Tree", emoji: "🌲", weight: 25 },
      { type: "sapling", name: "Sapling", emoji: "🌱", weight: 25 },
      { type: "tall_grass", name: "Tall Grass", emoji: "🌿", weight: 25 },
      { type: "poppy", name: "Poppy", emoji: "🌺", weight: 15 },
      { type: "dandelion", name: "Dandelion", emoji: "🌼", weight: 15 },
      { type: "tulip", name: "Tulip", emoji: "🌷", weight: 15 },
      { type: "sunflower", name: "Sunflower", emoji: "🌻", weight: 12 },
      { type: "cherry_blossom", name: "Cherry Blossom", emoji: "🌸", weight: 8 },
      { type: "mushroom", name: "Mushroom", emoji: "🍄", weight: 8 },
      { type: "cactus", name: "Cactus", emoji: "🌵", weight: 8 },
      { type: "pumpkin", name: "Pumpkin", emoji: "🎃", weight: 5 },
    ],
  },
  medium: {
    kind: "animal",
    items: [
      { type: "pig", name: "Pig", emoji: "🐷", weight: 25 },
      { type: "cow", name: "Cow", emoji: "🐄", weight: 25 },
      { type: "sheep", name: "Sheep", emoji: "🐑", weight: 20 },
      { type: "chicken", name: "Chicken", emoji: "🐔", weight: 20 },
      { type: "bee", name: "Bee", emoji: "🐝", weight: 15 },
      { type: "octopus", name: "Octopus", emoji: "🐙", weight: 12 },
      { type: "rabbit", name: "Rabbit", emoji: "🐇", weight: 12 },
      { type: "fox", name: "Fox", emoji: "🦊", weight: 8 },
      { type: "wolf", name: "Wolf", emoji: "🐺", weight: 6 },
      { type: "panda", name: "Panda", emoji: "🐼", weight: 4 },
    ],
  },
  hard: {
    kind: "building",
    items: [
      { type: "house", name: "House", emoji: "🏠", weight: 30 },
      { type: "cottage", name: "Cottage", emoji: "🏡", weight: 25 },
      { type: "store", name: "Store", emoji: "🏪", weight: 22 },
      { type: "building", name: "Building", emoji: "🏢", weight: 14 },
      { type: "watchtower", name: "Watchtower", emoji: "🗼", weight: 8 },
      { type: "castle", name: "Castle", emoji: "🏰", weight: 4 },
    ],
  },
};

// ---------- How the land grows ----------
const BASE_LAND = 5; // starts as 5x5
const MAX_LAND = 12; // up to 12x12
const REWARDS_PER_EXPANSION = 2; // +1 row and column every 2 rewards

const ALIASES = { med: "medium", normal: "medium", moderate: "medium" };
const normalizeDifficulty = (d) => {
  const k = String(d || "").toLowerCase().trim();
  return ALIASES[k] || k;
};

const BY_TYPE = {};
for (const [difficulty, tier] of Object.entries(CATALOG)) {
  for (const it of tier.items) {
    BY_TYPE[it.type] = {
      ...it,
      kind: tier.kind,
      difficulty,
      rarity: it.weight >= 20 ? "common" : it.weight >= 10 ? "uncommon" : "rare",
    };
  }
}

const decorate = (row) => {
  const meta = BY_TYPE[row.type] || { name: row.type, emoji: "❓", rarity: "common" };
  return {
    id: row.id, type: row.type, kind: row.kind, difficulty: row.difficulty,
    name: meta.name, emoji: meta.emoji, rarity: meta.rarity,
    x: row.px === undefined ? null : row.px, y: row.py === undefined ? null : row.py,
  };
};

function weightedPick(items) {
  const total = items.reduce((n, i) => n + i.weight, 0);
  let r = crypto.randomInt(total);
  for (const i of items) {
    if ((r -= i.weight) < 0) return i;
  }
  return items[items.length - 1];
}

const totalItems = (sub) => db.prepare("SELECT COUNT(*) AS n FROM terrain_items WHERE sub = ?").get(sub).n;
const landSizeFor = (count) => Math.min(MAX_LAND, BASE_LAND + Math.floor(count / REWARDS_PER_EXPANSION));
const landSize = (sub) => landSizeFor(totalItems(sub));

// ---------- THE FUNCTION THE CHALLENGE CODE CALLS ----------
function grantReward(sub, difficulty, sourceId) {
  const diff = normalizeDifficulty(difficulty);
  const tier = CATALOG[diff];
  if (!tier) throw new Error(`grantReward: difficulty must be easy, medium or hard (got "${difficulty}")`);
  if (!sub || sourceId === undefined || sourceId === null || sourceId === "") {
    throw new Error("grantReward needs a user id (sub) and a challenge id");
  }
  const source = String(sourceId);

  // Same challenge twice = same reward, never a second one (and no re-rolling)
  const existing = db.prepare("SELECT * FROM terrain_items WHERE sub = ? AND source_id = ?").get(sub, source);
  if (existing) {
    return { isNew: false, reward: decorate(existing), placed: existing.px != null, landSize: landSize(sub), expanded: false };
  }

  const before = landSize(sub);
  const pick = weightedPick(tier.items);
  const info = db
    .prepare("INSERT INTO terrain_items (sub, type, kind, difficulty, source_id) VALUES (?, ?, ?, ?, ?)")
    .run(sub, pick.type, tier.kind, diff, source);
  const placed = false; // new items wait in the inventory until the player drops them on the land
  const row = db.prepare("SELECT * FROM terrain_items WHERE id = ?").get(info.lastInsertRowid);
  const after = landSize(sub);
  return { isNew: true, reward: decorate(row), placed, landSize: after, expanded: after > before };
}

// ---------- Reading ----------
function getTerrain(sub) {
  const items = db.prepare("SELECT * FROM terrain_items WHERE sub = ? ORDER BY id").all(sub).map(decorate);
  const count = items.length;
  const size = landSizeFor(count);
  return {
    landSize: size,
    maxLand: MAX_LAND,
    items,
    placed: items.filter((i) => i.x !== null),
    inventory: items.filter((i) => i.x === null),
    counts: {
      nature: items.filter((i) => i.kind === "nature").length,
      animal: items.filter((i) => i.kind === "animal").length,
      building: items.filter((i) => i.kind === "building").length,
      total: count,
    },
    nextExpansionIn: size >= MAX_LAND ? null : REWARDS_PER_EXPANSION - (count % REWARDS_PER_EXPANSION),
  };
}

const getSummary = (sub) => {
  const t = getTerrain(sub);
  return { ...t.counts, landSize: t.landSize };
};

// ---------- Customising ----------
// x and y are percentages of the scene (0 = left/top, 100 = right/bottom). The item stands with its feet at that point.
const MIN_Y = 30; // keep things out of the sky
function place(sub, id, x, y) {
  const item = db.prepare("SELECT id FROM terrain_items WHERE id = ? AND sub = ?").get(id, sub);
  if (!item) return { status: 404, error: "Item not found." };
  if (![x, y].every(Number.isFinite) || x < 0 || x > 100 || y < MIN_Y || y > 100) {
    return { status: 400, error: "That spot is outside your land." };
  }
  db.prepare("UPDATE terrain_items SET px = ?, py = ?, x = NULL, y = NULL WHERE id = ?")
    .run(Math.round(x * 10) / 10, Math.round(y * 10) / 10, id);
  return { ok: true };
}

function remove(sub, id) {
  const r = db.prepare("UPDATE terrain_items SET px = NULL, py = NULL, x = NULL, y = NULL WHERE id = ? AND sub = ?").run(id, sub);
  return r.changes ? { ok: true } : { status: 404, error: "Item not found." };
}

module.exports = { grantReward, getTerrain, getSummary, place, remove, CATALOG, BASE_LAND, MAX_LAND };