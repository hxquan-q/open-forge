# Derived from WinHands 0.4.1 (MIT), Copyright (c) 2026 Rodolfo Obreque.
# Modified by The Open Forge contributors: restricted primitive surface.
import ctypes, os, re, time
from . import inputs
MAX_NAME = 60
INTERACTIVE = {'button', 'check box', 'combo box', 'edit', 'hyperlink', 'list item', 'menu item', 'radio button', 'slider', 'spinner', 'tab item', 'tree item', 'data item', 'split button', 'document', 'header item'}
DROP = {'scroll bar', 'thumb', 'separator', 'tool tip'}
CANVAS_ROLES = {'pane', 'custom', 'image', 'document', 'group'}
CONTAINERS = {'pane', 'tool bar', 'tab', 'group', 'custom', 'menu bar', 'status bar', 'title bar', 'list', 'tree', 'table', 'header', 'window'}
SHELL_HOSTS = {'shellexperiencehost.exe', 'startmenuexperiencehost.exe', 'searchhost.exe'}

class StaleTarget(Exception):
    """The element changed or disappeared since the snapshot: observe again."""

def role_name(control_type_name):
    """'MenuItemControl' -> 'menu item'."""
    return re.sub('(?<!^)(?=[A-Z])', ' ', control_type_name.replace('Control', '')).lower()

def _clip(s, n=MAX_NAME):
    s = ' '.join(str(s).split())
    return s if len(s) <= n else s[:n] + '…'

def _is_text_leaf(n):
    return n['role'] == 'text' and (not n['children'])

def _prune_list(children, win_area):
    out = []
    for c in children:
        for k in prune(c, win_area):
            if out and _is_text_leaf(k) and _is_text_leaf(out[-1]) and (len(out[-1]['name']) < 180):
                out[-1]['name'] += ' · ' + k['name']
            else:
                out.append(k)
    return out

def prune(node, win_area):
    """-> list of nodes replacing `node` (0 = dropped, children = flattened)."""
    if node['role'] in DROP:
        return []
    node = {**node, 'children': _prune_list(node['children'], win_area)}
    if node['role'] in CONTAINERS:
        node['value'], node['settable'] = ('', False)
        if len(node['children']) == 1 and node['role'] not in ('window', 'list', 'tree', 'table'):
            return node['children']
    has_kids = bool(node['children'])
    if not node['enabled'] and (not node['name']) and (not node['value']) and (not has_kids):
        return []
    x0, y0, x1, y1 = node['rect']
    if node['role'] in CANVAS_ROLES and (not has_kids) and ((x1 - x0) * (y1 - y0) >= 0.2 * win_area):
        return [{**node, 'canvas': True}]
    descriptive = node['name'] or node['value'] or node['role'] in INTERACTIVE or node['focused']
    if descriptive:
        return [node]
    return node['children']

def collapse_lists(node, max_items=25):
    """Fold list/grid item cells into the item line; cap long lists with a summary."""
    kids = [collapse_lists(c, max_items) for c in node['children']]
    items = [c for c in kids if c['role'] in ('list item', 'data item')]
    for it in items:
        extra = []
        for d in flatten(it)[1:]:
            t = d['value'] or d['name']
            if t and t != it['name'] and (t not in extra):
                extra.append(t)
        it['extra'], it['children'] = (extra, [])
    capped = items or [c for c in kids if c['role'] == 'tree item']
    node = {**node, 'children': kids}
    if len(capped) > max_items:
        drop = {id(c) for c in capped[max_items:]}
        node['children'] = [c for c in kids if id(c) not in drop]
        node['more'] = (max_items, len(capped))
    return node

def flatten(node):
    out = [node]
    for c in node['children']:
        out += flatten(c)
    return out

