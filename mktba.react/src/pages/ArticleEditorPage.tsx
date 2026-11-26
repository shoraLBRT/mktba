import React, { useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { useLocale } from '../localization/hooks';
import { isLanguage } from '../localization/language';
import { createArticleContent, getArticleContentById, updateArticleContent } from '../services/Article/articleService';
import { useNavigationTree } from '../hooks/useNavigationTree';
import { invalidateArticleQueries } from '../app/queryClient';
import { deleteArticle, getAiProviderSettings, styleMarkdownWithAi } from '../services/adminService';
import { Card } from '../shared/ui/Card';
import { Input } from '../shared/ui/Input';
import type { ArticleRevisionSummaryDto, ArticleStatus, NavigationArticleDto } from '../shared/types/ApiTypes';
import { ArticleDraftPreview } from './add-article/ArticleDraftPreview';
import { EditorHistoryDialog } from './add-article/EditorHistoryDialog';
import { ArticleAuthorsPanel } from '../components/article/ArticleAuthorsPanel';
import { ArticleStatusPanel } from '../components/article/ArticleStatusPanel';
import { DocumentBlockEditor } from './add-article/DocumentBlockEditor';
import { EditorBottomToolbar, type FormatAction } from './add-article/EditorBottomToolbar';
import { EditorHelpRail } from './add-article/EditorHelpRail';
import { ScholarOpinionsPanel } from './add-article/ScholarOpinionsPanel';
import { useArticleSchools } from './add-article/useArticleSchools';
import { InfoboxEditor } from './add-article/InfoboxEditor';
import { EditorOutlineRail } from './add-article/EditorOutlineRail';
import { EditorToolbar } from './add-article/EditorToolbar';
import {
  AiRunningOverlay,
  ConvertToParagraphDialog,
  DeleteArticleDialog,
  EditorNotice,
  ImportMarkdownDialog,
  PrepublishWarningsDialog,
  UnsavedChangesDialog,
  type EditorNoticeValue,
} from './add-article/EditorDialogs';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { localDraftCopyKey } from './add-article/localDraftCopy';
import { DraftSaveIndicator, LocalDraftOffer } from './add-article/LocalDraftCopyNotices';
import { useLocalDraftCopy } from './add-article/useLocalDraftCopy';
import { useServerDraft } from './add-article/useServerDraft';
import { chooseDraftOffer, draftSaveStatus } from './add-article/draftAutosave';
import { getAiAvailability } from './add-article/aiAvailability';
import { useCurrentUser } from '../auth/useCurrentUser';
import {
  addVersionToBlock,
  buildDocumentPreviewMarkdown,
  collectWholeArticleAiTargets,
  toggleOpinionSchool,
  setOpinionSources,
  changeEmptyBlockKind,
  convertParagraphToVersioned,
  convertVersionedToParagraph,
  deleteBlock,
  duplicateBlock,
  importBlocksFromMarkdown,
  insertBlockAfter,
  moveBlock,
  moveBlockTo,
  opinionsLostByConvertingToParagraph,
  removeVersionFromBlock,
  setDefaultVersion,
  updatePlainBlockContent,
  updateVersionContent,
} from './add-article/draftHelpers';
import { addInfoboxField, moveInfoboxField, removeInfoboxField, updateInfoboxField } from './add-article/infoboxHelpers';
import { addRelatedLink, moveRelatedLink, removeRelatedLink } from './add-article/metadataHelpers';
import type { EditorBlock } from './add-article/types';
import {
  applyAiStyledTexts,
  articleDraftFromDto,
  buildArticleCreateDto,
  buildArticleUpdateDto,
  displayedSlug,
  findArticleDraftProblem,
  hasArticleDraftChanged,
  initialArticleDraft,
  type ArticleDraft,
  type ArticleDraftProblem,
  type ArticleEditorMode,
  type AiStyledText,
} from './add-article/articleDraft';
import { computeEditorStats } from './add-article/editorStats';
import { applyMarkdownFormat, insertArticleLink, type FormattedText } from './add-article/markdownFormat';
import { findBrokenInternalLinks, type ArticleLinkTarget } from './add-article/internalLinks';
import { InternalLinkDialog } from './add-article/InternalLinkDialog';
import { ExternalLinkDialog } from './add-article/ExternalLinkDialog';
import { ImageUploadDialog } from './add-article/ImageUploadDialog';
import { UPLOAD_IMAGE_ACCEPT } from '../shared/upload';
import type { RichTextHandle } from './add-article/richText/RichTextEditor';
import { InternalLinkWarnings } from './add-article/InternalLinkWarnings';
import { SlugField } from './add-article/SlugField';
import { PublicationPanel } from './add-article/PublicationPanel';
import { TranslationsPanel } from './add-article/TranslationsPanel';
import { TranslationSourcePane } from './add-article/TranslationSourcePane';
import { seoSnippetOf } from './add-article/seoSnippet';
import { findPrepublishWarnings, isPublishingMove } from './add-article/prepublishChecks';
import { PrepublishChecklist } from './add-article/PrepublishChecklist';
import { useSiteUrl } from '../app/siteUrl';
import { useBlockDragAndDrop } from './add-article/useBlockDragAndDrop';
import type { SlashMenuKind } from './add-article/slashMenuKinds';
import { formatMessage } from '../localization';
import { articleRemarksQueryKey, getArticleRemarks } from '../services/articleRemarkService';
import { openRemarksByParagraph, remarkElementId } from '../shared/articleRemarks';
import { EditorRemarksPanel } from './add-article/EditorRemarksPanel';
import { SLUG_MAX_LENGTH, articleHref, articleSlugFromTitle, localizedArticleHref } from '../shared/slug';

type EditorTarget = {
  blockId: string;
  localId: string | null;
};

type ArticleOption = ArticleLinkTarget;

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
      { id: node.id, title: node.title, path: titles.join(' / '), slug: node.slug, status: node.status },
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

/** The `kind` of the translations block (I-06, #110), kept out of JSX attributes. */
const EDIT_PANEL = { kind: 'edit' } as const;
const CREATE_PANEL = { kind: 'create' } as const;

/**
 * The article editor for both a new article (`mode.kind === 'create'`) and an existing one.
 * Everything the user edits is one `ArticleDraft`; what differs by mode is spelled out where it
 * happens: the parent picker is for a new article, revisions, status, authorship, custom schools
 * and deletion exist only for a saved one.
 */
const ArticleEditor: React.FC<{ mode: ArticleEditorMode }> = ({ mode }) => {
  const locale = useLocale();
  const { can, user } = useCurrentUser();
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
  // I-06 (#110): the original shown beside a translation, new or saved.
  const translationSourceId = mode.kind === 'create' ? mode.translation?.sourceId ?? null : mode.article.translatedFrom?.articleId ?? null;
  const [isSourceShown, setIsSourceShown] = useState(true);
  const showSource = translationSourceId !== null && isSourceShown;

  // The draft as last saved (or loaded): what is different from it would be lost by leaving.
  const [baseline, setBaseline] = useState(() => initialArticleDraft(mode));
  const [draft, setDraft] = useState(baseline);
  const hasUnsavedChanges = useMemo(() => hasArticleDraftChanged(draft, baseline), [draft, baseline]);
  const leaveGuard = useUnsavedChangesGuard(hasUnsavedChanges);
  const baseUpdatedAt = mode.kind === 'edit' ? mode.article.updatedAt ?? null : null;
  const localCopy = useLocalDraftCopy({
    storageKey: user ? localDraftCopyKey(user.id, articleId) : null,
    draft,
    baseline,
    baseUpdatedAt,
  });
  const serverDraft = useServerDraft({ enabled: Boolean(user), articleId, draft, baseline, baseUpdatedAt });
  const draftOffer = chooseDraftOffer(localCopy.offer, serverDraft.offer);
  // Both keep the edits until a save, a delete or leaving on purpose: the server draft and, as the fallback, this browser's copy.
  const clearDraftCopies = () => {
    localCopy.clear();
    serverDraft.clear();
  };
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
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeTarget, setActiveTarget] = useState<EditorTarget | null>(null);
  /** The text the article picker will insert its link into; `null` while the picker is closed. */
  const [linkPickerTarget, setLinkPickerTarget] = useState<EditorTarget | null>(null);
  /** The image being uploaded (U-08) and the text it goes into. */
  const [imageUpload, setImageUpload] = useState<{ target: EditorTarget; file: File } | null>(null);
  /** The text «Картинка» was pressed in, while the file picker is open. */
  const imagePickerTarget = useRef<EditorTarget | null>(null);
  const imageFileInput = useRef<HTMLInputElement | null>(null);
  /** The rich text the external-link dialog edits a link in, with the address it opened with. */
  const [externalLink, setExternalLink] = useState<{ target: EditorTarget; href: string } | null>(null);
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [isParentDropdownOpen, setIsParentDropdownOpen] = useState(false);
  const [parentSearch, setParentSearch] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  /** Headings' textareas, by target key. */
  const editorRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  /** The rich-text editors of paragraphs and opinions, by target key. */
  const richTextRefs = useRef<Record<string, RichTextHandle | null>>({});
  const blockRefs = useRef<Record<string, HTMLElement | null>>({});
  // Scholars' remarks on the blocks of a saved article (V-06, #122): the rail lists them, the text marks the blocks.
  const remarksQuery = useQuery({
    queryKey: articleRemarksQueryKey(articleId ?? 0),
    queryFn: () => getArticleRemarks(articleId!),
    enabled: articleId !== null,
    retry: false,
  });
  const remarks = useMemo(() => remarksQuery.data?.items ?? [], [remarksQuery.data]);
  const openRemarks = useMemo(() => openRemarksByParagraph(remarks), [remarks]);
  const jumpToParagraph = (paragraphId: number) => {
    const block = blocks.find((candidate) => candidate.paragraphId === paragraphId);
    if (block) blockRefs.current[block.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const showRemark = (remarkId: number) => {
    const node = document.getElementById(remarkElementId(remarkId));
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node?.focus({ preventScroll: true });
  };
  /** The block of opinions waiting for the user to confirm it becomes a plain paragraph. */
  const [convertToParagraph, setConvertToParagraph] = useState<{ blockId: string; lostOpinions: number } | null>(null);
  /**
   * A block whose text gets the focus once it is rendered (a kind picked in the `/` menu), or one
   * opinion of it (an opinion just added); without one, a block of opinions focuses its default.
   */
  const [focusRequest, setFocusRequest] = useState<{ blockId: string; localId?: string } | null>(null);
  /** A move to review or publication waiting for the user to go on despite the checklist's warnings. */
  const [prepublishConfirm, setPrepublishConfirm] = useState<((confirmed: boolean) => void) | null>(null);
  const blockDragAndDrop = useBlockDragAndDrop({
    getBlockElement: (blockId) => blockRefs.current[blockId] ?? null,
    onMove: (blockId, target) => setBlocks((current) => moveBlockTo(current, blockId, target.blockId, target.position)),
  });

  const showNotice = (tone: EditorNoticeValue['tone'], message: string) => {
    setNotice({ tone, message });
  };

  const aiSettingsQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_AI_SETTINGS],
    queryFn: getAiProviderSettings,
    enabled: canConfigure,
  });
  const schools = useArticleSchools(articleId, canEditAnyArticle, (message) => showNotice('error', message));
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

  // The article's language: its own, or a new translation's; a plain new article is Russian.
  const articleLocale = mode.kind === 'edit' ? mode.article.locale : mode.translation?.locale;
  // `stay`: the save that comes before a status move — the editor stays open and the move follows.
  const saveMutation = useMutation({
    mutationFn: async ({ saved }: { saved: ArticleDraft; stay: boolean }): Promise<string> => {
      if (articleId === null) {
        const created = await createArticleContent(buildArticleCreateDto(saved, mode.kind === 'create' ? mode.translation : undefined));
        return created.slug ?? String(created.id);
      }

      const payload = buildArticleUpdateDto(saved, articleId);
      await updateArticleContent(articleId, payload);
      return payload.slug ?? String(articleId);
    },
    onSuccess: async (slug, { saved, stay }) => {
      clearDraftCopies();
      // A deleted block turns its remarks into «блок удалён» (V-06, #122).
      if (articleId !== null) void queryClient.invalidateQueries({ queryKey: articleRemarksQueryKey(articleId) });
      if (stay) {
        // The comment described the revision just written; the next save starts without one.
        const next = { ...saved, editComment: '' };
        setBaseline(next);
        setDraft((current) => (current.editComment === saved.editComment ? { ...current, editComment: '' } : current));
        await invalidateArticleQueries(queryClient);
        return;
      }
      setBaseline(saved);
      if (mode.kind === 'edit') {
        await invalidateArticleQueries(queryClient);
      } else {
        void invalidateArticleQueries(queryClient);
      }
      showNotice('success', mode.kind === 'edit' ? editT.saved : t.saved);
      leaveGuard.allowLeaving();
      // A translation lives under its language's prefix (`/en/{slug}`, I-06 #110).
      navigate(localizedArticleHref(articleLocale, slug));
    },
    onError: (error) =>
      showNotice('error', `${mode.kind === 'edit' ? editT.saveError : t.saveError}: ${(error as Error).message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteArticle(articleId!),
    onSuccess: () => {
      clearDraftCopies();
      void invalidateArticleQueries(queryClient);
      leaveGuard.allowLeaving();
      navigate('/');
    },
    onError: (error) => {
      setIsDeleteModalOpen(false);
      showNotice('error', `${editT.deleteError}: ${(error as Error).message}`);
    },
  });

  const previewMarkdown = useMemo(() => buildDocumentPreviewMarkdown(blocks), [blocks]);
  const stats = useMemo(() => computeEditorStats(blocks, previewMarkdown), [blocks, previewMarkdown]);
  const seoSnippet = useMemo(() => seoSnippetOf(draft), [draft]);
  const siteUrl = useSiteUrl();
  const snippetUrl = `${siteUrl.replace(/^https?:\/\//, '')}${localizedArticleHref(articleLocale, displayedSlug(draft))}`;
  const brokenLinks = useMemo(
    () => (navigationTreeQuery.data ? findBrokenInternalLinks(blocks, articleOptions) : []),
    [blocks, articleOptions, navigationTreeQuery.data],
  );
  const prepublishWarnings = useMemo(
    () => findPrepublishWarnings(blocks, seoSnippet, brokenLinks),
    [blocks, seoSnippet, brokenLinks],
  );

  const richTextOf = (target: EditorTarget | null) =>
    target && !isLocked ? richTextRefs.current[targetKey(target.blockId, target.localId)] ?? null : null;

  /**
   * Rewrites the text of a heading `target` around its textarea's selection and restores the
   * selection. Paragraphs and opinions are rich texts and format themselves.
   */
  const editTargetText = (
    target: EditorTarget | null,
    edit: (value: string, start: number, end: number) => FormattedText,
  ) => {
    if (!target || isLocked) {
      return;
    }

    const key = targetKey(target.blockId, target.localId);
    const textarea = editorRefs.current[key];
    const currentValue = getTargetValue(blocks, target);
    if (!textarea || currentValue === null) {
      return;
    }

    const formatted = edit(
      currentValue,
      textarea.selectionStart ?? currentValue.length,
      textarea.selectionEnd ?? currentValue.length,
    );
    // Committed at once, not in a later frame: the selection must be back in the textarea before
    // the next key press, or a caret the user moves meanwhile is overwritten and their typing
    // replaces the restored selection.
    flushSync(() =>
      setBlocks((current) =>
        target.localId
          ? updateVersionContent(current, target.blockId, target.localId, formatted.value)
          : updatePlainBlockContent(current, target.blockId, formatted.value),
      ),
    );
    const element = editorRefs.current[key];
    element?.focus();
    element?.setSelectionRange(formatted.selectionStart, formatted.selectionEnd);
  };

  /** A block of opinions becomes a plain paragraph at once, unless other opinions would lose their text: then the user is asked. */
  const requestConvertToParagraph = (blockId: string) => {
    const block = blocks.find((candidate) => candidate.id === blockId);
    const lostOpinions = block?.kind === 'versioned' ? opinionsLostByConvertingToParagraph(block) : 0;
    if (lostOpinions > 0) {
      setConvertToParagraph({ blockId, lostOpinions });
    } else {
      setBlocks((current) => convertVersionedToParagraph(current, blockId));
    }
  };

  const chooseBlockKind = (blockId: string, kind: SlashMenuKind) => {
    setBlocks((current) => changeEmptyBlockKind(current, blockId, kind));
    setFocusRequest({ blockId });
  };

  /** «Add opinion» in a block of opinions: a new empty opinion for the school picked, opened to write. */
  const addOpinion = (blockId: string, schoolId: number | null) => {
    const localId = crypto.randomUUID();
    setBlocks((current) => addVersionToBlock(current, blockId, schoolId === null ? [] : [schoolId], localId));
    setActiveTarget({ blockId, localId });
    setFocusRequest({ blockId, localId });
  };

  // The text of a block whose kind was just picked takes the focus once it is rendered.
  useEffect(() => {
    if (!focusRequest) {
      return;
    }
    const block = blocks.find((candidate) => candidate.id === focusRequest.blockId);
    setFocusRequest(null);
    if (!block) {
      return;
    }
    if (block.kind === 'versioned') {
      const opinion =
        block.variants.find((variant) => variant.localId === focusRequest.localId) ??
        block.variants.find((variant) => variant.isDefault) ??
        block.variants[0];
      setActiveTarget({ blockId: block.id, localId: opinion.localId });
      richTextRefs.current[targetKey(block.id, opinion.localId)]?.focus();
    } else {
      setActiveTarget({ blockId: block.id, localId: null });
      richTextRefs.current[targetKey(block.id, null)]?.focus();
      editorRefs.current[targetKey(block.id, null)]?.focus();
    }
  }, [focusRequest, blocks]);

  const openExternalLinkDialog = (target: EditorTarget) => {
    const richText = richTextOf(target);
    if (richText) {
      setExternalLink({ target, href: richText.linkHref() ?? '' });
    }
  };

  const applyExternalLink = (href: string) => {
    const target = externalLink?.target ?? null;
    setExternalLink(null);
    richTextOf(target)?.setLink(href || null);
  };

  const applyFormat = (action: FormatAction) => {
    const richText = richTextOf(activeTarget);
    if (!richText || !activeTarget) {
      editTargetText(activeTarget, (value, start, end) => applyMarkdownFormat(value, start, end, action, editorText.markdown));
    } else if (action === 'link') {
      openExternalLinkDialog(activeTarget);
    } else {
      richText.format(action);
    }
  };

  const openArticleLinkPicker = () => {
    if (activeTarget && !isLocked) {
      setLinkPickerTarget(activeTarget);
    }
  };

  const openImagePicker = () => {
    // Images go into rich text only: a heading is one line of text.
    if (activeTarget && !isLocked && richTextOf(activeTarget)) {
      imagePickerTarget.current = activeTarget;
      imageFileInput.current?.click();
    }
  };

  const pickImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared, so picking the same file again is a change too.
    event.target.value = '';
    const target = imagePickerTarget.current;
    if (file && target) {
      setImageUpload({ target, file });
    }
  };

  const closeImageUpload = () => {
    const target = imageUpload?.target ?? null;
    setImageUpload(null);
    richTextOf(target)?.focus();
  };

  const insertUploadedImage = (markdown: string) => {
    const target = imageUpload?.target ?? null;
    setImageUpload(null);
    richTextOf(target)?.insertImage(markdown);
  };

  const insertPickedArticleLink = (article: ArticleLinkTarget) => {
    // Closed in the same synchronous commit as the insert, so focus returns to the text at once.
    setLinkPickerTarget(null);
    const link = { title: article.title, href: articleHref(article.slug) };
    const richText = richTextOf(linkPickerTarget);
    if (richText) {
      richText.insertArticleLink(link);
      return;
    }
    editTargetText(linkPickerTarget, (value, start, end) => insertArticleLink(value, start, end, link));
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

  /**
   * After a rollback in the history (E-13, #83) the server's working copy is the restored revision:
   * the editor reloads it and makes it the baseline, and the edits it replaced go with their copy.
   */
  const reloadAfterRestore = async (from: number, created: ArticleRevisionSummaryDto) => {
    const fresh = await getArticleContentById(articleId!);
    queryClient.setQueryData([APP_CONSTANTS.QUERY_KEYS.ARTICLE_CONTENT, articleId], fresh);
    const restored = articleDraftFromDto(fresh);
    clearDraftCopies();
    setBaseline(restored);
    setDraft(restored);
    setIsHistoryOpen(false);
    showNotice('success', formatMessage(locale.articleHistoryPage.restored, { from, to: created.number }));
    void invalidateArticleQueries(queryClient);
  };

  // The offer chosen of the two is restored; the other one ends with it (its edits are overwritten by the next autosave).
  const restoreDraftOffer = () => {
    const fromLocal = localCopy.acceptOffer();
    const fromServer = serverDraft.acceptOffer();
    const restored = draftOffer?.source === 'server' ? fromServer : fromLocal;
    if (restored) {
      setDraft(restored);
    }
  };

  const discardDraftOffer = () => {
    if (localCopy.offer) {
      localCopy.discardOffer();
    }
    if (serverDraft.offer) {
      serverDraft.discardOffer();
    }
  };

  // Leaving on purpose drops the edits, and with them their server draft and their copy in this browser.
  const leaveAndDiscard = () => {
    clearDraftCopies();
    leaveGuard.blocker.proceed?.();
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

    saveMutation.mutate({ saved: draft, stay: false });
  };

  /**
   * Saves the edits before a status move, so that what is submitted or published is what the
   * editor shows; true when the move may follow (nothing to save, or saved). A draft that fails the
   * save checks or a failed save keeps the status as it is, and the edits stay in the editor.
   */
  const confirmPrepublishWarnings = (target: ArticleStatus): Promise<boolean> =>
    isPublishingMove(target) && prepublishWarnings.length > 0
      ? new Promise((resolve) => setPrepublishConfirm(() => resolve))
      : Promise.resolve(true);

  /**
   * Before a status move: edits that cannot be saved stop it at once, the checklist's warnings ask
   * for a confirmation of a move to review or publication, then unsaved edits are saved.
   */
  const saveBeforeStatusChange = async (target: ArticleStatus): Promise<boolean> => {
    if (hasUnsavedChanges) {
      if (isLocked || saveMutation.isPending) {
        return false;
      }
      const problem = findArticleDraftProblem(draft, mode.kind);
      if (problem) {
        showNotice('warning', problemMessage(problem));
        return false;
      }
    }
    if (!(await confirmPrepublishWarnings(target))) {
      return false;
    }
    if (!hasUnsavedChanges) {
      return true;
    }

    try {
      await saveMutation.mutateAsync({ saved: draft, stay: true });
      return true;
    } catch {
      // The save's own onError has already told the user why.
      return false;
    }
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

  const selectParentArticle = (option: Pick<ArticleOption, 'id' | 'path'> | null) => {
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
        {/* E-15 (#85): from lg the structure is the left column and the rail goes under the
            document; from xl the rail is the right column. Below lg both columns stack. */}
        <div className="grid grid-cols-1 gap-y-6 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_280px] xl:gap-y-0">
        <EditorOutlineRail
          blocks={blocks}
          onJumpToBlock={(blockId) => {
            blockRefs.current[blockId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setFocusRequest({ blockId });
          }}
        />

        {/* I-06 (#110): a translation's original sits beside the document from 2xl, above it below that. */}
        <div className={showSource ? 'min-w-0 lg:col-start-2 xl:px-6 2xl:grid 2xl:grid-cols-2 2xl:items-start 2xl:gap-6' : 'min-w-0 lg:col-start-2 xl:px-6'}>
        {showSource ? (
          <TranslationSourcePane
            sourceId={translationSourceId}
            revision={mode.kind === 'edit' ? mode.article.translatedFrom?.revision : undefined}
            onHide={() => setIsSourceShown(false)}
          />
        ) : null}
        <div className="min-w-0">
          {translationSourceId !== null && !isSourceShown ? (
            <div className="mx-auto mb-4 max-w-[840px] text-end">
              <button type="button" onClick={() => setIsSourceShown(true)} className="text-[12px] text-[var(--color-brand-forest)] hover:underline">
                {locale.articleTranslation.sourcePane.show}
              </button>
            </div>
          ) : null}
          <div className="mx-auto max-w-[840px]">
            {notice ? <EditorNotice notice={notice} onDismiss={() => setNotice(null)} /> : null}
            {draftOffer ? (
              <LocalDraftOffer
                copy={draftOffer.copy}
                source={draftOffer.source}
                baseUpdatedAt={baseUpdatedAt}
                onRestore={restoreDraftOffer}
                onDiscard={discardDraftOffer}
              />
            ) : (
              <DraftSaveIndicator status={draftSaveStatus(localCopy.status, serverDraft.status)} isSaving={saveMutation.isPending} />
            )}

            <div className="overflow-hidden rounded-[30px] border border-[var(--color-border-soft)] bg-white shadow-[0_28px_90px_rgba(28,27,24,0.07)]">
              <div className="border-b border-[var(--color-border-soft)] px-6 py-5 sm:px-8">
                <div className="space-y-4">
                  {articleId !== null ? (
                    <>
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        onClick={() => setIsHistoryOpen(true)}
                        className="inline-block text-sm text-[var(--color-brand-forest)] hover:underline"
                      >
                        {editT.historyLink}
                      </button>
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
                </div>
              </div>

              <div className="px-4 py-6 sm:px-6 lg:px-8">
                {isPreview ? (
                  <ArticleDraftPreview
                    draft={draft}
                    article={mode.kind === 'edit' ? mode.article : null}
                    schools={schools.available}
                    navigationTree={navigationTreeQuery.data}
                    onClose={() => setIsPreview(false)}
                  />
                ) : null}
                {isHistoryOpen && articleId !== null ? (
                  <EditorHistoryDialog
                    articleId={articleId}
                    draft={draft}
                    hasUnsavedChanges={hasUnsavedChanges}
                    schools={schools.available}
                    onRestored={reloadAfterRestore}
                    onClose={() => setIsHistoryOpen(false)}
                  />
                ) : null}
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
                          richTextRef={(key, handle) => {
                            richTextRefs.current[key] = handle;
                          }}
                          availableSchools={schools.available}
                          onFocusTarget={setActiveTarget}
                          onRequestLink={openExternalLinkDialog}
                          onImageFile={(target, file) => {
                            if (!isLocked) setImageUpload({ target, file });
                          }}
                          onChangePlain={(blockId, content) => setBlocks((current) => updatePlainBlockContent(current, blockId, content))}
                          onChangeVersion={(blockId, localId, content) => setBlocks((current) => updateVersionContent(current, blockId, localId, content))}
                          onSetDefault={(blockId, localId) => setBlocks((current) => setDefaultVersion(current, blockId, localId))}
                          onToggleSchool={(blockId, localId, schoolId) => setBlocks((current) => toggleOpinionSchool(current, blockId, localId, schoolId))}
                          onSetSources={(blockId, localId, sources) => setBlocks((current) => setOpinionSources(current, blockId, localId, sources))}
                          onAddOpinion={addOpinion}
                          onRemoveVersion={(blockId, localId) => setBlocks((current) => removeVersionFromBlock(current, blockId, localId))}
                          onDeleteBlock={(blockId) => setBlocks((current) => (current.length > 1 ? deleteBlock(current, blockId) : current))}
                          onDuplicateBlock={(blockId) => setBlocks((current) => duplicateBlock(current, blockId))}
                          onMoveBlock={(blockId, direction) => setBlocks((current) => moveBlock(current, blockId, direction))}
                          onConvertToVersioned={(blockId) => setBlocks((current) => convertParagraphToVersioned(current, blockId))}
                          onConvertToParagraph={requestConvertToParagraph}
                          onChooseBlockKind={chooseBlockKind}
                          dragHandleProps={blockDragAndDrop.handleProps(block.id)}
                          dropZoneProps={blockDragAndDrop.dropZoneProps(block.id)}
                          isDragged={blockDragAndDrop.draggedBlockId === block.id}
                          dropIndicator={blockDragAndDrop.dropTarget?.blockId === block.id ? blockDragAndDrop.dropTarget.position : null}
                          remarks={block.paragraphId !== undefined ? openRemarks.get(block.paragraphId) : undefined}
                          onShowRemark={showRemark}
                        />
                      ))}
                    </div>
                  </div>
              </div>

            </div>

          </div>

          <div className="mx-auto max-w-[840px]">
            <InternalLinkWarnings
              links={brokenLinks}
              articles={articleOptions}
              onJumpToBlock={(blockId) => blockRefs.current[blockId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            />
          </div>

          <EditorBottomToolbar
            disabled={isLocked || saveMutation.isPending}
            onFormat={applyFormat}
            onInsertArticleLink={openArticleLinkPicker}
            onInsertImage={openImagePicker}
            onUndo={() => richTextOf(activeTarget)?.undo()}
            onRedo={() => richTextOf(activeTarget)?.redo()}
            onAddBlock={(kind) => setBlocks((current) => insertBlockAfter(current, activeTarget?.blockId ?? null, kind))}
          />
        </div>
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
          publication={(
            <>
            <PublicationPanel
              checks={(
                <PrepublishChecklist
                  warnings={prepublishWarnings}
                  onJump={(blockId, localId) => {
                    blockRefs.current[blockId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setFocusRequest({ blockId, localId });
                  }}
                />
              )}
              status={articleId !== null ? (
                <ArticleStatusPanel
                  articleId={articleId}
                  hasUnsavedChanges={hasUnsavedChanges}
                  beforeChange={saveBeforeStatusChange}
                  disabled={isLocked || saveMutation.isPending}
                  onChanged={(status) => showNotice('success', editT.statusChanged.replace('{status}', locale.articleStatus[status]))}
                  onError={(message) => showNotice('error', message)}
                />
              ) : undefined}
              slug={(
                <SlugField
                  value={displayedSlug(draft)}
                  disabled={isLocked}
                  onChange={(value) => setField('slug', value)}
                  // A new article goes back to following the title; a saved one takes the derived slug once.
                  onFillFromTitle={() => setField('slug', mode.kind === 'edit' ? articleSlugFromTitle(title) : null)}
                  locale={articleLocale ?? undefined}
                />
              )}
              editComment={mode.kind === 'edit' ? { value: draft.editComment, onChange: (value) => setField('editComment', value) } : undefined}
              seo={draft.seo}
              onSeoChange={(value) => setField('seo', value)}
              snippet={seoSnippet}
              url={snippetUrl}
              disabled={isLocked}
            />
            {mode.kind === 'edit' ? (
              <TranslationsPanel
                {...EDIT_PANEL}
                article={mode.article}
                draftRevision={draft.translatedFromRevision}
                onMarkUpToDate={(revision) => setField('translatedFromRevision', revision)}
                disabled={isLocked}
              />
            ) : (
              <TranslationsPanel {...CREATE_PANEL} translation={mode.translation} />
            )}
            {mode.kind === 'edit' ? <EditorRemarksPanel remarks={remarks} onJump={jumpToParagraph} /> : null}
            </>
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
                scholarOpinions: (
                  <ScholarOpinionsPanel
                    schools={schools.custom}
                    directory={schools.directory}
                    articleOptions={articleOptions.filter((option) => option.id !== articleId)}
                    isLocked={isLocked}
                    canManage={schools.canManage}
                    onPick={schools.pick}
                    onAdd={schools.add}
                    onUpdate={schools.update}
                    onDelete={schools.remove}
                  />
                ),
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

      {linkPickerTarget ? (
        <InternalLinkDialog
          articles={articleOptions}
          isLoading={navigationTreeQuery.isLoading}
          onPick={insertPickedArticleLink}
          onClose={() => setLinkPickerTarget(null)}
        />
      ) : null}

      <input
        ref={imageFileInput}
        type="file"
        accept={UPLOAD_IMAGE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="editor-image-file"
        onChange={pickImage}
      />

      {imageUpload ? (
        <ImageUploadDialog file={imageUpload.file} onInsert={insertUploadedImage} onClose={closeImageUpload} />
      ) : null}

      {externalLink ? (
        <ExternalLinkDialog
          initialHref={externalLink.href}
          onApply={applyExternalLink}
          onClose={() => {
            const target = externalLink.target;
            setExternalLink(null);
            richTextOf(target)?.focus();
          }}
        />
      ) : null}

      {isAiRunning ? <AiRunningOverlay /> : null}

      {convertToParagraph ? (
        <ConvertToParagraphDialog
          lostOpinions={convertToParagraph.lostOpinions}
          onCancel={() => setConvertToParagraph(null)}
          onConfirm={() => {
            setBlocks((current) => convertVersionedToParagraph(current, convertToParagraph.blockId));
            setConvertToParagraph(null);
          }}
        />
      ) : null}

      {prepublishConfirm ? (
        <PrepublishWarningsDialog
          count={prepublishWarnings.length}
          onCancel={() => {
            prepublishConfirm(false);
            setPrepublishConfirm(null);
          }}
          onConfirm={() => {
            prepublishConfirm(true);
            setPrepublishConfirm(null);
          }}
        />
      ) : null}

      {leaveGuard.blocker.state === 'blocked' ? (
        <UnsavedChangesDialog onStay={leaveGuard.blocker.reset} onLeave={leaveAndDiscard} />
      ) : null}

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
  const [searchParams] = useSearchParams();
  if (articleId !== undefined) {
    return <EditArticleLoader articleId={Number(articleId)} />;
  }

  // `?translationOf={id}&locale={code}` (I-06, #110) starts a translation; anything else a plain new article.
  const sourceId = Number(searchParams.get('translationOf'));
  const translationLocale = searchParams.get('locale');
  const translation = Number.isInteger(sourceId) && sourceId > 0 && isLanguage(translationLocale)
    ? { sourceId, locale: translationLocale }
    : undefined;
  return <ArticleEditor key={translation ? `${translation.sourceId}-${translation.locale}` : 'new'} mode={{ kind: 'create', translation }} />;
};

export default ArticleEditorPage;
