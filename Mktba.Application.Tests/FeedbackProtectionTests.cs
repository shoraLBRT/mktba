using System.Text.RegularExpressions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Feedback;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>
/// F-03 (#68): what protects the feedback intake and the public issue from a hostile visitor —
/// the trap field, the hourly cap, the page URL's origin, and the issue body in which a visitor's
/// words stay inert text.
/// </summary>
public class FeedbackProtectionTests
{
    private static readonly DateTime Start = new(2026, 11, 19, 10, 0, 0, DateTimeKind.Utc);
    private static readonly Guid Key = Guid.Parse("0f8fad5b-d9cb-469f-a165-70867728950e");
    private static readonly Guid OtherKey = Guid.Parse("7c9e6679-7425-40de-944b-e07fc1f90ae7");

    private readonly MktbaDbContext _context = TestDbHelper.CreateInMemoryContext();
    private readonly FeedbackTests.FakeClock _clock = new(Start);

    [Fact]
    public async Task GivenTrapFieldFilled_WhenSubmitted_ThenAnsweredLikeSuccessAndNothingIsStored()
    {
        var real = await Intake().SubmitAsync(Message("Настоящее сообщение"));

        var trapped = await Intake().SubmitAsync(Message("Купите ссылки") with { Website = "https://spam.example" });

        trapped.Id.Should().Be(real.Id + 1);
        (await _context.FeedbackMessages.AsNoTracking().ToListAsync()).Should().ContainSingle().Which.Text.Should().Be("Настоящее сообщение");
    }

