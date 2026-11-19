namespace Mktba.Application.Exceptions;

public sealed class ValidationException : AppException
{
    public ValidationException(AppError error)
        : base(error, 400)
    {
    }
}
