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
})();
