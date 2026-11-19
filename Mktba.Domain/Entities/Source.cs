namespace Mktba.Domain.Entities;

/// <summary>What a <see cref="Source"/> is. Stored by name.</summary>
public enum SourceKind
{
    /// <summary>A book or treatise.</summary>
    Book,

    /// <summary>A hadith collection; the hadith number goes into the locator of the citation.</summary>
    HadithCollection,

    /// <summary>The Quran; the sura and ayah go into the locator of the citation.</summary>
    Quran,

    /// <summary>Anything else: a fatwa, an article, a web page.</summary>
    Other,
}

/// <summary>
/// An entry of the shared directory of sources (M-07, #71): a work that opinions cite. It holds what
/// is the same for every citation; the place inside the work (page, hadith number, sura:ayah) belongs
/// to the citation, <see cref="OpinionSource.Locator"/>.
/// </summary>
public class Source
{
    public int Id { get; set; }

    public SourceKind Kind { get; set; }

    /// <summary>Title of the work as readers see it.</summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>Author or compiler; null when there is none to name (the Quran).</summary>
    public string? Author { get; set; }

    /// <summary>Free-form publication details: publisher, city, year, edition.</summary>
    public string? Details { get; set; }

    /// <summary>Absolute http(s) link to the work, if it is online.</summary>
    public string? Url { get; set; }

    public ICollection<OpinionSource> Citations { get; set; } = new List<OpinionSource>();
}
