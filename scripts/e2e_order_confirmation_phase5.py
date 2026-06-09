from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = REPO_ROOT / "apps" / "api" / ".dev.vars"
DEFAULT_API_BASE = "http://127.0.0.1:8787"
RUN_PREFIX = f"fase5-{int(time.time())}"


class HttpError(RuntimeError):
    def __init__(self, status: int, body: str, url: str):
        super().__init__(f"http_error status={status} url={url} body={body[:400]}")
        self.status = status
        self.body = body
        self.url = url


@dataclass
class EnvConfig:
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    meta_phone_number_id: str
    meta_waba_id: str
    api_base_url: str


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def build_env() -> EnvConfig:
    values = load_env_file(ENV_FILE)
    return EnvConfig(
        supabase_url=values["SUPABASE_URL"].rstrip("/"),
        supabase_anon_key=values["SUPABASE_ANON_KEY"],
        supabase_service_role_key=values["SUPABASE_SERVICE_ROLE_KEY"],
        meta_phone_number_id=values["META_PHONE_NUMBER_ID"],
        meta_waba_id=values["META_WABA_ID"],
        api_base_url=os.environ.get("E2E_API_BASE_URL", DEFAULT_API_BASE).rstrip("/"),
    )


def http_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    json_body: Any | None = None,
    expected_status: int | tuple[int, ...] = (200, 201, 204),
) -> Any:
    if isinstance(expected_status, int):
        expected = {expected_status}
    else:
        expected = set(expected_status)

    payload = None
    request_headers = headers.copy() if headers else {}
    if json_body is not None:
        payload = json.dumps(json_body).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")

    request = urllib.request.Request(url, data=payload, headers=request_headers, method=method)

    try:
        with urllib.request.urlopen(request) as response:
            body_bytes = response.read()
            status = response.status
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise HttpError(error.code, body, url) from error

    body = body_bytes.decode("utf-8", errors="replace")
    if status not in expected:
        raise HttpError(status, body, url)
    if not body.strip():
        return None
    return json.loads(body)


def build_rest_headers(schema: str, key: str, *, write: bool = False) -> dict[str, str]:
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": schema,
    }
    if write:
        headers["Content-Profile"] = schema
        headers["Prefer"] = "return=representation"
    return headers


def rest_select(env: EnvConfig, schema: str, table: str, query: dict[str, str]) -> list[dict[str, Any]]:
    url = f"{env.supabase_url}/rest/v1/{table}?{urllib.parse.urlencode(query, safe='(),.*')}"
    return http_json(
        url,
        headers=build_rest_headers(schema, env.supabase_service_role_key),
        expected_status=200,
    )


def rest_insert(env: EnvConfig, schema: str, table: str, rows: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]:
    return http_json(
        f"{env.supabase_url}/rest/v1/{table}",
        method="POST",
        headers=build_rest_headers(schema, env.supabase_service_role_key, write=True),
        json_body=rows,
        expected_status=(200, 201),
    )


def rest_update(env: EnvConfig, schema: str, table: str, query: dict[str, str], patch: dict[str, Any]) -> list[dict[str, Any]]:
    url = f"{env.supabase_url}/rest/v1/{table}?{urllib.parse.urlencode(query, safe='(),.*')}"
    return http_json(
        url,
        method="PATCH",
        headers=build_rest_headers(schema, env.supabase_service_role_key, write=True),
        json_body=patch,
        expected_status=200,
    )


def rest_delete(env: EnvConfig, schema: str, table: str, query: dict[str, str]) -> Any:
    url = f"{env.supabase_url}/rest/v1/{table}?{urllib.parse.urlencode(query, safe='(),.*')}"
    return http_json(
        url,
        method="DELETE",
        headers=build_rest_headers(schema, env.supabase_service_role_key),
        expected_status=(200, 204),
    )


def auth_create_user(env: EnvConfig, email: str, password: str) -> dict[str, Any]:
    return http_json(
        f"{env.supabase_url}/auth/v1/admin/users",
        method="POST",
        headers={
            "apikey": env.supabase_service_role_key,
            "Authorization": f"Bearer {env.supabase_service_role_key}",
            "Content-Type": "application/json",
        },
        json_body={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"source": "phase5_e2e"},
        },
        expected_status=(200, 201),
    )


