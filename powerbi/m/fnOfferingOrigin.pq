// Who made a Service Offering (src/core/cases/fix-place.ts, offeringOrigin, D137, D187): "epo" when the EPO integration
// created it (Created by is not a person's user ID), "person" when a person did (or the report does not say), "" for a CI
// that is no offering of reference/epo-synced-classes.
(ci as record) as text =>
    let
        synced = Record.FieldOrDefault(ReferenceFiles, "epo-synced-classes", null),
        offerings = if synced = null then null else Record.FieldOrDefault(synced, "offerings", null),
        createdBy = Text.Trim(if Record.FieldOrDefault(ci, "CreatedBy", null) = null then "" else ci[CreatedBy])
    in
        if offerings = null or not List.Contains(Record.FieldOrDefault(offerings, "classes", {}), ci[Class]) then ""
        else if createdBy = "" then "person"
        else if fnMatches(Record.FieldOrDefault(offerings, "personUserId", "^$"), "", createdBy) then "person"
        else "epo"
