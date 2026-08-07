/**
 * ---
 * @customize  Disclaimer link rendered inside <Footer />. The URL is
 *             hardcoded — the component IS the seam. Points at this repo's
 *             README, which documents the real-stakes mechanics (crash =
 *             stake stays in the bankroll, no refund) in full.
 * ---
 */
import type { ReactNode } from 'react';

const DISCLAIMER_URL = 'https://github.com/oluseyix/push.megapot#how-it-works';

export function DisclaimerLink({
  children = 'full disclaimer',
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={DISCLAIMER_URL}
      target="_blank"
      rel="noreferrer"
      className={`underline underline-offset-2 ${className ?? 'hover:text-zinc-700 dark:hover:text-zinc-200'}`.trim()}
    >
      {children}
    </a>
  );
}
