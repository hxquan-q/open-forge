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
        self.visible_by_hwnd = {}
        self.foreground = 123
        self.point = 123
        self.shown = []
        self.focused = []
        self.title = "Document"

    def IsWindow(self, _): return True
    def IsWindowVisible(self, hwnd): return self.visible_by_hwnd.get(hwnd, self.visible)
    def IsWindowEnabled(self, hwnd): return hwnd != 123 or self.foreground == 123
    def IsIconic(self, _): return False
    def GetWindowThreadProcessId(self, _, pid): pid._obj.value = 9
    def GetWindowTextW(self, _, value, _size): value.value = self.title
    def GetClassNameW(self, _, value, _size): value.value = "Editor"
    def GetWindowPlacement(self, _, value): value._obj.showCmd = 3; return True
    def GetPropW(self, hwnd, name): return self.properties.get((hwnd, name), 0)
    def SetPropW(self, hwnd, name, value): self.properties[hwnd, name] = value; return True
    def GetForegroundWindow(self): return self.foreground
    def GetAncestor(self, hwnd, _):
        if hwnd is not None and not isinstance(hwnd, int):
            raise TypeError("HWND must be normalized before the native call")
        return 42 if hwnd == 99 else hwnd
    def GetWindow(self, hwnd, _): return 123 if hwnd in {42, 43} else 0
    def WindowFromPoint(self, _): return self.point
    def SetForegroundWindow(self, hwnd): self.focused.append(hwnd); self.foreground = hwnd
    def ShowWindow(self, hwnd, command): self.shown.append((hwnd, command)); self.visible = command != 0


class NativeKernel:
    def OpenProcess(self, *_): return 1
    def CloseHandle(self, *_): return True
    def GetProcessTimes(self, _, creation, *_times): creation._obj.dwLowDateTime = 7; return True
    def QueryFullProcessImageNameW(self, _process, _flags, buffer, _length): buffer.value = "C:/editor.exe"; return True


def native_fixture():
    windows = Windows.__new__(Windows)
    windows.excluded = set()
    windows.hidden_windows = {}
    windows.user, windows.kernel = NativeUser(), NativeKernel()
    return windows


class WindowContractTests(unittest.TestCase):
    def test_handle_reuse_inside_the_same_process_invalidates_old_authorization(self):
        windows = native_fixture()
        with patch("secrets.randbits", side_effect=[101, 202]):
            old = windows.identity(123)
            windows.user.properties.clear()
            with self.assertRaisesRegex(DesktopError, "stale_target"):
                windows.validate(old)
            new = windows.identity(123)
        self.assertNotEqual(old["id"], new["id"])

    def test_serialized_owned_window_handles_are_normalized_before_native_calls(self):
        windows = native_fixture()
        self.assertTrue(windows.belongs("42", "123"))
        self.assertFalse(windows.belongs(None, "123"))

    def test_hidden_owned_dialogs_remain_observable_only_when_explicitly_tracked(self):
        windows = native_fixture()
        windows.handles = lambda: [123, 42, 43]
        root, hidden, untracked = windows.identity(123), windows.identity(42), windows.identity(43)
        windows.user.visible_by_hwnd = {123: False, 42: False, 43: False}
        windows.track_hidden([root, hidden])
        related = windows.related(root)
        self.assertEqual([window["id"] for window in related], [root["id"], hidden["id"]])
        self.assertNotIn(untracked["id"], [window["id"] for window in related])

    def test_title_changes_do_not_change_a_live_window_instance(self):
        windows = native_fixture()
        old = windows.identity(123)
        windows.user.title = "Renamed document"
        self.assertEqual(windows.validate(old)["id"], old["id"])

    def test_owned_dialog_can_keep_foreground_and_receive_its_own_uia_scroll(self):
        windows = native_fixture()
        root = windows.identity(123)
        windows.user.foreground = 42
        windows.user.point = 99
        windows.foreground(root)
        windows.check_point(root, 20, 30, expected=42)
        self.assertEqual(windows.user.focused, [])

    def test_root_screenshot_coordinates_never_click_an_overlapping_owned_dialog(self):
        windows = native_fixture()
        root = windows.identity(123)
        windows.user.foreground = 42
        windows.user.point = 99
        with self.assertRaisesRegex(DesktopError, "target_occluded"):
            windows.check_point(root, 20, 30)

    def test_write_ahead_records_do_not_restore_never_hidden_or_user_restored_windows(self):
        windows = native_fixture()
        root = windows.identity(123)
        windows.restore(root)
        self.assertEqual(windows.user.shown, [])
        windows.user.visible = False
        windows.restore(root)
        self.assertEqual(windows.user.shown, [(123, 3)])


if __name__ == "__main__":
    unittest.main()
