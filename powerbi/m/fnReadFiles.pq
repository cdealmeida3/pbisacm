// The report files dated from `from` (that day or later) up to `to` (before that day), each read once and typed
// (fnTypeFiles: Read, Kind, TypeLabel, Message, Used, WhyNotUsed). null leaves that end open; a file with no date is
// always kept. A file outside the dates is never opened, so an old folder stays fast (D290).
(from as nullable date, to as nullable date) as table =>
    fnTypeFiles(Table.SelectRows(ReportSourceFiles, each [ReportDate] = null or ((from = null or [ReportDate] >= from) and (to = null or [ReportDate] < to))))
