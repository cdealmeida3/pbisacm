# Agent skills: where they come from

The folders next to this file are agent skills for Claude Code. They come from five sources, and they change nothing in the app or the Power BI report:

- **Matt Pocock's skills**, "Skills For Real Engineers": 27 skills that help a developer plan, test, review and write documents with an agent. Decision: D254 in [docs/DECISIONS.md](../../docs/DECISIONS.md).
- **Google Chrome's `modern-web-guidance`**: one skill with short guides on modern HTML, CSS and browser JavaScript, for work on the screens. Decision: D260.
- **Cristóbal Salcedo's "Power Query M for agents"**: one skill, `m-reference`, a reference of every Power Query M function and of the language. Decision: D305.
- **Cristóbal Salcedo's "DAX for agents"**: one skill, `dax-reference`, a reference of every DAX function, its concepts and its traps. Decision: D305.
- **Kurt Buhler's "Power BI agentic development"**: two skills, `tmdl` (writing TMDL by hand) and `pbip` (the PBIP project). Decision: D305.

How this repository uses the four Power BI skills, and which rule wins over them: [docs/agents/powerbi-skills.md](../../docs/agents/powerbi-skills.md).

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
2. Delete the folders of Matt Pocock's skills here (keep this file, the folders and licence files of the other sources, `docs/agents/` and the `CLAUDE.md` section). For each path in `/tmp/mp/.claude-plugin/plugin.json` `skills[]`, copy the folder to `.claude/skills/<last part of the path>/`, without `agents/`.
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

## Cristóbal Salcedo's "Power Query M for agents"

### The source

| | |
|---|---|
| Repository | `github.com/CSalcedoDataBI/powerquery-m-for-agents` |
| Tag | `v0.2.0` (signed) |
| Commit | `a154a2e316658f4e0d3047b507323035c6e2c106` (25 Oct 2026) |
| Licence | MIT, in [UPSTREAM-LICENSE-powerquery-m-for-agents](UPSTREAM-LICENSE-powerquery-m-for-agents). The one-line descriptions of the functions come from Microsoft's `vscode-powerquery` (MIT), see [UPSTREAM-NOTICES-powerquery-m-for-agents.md](UPSTREAM-NOTICES-powerquery-m-for-agents.md) |
| Manifest | [upstream.json](upstream.json), the source `powerquery-m-for-agents` |

### What was copied

- `plugins/powerquery-m-for-agents/skills/m-reference/` of the tag, as `m-reference/` here: 102 Markdown files, 829,965 bytes, byte for byte. The catalogue in `generated/` is exported from the engine of Power BI Desktop (`#shared`), so a function it lists really exists. The examples under `examples/` were run in the engine, with the result under each query.
- `plugins/powerquery-m-for-agents/LICENSE` as `UPSTREAM-LICENSE-powerquery-m-for-agents`, and `plugins/powerquery-m-for-agents/THIRD_PARTY_NOTICES.md` as `UPSTREAM-NOTICES-powerquery-m-for-agents.md`.

Not copied: the skill `m-feedback`, which drafts and files issues on the author's public repository ([docs/agents/powerbi-skills.md](../../docs/agents/powerbi-skills.md), "Nothing is reported upstream"); the plugin files; the build scripts of the repository. The branch `main` of the source had 19 more files on 18 Nov 2026 (more run examples), not released yet: they come with the next tag.

### How to update

One pull request:

1. Read upstream's release notes. Download the new tag: `git clone --depth 1 --branch <tag> <the repository above> /tmp/pqm`. Check the commit with `git -C /tmp/pqm rev-parse HEAD`.
2. Replace `m-reference/` here with `/tmp/pqm/plugins/powerquery-m-for-agents/skills/m-reference/`. Copy the licence and the notices again, as above.
3. Write the source's entry under `sources` in `upstream.json` again (`powerquery-m-for-agents`): the tag, the commit and the sha256 of every copied file, sorted by path. Leave the other sources as they are.
4. Run `npm test`, and once with `PRIVACY_TERMS` set to the private word list (never print the words). A copied file that holds a private word is left out, and this section says which and why.
5. Review the difference of `SKILL.md` closely: it is what the agent obeys. Look for new commands, new tools, data sent out and files written. Update [docs/agents/powerbi-skills.md](../../docs/agents/powerbi-skills.md) when they change.

## Cristóbal Salcedo's "DAX for agents"

### The source

