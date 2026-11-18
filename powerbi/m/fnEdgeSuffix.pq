// The end of the key of a finding about one relationship: <parent key>><type, compared form>><child key>
// (relationship-detectors.ts, edgeSuffix).
(edge as record) as text => edge[Parent][Key] & ">" & fnTypeKey(edge[Type]) & ">" & edge[Child][Key]
