namespace Mktba.Domain.Entities;

/// <summary>One labelled link of a user's profile (U-07, #72): an absolute http(s) address.</summary>
public class UserLink
{
    public int Id { get; set; }

    public int UserId { get; set; }

    /// <summary>Position in the profile, from 0.</summary>
    public int Order { get; set; }

    public string Label { get; set; } = string.Empty;

    public string Url { get; set; } = string.Empty;
}
