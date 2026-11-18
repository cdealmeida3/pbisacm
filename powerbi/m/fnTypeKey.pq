// A relationship type as it is compared: without any space, lower case ("Provided By::Provides" = "Provided by::Provides";
// relationship-detectors.ts, sameType).
(name as text) as text =>
    Text.Lower(Text.Remove(name, List.Transform({9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279}, Character.FromNumber)), "en-US")
