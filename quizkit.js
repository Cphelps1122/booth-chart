/* Player quiz kit: shared by quiz.html (RB) and passquiz.html (WR / TE).
   - This week's plays, opponent looks and the team's most-missed plays come from /quizcfg/<school> (coaches set it on Player Quizzes).
   - Mastery: a missed rep comes back later in the same run until it is right twice.
   - Speed round timer, Friday check (this player's misses on this device + the team's most missed), day streaks,
     dark mode, and a one-time "add to home screen" tip. */
(function () {
  "use strict";
  var DB = (window.SOL_CONFIG && window.SOL_CONFIG.db) || "https://cardinal-booth-default-rtdb.firebaseio.com";
  var SCHOOL = (new URLSearchParams(location.search).get("s") || "melissa").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  var LS = "solutions-quiz-" + SCHOOL + ":";
  function lsGet(k, d) { try { var v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v) } catch (e) { return d } }
  function lsSet(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)) } catch (e) {} }
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") }

  // play names the coach can pick from (keep in step with PLAYS in quiz.html and PASS in passquiz.html; tests check this)
  var RUN = ["Aces Q", "Mike Q", "Tebow", "Read", "Gator", "Smack Pepsi", "Glenda / Gary Q", "Plank", "Pirate", "Swamp", "Zipper", "Uno Q", "Delta Q", "Dirty Q",
    "Crab", "Smack", "Power", "Split Zone", "Split Zip", "Zip", "Scat", "Pro 22 / 33", "Pro 44 / 55", "TX Split Zone", "TX Split Zip", "TX Over Kick", "TX Over Zip", "Unbal Kick", "Unbal Zone",
    "Bite Smack Pepsi", "Bite Scat", "Bite Zone", "Bite Uno", "Bite 22 / 33"];
  var PASSN = ["Gold Batman", "Gold Joker", "Gold Vegas", "Red Vegas", "Red Florida", "Slot Dip Miami", "Bunch Washington", "Bunch Wyoming", "Bunch Mesh", "Bunch Mesh Hammer RT", "Crew Husky", "Gray LTY*RTY Verts", "Gray LTY*RTY DC RT", "Gray LTY*RTY Deuces"];

  var CFG = null;
  function cfg() {
    if (CFG) return Promise.resolve(CFG);
    return fetch(DB + "/quizcfg/" + SCHOOL + ".json").then(function (r) { return r.ok ? r.json() : null }).catch(function () { return null })
      .then(function (d) { CFG = d || {}; return CFG });
  }
  function list(v) { return !v ? [] : Array.isArray(v) ? v.filter(Boolean) : Object.keys(v).map(function (k) { return v[k] }).filter(Boolean) }

  // ---- mastery: a missed rep comes back 3 reps later; it has to be right twice ----
  function requeue(deck, i, rep, clone) {
    var need = rep.need || 2;
    var c = clone(rep); c.retry = true; c.need = need;
    deck.splice(Math.min(deck.length, i + 4), 0, c);
  }
  function rightAgain(deck, i, rep, clone) {
    if (!rep.retry || (rep.need || 1) <= 1) return;
    var c = clone(rep); c.retry = true; c.need = rep.need - 1;
    deck.splice(Math.min(deck.length, i + 5), 0, c);
  }

  // ---- speed round timer ----
  var T = { id: null };
  function timerStart(sec, onOut) {
    timerStop();
    var bar = document.getElementById("qkTimer"); if (!bar) return;
    bar.hidden = false; var i = bar.firstElementChild, t0 = Date.now();
    i.style.width = "100%";
    T.id = setInterval(function () {
      var left = 1 - (Date.now() - t0) / (sec * 1000);
      i.style.width = Math.max(0, left * 100) + "%"; i.style.background = left < .34 ? "#c0392b" : left < .67 ? "#e0a800" : "#1f9a3a";
      if (left <= 0) { timerStop(); onOut() }
    }, 80);
  }
  function timerStop() { if (T.id) clearInterval(T.id); T.id = null; var bar = document.getElementById("qkTimer"); if (bar) bar.hidden = true }

  // ---- streak: days in a row this device took a quiz ----
  function streakHit() {
    var s = lsGet("streak", { last: "", n: 0 }), t = today();
    if (s.last === t) return s.n;
    var y = new Date(); y.setDate(y.getDate() - 1);
    var ys = y.getFullYear() + "-" + String(y.getMonth() + 1).padStart(2, "0") + "-" + String(y.getDate()).padStart(2, "0");
    s.n = s.last === ys ? s.n + 1 : 1; s.last = t; lsSet("streak", s); return s.n;
  }

  // ---- this device's misses, for the Friday check ----
  function missAdd(kind, names) { var m = lsGet("miss-" + kind, {}); names.forEach(function (n) { m[n] = (m[n] || 0) + 1 }); lsSet("miss-" + kind, m) }
  function missRight(kind, names) { var m = lsGet("miss-" + kind, {}); names.forEach(function (n) { if (m[n]) { m[n] -= 1; if (m[n] <= 0) delete m[n] } }); lsSet("miss-" + kind, m) }
  function fridayList(kind, all, n) {
    var mine = lsGet("miss-" + kind, {}), team = list(CFG && CFG.focus && CFG.focus[kind]), week = list(CFG && CFG[kind]), out = [];
    Object.keys(mine).sort(function (a, b) { return mine[b] - mine[a] }).forEach(function (x) { if (out.indexOf(x) < 0) out.push(x) });
    team.forEach(function (x) { if (out.indexOf(x) < 0) out.push(x) });
    (week.length ? week : all).forEach(function (x) { if (out.indexOf(x) < 0) out.push(x) });
    return out.filter(function (x) { return all.indexOf(x) >= 0 }).slice(0, n || 10);
  }

  // ---- dark mode + home-screen tip ----
  var css = document.createElement("style"); if (!document.getElementById("start")) css.media = "not all";
  css.textContent = ".qk-timer{height:12px;background:#e3e3e0;border-radius:7px;overflow:hidden;margin:4px 0 8px}.qk-timer i{display:block;height:100%;width:100%;background:#1f9a3a;transition:width .08s linear}" +
    ".qk-modes{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:6px 0 12px}.qk-modes .chip{text-align:center;font-size:17px;min-height:50px;line-height:1.15}" +
    ".qk-row{display:flex;gap:10px;align-items:center;margin:6px 0 12px;font-size:18px}.qk-row input{width:24px;height:24px;min-height:0;margin:0}" +
    ".qk-tip{background:#fff7d6;border:2px solid #e0a800;border-radius:12px;padding:10px 12px;font-size:17px;margin-bottom:12px;display:flex;gap:10px;align-items:flex-start}.qk-tip button{margin-left:auto;font:inherit;border:0;background:none;font-size:22px;line-height:1}" +
    ".qk-learn .nav{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.qk-looks{background:#eef3fb;border-radius:10px;padding:8px 10px;font-size:17px;margin:6px 0}" +
    ".qk-streak{text-align:center;font-size:19px;margin:4px 0}" +
    ".qk-pick{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;z-index:50}.qk-sheet{background:#fff;border-radius:16px 16px 0 0;padding:16px;width:100%;max-width:640px;display:grid;gap:10px}.qk-pt{font-size:21px;text-align:center;margin-bottom:4px}" +
    "@media (prefers-color-scheme: dark){body{background:#121316!important;color:#ecedef!important}.card{background:#1b1d21!important;border-color:#3a3d44!important}" +
    ".chip,.go.alt,.opt,input,textarea{background:#24272c!important;color:#ecedef!important;border-color:#5a5e66!important}.chip[aria-pressed=\"true\"]{background:#ecedef!important;color:#111!important}" +
    ".sub,.top,.key,.hash{color:#b9bcc3!important}.rule,.qk-looks{background:#24272c!important;color:#ecedef!important}.qk-tip{background:#2b2612!important;color:#f3e7b8!important}" +
    ".opt.right,.chip.right{background:#1d3b24!important;border-color:#4cc36a!important}.opt.wrong,.chip.wrong{background:#3d1d1a!important;border-color:#ff7a6e!important}.call{color:#ff8a7a!important}.ok{color:#6fd38a!important}.no{color:#ff8a80!important}}";
  document.head.appendChild(css);
  function homeTip(where) {
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var standalone = window.navigator.standalone || (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
    if (standalone || lsGet("tip", 0) || !where) return;
    var d = document.createElement("div"); d.className = "qk-tip"; d.setAttribute("role", "note");
    d.innerHTML = "<span>Put this quiz on your home screen: tap " + (ios ? "<b>Share</b>, then <b>Add to Home Screen</b>" : "the <b>⋮ menu</b>, then <b>Add to Home screen</b>") + ".</span><button type='button' aria-label='Hide this tip'>×</button>";
    d.querySelector("button").onclick = function () { lsSet("tip", 1); d.remove() };
    where.parentNode.insertBefore(d, where);
  }


  // ---- coaches who get results by text: set on Player Quizzes (cfg.coaches); this list is used until a coach saves one ----
  var COACHES0 = [{ name: "Coach Phelps", phone: "+12145786616", q: { run: 1, film: 1 } }, { name: "Coach Scoggin", phone: "+19037244650", q: { pass: 1 } }];
  function coaches() { var c = list(CFG && CFG.coaches); return c.length ? c : COACHES0 }
  function coachesFor(kind) { return coaches().filter(function (c) { return c && c.phone && c.q && c.q[kind] }) }
  function smsUrl(phone, body) { return "sms:" + phone + "?&body=" + encodeURIComponent(body) }
  function openUrl(u) { if (window.SOL_TEST && window.__qkOpen) return window.__qkOpen(u); try { window.top.location.href = u } catch (x) { var w = window.open(u, "_blank"); if (!w) location.href = u } }
  // Text Coach: pick the coach by name, then the text opens to his number
  function textCoach(kind, body) {
    return cfg().then(function () {
      var L = coachesFor(kind); if (!L.length) L = coaches().slice(0, 1);
      if (L.length === 1) { openUrl(smsUrl(L[0].phone, body())); return }
      var old = document.getElementById("qkPick"); if (old) old.remove();
      var d = document.createElement("div"); d.id = "qkPick"; d.className = "qk-pick"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Pick your coach");
      d.innerHTML = "<div class='qk-sheet'><div class='qk-pt'>Send your results to:</div>" + L.map(function (c, i) { return "<button class='go' type='button' data-i='" + i + "'>" + String(c.name).replace(/</g, "&lt;") + "</button>" }).join("") + "<button class='go alt' type='button' data-x='1'>Cancel</button></div>";
      d.addEventListener("click", function (e) { var b = e.target.closest("button"); if (e.target === d || (b && b.dataset.x)) { d.remove(); return } if (!b) return; d.remove(); openUrl(smsUrl(L[+b.dataset.i].phone, body())) });
      document.body.appendChild(d); d.querySelector("button").focus();
    });
  }

  window.QK = { cfg: cfg, list: list, RUN: RUN, PASS: PASSN, requeue: requeue, rightAgain: rightAgain, timerStart: timerStart, timerStop: timerStop,
    streakHit: streakHit, coaches: coaches, coachesFor: coachesFor, textCoach: textCoach, COACHES0: COACHES0, missAdd: missAdd, missRight: missRight, fridayList: fridayList, homeTip: homeTip, today: today };
})();
