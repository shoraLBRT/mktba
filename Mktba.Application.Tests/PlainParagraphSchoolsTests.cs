using AutoMapper;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Mappings;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>S-14 (#16): a plain (single-opinion) paragraph is common to all schools and carries no school links.</summary>
public class PlainParagraphSchoolsTests : IDisposable
{
    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly ParagraphRepository _repository;
    private readonly ParagraphService _service;

    public PlainParagraphSchoolsTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        _repository = new ParagraphRepository(_context);
        var mapper = new MapperConfiguration(cfg => cfg.AddProfile<MappingProfile>(), NullLoggerFactory.Instance).CreateMapper();
        _service = new ParagraphService(_repository, mapper);
    }

    public void Dispose() => _context.Dispose();

    [Fact]
    public void GivenSingleOpinionWithSchools_WhenChecking_ThenReturnsPlainSchoolsError()
    {
        var error = ParagraphRules.CheckPlainParagraphSchools([new List<int> { 1 }]);

        error!.Code.Should().Be(AppErrors.ParagraphPlainSchoolsNotAllowed.Code);
    }

    [Fact]
    public void GivenSingleOpinionWithoutSchools_WhenChecking_ThenPasses()
    {
        ParagraphRules.CheckPlainParagraphSchools([new List<int>()]).Should().BeNull();
    }

    [Fact]
    public void GivenSeveralOpinionsWithSchools_WhenChecking_ThenPasses()
    {
        ParagraphRules.CheckPlainParagraphSchools([new List<int> { 1 }, new List<int> { 2 }]).Should().BeNull();
    }

    [Fact]
    public async Task GivenPlainParagraphWithSchools_WhenCreating_ThenThrowsAndStoresNothing()
    {
        var article = await SeedArticleAsync();

        var act = () => _service.CreateAsync(new ParagraphCreateDto
        {
            ArticleId = article.Id,
            Order = 1,
            Opinions = { new OpinionCreateDto("Plain", true, new List<int> { 1 }) },
        });

        (await act.Should().ThrowAsync<ValidationException>())
            .Which.Error.Code.Should().Be("paragraph_plain_schools_not_allowed");
        (await _repository.GetParagraphsByArticleAsync(article.Id)).Should().BeEmpty();
    }

    [Fact]
    public async Task GivenPlainParagraphWithSchools_WhenUpdating_ThenThrows()
    {
        var article = await SeedArticleAsync();
        var paragraph = new Paragraph { ArticleId = article.Id, Order = 1, Opinions = { new Opinion { Content = "Text", IsDefault = true } } };
        _context.Paragraphs.Add(paragraph);
        await _context.SaveChangesAsync();

        var act = () => _service.UpdateAsync(paragraph.Id, new ParagraphUpdateDto
        {
            Order = 1,
            Opinions = { new OpinionUpdateDto(paragraph.Opinions.First().Id, "Text", true, new List<int> { 1 }) },
        });

        (await act.Should().ThrowAsync<ValidationException>())
            .Which.Error.Code.Should().Be("paragraph_plain_schools_not_allowed");
    }

    private async Task<Article> SeedArticleAsync()
    {
        var article = new Article { Title = "S-14" };
        _context.Articles.Add(article);
        await _context.SaveChangesAsync();
        return article;
    }
}
