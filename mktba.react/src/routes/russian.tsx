import { Outlet } from 'react-router';
// The Russian strings come with the Russian pages (I-02, #106): see `localization/defaultLanguage.ts`.
import '../localization/defaultLanguage';

/** The pathless parent of the Russian reader's pages: it only brings their strings. */
export default function RussianPages() {
  return <Outlet />;
}
