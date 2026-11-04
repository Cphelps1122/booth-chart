// Solutions plans: which school can use what. One copy for every page.
// schools/<school>/plan = { tier: "sideline" | "coordinator" | "program" | "trial", until: "YYYY-MM-DD", note }
// A school with no plan saved keeps full access (schools set up before plans existed).
(function (G) {
  var TIERS = {
    sideline: { name: "Sideline", price: 700, rank: 1 },
    coordinator: { name: "Coordinator", price: 1400, rank: 2 },
    program: { name: "Program", price: 2300, rank: 3 },
    trial: { name: "Free trial", price: 0, rank: 3 }
  };
  // the lowest plan that includes each part of the site
  var NEED = { chart: 1, plays: 1, stats: 1, defense: 1, scout: 2, reports: 2, impact: 2, film: 2, mock: 3 };
  var NEED_NAME = { 1: "Sideline", 2: "Coordinator", 3: "Program" };
  var LABEL = { scout: "Scout Reports", reports: "Reports and Game Preview", impact: "Impact", film: "Film clips and reels", mock: "Mock game" };
  var CFG = G.SOL_CONFIG || {}, DB = CFG.db || "https://cardinal-booth-default-rtdb.firebaseio.com", KEY = CFG.apiKey || "AIzaSyDm0t01_w92gL5sm4_1RnVLip7xWkjb9ME";
  function auth() { try { return JSON.parse(localStorage.getItem("solutions-auth-v1") || "null") } catch (e) { return null } }
  function token() {
    var a = auth(); if (!a || !a.school) return Promise.reject(new Error("NO_SESSION"));
    if (a.exp > Date.now() + 60000) return Promise.resolve(a.idToken);
    return fetch("https://securetoken.googleapis.com/v1/token?key=" + KEY, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(a.refreshToken) })
      .then(function (r) { return r.json() }).then(function (d) { if (d.error) throw new Error("NO_SESSION"); a.idToken = d.id_token; a.refreshToken = d.refresh_token; a.exp = Date.now() + (+d.expires_in - 60) * 1000; try { localStorage.setItem("solutions-auth-v1", JSON.stringify(a)) } catch (e) {} return a.idToken });
  }
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2) }
  function norm(p) { if (!p || !p.tier || !TIERS[p.tier]) return { tier: "program", legacy: true }; return p }
  function expired(p) { return !!(p && !p.legacy && p.until && p.until < today()) }
  function has(p, feature) { p = norm(p); if (expired(p)) return false; return TIERS[p.tier].rank >= (NEED[feature] || 1) }
  var cache = null;
  try { cache = JSON.parse(localStorage.getItem("solutions-plan") || "null") } catch (e) {}
  function get() {
    var a = auth(); if (!a || !a.school) return Promise.resolve(norm(cache));
    return token().then(function (t) { return fetch(DB + "/schools/" + encodeURIComponent(a.school) + "/plan.json?auth=" + encodeURIComponent(t)) })
      .then(function (r) { return r.ok ? r.json() : null }).then(function (p) { p = norm(p); try { localStorage.setItem("solutions-plan", JSON.stringify(p)) } catch (e) {} cache = p; return p }, function () { return norm(cache) });
  }
  // cover the page with a plain "not in your plan" card; admins and schools without a saved plan pass
  function gate(feature) {
    return get().then(function (p) {
      if (has(p, feature)) return true;
      var ended = expired(p), need = NEED_NAME[NEED[feature] || 1];
      var box = document.createElement("div"); box.id = "planGate";
      box.style.cssText = "position:fixed;inset:0;z-index:999;display:grid;place-items:center;padding:24px;background:rgba(10,14,20,.86);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif";
      box.innerHTML = "<div style='max-width:460px;background:#fff;color:#141a22;border-radius:14px;padding:24px 22px;box-shadow:0 20px 60px rgba(0,0,0,.4)'>" +
        "<div style='font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:12px;color:#b4202e'>" + (ended ? "Your plan has ended" : "Not in your plan") + "</div>" +
        "<h2 style='margin:6px 0 8px;font-size:22px'>" + (LABEL[feature] || "This page") + (ended ? " is paused" : " is part of " + need) + "</h2>" +
        "<p style='margin:0 0 16px;color:#4a5563'>" + (ended ? "Your school's Solutions plan ended " + p.until + ". Your games, reports and stats are all still saved. Renew to keep using everything." : "Your school is on " + TIERS[p.tier].name + ". " + need + " adds " + (LABEL[feature] || "this page") + ".") + "</p>" +
        "<div style='display:flex;gap:10px;flex-wrap:wrap'><a href='pricing.html' style='background:#b4202e;color:#fff;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:9px'>See plans</a><a href='app.html' style='background:#eef1f4;color:#141a22;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:9px'>Back to Home</a></div></div>";
      (document.body || document.documentElement).appendChild(box);
      return false;
    });
  }
  G.SolPlan = { TIERS: TIERS, NEED: NEED, get: get, has: has, expired: expired, gate: gate, today: today };
})(typeof window !== "undefined" ? window : globalThis);
