using AutoMapper;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Application.Mappings
{
    public class MappingProfile : Profile
    {
        public MappingProfile()
        {
            // Article
            CreateMap<Article, ArticleReadDto>()
                .ForMember(dest => dest.HasContent, opt => opt.MapFrom(src =>
                    src.Paragraphs.Any(p => p.Opinions.Any())
                    || src.InfoboxFields.Any()
                    || !string.IsNullOrWhiteSpace(src.InfoboxTitle)
                    || !string.IsNullOrWhiteSpace(src.InfoboxSubtitle)
                    || !string.IsNullOrWhiteSpace(src.Summary)))
                .ForMember(dest => dest.AllowedTransitions, opt => opt.MapFrom(src =>
                    ArticleStatusTransitions.AllowedFrom(src.Status).ToList()))
                .ForMember(dest => dest.LastStatusChange, opt => opt.Ignore());
            CreateMap<ArticleCreateDto, Article>();
            // A parent change goes through ArticleService's move rules, not a plain copy.
            CreateMap<ArticleUpdateDto, Article>()
                .ForMember(dest => dest.ParentArticleId, opt => opt.Ignore());

            // Opinion → OpinionDto (class-based, AutoMapper handles member mapping)
            CreateMap<Opinion, OpinionDto>()
                .ForMember(dest => dest.SchoolIds,
                    opt => opt.MapFrom(src => src.OpinionSchools.Select(os => os.SchoolId).ToList()))
                .ForMember(dest => dest.Sources,
                    opt => opt.MapFrom(src => src.Sources
                        .OrderBy(c => c.Order)
                        .Select(c => new OpinionSourceDto(c.SourceId, c.Locator))
                        .ToList()));

            // Paragraph (slot)
            CreateMap<Paragraph, ParagraphDto>();
            CreateMap<Paragraph, ParagraphReadDto>();
        }
    }
}
