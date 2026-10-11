const express = require("express");
const { db } = require("../db");
const t = require("../teamdata");
const T = require("../teamup");

module.exports = function ({ requireLogin, show }) {
  const router = express.Router();

  // One-time message shown on the next page (kept in memory, per person)
  const flash = new Map();
  const say = (sub, msg, isError) => flash.set(sub, { msg, error: !!isError });
  const takeFlash = (sub) => { const f = flash.get(sub) || null; flash.delete(sub); return f; };
  const done = (req, res, r, okMsg, to) => { say(req.profile.sub, r.error || okMsg, !!r.error); res.redirect(to); };
  const idOf = (req) => { const n = Number(req.params.id); return Number.isInteger(n) && n > 0 ? n : 0; };

  // Hackathons someone can attach a team to: the upcoming catalog (their own picks first)
  function hackathonChoices(sub) {
    const mine = new Set(t.getHackathons(sub).map((h) => h.id));
    const list = t.listHackathons();
    return list.filter((h) => mine.has(h.id)).concat(list.filter((h) => !mine.has(h.id)));
  }

  router.use(["/teams", "/api/teams"], requireLogin);

  router.get("/teams", (req, res) => {
    const filters = { hackathon: String(req.query.hackathon || ""), q: String(req.query.q || "").slice(0, 60) };
    const teams = T.browse(filters);
    const withTeams = new Set(T.browse({}).map((x) => x.hackathon_id).filter(Boolean));
    show(res, "team-browse", {
      teams, filters, flash: takeFlash(req.profile.sub),
      hackathons: t.listHackathons().filter((h) => withTeams.has(h.id) || h.id === filters.hackathon),
      mine: new Set(T.myTeams(req.profile.sub).map((x) => x.id)),
    });
  });

  router.get("/teams/mine", (req, res) => {
    show(res, "my-teams", { teams: T.myTeams(req.profile.sub), inbox: T.inbox(req.profile.sub), flash: takeFlash(req.profile.sub) });
  });

  router.get("/teams/new", (req, res) => {
    const pre = String(req.query.hackathon || "");
    show(res, "team-form", { team: { name: "", hackathon_id: pre, description: "", wanted: "", max_size: 4, open: 1 }, editing: false, error: null, hackathons: hackathonChoices(req.profile.sub) });
  });

  router.post("/teams", (req, res) => {
    const r = T.validate(req.body, req.profile.sub);
    const redo = (error) => { res.status(400); show(res, "team-form", { team: { ...req.body, max_size: req.body.max_size || 4 }, editing: false, error, hackathons: hackathonChoices(req.profile.sub) }); };
    if (r.error) return redo(r.error);
    const c = T.create(req.profile.sub, r.value);
    if (c.error) return redo(c.error);
    say(req.profile.sub, "Your team is created. Invite people, or wait for join requests.");
    res.redirect("/teams/" + c.id);
  });

  // Invite a specific person (from their card or profile)
  router.get("/teams/invite/:username", (req, res) => {
    const target = db.prepare("SELECT username, display_name FROM users WHERE username = ?").get(String(req.params.username).toLowerCase());
    if (!target) return res.status(404).send("User not found");
    if (target.username === req.profile.username) return res.redirect("/teams/mine");
    show(res, "team-invite", { target, teams: T.ownedOpenTeams(req.profile.sub), flash: takeFlash(req.profile.sub) });
  });
  router.post("/teams/invite/:username", (req, res) => {
    const teamId = Number(req.body.team_id) || 0;
    const r = T.invite(teamId, req.profile.sub, req.params.username);
    done(req, res, r, r.invited ? "Invite sent to @" + r.invited + "." : "Added to your team.", r.error ? "/teams/invite/" + encodeURIComponent(req.params.username) : "/teams/" + teamId);
  });

  // Answering and withdrawing requests/invites
  router.post("/teams/requests/:id/accept", (req, res) => {
    const r = T.accept(idOf(req), req.profile.sub);
    done(req, res, r, "Done. They're on the team now.", r.teamId ? "/teams/" + r.teamId : "/teams/mine");
  });
  router.post("/teams/requests/:id/decline", (req, res) => done(req, res, T.decline(idOf(req), req.profile.sub), "Declined.", "/teams/mine"));
  router.post("/teams/requests/:id/cancel", (req, res) => done(req, res, T.cancel(idOf(req), req.profile.sub), "Withdrawn.", req.body.back === "team" && req.body.team_id ? "/teams/" + Number(req.body.team_id) : "/teams/mine"));

  router.get("/teams/:id", (req, res) => {
    const team = T.getTeam(idOf(req));
    if (!team) return res.status(404).send("Team not found");
    const sub = req.profile.sub;
    const member = T.isMember(team.id, sub);
    const owner = team.owner_sub === sub;
    const mineReq = member ? null : T.pendingFor(team.id, sub);
    show(res, "team", {
      team, member, owner, flash: takeFlash(sub),
      requests: owner ? T.pending(team.id) : [],
      myPending: mineReq,
      conflict: !member && team.hackathon_id ? !!db.prepare("SELECT 1 FROM teams t JOIN team_members m ON m.team_id = t.id WHERE m.sub = ? AND t.hackathon_id = ?").get(sub, team.hackathon_id) : false,
    });
  });

  router.get("/teams/:id/edit", (req, res) => {
    const team = T.getTeam(idOf(req));
    if (!team || team.owner_sub !== req.profile.sub) return res.status(404).send("Team not found");
    show(res, "team-form", { team, editing: true, error: null, hackathons: hackathonChoices(req.profile.sub) });
  });
  router.post("/teams/:id/edit", (req, res) => {
    const id = idOf(req);
    const team = T.getTeam(id);
    if (!team || team.owner_sub !== req.profile.sub) return res.status(404).send("Team not found");
    const redo = (error) => { res.status(400); show(res, "team-form", { team: { ...team, ...req.body, id, open: req.body.open ? 1 : 0 }, editing: true, error, hackathons: hackathonChoices(req.profile.sub) }); };
    const body = { ...req.body, open: req.body.open ? 1 : 0 };
    const r = T.validate(body, req.profile.sub);
    if (r.error) return redo(r.error);
    const u = T.update(id, req.profile.sub, r.value);
    if (u.error) return redo(u.error);
    say(req.profile.sub, "Team updated.");
    res.redirect("/teams/" + id);
  });

  router.post("/teams/:id/join", (req, res) => {
    const id = idOf(req);
    const r = T.requestJoin(id, req.profile.sub, req.body.message);
    done(req, res, r, r.joined ? "You're on the team!" : "Request sent. The team owner will see it.", "/teams/" + id);
  });
  router.post("/teams/:id/invite", (req, res) => {
    const id = idOf(req);
    const r = T.invite(id, req.profile.sub, req.body.username);
    done(req, res, r, r.invited ? "Invite sent to @" + r.invited + "." : "Added to your team.", "/teams/" + id);
  });
  router.post("/teams/:id/leave", (req, res) => done(req, res, T.leave(idOf(req), req.profile.sub), "You left the team.", "/teams/mine"));
  router.post("/teams/:id/kick/:username", (req, res) => done(req, res, T.kick(idOf(req), req.profile.sub, req.params.username), "Removed from the team.", "/teams/" + idOf(req)));
  router.post("/teams/:id/disband", (req, res) => done(req, res, T.disband(idOf(req), req.profile.sub), "Team deleted.", "/teams/mine"));

  return router;
};
