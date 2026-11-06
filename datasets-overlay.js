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

  function load() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(a) ? a : [];
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
    try {
      url = typeof input === "string" ? input : (input && input.url) || String(input || "");
      m = DATA_RE.exec(url);
      ov = loadAccess();
    } catch (e) {}
    var opened = Object.keys(ov).filter(function (k) { return ov[k] && ov[k].blocked === false; });
    if (!m || !Object.keys(ov).length) return localFetch.apply(self, args);
    var name = m[1];

    var viaOverrides = function (res) {
      if (!res.ok || !/\.json$/.test(name)) return res;
      return res.clone().json().then(function (data) {
        return reply(applyAccess(name, data, ov), "application/json");
      }).catch(function () { return res; });
    };

    if (!opened.length || /^unlocked\//.test(name)) return localFetch.apply(self, args).then(viaOverrides);

    return getUnlockedIndex(url).then(function (index) {
      var isList = name === "repositories.json" || name === "layers.json";
      var repo = isList ? null : unlockedRepoFor(name, index);
      if (repo && ov[repo] && ov[repo].blocked === false && index[repo].files.indexOf(name) >= 0) {
        return realFetch.call(self, url.replace(/data\/consumer\/[^?#]*/, "data/consumer/unlocked/" + name));
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
