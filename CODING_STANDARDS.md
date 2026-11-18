# Coding standards

For whoever reviews a change, a person or the `/code-review` skill. It points to the rules and lists what a reviewer must judge. It holds no rule of its own: a rule lives in the document it points to.

## Where the rules are

| Subject | Read |
|---|---|
| The hard rules (no links, addresses or real report files, never write to ServiceNow, nothing on its own, no network, grey card, same bytes, readable formats) | [CLAUDE.md](CLAUDE.md#hard-rules) |
| Code: layers, TypeScript, where tests go | [CLAUDE.md](CLAUDE.md#code), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#2-principles) §2 and [§4](docs/ARCHITECTURE.md#4-layers) |
| The way of working: threads, pull requests, decisions, releases | [CLAUDE.md](CLAUDE.md#working-rules), [docs/HOW-TO.md](docs/HOW-TO.md#8-record-a-decision-or-an-answer) §8 and [§9](docs/HOW-TO.md#9-make-a-release) |
| The look of a screen | [docs/LOOK.md](docs/LOOK.md#1-the-rules) §1 and [§6](docs/LOOK.md#6-how-to-draw-a-new-screen) |
| A check file | [checks/README.md](checks/README.md), [docs/HOW-TO.md](docs/HOW-TO.md#1-add-a-check-that-uses-the-ci-report) §1 |
| The words | [docs/DATA-MODEL.md](docs/DATA-MODEL.md#1-glossary) §1 |
| The team-folder files, old and new | [docs/DATA-MODEL.md](docs/DATA-MODEL.md#5-what-older-files-may-lack) §5 |
| The agent skills | [docs/agents/domain.md](docs/agents/domain.md), [docs/agents/web-guidance.md](docs/agents/web-guidance.md) |

## Already checked by a test: skip these in review

`npm run verify` and the browser checks fail on these, so a reviewer does not check them again:

- types (strict TypeScript); the design rules of the layers (`tests/architecture.test.ts`);
- links, hosts and email addresses that are not invented (privacy guard);
- unknown fields, rule words or references in a check file (D115); `docs/CHECKS.md` up to date;
- the recorded result of the samples, byte for byte; the built file matches the source; nothing loads from the network;
- every document link and anchor; the module map names every module;
- look rules 1 to 5, rule 6 for the icons, and rule 8 ([docs/LOOK.md](docs/LOOK.md#1-the-rules) §1);
- every stand-in of `tools/placeholders.json` still found, no placeholder left unlisted, `docs/PLACEHOLDERS.md` up to date;
- the copied skills unchanged; one version of a pinned skill tool everywhere; no `GLOSSARY.md` or `docs/adr/`.

## Judgement calls: check these

1. **Plain language.** Documents and screen texts are read by non-developers and non-native English speakers: short sentences, common words, one idea per sentence. A comment says why, not what.
2. **The words of the glossary.** A change uses the words of DATA-MODEL §1. A new word is added there. No second word for the same thing.
3. **A feature is normally a check file.** A new rule that a check file can say is not code (principle P3). Code is right only when a check file cannot say it; the change says why.
4. **Proposed until confirmed.** A new check is `"status": "proposed"` unless the user confirmed its scope, audience and playbook (D114).
5. **No links, addresses or real report files** (D266). The privacy guard finds links, hosts and addresses. Look for rows copied from a real report and real file names. Real names of the systems, their columns and status words are allowed. Stand-ins follow [docs/agents/placeholders.md](docs/agents/placeholders.md).
6. **Nothing happens on its own.** No timer, no automatic send, no reminder that fires by itself (principle P1).
7. **A check that cannot be evaluated says so.** A missing column, file or report gives a note and a grey card, never a silent pass.
8. **Same input, same bytes.** A new team-folder file holds no "who" or "when" unless it is a journal line (principle P10).
9. **Old and new files stay readable.** A changed team-folder format is read by older and newer versions (DATA-MODEL §5).
10. **Look rules the tests do not check:** rule 7 (every grey button says why), rule 9 (windows), and the part of rule 6 that says one main button per screen.
11. **Decisions.** A decision is a new row at the end of its section of DECISIONS.md, with the next number, the why, who and when, where, and its state. No number is changed or reused. An answered open question moves to a decision, and DOMAIN-RULES.md is updated.
12. **The documents follow the change.** FEATURES.md for a screen or button, HOW-TO.md for a new way to extend, ARCHITECTURE.md for a new module. A release raises `version` and adds a CHANGELOG entry (HOW-TO §9).
13. **Tests mirror the folders** of `src/` under `tests/`, and a change that a manager sees adds a step to a browser check (HOW-TO §6).
14. **Web guides follow our rules.** A change shaped by `modern-web-guidance` loads nothing from the network, adds no library, and uses the colours and parts of LOOK; where a guide and a rule differ, the rule wins and the change says so ([docs/agents/web-guidance.md](docs/agents/web-guidance.md)).

## How the review runs

Before a build thread opens its pull request, it runs `/code-review` against `main`, with the plan as the spec (D259). With the report:

- The change breaks a written rule: fix it, and run the affected tests again.
- The plan asked for something the change does not do, or the change does something nobody asked for: fix it, or say in the pull request why not.
- A judgement call (also a weak spot in the code that the skill names): fix it when it is cheap and clearly right. Otherwise list it in the pull request under `## Review`, one line each, with why it stays.
- One review per pull request. No second review after the fixes, unless they are large. The review never blocks the merge by itself: the pull request is merged when every check is green.
