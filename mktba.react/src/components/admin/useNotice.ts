import { useState } from 'react';

export type NoticeTone = 'success' | 'warning' | 'error';
export type Notice = { tone: NoticeTone; message: string };

/** The one dismissible message an admin page shows after an action. */
export const useNotice = () => {
  const [notice, setNotice] = useState<Notice | null>(null);

  return {
    notice,
    showNotice: (tone: NoticeTone, message: string) => setNotice({ tone, message }),
    clearNotice: () => setNotice(null),
  };
};
