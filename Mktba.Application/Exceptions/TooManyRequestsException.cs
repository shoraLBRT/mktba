namespace Mktba.Application.Exceptions;

/// <summary>A limit on how often something may be done is used up; answered with 429 Too Many Requests.</summary>
public sealed class TooManyRequestsException : AppException
{
    /// <param name="error">The error to answer with.</param>
    /// <param name="retryAfter">When the limit frees up again, if known: sent as <c>Retry-After</c>.</param>
    public TooManyRequestsException(AppError error, TimeSpan? retryAfter = null)
        : base(error, 429)
    {
        RetryAfter = retryAfter;
    }

    public TimeSpan? RetryAfter { get; }
}
