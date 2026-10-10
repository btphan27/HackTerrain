// Pixel avatar maker. Used by the server (to draw saved avatars) and by the
// browser (live preview on the profile setup page).
// An avatar is stored as a short code like "1-2-0-3-1-0":
//   skin - hair colour - hair style - shirt - background - accessory
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PixelAvatar = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var SKIN = ["#ffe0c2", "#f3c79c", "#d9a06f", "#a8714a", "#6f4a2e"];
  var HAIR = ["#2f2545", "#7a4a2a", "#d9a441", "#c9573b", "#f59bc0", "#7ab8f5"];
  var SHIRT = ["#ffc4dd", "#a8e0a0", "#ffe28a", "#c4e6ff", "#e9e0fb", "#f59bc0"];
  var BG = ["#c4e6ff", "#ffe6f2", "#e9e0fb", "#d6f3d9", "#ffe28a"];
  var STYLES = ["Short", "Long", "Spiky", "Bald", "Bun"];
  var ACCS = ["None", "Glasses", "Flowers"];
  var INK = "#4b3a68";
  var LIMITS = [SKIN.length, HAIR.length, STYLES.length, SHIRT.length, BG.length, ACCS.length];
  var NAMES = ["skin", "hair", "style", "shirt", "bg", "acc"];

  function parse(code) {
    var parts = String(code || "").split("-");
    if (parts.length !== 6) return null;
    var out = [];
    for (var i = 0; i < 6; i++) {
      if (!/^\d$/.test(parts[i])) return null;
      var n = Number(parts[i]);
      if (n >= LIMITS[i]) return null;
      out.push(n);
    }
    return out;
  }

  function rect(x, y, w, h, c) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + c + '"/>';
  }

  // Returns an <svg> string, or "" if the code is not valid.
  function svg(code) {
    var v = parse(code);
    if (!v) return "";
    var skin = SKIN[v[0]], hair = HAIR[v[1]], style = v[2], shirt = SHIRT[v[3]], bg = BG[v[4]], acc = v[5];
    var s = rect(0, 0, 12, 12, bg);
    s += rect(2, 9, 8, 3, shirt) + rect(5, 9, 2, 1, skin);          // shirt + neck
    // hair behind the face
    if (style === 1) s += rect(2, 3, 8, 7, hair);                   // long
    if (style === 4) s += rect(5, 0, 2, 2, hair);                   // bun
    s += rect(3, 3, 6, 6, skin);                                    // face
    // hair on top
    if (style !== 3) s += rect(3, 2, 6, 1, hair) + rect(3, 3, 1, 1, hair) + rect(8, 3, 1, 1, hair);
    if (style === 2) s += rect(3, 1, 1, 1, hair) + rect(5, 1, 1, 1, hair) + rect(7, 1, 1, 1, hair);
    if (style === 1) s += rect(3, 3, 6, 1, hair);
    // face
    s += rect(4, 5, 1, 1, INK) + rect(7, 5, 1, 1, INK) + rect(5, 7, 2, 1, "#c9573b");
    if (acc === 1) s += rect(3, 5, 1, 1, INK) + rect(5, 5, 2, 1, INK) + rect(8, 5, 1, 1, INK) + rect(3, 4, 6, 1, "rgba(75,58,104,.25)");
    if (acc === 2) s += rect(3, 2, 1, 1, "#f59bc0") + rect(5, 2, 1, 1, "#ffe28a") + rect(7, 2, 1, 1, "#f59bc0");
    return '<svg class="avatar-svg" viewBox="0 0 12 12" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pixel avatar">' + s + "</svg>";
  }

  function fromChoices(c) {
    var out = [];
    for (var i = 0; i < 6; i++) {
      var n = Number(c[NAMES[i]]);
      out.push(Number.isInteger(n) && n >= 0 && n < LIMITS[i] ? n : 0);
    }
    return out.join("-");
  }

  function random() {
    return LIMITS.map(function (m) { return Math.floor(Math.random() * m); }).join("-");
  }

  return { SKIN: SKIN, HAIR: HAIR, SHIRT: SHIRT, BG: BG, STYLES: STYLES, ACCS: ACCS, NAMES: NAMES, LIMITS: LIMITS,
           parse: parse, svg: svg, fromChoices: fromChoices, random: random };
});
