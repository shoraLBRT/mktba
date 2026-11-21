import React, { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale } from '../../localization/hooks';
import { createArticle, moveArticle, updateArticle } from '../../services/adminService';
import { useNavigationTree } from '../../hooks/useNavigationTree';
import { invalidateArticleQueries } from '../../app/queryClient';
import { useCurrentUser } from '../../auth/useCurrentUser';
import { ApiError, extractApiErrorMessage } from '../../shared/api-client/apiError';
import type { NavigationArticleDto } from '../../shared/types/ApiTypes';
import { collectValidParents } from '../../shared/articleTree';
import { setSectionCollapsed } from '../../shared/navigationTreeState';
import { Card } from '../../shared/ui/Card';
import CreateNodeModal from '../../components/CreateNodeModal';
import MoveNodeModal from '../../components/MoveNodeModal';
import NavigationTree from '../../components/NavigationTree';
import { NavigationTreeSkeleton } from '../../components/Skeleton';
import { AdminArticlesHeader } from './AdminArticlesHeader';
import type { TreeMove } from './treeDrop';
import { useTreeDragAndDrop } from './useTreeDragAndDrop';

type CreateNodeTarget = {
  parentId?: number;
  parentTitle?: string;
};

type MoveNodeTarget = {
  article: NavigationArticleDto;
  parentId: number | null;
};

type RenameTarget = {
  article: NavigationArticleDto;
  parentId: number | null;
};

/**
 * `/admin/articles/tree`: the article tree with its editing actions (A-03, #86). Titles open the
 * editor where the user may edit; creating sections is for anyone who writes; moving (drag and drop,
 * the move buttons, the parent picker) and renaming only for admins, as the API allows.
 */
const AdminArticleTreePage: React.FC = () => {
  const locale = useLocale();
  const t = locale.adminLayout;
  const queryClient = useQueryClient();
  const { data: navigationTree, isLoading, error } = useNavigationTree();
  const canMoveArticles = useCurrentUser().can('canEditAnyArticle');

  const [createTarget, setCreateTarget] = useState<CreateNodeTarget | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveNodeTarget | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

  const openCreateModal = (target: CreateNodeTarget) => {
    setCreateError(null);
    setCreateTarget(target);
  };

  const createNodeMutation = useMutation({
    mutationFn: (title: string) => createArticle({ title, parentArticleId: createTarget?.parentId }),
    onSuccess: () => {
      void invalidateArticleQueries(queryClient);
      // The new child is shown at once even under a collapsed section.
      if (createTarget?.parentId !== undefined) setSectionCollapsed(createTarget.parentId, false);
      setCreateTarget(null);
      setCreateError(null);
    },
    onError: (createFailure) => {
      // A transport failure carries no HTTP status and only an English axios message.
      const isNetworkFailure = createFailure instanceof ApiError && createFailure.status === undefined;
      setCreateError(
        isNetworkFailure
          ? locale.createNode.errorNetwork
          : `${locale.createNode.error}: ${extractApiErrorMessage(createFailure)}`,
      );
    },
  });

  const moveNodeMutation = useMutation({
    mutationFn: ({ articleId, parentId, index }: TreeMove) =>
      moveArticle(articleId, { parentArticleId: parentId, index }),
    onSuccess: (_moved, { parentId }) => {
      void invalidateArticleQueries(queryClient);
      if (parentId !== null) setSectionCollapsed(parentId, false);
      setMoveTarget(null);
      setMoveError(null);
    },
    onError: (moveFailure) => setMoveError(`${locale.navigationTree.moveError}: ${extractApiErrorMessage(moveFailure)}`),
  });

  const renameNodeMutation = useMutation({
    mutationFn: ({ target, title }: { target: RenameTarget; title: string }) =>
      updateArticle(target.article.id, { title, parentArticleId: target.parentId }),
    onSuccess: () => {
      void invalidateArticleQueries(queryClient);
      setRenameTarget(null);
      setRenameError(null);
    },
    onError: (renameFailure) => setRenameError(`${locale.renameNode.error}: ${extractApiErrorMessage(renameFailure)}`),
  });

  const { mutate: moveNode } = moveNodeMutation;
  const dropMove = useCallback((move: TreeMove) => {
    setMoveError(null);
    moveNode(move);
  }, [moveNode]);
  const dragAndDrop = useTreeDragAndDrop(dropMove);

  const canReorder = canMoveArticles && !moveNodeMutation.isPending;

  return (
    <div className="space-y-4">
      <AdminArticlesHeader description={t.articleTreeDescription} />

      <Card className="p-3">
        <section aria-label={t.articleTreeTitle}>
          <button
            type="button"
            onClick={() => openCreateModal({})}
            className="mb-2 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-page-panel)] hover:text-[var(--color-ink-default)]"
          >
            <Plus size={13} />
            {locale.createNode.newSection}
          </button>

          {isLoading ? (
            <NavigationTreeSkeleton />
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="m-0 font-semibold">{locale.sidebar.loadError}</p>
              <p className="mb-0 mt-1 text-xs text-red-600">{(error as Error).message}</p>
            </div>
          ) : !navigationTree || navigationTree.length === 0 ? (
            <p className="mx-2 my-0 text-sm text-[var(--color-ink-muted)]">{t.emptyTree}</p>
          ) : (
            <>
              {moveError && !moveTarget ? (
                <p role="alert" className="mx-2 mb-2 mt-0 text-[12px] leading-5 text-red-600">
                  {moveError}
                </p>
              ) : null}
              <NavigationTree
                navigationTree={navigationTree}
                showArticleEditActions
                onAddChild={(parentId, parentTitle) => openCreateModal({ parentId, parentTitle })}
                onMove={
                  canReorder
                    ? (articleId, parentId, index) => moveNodeMutation.mutate({ articleId, parentId, index })
                    : undefined
                }
                onRename={
                  canMoveArticles
                    ? (article, parentId) => {
                        setRenameError(null);
                        setRenameTarget({ article, parentId });
                      }
                    : undefined
                }
                dragAndDrop={canReorder ? dragAndDrop : undefined}
                onChangeParent={
                  canReorder
                    ? (article, parentId) => {
                        setMoveError(null);
                        setMoveTarget({ article, parentId });
                      }
                    : undefined
                }
              />
            </>
          )}
        </section>
      </Card>

      {createTarget ? (
        <CreateNodeModal
          parentTitle={createTarget.parentTitle}
          isPending={createNodeMutation.isPending}
          errorMessage={createError}
          onConfirm={(title) => createNodeMutation.mutate(title)}
          onClose={() => {
            setCreateTarget(null);
            setCreateError(null);
          }}
        />
      ) : null}

      {renameTarget ? (
        <CreateNodeModal
          currentTitle={renameTarget.article.title}
          isPending={renameNodeMutation.isPending}
          errorMessage={renameError}
          onConfirm={(title) => renameNodeMutation.mutate({ target: renameTarget, title })}
          onClose={() => {
            setRenameTarget(null);
            setRenameError(null);
          }}
        />
      ) : null}

      {moveTarget ? (
        <MoveNodeModal
          articleTitle={moveTarget.article.title}
          currentParentId={moveTarget.parentId}
          parentOptions={collectValidParents(navigationTree, moveTarget.article.id)}
          isPending={moveNodeMutation.isPending}
          errorMessage={moveError}
          onConfirm={(parentId) =>
            moveNodeMutation.mutate({ articleId: moveTarget.article.id, parentId, index: null })
          }
          onClose={() => {
            setMoveTarget(null);
            setMoveError(null);
          }}
        />
      ) : null}
    </div>
  );
};

export default AdminArticleTreePage;
