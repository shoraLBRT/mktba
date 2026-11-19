namespace Mktba.Domain.Entities;

public class Opinion
{
    public int Id { get; set; }

    public int ParagraphId { get; set; }

    public Paragraph Paragraph { get; set; } = null!;

    /// <summary>Markdown-содержимое мнения</summary>
    public string Content { get; set; } = string.Empty;

    /// <summary>
    /// true — это «общепринятое» мнение / fallback.
    /// Ровно один Opinion на Paragraph должен быть IsDefault=true.
    /// </summary>
    public bool IsDefault { get; set; }

    public ICollection<OpinionSchool> OpinionSchools { get; set; } = new List<OpinionSchool>();

    /// <summary>The sources this opinion cites, in <see cref="OpinionSource.Order"/> (M-07, #71).</summary>
    public ICollection<OpinionSource> Sources { get; set; } = new List<OpinionSource>();
}
