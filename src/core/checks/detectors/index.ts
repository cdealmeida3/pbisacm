import { plural } from '../../shared/text.ts';
import { MODEL_REF, buildGraph, DETECTORS as RELATIONSHIP_DETECTORS, runDetector } from './relationship-detectors.ts';
import { CI_DETECTORS, runCiDetector } from './ci-detectors.ts';
import { EPO_DETECTORS, runEpoDetector } from './epo-detectors.ts';
import { CONTRACT_DETECTORS, runContractDetector } from './contract-detectors.ts';
import { CRITICALITY_DETECTORS, runCriticalityDetector } from './criticality-detectors.ts';
import { PROCESS_STAGE, processStage } from './process-detectors.ts';
import { MAPPING_BACKLOG, mappingBacklog } from './mapping-detectors.ts';
import { SOURCE_FIRST, notCompared, sourceFirst } from './source-first.ts';
import { compareEpo, epoConfig } from '../../sources/epo/epo-report.ts';
import type { Comparison, EpoInput } from '../../sources/epo/epo-report.ts';
import { compareContracts } from '../../sources/contracts/contract-reports.ts';
import type { ContractComparison, ContractInput } from '../../sources/contracts/contract-reports.ts';
import type { Relationship } from '../../sources/relationships/relationship-report.ts';
import type { Graph, RelationshipModel } from './relationship-detectors.ts';
import type { CheckPack, Ci, Finding, References, RunResult } from '../../model/model.ts';

/**
 * The one list of code detectors (checks of type "code"), by family. This is where a new report type plugs its checks in:
 * one family here, with the modules it runs and how it runs them. The engine (../engine.ts) knows only this list, never a
 * report type; the check-file validator reads the module names from it.
 */

/**
 * What the engine gets besides the CI report, by name. Each is optional: a check that needs a missing one is not tested and says so.
 *   date           the date of the CI report (yyyy-mm-dd), for the checks that count days;
 *   relationships  the rows of the Relationship report loaded with it, for the relationship checks (and the parents of the
 *                  criticality checks);
 *   epo            the EPO systems report loaded with it, for the EPO checks;
 *   contracts      the Solusi contract file and the ServiceNow contract report loaded with it, for the contract checks.
 */
export interface EngineInputs {
  date?: string;
  relationships?: Relationship[] | null;
  epo?: EpoInput | null;
  contracts?: ContractInput | null;
}

/** What a family's detector gives back. `subjects`: records that are not CIs (contracts), handed to the run. */
export type FamilyOutput = Pick<RunResult, 'findings' | 'tested' | 'evaluated' | 'notes' | 'subjects'>;

/** One run of the checks, as a family sees it. `once` keeps what a family works out once per run (a graph, a comparison). */
export interface DetectorRun {
  cis: Ci[];
  /** The CIs of the pack's classes, without the statuses it excludes. */
  inScope: Ci[];
  columns: Set<string>;
  references: References;
  inputs: EngineInputs;
  /** The date of the CI report, '' when not known. */
  date: string;
  once<T>(key: string, make: () => T): T;
}

interface Family {
  /** The `detector.module` names it runs. */
  modules: string[];
  run(pack: CheckPack, run: DetectorRun): FamilyOutput;
}

/** The relationship graph of the run, built once; its notes are said by the first check that builds it. */
function relationshipGraph(run: DetectorRun, ref = MODEL_REF): { graph: Graph | null; notes: RunResult['notes'] } {
  let fresh = false;
  const graph = run.once('relationships/graph', (): Graph | null => {
    fresh = true;
    const model = run.references[ref] as RelationshipModel | undefined;
    return run.inputs.relationships && model ? buildGraph(run.cis, run.inputs.relationships, model) : null;
  });
  const notes: RunResult['notes'] = [];
  if (fresh && graph && graph.unmatched) notes.push({ checkId: 'RELATIONSHIPS', note: `${plural(graph.unmatched, 'relationship end')} ${graph.unmatched === 1 ? 'is' : 'are'} not in the CI report. They count by the class of the Relationship report, and their status is not known.` });
  if (fresh && graph && graph.ambiguous) notes.push({ checkId: 'RELATIONSHIPS', note: `${graph.ambiguous} relationship ends name a CI that two CIs share, and neither class nor asset tag told them apart. The first was used.` });
  return { graph, notes };
}

