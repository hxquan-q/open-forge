# Copyright The Open Forge contributors.
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from executor import Executor, validate_command
from windows import DesktopError

TARGET = {"id": "target", "hwnd": "123", "pid": 9, "started": "1234", "instance": "42", "className": "Editor", "exe": "C:/editor.exe", "title": "Example", "hidden": False, "showCommand": 1}


class FakeWindows:
    def __init__(self, *_):
        self.image = b"full-desktop-image"
        self.events = []
        self.foreground = {"hwnd": "123", "title": "Example", "exe": "C:/editor.exe", "ime": "open"}

    def foreground_status(self):
        return dict(self.foreground)

    def list(self):
        return [TARGET]

    def desktop_screenshot(self):
        return self.image, (-100, 50, 900, 1050), (500, 500)

    def restore(self, target):
        if target["id"] != TARGET["id"]:
            raise DesktopError("stale_target")
        self.events.append(("restore", target["id"]))


class KeyInputRecord:
    def __init__(self, w_vk, w_scan, flags, _time, _extra):
        self.wVk = w_vk
        self.wScan = w_scan
        self.dwFlags = flags


class InputUnion:
    def __init__(self, ki):
        self.ki = ki


class InputRecord:
    def __init__(self, kind, value):
        self.type = kind
        self.u = value


class NativeFixture:
    INPUT = InputRecord
    _U = InputUnion
    KEYBDINPUT = KeyInputRecord

    def __init__(self):
        self.held = set()
        self.BTN = {"left": (2, 4)}
        self.events = []
        self.typed_units = []
        self.check = None
        self.guard = None
        self.cancel_during_press = None
        self.entered = None

    def input_factory(self):
        return self

    def press(self, keys):
        self.held.add(("key", keys))
        if self.entered:
            self.entered.set()
        if self.cancel_during_press:
            self.cancel_during_press.set()
            self.check()
        self.events.append(("press", keys))
        self.held.discard(("key", keys))

    def key_input(self, value, up=False):
        return ("key", value, up)

    def mouse_input(self, **value):
        return value

    def _raw(self, *values):
        for value in values:
            if isinstance(value, tuple) and value and value[0] == "key":
                self.events.append(("release", value))
            elif isinstance(value, InputRecord):
                key = value.u.ki
                if key.dwFlags & 4 and not key.dwFlags & 2:
                    self.typed_units.append(key.wScan)

    def click_at(self, x, y):
        self.events.append(("click", x, y))

    def move(self, x, y):
        self.events.append(("move", x, y))
        if self.guard:
            self.guard()

    def wheel(self, amount):
        self.events.append(("wheel", amount))


