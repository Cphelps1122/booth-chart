/* Solutions Analytics — shared clip playlist player (Impact, Stats, shared reels).
   SolPL.open({ title, items: [{ s: snap, label, look, note, url, type }] }) */
(function () {
  var css = "" +
    ".spl{position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:16px}" +
    ".spl[hidden]{display:none}" +
    ".spl-box{width:100%;max-width:1100px;background:var(--card,#fff);color:var(--ink,#111);border-radius:14px;padding:14px;border-top:4px solid var(--red,#c8102e);box-shadow:0 20px 50px rgba(0,0,0,.4)}" +
    ".spl-box h3{margin:0 0 8px;font-size:19px;letter-spacing:.04em;text-transform:uppercase}" +
    ".spl-wrap{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:12px}@media(max-width:820px){.spl-wrap{grid-template-columns:1fr}}" +
    ".spl video{width:100%;max-height:62vh;background:#000;border-radius:8px;display:block}" +
    ".spl-info{font-weight:700;margin:6px 0;font-size:15px}.spl-info small{font-weight:500;opacity:.7}" +
    ".spl-note{margin:4px 0 6px;padding:7px 10px;border-radius:8px;background:#fff7cc;color:#3b3000;font-size:14px}" +
    ".spl-list{max-height:62vh;overflow-y:auto;display:flex;flex-direction:column;gap:4px}" +
    ".spl-list button{text-align:left;font:inherit;font-size:13.5px;padding:7px 9px;border-radius:8px;border:1px solid rgba(128,128,128,.35);background:transparent;color:inherit;cursor:pointer}" +
    ".spl-list button.on{border-color:var(--red,#c8102e);font-weight:700;background:rgba(200,16,46,.12)}.spl-list button.nc{opacity:.45}" +
    ".spl-ctl,.spl-f{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}" +
    ".spl-ctl button,.spl-ctl a,.spl-ctl select{font:inherit;font-size:15px;font-weight:700;padding:7px 12px;border-radius:8px;border:1px solid rgba(128,128,128,.4);background:rgba(128,128,128,.12);color:inherit;cursor:pointer;text-decoration:none}" +
    ".spl-ctl button:disabled{opacity:.4}.spl-ctl label{display:flex;gap:6px;align-items:center;font-size:14px}" +
    ".spl-f{margin:0 0 8px}.spl-f button{font:inherit;font-size:13px;font-weight:700;padding:5px 10px;border-radius:999px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;cursor:pointer}" +
    ".spl-f button[aria-pressed=true]{background:var(--red,#c8102e);border-color:var(--red,#c8102e);color:#fff}" +
    "tr.splrow td{cursor:pointer}tr.splrow:hover td{background:rgba(200,16,46,.08)}tr.splrow td:first-child::after{content:' \\25B6';color:var(--red,#c8102e);font-size:11px}";
  function eff(s) { var need = s.dn <= 1 ? 0.4 : s.dn === 2 ? 0.5 : 1; return !!(s.td || s.gain >= Math.ceil(need * s.dist)) }
  var FILTERS = [
    ["all", "All", function () { return true }],
    ["film", "Has film", function (s, it) { return !!it.url }],
    ["big", "Big plays", function (s) { return !!s.td || (s.pt === "Run" && s.gain >= 10) || (s.pt === "Pass" && s.gain >= 15) }],
    ["neg", "Negative", function (s) { return s.gain < 0 || s.res === "Sack" || s.res === "Interception" || s.res === "Fumble" }],
    ["eff", "Efficient", function (s) { return s.gain != null && s.dist != null && eff(s) }],
    ["blitz", "vs blitz", function (s) { return !!s.blitz && s.blitz !== "No" }],
    ["h1", "vs 1-high", function (s) { return s.shell === "1-HIGH" }],
    ["h2", "vs 2-high", function (s) { return s.shell === "2-HIGH" }],
    ["h0", "vs Cover 0", function (s) { return s.shell === "ZERO" }]
  ];
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] }) };
  var P = { all: [], items: [], pos: 0, f: "all", title: "" }, el = null;
  function $(id) { return document.getElementById(id) }
  function mount() {
    if (el) return; var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    el = document.createElement("div"); el.className = "spl"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.innerHTML = "<div class='spl-box'><h3 id='splT'></h3><div class='spl-f' id='splF'></div><div class='spl-wrap'><div><video id='splV' controls playsinline></video><div class='spl-info' id='splI'></div><div id='splN'></div>" +
      "<div class='spl-ctl'><button type='button' id='splP'>◀ Previous</button><button type='button' id='splX'>Next ▶</button><label><input type='checkbox' id='splA' checked> Play all</label><label><input type='checkbox' id='splL'> Loop this play</label>" +
      "<select id='splS' aria-label='Speed'><option value='0.5'>½ speed</option><option value='1' selected>1× speed</option><option value='1.5'>1.5×</option></select><span style='flex:1'></span><a id='splD' download>Save clip</a><button type='button' id='splC'>Close</button></div></div><div class='spl-list' id='splList'></div></div></div>";
    document.body.appendChild(el);
    el.addEventListener("click", function (e) { if (e.target === el) close() });
    $("splP").onclick = function () { go(P.pos - 1) }; $("splX").onclick = function () { go(P.pos + 1) }; $("splC").onclick = close;
    $("splV").addEventListener("ended", function () { if ($("splA").checked && P.pos < P.items.length - 1) go(P.pos + 1) });
    // trimmed clips: start at the snap, stop after the whistle
    var V = $("splV");
    V.addEventListener("loadedmetadata", function () { var t = V._tr; if (t && t.a > 0) try { V.currentTime = t.a } catch (e) {} });
    V.addEventListener("timeupdate", function () {
      var t = V._tr; if (!t || V.paused) return;
      if (V.loop && t.a && V.currentTime < t.a - 0.4 && V.currentTime < 0.6) { try { V.currentTime = t.a } catch (e) {} return }
      if (t.b && V.currentTime >= t.b) { if (V.loop) { try { V.currentTime = t.a || 0 } catch (e) {} } else { V.pause(); if ($("splA").checked && P.pos < P.items.length - 1) go(P.pos + 1) } }
    });
    $("splS").onchange = function () { $("splV").playbackRate = +this.value || 1 };
    $("splL").onchange = function () { $("splV").loop = this.checked };
    document.addEventListener("keydown", function (e) { if (el.hidden) return; if (e.key === "Escape") close(); else if (e.key === "ArrowRight") go(P.pos + 1); else if (e.key === "ArrowLeft") go(P.pos - 1) });
  }
  function close() { el.hidden = true; try { $("splV").pause() } catch (e) {} }
  function filt() {
    var counts = {}; FILTERS.forEach(function (f) { counts[f[0]] = P.all.filter(function (it) { return f[2](it.s || {}, it) }).length });
    $("splF").innerHTML = P.all.length < 2 ? "" : FILTERS.filter(function (f) { return f[0] === "all" || (counts[f[0]] && counts[f[0]] < P.all.length) || f[0] === P.f }).map(function (f) { return "<button type='button' data-f='" + f[0] + "' aria-pressed='" + (P.f === f[0]) + "'>" + f[1] + " " + counts[f[0]] + "</button>" }).join("");
    $("splF").querySelectorAll("[data-f]").forEach(function (b) { b.onclick = function () { setF(b.dataset.f) } });
  }
  function setF(k) {
    P.f = k; var f = FILTERS.filter(function (x) { return x[0] === k })[0] || FILTERS[0];
    P.items = P.all.filter(function (it) { return f[2](it.s || {}, it) }); filt();
    var withF = P.items.filter(function (it) { return it.url }).length;
    $("splT").textContent = P.title + " · " + withF + " of " + P.items.length + " play" + (P.items.length === 1 ? "" : "s") + " with film";
    var first = -1; P.items.some(function (it, i) { if (it.url) { first = i; return true } return false });
    if (!P.items.length) { $("splList").innerHTML = "<p>No plays match.</p>"; $("splI").textContent = ""; $("splN").innerHTML = ""; $("splV").removeAttribute("src"); return }
    go(first < 0 ? 0 : first);
  }
  function go(i) {
    if (i < 0 || i >= P.items.length) return; P.pos = i; var it = P.items[i], v = $("splV");
    $("splI").innerHTML = esc(it.label || "") + (it.look ? "<br><small>vs " + esc(it.look) + "</small>" : "") + "<br><small>Play " + (i + 1) + " of " + P.items.length + "</small>" + (it.url ? "" : "<br><small>No film for this play.</small>");
    $("splN").innerHTML = it.note ? "<div class='spl-note'>📝 " + esc(it.note) + "</div>" : "";
    $("splP").disabled = i <= 0; $("splX").disabled = i >= P.items.length - 1;
    $("splList").innerHTML = P.items.map(function (x, k) { return "<button type='button' data-k='" + k + "' class='" + (k === i ? "on " : "") + (x.url ? "" : "nc") + "'>" + (x.url ? "▶ " : "") + esc(x.label || "") + (x.note ? " 📝" : "") + "</button>" }).join("");
    $("splList").querySelectorAll("[data-k]").forEach(function (b) { b.onclick = function () { go(+b.dataset.k) } });
    var on = $("splList").querySelector(".on"); if (on && on.scrollIntoView) try { on.scrollIntoView({ block: "nearest" }) } catch (e) {}
    if (!it.url) { v.removeAttribute("src"); try { v.load() } catch (e) {} $("splD").removeAttribute("href"); if ($("splA").checked && !$("splL").checked) setTimeout(function () { if (P.pos === i && i < P.items.length - 1) go(i + 1) }, 900); return }
    v._tr = it.a != null || it.b != null ? { a: it.a || 0, b: it.b || null } : null; v.src = it.url; v.loop = $("splL").checked; v.playbackRate = +$("splS").value || 1; $("splD").href = it.url;
    try { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}) } catch (e) {}
  }
  function open(o) {
    mount(); P.title = o.title || "Playlist"; P.all = (o.items || []).slice(); P.f = "all";
    if (!P.all.length) return; el.hidden = false; setF("all");
  }
  function ballText(yl) { yl = +yl; return yl === 50 ? "50" : yl < 0 ? "Own " + (-yl) : "Opp " + yl }
  function ord(n) { return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : n + "th" }
  function label(s, pre) {
    var dd = s.kind === "try" ? "Try" : s.dn ? ord(s.dn) + " & " + s.dist : "";
    var g = s.gain != null && s.kind !== "try" && s.res !== "Penalty" ? " " + (s.td ? "TD" : (s.gain > 0 ? "+" : "") + s.gain) : "";
    return (pre ? pre + " · " : "") + "#" + s.n + " · Q" + s.qtr + (dd ? " · " + dd : "") + (s.yl != null ? " · " + ballText(s.yl) : "") + " · " + ([s.form, s.motion, s.call].filter(Boolean).join(" ") || "no call") + " · " + (s.res || "") + g;
  }
  function look(s) { var c = s.cov ? (/^\d$/.test(s.cov) ? "Cov " + s.cov : s.cov) : ""; return [s.shell ? s.shell.toLowerCase() : "", s.front || "", c, s.blitz && s.blitz !== "No" ? "blitz: " + s.blitz : ""].filter(Boolean).join(" · ") }
  // build items from snaps that carry ._clips (the game's /clips map) and ._notes (meta.clipNotes)
  function itemsOf(snaps, pre) {
    return snaps.map(function (s) { var c = s._clips && s.id ? s._clips[s.id] : null, n = s._notes && s.id ? s._notes[s.id] : ""; return { s: s, label: label(s, typeof pre === "function" ? pre(s) : pre), look: look(s), note: n || "", url: c && c.url ? c.url : null, a: c && c.a != null ? c.a : null, b: c && c.b != null ? c.b : null } });
  }
  // make table rows playable: map(tr, firstCellText) → snaps or null
  function wire(table, fn, title) {
    if (!table) return;
    table.querySelectorAll("tr").forEach(function (tr) {
      var td = tr.querySelector("td"); if (!td || td.colSpan > 1) return;
      var k = String((td.childNodes[0] && td.childNodes[0].textContent) || td.textContent).trim(), A = fn(k, tr), L = A && (A.items || A); if (!L || !L.length) return;
      tr.classList.add("splrow"); tr.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("a,button,input,select")) return; open({ title: (typeof title === "function" ? title(k) : title) || k, items: itemsOf(L, A.pre) }) });
    });
  }
  window.SolPL = { open: open, itemsOf: itemsOf, wire: wire, label: label, look: look, FILTERS: FILTERS };
})();
