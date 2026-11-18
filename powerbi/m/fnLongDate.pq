// A date as the message texts write it: 12 November 2026 (src/core/shared/dates.ts, longDate).
(value as date) as text => Date.ToText(value, [Format = "d MMMM yyyy", Culture = "en-US"])
