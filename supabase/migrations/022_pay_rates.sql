-- Migration 022: payment rate tiers, assignable per library position and
-- overridable per concert position at send time.

CREATE TABLE IF NOT EXISTS public.pay_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  amount          numeric(10,2) NOT NULL,
  currency        text NOT NULL DEFAULT 'USD',
  display_order   int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pay_rates_org_idx ON public.pay_rates(organization_id, display_order);

ALTER TABLE public.pay_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers manage own org pay rates" ON public.pay_rates;
CREATE POLICY "managers manage own org pay rates"
  ON public.pay_rates FOR ALL
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

ALTER TABLE public.position_definitions
  ADD COLUMN IF NOT EXISTS pay_rate_id uuid REFERENCES public.pay_rates(id) ON DELETE SET NULL;

ALTER TABLE public.concert_positions
  ADD COLUMN IF NOT EXISTS pay_rate_id uuid REFERENCES public.pay_rates(id) ON DELETE SET NULL;
