// Draws a play card from tracking output. Anything the tracker isn't sure of shows as a dash.
window.drawPlayCard = function (canvas, out, card, title) {
  var ROLE = { WR: "#3b86e8", Slot: "#1fa97a", TE: "#e8622c", RB: "#c678dd" }, ORDER = ["WR", "TE", "Slot", "RB"];
  var S = 2, PAD = 34, TOP = 112, TBL = 620, cw = card.w, ch = card.h, W = PAD * 2 + cw + 44 + TBL, H = Math.max(TOP + ch + 66, 880);
  canvas.width = W * S; canvas.height = H * S; 
  var c = canvas.getContext("2d"); c.setTransform(S, 0, 0, S, 0, 0);
  var font = function (w, z) { c.font = w + " " + z + "px system-ui, -apple-system, 'Segoe UI', Arial, sans-serif" };
  var text = function (t, x, y, col, w, z, al) { font(w, z); c.fillStyle = col; c.textAlign = al || "left"; c.fillText(t, x, y) };
  var label = function (t, x, y, col) { font("700", 15); var m = c.measureText(t).width; c.fillStyle = "rgba(20,20,20,.82)"; c.fillRect(x - 5, y - 16, m + 10, 22); c.fillStyle = col; c.textAlign = "left"; c.fillText(t, x, y) };
  var dash = function (v, u) { return v == null ? "–" : v + (u || "") };
  c.fillStyle = "#1a1a1a"; c.fillRect(0, 0, W, H);
  text(title, PAD, 50, "#f2f2f2", "700", 30);
  text("Offense attacks up the page. Solid = receivers, dashed = their defenders (x = defender at the snap).", PAD, 80, "#b5b5b5", "400", 16);
  var finish = function () {
    var X0 = PAD, Y0 = TOP, k0 = out.snapK != null ? out.snapK : out.preK;
    var P = function (f) { var d = card.dir * f[0] - card.los; return [X0 + (card.dir > 0 ? f[1] - card.y0 : card.y1 - f[1]) * card.s, Y0 + (card.top - d) * card.s] };
    var after = function (t) { var r = []; t.p.forEach(function (q, i) { if (q[0] >= k0 && t.f[i]) r.push(t.f[i]) }); return r };
    var nearest = function (t) { var b = null, g = 1e9; t.p.forEach(function (q, i) { var e = Math.abs(q[0] - k0); if (e < g && t.f[i]) { g = e; b = t.f[i] } }); return g <= 3 ? b : null };
    var line = function (pts, col, wid, dashes) { if (pts.length < 2) return; c.strokeStyle = col; c.lineWidth = wid; c.lineJoin = c.lineCap = "round"; c.setLineDash(dashes || []); c.beginPath(); pts.forEach(function (f, i) { var p = P(f); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]) }); c.stroke(); c.setLineDash([]) };
    var tracks = out.tracks || [], byId = {}; tracks.forEach(function (t) { byId[t.id] = t });
    var rec = tracks.filter(function (t) { return ROLE[t.role] && t.f }).sort(function (a, b) { return ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || (b.deep || 0) - (a.deep || 0) });
    var y = P([card.dir > 0 ? card.los : -card.los, 0])[1]; c.strokeStyle = "#7da7ff"; c.lineWidth = 2; c.beginPath(); c.moveTo(X0, y); c.lineTo(X0 + cw, y); c.stroke(); text("LOS", X0 + cw - 8, y - 7, "#dfe7ff", "400", 14, "right");
    c.save(); c.beginPath(); c.rect(X0, Y0, cw, ch); c.clip();     // trails stay on the field picture
    rec.forEach(function (t) {
      var d = byId[t.cover]; if (!d || !d.f) return;
      line(after(d), "#e6e6e6", 2.2, [8, 7]);
      var n = nearest(d); if (n) { var p = P(n); c.strokeStyle = "#e6e6e6"; c.lineWidth = 2.4; c.beginPath(); c.moveTo(p[0] - 6, p[1] - 6); c.lineTo(p[0] + 6, p[1] + 6); c.moveTo(p[0] + 6, p[1] - 6); c.lineTo(p[0] - 6, p[1] + 6); c.stroke() }
    });
    rec.forEach(function (t) {
      var a = after(t); if (!a.length) return; line(a, ROLE[t.role], 4.5);
      var s = P(a[0]); c.beginPath(); c.arc(s[0], s[1], 7, 0, 7); c.fillStyle = ROLE[t.role]; c.fill(); c.strokeStyle = "#111"; c.lineWidth = 2; c.stroke();
      label(t.role + (t.route ? "  (" + t.route + ")" : ""), Math.min(s[0] + 11, X0 + cw - 120), s[1] + 26, ROLE[t.role]);
    });
    c.restore();
    var tx = X0 + cw + 44, p = out.pre || {};
    text("QB RELEASE", tx, TOP + 16, "#8d8d8d", "700", 18); text("–", tx, TOP + 76, "#ffcf4d", "700", 62);
    text("Ball isn't tracked yet", tx, TOP + 104, "#b5b5b5", "400", 17);
    text("Snap read", tx + 290, TOP + 16, "#8d8d8d", "700", 18);
    text((p.splits || "–") + "   ·   " + (p.shell || "–"), tx + 290, TOP + 54, "#f0f0f0", "600", 22);
    text("about " + dash(p.box) + " in the box", tx + 290, TOP + 86, "#b5b5b5", "400", 17);
    var shown = rec.slice(0, 4), cols = shown.map(function (_, i) { return tx + 230 + i * 96 }), ty = TOP + 170;
    shown.forEach(function (t, i) { text(t.role, cols[i], ty, ROLE[t.role], "700", 17) });
    [["Route", function (t) { return dash(t.route) }], ["Deepest (yd)", function (t) { return dash(t.deep) }], ["Top speed (mph)", function (t) { return dash(t.top) }], ["Defender at snap (yd)", function (t) { return dash(t.sepSnap) }], ["Defender at release (yd)", function () { return "–" }], ["Defender at catch (yd)", function () { return "–" }]].forEach(function (r, j) {
      var yy = ty + 48 + j * 46; text(r[0], tx, yy, "#eeeeee", "600", 17); shown.forEach(function (t, i) { text(r[1](t), cols[i], yy, "#eeeeee", "400", 17) });
    });
    var L = out.oline, oy = ty + 48 + 6 * 46 + 26, sg = function (v) { return v == null ? "–" : (v > 0 ? "+" : "") + v };
    text("O-LINE", tx, oy, "#8d8d8d", "700", 18);
    text(L ? "read as " + (L.play || "–") + " from line movement" : "line not tracked cleanly on this play", tx + 84, oy, "#b5b5b5", "400", 15);
    var rows = L ? [
      ["Rushers", dash(L.rushers), "Box vs blockers", dash(L.box) + " vs " + dash(L.blockers)],
      ["Time to pressure", L.pressure != null ? L.pressure + " s" : L.watched >= 1.5 ? "none in " + L.watched + " s" : "–", "Pressure from", dash(L.gap)],
      ["Line push at 1 s (yd)", "L " + sg(L.push.left) + "   M " + sg(L.push.middle) + "   R " + sg(L.push.right), "At 2nd level", dash(L.secondLevel)],
      ["Pocket pushed back", dash(L.pocketBack, " yd"), "", ""]
    ] : [];
    if (L) { text("Each lineman's push at 1 s", tx, oy + 40 + 4 * 38, "#eeeeee", "600", 16); text(L.line.map(function (x) { return x.pos + " " + sg(x.push) }).join("     "), tx + 230, oy + 40 + 4 * 38, "#b5b5b5", "400", 15) }
    rows.forEach(function (r, i) {
      var yy = oy + 40 + i * 38; text(r[0], tx, yy, "#eeeeee", "600", 16); text(r[1], tx + 190, yy, "#ffcf4d", "600", 16);
      text(r[2], tx + 372, yy, "#eeeeee", "600", 16); text(r[3], tx + 372 + 130, yy, "#ffcf4d", "600", 16);
    });
    text("Automatic estimates from film: positions about 1 yd, speeds about 2 mph. Players can swap in piles.", PAD, H - 22, "#8d8d8d", "400", 14);
  };
  var img = new Image(); img.onload = function () { c.drawImage(img, PAD, TOP, cw, ch); finish(); if (canvas.onCardDone) canvas.onCardDone() }; img.src = "data:image/jpeg;base64," + card.bg;
};
