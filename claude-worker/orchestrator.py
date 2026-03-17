#!/usr/bin/env python3
"""CLI to call ClaudeSwarm tRPC endpoints (no dependencies beyond stdlib)."""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse


def get_base_url():
    orchestrator = os.environ.get("ORCHESTRATOR_ADDRESS")
    if orchestrator:
        url = f"http://{orchestrator}:3000/api/trpc"
        print(f"[claudeswarm] using ORCHESTRATOR_ADDRESS: {url}", file=sys.stderr)
        return url
    url = "http://localhost:3000/api/trpc"
    print(f"[claudeswarm] ORCHESTRATOR_ADDRESS not set, using {url}", file=sys.stderr)
    return url


def trpc_query(base_url: str, procedure: str, input_data=None):
    url = f"{base_url}/{procedure}"
    if input_data is not None:
        url += "?" + urllib.parse.urlencode({"input": json.dumps(input_data)})
    req = urllib.request.Request(url, method="GET")
    req.add_header("Content-Type", "application/json")
    return _do_request(req)


def trpc_mutation(base_url: str, procedure: str, input_data=None):
    url = f"{base_url}/{procedure}"
    body = json.dumps(input_data if input_data is not None else {}).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    return _do_request(req)


def _do_request(req: urllib.request.Request):
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            result = data.get("result", {}).get("data", data)
            if isinstance(result, dict):
                return result.get("json", result)
            return result
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            err = json.loads(body)
            msg = (
                err.get("error", {}).get("json", {}).get("message")
                or err.get("error", {}).get("message")
                or body
            )
        except json.JSONDecodeError:
            msg = body
        print(f"Error {e.code}: {msg}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Connection error: {e.reason}", file=sys.stderr)
        sys.exit(1)


def cmd_health(args):
    result = trpc_query(args.base_url, "health")
    print(json.dumps(result, indent=2))


def cmd_presets(args):
    result = trpc_query(args.base_url, "presets")
    print(json.dumps(result, indent=2))


def cmd_workers(args):
    result = trpc_query(args.base_url, "workers")
    print(json.dumps(result, indent=2))


def cmd_destroy_worker(args):
    payload = {"id": args.id} if args.id else {}
    trpc_mutation(args.base_url, "destroyWorker", payload)
    print(f"Worker {args.id or 'self'} destroyed.")


def cmd_start_worker(args):
    env = {}
    if args.env:
        for pair in args.env:
            if "=" not in pair:
                print(f"Invalid env format '{pair}', expected KEY=VALUE", file=sys.stderr)
                sys.exit(1)
            k, v = pair.split("=", 1)
            env[k] = v

    result = trpc_mutation(
        args.base_url,
        "startWorker",
        {"title": args.title, "preset": args.preset, "env": env},
    )
    print(json.dumps(result, indent=2))


def cmd_start_sub_worker(args):
    overwrite_env = {}
    if args.env:
        for pair in args.env:
            if "=" not in pair:
                print(f"Invalid env format '{pair}', expected KEY=VALUE", file=sys.stderr)
                sys.exit(1)
            k, v = pair.split("=", 1)
            overwrite_env[k] = v
    if args.unset:
        for key in args.unset:
            overwrite_env[key] = None

    result = trpc_mutation(
        args.base_url,
        "startSubWorker",
        {
            "title": args.title,
            "preset": args.preset,
            "overwriteEnv": overwrite_env,
        },
    )
    print(json.dumps(result, indent=2))


def cmd_set_worker_output(args):
    output = sys.stdin.read()
    trpc_mutation(args.base_url, "setWorkerOutput", {"output": output})
    print("Worker output set.")


def cmd_get_worker_output(args):
    result = trpc_query(args.base_url, "getWorkerOutput", {"workerId": args.worker_id})
    print(json.dumps(result, indent=2))


def main():
    parser = argparse.ArgumentParser(description="ClaudeSwarm tRPC CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("health", help="Check backend health")

    sub.add_parser("presets", help="List available presets")

    sub.add_parser("workers", help="List all workers")

    destroy = sub.add_parser("destroy-worker", help="Destroy a worker by id (or self if no id given)")
    destroy.add_argument("id", nargs="?", default=None, help="ID of the worker to destroy (omit to destroy self)")

    start = sub.add_parser("start-worker", help="Start a new worker")
    start.add_argument("title", help="Worker title")
    start.add_argument("--preset", default="default", help="Preset name (default: default)")
    start.add_argument(
        "-e", "--env", action="append", metavar="KEY=VALUE",
        help="Environment variable (can be repeated)",
    )

    start_sub = sub.add_parser("start-sub-worker", help="Start a sub-worker (inherits parent env/preset)")
    start_sub.add_argument("title", help="Worker title")
    start_sub.add_argument("--preset", default=None, help="Preset name (default: inherit from parent)")
    start_sub.add_argument(
        "-e", "--env", action="append", metavar="KEY=VALUE",
        help="Overwrite environment variable (can be repeated)",
    )
    start_sub.add_argument(
        "--unset", action="append", metavar="KEY",
        help="Unset an inherited environment variable (can be repeated)",
    )

    sub.add_parser("set-worker-output", help="Set output for the calling worker (reads from stdin)")

    get_output = sub.add_parser("get-worker-output", help="Get output for a worker")
    get_output.add_argument("worker_id", help="ID of the worker")

    args = parser.parse_args()
    args.base_url = get_base_url()

    commands = {
        "health": cmd_health,
        "presets": cmd_presets,
        "workers": cmd_workers,
        "destroy-worker": cmd_destroy_worker,
        "start-worker": cmd_start_worker,
        "start-sub-worker": cmd_start_sub_worker,
        "set-worker-output": cmd_set_worker_output,
        "get-worker-output": cmd_get_worker_output,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
