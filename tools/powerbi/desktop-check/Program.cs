// The Desktop check (build B8, D309): Power BI Desktop has the project open on GitHub's Windows runner; this program
// connects to the engine Desktop started (the port in msmdsrv.port.txt), refreshes the model on the invented samples,
// lists every object of the model that has an error, asks the values of the drill-through columns, has
// tools/powerbi/desktop.ts write the DAX query of every visual, runs them and writes the results for the judge.
//   dotnet run --project tools/powerbi/desktop-check -c Release -- <port> <repository> <out folder>
// Nothing here changes a file of the repository; the model in Desktop is refreshed in memory only.
using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization.Metadata;
using Microsoft.AnalysisServices.AdomdClient;
using Tom = Microsoft.AnalysisServices.Tabular;

if (args.Length < 3) { Console.Error.WriteLine("Usage: DesktopCheck <port> <repository> <out folder>"); return 2; }
var port = args[0];
var repository = Path.GetFullPath(args[1]);
var outFolder = Path.GetFullPath(args[2]);
Directory.CreateDirectory(outFolder);
var result = new JsonObject { ["opened"] = false, ["modelErrors"] = new JsonArray(), ["results"] = new JsonArray() };
void Save() => File.WriteAllText(Path.Combine(outFolder, "results.json"), result.ToJsonString(new JsonSerializerOptions { WriteIndented = true, TypeInfoResolver = new DefaultJsonTypeInfoResolver() }));

// 1. The model Desktop loaded: wait until the database is there (Desktop loads it after it starts the engine).
var server = new Tom.Server();
Tom.Database? database = null;
var watch = Stopwatch.StartNew();
while (watch.Elapsed < TimeSpan.FromMinutes(5))
{
    try
    {
        if (!server.Connected) server.Connect($"Data Source=localhost:{port}");
        server.Refresh(true);
        database = server.Databases.Count > 0 ? server.Databases[0] : null;
        if (database?.Model != null && database.Model.Tables.Count > 0) break;
    }
    catch (Exception error) { Console.WriteLine($"Waiting for the model: {error.Message}"); }
    Thread.Sleep(5000);
}
if (database?.Model == null || database.Model.Tables.Count == 0) { result["openError"] = "no model in the engine after 5 minutes"; Save(); return 0; }
result["opened"] = true;
Console.WriteLine($"Model: {database.Model.Tables.Count} tables, {database.Model.Tables.Sum(table => table.Measures.Count)} measures, compatibility {database.CompatibilityLevel}");
// Desktop still loads its queries for a while after the model is there ("Loading queries"); a refresh then can clash.
Thread.Sleep(TimeSpan.FromSeconds(45));

// 2. Refresh on the samples, as Desktop's Refresh does.
var timer = Stopwatch.StartNew();
// One table at a time, so a failing query names itself (a refresh of the whole model says only "An unexpected
// exception occurred"), then the calculated tables and columns.
var failed = new List<string>();
foreach (var table in database.Model.Tables.Where(table => table.Partitions.Any(partition => partition.SourceType == Tom.PartitionSourceType.M)).ToList())
{
    var started = timer.Elapsed;
    Console.WriteLine($"{DateTime.UtcNow:HH:mm:ss} Refreshing {table.Name}");
    try
    {
        // As Desktop's own Refresh: the incremental refresh policy of HistoryRun applies only in the service (a refresh
        // that applies it in Desktop fails with "An unexpected exception occurred").
        table.RequestRefresh(Tom.RefreshType.DataOnly, Tom.RefreshPolicyBehavior.Ignore);
        database.Model.SaveChanges();
        Console.WriteLine($"Refreshed {table.Name} in {(timer.Elapsed - started).TotalSeconds:0.0} s");
    }
    catch (Exception error)
    {
        failed.Add($"{table.Name}: {error.Message}");
        Console.WriteLine($"Refresh of {table.Name} failed: {error.Message}");
        database.Model.UndoLocalChanges();
    }
}
Console.WriteLine($"{DateTime.UtcNow:HH:mm:ss} Calculating");
try
{
    database.Model.RequestRefresh(Tom.RefreshType.Calculate);
    database.Model.SaveChanges();
    Console.WriteLine($"Calculated in {timer.Elapsed.TotalSeconds:0} s in all");
}
catch (Exception error)
{
    failed.Add($"calculate: {error.Message}");
    Console.WriteLine($"Calculate failed: {error.Message}");
}
if (failed.Count > 0) result["refreshError"] = string.Join("\n", failed);

