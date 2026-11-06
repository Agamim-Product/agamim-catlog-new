/*
 * Local datasets overlay.
 *
 * The catalog is a static site: every data file is read with
 * fetch("data/consumer/<name>"). Datasets a product manager registers with
 * add-dataset.html are kept in localStorage; this script wraps window.fetch so
 * those datasets appear in the catalog (lists, detail pages, samples) as if
 * they were published files. Anything it does not recognise passes through
 * untouched, and any failure falls back to the real fetch.
 *
 * Storage: localStorage["agamim-local-datasets-v1"] = [
 *   { repoId, layerId, savedAt, files: { "<file name>": <json | csv text> }, list: { repo, layer } }
 * ]
 * Once a dataset is published into data/consumer/ (via tools/apply-package.ps1)
 * the published copy wins and the local one is ignored.
 */
(function () {
  "use strict";

  var KEY = "agamim-local-datasets-v1";
  var DATA_RE = /data\/consumer\/([^?#\/]+\.(?:json|csv))(?:[?#].*)?$/;

  var LAKE = "db-oref-base";
  var LAKE_HE = "מאגר הגיאוגרפיה המנהלית (db-oref-base)";
  var LAKE_EN = "Administrative geography (db-oref-base)";
  function moveIntoLake(g) {
    if (g && typeof g === "object" && g.db !== LAKE) { g.db = LAKE; g.he = LAKE_HE; g.en = LAKE_EN; return true; }
    return false;
  }
  // every dataset belongs to the lake db-oref-base; datasets saved earlier under another db are moved
  function migrate(list) {
    var changed = false;
    list.forEach(function (d) {
      if (!d) return;
      if (d.list && d.list.repo && moveIntoLake(d.list.repo.group)) changed = true;
      if (d.list && d.list.layer && d.list.layer.dbName !== LAKE) { d.list.layer.dbName = LAKE; changed = true; }
      Object.keys(d.files || {}).forEach(function (n) {
        var f = d.files[n];
        if (f && typeof f === "object") {
          if (f.group && moveIntoLake(f.group)) changed = true;
          if (f.dbName && f.dbName !== LAKE && /^layers__/.test(n)) { f.dbName = LAKE; changed = true; }
          if (Array.isArray(f)) f.forEach(function (x) { if (x && x.dbName && x.dbName !== LAKE) { x.dbName = LAKE; changed = true; } });
        }
      });
    });
    return changed;
  }

  function load() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (!Array.isArray(a)) return [];
      if (migrate(a)) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }
      return a;
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  // Roles: the demo has two accounts. "consumer" can browse only; anyone else is a portal admin.
  window.__agamimIsAdmin = function () {
    try {
      var a = JSON.parse(sessionStorage.getItem("auth") || "null");
      return !(a && a.role === "consumer");
    } catch (e) {
      return true;
    }
  };

  window.__agamimLocalDatasets = { key: KEY, load: load, save: save };

  var realFetch = window.fetch;
  if (typeof realFetch !== "function") return;

  function bump(map, key) {
    if (key === undefined || key === null) return;
    map[key] = (map[key] || 0) + 1;
  }

  function mergeRepos(data, local) {
    var have = {};
    data.items.forEach(function (r) { have[r.id] = true; });
    local.forEach(function (d) {
      var r = d.list && d.list.repo;
      if (!r || have[r.id]) return;
      data.items.push(r);
      have[r.id] = true;
      var f = data.facets || (data.facets = {});
      bump((f.access = f.access || {}), r.restricted ? "locked" : "open");
      bump((f.core = f.core || {}), r.core);
      bump((f.value = f.value || {}), r.valueLevel);
      bump((f.phase = f.phase || {}), r.phase);
      bump((f.owner = f.owner || {}), r.ownerHe);
      bump((f.frequency = f.frequency || {}), r.card && r.card.cadence);
      if (!r.restricted) {
        bump((f.slo = f.slo || {}), r.sloStatus);
        bump((f.verdict = f.verdict || {}), r.quality && r.quality.verdict);
      }
    });
    data.total = data.items.length;
    return data;
  }

  function mergeLayers(data, local) {
    var have = {};
    data.items.forEach(function (l) { have[l.id] = true; });
    local.forEach(function (d) {
      var l = d.list && d.list.layer;
      if (!l || have[l.id]) return;
      data.items.push(l);
      have[l.id] = true;
      var f = data.facets || (data.facets = {});
      bump((f.tier = f.tier || {}), l.tier);
      bump((f.kind = f.kind || {}), l.kind);
      bump((f.owner = f.owner || {}), l.ownerHe);
    });
    data.total = data.items.length;
    return data;
  }

  function reply(body, type) {
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": type }
    });
  }

  var localFetch = function (input, init) {
    var args = arguments;
    var self = this;
    var url = "";
    try {
      url = typeof input === "string" ? input : (input && input.url) || String(input || "");
    } catch (e) {}

    var m = DATA_RE.exec(url);
    var local = m ? load() : [];
    if (!m || !local.length) return realFetch.apply(self, args);

    var name = m[1];
    var isList = name === "repositories.json" || name === "layers.json";
    var mine = null;
    if (!isList) {
      for (var i = 0; i < local.length; i++) {
        if (local[i].files && Object.prototype.hasOwnProperty.call(local[i].files, name)) {
          mine = local[i];
          break;
        }
      }
      if (!mine) return realFetch.apply(self, args);
    }

    // Is the dataset already published as a real file? Then the real file wins.
    var repoListUrl = url.replace(/data\/consumer\/[^?#]*/, "data/consumer/repositories.json");
    return realFetch.call(self, repoListUrl)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (repos) {
        var published = {};
        ((repos && repos.items) || []).forEach(function (r) { published[r.id] = true; });
        var active = local.filter(function (d) { return !published[d.repoId]; });

        if (isList) {
          return realFetch.apply(self, args).then(function (res) {
            if (!res.ok || !active.length) return res;
            return res.clone().json().then(function (data) {
              var merged = name === "repositories.json" ? mergeRepos(data, active) : mergeLayers(data, active);
              return reply(merged, "application/json");
            }).catch(function () { return res; });
          });
        }

        if (published[mine.repoId]) return realFetch.apply(self, args);
        var body = mine.files[name];
        return reply(body, /\.csv$/.test(name) ? "text/csv; charset=utf-8" : "application/json");
      })
      .catch(function () { return realFetch.apply(self, args); });
  };

  /*
   * Access overrides (admin toggle: open / blocked per dataset).
   * localStorage["agamim-access-overrides-v1"] = { "<repoId>": { blocked: true|false, reasonHe, reasonEn } }
   * Applied on top of whatever the data files (or local datasets) say. Browser-local, like local datasets.
   */
  var ACCESS_KEY = "agamim-access-overrides-v1";
  var DEFAULT_REASON = {
    he: "נחסם זמנית על ידי מנהל המערכת",
    en: "Temporarily blocked by the system administrator"
  };

  function loadAccess() {
    try {
      var o = JSON.parse(localStorage.getItem(ACCESS_KEY) || "{}");
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (e) {
      return {};
    }
  }

  window.__agamimAccess = {
    key: ACCESS_KEY,
    load: loadAccess,
    set: function (repoId, blocked, reasonHe) {
      var o = loadAccess();
      o[String(repoId)] = {
        blocked: !!blocked,
        reasonHe: reasonHe || DEFAULT_REASON.he,
        reasonEn: DEFAULT_REASON.en
      };
      localStorage.setItem(ACCESS_KEY, JSON.stringify(o));
    },
    clear: function () {
      localStorage.removeItem(ACCESS_KEY);
    }
  };

  function setAccess(obj, ov) {
    if (!obj || typeof obj !== "object" || !ov) return;
    if (ov.blocked) {
      obj.accessState = "blocked";
      obj.restricted = true;
      obj.blocked = { reasonHe: ov.reasonHe || DEFAULT_REASON.he, reasonEn: ov.reasonEn || DEFAULT_REASON.en };
    } else {
      obj.accessState = "granted";
      obj.restricted = false;
      obj.blocked = null;
    }
  }

  function applyAccess(name, data, ov) {
    if (!data || typeof data !== "object") return data;
    var m;
    if (name === "repositories.json" && Array.isArray(data.items)) {
      var open = 0, locked = 0;
      data.items.forEach(function (r) {
        setAccess(r, ov[String(r.id)]);
        if (r.restricted) locked++; else open++;
      });
      if (data.facets) data.facets.access = { open: open, locked: locked };
    } else if (name === "layers.json" && Array.isArray(data.items)) {
      data.items.forEach(function (l) { setAccess(l, ov[String(l.repoId)]); });
    } else if ((m = /^repositories__(\d+)\.json$/.exec(name))) {
      setAccess(data, ov[m[1]]);
    } else if ((m = /^repositories__(\d+)__layers\.json$/.exec(name))) {
      var rows = Array.isArray(data) ? data : data.items || [];
      rows.forEach(function (l) { setAccess(l, ov[m[1]]); });
    } else if (/^layers__\d+\.json$/.test(name) && data.repoId !== undefined) {
      setAccess(data, ov[String(data.repoId)]);
    }
    return data;
  }

  /*
   * Admin edits and deletions (browser-local, like access overrides).
   * localStorage["agamim-edits-v1"]   = { "<repoId>": { nameHe, purposeHe, ownerHe, ownerPhone, stewardHe, custodianHe } }
   * localStorage["agamim-deleted-v1"] = [ <repoId>, ... ]   (hidden in this browser; can be restored)
   */
  var EDITS_KEY = "agamim-edits-v1";
  var DELETED_KEY = "agamim-deleted-v1";
  var EDIT_FIELDS = ["nameHe", "purposeHe", "ownerHe", "ownerPhone", "stewardHe", "custodianHe"];

  function loadJsonKey(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || "null");
      return v === null || typeof v !== typeof fallback ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  function loadEdits() {
    var o = loadJsonKey(EDITS_KEY, {});
    return o && !Array.isArray(o) ? o : {};
  }
  function loadDeleted() {
    var a = loadJsonKey(DELETED_KEY, []);
    return Array.isArray(a) ? a.map(String) : [];
  }

  window.__agamimEdits = {
    key: EDITS_KEY,
    load: loadEdits,
    set: function (repoId, fields) {
      var o = loadEdits();
      var e = {};
      EDIT_FIELDS.forEach(function (f) { if (typeof fields[f] === "string") e[f] = fields[f].trim(); });
      o[String(repoId)] = e;
      localStorage.setItem(EDITS_KEY, JSON.stringify(o));
    }
  };
  window.__agamimDeleted = {
    key: DELETED_KEY,
    load: loadDeleted,
    add: function (repoId) {
      var a = loadDeleted();
      if (a.indexOf(String(repoId)) < 0) a.push(String(repoId));
      localStorage.setItem(DELETED_KEY, JSON.stringify(a));
    },
    restoreAll: function () {
      localStorage.removeItem(DELETED_KEY);
    }
  };

  function editRepo(obj, e) {
    if (!obj || typeof obj !== "object" || !e) return;
    EDIT_FIELDS.forEach(function (f) { if (typeof e[f] === "string") obj[f] = e[f]; });
    if (typeof e.nameHe === "string") obj.nameEn = e.nameHe;
    if (typeof e.purposeHe === "string") obj.purposeEn = e.purposeHe;
    if (typeof e.ownerHe === "string") obj.ownerEn = e.ownerHe;
  }
  function editLayer(l, e) {
    if (!l || typeof l !== "object" || !e) return;
    if (typeof e.nameHe === "string") { l.repoNameHe = e.nameHe; l.titleHe = e.nameHe; l.repoNameEn = e.nameHe; l.titleEn = e.nameHe; }
    if (typeof e.ownerHe === "string") l.ownerHe = e.ownerHe;
    if (typeof e.stewardHe === "string") l.stewardHe = e.stewardHe;
    if (typeof e.purposeHe === "string") { l.descHe = e.purposeHe; l.descEn = e.purposeHe; }
  }

  // returns the changed data, or null when the file belongs to a deleted dataset
  function applyContent(name, data, ed, del) {
    if (!data || typeof data !== "object") return data;
    var m;
    if (name === "repositories.json" && Array.isArray(data.items)) {
      data.items = data.items.filter(function (r) { return del.indexOf(String(r.id)) < 0; });
      data.items.forEach(function (r) { editRepo(r, ed[String(r.id)]); });
      data.total = data.items.length;
      if (data.facets && data.facets.access) {
        var o = 0, l = 0;
        data.items.forEach(function (r) { if (r.restricted) l++; else o++; });
        data.facets.access = { open: o, locked: l };
      }
    } else if (name === "layers.json" && Array.isArray(data.items)) {
      data.items = data.items.filter(function (x) { return del.indexOf(String(x.repoId)) < 0; });
      data.items.forEach(function (x) { editLayer(x, ed[String(x.repoId)]); });
      data.total = data.items.length;
    } else if ((m = /^repositories__(\d+)\.json$/.exec(name))) {
      if (del.indexOf(m[1]) >= 0) return null;
      editRepo(data, ed[m[1]]);
    } else if ((m = /^repositories__(\d+)__layers\.json$/.exec(name))) {
      if (del.indexOf(m[1]) >= 0) return null;
      (Array.isArray(data) ? data : data.items || []).forEach(function (x) { editLayer(x, ed[m[1]]); });
    } else if ((m = /^repositories__(\d+)__(?:lineage__d\d|quality-profile)\.json$/.exec(name))) {
      if (del.indexOf(m[1]) >= 0) return null;
    } else if (/^layers__\d+\.json$/.test(name) && data.repoId !== undefined) {
      if (del.indexOf(String(data.repoId)) >= 0) return null;
      editLayer(data, ed[String(data.repoId)]);
    }
    return data;
  }

  /*
   * A dataset that is blocked in the published files only has a "locked" stub (no columns, samples, ...).
   * When an admin opens it, the complete synthetic files from data/consumer/unlocked/ are used instead.
   */
  var unlockedIndex = null;
  function getUnlockedIndex(baseUrl) {
    if (!unlockedIndex) {
      unlockedIndex = realFetch(baseUrl.replace(/data\/consumer\/[^?#]*/, "data/consumer/unlocked/index.json"))
        .then(function (r) { return r.ok ? r.json() : {}; })
        .catch(function () { return {}; });
    }
    return unlockedIndex;
  }

  function unlockedRepoFor(name, index) {
    var m;
    if ((m = /^repositories__(\d+)(?:__|\.)/.exec(name))) return index[m[1]] ? m[1] : null;
    if ((m = /^layers__(\d+)(?:__|\.)/.exec(name))) {
      for (var r in index) if (String(index[r].layerId) === m[1]) return r;
    }
    return null;
  }

  window.fetch = function (input, init) {
    var args = arguments;
    var self = this;
    var url = "";
    var m = null;
    var ov = {};
    var ed = {};
    var del = [];
    try {
      url = typeof input === "string" ? input : (input && input.url) || String(input || "");
      m = DATA_RE.exec(url);
      ov = loadAccess();
      ed = loadEdits();
      del = loadDeleted();
    } catch (e) {}
    var opened = Object.keys(ov).filter(function (k) { return ov[k] && ov[k].blocked === false; });
    if (!m || !(Object.keys(ov).length || Object.keys(ed).length || del.length)) return localFetch.apply(self, args);
    var name = m[1];

    var gone = function () { return new Response("", { status: 404 }); };
    var transform = function (res, withAccess) {
      if (!res.ok || !/\.json$/.test(name)) return res;
      return res.clone().json().then(function (data) {
        if (withAccess) data = applyAccess(name, data, ov);
        data = applyContent(name, data, ed, del);
        return data === null ? gone() : reply(data, "application/json");
      }).catch(function () { return res; });
    };
    var viaOverrides = function (res) { return transform(res, true); };

    if (!opened.length || /^unlocked\//.test(name)) return localFetch.apply(self, args).then(viaOverrides);

    return getUnlockedIndex(url).then(function (index) {
      var isList = name === "repositories.json" || name === "layers.json";
      var repo = isList ? null : unlockedRepoFor(name, index);
      if (repo && ov[repo] && ov[repo].blocked === false && index[repo].files.indexOf(name) >= 0) {
        return realFetch.call(self, url.replace(/data\/consumer\/[^?#]*/, "data/consumer/unlocked/" + name)).then(function (res) { return transform(res, false); });
      }
      return localFetch.apply(self, args).then(function (res) {
        res = viaOverrides(res);
        if (!isList) return res;
        return Promise.resolve(res).then(function (r) {
          if (!r.ok) return r;
          return r.clone().json().then(function (data) {
            opened.forEach(function (id) {
              var ent = index[id];
              if (!ent || !Array.isArray(data.items)) return;
              var item = name === "repositories.json" ? ent.repoListItem : ent.layerListItem;
              var at = data.items.findIndex(function (x) {
                return name === "repositories.json" ? String(x.id) === id : String(x.repoId) === id;
              });
              if (item && at >= 0) data.items[at] = item;
            });
            return reply(data, "application/json");
          }).catch(function () { return r; });
        });
      });
    });
  };
})();
