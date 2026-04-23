#!/usr/bin/env python3
"""
Seed demo tenants and products through Supabase REST.

This script is intentionally idempotent: it upserts tenants by slug and products by
name within each tenant schema.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / "apps" / "api" / ".dev.vars"


@dataclass(frozen=True)
class TenantSeed:
    name: str
    slug: str
    schema: str
    location_address: str
    delivery_fee: int
    products: tuple[dict[str, Any], ...]
    menu_product_names: tuple[str, ...]


TENANTS = (
    TenantSeed(
        name="Restaurante Demo",
        slug="demo",
        schema="tenant_demo",
        location_address="Direccion pendiente",
        delivery_fee=5000,
        products=(
            {
                "name": "Bandeja paisa ejecutiva",
                "description": "Frijoles, arroz, carne molida, huevo, maduro y aguacate.",
                "base_price": 24000,
                "category": "almuerzos",
                "is_active": True,
            },
            {
                "name": "Pollo a la plancha",
                "description": "Pechuga asada con ensalada fresca y papas criollas.",
                "base_price": 21000,
                "category": "almuerzos",
                "is_active": True,
            },
            {
                "name": "Sopa del dia",
                "description": "Entrada caliente preparada con ingredientes del dia.",
                "base_price": 9000,
                "category": "entradas",
                "is_active": True,
            },
        ),
        menu_product_names=("Bandeja paisa ejecutiva", "Pollo a la plancha", "Sopa del dia"),
    ),
    TenantSeed(
        name="Arepas del Parque",
        slug="arepas",
        schema="tenant_arepas",
        location_address="Parque principal",
        delivery_fee=4000,
        products=(
            {
                "name": "Arepa mixta",
                "description": "Arepa asada con carne desmechada, pollo y queso.",
                "base_price": 16000,
                "category": "arepas",
                "is_active": True,
            },
            {
                "name": "Arepa de queso",
                "description": "Arepa clasica con queso doble.",
                "base_price": 9500,
                "category": "arepas",
                "is_active": True,
            },
        ),
        menu_product_names=("Arepa mixta",),
    ),
    TenantSeed(
        name="Pizza Norte",
        slug="pizza",
        schema="tenant_pizza",
        location_address="Zona norte",
        delivery_fee=6000,
        products=(
            {
                "name": "Pizza personal pepperoni",
                "description": "Masa artesanal, mozzarella y pepperoni.",
                "base_price": 22000,
                "category": "pizzas",
                "is_active": True,
            },
            {
                "name": "Pizza vegetariana",
                "description": "Champinones, pimenton, cebolla y aceitunas.",
                "base_price": 24000,
                "category": "pizzas",
                "is_active": True,
            },
        ),
        menu_product_names=("Pizza personal pepperoni",),
    ),
)


def read_env() -> dict[str, str]:
    if not ENV_FILE.exists():
        raise SystemExit(f"Missing {ENV_FILE}")

    values: dict[str, str] = {}
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()

    return values


def request(env: dict[str, str], method: str, path: str, schema: str, body: Any | None = None) -> Any:
    base_url = env["SUPABASE_URL"].rstrip("/")
    service_key = env["SUPABASE_SERVICE_ROLE_KEY"]
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Accept-Profile": schema,
        "Content-Profile": schema,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    req = urllib.request.Request(f"{base_url}/rest/v1/{path}", data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            text = response.read().decode("utf-8")
            return json.loads(text) if text else None
    except urllib.error.HTTPError as exc:
        error_text = exc.read().decode("utf-8")
        raise RuntimeError(f"{method} {schema}.{path} failed: {exc.code} {error_text}") from exc


def select_one(env: dict[str, str], schema: str, table: str, filters: dict[str, str]) -> dict[str, Any] | None:
    query = {"select": "*", "limit": "1", **filters}
    path = f"{table}?{urllib.parse.urlencode(query)}"
    rows = request(env, "GET", path, schema)
    return rows[0] if rows else None


def ensure_tenant(env: dict[str, str], seed: TenantSeed) -> None:
    existing = select_one(env, "control", "tenants", {"slug": f"eq.{seed.slug}"})
    payload = {
        "name": seed.name,
        "slug": seed.slug,
        "schema_name": seed.schema,
        "status": "active",
        "timezone": "America/Bogota",
        "currency": "COP",
        "automation_enabled": True,
    }

    if existing:
        request(env, "PATCH", f"tenants?id=eq.{existing['id']}", "control", payload)
    else:
        request(env, "POST", "tenants", "control", payload)


def ensure_location(env: dict[str, str], seed: TenantSeed) -> dict[str, Any]:
    existing = select_one(env, seed.schema, "locations", {"name": "eq.Sede principal"})
    payload = {
        "name": "Sede principal",
        "address": seed.location_address,
        "delivery_fee_fixed": seed.delivery_fee,
        "is_active": True,
    }

    if existing:
        request(env, "PATCH", f"locations?id=eq.{existing['id']}", seed.schema, payload)
        return {**existing, **payload}

    created = request(env, "POST", "locations?select=*", seed.schema, payload)
    return created[0]


def ensure_product(env: dict[str, str], schema: str, payload: dict[str, Any]) -> dict[str, Any]:
    existing = select_one(env, schema, "products", {"name": f"eq.{payload['name']}"})
    if existing:
        request(env, "PATCH", f"products?id=eq.{existing['id']}", schema, payload)
        return {**existing, **payload}

    created = request(env, "POST", "products?select=*", schema, payload)
    return created[0]


def ensure_menu(env: dict[str, str], seed: TenantSeed, location_id: str) -> dict[str, Any]:
    today = date.today().isoformat()
    existing = select_one(env, seed.schema, "menus", {"location_id": f"eq.{location_id}", "date": f"eq.{today}"})
    if existing:
        return existing

    created = request(
        env,
        "POST",
        "menus?select=*",
        seed.schema,
        {
            "location_id": location_id,
            "date": today,
            "name": "Menu de hoy",
            "status": "published",
        },
    )
    return created[0]


def ensure_menu_item(env: dict[str, str], schema: str, menu_id: str, product: dict[str, Any], sort_order: int) -> None:
    existing = select_one(env, schema, "menu_items", {"menu_id": f"eq.{menu_id}", "product_id": f"eq.{product['id']}"})
    payload = {
        "menu_id": menu_id,
        "product_id": product["id"],
        "display_name": product["name"],
        "price_override": product["base_price"],
        "is_available": True,
        "sort_order": sort_order,
    }

    if existing:
        request(env, "PATCH", f"menu_items?id=eq.{existing['id']}", schema, payload)
    else:
        request(env, "POST", "menu_items", schema, payload)


def main() -> int:
    env = read_env()
    missing = [key for key in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY") if not env.get(key) or env[key] == "replace-me"]
    if missing:
        raise SystemExit(f"Missing real values in {ENV_FILE}: {', '.join(missing)}")

    for seed in TENANTS:
        try:
            request(env, "GET", "products?select=id&limit=1", seed.schema)
        except RuntimeError as error:
            print(f"Skipping {seed.slug}: schema {seed.schema} is not available through Supabase REST")
            print(f"  {error}")
            continue

        ensure_tenant(env, seed)
        location = ensure_location(env, seed)
        products_by_name = {
            product["name"]: ensure_product(env, seed.schema, product)
            for product in seed.products
        }
        menu = ensure_menu(env, seed, location["id"])
        for index, product_name in enumerate(seed.menu_product_names, start=1):
            ensure_menu_item(env, seed.schema, menu["id"], products_by_name[product_name], index * 10)
        print(f"Seeded {seed.slug} ({seed.schema})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
