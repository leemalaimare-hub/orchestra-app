'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConcertTemplateForm } from '@/components/templates/ConcertTemplateForm';
import type { ConcertTemplateWithPositions } from '@/types';

export default function EditConcertTemplatePage({ params }: { params: { id: string } }) {
  const [template, setTemplate] = useState<ConcertTemplateWithPositions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/concert-templates/${params.id}`)
      .then((r) => r.json())
      .then((d) => setTemplate(d.template ?? null))
      .catch(() => toast.error('Failed to load template'))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <div className="text-center text-slate-400 py-20">Loading…</div>;
  if (!template) return <div className="text-center text-red-500 py-20">Template not found.</div>;

  return <ConcertTemplateForm template={template} />;
}
