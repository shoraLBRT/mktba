namespace Mktba.Domain.Entities;

/// <summary>
/// The name of a school in one language other than Russian. <see cref="School.Name"/> and
/// <see cref="School.ShortName"/> stay the Russian names; a reader in another locale gets the
/// translation for that locale, or the Russian name when there is none.
/// </summary>
public class SchoolTranslation
{
    public int SchoolId { get; set; }

    public School School { get; set; } = null!;

    /// <summary>One of <see cref="Locales.Supported"/>, never <see cref="Locales.Default"/>.</summary>
    public string Locale { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string ShortName { get; set; } = string.Empty;
}
