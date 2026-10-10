// Live preview for the avatar maker on the profile setup page
(function () {
  var box = document.getElementById("avatar-maker");
  if (!box || !window.PixelAvatar) return;
  var A = window.PixelAvatar;
  var preview = document.getElementById("avatar-preview");
  function read() {
    var c = {};
    A.NAMES.forEach(function (n) {
      var el = box.querySelector("input[name=a_" + n + "]:checked");
      c[n] = el ? el.value : 0;
    });
    return A.fromChoices(c);
  }
  function draw() { preview.innerHTML = A.svg(read()); }
  box.addEventListener("change", draw);
  document.getElementById("avatar-random").addEventListener("click", function () {
    var parts = A.random().split("-");
    A.NAMES.forEach(function (n, i) {
      var el = box.querySelector("input[name=a_" + n + "][value='" + parts[i] + "']");
      if (el) el.checked = true;
    });
    draw();
  });
})();
