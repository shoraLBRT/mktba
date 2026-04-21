using AutoMapper;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services
{
    public class ParagraphService
    {
        private readonly ParagraphRepository _repository;
        private readonly IMapper _mapper;

        public ParagraphService(ParagraphRepository repository, IMapper mapper)
        {
            _repository = repository;
            _mapper = mapper;
        }

        public async Task<IEnumerable<ParagraphReadDto>> GetAllAsync()
        {
            var paragraphs = await _repository.GetAllAsync();
            return _mapper.Map<IEnumerable<ParagraphReadDto>>(paragraphs);
        }

        public async Task<ParagraphReadDto?> GetByIdAsync(int id)
        {
            var paragraph = await _repository.GetByIdAsync(id);
            return paragraph is not null ? _mapper.Map<ParagraphReadDto>(paragraph) : null;
        }

        public async Task<ParagraphReadDto?> CreateAsync(ParagraphCreateDto createDto)
        {
            if (createDto.Order < 1)
            {
                throw new ValidationException("Order must be greater than or equal to 1");
            }

            var existingParagraphs = await _repository.GetParagraphsByArticleAsync(createDto.ArticleId);
            var maxOrder = existingParagraphs.Count;

            if (createDto.Order > maxOrder + 1)
            {
                throw new ValidationException($"Order cannot be greater than {maxOrder + 1}");
            }

            if (!createDto.Opinions.Any())
            {
                throw new ValidationException("At least one opinion is required.");
            }

            var defaultCount = createDto.Opinions.Count(o => o.IsDefault);
            if (defaultCount != 1)
            {
                throw new ValidationException("Exactly one opinion must be marked as default.");
            }

            // Shift existing paragraphs at or after the new order
            var existingAtOrder = existingParagraphs.FirstOrDefault(p => p.Order == createDto.Order);
            if (existingAtOrder != null)
            {
                foreach (var p in existingParagraphs.Where(p => p.Order >= createDto.Order))
                {
                    p.Order++;
                }
            }

            var paragraph = new Paragraph
            {
                ArticleId = createDto.ArticleId,
                Order = createDto.Order,
            };

            foreach (var opinionDto in createDto.Opinions)
            {
                var opinion = new Opinion
                {
                    Content = opinionDto.Content,
                    IsDefault = opinionDto.IsDefault,
                };
                foreach (var schoolId in opinionDto.SchoolIds)
                {
                    opinion.OpinionSchools.Add(new OpinionSchool { SchoolId = schoolId });
                }
                paragraph.Opinions.Add(opinion);
            }

            await _repository.AddAsync(paragraph);
            await _repository.SaveChangesAsync();
            return _mapper.Map<ParagraphReadDto>(paragraph);
        }

        public async Task UpdateAsync(int id, ParagraphUpdateDto updateDto)
        {
            var paragraph = await _repository.GetByIdAsync(id);
            if (paragraph is null)
            {
                throw new NotFoundException("Paragraph not found");
            }

            if (!updateDto.Opinions.Any())
            {
                throw new ValidationException("At least one opinion is required.");
            }

            var defaultCount = updateDto.Opinions.Count(o => o.IsDefault);
            if (defaultCount != 1)
            {
                throw new ValidationException("Exactly one opinion must be marked as default.");
            }

            if (paragraph.Order != updateDto.Order)
            {
                var existingParagraphs = await _repository.GetParagraphsByArticleAsync(paragraph.ArticleId);

                if (updateDto.Order > paragraph.Order)
                {
                    foreach (var p in existingParagraphs.Where(p => p.Id != id && p.Order > paragraph.Order && p.Order <= updateDto.Order))
                    {
                        p.Order--;
                    }
                }
                else if (updateDto.Order < paragraph.Order)
                {
                    foreach (var p in existingParagraphs.Where(p => p.Id != id && p.Order < paragraph.Order && p.Order >= updateDto.Order))
                    {
                        p.Order++;
                    }
                }
            }

            paragraph.Order = updateDto.Order;

            // Full replace of opinions
            paragraph.Opinions.Clear();
            foreach (var opinionDto in updateDto.Opinions)
            {
                var opinion = new Opinion
                {
                    Id = opinionDto.Id > 0 ? opinionDto.Id : 0,
                    Content = opinionDto.Content,
                    IsDefault = opinionDto.IsDefault,
                };
                foreach (var schoolId in opinionDto.SchoolIds)
                {
                    opinion.OpinionSchools.Add(new OpinionSchool { SchoolId = schoolId });
                }
                paragraph.Opinions.Add(opinion);
            }

            await _repository.UpdateAsync(paragraph);
            await _repository.SaveChangesAsync();
        }

        public async Task DeleteAsync(int id)
        {
            var paragraph = await _repository.GetByIdAsync(id);
            if (paragraph is null)
            {
                throw new NotFoundException("Paragraph not found");
            }

            await _repository.DeleteAsync(paragraph);
            await _repository.SaveChangesAsync();
        }

        public async Task<IEnumerable<ParagraphReadDto>> GetByArticleIdAsync(int articleId)
        {
            var paragraphs = await _repository.GetParagraphsByArticleAsync(articleId);
            return _mapper.Map<IEnumerable<ParagraphReadDto>>(paragraphs.OrderBy(p => p.Order));
        }
    }
}
