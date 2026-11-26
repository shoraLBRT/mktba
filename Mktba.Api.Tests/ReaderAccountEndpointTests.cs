using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Application.Services.Accounts;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>
/// U-05 (#126): a reader signs up, signs in before confirming, confirms the address, and resets a
/// forgotten password; nothing tells a caller whether an address has an account.
/// </summary>
public sealed class ReaderAccountEndpointTests : IClassFixture<MktbaApiFactory>
{
    private const string Password = "a long reader passphrase";
    private readonly MktbaApiFactory _factory;

    public ReaderAccountEndpointTests(MktbaApiFactory factory) => _factory = factory;

    [Fact]
    public async Task GivenANewAddress_WhenAReaderSignsUpAndConfirms_ThenTheyAreAConfirmedReader()
    {
        await RoleClients.CreateUserAsync(_factory, UserRole.Admin);
        var email = NewEmail();

        var signUp = await SignUpAsync(new { Email = email, Password });

        signUp.StatusCode.Should().Be(HttpStatusCode.Accepted);
        signUp.Headers.Contains("Set-Cookie").Should().BeFalse("sign-up does not sign in");
        var reader = await SignInAsync(email, Password);
        var me = await reader.GetFromJsonAsync<CurrentUserDto>("/auth/me", ApiJson.Options);
        me!.Role.Should().Be(UserRole.Reader);
        me.EmailConfirmed.Should().BeFalse();
        var application = await reader.GetFromJsonAsync<MyScholarApplicationDto>("/scholar-application", ApiJson.Options);
        application!.CanApply.Should().BeFalse("an unconfirmed reader does not apply");

        var token = await TokenSentToAsync(email, "/confirm-email");
        var confirm = await _factory.CreateClient().PostAsJsonAsync("/auth/confirm-email", new { Token = token });
        var again = await _factory.CreateClient().PostAsJsonAsync("/auth/confirm-email", new { Token = token });

        confirm.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await reader.GetFromJsonAsync<CurrentUserDto>("/auth/me", ApiJson.Options))!.EmailConfirmed.Should().BeTrue();
        (await reader.GetFromJsonAsync<MyScholarApplicationDto>("/scholar-application", ApiJson.Options))!.CanApply.Should().BeTrue();
        again.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(again)).Should().Be("account_token_invalid");
    }

    [Fact]
    public async Task GivenAKnownAddress_WhenSomeoneSignsUpWithIt_ThenTheAnswerIsTheSameAndTheAccountIsUntouched()
    {
        var (email, _) = await RoleClients.CreateUserAsync(_factory, UserRole.Author);

        var signUp = await SignUpAsync(new { Email = email, Password });

        signUp.StatusCode.Should().Be(HttpStatusCode.Accepted);
        (await _factory.CreateClient().PostAsJsonAsync("/auth/login", new { Email = email, Password })).StatusCode
            .Should().Be(HttpStatusCode.BadRequest, "the sign-up did not change the password");
        var me = await (await SignInAsync(email, RoleClients.Password)).GetFromJsonAsync<CurrentUserDto>("/auth/me", ApiJson.Options);
        me!.Role.Should().Be(UserRole.Author);
        await SendEmailsAsync();
        var note = _factory.Emails.Sent.Single(message => message.To == email);
        note.Subject.Should().Contain("Попытка регистрации");
        note.TextBody.Should().NotContain("#token=");
    }

    [Fact]
    public async Task GivenTheTrapFieldFilledIn_WhenABotSignsUp_ThenItIsAnsweredAsUsualAndNothingIsStored()
    {
        await RoleClients.CreateUserAsync(_factory, UserRole.Admin);
        var email = NewEmail();

        var signUp = await SignUpAsync(new { Email = email, Password, Website = "https://spam.example" });

        signUp.StatusCode.Should().Be(HttpStatusCode.Accepted);
        (await _factory.CreateClient().PostAsJsonAsync("/auth/login", new { Email = email, Password })).StatusCode
            .Should().Be(HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData("not-an-email", "a long reader passphrase", "email_invalid")]
    [InlineData("", "a long reader passphrase", "email_and_password_required")]
    [InlineData("reader@mktba.test", "short", "password_too_short")]
    public async Task GivenABadSignUp_WhenSent_ThenItIsRefusedAtTheField(string email, string password, string code)
    {
        await RoleClients.CreateUserAsync(_factory, UserRole.Admin);

        var signUp = await SignUpAsync(new { Email = email, Password = password });

        signUp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(signUp)).Should().Be(code);
    }

    [Fact]
    public async Task GivenNoUserYet_WhenSomeoneSignsUp_ThenItIsClosedUntilTheFirstAdminRegisters()
    {
        using var factory = new MktbaApiFactory();
        var client = factory.CreateClient();

        var status = await client.GetFromJsonAsync<AdminAuthStatusDto>("/auth/status", ApiJson.Options);
        var signUp = await client.PostAsJsonAsync("/auth/sign-up", new { Email = NewEmail(), Password });

        status!.ReaderSignUpEnabled.Should().BeFalse();
        signUp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await ApiJson.ReadCodeAsync(signUp)).Should().Be("reader_sign_up_closed");

        var register = await client.PostAsJsonAsync("/auth/register", new { Email = NewEmail(), Password });
        register.EnsureSuccessStatusCode();
        var auth = await register.Content.ReadFromJsonAsync<AdminAuthResponseDto>(ApiJson.Options);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.AccessToken);
        (await client.GetFromJsonAsync<CurrentUserDto>("/auth/me", ApiJson.Options))!.EmailConfirmed
            .Should().BeTrue("the first admin needs no confirmation");
        (await client.GetFromJsonAsync<AdminAuthStatusDto>("/auth/status", ApiJson.Options))!.ReaderSignUpEnabled.Should().BeTrue();
    }

    [Fact]
    public async Task GivenAForgottenPassword_WhenTheReaderResetsIt_ThenTheNewOneWorksAndEverySessionEnded()
    {
        await RoleClients.CreateUserAsync(_factory, UserRole.Admin);
        var email = NewEmail();
        (await SignUpAsync(new { Email = email, Password })).EnsureSuccessStatusCode();
        var signedIn = await SignInAsync(email, Password);

        var request = await _factory.CreateClient().PostAsJsonAsync("/auth/password-reset", new { Email = email.ToUpperInvariant() });
        var token = await TokenSentToAsync(email, "/reset-password");
        var weak = await _factory.CreateClient().PostAsJsonAsync("/auth/password-reset/confirm", new { Token = token, Password = "short" });
        var reset = await _factory.CreateClient().PostAsJsonAsync(
            "/auth/password-reset/confirm", new { Token = token, Password = "a brand new passphrase" });

        request.StatusCode.Should().Be(HttpStatusCode.Accepted);
        weak.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(weak)).Should().Be("password_too_short");
        reset.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await signedIn.GetAsync("/auth/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized, "the reset ended the old session");
        (await _factory.CreateClient().PostAsJsonAsync("/auth/login", new { Email = email, Password })).StatusCode
            .Should().Be(HttpStatusCode.BadRequest);
        var me = await (await SignInAsync(email, "a brand new passphrase")).GetFromJsonAsync<CurrentUserDto>("/auth/me", ApiJson.Options);
        me!.EmailConfirmed.Should().BeTrue("the reset link proved the address");
        var reused = await _factory.CreateClient().PostAsJsonAsync(
            "/auth/password-reset/confirm", new { Token = token, Password = "yet another passphrase" });
        (await ApiJson.ReadCodeAsync(reused)).Should().Be("account_token_invalid");
    }

    [Fact]
    public async Task GivenAnUnknownAddress_WhenAResetIsAsked_ThenTheAnswerIsTheSameAndNothingIsSent()
    {
        var email = NewEmail();

        var request = await _factory.CreateClient().PostAsJsonAsync("/auth/password-reset", new { Email = email });
        await SendEmailsAsync();

        request.StatusCode.Should().Be(HttpStatusCode.Accepted);
        _factory.Emails.Sent.Should().NotContain(message => message.To == email);
    }

    [Fact]
    public async Task GivenAnUnconfirmedReader_WhenTheyAskAgainPastTheCap_ThenTheyAreToldToWait()
    {
        await RoleClients.CreateUserAsync(_factory, UserRole.Admin);
        var email = NewEmail();
        (await SignUpAsync(new { Email = email, Password })).EnsureSuccessStatusCode();
        var reader = await SignInAsync(email, Password);

        var first = await reader.PostAsync("/auth/confirm-email/resend", null);
        var second = await reader.PostAsync("/auth/confirm-email/resend", null);
        var third = await reader.PostAsync("/auth/confirm-email/resend", null);

        first.StatusCode.Should().Be(HttpStatusCode.Accepted);
        second.StatusCode.Should().Be(HttpStatusCode.Accepted);
        third.StatusCode.Should().Be((HttpStatusCode)429, "the sign-up's email and two more reach the cap of three");
        (await ApiJson.ReadCodeAsync(third)).Should().Be("account_email_limit_reached");
    }

    private Task<HttpResponseMessage> SignUpAsync(object body) => _factory.CreateClient().PostAsJsonAsync("/auth/sign-up", body);

    private async Task<HttpClient> SignInAsync(string email, string password)
    {
        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/auth/login", new { Email = email, Password = password });
        login.EnsureSuccessStatusCode();
        var auth = await login.Content.ReadFromJsonAsync<AdminAuthResponseDto>(ApiJson.Options);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.AccessToken);
        return client;
    }

    private async Task SendEmailsAsync()
    {
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<AccountEmailService>().SendDueAsync();
    }

    /// <summary>The token of the newest email to <paramref name="email"/> linking to <paramref name="path"/>.</summary>
    private async Task<string> TokenSentToAsync(string email, string path)
    {
        await SendEmailsAsync();
        var body = _factory.Emails.Sent.Last(message => message.To == email && message.TextBody.Contains(path + "#token=")).TextBody;
        var marker = path + "#token=";
        return body[(body.IndexOf(marker, StringComparison.Ordinal) + marker.Length)..].Split('\n')[0];
    }

    private static string NewEmail() => $"reader-{Guid.NewGuid():N}@mktba.test";
}
