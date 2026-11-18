// The output of an EPO card when the CI report has no "service mapped" column: not tested, with the note that says why.
() as record =>
    [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested: the CI report has no ""service mapped"" column (ref_cmdb_ci_service.u_service_mapped). It decides whether SACM or the sync brings the EPO value."}]
