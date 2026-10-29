-- Profile and operator preferences remain private to the authenticated owner.
-- Avatar uploads are intentionally bounded data URLs for this private POC; no
-- public storage bucket or credential-bearing upload path is introduced.

alter table public.profiles
  add column if not exists organization_name text,
  add column if not exists avatar_choice text,
  add column if not exists avatar_data_url text,
  add column if not exists hourly_rate numeric(10, 2),
  add column if not exists business_goals text,
  add column if not exists writing_sample text,
  add column if not exists agent_instructions text;

alter table public.profiles
  drop constraint if exists profiles_display_name_length,
  drop constraint if exists profiles_organization_name_length,
  drop constraint if exists profiles_avatar_choice,
  drop constraint if exists profiles_avatar_data_url_length,
  drop constraint if exists profiles_hourly_rate_range;

alter table public.profiles
  add constraint profiles_display_name_length check (display_name is null or char_length(display_name) between 1 and 80),
  add constraint profiles_organization_name_length check (organization_name is null or char_length(organization_name) <= 160),
  add constraint profiles_avatar_choice check (avatar_choice is null or avatar_choice in ('muse', 'forge', 'ember', 'orbit', 'sage', 'arc')),
  add constraint profiles_avatar_data_url_length check (avatar_data_url is null or char_length(avatar_data_url) <= 2100000),
  add constraint profiles_hourly_rate_range check (hourly_rate is null or (hourly_rate >= 0 and hourly_rate <= 1000000));
