create index if not exists tenant_channels_tenant_id_idx on control.tenant_channels (tenant_id);
create index if not exists webhook_events_tenant_id_idx on control.webhook_events (tenant_id);

create index if not exists app_events_conversation_id_idx on tenant_demo.app_events (conversation_id);
create index if not exists app_events_draft_order_id_idx on tenant_demo.app_events (draft_order_id);
create index if not exists app_events_order_id_idx on tenant_demo.app_events (order_id);

create index if not exists combo_items_combo_id_idx on tenant_demo.combo_items (combo_id);
create index if not exists combo_items_product_id_idx on tenant_demo.combo_items (product_id);

create index if not exists conversations_customer_id_idx on tenant_demo.conversations (customer_id);
create index if not exists conversations_current_draft_order_id_idx on tenant_demo.conversations (current_draft_order_id);

create index if not exists draft_order_items_draft_order_id_idx on tenant_demo.draft_order_items (draft_order_id);
create index if not exists draft_order_items_menu_item_id_idx on tenant_demo.draft_order_items (menu_item_id);
create index if not exists draft_order_items_product_id_idx on tenant_demo.draft_order_items (product_id);
create index if not exists draft_order_items_combo_id_idx on tenant_demo.draft_order_items (combo_id);

create index if not exists draft_orders_conversation_id_idx on tenant_demo.draft_orders (conversation_id);
create index if not exists draft_orders_customer_id_idx on tenant_demo.draft_orders (customer_id);
create index if not exists draft_orders_location_id_idx on tenant_demo.draft_orders (location_id);

create index if not exists human_intervention_alerts_conversation_id_idx on tenant_demo.human_intervention_alerts (conversation_id);
create index if not exists human_intervention_alerts_draft_order_id_idx on tenant_demo.human_intervention_alerts (draft_order_id);
create index if not exists human_intervention_alerts_order_id_idx on tenant_demo.human_intervention_alerts (order_id);

create index if not exists menu_items_menu_id_idx on tenant_demo.menu_items (menu_id);
create index if not exists menu_items_product_id_idx on tenant_demo.menu_items (product_id);
create index if not exists menu_items_combo_id_idx on tenant_demo.menu_items (combo_id);

create index if not exists messages_conversation_id_idx on tenant_demo.messages (conversation_id);

create index if not exists order_items_order_id_idx on tenant_demo.order_items (order_id);
create index if not exists order_items_product_id_idx on tenant_demo.order_items (product_id);
create index if not exists order_items_combo_id_idx on tenant_demo.order_items (combo_id);

create index if not exists orders_draft_order_id_idx on tenant_demo.orders (draft_order_id);
create index if not exists orders_customer_id_idx on tenant_demo.orders (customer_id);
create index if not exists orders_location_id_idx on tenant_demo.orders (location_id);
create index if not exists orders_payment_proof_file_id_idx on tenant_demo.orders (payment_proof_file_id);

create index if not exists payment_proofs_conversation_id_idx on tenant_demo.payment_proofs (conversation_id);
create index if not exists payment_proofs_message_id_idx on tenant_demo.payment_proofs (message_id);
create index if not exists payment_proofs_draft_order_id_idx on tenant_demo.payment_proofs (draft_order_id);
create index if not exists payment_proofs_order_id_idx on tenant_demo.payment_proofs (order_id);

create index if not exists product_option_values_option_id_idx on tenant_demo.product_option_values (option_id);
create index if not exists product_options_product_id_idx on tenant_demo.product_options (product_id);
