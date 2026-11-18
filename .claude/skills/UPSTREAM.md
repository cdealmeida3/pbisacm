# Agent skills: where they come from

The folders next to this file are agent skills for Claude Code. They come from two sources, and they change nothing in the app:

- **Matt Pocock's skills**, "Skills For Real Engineers": 27 skills that help a developer plan, test, review and write documents with an agent. Decision: D254 in [docs/DECISIONS.md](../../docs/DECISIONS.md).
- **Google Chrome's `modern-web-guidance`**: one skill with short guides on modern HTML, CSS and browser JavaScript, for work on the screens. Decision: D260.

The manifest [upstream.json](upstream.json) lists the copied files by source: for each source its tag, its commit and the sha256 of every copied file. `tools/repository-rules.ts` (run by `npm test`) fails when a file in this folder is not exactly as `upstream.json` lists it, when a path is listed by two sources, and when a `GLOSSARY.md` or `docs/adr/` exists anywhere.

## Matt Pocock's skills

### The source

| | |
|---|---|
| Repository | `github.com/mattpocock/skills` |
| Tag | `v1.3.2` |
| Commit | `d1478fcb140db0b93c0c8df17bcfd311844749d0` (29 Oct 2026) |
| Licence | MIT, in [UPSTREAM-LICENSE](UPSTREAM-LICENSE) (the licence asks that the notice stays with the copy) |
| Manifest | [upstream.json](upstream.json), the source `mattpocock-skills` |

### What was copied

- The 27 skills of the release, as listed in `.claude-plugin/plugin.json` of the tag: 20 from `skills/engineering/` and 7 from `skills/productivity/`. Not copied: `skills/in-progress/`, `skills/misc/`, `skills/deprecated/`.
- Each skill is one folder here: `.claude/skills/<name>/SKILL.md`. Claude Code finds skills only one level deep, so the `engineering/` and `productivity/` folders are dropped.
- Every `agents/openai.yaml` is left out (it is for another agent, not Claude Code). That leaves 52 files and the licence.
- The files are copied byte for byte. No skill is renamed: the skills call each other by name.
- The two `.sh` files are marked executable in git.

### What we changed

Nothing inside the copied files. This repository adapts them from outside:

- [docs/agents/domain.md](../../docs/agents/domain.md): the glossary is [docs/DATA-MODEL.md](../../docs/DATA-MODEL.md) and a decision is a new D-row in [docs/DECISIONS.md](../../docs/DECISIONS.md). A skill never creates `GLOSSARY.md` or `docs/adr/`.
- [docs/agents/issue-tracker.md](../../docs/agents/issue-tracker.md): GitHub Issues of this repository, through the GitHub MCP tools.
- [docs/agents/triage-labels.md](../../docs/agents/triage-labels.md): the five default labels.
- The `## Agent skills` section at the end of [CLAUDE.md](../../CLAUDE.md). Project instructions win over a skill.
- The privacy guard (`tools/privacy-guard.ts`) does not check links in a copied file while its sha256 matches [upstream.json](upstream.json). A copied file that someone edits is checked again, like any other file. Private words (`PRIVACY_TERMS`) are checked in every file.

### Which skill loads when names clash

Checked on 14 Nov 2026 with Claude Code 2.1.325 in a session started in this repository:

- All 27 skills load. Eleven can be started by the agent itself: `code-review`, `codebase-design`, `diagnosing-bugs`, `domain-modeling`, `grilling`, `pr`, `prototype`, `research`, `tdd`, `wizard`, `writing-for-agents`. The other 16 say `disable-model-invocation: true`: only a person starts them, by typing `/<name>` (for example `/grill-me`).
- `/code-review`, `/prototype` and `/research` load the copy in this folder. The session showed no other skill with the same name. Plugin skills keep their prefix (for example `engineering:code-review`), so they do not clash.

### How to update

One pull request:

1. Download the new tag: `git clone --depth 1 --branch <tag> <the repository above> /tmp/mp`. Check the commit with `git -C /tmp/mp rev-parse HEAD`.
2. Delete the folders of Matt Pocock's skills here (keep this file, `modern-web-guidance/`, `docs/agents/` and the `CLAUDE.md` section). For each path in `/tmp/mp/.claude-plugin/plugin.json` `skills[]`, copy the folder to `.claude/skills/<last part of the path>/`, without `agents/`.
3. Copy `LICENSE` to `UPSTREAM-LICENSE`. Write the source's entry under `sources` in `upstream.json` again (`mattpocock-skills`): the tag, the commit, and for every copied file its path from the repository root and the sha256 of its text with LF line ends, sorted by path (the same input gives the same bytes). Leave the other source as it is. Then run `npm test`: it fails until `upstream.json` lists every copied file with its right sha256.
4. Update the tables of this file. Read upstream's `CHANGELOG.md`: it says when the templates of `docs/agents/` changed.
5. Review the difference of the copied files, as for any other change.

## Google Chrome's modern-web-guidance

### The source

| | |
|---|---|
| Repository | `github.com/GoogleChrome/modern-web-guidance` |
| Tag | `v1.0.1` |
| Commit | `64a6d708f5a43f2cd3fde5d4d7db3905ba1bdf65` (16 Nov 2026) |
| npm package | `modern-web-guidance@1.0.1`: its `skills/modern-web-guidance/` folder has the same 211 Markdown files (checked file by file), plus the tool's code |
| Licence | Apache-2.0 for the code and `SKILL.md`, in [UPSTREAM-LICENSE-modern-web-guidance](UPSTREAM-LICENSE-modern-web-guidance). The guides under `guides/` are CC BY 4.0 (see "Attribution" below) |
| Manifest | [upstream.json](upstream.json), the source `modern-web-guidance`. Its `tool` field pins the command-line tool the skill runs |

