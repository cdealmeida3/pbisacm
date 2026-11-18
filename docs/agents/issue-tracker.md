# Issue tracker: GitHub Issues, through the GitHub MCP tools

Issues and specs of this repository are GitHub issues of `cdealmeida3/pbisacm`. Agent threads of this project cannot use the `gh` command line. They use the GitHub MCP tools (`mcp__github__*`).

Never read or write issues in any other repository. Never file an issue into `mattpocock/skills` (where the skills come from).

## The main way of working stays

Every feature is planned in a planning thread with the user, then built in a separate thread with one pull request (D109). The skills that use the tracker (`to-spec`, `to-tickets`, `triage`, `wayfinder`, `implement`, `implement-spec`) run only when someone types them.

## Conventions

- **Create an issue**: `issue_write` with method `create`, owner `cdealmeida3`, repo `pbisacm`, a title and a body.
- **Read an issue**: `issue_read` with method `get`; its comments with method `get_comments`; its labels with method `get_labels`.
- **List issues**: `list_issues` with owner `cdealmeida3`, repo `pbisacm`, and a `state` and `labels` filter.
- **Make an issue a sub-issue of a parent**: create it with `issue_write` method `create` and `parent_issue_number`. For an issue that already exists, use `sub_issue_write` method `add` with the child's `id` from `issue_read` (the id, not the `#number`). Where neither works, put `Part of #<parent>` at the top of the child's body.
- **Blocking**: put a line `Blocked by: #<n>, #<n>` at the top of the child's body. A ticket can start when every issue on that line is closed.
- **Comment on an issue**: `add_issue_comment`.
- **Apply or remove labels**: `issue_write` with method `update` and the full new list of `labels`.
- **Close**: first post the reason with `add_issue_comment`, then `issue_write` with method `update`, `state` `closed` and a `state_reason`.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repository treats outside pull requests as feature requests; `/triage` reads this flag.)_

## When a skill says "publish to the issue tracker"

Create a GitHub issue in `cdealmeida3/pbisacm`, as in **Create an issue** above.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is one issue, and its **child** issues are the tickets.

- **Map**: one issue with the label `wayfinder:map`, holding the Notes, Decisions-so-far and Fog sections.
- **Child ticket**: a sub-issue of the map (see above), with a label `wayfinder:<type>` (`research`, `prototype`, `grilling` or `task`). Once claimed, it is assigned to the person who drives it.
- **Frontier**: the open children of the map, without an open blocker and without an assignee. The first in map order wins.
- **Claim**: assign the ticket with `issue_write` method `update` and `assignees`. This is the first write of the session.
- **Resolve**: comment the answer, close the issue, then add a short pointer (the gist and a link) to Decisions-so-far of the map.
