Exit code: 0
Wall time: 0.2 seconds
Output:
do $$
declare
  target_schema text;
begin
  for target_schema in
    select 'tenant_template'
    union
    select schema_name from control.tenants where schema_name like 'tenant_%'
  loop
    if to_regclass(format('%I.customer_addresses', target_schema)) is not null then
      execute format('alter table %I.customer_addresses add column if not exists address_details text', target_schema);
    end if;

    if to_regclass(format('%I.draft_orders', target_schema)) is not null then
      execute format('alter table %I.draft_orders add column if not exists delivery_address_details text', target_schema);
    end if;

    if to_regclass(format('%I.orders', target_schema)) is not null then
      execute format('alter table %I.orders add column if not exists delivery_address_details text', target_schema);
    end if;

    if to_regclass(format('%I.locations', target_schema)) is not null then
      execute format(
        $sql$
          alter table %1$I.locations
          alter column request_location_message set default
          'Perfecto. Para validar si tenemos cobertura, envÃ­anos tu ubicaciÃ³n actual usando el botÃ³n de ubicaciÃ³n de WhatsApp. Si prefieres escribirla, envÃ­anos en un solo mensaje la direcciÃ³n completa con barrio, municipio y los detalles de entrega que apliquen (apto, torre, unidad, casa o referencia).'
        $sql$,
        target_schema
      );
      execute format(
        $sql$
          update %1$I.locations
          set request_location_message =
            'Perfecto. Para validar si tenemos cobertura, envÃ­anos tu ubicaciÃ³n actual usando el botÃ³n de ubicaciÃ³n de WhatsApp. Si prefieres escribirla, envÃ­anos en un solo mensaje la direcciÃ³n completa con barrio, municipio y los detalles de entrega que apliquen (apto, torre, unidad, casa o referencia).'
          where request_location_message in (
            'Perfecto. Para validar si tenemos cobertura, por favor envianos tu ubicacion actual usando el boton de ubicacion de WhatsApp.',
            'Perfecto. Para validar si tenemos cobertura, por favor envianos tu ubicaciÃ³n actual usando el botÃ³n de ubicaciÃ³n de WhatsApp.'
          )
        $sql$,
        target_schema
      );
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
