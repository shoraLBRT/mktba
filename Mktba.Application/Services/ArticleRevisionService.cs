using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services
{
    /// <summary>
    /// An article's revision history: list, read, compare and roll back. Revisions are written by
    /// <see cref="ArticleContentService"/> on every content save and are never changed. Who may open
    /// an article's history is decided by the endpoint; the saving users' emails go only to a viewer
    /// who <see cref="ArticleViewer.EditsAnyArticle"/> (an admin), the display names to everyone.
    /// </summary>
    public class ArticleRevisionService
    {
        private readonly ArticleRepository _articleRepo;
        private readonly ArticleContentService _content;

        public ArticleRevisionService(ArticleRepository articleRepo, ArticleContentService content)
        {
            _articleRepo = articleRepo;
            _content = content;
        }

        /// <summary>The article's revisions, newest first.</summary>
        /// <exception cref="NotFoundException">No such article.</exception>
        public async Task<List<ArticleRevisionSummaryDto>> ListAsync(int articleId, ArticleViewer viewer)
        {
            var article = await RequireArticleAsync(articleId);
            var revisions = await _articleRepo.GetRevisionsAsync(articleId);
            return revisions.Select(r => Summarize(r, article.PublishedRevisionId, viewer)).ToList();
        }

        /// <exception cref="NotFoundException">No such article or revision.</exception>
        public async Task<ArticleRevisionDto> GetAsync(int articleId, int number, ArticleViewer viewer)
        {
            var article = await RequireArticleAsync(articleId);
            return await LoadAsync(article, number, viewer);
        }

        /// <summary>Both revisions with their snapshots; the client renders the difference.</summary>
        /// <exception cref="NotFoundException">No such article or revision.</exception>
        public async Task<ArticleRevisionComparisonDto> CompareAsync(int articleId, int fromNumber, int toNumber, ArticleViewer viewer)
        {
            var article = await RequireArticleAsync(articleId);
            return new ArticleRevisionComparisonDto(
                await LoadAsync(article, fromNumber, viewer), await LoadAsync(article, toNumber, viewer));
        }

        /// <summary>
        /// Rolls the working copy back to revision <paramref name="number"/> by saving its snapshot as
        /// a new revision. Every existing revision, including the ones after <paramref name="number"/>, stays.
        /// Citations are re-linked to the directory of sources as it is now: an entry edited since shows
        /// its current text, and a citation whose entry was deleted since is left out.
        /// </summary>
        /// <returns>The new revision.</returns>
        /// <exception cref="NotFoundException">No such article or revision.</exception>
        /// <exception cref="ValidationException">
        /// The snapshot no longer fits the current data, e.g. its slug now belongs to another
        /// article or a related article was deleted.
        /// </exception>
        public async Task<ArticleRevisionSummaryDto> RestoreAsync(
            int articleId, int number, string? comment, int? authorId, ArticleViewer viewer)
        {
            var article = await RequireArticleAsync(articleId);
            var revision = await _articleRepo.GetRevisionAsync(articleId, number)
                ?? throw new NotFoundException(AppErrors.RevisionNotFound(number));

            var snapshot = ArticleSnapshots.Deserialize(revision.Snapshot);
            var editComment = string.IsNullOrWhiteSpace(comment) ? $"Откат к ревизии {number}" : comment;
            var (success, error) = await _content.UpdateContentAsync(
                articleId, ArticleSnapshots.ToUpdate(articleId, snapshot, editComment), authorId, dropMissingSources: true);
            if (!success)
            {
                throw new ValidationException(error!);
            }

            var latestNumber = await _articleRepo.GetLatestRevisionNumberAsync(articleId);
            var latest = await _articleRepo.GetRevisionAsync(articleId, latestNumber)
                ?? throw new NotFoundException(AppErrors.RevisionNotFound(latestNumber));
            return Summarize(latest, article.PublishedRevisionId, viewer);
        }

        private async Task<Article> RequireArticleAsync(int articleId)
            => await _articleRepo.GetByIdAsync(articleId) ?? throw new NotFoundException(AppErrors.ArticleNotFound);

        private async Task<ArticleRevisionDto> LoadAsync(Article article, int number, ArticleViewer viewer)
        {
            var revision = await _articleRepo.GetRevisionAsync(article.Id, number)
                ?? throw new NotFoundException(AppErrors.RevisionNotFound(number));
            return new ArticleRevisionDto(
                Summarize(revision, article.PublishedRevisionId, viewer),
                ArticleSnapshots.Deserialize(revision.Snapshot));
        }

        private static ArticleRevisionSummaryDto Summarize(
            ArticleRevision revision, int? publishedRevisionId, ArticleViewer viewer)
            => new(
                revision.Id,
                revision.Number,
                revision.CreatedAt,
                revision.AuthorId,
                revision.Author?.DisplayName,
                viewer.EditsAnyArticle ? revision.Author?.Email : null,
                revision.Comment,
                revision.Id == publishedRevisionId);
    }
}
