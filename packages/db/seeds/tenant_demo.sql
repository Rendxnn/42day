insert into control.tenants (
  name,
  slug,
  schema_name,
  status,
  timezone,
  currency,
  automation_enabled
)
values (
  'Restaurante Demo',
  'demo',
  'tenant_demo',
  'active',
  'America/Bogota',
  'COP',
  true
)
on conflict (slug) do update set
  name = excluded.name,
  schema_name = excluded.schema_name,
  status = excluded.status,
  timezone = excluded.timezone,
  currency = excluded.currency,
  automation_enabled = excluded.automation_enabled;

insert into tenant_demo.locations (
  name,
  address,
  phone,
  delivery_fee_fixed,
  pickup_enabled,
  delivery_enabled,
  automation_enabled,
  opening_hours,
  coverage_config,
  is_active
)
values (
  'Sede principal',
  'Direccion pendiente',
  null,
  5000,
  true,
  true,
  true,
  '{}'::jsonb,
  '{"type":"none"}'::jsonb,
  true
)
on conflict do nothing;
