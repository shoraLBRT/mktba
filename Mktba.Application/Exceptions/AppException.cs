namespace Mktba.Application.Exceptions;

public abstract class AppException : Exception
{
    protected AppException(AppError error, int statusCode)
        : base(error.Message)
    {
        Error = error;
        StatusCode = statusCode;
    }

    public AppError Error { get; }

    public int StatusCode { get; }
}
