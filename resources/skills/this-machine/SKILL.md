---
name: this-machine
description: |
  What is locked down on this Mac and what to do instead. Read BEFORE installing
  anything with a compiled component (pip packages, node native addons, standalone
  binaries), and the moment you see `mmap(...) failed with errno=1`, a `dlopen`
  failure, a process killed on launch, or an `UnknownIssuer` / certificate error
  on a download. Saves re-diagnosing a policy that no reinstall will fix.
---

# This machine

ThreatLocker enforces two rules here. Both look like ordinary bugs the first
time, and neither is fixable by retrying, reinstalling, or a different version.

## 1. Compiled code only runs from `/opt/homebrew`

The block is **by path, not by signature**. A `.so` or `.dylib` that is ad-hoc
or linker-signed (which is nearly every pip wheel and every prebuilt CLI) will
not load from under:

- `$HOME` — including every venv, `node_modules`, and `~/.local`
- `/tmp` and `/private/tmp`
- `/Users/Shared`

It loads fine from `/opt/homebrew`. Same file, same signature, different folder.

**The symptom:**

```
ImportError: dlopen(.../lxml/etree.cpython-39-darwin.so):
  mmap(size=0x914878) failed with errno=1
```

A standalone binary shows it differently: it is SIGKILLed at launch with no
message at all.

**The catch:** `/opt/homebrew` is owned by the admin account (`alixi`) and is
not writable by you — `brew install` fails on permissions. So the one allowed
location is one you cannot install into. Only IT can, and only IT can grant a
ThreatLocker allowance for another folder. You can request; you cannot approve.

**What this rules out, measured:**

| Wanted | Why it fails | Use instead |
|---|---|---|
| `esbuild` | native binary killed at launch | `esbuild-wasm` |
| `python-docx` | pulls `lxml` (native) | pure-Python only, or generate the XML |
| `pydantic`, `tiktoken`, `numpy`, `pandas` | native extension | no local substitute; do it in JS or on a server |
| any `pip install` of a C-extension wheel | see above | check the package is pure Python first |

Pure-Python packages install and run normally. Node and JS are unaffected as
long as the package is not a native addon.

## 2. TLS is intercepted

Outbound HTTPS is re-signed by a corporate CA, so anything with its own trust
store fails with `invalid peer certificate: UnknownIssuer` or an SSL error. The
bundle is at `~/.claude/certs/combined-ca-bundle.pem`:

```bash
export SSL_CERT_FILE=~/.claude/certs/combined-ca-bundle.pem   # python, uv, curl
export NODE_EXTRA_CA_CERTS=~/.claude/certs/combined-ca-bundle.pem
uv tool install --system-certs <pkg>                          # uv needs the flag too
```

`az` has its own setup for this — see the `azure-devops` skill.

## Before you spend a turn on it

Check whether the thing you are about to install ships compiled code. If it
does, say so and propose the JS or wasm route rather than installing it,
failing, and diagnosing the failure. If there is genuinely no substitute, tell
the human what to ask IT for: an allowance for the exact folder, named.
