/*
 * Search suggestions (typeahead).
 * After two or more letters in the header search or the home search, a dropdown lists the matching
 * datasets (name, purpose, owner, lake, table name). Click or Enter on one opens it; Enter with no
 * choice runs the normal search; the last row searches everything.
 * Data comes from the same files the catalog reads, so edits, deletions, blocked state and
 * locally added datasets are all reflected. Plain DOM, no dependency on the app's internals.
 */
(function () {
  "use strict";

  var MIN = 2;
  var MAX = 6;
  var INPUTS = "header.no-print form input, section.agm-hero form input";

  var index = null; // [{ id, name, hay, lake, owner, blocked, desc }]
  var loading = null;
  var panel = null;
  var current = null; // the input the panel belongs to
  var items = [];
  var active = -1;
  var timer = 0;
  var seq = 0;

  function norm(s) {
    return String(s || "").toLowerCase().replace(/[֑-ׇ]/g, "").replace(/["'״׳]/g, "").trim();
  }

  function load() {
    if (index) return Promise.resolve(index);
    if (loading) return loading;
    var get = function (name) {
      return fetch("data/consumer/" + name).then(function (r) { return r.ok ? r.json() : { items: [] }; }).catch(function () { return { items: [] }; });
    };
    loading = Promise.all([get("repositories.json"), get("layers.json")]).then(function (res) {
      var layers = {};
      (res[1].items || []).forEach(function (l) { (layers[l.repoId] = layers[l.repoId] || []).push(l); });
      index = (res[0].items || []).map(function (r) {
        var ls = layers[r.id] || [];
        var lake = String((r.group && r.group.he) || "").replace(/\s*\(.*\)\s*$/, "");
        var tables = ls.map(function (l) { return (l.sqlName || "") + " " + (l.titleHe || ""); }).join(" ");
        return {
          id: r.id,
          name: r.nameHe || "",
          lake: lake,
          owner: r.ownerHe || "",
          blocked: !!r.restricted,
          desc: r.purposeHe || (ls[0] && ls[0].descHe) || "",
          hay: {
            name: norm(r.nameHe + " " + (r.nameEn || "")),
            other: norm([r.purposeHe, r.ownerHe, lake, r.group && r.group.db, tables, ls[0] && ls[0].descHe].join(" "))
          }
        };
      });
      return index;
    });
    return loading;
  }

  function match(q) {
    var tokens = norm(q).split(/\s+/).filter(Boolean);
    if (!tokens.length || !index) return [];
    var out = [];
    index.forEach(function (it) {
      var score = 0;
      for (var i = 0; i < tokens.length; i++) {
        var t = tokens[i];
        var inName = it.hay.name.indexOf(t);
        var inOther = it.hay.other.indexOf(t);
        if (inName < 0 && inOther < 0) return;
        score += inName === 0 ? 0 : inName > 0 ? 2 : 5;
      }
      out.push({ it: it, score: score });
    });
    out.sort(function (a, b) { return a.score - b.score || a.it.name.localeCompare(b.it.name, "he"); });
    return out.slice(0, MAX).map(function (x) { return x.it; });
  }

  function highlight(parent, text, q) {
    var tokens = norm(q).split(/\s+/).filter(Boolean);
    var lower = text.toLowerCase();
    var marks = [];
    tokens.forEach(function (t) {
      var at = lower.indexOf(t);
      if (at >= 0) marks.push([at, at + t.length]);
    });
    marks.sort(function (a, b) { return a[0] - b[0]; });
    var pos = 0;
    marks.forEach(function (m) {
      if (m[0] < pos) return;
      if (m[0] > pos) parent.appendChild(document.createTextNode(text.slice(pos, m[0])));
      var mk = document.createElement("mark");
      mk.textContent = text.slice(m[0], m[1]);
      parent.appendChild(mk);
      pos = m[1];
    });
    if (pos < text.length) parent.appendChild(document.createTextNode(text.slice(pos)));
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "agm-suggest";
    panel.className = "agm-suggest";
    panel.setAttribute("role", "listbox");
    panel.setAttribute("aria-label", "הצעות לחיפוש");
    panel.hidden = true;
    // keep the focus in the input while the pointer is on the list
    panel.addEventListener("mousedown", function (e) { e.preventDefault(); });
    document.body.appendChild(panel);
    return panel;
  }

  function place() {
    if (!panel || panel.hidden || !current) return;
    var r = current.getBoundingClientRect();
    var w = Math.max(r.width, Math.min(380, window.innerWidth - 24));
    var left = Math.min(Math.max(12, r.right - w), window.innerWidth - w - 12);
    panel.style.top = Math.round(r.bottom + 8) + "px";
    panel.style.left = Math.round(left) + "px";
    panel.style.width = Math.round(w) + "px";
  }

  function close() {
    if (!panel) return;
    panel.hidden = true;
    panel.textContent = "";
    items = [];
    active = -1;
    if (current) {
      current.setAttribute("aria-expanded", "false");
      current.removeAttribute("aria-activedescendant");
    }
  }

  function go(hash) {
    close();
    if (current) { try { current.blur(); } catch (e) {} }
    location.hash = hash;
  }

  function setActive(i) {
    var opts = panel.querySelectorAll("[role=option]:not([aria-disabled=true])");
    if (!opts.length) return;
    active = (i + opts.length) % opts.length;
    opts.forEach(function (o, k) { o.setAttribute("aria-selected", k === active ? "true" : "false"); });
    current.setAttribute("aria-activedescendant", opts[active].id);
    opts[active].scrollIntoView({ block: "nearest" });
  }

  function option(id, build, hash) {
    var o = document.createElement("div");
    o.id = id;
    o.className = "agm-suggest-opt";
    o.setAttribute("role", "option");
    o.setAttribute("aria-selected", "false");
    build(o);
    o.addEventListener("click", function () { go(hash); });
    o.addEventListener("mousemove", function () {
      var opts = Array.prototype.slice.call(panel.querySelectorAll("[role=option]:not([aria-disabled=true])"));
      var k = opts.indexOf(o);
      if (k !== active) setActive(k);
    });
    o.setAttribute("data-hash", hash);
    return o;
  }

  function render(q) {
    var p = ensurePanel();
    p.textContent = "";
    active = -1;
    items = match(q);
    items.forEach(function (it, k) {
      p.appendChild(option("agm-sg-" + k, function (o) {
        var icon = document.createElement("span");
        icon.className = "agm-suggest-icon";
        icon.setAttribute("aria-hidden", "true");
        var text = document.createElement("span");
        text.className = "agm-suggest-text";
        var title = document.createElement("strong");
        highlight(title, it.name, q);
        var sub = document.createElement("span");
        sub.textContent = [it.lake, it.owner].filter(Boolean).join(" · ");
        text.appendChild(title);
        text.appendChild(sub);
        var st = document.createElement("span");
        st.className = "agm-suggest-state " + (it.blocked ? "agm-suggest-state--blocked" : "agm-suggest-state--open");
        st.textContent = it.blocked ? "חסום" : "פתוח";
        o.appendChild(icon);
        o.appendChild(text);
        o.appendChild(st);
      }, "#/repo/" + it.id));
    });
    if (!items.length) {
      var none = document.createElement("div");
      none.className = "agm-suggest-none";
      none.id = "agm-sg-none";
      none.setAttribute("role", "option");
      none.setAttribute("aria-disabled", "true");
      none.textContent = "לא נמצא מאגר תואם. אפשר לחפש בכל הקטלוג.";
      p.appendChild(none);
    }
    var all = option("agm-sg-all", function (o) {
      o.classList.add("agm-suggest-all");
      o.textContent = "חיפוש “" + q.trim() + "” בכל הקטלוג";
    }, "#/search?q=" + encodeURIComponent(q.trim()));
    p.appendChild(all);
    p.hidden = false;
    current.setAttribute("aria-expanded", "true");
    current.setAttribute("aria-controls", "agm-suggest");
    place();
    window.setTimeout(place, 260); // the header box finishes widening
  }

  function update(input) {
    current = input;
    var q = input.value || "";
    window.clearTimeout(timer);
    if (norm(q).length < MIN) { close(); return; }
    var mine = ++seq;
    timer = window.setTimeout(function () {
      load().then(function () {
        if (mine !== seq || document.activeElement !== input) return;
        render(q);
      });
    }, 120);
  }

  function setup(input) {
    if (input.__agmSuggest) return;
    input.__agmSuggest = true;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("autocomplete", "off");
    input.addEventListener("input", function () { update(input); });
    input.addEventListener("focus", function () { current = input; if ((input.value || "").length >= MIN) update(input); });
    input.addEventListener("blur", function () { window.setTimeout(function () { if (document.activeElement !== input) close(); }, 120); });
    input.addEventListener("keydown", function (e) {
      if (!panel || panel.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active < 0 ? -1 : active - 1); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Enter" && active >= 0) {
        e.preventDefault();
        var o = panel.querySelectorAll("[role=option]:not([aria-disabled=true])")[active];
        if (o) go(o.getAttribute("data-hash"));
      }
    });
  }

  function scan() {
    document.querySelectorAll(INPUTS).forEach(setup);
  }

  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, { passive: true });
  window.addEventListener("hashchange", close);
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
