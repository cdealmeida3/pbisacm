/**
 * Report headers are compared after normalising: lower case, spaces → "_". A "ci." prefix is kept: it is the mark of a
 * CMDB Health result, a report of its own that is never the CI report (D341).
 */
export function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, '_');
}
