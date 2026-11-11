# Copyright The Open Forge contributors.
"""Vendor the reviewed primitive surface without executing the upstream module."""
import ast
import json
import hashlib
from pathlib import Path
import sys

source, destination = map(Path, sys.argv[1:3])
uia_functions = {"role_name", "_clip", "_is_text_leaf", "_prune_list", "prune", "collapse_lists", "flatten", "node_line", "render", "stale_reason"}
desk_methods = {"__init__", "_v", "_node", "_walk", "_tree", "_rec", "_live", "_checked", "_ctl"}
input_functions = {"_norm", "scan_of", "combo", "key_input", "mouse_input", "touch", "send", "_cursor", "_raw", "sleep", "key_down", "key_up", "press", "_virtual", "move", "mouse_down", "mouse_up", "click_at", "wheel"}
destination.mkdir(parents=True, exist_ok=True)
for filename in ("uia.py", "inputs.py"):
    original = (source / filename).read_bytes()
    expected = json.loads(Path(__file__).with_name("dependencies.json").read_text(encoding="utf-8"))["winhands"]["originalSha256"][filename]
    if hashlib.sha256(original).hexdigest() != expected:
        raise ValueError(f"Upstream source mismatch: {filename}")
    tree = ast.parse(original.decode("utf-8"))
    body = []
    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            if isinstance(node, ast.Import):
                node.names = [alias for alias in node.names if alias.name != "subprocess"]
            if node.names:
                body.append(node)
        elif isinstance(node, ast.FunctionDef):
            if node.name in (uia_functions if filename == "uia.py" else input_functions):
                body.append(node)
        elif isinstance(node, ast.ClassDef):
            if filename == "uia.py" and node.name == "Desk":
                node.body = [method for method in node.body if isinstance(method, ast.FunctionDef) and method.name in desk_methods]
                body.append(node)
            elif node.name in ({"StaleTarget", "Registry"} if filename == "uia.py" else {"MOUSEINPUT", "KEYBDINPUT", "_U", "INPUT"}):
                body.append(node)
        elif isinstance(node, (ast.Assign, ast.AnnAssign, ast.Try, ast.Assert)):
            if filename == "inputs.py" or not any(isinstance(child, ast.Name) and child.id in {"RISKY", "CHAT_APPS"} for child in ast.walk(node)):
                body.append(node)
    code = ast.unparse(ast.fix_missing_locations(ast.Module(body=body, type_ignores=[]))) + "\n"
    for forbidden in ("subprocess", "os.startfile", "exec(", "eval(", "def _front", "def sh(", "def app("):
        if forbidden in code:
            raise ValueError(f"Forbidden API: {forbidden}")
    header = "# Derived from WinHands 0.4.1 (MIT), Copyright (c) 2026 Rodolfo Obreque.\n# Modified by The Open Forge contributors: restricted primitive surface.\n"
    (destination / filename).write_text(header + code, encoding="utf-8")
    print(filename, hashlib.sha256(original).hexdigest())
(destination / "__init__.py").write_text("# Copyright The Open Forge contributors.\n# WinHands restricted primitives; see LICENSE.\n", encoding="utf-8")
(destination / "LICENSE").write_bytes((source.parent / "winhands-0.4.1.dist-info" / "licenses" / "LICENSE").read_bytes())
