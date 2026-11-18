import { readTable } from '../../core/reading/table.ts';
import type { Table } from '../../core/reading/table.ts';

/** The browser part of reading a report file: inflating the parts of an .xlsx (Edge and Chrome have DecompressionStream). */
export async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const utf8 = new TextDecoder('utf-8');

/** A .csv or .xlsx file as rows. */
export const tableOf = (bytes: Uint8Array): Promise<Table> => readTable(bytes, inflateRaw, (data) => utf8.decode(data));
