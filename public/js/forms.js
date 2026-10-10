// Small helpers for the profile forms (hackathon picker + skill search)
(function () {
  // <div data-max-checks="3"> limits how many checkboxes can be ticked
  document.querySelectorAll("[data-max-checks]").forEach(function (box) {
    var max = Number(box.getAttribute("data-max-checks"));
    var counter = box.querySelector("[data-count]");
    var note = box.querySelector("[data-limit-note]");
    function ticked() { return box.querySelectorAll("input[type=checkbox]:checked").length; }
    function update() { if (counter) counter.textContent = ticked(); }
    box.addEventListener("change", function (e) {
      if (!e.target.matches("input[type=checkbox]")) return;
      if (ticked() > max) {
        e.target.checked = false;
        if (note) note.hidden = false;
      } else if (note) {
        note.hidden = true;
      }
      update();
    });
    update();
  });

  // <input data-filter-input> filters <li data-filter-item data-text="..."> inside its data-filter-scope
  document.querySelectorAll("[data-filter-input]").forEach(function (input) {
    var scope = input.closest("[data-filter-scope]") || document;
    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      scope.querySelectorAll("[data-filter-item]").forEach(function (li) {
        li.hidden = !!q && li.getAttribute("data-text").indexOf(q) === -1;
      });
    });
    // Pressing Enter in the search box should not submit the whole form
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });
  });

  // Hackathon picker filters: <div data-hack-picker> with controls [data-f="q|region|format|month|tag|radius"]
  // and items <li data-item data-name data-region data-format data-month data-tags data-distance>
  document.querySelectorAll("[data-hack-picker]").forEach(function (box) {
    var ctl = {};
    box.querySelectorAll("[data-f]").forEach(function (el) { ctl[el.getAttribute("data-f")] = el; });
    var items = [].slice.call(box.querySelectorAll("[data-item]"));
    var shownEl = box.querySelector("[data-shown]");
    var noneEl = box.querySelector("[data-none]");
    function apply() {
      var q = ctl.q ? ctl.q.value.trim().toLowerCase() : "";
      var n = 0;
      items.forEach(function (li) {
        var ok = true;
        if (q && li.dataset.name.indexOf(q) === -1) ok = false;
        if (ctl.region && ctl.region.value && li.dataset.region !== ctl.region.value) ok = false;
        if (ctl.format && ctl.format.value && li.dataset.format !== ctl.format.value) ok = false;
        if (ctl.month && ctl.month.value && li.dataset.month !== ctl.month.value) ok = false;
        if (ctl.tag && ctl.tag.value && li.dataset.tags.split(",").indexOf(ctl.tag.value) === -1) ok = false;
        if (ctl.radius && ctl.radius.value) {
          var mi = parseFloat(li.dataset.distance);
          if (isNaN(mi) || mi > parseFloat(ctl.radius.value)) ok = false;
        }
        li.hidden = !ok;
        if (ok) n++;
      });
      if (shownEl) shownEl.textContent = n + " of " + items.length;
      if (noneEl) noneEl.hidden = n !== 0 || !items.length;
    }
    Object.keys(ctl).forEach(function (k) { ctl[k].addEventListener(k === "q" ? "input" : "change", apply); });
    if (ctl.q) ctl.q.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });
    var clear = box.querySelector("[data-f-clear]");
    if (clear) clear.addEventListener("click", function () {
      Object.keys(ctl).forEach(function (k) { ctl[k].value = ""; });
      apply();
    });
    apply();
  });
})();
