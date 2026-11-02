/* Solutions Analytics: print-ready scout reports built from Hudl exports.
   SK.load(raw)            raw = [{ name, header: [...], rows: [[...]] }] → { games, rows }
   SK.selfScout(data, opt) → array of sections; SK.paginate(sections, host, opt) → letter pages in host */
(function (G) {
  "use strict";
  // ---------------------------------------------------------------- data
  var TOTALN = 0;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] }) };
  var up = function (v) { return v == null ? "" : String(v).trim().toUpperCase() };
  var num = function (v) { if (v == null || v === "") return null; var n = +String(v).replace(/[^\d.\-]/g, ""); return isNaN(n) || String(v).trim() === "" ? null : n };
  function col(h, names) { for (var i = 0; i < h.length; i++) { var x = up(h[i]); for (var j = 0; j < names.length; j++) if (x === names[j]) return i } return -1 }
  function title(s) { s = String(s || "").trim(); if (!s) return ""; return s.toLowerCase().replace(/(^|[\s\/-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase() }).replace(/\bMc([a-z])/g, function (m, c) { return "Mc" + c.toUpperCase() }) }
  var RUNRES = /^RUSH/, PASSRES = /^(COMPLETE|INCOMPLETE|SCRAMBLE|SACK|INTERCEPTION)/;
  function load(raw, opt) {
    opt = opt || {}; var names = opt.names || {}, rows = [], games = [], gmap = {}, inferred = 0, total = 0, pen = 0;
    (raw || []).forEach(function (f, fi) {
      var h = f.header || [], c = function () { return col(h, Array.prototype.slice.call(arguments)) };
      var I = { pn: c("PLAY #", "PLAY#", "PLAY"), odk: c("ODK"), q: c("QTR"), ser: c("SERIES"), dn: c("DN"), dist: c("DIST"), yl: c("YARD LN", "YARD LINE"), pt: c("PLAY TYPE"), res: c("RESULT"), gain: c("GN/LS", "GAIN"), hash: c("HASH"),
        form: c("O FORMATION", "OFF FORM", "FORMATION"), adj: c("FORM ADJ"), mot: c("MOTION"), run: c("RUN FAMILY", "RUN CONCEPT"), pass: c("PASS FAMILY", "PASS CONCEPT"), rpo: c("RPO"), rb: c("RB ALIGNMENT", "RB ALIGN"),
        front: c("FRONT"), blitz: c("BLITZ"), shell: c("MFC/MFO/0", "SHELL"), cov: c("COVERAGE"), tgt: c("TARGET"), car: c("BALL CARRIER"), team: c("TEAM", "OPPONENT"), pers: c("PERSONNEL", "OFF PERS") };
      var g = function (r, k) { return I[k] < 0 ? null : r[I[k]] };
      var lastPn = null, gcur = null, lastTeam = null;
      (f.rows || []).forEach(function (r, ri) {
        var pn = num(g(r, "pn")), team = String(g(r, "team") || "").trim();
        if (!gcur || (pn != null && lastPn != null && pn < lastPn) || (pn == null && team && lastTeam && team !== lastTeam)) {
          var key = fi + ":" + games.length, raw0 = team || ("Game " + (games.length + 1)), nm = names[raw0] || names[up(raw0)] || title(raw0);
          gcur = { id: key, raw: raw0, name: nm, short: opt.shortNames && opt.shortNames[nm] || nm.split(/\s+/)[0], file: f.name, i: games.length }; games.push(gcur); gmap[key] = gcur;
        }
        if (pn != null) lastPn = pn; if (team) lastTeam = team;
        total++;
        var res = up(g(r, "res")), pt = up(g(r, "pt")), type = pt === "RUN" ? "Run" : pt === "PASS" ? "Pass" : null;
        if (!type && !pt) { if (RUNRES.test(res)) { type = "Run"; inferred++ } else if (PASSRES.test(res)) { type = "Pass"; inferred++ } else if (!res && up(g(r, "run"))) { type = "Run"; inferred++ } else if (!res && up(g(r, "pass"))) { type = "Pass"; inferred++ } }
        var isPen = /^PENALTY/.test(res); if (isPen) pen++;
        var dn = num(g(r, "dn")), yl = num(g(r, "yl")), gain = num(g(r, "gain"));
        var hs = up(g(r, "hash")); hs = hs[0] === "L" ? "L" : hs[0] === "R" ? "R" : hs[0] === "M" ? "M" : null;
        var rbv = up(g(r, "rb"));
        rows.push({ game: gcur, gid: gcur.id, pn: pn, odk: up(g(r, "odk")), qtr: num(g(r, "q")), ser: num(g(r, "ser")), dn: dn, dist: num(g(r, "dist")), yl: yl, ptRaw: pt, type: type, res: res, resRaw: String(g(r, "res") || "").trim(), pen: isPen,
          gain: gain, hash: hs, form: up(g(r, "form")) || null, adj: up(g(r, "adj")) || null, motion: up(g(r, "mot")) || null, runC: up(g(r, "run")) || null, passC: up(g(r, "pass")) || null, rpo: up(g(r, "rpo")) || null, rb: rbv || null,
          front: up(g(r, "front")) || null, blitz: up(g(r, "blitz")) || null, shell: up(g(r, "shell")) || null, cov: up(g(r, "cov")) || null, tgt: g(r, "tgt"), car: g(r, "car"), pers: up(g(r, "pers")) || null, td: /TD/.test(res), cols: I, rowIdx: ri, raw: r });
      });
    });
    // name each game after the other team: a TEAM value found in most games is the film's own team, not the opponent
    var inG = {}; games.forEach(function (g) { var seen = {}; rows.forEach(function (r) { if (r.gid === g.id) { var t = String(r.raw[r.cols.team] || "").trim(); if (t) { seen[t] = (seen[t] || 0) + 1 } } }); g.teams = seen; Object.keys(seen).forEach(function (t) { inG[t] = (inG[t] || 0) + 1 }) });
    var selfT = {}; if (games.length >= 3) Object.keys(inG).forEach(function (t) { if (inG[t] >= games.length / 2) selfT[t] = 1 });
    var used = {};
    games.forEach(function (g, i) { var best = null; Object.keys(g.teams).forEach(function (t) { if (!selfT[t] && (!best || g.teams[t] > g.teams[best])) best = t }); var raw0 = best || ("Game " + (i + 1)); g.raw = raw0; var nm = names[raw0] || names[up(raw0)] || (best ? title(raw0) : "Opponent " + (i + 1) + " (unnamed)"); if (used[nm]) nm += " (" + (++used[nm]) + ")"; else used[nm] = 1; g.name = nm; g.short = opt.shortNames && opt.shortNames[nm] || nm.split(/\s+/)[0] });
    return { rows: rows, games: games, inferred: inferred, total: total, pen: pen };
  }
  // the plays every table uses: runs and passes, no penalties
  function plays(d, gids) { return d.rows.filter(function (r) { return (r.type === "Run" || r.type === "Pass") && !r.pen && (!gids || gids[r.gid]) }) }
  function need(p) { return p.dn === 2 ? 0.5 : p.dn >= 3 ? 1 : 0.4 }
  function eff(p) { return p.gain != null && p.dist != null && p.gain >= need(p) * p.dist }
  function expl(p) { return p.gain != null && ((p.type === "Run" && p.gain >= 10) || (p.type === "Pass" && p.gain >= 15)) }
  function concept(p) { return p.type === "Run" ? p.runC : p.passC }
  function conceptT(p) { return concept(p) || "(untagged)" }
  function toY(yl) { return yl == null ? null : yl < 0 ? -yl : 100 - yl } // yards from our goal line
  function field(yl) { return yl == null ? "-" : yl === 50 ? "50" : yl < 0 ? "Own " + (-yl) : "Opp " + yl }
  function ddTxt(p) { return p.dn === 0 ? "P&10" : p.dn ? p.dn + "&" + (p.dist == null ? "?" : p.dist) : "-" }
  function rnd(x, dp) { var m = Math.pow(10, dp || 0), v = +(x * m).toFixed(9), f = Math.floor(v), r = v - f; if (Math.abs(r - 0.5) < 1e-9) return (f % 2 === 0 ? f : f + 1) / m; return Math.round(v) / m }
  var pct = function (a, b) { return b ? rnd(100 * a / b) : null };
  var P = function (a, b) { var v = pct(a, b); return v == null ? "-" : v + "%" };
  var f1 = function (v) { return v == null || isNaN(v) ? "-" : rnd(v, 1).toFixed(1) };
  function stat(A) {
    var o = { n: A.length, gain: 0, g: 0, eff: 0, run: 0, pass: 0, rg: 0, pg: 0, reff: 0, peff: 0, rn: 0, pn: 0, rgn: 0, pgn: 0, ex: 0 };
    A.forEach(function (p) {
      var gg = p.gain || 0; if (p.gain != null) o.g++; o.gain += gg; if (eff(p)) o.eff++; if (expl(p)) o.ex++;
      if (p.type === "Run") { o.run++; o.rg += gg; if (p.gain != null) o.rgn++; if (eff(p)) o.reff++ } else { o.pass++; o.pg += gg; if (p.gain != null) o.pgn++; if (eff(p)) o.peff++ }
    });
    o.avg = o.g ? o.gain / o.g : null; o.ravg = o.rgn ? o.rg / o.rgn : null; o.pavg = o.pgn ? o.pg / o.pgn : null;
    return o;
  }
  function groupBy(A, f) { var m = {}, order = []; A.forEach(function (p) { var k = f(p); if (k == null) return; if (!m[k]) { m[k] = []; order.push(k) } m[k].push(p) }); return { m: m, keys: order } }
  function median(a) { if (!a.length) return null; a = a.slice().sort(function (x, y) { return x - y }); var h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2 }
  function joinAnd(a) { return a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1] }

  // ---------------------------------------------------------------- html bits
  var CSS = "" +
  ".skpage{width:816px;height:1056px;background:#fff;color:#111;position:relative;overflow:hidden;font:11.5px/1.35 Helvetica,Arial,'Liberation Sans',sans-serif;box-sizing:border-box;page-break-after:always;break-after:page}" +
  ".skpage *{box-sizing:border-box}" +
  ".skhead{height:84px;background:#0d0e12;border-bottom:6px solid #d93732;display:flex;align-items:center;gap:14px;padding:0 22px 0 40px}" +
  ".skhead img{height:58px;width:auto;max-width:120px;object-fit:contain}.skhead .lg{width:104px;height:58px;display:flex;align-items:center;justify-content:center;font:900 22px/1 'Arial Black',Helvetica,sans-serif;color:#d93732;letter-spacing:.04em;text-align:center}" +
  ".skhead .rp{color:#d93732;font-size:19px;margin:0 2px 26px 18px;white-space:nowrap}" +
  ".skhead .tt{color:#fff;font:700 27px/1.05 'Arial Narrow','Helvetica Neue',Arial,sans-serif;letter-spacing:.02em;text-transform:uppercase}" +
  ".skhead .st{color:#c9c9c9;font-size:12.5px;margin-top:9px;letter-spacing:.02em}" +
  ".skbody{position:absolute;left:48px;right:48px;top:96px;bottom:46px}" +
  ".skmeta{display:flex;justify-content:space-between;border-bottom:1.5px solid #111;padding-bottom:3px;font-size:10.5px}" +
  ".skgames{margin:8px 0 6px;font-size:10.5px}.skgames b{display:block;margin-bottom:2px}.skgames .gl{display:grid;grid-template-columns:repeat(4,1fr);gap:1px 10px}" +
  ".skfoot{position:absolute;left:48px;right:48px;bottom:12px;font-size:8.6px;color:#555}.skfoot .lg2{display:flex;gap:16px;margin-top:4px;align-items:center}.skfoot i{display:inline-block;width:12px;height:9px;margin-right:5px;vertical-align:-1px}" +
  ".skblk{margin:10px 0 0}.skh2{color:#d93732;font-weight:700;font-size:13.5px;margin:14px 0 6px}.sknote{color:#666;font-size:10px;margin:3px 0 0}.skp{margin:4px 0;font-size:11.5px}.skbul{margin:2px 0;font-size:11.5px}" +
  "table.skt{border-collapse:collapse;width:100%;font-size:10px;border-bottom:1.5px solid #111}" +
  ".skpage table,.skpage th,.skpage td{font-family:inherit;letter-spacing:0;text-transform:none;border-bottom:0;font-variant-numeric:normal;line-height:1.35}.skpage th{font-size:inherit}" +
  "table.skt th{background:#0d0e12;color:#fff;font-weight:700;padding:4px 5px;text-align:right;white-space:nowrap}table.skt th:first-child{text-align:left}" +
  "table.skt tr.hd2 th{border-bottom:2px solid #d93732}table.skt thead tr:last-child th{border-bottom:2px solid #d93732}" +
  "table.skt td{padding:2.6px 5px;text-align:right;white-space:nowrap}table.skt td:first-child{text-align:left;font-weight:700}" +
  "table.skt tbody tr:nth-child(odd) td{background:#e6e6e6}table.skt tbody tr:nth-child(even) td{background:#f6f6f6}" +
  "table.skt tr.all td{background:#c9c9c9!important;font-weight:700}" +
  "table.skt td.sep,table.skt th.sep{border-left:1px solid #111}" +
  "table.skt td.am{background:#ffe9a8!important;font-weight:700}table.skt td.gr{background:#c8e6c9!important;font-weight:700}table.skt td.rd{background:#f5c0c0!important;font-weight:700}" +
  "table.skt td.gy{color:#a5a5a5}table.skt tr.gy td{color:#a5a5a5;font-weight:400}table.skt.plain td:first-child{font-weight:400}" +
  "table.skt.cen td,table.skt.cen th{text-align:center}table.skt.cen td:first-child,table.skt.cen th:first-child{text-align:left}" +
  "table.skt.wrap td{white-space:normal;vertical-align:middle;text-align:left;padding:5px 6px}table.skt.wrap th{text-align:left}" +
  "table.skt td.td{color:#d93732}" +
  ".sk2{display:grid;grid-template-columns:1fr 1fr;gap:0 40px}.sk2>div{min-width:0}" +
  ".skbox{border:1.5px solid #111;background:#d9d9d9;width:270px}.skbox .a{padding:6px 8px;border-bottom:1.5px solid #111}.skbox .a b{font-size:15px;display:block}.skbox .a span{font-size:13px}.skbox .b{padding:6px 8px;font-size:11.5px;line-height:1.5}" +
  "@media print{.skpage{margin:0!important;box-shadow:none!important}}";
  var LEG = "<div class='lg2'><span><i style='background:#ffe9a8'></i>75%+ run or pass (predictable)</span><span><i style='background:#c8e6c9'></i>well above our average</span><span><i style='background:#f5c0c0'></i>well below our average</span><span>Compared with the ALL row of the same table. Small samples are never highlighted.</span></div>";
  var EFFDEF = "Eff% = share of plays gaining 40% of distance (1st), 50% (2nd) or full distance (3rd/4th). Penalty plays excluded. P&10 = first play of a series.";

  // cells
  function td(v, cls) { return "<td" + (cls ? " class='" + cls + "'" : "") + ">" + (v == null ? "-" : v) + "</td>" }
  // highlight Eff% vs the ALL row (15 points either way, 8+ plays)
  function effCls(e, n, base) { if (n < 8 || base == null || e == null) return ""; return e - base >= 15 ? "gr" : base - e >= 15 ? "rd" : "" }
  function lean(p, n) { return n >= 10 && p >= 75 ? "am" : "" }
  // the TOTAL | RUN | PASS block used on most pages
  function rpHead(label) {
    return "<thead><tr><th></th><th colspan='5' style='text-align:center'>TOTAL</th><th class='sep' colspan='5' style='text-align:center'>RUN</th><th class='sep' colspan='5' style='text-align:center'>PASS</th></tr>" +
      "<tr><th>" + (label || "") + "</th><th>#</th><th>%</th><th>Gain</th><th>Avg</th><th>Eff%</th><th class='sep'>#</th><th>%</th><th>Gain</th><th>Avg</th><th>Eff%</th><th class='sep'>#</th><th>%</th><th>Gain</th><th>Avg</th><th>Eff%</th></tr></thead>";
  }
  function rpRow(label, A, ALL, base, cls) {
    var s = stat(A), n = s.n, all = TOTALN || ALL.length;
    if (!n) return "<tr class='" + (cls || "") + "'><td>" + label + "</td>" + new Array(16).join("<td>-</td>") + "</tr>";
    var rp = pct(s.run, n), pp = pct(s.pass, n), isAll = cls === "all";
    var e = pct(s.eff, n), re = pct(s.reff, s.run), pe = pct(s.peff, s.pass);
    return "<tr class='" + (cls || "") + "'><td>" + label + "</td>" + td(n) + td(P(n, all)) + td(s.gain) + td(f1(s.avg)) + td(e + "%", isAll ? "" : effCls(e, n, base.e)) +
      (s.run ? td(s.run, "sep") + td(rp + "%", isAll ? "" : lean(rp, n)) + td(s.rg) + td(f1(s.ravg)) + td(re + "%", isAll ? "" : effCls(re, s.run, base.re)) : td("-", "sep") + td("-") + td("-") + td("-") + td("-")) +
      (s.pass ? td(s.pass, "sep") + td(pp + "%", isAll ? "" : lean(pp, n)) + td(s.pg) + td(f1(s.pavg)) + td(pe + "%", isAll ? "" : effCls(pe, s.pass, base.pe)) : td("-", "sep") + td("-") + td("-") + td("-") + td("-")) + "</tr>";
  }
  function baseOf(A) { var s = stat(A); return { e: pct(s.eff, s.n), re: pct(s.reff, s.run), pe: pct(s.peff, s.pass) } }
  // rows = [[label, plays]]; first row is the ALL row
  function rpTable(label, rows, allLabel) {
    var ALL = rows[0][1], base = baseOf(ALL);
    return "<table class='skt'>" + rpHead(label) + "<tbody>" + rows.map(function (r, i) { return rpRow(r[0], r[1], ALL, base, i === 0 ? "all" : "") }).join("") + "</tbody></table>";
  }
  function rpCell(A) { if (!A.length) return { t: "-", c: "gy" }; var s = stat(A), rp = pct(s.run, s.n); return { t: rp + "% / " + (100 - rp) + "% (" + s.n + ")", c: s.n < 5 ? "gy" : lean(Math.max(rp, 100 - rp), s.n) } }
  // run % / pass % split by game
  function byGame(head, rows, games) {
    return "<table class='skt cen' style='font-size:8.6px;table-layout:fixed'><thead><tr><th style='width:150px'>" + head + "</th>" + games.map(function (g) { return "<th>" + esc(g.short) + "</th>" }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r, i) { return "<tr class='" + (i === 0 && r[2] !== false ? "all" : "") + "'><td>" + r[0] + "</td>" + games.map(function (g) { var c = rpCell(r[1].filter(function (p) { return p.gid === g.id })); return td(c.t, c.c) }).join("") + "</tr>" }).join("") + "</tbody></table>";
  }
  // generic cross table: rows × columns of run/pass split
  function cross(head, rows, cols) {
    return "<table class='skt cen'><thead><tr><th>" + head + "</th>" + cols.map(function (c) { return "<th>" + c[0] + "</th>" }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) { return "<tr><td>" + r[0] + "</td>" + cols.map(function (c) { var x = rpCell(r[1].filter(c[1])); return td(x.t, x.c) }).join("") + "</tr>" }).join("") + "</tbody></table>";
  }
  // concept list: [name, #, avg, eff]
  function conceptTable(head, A, opt) {
    opt = opt || {}; var g = groupBy(A, conceptT), base = pct(A.filter(eff).length, A.length), min = opt.min || 0, gray = opt.gray == null ? 5 : opt.gray;
    var ks = g.keys.filter(function (k) { return g.m[k].length >= min }).sort(function (a, b) { return g.m[b].length - g.m[a].length || (a < b ? -1 : 1) });
    if (opt.limit) ks = ks.slice(0, opt.limit);
    if (!ks.length) return "<table class='skt plain'><thead><tr><th>" + head + "</th><th>#</th><th>Avg</th><th>Eff%</th></tr></thead><tbody><tr><td>-</td><td></td><td></td><td></td></tr></tbody></table>";
    return "<table class='skt plain'><thead><tr><th>" + head + "</th><th>#</th><th>Avg</th><th>Eff%</th></tr></thead><tbody>" + ks.map(function (k) {
      var B = g.m[k], s = stat(B), e = pct(s.eff, s.n), small = s.n < gray;
      return "<tr class='" + (small ? "gy" : "") + "'><td>" + esc(k) + "</td>" + td(s.n) + td(f1(s.avg)) + td(e + "%", small ? "" : effCls(e, s.n < 5 ? 0 : 99, base)) + "</tr>";
    }).join("") + "</tbody></table>";
  }
  function topConcepts(A, type, k) { var B = A.filter(function (p) { return p.type === type }), g = groupBy(B, function (p) { return concept(p) }); return g.keys.sort(function (a, b) { return g.m[b].length - g.m[a].length }).slice(0, k || 3).map(function (c) { var s = stat(g.m[c]); return esc(c) + " " + s.n + " (" + f1(s.avg) + ")" }).join(", ") || "-" }
  function topConceptTable(head, groups) {
    return "<table class='skt wrap'><thead><tr><th style='width:120px'>" + head + "</th><th style='width:50px'>Plays</th><th>Top run concepts: plays (yds/play)</th><th>Top pass concepts: plays (yds/play)</th></tr></thead><tbody>" +
      groups.map(function (g) { return "<tr><td style='font-weight:700'>" + g[0] + "</td><td>" + g[1].length + "</td><td>" + topConcepts(g[1], "Run") + "</td><td>" + topConcepts(g[1], "Pass") + "</td></tr>" }).join("") + "</tbody></table>";
  }
  function bul(a) { return a.filter(Boolean).map(function (t) { return "<div class='skbul'>• " + t + "</div>" }).join("") }
  var h2 = function (t) { return "<div class='skh2'>" + t + "</div>" };
  var note = function (t) { return "<div class='sknote'>" + t + "</div>" };
  var DDB = [["P/10 (series opener)", function (p) { return p.dn === 0 }], ["1st/10 (mid-series)", function (p) { return p.dn === 1 && p.dist === 10 }], ["1st 11+", function (p) { return p.dn === 1 && p.dist > 10 }], ["1st 1-9", function (p) { return p.dn === 1 && p.dist < 10 }],
    ["2nd 10+", function (p) { return p.dn === 2 && p.dist >= 10 }], ["2nd 7-9", function (p) { return p.dn === 2 && p.dist >= 7 && p.dist <= 9 }], ["2nd 3-6", function (p) { return p.dn === 2 && p.dist >= 3 && p.dist <= 6 }], ["2nd 1-2", function (p) { return p.dn === 2 && p.dist <= 2 }],
    ["3rd 10+", function (p) { return p.dn === 3 && p.dist >= 10 }], ["3rd 7-9", function (p) { return p.dn === 3 && p.dist >= 7 && p.dist <= 9 }], ["3rd 3-6", function (p) { return p.dn === 3 && p.dist >= 3 && p.dist <= 6 }], ["3rd 1-2", function (p) { return p.dn === 3 && p.dist <= 2 }],
    ["4th 3+", function (p) { return p.dn === 4 && p.dist >= 3 }], ["4th 1-2", function (p) { return p.dn === 4 && p.dist <= 2 }]];
  var DOWNS = [["1st & P/10", function (p) { return p.dn <= 1 }], ["2nd down", function (p) { return p.dn === 2 }], ["3rd down", function (p) { return p.dn === 3 }], ["4th down", function (p) { return p.dn === 4 }]];
  var HASHES = [["Left hash", "L"], ["Middle", "M"], ["Right hash", "R"]];
  var RBNAME = { STACK: "STACK", SLANT: "SLANT", FLD: "FLD (field)", FIELD: "FLD (field)", BND: "BND (boundary)", BOUNDARY: "BND (boundary)", EMPTY: "EMPTY" };
  function rbOf(p) { if (!p.rb || /^\d+$/.test(p.rb)) return "Not tagged"; return RBNAME[p.rb] || p.rb }
  function forms(A, min) { var g = groupBy(A, function (p) { return p.form }); return g.keys.sort(function (a, b) { return g.m[b].length - g.m[a].length || (a < b ? -1 : 1) }).filter(function (k) { return g.m[k].length >= (min || 1) }).map(function (k) { return [k, g.m[k]] }) }
  function withOther(list, A, min, label) { var big = list.filter(function (x) { return x[1].length >= min }), small = []; list.forEach(function (x) { if (x[1].length < min) small = small.concat(x[1]) }); var none = A.filter(function (p) { return !p.form }); small = small.concat(none); if (small.length) big.push([label || "Other (<" + min + " plays)", small]); return big }

  // ---------------------------------------------------------------- self scout
  function selfScout(d, opt) {
    opt = opt || {}; var gids = opt.games || null, games = d.games.filter(function (g) { return !gids || gids[g.id] });
    var A = plays(d, gids); TOTALN = A.length; var R = A.filter(function (p) { return p.type === "Run" }), Pp = A.filter(function (p) { return p.type === "Pass" }), S = [];
    var rows = d.rows.filter(function (r) { return !gids || gids[r.gid] }), nonPen = rows.filter(function (r) { return !r.pen });
    var gname = function (g) { return g.name }, S0 = stat(A);
    var sec = function (title, blocks, foot) { S.push({ title: title, blocks: blocks.filter(Boolean), foot: foot }) };
    // 1 data check
    (function () {
      var cols = [["Down", function (r) { return r.dn != null }], ["Dist", function (r) { return r.dist != null }], ["Yard In", function (r) { return r.yl != null }], ["Hash", function (r) { return !!r.hash }], ["Qtr", function (r) { return r.qtr != null }], ["Series", function (r) { return r.ser != null }], ["Formation", function (r) { return !!r.form }],
        ["Run concept*", function (r) { return !!r.runC }, function (r) { return r.type === "Run" }], ["Pass concept*", function (r) { return !!r.passC }, function (r) { return r.type === "Pass" }], ["RB align", function (r) { return !!r.rb }], ["Gain", function (r) { return r.gain != null }]];
      var cell = function (B, c) { var C = c[2] ? B.filter(c[2]) : B; if (!C.length) return td("-"); var v = pct(C.filter(c[1]).length, C.length); return td(v + "%", v < 80 ? "rd" : v < 95 ? "am" : "") };
      var line = function (lab, B, cls) { return "<tr class='" + (cls || "") + "'><td>" + lab + "</td>" + td(B.length) + cols.map(function (c) { return cell(B, c) }).join("") + "</tr>" };
      var t = "<table class='skt'><thead><tr><th>GAME</th><th>Rows</th>" + cols.map(function (c) { return "<th>" + c[0].replace(" ", "<br>") + "</th>" }).join("") + "</tr></thead><tbody>" + line("ALL", nonPen, "all") + games.map(function (g) { return line(esc(g.name), nonPen.filter(function (r) { return r.gid === g.id })) }).join("") + "</tbody></table>";
      var fixes = [];
      cols.forEach(function (c) { var bad = games.map(function (g) { var B = nonPen.filter(function (r) { return r.gid === g.id }); B = c[2] ? B.filter(c[2]) : B; var v = pct(B.filter(c[1]).length, B.length); return v != null && v < 80 ? esc(g.name) + " (" + v + "%)" : null }).filter(Boolean); if (bad.length) fixes.push("<b>" + c[0].replace("*", "") + "</b>: tag the " + c[0].replace("*", "").toLowerCase() + " column in " + bad.join(", ") + ".") });
      var odd = [], mis = A.filter(function (p) { return p.type === "Run" && /^(COMPLETE|INCOMPLETE)/.test(p.res) }).length; if (mis) odd.push(mis + " plays are tagged Run but the result is Complete or Incomplete (often a thrown RPO). Check the play type.");
      var numRb = A.filter(function (p) { return p.rb && /^\d+$/.test(p.rb) }); if (numRb.length) { var nv = groupBy(numRb, function (p) { return p.rb }); odd.push("RB ALIGNMENT has " + numRb.length + " numeric entries (" + nv.keys.map(function (k) { return '"' + k + '" x' + nv.m[k].length }).join(", ") + ") mixed with names like STACK / FLD. Pick one system.") }
      var ng = A.filter(function (p) { return p.gain == null }).length; if (ng) odd.push(ng + " run/pass plays have no GN/LS. They drop out of the tables that need it.");
      if (d.inferred) odd.push(d.inferred + " plays had no PLAY TYPE, so Run or Pass was read from the RESULT.");
      var counts = games.map(function (g) { return esc(g.name) + " " + rows.filter(function (r) { return r.gid === g.id }).length }).join(", ");
      sec("Data check", ["<p class='skp' style='color:#555'>" + rows.length + " rows across " + games.length + " games (" + counts + "). " + rows.filter(function (r) { return r.pen }).length + " penalty rows are left out of every table.</p>",
        h2("How complete is the tagging? (share of plays with the column filled in)") + t + note("Red = under 80% tagged, yellow = 80-94%. * Run concept is measured on run plays only, pass concept on pass plays only. Penalty rows excluded."),
        fixes.length ? h2("What to fix in Hudl (most impact first)") + bul(fixes) : "", odd.length ? h2("Odd or inconsistent values") + bul(odd) : "",
        note("Fixing these in Hudl and re-exporting makes every page after this one more accurate. The report still builds with gaps; affected numbers just cover fewer plays.")]);
    })();
    // 2 key tendencies
    (function () {
      var T = [], gs = games.map(function (g) { var B = A.filter(function (p) { return p.gid === g.id }); return [g.name, pct(B.filter(function (p) { return p.type === "Run" }).length, B.length), B.length] }).filter(function (x) { return x[2] >= 10 }).sort(function (a, b) { return a[1] - b[1] });
      T.push(["Overall", pct(S0.run, S0.n) + "% run, " + pct(S0.pass, S0.n) + "% pass over " + S0.n + " plays." + (gs.length > 1 ? " Run share swings by game, from " + gs[0][1] + "% (" + esc(gs[0][0]) + ") to " + gs[gs.length - 1][1] + "% (" + esc(gs[gs.length - 1][0]) + ")." : "") + " Eff% is " + pct(S0.eff, S0.n) + "% overall: " + pct(S0.reff, S0.run) + "% on runs, " + pct(S0.peff, S0.pass) + "% on passes."]);
      var t3s = A.filter(function (p) { return p.dn === 3 && p.dist <= 3 }), t3l = A.filter(function (p) { return p.dn === 3 && p.dist >= 4 });
      if (t3s.length + t3l.length >= 10) T.push(["3rd down is the biggest tell", "3rd and 1-3 is " + P(t3s.filter(function (p) { return p.type === "Run" }).length, t3s.length) + " run (" + t3s.length + " plays). 3rd and 4+ is " + P(t3l.filter(function (p) { return p.type === "Pass" }).length, t3l.length) + " pass (" + t3l.length + " plays), and it is only " + P(t3l.filter(eff).length, t3l.length) + " effective."]);
      var t3 = A.filter(function (p) { return p.dn === 3 }), f3 = forms(t3, 5);
      if (f3.length) { var pb = f3.map(function (x) { var s = stat(x[1]); return [x[0], pct(s.pass, s.n), pct(s.run, s.n), s.n] }), tells = pb.filter(function (x) { return x[1] >= 75 }), bal = pb.filter(function (x) { return x[1] < 75 }).slice(0, 3);
        if (tells.length) T.push(["Formation gives away 3rd-down pass", tells.map(function (x) { return esc(x[0]) + " " + x[1] + "% pass (" + x[3] + ")" }).join("; ") + "." + (bal.length ? " Balanced on 3rd: " + bal.map(function (x) { return esc(x[0]) + " " + x[2] + "% run (" + x[3] + ")" }).join("; ") + "." : "")]) }
      var p10 = A.filter(function (p) { return p.dn === 0 }); if (p10.length) { var s = stat(p10), md = median(p10.filter(function (p) { return p.gain != null }).map(function (p) { return p.gain })); T.push(["P&10 (series opener)", pct(s.run, s.n) + "% run over " + s.n + " plays, " + pct(s.eff, s.n) + "% effective. Average " + f1(s.avg) + " yds" + (md != null && s.avg - md >= 3 ? " but median " + f1(md) + ", so a few big plays carry the average." : ".")]) }
      var rz = A.filter(function (p) { return p.yl != null && p.yl > 0 && p.yl <= 20 }); if (rz.length) { var r1 = rz.filter(function (p) { return p.dn <= 1 }); T.push(["Red zone", P(rz.filter(function (p) { return p.type === "Run" }).length, rz.length) + " run over " + rz.length + " plays; " + P(r1.filter(function (p) { return p.type === "Run" }).length, r1.length) + " run on 1st down (" + r1.length + " plays). " + rz.filter(function (p) { return p.td }).length + " touchdowns on " + rz.length + " plays."]) }
      var qs = [1, 2, 3, 4].map(function (q) { var B = A.filter(function (p) { return p.qtr === q }); return "Q" + q + " " + P(B.filter(function (p) { return p.type === "Run" }).length, B.length) }).join(" / ");
      var hs = HASHES.map(function (h) { var B = A.filter(function (p) { return p.hash === h[1] }); return h[0] + " " + P(B.filter(function (p) { return p.type === "Run" }).length, B.length) + " run (" + B.length + ")" }).join(", ");
      T.push(["By quarter and hash", "Run share by quarter: " + qs + ". By hash: " + hs + ". See the quarter and hash pages for the detail and the sample sizes."]);
      var rbg = groupBy(A.filter(function (p) { return rbOf(p) !== "Not tagged" }), rbOf); if (rbg.keys.length) T.push(["RB alignment", rbg.keys.sort(function (a, b) { return rbg.m[b].length - rbg.m[a].length }).slice(0, 3).map(function (k) { var B = rbg.m[k]; return k.split(" ")[0] + " is " + P(B.filter(function (p) { return p.type === "Run" }).length, B.length) + " run (" + B.length + ")" }).join(", ") + "."]);
      var sq = seqPairs(A); if (sq.length) { var ar = sq.filter(function (x) { return x[0].type === "Run" }), a10 = sq.filter(function (x) { return x[0].gain >= 10 }), al = sq.filter(function (x) { return x[0].gain < 0 }); T.push(["Sequencing", "After a run you run again " + P(ar.filter(function (x) { return x[1].type === "Run" }).length, ar.length) + " of the time (" + ar.length + " plays). After a 10+ yard gain you run " + P(a10.filter(function (x) { return x[1].type === "Run" }).length, a10.length) + " (" + a10.length + "); after a loss you pass " + P(al.filter(function (x) { return x[1].type === "Pass" }).length, al.length) + " (" + al.length + ")."]) }
      var rp = A.filter(function (p) { return p.rpo }), nr = A.filter(function (p) { return !p.rpo }); if (rp.length) { var a = stat(rp), b = stat(nr); T.push(["RPO", "RPO-tagged plays average " + f1(a.avg) + " yds and are " + pct(a.eff, a.n) + "% effective (" + a.n + " plays), vs " + f1(b.avg) + " yds and " + pct(b.eff, b.n) + "% without an RPO tag."]) }
      var fs = forms(A, 20).slice(0, 4), sw = fs.map(function (x) { var pg = games.map(function (g) { var B = x[1].filter(function (p) { return p.gid === g.id }); return B.length >= 5 ? [g.name, pct(B.filter(function (p) { return p.type === "Run" }).length, B.length)] : null }).filter(Boolean).sort(function (a, b) { return a[1] - b[1] }); return pg.length >= 2 && pg[pg.length - 1][1] - pg[0][1] >= 30 ? esc(x[0]) + " runs " + pg[0][1] + "% in the " + esc(pg[0][0]) + " game, " + pg[pg.length - 1][1] + "% in the " + esc(pg[pg.length - 1][0]) + " game" : null }).filter(Boolean);
      if (sw.length) T.push(["Formation alone is not a stable tell", sw.join("; ") + ". Down and distance predict your call better than formation."]);
      var rc = groupBy(R, function (p) { return p.runC }), top = rc.keys.sort(function (a, b) { return rc.m[b].length - rc.m[a].length }).slice(0, 4), big = rc.keys.filter(function (k) { return rc.m[k].length >= 10 }).map(function (k) { return [k, stat(rc.m[k]).avg] }).sort(function (a, b) { return b[1] - a[1] });
      if (top.length) T.push(["Run game", top.map(function (k) { return esc(k) + " " + rc.m[k].length + " plays (" + f1(stat(rc.m[k]).avg) + " yds)" }).join(", ") + "." + (big.length ? " Most productive (10+ plays): " + esc(big[0][0]) + " (" + f1(big[0][1]) + "). Least: " + esc(big[big.length - 1][0]) + " (" + f1(big[big.length - 1][1]) + ")." : "")]);
      var pc = groupBy(Pp.filter(function (p) { return p.passC }), function (p) { return p.passC }), pt = pc.keys.sort(function (a, b) { return pc.m[b].length - pc.m[a].length })[0], un = Pp.filter(function (p) { return !p.passC }).length;
      if (pt) T.push(["Pass game", esc(pt) + " is your most-called pass concept (" + pc.m[pt].length + " of " + Pp.length + " passes, " + f1(stat(pc.m[pt]).avg) + " yds)." + (un ? " " + un + " passes have no concept tag." : "") + (rp.length ? " RPO tags are on " + P(rp.length, A.length) + " of plays." : "")]);
      var sk = A.filter(function (p) { return /^SACK/.test(p.res) }).length, it = A.filter(function (p) { return /^INTERCEPTION/.test(p.res) }).length, fu = A.filter(function (p) { return /FUMBLE/.test(p.res) }).length, ex = A.filter(expl), er = ex.filter(function (p) { return p.type === "Run" }).length, ep = ex.length - er, ng = R.filter(function (p) { return p.gain < 0 }).length;
      T.push(["Ball security and big plays", sk + " sacks, " + it + " interceptions, " + fu + " fumbles. Explosive plays (runs 10+, passes 15+): " + ex.length + " (" + er + " runs, " + P(er, R.length) + " of runs; " + ep + " passes, " + P(ep, Pp.length) + " of passes). Negative runs: " + ng + " (" + P(ng, R.length) + " of runs)."]);
      var t = "<table class='skt wrap' style='font-size:11px'><thead><tr><th style='width:30px'>#</th><th style='width:170px'>TENDENCY</th><th>DETAIL</th></tr></thead><tbody>" + T.map(function (x, i) { return "<tr><td style='font-weight:700'>" + (i + 1) + "</td><td style='font-weight:700'>" + x[0] + "</td><td>" + x[1] + "</td></tr>" }).join("") + "</tbody></table>";
      sec("Key tendencies", [t, note(S0.n + " run and pass plays, " + games.length + " games. Penalty plays excluded. Down 0 = P&10. Red zone = opponent 20 to goal line. Game names come from the TEAM column. Game tables read run % / pass % (plays). Gray cells have fewer than 5 plays.")]);
    })();
    // 3 totals by game
    (function () {
      var line = function (lab, B, cls, per) { var s = stat(B), k = per || 1, cmp = B.filter(function (p) { return p.type === "Pass" && /^COMPLETE/.test(p.res) }).length; return "<tr class='" + (cls || "") + "'><td>" + lab + "</td>" + td(Math.round(s.run / k)) + td(Math.round(s.rg / k)) + td(f1(s.ravg)) + td(Math.round(s.pass / k)) + td(Math.round(cmp / k)) + td(Math.round(s.pg / k)) + td(f1(s.pavg)) + td("<b>" + Math.round(s.gain / k) + "</b>") + td(f1(s.avg)) + "</tr>" };
      var t = "<table class='skt'><thead><tr><th>GAME</th><th>RUSH</th><th>RUSH YDS</th><th>YPC</th><th>PASS</th><th>COMP</th><th>PASS YDS</th><th>YPA</th><th>TOTAL YDS</th><th>YPP</th></tr></thead><tbody>" + line("SEASON", A, "all") + line("PER GAME", A, "all", games.length) + games.map(function (g) { return line(esc(g.name), A.filter(function (p) { return p.gid === g.id })) }).join("") + "</tbody></table>";
      var rows2 = [["ALL", A]].concat(games.map(function (g) { return [esc(g.name), A.filter(function (p) { return p.gid === g.id })] }));
      sec("Total yards & R/P by game", [h2("Total yards: season and each game") + t + note("Rush = run plays; Pass = pass plays (sacks and scrambles count as pass plays, as tagged). Yards come from GN/LS; penalty plays are left out, so totals can differ a little from the official stat sheet. Plays with no gain tagged count as plays but add no yards."),
        h2("Run % / pass % by game") + rpTable("", rows2), barChart("Game - Run/Pass", games.map(function (g) { var B = A.filter(function (p) { return p.gid === g.id }); return [g.short, B.filter(function (p) { return p.type === "Pass" }).length, B.filter(function (p) { return p.type === "Run" }).length] }), ["Pass", "Run"])]);
    })();
    // 4 by formation
    (function () {
      var fl = withOther(forms(A), A, 4), rows2 = [["ALL", A]].concat(fl.map(function (x) { return [esc(x[0]), x[1]] }));
      sec("R/P totals by formation", [rpTable("", rows2), byGame("RUN % / PASS % BY GAME", rows2, games)]);
    })();
    // 5 plays within formations
    (function () {
      var fl = forms(A, 9), blocks = fl.map(function (x) {
        var B = x[1], s = stat(B), rc = groupBy(B.filter(function (p) { return p.type === "Run" }), conceptT), pc = groupBy(B.filter(function (p) { return p.type === "Pass" }), conceptT);
        var rk = rc.keys.sort(function (a, b) { return rc.m[b].length - rc.m[a].length || (a < b ? -1 : 1) }), pk = pc.keys.sort(function (a, b) { return pc.m[b].length - pc.m[a].length || (a < b ? -1 : 1) }), n = Math.max(rk.length, pk.length), base = pct(s.eff, s.n), body = "";
        var cell = function (m, k) { if (!k) return "<td></td><td></td><td></td><td></td>"; var q = stat(m[k]), e = pct(q.eff, q.n); return "<td" + (m === pc.m ? " class='sep' style='text-align:left;font-weight:400'" : " style='font-weight:400'") + ">" + esc(k) + "</td>" + td(q.n) + td(f1(q.avg)) + td(e + "%", effCls(e, q.n >= 5 ? 99 : 0, base)) };
        for (var i = 0; i < n; i++) body += "<tr>" + cell(rc.m, rk[i]) + cell(pc.m, pk[i]) + "</tr>";
        return "<table class='skt' style='margin-top:12px;width:560px'><thead><tr><th colspan='8' style='text-align:left;font-size:11px'>" + esc(x[0]) + " &nbsp;|&nbsp; " + s.n + " plays &nbsp;|&nbsp; " + pct(s.run, s.n) + "% run &nbsp;|&nbsp; Eff " + base + "%</th></tr><tr style='background:#c9c9c9'><th style='background:#c9c9c9;color:#111'>RUN CONCEPT</th><th style='background:#c9c9c9;color:#111'>#</th><th style='background:#c9c9c9;color:#111'>Avg</th><th style='background:#c9c9c9;color:#111'>Eff%</th><th class='sep' style='background:#c9c9c9;color:#111;text-align:left'>PASS CONCEPT</th><th style='background:#c9c9c9;color:#111'>#</th><th style='background:#c9c9c9;color:#111'>Avg</th><th style='background:#c9c9c9;color:#111'>Eff%</th></tr></thead><tbody>" + body + "</tbody></table>";
      });
      blocks.push(note("Formations with 9+ plays. Concepts sorted by plays called; Avg = yards per play. Untagged passes have no concept in the sheet."));
      sec("Plays within formations", blocks);
    })();
    // 6 down/distance
    (function () { var rows2 = [["ALL", A]].concat(DDB.map(function (b) { return [b[0], A.filter(b[1])] })); sec("R/P totals by down/distance", [rpTable("", rows2), byGame("RUN % / PASS % BY GAME", rows2, games)]) })();
    // 7 quarter
    (function () {
      var Q = [1, 2, 3, 4].map(function (q) { return ["Quarter " + q, A.filter(function (p) { return p.qtr === q })] }), rows2 = [["ALL", A]].concat(Q, [["1st half (Q1-Q2)", A.filter(function (p) { return p.qtr === 1 || p.qtr === 2 })], ["2nd half (Q3-Q4)", A.filter(function (p) { return p.qtr === 3 || p.qtr === 4 })]]);
      var qs = Q.filter(function (x) { return x[1].length }).map(function (x) { var s = stat(x[1]); return [x[0].replace("Quarter ", "Q"), pct(s.run, s.n), s.n, pct(s.eff, s.n)] }), lo = qs.slice().sort(function (a, b) { return a[1] - b[1] }), ef = qs.slice().sort(function (a, b) { return b[3] - a[3] });
      var h1 = stat(rows2[5][1]), h2_ = stat(rows2[6][1]);
      sec("Play calling by quarter", [rpTable("", rows2), byGame("RUN % / PASS % BY GAME", rows2, games), h2("Run % / pass % by quarter and down (plays)") + cross("QUARTER", Q, DOWNS), h2("Top concepts by quarter") + topConceptTable("QUARTER", Q),
        qs.length ? bul(["Run share is lowest in " + lo[0][0] + " (" + lo[0][1] + "%, " + lo[0][2] + " plays) and highest in " + lo[lo.length - 1][0] + " (" + lo[lo.length - 1][1] + "%, " + lo[lo.length - 1][2] + " plays).", "1st half is " + pct(h1.run, h1.n) + "% run (" + h1.n + " plays, Eff " + pct(h1.eff, h1.n) + "%); 2nd half is " + pct(h2_.run, h2_.n) + "% run (" + h2_.n + " plays, Eff " + pct(h2_.eff, h2_.n) + "%).", "Most effective quarter is " + ef[0][0] + " (" + ef[0][3] + "% Eff); least effective is " + ef[ef.length - 1][0] + " (" + ef[ef.length - 1][3] + "%)."]) : "", note("Gray cells have fewer than 5 plays. Quarter comes from the QTR column.")]);
    })();
    // 8 hash
    (function () {
      var H = HASHES.map(function (h) { return [h[0], A.filter(function (p) { return p.hash === h[1] })] }), rows2 = [["ALL", A]].concat(H), f4 = forms(A).slice(0, 4).map(function (x) { return [esc(x[0]), function (p) { return p.form === x[0] }] });
      var hs = H.filter(function (x) { return x[1].length }).map(function (x) { var s = stat(x[1]); return [x[0].toLowerCase(), pct(s.run, s.n), s.n, pct(s.eff, s.n)] }), lo = hs.slice().sort(function (a, b) { return a[1] - b[1] }), ef = hs.slice().sort(function (a, b) { return b[3] - a[3] });
      var t3 = H.map(function (x) { var B = x[1].filter(function (p) { return p.dn === 3 }); return P(B.filter(function (p) { return p.type === "Run" }).length, B.length) + " from the " + x[0].toLowerCase() + " (" + B.length + ")" });
      sec("Play calling by hash", [rpTable("", rows2), byGame("RUN % / PASS % BY GAME", rows2, games), h2("Run % / pass % by hash and down (plays)") + cross("HASH", H, DOWNS), h2("Run % / pass % by hash and formation (plays)") + cross("HASH", H, f4), h2("Top concepts by hash") + topConceptTable("HASH", H),
        hs.length ? bul(["Run share is lowest from the " + lo[0][0] + " (" + lo[0][1] + "%, " + lo[0][2] + " plays) and highest from the " + lo[lo.length - 1][0] + " (" + lo[lo.length - 1][1] + "%, " + lo[lo.length - 1][2] + " plays).", "Most effective from the " + ef[0][0] + " (" + ef[0][3] + "% Eff); least effective from the " + ef[ef.length - 1][0] + " (" + ef[ef.length - 1][3] + "%).", "On 3rd down you run " + joinAnd(t3) + "."]) : "", note("Hash is the HASH column as recorded in your sheet (L, M, R). Gray cells have fewer than 5 plays.")]);
    })();
    // 9 RB alignment
    (function () {
      var g = groupBy(A, rbOf), order = ["STACK", "SLANT", "FLD (field)", "BND (boundary)", "EMPTY"].filter(function (k) { return g.m[k] }).concat(g.keys.filter(function (k) { return ["STACK", "SLANT", "FLD (field)", "BND (boundary)", "EMPTY", "Not tagged"].indexOf(k) < 0 }));
      if (!order.length) return;
      var RB = order.map(function (k) { return [k, g.m[k]] }), rows2 = [["ALL", A]].concat(RB, g.m["Not tagged"] ? [["Not tagged", g.m["Not tagged"]]] : []);
      var f4 = forms(A).slice(0, 4).map(function (x) { return [esc(x[0]), function (p) { return p.form === x[0] }] }), tagged = games.filter(function (gm) { return A.some(function (p) { return p.gid === gm.id && rbOf(p) !== "Not tagged" }) });
      var lean2 = RB.filter(function (x) { return x[1].length >= 20 }).map(function (x) { var s = stat(x[1]); return [x[0], pct(s.run, s.n), s.n] }).sort(function (a, b) { return b[1] - a[1] });
      sec("RB alignment", [rpTable("", rows2), byGame("RUN % / PASS % BY GAME", RB, games), h2("Run % / pass % by RB alignment and down (plays)") + cross("RB ALIGNMENT", RB, DOWNS), h2("Run % / pass % by RB alignment and formation (plays)") + cross("RB ALIGNMENT", RB, f4), h2("Top concepts by RB alignment") + topConceptTable("RB ALIGNMENT", RB),
        lean2.length >= 2 ? bul([lean2.slice(0, 2).map(function (x) { return x[0] + " (" + x[1] + "% run, " + x[2] + " plays)" }).join(" and ") + " lean run, so a defense that charts the back can load the box on those looks. " + lean2[lean2.length - 1][0] + " is your most balanced (" + lean2[lean2.length - 1][1] + "% run, " + lean2[lean2.length - 1][2] + " plays)."]) : "",
        note("RB alignment is tagged in " + tagged.length + " of " + games.length + " games (" + A.filter(function (p) { return rbOf(p) !== "Not tagged" }).length + " of " + A.length + " plays). Numbers like \"2\" in the column count as not tagged.")]);
    })();
    // 10 sequencing
    (function () {
      var sq = seqPairs(A), nx = sq.map(function (x) { return x[1] }), f = function (cond) { return sq.filter(function (x) { return cond(x[0]) }).map(function (x) { return x[1] }) };
      var rows2 = [["ALL (2nd+ play of series)", nx], ["After a run", f(function (p) { return p.type === "Run" })], ["After a pass", f(function (p) { return p.type === "Pass" })], ["After a gain of 10+", f(function (p) { return p.gain >= 10 })], ["After a gain of 4-9", f(function (p) { return p.gain >= 4 && p.gain <= 9 })], ["After a gain of 0-3", f(function (p) { return p.gain >= 0 && p.gain <= 3 })], ["After a loss", f(function (p) { return p.gain < 0 })], ["After an incompletion", f(function (p) { return /^INCOMPLETE/.test(p.res) })], ["After a sack", f(function (p) { return /^SACK/.test(p.res) })]];
      var two = sq.filter(function (x) { return x[0].dn <= 1 && x[1].dn === 2 }), g2 = function (cond) { return two.filter(function (x) { return cond(x[0]) }).map(function (x) { return x[1] }) };
      var rows3 = [["1st-down run, 4+ yds", g2(function (p) { return p.type === "Run" && p.gain >= 4 })], ["1st-down run, 0-3 yds", g2(function (p) { return p.type === "Run" && p.gain >= 0 && p.gain <= 3 })], ["1st-down run, loss", g2(function (p) { return p.type === "Run" && p.gain < 0 })], ["1st-down pass, complete", g2(function (p) { return p.type === "Pass" && /^COMPLETE/.test(p.res) })], ["1st-down pass, incomplete", g2(function (p) { return p.type === "Pass" && /^INCOMPLETE/.test(p.res) })]];
      var ar = rows2[1][1], ap = rows2[2][1], a10 = rows2[3][1], al = rows2[6][1], both = sq.filter(function (x) { return concept(x[0]) && concept(x[1]) }), same = both.filter(function (x) { return concept(x[0]) === concept(x[1]) }).length;
      sec("Play sequencing", ["<p class='skp' style='color:#555'>Each row shows what you called on the next play in the same series, based on the play before it.</p>", rpTable("", rows2), byGame("RUN % / PASS % BY GAME", rows2, games), h2("2nd down call after the 1st-down result") + rpTable("", [["1st-down run, 4+ yds", rows3[0][1]]].concat(rows3.slice(1))),
        bul(["After a run you call a run again " + P(ar.filter(function (p) { return p.type === "Run" }).length, ar.length) + " of the time; after a pass you throw again " + P(ap.filter(function (p) { return p.type === "Pass" }).length, ap.length) + " of the time.", "After a 10+ yard gain you run " + P(a10.filter(function (p) { return p.type === "Run" }).length, a10.length) + " (" + a10.length + " plays). After a loss you pass " + P(al.filter(function (p) { return p.type === "Pass" }).length, al.length) + " (" + al.length + " plays).", "You call the exact same concept twice in a row on " + P(same, both.length) + " of plays (" + same + " of " + both.length + " with both plays tagged)."]),
        note("Previous play = the previous run or pass in the same series (penalty plays skipped). The first play of each series has no previous play and is left out.")]);
    })();
    // 11 RPO
    (function () {
      var rp = A.filter(function (p) { return p.rpo }); if (!rp.length) return;
      var g = groupBy(rp, function (p) { return p.rpo }), ks = g.keys.sort(function (a, b) { return g.m[b].length - g.m[a].length }), big = ks.filter(function (k) { return g.m[k].length >= 4 }), small = []; ks.forEach(function (k) { if (g.m[k].length < 4) small = small.concat(g.m[k]) });
      var rows2 = [["ALL RPO", rp], ["No RPO tag", A.filter(function (p) { return !p.rpo })]].concat(big.map(function (k) { return [esc(k), g.m[k]] }), small.length ? [["Other RPO (<4 plays)", small]] : []);
      var fl = withOther(forms(rp), rp, 5), rows3 = [["ALL RPO", rp]].concat(fl.map(function (x) { return [esc(x[0]), x[1]] })), a = stat(rp), b = stat(A.filter(function (p) { return !p.rpo }));
      var t = rpTable("", rows2).replace(/<th><\/th><th colspan='5' style='text-align:center'>TOTAL/, "<th></th><th colspan='5' style='text-align:center'>TOTAL"), md = median(rp.filter(function (p) { return p.gain != null }).map(function (p) { return p.gain }));
      sec("RPO report", ["<p class='skp' style='color:#555'>On RPO plays, RUN = ball handed off or kept, PASS = ball thrown.</p>", t, byGame("HANDOFF % / THROW % BY GAME", rows2, games), h2("RPO by formation") + rpTable("", rows3), h2("Handoff % / throw % by down (plays)") + cross("RPO", [["RPO", rp], ["No RPO tag", A.filter(function (p) { return !p.rpo })]], DOWNS),
        bul(["RPO plays average " + f1(a.avg) + " yds (" + pct(a.eff, a.n) + "% Eff) on " + a.n + " plays, vs " + f1(b.avg) + " yds (" + pct(b.eff, b.n) + "% Eff) without.", "The ball is thrown on " + pct(a.pass, a.n) + "% of RPO plays (" + a.pass + " of " + a.n + ").", md != null ? "Median gain on RPO plays is " + f1(md) + " yds, so check the average against the median before reading too much into it." : ""]), note("RPO tag comes from the RPO column.")]);
    })();
    // 12 P&10
    (function () {
      var B = A.filter(function (p) { return p.dn === 0 }); if (!B.length) return;
      var z = [["Own territory", function (p) { return p.yl < 0 }], ["Opp. 50 to 21", function (p) { return p.yl === 50 || (p.yl > 20) }], ["Red zone (1-20)", function (p) { return p.yl > 0 && p.yl <= 20 }]];
      var rows2 = [["ALL P/10", B]].concat(z.map(function (x) { return [x[0], B.filter(x[1])] }), withOther(forms(B), B, 3).map(function (x) { return [esc(x[0]), x[1]] }));
      sec("P&10: first play of the series", [rpTable("", rows2), byGame("RUN % / PASS % BY GAME", rows2, games), h2("Concepts called on P&10") + "<div class='sk2'><div>" + conceptTable("RUN CONCEPTS", B.filter(function (p) { return p.type === "Run" })) + "</div><div>" + conceptTable("PASS CONCEPTS", B.filter(function (p) { return p.type === "Pass" })) + "</div></div>" + note("Gray rows have fewer than 5 plays.")]);
    })();
    // 13 3rd down
    (function () {
      var B = A.filter(function (p) { return p.dn === 3 }); if (!B.length) return;
      var rows2 = [["ALL 3RD DOWN", B], ["3rd 1-2", B.filter(function (p) { return p.dist <= 2 })], ["3rd 3-6", B.filter(function (p) { return p.dist >= 3 && p.dist <= 6 })], ["3rd 7-9", B.filter(function (p) { return p.dist >= 7 && p.dist <= 9 })], ["3rd 10+", B.filter(function (p) { return p.dist >= 10 })], ["3rd 4+ (all)", B.filter(function (p) { return p.dist >= 4 })]].concat(withOther(forms(B), B, 4).map(function (x) { return [esc(x[0]), x[1]] }));
      sec("3rd down calls", [rpTable("", rows2), byGame("RUN % / PASS % BY GAME", rows2, games), h2("Concepts called on 3rd down") + "<div class='sk2'><div>" + conceptTable("RUN CONCEPTS", B.filter(function (p) { return p.type === "Run" })) + "</div><div>" + conceptTable("PASS CONCEPTS", B.filter(function (p) { return p.type === "Pass" })) + "</div></div>" + note("Gray rows have fewer than 5 plays.")]);
    })();
    // 14 red zone
    (function () {
      var B = A.filter(function (p) { return p.yl != null && p.yl > 0 && p.yl <= 20 }); if (!B.length) return;
      var rows2 = [["RED ZONE (1-20)", B], ["Yard line 11-20", B.filter(function (p) { return p.yl >= 11 })], ["Yard line 6-10", B.filter(function (p) { return p.yl >= 6 && p.yl <= 10 })], ["Yard line 1-5", B.filter(function (p) { return p.yl <= 5 })], ["1st down (incl. P/10)", B.filter(function (p) { return p.dn <= 1 })], ["2nd down", B.filter(function (p) { return p.dn === 2 })], ["3rd down", B.filter(function (p) { return p.dn === 3 })], ["4th down", B.filter(function (p) { return p.dn === 4 })]].concat(withOther(forms(B), B, 3).map(function (x) { return [esc(x[0]), x[1]] }));
      var tds = B.filter(function (p) { return p.td }).length;
      sec("Red zone", [rpTable("", rows2), byGame("RUN % / PASS % BY GAME", rows2, games), note(tds + " touchdowns on " + B.length + " red-zone plays (" + P(tds, B.length) + ")."), h2("Concepts called in the red zone") + "<div class='sk2'><div>" + conceptTable("RUN CONCEPTS", B.filter(function (p) { return p.type === "Run" })) + "</div><div>" + conceptTable("PASS CONCEPTS", B.filter(function (p) { return p.type === "Pass" })) + "</div></div>" + note("Gray rows have fewer than 5 plays.")]);
    })();
    // 15 drives
    (function () {
      var Dv = drives(d, gids); if (!Dv.length) return;
      var hd = "<thead><tr><th>__</th><th>Drives</th><th>TD</th><th>TD%</th><th>TO</th><th>Downs</th><th>No 1st dn</th><th>Plays/dr</th><th>Yds/dr</th></tr></thead>";
      var base = pct(Dv.filter(function (x) { return x.res === "TD" }).length, Dv.length);
      var line = function (lab, X, cls) { var n = X.length, t = X.filter(function (x) { return x.res === "TD" }).length, tp = pct(t, n); return "<tr class='" + (cls || "") + "'><td>" + lab + "</td>" + td(n) + td(t) + td(tp == null ? "-" : tp + "%", cls ? "" : effCls(tp, n >= 8 ? 99 : 0, base)) + td(X.filter(function (x) { return x.res === "Turnover" }).length) + td(X.filter(function (x) { return x.res === "Downs" }).length) + td(X.filter(function (x) { return !x.fd }).length) + td(f1(n ? X.reduce(function (a, x) { return a + x.plays }, 0) / n : null)) + td(f1(n ? X.reduce(function (a, x) { return a + x.yds }, 0) / n : null)) + "</tr>" };
      var tab = function (head, rows) { return "<table class='skt'>" + hd.replace("__", head) + "<tbody>" + line("ALL DRIVES", Dv, "all") + rows.map(function (r) { return line(r[0], r[1]) }).join("") + "</tbody></table>" };
      var st = function (x) { return toY(x.start) }, p10 = function (c) { return Dv.filter(function (x) { var f = x.rows.filter(function (r) { return r.dn === 0 && !r.pen && (r.type === "Run" || r.type === "Pass") })[0]; return f && f.gain != null && c(f.gain) }) };
      var tdN = Dv.filter(function (x) { return x.res === "TD" }).length, g4 = p10(function (g) { return g >= 4 }), g03 = p10(function (g) { return g >= 0 && g <= 3 });
      sec("Drive results", [tab("GAME", games.map(function (g) { return [esc(g.name), Dv.filter(function (x) { return x.gid === g.id })] })),
        h2("By starting field position") + tab("START", [["Own 1-20", Dv.filter(function (x) { return st(x) <= 20 })], ["Own 21-49", Dv.filter(function (x) { return st(x) > 20 && st(x) < 50 })], ["Midfield to opp. 21", Dv.filter(function (x) { return st(x) >= 50 && st(x) < 80 })], ["Opp. 1-20 (short field)", Dv.filter(function (x) { return st(x) >= 80 })]]),
        h2("By result of the P&10 play") + tab("FIRST PLAY", [["P&10 gained 4+ yds", g4], ["P&10 gained 0-3 yds", g03], ["P&10 lost yards", p10(function (g) { return g < 0 })]]),
        h2("By quarter the drive started") + tab("QUARTER", [1, 2, 3, 4].map(function (q) { return ["Started in Q" + q, Dv.filter(function (x) { return x.qtr === q })] })),
        bul([tdN + " touchdowns on " + Dv.length + " drives (" + P(tdN, Dv.length) + "). " + Dv.filter(function (x) { return x.res === "Turnover" }).length + " drives ended in a turnover and " + Dv.filter(function (x) { return x.res === "Downs" }).length + " on downs.", "When the P&10 play gains 4+ yds, " + P(g4.filter(function (x) { return x.res === "TD" }).length, g4.length) + " of drives end in a TD (" + g4.length + " drives); when it gains 0-3 yds, " + P(g03.filter(function (x) { return x.res === "TD" }).length, g03.length) + " do (" + g03.length + " drives).", Dv.filter(function (x) { return !x.fd }).length + " drives ended without a first down."]),
        note("A drive = one SERIES in your sheet. Result: TD, Turnover (interception or fumble as recorded; a fumble the offense recovered cannot be separated), Downs (failed on 4th down), or No score. Your sheet has offensive plays only, so No score covers punts, field goals and the end of a half, which it cannot separate. No 1st dn = no first down earned on the drive. Yds/dr counts run and pass plays only."),
        titled(h2("Drive log"), driveLog(Dv))]);
    })();
    // 16 explosive
    (function () {
      var hd = "<thead><tr><th>__</th><th>Plays</th><th>Runs</th><th>Exp runs</th><th>Exp run %</th><th>Passes</th><th>Exp passes</th><th>Exp pass %</th><th>Total exp</th><th>Exp %</th></tr></thead>";
      var s0 = stat(A), b = { r: pct(A.filter(function (p) { return p.type === "Run" && expl(p) }).length, R.length), p: pct(A.filter(function (p) { return p.type === "Pass" && expl(p) }).length, Pp.length), t: pct(A.filter(expl).length, A.length) };
      var c = function (v, n, base) { return v == null ? "" : n >= 8 && v - base >= 15 ? "gr" : n >= 8 && base - v >= 7 && v <= base * 0.6 ? "rd" : "" };
      var line = function (lab, X, cls) { var r = X.filter(function (p) { return p.type === "Run" }), pp = X.filter(function (p) { return p.type === "Pass" }), er = r.filter(expl).length, ep = pp.filter(expl).length, rp = pct(er, r.length), ppc = pct(ep, pp.length), tp = pct(er + ep, X.length); return "<tr class='" + (cls || "") + "'><td>" + lab + "</td>" + td(X.length) + td(r.length) + td(er) + td(rp == null ? "-" : rp + "%", cls ? "" : c(rp, r.length, b.r)) + td(pp.length) + td(ep) + td(ppc == null ? "-" : ppc + "%", cls ? "" : c(ppc, pp.length, b.p)) + td(er + ep) + td(tp == null ? "-" : tp + "%", cls ? "" : c(tp, X.length, b.t)) + "</tr>" };
      var tab = function (head, rows) { return "<table class='skt'>" + hd.replace("__", head) + "<tbody>" + line("ALL", A, "all") + rows.map(function (r) { return line(r[0], r[1]) }).join("") + "</tbody></table>" };
      var EX = A.filter(expl).sort(function (a, b) { return b.gain - a.gain }), cr = groupBy(R.filter(function (p) { return p.runC }), function (p) { return p.runC }), cp = groupBy(Pp.filter(function (p) { return p.passC }), function (p) { return p.passC });
      var ct = function (head, g, min, lab) { var ks = g.keys.filter(function (k) { return g.m[k].length >= min }).map(function (k) { var X = g.m[k]; return [k, X.length, X.filter(expl).length, stat(X).avg] }).sort(function (a, b) { return b[2] / b[1] - a[2] / a[1] }), base = lab === "Runs" ? b.r : b.p; return "<table class='skt plain'><thead><tr><th>" + head + "</th><th>" + lab + "</th><th>#</th><th>%</th><th>Avg</th></tr></thead><tbody>" + ks.map(function (x) { var v = pct(x[2], x[1]); return "<tr><td>" + esc(x[0]) + "</td>" + td(x[1]) + td(x[2]) + td(v + "%", c(v, x[1] >= 8 ? x[1] : 0, base)) + td(f1(x[3])) + "</tr>" }).join("") + "</tbody></table>" };
      var rpoA = A.filter(function (p) { return p.rpo }), noR = A.filter(function (p) { return !p.rpo });
      sec("Explosive plays", ["<p class='skp' style='color:#555'>Explosive = run of 10+ yards or pass of 15+ yards.</p>", tab("GAME", games.map(function (g) { return [esc(g.name), A.filter(function (p) { return p.gid === g.id })] })), h2("By formation") + tab("FORMATION", withOther(forms(A), A, 4).map(function (x) { return [esc(x[0]), x[1]] })),
        h2("By down") + tab("DOWN", [["P&10", A.filter(function (p) { return p.dn === 0 })], ["1st down", A.filter(function (p) { return p.dn === 1 })], ["2nd down", A.filter(function (p) { return p.dn === 2 })], ["3rd down", A.filter(function (p) { return p.dn === 3 })], ["4th down", A.filter(function (p) { return p.dn === 4 })]]),
        h2("By quarter and hash") + tab("QTR / HASH", [1, 2, 3, 4].map(function (q) { return ["Quarter " + q, A.filter(function (p) { return p.qtr === q })] }).concat(HASHES.map(function (h) { return [h[0], A.filter(function (p) { return p.hash === h[1] })] }))),
        h2("Explosive rate by concept") + "<div class='sk2'><div>" + ct("RUN CONCEPT (5+)", cr, 5, "Runs") + "</div><div>" + ct("PASS CONCEPT (4+)", cp, 4, "Passes") + "</div></div>",
        bul([EX.length + " explosive plays on " + A.length + " snaps (" + P(EX.length, A.length) + "): " + EX.filter(function (p) { return p.type === "Run" }).length + " runs (" + P(EX.filter(function (p) { return p.type === "Run" }).length, R.length) + " of runs) and " + EX.filter(function (p) { return p.type === "Pass" }).length + " passes (" + P(EX.filter(function (p) { return p.type === "Pass" }).length, Pp.length) + " of passes).", EX.filter(function (p) { return p.td }).length + " of the " + EX.length + " explosive plays went for a touchdown.", rpoA.length ? "RPO-tagged plays produced " + rpoA.filter(expl).length + " explosives on " + rpoA.length + " snaps (" + P(rpoA.filter(expl).length, rpoA.length) + "), vs " + P(noR.filter(expl).length, noR.length) + " without an RPO tag." : ""]),
        titled(h2("Every explosive play (" + EX.length + ")"), playList(EX)), note("Sorted by gain. Play = run or pass concept from your sheet.")]);
    })();
    // 17 negative runs
    (function () {
      var hd = "<thead><tr><th>__</th><th>Runs</th><th>Neg runs</th><th>Neg %</th><th>Yds lost</th><th>Avg loss</th><th>No gain (0)</th><th>Run avg</th></tr></thead>", base = pct(R.filter(function (p) { return p.gain < 0 }).length, R.length);
      var line = function (lab, X, cls) { var ng = X.filter(function (p) { return p.gain < 0 }), lost = ng.reduce(function (a, p) { return a + p.gain }, 0), v = pct(ng.length, X.length); return "<tr class='" + (cls || "") + "'><td>" + lab + "</td>" + td(X.length) + td(ng.length) + td(v == null ? "-" : v + "%", cls ? "" : X.length >= 8 && v - base >= 8 ? "rd" : "") + td(lost) + td(ng.length ? f1(lost / ng.length) : "-") + td(X.filter(function (p) { return p.gain === 0 }).length) + td(f1(stat(X).avg)) + "</tr>" };
      var tab = function (head, rows) { return "<table class='skt'>" + hd.replace("__", head) + "<tbody>" + line("ALL RUNS", R, "all") + rows.map(function (r) { return line(r[0], r[1]) }).join("") + "</tbody></table>" };
      var NG = R.filter(function (p) { return p.gain < 0 }).sort(function (a, b) { return a.gain - b.gain }), cr = groupBy(R.filter(function (p) { return p.runC }), function (p) { return p.runC });
      var ks = cr.keys.filter(function (k) { return cr.m[k].length >= 5 }).map(function (k) { var X = cr.m[k]; return [k, X.length, X.filter(function (p) { return p.gain < 0 }).length, stat(X).avg] }).sort(function (a, b) { return b[2] / b[1] - a[2] / a[1] });
      var rbs = groupBy(R, rbOf), dn = [["P&10", 0], ["1st down", 1], ["2nd down", 2], ["3rd down", 3], ["4th down", 4]];
      sec("Negative runs", ["<p class='skp' style='color:#555'>Negative run = a play tagged Run in your sheet that lost yards (a few RPO and scramble plays are tagged Run). Run avg includes every run in the group.</p>",
        tab("GAME", games.map(function (g) { return [esc(g.name), R.filter(function (p) { return p.gid === g.id })] })), h2("By formation") + tab("FORMATION", withOther(forms(R), R, 4).map(function (x) { return [esc(x[0]), x[1]] })),
        h2("By down, quarter and hash") + tab("SITUATION", dn.map(function (x) { return [x[0], R.filter(function (p) { return p.dn === x[1] })] }).concat([1, 2, 3, 4].map(function (q) { return ["Quarter " + q, R.filter(function (p) { return p.qtr === q })] }), HASHES.map(function (h) { return [h[0], R.filter(function (p) { return p.hash === h[1] })] }))),
        rbs.keys.length > 1 ? h2("By RB alignment") + tab("RB ALIGNMENT", ["STACK", "SLANT", "FLD (field)", "BND (boundary)", "EMPTY", "Not tagged"].filter(function (k) { return rbs.m[k] }).map(function (k) { return [k, rbs.m[k]] })) : "",
        h2("Negative-run rate by concept") + "<div class='sk2'><div><table class='skt plain'><thead><tr><th>RUN CONCEPT (5+)</th><th>Runs</th><th>#</th><th>%</th><th>Avg</th></tr></thead><tbody>" + ks.map(function (x) { var v = pct(x[2], x[1]); return "<tr><td>" + esc(x[0]) + "</td>" + td(x[1]) + td(x[2]) + td(v + "%", x[1] >= 8 && v - base >= 15 ? "rd" : "") + td(f1(x[3])) + "</tr>" }).join("") + "</tbody></table></div><div></div></div>",
        bul([NG.length + " of " + R.length + " runs lost yards (" + P(NG.length, R.length) + "), for " + NG.reduce(function (a, p) { return a + p.gain }, 0) + " yards total. Another " + R.filter(function (p) { return p.gain === 0 }).length + " runs gained nothing.", "Negative runs by down: " + dn.map(function (x) { var X = R.filter(function (p) { return p.dn === x[1] }); return x[0] + " " + X.filter(function (p) { return p.gain < 0 }).length + " of " + X.length }).join(", ") + "."]),
        titled(h2("Every negative run (" + NG.length + ")"), playList(NG)), note("Sorted by yards lost. Gray rows in the tables above have fewer than 5 runs.")]);
    })();
    // 18 efficiency
    (function () {
      var cr = groupBy(R, conceptT), cp = groupBy(Pp, conceptT), base = pct(S0.eff, S0.n);
      var ct = function (head, g, min, typeBase) { var ks = g.keys.filter(function (k) { return g.m[k].length >= min }).sort(function (a, b) { return g.m[b].length - g.m[a].length }); return "<table class='skt plain'><thead><tr><th>" + head + "</th><th>#</th><th>Avg</th><th>Eff%</th></tr></thead><tbody>" + ks.map(function (k) { var s = stat(g.m[k]), e = pct(s.eff, s.n), sm = s.n < 5; return "<tr class='" + (sm ? "gy" : "") + "'><td>" + esc(k) + "</td>" + td(s.n) + td(f1(s.avg)) + td(e + "%", sm ? "" : (typeBase - e >= 15 ? "rd" : e - typeBase >= 20 ? "gr" : "")) + "</tr>" }).join("") + "</tbody></table>" };
      var combo = function (head, type, min) { var g = groupBy(A.filter(function (p) { return p.type === type && p.form && concept(p) }), function (p) { return p.form + " | " + concept(p) }); var ks = g.keys.filter(function (k) { return g.m[k].length >= min }).map(function (k) { var s = stat(g.m[k]); return [k, s.n, s.avg, pct(s.eff, s.n)] }).sort(function (a, b) { return b[3] - a[3] || b[1] - a[1] }).slice(0, 8), tb = pct(type === "Run" ? S0.reff : S0.peff, type === "Run" ? S0.run : S0.pass); return "<table class='skt plain'><thead><tr><th>" + head + "</th><th>#</th><th>Avg</th><th>Eff%</th></tr></thead><tbody>" + ks.map(function (x) { return "<tr><td>" + esc(x[0]) + "</td>" + td(x[1]) + td(f1(x[2])) + td(x[3] + "%", x[3] - tb >= 20 ? "gr" : tb - x[3] >= 15 ? "rd" : "") + "</tr>" }).join("") + "</tbody></table>" };
      var box = "<div style='display:flex;gap:30px;align-items:center;margin-top:10px'><div class='skbox'><div class='a'><b>EFFICIENCY REPORT</b><span>SELF SCOUT | " + games.length + " GAMES</span></div><div class='b'><b>Plays: " + S0.n + "</b> &nbsp; Effective <b>" + S0.eff + "</b> " + pct(S0.eff, S0.n) + "%<br><b>Runs: " + S0.run + "</b> (" + pct(S0.run, S0.n) + "%) &nbsp; Effective <b>" + S0.reff + "</b> " + pct(S0.reff, S0.run) + "%<br><b>Passes: " + S0.pass + "</b> (" + pct(S0.pass, S0.n) + "%) &nbsp; Effective <b>" + S0.peff + "</b> " + pct(S0.peff, S0.pass) + "%</div></div>" +
        barChart("Black is effective / Red is not effective", [["Pass", S0.peff, S0.pass - S0.peff], ["Run", S0.reff, S0.run - S0.reff]], null, 360, 220) + "</div>";
      sec("Efficiency report", [box, "<div class='sk2' style='margin-top:14px'><div>" + ct("RUN CONCEPTS (5+ plays)", cr, 5, pct(S0.reff, S0.run)) + "</div><div>" + ct("PASS CONCEPTS (4+ plays)", cp, 4, pct(S0.peff, S0.pass)) + "</div></div>",
        h2("Best formation + play combinations (Eff%, 5+ plays)") + "<div class='sk2'><div>" + combo("RUN: FORMATION | PLAY", "Run", 5) + "</div><div>" + combo("PASS: FORMATION | PLAY", "Pass", 4) + "</div></div>",
        note("Concept lists are sorted by plays called; the combination lists are sorted by Eff%." + (Pp.filter(function (p) { return !p.passC }).length ? " The " + Pp.filter(function (p) { return !p.passC }).length + " pass plays with no concept tag in your sheet show as (untagged)." : ""))]);
    })();
    // 19 tendencies to break
    (function () {
      var T = [], rr = function (B) { return pct(B.filter(function (p) { return p.type === "Run" }).length, B.length) };
      var t3l = A.filter(function (p) { return p.dn === 3 && p.dist >= 4 }), t3s = A.filter(function (p) { return p.dn === 3 && p.dist <= 3 });
      if (t3l.length >= 10 && 100 - rr(t3l) >= 70) { var rn = t3l.filter(function (p) { return p.type === "Run" }), bal = forms(A.filter(function (p) { return p.dn === 3 }), 5).filter(function (x) { var r = rr(x[1]); return r >= 35 && r <= 65 }).slice(0, 2).map(function (x) { return esc(x[0]) }); T.push(["3RD & 4+", "<b>" + (100 - rr(t3l)) + "%</b> pass", t3l.length, "Runs here are rare (" + rn.length + " plays, " + f1(stat(rn).avg) + " yds). Test a draw or screen look" + (bal.length ? " out of " + bal.join(" / ") + ", which already show balance on 3rd." : ".")]) }
      if (t3s.length >= 10 && rr(t3s) >= 75) T.push(["3RD & 1-3", "<b>" + rr(t3s) + "%</b> run", t3s.length, "Passes on 3rd & short: only " + t3s.filter(function (p) { return p.type === "Pass" }).length + " play(s). Add a play-action or RPO shot to punish a stacked box."]);
      var p10 = A.filter(function (p) { return p.dn === 0 }); if (p10.length >= 10 && Math.max(rr(p10), 100 - rr(p10)) >= 70) { var pp = p10.filter(function (p) { return p.type === "Pass" }), rn2 = p10.filter(function (p) { return p.type === "Run" }); T.push(["P&10 (SERIES OPENER)", "<b>" + rr(p10) + "%</b> run", p10.length, "P&10 passes: " + pp.length + " plays, " + f1(stat(pp).avg) + " yds/play vs " + f1(stat(rn2).avg) + " on runs. Take a planned first-play shot when the box is loaded."]) }
      var rz1 = A.filter(function (p) { return p.yl > 0 && p.yl <= 20 && p.dn <= 1 }); if (rz1.length >= 10 && rr(rz1) >= 70) { var pp2 = rz1.filter(function (p) { return p.type === "Pass" }); T.push(["RED ZONE 1ST DOWN", "<b>" + rr(rz1) + "%</b> run", rz1.length, "Red-zone 1st down passes: " + pp2.length + " plays, " + f1(stat(pp2).avg) + " yds/play. Set up a play-action call off your best run here."]) }
      var rbg = groupBy(A, rbOf); Object.keys(rbg.m).forEach(function (k) { if (k === "Not tagged") return; var B = rbg.m[k]; if (B.length >= 40 && rr(B) >= 65) { var pp3 = B.filter(function (p) { return p.type === "Pass" }); T.push(["RB IN " + k.split(" ")[0], "<b>" + rr(B) + "%</b> run", B.length, "Passes from " + k.split(" ")[0] + ": " + pp3.length + " plays, " + f1(stat(pp3).avg) + " yds/play. Build play-action and RPO throws off the " + k.split(" ")[0] + " run look so the alignment stops tipping the run."]) } });
      var sq = seqPairs(A), al = sq.filter(function (x) { return x[0].gain < 0 }).map(function (x) { return x[1] }); if (al.length >= 10 && 100 - rr(al) >= 65) { var rn3 = al.filter(function (p) { return p.type === "Run" }); T.push(["AFTER A LOSS", "<b>" + (100 - rr(al)) + "%</b> pass", al.length, "Runs called right after a loss: " + rn3.length + " plays, " + f1(stat(rn3).avg) + " yds/play. Have a go-to run (or draw) ready for the down after a negative play."]) }
      var cr = groupBy(R.filter(function (p) { return p.runC }), function (p) { return p.runC }), worst = cr.keys.filter(function (k) { return cr.m[k].length >= 8 }).map(function (k) { return [k, cr.m[k].filter(function (p) { return p.gain < 0 }).length, cr.m[k].length] }).sort(function (a, b) { return b[1] / b[2] - a[1] / a[2] })[0];
      if (worst && worst[1] / worst[2] >= 0.2) T.push(["NEGATIVE RUNS", "<b>" + pct(worst[1], worst[2]) + "%</b> neg", worst[2] + " runs", esc(worst[0]) + " loses yards on " + worst[1] + " of " + worst[2] + " runs, the highest rate of any run with 8+ calls (team: " + P(R.filter(function (p) { return p.gain < 0 }).length, R.length) + "). Check the film for the cause (scheme, alignment or front) before calling it again in a long-yardage spot."]);
      var t = "<table class='skt wrap' style='font-size:11px'><thead><tr><th style='width:140px'>SITUATION</th><th style='width:110px'>THE TELL</th><th style='width:60px'>PLAYS</th><th>BREAK IT</th></tr></thead><tbody>" + (T.length ? T.map(function (x) { return "<tr><td style='font-weight:700'>" + x[0] + "</td><td>" + x[1] + "</td><td>" + x[2] + "</td><td>" + x[3] + "</td></tr>" }).join("") : "<tr><td colspan='4'>No strong tells on 10+ plays. Nice job staying balanced.</td></tr>") + "</tbody></table>";
      sec("Tendencies to break", [t, note("Each tell is a strong run/pass lean on 10+ plays, or a high negative-run rate. The break-it ideas are starting points built from your own data. Some rest on small samples, so test them before relying on them.")]);
    })();
    return S;
  }
  function titled(t, b) { b.title = t; return b }
  function seqPairs(A) { var out = [], last = {}; A.forEach(function (p) { if (p.ser == null) return; var k = p.gid + "|" + p.ser; if (last[k]) out.push([last[k], p]); last[k] = p }); return out }
  function drives(d, gids) {
    var out = [], cur = null, seen = {};
    d.rows.forEach(function (r) {
      if (gids && !gids[r.gid]) return; if (r.ser == null) return;
      var key = r.gid + "|" + r.ser; cur = seen[key];
      if (!cur) { cur = seen[key] = { gid: r.gid, game: r.game, ser: r.ser, qtr: r.qtr, start: null, plays: 0, yds: 0, res: "No score", fd: false, first: null, rows: [] }; out.push(cur) }
      cur.rows.push(r);
      if (r.pen) return; if (r.type !== "Run" && r.type !== "Pass") return;
      if (cur.start == null) { cur.start = r.yl; cur.first = r; if (cur.qtr == null) cur.qtr = r.qtr }
      cur.plays++; cur.yds += r.gain || 0;
      if (r.td) cur.res = "TD"; else if (/INTERCEPTION|FUMBLE/.test(r.res) && cur.res !== "TD") cur.res = "Turnover";
      if (cur.plays > 1 && r.dn === 1) cur.fd = true; if (r.dn >= 1 && r.dist != null && r.gain != null && r.gain >= r.dist && !r.td) cur.fd = true;
    });
    out.forEach(function (x) { if (x.res === "No score") { var L = x.rows.filter(function (r) { return !r.pen && (r.type === "Run" || r.type === "Pass") }), l = L[L.length - 1]; if (l && l.dn === 4 && l.gain != null && l.dist != null && l.gain < l.dist && !l.td) x.res = "Downs" } });
    return out.filter(function (x) { return x.plays > 0 });
  }
  function driveLog(Dv) {
    var row = function (x) { return "<tr><td style='font-weight:400'>" + esc(x.game.short) + "</td>" + td(x.ser) + td("Q" + (x.qtr || "?")) + td(field(x.start)) + td(x.plays) + td(x.yds) + td(x.res === "TD" ? "<b style='color:#d93732'>TD</b>" : x.res === "Turnover" || x.res === "Downs" ? "<b>" + x.res + "</b>" : x.res) + "</tr>" };
    var hd = "<thead><tr><th>Game</th><th>Ser</th><th>Qtr</th><th style='text-align:center'>Start</th><th>Plays</th><th>Yds</th><th style='text-align:center'>Result</th></tr></thead>";
    return { split: true, rows: Dv.map(row), head: hd, cls: "skt cen plain" };
  }
  function playList(L) {
    var hd = "<thead><tr><th>Game</th><th>Qtr</th><th>Dn&amp;Dist</th><th>Field</th><th>Hash</th><th style='text-align:left'>Formation</th><th style='text-align:left'>Play</th><th style='text-align:left'>RPO</th><th>Gain</th><th style='text-align:left'>Result</th></tr></thead>";
    return { rows: L.map(function (p) { return "<tr><td style='font-weight:400'>" + esc(p.game.short) + "</td>" + td("Q" + (p.qtr || "?")) + td(ddTxt(p)) + td(field(p.yl)) + td(p.hash || "") + "<td style='text-align:left'>" + esc(p.form || "-") + "</td><td style='text-align:left'>" + esc(conceptT(p)) + "</td><td style='text-align:left'>" + esc(p.rpo || "") + "</td>" + td("<b>" + p.gain + "</b>") + "<td style='text-align:left" + (p.td ? ";color:#d93732" : "") + "'>" + esc(p.resRaw) + "</td></tr>" }), head: hd, cls: "skt cen plain", style: "font-size:9.4px" };
  }
  // simple grouped bar chart in SVG: rows = [[label, a, b]]
  function barChart(titleTxt, rows, legend, W, H) {
    W = W || 660; H = H || 240; var pad = { l: 42, r: 10, t: 26, b: 30 }, max = 0; rows.forEach(function (r) { max = Math.max(max, r[1], r[2]) }); var step = [5, 10, 20, 25, 50, 100].filter(function (x) { return max / x <= 5 })[0] || 100; max = Math.max(step, Math.ceil(max / step) * step);
    var ih = H - pad.t - pad.b, iw = W - pad.l - pad.r, gw = iw / rows.length, bw = Math.min(34, gw / 3), y = function (v) { return pad.t + ih - ih * v / max }, s = "";
    for (var t = 0; t <= max; t += step) s += "<line x1='" + pad.l + "' x2='" + (W - pad.r) + "' y1='" + y(t) + "' y2='" + y(t) + "' stroke='#ccc' stroke-dasharray='2 3'/><text x='" + (pad.l - 6) + "' y='" + (y(t) + 4) + "' text-anchor='end' font-size='11'>" + Math.round(t) + "</text>";
    rows.forEach(function (r, i) { var cx = pad.l + gw * i + gw / 2; [[r[1], "#111"], [r[2], "#d93732"]].forEach(function (b, j) { var x = cx - bw + j * bw; s += "<rect x='" + x + "' y='" + y(b[0]) + "' width='" + (bw - 2) + "' height='" + (pad.t + ih - y(b[0])) + "' fill='" + b[1] + "'/><text x='" + (x + bw / 2 - 1) + "' y='" + (y(b[0]) - 4) + "' text-anchor='middle' font-size='10' font-weight='700'>" + b[0] + "</text>" }); s += "<text x='" + cx + "' y='" + (H - 10) + "' text-anchor='middle' font-size='11'>" + esc(r[0]) + "</text>" });
    s += "<text x='" + (W / 2) + "' y='14' text-anchor='middle' font-size='12' font-weight='700'>" + esc(titleTxt) + "</text>";
    if (legend) s += "<rect x='" + (W / 2 - 50) + "' y='20' width='10' height='8' fill='#111'/><text x='" + (W / 2 - 36) + "' y='28' font-size='9'>" + legend[0] + "</text><rect x='" + (W / 2 + 20) + "' y='20' width='10' height='8' fill='#d93732'/><text x='" + (W / 2 + 34) + "' y='28' font-size='9'>" + legend[1] + "</text>";
    return "<svg width='" + W + "' height='" + H + "' viewBox='0 0 " + W + " " + H + "' style='display:block;margin:12px auto 0;font-family:Helvetica,Arial,sans-serif'>" + s + "</svg>";
  }


  // ---------------------------------------------------------------- opponent defensive scout
  function covFam(c) { if (!c) return null; var t = String(c).trim().toUpperCase().split(/[\s\-\/]+/)[0]; if (t === "40" || t === "30") return "Code " + t; if (/^[0-6]$/.test(t)) return "Cov " + t; if (/^3/.test(t) && t.length > 1 && !/^3\d/.test(t)) return "Cov 3"; return null }
  function isBlitz(p) { var b = up(p.blitz); return !!b && !/^(NO|NONE|N|-|0|NO BLITZ)$/.test(b) }
  function shellOf(p) { var x = up(p.shell); return /MFO|2|TWO/.test(x) ? "two" : /MFC|1|ONE/.test(x) ? "one" : /^0|ZERO/.test(x) ? "zero" : null }
  function topVal(A, f, i) { var t = A.map(f).filter(Boolean); if (!t.length) return null; var g = groupBy(t.map(function (v) { return { v: v } }), function (x) { return x.v }), ks = g.keys.sort(function (a, b) { return g.m[b].length - g.m[a].length }); var k = ks[i || 0]; return k ? [k, pct(g.m[k].length, t.length), g.m[k].length] : null }
  var SITS2 = [["P&10", function (p) { return p.dn === 0 }], ["1st down", function (p) { return p.dn === 1 }], ["2nd & short (1-3)", function (p) { return p.dn === 2 && p.dist <= 3 }], ["2nd & med (4-6)", function (p) { return p.dn === 2 && p.dist >= 4 && p.dist <= 6 }], ["2nd & long (7+)", function (p) { return p.dn === 2 && p.dist >= 7 }],
    ["3rd & short (1-3)", function (p) { return p.dn === 3 && p.dist <= 3 }], ["3rd & med (4-6)", function (p) { return p.dn === 3 && p.dist >= 4 && p.dist <= 6 }], ["3rd & long (7+)", function (p) { return p.dn === 3 && p.dist >= 7 }], ["4th down", function (p) { return p.dn === 4 }], ["Red zone (1-20)", function (p) { return p.yl > 0 && p.yl <= 20 }]];
  function lookTxt(B, full) { var f = topVal(B, function (p) { return p.front }), c = topVal(B, function (p) { return covFam(p.cov) }); return [f ? f[0] + " " + f[1] + "%" : null, c ? c[0] + " " + c[1] + "%" : null, full ? "blitz " + P(B.filter(isBlitz).length, B.length) : null].filter(Boolean).join(", ") }
  function oppScout(od, ours, opt) {
    opt = opt || {}; var S = [], team = opt.team || "Opponent", ab = opt.abbr || team.split(/\s+/).pop().slice(0, 3).toUpperCase();
    var games = od.games, A = plays(od).filter(function (p) { return p.odk !== "K" }), O = ours ? plays(ours) : [], N = A.length;
    var sec = function (title, blocks) { S.push({ title: title, blocks: blocks.filter(Boolean) }) };
    var desc = team + " defense across " + games.length + " game" + (games.length === 1 ? "" : "s") + " (" + games.map(function (g) { return g.name }).join(", ") + "): " + N + " run and pass snaps. Penalty plays excluded. Down 0 = P&10. Amber = blitz 45%+ or one coverage 55%+ on 10+ snaps. Gray = under 5 snaps.";
    var COVS = ["Cov 3", "Cov 4", "Cov 6", "Cov 2"];
    var lookHead = function (h) { return "<thead><tr><th style='width:150px'>" + h + "</th><th>Plays</th><th style='text-align:center'>Front 1</th><th style='text-align:center'>Front 2</th><th>2-high</th>" + COVS.map(function (c) { return "<th>" + c + "</th>" }).join("") + "<th>Cov 0/1</th><th>Blitz</th><th>Run avg<br>allowed</th><th>Pass avg<br>allowed</th><th>Eff<br>allowed</th></tr></thead>" };
    var lookRow = function (lab, B, cls) {
      var n = B.length, sm = n < 5 && cls !== "all"; if (!n) return "<tr class='gy'><td>" + lab + "</td><td>0</td>" + new Array(14).join("<td>-</td>") + "</tr>";
      var f1_ = topVal(B, function (p) { return p.front }), f2 = topVal(B, function (p) { return p.front }, 1), sh = B.filter(shellOf), cv = B.filter(function (p) { return covFam(p.cov) }), cp = function (k) { return pct(cv.filter(function (p) { return covFam(p.cov) === k }).length, cv.length) }, s = stat(B), bl = pct(B.filter(isBlitz).length, n);
      var cc = function (v) { return td(v == null ? "-" : v + "%", !sm && n >= 10 && v >= 55 ? "am" : "") };
      var c01 = cv.length ? pct(cv.filter(function (p) { return /Cov [01]/.test(covFam(p.cov)) }).length, cv.length) : null;
      return "<tr class='" + (cls || "") + (sm ? " gy" : "") + "'><td>" + lab + "</td>" + td(n) + "<td style='text-align:center'>" + (f1_ ? esc(f1_[0]) + " " + f1_[1] + "%" : "-") + "</td><td style='text-align:center'>" + (f2 ? esc(f2[0]) + " " + f2[1] + "%" : "-") + "</td>" + td(sh.length ? pct(sh.filter(function (p) { return shellOf(p) === "two" }).length, sh.length) + "%" : "-") + COVS.map(function (k) { return cc(cv.length ? cp(k) : null) }).join("") + cc(c01) + td(bl + "%", !sm && n >= 10 && bl >= 45 ? "am" : "") + td(f1(s.ravg)) + td(f1(s.pavg)) + td(pct(s.eff, n) + "%") + "</tr>";
    };
    var lookTab = function (h, rows) { return "<table class='skt' style='font-size:9.4px'>" + lookHead(h) + "<tbody>" + lookRow("ALL", A, "all") + rows.map(function (r) { return lookRow(r[0], r[1]) }).join("") + "</tbody></table>" };
    // 1 data check
    (function () {
      var rows = od.rows.filter(function (r) { return r.odk !== "K" }), np = rows.filter(function (r) { return !r.pen });
      var cols = [["Down", function (r) { return r.dn != null }], ["Dist", function (r) { return r.dist != null }], ["Yard ln", function (r) { return r.yl != null }], ["Hash", function (r) { return !!r.hash }], ["Formation", function (r) { return !!r.form }], ["Play type", function (r) { return !!r.type }], ["Front", function (r) { return !!r.front }], ["Coverage", function (r) { return !!r.cov }], ["Shell", function (r) { return !!r.shell }], ["Gain", function (r) { return r.gain != null }], ["Qtr", function (r) { return r.qtr != null }], ["Series", function (r) { return r.ser != null }]];
      var line = function (lab, B, cls) { return "<tr class='" + (cls || "") + "'><td>" + lab + "</td>" + td(B.length) + cols.map(function (c) { var v = pct(B.filter(c[1]).length, B.length); return td(v == null ? "-" : v + "%", v < 80 ? "rd" : v < 95 ? "am" : "") }).join("") + "</tr>" };
      var t = "<table class='skt' style='font-size:9.4px'><thead><tr><th>GAME</th><th>Rows</th>" + cols.map(function (c) { return "<th>" + c[0] + "</th>" }).join("") + "</tr></thead><tbody>" + line("ALL", np, "all") + games.map(function (g) { return line(esc(g.name), np.filter(function (r) { return r.gid === g.id })) }).join("") + "</tbody></table>";
      var fixes = []; cols.forEach(function (c) { var bad = games.map(function (g) { var B = np.filter(function (r) { return r.gid === g.id }), v = pct(B.filter(c[1]).length, B.length); return v != null && v < 80 ? esc(g.name) + " (" + v + "%)" : null }).filter(Boolean); if (bad.length) fixes.push("<b>" + c[0] + "</b>: tag the " + c[0] + " column in " + bad.join(", ") + ".") });
      var odd = [], unk = groupBy(A.filter(function (p) { return p.cov && !covFam(p.cov) || /^Code/.test(covFam(p.cov) || "") }), function (p) { return p.cov }); if (unk.keys.length) odd.push("Coverage codes the report can't place: " + unk.keys.map(function (k) { return esc(k) + " x" + unk.m[k].length }).join(", ") + ". Tell your staff what they mean or retag.");
      var ng = A.filter(function (p) { return p.gain == null }).length; if (ng) odd.push(ng + " run/pass plays have no GN/LS. They drop out of the tables that need it.");
      var nq = games.filter(function (g) { return !np.some(function (r) { return r.gid === g.id && r.qtr != null }) }); if (nq.length) odd.push("No quarter tagged at all in " + nq.map(function (g) { return esc(g.name) }).join(", ") + ", so quarter splits leave these games out.");
      var odkO = games.filter(function (g) { return A.some(function (p) { return p.gid === g.id && p.odk === "O" }) && A.some(function (p) { return p.gid === g.id && p.front }) }); if (odkO.length) odd.push("Some plays in " + odkO.map(function (g) { return esc(g.name) }).join(", ") + " are tagged ODK = O but have fronts and coverages, so they are read as " + esc(team) + "'s defense.");
      sec("Data check", ["<p class='skp' style='color:#555'>" + rows.length + " rows across " + games.length + " games (" + games.map(function (g) { return esc(g.name) + " " + rows.filter(function (r) { return r.gid === g.id }).length }).join(", ") + "). " + rows.filter(function (r) { return r.pen }).length + " penalty rows are left out of every table.</p>",
        h2("How complete is the tagging? (share of plays with the column filled in)") + t + note("Red = under 80% tagged, yellow = 80-94%. Penalty rows excluded."), fixes.length ? h2("What to fix in Hudl (most impact first)") + bul(fixes) : "", odd.length ? h2("Odd or inconsistent values") + bul(odd) : "", note("Fixing these in Hudl and re-exporting makes every page after this one more accurate. The report still builds with gaps; affected numbers just cover fewer plays.")]);
    })();
    // 2 key tendencies
    (function () {
      var T = [], fr = A.filter(function (p) { return p.front }), cv = A.filter(function (p) { return covFam(p.cov) }), sh = A.filter(shellOf), BL = A.filter(isBlitz), NB = A.filter(function (p) { return !isBlitz(p) });
      var tops = function (B, f, k) { var g = groupBy(B, f); return g.keys.sort(function (a, b) { return g.m[b].length - g.m[a].length }).slice(0, k).map(function (x) { return esc(x) + " " + pct(g.m[x].length, B.length) + "%" }).join(", ") };
      T.push(["Base defense", "Front: " + tops(fr, function (p) { return p.front }, 4) + ". Coverage: " + tops(cv, function (p) { return covFam(p.cov) }, 4) + ". Shell is split " + P(sh.filter(function (p) { return shellOf(p) === "two" }).length, sh.length) + " two-high / " + P(sh.filter(function (p) { return shellOf(p) === "one" }).length, sh.length) + " one-high."]);
      var bg = groupBy(BL, function (p) { return p.blitz }), hi = SITS2.map(function (x) { var B = A.filter(x[1]); return [x[0], pct(B.filter(isBlitz).length, B.length), B.length] }).filter(function (x) { return x[2] >= 8 }).sort(function (a, b) { return b[1] - a[1] }).slice(0, 3);
      T.push(["They pressure", "Blitz on " + P(BL.length, N) + " of snaps (" + BL.length + " of " + N + ")." + (bg.keys.length ? " Most-used: " + bg.keys.sort(function (a, b) { return bg.m[b].length - bg.m[a].length }).slice(0, 3).map(function (k) { return esc(k) + " " + bg.m[k].length }).join(", ") + "." : "") + " Highest blitz rates: " + hi.map(function (x) { return x[0] + " " + x[1] + "% (" + x[2] + ")" }).join("; ") + "."]);
      var a = stat(BL), b = stat(NB); T.push([a.n && pct(a.eff, a.n) > pct(b.eff, b.n) ? "Blitzing doesn't stop offenses" : "Blitzing works for them", "With a blitz they allow " + f1(a.ravg) + " per run and " + f1(a.pavg) + " per pass (" + P(a.eff, a.n) + " Eff). Without one: " + f1(b.ravg) + " per run, " + f1(b.pavg) + " per pass (" + P(b.eff, b.n) + " Eff)."]);
      if (O.length) forms(O).slice(0, 2).forEach(function (x, i) { var B = A.filter(function (p) { return p.form === x[0] }); if (!B.length) return; var s = stat(B), f = topVal(B, function (p) { return p.front }), c = topVal(B, function (p) { return covFam(p.cov) }); T.push(["Versus " + esc(x[0]) + (i === 0 ? " (our #1 formation)" : ""), (i === 0 ? "We use " + esc(x[0]) + " on " + P(x[1].length, O.length) + " of our snaps. " : "") + esc(team) + " saw it " + B.length + " times: " + (f ? esc(f[0]) + " " + f[1] + "% front, " : "") + (c ? c[0] + " " + c[1] + "%, " : "") + "blitz " + P(B.filter(isBlitz).length, B.length) + ". Runs vs " + esc(x[0]) + " averaged " + f1(s.ravg) + " (" + s.run + "); passes " + f1(s.pavg) + " (" + s.pass + ")."]) });
      var leak = [], strong = [];
      groupBy(fr, function (p) { return p.front }).keys.forEach(function () {});
      var fg = groupBy(A.filter(function (p) { return p.front && p.type === "Run" }), function (p) { return p.front }), cg = groupBy(A.filter(function (p) { return covFam(p.cov) }), function (p) { return covFam(p.cov) });
      fg.keys.filter(function (k) { return fg.m[k].length >= 8 }).forEach(function (k) { var v = stat(fg.m[k]).avg; if (v >= 12) leak.push("Runs vs " + esc(k) + " front average " + f1(v) + " (" + fg.m[k].length + " runs)"); if (v <= 9.5) strong.push(esc(k) + " front holds runs to " + f1(v) + " (" + fg.m[k].length + " runs)") });
      cg.keys.forEach(function (k) { var r = cg.m[k].filter(function (p) { return p.type === "Run" }), pp = cg.m[k].filter(function (p) { return p.type === "Pass" }); if (r.length >= 10 && stat(r).avg >= 12) leak.push("runs vs " + k + " average " + f1(stat(r).avg) + " (" + r.length + ")"); if (pp.length >= 10) (stat(pp).avg >= 10 ? leak : strong).push("Passes vs " + k + " average " + f1(stat(pp).avg) + " (" + pp.length + ")") });
      if (leak.length) T.push(["Where they leak", leak.slice(0, 3).join("; ") + "."]); if (strong.length) T.push(["Where they are strong", strong.slice(0, 3).join("; ") + "."]);
      var con = groupBy(A.filter(function (p) { return concept(p) }), concept), hurt = con.keys.filter(function (k) { return con.m[k].length >= 5 && stat(con.m[k]).avg >= 7 }).sort(function (a, b) { return stat(con.m[b]).avg - stat(con.m[a]).avg }), stop = con.keys.filter(function (k) { return con.m[k].length >= 6 && stat(con.m[k]).avg < 4 });
      T.push(["Concepts that hurt them", hurt.length ? hurt.slice(0, 3).map(function (k) { return esc(k) + " " + f1(stat(con.m[k]).avg) + " yds (" + con.m[k].length + ")" }).join(", ") + " (offense concept names as tagged by your staff)." : "No concept has averaged 7+ yds on 5+ snaps."]);
      T.push(["Concepts they stop", stop.length ? stop.map(function (k) { return esc(k) + " " + f1(stat(con.m[k]).avg) + " yds (" + con.m[k].length + ")" }).join(", ") + "." : "No concept has been held under 4.0 yds on 6+ snaps."]);
      T.push(["3rd down", SITS2.slice(5, 8).map(function (x) { var B = A.filter(x[1]), c = topVal(B, function (p) { return covFam(p.cov) }); return x[0] + ": " + (c ? c[0] + " " + c[1] + "%, " : "") + "blitz " + P(B.filter(isBlitz).length, B.length) + " (" + B.length + ")" }).join("; ")]);
      var ex = A.filter(expl); T.push(["Explosives allowed", ex.length + " explosive plays allowed on " + N + " snaps (" + P(ex.length, N) + "): " + ex.filter(function (p) { return p.type === "Run" }).length + " runs of 10+, " + ex.filter(function (p) { return p.type === "Pass" }).length + " passes of 15+."]);
      sec("Key tendencies", ["<table class='skt wrap' style='font-size:11px'><thead><tr><th style='width:30px'>#</th><th style='width:170px'>TENDENCY</th><th>DETAIL</th></tr></thead><tbody>" + T.map(function (x, i) { return "<tr><td style='font-weight:700'>" + (i + 1) + "</td><td style='font-weight:700'>" + x[0] + "</td><td>" + x[1] + "</td></tr>" }).join("") + "</tbody></table>", note(desc)]);
    })();
    // 3 by game
    (function () {
      var gave = "<table class='skt' style='width:520px'><thead><tr><th>GAME</th><th>Plays</th><th>% snaps</th><th>Run avg</th><th>Pass avg</th><th>Eff allowed</th><th>Explosive</th></tr></thead><tbody>" + games.map(function (g) { var B = A.filter(function (p) { return p.gid === g.id }), s = stat(B); return "<tr><td>" + esc(g.name) + "</td>" + td(B.length) + td(P(B.length, N)) + td(f1(s.ravg)) + td(f1(s.pavg)) + td(P(s.eff, s.n)) + td(s.ex) + "</tr>" }).join("") + "</tbody></table>";
      var line = function (lab, B, cls, k) { k = k || 1; var s = stat(B), cmp = B.filter(function (p) { return p.type === "Pass" && /^COMPLETE/.test(p.res) }).length; return "<tr class='" + (cls || "") + "'><td>" + lab + "</td>" + td(Math.round(s.run / k)) + td(Math.round(s.rg / k)) + td(f1(s.ravg)) + td(Math.round(s.pass / k)) + td(Math.round(cmp / k)) + td(Math.round(s.pg / k)) + td(f1(s.pavg)) + td("<b>" + Math.round(s.gain / k) + "</b>") + td(f1(s.avg)) + "</tr>" };
      var tot = "<table class='skt'><thead><tr><th>GAME</th><th>RUSH</th><th>RUSH YDS</th><th>YPC</th><th>PASS</th><th>COMP</th><th>PASS YDS</th><th>YPA</th><th>TOTAL YDS ALLOWED</th><th>YPP</th></tr></thead><tbody>" + line("SEASON", A, "all") + line("PER GAME", A, "all", games.length) + games.map(function (g) { return line(esc(g.name), A.filter(function (p) { return p.gid === g.id })) }).join("") + "</tbody></table>";
      sec("Defense by game", [lookTab("GAME", games.map(function (g) { return [esc(g.name), A.filter(function (p) { return p.gid === g.id })] })), note(desc), h2("What they gave up by game") + gave, h2("Total yards allowed: season and each game") + tot + note("Rush = run plays; Pass = pass plays (sacks and scrambles count as pass plays, as tagged). Yards come from GN/LS; penalty plays are left out.")]);
    })();
    // 4 down & distance
    (function () {
      var rows = DDB.map(function (b) { return [b[0], A.filter(b[1])] }).concat([["Red zone (1-20)", A.filter(function (p) { return p.yl > 0 && p.yl <= 20 })]]);
      var dn = [["P&10", 0], ["1st down", 1], ["2nd down", 2], ["3rd down", 3], ["4th down", 4]], sl = function (lab, B, cls) { var sh = B.filter(shellOf), bl = B.filter(isBlitz), tb = topVal(bl, function (p) { return p.blitz }); return "<tr class='" + (cls || "") + "'><td>" + lab + "</td>" + td(B.length) + ["two", "one", "zero"].map(function (k) { return td(P(sh.filter(function (p) { return shellOf(p) === k }).length, sh.length)) }).join("") + td(P(bl.length, B.length)) + "<td style='text-align:center'>" + (tb ? esc(tb[0]) + " (" + tb[2] + ")" : "-") + "</td></tr>" };
      sec("Defense by down & distance", [lookTab("DOWN / DIST", rows), note(desc), h2("Shell by down: two-high (MFO) / one-high (MFC) / zero") + "<table class='skt' style='width:600px'><thead><tr><th>DOWN</th><th>Plays</th><th>Two-high</th><th>One-high</th><th>Zero</th><th>Blitz</th><th style='text-align:center'>Most-used blitz</th></tr></thead><tbody>" + sl("ALL", A, "all") + dn.map(function (x) { return sl(x[0], A.filter(function (p) { return p.dn === x[1] })) }).join("") + "</tbody></table>"]);
    })();
    // 5 formation faced
    (function () {
      var fl = withOther(forms(A), A, 4).map(function (x) { return [esc(x[0]).replace("Other (<4 plays)", "Other (<4 snaps)"), x[1], x[0]] });
      var use = O.length ? "<table class='skt' style='width:560px'><thead><tr><th>FORMATION</th><th>" + ab + " saw it</th><th>Our snaps</th><th>Our use</th><th>Our run %</th><th>Our yds/play</th><th>Our Eff</th></tr></thead><tbody>" + fl.filter(function (x) { return !/^Other/.test(x[0]) }).map(function (x) { var B = O.filter(function (p) { return p.form === x[2] }), s = stat(B), sm = B.length < 5; return "<tr class='" + (sm ? "gy" : "") + "'><td>" + x[0] + "</td>" + td(x[1].length) + td(B.length) + td(P(B.length, O.length)) + td(B.length ? P(s.run, s.n) : "-") + td(f1(s.avg)) + td(B.length ? P(s.eff, s.n) : "-") + "</tr>" }).join("") + "</tbody></table>" + note("Formation names are as tagged by your staff on the " + esc(team) + " film, so they line up with your own formation names.") : "";
      sec("Defense by formation faced", [lookTab("FORMATION", fl), note(desc), use ? h2("How much we use each of these formations (from our self scout)") + use : ""]);
    })();
    // 6 hash / zone / backfield
    (function () {
      var zones = [["Own 1-20", function (p) { return p.yl < 0 && p.yl >= -20 }], ["Own 21-49", function (p) { return p.yl < -20 }], ["Midfield to opp. 21", function (p) { return p.yl === 50 || p.yl > 20 }], ["Red zone (1-20)", function (p) { return p.yl > 0 && p.yl <= 20 }]];
      var rb = groupBy(A.filter(function (p) { return rbOf(p) !== "Not tagged" }), rbOf);
      sec("Hash, field zone & backfield", [h2("By hash") + lookTab("HASH", HASHES.map(function (h) { return [h[0], A.filter(function (p) { return p.hash === h[1] })] })), h2("By field position of the offense") + lookTab("FIELD ZONE", zones.map(function (z) { return [z[0], A.filter(z[1])] })), h2("By RB alignment of the offense") + lookTab("RB ALIGNMENT", rb.keys.map(function (k) { return [k, rb.m[k]] })), note(desc)]);
    })();
    // 7 blitz
    (function () {
      var BL = A.filter(isBlitz), g = groupBy(BL, function (p) { return p.blitz }), ks = g.keys.sort(function (a, b) { return g.m[b].length - g.m[a].length });
      var dnN = function (d) { return d === 0 ? "P&10" : ["", "1st", "2nd", "3rd", "4th"][d] || "-" };
      var t1 = "<table class='skt cen'><thead><tr><th>BLITZ</th><th>Times</th><th>% of blitzes</th><th>Most common down</th><th>Most common front</th><th>Coverage behind it</th><th>Yds allowed</th><th>Eff allowed</th></tr></thead><tbody>" + ks.map(function (k) { var B = g.m[k], d = topVal(B, function (p) { return p.dn == null ? null : dnN(p.dn) }), f = topVal(B, function (p) { return p.front }), c = topVal(B, function (p) { return covFam(p.cov) }), s = stat(B), sm = B.length < 5; return "<tr class='" + (sm ? "gy" : "") + "'><td>" + esc(k) + "</td>" + td(B.length) + td(P(B.length, BL.length)) + td(d ? d[0] + " (" + d[2] + ")" : "-") + td(f ? esc(f[0]) + " " + f[1] + "%" : "-") + td(c ? c[0] + " " + c[1] + "%" : "-") + td(f1(s.avg)) + td(P(s.eff, s.n)) + "</tr>" }).join("") + "</tbody></table>";
      var sl = function (lab, B, cls) { var bl = B.filter(isBlitz), nb = B.filter(function (p) { return !isBlitz(p) }), tb = topVal(bl, function (p) { return p.blitz }), sm = B.length < 5 && !cls; return "<tr class='" + (cls || "") + (sm ? " gy" : "") + "'><td>" + lab + "</td>" + td(B.length) + td(P(bl.length, B.length)) + td(tb ? esc(tb[0]) + " (" + tb[2] + ")" : "-") + td(f1(stat(bl.filter(function (p) { return p.type === "Run" })).avg)) + td(f1(stat(bl.filter(function (p) { return p.type === "Pass" })).avg)) + td(f1(stat(nb.filter(function (p) { return p.type === "Pass" })).avg)) + "</tr>" };
      var t2 = "<table class='skt cen'><thead><tr><th>SITUATION</th><th>Snaps</th><th>Blitz %</th><th>Top blitz</th><th>Run avg vs blitz</th><th>Pass avg vs blitz</th><th>Pass avg, no blitz</th></tr></thead><tbody>" + sl("ALL", A, "all") + SITS2.map(function (x) { return sl(x[0], A.filter(x[1])) }).join("") + "</tbody></table>";
      var t3 = "<table class='skt cen'><thead><tr><th>FORMATION</th><th>Snaps</th><th>Blitz %</th><th>Top blitz</th><th>Yds allowed vs blitz</th><th>Yds allowed, no blitz</th></tr></thead><tbody>" + forms(A, 10).map(function (x) { var B = x[1], bl = B.filter(isBlitz), r = pct(bl.length, B.length), tb = topVal(bl, function (p) { return p.blitz }); return "<tr><td>" + esc(x[0]) + "</td>" + td(B.length) + td(r + "%", r >= 45 ? "am" : "") + td(tb ? esc(tb[0]) + " (" + tb[2] + ")" : "-") + td(f1(stat(bl).avg)) + td(f1(stat(B.filter(function (p) { return !isBlitz(p) })).avg)) + "</tr>" }).join("") + "</tbody></table>";
      sec("Blitz report", [BL.length ? t1 + note(BL.length + " blitzes on " + N + " snaps (" + P(BL.length, N) + "). Blitz names are as tagged in the sheet.") : "<p class='skp'>No blitzes tagged.</p>", h2("Blitz rate by situation") + t2, h2("Blitz rate by formation faced") + t3]);
    })();
    // 8 what hurts them
    (function () {
      var tab = function (h, g, keys, labf) { return "<table class='skt' style='width:520px'><thead><tr><th>" + h + "</th><th>Plays</th><th>% snaps</th><th>Run avg</th><th>Pass avg</th><th>Eff allowed</th><th>Explosive</th></tr></thead><tbody>" + keys.map(function (k) { var B = g.m[k], s = stat(B), sm = B.length < 5; return "<tr class='" + (sm ? "gy" : "") + "'><td>" + esc(labf ? labf(k) : k) + "</td>" + td(B.length) + td(P(B.length, N)) + td(f1(s.ravg)) + td(f1(s.pavg)) + td(P(s.eff, s.n)) + td(s.ex) + "</tr>" }).join("") + "</tbody></table>" };
      var fg = groupBy(A.filter(function (p) { return p.front }), function (p) { return p.front }), fk = fg.keys.filter(function (k) { return fg.m[k].length >= 3 }).sort(function (a, b) { return fg.m[b].length - fg.m[a].length });
      var cg = groupBy(A.filter(function (p) { return covFam(p.cov) }), function (p) { return covFam(p.cov) }), ck = cg.keys.filter(function (k) { return cg.m[k].length >= 3 }).sort(function (a, b) { return cg.m[b].length - cg.m[a].length });
      var bg = groupBy(A, function (p) { return isBlitz(p) ? "Blitz" : "No blitz" });
      var ct = function (head, type, min) { var g = groupBy(A.filter(function (p) { return p.type === type && concept(p) }), concept), ks = g.keys.filter(function (k) { return g.m[k].length >= min }).sort(function (a, b) { return stat(g.m[b]).avg - stat(g.m[a]).avg }); return "<table class='skt'><thead><tr><th>" + head + "</th><th>Plays</th><th>Avg</th><th>Eff</th><th>Exp</th></tr></thead><tbody>" + ks.map(function (k) { var s = stat(g.m[k]), sm = s.n < 5; return "<tr class='" + (sm ? "gy" : "") + "'><td>" + esc(k) + "</td>" + td(s.n) + td(f1(s.avg)) + td(P(s.eff, s.n)) + td(s.ex) + "</tr>" }).join("") + "</tbody></table>" };
      sec("What hurts them", [h2("Yards allowed by front") + tab("FRONT", fg, fk), h2("Yards allowed by coverage") + tab("COVERAGE", cg, ck), h2("Blitz vs no blitz") + tab("PRESSURE", bg, ["No blitz", "Blitz"].filter(function (k) { return bg.m[k] })),
        h2("Offensive concepts run against them") + "<div class='sk2'><div>" + ct("RUN CONCEPT (4+)", "Run", 4) + "</div><div>" + ct("PASS CONCEPT (3+)", "Pass", 3) + "</div></div>" + note("Sorted by yards per play. Concepts are the other offenses' plays, tagged with your staff's names. Exp = explosive plays (runs 10+, passes 15+).")]);
    })();
    if (!O.length) return S;
    // 9 matchup
    (function () {
      var row = function (lab, ob, tb, cls) {
        var os = stat(ob), ts = stat(tb), rp = pct(os.run, os.n), f = topVal(tb, function (p) { return p.front }), c = topVal(tb, function (p) { return covFam(p.cov) }), bl = pct(tb.filter(isBlitz).length, tb.length), flag = [];
        if (os.n >= 10 && rp >= 75) flag.push("We run " + rp + "% here"); if (os.n >= 10 && rp <= 25) flag.push("We throw " + (100 - rp) + "% here");
        if (tb.length >= 5 && bl >= 40) flag.push("Blitz " + bl + "%: hot/quick answers ready");
        if (tb.length >= 5 && ts.ravg >= 8) flag.push("Runs avg " + f1(ts.ravg) + " vs " + ab); if (tb.length >= 5 && ts.pavg >= 9) flag.push("Passes avg " + f1(ts.pavg) + " vs " + ab);
        var sm = tb.length < 5;
        return "<tr class='" + (sm ? "gy" : "") + "'><td>" + lab + "</td>" + td(os.n) + td(os.n ? rp + "% / " + (100 - rp) + "%" : "-") + td(cls === "f" ? f1(os.avg) : P(os.eff, os.n)) + td(tb.length) + td(f ? esc(f[0]) + " " + f[1] + "%" : "-") + td(c ? c[0] + " " + c[1] + "%" : "-") + td(tb.length ? bl + "%" : "-") + td(f1(ts.ravg) + " / " + f1(ts.pavg)) + "<td style='white-space:normal;text-align:left;font-size:9px;width:150px'>" + flag.join("; ") + "</td></tr>";
      };
      var hd = function (h, c3, c4) { return "<thead><tr><th>" + h + "</th><th>Our<br>snaps</th><th>Our run /<br>pass</th><th>Our<br>" + c3 + "</th><th>" + ab + "<br>" + c4 + "</th><th>" + ab + "<br>front</th><th>" + ab + "<br>coverage</th><th>Blitz</th><th>" + ab + " allows<br>run / pass</th><th style='text-align:left'>Flag</th></tr></thead>" };
      var t1 = "<table class='skt cen' style='font-size:9.4px'>" + hd("SITUATION", "Eff", "snaps") + "<tbody>" + SITS2.map(function (x) { return row(x[0], O.filter(x[1]), A.filter(x[1])) }).join("") + "</tbody></table>";
      var t2 = "<table class='skt cen' style='font-size:9.4px'>" + hd("OUR FORMATION", "yds/play", "saw it") + "<tbody>" + forms(O, 10).filter(function (x) { return A.some(function (p) { return p.form === x[0] }) }).map(function (x) { return row(esc(x[0]), x[1], A.filter(function (p) { return p.form === x[0] }), "f") }).join("") + "</tbody></table>";
      sec("Matchup: us vs their defense", [h2("By situation") + t1 + note("Our side comes from the self scout (" + ours.games.length + " games). " + ab + " side is " + esc(team) + "'s defense against other offenses. Run / pass averages are yards per play."), h2("By our formation") + t2]);
    })();
    // 10 call ideas
    (function () {
      var allC = groupBy(O.filter(function (p) { return concept(p) }), concept), oppC = groupBy(A.filter(function (p) { return concept(p) }), concept);
      var ideas = function (sitF, type) {
        var here = O.filter(function (p) { return sitF(p) && p.type === type && concept(p) }), g = groupBy(here, concept);
        return g.keys.filter(function (k) { var all = allC.m[k] || []; return all.length >= 5 && g.m[k].some(eff) && !(oppC.m[k] && oppC.m[k].length >= 6 && stat(oppC.m[k]).avg < 4) }).map(function (k) {
          var h = g.m[k], all = allC.m[k], he = h.filter(eff).length, ae = pct(all.filter(eff).length, all.length), op = oppC.m[k], bonus = op && op.length >= 5 && stat(op).avg >= 7 ? .1 : 0;
          return { k: k, h: h.length, he: he, ae: ae, an: all.length, op: op, sc: .45 * (he + 1) / (h.length + 2) + .55 * ae / 100 + bonus };
        }).sort(function (a, b) { return b.sc - a.sc })[0];
      };
      var fmt = function (x, lab) { if (!x) return ""; return "<b>" + lab + ":</b> " + esc(x.k) + " " + x.he + "/" + x.h + " here, " + x.ae + "% overall (" + x.an + ")" + (x.op ? "; " + ab + " allowed " + f1(stat(x.op).avg) + " yds (" + x.op.length + ")" : "") };
      var t1 = "<table class='skt wrap' style='font-size:10px'><thead><tr><th style='width:130px'>SITUATION</th><th style='width:190px;text-align:center'>What " + ab + " shows</th><th style='text-align:center'>Call ideas from our data</th></tr></thead><tbody>" + SITS2.map(function (x) { var tb = A.filter(x[1]), r = ideas(x[1], "Run"), pp = ideas(x[1], "Pass"); return "<tr><td style='font-weight:700'>" + x[0] + "</td><td style='text-align:center'>" + (tb.length ? lookTxt(tb, true) + " (" + tb.length + ")" : "-") + "</td><td>" + [fmt(r, "Run"), fmt(pp, "Pass")].filter(Boolean).join("<br>") + "</td></tr>" }).join("") + "</tbody></table>";
      var ks = allC.keys.filter(function (k) { return allC.m[k].length >= 4 }).sort(function (a, b) { return allC.m[b].length - allC.m[a].length });
      var t2 = "<table class='skt cen' style='width:640px'><thead><tr><th>CONCEPT</th><th>Our calls</th><th>Our yds/play</th><th>Our Eff</th><th>" + ab + " faced</th><th>" + ab + " allowed</th><th>Read</th></tr></thead><tbody>" + ks.map(function (k) { var s = stat(allC.m[k]), op = oppC.m[k] || [], os = stat(op), rd = !op.length ? "Not seen" : op.length < 5 ? "Thin sample" : os.avg >= 7 ? "Hurts them" : os.avg < 4 ? "They stop it" : ""; return "<tr><td>" + esc(k) + "</td>" + td(s.n) + td(f1(s.avg)) + td(P(s.eff, s.n)) + td(op.length) + td(f1(os.avg)) + td(rd) + "</tr>" }).join("") + "</tbody></table>";
      sec("Call ideas by situation", [t1, note("How the ideas are picked: among concepts we have called in that situation (5+ calls overall), rank by success in that situation, weighted toward the concept's overall Eff so one lucky play does not win, with extra credit if " + esc(team) + " gave it up (7+ yds on 5+ snaps). Concepts " + esc(team) + " held under 4.0 yards on 6+ snaps, and concepts with no effective play in that situation, are skipped. \"4/5 here\" = effective on 4 of 5 calls in that situation. Starting points for the staff, not calls."), h2("Concepts: our results vs what " + esc(team) + " allowed") + t2]);
    })();
    return S;
  }

  // ---------------------------------------------------------------- game management card
  function gmCard(full, ours, opt) {
    opt = opt || {}; var team = opt.team || "Opponent", ab = opt.abbr || team.split(/\s+/).pop().slice(0, 3).toUpperCase(), S = [];
    var O = ours ? plays(ours) : [];
    // our 3rd/4th-down conversion by distance, shrunk toward a high-school baseline
    var BASE = [0, .62, .52, .46, .41, .37, .33, .30, .27, .24, .22];
    var conv = function (d) { var B = O.filter(function (p) { return p.dn >= 3 && p.dist != null && Math.abs(p.dist - d) <= (d <= 3 ? 0 : 1) && p.gain != null }), k = 30; var c = B.filter(function (p) { return p.gain >= p.dist }).length; return (c + BASE[Math.min(10, d)] * k) / (B.length + k) };
    var EP = function (y) { return -1.2 + 0.07 * y }; // expected points for the team with the ball, y = yards from its own goal
    var FGB = opt.fg || [[22, .94], [27, .9], [32, .82], [37, .68], [42, .48], [47, .28], [52, .1]], fgP = function (kick) { for (var i = 0; i < FGB.length; i++) if (kick <= FGB[i][0]) return FGB[i][1]; return 0 };
    var net = opt.puntNet || 33, KO = 30;
    var fourth = function (d, y) {
      var go = conv(d) * EP(Math.min(99, y + d + 2)) + (1 - conv(d)) * -EP(100 - y), kick = 100 - y + 17;
      var fg = fgP(kick) ? fgP(kick) * (3 - EP(KO)) + (1 - fgP(kick)) * -EP(100 - Math.max(y - 7, 20)) : -99;
      var pu = y >= 62 ? -99 : -EP(Math.max(20, 100 - Math.min(99, y + net)));
      var A = [["GO", go], ["FG", fg], ["PUNT", pu]].sort(function (a, b) { return b[1] - a[1] }); var bold = opt.bold == null ? 1 : opt.bold; if (A[0][0] === "GO" && A[0][1] - A[1][1] < (y < 50 ? .8 : .45) * bold) A = [A[1], A[0], A[2]]; return { call: A[0][0], close: Math.abs(A[0][1] - A[1][1]) < .35 };
    };
    G.SK.fourthCall = fourth;
    var spots = [["O20", 20], ["O25", 25], ["O30", 30], ["O35", 35], ["O40", 40], ["O45", 45], ["50", 50], ["X45", 55], ["X40", 60], ["X35", 65], ["X30", 70], ["X25", 75], ["X20", 80], ["X15", 85], ["X10", 90], ["X5", 95]];
    var col = { GO: ["#7cc576", "#cfe9cc"], FG: ["#8fb4e3", "#d6e3f5"], PUNT: ["#bdbdbd", "#ececec"] };
    var g4 = "<table class='skt cen' style='font-size:9.4px'><thead><tr><th>4TH &amp;</th>" + spots.map(function (s) { return "<th>" + s[0] + "</th>" }).join("") + "</tr></thead><tbody>" + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (d) { return "<tr><td>" + d + "</td>" + spots.map(function (s) { if (s[1] + d > 100) return "<td></td>"; var f = fourth(d, s[1]); return "<td style='background:" + col[f.call][f.close ? 1 : 0] + "!important;font-weight:400'>" + f.call + "</td>" }).join("") + "</tr>" }).join("") + "</tbody></table>";
    // drive scoring rates: ours from our drives, theirs from their offensive series in the full-game file
    var rate = function (d, gids) { var D = drives(d, gids), n = D.length || 1, t = D.filter(function (x) { return x.res === "TD" }).length; return { td: D.length ? t / n : .3, fg: .05 } };
    var us = ours ? rate(ours) : { td: .35, fg: .05 }, themD = (function () { var off = { rows: full.rows.filter(function (r) { return r.odk === "O" }), games: full.games }; return rate(off) })();
    us.td = (us.td * 20 + .35 * 8) / 28; themD.td = (themD.td * 20 + .3 * 8) / 28;
    var pat = .9, two = opt.two2 || .45;
    var WP = function (m, nUs, nThem) { var dist = function (r, n) { var d = { 0: 1 }; for (var i = 0; i < n; i++) { var x = {}; Object.keys(d).forEach(function (k) { [[7, r.td], [3, r.fg], [0, 1 - r.td - r.fg]].forEach(function (o) { var v = +k + o[0]; x[v] = (x[v] || 0) + d[k] * o[1] }) }); d = x } return d }; var U = dist(us, nUs), H = dist(themD, nThem), w = 0; Object.keys(U).forEach(function (a) { Object.keys(H).forEach(function (b) { var f = m + (+a) - (+b); w += U[a] * H[b] * (f > 0 ? 1 : f === 0 ? .5 : 0) }) }); return w };
    var marg = [-14, -11, -10, -8, -7, -4, -3, -1, 0, 1, 3, 4, 7, 8, 10, 11, 14];
    var wpT = "<table class='skt cen' style='font-size:9.4px'><thead><tr><th>POSS. LEFT</th>" + marg.map(function (m) { return "<th>" + (m > 0 ? "+" + m : m === 0 ? "+0" : m) + "</th>" }).join("") + "</tr></thead><tbody>" + [1, 2, 3, 4, 5].map(function (n) { return "<tr><td>" + n + " each</td>" + marg.map(function (m) { var v = Math.round(100 * WP(m, n, n)); return "<td style='background:" + (v < 30 ? "#f5c0c0" : v < 70 ? "#ffe9a8" : "#c8e6c9") + "!important;font-weight:400'>" + v + "</td>" }).join("") + "</tr>" }).join("") + "</tbody></table>";
    var m2 = []; for (var i = -10; i <= 10; i++) m2.push(i);
    var twoT = "<table class='skt cen' style='font-size:9.4px'><thead><tr><th>POSS.<br>LEFT</th>" + m2.map(function (m) { return "<th>" + (m > 0 ? "+" + m : m === 0 ? "+0" : m) + "</th>" }).join("") + "</tr></thead><tbody>" + [1, 2, 3].map(function (n) { return "<tr><td>" + n + " each</td>" + m2.map(function (m) { var k = pat * WP(m + 1, n - 1, n) + (1 - pat) * WP(m, n - 1, n), t = two * WP(m + 2, n - 1, n) + (1 - two) * WP(m, n - 1, n), c = Math.abs(t - k) < .01 ? "=" : t > k ? "2" : "1"; return "<td style='font-weight:400" + (c === "2" ? ";background:#c8e6c9!important" : "") + "'>" + c + "</td>" }).join("") + "</tr>" }).join("") + "</tbody></table>";
    var mm = function (s) { s = Math.max(2, s); return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2) };
    var kn = "<table class='skt' style='width:760px'><thead><tr><th>DOWNS WE HAVE LEFT</th><th>THEY HAVE 0 TO</th><th>1 TO</th><th>2 TO</th><th>3 TO</th></tr></thead><tbody>" + [[1, 4], [2, 3], [3, 2], [4, 1]].map(function (x) { return "<tr><td>" + ["", "1st", "2nd", "3rd", "4th"][x[0]] + " down (" + x[1] + " kneel" + (x[1] === 1 ? "" : "s") + ")</td>" + [0, 1, 2, 3].map(function (t) { return "<td style='text-align:left;background:#c8e6c9!important;font-weight:400'>" + mm(x[1] * 42 - Math.min(t, x[1]) * 40) + "</td>" }).join("") + "</tr>" }).join("") + "</tbody></table>";
    // their kicking game from the full-game file
    var K = full.rows.filter(function (r) { return r.odk === "K" }), pt = function (re) { return K.filter(function (r) { return re.test(r.ptRaw || "") }) };
    var ko = pt(/^KO$/), tb = ko.filter(function (r) { return /TOUCHBACK/.test(r.res) }).length, pu = pt(/^PUNT$/), fg = pt(/^FG$/), on = pt(/ONSIDE/), fgGood = fg.filter(function (r) { return /GOOD/.test(r.res) });
    var their4 = full.rows.filter(function (r) { return r.odk === "O" && r.dn === 4 && (r.type === "Run" || r.type === "Pass") }).length;
    var kick = "<table class='skt wrap'><thead><tr><th style='width:140px'>ITEM</th><th>WHAT TO EXPECT</th></tr></thead><tbody>" +
      "<tr><td style='font-weight:700'>Kickoff</td><td>" + (ko.length ? "Touchback " + P(tb, ko.length) + " (" + ko.length + " kicks tagged)." : "No kickoffs tagged.") + "</td></tr>" +
      "<tr><td style='font-weight:700'>Punt</td><td>" + pu.length + " punts tagged. " + (pu.filter(function (r) { return /DOWNED|FAIR/.test(r.res) }).length ? pu.filter(function (r) { return /DOWNED|FAIR/.test(r.res) }).length + " downed or fair caught." : "") + "</td></tr>" +
      "<tr><td style='font-weight:700'>FG / 4th down</td><td>" + fgGood.length + " of " + fg.length + " FGs" + (fgGood.length ? ", longest " + Math.max.apply(null, fgGood.map(function (r) { return r.yl > 0 ? r.yl + 17 : 0 })) + " yds" : "") + "; " + their4 + " 4th-down tries vs " + pu.length + " punts.</td></tr>" +
      "<tr><td style='font-weight:700'>Onside</td><td>" + on.length + " onside kick" + (on.length === 1 ? "" : "s") + " tagged." + (on.length ? " Hands team ready late." : "") + "</td></tr></tbody></table>";
    S.push({ title: "Game management card", zoom: .84, blocks: [h2("4th down (our offense)") + g4 + note("Dark = clear call, light = close call. O = our side, X = their side. Built from our conversion rates by distance (shrunk toward a high-school baseline), field-goal odds by kick length and a " + net + "-yard net punt."),
      h2("2-point (our lead after TD, before the try)") + twoT + note("2 = go for two, 1 = kick, = = no difference. PAT " + Math.round(pat * 100) + "%, 2-pt " + Math.round(two * 100) + "%."), h2("Win % by score and possessions left (" + ab + " ball next)") + wpT + note("From our drive scoring rate (" + Math.round(us.td * 100) + "% TD) and " + esc(team) + "'s offense (" + Math.round(themD.td * 100) + "% TD), ties go to overtime at 50%."),
      h2("Kneel-down chart (clock running; max game clock we can kneel out)") + kn, h2("Their kicking game") + kick] });
    return S;
  }

  // ---------------------------------------------------------------- pages
  // sections → letter pages. Blocks that don't fit move to the next page; long row lists split with their header repeated.
  function paginate(sections, host, opt) {
    opt = opt || {}; host.innerHTML = ""; if (!document.getElementById("skcss")) { var st = document.createElement("style"); st.id = "skcss"; st.textContent = CSS; document.head.appendChild(st) }
    var pageNo = 0, date = opt.date || new Date().toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "2-digit" }).replace(/,/g, "");
    var gl = opt.gamesLabel || "Games Selected:", glist = (opt.gameNames || []).map(function (n, i) { return (i + 1) + ". " + esc(n) });
    function newPage(sec, k) {
      pageNo++; var pg = document.createElement("div"); pg.className = "skpage";
      pg.innerHTML = "<div class='skhead'>" + (opt.logo ? "<img src='" + opt.logo + "' alt=''>" : "<div class='lg'>" + esc(opt.mark || "") + "</div>") + "<div class='rp'>Report:</div><div><div class='tt'>" + esc(sec.title) + "</div><div class='st'>" + esc(opt.subtitle || "") + " &nbsp;|&nbsp; " + esc(opt.code || "SS") + " #" + ("0" + k).slice(-2) + "</div></div></div>" +
        "<div class='skbody'><div class='skmeta'><span>Page " + pageNo + "</span><span>" + esc(opt.metaRight || date) + "</span></div>" + (glist.length ? "<div class='skgames'><b>" + gl + "</b><div class='gl' style='grid-template-columns:repeat(" + Math.max(4, Math.ceil(glist.length / 2)) + ",auto);grid-template-rows:repeat(2,auto);grid-auto-flow:column;justify-content:space-between'>" + glist.map(function (g) { return "<span>" + g + "</span>" }).join("") + "</div>" + (opt.extraMeta || "") + "</div>" : (opt.extraMeta ? "<div class='skgames'>" + opt.extraMeta + "</div>" : "")) + "<div class='skc'></div></div>" +
        "<div class='skfoot'>" + esc(opt.foot || EFFDEF) + (opt.legend === false ? "" : LEG) + "</div>";
      host.appendChild(pg); return pg;
    }
    function colsOrder(a) { var rows = 2, cols = Math.ceil(a.length / rows), out = []; for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) { var i = c * rows + r; out.push(a[i] || "") } return out }
    sections.forEach(function (sec, si) {
      var pg = newPage(sec, si + 1), body = pg.querySelector(".skbody"), box = pg.querySelector(".skc"); if (sec.zoom) box.style.zoom = sec.zoom;
      var room = function () { return body.clientHeight - box.offsetTop - box.offsetHeight * (sec.zoom || 1) };
      var add = function (html) { var w = document.createElement("div"); w.className = "skblk"; w.innerHTML = html; box.appendChild(w); return w };
      sec.blocks.forEach(function (b) {
        if (typeof b === "string") {
          var w = add(b); if (room() < 0 && box.children.length > 1) { box.removeChild(w); pg = newPage(sec, si + 1); body = pg.querySelector(".skbody"); box = pg.querySelector(".skc"); add(b) }
          return;
        }
        // row list: fill page by page, two columns side by side when b.split
        var rows = b.rows.slice(), first = true, pre = typeof b.title === "string" ? b.title : "";
        while (rows.length) {
          var w = document.createElement("div"); w.className = "skblk"; box.appendChild(w);
          var take = function (n) { var L = rows.slice(0, n); return b.split ? "<div class='sk2' style='gap:0 14px'><div><table class='" + b.cls + "' style='" + (b.style || "") + "'>" + b.head + "<tbody>" + L.slice(0, Math.ceil(n / 2)).join("") + "</tbody></table></div><div><table class='" + b.cls + "' style='" + (b.style || "") + "'>" + b.head + "<tbody>" + L.slice(Math.ceil(n / 2)).join("") + "</tbody></table></div></div>" : "<table class='" + b.cls + "' style='" + (b.style || "") + "'>" + b.head + "<tbody>" + L.join("") + "</tbody></table>" };
          var lo = 0, hi = rows.length, best = 0;
          while (lo <= hi) { var mid = (lo + hi) >> 1; w.innerHTML = (first ? pre : "") + take(mid); if (room() >= 0) { best = mid; lo = mid + 1 } else hi = mid - 1 }
          if (best === 0) { box.removeChild(w); pg = newPage(sec, si + 1); body = pg.querySelector(".skbody"); box = pg.querySelector(".skc"); continue }
          w.innerHTML = (first ? pre : "") + take(best); rows = rows.slice(best); first = false;
          if (rows.length) { pg = newPage(sec, si + 1); body = pg.querySelector(".skbody"); box = pg.querySelector(".skc") }
        }
      });
    });
    return pageNo;
  }
  // a heading glued to a row list: [h2 html, list] → list with a title
  function fixBlocks(S) { S.forEach(function (s) { s.blocks = s.blocks.map(function (b) { if (typeof b === "string" && b.indexOf("{\"") === 0) return b; return b }) }); return S }

  G.SK = { oppScout: oppScout, gmCard: gmCard, load: load, plays: plays, selfScout: function (d, o) { var S = selfScout(d, o); S.forEach(function (s) { var out = []; s.blocks.forEach(function (b) { if (typeof b === "string" && /\[object Object\]$/.test(b)) return; out.push(b) }); s.blocks = out }); return S }, paginate: paginate, eff: eff, expl: expl, stat: stat, drives: drives, CSS: CSS };
})(typeof window !== "undefined" ? window : globalThis);
