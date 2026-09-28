-- Brandable public profiles. Private assets are only retrievable through the API proxy.
create table if not exists control.business_profile_assets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references control.business_profiles(id) on delete restrict,
  actor_user_id uuid not null,
  object_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 3145728),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  state text not null default 'staged' check (state in ('staged', 'active', 'retired')),
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

alter table control.business_profile_assets enable row level security;
alter table control.business_profile_assets force row level security;
revoke all on control.business_profile_assets from public, anon, authenticated;
grant select, insert, update, delete on control.business_profile_assets to service_role;

alter table control.business_profiles
  add column if not exists background_color text not null default '#F3E9DF',
  add column if not exists card_color text not null default '#FFFFFF',
  add column if not exists text_color text not null default '#261D18',
  add column if not exists icon_color text not null default '#6D4D3C',
  add column if not exists icon_mode text not null default 'brand',
  add column if not exists avatar_asset_id uuid references control.business_profile_assets(id) on delete restrict,
  add column if not exists avatar_alt_text text;

alter table control.business_profiles
  add constraint business_profiles_background_color_check check (background_color ~ '^#[0-9A-F]{6}$'),
  add constraint business_profiles_card_color_check check (card_color ~ '^#[0-9A-F]{6}$'),
  add constraint business_profiles_text_color_check check (text_color ~ '^#[0-9A-F]{6}$'),
  add constraint business_profiles_icon_color_check check (icon_color ~ '^#[0-9A-F]{6}$'),
  add constraint business_profiles_icon_mode_check check (icon_mode in ('brand', 'monochrome')),
  add constraint business_profiles_avatar_alt_text_check check (avatar_alt_text is null or length(avatar_alt_text) between 1 and 160);

create index if not exists business_profile_assets_owner_state_idx
  on control.business_profile_assets (profile_id, state, created_at desc);
create index if not exists business_profile_assets_staged_expiry_idx
  on control.business_profile_assets (expires_at)
  where state = 'staged';

create table if not exists control.business_profile_asset_upload_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null,
  uploaded_at timestamptz not null default now()
);
alter table control.business_profile_asset_upload_events enable row level security;
alter table control.business_profile_asset_upload_events force row level security;
revoke all on control.business_profile_asset_upload_events from public, anon, authenticated;
grant select, insert on control.business_profile_asset_upload_events to service_role;
grant usage, select on sequence control.business_profile_asset_upload_events_id_seq to service_role;
create index if not exists business_profile_asset_upload_events_actor_time_idx
  on control.business_profile_asset_upload_events (actor_user_id, uploaded_at desc);

