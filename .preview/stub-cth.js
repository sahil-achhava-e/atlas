// Preview-only stub of the Electron preload bridge (`window.cth`), injected by
// vite.preview.config.ts. The real bridge lives in the Electron main process,
// which cannot run on this machine. Every call resolves empty so the UI mounts;
// live agents, terminals and git do nothing. Branding and layout are real.
// ponytail: empty-value stub. If a screen needs shaped data to render, add that
// one method to OVERRIDES below rather than growing a fake backend.
(function () {
  var OVERRIDES = {
    hiveRegistry: function () { return Promise.resolve({ agents: {} }); },
    // The engine step's INSTALLED / INSTALLS ON FIRST RUN / NOT INSTALLED
    // badges come from here. An empty array means "probe not back", which
    // renders no badge at all, so a preview of that screen was showing a state
    // the real app never sits in. These are the three real shapes.
    // The real bridge hands the URL to Electron's shell. In a browser preview
    // the honest equivalent is a new tab: without this, "install instructions"
    // silently did nothing here and looked like a broken button.
    openExternal: function (url) {
      try { window.open(url, '_blank', 'noopener'); } catch (e) { /* popup blocked */ }
      return Promise.resolve(true);
    },
    toolsStatus: function () {
      return Promise.resolve([
        { id: 'engine:claude', found: true,  path: '/opt/homebrew/bin/claude',
          installCommand: 'npm i -g @anthropic-ai/claude-code', docsUrl: 'https://claude.com/claude-code' },
        { id: 'engine:codex',  found: true,  path: '/opt/homebrew/bin/codex', installCommand: '' },
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
