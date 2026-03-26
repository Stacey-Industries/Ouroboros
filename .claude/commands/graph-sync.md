Re-index the codebase graph and report changes:

1. Run `index_repository` from codebase-memory-mcp
2. Run `get_architecture` with aspects=['hotspots'] to find most-connected functions
3. Compare hotspots to previous known hotspots
4. Report: new files indexed, removed files, new hotspots, changed connections

$ARGUMENTS
