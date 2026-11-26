namespace Mktba.Application.Exceptions;

/// <summary>The caller may see the thing but not do this to it (403).</summary>
public sealed class ForbiddenException : AppException
{
    public ForbiddenException(AppError error)
        : base(error, 403)
    {
    }
}
