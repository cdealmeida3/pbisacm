// A text made safe for the HTML of a message (src/core/shared/text.ts, escapeHtml): & < > and " as their entities. Every
// value from a report is written this way.
(value as text) as text => Text.Replace(Text.Replace(Text.Replace(Text.Replace(value, "&", "&amp;"), "<", "&lt;"), ">", "&gt;"), """", "&quot;")
