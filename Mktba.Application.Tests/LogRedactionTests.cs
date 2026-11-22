using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Services.Observability;

namespace Mktba.Application.Tests;

/// <summary>X-05 (#159): what must never reach the log (D9), and the cap on browser error reports.</summary>
public class LogRedactionTests
{
    [Theory]
    [InlineData("Failed for reader@example.com.", "Failed for [email].")]
    [InlineData("GET https://mktba.ru/search?q=молитва&page=2 failed", "GET https://mktba.ru/search failed")]
    [InlineData("at f (https://mktba.ru/assets/a.js#x:1:2)", "at f (https://mktba.ru/assets/a.js)")]
    [InlineData("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl", "Bearer [token]")]
    [InlineData("line\u0000one\r\nline\ttwo", "line one\nline\ttwo")]
    [InlineData("  ", "")]
    [InlineData(null, "")]
    public void GivenText_WhenRedacting_ThenPersonalDataAndControlCharactersAreGone(string? text, string expected)
        => LogRedaction.Redact(text, 1000).Should().Be(expected);

    [Fact]
    public void GivenLongText_WhenRedacting_ThenCutWithoutSplittingASurrogatePair()
    {
        var text = new string('a', 9) + "😀" + "tail";

        LogRedaction.Redact(text, 10).Should().Be(new string('a', 9) + "…");
        LogRedaction.Redact("ab\uD800cd", 10).Should().Be("abcd");
    }

    [Theory]
    [InlineData("/schools/hanafi?tab=1#top", "/schools/hanafi")]
    [InlineData("https://mktba.ru/namaz?utm=x", "/namaz")]
    [InlineData("javascript:alert(1)", "")]
    [InlineData("namaz", "")]
    [InlineData(null, "")]
    public void GivenAPageUrl_WhenTakingThePath_ThenOnlyThePathIsKept(string? url, string expected)
        => LogRedaction.PathOnly(url, 300).Should().Be(expected);

    [Fact]
    public void GivenTheMinuteCap_WhenReportsArrive_ThenOnlyThatManyAreLoggedUntilTheNextMinute()
    {
        var clock = new FeedbackTests.FakeClock(new DateTime(2026, 11, 22, 12, 0, 0, DateTimeKind.Utc));
        var service = new ClientErrorService(NullLoggerFactory.Instance, clock, Options.Create(new ClientErrorOptions { MaxPerMinute = 2 }));
        var report = new ClientErrorReportDto { Message = "boom" };

        service.Report(report).Should().BeTrue();
        service.Report(report).Should().BeTrue();
        service.Report(report).Should().BeFalse();
        clock.Advance(TimeSpan.FromMinutes(1));
        service.Report(report).Should().BeTrue();
    }

    [Fact]
    public void GivenNoCap_WhenManyReportsArrive_ThenAllAreLogged()
    {
        var clock = new FeedbackTests.FakeClock(new DateTime(2026, 11, 22, 12, 0, 0, DateTimeKind.Utc));
        var service = new ClientErrorService(NullLoggerFactory.Instance, clock, Options.Create(new ClientErrorOptions { MaxPerMinute = 0 }));

        Enumerable.Range(0, 100).Select(_ => service.Report(new ClientErrorReportDto())).Should().OnlyContain(logged => logged);
    }
}
