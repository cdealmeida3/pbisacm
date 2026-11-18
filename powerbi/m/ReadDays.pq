// How many days before a report date the files are read (D290): enough for the weekly reports and the report before each
// of them (the chip "changed in EPO", Contract changes compares the two newest Solusi files). The pages of the newest
// report read the files of the last ReadDays days before the newest file (ReadFiles); each day of the history reads the
// ReadDays days before it (HistoryRun). An older file is never opened, so a folder that keeps two years of reports stays
// fast; the Reports page does not list it.
21
