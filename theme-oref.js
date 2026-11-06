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
    else if (header) {
      band = header.getBoundingClientRect().bottom + window.scrollY + 24;
    }
    root.style.setProperty("--band", Math.max(180, Math.round(band)) + "px");
  }

  /* ---- home list sort: dataset order (default), name, status, last update ---- */
  var SORT_KEY = "agamim-home-sort";
  function sortMode() {
    try { return sessionStorage.getItem(SORT_KEY) || "id"; } catch (e) { return "id"; }
  }
  var COLLAPSE_KEY = "agamim-lakes-collapsed";
  function collapsedList() {
    try { var a = JSON.parse(sessionStorage.getItem(COLLAPSE_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function isCollapsed(lake) { return collapsedList().indexOf(lake) >= 0; }
  function setCollapsed(lake, closed) {
    var a = collapsedList().filter(function (x) { return x !== lake; });
    if (closed) a.push(lake);
    try { sessionStorage.setItem(COLLAPSE_KEY, JSON.stringify(a)); } catch (e) {}
  }
  /* show or hide a lake's datasets and keep the heading's state in step */
  function applyCollapse(ol, lake) {
    var closed = isCollapsed(lake);
    ol.querySelectorAll(":scope > li.agm-in-lake").forEach(function (li) {
      if (li.getAttribute("data-lake") === lake) li.classList.toggle("agm-collapsed", closed);
    });
    var h = ol.querySelector(':scope > li.agm-lake[data-lake="' + lake.replace(/"/g, "") + '"]');
    if (h) {
      h.classList.toggle("agm-lake--closed", closed);
      var b = h.querySelector(".agm-lake-btn");
      if (b) b.setAttribute("aria-expanded", closed ? "false" : "true");
    }
  }

  var sortData = null;
  function loadSortData() {
    if (sortData) return sortData;
    sortData = { ready: false, byId: {} };
    fetch("data/consumer/repositories.json")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        (d.items || []).forEach(function (r) {
          var f = r.quality && typeof r.quality.freshnessMin === "number" ? r.quality.freshnessMin : Infinity;
          var g = r.group || {};
          sortData.byId[String(r.id)] = {
            name: r.nameHe || "",
            blocked: !!r.restricted,
            fresh: f,
            lake: g.db || "",
            lakeHe: String(g.he || "").replace(/\s*\(.*\)\s*$/, ""),
            lastLoad: (g.health && g.health.lastLoad) || ""
          };
        });
        sortData.ready = true;
        schedule();
      })
      .catch(function () { sortData.ready = true; });
    return sortData;
  }

  /* The hierarchy is: data lake (e.g. db-oref-base) -> datasets (data layers).
     Each lake gets a heading row; its datasets follow it, sorted by the chosen mode. */
  function sortRows() {
    var mode = sortMode();
    var ol = document.querySelector("ol.card.divide-y");
    if (!ol) return;
    var rows = Array.prototype.slice.call(ol.querySelectorAll(":scope > li:not(.agm-lake)"));
    if (!rows.length) return;
    var data = loadSortData();
    if (!data.ready) return;
    var items = rows.map(function (li) {
      var a = li.querySelector("a");
      var id = (/#\/repo\/(\d+)/.exec((a && a.getAttribute("href")) || "") || [])[1];
      var rec = data.byId[id] || { name: "", blocked: false, fresh: Infinity, lake: "", lastLoad: "" };
      return { li: li, id: parseInt(id, 10) || 0, rec: rec };
    });
    var lakes = [];
    items.forEach(function (it) { if (lakes.indexOf(it.rec.lake) < 0) lakes.push(it.rec.lake); });
    lakes.sort(function (x, y) { return x.localeCompare(y); });
    items.sort(function (x, y) {
      var byName = x.rec.name.localeCompare(y.rec.name, "he");
      var byStatus = (x.rec.blocked ? 1 : 0) - (y.rec.blocked ? 1 : 0);
      if (mode === "name") return byName;
      if (mode === "status") return byStatus || byName;
      if (mode === "updated") return byStatus || (x.rec.fresh - y.rec.fresh) || byName; // open first, newest first
      return x.id - y.id;
    });
    var seen = {};
    items.forEach(function (it) {
      var k = lakes.indexOf(it.rec.lake);
      seen[k] = (seen[k] || 0) + 1;
      it.li.style.order = String(k * 1000 + seen[k]);
      it.li.classList.add("agm-in-lake");
      it.li.setAttribute("data-lake", it.rec.lake);
      it.li.classList.toggle("agm-collapsed", isCollapsed(it.rec.lake));
    });
    // lake heading rows
    var have = {};
    ol.querySelectorAll(":scope > li.agm-lake").forEach(function (h) { have[h.getAttribute("data-lake")] = h; });
    lakes.forEach(function (lake, k) {
      var count = items.filter(function (it) { return it.rec.lake === lake; }).length;
      var load = "";
      var he = "";
      items.forEach(function (it) { if (it.rec.lake === lake) { if (it.rec.lastLoad) load = it.rec.lastLoad; if (it.rec.lakeHe) he = it.rec.lakeHe; } });
      var key = lake + "|" + count + "|" + load + "|" + he;
      var h = have[lake];
      if (h && h.getAttribute("data-key") !== key) { h.remove(); h = null; }
      if (!h) {
        h = document.createElement("li");
        h.className = "agm-lake";
        h.setAttribute("data-lake", lake);
        h.setAttribute("data-key", key);
        h.innerHTML =
          '<button type="button" class="agm-lake-btn" aria-expanded="true">' +
          '<span class="agm-lake-icon" aria-hidden="true"></span>' +
          '<span class="agm-lake-text"><strong></strong><span></span></span>' +
          '<span class="agm-lake-chev" aria-hidden="true"></span>' +
          "</button>";
        h.querySelector(".agm-lake-btn").addEventListener("click", function () {
          setCollapsed(lake, !isCollapsed(lake));
          applyCollapse(ol, lake);
        });
        h.querySelector("strong").textContent = he || lake || "מאגר מידע";
        var sub = h.querySelector(".agm-lake-text > span");
        sub.appendChild(document.createTextNode("מאגר מידע "));
        var code = document.createElement("bdi");
        code.setAttribute("dir", "ltr");
        code.textContent = lake;
        if (lake) sub.appendChild(code);
        sub.appendChild(document.createTextNode(" · " + count + " מאגרי נתונים" + (load ? " · נטען לאחרונה " + load : "")));
        ol.appendChild(h);
      }
      h.style.order = String(k * 1000);
      applyCollapse(ol, lake);
      delete have[lake];
    });
    Object.keys(have).forEach(function (k) { have[k].remove(); });
  }
  function sortControl() {
    var head = document.querySelector("main section > div.mb-3 > h2");
    var host = head && head.parentElement;
    if (!host || host.querySelector(".agm-sort")) return;
    var label = document.createElement("label");
    label.className = "agm-sort";
    label.appendChild(document.createTextNode("מיון לפי"));
    var sel = document.createElement("select");
    [["id", "סדר המאגרים"], ["name", "שם"], ["status", "סטטוס"], ["updated", "עודכן לאחרונה"]].forEach(function (o) {
      var op = document.createElement("option");
      op.value = o[0];
      op.textContent = o[1];
      sel.appendChild(op);
    });
    sel.value = sortMode();
    sel.addEventListener("change", function () {
      try { sessionStorage.setItem(SORT_KEY, sel.value); } catch (e) {}
      schedule();
    });
    label.appendChild(sel);
    host.insertBefore(label, head.nextSibling);
  }

  /* dataset rows: sort by dataset number and spell out open / blocked */
  function enhanceRows() {
    var rows = document.querySelectorAll("ol.card.divide-y > li");
    rows.forEach(function (li) {
      var a = li.querySelector("a");
      if (!a) return;
      var idEl = a.querySelector("bdi");
      var n = idEl ? parseInt(idEl.textContent, 10) : NaN;
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
    img.width = 210;
    img.height = 210;
    hero.appendChild(img);
  }

  /* the alert is one line until you open it. The app re-renders the alert when you page through them,
     which resets its class list, so the state lives in data attributes and is re-applied on every pass. */
  function alertFlip(box) {
    var open = box.getAttribute("data-agm-open") !== "1";
    box.setAttribute("data-agm-open", open ? "1" : "0");
    schedule();
  }
  function alertToggle() {
    // critical alerts have role=alert, others role=status: take whichever is on screen
    var box = document.querySelector("section.no-print > div[role='alert'], section.no-print > div[role='status']");
    if (!box) return;
    var title = box.querySelector("h4");
    var key = title ? title.textContent : "";
    if (box.getAttribute("data-agm-key") !== key) {
      box.setAttribute("data-agm-key", key);
      box.setAttribute("data-agm-open", "0"); // a different alert starts folded
    }
    var open = box.getAttribute("data-agm-open") === "1";
    box.classList.add("agm-alert");
    box.classList.toggle("agm-alert-open", open);
    var pop = box.querySelector(":scope > .agm-alert-pop");
    if (open) {
      var body = box.querySelector(".min-w-0 > p");
      var when = box.querySelector(".min-w-0 > div:last-child");
      var txt = (body ? body.textContent : "").trim();
      var date = when && when !== body && when.tagName === "DIV" && !when.querySelector("h4") ? when.textContent.trim() : "";
      if (!pop) {
        pop = document.createElement("div");
        pop.className = "agm-alert-pop";
        pop.setAttribute("role", "note");
        box.appendChild(pop);
      }
      var want = txt + "|" + date;
      if (pop.getAttribute("data-k") !== want) {
        pop.setAttribute("data-k", want);
        pop.textContent = "";
        var p = document.createElement("p");
        p.textContent = txt;
        pop.appendChild(p);
        if (date) {
          var s = document.createElement("small");
          s.textContent = date;
          pop.appendChild(s);
        }
      }
    } else if (pop) {
      pop.remove();
    }
    var text = box.querySelector(".min-w-0");
    if (text) {
      if (text.getAttribute("role") !== "button") {
        text.setAttribute("role", "button");
        text.setAttribute("tabindex", "0");
      }
      text.setAttribute("aria-expanded", open ? "true" : "false");
    }
    if (!box.__agmBound) {
      box.__agmBound = true;
      box.addEventListener("click", function (e) {
        var t = e.target && e.target.closest ? e.target.closest(".min-w-0") : null;
        if (t && box.contains(t)) alertFlip(box);
      });
      box.addEventListener("keydown", function (e) {
        var t = e.target && e.target.closest ? e.target.closest(".min-w-0") : null;
        if (t && box.contains(t) && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          alertFlip(box);
        }
      });
    }
  }

  function isAdmin() {
    return typeof window.__agamimIsAdmin === "function" ? window.__agamimIsAdmin() : true;
  }

  /* the bar's search field has only a placeholder: give it an accessible name */
  function nameSearch() {
    var f = document.querySelector("header.no-print form input");
    if (f && !f.getAttribute("aria-label")) f.setAttribute("aria-label", "חיפוש מאגר, מושג או דרישה");
  }

  function run() {
    raf = 0;
    try {
      root.classList.toggle("agm-consumer", !isAdmin());
      alertToggle();
      nameSearch();
      enhanceRows();
      sortControl();
      sortRows();
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
