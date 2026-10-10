const { db } = require("./db");

// ---------- Schema additions (safe to run repeatedly) ----------
const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
const addCol = (name, def) => {
  if (!cols.includes(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${def}`);
};
addCol("school", "TEXT DEFAULT ''");
addCol("major", "TEXT DEFAULT ''");
addCol("city", "TEXT DEFAULT ''");
addCol("lat", "REAL");
addCol("lng", "REAL");
addCol("looking_for_team", "INTEGER DEFAULT 0");
addCol("discord", "TEXT DEFAULT ''");
addCol("onboarded", "INTEGER DEFAULT 0");
addCol("onboarding_step", "INTEGER DEFAULT 1");
addCol("experience", "TEXT DEFAULT ''");
addCol("goal", "TEXT DEFAULT ''");
addCol("roles", "TEXT DEFAULT ''"); // comma-separated role ids

db.exec(`
CREATE TABLE IF NOT EXISTS hackathons (
  id TEXT PRIMARY KEY,
  source TEXT,
  name TEXT NOT NULL,
  url TEXT,
  dates TEXT,
  location TEXT,
  is_online INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS user_hackathons (
  sub TEXT NOT NULL,
  hackathon_id TEXT NOT NULL,
  PRIMARY KEY (sub, hackathon_id)
);
CREATE TABLE IF NOT EXISTS user_skills (
  sub TEXT NOT NULL,
  skill TEXT NOT NULL,
  PRIMARY KEY (sub, skill)
);
`);

// Catalog columns added later (safe to run repeatedly)
const ensureCol = (table, name, def) => {
  const have = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!have.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
};
[
  ["country", "TEXT DEFAULT ''"],
  ["region", "TEXT DEFAULT 'other'"],
  ["format", "TEXT DEFAULT ''"],
  ["tags", "TEXT DEFAULT ''"],
  ["starts_on", "TEXT"],
  ["ends_on", "TEXT"],
  ["lat", "REAL"],
  ["lng", "REAL"],
  ["geo_tried", "INTEGER DEFAULT 0"],
  ["last_seen", "TEXT"],
].forEach(([n, d]) => ensureCol("hackathons", n, d));

// The catalog is now automatic. Remove the old hand-typed placeholder events and picks of them.
db.exec(`
DELETE FROM user_hackathons WHERE hackathon_id IN (SELECT id FROM hackathons WHERE source = 'manual');
DELETE FROM hackathons WHERE source = 'manual';
`);

// Fixed list keeps tags consistent ("js" vs "JavaScript" would never match)
const SKILLS = [
  "python", "javascript", "typescript", "java", "c++", "c#", "go", "rust", "swift", "kotlin",
  "react", "node", "html/css", "flask", "django", "sql", "mongodb", "firebase",
  "machine learning", "data science", "computer vision", "nlp", "llm apis",
  "ui/ux design", "figma", "mobile dev", "game dev", "devops", "cybersecurity",
  "hardware/iot", "cloud (aws/gcp/azure)", "product/pitching",
  "project management", "team leadership", "agile/scrum", "git/github workflow",
  "public speaking", "ideation/brainstorming", "documentation", "user research",
];

// ---------- Survey options ----------
const EXPERIENCE = [
  { id: "first", label: "This will be my first hackathon" },
  { id: "few", label: "I've done 1-3 hackathons" },
  { id: "veteran", label: "I've done 4 or more" },
];
const ROLES = [
  { id: "developer", label: "Developer (I build it)" },
  { id: "designer", label: "Designer (I make it usable and good-looking)" },
  { id: "project-manager", label: "Project manager (I keep us on track)" },
  { id: "presenter", label: "Presenter (I pitch and demo)" },
  { id: "researcher", label: "Researcher (I validate ideas and find data)" },
];
const GOALS = [
  { id: "learn", label: "Learn new skills" },
  { id: "win", label: "Win prizes" },
  { id: "network", label: "Meet people and network" },
  { id: "fun", label: "Have fun and build something cool" },
];
const label = (list, id) => (list.find((x) => x.id === id) || {}).label || "";

// ---------- Reading data ----------
const getSkills = (sub) =>
  db.prepare("SELECT skill FROM user_skills WHERE sub = ? ORDER BY skill").all(sub).map((r) => r.skill);

const getHackathons = (sub) =>
  db.prepare(
    `SELECT h.id, h.name, h.url, h.dates FROM user_hackathons uh
     JOIN hackathons h ON h.id = uh.hackathon_id WHERE uh.sub = ?`
  ).all(sub);

// ---------- Hackathon catalog ----------
const REGIONS = [
  { id: "north-america", label: "North America" },
  { id: "europe", label: "Europe / UK" },
  { id: "asia-pacific", label: "Asia Pacific" },
  { id: "other", label: "Other" },
];
const HACK_TAGS = [
  { id: "diversity", label: "Diversity-focused" },
  { id: "hardware", label: "Hardware" },
  { id: "high-school", label: "High school" },
];
const NA = ["US", "CA", "MX"];
const AP = ["IN", "SG", "AU", "NZ", "JP", "KR", "CN", "HK", "TW", "MY", "ID", "PH", "TH", "VN", "PK", "BD", "LK", "NP"];
const EU = ["GB", "IE", "FR", "DE", "ES", "PT", "IT", "NL", "BE", "CH", "AT", "SE", "NO", "DK", "FI", "PL", "CZ", "RO", "HU", "GR", "TR", "UA", "BG", "HR", "RS", "SK", "SI", "LT", "LV", "EE", "IS"];
const regionOf = (cc) =>
  NA.includes(cc) ? "north-america" : EU.includes(cc) ? "europe" : AP.includes(cc) ? "asia-pacific" : "other";

// Active events only. Optional filters: q, region, format, month (YYYY-MM), tag, radius (miles, needs `near`).
function listHackathons(filters = {}, near = null) {
  const cutoff = new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10); // keep until the day after it ends
  const rows = db
    .prepare(
      `SELECT * FROM hackathons
       WHERE last_seen >= datetime('now', '-10 days') AND (ends_on IS NULL OR ends_on >= ?)
       ORDER BY COALESCE(starts_on, '9999-12-31'), name`
    )
    .all(cutoff);

  const q = (filters.q || "").toString().trim().toLowerCase();
  const radius = Number(filters.radius) || null;
  const out = [];

  for (const r of rows) {
    const h = {
      id: r.id,
      name: r.name,
      url: r.url,
      dates: r.dates,
      location: r.location,
      country: r.country,
      region: r.region || "other",
      format: r.format,
      tags: (r.tags || "").split(",").filter(Boolean),
      starts_on: r.starts_on,
      ends_on: r.ends_on,
      month: r.starts_on ? r.starts_on.slice(0, 7) : "",
      distance: near && r.lat != null ? Math.round(distanceMiles(near.lat, near.lng, r.lat, r.lng)) : null,
    };
    if (q && !(h.name + " " + h.location).toLowerCase().includes(q)) continue;
    if (filters.region && h.region !== filters.region) continue;
    if (filters.format && h.format !== filters.format) continue;
    if (filters.month && h.month !== filters.month) continue;
    if (filters.tag && !h.tags.includes(filters.tag)) continue;
    if (radius && (h.distance === null || h.distance > radius)) continue;
    out.push(h);
  }
  return out;
}

// ---------- Skills (preset list + custom ones) ----------
const ALIASES = {
  js: "javascript", py: "python", ts: "typescript", cpp: "c++", golang: "go",
  nodejs: "node", "node.js": "node", reactjs: "react", "react.js": "react",
  html: "html/css", css: "html/css", ml: "machine learning", ux: "ui/ux design", ui: "ui/ux design",
  pm: "project management", aws: "cloud (aws/gcp/azure)", gcp: "cloud (aws/gcp/azure)", azure: "cloud (aws/gcp/azure)",
};

function normalizeSkill(raw) {
  let s = String(raw || "").toLowerCase().replace(/\s+/g, " ").trim();
  s = ALIASES[s] || s;
  return /^[a-z0-9][a-z0-9 +#.\/&()\-]{0,29}$/.test(s) ? s : null;
}

// checked: values from the checkboxes, custom: free text like "unity, solidity"
function parseSkills(checked, custom) {
  const out = new Set();
  const rejected = [];
  (checked === undefined ? [] : Array.isArray(checked) ? checked : [checked]).forEach((c) => {
    if (SKILLS.includes(c)) out.add(c);
  });
  String(custom || "")
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((raw) => {
      const sk = normalizeSkill(raw);
      if (sk) out.add(sk);
      else rejected.push(raw.slice(0, 30));
    });
  const skills = [...out];
  const tooMany = skills.filter((x) => !SKILLS.includes(x)).length > 10;
  return { skills, rejected, tooMany };
}

function getProfile(sub) {
  const user = db.prepare("SELECT * FROM users WHERE sub = ?").get(sub);
  if (!user) return null;
  return {
    ...user,
    roles: (user.roles || "").split(",").filter(Boolean),
    skills: getSkills(sub),
    custom_skills: getSkills(sub).filter((x) => !SKILLS.includes(x)).join(", "),
    hackathons: getHackathons(sub),
  };
}

// ---------- Location ----------
// Free OpenStreetMap geocoder. Policy: max 1 request/second, identify your app.
async function geocode(place) {
  try {
    const r = await fetch(
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(place),
      { headers: { "User-Agent": "HackTerrain/1.0 (hackathon project)" } }
    );
    const d = await r.json();
    return d[0] ? { lat: Number(d[0].lat), lng: Number(d[0].lon) } : null;
  } catch {
    return null;
  }
}

function distanceMiles(lat1, lng1, lat2, lng2) {
  const rad = (x) => (x * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 3959 * 2 * Math.asin(Math.sqrt(a));
}

// ---------- Teammate matching ----------
function findTeammates(meSub, { radius, skill } = {}) {
  const me = getProfile(meSub);
  const others = db
    .prepare("SELECT sub FROM users WHERE looking_for_team = 1 AND sub != ?")
    .all(meSub);

  const results = [];
  for (const { sub } of others) {
    const p = getProfile(sub);

    let distance = null;
    if (me.lat != null && p.lat != null) distance = distanceMiles(me.lat, me.lng, p.lat, p.lng);

    if (radius && (distance === null || distance > radius)) continue;
    if (skill && !p.skills.includes(skill)) continue;

    const sharedSkills = p.skills.filter((s) => me.skills.includes(s));
    const myHackIds = me.hackathons.map((h) => h.id);
    const sharedHackathons = p.hackathons.filter((h) => myHackIds.includes(h.id)).map((h) => h.name);
    const sameSchool = !!me.school && me.school.toLowerCase() === p.school.toLowerCase();
    const sameMajor = !!me.major && me.major.toLowerCase() === p.major.toLowerCase();

    const score =
      sharedHackathons.length * 3 + sharedSkills.length * 2 + (sameSchool ? 2 : 0) + (sameMajor ? 1 : 0);

    // Public fields only: no email, no exact coordinates
    results.push({
      username: p.username,
      display_name: p.display_name,
      picture: p.picture,
      school: p.school,
      major: p.major,
      city: p.city,
      discord: p.discord,
      experience: label(EXPERIENCE, p.experience),
      roles: p.roles.map((r) => label(ROLES, r)),
      skills: p.skills,
      sharedSkills,
      sharedHackathons,
      sameSchool,
      sameMajor,
      distance: distance === null ? null : Math.max(5, Math.round(distance / 5) * 5), // rounded for privacy
      score,
    });
  }
  return results.sort((a, b) => b.score - a.score);
}

module.exports = { REGIONS, HACK_TAGS, regionOf, normalizeSkill, parseSkills, EXPERIENCE, ROLES, GOALS, label, SKILLS, getSkills, getHackathons, listHackathons, getProfile, geocode, findTeammates };
