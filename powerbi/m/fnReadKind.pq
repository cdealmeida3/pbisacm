// The rows of one report file by its type, with the reader of that type; null for a file of no known type.
(kind as text, read as record) as nullable table =>
    if kind = "ci" then fnReadCiReport(read)
    else if kind = "relationship" then fnReadRelationshipReport(read)
    else if kind = "epo" then fnReadEpoReport(read)
    else if kind = "solusi" then fnReadSolusiFile(read)
    else if kind = "contract" then fnReadContractReport(read)
    else null
