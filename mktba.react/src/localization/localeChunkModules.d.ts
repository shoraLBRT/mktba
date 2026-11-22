// A dictionary chunk import (`./locales/<lang>/<namespace>.json?locale-chunk=<chunk>`, see ./chunks.ts):
// the part of that file the chunk owns.
declare module '*?locale-chunk=core' {
  const chunk: Record<string, unknown>;
  export default chunk;
}

declare module '*?locale-chunk=admin' {
  const chunk: Record<string, unknown>;
  export default chunk;
}
