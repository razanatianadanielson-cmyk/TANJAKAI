'use client';
import { Suspense } from 'react';
import Shell from '@/components/Shell';
import { Chargement } from '@/components/ui';

// Suspense : exigé par Next 16 (Cache Components) pour les hooks qui lisent l'URL (usePathname, useParams).
export default function AppLayout({ children }) {
  return (
    <Suspense fallback={<Chargement>Chargement…</Chargement>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
