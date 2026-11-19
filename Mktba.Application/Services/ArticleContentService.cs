using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;
using Mktba.Infrastructure.UnitOfWork;

namespace Mktba.Application.Services
{
    public class ArticleContentService
    {
        private readonly ArticleRepository _articleRepo;
        private readonly ParagraphRepository _paragraphRepo;
        private readonly IUnitOfWork _uow;
        private readonly ArticleSlugAssigner _slugs;
        private readonly TimeProvider _clock;

        public ArticleContentService(
            ArticleRepository articleRepo,
            ParagraphRepository paragraphRepo,
            IUnitOfWork uow,
            TimeProvider clock)
        {
            _clock = clock;
            _articleRepo = articleRepo;
            _paragraphRepo = paragraphRepo;
            _uow = uow;
            _slugs = new ArticleSlugAssigner(articleRepo);
        }

        /// <summary>
        /// The article with its content. Without <paramref name="includeUnpublished"/> (anonymous
        /// readers) a non-Published article counts as missing and related links to non-Published
        /// articles are left out.
        /// </summary>
        /// <exception cref="NotFoundException">No such article, or it is not visible.</exception>
        public async Task<ArticleContentDto> GetContentByArticleIdAsync(int articleId, bool includeUnpublished)
        {
            var article = await _articleRepo.GetByIdWithContentAsync(articleId);
            if (article is null || !ArticleVisibility.IsVisible(article.Status, includeUnpublished))
            {
                throw new NotFoundException(AppErrors.ArticleNotFound);
            }

            return BuildArticleContentDto(article, includeUnpublished);
        }

        /// <summary>
        /// Looks an article up by slug within one locale, ignoring case. A current slug returns the
        /// content; an old slug returns the current one to redirect to.
        /// </summary>
        /// <param name="requestedLocale">The article's locale; null or blank means <see cref="Locales.Default"/>.</param>
        /// <exception cref="ValidationException"><c>locale_unsupported</c>.</exception>
        /// <exception cref="NotFoundException">No visible article in the locale has or had this slug.</exception>
        public async Task<ArticleSlugLookup> GetContentBySlugAsync(string requestedSlug, bool includeUnpublished, string? requestedLocale = null)
        {
            var locale = Locales.Normalize(requestedLocale)
                ?? throw new ValidationException(AppErrors.LocaleUnsupported(requestedLocale!));
            var slug = requestedSlug.Trim().ToLowerInvariant();
            var articleId = await _articleRepo.FindIdBySlugAsync(locale, slug);
            if (articleId is not null)
            {
                return new ArticleSlugLookup(await GetContentByArticleIdAsync(articleId.Value, includeUnpublished), null);
            }

            var currentSlug = await _articleRepo.FindRedirectTargetSlugAsync(locale, slug, publishedOnly: !includeUnpublished);
            return currentSlug is not null
                ? new ArticleSlugLookup(null, currentSlug)
                : throw new NotFoundException(AppErrors.ArticleNotFound);
        }

