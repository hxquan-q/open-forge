# Copyright The Open Forge contributors.
from pathlib import Path
import sys
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from executor import Executor, validate_command
from windows import DesktopError

TARGET = {"id": "target", "hwnd": "123", "pid": 9, "started": "1234", "instance": "42", "className": "Editor", "exe": "C:/editor.exe", "title": "Example", "hidden": False, "showCommand": 1}


class FakeWindows:
    def __init__(self, *_):
        self.image = b"original-image"
        self.current = dict(TARGET)
        self.events = []
        self.dialogs = []

    def validate(self, value):
        actual = self.current if value["hwnd"] == self.current["hwnd"] else next((window for window in self.dialogs if window["hwnd"] == value["hwnd"]), None)
        if not actual or any(actual[key] != value[key] for key in ("id", "started", "instance")):
            raise DesktopError("stale_target")
        return dict(actual)

    def list(self):
        return [self.current]

    def track_hidden(self, windows):
        self.hidden_records = list(windows)

    def related(self, target):
        return [self.validate(target), *self.dialogs]

    def belongs(self, hwnd, root):
        return hwnd == root or any(window["hwnd"] == hwnd for window in self.dialogs)

    def bounds(self, _):
        return (10, 20, 110, 120)

    def screenshot(self, _):
        if self.image is None:
            raise DesktopError("capture_unavailable")
        return self.image, self.bounds(None), (50, 50)

    def foreground(self, target):
        self.validate(target)
        if self.current["hidden"]:
            raise DesktopError("needs_foreground")
        self.events.append("foreground")

    def check_foreground(self, _):
        pass

    def check_point(self, *args, expected=None):
        self.events.append(("point", args[1:]))

    def hide(self, _):
        self.current["hidden"] = True

    def restore(self, _):
        self.current["hidden"] = False


class FakeGuard:
    def __init__(self, windows, target, physical, cancelled):
        self.cancelled = cancelled

    def __enter__(self):
        return self

    def check(self):
        if self.cancelled.is_set():
            raise DesktopError("cancelled")

    def __exit__(self, *_):
        pass


class Registry:
    def assign(self, *_):
        pass

    def id_of(self, node):
        return node["hwnd"]


class NativeFixture:
    def __init__(self):
        self.held = set()
        self.BTN = {"left": (2, 4)}
        self.events = []
        self.invoke_supported = True
        self.settable = True
        self.check = None
        self.cancel_during_press = None
        self.entered = None
        self.before_move = None
        self.top_override = None
        self.control_hwnd = 123

    def desktop(self):
        return self, self, Registry, lambda tree: [tree], lambda token, _: token + " button Example"

    @property
    def auto(self):
        return self

    def ControlFromHandle(self, hwnd):
        return hwnd

    def _tree(self, hwnd):
        return {"name": "Example", "hwnd": hwnd}

    def _checked(self, index, *_args, **_kwargs):
        return {"hwnd": index, "invoke": self.invoke_supported, "settable": self.settable}, {"rect": (10, 20, 50, 60)}

    def _ctl(self, record):
        self.control_hwnd = record["hwnd"]
        return self

    def GetTopLevelControl(self):
        return type("TopLevel", (), {"NativeWindowHandle": self.top_override or self.control_hwnd})()

    def GetInvokePattern(self):
        return self

    def Invoke(self, **_):
        self.events.append("invoke")

    def GetValuePattern(self):
        return self

    def SetValue(self, text, **_):
        self.events.append(("fill", text))

    def press(self, keys):
        self.held.add(("key", keys))
        if self.entered:
            self.entered.set()
        if self.cancel_during_press:
            self.cancel_during_press.set()
            self.check()
        self.events.append(("press", keys))

    def key_input(self, value, up=False):
        return ("key", value, up)

    def mouse_input(self, **value):
        return value

    def _raw(self, value):
        self.events.append(("release", value))

    def click_at(self, x, y):
        self.events.append(("click", x, y))

    def move(self, *point):
        if self.before_move:
            self.before_move()
        if self.guard:
            self.guard()
        self.events.append(("move", point))

    def wheel(self, amount):
        self.events.append(("wheel", amount))


