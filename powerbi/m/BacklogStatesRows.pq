// Table BacklogStates (D367, build R5): the four states of a line of the Mapping backlog, so the buttons above the table
// show all four, in the order of the work, also when a state has no line (dimmed). The words are those of
// fnMappingBacklogPart (stateWords); MappingBacklog[StateLabel] → BacklogStates[Label].
#table(type table [Label = text, Order = Int64.Type], {{"To solve", 1}, {"To check", 2}, {"Waiting", 3}, {"Planned", 4}})
