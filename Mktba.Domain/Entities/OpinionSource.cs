namespace Mktba.Domain.Entities;

/// <summary>
/// One citation: an opinion refers to a <see cref="Source"/>, optionally at a place inside it. An
/// opinion may cite the same source more than once (two hadiths of one collection).
/// </summary>
public class OpinionSource
{
    public int Id { get; set; }

    public int OpinionId { get; set; }

    public Opinion Opinion { get; set; } = null!;

    public int SourceId { get; set; }

    public Source Source { get; set; } = null!;

    /// <summary>1-based position among the citations of the opinion.</summary>
    public int Order { get; set; }

    /// <summary>Place inside the source: a page, a hadith number, sura:ayah. Null cites the work as a whole.</summary>
    public string? Locator { get; set; }
}
