# Copyright The Open Forge contributors.
import ctypes as C
from ctypes import wintypes as W
import hashlib
import io
import json
import secrets

INSTANCE_PROPERTY = "OpenForge.ComputerUse.WindowInstance.v1"


class DesktopError(Exception):
    pass


class Placement(C.Structure):
    _fields_ = [("length", W.UINT), ("flags", W.UINT), ("showCmd", W.UINT),
                ("minPosition", W.POINT), ("maxPosition", W.POINT), ("normalPosition", W.RECT)]


class Windows:
    def __init__(self):
        self.user = C.WinDLL("user32", use_last_error=True)
        self.kernel = C.WinDLL("kernel32", use_last_error=True)
        for name in ("IsWindow", "IsWindowVisible"):
            getattr(self.user, name).argtypes = [W.HWND]
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

    def restore(self, target):
        actual = self.validate(target)
        if target["hidden"] or not actual["hidden"]:
            return
        self.user.ShowWindow(int(target["hwnd"]), int(target["showCommand"]) or 4)
        if not self.user.IsWindowVisible(int(target["hwnd"])):
            raise DesktopError("restore_failed")

    def desktop_screenshot(self):
        from PIL import ImageGrab
        left, top = self.user.GetSystemMetrics(76), self.user.GetSystemMetrics(77)
        width, height = self.user.GetSystemMetrics(78), self.user.GetSystemMetrics(79)
        if not (0 < width <= 16384 and 0 < height <= 16384 and width * height <= 32_000_000):
            raise DesktopError("capture_unavailable")
        try:
            image = ImageGrab.grab(all_screens=True).convert("RGB")
        except OSError as error:
            raise DesktopError("capture_unavailable") from error
        if image.size != (width, height):
            raise DesktopError("capture_unavailable")
        image.thumbnail((1600, 1600))
        buffer = io.BytesIO()
        image.save(buffer, "PNG")
        return buffer.getvalue(), (left, top, left + width, top + height), image.size
