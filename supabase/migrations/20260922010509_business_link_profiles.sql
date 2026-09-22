create table control.business_profiles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  tenant_id uuid unique references control.tenants(id) on delete restrict,
  display_name text not null check (length(trim(display_name)) between 1 and 160),
  headline text,
  location_name text,
  address text,
  status text not null default 'draft' check (status in ('draft', 'published', 'disabled')),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'published') = (published_at is not null))
);

create table control.business_profile_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references control.business_profiles(id) on delete restrict,
  kind text not null check (kind in ('menu', 'google_review', 'instagram', 'tiktok', 'website', 'whatsapp', 'phone', 'facebook', 'maps', 'survey', 'custom')),
  label text,
  href text not null,
  enabled boolean not null default false,
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, kind, sort_order)
);

alter table control.dynamic_link_units add column if not exists profile_id uuid references control.business_profiles(id) on delete restrict;
alter table control.dynamic_link_units drop constraint if exists dynamic_link_units_destination_type_check;
alter table control.dynamic_link_units add constraint dynamic_link_units_destination_type_check
  check (destination_type in ('google_review', 'website', 'menu', 'whatsapp', 'instagram', 'profile'));
alter table control.dynamic_link_units add constraint dynamic_link_units_profile_destination_check
  check ((destination_type = 'profile') = (profile_id is not null));

create index business_profiles_status_slug_idx on control.business_profiles (status, slug);
create index business_profile_links_profile_enabled_order_idx on control.business_profile_links (profile_id, enabled, sort_order);
create index dynamic_link_units_profile_id_idx on control.dynamic_link_units (profile_id) where profile_id is not null;

alter table control.business_profiles enable row level security;
alter table control.business_profiles force row level security;
alter table control.business_profile_links enable row level security;
alter table control.business_profile_links force row level security;
revoke all on table control.business_profiles, control.business_profile_links from anon, authenticated;
grant all on table control.business_profiles, control.business_profile_links to service_role;
