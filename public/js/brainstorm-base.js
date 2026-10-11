// Build Your Base (survival): build 4 layers of an idea, then survive the night.
(function () {
  var go = document.getElementById("base-go");
  if (!go) return;
  var $ = function (id) { return document.getElementById(id); };
  // build order is foundation, walls, roof, door; the house is drawn top to bottom
  var DRAW = [
    { layer: 2, blocks: 6, cls: "roof" },
    { layer: 1, blocks: 8, cls: "walls" },
    { layer: 3, blocks: 8, cls: "door" },
    { layer: 0, blocks: 10, cls: "foundation" }
  ];
  var MAT_NAMES = { dirt: "dirt", wood: "wood", stone: "stone", iron: "iron" };
  var round = null, step = 0, answers = [], raids = [], mats = [];

  function stage(name) {
    ["base-start", "base-play"].forEach(function (id) { $(id).hidden = id !== name; });
  }
  function err(msg) { $("bs-error").textContent = msg || ""; $("bs-error").hidden = !msg; }
  function api(url, body) {
    return fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })
      .then(function (r) {
        // not logged in / survey not finished: the server redirects to a page instead of sending data
        if (r.redirected && /\/(login|onboarding)/.test(r.url)) { window.location.href = r.url; throw new Error("Taking you to " + new URL(r.url).pathname + "..."); }
        if ((r.headers.get("content-type") || "").indexOf("json") < 0) {
          throw new Error("The server sent a web page instead of game data (status " + r.status + "). Restart npm start and check that every file from the zips was copied.");
        }
        return r.json().then(function (d) {
          if (r.status === 401 || d.login) { window.location.href = "/login"; throw new Error("Taking you to the login page..."); }
          if (!r.ok) throw new Error(d.error || "Something went wrong (" + r.status + ")");
          return d;
        });
      });
  }
  window.__bsReady = true;
  window.addEventListener("error", function (e) { err("Script error: " + e.message); });
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function material(len) { return len >= 140 ? "iron" : len >= 80 ? "stone" : len >= 40 ? "wood" : "dirt"; }

  // ---------- the house ----------
  function drawHouse() {
    var house = $("base-house"); house.textContent = "";
    DRAW.forEach(function (d) {
      var row = el("div", "bs-row ghost " + d.cls);
      row.id = "row-" + d.layer;
      for (var i = 0; i < d.blocks; i++) row.appendChild(el("span", "bs-block"));
      if (d.cls === "door") row.appendChild(el("span", "bs-emoji", "🔦🚪🔦"));
      house.appendChild(row);
    });
  }
  function fillRow(layer, mat) {
    var row = $("row-" + layer);
    row.classList.remove("ghost", "mat-unknown", "mat-dirt", "mat-wood", "mat-stone", "mat-iron");
    row.classList.add("mat-" + mat);
  }
  function materialsText() {
    return mats.map(function (m, i) { return round.layers[i].name + ": " + MAT_NAMES[m]; }).join("  |  ");
  }

  // ---------- build step ----------
  function radios(name, options, onChange) {
    var opts = el("div", "bs-options");
    options.forEach(function (text, k) {
      var lab = el("label", "bs-opt");
      var inp = document.createElement("input");
      inp.type = "radio"; inp.name = name; inp.value = String(k);
      inp.addEventListener("change", onChange);
      lab.appendChild(inp); lab.appendChild(el("span", "", text));
      opts.appendChild(lab);
    });
    return opts;
  }
  function chosen(name) {
    var c = document.querySelector('input[name="' + name + '"]:checked');
    return c ? parseInt(c.value, 10) : -1;
  }
  function showLayer() {
    var l = round.layers[step];
    $("layer-title").textContent = "Layer " + (step + 1) + " of 4: " + l.name + " (" + l.subtitle + ")";
    $("layer-prompt").textContent = l.prompt;
    $("layer-hint").textContent = "Hint: " + l.hint; $("layer-hint").hidden = true;
    var box = $("layer-options"); box.textContent = "";
    box.appendChild(radios("layer", l.options, countUpdate));
    countUpdate();
  }
  function countUpdate() { $("layer-place").disabled = chosen("layer") < 0; }
  $("layer-hint-btn").addEventListener("click", function () { $("layer-hint").hidden = !$("layer-hint").hidden; });

  $("layer-place").addEventListener("click", function () {
    var k = chosen("layer");
    if (k < 0) return;
    answers[step] = k;
    fillRow(step, "unknown"); // the real block quality is revealed when night falls
    step++;
    if (step < round.layers.length) { showLayer(); return; }
    nightfall();
  });

  function nightfall() {
    err("");
    var btn = $("layer-place"); btn.disabled = true; btn.textContent = "Night is falling...";
    api("/api/brainstorm/base/" + round.id + "/build", { answers: answers }).then(function (d) {
      raids = d.raids; mats = d.materials;
      mats.forEach(function (m, i) { fillRow(i, m); });
      var note = $("base-mats"); if (note) note.textContent = materialsText();
      $("base-build").hidden = true;
      $("base-sky").classList.add("night");
      renderRaids();
      $("base-night").hidden = false;
      raids.forEach(function (r) { $("row-" + r.layerIndex).classList.add("hit"); });
    }).catch(function (e) {
      err(e.message);
      step = round.layers.length - 1; // let them change the last layer and try again
      btn.textContent = "Place block"; countUpdate();
    });
  }

  // ---------- night step ----------
  function renderRaids() {
    var box = $("raid-list"); box.textContent = "";
    raids.forEach(function (r, i) {
      var card = el("div", "bs-raid"); card.id = "raid-" + i;
      var h = el("h3"); h.appendChild(el("span", "bs-mob", r.emoji + " "));
      h.appendChild(document.createTextNode("A " + r.mob + " " + r.verb + "!"));
      card.appendChild(h);
      card.appendChild(el("p", "", "\u201C" + r.line + "\u201D"));
      card.appendChild(el("p", "hint", "Pick your defense:"));
      card.appendChild(radios("def" + i, r.options, function () { /* nothing to do until submit */ }));
      var v = el("p", "bs-verdict", ""); v.id = "verdict-" + i; card.appendChild(v);
      box.appendChild(card);
    });
  }

  $("raid-submit").addEventListener("click", function () {
    err("");
    var defenses = raids.map(function (r, i) { return chosen("def" + i); });
    if (defenses.some(function (d) { return d < 0; })) { err("Pick a defense for every attack."); return; }
    var btn = $("raid-submit"); btn.disabled = true; btn.textContent = "Defending...";
    api("/api/brainstorm/base/" + round.id + "/defend", { defenses: defenses }).then(function (d) {
      d.results.forEach(function (res, i) {
        var row = $("row-" + raids[i].layerIndex), card = $("raid-" + i);
        row.classList.remove("hit", "cracked", "healed");
        row.classList.add(res.held ? "healed" : "cracked");
        card.classList.toggle("held", res.held);
        $("verdict-" + i).textContent = (res.held ? "Held: " : "Cracked: ") + res.comment;
        card.querySelectorAll("input").forEach(function (inp) { if (res.held) inp.disabled = true; else inp.checked = false; });
      });
      if (d.survived) return finish(true, d);
      if (d.retry) {
        err("Part of your base is cracked. Pick a better defense for those attacks and try once more!");
        return;
      }
      finish(false, d);
    }).catch(function (e) { err(e.message); })
      .then(function () { btn.disabled = false; btn.textContent = "Defend my base"; });
  });

  function finish(won, d) {
    $("base-night").hidden = true;
    var sky = $("base-sky");
    if (won) sky.classList.remove("night");
    $("base-res-title").textContent = won ? "Your base survived the night!" : "Your base collapsed...";
    $("base-res-text").textContent = won
      ? "Every layer held. That idea has a real problem, a focused solution, a reason to exist and a demo to show off."
      : "A few layers did not hold up. Read the comments above, then spawn a new world and try again. Everyone's first base falls over.";
    var rw = $("base-res-reward");
    if (won) {
      rw.textContent = "";
      rw.appendChild(el("strong", "", "+" + d.points + " points. You earned: " + d.reward.emoji + " " + d.reward.name + " (" + d.reward.rarity + ")"));
      rw.appendChild(document.createElement("br"));
      var a = el("a", "", "Place it in your world"); a.href = "/terrain"; rw.appendChild(a);
    }
    rw.hidden = !won;
    $("base-res-inspo").textContent = "Inspired by " + (d.inspiredBy.real ? "a real winning project" : "a practice idea") + ": " + d.inspiredBy.title + " (" + d.inspiredBy.tagline + ")";
    $("base-result").hidden = false;
  }

  // ---------- start ----------
  function start() {
    err(""); go.disabled = true; $("base-again").disabled = true;
    api("/api/brainstorm/base/new").then(function (r) {
      round = r; step = 0; answers = []; raids = []; mats = [];
      $("base-intro").textContent = r.intro;
      $("base-sky").classList.remove("night");
      $("base-build").hidden = false; $("base-night").hidden = true; $("base-result").hidden = true;
      var lp = $("layer-place"); lp.textContent = "Place block";
      drawHouse();
      var oldNote = $("base-mats"); if (oldNote) oldNote.remove();
      var note = el("p", "bs-mat", ""); note.id = "base-mats"; $("base-sky").appendChild(note);
      stage("base-play"); showLayer();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }).catch(function (e) { err(e.message); stage("base-start"); })
      .then(function () { go.disabled = false; $("base-again").disabled = false; });
  }
  go.addEventListener("click", start);
  $("base-again").addEventListener("click", start);
})();
