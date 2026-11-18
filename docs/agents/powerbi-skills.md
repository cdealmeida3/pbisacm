# Power BI skills

How this repository uses the four Power BI skills. The project instructions in [CLAUDE.md](../../CLAUDE.md) win over a skill, and so does this page.

## What they are

Four skills, copied into `.claude/skills/` (D305 in [docs/DECISIONS.md](../DECISIONS.md)). Where each copy comes from and how to update it: [.claude/skills/UPSTREAM.md](../../.claude/skills/UPSTREAM.md).

| Skill | Use it for | Source |
|---|---|---|
| `m-reference` | Power Query M in `powerbi/m/`: does a function exist, its exact signature, what it returns; the language (`let`, `each`, types, `try`, lazy evaluation) | Cristóbal Salcedo, "Power Query M for agents" |
| `dax-reference` | DAX measures in the semantic model: a function's signature and where it is legal; filter context, context transition, BLANK | Cristóbal Salcedo, "DAX for agents" |
| `tmdl` | Writing TMDL by hand in `powerbi/SACM-Workbench.SemanticModel/`: indentation, quoting, properties and their allowed values | Kurt Buhler, "Power BI agentic development" |
| `pbip` | The PBIP project: its files, `.platform`, thick and thin reports, renames | the same |

They are text. No tool, hook, server or script runs by itself, and none sends anything anywhere.

## How to read them

Each reference is large. Do not read it whole. Follow the skill's own "one hop" steps: search the catalogue for the name, then open only the one card or the line range it names.

`dax-reference/generated/catalog.md` has 51 rows of financial functions (XIRR, PMT and the like) that point to `generated/bundles/functions-financial.md`. That file is left out of the copy, because it holds a word of the private list. SACM does not use these functions. If a row points to it, the card is not here.

## Which rule wins

From highest to lowest:

1. the hard rules of [CLAUDE.md](../../CLAUDE.md#hard-rules);
2. the decisions of [docs/DECISIONS.md](../DECISIONS.md);
3. [docs/LOOK.md](../LOOK.md), [docs/ARCHITECTURE.md](../ARCHITECTURE.md) §12 and [powerbi/README.md](../../powerbi/README.md);
4. a skill.

Where the skills pull the other way:

- **Our speed rules win over M examples.** `m-reference` describes M as Power BI Desktop runs it. CI runs the queries in PQTest, and `npm run powerbi:lint` reads them. The speed rules for the queries in [docs/ARCHITECTURE.md](../ARCHITECTURE.md) §12 (D283, D284) win over an example: buffer a list that is read twice or read by position (`List.Buffer`); build a large table column by column; never `Table.TransformColumns` with functions made by a helper.
- **TMDL is written by hand here, on purpose.** `tmdl` calls itself "a last resort" and tells the agent to prefer the Tabular Editor CLI (`te`), a modeling server or Power BI Desktop over TOM, and to run a `pbip-validator` agent. None of these is in this repository, and none is installed. Edit the `.tmdl` files directly.
- **`expressions.tmdl` is never edited.** `npm run powerbi:generate` writes it from `powerbi/m/` (D275). Change the `.pq` file, then run the generator.
- **The report files are edited by hand too.** `pbip` says "use `pbir` for every report mutation, never hand-edit PBIR JSON". Here there is no `pbir` command, and the `visual.json` files are written by hand and checked by `npm run powerbi:lint`.
- **DAX: a column of a virtual table starts with `@`.** Our DAX lint reads any other `[x]` as a measure. A column added inside a measure (`ADDCOLUMNS ( t, "@days", … )`) is named `@…` and read as `[@days]`; otherwise use `SUMX` and `CALCULATE`.
- **The DAX lint reads the function list of `dax-reference`** (`generated/catalog.json`): a variable may not be named like a function (D309). An update of that skill can therefore make the lint refuse a variable name; rename the variable.
- **Do not install** `te`, `pbir`, `fab` (the Fabric command line), a modeling server, the library `dax-lib`, or anything else a skill names. Nothing new for the team (CLAUDE.md, "No network").

The check is `npm run powerbi:lint`, and for Carlos, opening the project in Power BI Desktop.

## The script `validate_pbip.py`

`pbip/scripts/validate_pbip.py` (Python, standard library only) reads a project folder and prints problems. It is copied because `pbip/SKILL.md` points to it. It is not part of `npm test`, `npm run powerbi:lint` or CI.

- You may run it to read what it reports: `python3 .claude/skills/pbip/scripts/validate_pbip.py powerbi --no-pbir-cli`.
- Never run it with `--fix`: that writes files.
- A finding is a hint, not a rule. Fix it only when our own lint or Desktop agrees, or when Carlos asks.

## Nothing is reported upstream

Both sources of Cristóbal Salcedo have a feedback skill (`m-feedback`, `dax-feedback`) that drafts and files an issue on the author's public repository. They are not copied, on purpose: an issue is a message outside the project, and it could quote the team's words in public.

When a skill is wrong or a function is missing, never open an issue, a discussion or a pull request upstream from this repository. Tell Carlos instead, with the skill, the file and what was wrong.
