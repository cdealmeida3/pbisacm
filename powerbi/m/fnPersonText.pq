// A person of a CI as the relationship checks write it: the name, else the email, else "(empty)" (relationship-detectors.ts,
// personText). `person` is a record of fnPerson, or null.
(person as nullable record) as text =>
    if person = null then "(empty)" else if person[Name] <> "" then person[Name] else if person[Email] <> "" then person[Email] else "(empty)"
