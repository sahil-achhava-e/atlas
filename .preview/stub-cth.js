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
    // A folder picker cannot open in a browser, so the preview hands back a
    // plausible path (cycling, so picking twice adds two rows). Without this
    // every list-of-things screen previews only in its empty state.
    // The real bridge opens Electron's native folder dialog. A browser cannot,
    // and the File System Access API deliberately hides absolute paths, so the
    // honest preview equivalent is to ASK for the path rather than invent one:
    // canned folders appearing on click looked like the app adding things by
    // itself. Cancel behaves like cancelling the real dialog.
    chooseFolder: function (opts) {
      var multi = !!(opts && opts.multi);
      var answer = window.prompt(
        multi
          ? 'Preview folder picker.\nType one or more absolute paths, separated by commas:'
          : 'Preview folder picker.\nType an absolute path:',
        multi ? '' : '~/atlas-data'
      );
      if (answer === null) return Promise.resolve({ ok: false, error: 'cancelled' });
      var picked = answer.split(',').map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length; });
      if (!picked.length) return Promise.resolve({ ok: false, error: 'cancelled' });
      if (!multi) picked = [picked[0]];
      return Promise.resolve({ ok: true, path: picked[0], paths: picked });
    },
    // The real bridge hands the URL to Electron's shell. In a browser preview
    // the honest equivalent is a new tab: without this, "install instructions"
    // silently did nothing here and looked like a broken button.
    // A folder picker cannot open in a browser, so the preview hands back a
    // plausible path (cycling, so picking twice adds two rows). Without this
    // every list-of-things screen previews only in its empty state.
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
