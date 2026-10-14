/* Vim for LeetGPU — main-world content script.
 *
 * manifest.json injects vendor/monaco-vim.js first (it publishes
 * window.MonacoVim and resolves window.monaco lazily), then this file.
 * Both run in the page's own JavaScript world at document_start, before the
 * site bundles, so the helper can hook `monaco.editor.create` before the first
 * editor is mounted.
 *
 * Responsibilities:
 *   - discover monaco editors: editor.create hook + editor.getEditors() sweep
 *   - attach/detach monaco-vim on every live editor, following SPA navigation
 *   - one status line per editor; only the focused editor's line is shown
 *   - toggle with the floating badge or Alt+Shift+V (persisted per origin)
 *   - keep the site's Ctrl/Cmd+Enter ("run") shortcut working
 *
 * Debug handle: window.__vimForLeetGpu.{status,toggle,rescan}()
 */
(function () {
  "use strict";

  var GLOBAL_KEY = "__vimForLeetGpu";
  if (window[GLOBAL_KEY]) return; // re-injection guard (extension reload)

  var STORAGE_KEY = "vim-for-leetgpu:enabled";
  var SWEEP_MS = 1000; // fallback scan for editors the create hook misses
  var DISCOVER_MS = 150; // fast poll while waiting for window.monaco
  var MISS_LIMIT = 3; // consecutive dead scans before an editor is forgotten
  var LOG_PREFIX = "[vim-for-leetgpu]";

  var state = {
    enabled: readEnabled(),
    seenMonaco: false,
    sawEditor: false,
    hookedCreate: false,
    badge: null,
    sessions: new Set(), // live attachments (iterable)
    byEditor: new WeakMap(), // editor -> session
    misses: new WeakMap(), // editor -> consecutive failed isUsable() scans
    lastFocused: null,
  };

  window[GLOBAL_KEY] = {
    version: "1.0.0",
    startedAt: typeof performance !== "undefined" ? performance.now() : 0,
    monacoAtStart: typeof window.monaco,
    status: function () {
      return {
        enabled: state.enabled,
        attachments: state.sessions.size,
        monaco: !!window.monaco,
        seenMonaco: state.seenMonaco,
        sawEditor: state.sawEditor,
      };
    },
    toggle: function (value) {
      setEnabled(typeof value === "boolean" ? value : !state.enabled);
    },
    rescan: function () {
      sweep();
    },
  };

  /* ------------------------------------------------------------------ toggle */

  function readEnabled() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "0";
    } catch (error) {
      return true;
    }
  }

  function setEnabled(enabled) {
    enabled = !!enabled;
    var changed = enabled !== state.enabled;
    state.enabled = enabled;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    } catch (error) {
      /* private mode: the toggle simply does not outlive the session */
    }
    if (!enabled) {
      detachAll();
    } else if (changed) {
      sweep();
      refocusEditor();
    }
    updateBadge();
  }

  function refocusEditor() {
    var editor = state.lastFocused;
    if (!editor) return;
    try {
      if (editor.getDomNode() && editor.getDomNode().isConnected) editor.focus();
    } catch (error) {
      /* editor was disposed */
    }
  }

  window.addEventListener(
    "keydown",
    function (event) {
      if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
      if (event.code !== "KeyV" && event.key !== "V") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setEnabled(!state.enabled);
    },
    true,
  );

  /* --------------------------------------------------------------- discovery */

  function getMonaco() {
    var monaco = window.monaco;
    if (!monaco || !monaco.editor || typeof monaco.editor.create !== "function") return null;
    return monaco;
  }

  function hookEditorCreate(monaco) {
    if (state.hookedCreate) return;
    var original = monaco.editor.create;
    if (typeof original !== "function") return;
    try {
      monaco.editor.create = function () {
        var editor = original.apply(this, arguments);
        remember(editor);
        return editor;
      };
      state.hookedCreate = true;
    } catch (error) {
      console.warn(LOG_PREFIX, "could not hook monaco.editor.create", error);
    }
  }

  function listEditors(monaco) {
    try {
      if (typeof monaco.editor.getEditors === "function") return monaco.editor.getEditors() || [];
    } catch (error) {
      console.warn(LOG_PREFIX, "monaco.editor.getEditors() failed", error);
    }
    return [];
  }

  function editorIsUsable(editor) {
    try {
      var dom = editor.getDomNode();
      return !!(dom && dom.isConnected && editor.getModel());
    } catch (error) {
      return false; // disposed editors throw
    }
  }

  function remember(editor) {
    if (!editor) return;
    if (editorIsUsable(editor)) {
      state.misses.delete(editor);
      markEditorSeen();
      attach(editor);
    }
  }

  function markEditorSeen() {
    if (state.sawEditor) return;
    state.sawEditor = true;
    ensureBadge();
    updateBadge();
  }

  function sweep() {
    var monaco = getMonaco();
    if (!monaco) return;
    if (!state.seenMonaco) {
      state.seenMonaco = true;
      ensureBadge();
    }
    hookEditorCreate(monaco);

    var candidates = new Set(listEditors(monaco));
    for (var session of state.sessions) candidates.add(session.editor);

    for (var editor of candidates) {
      if (editorIsUsable(editor)) {
        state.misses.delete(editor);
        markEditorSeen();
        attach(editor);
        continue;
      }
      var misses = (state.misses.get(editor) || 0) + 1;
      state.misses.set(editor, misses);
      if (misses >= MISS_LIMIT) {
        state.misses.delete(editor);
        detach(editor);
      }
    }
  }

  /* ----------------------------------------------------------------- attach */

  function attach(editor) {
    if (!state.enabled || state.byEditor.has(editor) || !editorIsUsable(editor)) return;
    if (!window.MonacoVim || typeof window.MonacoVim.initVimMode !== "function") {
      console.warn(LOG_PREFIX, "monaco-vim did not load; skipping editor");
      return;
    }

    var statusBar = document.createElement("div");
    statusBar.className = "vim-for-leetgpu-statusbar";
    statusBar.setAttribute("data-vim-for-leetgpu", "statusbar");
    (document.body || document.documentElement).appendChild(statusBar);

    var session = { editor: editor, statusBar: statusBar, subscriptions: [] };

    try {
      // Registered before initVimMode: monaco-vim ignores key events whose
      // browser event is already defaultPrevented, so Ctrl/Cmd+Enter still
      // reaches the site's own "run" shortcut.
      session.subscriptions.push(
        editor.onKeyDown(function (event) {
          if (event.ctrlKey || event.metaKey) {
            var enter = window.monaco && window.monaco.KeyCode ? window.monaco.KeyCode.Enter : 3;
            if (!event.shiftKey && !event.altKey && event.keyCode === enter) event.preventDefault();
          }
        }),
      );

      session.vim = window.MonacoVim.initVimMode(editor, statusBar);

      session.subscriptions.push(
        editor.onDidFocusEditorWidget(function () {
          state.lastFocused = editor;
          showStatusBar(statusBar);
        }),
        editor.onDidBlurEditorWidget(function () {
          hideStatusBarUnlessCaptured(statusBar);
        }),
      );
    } catch (error) {
      console.warn(LOG_PREFIX, "failed to attach vim mode to editor", error);
      try {
        if (session.vim) session.vim.dispose();
      } catch (ignored) {
        /* already torn down */
      }
      disposeSubscriptions(session);
      statusBar.remove();
      return;
    }

    state.sessions.add(session);
    state.byEditor.set(editor, session);

    if (editorHasFocus(editor)) {
      state.lastFocused = editor;
      showStatusBar(statusBar);
    }
  }

  function editorHasFocus(editor) {
    try {
      return typeof editor.hasTextFocus === "function" && editor.hasTextFocus();
    } catch (error) {
      return false;
    }
  }

  function showStatusBar(statusBar) {
    for (var session of state.sessions) {
      session.statusBar.style.display = session.statusBar === statusBar ? "block" : "none";
    }
  }

  function hideStatusBarUnlessCaptured(statusBar) {
    // monaco-vim moves focus into an <input> inside the status bar for `:` and
    // `/`; do not hide the bar while it owns the focus.
    setTimeout(function () {
      if (document.activeElement && statusBar.contains(document.activeElement)) return;
      statusBar.style.display = "none";
    }, 0);
  }

  function detach(editor) {
    var session = state.byEditor.get(editor);
    if (!session) return;
    state.byEditor.delete(editor);
    state.sessions.delete(session);
    try {
      if (session.vim) session.vim.dispose();
    } catch (error) {
      /* already disposed */
    }
    disposeSubscriptions(session);
    session.statusBar.remove();
  }

  function detachAll() {
    for (var session of Array.from(state.sessions)) detach(session.editor);
  }

  function disposeSubscriptions(session) {
    session.subscriptions.forEach(function (subscription) {
      try {
        subscription.dispose();
      } catch (error) {
        /* ignore */
      }
    });
    session.subscriptions = [];
  }

  /* ------------------------------------------------------------------ badge */

  function ensureBadge() {
    if (state.badge || !document.body) return;
    var badge = document.createElement("button");
    badge.type = "button";
    badge.className = "vim-for-leetgpu-badge";
    badge.setAttribute("data-vim-for-leetgpu", "badge");
    badge.addEventListener(
      "click",
      function (event) {
        event.preventDefault();
        event.stopPropagation();
        setEnabled(!state.enabled);
      },
      true,
    );
    document.body.appendChild(badge);
    state.badge = badge;
    updateBadge();
  }

  function updateBadge() {
    if (!state.badge) return;
    state.badge.textContent = state.enabled ? "VIM" : "VIM OFF";
    state.badge.classList.toggle("vim-for-leetgpu-badge--off", !state.enabled);
    state.badge.title = state.enabled
      ? "Vim keybindings are on — click or press Alt+Shift+V to turn them off"
      : "Vim keybindings are off — click or press Alt+Shift+V to turn them on";
    // Keep the page clean on routes without an editor, but stay reachable
    // whenever one exists (also while vim is switched off).
    state.badge.style.display = state.sawEditor ? "" : "none";
  }

  /* --------------------------------------------------------------- polling */

  var sweeping = false;

  function safeSweep() {
    if (sweeping) return;
    sweeping = true;
    try {
      sweep();
    } catch (error) {
      console.warn(LOG_PREFIX, "scan failed", error);
    } finally {
      sweeping = false;
    }
  }

  setInterval(safeSweep, SWEEP_MS);

  // Fast path: sweep every DISCOVER_MS until monaco shows up and its editor
  // factory is hooked; the 1s interval above keeps watching afterwards.
  (function discover() {
    if (state.hookedCreate) return;
    safeSweep();
    setTimeout(discover, DISCOVER_MS);
  })();

  function onDocumentReady() {
    ensureBadge();
    safeSweep();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDocumentReady, { once: true });
  } else {
    onDocumentReady();
  }
})();
