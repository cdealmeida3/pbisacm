// The named formulas of the Power App "SACM messages" (build B7, D301), written by hand. npm run powerbi:generate copies
// them into App-Formulas.fx (to paste into App → Formulas) and Src/App.pa.yaml. Words of the app: plain English, as in
// the report.
//
// Drafts: the rows the Power Apps visual of the page Messages gives (the fields of the table Drafts, README §6): the
// messages ready to send, or the ones selected in the report. Each draft holds %%REF%% where its reference goes and
// %%SENDER%% where the manager's name goes: the app fills both when the manager sends (D301). Nothing is sent until a
// manager presses Send, Test, Outlook or Teams (D2).

Drafts = PowerBIIntegration.Data;
DraftCount = CountRows(Drafts);
// The Power Apps visual gives the app 1,000 rows at most (Microsoft's limit).
TooManyDrafts = DraftCount >= 1000;
Me = LookUp('SACM Team', Lower(Email) = Lower(User().Email));
MeName = Coalesce(Me.Title, User().FullName);
MeEmail = Lower(User().Email);
// The manager's name in the HTML of a message: & < > and " written as the HTML app writes them.
MeHtml = Substitute(Substitute(Substitute(Substitute(MeName, "&", "&amp;"), "<", "&lt;"), ">", "&gt;"), """", "&quot;");

// Outlook cuts a mailto link that is too long: above this, the message is copied and pasted instead (as the HTML app).
MailtoBodyLimit = 1800;
// Teams links stay reliable for a group chat up to about this many people.
TeamsLimit = 15;
// How far back the warning before a double contact looks (DOUBLE_CONTACT_HOURS of src/core/team/team.ts).
DoubleContactHours = 24;
// The letters of a new reference: no I, O, 0 or 1, which are easy to mistake (newRef of the HTML app).
RefLetters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// The messages a colleague sent in the last 24 hours (Type, By and At are tested in SharePoint, so they are delegated;
// the apps write By in lower case). The screen keeps those to one of the addresses of the draft, or about one of its
// cases (doubleContacts of src/core/team/team.ts).
RecentMessages = Filter(
    'SACM Journal',
    Type = "message" && At >= DateAdd(Now(), -DoubleContactHours, TimeUnit.Hours) && By <> MeEmail);

// The drafts in the order of the HTML app (D0001 first).
DraftList = Sort(Drafts, DraftId);
