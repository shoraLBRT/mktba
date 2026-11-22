using FluentAssertions;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Analytics;

namespace Mktba.Application.Tests;

/// <summary>N-08 (#102): the period a dashboard asks for, and the one it is compared with.</summary>
public sealed class AnalyticsPeriodTests
{
    private static readonly DateOnly Today = new(2026, 11, 20);

    [Fact]
    public void Resolve_GivenNoRange_TakesTheLastDaysEndingToday()
    {
        AnalyticsPeriod.Resolve(7, null, null, Today, 30).Should().Be(new AnalyticsPeriod(Today.AddDays(-6), Today));
        AnalyticsPeriod.Resolve(null, null, null, Today, 30).Days.Should().Be(30);
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(1000, AnalyticsPeriod.MaxDays)]
    public void Resolve_GivenDaysOutOfRange_KeepsThemWithinOneToTheMaximum(int days, int expected)
    {
        AnalyticsPeriod.Resolve(days, null, null, Today, 30).Days.Should().Be(expected);
    }

    [Fact]
    public void Resolve_GivenFromAndTo_TakesThatRangeBothEndsIncluded()
    {
        var period = AnalyticsPeriod.Resolve(7, new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 31), Today, 30);

        period.Should().Be(new AnalyticsPeriod(new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 31)));
        period.Days.Should().Be(31);
        period.EachDay().Should().HaveCount(31).And.StartWith(new DateOnly(2026, 10, 1)).And.EndWith(new DateOnly(2026, 10, 31));
    }

    [Fact]
    public void Resolve_GivenOnlyFrom_EndsToday()
    {
        AnalyticsPeriod.Resolve(null, Today.AddDays(-3), null, Today, 30).Should().Be(new AnalyticsPeriod(Today.AddDays(-3), Today));
    }

    [Fact]
    public void Resolve_GivenOnlyTo_TakesThatManyDaysBeforeIt()
    {
        AnalyticsPeriod.Resolve(7, null, new DateOnly(2026, 10, 31), Today, 30)
            .Should().Be(new AnalyticsPeriod(new DateOnly(2026, 10, 25), new DateOnly(2026, 10, 31)));
    }

    [Fact]
    public void Resolve_GivenToAfterToday_EndsToday()
    {
        AnalyticsPeriod.Resolve(null, Today.AddDays(-1), Today.AddDays(5), Today, 30).Should().Be(new AnalyticsPeriod(Today.AddDays(-1), Today));
    }

    [Fact]
    public void Resolve_GivenFromAfterTo_Throws()
    {
        var act = () => AnalyticsPeriod.Resolve(null, Today.AddDays(-1), Today.AddDays(-2), Today, 30);

        act.Should().Throw<ValidationException>().Which.Error.Code.Should().Be("analytics_period_invalid");
    }

    [Fact]
    public void Resolve_GivenARangeLongerThanTheMaximum_Throws()
    {
        AnalyticsPeriod.Resolve(null, Today.AddDays(-(AnalyticsPeriod.MaxDays - 1)), Today, Today, 30).Days.Should().Be(AnalyticsPeriod.MaxDays);

        var act = () => AnalyticsPeriod.Resolve(null, Today.AddDays(-AnalyticsPeriod.MaxDays), Today, Today, 30);

        act.Should().Throw<ValidationException>().Which.Error.Code.Should().Be("analytics_period_too_long");
    }

    [Fact]
    public void Previous_IsAsManyDaysJustBefore()
    {
        new AnalyticsPeriod(new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 31)).Previous
            .Should().Be(new AnalyticsPeriod(new DateOnly(2026, 8, 31), new DateOnly(2026, 9, 30)));
        new AnalyticsPeriod(Today, Today).Previous.Should().Be(new AnalyticsPeriod(Today.AddDays(-1), Today.AddDays(-1)));
    }
}
