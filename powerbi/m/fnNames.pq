// Names, each once, sorted, joined with ", " (as the details of the criticality checks list parents).
(names as list) as text => Text.Combine(List.Sort(List.Distinct(names), Comparer.FromCulture("en-US")), ", ")
