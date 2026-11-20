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

// 2. Refresh on the samples, as Desktop's Refresh does.
// A trace of the engine, every session (R4 step 0): what it begins and ends, so a refresh that stalls says where. Every
// event goes to trace.log; the log gets the steps that took more than 2 s, and, when a table stalls, what is still open.
var traceFile = new StreamWriter(Path.Combine(outFolder, "trace.log")) { AutoFlush = true };
var openSteps = new System.Collections.Concurrent.ConcurrentDictionary<string, (DateTime At, string Text)>();
var lastEvents = new System.Collections.Concurrent.ConcurrentQueue<string>();
Tom.Trace? trace = null;
try
{
    trace = server.Traces.Add($"DesktopCheck-{Guid.NewGuid():N}");
    var progress = new[] { Microsoft.AnalysisServices.TraceEventClass.ProgressReportBegin, Microsoft.AnalysisServices.TraceEventClass.ProgressReportEnd, Microsoft.AnalysisServices.TraceEventClass.ProgressReportError };
    foreach (var eventClass in progress)
    {
        var traceEvent = trace.Events.Add(eventClass);
        traceEvent.Columns.Add(Microsoft.AnalysisServices.TraceColumn.EventClass);
        traceEvent.Columns.Add(Microsoft.AnalysisServices.TraceColumn.EventSubclass);
        traceEvent.Columns.Add(Microsoft.AnalysisServices.TraceColumn.ObjectName);
        traceEvent.Columns.Add(Microsoft.AnalysisServices.TraceColumn.ObjectPath);
        traceEvent.Columns.Add(Microsoft.AnalysisServices.TraceColumn.CurrentTime);
        traceEvent.Columns.Add(Microsoft.AnalysisServices.TraceColumn.SessionID);
        traceEvent.Columns.Add(Microsoft.AnalysisServices.TraceColumn.TextData);
        if (eventClass != Microsoft.AnalysisServices.TraceEventClass.ProgressReportBegin) traceEvent.Columns.Add(Microsoft.AnalysisServices.TraceColumn.Duration);
    }
    trace.OnEvent += (sender, e) =>
    {
        try
        {
            var what = $"{e.EventSubclass} {e.ObjectPath}";
            var text = (e.TextData ?? "").Replace("\r", " ").Replace("\n", " ");
            if (text.Length > 300) text = text.Substring(0, 300);
            var line = $"{DateTime.UtcNow:HH:mm:ss} {e.EventClass} {what}{(e.EventClass == Microsoft.AnalysisServices.TraceEventClass.ProgressReportBegin ? "" : $" {e.Duration} ms")} {text}";
            traceFile.WriteLine(line);
            lastEvents.Enqueue(line);
            while (lastEvents.Count > 60) lastEvents.TryDequeue(out _);
            var key = $"{e.SessionID}|{what}";
            if (e.EventClass == Microsoft.AnalysisServices.TraceEventClass.ProgressReportBegin) openSteps[key] = (DateTime.UtcNow, text);
            else
            {
                openSteps.TryRemove(key, out _);
                if (e.Duration > 2000) Console.WriteLine($"  step {what}: {e.Duration / 1000.0:0.0} s");
            }
        }
        catch { }
    };
    trace.Update();
    trace.Start();
    Console.WriteLine("Engine trace started");
}
catch (Exception error) { Console.WriteLine($"No engine trace: {error.Message}"); trace = null; }

// Desktop still loads its queries for a while after the model is there ("Loading queries"); a refresh then can clash.
Thread.Sleep(TimeSpan.FromSeconds(45));

