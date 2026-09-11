/**
 * MemPalace in a container, for machines that refuse to run it natively.
 *
 * WHY THIS EXISTS. MemPalace's dependencies (chromadb, tokenizers, onnxruntime)
 * are C-extension wheels, and an endpoint policy like ThreatLocker refuses to
 * let Python dlopen an ad-hoc signed `.so`. Measured on this fleet: the same
 * wheel fails under the system Python AND under Homebrew's, from /tmp and from
 * $HOME, always `mmap(...) failed with errno=1`. It is not a path rule and no
 * reinstall fixes it — a NODE addon of the same signature loads fine from the
 * same directory, so the policy tracks the loading process. A Linux container
 * has none of it.
 *
 * The shape is a SHIM, not a rewrite. `memory.ts` resolves a `mempalace` binary
 * and shells out to it; this writes a script that satisfies that contract by
 * running the container, so the mine loop, the quarantine backoff, the reaper
 * and the agents' own `mempalace search` are untouched.
 *
 * The trick that makes that possible is mounting host paths at the SAME
 * absolute path inside the container: `mempalace mine /Users/x/hive/agents/pam`
 * then means the same thing on both sides and no argument needs rewriting.
 */
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

/** Pinned, with the version in the tag: an upgrade becomes a different image
 *  rather than a silent rebuild of the same name. */
export const MEMPALACE_IMAGE = 'atlas-mempalace:3.9.0';

/** Docker Desktop does not put itself on the PATH of a GUI-launched app, so the
 *  usual install locations are probed too. */
export function dockerBin(): string | null {
  const candidates = [
    '/usr/local/bin/docker',
    '/opt/homebrew/bin/docker',
    join(homedir(), '.docker', 'bin', 'docker'),
    '/Applications/Docker.app/Contents/Resources/bin/docker'
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  try {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['docker'],
      { encoding: 'utf8', timeout: 3000 });
    const p = r.stdout?.trim().split(/\r?\n/)[0]?.trim();
    if (p && existsSync(p)) return p;
  } catch { /* no docker */ }
  return null;
}

/** Installed is not running: Docker Desktop can be present with its daemon
 *  stopped, and every `docker run` then fails with a message about the socket.
 *  Ask the daemon, not the filesystem. */
export function dockerReady(bin: string): boolean {
  try {
    return spawnSync(bin, ['info', '--format', '{{.ServerVersion}}'],
      { encoding: 'utf8', timeout: 8000 }).status === 0;
  } catch { return false; }
}

/** Is Docker present AND its daemon up? Surfaced on the memory status so the
 *  panel can say "start Docker" instead of the useless "not set up". */
export function dockerState(): { installed: boolean; running: boolean } {
  const bin = dockerBin();
  if (!bin) return { installed: false, running: false };
  return { installed: true, running: dockerReady(bin) };
}

export function imageExists(bin: string): boolean {
  try {
    return spawnSync(bin, ['image', 'inspect', MEMPALACE_IMAGE],
      { encoding: 'utf8', timeout: 15000 }).status === 0;
  } catch { return false; }
}

/**
 * A CA bundle for the build, or null when the machine can offer none.
 *
 * This network re-signs TLS, so `pip install` inside the container fails with
 * CERTIFICATE_VERIFY_FAILED unless the corporate root is trusted. The first
 * version of this read one file under ~/.claude/certs, which exists on exactly
 * one machine — every colleague's build would have died at pip.
 *
 * macOS keeps the root IT installed in the System keychain, so it is exported
 * at build time. BOTH keychains are needed and this was measured: the System
 * keychain alone (12 certs) gets pip through the intercepting proxy and then
 * fails downloading the embedding model, because it holds no public roots.
 * SystemRootCertificates supplies those; together, 170.
 */