| | |
|---|---|
| Repository | `github.com/CSalcedoDataBI/dax-for-agents` |
| Tag | `v0.9.1` |
| Commit | `95506903571361a5c0221f4a50090c1072e5d01f` (13 Nov 2026) |
| Licence | MIT, in [UPSTREAM-LICENSE-dax-for-agents](UPSTREAM-LICENSE-dax-for-agents). The folder `dax-reference/generated/` is CC BY 4.0 (see "Attribution" below and `dax-reference/NOTICE.md`) |
| Manifest | [upstream.json](upstream.json), the source `dax-for-agents` |

### Attribution

The cards under `dax-reference/generated/` are derived from the DAX reference of Microsoft Learn (`learn.microsoft.com/en-us/dax`), from the repository `MicrosoftDocs/query-docs` at commit 323524c, © Microsoft Corporation, licence CC BY 4.0 (`creativecommons.org/licenses/by/4.0`). Cristóbal Salcedo restructured them into cards for agents. Copied here without changes, except that one file is left out (below).

### What was copied

- `plugins/dax-for-agents/skills/dax-reference/` of the tag, as `dax-reference/` here, without one file: 155 files (153 Markdown, 2 JSON), 2,186,731 bytes, byte for byte. That is 479 function cards and 34 concept pages in `generated/`, and the hand-written `notes/` and `examples/`.
- `plugins/dax-for-agents/LICENSE.md` as `UPSTREAM-LICENSE-dax-for-agents`.

Left out:

- `dax-reference/generated/bundles/functions-financial.md`, the cards of the financial functions (XIRR, PMT and the like). It holds a word of the private word list, and SACM does not use these functions. `generated/catalog.md` still has 51 rows that point to it: an agent that follows one finds no file, which is harmless. The link test skips copied files, so it stays green.
- The skills `dax-lib` and `dax-lib-install` (they install DAX functions from an outside library into the model, which we do not use), `dax-window-functions` and `dax-udf-authoring` (nothing here uses window functions or user-defined functions yet; easy to add later), and `dax-feedback` (it files issues on the author's public repository).

### How to update

As for "Power Query M for agents" above, with `/tmp/dax/plugins/dax-for-agents/skills/dax-reference/`, the licence `LICENSE.md` and the source `dax-for-agents`. Delete `generated/bundles/functions-financial.md` again, and check with `PRIVACY_TERMS` that no other file holds a private word.

## Kurt Buhler's "Power BI agentic development"

### The source

| | |
|---|---|
| Repository | `github.com/data-goblin/power-bi-agentic-development` |
| Tag | `v26.45` |
| Commit | `5a271d0ac25ae458981fec79859d1f4115dab818` (4 Nov 2026) |
| Licence | GPL-3.0, in [UPSTREAM-LICENSE-power-bi-agentic-development](UPSTREAM-LICENSE-power-bi-agentic-development). The copies are unchanged and the licence is next to them, as GPL-3.0 asks. The skills are guidance for the agent: nothing of them is built into the report or the app. Carlos agreed to GPL text in this repository on 18 Nov 2026 |
| Manifest | [upstream.json](upstream.json), the source `power-bi-agentic-development` |

### What was copied

- `plugins/pbip/skills/tmdl/` of the tag, as `tmdl/` here: 56 files (6 Markdown, 50 `.tmdl` examples of an invented model), 845,353 bytes, byte for byte. `npm run powerbi:lint` reads only `powerbi/`, so it does not read these examples.
- `plugins/pbip/skills/pbip/` of the tag, as `pbip/` here: 5 files (4 Markdown and the script `scripts/validate_pbip.py`), 71,278 bytes, byte for byte. The script is not executable upstream, and not here.
- The repository's `LICENSE`, as `UPSTREAM-LICENSE-power-bi-agentic-development`.

Not copied: the other skills of the repository. Most drive tools we do not have and do not install: the Tabular Editor command line `te`, the `pbir` command line, the Fabric command line `fab`, Power BI Desktop over TOM. Not copied either: its hooks (they run bundled programs after every edit), its agents and the plugin files. The report skills `pbir-format` and `pbi-report-design` may come with the visual design pass.

### How to update

As for "Power Query M for agents" above, with `/tmp/dg/plugins/pbip/skills/tmdl/` and `/tmp/dg/plugins/pbip/skills/pbip/`, the licence `LICENSE` at the root and the source `power-bi-agentic-development`. Check the mode of `validate_pbip.py` upstream with `git ls-files -s` and keep the same here. Read the difference of `validate_pbip.py` too: it must stay a script that only reads, except with `--fix`.

## The four Power BI skills: which skill loads

Checked on 18 Nov 2026 with Claude Code 2.1.327, in the cloud thread that copied them: as soon as the folders were in `.claude/skills/`, the session listed `m-reference`, `dax-reference`, `tmdl` and `pbip`, each with its own description. All four can be started by the agent itself. The session showed no other skill or plugin with one of these names.
