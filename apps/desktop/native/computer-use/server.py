# Copyright The Open Forge contributors.
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sys
import threading
import types

ROOT = Path(__file__).resolve().parent
sys.path[:0] = [str(ROOT), str(ROOT / "vendor")]
from executor import Executor
from input_guard import UserInputGuard
from windows import DesktopError, Windows


def configure_comtypes(cache):
    import comtypes
    generated = types.ModuleType("comtypes.gen")
    generated.__path__ = [str(cache)]
    sys.modules["comtypes.gen"] = generated
    comtypes.gen = generated
    import comtypes.client


def desktop_factory(cache):
    configure_comtypes(cache)
    import uiautomation
    from winhands import inputs
    from winhands.uia import Desk, Registry, flatten, node_line
    desktop = Desk()
    # Hidden windows are deliberately included; the owner enforces window scope.
    from uiautomation.uiautomation import _AutomationClient
    desktop.cr.TreeFilter = _AutomationClient.instance().IUIAutomation.ControlViewCondition
    return desktop, inputs, Registry, flatten, node_line


def self_test(cache=None):
    import ast
    from ctypes import wintypes
    from PIL import Image
    for name in ("HHOOK", "HBITMAP", "HGDIOBJ", "HDC", "MSG", "FILETIME"):
        if not hasattr(wintypes, name):
            raise RuntimeError(f"Missing Windows type: {name}")
    if cache:
        cache.mkdir(parents=True, exist_ok=True)
        configure_comtypes(cache)
        import uiautomation
        from uiautomation.uiautomation import _AutomationClient
        if _AutomationClient._instance is not None:
            raise RuntimeError("Dependency import unexpectedly initialized desktop observation")
    for name in ("uia.py", "inputs.py"):
        ast.parse((ROOT / "vendor" / "winhands" / name).read_text(encoding="utf-8"))
    image = Image.new("RGB", (2, 2))
    if image.size != (2, 2):
        raise RuntimeError("Pillow self-test failed")
    print(json.dumps({"ok": True, "protocol": 1, "python": sys.version.split()[0]}))


def serve(cache, excluded_pid):
    protocol_output = sys.stdout
    windows = Windows(excluded_pid)
    engine = Executor(windows, lambda: desktop_factory(cache), UserInputGuard)
    pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="computer-use")
    write_lock = threading.Lock()
    active = None
    active_id = None
    cancelled = threading.Event()
    stopping = False

    def send(request_id, result=None, error=None):
        response = {"jsonrpc": "2.0", "id": request_id}
        response["error" if error else "result"] = error or result
        with write_lock:
            protocol_output.write(json.dumps(response, ensure_ascii=True) + "\n")
            protocol_output.flush()

    def result_for(future):
        try:
            return future.result()
        except DesktopError as error:
            return {"ok": False, "code": str(error)}
        except Exception:
            return {"ok": False, "code": "backend_failed"}

    def tool_result(request_id, future):
        send(request_id, {"content": [{"type": "text", "text": json.dumps(result_for(future), ensure_ascii=True)}]})

    def stop_result(request_id, future):
        nonlocal stopping
        result = result_for(future)
        stopping = False
        send(request_id, {"content": [{"type": "text", "text": json.dumps({"ok": True} if result is None else result)}]})

    try:
        # Third-party diagnostics must never enter the JSON-RPC stream.
        sys.stdout = sys.stderr
        for raw in sys.stdin.buffer:
            if len(raw) > 16 * 1024 * 1024:
                raise RuntimeError("Request limit exceeded")
            try:
                request = json.loads(raw)
                if not isinstance(request, dict):
                    continue
                method, request_id = request.get("method"), request.get("id")
                params = request.get("params", {})
                if method == "notifications/cancelled":
                    if isinstance(params, dict) and params.get("requestId") == active_id:
                        cancelled.set()
                    continue
                if request_id is None:
                    continue
                if method == "initialize":
                    send(request_id, {"protocolVersion": "2024-11-05", "serverInfo": {"name": "vetta-computer-use", "version": "1.0.0"}, "capabilities": {"tools": {}}})
                elif method == "tools/list":
                    send(request_id, {"tools": []})
                elif method == "tools/call" and isinstance(params, dict):
                    if params.get("name") == "stop":
                        cancelled.set()
                        stopping = True
                        future = pool.submit(engine.stop)
                        future.add_done_callback(lambda future, rid=request_id: stop_result(rid, future))
                    elif params.get("name") == "computer_action":
                        if stopping or (active and not active.done()):
                            send(request_id, {"content": [{"type": "text", "text": '{"ok":false,"code":"busy"}'}]})
                            continue
                        cancelled = threading.Event()
                        active_id = request_id
                        active = pool.submit(engine.run, params.get("arguments"), cancelled)
                        active.add_done_callback(lambda future, rid=request_id: tool_result(rid, future))
                    else:
                        send(request_id, error={"code": -32602, "message": "Unknown tool"})
                else:
                    send(request_id, error={"code": -32601, "message": "Unknown method"})
            except (ValueError, TypeError):
                continue
    finally:
        cancelled.set()
        try:
            pool.submit(engine.stop).result()
        finally:
            pool.shutdown(wait=True, cancel_futures=True)
            sys.stdout = protocol_output


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path)
    parser.add_argument("--exclude-pid", type=int, default=0)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test(args.cache)
    elif args.cache and args.cache.is_absolute():
        args.cache.mkdir(parents=True, exist_ok=True)
        serve(args.cache, args.exclude_pid)
    else:
        parser.error("An absolute cache path is required")
