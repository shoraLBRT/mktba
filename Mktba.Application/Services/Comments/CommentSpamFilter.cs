using System.Text.RegularExpressions;
using Mktba.Application.Configuration;

namespace Mktba.Application.Services.Comments;

/// <summary>
/// The text checks of the spam filter (C-02, #128; defaults chosen by the agent, open for the owner in
/// #128): too many links (<see cref="CommentOptions.MaxLinks"/>) or a blocked word or phrase
/// (<see cref="CommentOptions.BlockedWords"/>). A caught comment is not refused: it is held for a
/// moderator. The repeated-text check needs the table, so it is in <see cref="ArticleCommentService"/>.
/// </summary>
public static partial class CommentSpamFilter
{
    /// <summary>Whether the text trips a check.</summary>
    public static bool IsSpam(string body, CommentOptions options) =>
        (options.MaxLinks >= 0 && CountLinks(body) > options.MaxLinks)
        || options.BlockedWords.Any(word => !string.IsNullOrWhiteSpace(word)
            && body.Contains(word.Trim(), StringComparison.OrdinalIgnoreCase));

    /// <summary>Addresses in the text: every <c>http://</c>, <c>https://</c>, and a <c>www.</c> not right after one.</summary>
    public static int CountLinks(string body) => LinkPattern().Count(body);

    [GeneratedRegex(@"https?://|(?<!//)www\.",RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex LinkPattern();
}
