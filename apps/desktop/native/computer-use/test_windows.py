# Copyright The Open Forge contributors.
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from windows import DesktopError, Windows


class NativeUser:
    def __init__(self):
        self.properties = {}
        self.visible = True
        self.shown = []
        self.title = "Document"
        self.metrics = {76: -10, 77: 5, 78: 100, 79: 80}

    def IsWindow(self, _): return True
    def IsWindowVisible(self, _): return self.visible
    def GetWindowThreadProcessId(self, _, pid): pid._obj.value = 9
    def GetWindowTextW(self, _, value, _size): value.value = self.title
    def GetClassNameW(self, _, value, _size): value.value = "Editor"
    def GetWindowPlacement(self, _, value): value._obj.showCmd = 3; return True
    def GetPropW(self, hwnd, name): return self.properties.get((hwnd, name), 0)
    def SetPropW(self, hwnd, name, value): self.properties[hwnd, name] = value; return True
    def ShowWindow(self, hwnd, command): self.shown.append((hwnd, command)); self.visible = command != 0
    def GetSystemMetrics(self, index): return self.metrics[index]


class NativeKernel:
    def OpenProcess(self, *_): return 1
    def CloseHandle(self, *_): return True
    def GetProcessTimes(self, _, creation, *_times): creation._obj.dwLowDateTime = 7; return True
    def QueryFullProcessImageNameW(self, _process, _flags, buffer, _length): buffer.value = "C:/editor.exe"; return True


def native_fixture():
    windows = Windows.__new__(Windows)
    windows.user, windows.kernel = NativeUser(), NativeKernel()
    return windows


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
