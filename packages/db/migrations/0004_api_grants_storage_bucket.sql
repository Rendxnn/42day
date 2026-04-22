grant usage on schema control to anon, authenticated, service_role;
grant all on all tables in schema control to anon, authenticated, service_role;
grant all on all routines in schema control to anon, authenticated, service_role;
grant all on all sequences in schema control to anon, authenticated, service_role;
alter default privileges for role postgres in schema control grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema control grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema control grant all on sequences to anon, authenticated, service_role;

grant usage on schema tenant_demo to anon, authenticated, service_role;
grant all on all tables in schema tenant_demo to anon, authenticated, service_role;
grant all on all routines in schema tenant_demo to anon, authenticated, service_role;
grant all on all sequences in schema tenant_demo to anon, authenticated, service_role;
alter default privileges for role postgres in schema tenant_demo grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema tenant_demo grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema tenant_demo grant all on sequences to anon, authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