def node_line(i, n):
    s = f"{i} {n['role']}"
    if n['name']:
        s += f''' "{_clip(n['name'], 200 if n['role'] == 'text' else MAX_NAME)}"'''
    if n['value'] and n['value'] != n['name']:
        s += f''' Value: "{_clip(n['value'])}"'''
    if n.get('extra'):
        s += ' · ' + ' · '.join((_clip(e, 30) for e in n['extra'][:4]))
    st = []
    if n['focused']:
        st.append('focused')
    if not n['enabled']:
        st.append('disabled')
    if n.get('selected'):
        st.append('selected')
    if n.get('checked'):
        st.append({'on': 'checked', 'off': 'unchecked', 'mixed': 'mixed'}[n['checked']])
    if n.get('expanded') is not None:
        st.append('expanded' if n['expanded'] else 'collapsed')
    if n.get('settable'):
        st.append('settable')
    if n.get('scrollable'):
        st.append('scrollable')
    if n.get('canvas'):
        st.append('canvas')
    return s + (f" ({', '.join(st)})" if st else '')

class Registry:
    """Small ids that stay stable across snapshots; tracks the ids of each window's latest snapshot.
    Identity = (RuntimeId, role, name): MSAA-proxied UIs (Win32 ribbons) reuse RuntimeIds for other
    elements after re-layout, and some elements get a fresh RuntimeId each snapshot (paired back
    to their old id by role+name)."""

    def __init__(self):
        self.ids, self.key_of, self.rec, self.current, self.snap = ({}, {}, {}, {}, {})
        self._next = 1

    @staticmethod
    def _key(n):
        return (n['rid'], n['role'], n['name'])

    def id_of(self, n):
        return self.ids[self._key(n)]

    def assign(self, hwnd, flat):
        prev = self.snap.get(hwnd, {})
        keys = {self._key(n) for n in flat}
        gone = {}
        for i, sig in prev.items():
            if self.key_of.get(i) not in keys:
                gone.setdefault(sig, []).append(i)
        cur, snap = (set(), {})
        for n in flat:
            k, sig = (self._key(n), (n['role'], n['name']))
            i = self.ids.get(k)
            if i is None or i in cur:
                i = gone[sig].pop(0) if gone.get(sig) else self._new()
                self.ids[k] = i
            self.key_of[i], self.rec[i] = (k, {**n, 'hwnd': hwnd})
            cur.add(i)
            snap[i] = sig
        self.current[hwnd], self.snap[hwnd] = (cur, snap)

    def _new(self):
        self._next += 1
        return self._next - 1

    def lines(self, flat):
        return {self.id_of(n): node_line(self.id_of(n), n) for n in flat}

def render(node, reg, depth=0):
    lines = ['  ' * depth + node_line(reg.id_of(node), node)]
    for c in node['children']:
        lines.append(render(c, reg, depth + 1))
    if node.get('more'):
        shown, total = node['more']
        lines.append('  ' * (depth + 1) + f'(showing 1-{shown} of {total}; use find())')
    return '\n'.join(lines)

def stale_reason(rec, live, need_rect=False):
    if live is None:
        return 'element gone'
    if live['role'] != rec['role']:
        return f"role changed ({rec['role']} -> {live['role']})"
    if live['name'] != rec['name']:
        return f"name changed ({rec['name']!r} -> {live['name']!r})"
    if need_rect and any((abs(a - b) > 4 for a, b in zip(rec['rect'], live['rect']))):
        return 'moved'
    return None
P_RID, P_RECT, P_PID, P_TYPE, P_NAME, P_FOCUS, P_ENABLED, P_CLASS = (30000, 30001, 30002, 30003, 30005, 30008, 30010, 30012)
P_INVOKE, P_EXPAND_OK, P_SCROLL_OK, P_SEL_OK, P_TOGGLE_OK, P_VALUE_OK = (30031, 30028, 30034, 30036, 30041, 30043)
P_VALUE, P_READONLY, P_EXPAND, P_SELECTED, P_TOGGLE = (30045, 30046, 30070, 30079, 30086)
_u32 = ctypes.windll.user32

