# Derived from WinHands 0.4.1 (MIT), Copyright (c) 2026 Rodolfo Obreque.
# Modified by The Open Forge contributors: restricted primitive surface.
import ctypes, time
from ctypes import wintypes as W
_u32 = ctypes.WinDLL('user32', use_last_error=True)
try:
    _u32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
except Exception:
    pass

class MOUSEINPUT(ctypes.Structure):
    _fields_ = [('dx', W.LONG), ('dy', W.LONG), ('mouseData', W.DWORD), ('dwFlags', W.DWORD), ('time', W.DWORD), ('dwExtraInfo', ctypes.c_size_t)]

class KEYBDINPUT(ctypes.Structure):
    _fields_ = [('wVk', W.WORD), ('wScan', W.WORD), ('dwFlags', W.DWORD), ('time', W.DWORD), ('dwExtraInfo', ctypes.c_size_t)]

class _U(ctypes.Union):
    _fields_ = [('mi', MOUSEINPUT), ('ki', KEYBDINPUT)]

class INPUT(ctypes.Structure):
    _fields_ = [('type', W.DWORD), ('u', _U)]
assert ctypes.sizeof(INPUT) == (40 if ctypes.sizeof(ctypes.c_void_p) == 8 else 28)
_u32.SendInput.argtypes = (W.UINT, ctypes.POINTER(INPUT), ctypes.c_int)
_u32.SendInput.restype = W.UINT
SCAN = {'esc': 1, 'escape': 1, '-': 12, '=': 13, 'backspace': 14, 'back': 14, 'tab': 15, '[': 26, ']': 27, 'enter': 28, 'return': 28, 'ctrl': 29, 'lctrl': 29, ';': 39, "'": 40, '`': 41, 'shift': 42, 'lshift': 42, '\\': 43, ',': 51, '.': 52, '/': 53, 'rshift': 54, 'alt': 56, 'lalt': 56, 'space': 57, 'capslock': 58, 'numlock': 69, 'scrolllock': 70, 'f11': 87, 'f12': 88, 'rctrl': 57373, 'ralt': 57400, 'altgr': 57400, 'win': 57435, 'lwin': 57435, 'rwin': 57436, 'apps': 57437, 'up': 57416, 'down': 57424, 'left': 57419, 'right': 57421, 'home': 57415, 'end': 57423, 'pgup': 57417, 'pgdn': 57425, 'ins': 57426, 'insert': 57426, 'del': 57427, 'delete': 57427, **{f'f{i}': 58 + i for i in range(1, 11)}, **dict(zip('1234567890', range(2, 12))), **dict(zip('qwertyuiop', range(16, 26))), **dict(zip('asdfghjkl', range(30, 39))), **dict(zip('zxcvbnm', range(44, 51)))}
BTN = {'left': (2, 4), 'right': (8, 16), 'middle': (32, 64)}
TAP = 0.04
check = None
held = set()
last = [0.0]
last_at = [None]
guard = None
on_move = None
on_click = None

def _norm(p, w):
    """Absolute coordinate normalization aimed at the pixel centre (hits every pixel)."""
    return (p * 65536 + 32768) // w

def scan_of(k):
    """Key name / char / raw scan code -> Set-1 scan code (layout-aware for other chars)."""
    if isinstance(k, int):
        return k
    s = SCAN.get(k.lower())
    if s is not None:
        return s
    if len(k) == 1:
        vk = _u32.VkKeyScanW(ord(k)) & 255
        s = _u32.MapVirtualKeyW(vk, 0) if vk != 255 else 0
        if s:
            return s
    raise ValueError(f'unknown key {k!r}')

def combo(spec):
    """'ctrl+shift+s' -> [scan, ...] in press order."""
    return [scan_of(p) for p in spec.split('+')] if isinstance(spec, str) else [scan_of(spec)]

def key_input(scan, up=False):
    flags = 8 | (1 if scan > 255 else 0) | (2 if up else 0)
    return INPUT(1, _U(ki=KEYBDINPUT(0, scan & 255, flags, 0, 0)))

def mouse_input(dx=0, dy=0, flags=0, data=0):
    return INPUT(0, _U(mi=MOUSEINPUT(dx, dy, data & 4294967295, flags, 0, 0)))

def touch():
    """Before any real input or focus steal: yield to a busy user (guard), then mark the moment."""
    if guard:
        guard()
    last[0] = time.monotonic()

def send(*inputs):
    """Atomic batch. Input into elevated windows is silently dropped by UIPI (not reported)."""
    touch()
    _raw(*inputs)
    last_at[0] = None if any((i.type == 1 for i in inputs)) else _cursor()

def _cursor():
    p = W.POINT()
    return (p.x, p.y) if _u32.GetCursorPos(ctypes.byref(p)) else None

def _raw(*inputs):
    n = len(inputs)
    if _u32.SendInput(n, (INPUT * n)(*inputs), ctypes.sizeof(INPUT)) != n:
        raise ctypes.WinError(ctypes.get_last_error())

def sleep(secs):
    """Sleep in small chunks so the kill switch / user interrupt can abort."""
    end = time.monotonic() + secs
    while True:
        if check:
            check()
        left = end - time.monotonic()
        if left <= 0:
            return
        time.sleep(min(left, 0.02))

def key_down(k):
    s = scan_of(k)
    send(key_input(s))
    held.add(('key', s))

def key_up(k):
    s = scan_of(k)
    send(key_input(s, up=True))
    held.discard(('key', s))

def press(spec, times=1, hold=TAP, gap=TAP):
    """press('ctrl+shift+s'), press('space', times=3). Holds each tap `hold` s (games poll)."""
    scans = combo(spec)
    for i in range(times):
        try:
            for s in scans:
                key_down(s)
            sleep(hold)
        finally:
            for s in reversed(scans):
                key_up(s)
        if i < times - 1:
            sleep(gap)

def _virtual():
    g = _u32.GetSystemMetrics
    return (g(76), g(77), g(78), g(79))

def move(x, y):
    """Absolute move to physical virtual-desktop pixel (monitor left of primary => negative x)."""
    vx, vy, vw, vh = _virtual()
    send(mouse_input(_norm(round(x) - vx, vw), _norm(round(y) - vy, vh), 1 | 16384 | 32768))
    if on_move:
        on_move(round(x), round(y))

def mouse_down(btn='left'):
    send(mouse_input(flags=BTN[btn][0]))
    held.add(('btn', btn))
    if on_click:
        on_click(btn)

def mouse_up(btn='left'):
    send(mouse_input(flags=BTN[btn][1]))
    held.discard(('btn', btn))

def click_at(x, y, btn='left', count=1, hold=0.03):
    """Real click at screen px (count=2 double click)."""
    move(x, y)
    for i in range(count):
        mouse_down(btn)
        try:
            sleep(hold)
        finally:
            mouse_up(btn)
        if i < count - 1:
            sleep(0.05)

def wheel(clicks):
    """Vertical wheel at the cursor: +up/away, -down/toward you."""
    send(mouse_input(flags=2048, data=120 * clicks))
