import React, { useMemo, useRef, useState, type SetStateAction } from 'react';
import { FileText } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import MarkdownContent from '../components/MarkdownContent';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { useLocale } from '../localization/hooks';
import { createArticleContent, getArticleContentById, updateArticleContent } from '../services/Article/articleService';
import { useNavigationTree } from '../hooks/useNavigationTree';
import { invalidateArticleQueries } from '../app/queryClient';
import { deleteArticle, getAiProviderSettings, styleMarkdownWithAi } from '../services/adminService';
import { Card } from '../shared/ui/Card';
import { Input } from '../shared/ui/Input';
import type { ArticleInfoboxDto, NavigationArticleDto } from '../shared/types/ApiTypes';
import { createCustomSchool, deleteCustomSchool, getSchoolsByArticleId, getSystemSchools } from '../services/schoolService';
import { ArticleInfoboxPanel } from '../components/article/ArticleInfoboxPanel';
import { ArticleAuthorsPanel } from '../components/article/ArticleAuthorsPanel';
import { ArticleStatusPanel } from '../components/article/ArticleStatusPanel';
import { DocumentBlockEditor } from './add-article/DocumentBlockEditor';
import { EditorBottomToolbar, type FormatAction } from './add-article/EditorBottomToolbar';
import { EditorHelpRail } from './add-article/EditorHelpRail';
import { InfoboxEditor } from './add-article/InfoboxEditor';
import { EditorOutlineRail } from './add-article/EditorOutlineRail';
import { EditorToolbar } from './add-article/EditorToolbar';
import { AiRunningOverlay, DeleteArticleDialog, EditorNotice, ImportMarkdownDialog, type EditorNoticeValue } from './add-article/EditorDialogs';
import { getAiAvailability } from './add-article/aiAvailability';
import { useCurrentUser } from '../auth/useCurrentUser';
import {
  addVersionToBlock,
  buildDocumentPreviewMarkdown,
  collectWholeArticleAiTargets,
  setOpinionSchools,
  setOpinionSources,
  convertParagraphToVersioned,
  convertVersionedToParagraph,
  deleteBlock,
  importBlocksFromMarkdown,
  insertBlockAfter,
  moveBlock,
  removeVersionFromBlock,
  setDefaultVersion,
  updatePlainBlockContent,
  updateVersionContent,
} from './add-article/draftHelpers';
import { addInfoboxField, buildInfoboxCreateDto, moveInfoboxField, removeInfoboxField, updateInfoboxField } from './add-article/infoboxHelpers';
import { addRelatedLink, moveRelatedLink, removeRelatedLink } from './add-article/metadataHelpers';
import type { EditorBlock } from './add-article/types';
import {
  applyAiStyledTexts,
  buildArticleCreateDto,
  buildArticleUpdateDto,
  displayedSlug,
  findArticleDraftProblem,
  initialArticleDraft,
  type ArticleDraft,
  type ArticleDraftProblem,
  type ArticleEditorMode,
  type AiStyledText,
} from './add-article/articleDraft';
import { computeEditorStats } from './add-article/editorStats';
import { applyMarkdownFormat } from './add-article/markdownFormat';
import { SlugField } from './add-article/SlugField';
import { SeoFields } from './add-article/SeoFields';
import { formatMessage } from '../localization';
import { SLUG_MAX_LENGTH, articleHref, articleSlugFromTitle } from '../shared/slug';

type EditorTarget = {
  blockId: string;
  localId: string | null;
};

type ArticleOption = {
  id: number;
  title: string;
  path: string;
};

const targetKey = (blockId: string, localId: string | null) => `${blockId}:${localId ?? 'plain'}`;

const getTargetValue = (blocks: EditorBlock[], target: EditorTarget): string | null => {
  const block = blocks.find((item) => item.id === target.blockId);
  if (!block) {
    return null;
  }

  if (block.kind === 'versioned') {
    return block.variants.find((variant) => variant.localId === target.localId)?.content ?? null;
  }

  return block.content;
};

const flattenNavigationTree = (nodes: NavigationArticleDto[], parentTitles: string[] = []): ArticleOption[] =>
  nodes.flatMap((node) => {
    const titles = [...parentTitles, node.title];
    return [
      { id: node.id, title: node.title, path: titles.join(' / ') },
      ...flattenNavigationTree(node.children ?? [], titles),
    ];
  });