// The minutes one table may take before the check stops and says what the engine is doing (the job's own limit is
// far away). DESKTOP_TABLE_MINUTES changes it.
var tableMinutes = int.TryParse(Environment.GetEnvironmentVariable("DESKTOP_TABLE_MINUTES"), out var minutes) ? minutes : 12;
void ShowEngine(string why)
{
    Console.WriteLine($"ENGINE ({why}): steps still open:");
    foreach (var step in openSteps.OrderBy(entry => entry.Value.At)) Console.WriteLine($"  OPEN since {step.Value.At:HH:mm:ss} {step.Key} {step.Value.Text}");
    Console.WriteLine("ENGINE: the last events:");
    foreach (var line in lastEvents) Console.WriteLine($"  {line}");
    try
    {
        using var look = new AdomdConnection($"Data Source=localhost:{port}");
        look.Open();
        foreach (var dmv in new[] { "$SYSTEM.DISCOVER_COMMANDS", "$SYSTEM.DISCOVER_LOCKS", "$SYSTEM.DISCOVER_SESSIONS" })
        {
            using var command = new AdomdCommand($"SELECT * FROM {dmv}", look) { CommandTimeout = 60 };
            using var reader = command.ExecuteReader();
            Console.WriteLine($"ENGINE: {dmv}");
            while (reader.Read())
            {
                var cells = new List<string>();
                for (var at = 0; at < reader.FieldCount; at++)
                {
                    var value = reader.GetValue(at)?.ToString() ?? "";
                    if (value == "" || value == "0") continue;
                    value = value.Replace("\r", " ").Replace("\n", " ");
                    cells.Add($"{reader.GetName(at)}={(value.Length > 400 ? value.Substring(0, 400) : value)}");
                }
                Console.WriteLine("  " + string.Join("; ", cells));
            }
        }
    }
    catch (Exception error) { Console.WriteLine($"ENGINE: no DMV: {error.Message}"); }
}

var timer = Stopwatch.StartNew();
// One step of the refresh on its own thread: null when it ended, else why not. After 3 minutes the log gets what the
// engine is doing; after tableMinutes the check stops waiting.
string? Timed(string what, Action step)
{
    var started = timer.Elapsed;
    var work = Task.Run(step);
    var shown = false;
    while (!work.Wait(TimeSpan.FromMinutes(1)))
    {
        var took = (timer.Elapsed - started).TotalMinutes;
        if (!shown && took >= 3) { ShowEngine($"{what} after 3 minutes"); shown = true; }
        if (took >= tableMinutes) break;
    }
    if (!work.IsCompleted)
    {
        ShowEngine($"{what} after {tableMinutes} minutes");
        return $"STALLED: did not end in {tableMinutes} minutes (see ENGINE in the log)";
    }
    return work.IsFaulted ? work.Exception!.GetBaseException().Message : null;
}
void Stalled(List<string> failures)
{
    result["refreshError"] = string.Join("\n", failures);
    Save();
    Console.WriteLine("The refresh stalled: the check stops here.");
    traceFile.Flush();
    Environment.Exit(0);
}
// One table at a time, so a failing query names itself (a refresh of the whole model says only "An unexpected
// exception occurred"), then the calculated tables and columns.
var failed = new List<string>();
foreach (var table in database.Model.Tables.Where(table => table.Partitions.Any(partition => partition.SourceType == Tom.PartitionSourceType.M)).ToList())
{
    var started = timer.Elapsed;
    Console.WriteLine($"{DateTime.UtcNow:HH:mm:ss} Refreshing {table.Name}");
    // As Desktop's own Refresh: the incremental refresh policy of HistoryRun applies only in the service (a refresh
    // that applies it in Desktop fails with "An unexpected exception occurred").
    var problem = Timed(table.Name, () => { table.RequestRefresh(Tom.RefreshType.DataOnly, Tom.RefreshPolicyBehavior.Ignore); database.Model.SaveChanges(); });
    if (problem == null) { Console.WriteLine($"Refreshed {table.Name} in {(timer.Elapsed - started).TotalSeconds:0.0} s"); continue; }
    failed.Add($"{table.Name}: {problem}");
    Console.WriteLine($"Refresh of {table.Name} failed: {problem}");
    if (problem.StartsWith("STALLED")) Stalled(failed);
    database.Model.UndoLocalChanges();
}
Console.WriteLine($"{DateTime.UtcNow:HH:mm:ss} Calculating");
var calculated = Timed("Calculate", () => { database.Model.RequestRefresh(Tom.RefreshType.Calculate); database.Model.SaveChanges(); });
if (calculated == null) Console.WriteLine($"Calculated in {timer.Elapsed.TotalSeconds:0} s in all");
else
{
    failed.Add($"calculate: {calculated}");
    Console.WriteLine($"Calculate failed: {calculated}");
    if (calculated.StartsWith("STALLED")) Stalled(failed);
}
try { trace?.Stop(); } catch { }
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
