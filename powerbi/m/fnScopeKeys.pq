// The CIs of a check's scope as a record with one field per CI key, to look a key up fast (fnShownOn).
(inScope as list) as record => Record.FromList(List.Repeat({true}, List.Count(inScope)), List.Transform(inScope, (ci) => ci[Key]))
