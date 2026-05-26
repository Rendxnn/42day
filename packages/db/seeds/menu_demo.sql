with location as (
  select id
  from tenant_demo.locations
  where name = 'Sede principal'
  order by created_at
  limit 1
),
products_to_insert as (
  select *
  from (
    values
      ('Almuerzo del dia', 'Almuerzo principal con sopa, proteina, acompanante y bebida', 18000, 'menu_del_dia'),
      ('Sopa del dia', 'Sopa disponible como entrada o adicional', 6000, 'entrada'),
      ('Limonada natural', 'Bebida fria de la casa', 5000, 'bebida')
  ) as product(name, description, base_price, category)
),
inserted_products as (
  insert into tenant_demo.products (name, description, base_price, category, is_active)
  select name, description, base_price, category, true
  from products_to_insert
  where not exists (
    select 1
    from tenant_demo.products existing
    where existing.name = products_to_insert.name
  )
  returning id, name
),
all_products as (
  select id, name
  from inserted_products
  union
  select id, name
  from tenant_demo.products
  where name in ('Almuerzo del dia', 'Sopa del dia', 'Limonada natural')
),
menu as (
  insert into tenant_demo.menus (location_id, date, name, status, published_at)
  select id, current_date, 'Menu del dia', 'published', now()
  from location
  on conflict (location_id, date) do update set
    name = excluded.name,
    status = 'published',
    published_at = now()
  returning id
)
insert into tenant_demo.menu_items (menu_id, product_id, display_name, price_override, available_quantity, is_available, sort_order)
select
  menu.id,
  product.id,
  product.name,
  null,
  null,
  true,
  case product.name
    when 'Almuerzo del dia' then 1
    when 'Sopa del dia' then 2
    else 3
  end
from menu
cross join all_products product
where not exists (
  select 1
  from tenant_demo.menu_items existing
  where existing.menu_id = menu.id
    and existing.product_id = product.id
);

