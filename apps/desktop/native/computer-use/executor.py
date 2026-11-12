# Copyright The Open Forge contributors.
import base64
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
    if not isinstance(command, dict) or command.get("op") not in {"restore", "execute"}:
        raise DesktopError("invalid_input")
    op = command["op"]
    allowed = {"op", "target"} if op == "restore" else {"op", "input"}
    if set(command) != allowed:
        raise DesktopError("invalid_input")
    if op == "restore":
        validate_window(command["target"])
    if op == "execute":
        value = command["input"]
        if not isinstance(value, dict):
            raise DesktopError("invalid_input")
        action = value.get("action")
        fields = {
            "observe": {"action"},
            "click": {"action", "revision", "x", "y"},
            "press": {"action", "keys"},
            "type": {"action", "text"},
            "scroll": {"action", "revision", "x", "y", "amount"},
        }
        if action not in fields or set(value) != fields[action]:
            raise DesktopError("invalid_input")
        for key in ("revision", "keys", "text"):
            if key in value and not isinstance(value[key], str):
                raise DesktopError("invalid_input")
        for key in ("x", "y", "amount"):
            if key in value and type(value[key]) is not int:
                raise DesktopError("invalid_input")
    return command


class Executor:
    def __init__(self, windows, input_factory):
        self.windows = windows
        self.input_factory = input_factory
        self.inputs = None
        self.shot = None

    def load(self):
        if self.inputs is None:
            self.inputs = self.input_factory()

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
        self.shot = None

    def run(self, raw, cancelled):
        command = validate_command(raw)
        if cancelled.is_set():
            raise DesktopError("cancelled")
        op = command["op"]
        if op == "restore":
            self.shot = None
            self.windows.restore(command["target"])
            return {"ok": True}

        self.load()
        self.inputs.guard = lambda: self.check_cancelled(cancelled)
        self.inputs.check = lambda: self.check_cancelled(cancelled)
        try:
            value = command["input"]
            if value["action"] == "observe":
                return self.observe(cancelled)
            self.act(value, cancelled)
            self.check_cancelled(cancelled)
            self.shot = None
            return {"ok": True, "text": "Action completed. Observe the desktop again before the next action."}
        finally:
            self.inputs.guard = None
            self.inputs.check = None
            self.release()

    @staticmethod
    def check_cancelled(cancelled):
        if cancelled.is_set():
            raise DesktopError("cancelled")

    def observe(self, cancelled):
        self.check_cancelled(cancelled)
        image, bounds, size = self.windows.desktop_screenshot()
        self.check_cancelled(cancelled)
        revision = uuid.uuid4().hex
        self.shot = {"revision": revision, "bounds": bounds, "size": size, "time": time.monotonic()}
        text = (
            f"Full desktop screenshot; revision={revision}; size={size[0]}x{size[1]}; "
            f"virtual desktop origin=({bounds[0]},{bounds[1]}). Use screenshot-local coordinates for mouse actions."
        )
        return {"ok": True, "text": text, "image": {"data": base64.b64encode(image).decode("ascii"), "mimeType": "image/png"}}

    def map_point(self, shot, x, y):
        width, height = shot["size"]
        if not (0 <= x < width and 0 <= y < height):
            raise DesktopError("invalid_input")
        left, top, right, bottom = shot["bounds"]
        return left + round(x * (right - left) / width), top + round(y * (bottom - top) / height)

    def act(self, value, cancelled):
        action = value["action"]
        if action == "press":
            self.inputs.press(value["keys"])
            return
        if action == "type":
            self.type_text(value["text"], cancelled)
            return
        shot = self.shot
        if not shot or value["revision"] != shot["revision"]:
            raise DesktopError("stale_reference")
        x, y = self.map_point(shot, value["x"], value["y"])
        self.check_cancelled(cancelled)
        if action == "click":
            self.inputs.click_at(x, y)
        else:
            self.inputs.move(x, y)
            self.inputs.wheel(value["amount"])

    def type_text(self, text, cancelled):
        encoded = text.encode("utf-16-le", "surrogatepass")
        for offset in range(0, len(encoded), 512):
            self.check_cancelled(cancelled)
            packets = []
            for index in range(offset, min(offset + 512, len(encoded)), 2):
                code_unit = encoded[index] | (encoded[index + 1] << 8)
                down = self.inputs.INPUT(1, self.inputs._U(ki=self.inputs.KEYBDINPUT(0, code_unit, 4, 0, 0)))
                up = self.inputs.INPUT(1, self.inputs._U(ki=self.inputs.KEYBDINPUT(0, code_unit, 6, 0, 0)))
                packets.extend((down, up))
            try:
                self.inputs._raw(*packets)
            except OSError:
                for packet in packets[1::2]:
                    try:
                        self.inputs._raw(packet)
                    except OSError:
                        pass
                raise
