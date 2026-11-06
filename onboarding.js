/*
 * First-visit profile screen.
 * Shows a full-screen form (name, role, rank, hierarchy, estimated end-of-role date)
 * until a profile is saved. The profile lives in localStorage and is exposed as
 * window.__agamimProfile so the app's home page can greet the user by role.
 */
(function () {
  "use strict";

  var KEY = "agamim-profile-v1";

  var RANKS = [
    "טוראי",
    "רב״ט",
    "סמל",
    "סמל ראשון",
    "רב סמל",
    "רב סמל בכיר",
    "רב נגד",
    "סגן",
    "סרן",
    "רב סרן",
    "סגן אלוף",
    "אלוף משנה",
    "תת אלוף",
    "אלוף",
    "אזרח צה״ל"
  ];

  var TEXT = {
    he: {
      title: "ברוכים הבאים",
      subtitle: "נשמח להכיר אתכם לפני הכניסה למפעל הנתונים הלאומי",
      name: "שם",
      role: "תפקיד",
      rank: "דרגה",
      rankPlaceholder: "בחרו דרגה",
      hierarchy: "היררכיה",
      endDate: "תאריך סיום תפקיד משוער",
      submit: "המשך",
      required: "שדה חובה"
    },
    en: {
      title: "Welcome",
      subtitle: "Tell us a little about yourself before entering the National Data Factory",
      name: "Name",
      role: "Role",
      rank: "Rank",
      rankPlaceholder: "Select rank",
      hierarchy: "Hierarchy",
      endDate: "Estimated end-of-role date",
      submit: "Continue",
      required: "Required"
    }
  };

  function load() {
    try {
      var p = JSON.parse(localStorage.getItem(KEY) || "null");
      if (p && p.name && p.role && p.rank && p.endDate) return p;
    } catch (e) {}
    return null;
  }

  function save(profile) {
    try {
      localStorage.setItem(KEY, JSON.stringify(profile));
      return true;
    } catch (e) {
      return false;
    }
  }

  function lang() {
    try {
      return localStorage.getItem("lang") === "en" ? "en" : "he";
    } catch (e) {
      return "he";
    }
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      node.appendChild(c);
    });
    return node;
  }

  function field(id, label, control, errorId) {
    return el("div", { class: "ob-field" }, [
      el("label", { for: id, text: label }),
      control,
      el("p", { class: "ob-error", id: errorId, role: "alert" })
    ]);
  }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function build() {
    var l = lang();
    var t = TEXT[l];

    var name = el("input", { id: "ob-name", type: "text", autocomplete: "name", required: "" });
    var role = el("input", { id: "ob-role", type: "text", required: "" });
    var rank = el("select", { id: "ob-rank", required: "" }, [
      el("option", { value: "", text: t.rankPlaceholder })
    ].concat(RANKS.map(function (r) { return el("option", { value: r, text: r }); })));
    var hierarchy = el("input", { id: "ob-hierarchy", type: "text", value: "HFC", readonly: "", tabindex: "-1" });
    var endDate = el("input", { id: "ob-end", type: "date", min: todayISO(), required: "" });

    var form = el("form", { class: "ob-card", novalidate: "" }, [
      el("div", { class: "ob-logos" }, [
        el("img", { src: "./pakar-logo.svg", alt: "פיקוד העורף" }),
        el("img", { src: "./agamim-emblem.png", alt: "סמל ענף אגמים" }),
        el("img", { src: "./agamim-logo.png", alt: "ענף אגמים" })
      ]),
      el("h1", { text: t.title }),
      el("p", { class: "ob-sub", text: t.subtitle }),
      field("ob-name", t.name, name, "ob-name-err"),
      field("ob-role", t.role, role, "ob-role-err"),
      field("ob-rank", t.rank, rank, "ob-rank-err"),
      field("ob-hierarchy", t.hierarchy, hierarchy, "ob-hierarchy-err"),
      field("ob-end", t.endDate, endDate, "ob-end-err"),
      el("button", { type: "submit", class: "ob-submit", text: t.submit })
    ]);

    var overlay = el("div", {
      id: "agamim-onboarding",
      dir: l === "he" ? "rtl" : "ltr",
      lang: l,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": t.title
    }, [form]);

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var checks = [
        [name, "ob-name-err"],
        [role, "ob-role-err"],
        [rank, "ob-rank-err"],
        [endDate, "ob-end-err"]
      ];
      var firstBad = null;
      checks.forEach(function (c) {
        var ok = c[0].value.trim() !== "";
        document.getElementById(c[1]).textContent = ok ? "" : t.required;
        c[0].classList.toggle("ob-invalid", !ok);
        if (!ok && !firstBad) firstBad = c[0];
      });
      if (firstBad) {
        firstBad.focus();
        return;
      }
      var saved = save({
        name: name.value.trim(),
        role: role.value.trim(),
        rank: rank.value,
        hierarchy: "HFC",
        endDate: endDate.value,
        createdAt: new Date().toISOString()
      });
      if (!saved) return;
      // Reload so the app starts with the profile available.
      window.location.reload();
    });

    return { overlay: overlay, first: name };
  }

  window.__agamimProfile = load();

  // The app marks a completed sign-in (after MFA) by writing {signedIn:true}
  // to sessionStorage under "auth". The profile form is shown right after that.
  var AUTH_KEY = "auth";
  var overlay = null;

  function signedIn() {
    try {
      var a = JSON.parse(sessionStorage.getItem(AUTH_KEY) || "null");
      return !!(a && a.signedIn);
    } catch (e) {
      return false;
    }
  }

  function hide() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    document.documentElement.classList.remove("ob-lock");
  }

  function show() {
    if (overlay || !document.body) return;
    var ui = build();
    overlay = ui.overlay;
    document.body.appendChild(overlay);
    document.documentElement.classList.add("ob-lock");
    ui.first.focus();
  }

  function sync() {
    if (signedIn() && !load()) show();
    else hide();
  }

  // Same-tab sessionStorage writes fire no event, so watch the app's own calls.
  var proto = Storage.prototype;
  var origSet = proto.setItem;
  var origRemove = proto.removeItem;
  proto.setItem = function (k) {
    var r = origSet.apply(this, arguments);
    if (this === window.sessionStorage && k === AUTH_KEY) sync();
    return r;
  };
  proto.removeItem = function (k) {
    var r = origRemove.apply(this, arguments);
    if (this === window.sessionStorage && k === AUTH_KEY) sync();
    return r;
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync);
  else sync();
})();
