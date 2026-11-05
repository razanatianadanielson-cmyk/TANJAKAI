'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Shell from '@/components/Shell';
import { Chargement } from '@/components/ui';

export default function LayoutApplication({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);

  if (loading || !user) return <div className="contenu"><Chargement /></div>;
  return <Shell>{children}</Shell>;
}
