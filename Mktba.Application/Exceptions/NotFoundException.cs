namespace Mktba.Application.Exceptions;

public sealed class NotFoundException : AppException
{
    public NotFoundException(AppError error)
        : base(error, 404)
    {
    }
}
