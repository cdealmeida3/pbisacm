// The part HistoryChecked of the table HistoryRun (D290): what one CI report could verify (checkedIn of
// src/core/cases/cases.ts). Kind "ci": the key of each CI of the report that is not parked (D179). Kind "part":
// <check>:<field> of each part of a check the report tested, without the parked fields. A finding of the report before
// is solved only when the CI is here, its part is here, and the finding is gone (D59, D292). `run` is a run of
// fnCheckRun.
(run as record) as table =>
    let
        parkedFields = if run[Parked] = null then [] else run[Parked][FieldSet],
        cis = List.Transform(Record.FieldNames(run[CheckableKeys]), (key) => {run[Date], "ci", key}),
        parts = List.Transform(List.Select(run[Tested], (part) => not Record.HasFields(parkedFields, part)), (part) => {run[Date], "part", part})
    in
        #table(type table [ReportDate = date, Kind = text, Id = text], cis & parts)