const findNodeInTree = (nodes: NavigationArticleDto[], id: number): NavigationArticleDto | null => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeInTree(node.children ?? [], id);
    if (found) return found;
  }
  return null;
};

/**
 * The article's own schools (custom schools scoped to it). A new article has none yet, so its
 * editor offers the system schools only and no custom-school management.
 */
const useArticleSchools = (articleId: number | null, onError: (message: string) => void) => {
  const queryClient = useQueryClient();
  const queryKey = [APP_CONSTANTS.QUERY_KEYS.ARTICLE_SCHOOLS, articleId];

  const systemSchoolsQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.SYSTEM_SCHOOLS],
    queryFn: getSystemSchools,
  });

  const articleSchoolsQuery = useQuery({
    queryKey,
    queryFn: () => getSchoolsByArticleId(articleId!),
    enabled: articleId !== null,
  });

  const addMutation = useMutation({
    mutationFn: (payload: { name: string; shortName: string }) =>
      createCustomSchool({
        slug: `custom-${articleId}-${payload.name.toLowerCase().replace(/\s+/g, '-')}`,
        name: payload.name,
        shortName: payload.shortName,
        articleScopeId: articleId!,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => onError((error as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomSchool,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => onError((error as Error).message),
  });

  const articleSchools = articleSchoolsQuery.data ?? [];
  return {
    available: [...(systemSchoolsQuery.data ?? []), ...articleSchools],
    custom: articleSchools.filter((school) => !school.isSystem),
    add: (name: string, shortName: string) => addMutation.mutate({ name, shortName }),
    remove: (id: number) => deleteMutation.mutate(id),
  };
};

/**
 * The article editor for both a new article (`mode.kind === 'create'`) and an existing one.
 * Everything the user edits is one `ArticleDraft`; what differs by mode is spelled out where it
 * happens: the parent picker is for a new article, revisions, status, authorship, custom schools
 * and deletion exist only for a saved one.
 */
const ArticleEditor: React.FC<{ mode: ArticleEditorMode }> = ({ mode }) => {
  const locale = useLocale();
  const { can } = useCurrentUser();
  // AI settings and styling are admin-only (CanConfigure); other roles keep the AI button off.
  const canConfigure = can('canConfigure');
  // Authorship and deletion stay admin-only even on an author's own article (U-02); the API enforces it.
  const canEditAnyArticle = can('canEditAnyArticle');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const t = locale.addArticlePage;
  const editT = locale.editArticlePage;
  const editorText = locale.addArticleEditor;
  const articleId = mode.kind === 'edit' ? mode.article.id : null;

  const [draft, setDraft] = useState(() => initialArticleDraft(mode));
  const setField = <K extends keyof ArticleDraft>(key: K, value: SetStateAction<ArticleDraft[K]>) =>
    setDraft((current) => ({
      ...current,
      [key]: typeof value === 'function' ? (value as (previous: ArticleDraft[K]) => ArticleDraft[K])(current[key]) : value,
    }));
  const setBlocks = (value: SetStateAction<EditorBlock[]>) => setField('blocks', value);
  const { title, blocks, infobox } = draft;

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [notice, setNotice] = useState<EditorNoticeValue | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [activeTarget, setActiveTarget] = useState<EditorTarget | null>(null);
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [isParentDropdownOpen, setIsParentDropdownOpen] = useState(false);
  const [parentSearch, setParentSearch] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const editorRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const blockRefs = useRef<Record<string, HTMLElement | null>>({});

  const showNotice = (tone: EditorNoticeValue['tone'], message: string) => {
    setNotice({ tone, message });
  };

  const aiSettingsQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_AI_SETTINGS],
    queryFn: getAiProviderSettings,
    enabled: canConfigure,
  });
  const schools = useArticleSchools(articleId, (message) => showNotice('error', message));
  const navigationTreeQuery = useNavigationTree();

  const aiAvailability = getAiAvailability(aiSettingsQuery.data);
  const canUseAi = aiAvailability === 'ready';
  const isLocked = isAiRunning;

  const articleOptions = useMemo(
    () => flattenNavigationTree(navigationTreeQuery.data ?? []),
    [navigationTreeQuery.data],
  );
  const selectedParent = useMemo(
    () => articleOptions.find((option) => option.id === draft.parentArticleId) ?? null,
    [draft.parentArticleId, articleOptions],
  );
  const filteredParentOptions = useMemo(() => {
    const query = parentSearch.trim().toLowerCase();
    if (!query) {
      return articleOptions;
    }

    return articleOptions.filter(
      (option) =>
        option.title.toLowerCase().includes(query) ||
        option.path.toLowerCase().includes(query) ||
        option.id.toString().includes(query),
    );
  }, [articleOptions, parentSearch]);

  const saveMutation = useMutation({
    mutationFn: async (saved: ArticleDraft): Promise<string> => {
      if (articleId === null) {
        const created = await createArticleContent(buildArticleCreateDto(saved));
        return created.slug ?? String(created.id);
      }

      const payload = buildArticleUpdateDto(saved, articleId);
      await updateArticleContent(articleId, payload);
      return payload.slug ?? String(articleId);
    },
    onSuccess: async (slug) => {
      if (mode.kind === 'edit') {
        await invalidateArticleQueries(queryClient);
      } else {
        void invalidateArticleQueries(queryClient);
      }
      showNotice('success', mode.kind === 'edit' ? editT.saved : t.saved);
      navigate(articleHref(slug));
    },
    onError: (error) =>
      showNotice('error', `${mode.kind === 'edit' ? editT.saveError : t.saveError}: ${(error as Error).message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteArticle(articleId!),
    onSuccess: () => {
      void invalidateArticleQueries(queryClient);
      navigate('/');
    },
    onError: (error) => {
      setIsDeleteModalOpen(false);
      showNotice('error', `${editT.deleteError}: ${(error as Error).message}`);
    },
  });

  const previewMarkdown = useMemo(() => buildDocumentPreviewMarkdown(blocks), [blocks]);
  const previewInfobox = useMemo<ArticleInfoboxDto | undefined>(() => {
    const dto = buildInfoboxCreateDto(infobox);
    if (!dto) {
      return undefined;
    }

    return {
      title: dto.title,
      subtitle: dto.subtitle,
      fields: dto.fields.map((field) => ({ ...field, id: field.order })),
    };
  }, [infobox]);
  const stats = useMemo(() => computeEditorStats(blocks, previewMarkdown), [blocks, previewMarkdown]);

  const applyFormat = (action: FormatAction) => {
    if (!activeTarget || isLocked) {
      return;
    }

    const key = targetKey(activeTarget.blockId, activeTarget.localId);
    const textarea = editorRefs.current[key];
    const currentValue = getTargetValue(blocks, activeTarget);
    if (!textarea || currentValue === null) {
      return;
    }

    const formatted = applyMarkdownFormat(
      currentValue,
      textarea.selectionStart ?? currentValue.length,
      textarea.selectionEnd ?? currentValue.length,
      action,
      editorText.markdown,
    );
    setBlocks((current) =>
      activeTarget.localId
        ? updateVersionContent(current, activeTarget.blockId, activeTarget.localId, formatted.value)
        : updatePlainBlockContent(current, activeTarget.blockId, formatted.value),
    );

    requestAnimationFrame(() => {
      const element = editorRefs.current[key];
      element?.focus();
      element?.setSelectionRange(formatted.selectionStart, formatted.selectionEnd);
    });
  };

  const problemMessage = (problem: ArticleDraftProblem): string => {
    switch (problem.code) {
      case 'slugInvalid':
        return formatMessage(t.slugInvalid, { maxLength: SLUG_MAX_LENGTH });
      case 'slugReserved':
        return formatMessage(t.slugReserved, { slug: problem.slug });
      case 'socialImageInvalid':
        return t.seo.imageInvalid;
      default:
        return t.warnings[problem.code];
    }
  };

  const saveArticle = () => {
    if (isLocked || saveMutation.isPending) {
      return;
    }

    const problem = findArticleDraftProblem(draft, mode.kind);
    if (problem) {
      showNotice('warning', problemMessage(problem));
      return;
    }

    saveMutation.mutate(draft);
  };

  const infoboxEditorProps = {
    draft: infobox,
    disabled: isLocked,
    text: editorText.infobox,
    onTitleChange: (value: string) => setField('infobox', (current) => ({ ...current, title: value })),
    onSubtitleChange: (value: string) => setField('infobox', (current) => ({ ...current, subtitle: value })),
    onAddField: () => setField('infobox', (current) => ({ ...current, fields: addInfoboxField(current.fields) })),
    onUpdateField: (fieldId: string, patch: { key?: string; label?: string; value?: string }) => setField('infobox', (current) => ({
      ...current,
      fields: updateInfoboxField(current.fields, fieldId, patch),
    })),
    onMoveField: (fieldId: string, direction: -1 | 1) => setField('infobox', (current) => ({
      ...current,
      fields: moveInfoboxField(current.fields, fieldId, direction),
    })),
    onRemoveField: (fieldId: string) => setField('infobox', (current) => ({
      ...current,
      fields: removeInfoboxField(current.fields, fieldId),
    })),
  };

  const improveWholeArticleWithAi = async () => {
    if (isLocked || !canUseAi) {
      return;
    }

    const targets = collectWholeArticleAiTargets(blocks);
    if (targets.length === 0) {
      showNotice('warning', t.warnings.noParagraphsForAi);
      return;
    }

    setIsAiRunning(true);

    try {
      const results: AiStyledText[] = [];
      for (const target of targets) {
        const result = await styleMarkdownWithAi({ text: target.content });
        results.push({ blockId: target.blockId, localId: target.localId, original: target.content, styled: result.styledText });
      }

      const applied = applyAiStyledTexts(blocks, results, mode.kind);
      setBlocks(applied.blocks);
      if (applied.styledCount > 0) {
        showNotice('success', `${t.styledVersions}: ${applied.styledCount}`);
      }
    } catch (error) {
      showNotice('error', `${t.aiStyleFailed}: ${(error as Error).message}`);
    } finally {
      setIsAiRunning(false);
    }
  };

  const importMarkdownAsBlocks = () => {
    const importedBlocks = importBlocksFromMarkdown(importText);
    if (importedBlocks.length === 0) {
      showNotice('warning', t.warnings.importEmpty);
      return;
    }

    // A new article's single empty block is replaced; an existing article keeps its text.
    if (mode.kind === 'edit') {
      setBlocks((current) => [...current, ...importedBlocks]);
    } else {
      setBlocks(importedBlocks);
      setIsPreview(false);
    }
    setIsImportOpen(false);
    setImportText('');
    showNotice('success', `${t.importedParagraphs}: ${importedBlocks.length}`);
  };

  const selectParentArticle = (option: ArticleOption | null) => {
    setField('parentArticleId', option?.id ?? null);
    setParentSearch(option?.path ?? '');
    setIsParentDropdownOpen(false);
  };

  const deleteRequested = () => {
    const node = findNodeInTree(navigationTreeQuery.data ?? [], articleId!);
    if (node && (node.children ?? []).length > 0) {
      showNotice('warning', editT.deleteBlockedByChildren);
      return;
    }
    setIsDeleteModalOpen(true);
  };

  return (
    <div className="min-h-[calc(100vh-var(--layout-header-height))] bg-[linear-gradient(180deg,#f9f8f5_0%,#f3f2ed_100%)]">
      <div className="mx-auto max-w-[1420px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex gap-0">
        <EditorOutlineRail
          blocks={blocks}
          onJumpToBlock={(blockId) => blockRefs.current[blockId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        />

        <div className="min-w-0 flex-1 xl:px-6">
          <div className="mx-auto max-w-[840px]">
            {notice ? <EditorNotice notice={notice} onDismiss={() => setNotice(null)} /> : null}

            <div className="overflow-hidden rounded-[30px] border border-[var(--color-border-soft)] bg-white shadow-[0_28px_90px_rgba(28,27,24,0.07)]">
              <div className="border-b border-[var(--color-border-soft)] px-6 py-5 sm:px-8">
                <div className="space-y-4">
                  {articleId !== null ? (
                    <>
                      <Link
                        to={`/admin/articles/${articleId}/history`}
                        className="inline-block text-sm text-[var(--color-brand-forest)] hover:underline"
                      >
                        {editT.historyLink}
                      </Link>
                      <ArticleStatusPanel
                        articleId={articleId}
                        onChanged={(status) => showNotice('success', editT.statusChanged.replace('{status}', locale.articleStatus[status]))}
                        onError={(message) => showNotice('error', message)}
                      />
                      {canEditAnyArticle ? (
                        <ArticleAuthorsPanel
                          articleId={articleId}
                          onSaved={() => showNotice('success', editT.authorsSaved)}
                          onError={(message) => showNotice('error', message)}
                        />
                      ) : null}
                    </>
                  ) : null}
                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-subtle)]">
                      {t.articleTitleLabel}
                    </label>
                    <Input
                      value={title}
                      disabled={isLocked}
                      onFocus={() => setActiveTarget(null)}
                      onChange={(event) => setField('title', event.target.value)}
                      placeholder={t.articleTitlePlaceholder}
                      className="h-auto border-0 bg-transparent px-0 py-0 text-3xl font-bold tracking-[-0.03em] text-[var(--color-ink-strong)] shadow-none focus:ring-0"
                    />
                  </div>
                  <SlugField
                    value={displayedSlug(draft)}
                    disabled={isLocked}
                    onChange={(value) => setField('slug', value)}
                    // A new article goes back to following the title; a saved one takes the derived slug once.
                    onFillFromTitle={() => setField('slug', mode.kind === 'edit' ? articleSlugFromTitle(title) : null)}
                    locale={mode.kind === 'edit' ? mode.article.locale ?? undefined : undefined}
                  />
                  {mode.kind === 'edit' ? (
                    <div>
                      <label htmlFor="edit-comment" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-subtle)]">
                        {editT.editCommentLabel}
                      </label>
                      <Input
                        id="edit-comment"
                        value={draft.editComment}
                        disabled={isLocked}
                        maxLength={500}
                        onChange={(event) => setField('editComment', event.target.value)}
                        placeholder={editT.editCommentPlaceholder}
                      />
                    </div>
                  ) : null}
                  <SeoFields value={draft.seo} disabled={isLocked} onChange={(value) => setField('seo', value)} />
                </div>
              </div>

              <div className="px-4 py-6 sm:px-6 lg:px-8">
                {isPreview ? (
                  <div className="@container mx-auto flow-root max-w-[720px] rounded-[26px] border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)] px-6 py-8 shadow-sm">
                    <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-subtle)]">
                      <FileText size={12} />
                      {t.previewTitle}
                    </div>
                    <h1 className="mb-6 text-3xl font-bold tracking-[-0.03em] text-[var(--color-ink-strong)]">{title || locale.common.untitled}</h1>
                    <ArticleInfoboxPanel infobox={previewInfobox} />
                    <div className="article-markdown">
                      <MarkdownContent content={previewMarkdown || t.previewEmpty} />
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto max-w-[720px]">
                    <InfoboxEditor {...infoboxEditorProps} />

                    <div className="space-y-0.5">
                      {blocks.map((block, index) => (
                        <DocumentBlockEditor
                          key={block.id}
                          block={block}
                          index={index}
                          total={blocks.length}
                          disabled={isLocked}
                          activeTarget={activeTarget}
                          blockRef={(blockId, node) => {
                            blockRefs.current[blockId] = node;
                          }}
                          editorRef={(key, node) => {
                            editorRefs.current[key] = node;
                          }}
                          availableSchools={schools.available}
                          onFocusTarget={setActiveTarget}
                          onChangePlain={(blockId, content) => setBlocks((current) => updatePlainBlockContent(current, blockId, content))}
                          onChangeVersion={(blockId, localId, content) => setBlocks((current) => updateVersionContent(current, blockId, localId, content))}
                          onSetDefault={(blockId, localId) => setBlocks((current) => setDefaultVersion(current, blockId, localId))}
                          onSetSchools={(blockId, localId, schoolIds) => setBlocks((current) => setOpinionSchools(current, blockId, localId, schoolIds))}
                          onSetSources={(blockId, localId, sources) => setBlocks((current) => setOpinionSources(current, blockId, localId, sources))}
                          onAddVersion={(blockId) => setBlocks((current) => addVersionToBlock(current, blockId))}
                          onRemoveVersion={(blockId, localId) => setBlocks((current) => removeVersionFromBlock(current, blockId, localId))}
                          onDeleteBlock={(blockId) => setBlocks((current) => (current.length > 1 ? deleteBlock(current, blockId) : current))}
                          onMoveBlock={(blockId, direction) => setBlocks((current) => moveBlock(current, blockId, direction))}
                          onConvertToVersioned={(blockId) => setBlocks((current) => convertParagraphToVersioned(current, blockId))}
                          onConvertToParagraph={(blockId) => setBlocks((current) => convertVersionedToParagraph(current, blockId))}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>

          </div>

          <EditorBottomToolbar
            disabled={isLocked || saveMutation.isPending}
            onFormat={applyFormat}
            onAddBlock={(kind) => setBlocks((current) => insertBlockAfter(current, activeTarget?.blockId ?? null, kind))}
          />
        </div>

        <EditorHelpRail
          {...stats}
          actions={(
            <EditorToolbar
              disabled={isLocked || saveMutation.isPending}
              isPreview={isPreview}
              aiAvailability={aiAvailability}
              isAiRunning={isAiRunning}
              isSaving={saveMutation.isPending}
              onTogglePreview={() => setIsPreview((current) => !current)}
              onImport={() => setIsImportOpen(true)}
              onImproveAll={improveWholeArticleWithAi}
              onSave={saveArticle}
              showDelete={articleId !== null && canEditAnyArticle}
              isDeleting={deleteMutation.isPending}
              onDelete={deleteRequested}
            />
          )}
          isLocked={isLocked}
          {...(mode.kind === 'create'
            ? {
                isLoadingParents: navigationTreeQuery.isLoading,
                selectedParent,
                parentSearch,
                filteredParentOptions,
                isParentDropdownOpen,
                onToggleParentDropdown: () => {
                  setActiveTarget(null);
                  setIsParentDropdownOpen((current) => !current);
                  setParentSearch(selectedParent?.path ?? '');
                },
                onParentSearchChange: setParentSearch,
                onSelectParent: selectParentArticle,
              }
            : {
                customSchools: schools.custom,
                onAddCustomSchool: schools.add,
                onDeleteCustomSchool: schools.remove,
                currentArticleId: articleId ?? undefined,
              })}
          summary={draft.summary}
          tags={draft.tags}
          relatedLinks={draft.relatedLinks}
          articleOptions={articleOptions}
          onSummaryChange={(value) => setField('summary', value)}
          onTagsChange={(value) => setField('tags', value)}
          onAddRelatedLink={(linkedId, linkedTitle) => setField('relatedLinks', (current) => addRelatedLink(current, linkedId, linkedTitle))}
          onRemoveRelatedLink={(draftId) => setField('relatedLinks', (current) => removeRelatedLink(current, draftId))}
          onMoveRelatedLink={(draftId, direction) => setField('relatedLinks', (current) => moveRelatedLink(current, draftId, direction))}
        />
        </div>
      </div>

      {isImportOpen ? (
        <ImportMarkdownDialog
          value={importText}
          onChange={setImportText}
          onImport={importMarkdownAsBlocks}
          onClose={() => setIsImportOpen(false)}
        />
      ) : null}

      {isAiRunning ? <AiRunningOverlay /> : null}

      {isDeleteModalOpen ? (
        <DeleteArticleDialog
          title={title}
          isDeleting={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onClose={() => setIsDeleteModalOpen(false)}
        />
      ) : null}
    </div>
  );
};

/** Loads the article to edit; the editor starts once it is there, from its saved state. */
const EditArticleLoader: React.FC<{ articleId: number }> = ({ articleId }) => {
  const locale = useLocale();
  const articleQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_CONTENT, articleId],
    queryFn: () => getArticleContentById(articleId),
    enabled: !Number.isNaN(articleId),
  });

  if (articleQuery.isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-var(--layout-header-height))] items-center justify-center">
        <p className="text-sm text-[var(--color-ink-muted)]">{locale.common.loading}</p>
      </div>
    );
  }

  if (articleQuery.isError || !articleQuery.data) {
    return (
      <div className="flex min-h-[calc(100vh-var(--layout-header-height))] items-center justify-center">
        <Card className="px-6 py-5">
          <p className="text-sm text-red-600">{locale.editArticlePage.loadError}</p>
        </Card>
      </div>
    );
  }

  return <ArticleEditor key={articleId} mode={{ kind: 'edit', article: articleQuery.data }} />;
};

/**
 * `/admin/articles/new` (no `articleId`) creates an article, `/admin/articles/:articleId/edit`
 * edits one: one editor, two modes.
 */
const ArticleEditorPage: React.FC = () => {
  const { articleId } = useParams<{ articleId: string }>();
  return articleId === undefined
    ? <ArticleEditor mode={{ kind: 'create' }} />
    : <EditArticleLoader articleId={Number(articleId)} />;
};

export default ArticleEditorPage;
