// Table NotRead: the files of no known type, with what each type is missing (the Reports page).
Table.SelectColumns(Table.SelectRows(ReportFilesRows, each not [IsRead]), {"FileName", "ReportDate", "Message"})
