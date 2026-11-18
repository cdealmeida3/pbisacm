// The lines of the lifecycle review on the newest CI report (D192, D306), as withReviewFacts of
// src/core/audit/lifecycle-review.ts adds them: the newest mark of each CI over all reviews (LifecycleReviews) decides.
// A mark "Not the same" opens a line of the card Lifecycle review while the newest report still shows the CI in the
// status it had in the review, from the report of the review on. The line is a SACM fix line (reviewFix): service
// mapped, SACM copies the status of EPO; not service mapped, an incident for the sync; the owner is asked only after
// "EPO itself looks wrong: ask the owner". The check counts as tested (status) with every CI checked in a review; with
// no mark at all it is not tested and says how to start one. Only the newest report gets the lines: the history
// (HistoryRun) does not count them, as it does not read the journal. `run` is CheckRun (null when no CI report).
(run as nullable record) as nullable record =>
    let
        reference = fnReference("reference/lifecycle"),
        config = if reference = null then null else Record.FieldOrDefault(reference, "review", null),
        packs = List.Select(List.Transform(Json.Document(CheckFiles), (entry) => entry[pack]), (pack) => pack[id] = "LIFECYCLE-REVIEW" and pack[status] <> "off"),
        pack = List.First(packs, null),
        reviews = LifecycleReviews,
        notYet = [CheckId = "LIFECYCLE-REVIEW", Note = "No lifecycle review yet. A manager starts one on the Audit page, under Lifecycle."]
    in
        if run = null then null
        else if pack = null or config = null or List.IsEmpty(reviews) then run & [Notes = run[Notes] & (if pack = null then {} else {notYet})]
        else
            let
                // The newest mark of each CI over all reviews; a later review wins a tie.
                entries = List.Combine(List.Transform(reviews, (review) =>
                    List.RemoveNulls(List.Transform(review[Items], (item) =>
                        let mark = Record.FieldOrDefault(review[Marks], item[CiKey], null) in
                        if mark = null then null else [Item = item, Mark = mark, Review = review])))),
                checked = List.Count(entries),
                latest = List.Transform(Record.FieldValues(fnGroupBy(entries, (entry) => entry[Item][CiKey])),
                    (list) => List.Accumulate(list, null, (best, entry) => if best = null or best[Mark][At] <= entry[Mark][At] then entry else best)),
                from = List.Min(List.Transform(reviews, (review) => review[ReportDate])),
                date = Date.ToText(run[Date], [Format = "yyyy-MM-dd", Culture = "en-US"]),
                cis = Record.FromList(run[Cis], List.Transform(run[Cis], (ci) => ci[Key])),
                retired = List.Buffer(List.Transform(config[retiredStatuses], (word) => fnNameKey(word, ""))),
                columns = run[Columns],
                months = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"},
                screenDate = (iso as text) as text => if Text.Length(iso) < 10 then iso
                    else Text.From(Number.FromText(Text.Middle(iso, 8, 2))) & " " & months{Number.FromText(Text.Middle(iso, 5, 2)) - 1} & " " & Text.Start(iso, 4),
                // A person of the CI as the app keeps it (src/app/view/people.ts): only with a name or an email; the name, else the email.
                known = (person as nullable record) as nullable record => if person = null or (person[Name] = "" and person[Email] = "") then null
                    else person & [Name = if person[Name] <> "" then person[Name] else person[Email]],
                reachable = (person as nullable record) as logical => person <> null and person[Email] <> "" and person[Active] <> false,
                shown = (person as nullable record) as text => if person = null then "" else person[Name] & (if person[Active] = false then " (inactive)" else ""),
                idOf = (person as record) as text => let id = Text.Lower(Text.Trim(if person[UserId] <> "" then person[UserId] else person[Email]), "en-US") in
                    if id <> "" then id else Text.Lower(person[Name], "en-US"),
                fixOf = (status as text, mapped as nullable logical) as record =>
                    if mapped = true then [Change = "Operational status: copy the status of EPO into ServiceNow (service mapped)", Current = status, Set = "The status EPO shows"]
                    else if mapped = false then [Change = "Operational status: the sync did not bring the status of EPO. Raise an incident with the ServiceNow development team", Current = status, Set = "The status EPO shows, brought by the sync"]
                    else [Change = "Operational status: not the same as in EPO. Service mapped: copy the status of EPO. Not service mapped: raise an incident with the ServiceNow development team", Current = status, Set = "The status EPO shows"],
                factOf = (entry as record) as nullable record =>
                    let
                        item = entry[Item],
                        mark = entry[Mark],
                        review = entry[Review],
                        ci = Record.FieldOrDefault(cis, item[CiKey], null)
                    in
                        if not List.Contains(config[opensCase], mark[Result]) or date < review[ReportDate] or ci = null or List.Contains(retired, ci[StatusKey])
                            or ci[StatusKey] <> fnNameKey(item[Status], "") then null
                        else
                            let
                                owner = known(fnPerson(ci, "owned_by", columns)),
                                manager = known(fnPerson(ci, "managed_by", columns)),
                                supporter = known(fnPerson(ci, "supported_by", columns)),
                                contact = if reachable(owner) then [Person = owner, Via = "owned by"] else if reachable(manager) then [Person = manager, Via = "managed by"] else null,
                                cc = if contact <> null and contact[Via] = "owned by" and reachable(manager) and Text.Lower(manager[Email], "en-US") <> Text.Lower(contact[Person][Email], "en-US") then {manager[Email]} else {},
                                finding = fnFinding(pack, ci, "status",
                                    "Status in ServiceNow is " & ci[Status] & "; EPO does not show the same (lifecycle review of " & screenDate(review[Date]) & ", " & mark[ByName] & ")"
                                        & (if mark[Note] <> "" then ": " & mark[Note] else ""),
                                    if pack[playbook][path] = "sacm-fix" then [Fix = fixOf(ci[Status], ci[ServiceMapped])] else null)
                            in
                                finding & [
                                    ClassLabel = if ci[SourceClass] <> "" then ci[SourceClass] else ci[Class], Module = pack[dimension], Route = "", State = "open", StateWhy = "",
                                    EpoId = ci[AssetTag], Status = ci[Status], SupportGroup = ci[SupportGroup], OwnedBy = shown(owner), ManagedBy = shown(manager), SupportedBy = shown(supporter),
                                    Tags = {}, Contract = null,
                                    ContactName = if contact = null then "" else contact[Person][Name], ContactEmail = if contact = null then "" else contact[Person][Email],
                                    ContactId = if contact = null then "" else idOf(contact[Person]), ContactVia = if contact = null then "" else contact[Via], Cc = cc,
                                    EscalateName = "", EscalateEmail = "", EscalateVia = ""
                                ],
                facts = if date < from then {} else List.RemoveNulls(List.Transform(latest, factOf)),
                part = "LIFECYCLE-REVIEW:status"
            in
                if date < from then run & [Notes = run[Notes] & {notYet}]
                else run & [
                    Facts = List.Buffer(List.Select(run[Facts], (fact) => fact[CheckId] <> pack[id]) & facts),
                    Tested = if List.Contains(run[Tested], part) then run[Tested] else run[Tested] & {part},
                    Evaluated = List.Select(run[Evaluated], (entry) => entry[Part] <> part) & {[Part = part, Count = checked]}
                ]
