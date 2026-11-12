# Copyright The Open Forge contributors.
from pathlib import Path
import ctypes as C
from ctypes import wintypes as W
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from windows import DesktopError, Windows


class NativeUser:
    def __init__(self):
        self.properties = {}
        self.visible = True
        self.shown = []
        self.title = "Document"
        self.metrics = {76: -10, 77: 5, 78: 100, 79: 80}
        self.foreground = 0x10000007B
        self.thread_id = 41
        self.ime_open = 1
        self.ime_reply = 1
        self.ime_queries = []
        self.after_ime = None

    def IsWindow(self, _): return True
    def IsWindowVisible(self, _): return self.visible
    def GetForegroundWindow(self): return self.foreground
    def GetWindowThreadProcessId(self, _, pid): pid._obj.value = 9; return self.thread_id
    def GetWindowTextW(self, _, value, _size): value.value = self.title
    def GetClassNameW(self, _, value, _size): value.value = "Editor"
    def GetWindowPlacement(self, _, value): value._obj.showCmd = 3; return True
    def GetPropW(self, hwnd, name): return self.properties.get((hwnd, name), 0)
    def SetPropW(self, hwnd, name, value): self.properties[hwnd, name] = value; return True
    def ShowWindow(self, hwnd, command): self.shown.append((hwnd, command)); self.visible = command != 0
    def GetSystemMetrics(self, index): return self.metrics[index]

    def SendMessageTimeoutW(self, hwnd, message, wparam, lparam, flags, timeout, result):
        self.ime_queries.append((hwnd, message, wparam, lparam, flags, timeout))
        result._obj.value = self.ime_open
        if self.after_ime:
            self.after_ime()
        return self.ime_reply


class NativeKernel:
    def __init__(self):
        self.accessible = True
        self.query_ok = True
        self.exe = "C:/editor.exe"
        self.closed = []

    def OpenProcess(self, *_): return 1 if self.accessible else 0
    def CloseHandle(self, handle): self.closed.append(handle); return True
    def GetProcessTimes(self, _, creation, *_times): creation._obj.dwLowDateTime = 7; return True
    def QueryFullProcessImageNameW(self, _process, _flags, buffer, _length): buffer.value = self.exe; return self.query_ok


class NativeImm:
    def __init__(self):
        self.default_window = 0x100000099
        self.queries = []

    def ImmGetDefaultIMEWnd(self, hwnd):
        self.queries.append(hwnd)
        return self.default_window


def native_fixture():
    windows = Windows.__new__(Windows)
    windows.user, windows.kernel, windows.imm = NativeUser(), NativeKernel(), NativeImm()
    return windows


