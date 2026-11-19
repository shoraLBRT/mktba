/** What a route module may declare in its `handle` export. */
export type RouteHandle = {
  /** The page renders its own `PageMeta`; the root then leaves the generic, non-indexed one out. */
  ownsMeta?: boolean;
};