def auth_delete_user(env: EnvConfig, user_id: str) -> None:
    http_json(
        f"{env.supabase_url}/auth/v1/admin/users/{user_id}",
        method="DELETE",
        headers={
            "apikey": env.supabase_service_role_key,
            "Authorization": f"Bearer {env.supabase_service_role_key}",
        },
        expected_status=(200, 204),
    )


def auth_sign_in(env: EnvConfig, email: str, password: str) -> str:
    payload = json.dumps({"email": email, "password": password}).encode("utf-8")
    request = urllib.request.Request(
        f"{env.supabase_url}/auth/v1/token?grant_type=password",
        data=payload,
        headers={
            "apikey": env.supabase_anon_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise HttpError(
            error.code,
            error.read().decode("utf-8", errors="replace"),
            f"{env.supabase_url}/auth/v1/token?grant_type=password",
        ) from error
    token = body.get("access_token")
    if not token:
        raise RuntimeError("no_access_token_returned")
    return token


def dashboard_request(
    env: EnvConfig,
    token: str,
    path: str,
    *,
    method: str = "GET",
    json_body: Any | None = None,
    expected_status: int | tuple[int, ...] = (200, 201),
) -> Any:
    return http_json(
        f"{env.api_base_url}/dashboard{path}",
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json_body=json_body,
        expected_status=expected_status,
    )


def send_inbound_text(env: EnvConfig, customer_phone: str, text: str) -> None:
    message_id = f"wamid.{RUN_PREFIX}.{customer_phone}.{int(time.time() * 1000)}"
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": env.meta_waba_id,
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "phone_number_id": env.meta_phone_number_id,
                            },
                            "contacts": [
                                {
                                    "wa_id": customer_phone,
                                    "profile": {"name": f"E2E {customer_phone[-4:]}"},
                                }
                            ],
                            "messages": [
                                {
                                    "from": customer_phone,
                                    "id": message_id,
                                    "timestamp": str(int(time.time())),
                                    "type": "text",
                                    "text": {"body": text},
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }
    http_json(
        f"{env.api_base_url}/webhooks/whatsapp",
        method="POST",
        headers={"Content-Type": "application/json"},
        json_body=payload,
        expected_status=200,
    )


def now_business_date() -> str:
    return time.strftime("%Y-%m-%d", time.localtime())


def select_one(env: EnvConfig, schema: str, table: str, query: dict[str, str]) -> dict[str, Any] | None:
    rows = rest_select(env, schema, table, query | {"limit": "1"})
    return rows[0] if rows else None


def poll(description: str, fn, timeout_seconds: float = 12.0, interval_seconds: float = 0.5):
    deadline = time.time() + timeout_seconds
    last_value = None
    while time.time() < deadline:
        last_value = fn()
        if last_value:
            return last_value
        time.sleep(interval_seconds)
    raise RuntimeError(f"timeout_waiting_for_{description}: {last_value}")


def ensure_tenant_context(env: EnvConfig) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    tenant = select_one(env, "control", "tenants", {"select": "id,slug,schema_name,timezone", "slug": "eq.demo"})
    if not tenant:
        raise RuntimeError("tenant_demo_not_found")

    location = select_one(
        env,
        tenant["schema_name"],
        "locations",
        {"select": "id,name,is_active", "is_active": "eq.true"},
    )
    if not location:
        raise RuntimeError("active_location_not_found")

    menu = select_one(
        env,
        tenant["schema_name"],
        "menus",
        {
            "select": "id,location_id,date,status",
            "location_id": f"eq.{location['id']}",
            "date": f"eq.{now_business_date()}",
            "status": "eq.published",
        },
    )
    if not menu:
        raise RuntimeError("today_published_menu_not_found")

    return tenant, location, menu


def create_menu_product(
    env: EnvConfig,
    schema: str,
    menu_id: str,
    *,
    name: str,
    category: str,
    base_price: int,
    sort_order: int,
) -> dict[str, Any]:
    product = rest_insert(
        env,
        schema,
        "products",
        {
            "name": name,
            "description": f"Producto E2E {RUN_PREFIX}",
            "base_price": base_price,
            "category": category,
            "is_active": True,
        },
    )[0]
    menu_item = rest_insert(
        env,
        schema,
        "menu_items",
        {
            "menu_id": menu_id,
            "product_id": product["id"],
            "display_name": name,
            "price_override": base_price,
            "available_quantity": 20,
            "is_available": True,
            "sort_order": sort_order,
        },
    )[0]
    return {"product": product, "menu_item": menu_item}


def get_menu_position(env: EnvConfig, schema: str, menu_id: str, menu_item_id: str) -> int:
    items = rest_select(
        env,
        schema,
        "menu_items",
        {
            "select": "id,sort_order,is_available",
            "menu_id": f"eq.{menu_id}",
            "is_available": "eq.true",
            "order": "sort_order.asc",
        },
    )
    for index, item in enumerate(items, start=1):
        if item["id"] == menu_item_id:
            return index
    raise RuntimeError(f"menu_item_position_not_found:{menu_item_id}")


def get_customer_context(env: EnvConfig, schema: str, phone: str) -> dict[str, Any]:
    customer = poll(
        f"customer_for_{phone}",
        lambda: select_one(
            env,
            schema,
            "customers",
            {
                "select": "id,phone,name,created_at",
                "phone": f"eq.{phone}",
                "order": "created_at.desc",
            },
        ),
    )
    conversation = poll(
        f"conversation_for_{phone}",
        lambda: select_one(
            env,
            schema,
            "conversations",
            {
                "select": "id,customer_id,state,current_draft_order_id,clarification_attempts,created_at,updated_at",
                "customer_id": f"eq.{customer['id']}",
                "order": "created_at.desc",
            },
        ),
    )
    draft = select_one(
        env,
        schema,
        "draft_orders",
        {
            "select": "id,status,conversation_id,subtotal,total,fulfillment_type,payment_method",
            "conversation_id": f"eq.{conversation['id']}",
            "order": "created_at.desc",
        },
    )
    order = select_one(
        env,
        schema,
        "orders",
        {
            "select": "id,draft_order_id,customer_id,status,subtotal,total,customer_notification_status,customer_notification_error,restaurant_review_metadata,created_at,updated_at",
            "customer_id": f"eq.{customer['id']}",
            "order": "created_at.desc",
        },
    )
    return {
        "customer": customer,
        "conversation": conversation,
        "draft": draft,
        "order": order,
    }


def get_customer_context_if_order_status(
    env: EnvConfig,
    schema: str,
    phone: str,
    *,
    order_status: str,
) -> dict[str, Any] | None:
    context = get_customer_context(env, schema, phone)
    if context["order"] and context["order"]["status"] == order_status:
        return context
    return None


def run_guided_order_flow(env: EnvConfig, schema: str, customer_phone: str, selection_text: str) -> dict[str, Any]:
    send_inbound_text(env, customer_phone, "hola")
    poll(
        f"menu_prompt_{customer_phone}",
        lambda: get_customer_context(env, schema, customer_phone)["conversation"]["state"] == "awaiting_guided_item_selection",
    )
    send_inbound_text(env, customer_phone, selection_text)
    poll(
        f"item_added_{customer_phone}",
        lambda: get_customer_context(env, schema, customer_phone)["conversation"]["state"] == "awaiting_more_items",
    )
    send_inbound_text(env, customer_phone, "pickup")
    poll(
        f"pickup_selected_{customer_phone}",
        lambda: get_customer_context(env, schema, customer_phone)["conversation"]["state"] == "awaiting_payment_method",
    )
    send_inbound_text(env, customer_phone, "efectivo")
    poll(
        f"cash_selected_{customer_phone}",
        lambda: get_customer_context(env, schema, customer_phone)["conversation"]["state"] == "awaiting_confirmation",
    )
    send_inbound_text(env, customer_phone, "si")
    context = poll(
        f"order_created_{customer_phone}",
        lambda: get_customer_context_if_order_status(
            env,
            schema,
            customer_phone,
            order_status="pending_restaurant_confirmation",
        ),
    )
    return context


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def main() -> int:
    env = build_env()
    tenant, _location, menu = ensure_tenant_context(env)
    schema = tenant["schema_name"]
    email = f"{RUN_PREFIX}@example.com"
    password = "Phase5-E2E-Secret-123!"
    auth_user_id = ""

    created_products: list[dict[str, Any]] = []

    try:
      user_payload = auth_create_user(env, email, password)
      auth_user_id = user_payload["id"]
      rest_insert(
          env,
          "control",
          "tenant_users",
          {
              "tenant_id": tenant["id"],
              "user_id": auth_user_id,
              "role": "encargado",
              "status": "active",
          },
      )
      token = auth_sign_in(env, email, password)

      created_products.append(
          create_menu_product(
              env,
              schema,
              menu["id"],
              name=f"ZZZ Almuerzo {RUN_PREFIX}",
              category="almuerzos",
              base_price=26000,
              sort_order=9100,
          )
      )
      created_products.append(
          create_menu_product(
              env,
              schema,
              menu["id"],
              name=f"ZZZ Coca Cola {RUN_PREFIX}",
              category="bebidas",
              base_price=6000,
              sort_order=9110,
          )
      )
      created_products.append(
          create_menu_product(
              env,
              schema,
              menu["id"],
              name=f"ZZZ Sprite {RUN_PREFIX}",
              category="bebidas",
              base_price=6500,
              sort_order=9120,
          )
      )
      created_products.append(
          create_menu_product(
              env,
              schema,
              menu["id"],
              name=f"ZZZ Agua {RUN_PREFIX}",
              category="bebidas",
              base_price=4000,
              sort_order=9130,
          )
      )

      almuerzo_position = get_menu_position(env, schema, menu["id"], created_products[0]["menu_item"]["id"])
      bebida_position = get_menu_position(env, schema, menu["id"], created_products[1]["menu_item"]["id"])

      normal_phone = f"573001{str(int(time.time()))[-6:]}"
      replacement_phone = f"573002{str(int(time.time()))[-6:]}"
      cancel_phone = f"573003{str(int(time.time()))[-6:]}"

      normal_context = run_guided_order_flow(env, schema, normal_phone, str(almuerzo_position))
      normal_order_id = normal_context["order"]["id"]

      orders_all = dashboard_request(env, token, "/demo/orders?bucket=all")
      assert_true(any(order["id"] == normal_order_id for order in orders_all["orders"]), "normal_order_missing_from_dashboard_list")

      normal_detail = dashboard_request(env, token, f"/demo/orders/{normal_order_id}")
      assert_true(normal_detail["status"] == "pending_restaurant_confirmation", "normal_order_detail_not_pending")

      accepted_order = dashboard_request(env, token, f"/demo/orders/{normal_order_id}/accept", method="POST", json_body={})
      assert_true(accepted_order["status"] == "accepted", "normal_order_not_accepted")
      normal_post_accept = get_customer_context(env, schema, normal_phone)
      assert_true(normal_post_accept["conversation"]["state"] == "completed", "normal_conversation_not_completed")

      accepted_detail = dashboard_request(env, token, f"/demo/orders/{normal_order_id}")
      accepted_messages_before = len(
          rest_select(
              env,
              schema,
              "messages",
              {
                  "select": "id",
                  "order": "created_at.desc",
                  "conversation_id": f"eq.{normal_post_accept['conversation']['id']}",
              },
          )
      )
      retry_payload = dashboard_request(
          env,
          token,
          f"/demo/orders/{normal_order_id}/customer-notification/retry",
          method="POST",
          json_body={"type": "accepted"},
      )
      assert_true(retry_payload["status"] == "accepted", "retry_changed_normal_order_status")
      accepted_messages_after = len(
          rest_select(
              env,
              schema,
              "messages",
              {
                  "select": "id",
                  "order": "created_at.desc",
                  "conversation_id": f"eq.{normal_post_accept['conversation']['id']}",
              },
          )
      )
      assert_true(accepted_messages_after > accepted_messages_before, "retry_did_not_log_additional_message")

      replacement_context = run_guided_order_flow(env, schema, replacement_phone, str(bebida_position))
      replacement_order_id = replacement_context["order"]["id"]
      replacement_order_items = rest_select(
          env,
          schema,
          "order_items",
          {
              "select": "id,menu_item_id,name_snapshot,category_snapshot",
              "order_id": f"eq.{replacement_order_id}",
          },
      )
      assert_true(len(replacement_order_items) == 1, "replacement_order_items_unexpected")
      rejected_order = dashboard_request(
          env,
          token,
          f"/demo/orders/{replacement_order_id}/reject-out-of-stock",
          method="POST",
          json_body={
              "items": [
                  {
                      "orderItemId": replacement_order_items[0]["id"],
                      "markMenuItemUnavailable": True,
                      "replacementMenuItemIds": [
                          created_products[2]["menu_item"]["id"],
                          created_products[3]["menu_item"]["id"],
                      ],
                  }
              ],
              "note": "Sin stock en prueba E2E.",
          },
      )
      assert_true(rejected_order["status"] == "needs_customer_replacement", "replacement_order_not_waiting_customer")
      replacement_after_reject = get_customer_context(env, schema, replacement_phone)
      assert_true(
          replacement_after_reject["conversation"]["state"] == "awaiting_replacement_selection",
          "replacement_conversation_not_waiting_selection",
      )
      send_inbound_text(env, replacement_phone, "1")
      replacement_after_choice = poll(
          "replacement_choice_applied",
          lambda: get_customer_context_if_order_status(
              env,
              schema,
              replacement_phone,
              order_status="pending_restaurant_confirmation",
          ),
      )
      replacement_items_after_choice = rest_select(
          env,
          schema,
          "order_items",
          {
              "select": "id,menu_item_id,name_snapshot",
              "order_id": f"eq.{replacement_order_id}",
          },
      )
      assert_true(
          replacement_items_after_choice[0]["menu_item_id"] == created_products[2]["menu_item"]["id"],
          "replacement_menu_item_not_applied",
      )
      assert_true(
          replacement_after_choice["conversation"]["state"] == "awaiting_restaurant_confirmation",
          "replacement_conversation_not_back_to_restaurant_confirmation",
      )

      cancel_context = run_guided_order_flow(env, schema, cancel_phone, str(bebida_position))
      cancel_order_id = cancel_context["order"]["id"]
      cancel_order_items = rest_select(
          env,
          schema,
          "order_items",
          {
              "select": "id,menu_item_id,name_snapshot,category_snapshot",
              "order_id": f"eq.{cancel_order_id}",
          },
      )
      rejected_cancel_order = dashboard_request(
          env,
          token,
          f"/demo/orders/{cancel_order_id}/reject-out-of-stock",
          method="POST",
          json_body={
              "items": [
                  {
                      "orderItemId": cancel_order_items[0]["id"],
                      "markMenuItemUnavailable": False,
                      "replacementMenuItemIds": [
                          created_products[2]["menu_item"]["id"],
                          created_products[3]["menu_item"]["id"],
                      ],
                  }
              ],
              "note": "Escenario cancelacion E2E.",
          },
      )
      assert_true(rejected_cancel_order["status"] == "needs_customer_replacement", "cancel_order_not_waiting_customer")
      send_inbound_text(env, cancel_phone, "cancelar")
      cancel_after_choice = poll(
          "cancel_choice_applied",
          lambda: get_customer_context_if_order_status(
              env,
              schema,
              cancel_phone,
              order_status="cancelled",
          ),
      )
      assert_true(cancel_after_choice["conversation"]["state"] == "completed", "cancel_conversation_not_completed")

      pending_orders = dashboard_request(env, token, "/demo/orders?bucket=pending_confirmation")
      assert_true(
          any(order["id"] == replacement_order_id and order["status"] == "pending_restaurant_confirmation" for order in pending_orders["orders"]),
          "replacement_order_not_visible_in_pending_bucket_after_customer_selection",
      )

      summary = {
          "runPrefix": RUN_PREFIX,
          "normalOrderId": normal_order_id,
          "replacementOrderId": replacement_order_id,
          "cancelOrderId": cancel_order_id,
          "status": "ok",
          "notes": [
              "Automated E2E validated against local API and real Supabase.",
              "WhatsApp outbound for dummy recipients may remain failed; retry path was still validated.",
              "Live sandbox confirmation with a human tester remains a separate manual pass.",
          ],
      }
      print(json.dumps(summary, ensure_ascii=True, indent=2))
      return 0
    finally:
      for item in created_products:
        try:
          rest_update(
              env,
              schema,
              "menu_items",
              {"id": f"eq.{item['menu_item']['id']}"},
              {"is_available": False},
          )
        except Exception:
          pass
        try:
          rest_update(
              env,
              schema,
              "products",
              {"id": f"eq.{item['product']['id']}"},
              {"is_active": False},
          )
        except Exception:
          pass
      if auth_user_id:
        try:
          rest_delete(
              env,
              "control",
              "tenant_users",
              {"tenant_id": f"eq.{tenant['id']}", "user_id": f"eq.{auth_user_id}"},
          )
        except Exception:
          pass
        try:
          auth_delete_user(env, auth_user_id)
        except Exception:
          pass


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"status": "failed", "error": str(error)}, ensure_ascii=True), file=sys.stderr)
        raise
