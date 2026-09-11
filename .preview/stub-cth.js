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
  // Persisted in localStorage so a refresh does not throw you back into the
  // setup wizard. The real app writes this to a config.json in userData; the
  // preview has no disk, and an in-memory config meant `onboardingComplete`
  // reset on every reload. Clear it with `localStorage.clear()` to see setup
  // again on purpose.
  var CONFIG_KEY = 'atlas.preview.config';
  var DEFAULT_CONFIG = {
    strongKeepalive: false, notifications: false, openAtLogin: false,
    onboardingComplete: false, registeredRepos: [],
  };
  var config = (function () {
    try {
      var raw = localStorage.getItem(CONFIG_KEY);
      return raw ? Object.assign({}, DEFAULT_CONFIG, JSON.parse(raw)) : Object.assign({}, DEFAULT_CONFIG);
    } catch (e) { return Object.assign({}, DEFAULT_CONFIG); }
  })();
  var save = function () {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch (e) { /* private window */ }
  };

  /** Terminals the preview pretends to have spawned. Lost on reload, which is
   *  right: the app re-spawns whatever is missing. */
  var ptys = {};

  var OVERRIDES = {
    getConfig: function () { return Promise.resolve(Object.assign({}, config)); },
    updateConfig: function (patch) {
      Object.assign(config, patch || {});
      save();
      return Promise.resolve(Object.assign({}, config));
    },
    setNotifications: function (v) {
      config.notifications = v === true;
      save();
      return Promise.resolve(Object.assign({}, config));
    },
    // Returns the OS's answer, which the real handler reads back from Electron.
    // Finish calls this before writing the config; an empty answer read as
    // "could not create harness home". Nothing is created in a browser, so it
    // reports the success the packaged app would.
    ensureHarnessHome: function () { return Promise.resolve({ ok: true }); },
    setLoginItem: function (v) {
      config.openAtLogin = v === true;
      save();
      return Promise.resolve(config.openAtLogin);
    },
    hiveRegistry: function () { return Promise.resolve({ agents: {} }); },

    // A VALUE, not a function: the wizard reads `window.cth.platform` directly.
    // The container is Linux, so without this the permissions step previewed
    // GNOME power-settings instructions for a macOS app.
    platform: 'darwin',

    // A fake terminal, so the floor is not empty. The real bridge spawns a PTY;
    // here nothing runs, but the spawn has to REPORT success or the app decides
    // Atlas failed to clock in and shows EMPTY FLOOR — a state the packaged app
    // never sits in, because it always brings Atlas up on landing.
    spawnPty: function (opts) {
      if (opts && opts.id) ptys[opts.id] = { id: opts.id, cwd: opts.cwd || '' };
      return Promise.resolve({ ok: true, resumed: false });
    },
    listPtys: function () {
      return Promise.resolve(Object.keys(ptys).map(function (id) { return ptys[id]; }));
    },
    killPty: function (id) { delete ptys[id]; return Promise.resolve(true); },
  // The generic fallback answers [] , which is TRUTHY — GitTab then read a
  // status object off it and threw. A preview folder is not a repo.
  // Real scan of this machine, taken by scratchpad/snap-skills.mjs. The browser
  // preview has no fs, and an empty list would make a working tab look broken.
  skillsLocal: async () => [{"id": "user:azure-devops", "name": "azure-devops", "description": "Azure DevOps plumbing \u2014 work item queries and updates, repro-step parsing, attachments, discussion comments, and pull requests via the az CLI and REST API. Use for any task touching ADO boards, PRs, or work items, and whenever an az command fails with an SSL certificate error. Covers the org-wide TLS interception setup that every az call depends on.", "provider": "claude", "scope": "user", "path": "/Users/mohammed.sahil/.claude/skills/azure-devops"}, {"id": "bundled:capabilities", "name": "capabilities", "description": "Your capability catalog \u2014 read this at boot. Lists the temporal date-range skills and the external integrations (reached via the loopback broker) available to you as a spawned worker, and exactly how to call each. Read-only. Consult it whenever you're unsure what tools/integrations you have or how to invoke them.", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/capabilities"}, {"id": "project:create-migration", "name": "create-migration", "description": "", "provider": "claude", "scope": "project", "path": "/Users/mohammed.sahil/Desktop/epicxp-events/.claude/skills/create-migration"}, {"id": "project:ian-xiaohei-illustrations", "name": "ian-xiaohei-illustrations", "description": "\u751f\u6210 Ian \u98ce\u683c\u7684\u4e2d\u6587\u6b63\u6587\u914d\u56fe\u3002\u7528\u4e8e\u7528\u6237\u8981\u6c42\u4e3a\u4e2d\u6587\u6587\u7ae0\u3001\u5e16\u5b50\u3001\u535a\u5ba2\u3001Notion \u6587\u6863\u3001\u5de5\u4f5c\u6d41\u6587\u6863\u3001\u65b9\u6cd5\u8bba\u3001\u6d41\u7a0b\u3001\u7ed3\u6784\u3001\u72b6\u6001\u3001\u9690\u55bb\u6216\u89c2\u70b9\u751f\u6210\u201c\u602a\u8bde\u201d\u201c\u5c0f\u9ed1\u201d\u201c\u624b\u7ed8\u201d\u201c\u6b63\u6587\u914d\u56fe\u201d\u201c\u6587\u7ae0\u63d2\u56fe\u201d\u201c\u914d\u56fe\u5efa\u8bae\u201d\u201cshot list\u201d\u201c\u53bb\u6807\u9898/\u6539\u56fe\u201d\u7b49\u4efb\u52a1\uff1b\u9ed8\u8ba4\u4f7f\u7528\u5c0f\u9ed1 IP\u3001\u7eaf\u767d\u624b\u7ed8\u3001\u5c11\u91cf\u7ea2\u6a59\u84dd\u6279\u6ce8\u3001\u7b80\u6d01\u6e05\u723d\u4f46\u5929\u9a6c\u884c\u7a7a\u7684\u89c6\u89c9\u98ce\u683c\u3002", "provider": "claude", "scope": "project", "path": "/Users/mohammed.sahil/Desktop/atlas/.claude/skills/ian-xiaohei-illustrations"}, {"id": "bundled:last30Days", "name": "last30Days", "description": "Resolve \"last30Days\" to a concrete ISO date range relative to your run time \u2014 a rolling 30-day window ending today. Returns inclusive civil dates plus exact UTC instants so you have temporal context without computing dates by hand. Read-only: no writes, no network. Use before a \"last 30 days\" / trailing-month task (monthly trends, recent activity).", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/last30Days"}, {"id": "bundled:last7Days", "name": "last7Days", "description": "Resolve \"last7Days\" to a concrete ISO date range relative to your run time \u2014 a rolling 7-day window ending today. Returns inclusive civil dates plus exact UTC instants so you have temporal context without computing dates by hand. Read-only: no writes, no network. Use before a \"last 7 days\" / trailing-week task.", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/last7Days"}, {"id": "bundled:lastMonth", "name": "lastMonth", "description": "Resolve \"lastMonth\" to a concrete ISO date range relative to your run time \u2014 the previous full calendar month. Returns inclusive civil dates plus exact UTC instants so you have temporal context without computing dates by hand. Read-only: no writes, no network. Use before a task over last month (monthly reports, month-end summaries).", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/lastMonth"}, {"id": "bundled:lastQuarter", "name": "lastQuarter", "description": "Resolve \"lastQuarter\" to a concrete ISO date range relative to your run time \u2014 the previous full quarter. Returns inclusive civil dates plus exact UTC instants so you have temporal context without computing dates by hand. Read-only: no writes, no network. Use before a task over last quarter (quarterly reviews, QoQ comparisons).", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/lastQuarter"}, {"id": "bundled:lastWeek", "name": "lastWeek", "description": "Resolve \"lastWeek\" to a concrete ISO date range relative to your run time \u2014 the previous full week (Mon \u2192 Sun). Returns inclusive civil dates plus exact UTC instants so you have temporal context without computing dates by hand. Read-only: no writes, no network. Use before a task over the last complete week (weekly digests, week-over-week).", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/lastWeek"}, {"id": "bundled:lastYear", "name": "lastYear", "description": "Resolve \"lastYear\" to a concrete ISO date range relative to your run time \u2014 the previous full calendar year. Returns inclusive civil dates plus exact UTC instants so you have temporal context without computing dates by hand. Read-only: no writes, no network. Use before a task over last year (annual reports, year-over-year).", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/lastYear"}, {"id": "bundled:md-audit", "name": "md-audit", "description": "Read-only code quality audit \u2014 scan the current working directory for common issues (bugs, dead code, security hotspots, missing error handling) and return a prioritised findings report. No files are edited. Use when asked to \"audit the code\", \"quick audit\", \"find issues\", \"code scan\", or \"what's wrong with this codebase\". (munder-difflin)", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/md-audit"}, {"id": "bundled:md-fetch-summarize", "name": "md-fetch-summarize", "description": "Fetch a URL and return a concise markdown summary of its content. Read-only: no files are written; the summary is returned as output only. Use when asked to \"fetch and summarize\", \"summarize this URL\", \"what does this page say\", or \"get the content of <url>\". Proactively suggest when the user pastes a URL and asks what it contains. (munder-difflin)", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/md-fetch-summarize"}, {"id": "bundled:md-hive-sync", "name": "md-hive-sync", "description": "Munder Difflin hive sync \u2014 runs the start-of-task hive protocol steps: reads memory.md, checks inbox/ for new messages, and reminds you to record durable facts in memory.md and write coordination files before ending. Use when asked to \"sync with the hive\", \"check my inbox\", \"hive status\", or \"hive sync\". Proactively suggest at the start of a new task if you haven't checked your hive inbox in this conversation. (munder-difflin)", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/md-hive-sync"}, {"id": "bundled:temporal", "name": "temporal", "description": "Resolve ANY named time window \u2014 today, yesterday, thisWeek, lastWeek, last7Days, last30Days, last90Days, thisMonth, lastMonth, thisQuarter, lastQuarter, thisYear, lastYear, last12Months \u2014 or an arbitrary range (lastNdays / lastNweeks / lastNmonths) to a concrete ISO date range relative to your run time. Read-only: no writes, no network. Use whenever a task is time-scoped and you need exact start/end dates without computing them by hand.", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/temporal"}, {"id": "bundled:thisMonth", "name": "thisMonth", "description": "Resolve \"thisMonth\" to a concrete ISO date range relative to your run time \u2014 this month so far (1st \u2192 today). Returns inclusive civil dates plus exact UTC instants so you have temporal context without computing dates by hand. Read-only: no writes, no network. Use before a month-to-date task (MTD metrics, \"so far this month\").", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/thisMonth"}, {"id": "bundled:thisQuarter", "name": "thisQuarter", "description": "Resolve \"thisQuarter\" to a concrete ISO date range relative to your run time \u2014 this quarter so far (quarter start \u2192 today). Returns inclusive civil dates plus exact UTC instants so you have temporal context without computing dates by hand. Read-only: no writes, no network. Use before a quarter-to-date task (QTD metrics, \"this quarter\").", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/thisQuarter"}, {"id": "bundled:thisWeek", "name": "thisWeek", "description": "Resolve \"thisWeek\" to a concrete ISO date range relative to your run time \u2014 this week so far (Monday \u2192 today). Returns inclusive civil dates plus exact UTC instants so you have temporal context without computing dates by hand. Read-only: no writes, no network. Use before a week-to-date task (this week's activity, weekly standups).", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/thisWeek"}, {"id": "bundled:thisYear", "name": "thisYear", "description": "Resolve \"thisYear\" to a concrete ISO date range relative to your run time \u2014 this year so far (Jan 1 \u2192 today). Returns inclusive civil dates plus exact UTC instants so you have temporal context without computing dates by hand. Read-only: no writes, no network. Use before a year-to-date task (YTD metrics, \"so far this year\").", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/thisYear"}, {"id": "bundled:today", "name": "today", "description": "Resolve \"today\" to a concrete ISO date range relative to your run time \u2014 today. Returns inclusive civil dates plus exact UTC instants so you have temporal context without computing dates by hand. Read-only: no writes, no network. Use before any task scoped to today (today's logs, metrics, \"what happened today\").", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/today"}, {"id": "bundled:yesterday", "name": "yesterday", "description": "Resolve \"yesterday\" to a concrete ISO date range relative to your run time \u2014 yesterday. Returns inclusive civil dates plus exact UTC instants so you have temporal context without computing dates by hand. Read-only: no writes, no network. Use before a task scoped to yesterday (daily reports, \"what changed yesterday\").", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/yesterday"}],
  gitIsRepo: async () => false,
  // A memory file is TEXT. The generic [] answer reached `.trim()` in the
  // memory graph and took the panel down.
  hiveMemory: async () => '',

  // Credentials for a keyed MCP server. The preview keeps them in localStorage
  // so the field's set/clear states can be exercised; the real bridge stores
  // them encrypted in the main process.
  dbConnSetUrl: async function (req) {
    try { localStorage.setItem('atlas.preview.dburl.' + req.id, '1'); } catch (e) { /* noop */ }
    return { ok: true };
  },
  dbConnHasUrl: async function (id) {
    try { return localStorage.getItem('atlas.preview.dburl.' + id) === '1'; } catch (e) { return false; }
  },
  dbConnClearUrl: async function (id) {
    try { localStorage.removeItem('atlas.preview.dburl.' + id); } catch (e) { /* noop */ }
    return { ok: true };
  },

  mcpSecretSet: async function (req) {
    try { localStorage.setItem('atlas.preview.mcp.' + req.id + '.' + req.envName, '1'); } catch (e) { /* noop */ }
    return { ok: true };
  },
  mcpSecretHas: async function (id, envName) {
    try { return localStorage.getItem('atlas.preview.mcp.' + id + '.' + envName) === '1'; } catch (e) { return false; }
  },
  mcpSecretClear: async function (id, envName) {
    try { localStorage.removeItem('atlas.preview.mcp.' + id + '.' + envName); } catch (e) { /* noop */ }
    return { ok: true };
  },

  // The generic [] answered these too, and a list where an OBJECT belongs put
  // `undefined.trim()` in the Triggers tab and took the window down with it.
  getOrgTrigger: async () => ({ apiKey: '', enabled: false, mode: 'inbox' }),
  listWebhooks: async () => [],

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

    // Import hire. The real handler opens Electron's file dialog and validates
    // every manifest in the main process (readHireManifestFiles). A browser can
    // read files the USER picks with no permission prompt at all, so the preview
    // does the same thing with a file input and a light version of the same
    // checks: parse, require the spec tag and a name. Anything else is reported
    // as a skipped file, exactly like the real one.
    importHireFiles: function () {
      return new Promise(function (resolve) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.multiple = true;
        input.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(input);
        var done = function (out) { input.remove(); resolve(out); };
        input.onchange = function () {
          var files = Array.prototype.slice.call(input.files || []);
          if (!files.length) return done({ ok: false, manifests: [], errors: [], error: 'cancelled' });
          Promise.all(files.map(function (f) {
            return f.text().then(function (text) {
              var m = JSON.parse(text);
              if (m.spec !== 'munder-difflin/hire@1') throw new Error('wrong spec');
              if (!m.name || typeof m.name !== 'string') throw new Error('no name');
              return { ok: true, manifest: m };
            }).catch(function (e) { return { ok: false, file: f.name, why: e.message }; });
          })).then(function (results) {
            var manifests = results.filter(function (r) { return r.ok; }).map(function (r) { return r.manifest; });
            var errors = results.filter(function (r) { return !r.ok; })
              .map(function (r) { return r.file + ' (' + r.why + ')'; });
            done({
              ok: manifests.length > 0,
              manifests: manifests,
              errors: errors,
              error: manifests.length ? undefined : 'no valid hire manifests selected',
            });
          });
        };
        // A cancelled file dialog fires no event in most browsers; `cancel` is
        // supported in current Chrome, and the promise simply never settles in
        // one that is not, which is the same as the user changing their mind.
        input.oncancel = function () { done({ ok: false, manifests: [], errors: [], error: 'cancelled' }); };
        input.click();
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
