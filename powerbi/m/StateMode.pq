// Where the team's state comes from (D291): the journal, the replies, the settings, the team and the lifecycle reviews.
// "Sample": invented rows packed in this file (powerbi/samples/state/), so the history pages show something.
// "SharePoint": the five lists of the team site (SharePointSite; powerbi/README.md says how to make them). Empty lists
// are fine: every case is then New. "None": no state at all (every case New), for the real reports before the lists exist.
"Sample" meta [IsParameterQuery = true, List = {"Sample", "SharePoint", "None"}, DefaultValue = "Sample", Type = "Text", IsParameterQueryRequired = true]
