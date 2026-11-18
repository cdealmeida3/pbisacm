// Is the fix of a finding on this CI made in EPO (src/core/cases/fix-place.ts, fixedInEpo, D122, D123, D187)? A class
// EPO feeds, or a Service Offering the EPO integration created (fnOfferingOrigin), except the fields and checks that are
// changed in ServiceNow on such an offering.
(ci as record, checkId as text, field as text) as logical =>
    let
        synced = Record.FieldOrDefault(ReferenceFiles, "epo-synced-classes", null),
        offerings = if synced = null then null else Record.FieldOrDefault(synced, "offerings", null),
        here = Record.FieldOrDefault(offerings, "inServiceNow", [])
    in
        if synced = null then false
        else if List.Contains(Record.FieldOrDefault(synced, "classes", {}), ci[Class]) then true
        else if fnOfferingOrigin(ci) <> "epo" then false
        else not List.Contains(Record.FieldOrDefault(here, "fields", {}), field) and not List.Contains(Record.FieldOrDefault(here, "checks", {}), checkId)
