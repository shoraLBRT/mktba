import type { Config } from '@react-router/dev/config';

// Framework mode (decision D1): the public pages are rendered on the server, the admin stays a
// client-only route. Routes are declared in src/routes.ts.
export default {
  appDirectory: 'src',
  ssr: true,
} satisfies Config;
