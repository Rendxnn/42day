do $$
declare
  tenant_schema text;
begin
  for tenant_schema in
    select distinct schema_name
    from control.tenants
    where schema_name like 'tenant_%'
    union
    select 'tenant_demo'
  loop
    if to_regclass(format('%I.locations', tenant_schema)) is not null then
      execute format(
        'alter table %I.locations
           add column if not exists restaurant_city text,
           add column if not exists restaurant_department text,
           add column if not exists restaurant_country text not null default ''Colombia'',
           add column if not exists delivery_radius_km double precision not null default 3,
           add column if not exists allow_written_address_reference boolean not null default true,
           add column if not exists try_geocode_written_addresses boolean not null default false,
           add column if not exists allow_out_of_coverage_orders boolean not null default false,
           add column if not exists request_location_message text not null default ''Perfecto. Para validar si tenemos cobertura, por favor envianos tu ubicacion actual usando el boton de ubicacion de WhatsApp.'',
           add column if not exists written_address_fallback_message text not null default ''Para evitar errores con el domicilio, necesitamos validar tu ubicacion exacta. Por favor envianos tu ubicacion usando el boton de ubicacion de WhatsApp. Tambien guardaremos tu direccion escrita como referencia para el domiciliario.'',
           add column if not exists out_of_coverage_message text not null default ''Lo sentimos, por ahora no tenemos cobertura para tu ubicacion. Puedes recoger en el local.''',
        tenant_schema
      );

      execute format(
        'alter table %I.locations
           drop constraint if exists locations_latitude_check,
           drop constraint if exists locations_longitude_check,
           drop constraint if exists locations_delivery_radius_km_check',
        tenant_schema
      );
      execute format(
        'alter table %I.locations
           add constraint locations_latitude_check check (latitude is null or latitude between -90 and 90),
           add constraint locations_longitude_check check (longitude is null or longitude between -180 and 180),
           add constraint locations_delivery_radius_km_check check (delivery_radius_km > 0 and delivery_radius_km <= 30)',
        tenant_schema
      );
    end if;

    if to_regclass(format('%I.draft_orders', tenant_schema)) is not null then
      execute format(
        'alter table %I.draft_orders
           add column if not exists customer_address_text text,
           add column if not exists customer_latitude double precision,
           add column if not exists customer_longitude double precision,
           add column if not exists delivery_distance_km double precision,
           add column if not exists is_inside_delivery_coverage boolean,
           add column if not exists coverage_validation_method text,
           add column if not exists coverage_confidence text,
           add column if not exists coverage_checked_at timestamptz',
        tenant_schema
      );
      execute format(
        'alter table %I.draft_orders
           drop constraint if exists draft_orders_customer_latitude_check,
           drop constraint if exists draft_orders_customer_longitude_check,
           drop constraint if exists draft_orders_delivery_distance_km_check,
           drop constraint if exists draft_orders_coverage_validation_method_check,
           drop constraint if exists draft_orders_coverage_confidence_check',
        tenant_schema
      );
      execute format(
        'alter table %I.draft_orders
           add constraint draft_orders_customer_latitude_check check (customer_latitude is null or customer_latitude between -90 and 90),
           add constraint draft_orders_customer_longitude_check check (customer_longitude is null or customer_longitude between -180 and 180),
           add constraint draft_orders_delivery_distance_km_check check (delivery_distance_km is null or delivery_distance_km >= 0),
           add constraint draft_orders_coverage_validation_method_check check (coverage_validation_method is null or coverage_validation_method in (''whatsapp_location'', ''written_address_reference'', ''geocoded_address'', ''not_validated'')),
           add constraint draft_orders_coverage_confidence_check check (coverage_confidence is null or coverage_confidence in (''high'', ''medium'', ''low'', ''failed''))',
        tenant_schema
      );
    end if;

    if to_regclass(format('%I.orders', tenant_schema)) is not null then
      execute format(
        'alter table %I.orders
           add column if not exists customer_address_text text,
           add column if not exists customer_latitude double precision,
           add column if not exists customer_longitude double precision,
           add column if not exists delivery_distance_km double precision,
           add column if not exists is_inside_delivery_coverage boolean,
           add column if not exists coverage_validation_method text,
           add column if not exists coverage_confidence text,
           add column if not exists coverage_checked_at timestamptz',
        tenant_schema
      );
      execute format(
        'alter table %I.orders
           drop constraint if exists orders_customer_latitude_check,
           drop constraint if exists orders_customer_longitude_check,
           drop constraint if exists orders_delivery_distance_km_check,
           drop constraint if exists orders_coverage_validation_method_check,
           drop constraint if exists orders_coverage_confidence_check',
        tenant_schema
      );
      execute format(
        'alter table %I.orders
           add constraint orders_customer_latitude_check check (customer_latitude is null or customer_latitude between -90 and 90),
           add constraint orders_customer_longitude_check check (customer_longitude is null or customer_longitude between -180 and 180),
           add constraint orders_delivery_distance_km_check check (delivery_distance_km is null or delivery_distance_km >= 0),
           add constraint orders_coverage_validation_method_check check (coverage_validation_method is null or coverage_validation_method in (''whatsapp_location'', ''written_address_reference'', ''geocoded_address'', ''not_validated'')),
           add constraint orders_coverage_confidence_check check (coverage_confidence is null or coverage_confidence in (''high'', ''medium'', ''low'', ''failed''))',
        tenant_schema
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
