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
        self.imm = C.WinDLL("imm32", use_last_error=True)
        self.user.GetForegroundWindow.argtypes = []
        self.user.GetForegroundWindow.restype = W.HWND
        self.imm.ImmGetDefaultIMEWnd.argtypes = [W.HWND]
        self.imm.ImmGetDefaultIMEWnd.restype = W.HWND
        self.user.SendMessageTimeoutW.argtypes = [W.HWND, W.UINT, W.WPARAM, W.LPARAM, W.UINT, W.UINT, C.POINTER(C.c_size_t)]
        self.user.SendMessageTimeoutW.restype = W.LPARAM
        for name in ("IsWindow", "IsWindowVisible"):
            getattr(self.user, name).argtypes = [W.HWND]
        self.user.GetWindowPlacement.argtypes = [W.HWND, C.POINTER(Placement)]
        self.user.GetWindowThreadProcessId.argtypes = [W.HWND, C.POINTER(W.DWORD)]
        self.user.GetWindowThreadProcessId.restype = W.DWORD
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

    def window_title(self, hwnd):
        title = C.create_unicode_buffer(4096)
        self.user.GetWindowTextW(hwnd, title, len(title))
        return title.value

    def process_exe(self, process):
        path, length = C.create_unicode_buffer(4096), W.DWORD(4096)
        if not self.kernel.QueryFullProcessImageNameW(process, 0, path, C.byref(length)):
            raise DesktopError("window_access_denied")
        return path.value

    def default_ime_status(self, hwnd):
        # ImmGetContext cannot read another process's HIMC. Query its thread's
        # default IME window instead, without hanging on an unresponsive app.
        ime_window = self.imm.ImmGetDefaultIMEWnd(hwnd)
        if not ime_window:
            return "unknown"
        opened = C.c_size_t()
        # WM_IME_CONTROL / IMC_GETOPENSTATUS; SMTO_ABORTIFHUNG | SMTO_ERRORONEXIT.
        replied = self.user.SendMessageTimeoutW(ime_window, 0x0283, 0x0005, 0, 0x0022, 100, C.byref(opened))
        return ("open" if opened.value else "closed") if replied else "unknown"

    def foreground_status(self):
        unknown = {"hwnd": None, "title": None, "exe": None, "ime": "unknown"}
        try:
            hwnd = self.user.GetForegroundWindow()
            if not hwnd:
                return unknown
            status = {**unknown, "hwnd": str(hwnd), "title": self.window_title(hwnd)}
            pid = W.DWORD()
            thread = self.user.GetWindowThreadProcessId(hwnd, C.byref(pid))
            if thread:
                try:
                    process = self.kernel.OpenProcess(0x1000, False, pid.value)
                    if process:
                        try:
                            status["exe"] = self.process_exe(process)
                        finally:
                            self.kernel.CloseHandle(process)
                except (OSError, DesktopError):
                    pass  # Diagnostic access denial must not fail an already completed input.
                try:
                    status["ime"] = self.default_ime_status(hwnd)
                except OSError:
                    pass
            # A focus switch during the query must not attach the old IME to a new foreground.
            return status if self.user.GetForegroundWindow() == hwnd else unknown
        except OSError:
            return unknown

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
            if not self.kernel.GetProcessTimes(process, C.byref(creation), C.byref(exit_time), C.byref(kernel), C.byref(user)):
                raise DesktopError("window_access_denied")
            path = self.process_exe(process)
            title, cls = self.window_title(hwnd), C.create_unicode_buffer(256)
            self.user.GetClassNameW(hwnd, cls, len(cls))
            placement = Placement()
            placement.length = C.sizeof(placement)
            if not self.user.GetWindowPlacement(hwnd, C.byref(placement)):
                raise DesktopError("stale_target")
            started = str((creation.dwHighDateTime << 32) | creation.dwLowDateTime)
            if self.user.GetPropW(hwnd, INSTANCE_PROPERTY) != instance:
                raise DesktopError("stale_target")
            fields = [str(hwnd), pid.value, started, cls.value, path.lower(), str(instance)]
            return {"id": hashlib.sha256(json.dumps(fields).encode()).hexdigest()[:32],
                    "hwnd": str(hwnd), "pid": pid.value, "started": started, "instance": str(instance), "className": cls.value,
                    "exe": path, "title": title, "hidden": not bool(self.user.IsWindowVisible(hwnd)),
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
