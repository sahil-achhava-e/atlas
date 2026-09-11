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
      window.__ptyCalls = window.__ptyCalls || [];
      window.__ptyCalls.push({ call: 'spawn', id: opts && opts.id, resume: !!(opts && opts.resume) });
      return Promise.resolve({ ok: true, resumed: !!(opts && opts.resume) });
    },
    listPtys: function () {
      return Promise.resolve(Object.keys(ptys).map(function (id) { return ptys[id]; }));
    },
    killPty: function (id) {
      window.__ptyCalls = window.__ptyCalls || [];
      window.__ptyCalls.push({ call: 'kill' }); delete ptys[id]; return Promise.resolve(true); },
  // The generic fallback answers [] , which is TRUTHY — GitTab then read a
  // status object off it and threw. A preview folder is not a repo.
  // Real scan of this machine, taken by scratchpad/snap-skills.mjs. The browser
  // preview has no fs, and an empty list would make a working tab look broken.
  // Preview-only: the off list lives in app config, which the browser has none of.
  // The panel calls this on mount and after every toggle. With it missing the
  // call threw, status stayed null, and the button rendered "Turn on" over an
  // unknown state — which is how the inverted-toggle bug stayed invisible.
  // Nothing here can build an image: there is no main process in a browser.
  memoryStatus: async () => ({
    available: false, enabled: config.semanticMemory !== false, active: false,
    initialized: false, palacePath: null, model: config.embeddingModel || 'minilm',
    bin: null, preparing: false, prepareError: null, containerized: false,
    // A browser cannot see Docker. Reported as not running, which is what the
    // panel should say anyway — nothing here can build an image.
    docker: { installed: false, running: false }
  }),
  memoryRefresh: async () => window.cth.memoryStatus(),
  // A live-looking context so the gauge renders. Returning null (the default
  // empty) hid the whole block, so nothing about it could be checked here.
  agentContext: async () => 42100,
  // A real multi-file chooser, because that is what the packaged app opens:
  // dialog.showOpenDialog with ['openFile','multiSelections']. A browser cannot
  // read absolute paths, so the fake path is the file name — enough for the
  // attachment list to render and for the button to be exercised.
  attachFiles: function () {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', function () {
        var files = Array.prototype.slice.call(input.files || []);
        input.remove();
        if (!files.length) { resolve({ ok: false, error: 'cancelled' }); return; }
        resolve({ ok: true, files: files.map(function (f) {
          return { path: '/preview/' + f.name, name: f.name };
        }) });
      });
      // A cancelled picker fires no event in most browsers; resolve on the next
      // focus so the promise never dangles.
      window.addEventListener('focus', function once() {
        window.removeEventListener('focus', once);
        setTimeout(function () {
          if (document.body.contains(input)) { input.remove(); resolve({ ok: false, error: 'cancelled' }); }
        }, 400);
      });
      input.click();
    });
  },
  // Three asks, one of each shape the board can hold: a decision, a to-do only
  // a person can do, and one that is blocking other work. Without these the
  // Needs you tab could only ever be seen empty in a browser.
  hiveTasks: async () => ({ tasks: [
    {
      id: 'vms-1284', title: 'Booking migration: which branch?', status: 'blocked',
      agentId: 'atlas', agentName: 'Pam', updatedAt: Date.now() - 4 * 60_000,
      humanQA: [{
        q: 'The migration touches bookings and tickets. Do I branch off develop, or off the release branch that already has the pricing fix?',
        choices: ['Branch off develop', 'Branch off release/1.8 (has the pricing fix)', 'Wait until the release merges down']
      }]
    },
    {
      id: 'vms-1290', title: 'ADO pipeline needs a secret', status: 'blocked',
      agentId: 'atlas', agentName: 'Dwight', updatedAt: Date.now() - 22 * 60_000,
      dependsOn: [], humanQA: [{ askedAt: new Date().toISOString(), q: 'I cannot add EPICXP_SMTP_PASSWORD myself. Please add it in the ADO library and tell me when it is there.'
      }]
    },
    {
      id: 'vms-1301', title: 'Delete the legacy voucher endpoint?', status: 'blocked',
      agentId: 'atlas', agentName: 'Jim', updatedAt: Date.now() - 90 * 60_000,
      humanQA: [
        { askedAt: new Date().toISOString(), q: 'Nothing in the repo calls /api/v1/vouchers/redeem any more, but it is public. Which of these should I do?',
          multi: true,
          choices: ['Mark it deprecated in the docs', 'Add a sunset header', 'Log every remaining caller for a month', 'Delete it now'] },
        { askedAt: new Date(Date.now() - 3 * 3600e3).toISOString(), q: 'Should the old vouchers keep working?', a: 'Yes, until March.', answeredAt: new Date().toISOString() }
      ]
    },
    {
      id: 'vms-1312', title: 'Voucher PDF font is missing in CI', status: 'blocked',
      agentId: 'atlas', agentName: 'Pam', updatedAt: Date.now() - 8 * 60_000,
      humanQA: [{ askedAt: new Date().toISOString(),
        q: 'The pipeline cannot find DejaVuSans.ttf when it renders the voucher. Should I vendor the font into the repo, or install it in the build image?',
        choices: ['Vendor the font into the repo', 'Install it in the build image'] }]
    },
    {
      id: 'vms-1275', title: 'Receipt PDF: inline the images instead of fetching them', status: 'doing',
      assignee: 'atlas', priority: 4, createdAt: new Date(Date.now() - 26 * 3600e3).toISOString()
    },
    {
      id: 'vms-1288', title: 'Add a smoke test for the voucher redemption flow', status: 'todo',
      assignee: 'atlas', priority: 2, createdAt: new Date(Date.now() - 5 * 3600e3).toISOString()
    },
    {
      id: 'vms-1291', title: 'Rename bookingLine.qty to quantity across the API', status: 'todo',
      priority: 1, createdAt: new Date(Date.now() - 2 * 3600e3).toISOString()
    },
    {
      id: 'vms-1264', title: 'Pipeline: cache node_modules between stages', status: 'done',
      assignee: 'atlas', priority: 3, createdAt: new Date(Date.now() - 50 * 3600e3).toISOString()
    }
  ] }),
  // Per-agent token cap: the real one writes config in main and returns the
  // whole config back. The preview keeps it in memory so the menu's save path
  // can actually be exercised.
  setAgentTokenCap: async function (agentId, tokenCap) {
    config.agentTokenCaps = config.agentTokenCaps || {};
    if (tokenCap && tokenCap > 0) config.agentTokenCaps[agentId] = tokenCap;
    else delete config.agentTokenCaps[agentId];
    save();
    return Object.assign({}, config);
  },
  resolveSessionCwd: async function (_id, cwd) { return cwd || '/Users/you/atlas-data'; },
  // A sample hive log, so the Activity timeline can be seen in a browser: one of
  // each kind it knows how to format.
  hiveLog: async function () {
    var now = Date.now();
    return [
      { ts: now - 41 * 60000, kind: 'spawn', agentId: 'pam', name: 'Pam' },
      { ts: now - 38 * 60000, kind: 'message', from: 'atlas', to: 'pam', act: 'request',
        subject: 'Trace every caller of attachReceiptPdf' },
      { ts: now - 26 * 60000, kind: 'drain', agentId: 'pam', count: 3 },
      { ts: now - 22 * 60000, kind: 'message', from: 'pam', to: 'atlas', act: 'inform',
        subject: 'Two callers, both in email.service.ts' },
      { ts: now - 15 * 60000, kind: 'escalate', subject: 'Which branch for the booking migration?' },
      { ts: now - 9 * 60000, kind: 'approval', approve: true },
      { ts: now - 4 * 60000, kind: 'message', from: 'atlas', to: 'jim', act: 'request',
        subject: 'Review the voucher endpoint removal' }
    ];
  },
  hiveBoard: async function () {
    return [
      '## In flight',
      '- **vms-1275** receipt PDF image inlining - Pam, PR open in ADO',
      '- **vms-1288** smoke test for voucher redemption - Pam, writing tests',
      '',
      '## Waiting on the human',
      '- **vms-1284** branch choice for the booking migration',
      '- **vms-1290** SMTP password in the ADO library',
      '',
      '## Done this week',
      '- **vms-1264** pipeline caches node_modules between stages'
    ].join('\n');
  },
  // Two live workers and one worktree kept back, so the Jobs tab can be seen
  // populated. Fields match WorkerSnapshot in main (workerId / ageMs / idleMs /
  // tokensUsed …) — my first pass invented friendlier names and the tab rendered
  // "up NaNd, tokens NaNM", which is what a made-up shape looks like.
  listWorkers: async function () {
    var now = Date.now();
    return {
      maxWorkers: 4,
      live: [
        { workerId: 'w-4471', reqId: 'vms-1275', name: 'receipt-pdf',
          baseBranch: 'develop', spawnedAt: now - 8 * 60000,
          ageMs: 8 * 60000, idleMs: 42 * 1000,
          tokensUsed: 184000, tokenCap: 1000000,
          hasSlack: false, releasing: false, status: 'working' },
        { workerId: 'w-4472', reqId: 'vms-1288', name: 'voucher-smoke',
          baseBranch: 'develop', spawnedAt: now - 3 * 60000,
          ageMs: 3 * 60000, idleMs: null,
          tokensUsed: 61000, tokenCap: 1000000,
          hasSlack: true, releasing: false, status: 'working' }
      ],
      preserved: [
        { workerId: 'w-4460', wtPath: '/Users/you/.atlas/worktrees/w-4460',
          baseBranch: 'develop', preservedAt: now - 26 * 3600e3 }
      ]
    };
  },
  skillsDisabled: async () => (window.__skillsOff = window.__skillsOff || []),
  skillsSetEnabled: async (name, on) => {
    const cur = new Set(window.__skillsOff || []);
    if (on) cur.delete(name); else cur.add(name);
    return (window.__skillsOff = [...cur]);
  },
  skillsLocal: async () => [{"id": "user:azure-devops", "name": "azure-devops", "description": "Azure DevOps plumbing \u2014 work item queries and updates, repro-step parsing, attachments, discussion comments, and pull requests via the az CLI and REST API. Use for any task touching ADO boards, PRs, or work items, and whenever an az command fails with an SSL certificate error. Covers the org-wide TLS interception setup that every az call depends on.", "provider": "claude", "scope": "user", "path": "/Users/mohammed.sahil/.claude/skills/azure-devops"}, {"id": "bundled:capabilities", "name": "capabilities", "description": "Your capability catalog \u2014 read this at boot. Lists the temporal date-range skills and the external integrations (reached via the loopback broker) available to you as a spawned worker, and exactly how to call each. Read-only. Consult it whenever you're unsure what tools/integrations you have or how to invoke them.", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/capabilities"}, {"id": "project:create-migration", "name": "create-migration", "description": "", "provider": "claude", "scope": "project", "path": "/Users/mohammed.sahil/Desktop/epicxp-events/.claude/skills/create-migration"}, {"id": "bundled:md-audit", "name": "md-audit", "description": "Read-only code quality audit \u2014 scan the current working directory for common issues (bugs, dead code, security hotspots, missing error handling) and return a prioritised findings report. No files are edited. Use when asked to \"audit the code\", \"quick audit\", \"find issues\", \"code scan\", or \"what's wrong with this codebase\". (munder-difflin)", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/md-audit"}, {"id": "bundled:ponytail", "name": "ponytail", "description": "Forces the laziest solution that actually works, simplest, shortest, most minimal. Channels a senior dev who has seen everything: question whether the task needs to exist at all (YAGNI), reach for the standard library before custom code, native platform features before dependencies, one line before fifty. Supports intensity levels: lite, full (default), ultra. Use on ANY coding task: writing, adding, refactoring, fixing, reviewing, or designing code, and choosing libraries or dependencies. Also use whenever the user says \"ponytail\", \"be lazy\", \"lazy mode\", \"simplest solution\", \"minimal solution\", \"yagni\", \"do less\", or \"shortest path\", or complains about over-engineering, bloat, boilerplate, or unnecessary dependencies. Do NOT use for non-coding requests (general knowledge, prose, translation, summaries, recipes).", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/ponytail"}, {"id": "bundled:temporal", "name": "temporal", "description": "Resolve ANY named time window \u2014 today, yesterday, thisWeek, lastWeek, last7Days, last30Days, last90Days, thisMonth, lastMonth, thisQuarter, lastQuarter, thisYear, lastYear, last12Months \u2014 or an arbitrary range (lastNdays / lastNweeks / lastNmonths) to a concrete ISO date range relative to your run time. Read-only: no writes, no network. Use whenever a task is time-scoped and you need exact start/end dates without computing them by hand.", "provider": "claude", "scope": "bundled", "path": "/Users/mohammed.sahil/Desktop/atlas/resources/skills/temporal"}],
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
        // kind + essential were missing, so every row fell outside both sections
        // and the panel reported "0 of 0 ready" — a state the real app cannot
        // reach, which meant the block was never actually being verified here.
        { id: 'engine:claude', kind: 'engine', label: 'Claude Code', essential: true,
          found: true, path: '/opt/homebrew/bin/claude',
          installCommand: 'npm install -g @anthropic-ai/claude-code',
          docsUrl: 'https://docs.claude.com/en/docs/claude-code' },
        { id: 'engine:codex', kind: 'engine', label: 'Codex', essential: false,
          found: true, path: '/opt/homebrew/bin/codex', installCommand: '' },
        { id: 'engine:gemini', kind: 'engine', label: 'Gemini CLI', essential: false,
          found: false, path: null, installCommand: '',
          docsUrl: 'https://github.com/google-gemini/gemini-cli' },
        { id: 'git', kind: 'prerequisite', label: 'git', essential: true,
          found: true, path: '/usr/bin/git', installCommand: '' },
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
