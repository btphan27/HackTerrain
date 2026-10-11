// Hackathons hosted on HackOrGoHome: stored here, shown on their own themed page (/e/<slug>),
// and copied into the hackathons catalog table so they appear in the catalog, the picker and team matching.
const { db } = require("./db");
const t = require("./teamdata"); // makes sure the hackathons table exists

db.exec(`
CREATE TABLE IF NOT EXISTS hosted_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_sub TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  location TEXT DEFAULT '',
  format TEXT DEFAULT 'in-person',
  region TEXT DEFAULT 'north-america',
  description TEXT DEFAULT '',
  reg_url TEXT DEFAULT '',
  theme TEXT DEFAULT 'meadow',
  schedule TEXT DEFAULT '[]',
  quests TEXT DEFAULT '[]',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS event_registrations (
  event_id INTEGER NOT NULL,
  sub TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, sub)
);
`);

const THEMES = [
  { id: "meadow", label: "Meadow", blurb: "Soft pastel sky" },
  { id: "forest", label: "Forest", blurb: "Fresh greens" },
  { id: "ocean", label: "Ocean", blurb: "Cool aqua" },
  { id: "sunset", label: "Sunset", blurb: "Warm peach" },
  { id: "cave", label: "Cave", blurb: "Dark and gold" },
  { id: "nether", label: "Nether", blurb: "Fiery red" },
  { id: "arcade", label: "Arcade", blurb: "Neon on black" },
];
const FORMATS = [
  { id: "in-person", label: "In person" },
  { id: "online", label: "Online" },
  { id: "hybrid", label: "Hybrid" },
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const clean = (v, max) => (v === undefined || v === null ? "" : String(v)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);

function datesLabel(start, end) {
  const [y, m, d] = start.split("-").map(Number);
  if (!end || end === start) return `${MONTHS[m - 1]} ${d}, ${y}`;
  const [y2, m2, d2] = end.split("-").map(Number);
  if (y === y2 && m === m2) return `${MONTHS[m - 1]} ${d}–${d2}, ${y}`;
  if (y === y2) return `${MONTHS[m - 1]} ${d} – ${MONTHS[m2 - 1]} ${d2}, ${y}`;
  return `${MONTHS[m - 1]} ${d}, ${y} – ${MONTHS[m2 - 1]} ${d2}, ${y2}`;
}

// Turns what the form sent into clean values, or an error message.
function validate(b) {
  b = b || {};
  const name = clean(b.name, 80);
  if (!name) return { error: "Give your hackathon a name." };
  const starts_on = clean(b.starts_on, 10);
  if (!isDate(starts_on)) return { error: "Pick the date your hackathon starts." };
  let ends_on = clean(b.ends_on, 10);
  if (ends_on) {
    if (!isDate(ends_on)) return { error: "The end date isn't a valid date." };
    if (ends_on < starts_on) return { error: "The end date can't be before the start date." };
  } else ends_on = starts_on;
  const format = FORMATS.some((f) => f.id === b.format) ? b.format : "in-person";
  const region = t.REGIONS.some((r) => r.id === b.region) ? b.region : "north-america";
  const reg_url = clean(b.reg_url, 300);
  if (reg_url && !/^https?:\/\/[^\s]+$/i.test(reg_url)) return { error: "The registration link needs to start with http:// or https://" };
  const theme = THEMES.some((x) => x.id === b.theme) ? b.theme : "meadow";
  const schedule = (Array.isArray(b.schedule) ? b.schedule : []).slice(0, 40)
    .map((s) => ({ time: /^([01]\d|2[0-3]):[0-5]\d$/.test((s && s.time) || "") ? s.time : "", activity: clean(s && s.activity, 100) }))
    .filter((s) => s.activity);
  schedule.sort((a, c) => (a.time === c.time ? 0 : a.time === "" ? 1 : c.time === "" ? -1 : a.time < c.time ? -1 : 1));
  const quests = (Array.isArray(b.quests) ? b.quests : []).slice(0, 30).map((q) => clean(q, 100)).filter(Boolean);
  return {
    value: { name, starts_on, ends_on, location: clean(b.location, 120), format, region,
      description: clean(b.description, 1500), reg_url, theme, schedule, quests },
  };
}

const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "event";
function uniqueSlug(name) {
  for (let i = 0; i < 20; i++) {
    const slug = slugify(name) + "-" + Math.random().toString(36).slice(2, 6);
    if (!db.prepare("SELECT 1 FROM hosted_events WHERE slug = ?").get(slug)) return slug;
  }
  return slugify(name) + "-" + Date.now().toString(36);
}

function hydrate(r) {
  if (!r) return null;
  let schedule = [], quests = [];
  try { schedule = JSON.parse(r.schedule || "[]"); } catch (e) {}
  try { quests = JSON.parse(r.quests || "[]"); } catch (e) {}
  return { ...r, schedule, quests, dates: datesLabel(r.starts_on, r.ends_on) };
}

// Mirror the event into the catalog table
function syncCatalog(ev) {
  const loc = ev.location || (ev.format === "online" ? "Online" : "");
  db.prepare(
    `INSERT INTO hackathons (id, source, name, url, dates, location, country, region, format, tags, starts_on, ends_on, is_online, last_seen, updated_at, lat, lng, geo_tried)
     VALUES (@id, 'hosted', @name, @url, @dates, @location, '', @region, @format, '', @starts_on, @ends_on, @is_online, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL, 0)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, url = excluded.url, dates = excluded.dates, location = excluded.location,
       region = excluded.region, format = excluded.format, starts_on = excluded.starts_on, ends_on = excluded.ends_on,
       is_online = excluded.is_online, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
       lat = NULL, lng = NULL, geo_tried = 0`
  ).run({
    id: "hosted-" + ev.id, name: ev.name, url: "/e/" + ev.slug, dates: datesLabel(ev.starts_on, ev.ends_on),
    location: loc, region: ev.region, format: ev.format, starts_on: ev.starts_on, ends_on: ev.ends_on,
    is_online: ev.format === "online" ? 1 : 0,
  });
}

function create(ownerSub, v) {
  const slug = uniqueSlug(v.name);
  const info = db.prepare(
    `INSERT INTO hosted_events (owner_sub, slug, name, starts_on, ends_on, location, format, region, description, reg_url, theme, schedule, quests)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(ownerSub, slug, v.name, v.starts_on, v.ends_on, v.location, v.format, v.region, v.description, v.reg_url, v.theme,
    JSON.stringify(v.schedule), JSON.stringify(v.quests));
  const ev = getById(Number(info.lastInsertRowid));
  syncCatalog(ev);
  return ev;
}

function update(id, ownerSub, v) {
  const cur = getById(id);
  if (!cur || cur.owner_sub !== ownerSub) return null;
  db.prepare(
    `UPDATE hosted_events SET name=?, starts_on=?, ends_on=?, location=?, format=?, region=?, description=?, reg_url=?, theme=?, schedule=?, quests=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).run(v.name, v.starts_on, v.ends_on, v.location, v.format, v.region, v.description, v.reg_url, v.theme,
    JSON.stringify(v.schedule), JSON.stringify(v.quests), id);
  const ev = getById(id);
  syncCatalog(ev);
  return ev;
}

function remove(id, ownerSub) {
  const cur = getById(id);
  if (!cur || cur.owner_sub !== ownerSub) return false;
  db.prepare("DELETE FROM hosted_events WHERE id = ?").run(id);
  db.prepare("DELETE FROM user_hackathons WHERE hackathon_id = ?").run("hosted-" + id);
  db.prepare("DELETE FROM event_registrations WHERE event_id = ?").run(id);
  db.prepare("DELETE FROM hackathons WHERE id = ?").run("hosted-" + id);
  return true;
}

const getById = (id) => hydrate(db.prepare("SELECT * FROM hosted_events WHERE id = ?").get(id));
const getBySlug = (slug) => hydrate(db.prepare("SELECT * FROM hosted_events WHERE slug = ?").get(String(slug)));
const listByOwner = (sub) => db.prepare("SELECT * FROM hosted_events WHERE owner_sub = ? ORDER BY starts_on DESC, id DESC").all(sub).map(hydrate);

const hid = (id) => "hosted-" + id;
const goingCount = (id) => db.prepare("SELECT COUNT(*) AS n FROM user_hackathons WHERE hackathon_id = ? AND status = 'going'").get(hid(id)).n;
const getStatus = (id, sub) => {
  const r = db.prepare("SELECT status FROM user_hackathons WHERE hackathon_id = ? AND sub = ?").get(hid(id), sub);
  return r ? (r.status === "going" ? "going" : "interested") : null;
};
// status: "going", "interested" or null (not on my list)
function setStatus(id, sub, status) { t.setHackathonStatus(sub, hid(id), status); }

// Built-in sign-up (used when the host has no registration link of their own)
const isRegistered = (id, sub) => !!db.prepare("SELECT 1 FROM event_registrations WHERE event_id = ? AND sub = ?").get(id, sub);
const registrationCount = (id) => db.prepare("SELECT COUNT(*) AS n FROM event_registrations WHERE event_id = ?").get(id).n;
function register(id, sub) {
  db.prepare("INSERT OR IGNORE INTO event_registrations (event_id, sub) VALUES (?, ?)").run(id, sub);
  t.setHackathonStatus(sub, hid(id), "going");
}
function unregister(id, sub) {
  db.prepare("DELETE FROM event_registrations WHERE event_id = ? AND sub = ?").run(id, sub);
  t.setHackathonStatus(sub, hid(id), "interested");
}
const listRegistrations = (id) =>
  db.prepare(
    `SELECT r.created_at, u.username, u.display_name, u.email, u.school, u.major, u.discord
     FROM event_registrations r JOIN users u ON u.sub = r.sub WHERE r.event_id = ? ORDER BY r.created_at`
  ).all(id);

module.exports = { THEMES, FORMATS, validate, create, update, remove, getById, getBySlug, listByOwner, goingCount, getStatus, setStatus, isRegistered, registrationCount, register, unregister, listRegistrations, datesLabel };
