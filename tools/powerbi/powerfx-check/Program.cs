// Reads the Power App source (build B6): each .pa.yaml file as JSON (YamlDotNet), so tools/powerbi/app-lint.ts can check it
// against Microsoft's schema, and every Power Fx formula parsed with Microsoft's Power Fx library, as Power Apps Studio
// parses it. A formula is a value of a Properties map that starts with "="; the property Formulas of the App, and a .fx
// file, hold named formulas ("Name = expression;"). Prints one JSON document; exits 2 on a file it cannot read.
//   dotnet run --project tools/powerbi/powerfx-check -- <file.pa.yaml | file.fx> ...
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.PowerFx;
using Microsoft.PowerFx.Syntax;
using YamlDotNet.Serialization;

if (args.Length == 0) { Console.Error.WriteLine("usage: PowerFxCheck <file.pa.yaml | file.fx> ..."); return 2; }
var engine = new Engine(new PowerFxConfig());
var options = new ParserOptions { AllowsSideEffects = true };
var files = new JsonArray();
var formulas = new JsonArray();

void Formula(string file, string where, string text)
{
    var result = engine.Parse(text, options);
    var calls = new JsonArray();
    if (result.Root != null) result.Root.Accept(new Calls(calls));
    formulas.Add(new JsonObject
    {
        ["file"] = file, ["where"] = where, ["text"] = text,
        ["errors"] = new JsonArray(result.Errors.Select(error => (JsonNode)JsonValue.Create(error.Message)!).ToArray()),
        ["calls"] = calls
    });
}

// Named formulas: "A = x; B = y;" split at the semicolons outside strings, brackets and comments.
void Named(string file, string where, string text)
{
    foreach (var (name, body) in SplitNamed(text))
    {
        if (name == null) { formulas.Add(new JsonObject { ["file"] = file, ["where"] = where, ["text"] = body, ["errors"] = new JsonArray(JsonValue.Create("not a named formula (Name = expression)")!), ["calls"] = new JsonArray() }); continue; }
        Formula(file, $"{where}/{name}", body);
    }
}

JsonNode? ToJson(object? value) => value switch
{
    null => null,
    IDictionary<object, object> map => new JsonObject(map.Select(pair => new KeyValuePair<string, JsonNode?>(pair.Key.ToString()!, ToJson(pair.Value)))),
    IList<object> list => new JsonArray(list.Select(ToJson).ToArray()),
    _ => JsonValue.Create(value.ToString())
};

void Walk(string file, JsonNode? node, string path, bool inProperties)
{
    if (node is JsonObject map)
    {
        foreach (var (key, child) in map)
        {
            if (inProperties && child is JsonValue scalar && scalar.TryGetValue<string>(out var text) && text.StartsWith('='))
            {
                if (key == "Formulas") Named(file, $"{path}/{key}", text[1..]);
                else Formula(file, $"{path}/{key}", text[1..]);
            }
            else Walk(file, child, $"{path}/{key}", key == "Properties");
        }
    }
    else if (node is JsonArray list) for (var at = 0; at < list.Count; at++) Walk(file, list[at], $"{path}/{at}", false);
}

foreach (var file in args)
{
    string text;
    try { text = File.ReadAllText(file, Encoding.UTF8); }
    catch (Exception error) { Console.Error.WriteLine($"{file}: {error.Message}"); return 2; }
    if (file.EndsWith(".fx", StringComparison.OrdinalIgnoreCase)) { Named(file, "", text); continue; }
    JsonNode? json;
    try { json = ToJson(new DeserializerBuilder().Build().Deserialize<object>(text)); }
    catch (Exception error)
    {
        files.Add(new JsonObject { ["file"] = file, ["error"] = error.Message });
        continue;
    }
    files.Add(new JsonObject { ["file"] = file, ["json"] = json });
    Walk(file, json, "", false);
}

Console.WriteLine(new JsonObject { ["files"] = files, ["formulas"] = formulas }.ToJsonString(new JsonSerializerOptions { WriteIndented = false }));
return 0;

static IEnumerable<(string? name, string body)> SplitNamed(string text)
{
    var parts = new List<string>();
    var current = new StringBuilder();
    var depth = 0;
    for (var at = 0; at < text.Length; at++)
    {
        var c = text[at];
        if (c == '"') { var end = at + 1; while (end < text.Length && !(text[end] == '"' && (end + 1 >= text.Length || text[end + 1] != '"'))) end += text[end] == '"' ? 2 : 1; current.Append(text, at, Math.Min(end + 1, text.Length) - at); at = end; continue; }
        if (c == '\'') { var end = text.IndexOf('\'', at + 1); if (end < 0) end = text.Length - 1; current.Append(text, at, end - at + 1); at = end; continue; }
        if (c == '/' && at + 1 < text.Length && text[at + 1] == '/') { var end = text.IndexOf('\n', at); if (end < 0) end = text.Length; at = end - 1; continue; }
        if (c == '/' && at + 1 < text.Length && text[at + 1] == '*') { var end = text.IndexOf("*/", at + 2, StringComparison.Ordinal); at = end < 0 ? text.Length : end + 1; continue; }
        if (c == '(' || c == '{' || c == '[') depth++;
        if (c == ')' || c == '}' || c == ']') depth--;
        if (c == ';' && depth == 0) { parts.Add(current.ToString()); current.Clear(); continue; }
        current.Append(c);
    }
    if (current.ToString().Trim().Length > 0) parts.Add(current.ToString());
    foreach (var part in parts)
    {
        var trimmed = part.Trim();
        if (trimmed.Length == 0) continue;
        var equals = trimmed.IndexOf('=');
        var name = equals > 0 ? trimmed[..equals].Trim() : "";
        if (equals <= 0 || name.Length == 0 || !name.All(ch => char.IsLetterOrDigit(ch) || ch == '_')) { yield return (null, trimmed); continue; }
        yield return (name, trimmed[(equals + 1)..].Trim());
    }
}

/// Every function call of a formula: its name, the data source it names first, the function of its second argument and
/// the field names of the records it is given (Patch('SACM Journal', Defaults('SACM Journal'), { Title: … })).
sealed class Calls(JsonArray calls) : IdentityTexlVisitor
{
    public override bool PreVisit(CallNode node)
    {
        var args = node.Args.ChildNodes;
        var fields = new JsonArray();
        foreach (var arg in args)
            if (arg is RecordNode record) foreach (var id in record.Ids) fields.Add(JsonValue.Create(id.Name.Value));
        calls.Add(new JsonObject
        {
            ["name"] = node.Head.Name.Value,
            ["source"] = args.Count > 0 && args[0] is FirstNameNode first ? first.Ident.Name.Value : null,
            ["second"] = args.Count > 1 && args[1] is CallNode second ? second.Head.Name.Value : null,
            ["fields"] = fields
        });
        return true;
    }
}