const relationships: Family = {
  modules: Object.keys(RELATIONSHIP_DETECTORS),
  run(pack, run) {
    const said: RunResult['notes'] = [];
    const out = runDetector(pack, run.cis, run.inScope, run.columns, run.references, () => {
      const built = relationshipGraph(run, pack.detector.ref ?? MODEL_REF);
      said.push(...built.notes);
      return built.graph;
    });
    return { ...out, notes: said.concat(out.notes) };
  }
};

/** The families, in the order they are asked. The last one, the relationship checks, also answers an unknown module (with a note). */
const FAMILIES: Family[] = [
  { modules: Object.keys(CI_DETECTORS), run: (pack, run) => runCiDetector(pack, run.cis, run.inScope, run.columns, run.references, run.date) },
  {
    modules: Object.keys(EPO_DETECTORS),
    run: (pack, run) => runEpoDetector(pack, run.cis, run.columns, run.references, run.inputs.epo, run.date,
      (config, input) => run.once<Comparison>('epo/comparison', () => compareEpo(run.cis, input.systems, run.columns, config)))
  },
  {
    modules: Object.keys(CONTRACT_DETECTORS),
    run: (pack, run) => runContractDetector(pack, run.references, run.inputs.contracts, run.date,
      (input) => run.once<ContractComparison>('contracts/comparison', () => compareContracts(input.solusi!.contracts, input.servicenow!.contracts)), run.cis, run.columns)
  },
  {
    // Criticality: the parents come from the relationship graph when a Relationship report is loaded.
    modules: Object.keys(CRITICALITY_DETECTORS),
    run(pack, run) {
      const said: RunResult['notes'] = [];
      const out = runCriticalityDetector(pack, run.inScope, run.columns, run.references, run.date, () => {
        const built = relationshipGraph(run);
        said.push(...built.notes);
        return built.graph;
      });
      return { ...out, notes: said.concat(out.notes) };
    }
  },
  {
    // The stages of a Business Process in Ready (D197): what is linked below comes from the relationship graph.
    modules: [PROCESS_STAGE],
    run(pack, run) {
      const said: RunResult['notes'] = [];
      const out = processStage(pack, run.inScope, run.columns, run.references, () => {
        const built = relationshipGraph(run);
        said.push(...built.notes);
        return built.graph;
      });
      return { ...out, notes: said.concat(out.notes) };
    }
  },
  {
    // The mapping backlog (D200): one line per CI to map, from the relationship graph and the tags.
    modules: [MAPPING_BACKLOG],
    run(pack, run) {
      const said: RunResult['notes'] = [];
      const out = mappingBacklog(pack, run.inScope, run.columns, run.references, () => {
        const built = relationshipGraph(run);
        said.push(...built.notes);
        return built.graph;
      });
      return { ...out, notes: said.concat(out.notes) };
    }
  },
  relationships
];

/** Every module name a check file may give a detector of type "code". */
export const CODE_MODULES: string[] = FAMILIES.reduce((all, family) => all.concat(family.modules), [] as string[]);

/** The family that runs a module; an unknown module goes to the last family, which says it is not available. */
export const familyOf = (module: string): Family => FAMILIES.find((family) => family.modules.includes(module)) ?? FAMILIES[FAMILIES.length - 1]!;

/**
 * What a report type does with the findings once every check ran. Today one step, the source first (D190): the people lines
 * of a CI that EPO feeds are compared with the EPO systems report before anybody is asked (./source-first.ts). Without the
 * report the lines stay as they are, and the run says that they were not compared.
 */
export function afterChecks(findings: Finding[], run: DetectorRun, packs: CheckPack[]): { findings: Finding[]; notes: RunResult['notes'] } {
  const config = epoConfig(run.references);
  if (!config?.sourceFirst) return { findings, notes: [] };
  const epo = run.inputs.epo;
  const why = !epo ? 'no EPO systems report is loaded. Load it with the CI report'
    : !run.columns.has('assetTag') ? 'the CI report has no column for the EPO ID (asset_tag)' : '';
  if (why) {
    const note = notCompared(findings, config, why);
    return { findings, notes: note ? [{ checkId: SOURCE_FIRST, note }] : [] };
  }
  const comparison = run.once<Comparison>('epo/comparison', () => compareEpo(run.cis, epo!.systems, run.columns, config));
  return { findings: sourceFirst(findings, { cis: run.cis, columns: run.columns, packs, config, comparison }), notes: [] };
}