class Desk:

    def __init__(self, deny=()):
        import uiautomation as auto
        from uiautomation.uiautomation import _AutomationClient
        self.auto, self.deny = (auto, [d.lower() for d in deny])
        self.reg = Registry()
        self.last = {}
        self.flat = {}
        self.canvas = {}
        self.win = None
        self.before = set()
        self.hidden = set()
        self.confirmed = False
        self.stop = lambda: None
        self.ct = dict(auto.ControlTypeNames)
        ia = _AutomationClient.instance().IUIAutomation
        cr = ia.CreateCacheRequest()
        for pid in (P_RID, P_RECT, P_PID, P_TYPE, P_NAME, P_FOCUS, P_ENABLED, P_CLASS, P_INVOKE, P_EXPAND_OK, P_SCROLL_OK, P_SEL_OK, P_TOGGLE_OK, P_VALUE_OK, P_VALUE, P_READONLY, P_EXPAND, P_SELECTED, P_TOGGLE):
            cr.AddProperty(pid)
        cr.TreeScope = 7
        cr.TreeFilter = ia.CreateAndCondition(ia.ControlViewCondition, ia.CreatePropertyCondition(30022, False))
        self.cr = cr

    @staticmethod
    def _v(e, pid, default):
        try:
            v = e.GetCachedPropertyValue(pid)
        except Exception:
            return default
        return v if isinstance(v, (bool, int, float, str, tuple)) else default

    def _node(self, e):
        r = e.CachedBoundingRectangle
        v = lambda pid, d=None: self._v(e, pid, d)
        exp = v(P_EXPAND) if v(P_EXPAND_OK, False) else None
        tog = v(P_TOGGLE) if v(P_TOGGLE_OK, False) else None
        sel = v(P_SELECTED) if v(P_SEL_OK, False) else None
        val = v(P_VALUE, '') if v(P_VALUE_OK, False) else ''
        rid = v(P_RID, None)
        return {'rid': tuple(rid) if rid else (id(e),), 'role': role_name(self.ct.get(e.CachedControlType, 'CustomControl')), 'name': e.CachedName or '', 'value': str(val or ''), 'rect': (r.left, r.top, r.right, r.bottom), 'focused': bool(e.CachedHasKeyboardFocus), 'enabled': bool(e.CachedIsEnabled), 'selected': bool(sel) if sel is not None else None, 'checked': {0: 'off', 1: 'on', 2: 'mixed'}.get(tog), 'expanded': {0: False, 1: True, 2: True}.get(exp), 'settable': bool(v(P_VALUE_OK, False)) and (not v(P_READONLY, True)), 'scrollable': bool(v(P_SCROLL_OK, False)), 'invoke': bool(v(P_INVOKE, False)), 'cls': e.CachedClassName or '', 'el': e, 'children': []}

    def _walk(self, e):
        n = self._node(e)
        kids = e.GetCachedChildren()
        if kids:
            n['children'] = [self._walk(kids.GetElement(i)) for i in range(kids.Length)]
        return n

    def _tree(self, w):
        raw = self._walk(w.Element.BuildUpdatedCache(self.cr))
        x0, y0, x1, y1 = raw['rect']
        raw['children'] = _prune_list(raw['children'], max(1, (x1 - x0) * (y1 - y0)))
        return collapse_lists(raw)

    def _rec(self, i):
        rec = self.reg.rec.get(i)
        if rec is None:
            raise StaleTarget(f'unknown id {i}; observe first')
        if i not in self.reg.current.get(rec['hwnd'], ()):
            raise StaleTarget(f'id {i} is not in the latest snapshot; observe again')
        return rec

    def _live(self, rec):
        e = rec['el']
        try:
            r = e.CurrentBoundingRectangle
            return {'role': role_name(self.ct.get(e.CurrentControlType, 'CustomControl')), 'name': e.CurrentName or '', 'rect': (r.left, r.top, r.right, r.bottom)}
        except Exception:
            return None

    def _checked(self, i, need_rect=False):
        rec = self._rec(i)
        live = self._live(rec)
        why = stale_reason(rec, live, need_rect)
        if why:
            raise StaleTarget(f'id {i} {why}; observe again')
        return (rec, live)

    def _ctl(self, rec):
        return self.auto.Control.CreateControlFromElement(rec['el'])
