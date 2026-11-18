# Web guidance

How this repository uses the `modern-web-guidance` skill. The project instructions in [CLAUDE.md](../../CLAUDE.md) win over the skill, and so does this page.

## What it is

Google Chrome's `modern-web-guidance` skill, copied into `.claude/skills/modern-web-guidance/` (D260 in [docs/DECISIONS.md](../DECISIONS.md)). It gives the agent short guides on modern HTML, CSS and browser JavaScript: dialogs, tables, forms, accessibility, dark mode, performance, security and more. Where the copy comes from and how to update it: [.claude/skills/UPSTREAM.md](../../.claude/skills/UPSTREAM.md).

## When it starts

By itself, for work on the screens (`src/app/`). Its description says it is "MANDATORY" for all HTML, CSS and browser JavaScript, so it starts often there. Each use costs one or two short commands and 5 to 15 KB of guide. It does not start for `src/core/`, check files, tests or CI.

## How to run the tool

Run the tool only in these three ways, with this version:

```sh
npx -y modern-web-guidance@1.0.1 search "<2 to 5 words>" --skill-version <the version in SKILL.md>
npx -y modern-web-guidance@1.0.1 retrieve "<id>"
npx -y modern-web-guidance@1.0.1 list
```

- Take the `--skill-version` from the `search` command in `.claude/skills/modern-web-guidance/SKILL.md`. It changes with each release.
- The skill writes `@latest`. **Never use `@latest`**: it downloads and runs the newest published version each time, with no review. Use the version above.
- Never run `install`, `update`, `uninstall`, `legacy-scan` or `set-*`. They change files or run other tools. Only a person changes `.mwgrc`.
- The version is the same in `.claude/skills/upstream.json` (the `tool` of the source), in `.claude/settings.json` and on this page. `npm test` fails when one differs (`tools/repository-rules.ts`, rule 3).
- `.claude/settings.json` allows only these three commands without asking. A command with another version asks for permission, and that shows the mistake.
- Search words are generic web words, for example `"light dismiss dialog"` or `"responsive data table"`. Never words of this project: no SACM, CMDB, report, check, system or team names.
- Without network, add `--offline` after `npx`. The tool is in the npm cache after the first run. This form is not in the allow list, so it asks first.

The no-network rule of `CLAUDE.md` is about the app. The tool runs on the developer's computer or in the cloud thread, and only while someone works. It is allowed.

## Usage data

The tool sends usage data to Google unless `DISABLE_TELEMETRY=1` is set. `.claude/settings.json` sets it for every command the agent runs in this repository. Claude Code reads the same variable, so its own usage statistics are off here too. When you run the tool by hand in your own shell, set `export DISABLE_TELEMETRY=1` in your shell profile first.

## Browser target

- The team uses Edge and Chrome ([docs/CONTEXT.md](../CONTEXT.md)). Company computers may keep Edge a few versions behind. The demo works in any current browser.
- The target is **Baseline widely available**, the default of the tool. `.mwgrc` has no `baseline` key for that reason.
- Origin Trials are off (`"allowOriginTrials": false`): they need a token for each web address, and the app is a local file.
- Features in only one browser engine are off (`"allowVolatileFeatures": false`): they would break the demo in other browsers and may still change.
- With these set, the tool tells the agent to use a standard approach that works in every browser, without asking.
- Do not edit `.mwgrc` without a new decision row.

## Which rule wins

From highest to lowest:

1. the hard rules of [CLAUDE.md](../../CLAUDE.md#hard-rules);
2. the decisions of [docs/DECISIONS.md](../DECISIONS.md);
3. [docs/LOOK.md](../LOOK.md): the named colours, the parts in `src/app/ui/`, the sizes and the words;
4. a guide.

So a guide's pattern is used only with what the app already has:

- Never a link to a CDN (unpkg.com, esm.sh, cdn.jsdelivr.net and the like). The app is one HTML file, everything inline, and its Content-Security-Policy blocks every connection.
- Never a new package or polyfill without a decision row. A fallback is a few lines in our own code, or none.
- Use the parts of LOOK, for example the `Dialog` of `src/app/ui/basics.tsx` for a window, and the named colours, never a colour of a guide.

When one of these rules made you skip part of a guide, say so in the note at the end.

## The note at the end

The skill asks for a `### Modern Web Guidance` section at the end of the reply, one bullet for each guide used. It goes in the reply to the person, and in the pull request under `## Review` when a guide shaped the change. It never goes into the code or the documents.

## Files

The tool writes nothing into the repository. A guide over 9.5 KB goes to a temporary file outside the repository. Read it there and do not copy it in.
