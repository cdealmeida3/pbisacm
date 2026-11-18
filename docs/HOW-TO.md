# How to

Step-by-step guides for the developer. Each guide lists every file you touch. The layers and modules are in [ARCHITECTURE.md](ARCHITECTURE.md); the files of the team folder in [DATA-MODEL.md](DATA-MODEL.md).

Before any change: run `npm install` once, then `npm run verify` to see that everything passes. After any change: `npm run verify` again, and commit `app/SACM-Workbench.html` with the change.

## 1. Add a check that uses the CI report

This is the usual way to add a feature: one file, no code.

1. Write `checks/packs/<subject>/<name>.json`. Copy a check of the same kind (a `rule` check such as `checks/packs/ci/support-group-missing.json`) and change its fields. Every field is in [checks/README.md](../checks/README.md). Give it a new `id` and `"status": "proposed"`.
2. The file name decides the place of its card: the app reads the files in the order of their names, whatever the folder. The `dimension` decides the section.
3. Run `npm run docs` (writes [CHECKS.md](CHECKS.md) again).
4. Run `npm run record`, and read the difference in `tests/recorded/` (`git diff tests/recorded`): the new card, and its findings on the invented samples. Nothing else may change.
5. Run `npm run verify`.

If the file has a mistake (an unknown field, rule word, class, request or reference), `npm test` and `npm run build` stop and name it.

**Proof** (piece A8): a test check "Support group name has two spaces in a row" was added this way. Files written by hand: **1** (the check file). Files written by the commands: `docs/CHECKS.md`, six files of `tests/recorded/`, the app file. Nothing else was touched, and every test passed.

## 2. Change a rule that is data

Statuses that wait, tags that explain a finding, name rules, EPO ID rules, days, column names of the EPO and contract reports, the relationship model: each is a file in `checks/reference/` ([checks/README.md](../checks/README.md) says which). Change the file, then steps 3 to 5 of §1. Record the decision in [DECISIONS.md](DECISIONS.md) and the rule in [DOMAIN-RULES.md](DOMAIN-RULES.md).

A rule SACM may change in Settings (reminder days, days of the lifecycle cards, the Procurement mailbox) is a team setting, not a file: see [DATA-MODEL.md](DATA-MODEL.md) §3.

## 3. Add a rule word (operator)

1. Add the word to `RULE_OPERATORS` and its test to the `switch` of `src/core/checks/engine.ts`. If it reads a column the report may lack, add it to `columnsFor`, so a report without the column gives a note and not a silent pass.
2. Add a test in `tests/core/checks/engine.test.ts`.
3. Add a line to the table "Rule operators" of [checks/README.md](../checks/README.md).

The validator reads `RULE_OPERATORS`, so check files may use the word at once.

## 4. Add a code detector for a report type that exists

A check that a rule cannot say (it compares rows, counts days, reads reference data).

1. Write the detector in the file of its family in `src/core/checks/detectors/` (`ci-detectors.ts` for the CI report alone, `relationship-detectors.ts`, `epo-detectors.ts`, `contract-detectors.ts`) and add its name to the list of that file. The family's line in `detectors/index.ts` picks it up from there.
2. Write its check file with `"type": "code"`, `"module": "<family>/<name>"` and `"ref"`: the reference file it reads (every code detector names one).
3. Add tests in `tests/core/checks/detectors/`.
4. Steps 3 to 5 of §1.

A detector that cannot test (a missing column or reference file, a report not loaded) returns a note and nothing in `tested`. The card is then grey, never green.

## 5. Add a report type

A report type is a kind of file the app knows by its columns.

### 5.1 Known by the app

1. Create the folder `src/core/sources/<type>/` with `<type>-report.ts`: its `ReportType` (kind, label, hint, the columns it `needs`, the `folder` of its loads), its reader, and the `*Run` type of a saved load.
2. Add one line to `REPORT_TYPES` in `src/core/sources/report-types.ts`.

The Reports strip shows its tile, *Choose reports* and *Load* know its files, and a file of that type is no longer "not a known report".

3. Run `npm run typecheck`. Every host has one branch per report type, ending with `unhandledKind`; the type check now names each branch that lacks the new type: saving a load and removing it (`src/app/state/loading.ts`) and the command line (`src/hosts/cli.ts`). A new type is never read as a CI report by mistake.

### 5.2 Saved and shown by the app

4. `src/app/state/store.ts`: a field for the newest load.
5. `src/app/state/loading.ts`: a function that saves the load in `runFolder('<kind>')` and archives loads beyond the last 10 (copy `saveEpo`), its branch in `loadSources`, and its branch in `removeLoad`.
6. `src/app/state/folder.ts`: read the newest load when the folder is opened.
7. `src/app/view/tiles.ts` and its call in `src/app/screens/reports/Reports.tsx`: what the tile says about a load.
8. `src/hosts/cli.ts`: its branch.

### 5.3 Its checks

9. `src/core/checks/detectors/<type>-detectors.ts`: the detectors and their list.
10. `src/core/checks/detectors/index.ts`: one named input in `EngineInputs`, and one family in `FAMILIES` (the modules and how to run them).
11. Pass the input to `runChecks` in the hosts: `saveCiRun` in `src/app/state/loading.ts`, and `src/hosts/cli.ts`.
12. The check files in `checks/packs/<subject>/`, and their reference file in `checks/reference/`. A new subject folder is added to the list in `tests/core/checks/check-files.test.ts`.
13. A sample in `samples/` (invented), tests, steps 3 to 5 of §1, and the columns in [DATA-SOURCES.md](DATA-SOURCES.md).

