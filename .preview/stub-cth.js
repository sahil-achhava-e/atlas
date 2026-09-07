// Preview-only stub of the Electron preload bridge (`window.cth`), injected by
// vite.preview.config.ts. The real bridge lives in the Electron main process,
// which cannot run on this machine.
//
// Everything not named below resolves empty so the UI mounts; live agents,
// terminals and git do nothing. The OVERRIDES are the calls where "empty" made
// a screen preview in a state the real app never sits in.
// ponytail: hand-written per call. If this grows past a dozen entries it wants
// a recorded fixture from a real session instead.
(function () {
  /** The fallback picker: a dialog drawn INSIDE the page. Not window.prompt (an
   *  alert box) and not <input webkitdirectory> (whose confirmation says
   *  "upload"). Nothing is read and no permission is asked for. */
  function typedFolderDialog(multi) {
    return new Promise(function (resolve) {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;' +
          'place-items:center;background:rgba(0,0,0,.55);' +
          'font:14px system-ui,-apple-system,sans-serif';
        var card = document.createElement('div');
        card.style.cssText = 'width:min(520px,92vw);padding:20px;display:flex;' +
          'flex-direction:column;gap:12px;background:var(--cth-cream-50,#140F26);' +
          'color:var(--cth-ink-900,#DEDBD6);' +
          'box-shadow:inset 0 0 0 1px var(--cth-ink-300,#787684),0 24px 60px rgba(0,0,0,.6)';
        var title = document.createElement('div');
        title.textContent = multi ? 'Preview: folder paths' : 'Preview: folder path';
        title.style.cssText = 'font-weight:700;letter-spacing:.5px';
        var note = document.createElement('div');
        note.textContent = multi
          ? 'The packaged app opens the native folder dialog. Type one or more absolute paths, separated by commas.'
          : 'The packaged app opens the native folder dialog. Type an absolute path.';
        note.style.cssText = 'font-size:12px;line-height:17px;opacity:.7';
        var input = document.createElement('input');
        input.placeholder = multi ? '/Users/you/code/app, /Users/you/code/api' : '/Users/you/code/app';
        input.style.cssText = 'height:40px;padding:0 12px;border:none;outline:none;' +
          'font-family:ui-monospace,SF Mono,Menlo,monospace;font-size:14px;' +
          'background:var(--cth-paper-100,#110D20);color:inherit;' +
          'box-shadow:inset 0 0 0 1px var(--cth-ink-300,#787684)';
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
        var mkBtn = function (label, primary) {
          var b = document.createElement('button');
          b.textContent = label;
          b.style.cssText = 'height:36px;padding:0 16px;border:none;cursor:pointer;font:inherit;' +
            (primary
              ? 'background:var(--cth-lilac,#A896E3);color:#1A1320'
              : 'background:transparent;color:inherit;box-shadow:inset 0 0 0 1px var(--cth-ink-300,#787684)');
          return b;
        };
        var cancel = mkBtn('Cancel', false);
        var ok = mkBtn('Add', true);
        row.append(cancel, ok);
        card.append(title, note, input, row);
        wrap.append(card);
        document.body.append(wrap);
        input.focus();

        var close = function (result) { wrap.remove(); resolve(result); };
        var submit = function () {
          var picked = input.value.split(',').map(function (x) { return x.trim(); })
            .filter(function (x) { return x.length; });
          if (!picked.length) return close({ ok: false, error: 'cancelled' });
          if (!multi) picked = [picked[0]];
          close({ ok: true, path: picked[0], paths: picked });
        };
        cancel.onclick = function () { close({ ok: false, error: 'cancelled' }); };
        ok.onclick = submit;
        input.onkeydown = function (e) {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') close({ ok: false, error: 'cancelled' });
        };
        wrap.onclick = function (e) { if (e.target === wrap) close({ ok: false, error: 'cancelled' }); };
      });
  }

  // A tiny in-memory config. The toggles are written to reconcile to what the
  // main process reports rather than trusting their own optimistic flip, which
  // is right: the OS can refuse. But a stub answering [] means every toggle
  // reconciles to "off" and looks dead on click.
  var config = {
    strongKeepalive: false, notifications: false, openAtLogin: false,
    onboardingComplete: false, registeredRepos: [],
  };

  var OVERRIDES = {
    updateConfig: function (patch) {
      Object.assign(config, patch || {});
      return Promise.resolve(Object.assign({}, config));
    },
    setNotifications: function (v) {
      config.notifications = v === true;
      return Promise.resolve(Object.assign({}, config));
    },
    // Returns the OS's answer, which the real handler reads back from Electron.
    // Finish calls this before writing the config; an empty answer read as
    // "could not create harness home". Nothing is created in a browser, so it
    // reports the success the packaged app would.
    ensureHarnessHome: function () { return Promise.resolve({ ok: true }); },
    setLoginItem: function (v) {
      config.openAtLogin = v === true;
      return Promise.resolve(config.openAtLogin);
    },
    hiveRegistry: function () { return Promise.resolve({ agents: {} }); },

    // A VALUE, not a function: the wizard reads `window.cth.platform` directly.
    // The container is Linux, so without this the permissions step previewed
    // GNOME power-settings instructions for a macOS app.
    platform: 'darwin',

    // The real bridge opens Electron's native folder dialog, which needs no
    // permission: the dialog IS the grant. A browser has no equivalent.
    //   - showDirectoryPicker() makes Chrome ask "allow this site to view and
    //     copy files?", which is a real grant of read access to a web page, for
    //     a preview that only ever wanted a path string.
    //   - <input webkitdirectory> is worse: its confirmation says "upload".
    //   - window.prompt() is an alert box.
    // So the preview draws its own small dialog and asks for the path. Nothing
    // is read, nothing is granted, and it stays inside the page.
    chooseFolder: function (opts) {
      var multi = !!(opts && opts.multi);
      // Three tiers, best first:
      //  1. the NATIVE macOS chooser, run by .preview/pick-folder.mjs on the
      //     host and proxied through Vite. Real dialog, real absolute paths, no
      //     browser permission at all. Needs that helper running.
      //  2. Chrome's own picker, which costs an "allow this site to view and
      //     copy files?" grant and yields only the folder's name.
      //  3. typing the path into a dialog drawn in the page.
      return fetch('/__pick?multi=' + (multi ? '1' : '0'))
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('no helper')); })
        .then(function (out) {
          if (out && out.ok) return { ok: true, path: out.path, paths: out.paths };
          return { ok: false, error: 'cancelled' };
        })
        .catch(function () {
          if (typeof window.showDirectoryPicker !== 'function') return typedFolderDialog(multi);
          return window.showDirectoryPicker({ mode: 'read' }).then(
            function (h) { return { ok: true, path: h.name, paths: [h.name] }; },
            function (err) {
              if (err && err.name === 'AbortError') return { ok: false, error: 'cancelled' };
              return typedFolderDialog(multi);
            }
          );
        });
    },

    // Without this, "install instructions" silently did nothing and looked like
    // a broken button. A new tab is the browser's equivalent of shell.openExternal.
    openExternal: function (url) {
      try { window.open(url, '_blank', 'noopener'); } catch (e) { /* popup blocked */ }
      return Promise.resolve(true);
    },

    // The engine step's INSTALLED / INSTALLS ON FIRST RUN / NOT INSTALLED badges
    // come from here. An empty array means "probe not back", which renders no
    // badge at all. These three rows are the three real shapes.
    toolsStatus: function () {
      return Promise.resolve([
        { id: 'engine:claude', found: true, path: '/opt/homebrew/bin/claude',
          installCommand: 'npm install -g @anthropic-ai/claude-code',
          docsUrl: 'https://docs.claude.com/en/docs/claude-code' },
        { id: 'engine:codex', found: true, path: '/opt/homebrew/bin/codex', installCommand: '' },
        { id: 'engine:gemini', found: false, path: null, installCommand: '',
          docsUrl: 'https://github.com/google-gemini/gemini-cli' },
      ]);
    },
  };

  var isEvent = function (n) { return /^(on|subscribe|off|remove)/i.test(n); };
  // *Sync calls are read at module load and must return a value, not a promise.
  var isSync = function (n) { return /Sync$/.test(n); };

  window.cth = new Proxy({}, {
    get: function (_t, name) {
      if (typeof name !== 'string') return undefined;
      if (OVERRIDES[name]) return OVERRIDES[name];
      return function () {
        if (isEvent(name)) return function () {};   // unsubscribe
        if (isSync(name)) return null;
        // [] and not {}: callers read it as a list (.length/.map) or as an
        // object (any field -> undefined). An array survives both.
        return Promise.resolve([]);
      };
    },
    has: function () { return true; },
  });
})();
