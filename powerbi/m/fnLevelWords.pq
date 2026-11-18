// A criticality level in the words of ServiceNow, never as a bare number (src/core/model/model.ts, levelWords).
(value as number) as text => Record.FieldOrDefault(ReadingRules[levelWords], Text.From(value), Text.From(value))
