-- Migration 021: reusable concert instrumentation blueprints
-- (Masterworks / Pops / Chamber, etc.) — a named list of position + seat-count
-- pairs a manager can start a new concert from, distinct from email templates.

CREATE TABLE IF NOT EXISTS public.concert_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS concert_templates_org_idx ON public.concert_templates(organization_id);

DROP TRIGGER IF EXISTS concert_templates_set_updated_at ON public.concert_templates;
CREATE TRIGGER concert_templates_set_updated_at
  BEFORE UPDATE ON public.concert_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.concert_template_positions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_template_id uuid NOT NULL REFERENCES public.concert_templates(id) ON DELETE CASCADE,
  position_name       text NOT NULL,
  musicians_needed    integer NOT NULL DEFAULT 1,
  display_order       int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ctp_template_idx ON public.concert_template_positions(concert_template_id, display_order);

ALTER TABLE public.concert_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concert_template_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers manage own org concert templates" ON public.concert_templates;
CREATE POLICY "managers manage own org concert templates"
  ON public.concert_templates FOR ALL
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

DROP POLICY IF EXISTS "managers manage own org concert template positions" ON public.concert_template_positions;
CREATE POLICY "managers manage own org concert template positions"
  ON public.concert_template_positions FOR ALL
  USING (
    concert_template_id IN (
      SELECT t.id FROM public.concert_templates t
      WHERE t.organization_id IN (
        SELECT organization_id FROM public.managers
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  )
  WITH CHECK (
    concert_template_id IN (
      SELECT t.id FROM public.concert_templates t
      WHERE t.organization_id IN (
        SELECT organization_id FROM public.managers
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );
