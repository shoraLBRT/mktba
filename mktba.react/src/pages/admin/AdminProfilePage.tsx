import React, { useRef, useState, type ReactNode } from 'react';
import { ExternalLink, Plus, Trash2, Upload } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NoticeBanner } from '../../components/admin/NoticeBanner';
import { useNotice } from '../../components/admin/useNotice';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { getMyProfile, updateMyProfile, uploadAvatar } from '../../services/profileService';
import { useSiteUrl } from '../../app/siteUrl';
import { toApiError } from '../../shared/api-client/apiError';
import {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_DEGREE_MAX_LENGTH,
  PROFILE_DISPLAY_NAME_MAX_LENGTH,
  PROFILE_INSTITUTION_MAX_LENGTH,
  PROFILE_LINK_LABEL_MAX_LENGTH,
  PROFILE_LINK_URL_MAX_LENGTH,
  PROFILE_MAX_LINKS,
  buildProfileDto,
  effectiveProfileSlug,
  findProfileDraftProblems,
  profileDraftFromDto,
  profileFieldOfApiError,
  profileSlugFromName,
  type ProfileDraft,
  type ProfileFieldKey,
} from '../../shared/profile';
import { SLUG_MAX_LENGTH, authorHref } from '../../shared/slug';
import { SOCIAL_IMAGE_URL_MAX_LENGTH } from '../../shared/seo';
import { findUploadFileProblem, UPLOAD_IMAGE_ACCEPT, UPLOAD_MAX_BYTES } from '../../shared/upload';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Input } from '../../shared/ui/Input';
import { Textarea } from '../../shared/ui/Textarea';
import { ActivityChartCard } from './ActivityChartCard';
import { NotificationSettingsCard } from './NotificationSettingsCard';

const fieldId = (key: ProfileFieldKey) => `profile-${key}`;
const errorId = (key: ProfileFieldKey) => `profile-${key}-error`;