        /// <param name="authorId">The creating user, recorded as the article's author.</param>
        public async Task<ArticleContentDto> CreateArticleWithContentAsync(ArticleContentCreateDto dto, int? authorId)
        {
            if (string.IsNullOrWhiteSpace(dto.Title))
            {
                throw new ValidationException(AppErrors.ArticleTitleRequired);
            }

            var incomingParagraphs = dto.Paragraphs ?? new List<ParagraphCreateDto>();
            var (valid, orderError) = ValidateOrder(incomingParagraphs);
            if (!valid)
            {
                throw new ValidationException(orderError!);
            }

            var schoolsError = CheckPlainParagraphSchools(incomingParagraphs.Select(p => p.Opinions.Select(o => o.SchoolIds).ToList()));
            if (schoolsError is not null)
            {
                throw new ValidationException(schoolsError);
            }

            var normalizedInfobox = NormalizeInfobox(dto.Infobox);
            var (infoboxValid, infoboxError) = ValidateInfobox(normalizedInfobox);
            if (!infoboxValid)
            {
                throw new ValidationException(infoboxError!);
            }

            if (CheckEditComment(dto.EditComment) is { } commentError)
            {
                throw new ValidationException(commentError);
            }

            var seo = ArticleSeo.Normalize(dto.Seo);
            if (ArticleSeo.Check(seo) is { } seoError)
            {
                throw new ValidationException(seoError);
            }

            var locale = Locales.Normalize(dto.Locale)
                ?? throw new ValidationException(AppErrors.LocaleUnsupported(dto.Locale!));
            var slug = await _slugs.ChooseAsync(dto.Slug, dto.Title, locale, articleId: null);

            try
            {
                await _uow.BeginTransactionAsync();

                var article = new Article
                {
                    Title = dto.Title,
                    Slug = slug,
                    Locale = locale,
                    ParentArticleId = dto.ParentArticleId,
                    Order = await _articleRepo.GetNextSiblingOrderAsync(dto.ParentArticleId),
                    InfoboxTitle = normalizedInfobox?.Title,
                    InfoboxSubtitle = normalizedInfobox?.Subtitle,
                    Summary = NormalizeOptionalText(dto.Summary),
                    Tags = SerializeTags(dto.Tags)
                };
                ArticleSeo.Apply(article, seo);
                ArticleTimestamps.StampCreated(article, authorId, _clock);

                await _articleRepo.AddAsync(article);
                await _uow.SaveChangesAsync();

                foreach (var incoming in incomingParagraphs)
                {
                    var paragraph = new Paragraph
                    {
                        ArticleId = article.Id,
                        Order = incoming.Order,
                    };

                    foreach (var opinionDto in incoming.Opinions)
                    {
                        var opinion = new Opinion
                        {
                            Content = opinionDto.Content,
                            IsDefault = opinionDto.IsDefault,
                        };

                        foreach (var schoolId in opinionDto.SchoolIds)
                        {
                            opinion.OpinionSchools.Add(new OpinionSchool { SchoolId = schoolId });
                        }

                        paragraph.Opinions.Add(opinion);
                    }

                    await _paragraphRepo.AddAsync(paragraph);
                }

                foreach (var incomingField in normalizedInfobox?.Fields ?? Enumerable.Empty<ArticleInfoboxFieldCreateDto>())
                {
                    article.InfoboxFields.Add(new ArticleInfoboxField
                    {
                        ArticleId = article.Id,
                        Order = incomingField.Order,
                        Key = incomingField.Key,
                        Label = incomingField.Label,
                        Value = incomingField.Value,
                    });
                }

                var (relatedLinksValid, relatedLinksError) = await ValidateRelatedLinksAsync(dto.RelatedLinks, article.Id);
                if (!relatedLinksValid)
                {
                    throw new ValidationException(relatedLinksError!);
                }

                foreach (var link in dto.RelatedLinks ?? Enumerable.Empty<ArticleRelatedLinkCreateDto>())
                {
                    article.RelatedLinks.Add(new ArticleRelatedLink
                    {
                        ArticleId = article.Id,
                        RelatedArticleId = link.RelatedArticleId,
                        Order = link.Order
                    });
                }

                await _uow.SaveChangesAsync();
                await WriteRevisionAsync(article.Id, authorId, dto.EditComment);
                await _uow.CommitAsync();

                var createdArticle = await _articleRepo.GetByIdWithContentAsync(article.Id)
                    ?? throw new NotFoundException(AppErrors.ArticleNotFound);

                return BuildArticleContentDto(createdArticle, includeUnpublished: true);
            }
            catch
            {
                await _uow.RollbackAsync();
                throw;
            }
        }

