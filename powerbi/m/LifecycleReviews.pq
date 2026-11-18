// The lifecycle reviews of the journal (D306), as the HTML app reads its reviews and their marks
// (src/core/audit/lifecycle-review.ts, marksOf). New review adds one row of type review with no CI: Ref is the id of the
// review ("2026-11-12_lifecycle", the day it was started) and Items the sample, as the Power App SACM audit saved it
// (JSON: report, reportDate and the items with ciKey, name, classLabel, className, status, epoId and group). A start
// row without Items cannot be read and is left out. Two starts with one id (two managers on one day): the first counts.
// A mark is a row of type review with CiKey and Reason (same, different, not-in-epo) whose Ref is the review: the last
// mark of a CI counts (the journal is oldest first). Gives the reviews oldest first: [Id, Date, Report, ReportDate,
// Items, StartedBy, Marks], Marks a record by CI key of [Result, Note, By, ByName, At]. Read by the table Run.
let
    textOf = (source as record, field as text) as text => let value = Record.FieldOrDefault(source, field, null) in if value = null then "" else Text.From(value),
    starts = List.Select(JournalEvents, (event) => event[Type] = "review" and event[CiKey] = "" and event[Ref] <> "" and event[Items] <> ""),
    parsed = List.Transform(starts, (event) =>
        let
            body = try Json.Document(event[Items]) otherwise null,
            items = if body is record then Record.FieldOrDefault(body, "items", null) else null
        in
            if not (items is list) then null
            else [
                Id = event[Ref], Date = Text.Start(event[Ref], 10), Report = textOf(body, "report"), ReportDate = Text.Start(textOf(body, "reportDate"), 10),
                Items = List.Buffer(List.Transform(List.Select(items, (entry) => entry is record and textOf(entry, "ciKey") <> ""), (entry) => [
                    CiKey = textOf(entry, "ciKey"), Name = textOf(entry, "name"), ClassLabel = textOf(entry, "classLabel"), ClassName = textOf(entry, "className"),
                    Status = textOf(entry, "status"), EpoId = textOf(entry, "epoId"), Group = if textOf(entry, "group") = "under-retirement" then "under-retirement" else "sample"])),
                StartedBy = if event[ByName] <> "" then event[ByName] else event[By]
            ]),
    byId = fnGroupBy(List.RemoveNulls(parsed), (review) => review[Id]),
    reviews = List.Sort(List.Transform(Record.FieldValues(byId), List.First), (a, b) => Comparer.Ordinal(a[Id], b[Id])),
    marks = List.Select(JournalEvents, (event) => event[Type] = "review" and event[CiKey] <> "" and event[Reason] <> ""),
    marksOf = fnGroupBy(marks, (event) => event[Ref]),
    withMarks = List.Transform(reviews, (review) =>
        let
            own = fnGroupBy(Record.FieldOrDefault(marksOf, review[Id], {}), (event) => event[CiKey]),
            last = List.Transform(Record.FieldValues(own), (events) => let event = List.Last(events) in
                [Result = event[Reason], Note = event[Text], By = event[By], ByName = if event[ByName] <> "" then event[ByName] else event[By], At = event[At]])
        in
            review & [Marks = Record.FromList(last, Record.FieldNames(own))])
in
    List.Buffer(withMarks)
