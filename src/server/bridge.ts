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
 * THE METHOD TABLE IS GENERATED, from preload/index.ts, by
 * tools/gen-bridge-map.cjs. It was hand-written once and drifted immediately:
 * the renderer calls `spawnPty`, the table said `ptySpawn`, and the page died
 * on an undefined result. Preload is the authority for what a method is called
 * and which channel it reaches; this just reads it.
 */
import { INVOKE, SYNC, EVENTS, PTY_EVENTS } from './bridgeMap.generated';

export { INVOKE, SYNC, EVENTS, PTY_EVENTS };

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
  var METHODS = ${JSON.stringify(Object.keys(INVOKE))};
  var EVENTS = ${JSON.stringify(EVENTS)};
  var PTY_EVENTS = ${JSON.stringify(PTY_EVENTS)};
  var SYNC = ${JSON.stringify(Object.keys(SYNC))};

  var subs = Object.create(null);
  var stream = new EventSource('/events');
  // A relaunch (reset, workspace switch) replaces the process behind this page.
  // EventSource reconnects by itself; the PAGE is the stale part at that point,
  // holding a config and a roster the new process has already replaced.
  var dropped = false;
  stream.onerror = function () { dropped = true; };
  stream.onopen = function () { if (dropped) window.location.reload(); };
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

  // Blocking on purpose, and only at boot: the zustand store is built at module
  // load and an async roster would arrive after the first paint. Same trade the
  // app makes with ipcRenderer.sendSync.
  var callSync = function (method) {
    try {
      var x = new XMLHttpRequest();
      x.open('POST', '/rpc', false);
      x.setRequestHeader('content-type', 'application/json');
      x.send(JSON.stringify({ method: method, args: [] }));
      var res = JSON.parse(x.responseText);
      return res && !res.error && res.value !== undefined ? res.value : null;
    } catch (err) { return null; }
  };

  var api = {
    // Values, not calls — the Proxy below would otherwise hand back a function.
    version: window.__ATLAS_VERSION__ || '0.0.0-server',
    platform: window.__ATLAS_PLATFORM__ || 'browser',
    arch: window.__ATLAS_ARCH__ || 'unknown',
    // Browser mode has no Electron window to own these.
    isServerMode: true
  };
  SYNC.forEach(function (name) {
    api[name] = function () { return callSync(name); };
  });
  // The one sync method with no main-process side: a browser never hands JS a
  // real path for a dropped file.
  api.pathForFile = function () { return ''; };
  METHODS.forEach(function (m) {
    api[m] = function () { return call(m, Array.prototype.slice.call(arguments)); };
  });
  // Subscriptions. Two shapes, same as preload: pty listeners name a pty in
  // their first argument, everything else takes the callback alone.
  Object.keys(EVENTS).forEach(function (name) {
    api[name] = function (cb) { return subscribe(EVENTS[name], cb); };
  });
  Object.keys(PTY_EVENTS).forEach(function (name) {
    api[name] = function (id, cb) { return subscribe(PTY_EVENTS[name] + ':' + id, cb); };
  });

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
