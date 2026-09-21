# Atlas 0.8.2

A local office of coding agents. Atlas runs the floor, the agents do the work, and
everything stays on your machine.

## What's new

- **State lives in SQLite.** The roster — who is on the floor, their briefings,
  desks, notes and queues — moved out of the browser's localStorage into a
  database beside the hive, one row per agent. Settings, projects and the
  workspace list moved too. A window that knows less than the database can no
  longer overwrite what it does not know, and a save that leaves out an agent's
  desk or face no longer erases it.
- **Deleting an agent sticks, and nothing is archived behind your back.** An
  agent leaves when you delete it, and only then.
- **An idle floor sits at its desks.** Agents stay at their desk and leave it for
  something with a destination — coffee, an errand, a meeting. Aimless
  wandering is gone. Everyone arrives together three seconds after Atlas,
  instead of filing in one every two seconds.
- **A lead gets their own office**, with the spare desk free, and their reviewer
  can sit with them.
- **Work goes through the lead.** Ask Atlas for something in a project and it
  becomes a card assigned to that project's lead, who assigns an engineer.
  Answering a question is still Atlas's own job; changing a repo is not.
- **Hire into a repo inside a project.** A folder holding three repositories now
  offers all three, so an agent can be pinned to the one it works in and get its
  own worktree there.
- **Three skills ship with the app**: reproduce-first bug fixing, a pre-commit
  review gate, and a merge-decision PR review. Your own skills go in
  `~/Atlas/skills` and are installed for every agent automatically.
- **Both sides of the conversation.** The read-only view shows what you asked,
  not just what the agent answered.
- **In-session subagents are off.** Work goes to agents you hired, where you can
  see them, rather than to helpers that vanish with the session.
- **Nobody is called God.** The orchestrator is called by name everywhere a
  person or an agent reads it.
- **A crash fixed that had been taking the app down at random** — a prepared
  statement collected after its database had gone, which aborted the process.

## Running it on a managed laptop

Company machines usually cannot install a signed app without approvals. Browser
mode needs none: `npm run setup:serve` then `npm run serve`, and open
`http://127.0.0.1:5188`. Same program, same workspace, no compiler required.
See `docs/BROWSER-MODE.md`.

## Install

| Platform | Download |
| --- | --- |
| macOS (Intel + Apple Silicon) | `Atlas-0.8.2-mac-universal.dmg` |
| Windows | `Atlas-0.8.2-win-x64-setup.exe` |
| Windows (portable) | `Atlas-0.8.2-win-x64-portable.exe` |
| Linux | `Atlas-0.8.2-linux-x86_64.AppImage` |

Source: <https://github.com/sahilethara/atlas/archive/refs/tags/v0.8.2.tar.gz>

## Notes

- Updates install only when you press Restart. Nothing restarts on its own.
- Needs at least one agent CLI on `PATH`; everyone brings their own account.