// 3. Every object with an error, as Desktop marks it with a warning (a measure with an error is left out of the field
//    list, and a visual that shows it is empty).
server.Refresh(true);
database = server.Databases[0];
var modelErrors = (JsonArray)result["modelErrors"]!;
foreach (var table in database.Model.Tables)
{
    foreach (var measure in table.Measures)
        if (!string.IsNullOrEmpty(measure.ErrorMessage)) modelErrors.Add($"measure {table.Name}[{measure.Name}]: {measure.ErrorMessage}");
    foreach (var column in table.Columns)
        if (!string.IsNullOrEmpty(column.ErrorMessage)) modelErrors.Add($"column {table.Name}[{column.Name}]: {column.ErrorMessage}");
    foreach (var partition in table.Partitions)
    {
        if (!string.IsNullOrEmpty(partition.ErrorMessage)) modelErrors.Add($"table {table.Name}: {partition.ErrorMessage}");
        else if (partition.State != Tom.ObjectState.Ready) modelErrors.Add($"table {table.Name}: {partition.State}");
    }
}
Console.WriteLine($"Model errors: {modelErrors.Count}");

// 4. The values of the drill-through columns (at most 60 each), then the queries of every visual.
using var connection = new AdomdConnection($"Data Source=localhost:{port};Catalog={database.Name}");
connection.Open();
List<List<string?>> Rows(string dax)
{
    using var command = new AdomdCommand(dax, connection) { CommandTimeout = 120 };
    using var reader = command.ExecuteReader();
    var rows = new List<List<string?>>();
    while (reader.Read())
    {
        var row = new List<string?>();
        for (var at = 0; at < reader.FieldCount; at++)
        {
            var value = reader.GetValue(at);
            row.Add(value switch
            {
                null or DBNull => null,
                DateTime date => date.TimeOfDay == TimeSpan.Zero ? date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : date.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
                IFormattable number => number.ToString(null, CultureInfo.InvariantCulture),
                _ => value.ToString()
            });
        }
        rows.Add(row);
    }
    return rows;
}
var queriesFile = Path.Combine(outFolder, "queries.json");
void WriteQueries(string? drillFile)
{
    var node = Process.Start(new ProcessStartInfo("node", $"tools/powerbi/desktop.ts queries \"{queriesFile}\"" + (drillFile != null ? $" \"{drillFile}\"" : "")) { WorkingDirectory = repository, UseShellExecute = false })!;
    node.WaitForExit();
    if (node.ExitCode != 0) throw new Exception("desktop.ts could not write the queries");
}
WriteQueries(null);
var drill = new JsonObject();
foreach (var column in JsonNode.Parse(File.ReadAllText(queriesFile))!["drillColumns"]!.AsArray())
{
    var name = column!.GetValue<string>();
    try { drill[name] = new JsonArray(Rows($"EVALUATE TOPN ( 60, FILTER ( VALUES ( {name} ), NOT ISBLANK ( {name} ) ), {name}, ASC )").Select(row => (JsonNode?)JsonValue.Create(row[0])).ToArray()); }
    catch (Exception error) { Console.WriteLine($"Drill values of {name}: {error.Message}"); }
}
var drillFile = Path.Combine(outFolder, "drill.json");
File.WriteAllText(drillFile, drill.ToJsonString());
WriteQueries(drillFile);

var results = (JsonArray)result["results"]!;
var queries = JsonNode.Parse(File.ReadAllText(queriesFile))!["queries"]!.AsArray();
timer.Restart();
foreach (var query in queries)
{
    var entry = new JsonObject { ["query"] = query!.DeepClone() };
    try
    {
        var rows = Rows(query["dax"]!.GetValue<string>());
        entry["rows"] = new JsonArray(rows.Select(row => (JsonNode?)new JsonArray(row.Select(value => (JsonNode?)JsonValue.Create(value)).ToArray())).ToArray());
    }
    catch (Exception error) { entry["error"] = error.Message; }
    results.Add(entry);
}
Console.WriteLine($"{queries.Count} queries in {timer.Elapsed.TotalSeconds:0} s");
Save();
return 0;
