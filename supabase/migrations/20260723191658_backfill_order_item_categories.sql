do $$
declare
  tenant_record record;
begin
  for tenant_record in
    select schema_name
    from control.tenants
    where schema_name like 'tenant_%'
  loop
    if to_regclass(format('%I.order_items', tenant_record.schema_name)) is not null
      and to_regclass(format('%I.products', tenant_record.schema_name)) is not null then
      execute format(
        'update %1$I.order_items oi
         set category_snapshot = p.category
         from %1$I.products p
         where oi.product_id = p.id
           and nullif(btrim(oi.category_snapshot), '''') is null
           and nullif(btrim(p.category), '''') is not null',
        tenant_record.schema_name
      );
    end if;
  end loop;
end;
$$;