### Attribution

"Modern Web Guidance" by Google Chrome, from the repository above, licence CC BY 4.0 (`creativecommons.org/licenses/by/4.0`). Parts are derived from MDN Web Docs (by Mozilla contributors) and from the W3C, WHATWG and IETF specifications. Copied without changes.

### What was copied

- `skills/modern-web-guidance/` of the tag, as `modern-web-guidance/` here: `SKILL.md` and `guides/`, 210 guides in 17 folders. 211 files, 2,033,189 bytes, byte for byte.
- The repository's `LICENSE`, as `UPSTREAM-LICENSE-modern-web-guidance`.

Not copied: the `chrome-extensions` skill of the same repository; the tool's code (`modern-web.mjs`, `gen/`, `watchdog/` and the rest: `npx` brings them at the pinned version); the plugin files; and what the installer would write (`.agents/`, a symlink, `skills-lock.json`). The tool is not in `package.json`: the team never gets it.

### Why not its installer

`npx modern-web-guidance@latest install` runs another tool that:

- clones the default branch of the repository, not a tag, so the copy depends on the day;
- writes the skill into `.agents/` and puts a symlink in `.claude/skills/`. A symlink is a small text file on a Windows checkout without symlink support, and three of our tests fail on this layout;
- sends usage data to Google and to the other tool's site, unless `DISABLE_TELEMETRY=1` is set.

### What we changed

Nothing inside the copied files. This repository adapts them from outside:

- [docs/agents/web-guidance.md](../../docs/agents/web-guidance.md): run the tool only as `npx -y modern-web-guidance@1.0.1`, never `@latest`; which rule wins over a guide; the browser target; the note at the end of a reply.
- `.claude/settings.json`: `DISABLE_TELEMETRY=1` (no usage data), and the three read-only commands of the pinned tool are allowed without asking.
- `.mwgrc` at the root: the default browser target (Baseline widely available), Origin Trials and single-engine features off.
- One bullet under "Rules for the skills" in [CLAUDE.md](../../CLAUDE.md).
- `tools/repository-rules.ts`, rule 3: the version of the tool is the same in `upstream.json` (and equal to the tag), `.claude/settings.json`, `docs/agents/web-guidance.md`, `CLAUDE.md` and this file.

### Which skill loads when names clash

Checked on 16 Nov 2026 with Claude Code 2.1.325, in a new session without a person (`claude -p`) started in this repository, in a cloud thread:

- `modern-web-guidance` loads once, beside the 27 skills. No other skill or plugin with that name was there.
- Claude Code had not trusted the folder yet, so it ignored the `permissions.allow` lines of `.claude/settings.json` (it said so on start). Then every tool command asks first, and with no person to answer, the session ran no tool command and could not print `DISABLE_TELEMETRY`. On your computer, open Claude Code in the folder once and accept the trust question.
- Asked a small screen question ("how should a dialog close on Escape in this app?"), the agent said it would run `npx -y modern-web-guidance@1.0.1`, not `@latest`, as `CLAUDE.md` says. It answered from the `Dialog` of `src/app/ui/basics.tsx` and LOOK, and said that no guide was used.
- Not yet seen: a session that retrieves a guide and ends with the `### Modern Web Guidance` section. Check it in your first screen task.
- Run by hand in the same thread with `DISABLE_TELEMETRY=1`, `search` returned guides (`dialog`, `platform-controls-dismiss-dialog` and others), a locked guide (`restrict-outbound-connections`) returned the "disabled by this project's `.mwgrc`" message, and `git status` stayed clean.

A computer may also have the old plugin `modern-web-guidance@claude-plugins-official` (it stopped at v0.0.194). Then the skill is there twice, and the plugin's copy runs `@latest`. Remove the plugin on that computer: `/plugin uninstall modern-web-guidance@claude-plugins-official`.

### How to update

One pull request:

1. Read upstream's release notes. Download the new tag: `git clone --depth 1 --branch <tag> <the repository above> /tmp/mwg`. Check the commit with `git -C /tmp/mwg rev-parse HEAD`. Never run the installer.
2. Replace `modern-web-guidance/` here with `/tmp/mwg/skills/modern-web-guidance/`. Copy `/tmp/mwg/LICENSE` to `UPSTREAM-LICENSE-modern-web-guidance` again.
3. Write the source's entry under `sources` in `upstream.json` again (`modern-web-guidance`): the tag, the commit, the `tool` (`modern-web-guidance@<version>`), and the sha256 of every copied file, sorted by path. Change the version in `.claude/settings.json`, `docs/agents/web-guidance.md`, `CLAUDE.md` and this file. `npm test` fails until they all match the tag. In `.claude/settings.json` the tool may appear only with that version.
4. Check that the `--skill-version` in the new `SKILL.md` equals `skill-version.txt` of the new npm package (`npm pack modern-web-guidance@<version>`, then `package/skills/modern-web-guidance/skill-version.txt`). Otherwise the tool prints update warnings.
5. Review the difference of `SKILL.md` closely: it is what the agent obeys. Look for new commands, new data sent out and new files written. Update [docs/agents/web-guidance.md](../../docs/agents/web-guidance.md) when they change.
