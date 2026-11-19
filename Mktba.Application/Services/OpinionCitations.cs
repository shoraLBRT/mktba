using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services
{
    /// <summary>The citations of opinions (M-07, #71): the rules every write path shares, and the mapping.</summary>
    internal static class OpinionCitations
    {
        /// <summary>
        /// Checks the citations of the incoming opinions: locators within the limit, and every source
        /// id in the directory. A broken citation is rejected, not dropped.
        /// </summary>
        /// <returns>source_locator_too_long or source_not_found, otherwise null.</returns>
        public static async Task<AppError?> CheckAsync(
            IEnumerable<IEnumerable<OpinionSourceDto>?> opinionsCitations, ParagraphRepository repository)
        {
            var citations = opinionsCitations.SelectMany(c => c ?? []).ToList();
            if (citations.Count == 0) return null;

            if (citations.Any(c => c.Locator is not null && c.Locator.Trim().Length > MktbaDbContext.SourceLocatorMaxLength))
            {
                return AppErrors.SourceLocatorTooLong(MktbaDbContext.SourceLocatorMaxLength);
            }

            var ids = citations.Select(c => c.SourceId).Distinct().ToList();
            var existing = await repository.GetExistingSourceIdsAsync(ids);
            var missing = ids.Where(id => !existing.Contains(id)).ToList();
            return missing.Count > 0 ? AppErrors.SourceNotFound(missing[0]) : null;
        }

        /// <summary>Adds the citations to a new opinion, numbered in list order.</summary>
        public static void AddTo(Opinion opinion, IEnumerable<OpinionSourceDto>? citations)
        {
            var order = 0;
            foreach (var citation in citations ?? [])
            {
                opinion.Sources.Add(new OpinionSource
                {
                    SourceId = citation.SourceId,
                    Order = ++order,
                    Locator = string.IsNullOrWhiteSpace(citation.Locator) ? null : citation.Locator.Trim(),
                });
            }
        }

        public static List<OpinionSourceDto> ToDto(Opinion opinion)
            => opinion.Sources
                .OrderBy(c => c.Order)
                .ThenBy(c => c.Id)
                .Select(c => new OpinionSourceDto(c.SourceId, c.Locator))
                .ToList();
    }
}
