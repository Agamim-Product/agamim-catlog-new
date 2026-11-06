/*
 * Add-dataset page for product managers.
 *  1. Pick a table the data-engineering (DE) team already loaded -> technical fields auto-fill.
 *  2. Enter the manual details (name, owner, phone, purpose, ...).
 *  3. Review, save in this browser (shows up in the catalog) and export a package for publishing.
 */
(function () {
  "use strict";

  // ------------------------------------------------------------------ guard
  function signedIn() {
    try {
      var a = JSON.parse(sessionStorage.getItem("auth") || "null");
      if (a && a.signedIn) return true;
    } catch (e) {}
    try { return localStorage.getItem("qa-seeded") === "1"; } catch (e) { return false; }
  }
  if (!signedIn()) { location.replace("./"); return; }
  // consumers cannot register datasets
  try { var __a = JSON.parse(sessionStorage.getItem("auth") || "null"); if (__a && __a.role === "consumer") { location.replace("./"); return; } } catch (e) {}

  var STAGING_URL = "./data/staging/db-tables.json";
  var DRAFT_KEY = "agamim-dataset-draft-v1";
  var store = window.__agamimLocalDatasets;
  var app = document.getElementById("app");

  // ------------------------------------------------------------------ side-panel mode
  // When shown inside the catalog's side panel (admin-drawer.js) the page runs with ?embed=1.
  var EMBED = window.parent !== window && /[?&]embed=1(&|$)/.test(location.search);
  if (EMBED) {
    document.body.classList.add("embed");
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") tell("agamim-drawer-close"); });
  }
  function tell(type, data) {
    if (!EMBED) return;
    try { window.parent.postMessage(Object.assign({ type: type }, data || {}), location.origin); } catch (e) {}
  }
  // In the panel, open the dataset in the main window (and let it refresh); otherwise a normal link.
  function openRepo(id, ev) {
    if (!EMBED) return;
    ev.preventDefault();
    tell("agamim-dataset-open", { repoId: id });
  }

  var CADENCE = { daily: "יומית", onChange: "בעת שינוי" };
  var CLASS_LABEL = { 1: "רמה 1: מידע שאינו אישי", 2: "רמה 2: מידע פנימי", 3: "רמה 3: מידע מוגבל" };
  var CHANNELS = ["פורטל", "API", "GeoJSON", "הורדת CSV"];

  // ------------------------------------------------------------------ small helpers
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === "text") n.textContent = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (k === "value") n.value = v;
      else if (k === "checked") n.checked = !!v;
      else n.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function fmtDate(s) { if (!s) return "—"; var d = new Date(s); if (isNaN(d)) return s; return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear(); }
  function fmtNum(n) { return Number(n).toLocaleString("he-IL"); }
  function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hash(s) { var h = 1779033703 ^ s.length; for (var i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
  function rng(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function addDays(dateStr, n) { var d = new Date(dateStr + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()); }
  function addMinutes(hhmm, n) { var p = hhmm.split(":"); var t = (+p[0]) * 60 + (+p[1]) + n; return pad2(Math.floor(t / 60) % 24) + ":" + pad2(t % 60); }
  function lines(s) { return String(s || "").split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function lastSeg(sql) { var p = String(sql).split("."); return p[p.length - 1]; }

  // Israeli phone: 05X-XXXXXXX / 0X-XXXXXXX / +972... / *NNNN
  function normPhone(raw) {
    var s = String(raw || "").replace(/[\s\-().]/g, "");
    if (/^\*\d{3,5}$/.test(s)) return s;
    if (/^\+972\d{8,9}$/.test(s)) { var r = s.slice(4); return "+972-" + r.slice(0, r.length - 7) + "-" + r.slice(-7); }
    if (/^0\d{8,9}$/.test(s)) return s.slice(0, s.length - 7) + "-" + s.slice(-7);
    return null;
  }

  // ------------------------------------------------------------------ state
  var S = {
    step: 1,
    tables: [],
    taken: {},          // sqlName -> true (already in the catalog)
    sqlName: "",
    ids: { repoId: 4, layerId: 6455 },
    siblings: [],       // repositories already in the catalog (for lineage)
    errors: {},
    saved: null,
    saveError: "",
    m: defaults()
  };

  // What the PM fills in.
  function defaults() {
    return {
      nameHe: "", purposeHe: "",
      ownerHe: "", ownerPhone: "",
      stewardHe: "ראש צוות Data Engineering", custodianHe: "צוות מפעל המידע",
      routineDays: "1", emergencyHours: "3"
    };
  }

  // Everything the form does not ask for. All data in the catalog is public, so
  // classification, status and access are fixed; English fields mirror the Hebrew ones.
  function withFixed(m) {
    return Object.assign({}, m, {
      nameEn: m.nameHe, purposeEn: m.purposeHe, ownerEn: m.ownerHe,
      classification: "1", core: "public", valueLevel: "operational", phase: "POC", status: "approved",
      restricted: false, blockedHe: "", blockedEn: "",
      sources: "", consumers: "", channels: CHANNELS.slice(),
      requirements: [], exitCriteria: "",
      operatingModes: "זמין בכל מצבי ההפעלה 0–3, ללא שינוי הרשאה"
    });
  }

  function tech() { return S.tables.filter(function (t) { return t.sqlName === S.sqlName; })[0] || null; }

  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ sqlName: S.sqlName, m: S.m })); } catch (e) {}
  }
  function loadDraft() {
    try {
      var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (d && d.m && d.sqlName) { S.sqlName = d.sqlName; S.m = Object.assign(defaults(), d.m); }
    } catch (e) {}
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }

  // ------------------------------------------------------------------ form widgets
  function field(label, name, o) {
    o = o || {};
    var id = "f-" + name;
    var common = { id: id, name: name };
    var ctl;
    if (o.type === "textarea") {
      ctl = el("textarea", Object.assign({ rows: o.rows || 3, placeholder: o.placeholder || "" }, common, { value: S.m[name] }));
    } else if (o.type === "select") {
      ctl = el("select", common, o.options.map(function (op) { return el("option", { value: op[0], text: op[1] }); }));
      ctl.value = S.m[name];
    } else {
      ctl = el("input", Object.assign({ type: o.type || "text", placeholder: o.placeholder || "", dir: o.ltr ? "ltr" : null, inputmode: o.inputmode || null, min: o.min || null }, common, { value: S.m[name] }));
    }
    var evt = o.type === "select" ? "change" : "input";
    ctl.addEventListener(evt, function () { S.m[name] = ctl.value; saveDraft(); if (S.errors[name]) { delete S.errors[name]; paintErrors(); } });
    return el("div", { class: "ad-f" + (o.full ? " full" : "") }, [
      el("label", { for: id }, [label, o.required ? el("i", { text: "*" }) : null]),
      ctl,
      o.hint ? el("p", { class: "hint", text: o.hint }) : null,
      el("p", { class: "err", id: "err-" + name, role: "alert" })
    ]);
  }

  function paintErrors() {
    Array.prototype.forEach.call(document.querySelectorAll('.err[id^="err-"]'), function (p) {
      var name = p.id.replace(/^err-/, "");
      p.textContent = S.errors[name] || "";
      var ctl = document.getElementById("f-" + name);
      if (ctl) ctl.classList.toggle("bad", !!S.errors[name]);
    });
  }

  // ------------------------------------------------------------------ package builder
  function classDisplay(c) { return (CLASS_LABEL[c] || CLASS_LABEL[1]) + " · מבצעי"; }

  function buildPackage(t, m, ids, siblings) {
    m = withFixed(m);
    var repoId = ids.repoId, layerId = ids.layerId;
    var r = rng(hash(t.sqlName));
    var cls = parseInt(m.classification, 10) || 1;
    var restricted = !!m.restricted;
    var blocked = restricted ? { reasonHe: m.blockedHe.trim(), reasonEn: m.blockedEn.trim() || m.blockedHe.trim() } : null;
    var accessState = restricted ? "blocked" : "granted";
    var today_ = today();
    var changedAt = String(t.lastUpdated).slice(0, 10);

    // ---- group / dim
    var sameDb = siblings.filter(function (s) { return s.group && s.group.db === t.dbName; });
    var group = {
      db: t.dbName,
      en: "GIS layers (" + t.dbName + ")",
      he: "שכבות GIS (" + t.dbName + ")",
      health: { ok: true, layers: sameDb.length + 1, lastLoad: t.loadTime, unlinked: 0, layersTotal: sameDb.length + 1 },
      pipeline: [
        { at: t.loadTime, en: t.dbName, he: t.dbName, key: "source" },
        { at: t.loadTime, en: "Ingestion", he: "קליטה", key: "ingest" },
        { at: addMinutes(t.loadTime, 4), en: "Portal", he: "פורטל", key: "portal" }
      ]
    };
    var dim = { cadence: t.cadence, version: t.version, changedAt: changedAt, checkedAt: t.loadTime, publishedAt: today_ };

    // ---- quality + SLO (DE metrics; trend/history series are illustrative)
    var qv = t.quality, vals = [qv.completeness, qv.timeliness, qv.consistency, qv.accuracy, qv.uniqueness];
    var min = Math.min.apply(null, vals), avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    var trend = []; for (var i = 0; i < 12; i++) trend.push(clamp(Math.round(avg + (r() - 0.5) * 4), 80, 100));
    var quality = {
      repoId: repoId, completeness: qv.completeness, timeliness: qv.timeliness, consistency: qv.consistency,
      accuracy: qv.accuracy, uniqueness: qv.uniqueness, verdict: min >= 95 ? "verified" : "review",
      freshnessMin: t.freshnessMin, trend: trend
    };
    function hist(base, spread, dec) { var a = []; for (var k = 0; k < 12; k++) { var v = base + (r() - 0.5) * 2 * spread; a.push(dec ? Math.round(v * 100) / 100 : Math.round(v)); } return a; }
    var availability = Math.round((99.2 + r() * 0.7) * 10) / 10;
    var slo = [
      { id: 9000 + repoId * 10 + 1, repoId: repoId, metric: "freshness", unit: "min", target: t.cadence === "daily" ? 1440 : 10080, measured: t.freshnessMin, higherIsBetter: false, history: hist(t.freshnessMin, t.freshnessMin * 0.08, false), synthetic: true },
      { id: 9000 + repoId * 10 + 2, repoId: repoId, metric: "availability", unit: "%", target: 99, measured: availability, higherIsBetter: true, history: hist(availability, 0.12, true), synthetic: true }
    ];

    // ---- card
    var geomCol = t.columns.filter(function (c) { return c.geometry; })[0];
    var invalidGeom = geomCol ? (geomCol.invalidGeom || 0) : 0;
    var routine = String(parseInt(m.routineDays, 10) || 1), emerg = String(parseInt(m.emergencyHours, 10) || 3);
    var validation = [
      { en: "Rows in the table (of " + fmtNum(t.rowCount) + ")", he: "רשומות בטבלה (מתוך " + fmtNum(t.rowCount) + ")", ok: true, target: String(t.rowCount), measured: String(t.rowCount) }
    ];
    if (geomCol) validation.push({ en: "Invalid geometries", he: "גיאומטריות לא תקינות", ok: invalidGeom === 0, target: "0", measured: String(invalidGeom) });
    validation.push(
      { en: "Duplicate records in the layer", he: "כפילויות רשומה בשכבה", ok: qv.uniqueness >= 100, target: "0", measured: qv.uniqueness >= 100 ? "0" : "—" },
      { en: "Load frequency (days)", he: "תדירות טעינה (ימים)", ok: true, target: "≤ 1", measured: "1" },
      { en: "Version retention (days)", he: "שמירת גרסאות (ימים)", ok: true, target: "14", measured: "14" },
      { en: "Alert after no update (hours)", he: "התראה ללא עדכון (שעות)", ok: true, target: "> 48", measured: String(Math.max(1, Math.round(t.freshnessMin / 60))) },
      { en: "First response, routine (business days)", he: "תגובה ראשונה, שגרה (ימי עבודה)", ok: true, target: "≤ " + routine, measured: "—", commitment: true },
      { en: "First response, emergency (hours)", he: "תגובה ראשונה, חירום (שעות)", ok: true, target: "≤ " + emerg, measured: "—", commitment: true }
    );
    var sources = lines(m.sources).concat([
      t.dbName + ": " + m.nameHe + " (" + t.sqlName + "), גישת קריאה בלבד",
      "תדירות טעינה: " + (CADENCE[t.cadence] || t.cadence) + " · גרסה נוכחית: " + t.version
    ]);
    var owner = slug(m.ownerEn) || "data-owner";
    var yaml = [
      'id: "' + pad2(repoId) + '"',
      "name: " + lastSeg(t.sqlName) + "   # table: " + lastSeg(t.sqlName),
      "owner: " + owner,
      "steward: " + (slug(m.stewardHe) || "data-engineering-team-lead"),
      "custodian: " + (slug(m.custodianHe) || "information-factory-team"),
      "network: public",
      "pipeline: " + t.dbName + " > ingestion_db > portal_api",
      "source: { system: " + t.dbName + ", layer: " + lastSeg(t.sqlName) + ", format: PostGIS }",
      "refresh: " + t.cadence,
      "retention: latest_version",
      "columns:"
    ].concat(t.columns.map(function (c) { return "  - { name: " + c.name + ", type: " + c.type + ", nullable: " + (c.nullable ? "true" : "false") + " }"; })).concat([
      "validation:",
      "  unique: primary key per layer (duplicate fails the load)",
      "  invalid_geometry: record rejected",
      "support_sla:",
      "  hours: Sun-Thu 09:00-18:00",
      "  first_response: { routine: " + routine + " business day, emergency: " + emerg + " hours }"
    ]).join("\n");

    var pfx = "DS" + pad2(repoId);
    var reqs = m.requirements.filter(function (q) { return q.textHe.trim(); }).map(function (q, i) {
      return { id: pfx + "-" + pad2(i + 1), kind: "BR", textHe: q.textHe.trim(), textEn: q.textEn.trim() || q.textHe.trim(), priority: q.priority, phase: m.phase };
    });
    var platform = [
      { id: pfx + "-90", kind: "BR", textHe: "מבנה נתונים אחיד (טבלת שכבה אחת)", textEn: "A unified data structure (one layer table)", priority: "must", phase: m.phase },
      { id: pfx + "-91", kind: "BR", textHe: "תמיכה: זמני תגובה בשגרה ובחירום וערוץ פנייה", textEn: "Support: routine and emergency response times and a contact channel", priority: "should", phase: m.phase }
    ];
    var card = {
      dim: clone(dim), group: clone(group), cadence: t.cadence, display: classDisplay(cls),
      sources: sources, channels: m.channels.slice(), consumers: lines(m.consumers),
      synthetic: true, validation: validation, contractYaml: yaml,
      exitCriteria: m.exitCriteria.trim() || "קריטריון POC: טעינה תקינה של הטבלה ברוב המחזורים, וצרכן ראשון אחד פעיל.",
      operatingModes: m.operatingModes.trim()
    };

    var repoList = {
      id: repoId, nameHe: m.nameHe.trim(), nameEn: m.nameEn.trim(),
      core: m.core, valueLevel: m.valueLevel, phase: m.phase,
      ownerHe: m.ownerHe.trim(), ownerEn: m.ownerEn.trim(), ownerPhone: normPhone(m.ownerPhone), createdAt: t.createdAt,
      classification: cls, sensitivity: cls, status: m.status, priority: false, contractPending: false, rice: null,
      accessState: accessState, restricted: restricted, blocked: blocked,
      group: group, dim: dim, docs: t.docs,
      purposeHe: m.purposeHe.trim(), purposeEn: m.purposeEn.trim(),
      custodianHe: m.custodianHe.trim(), stewardHe: m.stewardHe.trim(),
      quality: quality, slo: slo, sloStatus: "ok", sloBreaches: []
    };
    var repo = Object.assign(clone(repoList), { card: card, requirements: reqs, platformRequirements: platform });

    // ---- layer
    var layerList = {
      liveSource: null, id: layerId, repoId: repoId, repoNameHe: repoList.nameHe, repoNameEn: repoList.nameEn,
      dbName: t.dbName, sqlName: t.sqlName, titleHe: repoList.nameHe, titleEn: repoList.nameEn,
      tier: "curated", kind: t.kind, geometry: t.geometry, ownerHe: repoList.ownerHe, cadence: t.cadence,
      hasPii: false, classification: cls, accessState: accessState, restricted: restricted, blocked: blocked, grouped: true
    };
    if (!restricted) {
      layerList.rowCount = t.rowCount; layerList.lastUpdated = t.lastUpdated; layerList.columnCount = t.columns.length;
      layerList.ageMin = t.freshnessMin; layerList.freshness = t.freshnessMin <= 2880 ? "fresh" : "stale";
    }
    var base = "https://datahub.agamim.example";
    var short = lastSeg(t.sqlName);
    var conns = [
      { id: layerId * 10 + 1, layerId: layerId, type: "rest", status: "live", endpoint: base + "/api/v1/" + t.dbName + "/curated/" + short, auth: "OAuth2 client credentials", format: "JSON / GeoJSON / CSV", limits: "100 req/min, 10k rows/page", notes: null, snippet: 'curl -H "Authorization: Bearer $TOKEN" "' + base + "/api/v1/" + t.dbName + "/curated/" + short + '?limit=100"' },
      { id: layerId * 10 + 2, layerId: layerId, type: "sql", status: "live", endpoint: "postgres://datahub.agamim.example:5432/" + t.dbName + "?sslmode=require", auth: "Kerberos / Entra ID (reader role)", format: "SQL (read-only)", limits: "Statement timeout 60s", notes: null, snippet: "-- database: " + t.dbName + "\nSELECT * FROM " + t.sqlName + " LIMIT 100;" }
    ];
    if (geomCol) {
      conns.push({ id: layerId * 10 + 3, layerId: layerId, type: "wfs", status: "live", endpoint: base + "/ogc/wfs?service=WFS&request=GetFeature&typeNames=" + t.dbName + ":" + t.sqlName, auth: "OAuth2 bearer", format: "GML / GeoJSON", limits: "5k features/request", notes: null, snippet: 'ogr2ogr -f GeoJSON out.geojson "WFS:' + base + '/ogc/wfs" ' + t.dbName + ":" + t.sqlName });
    }
    var layer = Object.assign(clone(layerList), {
      descHe: repoList.purposeHe, descEn: repoList.purposeEn, stewardHe: repoList.stewardHe, repoOwnerHe: repoList.ownerHe,
      columns: t.columns.map(function (c) { return { pk: !!c.pk, pii: !!c.pii, name: c.name, type: c.type, descEn: c.descEn, descHe: c.descHe, nullable: !!c.nullable, masked: false }; }),
      sampleRows: t.sampleRows, sampleMasked: false, connections: restricted ? [] : conns
    });

    // ---- quality profile (30 days of loads)
    var days = [], failed = t.failedLoads30, missIdx = {};
    while (Object.keys(missIdx).length < Math.min(failed, 10)) missIdx[Math.floor(r() * 29)] = true;
    var lastOkRows = t.rowCount;
    for (var d = 29; d >= 0; d--) {
      var day = addDays(changedAt, -d), miss = !!missIdx[29 - d];
      var rows = miss ? 0 : Math.max(0, Math.round(t.rowCount * (1 + (r() - 0.5) * 0.03)));
      if (!miss) lastOkRows = rows;
      days.push({ day: day, status: miss ? "missed" : "ok", rows: rows });
    }
    var qprofile = {
      restricted: false, sample: true,
      layers: [{
        layerId: layerId, sqlName: t.sqlName, titleHe: repoList.nameHe, sample: true, light: restricted ? "red" : "green",
        tiles: { lastLoad: t.lastUpdated, lastOkDay: changedAt, rowsLoaded: lastOkRows, failedLoads30: failed },
        days: days,
        columns: t.columns.map(function (c) {
          return { name: c.name, type: c.type, geometry: !!c.geometry, emptyPct: c.emptyPct, distinct: c.distinct == null ? null : c.distinct, min: c.min == null ? null : c.min, max: c.max == null ? null : c.max, invalidGeom: c.geometry ? (c.invalidGeom || 0) : null, emptyGeom: c.geometry ? (c.emptyGeom || 0) : null };
        })
      }]
    };

    // ---- lineage
    function lineage(depth) {
      var nodes = [{ id: "source:" + t.dbName, kind: "source", repoId: null, label: t.dbName }, { id: "r" + repoId, kind: "repository", repoId: repoId, label: repoList.nameHe }];
      var edges = [{ source: "source:" + t.dbName, target: "r" + repoId }];
      var apis = [];
      if (m.channels.indexOf("פורטל") >= 0) apis.push("פורטל");
      if (m.channels.indexOf("API") >= 0 || m.channels.indexOf("GeoJSON") >= 0) apis.push("API");
      apis.forEach(function (a) { nodes.push({ id: "api:" + a, kind: "api", repoId: null, label: a }); edges.push({ source: "r" + repoId, target: "api:" + a }); });
      if (depth >= 2) {
        sameDb.forEach(function (s) {
          nodes.push({ id: "r" + s.id, kind: "repository", repoId: s.id, label: s.nameHe });
          edges.push({ source: "source:" + t.dbName, target: "r" + s.id });
          apis.forEach(function (a) { edges.push({ source: "r" + s.id, target: "api:" + a }); });
        });
      }
      return { center: "r" + repoId, depth: depth, nodes: nodes, edges: edges };
    }

    // ---- sample csv
    var cols = Object.keys(t.sampleRows[0] || {});
    function csvCell(v) { var s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
    var csv = [cols.join(",")].concat(t.sampleRows.map(function (row) { return cols.map(function (c) { return csvCell(row[c]); }).join(","); })).join("\n") + "\n";

    var files = {};
    files["repositories__" + repoId + ".json"] = repo;
    files["repositories__" + repoId + "__layers.json"] = [layerList];
    files["repositories__" + repoId + "__quality-profile.json"] = qprofile;
    files["repositories__" + repoId + "__lineage__d1.json"] = lineage(1);
    files["repositories__" + repoId + "__lineage__d2.json"] = lineage(2);
    files["repositories__" + repoId + "__lineage__d3.json"] = lineage(3);
    files["layers__" + layerId + ".json"] = layer;
    files["layers__" + layerId + "__sample.json"] = { layer: t.sqlName, synthetic: true, rows: t.sampleRows };
    files["layers__" + layerId + "__sample.csv"] = csv;

    return {
      format: "agamim-dataset-package", version: 1, repoId: repoId, layerId: layerId,
      savedAt: new Date().toISOString(), list: { repo: repoList, layer: layerList }, files: files
    };
  }

  // ------------------------------------------------------------------ validation
  function validateManual() {
    var m = S.m, e = {}, req = "שדה חובה";
    ["nameHe", "purposeHe", "ownerHe"].forEach(function (k) { if (!m[k].trim()) e[k] = req; });
    if (!m.ownerPhone.trim()) e.ownerPhone = req;
    else if (!normPhone(m.ownerPhone)) e.ownerPhone = "מספר לא תקין. לדוגמה: 050-1234567, 03-1234567 או +972-50-1234567";
    if (!(parseInt(m.routineDays, 10) > 0)) e.routineDays = "מספר חיובי";
    if (!(parseInt(m.emergencyHours, 10) > 0)) e.emergencyHours = "מספר חיובי";
    return e;
  }

  // ------------------------------------------------------------------ rendering
  function render() {
    app.textContent = "";
    app.appendChild(el("h1", { class: "ad-h1", text: "הוספת מאגר נתונים" }));
    app.appendChild(el("p", { class: "ad-lead", text: "בחרו טבלה שצוות הנדסת הנתונים כבר טען למסד הנתונים. הנתונים הטכניים יתמלאו אוטומטית, ואתם משלימים את הפרטים העסקיים." }));
    if (!S.saved) app.appendChild(stepper());
    if (S.saved) app.appendChild(savedView());
    else if (S.step === 1) app.appendChild(step1());
    else if (S.step === 2) app.appendChild(step2());
    else app.appendChild(step3());
    window.scrollTo(0, 0);
  }

  function stepper() {
    var names = ["בחירת טבלה מה-DB", "פרטי המאגר", "סקירה ושמירה"];
    return el("ol", { class: "ad-steps" }, names.map(function (n, i) {
      var k = i + 1;
      return el("li", { class: "ad-step" + (S.step === k ? " on" : "") + (S.step > k ? " done" : ""), "aria-current": S.step === k ? "step" : null }, [el("b", { text: S.step > k ? "✓" : String(k) }), n]);
    }));
  }

  // ---- step 1
  function step1() {
    var sel = el("select", { id: "f-table" }, [el("option", { value: "", text: "בחרו טבלה…" })].concat(S.tables.map(function (t) {
      var taken = !!S.taken[t.sqlName];
      return el("option", { value: t.sqlName, disabled: taken, text: t.titleHe + "  ·  " + t.sqlName + (taken ? "  (כבר בקטלוג)" : "") });
    })));
    sel.value = S.sqlName;
    sel.addEventListener("change", function () {
      var prev = tech();
      S.sqlName = sel.value;
      var t = tech();
      if (t) {
        // refresh the suggested names unless the PM already changed them
        if (!S.m.nameHe || (prev && S.m.nameHe === prev.titleHe)) S.m.nameHe = t.titleHe;
      }
      saveDraft(); render();
    });

    var card = el("section", { class: "ad-card" }, [
      el("h2", { text: "1 · טבלה שנטענה על ידי צוות הנדסת הנתונים" }),
      el("p", { class: "ad-sub", text: "הרשימה מציגה טבלאות שכבר קיימות במסד הנתונים ועדיין לא רשומות בקטלוג." }),
      el("div", { class: "ad-f" }, [el("label", { for: "f-table", text: "טבלה במסד הנתונים" }), sel])
    ]);
    var t = tech();
    if (t) card.appendChild(dePanel(t));
    var wrap = el("div", {}, [card]);
    wrap.appendChild(el("div", { class: "ad-actions" }, [
      el("span"),
      el("button", { class: "ad-btn pri", type: "button", disabled: !t, text: "המשך לפרטי המאגר", onclick: function () { S.step = 2; render(); } })
    ]));
    return wrap;
  }

  function applyTechDefaults() {
    var t = tech();
    if (!t) return;
    if (!S.m.nameHe) S.m.nameHe = t.titleHe;
  }

  function dePanel(t) {
    function fact(k, v, ltr) { return el("div", { class: "ad-fact" }, [el("dt", { text: k }), el("dd", { class: ltr ? "ltr" : "", text: v })]); }
    return el("div", { class: "ad-de" }, [
      el("div", { class: "ad-de-head" }, [el("h3", { text: "נתונים טכניים מצוות הנדסת הנתונים" }), el("span", { class: "ad-badge", text: "⚡ מילוי אוטומטי · לקריאה בלבד" })]),
      el("dl", { class: "ad-facts" }, [
        fact("טבלה", t.sqlName, true), fact("מסד נתונים", t.dbName, true),
        fact("מספר שורות", fmtNum(t.rowCount)),
        fact("מספר עמודות", String(t.columns.length)), fact("תאריך יצירה", fmtDate(t.createdAt)),
        fact("עדכון אחרון", fmtDate(t.lastUpdated)), fact("גרסה", t.version),
        fact("תדירות טעינה", CADENCE[t.cadence] || t.cadence), fact("שעת טעינה אחרונה", t.loadTime),
        fact("נטען על ידי", t.loadedBy), fact("תיעוד עמודות", t.docs.documented + " מתוך " + t.docs.total)
      ]),
      el("div", { class: "ad-tablewrap" }, [el("table", { class: "ad-t" }, [
        el("thead", {}, [el("tr", {}, ["עמודה", "סוג", "מפתח", "מאפשר ריק", "ריקים %", "ערכים ייחודיים"].map(function (h) { return el("th", { text: h }); }))]),
        el("tbody", {}, t.columns.map(function (c) {
          return el("tr", {}, [el("td", { class: "ltr", text: c.name }), el("td", { class: "ltr", text: c.type }), el("td", { text: c.pk ? "כן" : "" }), el("td", { text: c.nullable ? "כן" : "לא" }), el("td", { text: String(c.emptyPct) }), el("td", { text: c.distinct == null ? "—" : fmtNum(c.distinct) })]);
        }))
      ])])
    ]);
  }

  // ---- step 2
  function step2() {
    var t = tech();
    if (!t) { S.step = 1; return step1(); }
    var m = S.m;

    var basics = el("section", { class: "ad-card" }, [
      el("h2", { text: "2 · פרטי המאגר" }),
      el("p", { class: "ad-sub", text: "טבלה נבחרת: " + t.sqlName + " · " + fmtNum(t.rowCount) + " שורות · גרסה " + t.version }),
      el("div", { class: "ad-grid" }, [
        field("שם המאגר", "nameHe", { required: true, full: true }),
        field("מטרה / תיאור", "purposeHe", { type: "textarea", required: true, full: true })
      ])
    ]);

    var owner = el("section", { class: "ad-card" }, [
      el("h2", { text: "בעל הנתונים" }),
      el("div", { class: "ad-grid" }, [
        field("שם בעל הנתונים", "ownerHe", { required: true }),
        field("טלפון בעל הנתונים", "ownerPhone", { type: "tel", required: true, ltr: true, inputmode: "tel", placeholder: "050-1234567", hint: "ניתן להזין 050-1234567, 03-1234567, +972-50-1234567 או *1234" }),
        field("אחראי נתונים (Steward)", "stewardHe", {}),
        field("גוף מתפעל (Custodian)", "custodianHe", {})
      ])
    ]);

    var sla = el("section", { class: "ad-card" }, [
      el("h2", { text: "התחייבויות תמיכה" }),
      el("div", { class: "ad-grid" }, [
        field("תגובה ראשונה בשגרה (ימי עבודה)", "routineDays", { type: "number", required: true, min: "1" }),
        field("תגובה ראשונה בחירום (שעות)", "emergencyHours", { type: "number", required: true, min: "1" })
      ])
    ]);

    var nav = el("div", { class: "ad-actions" }, [
      el("button", { class: "ad-btn", type: "button", text: "חזרה", onclick: function () { S.step = 1; render(); } }),
      el("button", { class: "ad-btn pri", type: "button", text: "המשך לסקירה", onclick: function () {
        S.errors = validateManual(); paintErrors();
        var keys = Object.keys(S.errors);
        if (keys.length) { var first = document.getElementById("f-" + keys[0]) || document.getElementById("err-" + keys[0]); if (first && first.scrollIntoView) first.scrollIntoView({ block: "center" }); if (first && first.focus) first.focus(); return; }
        S.step = 3; render();
      } })
    ]);
    return el("div", {}, [basics, owner, sla, nav]);
  }

  // ---- step 3
  function step3() {
    var t = tech(), m = S.m;
    var pkg = buildPackage(t, m, S.ids, S.siblings);
    var rp = pkg.list.repo;
    function row(k, v, ltr) { return [el("dt", { text: k }), el("dd", { dir: ltr ? "ltr" : null, style: ltr ? "text-align:right" : null, text: v })]; }
    var sum = [].concat(
      row("מזהה", "מאגר " + pad2(S.ids.repoId) + " · שכבה " + S.ids.layerId),
      row("שם", rp.nameHe),
      row("מטרה", rp.purposeHe),
      row("בעל נתונים", rp.ownerHe),
      row("טלפון", rp.ownerPhone, true),
      row("אחראי / מתפעל", rp.stewardHe + " · " + rp.custodianHe),
      row("טבלה", t.sqlName, true),
      row("שורות ועמודות", fmtNum(t.rowCount) + " שורות · " + t.columns.length + " עמודות"),
      row("גרסה ותדירות", t.version + " · " + (CADENCE[t.cadence] || t.cadence)),
      row("תמיכה", "שגרה ≤ " + m.routineDays + " ימי עבודה · חירום ≤ " + m.emergencyHours + " שעות")
    );
    var saveBtn = el("button", { class: "ad-btn pri", type: "button", text: "שמירה בדפדפן והצגה בקטלוג", onclick: function () { doSave(pkg); } });
    var card = el("section", { class: "ad-card" }, [
      el("h2", { text: "3 · סקירה ושמירה" }),
      el("p", { class: "ad-sub", text: "כך המאגר ייראה בקטלוג:" }),
      el("div", { class: "ad-prev" }, [
        el("div", { class: "num", text: pad2(S.ids.repoId) }),
        el("div", {}, [el("div", { class: "nm", text: rp.nameHe }), el("div", { class: "pp", text: rp.purposeHe })]),
        el("div", { class: "vv", text: "גרסה " + t.version + " · עודכן " + fmtDate(t.lastUpdated) })
      ]),
      el("dl", { class: "ad-sum", style: "margin-top:18px" }, sum),
      S.saveError ? el("p", { class: "err", style: "color:#b91c1c;margin-top:12px", text: S.saveError }) : null
    ]);
    return el("div", {}, [card, el("div", { class: "ad-actions" }, [
      el("button", { class: "ad-btn", type: "button", text: "חזרה לעריכה", onclick: function () { S.step = 2; render(); } }),
      saveBtn
    ])]);
  }

  function doSave(pkg) {
    try {
      var list = store.load().filter(function (d) { return d.repoId !== pkg.repoId; });
      list.push(pkg);
      store.save(list);
      clearDraft();
      S.saved = pkg; S.saveError = "";
      tell("agamim-dataset-saved", { repoId: pkg.repoId });
    } catch (e) {
      S.saveError = "השמירה בדפדפן נכשלה (ייתכן שאין מקום פנוי). ניתן לייצא את החבילה בכל זאת.";
    }
    render();
  }

  // Export format: every file is already-serialised text, written verbatim by tools/apply-package.ps1.
  function exportable(pkg) {
    var o = Object.assign({}, pkg);
    o.files = {};
    Object.keys(pkg.files).forEach(function (k) {
      var v = pkg.files[k];
      o.files[k] = typeof v === "string" ? v : JSON.stringify(v);
    });
    return o;
  }

  function download(pkg) {
    var blob = new Blob([JSON.stringify(exportable(pkg), null, 2)], { type: "application/json" });
    var a = el("a", { href: URL.createObjectURL(blob), download: "dataset-" + pkg.repoId + ".package.json" });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function savedView() {
    var p = S.saved, rp = p.list.repo;
    return el("div", {}, [
      el("section", { class: "ad-card ad-ok" }, [
        el("h2", { text: "✓ המאגר נשמר" }),
        el("p", { text: "„" + rp.nameHe + "” (מאגר " + pad2(p.repoId) + ") מופיע עכשיו בקטלוג בדפדפן הזה." }),
        el("p", { class: "ad-note", text: "כדי שכל המשתמשים יראו אותו, יש לייצא את החבילה ולהעביר אותה לצוות הפיתוח לפרסום." }),
        el("div", { class: "ad-actions", style: "justify-content:flex-start" }, [
          el("a", { class: "ad-btn pri", href: "./#/repo/" + p.repoId, text: "פתיחת המאגר בקטלוג", onclick: function (ev) { openRepo(p.repoId, ev); } }),
          el("button", { class: "ad-btn", type: "button", text: "ייצוא חבילה (JSON)", onclick: function () { download(p); } }),
          el("button", { class: "ad-btn", type: "button", text: "הוספת מאגר נוסף", onclick: function () { resetAll(); } })
        ])
      ])
    ]);
  }

  function resetAll() {
    S.step = 1; S.sqlName = ""; S.m = defaults(); S.errors = {}; S.saved = null; S.saveError = "";
    clearDraft();
    refreshIds().then(render);
  }

  // ------------------------------------------------------------------ data
  function refreshIds() {
    // The page loads the overlay, so these fetches already include locally saved datasets.
    return Promise.all([
      fetch("./data/consumer/repositories.json").then(function (r) { return r.json(); }),
      fetch("./data/consumer/layers.json").then(function (r) { return r.json(); })
    ]).then(function (res) {
      var repos = res[0].items || [], layers = res[1].items || [];
      S.siblings = repos;
      S.ids = {
        repoId: repos.reduce(function (a, r) { return Math.max(a, r.id); }, 0) + 1,
        layerId: layers.reduce(function (a, l) { return Math.max(a, l.id); }, 0) + 1
      };
      S.taken = {};
      layers.forEach(function (l) { S.taken[l.sqlName] = true; });
    });
  }

  function start() {
    app.appendChild(el("p", { class: "ad-lead", text: "טוען…" }));
    fetch(STAGING_URL).then(function (r) {
      if (!r.ok) throw new Error("staging");
      return r.json();
    }).then(function (db) {
      S.tables = db.tables || [];
      return refreshIds();
    }).then(function () {
      loadDraft();
      if (S.sqlName && (!tech() || S.taken[S.sqlName])) { S.sqlName = ""; S.m = defaults(); }
      if (S.sqlName) applyTechDefaults();
      render();
    }).catch(function () {
      app.textContent = "";
      app.appendChild(el("section", { class: "ad-card" }, [el("h2", { text: "לא ניתן לטעון את רשימת הטבלאות" }), el("p", { class: "ad-sub", text: "בדקו את החיבור ונסו שוב." })]));
    });
  }

  start();
})();
