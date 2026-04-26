#!/usr/bin/env python3
"""
Manage local 42day dev services.

Examples:
  python scripts/dev_services.py --start
  python scripts/dev_services.py --stop
  python scripts/dev_services.py --restart
  python scripts/dev_services.py --status
"""

from __future__ import annotations

import argparse
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = ROOT / ".dev-logs"
SERVICES = {
    "api": {
        "port": 8787,
        "cmd": ["corepack", "pnpm", "--filter", "@42day/api", "dev", "--", "--local", "--port", "8787"],
        "health": "http://127.0.0.1:8787/health",
    },
    "dashboard": {
        "port": 5173,
        "cmd": ["corepack", "pnpm", "--filter", "@42day/dashboard", "dev", "--", "--host", "localhost"],
        "health": "http://localhost:5173",
    },
}


def is_windows() -> bool:
    return os.name == "nt"


def command_for_platform(command: list[str]) -> list[str]:
    if is_windows() and command[0] == "corepack":
        return ["corepack.cmd", *command[1:]]

    return command


def port_open(port: int, hosts: tuple[str, ...] = ("127.0.0.1", "localhost", "::1")) -> bool:
    for host in hosts:
        try:
            family = socket.AF_INET6 if ":" in host else socket.AF_INET
            with socket.socket(family, socket.SOCK_STREAM) as sock:
                sock.settimeout(0.4)
                if sock.connect_ex((host, port)) == 0:
                    return True
        except OSError:
            continue

    return False


def pids_for_port(port: int) -> list[int]:
    if is_windows():
        command = [
            "powershell",
            "-NoProfile",
            "-Command",
            (
                f"Get-NetTCPConnection -State Listen -LocalPort {port} "
                "-ErrorAction SilentlyContinue | "
                "Select-Object -ExpandProperty OwningProcess -Unique"
            ),
        ]
        result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
        return [int(line.strip()) for line in result.stdout.splitlines() if line.strip().isdigit()]

    result = subprocess.run(["lsof", "-ti", f"tcp:{port}"], text=True, capture_output=True, check=False)
    return [int(line.strip()) for line in result.stdout.splitlines() if line.strip().isdigit()]


def stop_port(port: int) -> None:
    for pid in pids_for_port(port):
        print(f"Stopping PID {pid} on port {port}")
        try:
            if is_windows():
                subprocess.run(["taskkill", "/PID", str(pid), "/F", "/T"], check=False, capture_output=True)
            else:
                os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass


def stop_services() -> None:
    for name, service in SERVICES.items():
        stop_port(int(service["port"]))
    time.sleep(1)
    print_status()


def start_service(name: str) -> None:
    service = SERVICES[name]
    port = int(service["port"])
    if pids_for_port(port):
        print(f"{name} already running on port {port}")
        return

    LOG_DIR.mkdir(exist_ok=True)
    stdout_path = LOG_DIR / f"{name}.log"
    stderr_path = LOG_DIR / f"{name}.err.log"
    stdout = stdout_path.open("a", encoding="utf-8")
    stderr = stderr_path.open("a", encoding="utf-8")

    cmd = command_for_platform(service["cmd"])
    print(f"Starting {name}: {' '.join(cmd)}")
    subprocess.Popen(
        cmd,
        cwd=ROOT,
        stdout=stdout,
        stderr=stderr,
        shell=False,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if is_windows() else 0,
    )


def start_services() -> None:
    start_service("api")
    start_service("dashboard")
    wait_for_ports()
    print_status()


def wait_for_ports(timeout_seconds: int = 35) -> None:
    deadline = time.time() + timeout_seconds
    pending = {name for name in SERVICES}
    while pending and time.time() < deadline:
        for name in list(pending):
            if port_open(int(SERVICES[name]["port"])):
                pending.remove(name)
        time.sleep(0.4)

    for name in sorted(pending):
        service = SERVICES[name]
        print(f"Warning: {name} did not open port {service['port']} within {timeout_seconds}s")


def print_status() -> None:
    for name, service in SERVICES.items():
        port = int(service["port"])
        pids = pids_for_port(port)
        status = "up" if pids else "down"
        pid_text = ", ".join(str(pid) for pid in pids) if pids else "-"
        print(f"{name:10} {status:4} port={port} pids={pid_text}")


def check_prerequisites() -> None:
    if not (ROOT / "package.json").exists():
        raise SystemExit(f"Run this script from the repo checkout. Expected package.json near {ROOT}")

    api_env = ROOT / "apps" / "api" / ".dev.vars"
    if not api_env.exists():
        example = ROOT / "apps" / "api" / ".dev.vars.example"
        if example.exists():
            api_env.write_text(example.read_text(encoding="utf-8"), encoding="utf-8")
            print("Created apps/api/.dev.vars from .dev.vars.example. Fill Supabase values before persisting data.")
        else:
            print("Warning: apps/api/.dev.vars is missing.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Start/stop local 42day services.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--start", action="store_true", help="Start API and dashboard.")
    group.add_argument("--stop", action="store_true", help="Stop API and dashboard by port.")
    group.add_argument("--restart", action="store_true", help="Stop and start API and dashboard.")
    group.add_argument("--status", action="store_true", help="Print service status.")
    args = parser.parse_args()

    check_prerequisites()

    if args.start:
        start_services()
    elif args.stop:
        stop_services()
    elif args.restart:
        stop_services()
        start_services()
    elif args.status:
        print_status()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
