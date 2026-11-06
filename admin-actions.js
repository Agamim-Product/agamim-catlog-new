/*
 * Admin actions (portal admin only; consumers never see any of this).
 *  - an actions menu on every dataset: edit, disable (block) / enable (open), delete
 *  - an edit button with a pencil icon on the dataset page, and an edit dialog
 *  - the "+ add dataset" button next to the "מאגרי נתונים" heading (and on the catalog page)
 *  - a "restore deleted datasets" button when something was deleted
 * There is no backend: edits, deletions and access choices are kept in this browser
 * (see datasets-overlay.js), like datasets added with the form.
 */
(function () {
  "use strict";

  var raf = 0;
  var menu = null;
  var menuOpener = null;

  var ICON = {
    dots: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    ban: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    undo: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>'
  };

  function isAdmin() {
    return typeof window.__agamimIsAdmin === "function" ? window.__agamimIsAdmin() : true;
  }

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function quoted(name) {
    return name ? " “" + name + "”" : "";
  }
  function hashRepoId() {
    var m = /#\/repo\/(\d+)/.exec(location.hash || "");
    return m ? m[1] : null;
  }

  /* ---------- the actions the menu runs ---------- */
  function doToggle(id, name, blockedNow) {
    var q = blockedNow
      ? "לפתוח את המאגר" + quoted(name) + " לגישה?"
      : "להשבית (לחסום) את המאגר" + quoted(name) + "? משתמשים לא יוכלו לפתוח אותו.";
    if (!window.confirm(q)) return;
    window.__agamimAccess.set(id, !blockedNow);
    location.reload();
  }
  function doDelete(id, name) {
    var q = "למחוק את המאגר" + quoted(name) + "? הוא יוסתר בדפדפן הזה, ואפשר לשחזר אותו בכפתור “שחזור מאגרים שנמחקו”.";
    if (!window.confirm(q)) return;
    window.__agamimDeleted.add(id);
    if (hashRepoId() === String(id)) location.hash = "#/";
    location.reload();
  }

  /* ---------- the menu ---------- */
  function closeMenu(returnFocus) {
    if (!menu) return;
    var opener = menuOpener;
    menu.remove();
    menu = null;
    menuOpener = null;
    if (opener) {
      opener.setAttribute("aria-expanded", "false");
      if (returnFocus) opener.focus();
    }
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onMenuKey, true);
  }
  function onOutside(e) {
    if (menu && !menu.contains(e.target) && e.target !== menuOpener && !(menuOpener && menuOpener.contains(e.target))) closeMenu(false);
  }
  function onMenuKey(e) {
    if (!menu) return;
    var items = Array.prototype.slice.call(menu.querySelectorAll("[role=menuitem]"));
    var i = items.indexOf(document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length].focus();
    } else if (e.key === "Tab") {
      closeMenu(false);
    }
  }
  function openMenu(btn, id, name, blocked) {
    if (menu && menuOpener === btn) {
      closeMenu(true);
      return;
    }
    closeMenu(false);
    var items = [
      ["edit", ICON.pencil, "עריכה", false],
      ["toggle", blocked ? ICON.check : ICON.ban, blocked ? "פתיחה לגישה" : "השבתה", false],
      ["delete", ICON.trash, "מחיקה", true]
    ];
    menu = el("div", { class: "agm-menu", role: "menu", "aria-label": "פעולות למאגר" + quoted(name) });
    items.forEach(function (it) {
      var b = el("button", { type: "button", role: "menuitem", class: "agm-menu-item" + (it[3] ? " agm-menu-item--danger" : "") }, it[1] + "<span>" + it[2] + "</span>");
      b.addEventListener("click", function () {
        var which = it[0];
        closeMenu(false);
        if (which === "edit") openEdit(id, btn);
        if (which === "toggle") doToggle(id, name, blocked);
        if (which === "delete") doDelete(id, name);
      });
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    var r = btn.getBoundingClientRect();
    var w = menu.offsetWidth;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    menu.style.top = Math.round(r.bottom + window.scrollY + 6) + "px";
    menu.style.left = Math.round(left + window.scrollX) + "px";
    menuOpener = btn;
    btn.setAttribute("aria-expanded", "true");
    menu.querySelector("[role=menuitem]").focus();
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onMenuKey, true);
  }
  function kebab(id, name, blockedFn) {
    var b = el("button", { type: "button", class: "agm-kebab", "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": "פעולות למאגר" + quoted(name), title: "פעולות" }, ICON.dots);
    b.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      openMenu(b, id, name, blockedFn());
    });
    return b;
  }

  /* ---------- the edit dialog ---------- */
  var FIELDS = [
    ["nameHe", "שם המאגר", "text", true],
    ["purposeHe", "מטרת המאגר", "textarea", false],
    ["ownerHe", "בעל המאגר", "text", true],
    ["ownerPhone", "טלפון בעל המאגר", "tel", false],
    ["stewardHe", "אחראי נתונים", "text", false],
    ["custodianHe", "גורם אפוטרופוס", "text", false]
  ];
  var dialog = null;

  function closeDialog(opener) {
    if (!dialog) return;
    document.removeEventListener("keydown", onDialogKey, true);
    dialog.remove();
    dialog = null;
    document.documentElement.classList.remove("agm-modal-lock");
    if (opener && opener.focus) opener.focus();
  }
  var dialogOpener = null;
  function onDialogKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeDialog(dialogOpener);
      return;
    }
    if (e.key !== "Tab" || !dialog) return;
    var f = dialog.querySelectorAll("input, textarea, button");
    if (!f.length) return;
    var first = f[0];
    var last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function openEdit(id, opener) {
    closeDialog(null);
    dialogOpener = opener || null;
    fetch("data/consumer/repositories__" + id + ".json")
      .then(function (r) { return r.json(); })
      .catch(function () { return {}; })
      .then(function (d) {
        var form = el("form", { class: "agm-edit-form", novalidate: "" });
        var inputs = {};
        FIELDS.forEach(function (f) {
          var wrap = el("div", { class: "agm-edit-field" });
          var lab = el("label", { for: "agm-e-" + f[0] }, f[1] + (f[3] ? ' <i aria-hidden="true">*</i>' : ""));
          var inp = el(f[2] === "textarea" ? "textarea" : "input", { id: "agm-e-" + f[0], name: f[0], autocomplete: "off" });
          if (f[2] === "textarea") inp.setAttribute("rows", "3");
          else inp.setAttribute("type", f[2]);
          if (f[2] === "tel") inp.setAttribute("inputmode", "tel");
          inp.value = d && typeof d[f[0]] === "string" ? d[f[0]] : "";
          var err = el("p", { class: "agm-edit-err", "aria-live": "polite" });
          wrap.appendChild(lab);
          wrap.appendChild(inp);
          wrap.appendChild(err);
          form.appendChild(wrap);
          inputs[f[0]] = { input: inp, err: err, required: f[3], label: f[1] };
        });
        var actions = el("div", { class: "agm-edit-actions" });
        var save = el("button", { type: "submit", class: "agm-btn agm-btn--primary" }, "שמירת השינויים");
        var cancel = el("button", { type: "button", class: "agm-btn" }, "ביטול");
        actions.appendChild(save);
        actions.appendChild(cancel);
        form.appendChild(actions);

        cancel.addEventListener("click", function () { closeDialog(dialogOpener); });
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var ok = true;
          var firstBad = null;
          var out = {};
          Object.keys(inputs).forEach(function (k) {
            var v = inputs[k].input.value.trim();
            var msg = "";
            if (inputs[k].required && !v) msg = "חובה למלא: " + inputs[k].label;
            if (k === "ownerPhone" && v && !/^[0-9+\-()\s*]{7,20}$/.test(v)) msg = "מספר טלפון לא תקין";
            inputs[k].err.textContent = msg;
            inputs[k].input.classList.toggle("agm-bad", !!msg);
            if (msg) {
              ok = false;
              if (!firstBad) firstBad = inputs[k].input;
            }
            out[k] = v;
          });
          if (!ok) {
            firstBad.focus();
            return;
          }
          window.__agamimEdits.set(id, out);
          location.reload();
        });

        var title = el("h2", { id: "agm-edit-title" }, ICON.pencil + "<span>עריכת מאגר</span>");
        var closeBtn = el("button", { type: "button", class: "agm-edit-x", "aria-label": "סגירה" }, "✕");
        closeBtn.addEventListener("click", function () { closeDialog(dialogOpener); });
        var back = el("div", { class: "agm-edit-back" });
        back.addEventListener("click", function () { closeDialog(dialogOpener); });
        var panel = el("div", { class: "agm-edit-panel" });
        var head = el("header", {});
        head.appendChild(title);
        head.appendChild(closeBtn);
        panel.appendChild(head);
        panel.appendChild(form);
        dialog = el("div", { class: "agm-edit", role: "dialog", "aria-modal": "true", "aria-labelledby": "agm-edit-title" });
        dialog.appendChild(back);
        dialog.appendChild(panel);
        document.body.appendChild(dialog);
        document.documentElement.classList.add("agm-modal-lock");
        document.addEventListener("keydown", onDialogKey, true);
        inputs.nameHe.input.focus();
      });
  }

  /* ---------- placing the controls ---------- */
  function rowName(a) {
    var n = a.querySelector(".font-bold");
    return n ? n.textContent.trim() : "";
  }

  function enhanceRows() {
    document.querySelectorAll("ol.card.divide-y > li > a").forEach(function (a) {
      if (a.querySelector(".agm-kebab")) return;
      var id = (/#\/repo\/(\d+)/.exec(a.getAttribute("href") || "") || [])[1];
      if (!id) return;
      var k = kebab(id, rowName(a), function () { return !!a.querySelector(".agm-status--blocked"); });
      a.insertBefore(k, a.lastElementChild);
    });
  }

  /* catalog cards: the same actions menu in the card header */
  function enhanceCards() {
    document.querySelectorAll("article.card[aria-label]").forEach(function (card) {
      if (card.querySelector(".agm-kebab")) return;
      var head = card.firstElementChild;
      var idEl = card.querySelector("h3 bdi");
      var id = idEl ? String(parseInt(idEl.textContent, 10)) : "";
      if (!head || !id || id === "NaN") return;
      var name = card.getAttribute("aria-label") || "";
      var k = kebab(id, name, function () {
        return !!card.querySelector('[role="img"][aria-label*="חסומה"]');
      });
      k.classList.add("agm-card-kebab");
      head.appendChild(k);
    });
  }

  function addButton(onOrange) {
    var a = el("a", { class: "agm-add-btn" + (onOrange ? " agm-add-btn--on-orange" : ""), href: "./add-dataset.html" }, ICON.plus + "<span>הוספת מאגר</span>");
    return a;
  }
  function restoreButton(n, onOrange) {
    var b = el("button", { type: "button", class: "agm-restore" + (onOrange ? " agm-restore--on-orange" : "") }, ICON.undo + "<span>שחזור מאגרים שנמחקו (" + n + ")</span>");
    b.addEventListener("click", function () {
      if (!window.confirm("לשחזר את כל המאגרים שנמחקו בדפדפן הזה?")) return;
      window.__agamimDeleted.restoreAll();
      location.reload();
    });
    return b;
  }

  function placeToolbars() {
    var deleted = window.__agamimDeleted ? window.__agamimDeleted.load().length : 0;
    var targets = [];
    var homeHead = document.querySelector("main section > div.mb-3 > h2");
    if (homeHead && homeHead.parentElement) targets.push([homeHead.parentElement, true]);
    var catHead = document.querySelector("main div.mb-4.flex.flex-wrap.items-end.justify-between");
    if (catHead && catHead.querySelector("h1")) targets.push([catHead, false]);
    targets.forEach(function (t) {
      var host = t[0];
      if (host.querySelector(".agm-add-btn")) return;
      var group = el("div", { class: "agm-tools" });
      if (deleted) group.appendChild(restoreButton(deleted, t[1]));
      group.appendChild(addButton(t[1]));
      host.appendChild(group);
    });
  }

  function repoPage() {
    var id = hashRepoId();
    var bar = document.querySelector("header.card .flex.flex-wrap.items-center.gap-2");
    var old = document.querySelector(".agm-admin-edit");
    if (!id || !bar) {
      if (old) old.remove();
      document.querySelectorAll(".agm-page-kebab").forEach(function (n) { n.remove(); });
      return;
    }
    var title = document.querySelector("header.card h1");
    var name = title ? title.textContent.replace(/^[^֐-׿]*/, "").trim() : "";
    if (old && old.getAttribute("data-repo") === id) return;
    if (old) old.remove();
    document.querySelectorAll(".agm-page-kebab").forEach(function (n) { n.remove(); });
    var edit = el("button", { type: "button", class: "btn btn-ghost agm-admin-edit", "data-repo": id }, ICON.pencil + "<span>עריכה</span>");
    edit.addEventListener("click", function () { openEdit(id, edit); });
    var k = kebab(id, name, function () {
      var sw = document.querySelector(".agm-admin-switch");
      return !!sw && sw.getAttribute("data-blocked") === "true";
    });
    k.classList.add("agm-page-kebab");
    bar.insertBefore(k, bar.firstChild);
    bar.insertBefore(edit, bar.firstChild);
  }

  function removeAll() {
    document.querySelectorAll(".agm-kebab, .agm-tools, .agm-admin-edit").forEach(function (n) { n.remove(); });
    closeMenu(false);
  }

  function run() {
    raf = 0;
    try {
      if (!isAdmin() || !window.__agamimAccess || !window.__agamimEdits) {
        removeAll();
        return;
      }
      enhanceRows();
      enhanceCards();
      placeToolbars();
      repoPage();
    } catch (e) {}
  }
  function schedule() {
    if (!raf) raf = requestAnimationFrame(run);
  }
  window.addEventListener("hashchange", function () { closeMenu(false); schedule(); });
  window.addEventListener("load", schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
