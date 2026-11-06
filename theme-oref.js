/* Layout helpers for the Home Front Command theme (theme-oref.css). They only add presentation:
   they size the blue band, add a status label and ordering to dataset rows, collapse the alert to one
   line, and show a facts panel in the home hero. Everything fails safe: with no JS the CSS still works. */
(function () {
  var root = document.documentElement;
  var raf = 0;

  function sizeBand() {
    var header = document.querySelector("header.no-print");
    var hero = document.querySelector("section.agm-hero");
    var band = 300;
    if (hero) band = hero.getBoundingClientRect().bottom + window.scrollY + 12;
    else if (header) band = header.getBoundingClientRect().bottom + window.scrollY + 24;
    root.style.setProperty("--band", Math.max(180, Math.round(band)) + "px");
  }

  /* dataset rows: sort by dataset number and spell out open / blocked */
  function enhanceRows() {
    var rows = document.querySelectorAll("ol.card.divide-y > li");
    rows.forEach(function (li) {
      var a = li.querySelector("a");
      if (!a) return;
      var idEl = a.querySelector("bdi");
      var n = idEl ? parseInt(idEl.textContent, 10) : NaN;
      if (!isNaN(n)) li.style.order = String(n);
      var blocked = !!a.querySelector("svg.lucide-lock");
      if (!a.querySelector(".agm-status")) {
        var repoId = (/#\/repo\/(\d+)/.exec(a.getAttribute("href") || "") || [])[1];
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "agm-status " + (blocked ? "agm-status--blocked" : "agm-status--open");
        chip.textContent = blocked ? "חסום" : "פתוח";
        if (repoId && window.__agamimAccess && isAdmin()) {
          chip.setAttribute("role", "switch");
          chip.setAttribute("aria-checked", blocked ? "false" : "true");
          chip.setAttribute("aria-label", "גישה למאגר: " + (blocked ? "חסום" : "פתוח") + ". לחצו כדי להחליף");
          chip.title = "מנהל: לחצו כדי " + (blocked ? "לפתוח" : "לחסום") + " את המאגר";
          chip.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleAccess(repoId, blocked);
          });
        } else {
          chip.disabled = true;
        }
        a.insertBefore(chip, a.lastElementChild);
      }
    });
  }

  /* admin: flip a dataset between open and blocked (kept in this browser, like locally added datasets) */
  function toggleAccess(repoId, isBlockedNow) {
    var name = "";
    var row = document.querySelector('a[href="#/repo/' + repoId + '"] .font-bold');
    if (row) name = row.textContent.trim();
    var q = isBlockedNow
      ? "לפתוח את המאגר" + (name ? " “" + name + "”" : "") + " לגישה?"
      : "לחסום את המאגר" + (name ? " “" + name + "”" : "") + "? משתמשים לא יוכלו לפתוח אותו.";
    if (!window.confirm(q)) return;
    window.__agamimAccess.set(repoId, !isBlockedNow);
    location.reload();
  }

  /* is the dataset blocked? read from the data (the fetch overlay already applies admin choices) */
  var blockedCache = {};
  function repoBlocked(id) {
    if (Object.prototype.hasOwnProperty.call(blockedCache, id)) return blockedCache[id];
    blockedCache[id] = null;
    fetch("data/consumer/repositories__" + id + ".json")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        blockedCache[id] = !!(d && d.restricted);
        schedule();
      })
      .catch(function () { blockedCache[id] = false; });
    return null;
  }

  /* the open search box is placed just below the bar, centred under it */
  function placeSearch() {
    var header = document.querySelector("header.no-print");
    var form = header && header.querySelector("form");
    if (!form) return;
    var hr = header.getBoundingClientRect();
    var fr = form.getBoundingClientRect();
    var w = Math.min(320, window.innerWidth - 32);
    var left = Math.max(16, Math.min(hr.left + hr.width / 2 - w / 2, window.innerWidth - 16 - w));
    root.style.setProperty("--agm-st", Math.round(hr.bottom - fr.top + 12) + "px");
    root.style.setProperty("--agm-sl", Math.round(left - fr.left) + "px");
  }
  document.addEventListener("focusin", function (e) {
    if (e.target && e.target.closest && e.target.closest("header.no-print form")) placeSearch();
  });
  window.addEventListener("resize", placeSearch);

  /* dataset page: the same switch next to the other actions */
  function repoPageSwitch() {
    var m = /#\/repo\/(\d+)/.exec(location.hash || "");
    var bar = document.querySelector("header.card .flex.flex-wrap.items-center.gap-2");
    var old = document.querySelector(".agm-admin-switch");
    if (!m || !bar || !window.__agamimAccess || !isAdmin()) {
      if (old) old.remove();
      return;
    }
    var blocked = repoBlocked(m[1]);
    if (blocked === null) return; // not known yet; the lookup re-runs this when it arrives
    if (old && old.getAttribute("data-repo") === m[1] && old.getAttribute("data-blocked") === String(blocked)) return;
    if (old) old.remove();
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-ghost agm-admin-switch";
    btn.setAttribute("data-repo", m[1]);
    btn.setAttribute("data-blocked", String(blocked));
    btn.textContent = blocked ? "פתיחת המאגר לגישה" : "חסימת המאגר";
    btn.title = "פעולת מנהל";
    btn.addEventListener("click", function () {
      var title = document.querySelector("header.card h1");
      var name = title ? title.textContent.replace(/^[^֐-׿]*/, "").trim() : "";
      var q = blocked
        ? "לפתוח את המאגר" + (name ? " “" + name + "”" : "") + " לגישה?"
        : "לחסום את המאגר" + (name ? " “" + name + "”" : "") + "? משתמשים לא יוכלו לפתוח אותו.";
      if (!window.confirm(q)) return;
      window.__agamimAccess.set(m[1], !blocked);
      location.reload();
    });
    bar.insertBefore(btn, bar.firstChild);
  }

  /* home hero: the HFC logo stands where the second logo used to be */
  function heroLogo() {
    var hero = document.querySelector("section.agm-hero");
    if (!hero || hero.querySelector(".agm-hero-logo")) return;
    var img = document.createElement("img");
    img.className = "agm-hero-logo";
    img.src = "./pakar-logo.svg";
    img.alt = "פיקוד העורף";
    hero.appendChild(img);
  }

  /* the alert is one line until you open it */
  function alertToggle() {
    var box = document.querySelector("section.no-print > div[role='alert']");
    if (!box || box.getAttribute("data-agm")) return;
    box.setAttribute("data-agm", "1");
    box.classList.add("agm-alert");
    var text = box.querySelector(".min-w-0");
    if (!text) return;
    text.setAttribute("tabindex", "0");
    text.setAttribute("role", "button");
    text.setAttribute("aria-expanded", "false");
    function flip() {
      var open = box.classList.toggle("agm-alert-open");
      text.setAttribute("aria-expanded", open ? "true" : "false");
      schedule();
    }
    text.addEventListener("click", flip);
    text.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        flip();
      }
    });
  }

  function isAdmin() {
    return typeof window.__agamimIsAdmin === "function" ? window.__agamimIsAdmin() : true;
  }

  function run() {
    raf = 0;
    try {
      root.classList.toggle("agm-consumer", !isAdmin());
      alertToggle();
      enhanceRows();
      repoPageSwitch();
      heroLogo();
      sizeBand();
    } catch (e) {}
  }
  function schedule() {
    if (!raf) raf = requestAnimationFrame(run);
  }

  window.addEventListener("resize", schedule);
  window.addEventListener("hashchange", schedule);
  window.addEventListener("load", schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
