const express = require("express");
const { db } = require("../db");
const t = require("../teamdata");
const E = require("../events");

const csvCell = (v) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheets from running a name like =HYPERLINK(...)
  return '"' + s.replace(/"/g, '""') + '"';
};

module.exports = function ({ requireLogin, show }) {
  const router = express.Router();

  const needLogin = (req, res) => {
    if (req.profile) return false;
    res.status(401).json({ error: "Log in first." });
    return true;
  };
  const origin = (req) => req.protocol + "://" + req.get("host");
  const ownerEvent = (req, res) => {
    const ev = E.getById(Number(req.params.id));
    if (!ev || ev.owner_sub !== req.profile.sub) { res.status(404).send("Event not found"); return null; }
    return ev;
  };

  function hostPage(req, res, ev) {
    const mine = req.profile ? E.listByOwner(req.profile.sub).map((m) => ({ ...m, registrations: m.reg_url ? null : E.registrationCount(m.id) })) : [];
    show(res, "host", { editing: ev || null, myEvents: mine, themes: E.THEMES, formats: E.FORMATS, regions: t.REGIONS });
  }

  router.get("/host", (req, res) => hostPage(req, res, null));
  router.get("/host/:id/edit", requireLogin, (req, res) => { const ev = ownerEvent(req, res); if (ev) hostPage(req, res, ev); });

  // ----- Host: who signed up through the built-in registration -----
  router.get("/host/:id/registrations", requireLogin, (req, res) => {
    const ev = ownerEvent(req, res); if (!ev) return;
    show(res, "event-registrations", { ev, rows: E.listRegistrations(ev.id) });
  });
  router.get("/host/:id/registrations.csv", requireLogin, (req, res) => {
    const ev = ownerEvent(req, res); if (!ev) return;
    const head = ["Name", "Username", "Email", "School", "Major", "Discord", "Registered"];
    const lines = [head.map(csvCell).join(",")].concat(E.listRegistrations(ev.id).map((r) =>
      [r.display_name, r.username, r.email, r.school, r.major, r.discord, r.created_at].map(csvCell).join(",")));
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", 'attachment; filename="registrations-' + ev.slug + '.csv"');
    res.send(lines.join("\r\n") + "\r\n");
  });

  // ----- JSON API used by the host page -----
  router.post("/api/events", (req, res) => {
    if (needLogin(req, res)) return;
    if (E.listByOwner(req.profile.sub).length >= 20) return res.status(400).json({ error: "You can host up to 20 hackathons." });
    const r = E.validate(req.body);
    if (r.error) return res.status(400).json({ error: r.error });
    const ev = E.create(req.profile.sub, r.value);
    res.json({ id: ev.id, slug: ev.slug, url: "/e/" + ev.slug + "?published=1" });
  });

  router.put("/api/events/:id", (req, res) => {
    if (needLogin(req, res)) return;
    const r = E.validate(req.body);
    if (r.error) return res.status(400).json({ error: r.error });
    const ev = E.update(Number(req.params.id), req.profile.sub, r.value);
    if (!ev) return res.status(404).json({ error: "Event not found" });
    res.json({ id: ev.id, slug: ev.slug, url: "/e/" + ev.slug });
  });

  router.delete("/api/events/:id", (req, res) => {
    if (needLogin(req, res)) return;
    if (!E.remove(Number(req.params.id), req.profile.sub)) return res.status(404).json({ error: "Event not found" });
    res.json({ ok: true });
  });

  // body: { status: "going" | "interested" | null }
  router.post("/api/events/:id/going", (req, res) => {
    if (needLogin(req, res)) return;
    const ev = E.getById(Number(req.params.id));
    if (!ev) return res.status(404).json({ error: "Event not found" });
    const b = req.body || {};
    const status = b.status === "going" || b.going === true ? "going" : b.status === "interested" ? "interested" : null;
    E.setStatus(ev.id, req.profile.sub, status);
    res.json({ status: E.getStatus(ev.id, req.profile.sub), count: E.goingCount(ev.id) });
  });

  // ----- The public landing page -----
  router.get("/e/:slug", (req, res) => {
    const ev = E.getBySlug(req.params.slug);
    if (!ev) return res.status(404).send("Hackathon not found");
    const host = db.prepare("SELECT username, display_name, avatar, picture FROM users WHERE sub = ?").get(ev.owner_sub) || null;
    const isOwner = !!(req.profile && req.profile.sub === ev.owner_sub);
    const builtIn = !/^https?:\/\//i.test(ev.reg_url || "");
    show(res, "event", {
      ev, host, themes: E.THEMES,
      formatLabel: (E.FORMATS.find((f) => f.id === ev.format) || {}).label || "",
      status: req.profile ? E.getStatus(ev.id, req.profile.sub) : null,
      goingCount: E.goingCount(ev.id),
      isOwner, builtIn,
      registered: req.profile && builtIn ? E.isRegistered(ev.id, req.profile.sub) : false,
      regCount: isOwner && builtIn ? E.registrationCount(ev.id) : 0,
      justPublished: isOwner && req.query.published === "1",
      pageUrl: origin(req) + "/e/" + ev.slug,
      registerUrl: origin(req) + "/e/" + ev.slug + "/register",
    });
  });

  // ----- Built-in registration (for hosts without their own link) -----
  router.get("/e/:slug/register", requireLogin, (req, res) => {
    const ev = E.getBySlug(req.params.slug);
    if (!ev) return res.status(404).send("Hackathon not found");
    if (/^https?:\/\//i.test(ev.reg_url || "")) return res.redirect(ev.reg_url);
    show(res, "event-register", { ev, registered: E.isRegistered(ev.id, req.profile.sub), me: req.profile, done: req.query.done || "" });
  });

  router.post("/e/:slug/register", requireLogin, (req, res) => {
    const ev = E.getBySlug(req.params.slug);
    if (!ev) return res.status(404).send("Hackathon not found");
    if (req.body && req.body.action === "cancel") { E.unregister(ev.id, req.profile.sub); return res.redirect("/e/" + ev.slug + "/register?done=cancelled"); }
    E.register(ev.id, req.profile.sub);
    res.redirect("/e/" + ev.slug + "/register?done=registered");
  });

  return router;
};