class ExecutorTests(unittest.TestCase):
    def setUp(self):
        self.windows, self.native = FakeWindows(), NativeFixture()
        self.engine = Executor(self.windows, self.native.desktop, FakeGuard)
        self.cancelled = threading.Event()

    def call(self, value, foreground=False):
        return self.engine.run({"op": "execute", "target": dict(TARGET), "input": value, "foreground": foreground, "hiddenWindows": []}, self.cancelled)

    def reference(self):
        return self.call({"action": "observe"})["text"].splitlines()[1].split()[0]

    def test_observe_invoke_reobserve_fill_continuous_workflow(self):
        token = self.reference()
        self.call({"action": "invoke", "element": token})
        with self.assertRaisesRegex(DesktopError, "stale_reference"):
            self.call({"action": "fill", "element": token, "text": "hello"})
        self.call({"action": "fill", "element": self.reference(), "text": "hello"})
        self.assertEqual(self.native.events, ["invoke", ("fill", "hello")])
        self.assertEqual(self.windows.events, [])

    def test_uia_unavailable_never_falls_back_to_physical_input(self):
        self.native.invoke_supported = False
        with self.assertRaisesRegex(DesktopError, "needs_foreground"):
            self.call({"action": "invoke", "element": self.reference()})
        self.native.settable = False
        with self.assertRaisesRegex(DesktopError, "needs_foreground"):
            self.call({"action": "fill", "element": self.reference(), "text": "hello"})
        self.assertEqual(self.native.events, [])
        self.assertEqual(self.windows.events, [])

    def test_physical_input_requires_permission_and_a_visible_window(self):
        with self.assertRaisesRegex(DesktopError, "needs_foreground"):
            self.call({"action": "press", "keys": "enter"})
        self.windows.current["hidden"] = True
        with self.assertRaisesRegex(DesktopError, "needs_foreground"):
            self.call({"action": "press", "keys": "enter"}, foreground=True)
        self.assertEqual(self.native.events, [])

    def test_changed_process_instance_is_not_trusted(self):
        self.windows.current["started"] = "reused"
        with self.assertRaisesRegex(DesktopError, "stale_target"):
            self.call({"action": "observe"})

    def test_screenshot_coordinates_are_scaled_and_not_reusable(self):
        self.call({"action": "observe", "screenshot": True})
        shot = self.engine.shot["revision"]
        self.call({"action": "click", "revision": shot, "x": 25, "y": 25}, foreground=True)
        self.assertIn(("click", 60, 70), self.native.events)
        with self.assertRaisesRegex(DesktopError, "stale_reference"):
            self.call({"action": "click", "revision": shot, "x": 25, "y": 25}, foreground=True)

    def test_changed_pixels_reject_old_coordinates(self):
        self.call({"action": "observe", "screenshot": True})
        shot = self.engine.shot["revision"]
        self.windows.image = b"changed"
        with self.assertRaisesRegex(DesktopError, "stale_reference"):
            self.call({"action": "click", "revision": shot, "x": 25, "y": 25}, foreground=True)
        self.assertEqual(self.native.events, [])

    def test_invalid_capture_keeps_uia_and_never_substitutes_screen_pixels(self):
        self.windows.image = None
        result = self.call({"action": "observe", "screenshot": True})
        self.assertNotIn("image", result)
        self.assertIn("No screen-pixel fallback", result["text"])
        self.assertIsNone(self.engine.shot)

    def test_cancellation_releases_held_keys_before_returning(self):
        self.native.cancel_during_press = self.cancelled
        with self.assertRaisesRegex(DesktopError, "cancelled"):
            self.call({"action": "press", "keys": "ctrl"}, foreground=True)
        self.assertEqual(self.native.held, set())
        self.assertIn(("release", ("key", "ctrl", True)), self.native.events)

    def test_popup_handle_reuse_between_element_check_and_send_is_rejected(self):
        dialog = {**TARGET, "id": "dialog", "hwnd": "42", "instance": "101"}
        self.windows.dialogs.append(dialog)
        self.call({"action": "observe"})
        token = next(token for token, (window, _) in self.engine.refs.items() if window["id"] == "dialog")
        self.native.before_move = lambda: self.windows.dialogs.__setitem__(0, {**dialog, "instance": "202"})
        with self.assertRaisesRegex(DesktopError, "stale_target"):
            self.call({"action": "scroll", "element": token, "amount": 1}, foreground=True)
        self.assertEqual(self.native.events, [])

    def test_handoff_invalidates_previous_observation_references(self):
        token = self.reference()
        self.engine.stop()
        with self.assertRaisesRegex(DesktopError, "stale_reference"):
            self.call({"action": "invoke", "element": token})
        self.assertEqual(self.native.events, [])

    def test_reparented_uia_element_cannot_act_in_an_unrelated_window(self):
        token = self.reference()
        self.native.top_override = 999
        with self.assertRaisesRegex(DesktopError, "stale_target"):
            self.call({"action": "invoke", "element": token})
        self.assertEqual(self.native.events, [])

    def test_arbitrary_code_and_extra_fields_are_rejected(self):
        for command in ({"op": "run", "code": "print(1)"}, {"op": "windows", "code": "print(1)"}, {"op": "execute", "target": TARGET, "foreground": False, "input": {"action": "observe", "code": "print(1)"}}):
            with self.assertRaisesRegex(DesktopError, "invalid_input"):
                validate_command(command)


if __name__ == "__main__":
    unittest.main()
