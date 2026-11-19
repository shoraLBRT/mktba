using Mktba.Application.Exceptions;

namespace Mktba.Application.Services
{
    /// <summary>Domain rules for a paragraph's opinions that every write path enforces.</summary>
    internal static class ParagraphRules
    {
        /// <summary>
        /// A plain paragraph — one with a single opinion — is common to all schools: readers of every
        /// mazhab see that opinion, so it carries no school links. School links belong only to a
        /// versioned paragraph (two or more opinions). Sending school ids for a plain paragraph is
        /// rejected rather than dropped, so a client never believes it saved them.
        /// </summary>
        /// <param name="opinionSchoolIds">The school ids of each incoming opinion of one paragraph.</param>
        /// <returns><see cref="AppErrors.ParagraphPlainSchoolsNotAllowed"/> when the rule is broken, otherwise null.</returns>
        public static AppError? CheckPlainParagraphSchools(IReadOnlyCollection<IReadOnlyCollection<int>?> opinionSchoolIds)
        {
            return opinionSchoolIds.Count == 1 && opinionSchoolIds.First() is { Count: > 0 }
                ? AppErrors.ParagraphPlainSchoolsNotAllowed
                : null;
        }
    }
}
