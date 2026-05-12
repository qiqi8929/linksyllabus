-- Distinguish how step clip timestamps were assigned (manual edit vs chapter/video model vs transcript AI).
alter table public.steps
  add column if not exists timestamp_source text;

alter table public.steps
  drop constraint if exists steps_timestamp_source_check;

alter table public.steps
  add constraint steps_timestamp_source_check
  check (
    timestamp_source is null
    or timestamp_source in ('ai', 'manual', 'chapter')
  );

comment on column public.steps.timestamp_source is
  'ai = transcript-aligned guess; manual = user saved from editor; chapter = non-zero clip from tooling/import; null = unset placeholder (0,0) eligible for transcript AI';