        /// <summary>
        /// Saves the working copy and, in the same transaction, a new revision with
        /// <paramref name="authorId"/> and the DTO's edit comment.
        /// </summary>
        /// <param name="authorId">The saving user, recorded on the revision.</param>
        public async Task<(bool Success, AppError? Error)> UpdateContentAsync(int articleId, ArticleContentDto dto, int? authorId)
        {
            if (!await ValidateArticleExistsAsync(articleId, dto.Id))
                return (false, articleId != dto.Id ? AppErrors.ArticleIdMismatch : AppErrors.ArticleNotFound);

            if (CheckEditComment(dto.EditComment) is { } commentError) return (false, commentError);

            var seo = ArticleSeo.Normalize(dto.Seo);
            if (ArticleSeo.Check(seo) is { } seoError) return (false, seoError);

            var incomingParagraphs = dto.Paragraphs ?? new List<ParagraphDto>();
            var (valid, orderError) = ValidateOrderDto(incomingParagraphs);
            if (!valid) return (false, orderError);

            var schoolsError = CheckPlainParagraphSchools(incomingParagraphs.Select(p => p.Opinions.Select(o => o.SchoolIds).ToList()));
            if (schoolsError is not null) return (false, schoolsError);

            var normalizedInfobox = NormalizeInfobox(dto.Infobox is null
                ? null
                : new ArticleInfoboxCreateDto(
                    dto.Infobox.Title,
                    dto.Infobox.Subtitle,
                    dto.Infobox.Fields.Select(f => new ArticleInfoboxFieldCreateDto(f.Order, f.Key, f.Label, f.Value)).ToList()));
            var (infoboxValid, infoboxError) = ValidateInfobox(normalizedInfobox);
            if (!infoboxValid) return (false, infoboxError);

            var existingParagraphs = (await _paragraphRepo.GetParagraphsByArticleAsync(articleId)).ToList();
            var existingIdsSet = existingParagraphs.Select(p => p.Id).ToHashSet();
            if (!ValidateIncomingIds(incomingParagraphs, existingIdsSet))
                return (false, AppErrors.ArticleParagraphForeign);

            var incomingRelatedLinks = dto.RelatedLinks?
                .Select(l => new ArticleRelatedLinkCreateDto(l.RelatedArticleId, l.Order))
                .ToList();
            var (relatedLinksValid, relatedLinksError) = await ValidateRelatedLinksAsync(incomingRelatedLinks, articleId);
            if (!relatedLinksValid) return (false, relatedLinksError);

            var article = await _articleRepo.GetByIdWithContentAsync(articleId);
            if (article is null)
            {
                return (false, AppErrors.ArticleNotFound);
            }

            string? newSlug = null;
            if (!string.IsNullOrWhiteSpace(dto.Slug))
            {
                try
                {
                    newSlug = await _slugs.ChooseAsync(dto.Slug, dto.Title, article.Locale, articleId);
                }
                catch (ValidationException ex)
                {
                    return (false, ex.Error);
                }
            }

            try
            {
                await _uow.BeginTransactionAsync();

                await DeleteRemovedParagraphsAsync(existingParagraphs, incomingParagraphs);
                UpdateExistingParagraphs(existingParagraphs, incomingParagraphs);
                await AddNewParagraphsAsync(articleId, incomingParagraphs);
                UpdateArticleMetadata(article, dto.Title, normalizedInfobox, dto.Summary, dto.Tags, incomingRelatedLinks);
                ArticleSeo.Apply(article, seo);
                if (newSlug is not null)
                {
                    await _slugs.ChangeAsync(article, newSlug);
                }

                await _uow.SaveChangesAsync();
                await WriteRevisionAsync(articleId, authorId, dto.EditComment);
                await _uow.CommitAsync();
                return (true, null);
            }
            catch
            {
                await _uow.RollbackAsync();
                return (false, AppErrors.ArticleContentUpdateFailed);
            }
        }

        private static AppError? CheckEditComment(string? comment)
            => comment is not null && comment.Trim().Length > Infrastructure.Data.MktbaDbContext.RevisionCommentMaxLength
                ? AppErrors.RevisionCommentTooLong
                : null;

        /// <summary>
        /// Appends the next revision: a snapshot of the working copy as just saved. Call inside the
        /// save's transaction, after its changes are flushed.
        /// </summary>
        private async Task WriteRevisionAsync(int articleId, int? authorId, string? comment)
        {
            var saved = await _articleRepo.GetByIdWithContentUntrackedAsync(articleId)
                ?? throw new NotFoundException(AppErrors.ArticleNotFound);
            var number = await _articleRepo.GetLatestRevisionNumberAsync(articleId) + 1;
            await _articleRepo.AddRevisionAsync(new ArticleRevision
            {
                ArticleId = articleId,
                Number = number,
                CreatedAt = saved.UpdatedAt,
                AuthorId = authorId,
                Comment = NormalizeOptionalText(comment),
                Snapshot = ArticleSnapshots.Serialize(ArticleSnapshots.From(saved)),
            });
            await _uow.SaveChangesAsync();
        }