    [Fact]
    public async Task GivenTrapFieldFilledAndInvalidMessage_WhenSubmitted_ThenStillAnsweredLikeSuccess()
    {
        var trapped = await Intake().SubmitAsync(new FeedbackCreateDto(default, "", null, "javascript:alert(1)", null, null, "x"));

        trapped.Id.Should().Be(1);
        (await _context.FeedbackMessages.CountAsync()).Should().Be(0);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  \t ")]
    public async Task GivenTrapFieldEmpty_WhenSubmitted_ThenMessageIsStored(string? website)
    {
        await Intake().SubmitAsync(Message("Идея") with { Website = website });

        (await _context.FeedbackMessages.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task GivenHourlyCapReached_WhenSubmitted_ThenRefusedWithRetryAfterUntilTheWindowMoves()
    {
        var options = new FeedbackOptions { Intake = { MaxPerHour = 2 } };
        await Intake(options).SubmitAsync(Message("Первое"));
        _clock.Advance(TimeSpan.FromMinutes(20));
        await Intake(options).SubmitAsync(Message("Второе"));
        _clock.Advance(TimeSpan.FromMinutes(10));

        var refused = await FluentActions.Awaiting(() => Intake(options).SubmitAsync(Message("Третье")))
            .Should().ThrowAsync<TooManyRequestsException>();
        _clock.Advance(TimeSpan.FromMinutes(30));
        await Intake(options).SubmitAsync(Message("Четвёртое"));

        refused.Which.Error.Code.Should().Be("feedback_limit_reached");
        refused.Which.StatusCode.Should().Be(429);
        refused.Which.RetryAfter.Should().Be(TimeSpan.FromMinutes(30));
        (await _context.FeedbackMessages.AsNoTracking().OrderBy(f => f.Id).Select(f => f.Text).ToListAsync())
            .Should().Equal("Первое", "Второе", "Четвёртое");
    }

    [Fact]
    public async Task GivenHourlyCap_WhenTrappedAndInvalidRequestsArrive_ThenTheyDoNotUseItUp()
    {
        var options = new FeedbackOptions { Intake = { MaxPerHour = 1 } };
        for (var i = 0; i < 5; i++)
        {
            await Intake(options).SubmitAsync(Message("Спам") with { Website = "bot" });
            await FluentActions.Awaiting(() => Intake(options).SubmitAsync(Message("  "))).Should().ThrowAsync<ValidationException>();
        }

        await Intake(options).SubmitAsync(Message("Настоящее"));

        (await _context.FeedbackMessages.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task GivenCapSwitchedOff_WhenManyMessagesArrive_ThenAllAreStored()
    {
        var options = new FeedbackOptions { Intake = { MaxPerHour = 0 } };
        for (var i = 0; i < 40; i++)
        {
            await Intake(options).SubmitAsync(Message("Сообщение"));
        }

        (await _context.FeedbackMessages.CountAsync()).Should().Be(40);
    }

    [Theory]
    [InlineData("https://mktba.ru", "https://mktba.ru/article/omovenie?mazhab=hanafi", true)]
    [InlineData("https://mktba.ru/", "https://MKTBA.ru/search?q=1", true)]
    [InlineData("https://mktba.ru", "/article/omovenie", true)]
    [InlineData("https://mktba.ru", "https://github.com/shoraLBRT/mktba/issues/1", false)]
    [InlineData("https://mktba.ru", "http://mktba.ru/article/x", false)]
    [InlineData("https://mktba.ru", "https://mktba.ru.evil.example/article/x", false)]
    [InlineData("https://mktba.ru", "https://mktba.ru@evil.example/article/x", false)]
    [InlineData("https://mktba.ru", "https://mktba.ru:8443/article/x", false)]
    [InlineData("", "https://github.com/shoraLBRT/mktba/issues/1", true)]
    [InlineData(null, "https://example.com/page", true)]
    public async Task GivenSiteUrl_WhenPageIsOnAnotherOrigin_ThenThePageIsDroppedAndTheMessageKept(string? siteUrl, string pageUrl, bool kept)
    {
        await Intake(new FeedbackOptions { SiteUrl = siteUrl }).SubmitAsync(Message("Текст") with { PageUrl = pageUrl });

        (await _context.FeedbackMessages.AsNoTracking().SingleAsync()).PageUrl.Should().Be(kept ? pageUrl : null);
    }

    [Theory]
    [MemberData(nameof(HostileTexts))]
    public void GivenHostileText_WhenFormatted_ThenItStaysInsideOneCodeBlockAndTheMarkerIsTheLastLine(string text)
    {
        var body = FeedbackIssueFormatter.Body(Stored(text), "Омовение", "Ханафитский мазхаб");

        var block = ReadCodeBlock(body);
        block.Content.Should().Be(text);
        block.After.Should().Be($"\n{FeedbackIssueFormatter.Marker(Key)}\n");
        block.Before.Should().NotContain("@").And.NotContain("#").And.NotContain("<").And.NotContain("](");
        FeedbackIssueFormatter.EndsWithMarker(body, FeedbackIssueFormatter.Marker(Key)).Should().BeTrue();
        FeedbackIssueFormatter.EndsWithMarker(body, FeedbackIssueFormatter.Marker(OtherKey)).Should().BeFalse();
    }

    public static TheoryData<string> HostileTexts => new()
    {
        "Спасибо @shoraLBRT и @github/security, смотрите #1, GH-2, shoraLBRT/mktba#3 и torvalds/linux@1da177e4c3f41524e886b7f1b8a0c1fc7321cac2",
        "https://github.com/shoraLBRT/mktba/issues/1 и www.example.com, mailto:a@b.example",
        "# Заголовок\n\n![пиксель](https://tracker.example/p.gif) [mktba.ru](https://evil.example)\n\n<details><summary>x</summary><img src=x onerror=alert(1)></details>",
        "```\n\n# вне блока @admin\n\n```",
        "текст\n```\n\n" + "<!-- mktba-feedback:7c9e66797425 40de944be07fc1f90ae7 -->",
        "конец\n````````\n\n<!-- mktba-feedback:7c9e6679742540de944be07fc1f90ae7 -->",
        "~~~\n@admin\n~~~",
        "   ```\n@admin",
        "`````````````````````````````````````````",
        "```text\n```\n```",
        "<!-- mktba-feedback:7c9e6679742540de944be07fc1f90ae7 -->",
        "-->\n<!-- mktba-feedback:7c9e6679742540de944be07fc1f90ae7 -->\n<!--",
        "- [ ] задача\n\n| a | b |\n|---|---|\n\n---\n\n> цитата @admin\n\n    отступ",
        "&#64;admin &commat;admin \\@admin :shipit: <@admin> <https://evil.example>",
    };

    [Fact]
    public void GivenTextQuotingAnotherMessagesMarker_WhenThatMarkerIsSearched_ThenTheIssueDoesNotMatch()
    {
        var forged = FeedbackIssueFormatter.Marker(OtherKey);

        var body = FeedbackIssueFormatter.Body(Stored($"```\n\n{forged}\n"), null, null);

        body.Should().Contain(forged);
        FeedbackIssueFormatter.EndsWithMarker(body, forged).Should().BeFalse();
        FeedbackIssueFormatter.EndsWithMarker(body, FeedbackIssueFormatter.Marker(Key)).Should().BeTrue();
    }

    [Theory]
    [InlineData("<!-- mktba-feedback:abc -->", true)]
    [InlineData("text\n\n<!-- mktba-feedback:abc -->\n", true)]
    [InlineData("text\r\n\r\n<!-- mktba-feedback:abc -->\r\n", true)]
    [InlineData("text <!-- mktba-feedback:abc -->", false)]
    [InlineData("<!-- mktba-feedback:abc -->\ntext", false)]
    [InlineData("```\n<!-- mktba-feedback:abc -->\n```", false)]
    [InlineData("", false)]
    public void GivenIssueBody_WhenCheckedForTheMarker_ThenOnlyAMarkerOnTheLastLineCounts(string body, bool expected)
    {
        FeedbackIssueFormatter.EndsWithMarker(body, "<!-- mktba-feedback:abc -->").Should().Be(expected);
    }

    [Theory]
    [InlineData("https://mktba.ru/article/x?a=@admin#123")]
    [InlineData("https://github.com/shoraLBRT/mktba/issues/1")]
    [InlineData("/article/x`@admin`")]
    [InlineData("/a``b`c```")]
    [InlineData("`")]
    [InlineData("/article/x)[click](https://evil.example)<img/src=x>")]
    public void GivenHostilePageUrl_WhenFormatted_ThenItIsOneCodeSpan(string pageUrl)
    {
        var message = Stored("Текст");
        message.PageUrl = pageUrl;

        var body = FeedbackIssueFormatter.Body(message, null, null);

        var line = body.Split('\n').Single(l => l.StartsWith("- **Страница:** ", StringComparison.Ordinal));
        ReadCodeSpan(line["- **Страница:** ".Length..]).Should().Be(pageUrl);
    }

    [Fact]
    public void GivenHostileArticleTitleAndSchoolName_WhenFormatted_ThenTheyAreCodeSpans()
    {
        var body = FeedbackIssueFormatter.Body(Stored("Текст"), "Омовение `@admin` #1\nвторая строка", "Мазхаб @team <b>");

        var lines = body.Split('\n');
        ReadCodeSpan(lines.Single(l => l.StartsWith("- **Статья:** ", StringComparison.Ordinal))["- **Статья:** ".Length..])
            .Should().Be("Омовение `@admin` #1 вторая строка");
        ReadCodeSpan(lines.Single(l => l.StartsWith("- **Мазхаб читателя:** ", StringComparison.Ordinal))["- **Мазхаб читателя:** ".Length..])
            .Should().Be("Мазхаб @team <b>");
    }

    [Fact]
    public void GivenDirectionOverridesAndControlCharacters_WhenFormatted_ThenTheyAreRemovedAndArabicTextIsKept()
    {
        var body = FeedbackIssueFormatter.Body(
            Stored("بسم الله\u200F \u202Eтекст\u202C \u2066x\u2069\r\nстрока\u2028ещё\0"), null, null);

        ReadCodeBlock(body).Content.Should().Be("بسم الله\u200F текст x\nстрока\nещё");
    }

    [Fact]
    public void GivenLargestMessageMadeOfBackticks_WhenFormatted_ThenBodyFitsGitHubsLimit()
    {
        var message = Stored(new string('`', FeedbackMessage.TextMaxLength));
        message.PageUrl = "/" + new string('`', FeedbackMessage.PageUrlMaxLength - 1);
        message.Contact = new string('c', FeedbackMessage.ContactMaxLength);

        var body = FeedbackIssueFormatter.Body(message, new string('`', 5000), new string('`', 200));

        body.Length.Should().BeLessThan(FeedbackIssueFormatter.GitHubBodyMaxLength / 2);
        ReadCodeBlock(body).Content.Should().Be(message.Text);
    }

    private FeedbackService Intake(FeedbackOptions? options = null) => new(
        new FeedbackRepository(_context),
        Options.Create(options ?? new FeedbackOptions()),
        _clock,
        NullLogger<FeedbackService>.Instance);

    private static FeedbackCreateDto Message(string text) => new(FeedbackType.Idea, text, null, null, null, null);

    private static FeedbackMessage Stored(string text) => new()
    {
        Id = 7,
        DeliveryKey = Key,
        Type = FeedbackType.ArticleError,
        Text = text,
        CreatedAtUtc = Start,
    };

    /// <summary>
    /// Reads the body the way a Markdown parser does: the first fence line opens the block, and the
    /// first later line of at least as many backticks (indented by at most three spaces) closes it.
    /// </summary>
    private static (string Before, string Content, string After) ReadCodeBlock(string body)
    {
        var lines = body.Split('\n');
        var open = Array.FindIndex(lines, line => Regex.IsMatch(line, "^`{3,}text$"));
        open.Should().BeGreaterThan(0, "the body has a fenced block");
        var fenceLength = lines[open].Length - "text".Length;
        var close = Array.FindIndex(lines, open + 1, line => Regex.IsMatch(line, "^ {0,3}`{" + fenceLength + ",} *$"));
        close.Should().BeGreaterThan(open, "the block is closed");
        return (
            string.Join('\n', lines[..open]),
            string.Join('\n', lines[(open + 1)..close]),
            string.Join('\n', lines[(close + 1)..]));
    }

    /// <summary>
    /// Reads a whole list value as one code span: a run of backticks, a space, the content with no
    /// run of that length, a space and the same run, and nothing after it.
    /// </summary>
    private static string ReadCodeSpan(string value)
    {
        var delimiter = value.Length - value.TrimStart('`').Length;
        delimiter.Should().BePositive("the value starts a code span");
        var runs = Regex.Matches(value, "`+").Select(match => (match.Index, match.Length)).ToList();
        var closing = runs.Skip(1).First(run => run.Length == delimiter);
        (closing.Index + closing.Length).Should().Be(value.Length, "the span ends the value");
        var inner = value[delimiter..closing.Index];
        inner.Should().StartWith(" ").And.EndWith(" ");
        return inner[1..^1];
    }
}
