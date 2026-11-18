// The sample a new lifecycle review would draw from the newest CI report (D306; the part "review" of reference/lifecycle):
// `underRetirement` CIs in the status Under retirement and `sample` CIs of the other CIs, only of the classes EPO holds,
// never a Retired CI. The chance is a hash (fnReviewHash) of the report date, the file and the CI key: the same report
// always proposes the same CIs. Each part is in the order of class, name and key; the sample by chance first. The Power
// App SACM audit saves this proposal in the journal when a manager presses New review, so the review keeps its CIs when
// later reports change. null with no CI report or no part "review". The answer key is drawSample in tools/powerbi/review.ts.
(run as nullable record) as nullable record =>
    let
        reference = fnReference("reference/lifecycle"),
        config = if reference = null then null else Record.FieldOrDefault(reference, "review", null)
    in
        if run = null or config = null or not Value.Is(Record.FieldOrDefault(config, "classes", null), type list) then null
        else
            let
                retired = List.Buffer(List.Transform(config[retiredStatuses], (word) => fnNameKey(word, ""))),
                leaving = fnNameKey(config[underRetirementStatus], ""),
                classes = List.Buffer(config[classes]),
                start = fnReviewHash(2166136261, Date.ToText(run[Date], [Format = "yyyy-MM-dd", Culture = "en-US"]) & "|" & run[FileName] & "|"),
                pool = List.Buffer(List.Transform(
                    List.Select(run[Cis], (ci) => List.Contains(classes, ci[Class]) and not List.Contains(retired, ci[StatusKey])),
                    (ci) => [Ci = ci, Rank = fnReviewHash(start, ci[Key])])),
                byRank = (a as record, b as record) as number => let first = Value.Compare(a[Rank], b[Rank]) in if first <> 0 then first else Comparer.Ordinal(a[Ci][Key], b[Ci][Key]),
                item = (group as text) as function => (entry as record) as record =>
                    let ci = entry[Ci] in
                    [CiKey = ci[Key], Name = ci[Name], ClassLabel = if ci[SourceClass] <> "" then ci[SourceClass] else ci[Class], ClassName = ci[Class],
                        Status = ci[Status], EpoId = ci[AssetTag], Group = group],
                byName = (a as record, b as record) as number =>
                    let
                        label = Comparer.Ordinal(a[ClassLabel], b[ClassLabel]),
                        name = Comparer.Ordinal(a[Name], b[Name])
                    in
                        if label <> 0 then label else if name <> 0 then name else Comparer.Ordinal(a[CiKey], b[CiKey]),
                pick = (entries as list, count as number, group as text) as list =>
                    List.Sort(List.Transform(List.FirstN(List.Sort(entries, byRank), count), item(group)), byName),
                under = pick(List.Select(pool, (entry) => entry[Ci][StatusKey] = leaving), config[underRetirement], "under-retirement"),
                sample = pick(List.Select(pool, (entry) => entry[Ci][StatusKey] <> leaving), config[sample], "sample")
            in
                [Report = run[FileName], ReportDate = run[Date], Items = List.Buffer(sample & under)]
