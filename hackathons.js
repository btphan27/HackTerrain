const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { db } = require("./db");
const t = require("./teamdata");

// ---------------------------------------------------------------------------
// Source: MLH's official season schedule (https://www.mlh.com/seasons/<year>/events)
// Each event is a link whose address ends in ?utm_source=mlh&utm_campaign=events&utm_content=<Event Name>,
// so the NAME and WEBSITE come from the link itself. Dates, place and format come from the card's text.
// ---------------------------------------------------------------------------
const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// MLH seasons run July 1 to June 30 and are named after the year they end in (2027 = Jul 2026 - Jun 2027)
const seasonYearFor = (d = new Date()) => (d.getUTCMonth() >= 6 ? d.getUTCFullYear() + 1 : d.getUTCFullYear());

function parseDates(text, seasonYear) {
  const MO = "(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)";
  const tail = `\\s*(?:-|–|to)\\s*(?:${MO}[A-Z]*\\.?\\s+)?(\\d{1,2})`;
  // MLH shows dates in capitals ("OCT 09 - 11"). Try that first (works even if glued to other text),
  // then fall back to any capitalisation on a word boundary.
  const strict = new RegExp(`${MO}\\s+(\\d{1,2})(?:${tail})?`);
  const loose = new RegExp(`\\b${MO}[A-Z]*\\.?\\s+(\\d{1,2})(?:${tail})?`, "i");
  const m = text.match(strict) || text.match(loose);
  if (!m) return null;
  const sm = MONTHS[m[1].toUpperCase()];
  const sd = Number(m[2]);
  const em = m[3] ? MONTHS[m[3].toUpperCase()] : sm;
  const ed = m[4] ? Number(m[4]) : sd;
  const yearOf = (mo) => (mo >= 7 ? seasonYear - 1 : seasonYear);
  if (sd < 1 || sd > 31 || ed < 1 || ed > 31) return null;
  const starts_on = `${yearOf(sm)}-${pad(sm)}-${pad(sd)}`;
  const ends_on = `${yearOf(em)}-${pad(em)}-${pad(ed)}`;
  if (ends_on < starts_on) return null;
  const label =
    sm === em && sd === ed ? `${MON[sm - 1]} ${sd}, ${yearOf(sm)}`
    : sm === em ? `${MON[sm - 1]} ${sd}-${ed}, ${yearOf(sm)}`
    : `${MON[sm - 1]} ${sd} - ${MON[em - 1]} ${ed}, ${yearOf(em)}`;
  return { starts_on, ends_on, label, endIndex: m.index + m[0].length };
}

function parseMlhHtml(html, seasonYear) {
  const $ = cheerio.load(html);
  const found = new Map();

  $("a[href*='utm_campaign=events']").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (!href.includes("utm_source=mlh")) return;

    let u;
    try { u = new URL(href, "https://www.mlh.com"); } catch { return; }
    const name = (u.searchParams.get("utm_content") || "").trim();
    if (!name) return;
    ["utm_source", "utm_medium", "utm_campaign", "utm_content"].forEach((k) => u.searchParams.delete(k));
    const url = u.toString().replace(/\?$/, "");

    // All visible text of the card, in order, with a space where each tag was
    const inner = ($(a).html() || "").replace(/<[^>]+>/g, " ");
    const text = cheerio.load("<div>" + inner + "</div>")("div").text().replace(/\s+/g, " ").trim();

    const d = parseDates(text, seasonYear);
    if (!d) return; // can't tell if it's upcoming, so skip it
    let location = "";
    let format = "";
    let tail = "";
    if (d) {
      const after = text.slice(d.endIndex).trim();
      const f = after.match(/^(.*?)\s*(In-Person|Digital|Hybrid|Online|Virtual)(.*)$/i);
      if (f) {
        location = f[1].replace(/\s+/g, " ").trim().replace(/\s+,/g, ",");
        const word = f[2].toLowerCase();
        format = word === "in-person" ? "in-person" : word === "hybrid" ? "hybrid" : "online";
        tail = f[3];
      } else {
        location = after;
      }
    }

    const tags = [];
    if (/\bDIVERSITY\b/i.test(tail)) tags.push("diversity");
    if (/\bHARDWARE\b/i.test(tail)) tags.push("hardware");
    if (/\bHIGH SCHOOL\b/i.test(tail)) tags.push("high-school");

    const cc = (location.match(/,\s*([A-Z]{2})\s*$/) || [])[1] || "";
    const ev = {
      id: `mlh-${slug(name)}-${seasonYear}`,
      source: "mlh",
      name,
      url,
      dates: d ? d.label : "",
      location,
      country: cc,
      region: t.regionOf(cc),
      format,
      tags: tags.join(","),
      starts_on: d ? d.starts_on : null,
      ends_on: d ? d.ends_on : null,
      is_online: format === "online" ? 1 : 0,
    };
    const prev = found.get(ev.id);
    if (!prev || (!prev.starts_on && ev.starts_on)) found.set(ev.id, ev);
  });

  return [...found.values()];
}

async function fromMlh() {
  const season = seasonYearFor();
  const seasons = [season];
  const month = new Date().getUTCMonth();
  if (month === 4 || month === 5) seasons.push(season + 1); // May/June: the next season is usually up already

  const all = [];
  for (const y of seasons) {
    const res = await fetch(`https://www.mlh.com/seasons/${y}/events`, {
      headers: { "User-Agent": "HackTerrain/1.0 (student hackathon project)", Accept: "text/html" },
    });
    if (!res.ok) {
      if (y === season) throw new Error("MLH responded with HTTP " + res.status);
      continue;
    }
    all.push(...parseMlhHtml(await res.text(), y));
  }
  if (!all.length) throw new Error("MLH page loaded but no events were found (the page layout may have changed)");
  return all;
}

