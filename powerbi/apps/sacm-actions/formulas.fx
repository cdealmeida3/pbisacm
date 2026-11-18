// The named formulas of the Power App "SACM actions" (build B6, D294 to D296), written by hand. npm run powerbi:generate
// puts them after the catalogue of powerbi/apps/actions.json into App-Formulas.fx (to paste into App → Formulas) and
// Src/App.pa.yaml. Words of the app: plain English, as in the report.
//
// Lines: the rows the Power Apps visual of the page gives (the fields of CaseLines, README §6): the lines of the page,
// or the ones selected in the report. Me: the person signed in, found by their email in the list SACM Team.

Lines = PowerBIIntegration.Data;
LineCount = CountRows(Lines);
Me = LookUp('SACM Team', Lower(Email) = Lower(User().Email));
MeName = Coalesce(Me.Title, User().FullName);
// The managers a line can be given to: the active members of the list SACM Team (a menu shows the column Value).
TeamNames = ForAll(Sort(Filter('SACM Team', Active = true), Title), { Value: Title });

// My open work: the lines assigned to me that can still be assigned (open, to solve or to check).
MyOpenLines = Filter(Lines As line, line.AssignedTo = MeName && (StartsWith(line.Actions, "assign=") || ("|assign=") in line.Actions));

// The people of the lines: a note about a person needs every line to be about the same person.
LinePeople = Distinct(Filter(Lines, Person <> ""), Person);

// The actions every selected line has (scope line). Value is what the menu shows: the words of the first line
// (its Actions, "id=Label|id=Label"). Then Hand over when I have open work among the lines, and a note about the person
// when every line is about one person.
LineActions = ForAll(
    Filter(ActionCatalog As action, action.Scope = "line" && LineCount > 0 &&
        CountRows(Filter(Lines As line, !(StartsWith(line.Actions, action.Id & "=") || ("|" & action.Id & "=") in line.Actions))) = 0) As chosen,
    {
        Id: chosen.Id, Type: chosen.Type, Text: chosen.Text, Asks: chosen.Asks, Scope: chosen.Scope, Order: chosen.Order,
        Value: Coalesce(
            Last(Split(LookUp(Split(First(Lines).Actions, "|") As pair, StartsWith(pair.Value, chosen.Id & "=")).Value, "=")).Value,
            chosen.Label)
    });
OtherActions = ForAll(
    Filter(ActionCatalog As action,
        (action.Scope = "mine" && CountRows(MyOpenLines) > 0) ||
        (action.Scope = "person" && LineCount > 0 && CountRows(LinePeople) = 1 && CountRows(Filter(Lines, Person = "")) = 0)) As chosen,
    { Id: chosen.Id, Type: chosen.Type, Text: chosen.Text, Asks: chosen.Asks, Scope: chosen.Scope, Order: chosen.Order, Value: chosen.Label });
AvailableActions = Sort(Table(LineActions, OtherActions), Order);

// The stages a case of the mapping backlog can be set to: those of the first line, when every line has the same.
StageChoices = If(
    CountRows(Distinct(Lines, Stages)) = 1 && First(Lines).Stages <> "",
    ForAll(Split(First(Lines).Stages, "|") As pair, { Id: First(Split(pair.Value, "=")).Value, Value: Last(Split(pair.Value, "=")).Value }),
    Table({ Id: "", Value: "" }));

// The keys an action is about: my open lines for Hand over, none for a note about a person, else every line.
KeysFor = { mine: Concat(MyOpenLines, Key, Char(10)), lines: Concat(Lines, Key, Char(10)) };

// The reason of the decision to stop following that Follow again ends: the reason of the first line, else Other.
FollowAgainReason = If(
    IsBlank(First(Lines).ExceptionReason) || StartsWith(First(Lines).ExceptionReason, "Set before"),
    "Other",
    First(Lines).ExceptionReason);

// What the team did lately on these lines, before the next refresh shows it: the journal of the last 60 days (the date
// test runs in SharePoint, so it is delegated), then the events that name one of the keys. Newest first.
SelectedKeys = ForAll(Lines, Key);
RecentEvents = Sort(
    Filter(
        Filter('SACM Journal', At >= DateAdd(Today(), -60, TimeUnit.Days)) As event,
        CountRows(Filter(Split(event.Keys, Char(10)) As key, Trim(key.Value) in SelectedKeys.Value)) > 0),
    At, SortOrder.Descending);
