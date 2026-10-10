require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const { auth, requiresAuth } = require("express-openid-connect");
const { getOrCreateUser } = require("./db");

const app = express();
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
       <a href="/onboarding">Survey</a> | <a href="/settings">Settings</a> | <a href="/settings/team">Team settings</a> | <a href="/teammates">Teammates</a></p>
    <pre>${JSON.stringify(data, null, 2).replace(/</g, "\\u003c")}</pre>
  `);
}

// ---------- Routes ----------
app.get("/", (req, res) => show(res, "index"));
app.get("/dashboard", requireLogin, (req, res) => show(res, "dashboard"));
app.get("/api/me", requireLogin, (req, res) => res.json(req.oidc.user));

app.use(require("./routes/onboarding")({ requireLogin, show }));
app.use(require("./routes/profile")({ requireLogin, show }));
app.use(require("./routes/teams")({ requireLogin, show }));
require("./hackathons").startSync();

app.listen(3000, () => console.log("Running on http://localhost:3000"));
