# Atlas 0.8.1

A local office of coding agents. Atlas runs the floor, the agents do the work, and
everything stays on your machine.

## What's new

- **Memory search that needs no install.** Every agent's `memory.md` is indexed so
  the crew can search each other's notes. SQLite where it loads, a plain jsonl
  index where it does not — no container, no Python, no model download.
- **A desk each.** Assign a desk from the floor plan when you add or edit an
  agent, or leave it and take the first free one. The plan shows you which.
- **Team leads.** Mark an agent as its project's lead: it takes one of the two
  side offices and is briefed to own that project's board rather than be
  dispatched to like a worker.
- **The office opens like an office.** Atlas walks in through his own door and
  sits, then the crew files in one at a time — leads first — and everyone goes to
  their own desk and turns the screen on before wandering off for coffee.
- **The boardroom is used.** Brief two or more agents at once and they meet at the
  table; three agents talking to each other do the same without Atlas.
- **Restart says what it will cost.** Updating quits every agent process, so the
  dialog names who is mid-task and Settings keeps the restart when the floor is
  busy. Notes on disk and each agent's own thread survive; the turn in flight does
  not.
- **Update flow rebuilt.** The notice is a proper dialog with the release notes in
  full, and Settings → Updates shows your version, a live status line and a
  Check now button.
- **Night theme for the office**, by repainting the tileset rather than filtering
  the scene, so the agents stay as drawn. Settings → General.

## Install

| Platform | Download |
| --- | --- |
| macOS (Intel + Apple Silicon) | `Atlas-0.8.1-mac-universal.dmg` |
| Windows | `Atlas-0.8.1-win-x64-setup.exe` |
| Windows (portable) | `Atlas-0.8.1-win-x64-portable.exe` |
| Linux | `Atlas-0.8.1-linux-x86_64.AppImage` |

Source: <https://github.com/sahilethara/atlas/archive/refs/tags/v0.8.1.tar.gz>

## Notes

- Updates install only when you press Restart. Nothing restarts on its own.
- Needs at least one agent CLI on `PATH`; everyone brings their own account.
