namespace Mktba.Application.DTOs;

/// <summary>
/// A browser error report (X-05, #159), sent by the site's own script. Every field is optional and
/// cut to size on arrival: a malformed report is logged as far as it goes, never refused.
/// </summary>
public sealed class ClientErrorReportDto
{
    /// <summary><c>error</c> (window error), <c>rejection</c> (unhandled promise rejection) or <c>render</c> (a React error boundary); anything else is logged as <c>error</c>.</summary>
    public string? Kind { get; set; }

    /// <summary>The error's message, up to 1000 characters.</summary>
    public string? Message { get; set; }

    /// <summary>The stack, up to 4000 characters.</summary>
    public string? Stack { get; set; }

    /// <summary>The page's path; a query string or fragment is removed.</summary>
    public string? Page { get; set; }
}
