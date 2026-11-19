namespace Mktba.Application.Exceptions;

/// <summary>The resource existed and was removed on purpose; answered with 410 Gone.</summary>
public sealed class GoneException : AppException
{
    public GoneException(AppError error)
        : base(error, 410)
    {
    }
}
