using System.Reflection;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace Mktba.Api.Infrastructure;

/// <summary>
/// Marks every property whose C# type is non-nullable as <c>required</c> in the OpenAPI schema.
/// System.Text.Json always writes every property, so a non-nullable property is always present in a
/// response; the generated frontend types (mktba.react <c>npm run gen:api</c>) then make it a
/// non-optional field instead of <c>field?: T</c>.
/// </summary>
internal sealed class NonNullablePropertiesRequiredSchemaFilter : ISchemaFilter
{
    public void Apply(OpenApiSchema schema, SchemaFilterContext context)
    {
        if (schema.Properties is null || schema.Properties.Count == 0)
        {
            return;
        }

        var nullabilityContext = new NullabilityInfoContext();
        var properties = context.Type.GetProperties(BindingFlags.Public | BindingFlags.Instance);
        foreach (var schemaPropertyName in schema.Properties.Keys)
        {
            var property = properties.FirstOrDefault(p =>
                string.Equals(p.Name, schemaPropertyName, StringComparison.OrdinalIgnoreCase));
            if (property is null)
            {
                continue;
            }

            if (nullabilityContext.Create(property).ReadState == NullabilityState.NotNull)
            {
                schema.Required.Add(schemaPropertyName);
            }
        }
    }
}
