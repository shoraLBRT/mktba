using System.Text.Json;

namespace Mktba.Application.DTOs
{
    /// <summary>
    /// The caller's own autosaved draft of an article or of a new article (E-02, #75). Never a
    /// revision and never shown to readers; «Сохранить» (a content save) turns it into a revision
    /// and deletes it.
    /// </summary>
    /// <param name="Snapshot">The editor's state exactly as it was sent: any JSON object; the server does not read it.</param>
    /// <param name="BaseUpdatedAt">The article's <c>updatedAt</c> the edits started from; null for a new article.</param>
    /// <param name="UpdatedAt">When the draft was last written (UTC).</param>
    public record ArticleDraftDto(JsonElement Snapshot, DateTime? BaseUpdatedAt, DateTime UpdatedAt);

    /// <param name="Snapshot">The editor's state: a JSON object of at most <c>ArticleDraftService.SnapshotMaxLength</c> characters.</param>
    /// <param name="BaseUpdatedAt">The article's <c>updatedAt</c> the edits started from; null for a new article.</param>
    public record ArticleDraftSaveDto(JsonElement Snapshot, DateTime? BaseUpdatedAt);
}
