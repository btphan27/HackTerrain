// Run with:  npm run check-mlh
// Fetches MLH's live schedule and prints what the app would store. Nothing is saved.
const { parseMlhHtml, seasonYearFor } = require("../hackathons");

(async () => {
  const season = seasonYearFor();
  const url = `https://www.mlh.com/seasons/${season}/events`;
  console.log("Fetching", url);
  const res = await fetch(url, { headers: { "User-Agent": "HackTerrain/1.0 (student hackathon project)", Accept: "text/html" } });
  console.log("HTTP", res.status);
  if (!res.ok) return process.exit(1);

  const events = parseMlhHtml(await res.text(), season);
  console.log(`\nParsed ${events.length} events.\n`);
  events.slice(0, 8).forEach((e) =>
    console.log(`- ${e.name} | ${e.dates} | ${e.location} | ${e.format} | tags: ${e.tags || "none"}\n  ${e.url}`)
  );

  const noPlace = events.filter((e) => !e.location).length;
  const noFormat = events.filter((e) => !e.format).length;
  console.log(`\nMissing location: ${noPlace}   Missing format: ${noFormat}`);
  if (!events.length) {
    console.log("\nNo events found: the page layout probably changed. The app will fall back to its bundled snapshot.");
    process.exit(1);
  }
})().catch((e) => {
  console.error("Check failed:", e.message);
  process.exit(1);
});
