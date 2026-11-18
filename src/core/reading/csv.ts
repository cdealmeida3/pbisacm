/** CSV reader (RFC 4180 quoting). The delimiter is detected from the header line: comma, semicolon or tab. */
export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = source.slice(0, Math.max(0, source.search(/[\r\n]/)) || source.length);
  let delimiter = ',';
  let best = 0;
  for (const candidate of [',', ';', '\t']) {
    const count = firstLine.replace(/"[^"]*"/g, '').split(candidate).length - 1;
    if (count > best) { best = count; delimiter = candidate; }
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}