class ForegroundStatusTests(unittest.TestCase):
    def test_api_bindings_preserve_pointer_sized_handles_and_message_result(self):
        libraries = {name: MagicMock() for name in ("user32", "kernel32", "imm32")}
        with patch("windows.C.WinDLL", side_effect=lambda name, **_: libraries[name]):
            windows = Windows()
        self.assertIs(windows.user.GetForegroundWindow.restype, W.HWND)
        self.assertEqual(windows.user.GetForegroundWindow.argtypes, [])
        self.assertIs(windows.imm.ImmGetDefaultIMEWnd.restype, W.HWND)
        self.assertEqual(windows.imm.ImmGetDefaultIMEWnd.argtypes, [W.HWND])
        self.assertEqual(windows.user.SendMessageTimeoutW.argtypes, [W.HWND, W.UINT, W.WPARAM, W.LPARAM, W.UINT, W.UINT, C.POINTER(C.c_size_t)])
        self.assertIs(windows.user.SendMessageTimeoutW.restype, W.LPARAM)

    def test_reads_foreground_title_exe_and_open_or_closed_default_ime_without_mutation(self):
        for opened, expected in ((1, "open"), (0, "closed")):
            with self.subTest(ime=expected):
                windows = native_fixture()
                windows.user.ime_open = opened
                self.assertEqual(windows.foreground_status(), {
                    "hwnd": str(0x10000007B), "title": "Document", "exe": "C:/editor.exe", "ime": expected,
                })
                self.assertEqual(windows.imm.queries, [0x10000007B])
                self.assertEqual(windows.user.ime_queries, [(0x100000099, 0x0283, 0x0005, 0, 0x0022, 100)])
                self.assertEqual(windows.kernel.closed, [1])
                self.assertEqual(windows.user.properties, {})
                self.assertEqual(windows.user.shown, [])

    def test_no_foreground_returns_unknown_without_querying_a_thread_ime(self):
        windows = native_fixture()
        windows.user.foreground = 0
        self.assertEqual(windows.foreground_status(), {"hwnd": None, "title": None, "exe": None, "ime": "unknown"})
        self.assertEqual(windows.imm.queries, [])
        self.assertEqual(windows.kernel.closed, [])

    def test_process_access_denial_keeps_title_and_ime_but_marks_exe_unknown(self):
        windows = native_fixture()
        windows.kernel.accessible = False
        status = windows.foreground_status()
        self.assertEqual(status["title"], "Document")
        self.assertIsNone(status["exe"])
        self.assertEqual(status["ime"], "open")
        self.assertEqual(windows.kernel.closed, [])

    def test_failed_process_query_closes_handle_and_keeps_ime_feedback(self):
        windows = native_fixture()
        windows.kernel.query_ok = False
        status = windows.foreground_status()
        self.assertIsNone(status["exe"])
        self.assertEqual(status["ime"], "open")
        self.assertEqual(windows.kernel.closed, [1])

    def test_missing_default_ime_is_unknown_not_closed(self):
        windows = native_fixture()
        windows.imm.default_window = 0
        self.assertEqual(windows.foreground_status()["ime"], "unknown")
        self.assertEqual(windows.user.ime_queries, [])

    def test_ime_timeout_or_os_error_is_unknown_not_closed(self):
        for failure in ("timeout", "os_error"):
            with self.subTest(failure=failure):
                windows = native_fixture()
                windows.user.ime_reply = 0
                if failure == "os_error":
                    windows.user.SendMessageTimeoutW = MagicMock(side_effect=OSError("IME unavailable"))
                status = windows.foreground_status()
                self.assertEqual(status["ime"], "unknown")
                self.assertEqual(status["title"], "Document")
                self.assertEqual(status["exe"], "C:/editor.exe")

    def test_disappeared_foreground_thread_is_not_queried_as_current_thread(self):
        windows = native_fixture()
        windows.user.thread_id = 0
        status = windows.foreground_status()
        self.assertEqual(status["ime"], "unknown")
        self.assertIsNone(status["exe"])
        self.assertEqual(windows.imm.queries, [])

    def test_foreground_change_during_sampling_does_not_mislabel_old_window_state(self):
        windows = native_fixture()
        windows.user.after_ime = lambda: setattr(windows.user, "foreground", 456)
        self.assertEqual(windows.foreground_status(), {"hwnd": None, "title": None, "exe": None, "ime": "unknown"})
        self.assertEqual(windows.kernel.closed, [1])

    def test_foreground_api_error_is_unknown_instead_of_an_action_failure(self):
        windows = native_fixture()
        with patch.object(windows.user, "GetForegroundWindow", side_effect=OSError("desktop unavailable")):
            self.assertEqual(windows.foreground_status(), {"hwnd": None, "title": None, "exe": None, "ime": "unknown"})


class WindowRecoveryTests(unittest.TestCase):
    def test_handle_reuse_invalidates_a_legacy_recovery_record(self):
        windows = native_fixture()
        with patch("secrets.randbits", side_effect=[101, 202]):
            old = windows.identity(123)
            windows.user.properties.clear()
            with self.assertRaisesRegex(DesktopError, "stale_target"):
                windows.validate(old)
            new = windows.identity(123)
        self.assertNotEqual(old["id"], new["id"])

    def test_title_changes_do_not_invalidate_a_legacy_recovery_record(self):
        windows = native_fixture()
        old = windows.identity(123)
        windows.user.title = "Renamed document"
        self.assertEqual(windows.validate(old)["id"], old["id"])

    def test_restore_uses_the_original_show_command(self):
        windows = native_fixture()
        target = windows.identity(123)
        windows.user.visible = False
        windows.restore(target)
        self.assertEqual(windows.user.shown, [(123, 3)])

    def test_desktop_screenshot_captures_the_virtual_screen_without_a_window_target(self):
        from PIL import Image
        windows = native_fixture()
        with patch("PIL.ImageGrab.grab", return_value=Image.new("RGB", (100, 80), (12, 34, 56))) as grab:
            image, bounds, size = windows.desktop_screenshot()
        grab.assert_called_once_with(all_screens=True)
        self.assertEqual(bounds, (-10, 5, 90, 85))
        self.assertEqual(size, (100, 80))
        self.assertTrue(image.startswith(bytes([137, 80, 78, 71, 13, 10, 26, 10])))


if __name__ == "__main__":
    unittest.main()
