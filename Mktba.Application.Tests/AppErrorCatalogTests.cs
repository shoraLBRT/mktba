using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using FluentAssertions;
using Mktba.Application.Exceptions;

namespace Mktba.Application.Tests;

/// <summary>
/// I-10 (#114): the server never localizes an error itself — every error is a stable code from
/// <see cref="AppErrors"/> that the client translates (S-13, #15). These tests keep the catalog
/// honest: codes are snake_case and unique, the developer text is English, and every UI dictionary
/// (<c>mktba.react/src/localization/locales/*/shared.json</c>, section <c>apiErrors</c>) translates
/// every code, interpolating only parameters the code carries.
/// </summary>
public class AppErrorCatalogTests
{
    private static readonly Regex SnakeCase = new("^[a-z][a-z0-9]*(_[a-z0-9]+)*$", RegexOptions.CultureInvariant);
    private static readonly Regex Placeholder = new(@"\{(\w+)\}", RegexOptions.CultureInvariant);
    private static readonly Regex Cyrillic = new(@"\p{IsCyrillic}", RegexOptions.CultureInvariant);

    [Fact]
    public void GivenTheCatalog_WhenRead_ThenEveryCodeIsSnakeCaseAndUnique()
    {
        var errors = Catalog();

        errors.Should().NotBeEmpty();
        errors.Select(error => error.Code).Should().OnlyContain(code => SnakeCase.IsMatch(code));
        errors.Select(error => error.Code).Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public void GivenTheCatalog_WhenRead_ThenMessagesAreEnglishForDevelopersOnly()
    {
        foreach (var error in Catalog())
        {
            error.Message.Should().NotBeNullOrWhiteSpace(error.Code);
            Cyrillic.IsMatch(error.Message).Should().BeFalse($"{error.Code} is shown to users only through its code");
            (error.Params ?? new Dictionary<string, object?>()).Keys.Should().NotContain(key => Cyrillic.IsMatch(key), error.Code);
        }
    }

    [Fact]
    public void GivenEveryUiDictionary_WhenRead_ThenItTranslatesEveryCodeWithItsOwnParams()
    {
        var dictionaries = Directory.GetDirectories(Path.Combine(RepositoryRoot(), "mktba.react", "src", "localization", "locales"))
            .Select(directory => Path.Combine(directory, "shared.json"))
            .Where(File.Exists)
            .ToList();
        dictionaries.Should().NotBeEmpty();

        foreach (var path in dictionaries)
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            var messages = document.RootElement.GetProperty("apiErrors");
            foreach (var error in Catalog())
            {
                messages.TryGetProperty(error.Code, out var message).Should().BeTrue($"{path} must translate {error.Code}");
                var placeholders = Placeholder.Matches(message.GetString()!).Select(match => match.Groups[1].Value);
                placeholders.Should().BeSubsetOf(
                    error.Params?.Keys ?? Enumerable.Empty<string>(), $"{path} may interpolate only the params {error.Code} carries");
            }
        }
    }

    /// <summary>
    /// Every entry of <see cref="AppErrors"/>: the properties, and the factories called with sample
    /// arguments (only the code and the parameter names matter here).
    /// </summary>
    private static List<AppError> Catalog()
        => typeof(AppErrors)
            .GetMembers(BindingFlags.Public | BindingFlags.Static)
            .SelectMany(member => member switch
            {
                PropertyInfo { PropertyType: var type } property when type == typeof(AppError) => [(AppError)property.GetValue(null)!],
                MethodInfo { ReturnType: var type, IsSpecialName: false } method when type == typeof(AppError) =>
                    new[] { (AppError)method.Invoke(null, method.GetParameters().Select(SampleArgument).ToArray())! },
                _ => Array.Empty<AppError>(),
            })
            .ToList();

    private static object? SampleArgument(ParameterInfo parameter)
        => parameter.ParameterType == typeof(string) ? "sample"
            : parameter.ParameterType.IsValueType ? Activator.CreateInstance(parameter.ParameterType)
            : null;

    private static string RepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            if (File.Exists(Path.Combine(directory.FullName, "Mktba.sln")))
            {
                return directory.FullName;
            }
        }

        throw new InvalidOperationException("Mktba.sln not found above the test output directory.");
    }
}
