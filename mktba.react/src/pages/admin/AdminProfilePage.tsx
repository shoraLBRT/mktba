import React, { useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NoticeBanner } from '../../components/admin/NoticeBanner';
import { useNotice } from '../../components/admin/useNotice';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { getMyProfile, updateMyProfile } from '../../services/profileService';
import {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_DEGREE_MAX_LENGTH,
  PROFILE_DISPLAY_NAME_MAX_LENGTH,
  PROFILE_INSTITUTION_MAX_LENGTH,
  PROFILE_LINK_LABEL_MAX_LENGTH,
  PROFILE_LINK_URL_MAX_LENGTH,
  PROFILE_MAX_LINKS,
  buildProfileDto,
  profileDraftFromDto,
  profileSlugFromName,
  validateProfileDraft,
  type ProfileDraft,
} from '../../shared/profile';
import { SLUG_MAX_LENGTH } from '../../shared/slug';
import { SOCIAL_IMAGE_URL_MAX_LENGTH } from '../../shared/seo';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Input } from '../../shared/ui/Input';
import { Textarea } from '../../shared/ui/Textarea';

const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <label className="block">
    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">{label}</span>
    {children}
    {hint ? <span className="mt-1 block text-xs text-[var(--color-ink-muted)]">{hint}</span> : null}
  </label>
);

/**
 * `/admin/profile`: the signed-in user's own profile (U-07, #72) — the minimal form that fills in
 * what the public author page (P-01, #89) and the article's author line (P-06, #94) will show.
 */
const AdminProfilePage: React.FC = () => {
  const locale = useLocale();
  const t = locale.profilePage;
  const queryClient = useQueryClient();
  const { notice, showNotice, clearNotice } = useNotice();
  const [draftOverride, setDraftOverride] = useState<ProfileDraft | null>(null);

  const profileQuery = useQuery({ queryKey: [APP_CONSTANTS.QUERY_KEYS.MY_PROFILE], queryFn: getMyProfile });
  const draft = draftOverride ?? profileDraftFromDto(profileQuery.data);
  const change = (patch: Partial<ProfileDraft>) => setDraftOverride({ ...draft, ...patch });
  const changeLink = (index: number, patch: Partial<ProfileDraft['links'][number]>) =>
    change({ links: draft.links.map((link, position) => (position === index ? { ...link, ...patch } : link)) });

  const saveMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (saved) => {
      queryClient.setQueryData([APP_CONSTANTS.QUERY_KEYS.MY_PROFILE], saved);
      void queryClient.invalidateQueries({ queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_USERS] });
      setDraftOverride(null);
      showNotice('success', t.saved);
    },
    onError: (error) => showNotice('error', `${t.saveFailed}: ${(error as Error).message}`),
  });

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validateProfileDraft(draft);
    if (problem) {
      showNotice('warning', t.errors[problem]);
      return;
    }

    saveMutation.mutate(buildProfileDto(draft));
  };

  const derivedSlug = draft.displayName.trim() ? profileSlugFromName(draft.displayName) : '';
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
                <Field label={t.slug} hint={t.slugHint}>
                  <Input
                    name="profile-slug"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={SLUG_MAX_LENGTH}
                    value={draft.slug}
                    placeholder={derivedSlug}
                    onChange={(event) => change({ slug: event.target.value })}
                  />
                </Field>
              </div>

              <Field label={t.avatarUrl} hint={t.avatarUrlHint}>
                <Input
                  name="profile-avatar-url"
                  autoComplete="off"
                  inputMode="url"
                  maxLength={SOCIAL_IMAGE_URL_MAX_LENGTH}
                  value={draft.avatarUrl}
                  onChange={(event) => change({ avatarUrl: event.target.value })}
                />
              </Field>

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
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <Input
                      className="sm:w-48"
                      aria-label={formatMessage(t.linkLabel, { number: index + 1 })}
                      placeholder={t.linkLabelPlaceholder}
                      maxLength={PROFILE_LINK_LABEL_MAX_LENGTH}
                      value={link.label}
                      onChange={(event) => changeLink(index, { label: event.target.value })}
                    />
                    <Input
                      className="min-w-0 flex-1"
                      aria-label={formatMessage(t.linkUrl, { number: index + 1 })}
                      placeholder={t.linkUrlPlaceholder}
                      inputMode="url"
                      maxLength={PROFILE_LINK_URL_MAX_LENGTH}
                      value={link.url}
                      onChange={(event) => changeLink(index, { url: event.target.value })}
                    />
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
    </div>
  );
};

export default AdminProfilePage;
