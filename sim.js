// Solutions pregame simulation: plays our offense against this week's opponent defense thousands of times.
// Their looks come from their Hudl defense film; our call results come from games we've charted.
// Shared by reports.html (pregame forecast) and impact.html (forecast vs what happened).
(function () {
  "use strict";
  var V = 1, DRIVES = 11;
  var BUCKETS = ["P&10", "1st", "2nd & 7+", "2nd & 3-6", "2nd & 1-2", "3rd & 7+", "3rd & 3-6", "3rd & 1-2", "4th & 1-2", "4th & 3+"];
  var BDN = { "P&10": 0, "1st": 1, "2nd & 7+": 2, "2nd & 3-6": 2, "2nd & 1-2": 2, "3rd & 7+": 3, "3rd & 3-6": 3, "3rd & 1-2": 3, "4th & 1-2": 4, "4th & 3+": 4 };
  var BDIST = { "P&10": 10, "1st": 10, "2nd & 7+": 8, "2nd & 3-6": 5, "2nd & 1-2": 2, "3rd & 7+": 9, "3rd & 3-6": 5, "3rd & 1-2": 2, "4th & 1-2": 2, "4th & 3+": 5 };
  function bucket(dn, dist) {
    if (dn == null || dn === 0) return "P&10"; if (dn === 1) return "1st";
    if (dn === 2) return dist >= 7 ? "2nd & 7+" : dist >= 3 ? "2nd & 3-6" : "2nd & 1-2";
    if (dn === 3) return dist >= 7 ? "3rd & 7+" : dist >= 3 ? "3rd & 3-6" : "3rd & 1-2";
    return dist >= 3 ? "4th & 3+" : "4th & 1-2";
  }
  function up(v) { return v == null || v === "" ? null : String(v).trim().toUpperCase() }
  function shellN(v) { v = up(v); if (!v) return null; if (/^1|MFC|ONE/.test(v)) return "1-HIGH"; if (/^2|MFO|TWO/.test(v)) return "2-HIGH"; if (/^0|ZERO/.test(v)) return "ZERO"; return v }
  function covN(v) { v = up(v); if (!v) return null; v = v.replace(/^COV(ER)?\s*/, ""); var m = /^(\d)/.exec(v); return m ? m[1] : v }
  function blzN(v) { if (v == null || v === "") return null; if (v === true || v === false) return v; v = up(v); return !/^(NO|NONE|N|-|0|FALSE)$/.test(v) }
  function concept(call) {
    if (!call) return null;
    var c = String(call).toUpperCase().replace(/\(Q\)/g, " ").replace(/\s+Q$/, "").replace(/\([^)]*\)/g, " ").replace(/^\s*[#*]?\s*\d+(\s*[*/-]\s*\d+)?\s+/, "").replace(/\s+/g, " ").trim();
    return c || null;
  }
  function need(dn) { return dn <= 1 ? 0.4 : dn === 2 ? 0.5 : 1 }
  function goLimit(y) { return y <= 10 ? 3 : y <= 59 ? 4 : y <= 64 ? 7 : y <= 89 ? 10 : 99 }
  function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v }, 0) / a.length : null }
  function shrink(m, n, prior, k) { return m == null ? prior : (m * n + prior * k) / (n + k) }
  function pct(arr, p) { if (!arr.length) return null; var a = arr.slice().sort(function (x, y) { return x - y }); return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))] }
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } }
  function pick(arr, r) { return arr[Math.floor(r() * arr.length)] }
  function wpick(pairs, r) { var t = 0; pairs.forEach(function (p) { t += p[1] }); var x = r() * t; for (var i = 0; i < pairs.length; i++) { x -= pairs[i][1]; if (x <= 0) return pairs[i][0] } return pairs.length ? pairs[pairs.length - 1][0] : null }

  // ---------- normalize the two data sources into one play shape ----------
  // opponent defense rows from the Report Builder (Hudl): {dn, dist, y (from the offense's own goal), run, gain, shell, cov, front, blitz, res, td}
  function fromHudl(rows) {
    // a blank BLITZ cell means no blitz, as long as the film has a blitz column at all
    var hasBlz = (rows || []).some(function (r) { return r && r.blitz != null && r.blitz !== "" });
    return (rows || []).filter(function (r) { return r && r.run != null && r.dn != null }).map(function (r) {
      var bz = blzN(r.blitz); if (bz == null && hasBlz) bz = false;
      return { b: bucket(r.dn, r.dist), rz: r.y != null && r.y >= 80, run: !!r.run, gain: +r.gain || 0, shell: shellN(r.shell), cov: covN(r.cov), front: up(r.front), blz: bz, to: /Interception|Fumble/i.test(r.res || ""), td: !!r.td };
    });
  }
  function toY(yl) { yl = +yl; return yl < 0 ? -yl : (yl === 50 ? 50 : 100 - yl) }
  // our charted snaps from the Solutions Chart
  function fromChart(snaps) {
    return (snaps || []).filter(function (s) { return s && s.kind !== "try" && s.res !== "Penalty" && !s.vic && s.pt && s.gain != null && s.callType !== "freeze" }).map(function (s) {
      return { b: bucket(s.dn, s.dist), rz: toY(s.yl) >= 80, run: s.pt === "Run", gain: +s.gain || 0, c: concept(s.call), call: s.call || null, dn: s.dn, dist: s.dist, y: toY(s.yl),
        shell: shellN(s.shell), cov: covN(s.cov), front: up(s.front), blz: blzN(s.blitz), to: s.res === "Interception" || s.res === "Fumble", td: !!s.td };
    });
  }
  function eff(p) { return p.td || p.gain >= Math.ceil(need(p.dn == null ? 1 : p.dn) * (p.dist || 10)) }

  // ---------- model ----------
  function build(oppRows, ourSnaps, cal) {
    var O = fromHudl(oppRows), U = fromChart(ourSnaps), M = { v: V, cal: cal && isFinite(cal.g) ? { g: cal.g, n: cal.n || 0 } : { g: 0, n: 0 }, oppN: O.length, ourN: U.length };
    var typeMean = function (A, run) { return mean(A.filter(function (p) { return p.run === run }).map(function (p) { return p.gain })) };
    // their looks by situation (empirical joint draws), red zone separately when there's enough
    M.looks = {}; BUCKETS.forEach(function (b) { M.looks[b] = O.filter(function (p) { return p.b === b && (p.shell || p.cov || p.front || p.blz != null) }) });
    M.looksRZ = O.filter(function (p) { return p.rz && (p.shell || p.cov || p.front || p.blz != null) });
    M.looksAll = O.filter(function (p) { return p.shell || p.cov || p.front || p.blz != null });
    // what they allow, by situation and run/pass, shrunk toward their overall
    var oR = typeMean(O, true), oP = typeMean(O, false), uR = typeMean(U, true), uP = typeMean(U, false);
    M.oppAll = { run: oR == null ? 4.5 : oR, pass: oP == null ? 6 : oP };
    M.usAll = { run: uR == null ? M.oppAll.run : uR, pass: uP == null ? M.oppAll.pass : uP };
    M.oppB = {}; M.usB = {};
    BUCKETS.forEach(function (b) {
      [true, false].forEach(function (run) {
        var k = run ? "run" : "pass", A = O.filter(function (p) { return p.b === b && p.run === run }), Bq = U.filter(function (p) { return p.b === b && p.run === run });
        (M.oppB[b] = M.oppB[b] || {})[k] = shrink(mean(A.map(function (p) { return p.gain })), A.length, M.oppAll[k], 10);
        (M.usB[b] = M.usB[b] || {})[k] = shrink(mean(Bq.map(function (p) { return p.gain })), Bq.length, M.usAll[k], 10);
      });
    });
    M.oppPool = {}; BUCKETS.forEach(function (b) { M.oppPool[b] = { run: O.filter(function (p) { return p.b === b && p.run }).map(function (p) { return p.gain }), pass: O.filter(function (p) { return p.b === b && !p.run }).map(function (p) { return p.gain }) } });
    M.usPool = {}; BUCKETS.forEach(function (b) { M.usPool[b] = { run: U.filter(function (p) { return p.b === b && p.run }).map(function (p) { return p.gain }), pass: U.filter(function (p) { return p.b === b && !p.run }).map(function (p) { return p.gain }) } });
    M.usPoolAll = { run: U.filter(function (p) { return p.run }).map(function (p) { return p.gain }), pass: U.filter(function (p) { return !p.run }).map(function (p) { return p.gain }) };
    M.oppPoolAll = { run: O.filter(function (p) { return p.run }).map(function (p) { return p.gain }), pass: O.filter(function (p) { return !p.run }).map(function (p) { return p.gain }) };
    var toR = function (A, run) { var Q = A.filter(function (p) { return p.run === run }); return Q.length ? Q.filter(function (p) { return p.to }).length / Q.length : null };
    M.to = { run: shrink(toR(U, true), U.filter(function (p) { return p.run }).length, 0.012, 40), pass: shrink(toR(U, false), U.filter(function (p) { return !p.run }).length, 0.03, 40) };
    M.oppTo = { run: shrink(toR(O, true), O.filter(function (p) { return p.run }).length, 0.012, 40), pass: shrink(toR(O, false), O.filter(function (p) { return !p.run }).length, 0.03, 40) };
    // how our yards move with their look (from our charted snaps that have the look tagged)
    M.lookAdj = { run: { shell: {}, blz: {} }, pass: { shell: {}, blz: {} } };
    [true, false].forEach(function (run) {
      var k = run ? "run" : "pass", A = U.filter(function (p) { return p.run === run }), base = M.usAll[k];
      ["shell", "blz"].forEach(function (f) {
        var g = {}; A.forEach(function (p) { if (p[f] == null) return; (g[p[f]] = g[p[f]] || []).push(p.gain) });
        Object.keys(g).forEach(function (v) { var m = mean(g[v]); M.lookAdj[k][f][v] = (m - base) * g[v].length / (g[v].length + 8) });
      });
    });
    // our concepts
    M.concepts = {}; M.freqB = {}; M.freqAll = {};
    U.forEach(function (p) {
      if (!p.c) return;
      var c = M.concepts[p.c] = M.concepts[p.c] || { c: p.c, run: 0, n: 0, gains: [], effs: 0, byB: {} };
      c.n++; if (p.run) c.run++; c.gains.push(p.gain); if (eff(p)) c.effs++;
      var bb = c.byB[p.b] = c.byB[p.b] || { n: 0, gains: [], effs: 0 }; bb.n++; bb.gains.push(p.gain); if (eff(p)) bb.effs++;
      (M.freqB[p.b] = M.freqB[p.b] || {})[p.c] = (M.freqB[p.b][p.c] || 0) + 1; M.freqAll[p.c] = (M.freqAll[p.c] || 0) + 1;
    });
    Object.keys(M.concepts).forEach(function (k) { var c = M.concepts[k]; c.isRun = c.run / c.n >= 0.5 });
    M.runShareB = {}; BUCKETS.forEach(function (b) { var A = U.filter(function (p) { return p.b === b }), Bo = O.filter(function (p) { return p.b === b }); M.runShareB[b] = A.length >= 4 ? A.filter(function (p) { return p.run }).length / A.length : (Bo.length ? Bo.filter(function (p) { return p.run }).length / Bo.length : 0.55) });
    // drive starts from our charted games
    var st = {}; (ourSnaps || []).forEach(function (s) { if (s && s.kind !== "try" && s.series != null && st[s.gid + "|" + s.series] == null) st[s.gid + "|" + s.series] = toY(s.yl) });
    M.starts = Object.keys(st).map(function (k) { return st[k] }).filter(function (y) { return y >= 1 && y <= 99 });
    if (M.starts.length < 5) M.starts = M.starts.concat([25, 30, 30, 35, 20, 28, 32, 40]);
    // best calls for each situation against their look mix
    M.best = {}; BUCKETS.forEach(function (b) { M.best[b] = rankCalls(M, b) });
    return M;
  }
  function expLookAdj(M, b, run) {
    var L = M.looks[b].length >= 6 ? M.looks[b] : M.looksAll, k = run ? "run" : "pass"; if (!L.length) return 0;
    var t = 0; L.forEach(function (l) { t += (l.shell != null && M.lookAdj[k].shell[l.shell] || 0) + (l.blz != null && M.lookAdj[k].blz[l.blz] || 0) }); return t / L.length;
  }
  function oppAdj(M, b, run) { var k = run ? "run" : "pass"; return 0.5 * (M.oppB[b][k] - M.usB[b][k]) + 0.5 * (M.oppAll[k] - M.usAll[k]) }
  function rankCalls(M, b) {
    var out = [];
    Object.keys(M.concepts).forEach(function (k) {
      var c = M.concepts[k]; if (c.n < 5) return;
      var bb = c.byB[b] || { n: 0, gains: [], effs: 0 }, adj = oppAdj(M, b, c.isRun) + expLookAdj(M, b, c.isRun);
      // what it takes to succeed here, applied to everything this play has gained for us
      var needY = Math.ceil(need(BDN[b]) * BDIST[b]), prior = c.gains.filter(function (g0) { return g0 + adj >= needY }).length / c.gains.length;
      var e = shrink(bb.n ? bb.effs / bb.n : null, bb.n, prior, 10);
      var g = shrink(shrink(mean(bb.gains), bb.n, mean(c.gains), 5), c.n, M.usAll[c.isRun ? "run" : "pass"], 15) + adj;
      out.push({ c: k, eff: e, ypp: g, n: c.n, nb: bb.n, run: c.isRun, score: e + 0.02 * g });
    });
    out.sort(function (a, b2) { return b2.score - a.score });
    return out.slice(0, 5);
  }

  // ---------- one play, one drive, one game ----------
  function drawLook(M, b, rz, r) { var L = rz && M.looksRZ.length >= 8 ? M.looksRZ : (M.looks[b].length >= 4 ? M.looks[b] : M.looksAll); return L.length ? pick(L, r) : {} }
  function callTend(M, b, r) {
    var f = M.freqB[b], pairs = f ? Object.keys(f).map(function (k) { return [k, f[k]] }) : [];
    if (pairs.length < 2) pairs = pairs.concat(Object.keys(M.freqAll).map(function (k) { return [k, M.freqAll[k] * 0.3] }));
    if (!pairs.length) return r() < M.runShareB[b] ? "#RUN" : "#PASS";
    return wpick(pairs, r);
  }
  function callBest(M, b, r) {
    var L = M.best[b]; if (!L || !L.length) return callTend(M, b, r);
    var x = r(); return L[x < 0.45 || L.length < 2 ? 0 : x < 0.75 || L.length < 3 ? 1 : 2].c;
  }
  function play(M, c, b, look, r) {
    var cc = c && c.charAt(0) !== "#" ? M.concepts[c] : null, run = cc ? cc.isRun : c === "#RUN", k = run ? "run" : "pass", pool;
    // a play's own history counts in proportion to how often we've run it; the rest comes from all our plays of that type
    // (keeps a few lucky gains from making one call look unbeatable)
    if (cc && r() < cc.n / (cc.n + 15)) { var bb = cc.byB[b]; pool = bb && bb.gains.length >= 4 ? bb.gains : cc.gains }
    if (!pool || !pool.length) pool = M.usPool[b][k].length >= 5 ? M.usPool[b][k] : M.usPoolAll[k];
    if (!pool || !pool.length) pool = M.oppPool[b][k].length >= 5 ? M.oppPool[b][k] : M.oppPoolAll[k];
    if (!pool || !pool.length) pool = run ? [3, 4, 5, 2, 0, 8, -1] : [0, 0, 8, 12, 6, -5, 20];
    var g = pick(pool, r) + oppAdj(M, b, run) + (look.shell != null && M.lookAdj[k].shell[look.shell] || 0) + (look.blz != null && M.lookAdj[k].blz[look.blz] || 0) + M.cal.g;
    g = Math.round(g + (r() - 0.5));
    var to = r() < (M.to[k] + M.oppTo[k]) / 2;
    return { g: g, run: run, to: to };
  }
  function drive(M, pol, r, acc) {
    var y = pick(M.starts, r), dn = 0, dist = 10, n = 0;
    while (n < 25) {
      var b = bucket(dn, dist);
      if (dn === 4) {
        if (dist > goLimit(y)) { if (y >= 75) { acc.fga++; if (r() < 0.72) { acc.fg++; return 3 } return 0 } acc.punt++; return 0 }
        acc.go4++;
      }
      var look = drawLook(M, b, y >= 80, r), c = pol(M, b, r), p = play(M, c, b, look, r), ndn = dn === 0 ? 1 : dn, ok;
      n++; acc.pl++; if (p.run) acc.ru++;
      if (p.to) { acc.to++; if (dn === 3) acc.a3++; return 0 }
      var gain = Math.max(-15, Math.min(100 - y, p.g)); acc.yd += gain;
      ok = y + gain >= 100 || gain >= Math.ceil(need(ndn) * dist); if (ok) acc.ef++;
      if ((p.run && gain >= 10) || (!p.run && gain >= 15)) acc.ex++;
      if (dn === 3) { acc.a3++; if (y + gain >= 100 || gain >= dist) acc.c3++ }
      if (dn === 4 && (y + gain >= 100 || gain >= dist)) acc.c4++;
      y += gain;
      if (y >= 100) { acc.td++; return r() < 0.9 ? 7 : 6 }
      if (y <= 0) return -2;
      if (gain >= dist) { dn = 1; dist = Math.min(10, 100 - y) }
      else { dn = ndn + 1; dist -= gain; if (dn > 4) return 0 }
    }
    return 0;
  }
  function run(M, which, nGames, seed) {
    var r = rng(seed || 12345), pol = which === "best" ? callBest : callTend, G = [];
    for (var i = 0; i < nGames; i++) {
      var acc = { pl: 0, ru: 0, yd: 0, ef: 0, ex: 0, a3: 0, c3: 0, to: 0, td: 0, fg: 0, fga: 0, punt: 0, go4: 0, c4: 0, pts: 0, dr: DRIVES, tdd: 0 };
      for (var d = 0; d < DRIVES; d++) { var p = drive(M, pol, r, acc); acc.pts += p; if (p >= 6) acc.tdd++ }
      G.push(acc);
    }
    var col = function (f) { return G.map(f) }, band = function (a) { return { m: Math.round(10 * mean(a)) / 10, lo: Math.round(10 * pct(a, 0.1)) / 10, mid: Math.round(10 * pct(a, 0.5)) / 10, hi: Math.round(10 * pct(a, 0.9)) / 10 } };
    return {
      n: nGames, drives: DRIVES,
      pts: band(col(function (g) { return g.pts })), ppd: band(col(function (g) { return g.pts / g.dr })),
      ypp: band(col(function (g) { return g.pl ? g.yd / g.pl : 0 })), eff: band(col(function (g) { return g.pl ? 100 * g.ef / g.pl : 0 })),
      third: band(col(function (g) { return g.a3 ? 100 * g.c3 / g.a3 : 0 })), expl: band(col(function (g) { return g.ex })), to: band(col(function (g) { return g.to })),
      tdDrive: band(col(function (g) { return 100 * g.tdd / g.dr })), plays: band(col(function (g) { return g.pl })), runPct: band(col(function (g) { return g.pl ? 100 * g.ru / g.pl : 0 }))
    };
  }
  // what their defense will most likely show, by situation
  function lookTable(M) {
    var out = {};
    BUCKETS.concat(["Red zone"]).forEach(function (b) {
      var L = b === "Red zone" ? M.looksRZ : M.looks[b]; if (!L.length) return;
      var top = function (f) { var m = {}, n = 0; L.forEach(function (p) { var v = p[f]; if (v == null) return; m[v] = (m[v] || 0) + 1; n++ }); var ks = Object.keys(m).sort(function (a, c) { return m[c] - m[a] }); return n ? { v: ks[0], p: Math.round(100 * m[ks[0]] / n), n: n, v2: ks[1] || null } : null };
      var bz = L.filter(function (p) { return p.blz != null }); out[b] = { n: L.length, shell: top("shell"), cov: top("cov"), front: top("front"), blitz: bz.length ? Math.round(100 * bz.filter(function (p) { return p.blz }).length / bz.length) : null, bn: bz.length };
    });
    return out;
  }
  function forecast(oppRows, ourSnaps, cal, nGames) {
    var M = build(oppRows, ourSnaps, cal), n = nGames || 1500;
    var best = {}; BUCKETS.forEach(function (b) { best[b] = (M.best[b] || []).slice(0, 3).map(function (x) { return { c: x.c, eff: Math.round(100 * x.eff), ypp: Math.round(10 * x.ypp) / 10, n: x.n, nb: x.nb, run: x.run } }) });
    return { v: V, at: Date.now(), oppPlays: M.oppN, ourPlays: M.ourN, cal: M.cal, tend: run(M, "tend", n, 777), best: run(M, "best", n, 777), looks: lookTable(M), bestCalls: best };
  }
  window.SolSim = { forecast: forecast, bucket: bucket, concept: concept, BUCKETS: BUCKETS, shellN: shellN, covN: covN, blzN: blzN, fromChart: fromChart, eff: eff, toY: toY, goLimit: goLimit };
})();
