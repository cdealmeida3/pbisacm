// A class in words: "Business Application", "Platform" (relationship-detectors.ts, CLASS_WORDS), else its name with spaces.
(cls as text) as text => Record.FieldOrDefault(ReadingRules[classWords], cls, Text.Replace(cls, "_", " "))
