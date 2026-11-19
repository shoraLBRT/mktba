/** What a route module may declare in its `handle` export. */
export type RouteHandle = {
  /** The page renders its own `<title>`; the root then leaves the default one out. */
  ownsTitle?: boolean;
};
