# HackOrGoHome (HackTerrain)

## Run it
1. `npm install`
2. Copy `.env.example` to `.env` and fill in your Auth0 values (or leave `.env` out to use the fake dev login)
3. (Optional) `npm run check-mlh` prints what the live MLH page returns, so you can confirm the hackathon feed works
4. `npm start`  ->  http://localhost:3000

## Who owns what
- Backend (you): `app.js`, `db.js`, `teamdata.js`, `hackathons.js`, `routes/`
- Frontend (teammate): `views/` and `public/`

## Templates the frontend can replace (files in `views/`)
| File | Variables |
|---|---|
| hackathons.ejs | hackathons, totalActive, months, filters, regions, tags, hasLocation. GET /hackathons?q=&region=&format=&month=&tag=&radius= |
| partials/hackathon-picker.ejs | Shared filterable picker (search, region, format, month, type, distance). Used by onboarding step 5 and team-settings. Filters run in the browser so checked boxes are kept. |
| onboarding.ejs | step (1-6), total, titles, profile, error, options {experience, roles, goals, skills, hackathons}. POST /onboarding/<step>. Steps: 1 username, display_name, bio. 2 school, major, city. 3 experience (radio), goal (radio), roles (many). 4 skills (many) + custom_skills (comma-separated text, up to 10 extra). 5 hackathons (max 3). 6 looking_for_team, discord. A button named `skip` (value 1) skips steps 2-6. |
| profile.ejs | profile, stats, badges, recent, isOwner, skills, hackathons |
| settings.ejs | profile, error. POST /settings: username, display_name, bio |
| team-settings.ejs | profile, allSkills, hackathons, hasLocation, regions, tags, error. POST /settings/team: school, major, city, discord, looking_for_team, skills (many), custom_skills, hackathons (max 3) |
| teammates.ejs | matches, filters, allSkills, hasLocation. GET /teammates?radius=&skill= |
| index.ejs, dashboard.ejs | user (null or {name,email,picture}), me |

Login link: /login   Logout link: /logout
Always print user text with <%= %>, never <%- %>.

## Profile survey
New users are redirected to /onboarding after their first login and can't use the rest of the site until they finish (steps 2-6 can be skipped). Answers save after every step, so users can resume. Finishing awards 20 points and the 'Ready to Hack' badge once. /onboarding/1 lets users retake the survey later.

## Hackathon catalog
Events come from MLH's official season schedule (https://www.mlh.com/seasons/<year>/events), re-read every 6 hours. Nothing is typed in by hand.
- If MLH is unreachable or its page layout changes, the app falls back to `data/mlh-snapshot.json` (captured 2026-10-09) and prints a message. Finished events drop off automatically.
- Event locations are looked up once on a free map service (1 request/second, runs in the background) to power "within X miles".
- Optional: `ENABLE_DEVPOST=true` in `.env` adds Devpost's unofficial endpoint. Unverified; off by default.
- Please check MLH's terms and consider asking them for an official feed before relying on this long term. Always link back to the event websites (the templates do).

## Terrain
Users earn terrain items by completing challenges: easy gives nature (trees, plants, flowers), medium gives animals, hard gives buildings. The item is random (weighted, so common things appear more often), lands on a random empty square, and can be moved or picked up. The land starts at 5x5 and grows by one row and column every 2 rewards, up to 12x12.

**For the challenge code (one call, after a challenge is verified as completed):**
```js
const { grantReward } = require("./terrain");
const result = grantReward(sub, "easy", challengeId);   // "easy" | "medium" | "hard" ("med" also works)
// result.reward -> { id, type, kind, name, emoji, rarity }  e.g. show "You earned a Pig!"
// result.isNew  -> false if this challenge already paid out (calling twice is safe, and the reward can't be re-rolled)
// result.expanded -> true if the land just grew
```
`sub` is the user's id (`req.profile.sub`). `challengeId` must be unique per challenge.

**Testing without challenges:** set `TERRAIN_DEV=true` in `.env`. The Terrain tab then shows buttons that pretend an easy/medium/hard challenge was completed. Turn it off before your demo, or anyone could give themselves rewards.

**Frontend:** `views/partials/terrain-widget.ejs` draws everything (used by the home page tab, `/terrain`, and `/u/<username>/terrain`). Art hooks: `.tr-cell[data-type][data-kind]` and `.tr-inv-item[data-type]`. `data-type` is a stable id (`pig`, `oak_tree`, `castle`...) to map to textures; the list of types and rarities is in `terrain.js`. JSON API: `GET /api/terrain`, `GET /api/terrain/u/<username>`, `POST /api/terrain/place {id,x,y}`, `POST /api/terrain/remove {id}`.

## Design (the HTML teammate's theme)
The static pages were turned into EJS so every page shares one header and footer.
- `public/css/style.css`: the teammate's stylesheet, plus a block at the bottom marked "ADDITIONS FOR THE APP" (forms, profile, catalog pagination, terrain, teammates, and the `.btn-secondary` style the HTML used but never defined).
- `views/partials/header.ejs` and `footer.ejs`: logo, tabs (Games, Terrain, About, Hack Catalog), Log in / Profile / Log out. Change the navigation here once.
- A page opts into the header like this: `<%- include('partials/header', { title: "...", active: "games" }) %>` ... `<%- include('partials/footer') %>`. `active` marks the current tab. `bodyClass: "home"` puts the header over the hero.
- Pages: `/` index, `/games`, `/about`, `/info` (static content from the design), `/hackathons` (Hack Catalog, live data, `/catalog` redirects to it), `/terrain`, `/profile`, `/teammates`, plus the survey and settings forms.
- Use absolute asset paths (`/css/style.css`), because pages like `/u/name/terrain` are nested.
- Not wired up yet: the contact form on About and the filters on Games (they are visual only), and the Games cards are still placeholders.

## Putting it on a domain (hackorgohome.casa)
1. Push the code to GitHub (never commit `.env` or `app.db`; `.gitignore` already skips them).
2. Create a web service on a host (e.g. Render): build `npm install`, start `npm start`.
3. Set these environment variables in the host's dashboard (not in a file):
   `NODE_ENV=production`, `BASE_URL=https://hackorgohome.casa`, `AUTH0_ISSUER_BASE_URL`, `AUTH0_CLIENT_ID`, `SECRET`.
4. In the Auth0 dashboard (your app's Settings), ADD (keep the localhost ones too):
   Allowed Callback URLs `https://hackorgohome.casa/callback` and Allowed Logout URLs `https://hackorgohome.casa`.
   If www is also used, add the www versions as well.
5. Add the domain in the host's dashboard, then add the DNS records it shows at GoDaddy.
6. The app refuses to start in production without the Auth0 settings and BASE_URL (so the fake dev login can never go live),
   ignores TERRAIN_DEV in production, listens on the host's PORT, and answers `/healthz` for health checks.

**Database warning:** the app stores everything in a SQLite file. Hosts with a temporary filesystem (such as Render's free plan)
erase it on every restart, redeploy and idle spin-down. Use a host/plan with a persistent disk and set `DB_PATH` to a file on it
(e.g. `DB_PATH=/var/data/app.db`).
