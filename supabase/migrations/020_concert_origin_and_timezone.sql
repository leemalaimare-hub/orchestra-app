-- Migration 020: distinguish Concert-builder rows from Compose rows, add timezone

ALTER TABLE public.concerts
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'compose'
    CHECK (origin IN ('compose', 'concert'));

ALTER TABLE public.concerts
  ADD COLUMN IF NOT EXISTS event_timezone text;

ALTER TABLE public.concert_rehearsals
  ADD COLUMN IF NOT EXISTS timezone text;
