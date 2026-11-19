using System.Text;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services.Feedback;

/// <summary>
/// Intake of anonymous feedback (F-02, #67): validates the message and stores it as
/// <see cref="FeedbackDeliveryState.Pending"/>. Nothing here talks to GitHub: the caller gets its
/// answer whether or not GitHub is reachable, <see cref="FeedbackDeliveryService"/> files the issue later.
/// </summary>
public class FeedbackService
{
    private readonly FeedbackRepository _feedback;
    private readonly TimeProvider _timeProvider;

    public FeedbackService(FeedbackRepository feedback, TimeProvider timeProvider)
    {
        _feedback = feedback;
        _timeProvider = timeProvider;
    }

    /// <exception cref="ValidationException">The type, text, contact or page URL is invalid.</exception>
    public async Task<FeedbackAcceptedDto> SubmitAsync(FeedbackCreateDto dto, CancellationToken cancellationToken = default)
    {
        if (!Enum.IsDefined(dto.Type))
        {
            throw new ValidationException(AppErrors.FeedbackTypeInvalid);
        }

        var text = Clean(dto.Text, keepLineBreaks: true);
        if (text is null)
        {
            throw new ValidationException(AppErrors.FeedbackTextRequired);
        }

        if (text.Length > FeedbackMessage.TextMaxLength)
        {
            throw new ValidationException(AppErrors.FeedbackTextTooLong(FeedbackMessage.TextMaxLength));
        }

        var contact = Clean(dto.Contact, keepLineBreaks: false);
        if (contact?.Length > FeedbackMessage.ContactMaxLength)
        {
            throw new ValidationException(AppErrors.FeedbackContactTooLong(FeedbackMessage.ContactMaxLength));
        }

        var pageUrl = Clean(dto.PageUrl, keepLineBreaks: false);
        if (pageUrl is not null && (pageUrl.Length > FeedbackMessage.PageUrlMaxLength || !ArticleSeo.IsValidImageUrl(pageUrl)))
        {
            throw new ValidationException(AppErrors.FeedbackPageUrlInvalid(FeedbackMessage.PageUrlMaxLength));
        }

        var mazhab = Clean(dto.Mazhab, keepLineBreaks: false)?.ToLowerInvariant();
        if (mazhab is not null
            && (mazhab.Length > FeedbackMessage.MazhabMaxLength || !await _feedback.SystemSchoolExistsAsync(mazhab, cancellationToken)))
        {
            mazhab = null;
        }

        var articleId = dto.ArticleId;
        if (articleId is int id && !await _feedback.ArticleExistsAsync(id, cancellationToken))
        {
            articleId = null;
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var message = new FeedbackMessage
        {
            DeliveryKey = Guid.NewGuid(),
            Type = dto.Type,
            Text = text,
            Contact = contact,
            PageUrl = pageUrl,
            ArticleId = articleId,
            Mazhab = mazhab,
            CreatedAtUtc = now,
            DeliveryState = FeedbackDeliveryState.Pending,
            NextAttemptAtUtc = now,
        };
        await _feedback.AddAsync(message);
        await _feedback.SaveChangesAsync(cancellationToken);
        return new FeedbackAcceptedDto(message.Id);
    }

    /// <summary>
    /// The value as it can be stored: trimmed, without control characters (PostgreSQL refuses U+0000)
    /// and unpaired surrogates, line breaks kept as "\n" or turned into spaces; null when nothing is left.
    /// </summary>
    private static string? Clean(string? value, bool keepLineBreaks)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var builder = new StringBuilder(value.Length);
        for (var i = 0; i < value.Length; i++)
        {
            var current = value[i];
            if (char.IsHighSurrogate(current) && i + 1 < value.Length && char.IsLowSurrogate(value[i + 1]))
            {
                builder.Append(current).Append(value[++i]);
            }
            else if (current == '\n' || current == '\t')
            {
                builder.Append(keepLineBreaks ? current : ' ');
            }
            else if (!char.IsSurrogate(current) && !char.IsControl(current))
            {
                builder.Append(current);
            }
        }

        var cleaned = builder.ToString().Trim();
        return cleaned.Length == 0 ? null : cleaned;
    }
}