        private static AppError? CheckPlainParagraphSchools(IEnumerable<List<List<int>>> paragraphsOpinionSchoolIds)
        {
            foreach (var opinionSchoolIds in paragraphsOpinionSchoolIds)
            {
                var error = ParagraphRules.CheckPlainParagraphSchools(opinionSchoolIds);
                if (error is not null) return error;
            }

            return null;
        }

        private async Task<bool> ValidateArticleExistsAsync(int articleId, int dtoId)
        {
            if (articleId != dtoId) return false;
            return await _articleRepo.GetByIdAsync(articleId) is not null;
        }

        /// <summary>Validates paragraphs coming in as create DTOs.</summary>
        internal (bool IsValid, AppError? Error) ValidateOrder(List<ParagraphCreateDto> paragraphs)
        {
            if (!paragraphs.Any())
                return (false, AppErrors.ArticleParagraphsRequired);

            var orders = paragraphs.Select(p => p.Order).Distinct().OrderBy(o => o).ToList();

            if (orders.Any(o => o < 1))
                return (false, AppErrors.ArticleParagraphOrderInvalid);

            if (orders.Count != (orders.Any() ? orders.Max() : 0))
                return (false, AppErrors.ArticleParagraphOrderNotContiguous);

            // Each order slot must have exactly one IsDefault=true opinion
            var slotGroups = paragraphs.GroupBy(p => p.Order);
            foreach (var slot in slotGroups)
            {
                var allOpinions = slot.SelectMany(p => p.Opinions).ToList();
                if (!allOpinions.Any())
                    return (false, AppErrors.ArticleSlotOpinionsRequired(slot.Key));

                var defaultCount = allOpinions.Count(o => o.IsDefault);
                if (defaultCount != 1)
                    return (false, AppErrors.ArticleSlotDefaultOpinionRequired(slot.Key));
            }

            return (true, null);
        }

        /// <summary>Validates paragraphs coming in as read/update DTOs.</summary>
        internal (bool IsValid, AppError? Error) ValidateOrderDto(List<ParagraphDto> paragraphs)
        {
            if (!paragraphs.Any())
                return (false, AppErrors.ArticleParagraphsRequired);

            var orders = paragraphs.Select(p => p.Order).Distinct().OrderBy(o => o).ToList();

            if (orders.Any(o => o < 1))
                return (false, AppErrors.ArticleParagraphOrderInvalid);

            if (orders.Count != (orders.Any() ? orders.Max() : 0))
                return (false, AppErrors.ArticleParagraphOrderNotContiguous);

            foreach (var slot in paragraphs)
            {
                if (!slot.Opinions.Any())
                    return (false, AppErrors.ArticleSlotOpinionsRequired(slot.Order));

                var defaultCount = slot.Opinions.Count(o => o.IsDefault);
                if (defaultCount != 1)
                    return (false, AppErrors.ArticleSlotDefaultOpinionRequired(slot.Order));
            }

            return (true, null);
        }

        private static bool ValidateIncomingIds(IEnumerable<ParagraphDto> incomingParagraphs, HashSet<int> existingIdsSet)
        {
            var incomingExistingIds = incomingParagraphs.Where(p => p.Id != 0).Select(p => p.Id);
            return incomingExistingIds.All(id => existingIdsSet.Contains(id));
        }

        private async Task<(bool IsValid, AppError? Error)> ValidateRelatedLinksAsync(
            List<ArticleRelatedLinkCreateDto>? links, int articleId)
        {
            if (links is null || links.Count == 0)
                return (true, null);

            if (links.Any(l => l.RelatedArticleId == articleId))
                return (false, AppErrors.ArticleRelatedLinkSelf);

            foreach (var link in links)
            {
                if (await _articleRepo.GetByIdAsync(link.RelatedArticleId) is null)
                    return (false, AppErrors.RelatedArticleNotFound(link.RelatedArticleId));
            }

            return (true, null);
        }

