# Stand-ins: when to ask the user

Some words of this repository stand in for a real value on purpose (D110, D266): invented people, email addresses, user IDs, asset tags, the ServiceNow host, departments. The real values come from the real reports and from Settings when the app runs. The registry is `tools/placeholders.json`; the list made from it is [PLACEHOLDERS.md](../PLACEHOLDERS.md).

The repository is public (D286): no first names of real colleagues, no names of the developer's computers, no words that name the employer or its industry. The private words that block them are in [HOW-TO.md](../HOW-TO.md) §10. The words of the real reports that the app must match (the EPO status words and date column, the section numbers) are listed as *kept*: do not change them.

## Find them

- `npm run placeholders` lists every entry and shape, with how many lines and files hold it. `npm run placeholders -- --lines` adds every file and line.
- `npm test` fails when a word of an entry, or a shape, matches nothing (remove it), and when a generic placeholder appears that no entry covers: a redaction mark, a row of X, filler text, a tag such as a name in angle brackets, a placeholder person, a stand-in word for "any value". The shapes are in `tools/placeholders.ts`.

## Ask, do not guess

- Do not replace a stand-in with a real value on your own, and do not "fix" a real word because it looks like a stand-in.
- Ask the user when the work needs a real value, when an entry says `"use": "ask"`, or when you find a placeholder that is not listed.
- Ask once: all such questions together, on one decision card or in one message. Give a recommendation for each.
- Record the answer: a decision row in [DECISIONS.md](../DECISIONS.md), and the entry's `use` in the registry (`stays-invented`, `kept` or removed when the real value replaces it).

## Add one

- A stand-in you invent (a new sample person, a new invented address) goes into `tools/placeholders.json` in the same pull request, with an `id`, a `group`, the words or a `pattern`, its `use` and a `label`.
- Then run `npm run docs` to write [PLACEHOLDERS.md](../PLACEHOLDERS.md) again.
