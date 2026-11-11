# Copyright The Open Forge contributors.
import base64
import hashlib
import time
import uuid
from windows import DesktopError


def validate_window(target):
    fields = {"id", "hwnd", "pid", "started", "instance", "className", "exe", "title", "hidden", "showCommand"}
    if not isinstance(target, dict) or set(target) != fields or not isinstance(target["hidden"], bool):
        raise DesktopError("invalid_input")
    if not all(isinstance(target[key], str) and len(target[key]) <= 4096 for key in ("id", "hwnd", "started", "instance", "className", "exe", "title")):
        raise DesktopError("invalid_input")
    if not target["hwnd"].isdigit() or type(target["pid"]) is not int or target["pid"] < 1 or type(target["showCommand"]) is not int or not 0 <= target["showCommand"] <= 11:
        raise DesktopError("invalid_input")


def validate_command(command):
    if not isinstance(command, dict) or command.get("op") not in {"windows", "related", "hide", "restore", "execute"}:
        raise DesktopError("invalid_input")
    op = command["op"]
    allowed = {"op"} if op == "windows" else {"op", "target", "input", "foreground", "hiddenWindows"} if op == "execute" else {"op", "target"}
    if set(command) != allowed:
        raise DesktopError("invalid_input")
    if op != "windows":
        validate_window(command["target"])
    if op == "execute":
        known = command["hiddenWindows"]
        if not isinstance(known, list) or len(known) > 1024:
            raise DesktopError("invalid_input")
        for window in known:
            validate_window(window)
        value = command["input"]
        if not isinstance(value, dict) or not isinstance(command["foreground"], bool):
            raise DesktopError("invalid_input")
        action = value.get("action")
        keys = {"observe": {"action", "screenshot"}, "invoke": {"action", "element"}, "fill": {"action", "element", "text"},
                "press": {"action", "keys"}, "click": {"action", "revision", "x", "y"}, "scroll": {"action", "element", "amount"}}
        if action not in keys or set(value) - keys[action] or keys[action] - set(value) not in (set(), {"screenshot"}):
            raise DesktopError("invalid_input")
        for key in ("element", "revision", "keys", "text"):
            if key in value and (not isinstance(value[key], str) or len(value[key]) > (20_000 if key == "text" else 128)):
                raise DesktopError("invalid_input")
        for key in ("x", "y", "amount"):
            if key in value and type(value[key]) is not int:
                raise DesktopError("invalid_input")
        if "amount" in value and not -20 <= value["amount"] <= 20:
            raise DesktopError("invalid_input")
        if "screenshot" in value and not isinstance(value["screenshot"], bool):
            raise DesktopError("invalid_input")
    return command