        internal (bool IsValid, AppError? Error) ValidateInfobox(ArticleInfoboxCreateDto? infobox)
        {
            if (infobox is null)
            {
                return (true, null);
            }

            var fields = infobox.Fields ?? new List<ArticleInfoboxFieldCreateDto>();

            if (fields.Count == 0)
            {
                return (true, null);
            }

            var orders = fields.Select(field => field.Order).ToList();
            if (orders.Any(order => order < 1))
            {
                return (false, AppErrors.InfoboxFieldOrderInvalid);
            }

            var distinctOrders = orders.Distinct().OrderBy(order => order).ToList();
            if (distinctOrders.Count != (distinctOrders.Any() ? distinctOrders.Max() : 0))
            {
                return (false, AppErrors.InfoboxFieldOrderNotContiguous);
            }

            if (fields.Any(field => string.IsNullOrWhiteSpace(field.Key)))
            {
                return (false, AppErrors.InfoboxFieldKeyRequired);
            }

            if (fields.Any(field => string.IsNullOrWhiteSpace(field.Label)))
            {
                return (false, AppErrors.InfoboxFieldLabelRequired);
            }

            if (fields.Any(field => string.IsNullOrWhiteSpace(field.Value)))
            {
                return (false, AppErrors.InfoboxFieldValueRequired);
            }

            return (true, null);
        }

        internal ArticleInfoboxCreateDto? NormalizeInfobox(ArticleInfoboxCreateDto? infobox)
        {
            if (infobox is null)
            {
                return null;
            }

            var title = NormalizeOptionalText(infobox.Title);
            var subtitle = NormalizeOptionalText(infobox.Subtitle);
            var fields = (infobox.Fields ?? new List<ArticleInfoboxFieldCreateDto>())
                .Select(field => new ArticleInfoboxFieldCreateDto(
                    field.Order,
                    field.Key.Trim(),
                    field.Label.Trim(),
                    field.Value.Trim()))
                .Where(field => !string.IsNullOrWhiteSpace(field.Label) || !string.IsNullOrWhiteSpace(field.Value) || !string.IsNullOrWhiteSpace(field.Key))
                .OrderBy(field => field.Order)
                .ToList();

            if (title is null && subtitle is null && fields.Count == 0)
            {
                return null;
            }

            return new ArticleInfoboxCreateDto(title, subtitle, fields);
        }

        private static string? NormalizeOptionalText(string? value)
            => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

        private static List<string> ParseTags(string? tags)
            => tags?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                   .Where(t => !string.IsNullOrEmpty(t))
                   .ToList()
               ?? new List<string>();

        private static string? SerializeTags(List<string>? tags)
        {
            if (tags is null || tags.Count == 0) return null;
            var normalized = tags
                .Select(t => t.Trim())
                .Where(t => !string.IsNullOrEmpty(t))
                .Distinct()
                .ToList();
            return normalized.Count == 0 ? null : string.Join(",", normalized);
        }

        private static ArticleContentDto BuildArticleContentDto(Article article, bool includeUnpublished)
        {
            var paragraphDtos = article.Paragraphs
                .OrderBy(p => p.Order)
                .Select(p => new ParagraphDto
                {
                    Id = p.Id,
                    Order = p.Order,
                    Opinions = p.Opinions.Select(o => new OpinionDto
                    {
                        Id = o.Id,
                        Content = o.Content,
                        IsDefault = o.IsDefault,
                        SchoolIds = o.OpinionSchools.Select(os => os.SchoolId).ToList()
                    }).ToList()
                })
                .ToList();

            return new ArticleContentDto(
                article.Id,
                article.Title,
                paragraphDtos,
                MapInfobox(article),
                article.Summary,
                ParseTags(article.Tags),
                MapRelatedLinks(article, includeUnpublished),
                article.Slug,
                article.PublishedAt,
                article.UpdatedAt,
                Locale: article.Locale,
                TranslationGroupId: article.TranslationGroupId,
                Seo: ArticleSeo.From(article),
                Meta: ArticleSeo.Resolve(article));
        }

        private static ArticleInfoboxDto? MapInfobox(Article article)
        {
            var fields = article.InfoboxFields
                .OrderBy(field => field.Order)
                .Select(field => new ArticleInfoboxFieldDto(field.Id, field.Order, field.Key, field.Label, field.Value))
                .ToList();

            if (string.IsNullOrWhiteSpace(article.InfoboxTitle)
                && string.IsNullOrWhiteSpace(article.InfoboxSubtitle)
                && fields.Count == 0)
            {
                return null;
            }

            return new ArticleInfoboxDto(article.InfoboxTitle, article.InfoboxSubtitle, fields);
        }

