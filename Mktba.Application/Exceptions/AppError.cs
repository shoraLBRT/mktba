namespace Mktba.Application.Exceptions;

/// <summary>
/// An error the API reports to its clients.
/// </summary>
/// <param name="Code">Stable snake_case code; clients translate it, so it never changes once shipped.</param>
/// <param name="Message">English description for logs and developers; never shown to users.</param>
/// <param name="Params">Values the client interpolates into its translated message, or null.</param>
public sealed record AppError(string Code, string Message, IReadOnlyDictionary<string, object?>? Params = null);
