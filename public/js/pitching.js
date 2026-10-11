// Pitching game "Creeper Puncher": answer the judges, punch the creeper.
(function () {
  var go = document.getElementById("pt-go");
  if (!go) return;
  var $ = function (id) { return document.getElementById(id); };
  var level = go.getAttribute("data-level") || "easy";
  var round = null, idx = 0, hp = 0, lives = 0, locked = false, lastOver = null;

  function stage(name) { ["pt-start", "pt-play", "pt-result"].forEach(function (id) { $(id).hidden = id !== name; }); }
  function err(msg) { $("bs-error").textContent = msg || ""; $("bs-error").hidden = !msg; }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function api(url, body, silent) {
    return fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })
      .then(function (r) {
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
  // If an older copy of views/pitching.ejs is in use, create the few elements the script needs so it never crashes.
  (function ensureParts() {
    var arena = $("pt-arena");
    if (!arena) return;
    if (!$("pt-banner")) { var b = el("div", "pt-banner", ""); b.id = "pt-banner"; b.hidden = true; arena.appendChild(b); }
    if (!$("pt-spark")) { var sp = el("div", "pt-spark", ""); sp.id = "pt-spark"; arena.appendChild(sp); }
    if (!$("pt-creeper-name")) { var nm = el("span", "", ""); nm.id = "pt-creeper-name"; var hp0 = arena.querySelector(".pt-hp") || arena; hp0.insertBefore(nm, hp0.firstChild); }
  })();
  window.__ptReady = true;
  window.addEventListener("error", function (e) { err("Script error: " + e.message); });

  // ---------- getting a round (Gemini can take a while: start early, show progress) ----------
  var pending = null;
  function requestRound(silent) { return api("/api/pitch/new", { level: level }, silent); }
  function prefetch() {
    if (pending) return;
    pending = requestRound(true);
    pending.catch(function () { /* the click will retry and show any error */ });
  }
  var MESSAGES = ["Summoning the creeper...", "Briefing the judges...", "Sharpening your pitch...", "Mining a question..."];
  var loadTimer = null;
  function loading(on) {
    clearInterval(loadTimer);
    $("pt-loading").hidden = !on;
    if (!on) return;
    var i = 0, t0 = Date.now();
    $("pt-loading-text").textContent = MESSAGES[0]; $("pt-loading-sub").textContent = "";
    loadTimer = setInterval(function () {
      var secs = Math.round((Date.now() - t0) / 1000);
      i = (i + 1) % MESSAGES.length;
      $("pt-loading-text").textContent = MESSAGES[i];
      if (secs >= 6) $("pt-loading-sub").textContent = "Gemini is writing the judges' questions (" + secs + "s). Almost there...";
    }, 2200);
  }

  function start() {
    err(""); go.disabled = true; $("pt-again").disabled = true;
    loading(true);
    var wasPrefetched = !!pending;
    var p = pending || requestRound(false);
    pending = null;
    p.catch(function (e) { return wasPrefetched ? requestRound(false) : Promise.reject(e); })
      .then(function (r) {
        round = r; idx = 0; hp = r.hp; lives = r.lives; locked = false;
        $("pt-arena").className = "pt-arena " + (r.level === "survival" ? "charged" : "baby");
        $("pt-creeper-name").textContent = r.creeperName;
        ["pt-steve", "pt-creeper"].forEach(function (id) { $(id).className = id === "pt-steve" ? "pt-steve" : "pt-creeper"; });
        $("pt-arena").classList.remove("shake");
        hud(); stage("pt-play"); showQuestion();
        window.scrollTo({ top: 0, behavior: "auto" });
      }).catch(function (e) { err(e.message); stage("pt-start"); })
      .then(function () { loading(false); go.disabled = false; $("pt-again").disabled = false; });
  }
  go.addEventListener("click", start);
  $("pt-again").addEventListener("click", function () { stage("pt-start"); start(); });
  prefetch();

  // ---------- HUD ----------
  var HEART = '<svg class="pt-heart %C%" viewBox="0 0 10 9" shape-rendering="crispEdges"><path fill="#4b3a68" d="M1 0h3v1h2V0h3v1h1v3h-1v1h-1v1h-1v1h-1v1h-1v1h-1v-1h-1v-1h-1v-1H2V5H1V4H0V1h1V0z"/><path fill="#ef4444" d="M2 1h2v2H2V1zm4 0h2v2H6V1zM1 3h8v1H1V3zm1 2h6v1H2V5zm1 2h4v1H3V7zm1 2h2v1H4V9z"/></svg>';
  function hud(popIndex) {
    var box = $("pt-hearts"); box.textContent = "";
    for (var i = 0; i < round.lives; i++) {
      var tmp = document.createElement("div");
      tmp.innerHTML = HEART.replace("%C%", i < lives ? "" : "lost" + (i === popIndex ? " pop" : ""));
      box.appendChild(tmp.firstChild);
    }
    $("pt-hpfill").style.width = Math.max(0, (hp / round.hp) * 100) + "%";
    $("pt-creeper-name").textContent = round.creeperName + "  " + Math.max(0, hp) + "/" + round.hp + " HP";
    $("pt-hearts").setAttribute("aria-label", "Your hearts: " + Math.max(0, lives) + " of " + round.lives);
  }

  // ---------- questions ----------
  function showQuestion() {
    var q = round.questions[idx];
    $("pt-judge").textContent = q.judgeName + " asks:";
    $("pt-progress").textContent = "Question " + (idx + 1) + " of " + round.questions.length;
    $("pt-prompt").textContent = q.prompt;
    $("pt-feedback").hidden = true;
    var box = $("pt-options"); box.textContent = ""; box.classList.remove("pt-options-locked");
    q.options.forEach(function (text, k) {
      var b = el("button", "bs-opt", ""); b.type = "button";
      b.appendChild(el("strong", "", String.fromCharCode(65 + k) + ". "));
      b.appendChild(document.createTextNode(text));
      b.addEventListener("click", function () { answer(k, b); });
      box.appendChild(b);
    });
  }

  function later(ms, fn) { return setTimeout(fn, ms); }
  // Clear label for every hit (plus an icon on whoever got hit) for about a second. No extra animation, just clearer text.
  var bannerTimer = null;
  function hitLabel(kind, icon, text) {
    var b = $("pt-banner"), s = $("pt-spark");
    b.textContent = text; b.className = "pt-banner " + kind; b.hidden = false;
    s.textContent = icon; s.className = "pt-spark show " + (kind === "punch" ? "on-creeper" : "on-steve");
    clearTimeout(bannerTimer);
    bannerTimer = later(1300, function () { b.hidden = true; s.className = "pt-spark"; });
  }

  // how far each fighter must travel to meet the other (measured, so it works on any screen size)
  function reachPx() {
    var s = $("pt-steve").getBoundingClientRect(), c = $("pt-creeper").getBoundingClientRect();
    return Math.max(60, Math.round(c.left - s.right - 2));
  }

  function answer(k, btn) {
    if (locked) return;
    locked = true; err("");
    var buttons = $("pt-options").querySelectorAll("button");
    buttons.forEach(function (b) { b.disabled = true; });
    $("pt-options").classList.add("pt-options-locked");
    api("/api/pitch/" + round.id + "/answer", { choice: k }).then(function (d) {
      var steve = $("pt-steve"), creeper = $("pt-creeper");
      buttons[d.correctIndex].classList.add("right");
      if (!d.correct) btn.classList.add("wrong");
      hp = d.hp; lives = d.lives;
      var ar = $("pt-arena").getBoundingClientRect(); // keep the fight in view, below the sticky header
      if (ar.top < 130 || ar.bottom > window.innerHeight) window.scrollBy({ top: ar.top - 140, behavior: "auto" });

      // Movement is set inline (not only in the stylesheet) so it always works.
      function move(el, px) { el.style.transition = "transform .25s ease-out"; el.style.transform = px ? "translateX(" + px + "px)" : ""; }
      var reach = reachPx();
      if (d.correct) {
        move(steve, reach);                                    // you dash all the way to the creeper
        later(250, function () { creeper.classList.add("struck"); hitLabel("punch", "💥", "POW!"); hud(); });
        later(1000, function () { move(steve, 0); creeper.classList.remove("struck"); });
      } else {
        creeper.classList.add("lunge", "boom");
        move(creeper, -reach);                                 // the creeper charges all the way to you
        later(250, function () { steve.classList.add("hurt"); hitLabel("hit", "💥", "BOOM!"); hud(round.lives - lives - 1); });
        later(1000, function () { move(creeper, 0); creeper.classList.remove("lunge", "boom"); steve.classList.remove("hurt"); });
      }
      hud(d.correct ? undefined : round.lives - lives - 1); // health updates right away too

      var fb = $("pt-feedback"); fb.className = "pt-feedback " + (d.correct ? "good" : "bad");
      $("pt-feedback-text").textContent = (d.correct ? "Punch! " : "Ouch! The creeper hit you. ") + (d.correct ? d.why : d.why + " Best answer: " + buttons[d.correctIndex].textContent.replace(/^[A-Z]\.\s*/, ""));
      $("pt-next").textContent = d.over ? "See result" : "Next question";
      fb.hidden = false;
      lastOver = d.over ? d : null;
      if (d.over) later(500, function () { (d.won ? creeper : steve).classList.add("dead"); });
      locked = false;
    }).catch(function (e) {
      err(e.message); locked = false;
      buttons.forEach(function (b) { b.disabled = false; });
      $("pt-options").classList.remove("pt-options-locked");
    });
  }

  $("pt-next").addEventListener("click", function () {
    if (lastOver) return finish(lastOver);
    idx++; showQuestion();
  });

  function finish(d) {
    $("pt-res-emoji").textContent = d.won ? "🏆" : "💥";
    $("pt-res-title").textContent = d.won ? "You beat the " + round.creeperName + "!" : "BOOM! The " + round.creeperName + " got you";
    $("pt-res-text").textContent = d.won
      ? "The judges are impressed. Calm, clear answers are what win a pitch Q&A."
      : "Out of hearts. Read the explanations and fight again. Every pitch gets better with practice.";
    var rw = $("pt-res-reward");
    if (d.won && d.reward) {
      rw.textContent = "";
      rw.appendChild(el("strong", "", "+" + d.points + " points. You earned: " + d.reward.emoji + " " + d.reward.name + " (" + d.reward.rarity + ")"));
      rw.appendChild(document.createElement("br"));
      var a = el("a", "", "Place it in your world"); a.href = "/terrain"; rw.appendChild(a);
    }
    rw.hidden = !(d.won && d.reward);
    $("pt-res-inspo").textContent = d.inspiredBy ? "The judges asked about: " + (d.inspiredBy.real ? "a real winning project" : "a practice idea") + " (" + d.inspiredBy.title + ": " + d.inspiredBy.tagline + ")" : "";
    stage("pt-result");
    prefetch();
    window.scrollTo({ top: 0, behavior: "auto" });
  }
})();
