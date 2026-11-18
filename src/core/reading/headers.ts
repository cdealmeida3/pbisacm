/** Report headers are compared after normalising: lower case, spaces → "_", and the "ci." prefix of the CMDB Health result removed. */
export function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, '_').replace(/^ci\./, '');
}
