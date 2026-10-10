// Cute bee that flies after the mouse (mouse devices only)
(function () {
  if (!window.matchMedia("(pointer: fine)").matches) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var BEE = "<svg class=\"bee-svg\" viewBox=\"0 0 14 8\" shape-rendering=\"crispEdges\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\"><rect x=\"13\" y=\"2\" width=\"1\" height=\"1\" fill=\"#4b3a68\"/><rect x=\"3\" y=\"3\" width=\"8\" height=\"1\" fill=\"#4b3a68\"/><rect x=\"12\" y=\"3\" width=\"1\" height=\"1\" fill=\"#4b3a68\"/><rect x=\"2\" y=\"4\" width=\"1\" height=\"1\" fill=\"#4b3a68\"/><rect x=\"3\" y=\"4\" width=\"2\" height=\"1\" fill=\"#ffdf6b\"/><rect x=\"5\" y=\"4\" width=\"1\" height=\"1\" fill=\"#4b3a68\"/><rect x=\"6\" y=\"4\" width=\"2\" height=\"1\" fill=\"#ffdf6b\"/><rect x=\"8\" y=\"4\" width=\"1\" height=\"1\" fill=\"#4b3a68\"/><rect x=\"9\" y=\"4\" width=\"1\" height=\"1\" fill=\"#ffdf6b\"/><rect x=\"10\" y=\"4\" width=\"1\" height=\"1\" fill=\"#4b3a68\"/><rect x=\"11\" y=\"4\" width=\"1\" height=\"1\" fill=\"#4b3a68\"/><rect x=\"1\" y=\"5\" width=\"2\" height=\"1\" fill=\"#4b3a68\"/><rect x=\"3\" y=\"5\" width=\"2\" height=\"1\" fill=\"#ffdf6b\"/><rect x=\"5\" y=\"5\" width=\"1\" height=\"1\" fill=\"#4b3a68\"/><rect x=\"6\" y=\"5\" width=\"2\" height=\"1\" fill=\"#ffdf6b\"/><rect x=\"8\" y=\"5\" width=\"1\" height=\"1\" fill=\"#4b3a68\"/><rect x=\"9\" y=\"5\" width=\"1\" height=\"1\" fill=\"#ffb3c9\"/><rect x=\"10\" y=\"5\" width=\"1\" height=\"1\" fill=\"#ffdf6b\"/><rect x=\"11\" y=\"5\" width=\"1\" height=\"1\" fill=\"#4b3a68\"/><rect x=\"3\" y=\"6\" width=\"8\" height=\"1\" fill=\"#4b3a68\"/><rect x=\"4\" y=\"7\" width=\"1\" height=\"1\" fill=\"#4b3a68\"/><rect x=\"9\" y=\"7\" width=\"1\" height=\"1\" fill=\"#4b3a68\"/><g class=\"wing\"><rect x=\"5\" y=\"0\" width=\"4\" height=\"1\" fill=\"#bfe0f5\"/><rect x=\"4\" y=\"1\" width=\"1\" height=\"1\" fill=\"#bfe0f5\"/><rect x=\"5\" y=\"1\" width=\"4\" height=\"1\" fill=\"#eaf7ff\"/><rect x=\"9\" y=\"1\" width=\"1\" height=\"1\" fill=\"#bfe0f5\"/><rect x=\"4\" y=\"2\" width=\"1\" height=\"1\" fill=\"#bfe0f5\"/><rect x=\"5\" y=\"2\" width=\"4\" height=\"1\" fill=\"#eaf7ff\"/><rect x=\"9\" y=\"2\" width=\"1\" height=\"1\" fill=\"#bfe0f5\"/></g></svg>";
  var COLORS = ["#ffe28a", "#ffc4dd", "#ffffff"];

  var bee = document.createElement("div");
  bee.className = "cursor-bee";
  bee.setAttribute("aria-hidden", "true");
  bee.innerHTML = BEE;
  document.body.appendChild(bee);

  var x = 0, y = 0, tx = 0, ty = 0, dir = 1, tilt = 0, started = false, last = 0;

  window.addEventListener("pointermove", function (e) {
    tx = e.clientX; ty = e.clientY;
    if (!started) {               // only hide the normal cursor once the bee is ready
      started = true; x = tx; y = ty;
      document.documentElement.classList.add("has-bee");
      bee.style.opacity = 1;
    }
  });
  document.addEventListener("mouseleave", function () { bee.style.opacity = 0; });
  document.addEventListener("mouseenter", function () { if (started) bee.style.opacity = 1; });
  document.addEventListener("mouseover", function (e) {
    bee.classList.toggle("is-link", !!e.target.closest("a, button, input, select, textarea, summary"));
  });
  document.addEventListener("mousedown", function () { bee.classList.add("is-down"); });
  document.addEventListener("mouseup", function () { bee.classList.remove("is-down"); });

  function sparkle(px, py) {
    var s = document.createElement("div");
    s.className = "sparkle";
    s.style.left = px + "px"; s.style.top = py + "px";
    s.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
    s.addEventListener("animationend", function () { s.remove(); });
    document.body.appendChild(s);
  }

  function loop(now) {
    var ease = reduce ? 1 : 0.22;
    var vx = tx - x, vy = ty - y;
    x += vx * ease; y += vy * ease;
    if (vx > 2) dir = 1; else if (vx < -2) dir = -1;
    tilt += (Math.max(-16, Math.min(16, vy * 0.5)) - tilt) * 0.2;   // lean up/down
    bee.style.transform = "translate(" + x + "px," + y + "px)";
    bee.firstChild.style.transform = "scaleX(" + dir + ") rotate(" + (-tilt) + "deg)";
    if (!reduce && started && Math.abs(vx) + Math.abs(vy) > 8 && now - last > 70) {
      last = now; sparkle(x - dir * 14, y + 4);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();