/*
 * Admin side panel.
 * Clicking the "+ הוספת מאגר" nav link opens add-dataset.html in a slide-over panel
 * (same look and behaviour as the app's own notifications drawer) instead of
 * navigating away. The form runs inside an iframe in "?embed=1" mode and talks to
 * this script with postMessage:
 *   agamim-dataset-saved  -> remember to refresh the catalog when the panel closes
 *   agamim-dataset-open   -> close, go to the dataset page and refresh
 *   agamim-drawer-close   -> close (Escape pressed inside the iframe)
 * A direct link / new tab to add-dataset.html keeps working as a full page.
 */
(function () {
  "use strict";

  var LINK_RE = /(^|\/)add-dataset\.html(\?|#|$)/;
  var PANEL_SRC = "./add-dataset.html?embed=1";
  var root = null;
  var opener = null;
  var changed = false;

  var css = [
    "#agm-drawer{position:fixed;inset:0;z-index:50}",
    "#agm-drawer .agm-d-back{position:absolute;inset:0;background:rgba(15,45,72,.4)}",
    "#agm-drawer .agm-d-panel{position:absolute;top:0;bottom:0;inset-inline-end:0;width:100%;max-width:36rem;display:flex;flex-direction:column;background:#fff;box-shadow:0 25px 50px -12px rgba(0,0,0,.35);animation:agm-d-in .22s ease-out}",
    "#agm-drawer header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e2e8f0}",
    "#agm-drawer h2{margin:0;font-size:18px;font-weight:700;color:#0f2d48;font-family:inherit}",
    "#agm-drawer .agm-d-x{font:inherit;min-width:40px;min-height:36px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f2d48;cursor:pointer;font-size:16px;line-height:1}",
    "#agm-drawer .agm-d-x:hover{background:#f3f6f9}",
    "#agm-drawer .agm-d-x:focus-visible{outline:2px solid #e07020;outline-offset:2px}",
    "#agm-drawer iframe{flex:1;width:100%;border:0;background:#f3f6f9}",
    "html.agm-d-lock,html.agm-d-lock body{overflow:hidden}",
    "@keyframes agm-d-in{from{transform:translateX(-32px);opacity:0}to{transform:none;opacity:1}}",
    "@media (prefers-reduced-motion:reduce){#agm-drawer .agm-d-panel{animation:none}}"
  ].join("\n");

  function mount(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  function open(trigger) {
    if (root) return;
    opener = trigger || document.activeElement;
    changed = false;

    if (!document.getElementById("agm-drawer-style")) {
      var st = mount("style", { id: "agm-drawer-style" });
      st.textContent = css;
      document.head.appendChild(st);
    }

    var title = mount("h2", {});
    title.textContent = "הוספת מאגר";
    var x = mount("button", { type: "button", class: "agm-d-x", "aria-label": "סגירה" });
    x.textContent = "✕";
    x.addEventListener("click", function () { close(); });
    var iframe = mount("iframe", { src: PANEL_SRC, title: "הוספת מאגר נתונים" });
    var back = mount("div", { class: "agm-d-back" });
    back.addEventListener("click", function () { close(); });

    root = mount("div", { id: "agm-drawer", role: "dialog", "aria-modal": "true", "aria-label": "הוספת מאגר" }, [
      back,
      mount("aside", { class: "agm-d-panel" }, [mount("header", {}, [title, x]), iframe])
    ]);
    document.body.appendChild(root);
    document.documentElement.classList.add("agm-d-lock");
    x.focus();
    window.addEventListener("keydown", onKey);
  }

  function onKey(ev) { if (ev.key === "Escape") close(); }

  function close(skipReload) {
    if (!root) return;
    window.removeEventListener("keydown", onKey);
    root.parentNode.removeChild(root);
    root = null;
    document.documentElement.classList.remove("agm-d-lock");
    if (opener && opener.focus) { try { opener.focus(); } catch (e) {} }
    // A dataset was saved: reload so the catalog (cached by the app) lists it.
    if (changed && !skipReload) window.location.reload();
  }

  // open from the nav link (plain click only, so new-tab clicks still work)
  document.addEventListener("click", function (ev) {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
    if (!a || !LINK_RE.test(a.getAttribute("href") || "")) return;
    ev.preventDefault();
    open(a);
  }, true);

  window.addEventListener("message", function (ev) {
    if (ev.origin !== window.location.origin || !ev.data || typeof ev.data.type !== "string") return;
    if (ev.data.type === "agamim-dataset-saved") { changed = true; return; }
    if (ev.data.type === "agamim-drawer-close") { close(); return; }
    if (ev.data.type === "agamim-dataset-open") {
      var id = parseInt(ev.data.repoId, 10);
      if (!(id > 0)) return;
      close(true);
      window.location.hash = "#/repo/" + id;
      window.location.reload();
    }
  });
})();