function caBundle(): string | null {
  const explicit = join(homedir(), '.claude', 'certs', 'combined-ca-bundle.pem');
  if (existsSync(explicit)) {
    try { return readFileSync(explicit, 'utf8'); } catch { /* fall through */ }
  }
  if (process.platform !== 'darwin') return null;
  const pems: string[] = [];
  for (const keychain of [
    '/Library/Keychains/System.keychain',
    '/System/Library/Keychains/SystemRootCertificates.keychain'
  ]) {
    try {
      const r = spawnSync('/usr/bin/security', ['find-certificate', '-a', '-p', keychain],
        { encoding: 'utf8', timeout: 20000, maxBuffer: 1 << 24 });
      if (r.status === 0 && r.stdout.includes('BEGIN CERTIFICATE')) pems.push(r.stdout);
    } catch { /* a keychain we cannot read is not fatal */ }
  }
  return pems.length ? pems.join('\n') : null;
}

/**
 * Build the image from the Dockerfile shipped in app resources.
 *
 * The build context is a temp directory rather than the resources folder: the
 * CA bundle is a machine-local file that must NOT live in the app bundle, and
 * a Docker build can only read files inside its own context. Copying the two
 * files into a temp dir keeps the bundle clean and works when resources are
 * read-only (packaged app, asar).
 */
export function buildImage(
  bin: string,
  resourceDir: string,
  onLine?: (line: string) => void
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const dockerfile = join(resourceDir, 'Dockerfile');
    if (!existsSync(dockerfile)) {
      resolve({ ok: false, error: `Dockerfile missing at ${dockerfile}` });
      return;
    }
    const ctx = join(tmpdir(), `atlas-mempalace-build-${Date.now()}`);
    try {
      mkdirSync(ctx, { recursive: true });
      copyFileSync(dockerfile, join(ctx, 'Dockerfile'));
      const ca = caBundle();
      if (ca) writeFileSync(join(ctx, 'ca.pem'), ca, 'utf8');
    } catch (e) {
      resolve({ ok: false, error: `build context: ${(e as Error).message}` });
      return;
    }
    const child = spawn(bin, ['build', '-t', MEMPALACE_IMAGE, '.'], { cwd: ctx });
    let tail = '';
    const take = (b: Buffer): void => {
      const s = b.toString();
      tail = (tail + s).slice(-2000);
      for (const line of s.split('\n')) if (line.trim()) onLine?.(line.trim());
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', (e) => {
      rmSync(ctx, { recursive: true, force: true });
      resolve({ ok: false, error: e.message });
    });
    child.on('close', (code) => {
      rmSync(ctx, { recursive: true, force: true });
      resolve(code === 0 ? { ok: true } : { ok: false, error: tail.trim().slice(-400) });
    });
  });
}

/**
 * Write the `mempalace` shim and return its path.
 *
 * `mountDirs` are mounted at their own absolute paths — the palace and the hive
 * root — which is what lets every argument pass through unrewritten. A missing
 * directory is skipped rather than mounted: Docker would otherwise CREATE it as
 * a root-owned empty dir on the host.
 */
export function writeShim(binDir: string, dockerPath: string, mountDirs: string[]): string {
  mkdirSync(binDir, { recursive: true });
  const shim = join(binDir, 'mempalace');
  const mounts = [...new Set(mountDirs.filter((d) => d && existsSync(d)))]
    .map((d) => `  -v ${JSON.stringify(`${d}:${d}`)} \\`)
    .join('\n');
  writeFileSync(shim, `#!/bin/sh
# Generated by Atlas. MemPalace cannot load its native wheels on this machine,
# so it runs in a container; host paths are mounted at the SAME absolute path
# so every argument means the same thing on both sides.
# Regenerated whenever the palace or hive root changes — do not edit.
exec ${JSON.stringify(dockerPath)} run --rm -i \\
${mounts}
  ${JSON.stringify(MEMPALACE_IMAGE)} "$@"
`, 'utf8');
  chmodSync(shim, 0o755);
  return shim;
}
