namespace Mktba.Domain.Entities;

/// <summary>Join-таблица M:N между Opinion и School</summary>
public class OpinionSchool
{
    public int OpinionId { get; set; }

    public Opinion Opinion { get; set; } = null!;

    public int SchoolId { get; set; }

    public School School { get; set; } = null!;
}
