using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;
using Mktba.Infrastructure.UnitOfWork;

namespace Mktba.Application.Services
{
    /// <summary>
    /// Autosaved drafts (E-02, #75; maintainer decision B): each user reads and writes only their
    /// own draft of an article (<c>articleId</c> null = the new-article page). Whether the user may
    /// edit the article is checked by the caller (the API's article access filter). A draft not
    /// written for <see cref="Lifetime"/> counts as gone and is deleted by <see cref="DeleteExpiredAsync"/>.
    /// </summary>
    public class ArticleDraftService
    {
        /// <summary>Longest snapshot, in characters of its JSON.</summary>
        public const int SnapshotMaxLength = 1_000_000;

        /// <summary>How long an untouched draft is kept.</summary>
        public static readonly TimeSpan Lifetime = TimeSpan.FromDays(30);

        private readonly ArticleDraftRepository _drafts;
        private readonly IUnitOfWork _uow;
        private readonly TimeProvider _clock;

        public ArticleDraftService(ArticleDraftRepository drafts, IUnitOfWork uow, TimeProvider clock)
        {
            _drafts = drafts;
            _uow = uow;
            _clock = clock;
        }

        /// <summary>The user's draft, or null when there is none or it has expired.</summary>
        public async Task<ArticleDraftDto?> GetAsync(int userId, int? articleId, CancellationToken cancellationToken = default)
        {
            var draft = await _drafts.FindAsync(userId, articleId, cancellationToken);
            return draft is null || IsExpired(draft) ? null : ToDto(draft);
        }

        /// <summary>Writes the user's draft, replacing the one there was.</summary>
        /// <exception cref="ValidationException"><c>article_draft_snapshot_invalid</c> or <c>article_draft_too_large</c>.</exception>
        public async Task<ArticleDraftDto> SaveAsync(int userId, int? articleId, ArticleDraftSaveDto dto, CancellationToken cancellationToken = default)
        {
            if (dto.Snapshot.ValueKind != JsonValueKind.Object)
            {
                throw new ValidationException(AppErrors.ArticleDraftSnapshotInvalid);
            }

            var snapshot = dto.Snapshot.GetRawText();
            if (snapshot.Length > SnapshotMaxLength)
            {
                throw new ValidationException(AppErrors.ArticleDraftTooLarge(SnapshotMaxLength));
            }

            var baseUpdatedAt = articleId is null ? null : AsUtc(dto.BaseUpdatedAt);
            return await WriteAsync(userId, articleId, snapshot, baseUpdatedAt, isRetry: false, cancellationToken);
        }

        /// <summary>Deletes the user's draft; nothing happens when there is none.</summary>
        public async Task DeleteAsync(int userId, int? articleId, CancellationToken cancellationToken = default)
        {
            await _drafts.RemoveAsync(userId, articleId, cancellationToken);
            await _uow.SaveChangesAsync();
        }

        /// <summary>Deletes every draft not written for <see cref="Lifetime"/>; returns how many.</summary>
        public async Task<int> DeleteExpiredAsync(CancellationToken cancellationToken = default)
        {
            var removed = await _drafts.RemoveUpdatedBeforeAsync(Now() - Lifetime, cancellationToken);
            if (removed > 0)
            {
                await _uow.SaveChangesAsync();
            }

            return removed;
        }

        private async Task<ArticleDraftDto> WriteAsync(
            int userId, int? articleId, string snapshot, DateTime? baseUpdatedAt, bool isRetry, CancellationToken cancellationToken)
        {
            var draft = await _drafts.FindAsync(userId, articleId, cancellationToken);
            var isNew = draft is null;
            if (draft is null)
            {
                draft = new ArticleDraft { UserId = userId, ArticleId = articleId };
                await _drafts.AddAsync(draft);
            }

            draft.Snapshot = snapshot;
            draft.BaseUpdatedAt = baseUpdatedAt;
            draft.UpdatedAt = Now();
            try
            {
                await _uow.SaveChangesAsync();
            }
            catch (DbUpdateException) when (isNew && !isRetry)
            {
                // Another request of the same user (a second tab) inserted the draft first: write over it.
                _drafts.Detach(draft);
                return await WriteAsync(userId, articleId, snapshot, baseUpdatedAt, isRetry: true, cancellationToken);
            }

            return ToDto(draft);
        }

        private bool IsExpired(ArticleDraft draft) => draft.UpdatedAt < Now() - Lifetime;

        private DateTime Now() => _clock.GetUtcNow().UtcDateTime;

        private static DateTime? AsUtc(DateTime? value) => value switch
        {
            null => null,
            { Kind: DateTimeKind.Utc } utc => utc,
            { Kind: DateTimeKind.Local } local => local.ToUniversalTime(),
            { } unspecified => DateTime.SpecifyKind(unspecified, DateTimeKind.Utc),
        };

        private static ArticleDraftDto ToDto(ArticleDraft draft)
        {
            using var document = JsonDocument.Parse(draft.Snapshot);
            return new ArticleDraftDto(document.RootElement.Clone(), draft.BaseUpdatedAt, draft.UpdatedAt);
        }
    }
}
