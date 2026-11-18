// The 128 ASCII characters, as a list made once: Text.Remove(text, AsciiCharacters) = "" when a text is ASCII only.
List.Buffer(List.Transform(List.Numbers(0, 128), Character.FromNumber))
