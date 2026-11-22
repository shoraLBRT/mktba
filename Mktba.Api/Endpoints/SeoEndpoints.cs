using Microsoft.Extensions.Options;
using Mktba.Api.Infrastructure;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;

namespace Mktba.Api.Endpoints;

public static class SeoEndpoints
{
    public static IEndpointRouteBuilder MapSeoEndpoints(this IEndpointRouteBuilder builder)
    {
        builder.MapGet("/seo/indexnow-key", (IOptions<IndexNowOptions> options) =>
            options.Value.IsConfigured
                ? Results.Ok(new IndexNowKeyDto(options.Value.ValidKey!))
                : throw new NotFoundException(AppErrors.IndexNowNotConfigured))
            .WithTags("Seo")
            .WithSummary("The site's IndexNow key, for the key file search engines check (/indexnow-key.txt).")
            .WithDescription(
                "The key is public by design: search engines read it from the site to trust the URLs it "
                + "sends them when an article is published or unpublished. 404 indexnow_not_configured "
                + "while IndexNow is off (IndexNow:Key and IndexNow:SiteUrl not both set, or IndexNow:Enabled false).")
            .Produces<IndexNowKeyDto>()
            .ProducesApiProblem(StatusCodes.Status404NotFound);

        return builder;
    }
}
