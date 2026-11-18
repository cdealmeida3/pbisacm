// A contract as a CI-shaped record (src/core/sources/contracts/contract-reports.ts, contractSubject), so a finding about
// it is listed, asked and shown like a finding about a CI. Its key is contract:<Solusi number> (the ServiceNow number
// when there is none); the name shown is "<number>: <name>"; Owned by is the contract owner. SubjectColumns says which
// roles it has (fnFacts reads them instead of the columns of the CI report). It is never mixed with the CIs of the CI
// report. `servicenow` and `solusi` are rows of the two contract readers; either may be null.
(servicenow as nullable record, solusi as nullable record) as record =>
    let
        text = (row as nullable record, field as text) as text => if row = null then "" else let value = Record.Field(row, field) in if value = null then "" else value,
        number = List.First(List.Select({text(solusi, "Number"), text(servicenow, "VendorContract"), text(servicenow, "Number")}, (value) => value <> ""), ""),
        name = if text(servicenow, "Name") <> "" then text(servicenow, "Name") else text(solusi, "Name"),
        status = if text(servicenow, "State") <> "" then text(servicenow, "State") else text(solusi, "Status"),
        tags = if text(servicenow, "Tags") = "" then {} else Text.Split(text(servicenow, "Tags"), ", "),
        owner =
            if text(servicenow, "Owner") <> "" then
                [OwnedBy = servicenow[Owner], OwnedByEmail = servicenow[OwnerEmail], OwnedByUserId = servicenow[OwnerUserId], OwnedByActive = servicenow[OwnerActive]]
            else if text(solusi, "Owner") <> "" then [OwnedBy = solusi[Owner], OwnedByEmail = "", OwnedByUserId = "", OwnedByActive = null]
            else []
    in
        [
            Key = "contract:" & Text.Lower(Text.Trim(number), "en-US"), Name = if name <> "" then number & ": " & name else number,
            Class = "contract", SourceClass = "Contract", AssetTag = "", Status = status, StatusKey = fnNameKey(status, ""), NameKey = fnNameKey(name, ""),
            SupportGroup = "", TagList = tags, TagKeys = List.Buffer(List.Transform(tags, (tag) => fnNameKey(tag, ""))),
            Contract = [Number = number, Name = name, Vendor = if text(servicenow, "Vendor") <> "" then text(servicenow, "Vendor") else text(solusi, "Vendor")],
            SubjectColumns = if Record.FieldCount(owner) > 0 then {"owned_by"} else {}
        ] & owner
