// The named formulas of the Power App "SACM audit" (builds B8 and 0.52.0, D306, D308, D334), written by hand. npm run powerbi:generate puts
// them after the settings and the results of the review (SettingCatalog, ReviewResults) into App-Formulas.fx (to paste
// into App → Formulas) and Src/App.pa.yaml. Words of the app: plain English, as in the report.
//
// Lines: the rows the Power Apps visual of the page Lifecycle review gives (the fields of the table ReviewLines, README §6.8): each CI
// of each lifecycle review, then the CIs a new review would draw from the newest CI report (Review "next"). The app only
// adds rows to the lists SACM Journal and SACM Settings (D272); it changes or removes none, and sends nothing.

Lines = PowerBIIntegration.Data;
LineCount = CountRows(Lines);
// The Power Apps visual gives the app 1,000 rows at most (Microsoft's limit).
TooManyLines = LineCount >= 1000;
Me = LookUp('SACM Team', Lower(Email) = Lower(User().Email));
MeName = Coalesce(Me.Title, User().FullName);
MeEmail = Lower(User().Email);

// The lifecycle review (D192, D306). ReportCurrentLines: the CIs of the newest review in the report; NextLines: the CIs
// a new review draws from the newest CI report (fnReviewDraw of the report: the same report always draws the same CIs),
// in their order.
ReportCurrentLines = Sort(Filter(Lines, IsCurrent), Order);
NextLines = Sort(Filter(Lines, IsNext), Order);
// A review is known by the day it starts: "2026-11-12_lifecycle" (reviewId of the HTML app).
TodayId = Text(Today(), "yyyy-mm-dd") & "_lifecycle";
// The review of today is in the journal (EntryType and Ref are tested in SharePoint, so they are delegated).
TodayInJournal = !IsEmpty(Filter('SACM Journal', EntryType = "review" && Ref = TodayId));
// A review started today is never started again: it is in the report, or in the journal before the refresh shows it.
StartedToday = First(ReportCurrentLines).Review = TodayId || TodayInJournal;
// The review of today before the refresh shows it (build 0.52.0, D334): the journal has it, the report's newest review is
// older. Then the review to mark is today's: its CIs are NextLines (New review saved exactly them in Items) and its id
// TodayId, so a mark never goes to the previous review while the refresh is hours away.
ReviewPending = TodayInJournal && First(ReportCurrentLines).Review <> TodayId;
CurrentLines = If(ReviewPending, NextLines, ReportCurrentLines);
CurrentId = If(ReviewPending, TodayId, First(ReportCurrentLines).Review);
// The marks saved on the review since the report's data, by anyone (D334): the report shows them after the next
// refresh. ForAll keeps them in the app (EntryType, Ref and At are tested in SharePoint, so they are delegated).
MarksSince = ForAll(
    Filter('SACM Journal', EntryType = "review" && Ref = CurrentId && At >= PendingSince) As row,
    { CiKey: row.CiKey, Reason: row.Reason, At: row.At, ByName: Coalesce(row.ByName, row.By) });
MarkedSince = Filter(MarksSince, !IsBlank(CiKey));
// The header line (D334): every journal row of the team saved since the report's data.
PendingCount = CountRows(Filter('SACM Journal', At >= PendingSince));
PendingWhere = "";
ReportUnknownText = "The report gave the app no line.";
// The sample as the journal keeps it (the column Items of SACM Journal, read by LifecycleReviews): the report, its date
// and the CIs, as the HTML app saves a review in data/reviews/.
NewReviewItems = JSON(
    {
        report: First(NextLines).Report,
        reportDate: Text(First(NextLines).ReportDate, "yyyy-mm-dd"),
        items: ForAll(NextLines As line, { ciKey: line.CiKey, name: line.CiName, classLabel: line.ClassLabel, className: line.ClassName, status: line.Status, epoId: line.EpoId, group: line.Group })
    },
    JSONFormat.Compact);
NewReviewText = "Started the lifecycle review of " & Text(Today(), "yyyy-mm-dd") & ": " & CountRows(NextLines) & " CIs drawn from " &
    First(NextLines).Report & " (report of " & Text(First(NextLines).ReportDate, "yyyy-mm-dd") & ")";
MarkedCount = CountRows(Filter(CurrentLines As line, !IsBlank(line.Result) || line.CiKey in MarkedSince.CiKey));
// The CIs not marked yet whose status EPO shows the same: one press marks them all "same" (markSameAsEpo of the HTML app).
// Not those marked since the report's data.
AgreeingLines = Filter(CurrentLines As line, line.Agrees && !(line.CiKey in MarkedSince.CiKey));
AgreeNote = "Same status in the EPO systems report of " & Text(First(CurrentLines).EpoDate, "d mmm yyyy", "en-US");

// The settings (D158; rowsInEmail, D314): each number with the value that counts now: the last row of its key in SACM Settings when it is a
// whole number in its range, else the default (CaseRules of the report reads the same).
SettingRows = ForAll(
    SettingCatalog As setting,
    With(
        { raw: Trim(Last(Filter('SACM Settings', Title = setting.Key)).Value) },
        {
            Key: setting.Key, Label: setting.Label, Min: setting.Min, Max: setting.Max, Default: setting.Default, Order: setting.Order,
            Current: If(IsMatch(raw, "\d+") && Value(raw) >= setting.Min && Value(raw) <= setting.Max, Value(raw), setting.Default),
            // A saved value that is not used (D158: "Settings says so").
            Unused: If(!IsBlank(raw) && !(IsMatch(raw, "\d+") && Value(raw) >= setting.Min && Value(raw) <= setting.Max), raw, "")
        }));
