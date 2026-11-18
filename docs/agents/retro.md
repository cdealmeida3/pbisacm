# Retro: what to read

The `retro` skill reads the log of a session. In this project every thread starts in a new container, so the log of the current session holds only the retro itself. Read these primary sources instead.

## Ask first

Ask which pull request the retro is about, when the user names none. Offer the most recently merged one.

## Read

- **The plan.** In project threads, the project files folder has `plans/` with the plan of the planning thread. Find it by the title of the pull request.
- **The pull request.** Through the GitHub MCP tools: its description, commits, review comments, and the files it changed.
- **The CI runs.** `actions_list` with `list_workflow_runs` for the branch and for `main`, then `list_workflow_jobs` for each run: the job and step times show where the time went, and a failed run shows what the build thread had to fix.
- **The thread.** The messages of the planning thread and the build thread, when this session can read them: questions the user had to answer, and anything that was redone.
- **The session.** Each commit message ends with a `Claude-Session` line that names the session. Its log is only on the computer that ran it, under `~/.claude/projects/`, for a local session.

## Write

- The retro is a file in the project files folder `retros/`, named `<date>-<subject>-retro.md`. It changes nothing in the repository.
- Each finding that the user wants done gets a planning thread, then a build thread (D109).
