// Teams: create a team, ask to join, invite people, accept or decline.
const { db } = require("./db");
const t = require("./teamdata");

db.exec(`
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_sub TEXT NOT NULL,
  name TEXT NOT NULL,
  hackathon_id TEXT,
  description TEXT DEFAULT '',
  wanted TEXT DEFAULT '',
  max_size INTEGER DEFAULT 4,
  open INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL,
  sub TEXT NOT NULL,
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, sub)
);
CREATE TABLE IF NOT EXISTS team_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  sub TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const MAX_TEAMS_OWNED = 5;
const clean = (v, max) => (v === undefined || v === null ? "" : String(v)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);

// ---------- Reading ----------
function membersOf(teamId) {
  return db.prepare(
    `SELECT m.sub, m.joined_at, u.username, u.display_name, u.avatar, u.picture, u.discord, u.school, u.major
     FROM team_members m JOIN users u ON u.sub = m.sub WHERE m.team_id = ? ORDER BY m.joined_at, u.username`
  ).all(teamId);
}

function hydrate(r) {
  if (!r) return null;
  const members = membersOf(r.id);
  const hack = r.hackathon_id ? db.prepare("SELECT id, name, url, dates, source FROM hackathons WHERE id = ?").get(r.hackathon_id) : null;
  return {
    ...r, members, hackathon: hack || null,
    wantedList: (r.wanted || "").split(",").map((x) => x.trim()).filter(Boolean),
    size: members.length, full: members.length >= r.max_size,
  };
}
const getTeam = (id) => hydrate(db.prepare("SELECT * FROM teams WHERE id = ?").get(id));
const isMember = (teamId, sub) => !!db.prepare("SELECT 1 FROM team_members WHERE team_id = ? AND sub = ?").get(teamId, sub);

function myTeams(sub) {
  return db.prepare("SELECT t.id FROM teams t JOIN team_members m ON m.team_id = t.id WHERE m.sub = ? ORDER BY t.created_at DESC, t.id DESC").all(sub).map((r) => getTeam(r.id));
}
function ownedOpenTeams(sub) {
  return db.prepare("SELECT id FROM teams WHERE owner_sub = ? ORDER BY created_at DESC").all(sub).map((r) => getTeam(r.id)).filter((x) => !x.full);
}

// Teams that are open and not full. filters: hackathon (id), q
function browse(filters = {}) {
  const rows = db.prepare("SELECT id FROM teams WHERE open = 1 ORDER BY created_at DESC, id DESC").all().map((r) => getTeam(r.id));
  const q = clean(filters.q, 60).toLowerCase();
  return rows.filter((x) => !x.full)
    .filter((x) => !filters.hackathon || x.hackathon_id === filters.hackathon)
    .filter((x) => !q || (x.name + " " + x.description + " " + x.wanted + " " + (x.hackathon ? x.hackathon.name : "")).toLowerCase().includes(q));
}

function pending(teamId) {
  return db.prepare(
    `SELECT r.id, r.kind, r.message, r.created_at, r.sub, u.username, u.display_name, u.avatar, u.picture, u.school, u.major
     FROM team_requests r JOIN users u ON u.sub = r.sub WHERE r.team_id = ? AND r.status = 'pending' ORDER BY r.created_at`
  ).all(teamId);
}
const pendingFor = (teamId, sub) => db.prepare("SELECT * FROM team_requests WHERE team_id = ? AND sub = ? AND status = 'pending'").get(teamId, sub) || null;

// Everything waiting on this person: invites to them, requests to teams they own, and what they have sent
function inbox(sub) {
  const invites = db.prepare(
    `SELECT r.id, r.team_id, r.created_at, t.name AS team_name, u.username AS from_username, u.display_name AS from_name
     FROM team_requests r JOIN teams t ON t.id = r.team_id JOIN users u ON u.sub = t.owner_sub
     WHERE r.sub = ? AND r.kind = 'invite' AND r.status = 'pending' ORDER BY r.created_at DESC`
  ).all(sub);
  const requests = db.prepare(
    `SELECT r.id, r.team_id, r.message, r.created_at, t.name AS team_name, u.username, u.display_name, u.avatar, u.picture
     FROM team_requests r JOIN teams t ON t.id = r.team_id JOIN users u ON u.sub = r.sub
     WHERE t.owner_sub = ? AND r.kind = 'request' AND r.status = 'pending' ORDER BY r.created_at DESC`
  ).all(sub);
  const sent = db.prepare(
    `SELECT r.id, r.team_id, t.name AS team_name FROM team_requests r JOIN teams t ON t.id = r.team_id
     WHERE r.sub = ? AND r.kind = 'request' AND r.status = 'pending' ORDER BY r.created_at DESC`
  ).all(sub);
  return { invites, requests, sent };
}
function pendingCount(sub) {
  const a = db.prepare("SELECT COUNT(*) AS n FROM team_requests WHERE sub = ? AND kind = 'invite' AND status = 'pending'").get(sub).n;
  const b = db.prepare(
    `SELECT COUNT(*) AS n FROM team_requests r JOIN teams t ON t.id = r.team_id WHERE t.owner_sub = ? AND r.kind = 'request' AND r.status = 'pending'`
  ).get(sub).n;
  return a + b;
}

// ---------- Rules ----------
// One team per hackathon per person
function conflict(sub, hackathonId, exceptTeamId) {
  if (!hackathonId) return null;
  return db.prepare(
    `SELECT t.name FROM teams t JOIN team_members m ON m.team_id = t.id WHERE m.sub = ? AND t.hackathon_id = ? AND t.id != ?`
  ).get(sub, hackathonId, exceptTeamId || 0);
}

function validate(body, ownerSub) {
  body = body || {};
  const name = clean(body.name, 50);
  if (name.length < 2) return { error: "Give your team a name (at least 2 letters)." };
  const hackathon_id = clean(body.hackathon_id, 80);
  if (hackathon_id && !db.prepare("SELECT 1 FROM hackathons WHERE id = ?").get(hackathon_id)) return { error: "That hackathon isn't in the catalog." };
  const max_size = Math.max(2, Math.min(8, parseInt(body.max_size, 10) || 4));
  const parsed = t.parseSkills([], clean(body.wanted, 300));
  if (parsed.rejected.length) return { error: "Couldn't use these skills: " + parsed.rejected.join(", ") + "." };
  if (parsed.skills.length > 10) return { error: "List at most 10 skills." };
  return { value: { name, hackathon_id: hackathon_id || null, description: clean(body.description, 600), wanted: parsed.skills.join(", "), max_size, open: body.open === undefined || body.open ? 1 : 0 } };
}

// ---------- Changing things (each returns { error } or { ok, ... }) ----------
function create(ownerSub, v) {
  if (db.prepare("SELECT COUNT(*) AS n FROM teams WHERE owner_sub = ?").get(ownerSub).n >= MAX_TEAMS_OWNED) return { error: "You can run up to " + MAX_TEAMS_OWNED + " teams." };
  const c = conflict(ownerSub, v.hackathon_id, 0);
  if (c) return { error: 'You\'re already on a team for that hackathon ("' + c.name + '").' };
  let id;
  db.transaction(() => {
    id = Number(db.prepare("INSERT INTO teams (owner_sub, name, hackathon_id, description, wanted, max_size, open) VALUES (?, ?, ?, ?, ?, ?, 1)")
      .run(ownerSub, v.name, v.hackathon_id, v.description, v.wanted, v.max_size).lastInsertRowid);
    db.prepare("INSERT INTO team_members (team_id, sub) VALUES (?, ?)").run(id, ownerSub);
    if (v.hackathon_id) { // being on a team for it means you're going
      const cur = db.prepare("SELECT status FROM user_hackathons WHERE sub = ? AND hackathon_id = ?").get(ownerSub, v.hackathon_id);
      if (!cur || cur.status !== "going") t.setHackathonStatus(ownerSub, v.hackathon_id, "going");
    }
  })();
  return { ok: true, id };
}

function update(teamId, ownerSub, v) {
  const team = getTeam(teamId);
  if (!team || team.owner_sub !== ownerSub) return { error: "Team not found." };
  if (v.max_size < team.size) return { error: "The team already has " + team.size + " people, so the size can't go lower than that." };
  const hackChanged = (v.hackathon_id || null) !== (team.hackathon_id || null);
  if (hackChanged && v.hackathon_id) {
    for (const m of team.members) {
      const c = conflict(m.sub, v.hackathon_id, team.id);
      if (c) return { error: (m.username === undefined ? "A member" : "@" + m.username) + ' is already on another team for that hackathon ("' + c.name + '").' };
    }
  }
  db.prepare("UPDATE teams SET name=?, hackathon_id=?, description=?, wanted=?, max_size=?, open=? WHERE id=?")
    .run(v.name, v.hackathon_id, v.description, v.wanted, v.max_size, v.open, teamId);
  return { ok: true };
}

function disband(teamId, ownerSub) {
  const team = getTeam(teamId);
  if (!team || team.owner_sub !== ownerSub) return { error: "Team not found." };
  db.transaction(() => {
    db.prepare("DELETE FROM team_members WHERE team_id = ?").run(teamId);
    db.prepare("DELETE FROM team_requests WHERE team_id = ?").run(teamId);
    db.prepare("DELETE FROM teams WHERE id = ?").run(teamId);
  })();
  return { ok: true };
}

function requestJoin(teamId, sub, message) {
  const team = getTeam(teamId);
  if (!team) return { error: "Team not found." };
  if (isMember(teamId, sub)) return { error: "You're already on this team." };
  if (!team.open) return { error: "This team isn't taking requests right now." };
  if (team.full) return { error: "This team is full." };
  const c = conflict(sub, team.hackathon_id, 0);
  if (c) return { error: 'You\'re already on a team for this hackathon ("' + c.name + '").' };
  const existing = pendingFor(teamId, sub);
  if (existing && existing.kind === "invite") return accept(existing.id, sub); // they invited you, so just join
  if (existing) return { error: "You already asked to join this team." };
  db.prepare("INSERT INTO team_requests (team_id, sub, kind, message) VALUES (?, ?, 'request', ?)").run(teamId, sub, clean(message, 300));
  return { ok: true, sent: true };
}

function invite(teamId, ownerSub, username) {
  const team = getTeam(teamId);
  if (!team || team.owner_sub !== ownerSub) return { error: "Team not found." };
  if (team.full) return { error: "Your team is full." };
  const target = db.prepare("SELECT sub, username FROM users WHERE username = ?").get(clean(username, 40).toLowerCase().replace(/^@/, ""));
  if (!target) return { error: "Nobody has that username." };
  if (isMember(teamId, target.sub)) return { error: "@" + target.username + " is already on your team." };
  const c = conflict(target.sub, team.hackathon_id, 0);
  if (c) return { error: "@" + target.username + " is already on a team for that hackathon." };
  const existing = pendingFor(teamId, target.sub);
  if (existing && existing.kind === "request") return accept(existing.id, ownerSub); // they asked, so say yes
  if (existing) return { error: "You already invited @" + target.username + "." };
  db.prepare("INSERT INTO team_requests (team_id, sub, kind) VALUES (?, ?, 'invite')").run(teamId, target.sub);
  return { ok: true, invited: target.username };
}

// An invite is answered by the person invited; a request by the team owner
function respondable(r, actorSub, team) {
  if (!r || r.status !== "pending" || !team) return false;
  return r.kind === "invite" ? r.sub === actorSub : team.owner_sub === actorSub;
}
function accept(requestId, actorSub) {
  const r = db.prepare("SELECT * FROM team_requests WHERE id = ?").get(requestId);
  const team = r ? getTeam(r.team_id) : null;
  if (!respondable(r, actorSub, team)) return { error: "That request isn't available any more." };
  if (team.full) return { error: "The team is full." };
  const c = conflict(r.sub, team.hackathon_id, 0);
  if (c) return { error: "That person is already on a team for this hackathon." };
  db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO team_members (team_id, sub) VALUES (?, ?)").run(team.id, r.sub);
    db.prepare("UPDATE team_requests SET status = 'accepted' WHERE team_id = ? AND sub = ? AND status = 'pending'").run(team.id, r.sub);
    if (team.hackathon_id) t.setHackathonStatus(r.sub, team.hackathon_id, "going");
  })();
  return { ok: true, joined: r.sub, teamId: team.id };
}
function decline(requestId, actorSub) {
  const r = db.prepare("SELECT * FROM team_requests WHERE id = ?").get(requestId);
  const team = r ? getTeam(r.team_id) : null;
  if (!respondable(r, actorSub, team)) return { error: "That request isn't available any more." };
  db.prepare("UPDATE team_requests SET status = 'declined' WHERE id = ?").run(requestId);
  return { ok: true };
}
// The sender takes back a request (or the owner takes back an invite)
function cancel(requestId, actorSub) {
  const r = db.prepare("SELECT * FROM team_requests WHERE id = ?").get(requestId);
  const team = r ? getTeam(r.team_id) : null;
  if (!r || !team || r.status !== "pending") return { error: "That request isn't available any more." };
  const mine = r.kind === "request" ? r.sub === actorSub : team.owner_sub === actorSub;
  if (!mine) return { error: "That request isn't yours." };
  db.prepare("UPDATE team_requests SET status = 'cancelled' WHERE id = ?").run(requestId);
  return { ok: true };
}

function leave(teamId, sub) {
  const team = getTeam(teamId);
  if (!team || !isMember(teamId, sub)) return { error: "You're not on that team." };
  if (team.owner_sub === sub) return { error: "You started this team, so you can disband it instead of leaving." };
  db.prepare("DELETE FROM team_members WHERE team_id = ? AND sub = ?").run(teamId, sub);
  return { ok: true };
}
function kick(teamId, ownerSub, username) {
  const team = getTeam(teamId);
  if (!team || team.owner_sub !== ownerSub) return { error: "Team not found." };
  const m = team.members.find((x) => x.username === username);
  if (!m || m.sub === ownerSub) return { error: "You can't remove that person." };
  db.prepare("DELETE FROM team_members WHERE team_id = ? AND sub = ?").run(teamId, m.sub);
  return { ok: true };
}

module.exports = { getTeam, isMember, myTeams, ownedOpenTeams, browse, pending, pendingFor, inbox, pendingCount, validate, create, update, disband, requestJoin, invite, accept, decline, cancel, leave, kick, MAX_TEAMS_OWNED };
