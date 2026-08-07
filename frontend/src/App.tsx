/**
 * ---
 * @customize  Tab state lives here. 5 pages don't justify a router — keeps
 *             the dependency graph one file shallower. Swap to TanStack
 *             Router (or React Router) when you need URL state or
 *             deep-linking; each page is self-contained so deletion stays
 *             cheap.
 * ---
 */
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import type { NavKey } from '@/components/layout/Nav';
import { Home } from '@/pages/Home';
import { Leaderboard } from '@/pages/Leaderboard';
import { Play } from '@/pages/Play';

export default function App() {
  const [active, setActive] = useState<NavKey>('home');

  let page: ReactNode;
  switch (active) {
    case 'home':
      page = <Home onNavigate={setActive} />;
      break;
    case 'play':
      page = <Play />;
      break;
    case 'leaderboard':
      page = <Leaderboard />;
      break;
  }

  return (
    <Layout active={active} onSelect={setActive}>
      {page}
    </Layout>
  );
}
