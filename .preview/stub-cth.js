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
  var OVERRIDES = {
    hiveRegistry: function () { return Promise.resolve({ agents: {} }); },

    // The real bridge opens Electron's native folder dialog. Chrome has its own
    // directory picker (File System Access API, secure contexts only, which
    // 127.0.0.1 counts as), so the preview opens a REAL chooser rather than
    // inventing folders or asking you to type a path. Two honest differences:
    //   - the browser never exposes an absolute path, so what comes back is the
    //     folder's NAME, not /Users/you/thing
    //   - it takes one directory per call; the native dialog can multi-select
    // Cancelling rejects with AbortError, which maps to the same 'cancelled'
    // string the real handler returns.
    chooseFolder: function () {
      if (typeof window.showDirectoryPicker !== 'function') {
        return Promise.resolve({ ok: false, error: 'no directory picker in this browser' });
      }
      return window.showDirectoryPicker({ mode: 'read' }).then(
        function (handle) { return { ok: true, path: handle.name, paths: [handle.name] }; },
        function () { return { ok: false, error: 'cancelled' }; }
      );
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
