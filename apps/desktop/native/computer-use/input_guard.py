# Copyright The Open Forge contributors.
import ctypes as C
from ctypes import wintypes as W
import threading
from windows import DesktopError


class UserInputGuard:
    def __init__(self, windows, target, physical, cancelled):
        self.windows, self.target, self.physical, self.cancelled = windows, target, physical, cancelled
        self.ready = threading.Event()
        self.thread_id = 0
        self.failure = None
        self.thread = threading.Thread(target=self._watch, daemon=True)

    def __enter__(self):
        self.thread.start()
        if not self.ready.wait(5) or self.failure:
            self.__exit__(None, None, None)
            raise DesktopError("input_guard_failed")
        return self

    def check(self):
        if self.cancelled.is_set():
            raise DesktopError("user_takeover" if self.failure == "user_takeover" else "cancelled")
        self.windows.validate(self.target)
        if self.physical:
            self.windows.check_foreground(self.target)

    def _watch(self):
        user = C.WinDLL("user32", use_last_error=True)
        kernel = C.WinDLL("kernel32", use_last_error=True)
        callback_type = C.WINFUNCTYPE(C.c_ssize_t, C.c_int, W.WPARAM, W.LPARAM)
        user.SetWindowsHookExW.argtypes = [C.c_int, callback_type, W.HINSTANCE, W.DWORD]
        user.SetWindowsHookExW.restype = W.HHOOK
        user.CallNextHookEx.argtypes = [W.HHOOK, C.c_int, W.WPARAM, W.LPARAM]
        user.CallNextHookEx.restype = C.c_ssize_t
        user.UnhookWindowsHookEx.argtypes = [W.HHOOK]
        user.GetMessageW.argtypes = [C.POINTER(W.MSG), W.HWND, W.UINT, W.UINT]
        hooks = []

        class Mouse(C.Structure):
            _fields_ = [("point", W.POINT), ("data", W.DWORD), ("flags", W.DWORD), ("time", W.DWORD), ("extra", C.c_size_t)]

        class Keyboard(C.Structure):
            _fields_ = [("vk", W.DWORD), ("scan", W.DWORD), ("flags", W.DWORD), ("time", W.DWORD), ("extra", C.c_size_t)]

        def event(kind, code, message, pointer):
            if code >= 0:
                data = C.cast(pointer, C.POINTER(Mouse if kind == "mouse" else Keyboard)).contents
                injected = data.flags & (1 if kind == "mouse" else 0x10)
                if not injected:
                    hwnd = self.windows.user.WindowFromPoint(data.point) if kind == "mouse" else self.windows.user.GetForegroundWindow()
                    if self.physical or self.windows.belongs(hwnd, self.target["hwnd"]):
                        self.failure = "user_takeover"
                        self.cancelled.set()
            return user.CallNextHookEx(None, code, message, pointer)

        mouse = callback_type(lambda code, message, pointer: event("mouse", code, message, pointer))
        keyboard = callback_type(lambda code, message, pointer: event("keyboard", code, message, pointer))
        try:
            self.thread_id = kernel.GetCurrentThreadId()
            message = W.MSG()
            user.PeekMessageW(C.byref(message), None, 0, 0, 0)
            for kind, callback in ((14, mouse), (13, keyboard)):
                hook = user.SetWindowsHookExW(kind, callback, None, 0)
                if not hook:
                    raise C.WinError(C.get_last_error())
                hooks.append(hook)
            self.ready.set()
            while user.GetMessageW(C.byref(message), None, 0, 0) > 0:
                user.TranslateMessage(C.byref(message))
                user.DispatchMessageW(C.byref(message))
        except OSError:
            self.failure = "input_guard_failed"
            self.cancelled.set()
            self.ready.set()
        finally:
            for hook in hooks:
                user.UnhookWindowsHookEx(hook)

    def __exit__(self, *_):
        if self.thread_id:
            C.WinDLL("user32").PostThreadMessageW(self.thread_id, 0x12, 0, 0)
        self.thread.join(timeout=5)
        if self.thread.is_alive():
            raise DesktopError("input_guard_failed")
