'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConcertForm } from '@/components/concerts/ConcertForm';
import type { Concert, ConcertRehearsal } from '@/types';

export default function EditConcertPage({ params }: { params: { id: string } }) {
  const [concert, setConcert] = useState<(Concert & { rehearsals?: ConcertRehearsal[] }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/concerts/${params.id}`)
      .then((r) => r.json())
      .then((d) => setConcert(d.concert ?? null))
      .catch(() => toast.error('Failed to load concert'))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <div className="text-center text-slate-400 py-20">Loading…</div>;
  if (!concert) return <div className="text-center text-red-500 py-20">Concert not found.</div>;

  return <ConcertForm concert={concert} />;
}
