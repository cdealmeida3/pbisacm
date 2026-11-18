// The link that opens the record of a finding in ServiceNow (src/core/cases/record-search.ts, recordSearch, D244): a list
// of the table that holds it, filtered on its name. A fix on relationships: the relationships between the two CIs, both
// ways. A contract: the contract table, by its number. "" without an address. The report only builds the link; it never
// writes to ServiceNow.
(address as text, ciName as text, className as text, relatedTo as text) as text =>
    let
        // As JavaScript's encodeURIComponent: Uri.EscapeDataString also escapes ! ' ( ) *, which it leaves.
        encode = (query as text) as text => List.Accumulate({{"%21", "!"}, {"%27", "'"}, {"%28", "("}, {"%29", ")"}, {"%2A", "*"}}, Uri.EscapeDataString(query),
            (text, pair) => Text.Replace(text, pair{0}, pair{1})),
        list = (table as text, query as text) as text => address & "/" & table & "_list.do?sysparm_query=" & encode(query),
        number = Text.Trim(Text.BeforeDelimiter(ciName, ":"))
    in
        if address = "" then ""
        else if className = "contract" then list("ast_contract", "vendor_contract=" & number & "^ORnumber=" & number)
        else if relatedTo <> "" then list("cmdb_rel_ci", "parent.name=" & ciName & "^child.name=" & relatedTo & "^NQparent.name=" & relatedTo & "^child.name=" & ciName)
        else list("cmdb_ci", "name=" & ciName)
