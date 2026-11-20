// Table SameNumbers (D366, build R5): the numbers that must be the same on two pages (rule 8 of the real-data plan, "one
// word, one number"). The page Self-check shows each pair and whether they agree; the measures Same left, Same right and
// Same match of the table work them out. They hold on any data, the real reports too.
#table(type table [Pair = text, Order = Int64.Type], {
    {"Rail badge of Work queue = the line under People to ask (Mine and free)", 1},
    {"Overview Open lines = the total of Where the work sits", 2},
    {"Overview Waiting on a person = the sum of Who holds the most", 3},
    {"Overview Waiting on a person = Work queue with Everyone", 4},
    {"Overview Open lines = the newest point of Open lines per report", 5}
})
