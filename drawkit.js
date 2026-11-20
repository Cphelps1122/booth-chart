/* Play drawings reader: this week's run and pass drawings (PDF, or PowerPoint .pptx from Google Slides) → plays the mock game can run.
   SolDraw.read(file) → Promise of pages: { n, title, shapes[], picture, w, h }
     shape: { k: "circle" | "square" | "tri" | "text" | "line", x, y (center, page units, y down), w, h, t (text), pts [[x,y]...] (lines) }
   SolDraw.play(page) → { name, o[11] {x,y} yards from the ball (y up = downfield), p[11] paths (yards, relative to that player), d[] {x,y,lab}, run?, issues[] }
   One play per page / slide. Lines and shapes drawn in the file are read; a pasted picture of a play can't be. */
(function () {
  "use strict";
  var OLS = 2.1; // yards between linemen, same as the mock game

  // ---------- zip (pptx) ----------
  function unzip(buf, want) {
    var u = new Uint8Array(buf), dv = new DataView(buf), td = new TextDecoder(), e = u.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--; if (e < 0) return Promise.reject(new Error("zip"));
    var n = dv.getUint16(e + 10, true), off = dv.getUint32(e + 16, true), out = {}, jobs = [];
    for (var i = 0; i < n; i++) {
      var meth = dv.getUint16(off + 10, true), csz = dv.getUint32(off + 20, true), nl = dv.getUint16(off + 28, true), xl = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), lo = dv.getUint32(off + 42, true);
      var name = td.decode(u.subarray(off + 46, off + 46 + nl)); off += 46 + nl + xl + cl;
      if (!want.test(name)) continue;
      (function (name, meth, csz, lo) {
        var ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), data = u.slice(ds, ds + csz);
        var p = meth === 0 ? Promise.resolve(data) : new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer().then(function (b) { return new Uint8Array(b) });
        jobs.push(p.then(function (d) { out[name] = td.decode(d) }));
      })(name, meth, csz, lo);
    }
    return Promise.all(jobs).then(function () { return out });
  }

  // ---------- PowerPoint ----------
  var EMU = 12700; // to points
  function kids(el, name) { var o = []; for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === name) o.push(c); return o }
  function kid(el, name) { return el ? kids(el, name)[0] || null : null }
  function deep(el, name) { return el ? el.getElementsByTagNameNS("*", name) : [] }
  function readPptx(buf) {
    return unzip(buf, /^ppt\/(slides\/slide\d+\.xml|presentation\.xml|_rels\/presentation\.xml\.rels)$/).then(function (z) {
      var P = new DOMParser(), size = { w: 960, h: 540 }, order = [];
      if (z["ppt/presentation.xml"]) {
        var pr = P.parseFromString(z["ppt/presentation.xml"], "application/xml"), sz = deep(pr, "sldSz")[0]; if (sz) size = { w: +sz.getAttribute("cx") / EMU, h: +sz.getAttribute("cy") / EMU };
        var rels = {}; if (z["ppt/_rels/presentation.xml.rels"]) Array.prototype.forEach.call(deep(P.parseFromString(z["ppt/_rels/presentation.xml.rels"], "application/xml"), "Relationship"), function (r) { rels[r.getAttribute("Id")] = r.getAttribute("Target") });
        Array.prototype.forEach.call(deep(pr, "sldId"), function (s) { var id = s.getAttribute("r:id") || s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"), t = rels[id]; if (t) order.push("ppt/" + t.replace(/^\/?ppt\//, "").replace(/^\.\.\//, "")) });
      }
      var names = order.filter(function (k) { return z[k] }); if (!names.length) names = Object.keys(z).filter(function (k) { return /slides\/slide\d+\.xml$/.test(k) }).sort(function (a, b) { return +a.match(/(\d+)\.xml/)[1] - +b.match(/(\d+)\.xml/)[1] });
      return names.map(function (k, i) { return slide(P.parseFromString(z[k], "application/xml"), i + 1, size) });
    });
  }
  function slide(doc, n, size) {
    var out = { n: n, w: size.w, h: size.h, shapes: [], picture: false, titles: [] };
    var tree = deep(doc, "spTree")[0]; if (tree) walk(tree, [1, 0, 1, 0], out);
    return finish(out);
  }
  // group transform: x' = a*x + b, y' = c*y + d (points)
  function walk(el, T, out) {
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
      var nm = c.localName;
      if (nm === "grpSp") {
        var gx = kid(kid(c, "grpSpPr"), "xfrm"); if (!gx) { walk(c, T, out); continue }
        var o = kid(gx, "off"), e = kid(gx, "ext"), co = kid(gx, "chOff"), ce = kid(gx, "chExt");
        var sx = ce && +ce.getAttribute("cx") ? +e.getAttribute("cx") / +ce.getAttribute("cx") : 1, sy = ce && +ce.getAttribute("cy") ? +e.getAttribute("cy") / +ce.getAttribute("cy") : 1;
        var bx = (+o.getAttribute("x") - (co ? +co.getAttribute("x") : 0) * sx) / EMU, by = (+o.getAttribute("y") - (co ? +co.getAttribute("y") : 0) * sy) / EMU;
        walk(c, [T[0] * sx, T[0] * bx + T[1], T[2] * sy, T[2] * by + T[3]], out);
      } else if (nm === "sp" || nm === "cxnSp") shape(c, T, out);
      else if (nm === "pic" || nm === "graphicFrame") { var px = kid(kid(c, nm === "pic" ? "spPr" : "xfrm"), "xfrm") || kid(c, "xfrm"); out.picture = true }
    }
  }
  function shape(c, T, out) {
    var spPr = kid(c, "spPr"), x = kid(spPr, "xfrm"), txt = Array.prototype.map.call(deep(c, "t"), function (t) { return t.textContent }).join("").trim();
    var ph = deep(c, "ph")[0], isTitle = ph && /title|ctrTitle/.test(ph.getAttribute("type") || "");
    if (!x) { if (txt && isTitle) out.titles.push({ t: txt, big: 1 }); return }
    var o = kid(x, "off"), e = kid(x, "ext"), fh = x.getAttribute("flipH") === "1", fv = x.getAttribute("flipV") === "1";
    var X0 = +o.getAttribute("x") / EMU, Y0 = +o.getAttribute("y") / EMU, W = +e.getAttribute("cx") / EMU, H = +e.getAttribute("cy") / EMU;
    var tx = function (px, py) { return [T[0] * px + T[1], T[2] * py + T[3]] };
    var a = tx(X0, Y0), b = tx(X0 + W, Y0 + H), cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
    var geom = kid(spPr, "prstGeom"), prst = geom ? geom.getAttribute("prst") : null, cust = kid(spPr, "custGeom");
    var ln = kid(spPr, "ln"), noLine = ln && kid(ln, "noFill"), fill = kid(spPr, "solidFill") || kid(spPr, "noFill") === null && kid(spPr, "solidFill");
    if (c.localName === "cxnSp" || /^(line|straightConnector1|bentConnector\d|curvedConnector\d)$/.test(prst || "")) {
      var p0 = [fh ? b[0] : a[0], fv ? b[1] : a[1]], p1 = [fh ? a[0] : b[0], fv ? a[1] : b[1]];
      out.shapes.push({ k: "line", pts: [p0, p1], x: cx, y: cy, w: w, h: h }); return;
    }
    if (cust) {
      var pts = [];
      Array.prototype.forEach.call(deep(cust, "path"), function (pa) {
        var pw = +pa.getAttribute("w") || W * EMU, phh = +pa.getAttribute("h") || H * EMU;
        Array.prototype.forEach.call(pa.children, function (cmd) {
          var P = deep(cmd, "pt"), last = P[P.length - 1]; if (!last) return;
          var lx = +last.getAttribute("x") / pw, ly = +last.getAttribute("y") / phh; if (fh) lx = 1 - lx; if (fv) ly = 1 - ly;
          pts.push(tx(X0 + lx * W, Y0 + ly * H));
        });
      });
      var closed = deep(cust, "close").length > 0;
      if (pts.length >= 2 && !closed) { out.shapes.push({ k: "line", pts: pts, x: cx, y: cy, w: w, h: h }); return }
      if (pts.length >= 3) { out.shapes.push({ k: pts.length <= 4 ? "tri" : "circle", x: cx, y: cy, w: w, h: h, t: txt }); return }
    }
    // a text box (or a shape with no outline and no fill) holding a letter or two is a label: a defender like E, T, M, $
    var nv = deep(c, "cNvSpPr")[0], txBox = nv && nv.getAttribute("txBox") === "1", outlined = (ln && !noLine) || !!kid(c, "style"), filled = !!kid(spPr, "solidFill") || !!kid(spPr, "gradFill");
    if (txt && txt.length <= 3 && (txBox || (!outlined && !filled))) { out.shapes.push({ k: "text", t: txt, x: cx, y: cy, w: w, h: h }); return }
    var k = /ellipse|flowChartConnector|donut/.test(prst || "") ? "circle" : /^(rect|roundRect|flowChartProcess|snip|square)/.test(prst || "") ? "square" : /triangle|flowChartMerge|flowChartExtract/.test(prst || "") ? "tri" : null;
    if (txt && (isTitle || !k || (w > 4 * h && txt.length > 3))) { if (isTitle || txt.length > 3) out.titles.push({ t: txt, big: isTitle ? 1 : 0, y: cy, size: h }); else out.shapes.push({ k: "text", t: txt, x: cx, y: cy, w: w, h: h }); return }
    if (k) out.shapes.push({ k: k, x: cx, y: cy, w: w, h: h, t: txt });
  }

  // ---------- PDF ----------
  var PDFJS = null, ME = (document.currentScript && document.currentScript.src) || "";
  function pdfLib() {
    if (PDFJS) return PDFJS;
    var base = ME || (function () { var s = document.querySelector("script[src*='drawkit.js']"); return s ? s.src : location.href })();
    var dir = base.replace(/[^/]*$/, "") + "lib/pdfjs/";
    PDFJS = import(dir + "pdf.min.mjs").then(function (m) { m.GlobalWorkerOptions.workerSrc = dir + "pdf.worker.min.mjs"; return m });
    return PDFJS;
  }
  function readPdf(buf) {
    return pdfLib().then(function (lib) {
      return lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise.then(function (doc) {
        var jobs = []; for (var i = 1; i <= doc.numPages; i++) jobs.push(doc.getPage(i).then(function (pg) { return pdfPage(lib, pg) }));
        return Promise.all(jobs);
      });
    });
  }
  function mul(m, n) { return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]] }
  function ap(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] }
  function pdfPage(lib, pg) {
    var vp = pg.getViewport({ scale: 1 }), OPS = lib.OPS, out = { n: pg.pageNumber, w: vp.width, h: vp.height, shapes: [], picture: false, titles: [] };
    return Promise.all([pg.getOperatorList(), pg.getTextContent()]).then(function (r) {
      var ol = r[0], ctm = vp.transform.slice(), stack = [], pending = [];
      var emit = function (stroke, fill) { pending.forEach(function (sub) { sub.stroke = stroke; sub.fill = fill; pathShape(sub, out) }); pending = [] };
      for (var i = 0; i < ol.fnArray.length; i++) {
        var fn = ol.fnArray[i], a = ol.argsArray[i];
        if (fn === OPS.save) stack.push(ctm.slice());
        else if (fn === OPS.restore) { ctm = stack.pop() || ctm }
        else if (fn === OPS.transform) ctm = mul(ctm, a);
        else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm.slice()); if (a && a[0]) ctm = mul(ctm, a[0]) }
        else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
        else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) { var c0 = ap(ctm, 0, 0), c1 = ap(ctm, 1, 1); if (Math.abs(c1[0] - c0[0]) * Math.abs(c1[1] - c0[1]) > vp.width * vp.height * 0.15) out.picture = true }
        else if (fn === OPS.constructPath) pending = pending.concat(subpaths(a, ctm, OPS));
        else if (fn === OPS.stroke || fn === OPS.closeStroke) emit(true, false);
        else if (fn === OPS.fill || fn === OPS.eoFill) emit(false, true);
        else if (fn === OPS.fillStroke || fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke) emit(true, true);
        else if (fn === OPS.endPath) pending = [];
      }
      // text: join pieces on one line
      var items = r[1].items.filter(function (it) { return it.str && it.str.trim() }).map(function (it) { var m = mul(vp.transform, it.transform), fs = Math.hypot(m[2], m[3]); return { t: it.str, x: m[4], y: m[5], w: it.width, fs: fs } });
      items.sort(function (p, q) { return p.y - q.y || p.x - q.x });
      var lines = []; items.forEach(function (it) { var L = lines[lines.length - 1]; if (L && Math.abs(L.y - it.y) < it.fs * 0.4 && it.x - (L.x1) < it.fs * 1.2) { L.t += (it.x - L.x1 > it.fs * 0.15 ? " " : "") + it.t; L.x1 = it.x + it.w } else lines.push({ t: it.t, x: it.x, x1: it.x + it.w, y: it.y, fs: it.fs }) });
      lines.forEach(function (L) { var t = L.t.trim(); if (t.length <= 3 && !/\s/.test(t)) out.shapes.push({ k: "text", t: t, x: (L.x + L.x1) / 2, y: L.y - L.fs * 0.35, w: L.x1 - L.x, h: L.fs }); else out.titles.push({ t: t, big: 0, y: L.y, size: L.fs }) });
      return finish(out);
    });
  }
  function subpaths(a, ctm, OPS) {
    var ops = a[0], c = a[1], k = 0, subs = [], cur = null;
    var add = function (x, y, curve) { var p = ap(ctm, x, y); if (!cur) { cur = { pts: [], curves: 0 }; subs.push(cur) } cur.pts.push(p); if (curve) cur.curves++ };
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op === OPS.moveTo) { cur = null; add(c[k], c[k + 1]); k += 2 }
      else if (op === OPS.lineTo) { add(c[k], c[k + 1]); k += 2 }
      else if (op === OPS.curveTo) { add(c[k + 4], c[k + 5], 1); k += 6 }
      else if (op === OPS.curveTo2 || op === OPS.curveTo3) { add(c[k + 2], c[k + 3], 1); k += 4 }
      else if (op === OPS.closePath) { if (cur) cur.closed = true }
      else if (op === OPS.rectangle) { var x = c[k], y = c[k + 1], w = c[k + 2], h = c[k + 3]; k += 4; cur = null; add(x, y); add(x + w, y); add(x + w, y + h); add(x, y + h); cur.closed = true; cur.rect = true; cur = null }
    }
    return subs;
  }
  function pathShape(s, out) {
    var P = s.pts; if (P.length < 2) return;
    var xs = P.map(function (p) { return p[0] }), ys = P.map(function (p) { return p[1] }), x0 = Math.min.apply(0, xs), x1 = Math.max.apply(0, xs), y0 = Math.min.apply(0, ys), y1 = Math.max.apply(0, ys), w = x1 - x0, h = y1 - y0;
    var closed = s.closed || (P.length > 2 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 0.5);
    if (w > out.w * 0.9 && h > out.h * 0.9) return; // page frame
    if (!closed || (!s.fill && P.length === 2)) { out.shapes.push({ k: "line", pts: P, x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: w, h: h }); return }
    var sq = Math.max(w, h) > 0 && Math.min(w, h) / Math.max(w, h) > 0.6, uniq = P.filter(function (p, i) { return i === 0 || Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) > 0.3 });
    var n = uniq.length - (Math.hypot(uniq[0][0] - uniq[uniq.length - 1][0], uniq[0][1] - uniq[uniq.length - 1][1]) < 0.5 ? 1 : 0);
    var k = s.curves >= 2 ? "circle" : n === 3 ? "tri" : n === 4 && sq ? "square" : null;
    if (k && sq) out.shapes.push({ k: k, x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: w, h: h, fill: !!s.fill });
    else if (k === "tri") out.shapes.push({ k: "tri", x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: w, h: h, fill: !!s.fill });
  }

  // ---------- tidy one page ----------
  function finish(pg) {
    // the same circle stroked and filled shows up twice
    var S = []; pg.shapes.forEach(function (s) { if (s.k !== "line" && S.some(function (q) { return q.k === s.k && Math.abs(q.x - s.x) < 1 && Math.abs(q.y - s.y) < 1 && Math.abs(q.w - s.w) < 2 })) return; S.push(s) }); pg.shapes = S;
    var T = pg.titles.filter(function (t) { return /[A-Za-z0-9]/.test(t.t) && !/^(page|slide)\s*\d+$/i.test(t.t) });
    T.sort(function (a, b) { return (b.big || 0) - (a.big || 0) || (b.size || 0) - (a.size || 0) || (a.y || 0) - (b.y || 0) });
    pg.title = T.length ? T[0].t.replace(/\s+/g, " ").trim() : "";
    pg.notes = T.slice(1).map(function (t) { return t.t });
    return pg;
  }

  // ---------- turn a page into a play ----------
  function med(a) { var b = a.slice().sort(function (x, y) { return x - y }); return b.length ? b[Math.floor(b.length / 2)] : 0 }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]) }
  function play(pg) {
    var issues = [], body = pg.shapes.filter(function (s) { return s.k === "circle" || s.k === "square" || s.k === "tri" });
    var size = med(body.filter(function (s) { return s.k !== "tri" }).map(function (s) { return Math.max(s.w, s.h) })) || 12;
    body = body.filter(function (s) { return Math.max(s.w, s.h) > size * 0.55 && Math.max(s.w, s.h) < size * 2.2 }); // drop arrowheads and big frames
    var men = body.filter(function (s) { return s.k !== "tri" }), texts = pg.shapes.filter(function (s) { return s.k === "text" && /^[A-Z$#*0-9]{1,3}$/i.test(s.t) });
    var res = { name: pg.title || "", page: pg.n, issues: issues, o: [], p: [], d: [], ok: false };
    if (pg.picture && men.length < 5) { issues.push("This page is a picture of the play, so its lines can't be read. Draw it with shapes and lines, or set it up by hand."); return res }
    // the line: five same-size men side by side
    var ol = null, best = 1e9;
    men.forEach(function (c) {
      var row = men.filter(function (m) { return Math.abs(m.y - c.y) < size * 0.4 && Math.abs(m.w - c.w) < size * 0.5 }).sort(function (a, b) { return a.x - b.x });
      for (var i = 0; i + 5 <= row.length; i++) {
        var R = row.slice(i, i + 5), gaps = [1, 2, 3, 4].map(function (j) { return R[j].x - R[j - 1].x }), g = med(gaps);
        if (gaps.some(function (q) { return q < size * 0.9 || q > size * 4 || Math.abs(q - g) > g * 0.45 })) continue;
        var ctr = R[2], score = Math.abs(ctr.x - pg.w / 2) / pg.w + (R[2].k === "square" ? -0.3 : 0);
        if (score < best) { best = score; ol = R }
      }
    });
    if (!ol) { issues.push("Couldn't find the offensive line (five players side by side)."); return res }
    var gap = med([1, 2, 3, 4].map(function (j) { return ol[j].x - ol[j - 1].x })), U = gap / OLS, ball = [ol[2].x, ol[2].y];
    // which side is the offense: more men (circles / squares) behind the line than in front of it
    var others = men.filter(function (m) { return ol.indexOf(m) < 0 }), below = others.filter(function (m) { return m.y > ball[1] + size * 0.6 }).length, above = others.filter(function (m) { return m.y < ball[1] - size * 0.6 }).length;
    var dir = below >= above ? -1 : 1; // page y → downfield: offense below the line means up the page is downfield
    var Y = function (py) { return (py - ball[1]) * dir / U - 0.9 }, X = function (px) { return (px - ball[0]) / U };
    var offSide = function (s) { return Y(s.y) < -0.3 };
    var offs = others.filter(function (m) { return offSide(m) && (m.k === "circle" || m.k === "square") && !(m.t && /^[A-Z]{1,2}$/.test(m.t) && m.k === "circle" && false) });
    // defense: letters and triangles across the ball, and circles/squares labelled with a defense letter
    var ends = []; pg.shapes.forEach(function (s) { if (s.k === "line") { ends.push(s.pts[0]); ends.push(s.pts[s.pts.length - 1]) } });
    var defs = pg.shapes.filter(function (s) { return (s.k === "text" && /^[A-Z$#]{1,3}$/i.test(s.t)) || (s.k === "tri" && Math.max(s.w, s.h) >= size * 0.6 && !ends.some(function (e) { return dist(e, [s.x, s.y]) < size * 0.6 })) || ((s.k === "circle" || s.k === "square") && s.t && /^[A-Z$#]{1,2}$/i.test(s.t) && Y(s.y) > 0) }).filter(function (s) { return Y(s.y) > -0.2 && Math.max(s.w, s.h) < size * 3 });
    // a letter sitting inside an offensive circle is that player's label, not a defender
    offs = offs.filter(function (m) { return ol.indexOf(m) < 0 });
    var qb = null, qd = 1e9; offs.forEach(function (m) { var d = Math.abs(X(m.x)) * 2 + Math.abs(Y(m.y) + 4); if (Math.abs(X(m.x)) < 2.2 && Y(m.y) < -0.6 && d < qd) { qd = d; qb = m } });
    if (!qb) { issues.push("No quarterback behind the center; put one in place."); }
    var skill = offs.filter(function (m) { return m !== qb }).sort(function (a, b) { return Math.hypot(X(a.x), Y(a.y)) - Math.hypot(X(b.x), Y(b.y)) });
    if (skill.length > 5) { issues.push(skill.length - 5 + " extra offensive player" + (skill.length > 6 ? "s" : "") + " left off."); skill = skill.slice(0, 5) }
    var rb = null, rd = -1; skill.forEach(function (m) { var dy = -Y(m.y); if (Math.abs(X(m.x)) < 5 && dy > 2.6 && dy > rd && (!qb || dy > -Y(qb.y) - 0.6)) { rd = dy; rb = m } });
    var rest = skill.filter(function (m) { return m !== rb }).sort(function (a, b) { return a.x - b.x });
    if (skill.length < 5) issues.push("Only " + (skill.length + (qb ? 1 : 0) + 5) + " offensive players found; the rest were set where they usually line up.");
    var order = ol.concat([qb]).concat(rest.slice(0, 4)); while (order.length < 10) order.push(null); order.push(rb || (rest.length > 4 ? rest[4] : null));
    var dflt = [[-4.2, -.9], [-2.1, -.9], [0, -.9], [2.1, -.9], [4.2, -.9], [0, -4.5], [-18, -1], [-9, -1.5], [9, -1.5], [18, -1], [0, -6.5]];
    res.o = order.map(function (m, i) { return m ? { x: r1(X(m.x)), y: r1(Math.min(-0.9, Y(m.y))) } : { x: dflt[i][0], y: dflt[i][1], guess: 1 } });
    // lines: join pieces end to end, then give each to the player it starts from
    var segs = pg.shapes.filter(function (s) { return s.k === "line" && s.pts.length >= 2 }).map(function (s) { return s.pts.slice() });
    var chains = [];
    segs.forEach(function (sg) { var len = 0; for (var i = 1; i < sg.length; i++) len += dist(sg[i], sg[i - 1]); if (len < size * 0.35) return; chains.push(sg) });
    var glue = size * 0.45, merged = true;
    while (merged) { merged = false; for (var i = 0; i < chains.length && !merged; i++) for (var j = 0; j < chains.length && !merged; j++) { if (i === j) continue; var A = chains[i], B = chains[j];
      if (dist(A[A.length - 1], B[0]) < glue) { chains[i] = A.concat(B.slice(1)); chains.splice(j, 1); merged = true }
      else if (dist(A[A.length - 1], B[B.length - 1]) < glue) { chains[i] = A.concat(B.slice(0, -1).reverse()); chains.splice(j, 1); merged = true } } }
    var who = order.map(function (m, i) { return m ? { m: m, i: i } : null }).filter(Boolean), used = {}, dPaths = [];
    chains.forEach(function (ch) {
      var bestI = -1, bd = size * 1.3, flip = false;
      who.forEach(function (w) { var c = [w.m.x, w.m.y], d0 = dist(ch[0], c), d1 = dist(ch[ch.length - 1], c); if (d0 < bd) { bd = d0; bestI = w.i; flip = false } if (d1 < bd) { bd = d1; bestI = w.i; flip = true } });
      if (flip) ch = ch.slice().reverse();
      if (bestI < 0) { dPaths.push(ch); return }
      if (used[bestI] && used[bestI].length >= ch.length) return; used[bestI] = ch;
    });
    res.p = order.map(function (m, i) { var ch = used[i]; if (!ch || !m) return null; var o0 = res.o[i]; return ch.map(function (q, k) { return k === 0 ? [0, 0] : [r1(X(q[0]) - o0.x), r1(Y(q[1]) - o0.y)] }) });
    var noPath = res.p.slice(5).filter(function (q, i) { return !q && i !== 0 }).length;
    if (!chains.length) issues.push("No routes or blocks drawn on this page.");
    // defense
    defs.sort(function (a, b) { return Math.hypot(X(a.x), Y(a.y)) - Math.hypot(X(b.x), Y(b.y)) });
    if (defs.length > 11) defs = defs.slice(0, 11);
    res.d = defs.map(function (s) { var near = dPaths.filter(function (ch) { return dist(ch[0], [s.x, s.y]) < size * 1.3 })[0]; return { x: r1(X(s.x)), y: r1(Math.max(0.8, Y(s.y))), lab: s.k === "text" ? String(s.t).toUpperCase().slice(0, 2) : "", blitz: !!(near && Y(near[near.length - 1][1]) < 0.5) } });
    if (res.d.length && res.d.length < 9) issues.push("Only " + res.d.length + " defenders drawn; the rest line up from their scout look.");
    if (!res.d.length) issues.push("No defense drawn; their scout look is used.");
    // run or pass from the drawing: anyone besides the line going 7+ yards downfield on a route is a pass
    var deep = res.p.some(function (q, i) { return q && i >= 6 && i <= 9 && q.length && q[q.length - 1][1] > 7 });
    res.run = !deep; res.ok = !!qb && ol.length === 5; res.noPath = noPath;
    return res;
  }
  function r1(v) { return Math.round(v * 10) / 10 }

  function read(file) {
    return file.arrayBuffer().then(function (buf) {
      var head = new Uint8Array(buf.slice(0, 5)), isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
      if (isPdf || /\.pdf$/i.test(file.name)) return readPdf(buf);
      if (/\.pptx$/i.test(file.name) || (head[0] === 0x50 && head[1] === 0x4b)) return readPptx(buf);
      throw new Error("type");
    });
  }
  window.SolDraw = { read: read, play: play, readPptx: readPptx, readPdf: readPdf };
})();
