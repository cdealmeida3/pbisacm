// The stages of a case of the mapping backlog for a class (src/core/mapping/backlog.ts, stagesFor; D201): the steps of
// classStages in order (every stage when the class has none), each [Id, Label] with the word of stageWords for the class.
// `config` is the reference file mapping-backlog (null: no stages).
(config as nullable record, cls as text) as list =>
    if config = null then {}
    else
        let
            ids = Record.FieldOrDefault(config[classStages], cls, null),
            words = Record.FieldOrDefault(Record.FieldOrDefault(config, "stageWords", []), cls, []),
            list = if ids = null then config[stages] else List.RemoveNulls(List.Transform(ids, (id) => List.First(List.Select(config[stages], (stage) => stage[id] = id), null)))
        in
            List.Transform(list, (stage) => [Id = stage[id], Label = Record.FieldOrDefault(words, stage[id], stage[label])])
