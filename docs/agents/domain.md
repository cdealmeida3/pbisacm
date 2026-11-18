# Domain docs

How the agent skills in `.claude/skills/` read the words and decisions of this repository. This repository does not use `GLOSSARY.md` or `docs/adr/`. It has its own documents, and the skills use those instead.

## Layout: single-context

One context, with these files:

| A skill says | In this repository |
|---|---|
| `GLOSSARY.md` (the words) | [docs/DATA-MODEL.md](../DATA-MODEL.md) §1 "Glossary". The SACM meaning of the words is in [docs/DOMAIN-RULES.md](../DOMAIN-RULES.md) |
| An ADR in `docs/adr/` (a decision) | One numbered row in [docs/DECISIONS.md](../DECISIONS.md) |
| An open question | [docs/OPEN-QUESTIONS.md](../OPEN-QUESTIONS.md) |

## Before exploring, read these

- [CLAUDE.md](../../CLAUDE.md): the hard rules and the read-first table.
- [docs/DATA-MODEL.md](../DATA-MODEL.md) §1 and [docs/DOMAIN-RULES.md](../DOMAIN-RULES.md): the words.
- [docs/DECISIONS.md](../DECISIONS.md): the decisions that touch the area you work in.

## Rules

- **Never create `GLOSSARY.md`, `GLOSSARY-MAP.md` or `docs/adr/`.** Not even when a skill (`domain-modeling`, `grill-with-docs`, `improve-codebase-architecture`) says to create them. `npm test` fails when one exists (`tools/repository-rules.ts`).
- **A new or changed word** goes into the glossary table of [docs/DATA-MODEL.md](../DATA-MODEL.md) §1, in the same plain style as the other rows.
- **A decision** is a new row in [docs/DECISIONS.md](../DECISIONS.md), in the section where it belongs, with the next free number (D255, D256 and so on). Numbers are never changed and never reused. A decision that replaces another one marks the old row *Replaced* and names the new row.
- When an answer settles an open question, move it from [docs/OPEN-QUESTIONS.md](../OPEN-QUESTIONS.md) to a decision and update [docs/DOMAIN-RULES.md](../DOMAIN-RULES.md).
- Use the words of the glossary. Do not drift to other words for the same thing.
- If your output goes against a decision, say so plainly, for example: _"Goes against D12 (a report is known by its columns), but worth reopening because…"_
- Documents are read by non-developers and non-native English speakers: plain language, short sentences.