class ExecutorTests(unittest.TestCase):
    def setUp(self):
        self.windows, self.native = FakeWindows(), NativeFixture()
        self.engine = Executor(self.windows, self.native.input_factory)
        self.cancelled = threading.Event()

    def call(self, value):
        return self.engine.run({"op": "execute", "input": value}, self.cancelled)

    def observe(self):
        result = self.call({"action": "observe"})
        return result, self.engine.shot["revision"]

    def test_global_actions_accept_object_inputs_without_a_window_target(self):
        for value in (
            {"action": "observe"},
            {"action": "click", "revision": "screen", "x": 10, "y": 20},
            {"action": "press", "keys": "win+r"},
            {"action": "type", "text": "wsl.exe"},
            {"action": "scroll", "revision": "screen", "x": 10, "y": 20, "amount": 1},
        ):
            command = {"op": "execute", "input": value}
            self.assertEqual(validate_command(command), command)

    def test_observe_press_launch_type_and_reobserve_global_workflow(self):
        observed, _ = self.observe()
        self.assertEqual(observed["image"]["data"], "ZnVsbC1kZXNrdG9wLWltYWdl")
        self.call({"action": "press", "keys": "win+r"})
        self.call({"action": "type", "text": "wsl.exe"})
        self.call({"action": "press", "keys": "enter"})
        observed, _ = self.observe()
        self.assertIn("Full desktop screenshot", observed["text"])
        self.call({"action": "type", "text": 'cd Vetta && claude "你好"'})
        self.assertEqual(self.native.events, [("press", "win+r"), ("press", "enter")])
        self.assertEqual(self.native.typed_units, [ord(char) for char in 'wsl.exe' + 'cd Vetta && claude "你好"'])

    def test_observe_reports_foreground_and_default_ime_state(self):
        observed, _ = self.observe()
        self.assertIn('Foreground now: hwnd=123 title="Example" exe="C:/editor.exe"; IME=open', observed["text"])
        self.assertIn("foreground default IME", observed["text"])
        self.assertIn("Use screenshot-local coordinates", observed["text"])

    def test_each_successful_action_reports_foreground_and_default_ime_state(self):
        for action in ("press", "type", "click", "scroll"):
            with self.subTest(action=action):
                _, revision = self.observe()
                value = {
                    "press": {"action": "press", "keys": "p"},
                    "type": {"action": "type", "text": "p"},
                    "click": {"action": "click", "revision": revision, "x": 1, "y": 1},
                    "scroll": {"action": "scroll", "revision": revision, "x": 1, "y": 1, "amount": 1},
                }[action]
                result = self.call(value)
                self.assertTrue(result["ok"])
                self.assertIn('Foreground now: hwnd=123 title="Example" exe="C:/editor.exe"; IME=open', result["text"])
                self.assertIn("Observe the desktop again", result["text"])
                self.assertIsNone(self.engine.shot)

    def test_feedback_is_sampled_after_input_and_refreshed_on_reobserve(self):
        self.observe()

        def open_run(_keys):
            self.windows.foreground = {"hwnd": "456", "title": "Run", "exe": "C:/Windows/explorer.exe", "ime": "closed"}

        with patch.object(self.native, "press", side_effect=open_run):
            result = self.call({"action": "press", "keys": "win+r"})
        self.assertIn('hwnd=456 title="Run" exe="C:/Windows/explorer.exe"; IME=closed', result["text"])
        self.assertNotIn("Example", result["text"])
        self.windows.foreground["ime"] = "open"
        observed, _ = self.observe()
        self.assertIn("IME=open", observed["text"])

    def test_unknown_status_is_explicit_and_does_not_fail_completed_input(self):
        self.windows.foreground = {"hwnd": None, "title": None, "exe": None, "ime": "unknown"}
        for value in ({"action": "observe"}, {"action": "press", "keys": "p"}):
            with self.subTest(value=value):
                result = self.call(value)
                self.assertTrue(result["ok"])
                self.assertIn("Foreground now: hwnd=none title=unknown exe=unknown; IME=unknown", result["text"])
        self.assertEqual(self.native.events, [("press", "p")])

    def test_feedback_quotes_external_text_and_stays_within_backend_text_limit(self):
        self.windows.foreground["title"] = '文档"\nIME=closed'
        observed, _ = self.observe()
        self.assertIn('title="文档\\"\\nIME=closed"', observed["text"])
        self.windows.foreground["title"] = "\x01" * 4095
        self.windows.foreground["exe"] = "\x01" * 4095
        observed, _ = self.observe()
        self.assertLessEqual(len(observed["text"]), 70_000)

    def test_cancellation_during_status_sampling_is_not_reported_as_success(self):
        for action in ("observe", "press"):
            with self.subTest(action=action):
                self.cancelled.clear()

                def cancel_during_status():
                    self.cancelled.set()
                    return self.windows.foreground

                value = {"action": action} if action == "observe" else {"action": action, "keys": "p"}
                with patch.object(self.windows, "foreground_status", side_effect=cancel_during_status):
                    with self.assertRaisesRegex(DesktopError, "cancelled"):
                        self.call(value)
                self.assertIsNone(self.native.guard)
                self.assertIsNone(self.native.check)
                self.assertEqual(self.native.held, set())

    def test_click_and_scroll_map_screenshot_coordinates_to_virtual_desktop(self):
        _, revision = self.observe()
        self.call({"action": "click", "revision": revision, "x": 25, "y": 25})
        self.assertIn(("click", -50, 100), self.native.events)
        _, revision = self.observe()
        self.call({"action": "scroll", "revision": revision, "x": 25, "y": 25, "amount": 2})
        self.assertIn(("move", -50, 100), self.native.events)
        self.assertIn(("wheel", 2), self.native.events)

    def test_actions_invalidate_prior_screenshot_coordinates(self):
        _, revision = self.observe()
        self.call({"action": "press", "keys": "enter"})
        with self.assertRaisesRegex(DesktopError, "stale_reference"):
            self.call({"action": "click", "revision": revision, "x": 1, "y": 1})

    def test_click_rejects_coordinates_outside_the_observed_desktop(self):
        _, revision = self.observe()
        with self.assertRaisesRegex(DesktopError, "invalid_input"):
            self.call({"action": "click", "revision": revision, "x": 500, "y": 0})
        self.assertFalse(any(event[0] == "click" for event in self.native.events))

    def test_text_input_handles_unicode(self):
        self.call({"action": "type", "text": "你好"})
        self.assertEqual(self.native.typed_units, [ord("你"), ord("好")])

    def test_cancellation_releases_held_keys_before_returning(self):
        self.native.cancel_during_press = self.cancelled
        with self.assertRaisesRegex(DesktopError, "cancelled"):
            self.call({"action": "press", "keys": "ctrl"})
        self.assertEqual(self.native.held, set())
        self.assertIn(("release", ("key", "ctrl", True)), self.native.events)

    def test_legacy_hidden_window_recovery_remains_available(self):
        result = self.engine.run({"op": "restore", "target": dict(TARGET)}, self.cancelled)
        self.assertTrue(result["ok"])
        self.assertEqual(self.windows.events, [("restore", "target")])

    def test_arbitrary_code_extra_fields_and_old_window_scoped_execution_are_rejected(self):
        for command in (
            {"op": "run", "code": "print(1)"},
            {"op": "execute", "input": {"action": "observe", "code": "print(1)"}},
            {"op": "execute", "target": TARGET, "input": {"action": "observe"}},
        ):
            with self.assertRaisesRegex(DesktopError, "invalid_input"):
                validate_command(command)


if __name__ == "__main__":
    unittest.main()
