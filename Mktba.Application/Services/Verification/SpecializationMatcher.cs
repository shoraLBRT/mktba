namespace Mktba.Application.Services.Verification;

/// <summary>
/// Matches the free-text specialization of a scholar's application to articles (V-07, #123): the
/// specialization's words are compared with the words of an article's title, its tags and the titles
/// of the sections above it.
/// </summary>
/// <remarks>
/// Default chosen by the agent, open for the owner in #123: there is no taxonomy of specializations,
/// so the match is deliberately crude and only orders the queue, it never hides an article. Words
/// shorter than <see cref="MinWordLength"/> letters and generic words (<see cref="StopStems"/>: «ислам»,
/// «наука», «право»…) are ignored; two words match when they share a beginning of at least
/// <see cref="MinCommonPrefix"/> letters, or one is a beginning of the other when it is shorter —
/// a cheap stand-in for stemming («хадисоведение» matches «хадисы», «фикх» matches «фикха»).
/// Case and «ё» are ignored.
/// </remarks>
public static class SpecializationMatcher
{
    /// <summary>Shorter words are ignored.</summary>
    public const int MinWordLength = 4;

    /// <summary>How many first letters two longer words must share to match.</summary>
    public const int MinCommonPrefix = 5;

    /// <summary>Beginnings of words too generic to say anything about an article.</summary>
    private static readonly string[] StopStems =
    [
        "ислам", "мусульман", "наук", "научн", "прав", "основ", "теолог", "богослов", "религи", "знани",
        "изучен", "специал", "кафедр", "факульт", "магистр", "бакалавр", "доктор", "кандидат", "шариат",
        "islam", "muslim", "studies", "science", "theolog", "relig", "sharia", "law",
    ];

    /// <summary>The meaningful words of a specialization, in their order, without repeats.</summary>
    public static IReadOnlyList<string> Keywords(string? specialization) =>
        Words(specialization).Where(word => !StopStems.Any(word.StartsWith)).Distinct().ToList();

    /// <summary>Whether any keyword matches a word of any of the texts.</summary>
    public static bool Matches(IReadOnlyList<string> keywords, IEnumerable<string?> texts)
    {
        if (keywords.Count == 0)
        {
            return false;
        }

        foreach (var text in texts)
        {
            foreach (var word in Words(text))
            {
                if (keywords.Any(keyword => Same(keyword, word)))
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static bool Same(string left, string right)
    {
        var common = 0;
        var length = Math.Min(left.Length, right.Length);
        while (common < length && left[common] == right[common])
        {
            common++;
        }

        return common >= Math.Min(MinCommonPrefix, length);
    }

    private static IEnumerable<string> Words(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            yield break;
        }

        var start = -1;
        var normalized = text.ToLowerInvariant().Replace('ё', 'е');
        for (var index = 0; index <= normalized.Length; index++)
        {
            var letter = index < normalized.Length && char.IsLetterOrDigit(normalized[index]);
            if (letter && start < 0)
            {
                start = index;
            }
            else if (!letter && start >= 0)
            {
                if (index - start >= MinWordLength)
                {
                    yield return normalized[start..index];
                }

                start = -1;
            }
        }
    }
}