// ---------------------------------------------------------------------------
// Optional second source: Devpost's unofficial endpoint. OFF by default (unverified, may change).
// Turn on with ENABLE_DEVPOST=true in .env
// ---------------------------------------------------------------------------
async function fromDevpost() {
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const params = new URLSearchParams({ page });
    params.append("status[]", "upcoming");
    params.append("status[]", "open");
    const r = await fetch("https://devpost.com/api/hackathons?" + params, {
      headers: { "User-Agent": "HackTerrain/1.0", Accept: "application/json" },
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const list = (await r.json()).hackathons || [];
    if (!list.length) break;
    for (const h of list) {
      const loc = (h.displayed_location && h.displayed_location.location) || "";
      const online = /online/i.test(loc);
      out.push({
        id: "devpost-" + h.id, source: "devpost", name: h.title, url: h.url,
        dates: h.submission_period_dates || "", location: loc, country: "", region: "other",
        format: online ? "online" : "in-person", tags: "", starts_on: null, ends_on: null, is_online: online ? 1 : 0,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Saving + syncing
// ---------------------------------------------------------------------------
const upsert = db.prepare(`
  INSERT INTO hackathons
    (id, source, name, url, dates, location, country, region, format, tags, starts_on, ends_on, is_online, last_seen, updated_at)
  VALUES
    (@id, @source, @name, @url, @dates, @location, @country, @region, @format, @tags, @starts_on, @ends_on, @is_online,
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET
    source = excluded.source, name = excluded.name, url = excluded.url, dates = excluded.dates,
    country = excluded.country, region = excluded.region, format = excluded.format, tags = excluded.tags,
    starts_on = excluded.starts_on, ends_on = excluded.ends_on, is_online = excluded.is_online,
    lat = CASE WHEN hackathons.location = excluded.location THEN hackathons.lat ELSE NULL END,
    lng = CASE WHEN hackathons.location = excluded.location THEN hackathons.lng ELSE NULL END,
    geo_tried = CASE WHEN hackathons.location = excluded.location THEN hackathons.geo_tried ELSE 0 END,
    location = excluded.location,
    last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
`);

const yesterday = () => new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10);
const stillRelevant = (e) => !e.ends_on || e.ends_on >= yesterday();
const save = (events) => db.transaction(() => events.forEach((e) => upsert.run(e)))();

// Safety net: if nothing is live (first run offline, MLH down or its layout changed), use the bundled copy.
function useSnapshotIfEmpty() {
  if (t.listHackathons().length) return;
  const file = path.join(__dirname, "data", "mlh-snapshot.json");
  if (!fs.existsSync(file)) return console.log("Hackathons: no live events and no snapshot file.");
  const snap = JSON.parse(fs.readFileSync(file, "utf8"));
  const events = snap.events.filter(stillRelevant);
  save(events);
  console.log(`Hackathons: using bundled MLH snapshot from ${snap.captured} (${events.length} events still upcoming)`);
}

// Look up map coordinates for each event once (for the "within X miles" filter). Free service: 1 request/second.
let geocoding = false;
async function geocodePending() {
  if (geocoding) return;
  geocoding = true;
  try {
    const rows = db
      .prepare("SELECT id, location FROM hackathons WHERE lat IS NULL AND geo_tried = 0 AND location != '' AND format != 'online' LIMIT 150")
      .all();
    let done = 0;
    for (const r of rows) {
      let res;
      try {
        res = await fetch(
          "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(r.location),
          { headers: { "User-Agent": "HackTerrain/1.0 (student hackathon project)" } }
        );
        if (!res.ok) throw new Error("HTTP " + res.status);
      } catch {
        break; // offline or blocked: try again next sync, don't mark as tried
      }
      const d = await res.json();
      const hit = d[0] ? { lat: Number(d[0].lat), lng: Number(d[0].lon) } : null;
      db.prepare("UPDATE hackathons SET lat = ?, lng = ?, geo_tried = 1 WHERE id = ?")
        .run(hit ? hit.lat : null, hit ? hit.lng : null, r.id);
      done++;
      await new Promise((ok) => setTimeout(ok, 1100));
    }
    if (done) console.log(`Hackathons: looked up ${done} locations`);
  } finally {
    geocoding = false;
  }
}

async function sync() {
  const sources = [["MLH", fromMlh]];
  if (process.env.ENABLE_DEVPOST === "true") sources.push(["Devpost", fromDevpost]);
  for (const [name, fn] of sources) {
    try {
      const events = (await fn()).filter(stillRelevant);
      save(events);
      console.log(`Hackathon sync (${name}): ${events.length} upcoming events`);
    } catch (e) {
      console.log(`Hackathon sync (${name}) failed:`, e.message);
    }
  }
  useSnapshotIfEmpty();
  geocodePending().catch((e) => console.log("Location lookup stopped:", e.message));
}

function startSync() {
  sync();
  setInterval(sync, 6 * 60 * 60 * 1000); // every 6 hours
}

module.exports = { startSync, sync, parseMlhHtml, seasonYearFor };
