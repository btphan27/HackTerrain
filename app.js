require("dotenv").config();

// ---------- Safety checks for a live website (run before anything else starts) ----------
// The fake dev login gives EVERYONE the same account, so it must never run on a real site.
if (process.env.NODE_ENV === "production") {
  const authOk = !!(process.env.AUTH0_ISSUER_BASE_URL && process.env.AUTH0_CLIENT_ID && process.env.SECRET);
  if (!authOk) {
    console.error("Refusing to start: NODE_ENV=production but the Auth0 settings are missing.");
    console.error("Set AUTH0_ISSUER_BASE_URL, AUTH0_CLIENT_ID, SECRET and BASE_URL in your host's environment variables.");
    process.exit(1);
  }
  if (!process.env.BASE_URL) {
    console.error("Refusing to start: set BASE_URL to your site's address, e.g. https://hackorgohome.casa");
    process.exit(1);
  }
}
const fs = require("fs");
const path = require("path");
const express = require("express");
const { auth, requiresAuth } = require("express-openid-connect");
const { getOrCreateUser } = require("./db");
const teamdata = require("./teamdata");
const Avatar = require("./public/js/avatar.js");

const app = express();
const PRODUCTION = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 3000; // hosts like Render tell the app which port to use
if (PRODUCTION) app.set("trust proxy", 1); // behind the host's HTTPS proxy: needed for secure login cookies
app.get("/healthz", (req, res) => res.send("ok")); // lets the host check the app is alive (before login middleware)
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---------- AUTH: real Auth0 if configured, fake user otherwise ----------
const USE_AUTH0 = !!(
  process.env.AUTH0_ISSUER_BASE_URL &&
  process.env.AUTH0_CLIENT_ID &&
  process.env.SECRET
);

let requireLogin;

if (USE_AUTH0) {
  app.use(auth({
    authRequired: false,
    auth0Logout: true,
    secret: process.env.SECRET,
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    clientID: process.env.AUTH0_CLIENT_ID,
    issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  }));
  requireLogin = requiresAuth();
  console.log("Auth: Auth0");
} else {
  // Fake login for development only: one shared user, resets on restart
  let fakeUser = null;
  app.use((req, res, next) => {
    req.oidc = { user: fakeUser, isAuthenticated: () => !!fakeUser };
    next();
  });
  app.get("/login", (req, res) => {
    fakeUser = { sub: "dev|123", name: "Dev User", email: "dev@example.com", picture: "" };
    res.redirect("/");
  });
  app.get("/logout", (req, res) => {
    fakeUser = null;
    res.redirect("/");
  });
  requireLogin = (req, res, next) => (req.oidc.user ? next() : res.redirect("/login"));
  console.log("Auth: FAKE dev login (no Auth0 vars found in .env)");
}

// ---------- Make `user` and `me` available to every route/template ----------
app.use((req, res, next) => {
  res.locals.user = req.oidc.user || null;
  if (req.oidc.user) req.profile = getOrCreateUser(req.oidc.user);
  res.locals.me = req.profile || null;
  res.locals.terrainDev = !PRODUCTION && process.env.TERRAIN_DEV === "true"; // never on a live site
  // small helpers the templates use to print hackathon formats and types
  res.locals.PixelAvatar = Avatar;
  res.locals.avatarHtml = (code, picture, name, extra) => {
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const cls = "avatar" + (extra ? " " + extra : "");
    const art = Avatar.svg(code);
    if (art) return `<div class="${cls} avatar-art">${art}</div>`;
    if (picture) return `<img class="${cls}" src="${esc(picture)}" alt="">`;
    return `<div class="${cls}" aria-hidden="true">${esc((name || "?").charAt(0).toUpperCase())}</div>`;
  };
  res.locals.formatLabel = (f) => ({ "in-person": "In person", online: "Online", hybrid: "Hybrid" }[f] || "");
  res.locals.tagLabel = (id) => (teamdata.HACK_TAGS.find((x) => x.id === id) || {}).label || id;
  next();
});

// ---------- New users must finish the profile survey first ----------
const SURVEY_OK = ["/onboarding", "/login", "/logout", "/callback"];
app.use((req, res, next) => {
  if (req.profile && !req.profile.onboarded && !SURVEY_OK.some((p) => req.path.startsWith(p))) {
    return res.redirect("/onboarding");
  }
  next();
});

// ---------- Render the real template if it exists, else a placeholder ----------
function show(res, view, data = {}) {
  const file = path.join(__dirname, "views", `${view}.ejs`);
  if (fs.existsSync(file)) return res.render(view, data);
  res.send(`
    <h2>Placeholder: ${view}</h2>
    <p><a href="/login">Login</a> | <a href="/logout">Logout</a> | <a href="/profile">My profile</a> |
       <a href="/onboarding">Survey</a> | <a href="/settings">Settings</a> | <a href="/settings/team">Team settings</a> | <a href="/teammates">Teammates</a> | <a href="/terrain">Terrain</a></p>
    <pre>${JSON.stringify(data, null, 2).replace(/</g, "\\u003c")}</pre>
  `);
}

// ---------- Routes ----------
app.get("/", (req, res) => show(res, "index", { upcoming: teamdata.listHackathons().slice(0, 4) }));

// Pages from the design (static content for now)
app.get("/games", (req, res) => show(res, "games", { topics: require("./services/challenges").TOPICS.map(({ id, name }) => ({ id, name })) }));
app.get("/quests", (req, res) => res.redirect("/games")); // the new design calls games "quests"
app.get("/host", (req, res) => show(res, "host"));
app.get("/dashboard", requireLogin, (req, res) => show(res, "dashboard", { stats: require("./db").getStats(req.profile.sub) }));
app.get("/about", (req, res) => show(res, "about"));
app.get("/info", (req, res) => show(res, "info"));
app.get("/catalog", (req, res) => res.redirect("/hackathons")); // the design calls it the catalog
app.get("/api/me", requireLogin, (req, res) => res.json(req.oidc.user));

app.use(require("./routes/onboarding")({ requireLogin, show }));
app.use(require("./routes/profile")({ requireLogin, show }));
app.use(require("./routes/teams")({ requireLogin, show }));
app.use(require("./routes/terrain")({ requireLogin, show }));
app.use(require("./routes/challenges")({ requireLogin }));
require("./hackathons").startSync();

app.listen(PORT, () => console.log(`Running on port ${PORT}` + (PRODUCTION ? "" : ` (http://localhost:${PORT})`)));
