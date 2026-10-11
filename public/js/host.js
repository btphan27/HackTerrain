// Launch your hackathon: build the page with a live preview, then publish it (or save edits).
(function () {
  var form = document.getElementById("host-form");
  if (!form) return;
  var preview = document.getElementById("host-preview");
  var msg = document.getElementById("host-msg");
  var submitBtn = document.getElementById("host-submit");
  var KEY = "hoh-host-draft-v2";
  var init = null, cfg = { loggedIn: false };
  try { init = JSON.parse(document.getElementById("host-init").textContent); } catch (e) {}
  try { cfg = JSON.parse(document.getElementById("host-config").textContent); } catch (e) {}
  var editing = init && init.id ? init.id : null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function vals(name) {
    return Array.prototype.map.call(form.querySelectorAll('[name="' + name + '"]'), function (i) { return i.value.trim(); });
  }
  function one(name) { return (form.elements[name] && form.elements[name].value || "").trim(); }
  function theme() { var c = form.querySelector('[name="event-theme"]:checked'); return c ? c.value : "meadow"; }
  function safeUrl(u) { return /^https?:\/\/[^\s]+$/i.test(u) ? u : ""; }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function datesLabel(s, e) {
    if (!s) return "";
    var a = s.split("-").map(Number);
    if (!e || e === s) return MONTHS[a[1] - 1] + " " + a[2] + ", " + a[0];
    var b = e.split("-").map(Number);
    if (a[0] === b[0] && a[1] === b[1]) return MONTHS[a[1] - 1] + " " + a[2] + "–" + b[2] + ", " + a[0];
    if (a[0] === b[0]) return MONTHS[a[1] - 1] + " " + a[2] + " – " + MONTHS[b[1] - 1] + " " + b[2] + ", " + a[0];
    return MONTHS[a[1] - 1] + " " + a[2] + ", " + a[0] + " – " + MONTHS[b[1] - 1] + " " + b[2] + ", " + b[0];
  }
  function prettyTime(t) {
    if (!t) return "TBA";
    var p = t.split(":"), h = Number(p[0]);
    return (h % 12 || 12) + ":" + p[1] + (h < 12 ? " AM" : " PM");
  }
  var FORMAT_LABEL = { "in-person": "In person", online: "Online", hybrid: "Hybrid" };

  function collect() {
    var times = vals("schedule-time"), acts = vals("schedule-activity"), schedule = [];
    for (var i = 0; i < acts.length; i++) if (acts[i]) schedule.push({ time: times[i] || "", activity: acts[i] });
    schedule.sort(function (a, b) { return a.time === b.time ? 0 : (a.time === "" ? 1 : (b.time === "" ? -1 : (a.time < b.time ? -1 : 1))); });
    return {
      name: one("event-name"), starts_on: one("event-date"), ends_on: one("event-end"), location: one("event-location"),
      format: one("event-format"), region: one("event-region"), description: one("event-description"),
      reg_url: one("registration-url"), theme: theme(), schedule: schedule, quests: vals("quest").filter(Boolean)
    };
  }

  function render() {
    var d = collect();
    preview.innerHTML = "";
    if (!d.name && !d.starts_on && !d.location && !d.description && !d.schedule.length && !d.quests.length) {
      var p = el("p", "empty", "Fill in the form and your landing page shows up here.");
      preview.appendChild(p);
      return;
    }
    var page = el("article", "lp theme-" + d.theme);
    var head = el("header", "lp-head");
    head.appendChild(el("p", "lp-kicker", "Hosted on HackOrGoHome"));
    head.appendChild(el("h3", "lp-title", d.name || "Your hackathon"));
    var meta = [datesLabel(d.starts_on, d.ends_on), d.location].filter(Boolean).join("  •  ");
    if (meta) head.appendChild(el("p", "lp-meta", meta));
    var chips = el("div", "lp-chips");
    if (FORMAT_LABEL[d.format]) chips.appendChild(el("span", "lp-chip", FORMAT_LABEL[d.format]));
    head.appendChild(chips);
    var cta = el("div", "lp-cta");
    var link = safeUrl(d.reg_url);
    var reg = el(link ? "a" : "span", "btn", "Register");
    if (link) { reg.href = link; reg.target = "_blank"; reg.rel = "noopener noreferrer"; }
    cta.appendChild(reg);
    cta.appendChild(el("span", "btn btn-dark", "Interested"));
    cta.appendChild(el("span", "btn btn-dark", "I'm going"));
    if (!link) head.appendChild(el("p", "hint", "Registration will use a sign-up page we create for you."));
    head.appendChild(cta);
    page.appendChild(head);
    var body = el("div", "lp-body");
    if (d.description) body.appendChild(el("p", "lp-desc", d.description));
    if (d.schedule.length) {
      body.appendChild(el("h4", "", "Schedule"));
      var ul = el("ul", "lp-schedule");
      d.schedule.forEach(function (s) {
        var li = el("li");
        li.appendChild(el("span", "lp-time", prettyTime(s.time)));
        li.appendChild(el("span", "", s.activity));
        ul.appendChild(li);
      });
      body.appendChild(ul);
    }
    if (d.quests.length) {
      body.appendChild(el("h4", "", "Quests and prizes"));
      var tr = el("div", "tag-row");
      d.quests.forEach(function (q) { tr.appendChild(el("span", "tag tag-honey", q)); });
      body.appendChild(tr);
    }
    page.appendChild(body);
    preview.appendChild(page);
  }

  function addRow(containerId) {
    var box = document.getElementById(containerId);
    var tpl = box.firstElementChild.cloneNode(true);
    Array.prototype.forEach.call(tpl.querySelectorAll("input"), function (i) { i.value = ""; });
    box.appendChild(tpl);
    return tpl;
  }
  function fillRows(containerId, name, values, extra) {
    // make exactly max(1, n) rows, then fill them
    var box = document.getElementById(containerId);
    while (box.children.length > 1) box.lastElementChild.remove();
    var n = Math.max(1, values.length);
    for (var i = 1; i < n; i++) addRow(containerId);
    var rows = box.children;
    for (var j = 0; j < values.length; j++) {
      var inputs = rows[j].querySelectorAll("input");
      if (extra) { inputs[0].value = values[j].time || ""; inputs[1].value = values[j].activity || ""; }
      else inputs[0].value = values[j];
    }
  }

  function fill(d) {
    form.elements["event-name"].value = d.name || "";
    form.elements["event-date"].value = d.starts_on || "";
    form.elements["event-end"].value = (d.ends_on && d.ends_on !== d.starts_on) ? d.ends_on : "";
    form.elements["event-location"].value = d.location || "";
    if (d.format) form.elements["event-format"].value = d.format;
    if (d.region) form.elements["event-region"].value = d.region;
    form.elements["event-description"].value = d.description || "";
    form.elements["registration-url"].value = d.reg_url || "";
    var r = form.querySelector('[name="event-theme"][value="' + (d.theme || "meadow") + '"]'); if (r) r.checked = true;
    fillRows("schedule-rows", "schedule", d.schedule || [], true);
    fillRows("quest-rows", "quest", d.quests || [], false);
  }

  function saveDraft() {
    if (editing) return;
    try { localStorage.setItem(KEY, JSON.stringify(collect())); } catch (e) {}
  }
  function update() { render(); saveDraft(); }

  document.getElementById("add-schedule").addEventListener("click", function () { var r = addRow("schedule-rows"); r.querySelector("input").focus(); update(); });
  document.getElementById("add-quest").addEventListener("click", function () { var r = addRow("quest-rows"); r.querySelector("input").focus(); update(); });
  form.addEventListener("click", function (e) {
    var btn = e.target.closest(".host-remove");
    if (!btn) return;
    var row = btn.closest(".host-row"), box = row.parentNode;
    if (box.children.length > 1) row.remove();
    else Array.prototype.forEach.call(row.querySelectorAll("input"), function (i) { i.value = ""; });
    update();
  });
  form.addEventListener("input", update);
  form.addEventListener("change", update);

  function api(method, url, body) {
    return fetch(url, { method: method, headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var err = new Error(d.error || "Something went wrong"); err.status = r.status; throw err; } return d; }); });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var d = collect();
    if (!d.name) { msg.textContent = "Give your hackathon a name."; form.elements["event-name"].focus(); return; }
    if (!d.starts_on) { msg.textContent = "Pick the date your hackathon starts."; form.elements["event-date"].focus(); return; }
    if (d.ends_on && d.ends_on < d.starts_on) { msg.textContent = "The end date can't be before the start date."; form.elements["event-end"].focus(); return; }
    if (d.reg_url && !safeUrl(d.reg_url)) { msg.textContent = "The registration link needs to start with http:// or https://"; form.elements["registration-url"].focus(); return; }
    if (!cfg.loggedIn) { msg.innerHTML = ""; var a = el("a", "", "Log in"); a.href = "/login"; msg.appendChild(a); msg.appendChild(document.createTextNode(" to publish. Your draft is saved in this browser.")); saveDraft(); return; }
    submitBtn.disabled = true;
    msg.textContent = editing ? "Saving..." : "Publishing...";
    api(editing ? "PUT" : "POST", editing ? "/api/events/" + editing : "/api/events", {
      name: d.name, starts_on: d.starts_on, ends_on: d.ends_on, location: d.location, format: d.format, region: d.region,
      description: d.description, reg_url: d.reg_url, theme: d.theme, schedule: d.schedule, quests: d.quests
    }).then(function (res) {
      try { if (!editing) localStorage.removeItem(KEY); } catch (e) {}
      msg.textContent = "Done! Taking you to your page...";
      window.location.href = res.url;
    }).catch(function (err) {
      msg.textContent = err.status === 401 ? "Your session ended. Log in again to publish." : err.message;
      submitBtn.disabled = false;
    });
  });

  // Delete buttons in "Your hackathons"
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-delete-id]");
    if (!b) return;
    if (!window.confirm('Delete "' + b.dataset.deleteName + '"? Its page and catalog listing will be removed.')) return;
    b.disabled = true;
    api("DELETE", "/api/events/" + b.dataset.deleteId).then(function () { window.location.reload(); })
      .catch(function (err) { b.disabled = false; window.alert(err.message); });
  });

  // Start: editing an event, or restore a draft
  if (init) fill(init);
  else {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved && typeof saved === "object") fill(saved);
    } catch (e) {}
  }
  render();
})();
