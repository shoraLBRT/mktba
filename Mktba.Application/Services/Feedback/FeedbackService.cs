using System.Text;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services.Feedback;

/// <summary>
/// Intake of anonymous feedback (F-02 #67, F-03 #68): validates the message and stores it as
/// <see cref="FeedbackDeliveryState.Pending"/>. Nothing here talks to GitHub: the caller gets its
/// answer whether or not GitHub is reachable, <see cref="FeedbackDeliveryService"/> files the issue later.
/// <para>
/// A request with the trap field filled in (<see cref="FeedbackCreateDto.Website"/>) is answered
/// like an accepted one and dropped. Stored messages from all visitors together are capped per
/// hour (<see cref="FeedbackIntakeOptions.MaxPerHour"/>); the limit per client is the API's rate
/// limiter. Nothing about the sender — address, browser — is stored or logged (decision D9, #37).
/// </para>
/// </summary>
public class FeedbackService
{
    private static readonly TimeSpan IntakeWindow = TimeSpan.FromHours(1);

    private readonly FeedbackRepository _feedback;
    private readonly FeedbackOptions _options;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<FeedbackService> _logger;

    public FeedbackService(
        FeedbackRepository feedback,
        IOptions<FeedbackOptions> options,
        TimeProvider timeProvider,
        ILogger<FeedbackService> logger)
    {
        _feedback = feedback;
        _options = options.Value;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    /// <exception cref="ValidationException">The type, text, contact or page URL is invalid.</exception>
    /// <exception cref="TooManyRequestsException">The hourly cap on stored messages is reached (feedback_limit_reached).</exception>
    public async Task<FeedbackAcceptedDto> SubmitAsync(FeedbackCreateDto dto, CancellationToken cancellationToken = default)
    {
        // Before any validation: a bot must not learn from a 400 that the trap is what gave it away.
        if (!string.IsNullOrWhiteSpace(dto.Website))
        {
            _logger.LogInformation("Feedback dropped: the trap field was filled in.");
            return new FeedbackAcceptedDto(await _feedback.GetLastIdAsync(cancellationToken) + 1);
        }

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

        if (pageUrl is not null && !IsOnSite(pageUrl))
        {
            pageUrl = null;
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
        var cap = _options.Intake.MaxPerHour;
        if (cap > 0
            && await _feedback.GetArrivalOfNthNewestAsync(cap, cancellationToken) is { } capStart
            && capStart + IntakeWindow > now)
        {
            throw new TooManyRequestsException(AppErrors.FeedbackLimitReached, capStart + IntakeWindow - now);
        }

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
    /// Whether the page is one of the site's own: a site-relative path, or an absolute URL with the
    /// scheme, host and port of <see cref="FeedbackOptions.SiteUrl"/>. Always true while the site
    /// address is not configured.
    /// </summary>
    private bool IsOnSite(string pageUrl)
    {
        if (pageUrl.StartsWith('/') || string.IsNullOrWhiteSpace(_options.SiteUrl))
        {
            return true;
        }

        return Uri.TryCreate(_options.SiteUrl.Trim(), UriKind.Absolute, out var site)
            && Uri.TryCreate(pageUrl, UriKind.Absolute, out var page)
            && Uri.Compare(site, page, UriComponents.SchemeAndServer, UriFormat.Unescaped, StringComparison.OrdinalIgnoreCase) == 0;
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
