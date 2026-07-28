-- Migration 018: Position library + multi-position campaign grouping
-- Adds a reusable, org-scoped library of orchestra position names (Violin 1,
-- Principal Oboe, etc.) that compose can pick from, and a display-only tag so
-- multiple concert_positions created together in one compose pass can be
-- shown as a batch in the UI.

-- ─── 1. Position library ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.position_definitions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  section          text,
  display_order    int NOT NULL DEFAULT 0,
  default_group_id uuid REFERENCES public.recipient_groups(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE INDEX IF NOT EXISTS position_definitions_org_idx
  ON public.position_definitions(organization_id, display_order);

ALTER TABLE public.position_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers manage own org position definitions" ON public.position_definitions;
CREATE POLICY "managers manage own org position definitions"
  ON public.position_definitions FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.managers
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.managers
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ─── 2. Display-only batch tag for positions created together in compose ─────

ALTER TABLE public.concert_positions
  ADD COLUMN IF NOT EXISTS position_group_label text;