        private static List<ArticleRelatedLinkDto>? MapRelatedLinks(Article article, bool includeUnpublished)
        {
            var links = article.RelatedLinks
                .Where(link => ArticleVisibility.IsVisible(link.RelatedArticle.Status, includeUnpublished))
                .ToList();
            if (links.Count == 0)
                return null;

            return links
                .OrderBy(link => link.Order)
                .Select(link => new ArticleRelatedLinkDto(
                    link.Id,
                    link.RelatedArticleId,
                    link.RelatedArticle.Title,
                    link.Order,
                    link.RelatedArticle.Slug))
                .ToList();
        }

        private async Task DeleteRemovedParagraphsAsync(List<Paragraph> existingParagraphs, List<ParagraphDto> incomingParagraphs)
        {
            var incomingIds = incomingParagraphs.Where(p => p.Id != 0).Select(p => p.Id).ToHashSet();
            var toDelete = existingParagraphs.Where(p => !incomingIds.Contains(p.Id)).ToList();
            foreach (var p in toDelete)
                await _paragraphRepo.DeleteAsync(p);
        }

        private void UpdateExistingParagraphs(List<Paragraph> existingParagraphs, List<ParagraphDto> incomingParagraphs)
        {
            var existingMap = existingParagraphs.ToDictionary(p => p.Id);
            foreach (var incoming in incomingParagraphs.Where(p => p.Id != 0))
            {
                var entity = existingMap[incoming.Id];
                entity.Order = incoming.Order;

                // Reconcile opinions: replace all (simple full-replace strategy)
                entity.Opinions.Clear();
                foreach (var opinionDto in incoming.Opinions)
                {
                    var opinion = new Opinion
                    {
                        Id = opinionDto.Id > 0 ? opinionDto.Id : 0,
                        Content = opinionDto.Content,
                        IsDefault = opinionDto.IsDefault,
                    };
                    foreach (var schoolId in opinionDto.SchoolIds)
                    {
                        opinion.OpinionSchools.Add(new OpinionSchool { SchoolId = schoolId });
                    }
                    entity.Opinions.Add(opinion);
                }
            }
        }

        private async Task AddNewParagraphsAsync(int articleId, List<ParagraphDto> incomingParagraphs)
        {
            foreach (var incoming in incomingParagraphs.Where(p => p.Id == 0))
            {
                var paragraph = new Paragraph
                {
                    ArticleId = articleId,
                    Order = incoming.Order,
                };

                foreach (var opinionDto in incoming.Opinions)
                {
                    var opinion = new Opinion
                    {
                        Content = opinionDto.Content,
                        IsDefault = opinionDto.IsDefault,
                    };
                    foreach (var schoolId in opinionDto.SchoolIds)
                    {
                        opinion.OpinionSchools.Add(new OpinionSchool { SchoolId = schoolId });
                    }
                    paragraph.Opinions.Add(opinion);
                }

                await _paragraphRepo.AddAsync(paragraph);
            }
        }

        private void UpdateArticleMetadata(
            Article article,
            string title,
            ArticleInfoboxCreateDto? infobox,
            string? summary,
            List<string> tags,
            List<ArticleRelatedLinkCreateDto>? relatedLinks)
        {
            article.Title = title;
            article.UpdatedAt = _clock.GetUtcNow().UtcDateTime;
            article.InfoboxTitle = infobox?.Title;
            article.InfoboxSubtitle = infobox?.Subtitle;
            article.Summary = NormalizeOptionalText(summary);
            article.Tags = SerializeTags(tags);

            article.InfoboxFields.Clear();
            foreach (var field in infobox?.Fields ?? Enumerable.Empty<ArticleInfoboxFieldCreateDto>())
            {
                article.InfoboxFields.Add(new ArticleInfoboxField
                {
                    ArticleId = article.Id,
                    Order = field.Order,
                    Key = field.Key,
                    Label = field.Label,
                    Value = field.Value,
                });
            }

            article.RelatedLinks.Clear();
            foreach (var link in relatedLinks ?? Enumerable.Empty<ArticleRelatedLinkCreateDto>())
            {
                article.RelatedLinks.Add(new ArticleRelatedLink
                {
                    ArticleId = article.Id,
                    RelatedArticleId = link.RelatedArticleId,
                    Order = link.Order
                });
            }
        }
    }
}
