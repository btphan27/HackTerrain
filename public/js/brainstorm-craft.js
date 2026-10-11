// Village Crafting (easy): answer 3 questions, craft the item.
(function () {
  var go = document.getElementById("craft-go");
  if (!go) return;
  var $ = function (id) { return document.getElementById(id); };
  var round = null;

  function stage(name) {
    ["craft-start", "craft-play", "craft-result"].forEach(function (id) { $(id).hidden = id !== name; });
  }
  function err(msg) { $("bs-error").textContent = msg || ""; $("bs-error").hidden = !msg; }
  function api(url, body, silent) {
    return fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })
      .then(function (r) {
        // not logged in / survey not finished: the server redirects to a page instead of sending data
        if (r.redirected && /\/(login|onboarding)/.test(r.url)) { if (!silent) window.location.href = r.url; throw new Error("Taking you to " + new URL(r.url).pathname + "..."); }
        if ((r.headers.get("content-type") || "").indexOf("json") < 0) {
          throw new Error("The server sent a web page instead of game data (status " + r.status + "). Restart npm start and check that every file from the zips was copied.");
        }
        return r.json().then(function (d) {
          if (r.status === 401 || d.login) { if (!silent) window.location.href = "/login"; throw new Error("Taking you to the login page..."); }
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

  function render(r) {
    $("craft-name").textContent = r.villager.name + " the " + r.villager.job + " says:";
    $("craft-line").textContent = r.villager.line;
    $("craft-result-emoji").textContent = r.item.emoji;
    $("craft-result-slot").classList.remove("ready");

    // 3x3 grid: ingredients go down the middle column, like a real recipe
    var grid = $("craft-grid"); grid.textContent = "";
    for (var i = 0; i < 9; i++) {
      var col = i % 3, row = Math.floor(i / 3), idx = col === 1 ? row : -1;
      var slot = el("div", "bs-slot empty-slot");
      if (idx >= 0) {
        slot.className = "bs-slot"; slot.id = "slot-" + idx;
        slot.title = r.questions[idx].ingredient.name;
        slot.appendChild(el("span", "", r.questions[idx].ingredient.emoji));
      }
      grid.appendChild(slot);
    }

    var box = $("craft-questions"); box.textContent = "";
    r.questions.forEach(function (q, n) {
      var wrap = el("fieldset", "bs-q");
      wrap.appendChild(el("legend", "bs-legend", "Question " + (n + 1)));
      wrap.appendChild(el("p", "bs-ing", "Ingredient: " + q.ingredient.emoji + " " + q.ingredient.name));
      wrap.appendChild(el("p", "", q.prompt));
      var opts = el("div", "bs-options");
      q.options.forEach(function (text, k) {
        var lab = el("label", "bs-opt");
        var inp = document.createElement("input");
        inp.type = "radio"; inp.name = "q" + n; inp.value = String(k);
        inp.addEventListener("change", update);
        lab.appendChild(inp); lab.appendChild(el("span", "", text));
        opts.appendChild(lab);
      });
      wrap.appendChild(opts);
      if (q.hint) { // survival mode has no hints
        var hint = el("p", "hint bs-hint", "Hint: " + q.hint); hint.hidden = true;
        var hb = el("button", "btn btn-dark", "Hint"); hb.type = "button";
        hb.addEventListener("click", function () { hint.hidden = !hint.hidden; });
        var actions = el("div", "btn-row"); actions.appendChild(hb);
        wrap.appendChild(actions); wrap.appendChild(hint);
      }
      box.appendChild(wrap);
    });
    update();
  }

  function picked(n) {
    var c = document.querySelector('input[name="q' + n + '"]:checked');
    return c ? parseInt(c.value, 10) : -1;
  }
  function update() {
    if (!round) return;
    var ready = 0;
    round.questions.forEach(function (q, n) {
      var ok = picked(n) >= 0;
      if (ok) ready++;
      $("slot-" + n).classList.toggle("has", ok);
    });
    $("craft-result-slot").classList.toggle("ready", ready === 3);
    $("craft-progress").textContent = ready === 3 ? "Everything is in the table. Craft it!" : ready + " of 3 ingredients ready";
    $("craft-submit").disabled = ready !== 3;
  }

  // ---------- getting a round (Gemini can take a while, so we start early and show progress) ----------
  var level = go.getAttribute("data-level") || "easy";
  var pending = null; // a round that is already being made in the background
  function requestRound(silent) { return api("/api/brainstorm/craft/new", { level: level }, silent); }
  function prefetch() {
    if (pending) return;
    pending = requestRound(true);
    pending.catch(function () { /* the click will try again and show any error */ });
  }

  var MESSAGES = ["Mining a question...", "Smelting the answer choices...", "Crafting your options...", "Asking the villagers..."];
  var loadTimer = null;
  function loading(on) {
    clearInterval(loadTimer);
    $("craft-loading").hidden = !on;
    if (!on) return;
    var i = 0, t0 = Date.now();
    $("craft-loading-text").textContent = MESSAGES[0]; $("craft-loading-sub").textContent = "";
    loadTimer = setInterval(function () {
      var secs = Math.round((Date.now() - t0) / 1000);
      i = (i + 1) % MESSAGES.length;
      $("craft-loading-text").textContent = MESSAGES[i];
      if (secs >= 6) $("craft-loading-sub").textContent = "Gemini is writing your questions (" + secs + "s). Almost there...";
    }, 2200);
  }

  function start() {
    err(""); go.disabled = true; var again = $("craft-again"); if (again) again.disabled = true;
    loading(true);
    var wasPrefetched = !!pending;
    var p = pending || requestRound(false);
    pending = null;
    p.catch(function (e) { return wasPrefetched ? requestRound(false) : Promise.reject(e); }) // background try failed: try once more now
      .then(function (r) {
        round = r; render(r); stage("craft-play");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }).catch(function (e) { err(e.message); stage("craft-start"); })
      .then(function () { loading(false); go.disabled = false; if (again) again.disabled = false; });
  }
  go.addEventListener("click", start);
  $("craft-again").addEventListener("click", function () { stage("craft-start"); start(); });
  prefetch(); // by the time you click "Find a villager", the first round is often ready

  $("craft-submit").addEventListener("click", function () {
    if (!round) return;
    err("");
    var btn = $("craft-submit"); btn.disabled = true; btn.textContent = "Crafting...";
    var answers = round.questions.map(function (q, n) { return picked(n); });
    api("/api/brainstorm/craft/" + round.id + "/craft", { answers: answers }).then(function (d) {
      $("res-emoji").textContent = d.crafted.emoji;
      $("res-name").textContent = "You crafted " + (/^[aeiou]/i.test(d.crafted.name) ? "an " : "a ") + d.crafted.name + "!";
      var stars = "★".repeat(d.stars) + "☆".repeat(3 - d.stars);
      $("res-stars").textContent = stars; $("res-stars").setAttribute("aria-label", d.stars + " out of 3 stars");
      $("res-feedback").textContent = d.feedback + " (" + d.right + " of 3 best answers)";
      var rv = $("res-review"); rv.textContent = "";
      d.results.forEach(function (x, n) {
        var li = el("li", x.correct ? "bs-right" : "bs-wrong");
        li.appendChild(el("strong", "", "Question " + (n + 1) + ": " + (x.correct ? "Best answer!" : "Not quite")));
        li.appendChild(el("span", "", " " + x.why));
        if (!x.correct) li.appendChild(el("span", "bs-best", "Best answer: " + x.bestText));
        rv.appendChild(li);
      });
      $("res-tip").textContent = d.tip;
      var rw = $("res-reward"); rw.textContent = "";
      rw.appendChild(el("strong", "", d.villager + " thanks you! +" + d.points + " points. You earned: " + d.reward.emoji + " " + d.reward.name + " (" + d.reward.rarity + ")"));
      rw.appendChild(document.createElement("br"));
      var a = el("a", "", "Place it in your world"); a.href = "/terrain"; rw.appendChild(a);
      $("res-inspo").textContent = "Inspired by " + (d.inspiredBy.real ? "a real winning project" : "a practice idea") + ": " + d.inspiredBy.title + " (" + d.inspiredBy.tagline + ")";
      stage("craft-result");
      prefetch(); // make the next villager while you read your result
      window.scrollTo({ top: 0, behavior: "smooth" });
    }).catch(function (e) { err(e.message); update(); })
      .then(function () { btn.textContent = "Craft it!"; });
  });
})();
