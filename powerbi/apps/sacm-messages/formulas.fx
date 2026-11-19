// The named formulas of the Power App "SACM messages", the email studio (builds B7, D5 and 0.52.0, D301, D313 to D317, D334), written
// by hand. npm run powerbi:generate puts the look of the report before them in App-Formulas.fx (to paste into App →
// Formulas) and Src/App.pa.yaml. Words of the app: plain English, as in the report.
//
// Drafts: the rows the Power Apps visual of the page Messages gives (the fields of the table Drafts, README §6.6): the
// messages ready to send. A long message is split into parts (D36), and the template joins them into ONE email on its
// first part (D314): that part holds the email (Html, its file Csv, EmailSubject); the other parts point to it in
// EmailId. The app lists the emails, and records every part of an email under its one reference. The texts hold %%REF%%
// where the reference goes and %%SENDER%% where the manager's name goes: the app fills both when the manager sends
// (D301). Nothing is sent until a manager presses Send, Test to me, Outlook draft or Teams (D2).

Drafts = PowerBIIntegration.Data;
DraftCount = CountRows(Drafts);
// The Power Apps visual gives the app 1,000 rows at most (Microsoft's limit).
TooManyDrafts = DraftCount >= 1000;
Me = LookUp('SACM Team', Lower(Email) = Lower(User().Email));
MeName = Coalesce(Me.Title, User().FullName);
MeEmail = Lower(User().Email);
// The manager's name in the HTML of a message: & < > and " written as the HTML app writes them.
MeHtml = Substitute(Substitute(Substitute(Substitute(MeName, "&", "&amp;"), "<", "&lt;"), ">", "&gt;"), """", "&quot;");

// Teams links stay reliable for a group chat up to about this many people.
TeamsLimit = 15;
// How far back the warning before a double contact looks (DOUBLE_CONTACT_HOURS of src/core/team/team.ts).
DoubleContactHours = 24;
// The letters of a new reference: no I, O, 0 or 1, which are easy to mistake (newRef of the HTML app).
RefLetters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// The messages a colleague sent in the last 24 hours (Type, By and At are tested in SharePoint, so they are delegated;
// the apps write By in lower case). The screen keeps those to one of the addresses of the email, or about one of its
// cases (doubleContacts of src/core/team/team.ts).
RecentMessages = Filter(
    'SACM Journal',
    Type = "message" && At >= DateAdd(Now(), -DoubleContactHours, TimeUnit.Hours) && By <> MeEmail);

// The emails recorded since the time of the report's data (build 0.52.0, D334): the journal rows of type message from
// ReportSince on, by anyone (Type and At are tested in SharePoint, so they are delegated; ForAll keeps them in the app).
// The report shows an email in the list until the next refresh, which can be two hours away: an email whose cases one of
// these rows names is Sent for everyone (the buttons are off), not only in the session that sent it.
SentRows = ForAll(
    Filter('SACM Journal', Type = "message" && At >= PendingSince) As row,
    { Keys: row.Keys, At: row.At, ByName: Coalesce(row.ByName, row.By) });
// The header line (D334): every journal row of the team saved since the report's data.
PendingCount = CountRows(Filter('SACM Journal', At >= PendingSince));
PendingWhere = "";
ReportUnknownText = "No email from the report now.";

// The emails, in the order of the HTML app (D0001 first): one per message, on its first part, with the cases of all its
// parts. Keys, NewKeys and FreeKeys are lists of keys, one per line (Char(10)). An email of an older report (no
// EmailId) is its draft alone.
Emails = ForAll(
    Sort(Filter(Drafts, IsBlank(EmailId) || EmailId = DraftId), DraftId) As email,
    With(
        { parts: If(IsBlank(email.EmailId), Filter(Drafts, DraftId = email.DraftId), Filter(Drafts, EmailId = email.DraftId)) },
        With(
            { keys: Concat(Filter(parts, !IsBlank(Keys)), Keys, Char(10)) },
            With(
                // The newest message recorded since the report's data on one of the cases of the email (SentRows).
                { sent: First(Sort(Filter(SentRows As row, CountRows(Filter(Split(row.Keys, Char(10)) As key, !IsBlank(Trim(key.Value)) && (Char(10) & Trim(key.Value) & Char(10)) in (Char(10) & keys & Char(10)))) > 0), At, SortOrder.Descending)) },
                {
                    DraftId: email.DraftId, Ref: email.Ref, Kind: email.Kind, KindLabel: email.KindLabel,
                    To: email.To, ToName: email.ToName, Cc: email.Cc, About: email.About, NobodyAbove: email.NobodyAbove,
                    Mailbox: email.Mailbox, AssignedTo: email.AssignedTo, Chat: email.Chat,
                    Subject: Coalesce(email.EmailSubject, email.Subject),
                    Html: Coalesce(email.Html, email.Body),
                    Csv: email.Csv,
                    Summary: email.Summary,
                    // The Power Apps visual may pass a long text cut (a limit of about 32,000 characters is reported for the visuals
                    // of Power BI): "cut" when the email or its file is shorter than the report says (Drafts[HtmlLength],
                    // [CsvLength]), "unknown" when the visual has not these two fields. The app sends neither (README §6.6).
                    Whole: If(
                        IsBlank(email.Html), "yes",
                        IsBlank(email.HtmlLength) || IsBlank(email.CsvLength), "unknown",
                        Len(email.Html) = email.HtmlLength && Len(email.Csv) = email.CsvLength, "yes",
                        "cut"),
                    // What the app remembers of an email it recorded, until the refresh takes it off the list: its first key
                    // between two line breaks (a refresh may number the drafts again, the keys stay).
                    SentKey: Char(10) & First(Split(keys, Char(10))).Value & Char(10),
                    PartCount: CountRows(parts),
                    CiCount: Sum(parts, CiCount),
                    Keys: keys,
                    // Sent since the report's data, by anyone (D334): who and when.
                    IsSent: !IsBlank(sent.At),
                    SentBy: sent.ByName,
                    SentAt: sent.At,
                    NewKeys: Concat(Filter(parts, !IsBlank(NewKeys)), NewKeys, Char(10)),
                    FreeKeys: Concat(Filter(parts, !IsBlank(FreeKeys)), FreeKeys, Char(10)),
                    // The parts of "In this email" (one line each in Summary), for the line of the list.
                    Topics: If(IsBlank(email.Summary), 1, CountRows(Split(email.Summary, Char(10))))
                }
            )
        )
    )
);
EmailCount = CountRows(Emails);

// The filter of the list (the tabs above it): every email, or one kind.
KindTabs = ["All", "First", "Reminder", "Escalate"];
KindOf = Table({ Tab: "First", Kind: "first" }, { Tab: "Reminder", Kind: "reminder" }, { Tab: "Escalate", Kind: "escalation" });

// The chip of a kind: its colour and its soft background (one meaning per colour, with the word, LOOK rule 5).
KindColour = Table(
    { Kind: "first", Ink: ColourBlue, Soft: ColourBlueSoft },
    { Kind: "reminder", Ink: ColourAmber, Soft: ColourAmberSoft },
    { Kind: "escalation", Ink: ColourRed, Soft: ColourRedSoft });