create or replace function control.reserve_business_profile_asset_upload(p_actor_user_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  recent_count integer;
begin
  if p_actor_user_id is null then raise exception 'business_profile_actor_required'; end if;
  perform pg_advisory_xact_lock(hashtext('business-profile-upload:' || p_actor_user_id::text));
  select count(*) into recent_count from control.business_profile_asset_upload_events
   where actor_user_id = p_actor_user_id and uploaded_at > now() - interval '1 hour';
  if recent_count >= 30 then return false; end if;
  insert into control.business_profile_asset_upload_events (actor_user_id) values (p_actor_user_id);
  return true;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-profile-assets', 'business-profile-assets', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function control.business_profile_relative_luminance(p_hex text)
returns numeric
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  r numeric;
  g numeric;
  b numeric;
begin
  if p_hex !~ '^#[0-9A-F]{6}$' then raise exception 'business_profile_appearance_invalid'; end if;
  r := get_byte(decode(substr(p_hex, 2, 2), 'hex'), 0)::numeric / 255;
  g := get_byte(decode(substr(p_hex, 4, 2), 'hex'), 0)::numeric / 255;
  b := get_byte(decode(substr(p_hex, 6, 2), 'hex'), 0)::numeric / 255;
  r := case when r <= 0.04045 then r / 12.92 else power((r + 0.055) / 1.055, 2.4) end;
  g := case when g <= 0.04045 then g / 12.92 else power((g + 0.055) / 1.055, 2.4) end;
  b := case when b <= 0.04045 then b / 12.92 else power((b + 0.055) / 1.055, 2.4) end;
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
end;
$$;

create or replace function control.enforce_business_profile_appearance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  card_luminance numeric;
  text_luminance numeric;
  icon_luminance numeric;
begin
  if new.status <> 'published' then return new; end if;
  card_luminance := control.business_profile_relative_luminance(new.card_color);
  text_luminance := control.business_profile_relative_luminance(new.text_color);
  icon_luminance := control.business_profile_relative_luminance(new.icon_color);
  if (greatest(card_luminance, text_luminance) + 0.05) / (least(card_luminance, text_luminance) + 0.05) < 4.5 then
    raise exception 'business_profile_appearance_text_contrast';
  end if;
  if new.icon_mode = 'monochrome'
     and (greatest(card_luminance, icon_luminance) + 0.05) / (least(card_luminance, icon_luminance) + 0.05) < 3 then
    raise exception 'business_profile_appearance_icon_contrast';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_business_profile_appearance on control.business_profiles;
create trigger enforce_business_profile_appearance
before insert or update of status, card_color, text_color, icon_color, icon_mode
on control.business_profiles
for each row execute function control.enforce_business_profile_appearance();

create or replace function control.update_business_profile_appearance(
  p_profile_id uuid,
  p_expected_revision integer,
  p_actor_user_id uuid,
  p_appearance jsonb,
  p_avatar_asset_id uuid,
  p_avatar_alt_text text,
  p_increment_revision boolean default true
) returns control.business_profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  profile_row control.business_profiles%rowtype;
  asset_row control.business_profile_assets%rowtype;
begin
  select * into profile_row from control.business_profiles where id = p_profile_id for update;
  if not found then raise exception 'business_profile_not_found'; end if;
  if profile_row.revision <> p_expected_revision then raise exception 'business_profile_stale'; end if;
  if profile_row.status = 'disabled' then raise exception 'business_profile_disabled'; end if;
  if p_actor_user_id is null or jsonb_typeof(p_appearance) <> 'object' then raise exception 'business_profile_appearance_invalid'; end if;
  if p_appearance->>'icon_mode' not in ('brand', 'monochrome') then raise exception 'business_profile_appearance_invalid'; end if;
  if p_avatar_alt_text is not null and length(p_avatar_alt_text) not between 1 and 160 then raise exception 'business_profile_avatar_alt_text_invalid'; end if;
  if p_avatar_asset_id is not null then
    select * into asset_row from control.business_profile_assets
      where id = p_avatar_asset_id and profile_id = p_profile_id and actor_user_id = p_actor_user_id
        and state = 'staged' and expires_at > now()
      for update;
    if not found and profile_row.avatar_asset_id is distinct from p_avatar_asset_id then raise exception 'business_profile_asset_invalid'; end if;
  end if;
  update control.business_profiles set
    background_color = upper(p_appearance->>'background_color'),
    card_color = upper(p_appearance->>'card_color'),
    text_color = upper(p_appearance->>'text_color'),
    icon_color = upper(p_appearance->>'icon_color'),
    icon_mode = p_appearance->>'icon_mode',
    avatar_asset_id = p_avatar_asset_id,
    avatar_alt_text = p_avatar_alt_text,
    revision = revision + case when p_increment_revision then 1 else 0 end,
    updated_at = now()
    where id = p_profile_id returning * into profile_row;
  if asset_row.id is not null then
    update control.business_profile_assets set state = 'active', activated_at = now() where id = asset_row.id;
  end if;
  return profile_row;
end;
$$;

create or replace function control.update_business_profile_complete(
  p_profile_id uuid, p_expected_revision integer, p_actor_user_id uuid,
  p_display_name text, p_headline text, p_location_name text, p_address text,
  p_links jsonb, p_appearance jsonb, p_avatar_asset_id uuid, p_avatar_alt_text text
) returns control.business_profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_row control.business_profiles%rowtype;
begin
  updated_row := control.update_business_profile(
    p_profile_id, p_expected_revision, p_actor_user_id, p_display_name,
    p_headline, p_location_name, p_address, p_links
  );
  updated_row := control.update_business_profile_appearance(
    p_profile_id, updated_row.revision, p_actor_user_id, p_appearance,
    p_avatar_asset_id, p_avatar_alt_text, false
  );
  return updated_row;
end;
$$;

revoke all on function control.business_profile_relative_luminance(text) from public, anon, authenticated;
revoke all on function control.enforce_business_profile_appearance() from public, anon, authenticated;
revoke all on function control.reserve_business_profile_asset_upload(uuid) from public, anon, authenticated;
revoke all on function control.update_business_profile_appearance(uuid, integer, uuid, jsonb, uuid, text, boolean) from public, anon, authenticated;
revoke all on function control.update_business_profile_complete(uuid, integer, uuid, text, text, text, text, jsonb, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function control.update_business_profile_appearance(uuid, integer, uuid, jsonb, uuid, text, boolean) to service_role;
grant execute on function control.update_business_profile_complete(uuid, integer, uuid, text, text, text, text, jsonb, jsonb, uuid, text) to service_role;
grant execute on function control.reserve_business_profile_asset_upload(uuid) to service_role;

comment on table control.business_profile_assets is 'Private profile avatar objects; only the API may read or mutate metadata.';
comment on column control.business_profiles.avatar_asset_id is 'Private Storage asset projected only through the public profile API.';
