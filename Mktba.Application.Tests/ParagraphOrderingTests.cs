using AutoMapper;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Mktba.Application.DTOs;
using Mktba.Application.Mappings;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

public class ParagraphOrderingTests : IDisposable
{
    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly ParagraphRepository _repository;
    private readonly ParagraphService _service;

    public ParagraphOrderingTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        _repository = new ParagraphRepository(_context);

        var config = new MapperConfiguration(cfg => cfg.AddProfile<MappingProfile>(), NullLoggerFactory.Instance);
        var mapper = config.CreateMapper();
        _service = new ParagraphService(_repository, mapper);
    }

    public void Dispose() => _context.Dispose();

    // Seeds an article with N paragraph slots (each with one default opinion)
    private async Task<Article> SeedArticleWithParagraphs(params int[] orders)
    {
        var article = new Article { Title = "Test Article" };
        _context.Articles.Add(article);
        await _context.SaveChangesAsync();

        foreach (var order in orders)
        {
            var paragraph = new Paragraph
            {
                ArticleId = article.Id,
                Order = order,
            };
            paragraph.Opinions.Add(new Opinion
            {
                Content = $"Content for slot {order}",
                IsDefault = true,
            });
            _context.Paragraphs.Add(paragraph);
        }
        await _context.SaveChangesAsync();

        return article;
    }

    private static ParagraphCreateDto CreateDto(int articleId, int order, string content = "New paragraph") =>
        new ParagraphCreateDto
        {
            ArticleId = articleId,
            Order = order,
            Opinions = new List<OpinionCreateDto>
            {
                new OpinionCreateDto(content, true, new List<int>())
            }
        };

    #region CreateAsync — ordering

    [Fact]
    public async Task CreateAsync_InsertAtEnd_DoesNotShiftOthers()
    {
        var article = await SeedArticleWithParagraphs(1, 2);

        await _service.CreateAsync(CreateDto(article.Id, 3));

        var paragraphs = await _repository.GetParagraphsByArticleAsync(article.Id);
        paragraphs.Select(p => p.Order).Order().Should().BeEquivalentTo([1, 2, 3]);
    }

    [Fact]
    public async Task CreateAsync_InsertAtBeginning_ShiftsAllExisting()
    {
        var article = await SeedArticleWithParagraphs(1, 2);

        await _service.CreateAsync(CreateDto(article.Id, 1, "New first"));

        var paragraphs = (await _repository.GetParagraphsByArticleAsync(article.Id))
            .OrderBy(p => p.Order).ToList();

        paragraphs.Should().HaveCount(3);
        paragraphs[0].Order.Should().Be(1);
        paragraphs[1].Order.Should().Be(2);
        paragraphs[2].Order.Should().Be(3);
    }

    [Fact]
    public async Task CreateAsync_InsertInMiddle_ShiftsSubsequent()
    {
        var article = await SeedArticleWithParagraphs(1, 2, 3);

        await _service.CreateAsync(CreateDto(article.Id, 2, "Inserted at 2"));

        var paragraphs = (await _repository.GetParagraphsByArticleAsync(article.Id))
            .OrderBy(p => p.Order).ToList();

        paragraphs.Should().HaveCount(4);
        paragraphs[1].Order.Should().Be(2);
        paragraphs[2].Order.Should().Be(3);
        paragraphs[3].Order.Should().Be(4);
    }

    [Fact]
    public async Task CreateAsync_OrderExceedsMaxPlusOne_ThrowsValidation()
    {
        var article = await SeedArticleWithParagraphs(1, 2);

        var act = () => _service.CreateAsync(CreateDto(article.Id, 4));

        await act.Should().ThrowAsync<Application.Exceptions.ValidationException>();
    }

    #endregion

    #region UpdateAsync — reordering

    [Fact]
    public async Task UpdateAsync_MoveDown_ShiftsIntermediateUp()
    {
        var article = await SeedArticleWithParagraphs(1, 2, 3);
        var paragraphs = await _repository.GetParagraphsByArticleAsync(article.Id);
        var first = paragraphs.First(p => p.Order == 1);

        await _service.UpdateAsync(first.Id, new ParagraphUpdateDto
        {
            Order = 3,
            Opinions = new List<OpinionUpdateDto> { new(0, "Updated", true, new List<int>()) }
        });

        var updated = (await _repository.GetParagraphsByArticleAsync(article.Id))
            .OrderBy(p => p.Order).ToList();

        updated.First(p => p.Id == first.Id).Order.Should().Be(3);
        updated.Where(p => p.Id != first.Id).Select(p => p.Order).Should().BeEquivalentTo([1, 2]);
    }

    [Fact]
    public async Task UpdateAsync_MoveUp_ShiftsIntermediateDown()
    {
        var article = await SeedArticleWithParagraphs(1, 2, 3);
        var paragraphs = await _repository.GetParagraphsByArticleAsync(article.Id);
        var last = paragraphs.First(p => p.Order == 3);

        await _service.UpdateAsync(last.Id, new ParagraphUpdateDto
        {
            Order = 1,
            Opinions = new List<OpinionUpdateDto> { new(0, "Updated", true, new List<int>()) }
        });

        var updated = (await _repository.GetParagraphsByArticleAsync(article.Id))
            .OrderBy(p => p.Order).ToList();

        updated.First(p => p.Id == last.Id).Order.Should().Be(1);
        updated.Where(p => p.Id != last.Id).Select(p => p.Order).Should().BeEquivalentTo([2, 3]);
    }

    [Fact]
    public async Task UpdateAsync_SameOrder_NoShift()
    {
        var article = await SeedArticleWithParagraphs(1, 2, 3);
        var paragraphs = await _repository.GetParagraphsByArticleAsync(article.Id);
        var second = paragraphs.First(p => p.Order == 2);

        await _service.UpdateAsync(second.Id, new ParagraphUpdateDto
        {
            Order = 2,
            Opinions = new List<OpinionUpdateDto> { new(0, "Updated content", true, new List<int>()) }
        });

        var updated = (await _repository.GetParagraphsByArticleAsync(article.Id))
            .OrderBy(p => p.Order).ToList();

        updated.Select(p => p.Order).Should().BeEquivalentTo([1, 2, 3]);
    }

    #endregion
}
