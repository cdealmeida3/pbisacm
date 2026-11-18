// The hash of the lifecycle review's draw (D306): FNV-1a of 32 bits over the characters of `text`, from the hash `start`
// (2166136261 for a new text), so the hash of a fixed beginning is worked out once and each CI key goes on from it.
// The same as fnvHash in tools/powerbi/review.ts. Every step stays below 2^53, so it is exact in Power Query's numbers:
// h × 16777619 mod 2^32 = ((h mod 256) × 2^24 + h × 403) mod 2^32.
(start as number, text as text) as number =>
    List.Accumulate(Text.ToList(text), start, (hash, character) =>
        let mixed = Number.BitwiseXor(hash, Character.ToNumber(character)) in
        Number.Mod(Number.Mod(mixed, 256) * 16777216 + mixed * 403, 4294967296))
