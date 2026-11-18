// The part CaseLines of the table Run (D292), which the DAX table CaseLines shows: one line per case of the newest report
// (fnCases), with its status (StatusLabel: the word the pages show, "Asked" for Contacted), how it is listed, who has it, the messages, the replies, the decision to stop following
// it, who marked it fixed and when, when the newest report verified it, and (build B6) who it is about and what the Power App offers on it, and (build B7) who it goes to when its card is shared out. `cases` is fnCases(CheckRun).
(cases as list) as table =>
    #table(
        type table [Key = text, CheckId = text, CiKey = text, CiName = text, ClassLabel = text, Field = text, ContactName = text,
            InLatest = logical, Untested = logical, CiMissing = logical, State = text, StateLabel = text, Status = text, StatusLabel = text,
            AssignedTo = text, HandoverNote = text, Request = text, Messages = Int64.Type, SentOn = date, LastMessageTo = text, LastRef = text,
            ReminderFrom = date, Remind = text, Replies = Int64.Type, LastReplyOn = date, ExceptionReason = text, ReviewOn = date,
            ExceptionEnded = date, RetireOn = date, VerifiedOn = date, FixedBy = text, FixedOn = date, Events = Int64.Type,
            Person = text, Actions = text, ActionWords = text, Stages = text, StageId = text, ShareTo = text],
        List.Transform(cases, (item) => {
            item[Key], item[CheckId], item[CiKey], item[CiName], item[ClassLabel], item[Field], item[ContactName], item[InLatest], item[Untested], item[CiMissing],
            item[State], item[StateLabel], item[Status], item[StatusLabel], item[AssignedTo], item[HandoverNote], item[Request], item[Messages], item[SentOn], item[LastMessageTo],
            item[LastRef], item[ReminderFrom], item[Remind], List.Count(item[Replies]), item[LastReplyOn], item[ExceptionReason], item[ReviewOn],
            item[ExceptionEnded], item[RetireOn], item[VerifiedOn], item[FixedBy], item[FixedOn], item[Events],
            item[Person], item[Actions], item[ActionWords], item[Stages], item[StageId], item[ShareTo]}))
