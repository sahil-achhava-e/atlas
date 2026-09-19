/**
 * Keeping a machine awake without Electron.
 *
 * Electron's `powerSaveBlocker` is Chromium's, and browser mode runs under plain
 * node. Every desktop OS ships the same capability some other way, so this picks
 * the command that holds it — each one holds the assertion for exactly as long
 * as the process lives, which is the lifetime wanted: kill it and the machine is
 * free to sleep again, and a crash cannot leave a machine pinned awake.
 *
 * `null` means this platform has no answer we trust, and the caller degrades to
 * the no-op it had before rather than pretending.
 */

export interface KeepAwakeCommand { exe: string; args: string[] }

/** Windows has no command for this, but it does have the API — and PowerShell
 *  can call it. `SetThreadExecutionState` is per-THREAD, so the process that
 *  called it has to stay alive on that same thread, which is what the sleep loop
 *  is for; Windows drops the request when the process ends. */
function windowsScript(display: boolean): string {
  const ES_CONTINUOUS = 0x80000000;
  const ES_SYSTEM_REQUIRED = 0x00000001;
  const ES_DISPLAY_REQUIRED = 0x00000002;
  const flags = ES_CONTINUOUS | ES_SYSTEM_REQUIRED | (display ? ES_DISPLAY_REQUIRED : 0);
  return [
    "$sig = '[DllImport(\"kernel32.dll\", SetLastError=true)] public static extern uint SetThreadExecutionState(uint f);';",
    '$p = Add-Type -MemberDefinition $sig -Name Power -Namespace Atlas -PassThru;',
    `$p::SetThreadExecutionState(0x${(flags >>> 0).toString(16).toUpperCase()}) | Out-Null;`,
    'while ($true) { Start-Sleep -Seconds 3600 }'
  ].join(' ');
}

/**
 * @param platform  `process.platform`
 * @param type      Electron's own vocabulary: 'prevent-display-sleep' also keeps
 *                  the SCREEN on, which is more than the app usually wants.
 */
export function keepAwakeCommand(platform: string, type?: string): KeepAwakeCommand | null {
  const display = type === 'prevent-display-sleep';

  if (platform === 'darwin') {
    // -i: no idle sleep. -d adds the display.
    return { exe: 'caffeinate', args: [display ? '-di' : '-i'] };
  }

  if (platform === 'win32') {
    return {
      exe: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', windowsScript(display)]
    };
  }

  if (platform === 'linux') {
    // systemd-inhibit is on any systemd desktop, which is nearly all of them.
    // `--mode=block` holds it for the child's lifetime, and `sleep infinity` is
    // the child that does nothing else.
    return {
      exe: 'systemd-inhibit',
      args: [
        `--what=${display ? 'idle:sleep:handle-lid-switch' : 'idle:sleep'}`,
        '--who=Atlas', '--why=agents are working', '--mode=block',
        'sleep', 'infinity'
      ]
    };
  }

  return null;
}
