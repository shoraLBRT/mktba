using System.Text;
using System.Text.RegularExpressions;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Analytics;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services
{
    /// <summary>Full-text search over the articles a reader can open (R-10, #46).</summary>
    public partial class ArticleSearchService : ISearchResultCounter
    {
        public const int MinQueryLength = 2;
        public const int MaxQueryLength = 200;
        public const int DefaultPageSize = 10;
        public const int MaxPageSize = 50;

        /// <summary>The last page that can be asked for: deeper paging is cut off rather than scanned.</summary>
        public const int MaxPage = 100;

        private readonly ArticleSearchRepository _searchRepository;

        public ArticleSearchService(ArticleSearchRepository searchRepository)
        {
            _searchRepository = searchRepository;
        }

        /// <summary>
        /// Searches the title, summary, tags and opinion texts of one language's articles with Russian
        /// morphology; an article matches when it holds every word of the query. Only articles an
        /// anonymous reader can reach are searched — Published, with every ancestor Published — so the
        /// results are the same for every caller.
        /// </summary>
        /// <param name="query">The reader's words; trimmed, <see cref="MinQueryLength"/> to <see cref="MaxQueryLength"/> characters.</param>
        /// <param name="requestedLocale">Language of the articles; null or blank means <see cref="Locales.Default"/>.</param>
        /// <param name="page">Page from 1; kept within 1 to <see cref="MaxPage"/>.</param>
        /// <param name="pageSize">Results per page; kept within 1 to <see cref="MaxPageSize"/>.</param>
        /// <param name="verifiedOnly">Only the articles that count as verified by scholars (V-08, #124).</param>
        /// <exception cref="ValidationException">search_query_too_short, search_query_too_long, locale_unsupported.</exception>
        public async Task<SearchResultsDto> SearchAsync(
            string? query, string? requestedLocale, int page, int pageSize, bool verifiedOnly = false,
            CancellationToken cancellationToken = default)
        {
            var text = NormalizeQuery(query);
            if (text.Length < MinQueryLength)
            {
                throw new ValidationException(AppErrors.SearchQueryTooShort(MinQueryLength));
            }
            if (text.Length > MaxQueryLength)
            {
                throw new ValidationException(AppErrors.SearchQueryTooLong(MaxQueryLength));
            }
            var locale = Locales.Normalize(requestedLocale)
                ?? throw new ValidationException(AppErrors.LocaleUnsupported(requestedLocale!));
            var currentPage = Math.Clamp(page, 1, MaxPage);
            var take = Math.Clamp(pageSize, 1, MaxPageSize);

            var rows = await _searchRepository.SearchAsync(
                FoldYo(text), text, locale, (currentPage - 1) * take, take, verifiedOnly, cancellationToken);

            var items = rows
                .Where(row => row.Id is not null)
                .Select(row => new SearchResultDto(
                    row.Id!.Value,
                    row.Slug!,
                    ParseSegments(row.Title!),
                    row.Summary is null ? null : ParseSegments(row.Summary),
                    row.Snippet is null ? null : ParseSegments(row.Snippet),
                    row.Snippet is null ? null : row.ParagraphId,
                    row.IsVerified))
                .ToList();

            return new SearchResultsDto(text, rows.Count == 0 ? 0 : rows[0].Total, currentPage, take, items);
        }

        /// <summary>
        /// How many articles <see cref="SearchAsync"/> finds for <paramref name="query"/> in the default
        /// language, as an anonymous reader of the results page sees it (N-06, #100).
        /// </summary>
        /// <exception cref="ValidationException">search_query_too_short, search_query_too_long.</exception>
        public async Task<int> CountAsync(string query, CancellationToken cancellationToken = default)
            => (await SearchAsync(query, null, 1, 1, cancellationToken: cancellationToken)).Total;

        /// <summary>Trims the query, collapses whitespace and drops the characters that mark matches.</summary>
        public static string NormalizeQuery(string? query)
            => WhitespaceRegex().Replace(
                (query ?? string.Empty)
                    .Replace(ArticleSearchRepository.MatchStart, ' ')
                    .Replace(ArticleSearchRepository.MatchEnd, ' '),
                " ").Trim();

        /// <summary>
        /// Splits text marked with <see cref="ArticleSearchRepository.MatchStart"/> /
        /// <see cref="ArticleSearchRepository.MatchEnd"/> into plain and matched runs. The markers never
        /// reach the result, whatever their order.
        /// </summary>
        public static List<SearchTextSegmentDto> ParseSegments(string marked)
        {
            var segments = new List<SearchTextSegmentDto>();
            var current = new StringBuilder();
            var inMatch = false;

            void Flush()
            {
                if (current.Length == 0) return;
                if (segments.Count > 0 && segments[^1].Match == inMatch)
                {
                    segments[^1] = segments[^1] with { Text = segments[^1].Text + current };
                }
                else
                {
                    segments.Add(new SearchTextSegmentDto(current.ToString(), inMatch));
                }
                current.Clear();
            }

            foreach (var character in marked)
            {
                if (character is ArticleSearchRepository.MatchStart or ArticleSearchRepository.MatchEnd)
                {
                    Flush();
                    inMatch = character == ArticleSearchRepository.MatchStart;
                    continue;
                }
                current.Append(character);
            }
            Flush();
            return segments;
        }

        private static string FoldYo(string text) => text.Replace('ё', 'е').Replace('Ё', 'Е');

        [GeneratedRegex(@"\s+")]
        private static partial Regex WhitespaceRegex();
    }
}
