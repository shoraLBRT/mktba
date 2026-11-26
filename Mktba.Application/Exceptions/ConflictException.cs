namespace Mktba.Application.Exceptions;

/// <summary>The request is valid but clashes with the current state (409).</summary>
public sealed class ConflictException : AppException
{
    public ConflictException(AppError error)
        : base(error, 409)
    {
    }
}