const Field = ({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) => (
  <label className="block">
    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">{label}</span>
    {children}
    {hint ? <span className="mt-1 block text-xs text-[var(--color-ink-muted)]">{hint}</span> : null}
  </label>
);

/**
 * `/admin/profile`: the signed-in user's own profile (U-07, #72; P-05, #93) — what the public author
 * page (P-01, #89) and the article's author line (P-06, #94) show. Problems are shown at their
 * fields (the client checks mirror `UserProfileRules`; the API's slug and avatar refusals land there
 * too), and the address the page will have is previewed as it is typed.
 */
const AdminProfilePage: React.FC = () => {
  const locale = useLocale();
  const t = locale.profilePage;
  const queryClient = useQueryClient();
  const { notice, showNotice, clearNotice } = useNotice();
  const siteUrl = useSiteUrl();
  const [draftOverride, setDraftOverride] = useState<ProfileDraft | null>(null);
  // Field problems are shown from the first save attempt on, then follow every edit.
  const [checked, setChecked] = useState(false);
  const [apiFieldError, setApiFieldError] = useState<{ key: ProfileFieldKey; message: string } | null>(null);

  const profileQuery = useQuery({ queryKey: [APP_CONSTANTS.QUERY_KEYS.MY_PROFILE], queryFn: getMyProfile });
  const draft = draftOverride ?? profileDraftFromDto(profileQuery.data);
  const change = (patch: Partial<ProfileDraft>) => {
    setDraftOverride({ ...draft, ...patch });
    setApiFieldError(null);
  };
  const changeLink = (index: number, patch: Partial<ProfileDraft['links'][number]>) =>
    change({ links: draft.links.map((link, position) => (position === index ? { ...link, ...patch } : link)) });

  const saveMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (saved) => {
      queryClient.setQueryData([APP_CONSTANTS.QUERY_KEYS.MY_PROFILE], saved);
      void queryClient.invalidateQueries({ queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_USERS] });
      setDraftOverride(null);
      setChecked(false);
      showNotice('success', t.saved);
    },
    onError: (error) => {
      const apiError = toApiError(error);
      const key = profileFieldOfApiError(apiError.code);
      if (key) {
        setApiFieldError({ key, message: apiError.message });
        clearNotice();
        document.getElementById(fieldId(key))?.focus();
        return;
      }

      showNotice('error', `${t.saveFailed}: ${apiError.message}`);
    },
  });

  // The upload only stores the image (U-08): its address goes into the field and is saved with the profile.
  const avatarFileInput = useRef<HTMLInputElement>(null);
  const uploadMutation = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (uploaded) => {
      setDraftOverride((current) => ({ ...(current ?? profileDraftFromDto(profileQuery.data)), avatarUrl: uploaded.url }));
      showNotice('success', t.avatarUploaded);
    },
    onError: (error) => showNotice('error', `${t.avatarUploadFailed}: ${(error as Error).message}`),
  });

  const pickAvatar = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared, so picking the same file again after an error is a change too.
    event.target.value = '';
    if (!file) return;

    const problem = findUploadFileProblem(file);
    if (problem) {
      showNotice(
        'warning',
        problem === 'tooLarge'
          ? formatMessage(t.avatarTooLarge, { max: UPLOAD_MAX_BYTES / (1024 * 1024) })
          : t.avatarTypeUnsupported,
      );
      return;
    }

    uploadMutation.mutate(file);
  };

  const problems = findProfileDraftProblems(draft);
  const errorOf = (key: ProfileFieldKey): string | undefined => {
    if (apiFieldError?.key === key) return apiFieldError.message;
    const problem = checked ? problems[key] : undefined;
    return problem ? t.errors[problem] : undefined;
  };
  /** The id, `aria-invalid` and `aria-describedby` of the input whose problem `fieldError` renders. */
  const fieldA11y = (key: ProfileFieldKey) => {
    const error = errorOf(key);
    return { id: fieldId(key), 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? errorId(key) : undefined };
  };
  const fieldError = (key: ProfileFieldKey) => {
    const error = errorOf(key);
    return error ? (
      <span id={errorId(key)} className="mt-1 block text-xs font-medium text-red-700">
        {error}
      </span>
    ) : null;
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    setChecked(true);
    const firstProblem = Object.keys(problems)[0] as ProfileFieldKey | undefined;
    if (firstProblem) {
      clearNotice();
      document.getElementById(fieldId(firstProblem))?.focus();
      return;
    }

    saveMutation.mutate(buildProfileDto(draft));
  };

  const derivedSlug = draft.displayName.trim() ? profileSlugFromName(draft.displayName) : '';
  const savedSlug = profileQuery.data?.slug ?? null;
  const pageSlug = effectiveProfileSlug(draft, savedSlug);
  const publicPageHref = profileQuery.data?.isPublic && savedSlug ? authorHref(savedSlug) : null;
  const visibility = !profileQuery.data?.displayName
    ? t.visibilityNoName
    : profileQuery.data.isPublic
      ? t.visibilityPublic
      : t.visibilityNoArticles;

  return (
    <div className="space-y-4">
      <NoticeBanner notice={notice} onClose={clearNotice} />

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink-strong)]">{t.title}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.description}</p>
      </div>

      {profileQuery.isError ? (
        <Card className="p-6 text-sm text-red-700">{t.loadFailed}</Card>
      ) : (
        <Card className="p-6">
          <form onSubmit={save} aria-busy={profileQuery.isLoading}>
            {/* Nothing can be typed until the saved profile is in: text typed earlier would be overwritten or glued to it. */}
            <fieldset disabled={profileQuery.isLoading} className="m-0 min-w-0 space-y-5 border-0 p-0">
              <p data-testid="profile-visibility" className="rounded-lg bg-[var(--color-surface-muted)] p-4 text-sm text-[var(--color-ink-default)]">
                {visibility}
                {publicPageHref ? (
                  <>
                    {' '}
                    <a
                      href={publicPageHref}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 font-medium text-[var(--color-brand-forest)] underline"
                    >
                      {t.openPublicPage}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </>
                ) : null}
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t.displayName} hint={t.displayNameHint}>
                  <Input
                    name="profile-display-name"
                    autoComplete="name"
                    maxLength={PROFILE_DISPLAY_NAME_MAX_LENGTH}
                    value={draft.displayName}
                    onChange={(event) => change({ displayName: event.target.value })}
                  />
                </Field>
                <Field
                  label={t.slug}
                  hint={
                    <>
                      {t.slugHint}
                      {pageSlug && !problems.slug ? (
                        <span data-testid="profile-address-preview" className="mt-1 block break-all font-mono text-[var(--color-ink-default)]">
                          {formatMessage(t.publicAddress, { url: `${siteUrl}${authorHref(pageSlug)}` })}
                        </span>
                      ) : null}
                    </>
                  }
                >
                  <Input
                    {...fieldA11y('slug')}
                    name="profile-slug"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={SLUG_MAX_LENGTH}
                    value={draft.slug}
                    placeholder={derivedSlug}
                    onChange={(event) => change({ slug: event.target.value })}
                  />
                  {fieldError('slug')}
                </Field>
              </div>

              <div className="flex items-start gap-4">
                {draft.avatarUrl.trim() ? (
                  <img
                    src={draft.avatarUrl.trim()}
                    alt={t.avatarPreviewAlt}
                    width={64}
                    height={64}
                    referrerPolicy="no-referrer"
                    data-testid="profile-avatar-preview"
                    className="h-16 w-16 shrink-0 rounded-full border border-[var(--color-border-soft)] object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1 space-y-2">
                  <Field label={t.avatarUrl} hint={t.avatarUrlHint}>
                    <Input
                      {...fieldA11y('avatarUrl')}
                      name="profile-avatar-url"
                      autoComplete="off"
                      inputMode="url"
                      maxLength={SOCIAL_IMAGE_URL_MAX_LENGTH}
                      value={draft.avatarUrl}
                      onChange={(event) => change({ avatarUrl: event.target.value })}
                    />
                    {fieldError('avatarUrl')}
                  </Field>
                  <input
                    ref={avatarFileInput}
                    type="file"
                    accept={UPLOAD_IMAGE_ACCEPT}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                    data-testid="profile-avatar-file"
                    onChange={pickAvatar}
                  />
                  <Button
                    type="button"
                    disabled={uploadMutation.isPending}
                    onClick={() => avatarFileInput.current?.click()}
                  >
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    {uploadMutation.isPending ? t.avatarUploading : t.avatarUpload}
                  </Button>
                </div>
              </div>

              <Field label={t.bio} hint={formatMessage(t.bioHint, { max: PROFILE_BIO_MAX_LENGTH })}>
                <Textarea
                  name="profile-bio"
                  rows={5}
                  maxLength={PROFILE_BIO_MAX_LENGTH}
                  value={draft.bio}
                  onChange={(event) => change({ bio: event.target.value })}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t.degree} hint={t.scholarFieldsHint}>
                  <Input
                    name="profile-degree"
                    autoComplete="off"
                    maxLength={PROFILE_DEGREE_MAX_LENGTH}
                    value={draft.degree}
                    onChange={(event) => change({ degree: event.target.value })}
                  />
                </Field>
                <Field label={t.institution}>
                  <Input
                    name="profile-institution"
                    autoComplete="organization"
                    maxLength={PROFILE_INSTITUTION_MAX_LENGTH}
                    value={draft.institution}
                    onChange={(event) => change({ institution: event.target.value })}
                  />
                </Field>
              </div>

              <fieldset className="space-y-3">
                <legend className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">
                  {t.links}
                </legend>
                <p className="text-xs text-[var(--color-ink-muted)]">{formatMessage(t.linksHint, { max: PROFILE_MAX_LINKS })}</p>
                {draft.links.map((link, index) => (
                  // The rows have no identity of their own: they are edited in place and removed by position.
                  <div key={index} className="flex flex-wrap items-start gap-2">
                    <div className="w-full sm:w-48">
                      <Input
                        {...fieldA11y(`linkLabel${index}`)}
                        aria-label={formatMessage(t.linkLabel, { number: index + 1 })}
                        placeholder={t.linkLabelPlaceholder}
                        maxLength={PROFILE_LINK_LABEL_MAX_LENGTH}
                        value={link.label}
                        onChange={(event) => changeLink(index, { label: event.target.value })}
                      />
                      {fieldError(`linkLabel${index}`)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Input
                        {...fieldA11y(`linkUrl${index}`)}
                        aria-label={formatMessage(t.linkUrl, { number: index + 1 })}
                        placeholder={t.linkUrlPlaceholder}
                        inputMode="url"
                        maxLength={PROFILE_LINK_URL_MAX_LENGTH}
                        value={link.url}
                        onChange={(event) => changeLink(index, { url: event.target.value })}
                      />
                      {fieldError(`linkUrl${index}`)}
                    </div>
                    <Button
                      variant="ghost"
                      aria-label={formatMessage(t.removeLink, { number: index + 1 })}
                      onClick={() => change({ links: draft.links.filter((_, position) => position !== index) })}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
                {draft.links.length < PROFILE_MAX_LINKS ? (
                  <Button onClick={() => change({ links: [...draft.links, { label: '', url: '' }] })}>
                    <Plus size={16} />
                    {t.addLink}
                  </Button>
                ) : null}
              </fieldset>

              <Button type="submit" variant="primary" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? t.saving : t.save}
              </Button>
            </fieldset>
          </form>
        </Card>
      )}

      <NotificationSettingsCard />

      <ActivityChartCard />
    </div>
  );
};

export default AdminProfilePage;