class Executor:
    def __init__(self, windows, desktop_factory, guard_factory):
        self.windows, self.desktop_factory, self.guard_factory = windows, desktop_factory, guard_factory
        self.desktop = None
        self.refs = {}
        self.shot = None
        self.observed_target = None
        self.inputs = None

    def load(self):
        if self.desktop is None:
            self.desktop, self.inputs, self.registry_type, self.flatten, self.node_line = self.desktop_factory()

    def release(self):
        if self.inputs is None:
            return
        failures = []
        for kind, value in tuple(self.inputs.held):
            try:
                packet = self.inputs.mouse_input(flags=self.inputs.BTN[value][1]) if kind == "btn" else self.inputs.key_input(value, up=True)
                self.inputs._raw(packet)
                self.inputs.held.discard((kind, value))
            except OSError as error:
                failures.append(error)
        if failures:
            raise DesktopError("input_release_failed")

    def stop(self):
        self.release()
        self.refs = {}
        self.shot = None
        self.observed_target = None

    def run(self, raw, cancelled):
        command = validate_command(raw)
        if cancelled.is_set():
            raise DesktopError("cancelled")
        op = command["op"]
        if op == "windows":
            return {"ok": True, "windows": self.windows.list()}
        target = command["target"]
        self.windows.validate(target)
        if op == "related":
            return {"ok": True, "windows": self.windows.related(target)}
        if op == "hide":
            self.shot = None
            self.windows.hide(target)
            return {"ok": True}
        if op == "restore":
            self.shot = None
            self.windows.restore(target)
            return {"ok": True}
        self.windows.track_hidden(command["hiddenWindows"])
        self.load()
        action = command["input"]["action"]
        physical = action in {"press", "click", "scroll"}
        if physical and not command["foreground"]:
            raise DesktopError("needs_foreground")
        with self.guard_factory(self.windows, target, physical, cancelled) as guard:
            self.inputs.check = guard.check
            self.inputs.guard = guard.check
            try:
                if physical:
                    self.windows.foreground(target)
                guard.check()
                if action == "observe":
                    return self.observe(target, command["input"].get("screenshot", False), guard)
                self.act(target, command["input"], guard)
                guard.check()
                self.refs = {}
                self.shot = None
                return {"ok": True, "text": "Action completed. Observe again before the next action; previous references are invalid."}
            finally:
                self.inputs.guard = None
                self.inputs.check = None
                self.release()

    def observe(self, target, screenshot, guard):
        self.refs = {}
        self.shot = None
        self.observed_target = target["id"]
        self.desktop.reg = self.registry_type()
        revision = uuid.uuid4().hex
        lines = []
        for window in self.windows.related(target):
            guard.check()
            control = self.desktop.auto.ControlFromHandle(int(window["hwnd"]))
            tree = self.desktop._tree(control)
            nodes = self.flatten(tree)[:300]
            self.desktop.reg.assign(int(window["hwnd"]), nodes)
            lines.append(f'Window {window["title"]!r} ({window["id"]})')
            for node in nodes:
                index = self.desktop.reg.id_of(node)
                token = revision + ":" + window["id"] + ":" + str(index)
                self.refs[token] = (window, index)
                lines.append(self.node_line(token, node))
                if len(lines) >= 600:
                    lines.append("Tree truncated.")
                    break
        result = {"ok": True, "text": "\n".join(lines)[:60_000]}
        if screenshot:
            try:
                image, bounds, size = self.windows.screenshot(target)
                guard.check()
                self.shot = {"revision": revision, "target": target["id"], "bounds": bounds, "size": size, "hash": hashlib.sha256(image).digest(), "time": time.monotonic()}
                result["image"] = {"data": base64.b64encode(image).decode("ascii"), "mimeType": "image/png"}
                result["text"] += f"\nScreenshot source: PrintWindow; revision={revision}; size={size[0]}x{size[1]}; clicks use screenshot-local pixel coordinates."
            except DesktopError as error:
                if str(error) != "capture_unavailable":
                    raise
                result["text"] += "\nScreenshot unavailable. No screen-pixel fallback was used. Use UIA references; do not guess coordinates."
        return result

    def element(self, target, token):
        if self.observed_target != target["id"] or token not in self.refs:
            raise DesktopError("stale_reference")
        window, index = self.refs[token]
        self.windows.validate(window)
        if not self.windows.belongs(window["hwnd"], target["hwnd"]):
            raise DesktopError("stale_target")
        try:
            record, live = self.desktop._checked(index, need_rect=True)
        except Exception as error:
            raise DesktopError("stale_reference") from error
        if record["hwnd"] != int(window["hwnd"]):
            raise DesktopError("stale_reference")
        try:
            control = self.desktop._ctl(record)
            live_window = control.GetTopLevelControl().NativeWindowHandle
        except Exception as error:
            raise DesktopError("stale_reference") from error
        if not self.windows.belongs(str(live_window or 0), target["hwnd"]):
            raise DesktopError("stale_target")
        return record, live, window, control

    def act(self, target, value, guard):
        action = value["action"]
        if action in {"invoke", "fill", "scroll"}:
            record, live, window, control = self.element(target, value["element"])
            if action == "invoke":
                if not record.get("invoke"):
                    raise DesktopError("needs_foreground")
                control.GetInvokePattern().Invoke(waitTime=0)
            elif action == "fill":
                if not record.get("settable"):
                    raise DesktopError("needs_foreground")
                control.GetValuePattern().SetValue(value["text"], waitTime=0)
            else:
                rect = live["rect"]
                x, y = (rect[0] + rect[2]) // 2, (rect[1] + rect[3]) // 2
                self.windows.check_point(target, x, y, expected=record["hwnd"])
                self.inputs.guard = lambda: self.point_guard(guard, target, x, y, window)
                guard.check()
                self.inputs.move(x, y)
                self.inputs.wheel(value["amount"])
        elif action == "press":
            self.inputs.press(value["keys"])
        elif action == "click":
            shot = self.shot
            if not shot or shot["revision"] != value["revision"] or shot["target"] != target["id"]:
                raise DesktopError("stale_reference")
            if tuple(self.windows.bounds(target)) != tuple(shot["bounds"]) or time.monotonic() - shot["time"] > 10:
                raise DesktopError("stale_reference")
            current_image, _, current_size = self.windows.screenshot(target)
            if current_size != shot["size"] or hashlib.sha256(current_image).digest() != shot["hash"]:
                raise DesktopError("stale_reference")
            x, y = value["x"], value["y"]
            if not (0 <= x < shot["size"][0] and 0 <= y < shot["size"][1]):
                raise DesktopError("invalid_input")
            left, top, right, bottom = shot["bounds"]
            x = left + round(x * (right - left) / shot["size"][0])
            y = top + round(y * (bottom - top) / shot["size"][1])
            self.windows.check_point(target, x, y)
            self.inputs.guard = lambda: self.point_guard(guard, target, x, y, target)
            guard.check()
            self.inputs.click_at(x, y)

    def point_guard(self, guard, target, x, y, expected):
        guard.check()
        self.windows.validate(expected)
        self.windows.check_point(target, x, y, expected=expected["hwnd"])
