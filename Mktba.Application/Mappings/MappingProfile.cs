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
                    || !string.IsNullOrWhiteSpace(src.Summary)));
            CreateMap<ArticleCreateDto, Article>();
            CreateMap<ArticleUpdateDto, Article>();

            // School
            CreateMap<School, SchoolDto>();

            // Opinion → OpinionDto (class-based, AutoMapper handles member mapping)
            CreateMap<Opinion, OpinionDto>()
                .ForMember(dest => dest.SchoolIds,
                    opt => opt.MapFrom(src => src.OpinionSchools.Select(os => os.SchoolId).ToList()));

            // Paragraph (slot)
            CreateMap<Paragraph, ParagraphDto>();
            CreateMap<Paragraph, ParagraphReadDto>();
        }
    }
}
