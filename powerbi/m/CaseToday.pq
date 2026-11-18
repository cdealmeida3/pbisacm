// The day the cases are worked out for (an exception that ends, a planned retirement date): the day the samples were
// recorded in Sample mode, else the day of the refresh. What depends on today between two refreshes (a reminder due, a
// report too old) is DAX, with the measure Today.
if SourceMode = "Sample" then SampleDate else DateTime.Date(DateTime.LocalNow())
