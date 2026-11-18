// Reads the TMDL folder of the Power BI model with Microsoft's library (TmdlSerializer), as Power BI Desktop does, and
// validates the model. Prints one line per table; exits 1 on the first error.
//   dotnet run --project tools/powerbi/tmdl-check -- <definition folder>
using Microsoft.AnalysisServices.Tabular;

if (args.Length != 1) { Console.Error.WriteLine("usage: TmdlCheck <definition folder>"); return 2; }
try
{
    var database = TmdlSerializer.DeserializeDatabaseFromFolder(args[0]);
    var model = database.Model;
    var result = model.Validate();
    foreach (var error in result.Errors) Console.Error.WriteLine("TMDL validation: " + error.Message);
    if (result.ContainsErrors) return 1;
    foreach (var expression in model.Expressions)
        if (expression.QueryGroup == null) { Console.Error.WriteLine($"TMDL: the query {expression.Name} has no query group"); return 1; }
    Console.WriteLine($"TMDL ok: {model.Tables.Count} tables, {model.Expressions.Count} queries, {model.Relationships.Count} relationships, compatibility level {database.CompatibilityLevel}");
    foreach (var table in model.Tables)
        Console.WriteLine($"  {table.Name}: {table.Columns.Count} columns, {table.Measures.Count} measures");
    return 0;
}
catch (Exception error)
{
    Console.Error.WriteLine("TMDL error: " + error.Message);
    return 1;
}
