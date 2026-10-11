// Pixel sprites for the terrain. Each sprite is drawn from a small text map:
// every character is one pixel, "." is empty. Colours come from PAL below.
(function (root) {
  var PAL = {
    k: "#4b3a68", w: "#ffffff", g: "#7fc47a", G: "#5fae6a", l: "#a8e0a0",
    b: "#9a7b66", B: "#7d614f", t: "#f3dfb2", T: "#ead3a0",
    p: "#f59bc0", P: "#ffc4dd", Q: "#e07aa8", y: "#ffe28a", Y: "#f2b94b",
    o: "#f5a65b", O: "#d9822b", r: "#e0586a", R: "#b8394f", s: "#bfe3ff",
    v: "#c9a6f2", V: "#9a7fd1", a: "#c9c4de", A: "#8f89ad", c: "#e9e0fb", n: "#6b5a8c"
  };

  var S = {
    // ---------- nature ----------
    oak_tree: [
      "..GGGGG..", ".GgggglG.", "GggllgggG", "GgggggggG", "GgglgggGG", ".GgggggG.",
      "..GGGGG..", "....b....", "....b....", "....B....", "...bbb..."
    ],
    spruce_tree: [
      "...G...", "..GgG..", "..GgG..", ".GgggG.", ".GgGgG.", "GgggggG", "GgGgGgG", "...b...", "...b..."
    ],
    sapling: [".g.g.", "ggggg", ".ggg.", "..g..", "..b..", "..b.."],
    tall_grass: ["g...g.g", "g.g.g.g", "gGgGgGg", "GgGgGgG", "bbbbbbb"],
    poppy: [".rrr.", "rrkrr", ".rrr.", "..g..", ".gg..", "..g.."],
    dandelion: [".yyy.", "yyYyy", ".yyy.", "..g..", ".gg..", "..g.."],
    tulip: ["p.p.p", "ppppp", ".ppp.", "..g..", ".gg..", "..g.."],
    sunflower: [
      "..yyy..", ".yyByy.", "yyBBByy", ".yyByy.", "..yyy..", "...g...", ".g.g.g.", "..ggg..", "...g..."
    ],
    cherry_blossom: [
      "..pppp...", ".pPpppp..", "pppPpppp.", "ppppPppP.", ".pppppp..", "..pPpp...", "....b....", "....b....", "...bbb..."
    ],
    mushroom: [".rrrr.", "rwrrwr", "rrrrrr", "..tt..", "..tt.."],
    cactus: ["..g...", "..g.g.", "g.g.g.", "g.ggg.", "gggG..", "..gG..", "..gG.."],
    pumpkin: ["...g...", ".ooOoo.", "oooOooo", "oOoOoOo", "oooOooo", ".ooOoo."],

    // ---------- animals (facing right) ----------
    pig: [
      ".......pp.", "pppppppppp", "pppppppppk", "ppppppPPPP", "pppppppPQP", ".pp.ppp.pp", ".Q..Q..Q.."
    ].map(function (r) { return r; }),
    cow: [
      "..........ww", ".kkwwwwwwwww", "wkkwwwkkwwwk", "wwwwwkkwwwwP", "wwwwwwwwwwPP", ".w.w..w.w.PP", ".w.w..w.w..."
    ],
    sheep: [
      "..ccccc.....", ".cccccccakk.", "ccccccccaaaa", "cccccccccaaa", ".cccccccc.a.", "..a.a..a.a.."
    ],
    chicken: [
      "....rr..", "...wwwwr", "..wwwwko", "w.wwwww.", "wwwwwww.", ".wwwww..", "..o.o..."
    ],
    bee: [
      "..ss....", ".ssss...", "..kyky.k", ".kykykkk", "..kyky.k", "...k.k.."
    ],
    octopus: [
      "..vvvv..", ".vvvvvv.", ".vkvvkv.", ".vvvvvv.", "vVvVvVvV", "v.v.v.v."
    ],
    rabbit: [
      "..c.c...", "..cPc...", "..ccc.c.", ".cccccc.", "ccccccck", "ccccccP.", ".c.c.c.."
    ],
    fox: [
      "o.o.....", "ooo.....", "ooooo..oo", "kooooooOO", "oooooooOw", "wooooo.ww", ".k.k.k.."
    ],
    wolf: [
      "A.A.......", "AAAA......", "AkaAAAAAAA", "aaAAAAAAAa", "aaAAAAAAAw", ".a.a..a.a.", ".A.A..A.A."
    ],
    panda: [
      "kk..kk..", "kwwwwwwk", "wkwwwkww", "wwwkwwww", ".wwwwww.", "kwwwwwwk", "kk....kk"
    ],

    // ---------- buildings ----------
    house: [
      "........aa....", ".....pppppp...", "...pppppppppp.", ".pppppppppppp.",
      "QQQQQQQQQQQQQQ", ".bttttttttttb..".slice(0, 14), ".bsbtttbsbttb.", ".bsbtttbsbttb.", ".bttttBBtttb..".slice(0,14), ".btttBBByttb.."
    ].map(function (r) { return r.padEnd(14, ".").slice(0, 14); }),
    cottage: [
      "...GGGGGG...", ".GggggggggG.", "GggggggggggG", "GGGGGGGGGGGG",
      ".bttttttttb.", ".bsstttsstb.", ".bsstttsstb.", ".bttttBBttb.", ".bttttBByttb"
    ].map(function (r) { return r.padEnd(12, ".").slice(0, 12); }),
    store: [
      "rwrwrwrwrwrwr", "rwrwrwrwrwrwr", "RRRRRRRRRRRRR", "btttttttttttb",
      "bsssttttBBttb", "bsssttttBBttb", "bsssttttBByTb", "bbbbbbbbbbbbb"
    ],
    building: [
      "..AAAAAAA..", ".AaaaaaaaA.", ".AsasasasA.", ".AaaaaaaaA.", ".AsasasasA.", ".AaaaaaaaA.",
      ".AsasasasA.", ".AaaaaaaaA.", ".AsasasasA.", ".AaaaaaaaA.", ".AsayaysaA.", ".AaaakaaaA.", ".AAAAkAAAA."
    ],
    watchtower: [
      "..R.....", "..RRR...", "bbbbbbbb", "bsBBBBsb", "bbbbbbbb", ".aAaAaA.", ".aAaAaA.", ".aAsAaA.", ".aAaAaA.",
      ".aAaAaA.", ".aAaAaA.", ".aAkAaA.", ".aAkAaA."
    ],
    castle: [
      "R.......R.......R.", "AA.A.A.AAAA.A.A.AA", "AaAaAaAaaaaAaAaAaA", "AaaaaaaAaaaAaaaaaA",
      "AaasaaaAaaaAaasaaA", "AaaaaaaAaaaAaaaaaA", "AaaaaaaAaaaAaaaaaA", "AAAAAAAAkkkAAAAAAA",
      "AaaaaaaAkkkAaaaaaA", "AaaaaaaAkkkAaaaaaA"
    ]
  };

  // Turn a sprite map into an <svg> string (runs of the same colour become one rect)
  function svg(type) {
    var rows = S[type];
    if (!rows) return "";
    var w = 0, i, x, out = "";
    for (i = 0; i < rows.length; i++) if (rows[i].length > w) w = rows[i].length;
    for (var y = 0; y < rows.length; y++) {
      var row = rows[y];
      x = 0;
      while (x < row.length) {
        var ch = row.charAt(x);
        if (ch === "." || !PAL[ch]) { x++; continue; }
        var start = x;
        while (x < row.length && row.charAt(x) === ch) x++;
        out += '<rect x="' + start + '" y="' + y + '" width="' + (x - start) + '" height="1" fill="' + PAL[ch] + '"/>';
      }
    }
    return '<svg viewBox="0 0 ' + w + " " + rows.length + '" shape-rendering="crispEdges" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' + out + "</svg>";
  }
  function size(type) {
    var rows = S[type];
    if (!rows) return null;
    var w = 0;
    for (var i = 0; i < rows.length; i++) if (rows[i].length > w) w = rows[i].length;
    return { w: w, h: rows.length };
  }
  root.TerrainSprites = { svg: svg, size: size, has: function (t) { return !!S[t]; }, types: Object.keys(S) };
})(typeof window !== "undefined" ? window : this);
