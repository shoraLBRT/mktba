namespace Mktba.Application.DTOs
{
    /// <summary>A run of text in a search result: plain, or a word that matched the query.</summary>
    /// <param name="Text">Plain text, never markup: render it as text.</param>
    /// <param name="Match">True when this run is a matched word, to be highlighted.</param>
    public record SearchTextSegmentDto(string Text, bool Match);

    /// <summary>One article found by the search (R-10, #46).</summary>
    /// <param name="Id">Article id.</param>
    /// <param name="Slug">URL segment of the article: the reader's link is <c>/{slug}</c>.</param>
    /// <param name="Title">The article title, split into plain and matched runs.</param>
    /// <param name="Summary">The article's summary split the same way, or null when it has none.</param>
    /// <param name="Snippet">
    /// Fragments of the opinion text that matched best, as plain text (Markdown removed), fragments
    /// separated by « … »; null when the match is only in the title, summary or tags.
    /// </param>
    /// <param name="ParagraphId">The paragraph <paramref name="Snippet"/> is taken from; null without a snippet.</param>
    /// <param name="IsVerified">True when the article counts as verified by scholars (V-08, #124: <c>VerifiedArticles</c>).</param>
    public record SearchResultDto(
        int Id,
        string Slug,
        List<SearchTextSegmentDto> Title,
        List<SearchTextSegmentDto>? Summary,
        List<SearchTextSegmentDto>? Snippet,
        int? ParagraphId,
        bool IsVerified);

    /// <summary>One page of search results (R-10, #46), best match first.</summary>
    /// <param name="Query">The query as searched: trimmed, with whitespace collapsed.</param>
    /// <param name="Total">The number of matching articles on all pages.</param>
    /// <param name="Page">The page returned, from 1.</param>
    /// <param name="PageSize">The page size used.</param>
    /// <param name="Items">The articles of this page; empty when nothing matched or the page is past the end.</param>
    public record SearchResultsDto(string Query, int Total, int Page, int PageSize, List<SearchResultDto> Items);
}
