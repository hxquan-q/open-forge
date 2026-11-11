# Copyright The Open Forge contributors.
import ctypes as C
from ctypes import wintypes as W
import hashlib
import io
import json
import os
import secrets

INSTANCE_PROPERTY = "OpenForge.ComputerUse.WindowInstance.v1"


class DesktopError(Exception):
    pass


class Placement(C.Structure):
    _fields_ = [("length", W.UINT), ("flags", W.UINT), ("showCmd", W.UINT),
                ("minPosition", W.POINT), ("maxPosition", W.POINT), ("normalPosition", W.RECT)]


class BitmapInfo(C.Structure):
    _fields_ = [("size", W.DWORD), ("width", W.LONG), ("height", W.LONG),
                ("planes", W.WORD), ("bits", W.WORD), ("compression", W.DWORD),
                ("imageSize", W.DWORD), ("xPixels", W.LONG), ("yPixels", W.LONG),
                ("used", W.DWORD), ("important", W.DWORD)]


class Windows:
    def __init__(self, excluded_pid):
        self.excluded = {int(excluded_pid), os.getpid()}
        self.hidden_windows = {}
        self.user = C.WinDLL("user32", use_last_error=True)
        self.kernel = C.WinDLL("kernel32", use_last_error=True)
        self.gdi = C.WinDLL("gdi32", use_last_error=True)
        self.user.GetForegroundWindow.restype = W.HWND
        self.user.GetWindow.restype = W.HWND
        self.user.GetWindow.argtypes = [W.HWND, W.UINT]
        self.user.GetAncestor.restype = W.HWND
        self.user.GetAncestor.argtypes = [W.HWND, W.UINT]
        self.user.WindowFromPoint.restype = W.HWND
        self.user.WindowFromPoint.argtypes = [W.POINT]
        for name in ("IsWindow", "IsWindowVisible", "IsWindowEnabled", "IsIconic", "SetForegroundWindow"):
            getattr(self.user, name).argtypes = [W.HWND]
        self.user.GetWindowRect.argtypes = [W.HWND, C.POINTER(W.RECT)]
        self.user.GetWindowPlacement.argtypes = [W.HWND, C.POINTER(Placement)]
        self.user.GetWindowThreadProcessId.argtypes = [W.HWND, C.POINTER(W.DWORD)]
        self.user.GetWindowTextW.argtypes = [W.HWND, W.LPWSTR, C.c_int]
        self.user.GetClassNameW.argtypes = [W.HWND, W.LPWSTR, C.c_int]
        self.user.ShowWindow.argtypes = [W.HWND, C.c_int]
        self.user.GetPropW.argtypes = [W.HWND, W.LPCWSTR]
        self.user.GetPropW.restype = W.HANDLE
        self.user.SetPropW.argtypes = [W.HWND, W.LPCWSTR, W.HANDLE]
        self.user.SetPropW.restype = W.BOOL
        self.kernel.OpenProcess.argtypes = [W.DWORD, W.BOOL, W.DWORD]
        self.kernel.OpenProcess.restype = W.HANDLE
        self.kernel.CloseHandle.argtypes = [W.HANDLE]
        self.kernel.GetProcessTimes.argtypes = [W.HANDLE, *([C.POINTER(W.FILETIME)] * 4)]
        self.kernel.QueryFullProcessImageNameW.argtypes = [W.HANDLE, W.DWORD, W.LPWSTR, C.POINTER(W.DWORD)]
        try:
            self.user.SetProcessDpiAwarenessContext(C.c_void_p(-4))
        except OSError:
            pass

    def identity(self, hwnd, create=True):
        hwnd = int(hwnd)
        if not self.user.IsWindow(hwnd):
            raise DesktopError("stale_target")
        pid = W.DWORD()
        self.user.GetWindowThreadProcessId(hwnd, C.byref(pid))
        if pid.value in self.excluded:
            raise DesktopError("excluded_window")
        process = self.kernel.OpenProcess(0x1000, False, pid.value)
        if not process:
            raise DesktopError("window_access_denied")
        try:
            instance = self.user.GetPropW(hwnd, INSTANCE_PROPERTY)
            if not instance:
                if not create:
                    raise DesktopError("stale_target")
                instance = secrets.randbits(63) or 1
                # Window properties disappear with the HWND instance, unlike process identity.
                if not self.user.SetPropW(hwnd, INSTANCE_PROPERTY, instance):
                    raise DesktopError("window_access_denied")
            creation, exit_time, kernel, user = (W.FILETIME() for _ in range(4))
            path, length = C.create_unicode_buffer(4096), W.DWORD(4096)
            if not self.kernel.GetProcessTimes(process, C.byref(creation), C.byref(exit_time), C.byref(kernel), C.byref(user)):
                raise DesktopError("window_access_denied")
            if not self.kernel.QueryFullProcessImageNameW(process, 0, path, C.byref(length)):
                raise DesktopError("window_access_denied")
            title, cls = C.create_unicode_buffer(4096), C.create_unicode_buffer(256)
            self.user.GetWindowTextW(hwnd, title, len(title))
            self.user.GetClassNameW(hwnd, cls, len(cls))
            placement = Placement()
            placement.length = C.sizeof(placement)
            if not self.user.GetWindowPlacement(hwnd, C.byref(placement)):
                raise DesktopError("stale_target")
            started = str((creation.dwHighDateTime << 32) | creation.dwLowDateTime)
            if self.user.GetPropW(hwnd, INSTANCE_PROPERTY) != instance:
                raise DesktopError("stale_target")
            fields = [str(hwnd), pid.value, started, cls.value, path.value.lower(), str(instance)]
            return {"id": hashlib.sha256(json.dumps(fields).encode()).hexdigest()[:32],
                    "hwnd": str(hwnd), "pid": pid.value, "started": started, "instance": str(instance), "className": cls.value,
                    "exe": path.value, "title": title.value, "hidden": not bool(self.user.IsWindowVisible(hwnd)),
                    "showCommand": placement.showCmd}
        finally:
            self.kernel.CloseHandle(process)

    def validate(self, target):
        actual = self.identity(target["hwnd"], create=False)
        if any(actual[key] != target[key] for key in ("id", "hwnd", "pid", "started", "instance", "className", "exe")):
            raise DesktopError("stale_target")
        return actual

    def handles(self):
        handles = []
        callback_type = C.WINFUNCTYPE(W.BOOL, W.HWND, W.LPARAM)
        callback = callback_type(lambda hwnd, _: handles.append(int(hwnd)) or True)
        self.user.EnumWindows.argtypes = [callback_type, W.LPARAM]
        if not self.user.EnumWindows(callback, 0):
            raise DesktopError("window_enumeration_failed")
        return handles

    def list(self):
        result = []
        for hwnd in self.handles():
            if not self.user.IsWindowVisible(hwnd):
                continue
            try:
                target = self.identity(hwnd)
                if target["title"] and target["className"] not in {"Progman", "WorkerW", "Shell_TrayWnd"}:
                    result.append(target)
            except DesktopError:
                continue
        return result

    def belongs(self, hwnd, root):
        hwnd, root = int(hwnd or 0), int(root)
        for _ in range(16):
            if not hwnd:
                return False
            if int(hwnd) == int(root):
                return True
            top = self.user.GetAncestor(hwnd, 2)
            hwnd = self.user.GetWindow(top or hwnd, 4)
        return False

    def track_hidden(self, windows):
        self.hidden_windows = {window["hwnd"]: window for window in windows}

    def related(self, target):
        root = self.validate(target)
        result = [root]
        for hwnd in self.handles():
            visible = bool(self.user.IsWindowVisible(hwnd))
            saved = self.hidden_windows.get(str(hwnd))
            if hwnd != int(root["hwnd"]) and (visible or saved) and self.belongs(hwnd, root["hwnd"]):
                try:
                    result.append(self.identity(hwnd) if visible else self.validate(saved))
                except DesktopError:
                    continue
        return result

    def hide(self, target):
        self.validate(target)
        self.user.ShowWindow(int(target["hwnd"]), 0)
        if self.user.IsWindowVisible(int(target["hwnd"])):
            raise DesktopError("window_control_failed")
        self.hidden_windows[target["hwnd"]] = target

    def restore(self, target):
        actual = self.validate(target)
        if target["hidden"] or not actual["hidden"]:
            self.hidden_windows.pop(target["hwnd"], None)
            return
        self.user.ShowWindow(int(target["hwnd"]), int(target["showCommand"]) or 4)
        if not self.user.IsWindowVisible(int(target["hwnd"])):
            raise DesktopError("restore_failed")
        self.hidden_windows.pop(target["hwnd"], None)

    def bounds(self, target):
        self.validate(target)
        rect = W.RECT()
        if not self.user.GetWindowRect(int(target["hwnd"]), C.byref(rect)):
            raise DesktopError("stale_target")
        return rect.left, rect.top, rect.right, rect.bottom

    def foreground(self, target):
        actual = self.validate(target)
        hwnd = int(actual["hwnd"])
        if actual["hidden"] or self.user.IsIconic(hwnd):
            raise DesktopError("needs_foreground")
        current = self.user.GetForegroundWindow()
        if self.belongs(current, hwnd) and self.user.IsWindowEnabled(current):
            return
        if not self.user.IsWindowEnabled(hwnd):
            raise DesktopError("needs_foreground")
        self.user.SetForegroundWindow(hwnd)
        self.check_foreground(target)

    def check_foreground(self, target):
        self.validate(target)
        if not self.belongs(self.user.GetForegroundWindow(), target["hwnd"]):
            raise DesktopError("needs_foreground")

    def check_point(self, target, x, y, expected=None):
        self.check_foreground(target)
        hit = self.user.WindowFromPoint(W.POINT(x, y))
        root = self.user.GetAncestor(hit, 2)
        expected = int(expected if expected is not None else target["hwnd"])
        if root != expected or not self.belongs(root, target["hwnd"]):
            raise DesktopError("target_occluded")

    def screenshot(self, target):
        from PIL import Image
        self.validate(target)
        hwnd = int(target["hwnd"])
        if self.user.IsIconic(hwnd):
            raise DesktopError("capture_unavailable")
        bounds = self.bounds(target)
        width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
        if not (0 < width <= 16384 and 0 < height <= 16384 and width * height <= 32_000_000):
            raise DesktopError("capture_unavailable")
        self.user.GetDC.argtypes = [W.HWND]
        self.user.GetDC.restype = W.HDC
        self.user.ReleaseDC.argtypes = [W.HWND, W.HDC]
        self.user.PrintWindow.argtypes = [W.HWND, W.HDC, W.UINT]
        self.gdi.CreateCompatibleDC.argtypes = [W.HDC]
        self.gdi.CreateCompatibleDC.restype = W.HDC
        self.gdi.CreateCompatibleBitmap.argtypes = [W.HDC, C.c_int, C.c_int]
        self.gdi.CreateCompatibleBitmap.restype = W.HBITMAP
        self.gdi.SelectObject.argtypes = [W.HDC, W.HGDIOBJ]
        self.gdi.SelectObject.restype = W.HGDIOBJ
        self.gdi.DeleteObject.argtypes = [W.HGDIOBJ]
        self.gdi.DeleteDC.argtypes = [W.HDC]
        self.gdi.GetDIBits.argtypes = [W.HDC, W.HBITMAP, W.UINT, W.UINT, C.c_void_p, C.POINTER(BitmapInfo), W.UINT]
        dc = self.user.GetDC(hwnd)
        memory = self.gdi.CreateCompatibleDC(dc)
        bitmap = self.gdi.CreateCompatibleBitmap(dc, width, height)
        previous = self.gdi.SelectObject(memory, bitmap)
        try:
            if not (dc and memory and bitmap) or not self.user.PrintWindow(hwnd, memory, 2):
                raise DesktopError("capture_unavailable")
            self.gdi.SelectObject(memory, previous)
            info = BitmapInfo(C.sizeof(BitmapInfo), width, -height, 1, 32, 0, 0, 0, 0, 0, 0)
            pixels = C.create_string_buffer(width * height * 4)
            if self.gdi.GetDIBits(dc, bitmap, 0, height, pixels, C.byref(info), 0) != height:
                raise DesktopError("capture_unavailable")
            image = Image.frombytes("RGB", (width, height), pixels.raw, "raw", "BGRX")
            if max(high for _, high in image.getextrema()) < 8:
                raise DesktopError("capture_unavailable")
            image.thumbnail((1600, 1600))
            buffer = io.BytesIO()
            image.save(buffer, "PNG")
            return buffer.getvalue(), bounds, image.size
        finally:
            if previous:
                self.gdi.SelectObject(memory, previous)
            if bitmap:
                self.gdi.DeleteObject(bitmap)
            if memory:
                self.gdi.DeleteDC(memory)
            if dc:
                self.user.ReleaseDC(hwnd, dc)
