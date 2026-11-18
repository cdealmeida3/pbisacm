// How long a CI sits in a status (code detector ci/status-age, src/core/checks/detectors/ci-detectors.ts): more than
// `days` days in the status of the rule (reference/lifecycle), counted from the day the record was created or last
// changed to the date of the report. Every CI of the scope is tested; only a CI in the status without a date is not.
// A rule with a setting (underRetirementDays, readyDays) takes its days from the team's settings (CaseRules, D158; build
// B8, D308), as withTeamDays of the HTML app does. The history keeps the days of the refresh that computed each day.
(pack as record, run as record, inScope as list, reference as record) as record =>
    let
        columns = run[Columns],
        date = run[Date],
        wanted = Record.FieldOrDefault(pack[detector], "rules", null),
        rules = List.Select(Record.FieldOrDefault(reference, "rules", {}), (rule) => wanted = null or List.Contains(wanted, rule[id])),
        fixLine = Record.FieldOrDefault(pack, "playbook", [])[path] = "sacm-fix",
        teamDays = [underRetirementDays = CaseRules[UnderRetirementDays], readyDays = CaseRules[ReadyDays]],
        perRule = List.Transform(rules, (given) =>
            let
                setting = Record.FieldOrDefault(given, "setting", ""),
                rule = if setting <> "" and Record.HasFields(teamDays, setting) then given & [days = Record.Field(teamDays, setting)] else given,
                column = if rule[from] = "created" then "createdOn" else "updatedOn",
                word = if rule[from] = "created" then "Created (sys_created_on)" else "Updated (sys_updated_on)",
                sinceOf = (ci as record) as nullable date => if rule[from] = "created" then ci[CreatedOn] else ci[UpdatedOn],
                status = fnNameKey(rule[status], ""),
                inStatus = List.Buffer(List.Select(inScope, (ci) => ci[StatusKey] = status)),
                unread = List.Count(List.Select(inStatus, (ci) => sinceOf(ci) = null)),
                over = List.Select(inStatus, (ci) => sinceOf(ci) <> null and Duration.Days(date - sinceOf(ci)) > rule[days]),
                fill = (ci as record) as text =>
                    let since = sinceOf(ci) in
                    Text.Replace(Text.Replace(Text.Replace(Text.Replace(rule[say], "{status}", ci[Status]), "{days}", Text.From(rule[days])),
                        "{date}", fnLongDate(since)), "{age}", Text.From(Duration.Days(date - since))),
                fix = Record.FieldOrDefault(rule, "fix", null)
            in
                if not List.Contains(columns, "operationalStatus") or not List.Contains(columns, column) then
                    [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested: the report has no column for " & (if not List.Contains(columns, "operationalStatus") then "Operational status" else word) & "."}]
                else if date = null then [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested: the date of the report is not known."}]
                else [
                    Findings = List.Transform(over, (ci) => fnFinding(pack, ci, rule[id], fill(ci),
                        [Fix = if fixLine and fix <> null then [Change = fix[change], Current = ci[Status] & " since " & fnLongDate(sinceOf(ci)), Set = fix[set], Value = ""] else null])),
                    Tested = {pack[id] & ":" & rule[id]},
                    Evaluated = {[Part = pack[id] & ":" & rule[id], Count = List.Count(inScope) - unread]},
                    Notes = if unread > 0 then {"Partly tested: " & Text.From(unread) & " CIs in status " & rule[status] & " have no date the tool can read."} else {}
                ])
    in
        fnCombineOutputs(perRule)
