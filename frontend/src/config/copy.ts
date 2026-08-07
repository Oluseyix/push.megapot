/**
 * ---
 * @customize  Single edit point for brand voice. This holds ONLY static UI
 *             copy - connect prompts, banners, section headings, action
 *             labels. Error messages from wagmi/viem stay where they are
 *             (they're dynamic).
 * ---
 */
export const COPY = {
  // App shell
  appName: 'Push',
  brandShort: 'Push',
  brandSuffix: ' · Megapot',

  // Play page
  connectToPlay: 'Connect your wallet to stake and climb.',
  notDeployed:
    'Push is not deployed yet on this chain - set VITE_PUSH_ADDRESS in .env once it is.',

  // Footer
  disclaimerLineDesktop:
    'Real-stakes wagering. A crashed round keeps your stake - there is no refund, no consolation ticket, nothing returned.',
  disclaimerLineMobile: 'Real money. A crash keeps your stake.',
  disclaimerLinkText: 'how it works',
} as const;

export type CopyKey = keyof typeof COPY;
