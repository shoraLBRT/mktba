namespace Mktba.Application.DTOs
{
    /// <summary>The site's IndexNow key, which the frontend serves as <c>/indexnow-key.txt</c> (O-12, #61).</summary>
    public sealed record IndexNowKeyDto(string Key);
}
