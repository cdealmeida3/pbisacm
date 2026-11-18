import type { Finding } from '../model/model.ts';

/**
 * Where a line of a SACM list is found in ServiceNow (build W5, D244). SACM makes these changes by hand: the line opens a
 * list of the table that holds the record, filtered on its name, in the ServiceNow of the team (the address is a team
 * setting). The app only builds the link; the manager opens it, and the app never writes to ServiceNow.
 */

/** The address of the ServiceNow of the team, from what was typed: "https://" and the host only, '' when it is not such a link. */
export function serviceNowAddress(typed: string): string {
  const found = /^https:\/\/([a-z0-9.-]+(?::\d+)?)(?:[/?#]|$)/i.exec(typed.trim());
  return found ? `https://${found[1]!.toLowerCase()}` : '';
}

/** What the search needs of a finding: the name of the CI, its fix line, and the number of a contract. */
export type SearchFact = Pick<Finding, 'ciName' | 'className' | 'fix'> & { ci?: { contract?: { number: string } } | undefined };

/** A list of one ServiceNow table, filtered by an encoded query. */
const list = (address: string, table: string, query: string): string => `${address}/${table}_list.do?sysparm_query=${encodeURIComponent(query)}`;

/**
 * The link that opens the record of a line in ServiceNow, or '' without an address. A contract: the contract table, by
 * its Solusi number (Vendor contract) or its ServiceNow number. A fix on relationships (`fix.relatedTo`): the rows of the
 * relationship table between the two CIs, in both directions. Any other line: the CI table, by the exact name.
 */
export function recordSearch(address: string, fact: SearchFact): string {
  if (!address) return '';
  if (fact.className === 'contract') {
    const number = fact.ci?.contract?.number || fact.ciName.split(':')[0]!.trim();
    return list(address, 'ast_contract', `vendor_contract=${number}^ORnumber=${number}`);
  }
  const other = fact.fix?.relatedTo;
  if (other) return list(address, 'cmdb_rel_ci', `parent.name=${fact.ciName}^child.name=${other}^NQparent.name=${other}^child.name=${fact.ciName}`);
  return list(address, 'cmdb_ci', `name=${fact.ciName}`);
}