**Proof** (piece A8): a test report type "Proof report" (a list of CI names) with one check "CI named in the Proof report" was added by these steps, loaded in the app with the in-memory folder, and removed again.

| Step | Files written by hand |
|---|---|
| Known by the app (5.1) | 1 new folder with 1 file, 1 line in `report-types.ts`. The type check then named the 2 branches of `loading.ts` that lacked it |
| Saved and shown (5.2) | 6 files changed: `store.ts`, `loading.ts`, `folder.ts`, `tiles.ts`, `Reports.tsx`, `cli.ts` |
| Its checks (5.3) | 3 new files (detectors, check file, reference file), 1 changed (`detectors/index.ts`), plus the subject folder in `check-files.test.ts` |
| By the commands | `docs/CHECKS.md`, `tests/recorded/`, the app file |

One test had to change on purpose: the Reports strip test counts the tiles. Without step 5.1.3 the app said "a CI report, but no row has a name" for a file of the new type: piece A8 added `unhandledKind`, so the type check now catches it (decision D120).

What a new type costs in the app (5.2) is the part that could shrink: today each type has its own field in the state and its own branch to save, read and show its load. A generic "load of a report type" would make step 5.2 one line. It is not built; it changes no result, and it is worth doing before a sixth report type is added.

## 6. Add a screen

1. Draw it with the parts, colours and icons of [LOOK.md](LOOK.md) (section 6 there). Create `src/app/screens/<screen>/` with the screen. What it shows goes in `src/app/view/<area>.ts` (pure, tested in `tests/app/view/`); what it does goes in `src/app/state/<area>.ts` (tested in `tests/app/state/` with the in-memory folder).
2. Add a value to `View` in `src/app/state/store.ts` and show the screen in `src/app/shell/App.tsx`. Only the shell imports screens.
3. A part another screen needs too goes in `src/app/ui/`. A screen never imports another screen: `tests/architecture.test.ts` fails if it does.
4. Describe the screen in [FEATURES.md](FEATURES.md), and add the modules to the map of [ARCHITECTURE.md](ARCHITECTURE.md) §5 (`npm test` checks that the map names every module).
5. If it changes what a manager sees, add a step to a browser check in `tests/browser/` and run `npm run browser`.

## 7. Change something that changes a result

The recorded result of the invented samples (`tests/recorded/`) holds every finding, case, card, group, message and export, byte for byte. A change meant to change a result:

1. Make the change.
2. Run `npm run record`.
3. Read `git diff tests/recorded` line by line: only the intended lines may change.
4. Commit the recorded files with the change, and say in the pull request what changed and why.

A change meant to change nothing (a clean-up) must leave `tests/recorded/` as it is. For a large clean-up, also compare the fingerprint of the real files before and after, on your computer only: `node tools/fingerprint.ts <files>` prints counts and checksums, never values. The real files and the fingerprint are never committed.

## 8. Record a decision or an answer

- A decision: a new line at the end of its section of [DECISIONS.md](DECISIONS.md), with the next number. Numbers are never reused or changed.
- An answer from SACM: move the line from [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) to a decision, and update [DOMAIN-RULES.md](DOMAIN-RULES.md).
- A check SACM confirms: set its `status` to `live` and record the decision.

## 9. Make a release

1. Raise `version` in `package.json` (minor for a feature, patch for a fix). The app shows this number.
2. Add the version at the top of [CHANGELOG.md](CHANGELOG.md), in words for SACM managers.
3. Update [FEATURES.md](FEATURES.md) and the documents the change touches.
4. `npm run verify`, then commit `app/SACM-Workbench.html` with the rest.
5. Run `/code-review` against `main` with the plan as the spec; fix what it finds, list what you keep in the pull request (D259).
6. Open one pull request. It is merged when its GitHub checks are green (the browser checks may show as skipped when the app did not change).

The team takes `app/SACM-Workbench.html` from the default branch and puts it in the team folder.

## 10. Stand-ins and real values

Since D266 the repository may hold the real names of the team's world: the systems, their report columns, status words and tag values. It never holds links, hosts, real email addresses or real report files. The samples stay invented. The repository is public (D286): it also never holds the first names of real colleagues, the names of the developer's computers, or words that name the employer or its industry. The words of the real reports that the app must match are listed as *kept* in `tools/placeholders.json`.

- **A stand-in** is a word that stands in for a real value on purpose, such as an invented person or address. Each one is in `tools/placeholders.json`; [PLACEHOLDERS.md](PLACEHOLDERS.md) lists them. `npm run placeholders` shows where they are.
- **A new invented value** (a sample person, an address): add it to `tools/placeholders.json`, then run `npm run docs`. `npm test` fails on an entry that matches nothing.
- **A real value that is needed** (a column, a status word): ask the user first ([agents/placeholders.md](agents/placeholders.md)).
- **Your own private words** (`PRIVACY_TERMS`): a file outside the repository, one word or phrase per line, `#` starts a comment. `PRIVACY_TERMS=<file> npm test` fails when a file of the repository holds one of them (whole words, any case), and prints only the file and the line, never the word. Keep there the company name, the full names of people, the colleagues' first names, the names of your computers and the old sample words. Not the names of the systems, their columns and status words (D266): they are in the repository on purpose.
- **The same words in CI** (D286): the Actions secret `PRIVACY_TERMS_LIST` (Settings, Secrets and variables, Actions) holds the same lines. The job *checks* gives it to `npm test`, so every pull request is checked without the words being in the repository. To change the list, edit the secret: paste the whole list again (GitHub does not show a secret's value). A word that is also in a copied skill (`.claude/skills/`) fails every run: use a longer phrase instead. A pull request from a fork gets no secret; the run says "Private words not checked", and the next run with the secret checks them.
