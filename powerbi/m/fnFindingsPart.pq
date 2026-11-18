// The part Findings of the table Run (D284), which the DAX table Findings shows: one row per finding of the newest CI
// report (fnCheckRun), with who is asked, how it is listed, where it is fixed and the CI as the message table shows it
// (DATA-MODEL §3, a fact). Key never changes: <check>:<CI key>:<field>. Group: the findings of one check that go to the
// same person by the same route, in the same state (one piece of work). Mapping: the reasons of a case of the mapping
// backlog, by id. EpoCorrection: what EPO already says (fnEpoCorrections). Problem: the kind of problem a line is listed
// under (a problem of the contract data, a field of the upload check; D146), "" for most checks. `run` is CheckRun (null
// when no CI report is loaded).
(run as nullable record) as table =>
    let
        facts = if run = null then {} else run[Facts],
        words = [open = "To solve", review = "To check", waiting = "Waiting", known = "Known"],
        address = fnServiceNowAddress(ServiceNowAddress),
        corrections = List.Buffer(if run = null then {} else fnEpoCorrections(facts, run)),
        fix = (fact as record, part as text) as text => if fact[Fix] = null then "" else Record.FieldOrDefault(fact[Fix], part, ""),
        row = (fact as record, correction as text) as list =>
            let
                person = if fact[ContactId] <> "" then fact[ContactId] else if fact[ContactEmail] <> "" then Text.Lower(fact[ContactEmail], "en-US") else "nobody"
            in
                {
                    run[Date], fact[Key], fact[CheckId], fact[CiKey], fact[CiName], fact[Class], fact[ClassLabel], fact[Field], fact[Severity], fact[Detail],
                    fact[Module], fact[Route], fact[State], Record.Field(words, fact[State]), fact[StateWhy], fact[Source], fact[Wait], fact[Review],
                    fact[ContactId], fact[ContactName], fact[ContactEmail], fact[ContactVia],
                    if fact[ContactName] <> "" then fact[ContactName] & " (" & fact[ContactVia] & ")" else "Nobody to ask",
                    Text.Combine(fact[Cc], "; "), fact[EscalateName], fact[EscalateEmail], fact[EscalateVia],
                    fix(fact, "Change"), fix(fact, "Current"), fix(fact, "Set"), fix(fact, "Value"), fix(fact, "RelatedTo"),
                    fact[CheckId] & "|" & fact[Route] & "|" & person & (if fact[State] = "open" then "" else "|" & fact[State]),
                    fact[EpoId], fact[Status], fact[SupportGroup], fact[OwnedBy], fact[ManagedBy], fact[SupportedBy], Text.Combine(fact[Chips], ", "), Text.Combine(fact[Tags], ", "),
                    fnServiceNowLink(address, fact[CiName], fact[Class], fix(fact, "RelatedTo")),
                    Text.Combine(fact[Mapping], ", "), correction, fact[Problem]
                }
    in
        #table(
            type table [ReportDate = date, Key = text, CheckId = text, CiKey = text, CiName = text, Class = text, ClassLabel = text, Field = text,
                Severity = text, Detail = text, Module = text, Route = text, State = text, StateLabel = text, StateWhy = text, Source = text, Wait = text,
                Review = text, ContactId = text, ContactName = text, ContactEmail = text, ContactVia = text, AskWho = text, Cc = text, EscalateName = text,
                EscalateEmail = text, EscalateVia = text, FixChange = text, FixCurrent = text, FixSet = text, FixValue = text, FixRelatedTo = text,
                Group = text, EpoId = text, Status = text, SupportGroup = text, OwnedBy = text, ManagedBy = text, SupportedBy = text, Chips = text, Tags = text,
                ServiceNowLink = text, Mapping = text, EpoCorrection = text, Problem = text],
            List.Transform(List.Positions(facts), (at) => row(facts{at}, corrections{at})))
