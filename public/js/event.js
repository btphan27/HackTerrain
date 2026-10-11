// Interested / I'm going buttons on a hackathon page, and "Copy" buttons for share links
(function () {
  var msg = document.getElementById("going-msg");
  var btns = Array.prototype.slice.call(document.querySelectorAll("[data-status-btn]"));
  var LABEL = { interested: "Interested", going: "I'm going" };
  function paint(status) {
    btns.forEach(function (b) {
      var on = b.dataset.statusBtn === status;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.textContent = LABEL[b.dataset.statusBtn] + (on ? " \u2713" : "");
    });
  }
  btns.forEach(function (b) {
    b.addEventListener("click", function () {
      var current = null;
      btns.forEach(function (x) { if (x.getAttribute("aria-pressed") === "true") current = x.dataset.statusBtn; });
      var want = current === b.dataset.statusBtn ? null : b.dataset.statusBtn; // press again to remove
      btns.forEach(function (x) { x.disabled = true; });
      fetch("/api/events/" + b.dataset.id + "/going", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ status: want })
      }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "Something went wrong"); return d; }); })
        .then(function (d) {
          paint(d.status);
          var c = document.getElementById("going-count"); if (c) c.textContent = d.count + " going";
          if (msg) msg.textContent = d.status === "going" ? "Saved under Attending on your profile." : d.status === "interested" ? "Saved under Interested on your profile." : "Removed from your profile.";
        })
        .catch(function (e) { if (msg) msg.textContent = e.message; })
        .then(function () { btns.forEach(function (x) { x.disabled = false; }); });
    });
  });

  document.addEventListener("click", function (e) {
    var c = e.target.closest("[data-copy]");
    if (!c) return;
    var text = c.dataset.copy, input = c.parentNode.querySelector("input");
    var done = function () { var old = c.textContent; c.textContent = "Copied!"; setTimeout(function () { c.textContent = old; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { if (input) { input.select(); } });
    else if (input) { input.select(); try { document.execCommand("copy"); done(); } catch (err) {} }
  });
})();
