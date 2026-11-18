// The detectors of checks/packs that are built in Power Query. A check whose detector is not in this list is grey with
// the note "not built" (D15), so each build can port a part. Build B2: the rule checks and the CI code detectors. Build
// B3: the relationship checks, the EPO checks, the stages of a Business Process and the mapping backlog.
{
    "rule", "ci/name-standard", "ci/epo-id", "ci/status-age", "criticality/above-parents", "criticality/none-reaches",
    "relationships/missing", "relationships/too-many", "relationships/wrong-type", "relationships/twice",
    "relationships/application-instance", "relationships/offering-owner", "relationships/offering-parent",
    "epo/differs", "epo/not-arrived", "process/stage", "mapping/backlog"
}
