-- Migration 019: ranked contacts per library position + concert event/rehearsal details

-- ─── 1. Ranked members of a library position ──────────────────────────────────
-- Every row references a real musicians.id (unlike recipient_group_members,
-- these are never ad-hoc) since a position's roster mirrors the org's contacts.

CREATE TABLE IF NOT EXISTS public.position_definition_members (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_definition_id uuid NOT NULL REFERENCES public.position_definitions(id) ON DELETE CASCADE,
  musician_id           uuid NOT NULL REFERENCES public.musicians(id) ON DELETE CASCADE,
  rank                  integer NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (position_definition_id, musician_id)
);
CREATE INDEX IF NOT EXISTS pdm_position_idx ON public.position_definition_members(position_definition_id);

ALTER TABLE public.position_definition_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers manage own org position members" ON public.position_definition_members;
CREATE POLICY "managers manage own org position members"
  ON public.position_definition_members FOR ALL
  USING (
    position_definition_id IN (
      SELECT pd.id FROM public.position_definitions pd
      WHERE pd.organization_id IN (
        SELECT organization_id FROM public.managers
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  )
  WITH CHECK (
    position_definition_id IN (
      SELECT pd.id FROM public.position_definitions pd
      WHERE pd.organization_id IN (
        SELECT organization_id FROM public.managers
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- ─── 2. Concert event time + rehearsals ────────────────────────────────────────

ALTER TABLE public.concerts
  ADD COLUMN IF NOT EXISTS event_time time;

CREATE TABLE IF NOT EXISTS public.concert_rehearsals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id     uuid NOT NULL REFERENCES public.concerts(id) ON DELETE CASCADE,
  date           date NOT NULL,
  start_time     time,
  location       text,
  notes          text,
  display_order  int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS concert_rehearsals_concert_idx ON public.concert_rehearsals(concert_id, display_order);

ALTER TABLE public.concert_rehearsals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers manage own org concert rehearsals" ON public.concert_rehearsals;
CREATE POLICY "managers manage own org concert rehearsals"
  ON public.concert_rehearsals FOR ALL
  USING (
    concert_id IN (
      SELECT c.id FROM public.concerts c
      WHERE c.organization_id IN (
        SELECT organization_id FROM public.managers
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  )
  WITH CHECK (
    concert_id IN (
      SELECT c.id FROM public.concerts c
      WHERE c.organization_id IN (
        SELECT organization_id FROM public.managers
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );
