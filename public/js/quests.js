// Quests page: ask the server for a challenge, submit an answer, collect the terrain reward.
(function () {
  var form = document.getElementById("quest-form");
  if (!form) return;
  var $ = function (id) { return document.getElementById(id); };
  var current = null;

  function show(el, on) { el.hidden = !on; }
  function err(msg) { $("quest-error").textContent = msg || ""; show($("quest-error"), !!msg); }

  function api(url, opts) {
    opts = opts || {};
    opts.headers = { "Content-Type": "application/json" };
    opts.credentials = "same-origin";
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.error || "Something went wrong (" + r.status + ")");
        return data;
      });
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err("");
    var btn = $("quest-go");
    btn.disabled = true; btn.textContent = "Thinking...";
    api("/api/challenges/generate", {
      method: "POST",
      body: JSON.stringify({ topic: $("quest-topic").value, difficulty: $("quest-difficulty").value })
    }).then(function (c) {
      current = c;
      $("quest-title").textContent = c.title;
      $("quest-meta").textContent = c.difficulty + " | about " + c.timeLimitMinutes + " minutes";
      $("quest-desc").textContent = c.description;
      $("quest-deliverable").textContent = c.deliverable;
      $("quest-answer").value = "";
      $("quest-answer").disabled = false;
      $("quest-submit").disabled = false;
      $("quest-solution").disabled = false;
      show($("quest-solution-box"), false);
      show($("quest-reward"), false);
      show($("quest-card"), true);
      $("quest-card").scrollIntoView({ behavior: "smooth", block: "start" });
    }).catch(function (e2) { err(e2.message); })
      .then(function () { btn.disabled = false; btn.textContent = "Get a quest"; });
  });

  $("quest-solution").addEventListener("click", function () {
    if (!current) return;
    if (!confirm("Show the solution? This quest will no longer earn a reward.")) return;
    api("/api/challenges/" + current.id + "/solution").then(function (d) {
      $("quest-solution-text").textContent = d.solution;
      show($("quest-solution-box"), true);
      $("quest-submit").disabled = true;
    }).catch(function (e2) { err(e2.message); });
  });

  $("quest-submit").addEventListener("click", function () {
    if (!current) return;
    err("");
    api("/api/challenges/" + current.id + "/complete", {
      method: "POST",
      body: JSON.stringify({ answer: $("quest-answer").value })
    }).then(function (d) {
      var box = $("quest-reward");
      box.textContent = "";
      var strong = document.createElement("strong");
      strong.textContent = "Quest complete! +" + d.points + " points. You earned: " + d.reward.emoji + " " + d.reward.name + " (" + d.reward.rarity + ")";
      var link = document.createElement("a");
      link.href = "/terrain"; link.textContent = "Place it in your world";
      box.appendChild(strong); box.appendChild(document.createElement("br")); box.appendChild(link);
      show(box, true);
      $("quest-submit").disabled = true;
      $("quest-solution").disabled = true;
      $("quest-answer").disabled = true;
    }).catch(function (e2) { err(e2.message); });
  });
})();
