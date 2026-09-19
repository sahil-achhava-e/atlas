/**
 * The browser's half of `window.cth`, and the server's half of the same rope.
 *
 * In the app, the renderer calls `window.cth.something()` and preload turns it
 * into `ipcRenderer.invoke('some:channel')`. Here the page calls the same method
 * and the bridge turns it into `POST /rpc {channel, args}`, which the server
 * dispatches through the SAME ipcMain handlers the Electron build registered.
 * The UI cannot tell the difference, which is the point: no renderer code
 * changes, no second implementation to keep in step.
 *
 * TWO DIRECTIONS, TWO MECHANISMS. Calls are request/response, so they are plain
 * POSTs. Events — pty bytes, hive messages, hook payloads — are one-way and
 * frequent, so they ride a single Server-Sent Events stream. SSE rather than a
 * WebSocket on purpose: it is one GET, it reconnects by itself, and it needs no
 * dependency, which keeps `npm run serve` a thing you can run anywhere.
 *
 * THE METHOD TABLE IS DELIBERATE. It would be easy to let the page name any
 * channel and forward it blindly; that would also let a page on another tab
 * drive the hive. Only what is listed here is reachable.
 */

/** `cth` method name → the ipcMain channel it invokes. Mirrors preload/index.ts;
 *  anything absent is simply not available in browser mode yet. */
export const METHOD_CHANNELS: Record<string, string> = {
  // config + roster
  getConfig: 'config:get',
  updateConfig: 'config:update',
  harnessHome: 'config:home',
  rosterRead: 'roster:read',
  rosterWrite: 'roster:write',

  // terminals
  ptySpawn: 'pty:spawn',
  ptyWrite: 'pty:write',
  ptyResize: 'pty:resize',
  ptyKill: 'pty:kill',
  ptyList: 'pty:list',

  // the hive
  hiveState: 'hive:state',
  hiveSend: 'hive:send',
  hiveTasks: 'hive:tasks',
  hiveBoard: 'hive:board',
  hiveRenameAgent: 'hive:renameAgent',

  // memory + knowledge
  memoryStatus: 'memory:status',
  memorySearch: 'memory:search',
  knowledgeStatus: 'knowledge:status',
  knowledgeSearch: 'knowledge:search',

  // app
  appInfo: 'app:info',
  historyAdd: 'history:add',
  historyList: 'history:list',
  historySearch: 'history:search'
};

/** Channels the main process pushes at the renderer, forwarded to the page over
 *  SSE. The page subscribes with the same `onX(cb)` names it always used. */
export const EVENT_CHANNELS: readonly string[] = [
  'pty:data',
  'pty:exit',
  'hive:hookEvent',
  'hive:message',
  'hive:degraded',
  'config:changed',
  'update:status',
  'app:closeRequested'
];

/**
 * The script served at /cth.js.
 *
 * Written as a string rather than a module because it runs in the PAGE, not in
 * the server's module graph, and it must be present before the app bundle asks
 * for `window.cth` — the server injects it into index.html ahead of the bundle.
 */
export function clientScript(): string {
  return `(function () {
  'use strict';
  var METHODS = ${JSON.stringify(Object.keys(METHOD_CHANNELS))};
  var EVENTS = ${JSON.stringify(EVENT_CHANNELS)};

  // One SSE stream carries every push channel. Subscribers are kept per channel
  // and per pty id, because pty:data is addressed (pty:data:<id>) in the app and
  // the page subscribes the same way.
  var subs = Object.create(null);
  var stream = new EventSource('/events');
  stream.onmessage = function (e) {
    var msg;
    try { msg = JSON.parse(e.data); } catch (err) { return; }
    var list = subs[msg.channel];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i].apply(null, msg.args || []); } catch (err) { /* a dead listener */ }
    }
  };
  var subscribe = function (channel, cb) {
    (subs[channel] = subs[channel] || []).push(cb);
    return function () {
      subs[channel] = (subs[channel] || []).filter(function (f) { return f !== cb; });
    };
  };

  var call = function (method, args) {
    return fetch('/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: method, args: args })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.error) throw new Error(res.error);
      return res ? res.value : undefined;
    });
  };

  var api = {
    // Values, not calls — the Proxy below would otherwise hand back a function.
    version: window.__ATLAS_VERSION__ || '0.0.0-server',
    platform: window.__ATLAS_PLATFORM__ || 'browser',
    arch: window.__ATLAS_ARCH__ || 'unknown',
    // Browser mode has no Electron window to own these.
    isServerMode: true
  };
  METHODS.forEach(function (m) {
    api[m] = function () { return call(m, Array.prototype.slice.call(arguments)); };
  });
  // Subscriptions: onPtyData('id', cb) addresses a channel; the rest are plain.
  api.onPtyData = function (id, cb) { return subscribe('pty:data:' + id, cb); };
  api.onPtyExit = function (cb) { return subscribe('pty:exit', cb); };
  api.onHiveHookEvent = function (cb) { return subscribe('hive:hookEvent', cb); };
  api.onHiveMessage = function (cb) { return subscribe('hive:message', cb); };
  api.onConfigChanged = function (cb) { return subscribe('config:changed', cb); };
  api.onUpdateStatus = function (cb) { return subscribe('update:status', cb); };

  // Anything the UI asks for that browser mode does not implement resolves empty
  // rather than throwing: a missing feature should leave a quiet gap in the page,
  // not a white screen. Same contract the preview harness uses.
  window.cth = new Proxy(api, {
    get: function (target, name) {
      if (typeof name !== 'string') return undefined;
      if (name in target) return target[name];
      return function () {
        if (/^on[A-Z]/.test(name)) return function () {};   // unsubscribe
        return Promise.resolve(undefined);
      };
    }
  });
})();`;
}
