// one site menu for every report page: <div class="tabs" data-solnav="stats"></div>
(function () {
  var L = [["home", "Home", "app.html"], ["defense", "Defense", "defense.html"], ["reports", "Reports", "reports.html"], ["scout", "Scout reports", "scout.html"], ["stats", "Stats", "stats.html"], ["impact", "Impact", "impact.html"], ["mock", "Mock game", "mock.html"]];
  function draw() { document.querySelectorAll("[data-solnav]").forEach(function (el) { var cur = el.getAttribute("data-solnav"); el.innerHTML = L.map(function (x) { return x[0] === cur && el.tagName === "NAV" ? "<a href='" + x[2] + "' aria-current='page' class='cur'>" + x[1] + "</a>" : x[0] === cur ? "<button type='button' aria-selected='true' aria-current='page'>" + x[1] + "</button>" : "<a href='" + x[2] + "'>" + x[1] + "</a>" }).join(""); }) }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", draw); else draw();
})();
