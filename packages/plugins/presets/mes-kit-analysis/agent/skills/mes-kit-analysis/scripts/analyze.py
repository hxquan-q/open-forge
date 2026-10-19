# Copyright The Open Forge contributors.
"""MES 齐套快照分析：标准库、共享净供给台账、按期优先及失败关闭。"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Context, Decimal, InvalidOperation, ROUND_HALF_UP, localcontext
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from typing import Any


COVERAGE_KEYS = (
    "inventory", "production_demands", "subcontract_demands", "sales_demands",
    "purchase_supply", "production_supply", "subcontract_supply", "reservations",
    "units", "supply_dedup", "scope", "snapshot",
)
SOURCE_TYPES = {"stock", "purchase", "production", "subcontract", "srm", "inspection"}
TRANSIT_TYPES = {"purchase", "production", "subcontract"}
ZERO = Decimal("0")
POLICY = "按期优先，再补逾期缺口；全部需求共用净供给台账，按 need_at、priority、id 排序；同刻供给先于需求。"
BOUNDARY = "仅按计划快照判断物料截至计划完工是否可用，不是计划开工、产能或保证生产按期完工的验证。"
NUMBER = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?\Z")
TIMESTAMP = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}"
    r"(?::[0-9]{2}(?:\.[0-9]{1,6})?)?(?:Z|[+-][0-9]{2}:[0-9]{2})\Z"
)
CSP = (
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
    "img-src data:; font-src data:; connect-src 'none'; media-src 'none'; "
    "object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'"
)


def decimal_string(value: Decimal | None) -> str | None:
    if value is None:
        return None
    if value == ZERO:
        return "0"
    text = format(value, "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def timestamp_string(value: datetime | None) -> str | None:
    return value.astimezone(timezone.utc).isoformat() if value is not None else None


def rate(numerator: Decimal, denominator: Decimal | None) -> str | None:
    if denominator is None:
        return None
    # 已确认零数量没有缺口；零分母按 100% 展示，并不生成需求。
    value = Decimal("100") if denominator == ZERO else min(numerator / denominator, Decimal("1")) * 100
    return format(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), ".2f")


class Validation:
    def __init__(self, audit: dict[str, Any]):
        self.audit = audit
        self.numbers: list[Decimal] = []

    def block(self, message: str) -> None:
        if message not in self.audit["blockers"]:
            self.audit["blockers"].append(message)

    def warn(self, message: str) -> None:
        if message not in self.audit["warnings"]:
            self.audit["warnings"].append(message)

    def quantity(self, value: Any, label: str) -> Decimal | None:
        try:
            if not isinstance(value, str) or len(value) > 10000 or not NUMBER.fullmatch(value):
                raise ValueError
            result = Decimal(value)
            if not result.is_finite() or result < ZERO:
                raise ValueError
            # 限制展开长度，防止非法快照用极端指数耗尽内存。
            if len(value) > 10000 or abs(result.as_tuple().exponent) > 10000 or result.adjusted() > 10000:
                raise ValueError
        except (InvalidOperation, ValueError):
            self.block(f"{label} 必须是非负有限 Decimal 字符串（最多10000位或指数范围）。")
            return None
        self.numbers.append(result)
        return result

    def date(self, value: Any, label: str) -> datetime | None:
        try:
            if not isinstance(value, str) or not TIMESTAMP.fullmatch(value):
                raise ValueError
            result = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if result.tzinfo is None or result.utcoffset() is None:
                raise ValueError
            return result.astimezone(timezone.utc)
        except (ValueError, OverflowError):
            self.block(f"{label} 缺失或不是带时区的 ISO 时间。")
            return None

    def identifier(self, value: Any, label: str) -> bool:
        if not isinstance(value, str) or not value.strip():
            self.block(f"{label} 必须是非空字符串。")
            return False
        return True

    def rows(self, value: Any, label: str) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            self.block(f"{label} 必须是完整列表，不能缺失。")
            return []
        result = []
        for index, row in enumerate(value):
            if not isinstance(row, dict):
                self.block(f"{label}[{index}] 必须是对象。")
            else:
                result.append(row)
        return result

    def precision(self) -> int:
        whole = max((max(n.adjusted() + 1, 1) for n in self.numbers), default=1)
        fraction = max((max(-n.as_tuple().exponent, 0) for n in self.numbers), default=0)
        return max(50, whole + fraction + len(str(len(self.numbers) + 1)) + 16)


def _messages(value: Any, label: str, audit: dict[str, Any]) -> list[Any]:
    if isinstance(value, list):
        return deepcopy(value)
    audit["blockers"].append(f"{label} 必须是列表。")
    return []


def analyze(snapshot: dict[str, Any]) -> dict[str, Any]:
    """不读写文件、不修改输入；阻断时仍展示可校验的已知量，但全部判定 unknown。"""
    audit: dict[str, Any] = {"warnings": [], "blockers": [], "query_log": []}
    v = Validation(audit)
    if not isinstance(snapshot, dict):
        v.block("snapshot 必须是对象。")
        snapshot = {}
    raw_meta = snapshot.get("meta")
    meta = deepcopy(raw_meta) if isinstance(raw_meta, dict) else {}
    if not isinstance(raw_meta, dict):
        v.block("meta 缺失或不是对象。")
    raw_audit = snapshot.get("audit")
    if not isinstance(raw_audit, dict):
        v.block("audit 缺失或不是对象。")
        raw_audit = {}
    for key in ("warnings", "blockers", "query_log"):
        audit[key].extend(_messages(raw_audit.get(key, []), f"audit.{key}", audit))
    audit["warnings"].extend(_messages(meta.get("warnings", []), "meta.warnings", audit))
    v.warn(POLICY)
    v.warn(BOUNDARY)
    v.warn("supply_qty、在途及库存指标为共享净池上下文，不是逐工单保证量，不得跨工单再求和；实际分配以 ledger 为准。")
    v.warn("库存 qty 已为 free 净量；定向预留须作为独立 resource_key 的 lot 提供，仅履约所属需求，不再从 free 扣减或自动释放。")
    v.warn("stock_qty、reserved_qty 元字段须在提取阶段按真实库存分摊或仅计一次；不得在 free 与定向 lot 重复携带相同物理库存总量。")
    if meta.get("mode") not in ("demo", "live"):
        v.block("meta.mode 必须是 demo 或 live。")
    if meta.get("mode") == "demo":
        v.warn("demo 为输入快照演示，不代表已连接或验证真实 MES 数据。")
    if meta.get("allocation_policy") != "due_fifo_on_time_first":
        v.block("仅支持 allocation_policy=due_fifo_on_time_first。")
    coverage = meta.get("coverage")
    if not isinstance(coverage, dict):
        v.block("meta.coverage 缺失或不是对象。")
        coverage = {}
    for key in COVERAGE_KEYS:
        if coverage.get(key) is not True:
            if meta.get("mode") == "live" or key in ("scope", "snapshot"):
                v.block(f"coverage.{key} 未明确为 true，数据不足。")
            else:
                v.warn(f"演示快照 coverage.{key} 未确认，不能用于真实生产结论。")
    scope = meta.get("scope")
    if not isinstance(scope, dict):
        v.block("meta.scope 未确认。")
        scope = {}
    for key in ("organizations", "warehouses"):
        values = scope.get(key)
        if not isinstance(values, list) or not values or any(not isinstance(x, str) or not x.strip() for x in values):
            v.block(f"meta.scope.{key} 必须是明确的非空范围列表；空列表不视为全范围。")
    snapshot_at = v.date(meta.get("snapshot_at"), "meta.snapshot_at")
    horizon_end = v.date(meta.get("horizon_end"), "meta.horizon_end")
    if snapshot_at is not None and horizon_end is not None and horizon_end < snapshot_at:
        v.block("horizon_end 不能早于 snapshot_at，快照窗口无效。")
    alternatives = snapshot.get("alternatives", [])
    if not isinstance(alternatives, list) or alternatives:
        v.block("当前引擎不支持替代料；alternatives 非空或无效，禁止静默忽略。")

    orders = v.rows(snapshot.get("orders"), "orders")
    demands = v.rows(snapshot.get("demands"), "demands")
    supplies = v.rows(snapshot.get("supplies"), "supplies")
    counts: dict[str, Counter] = {}
    for label, rows, key in (("orders.id", orders, "id"), ("demands.id", demands, "id"),
                             ("supplies.id", supplies, "id"), ("supplies.resource_key", supplies, "resource_key")):
        counts[label] = Counter(row.get(key) for row in rows if isinstance(row.get(key), str))
        for identifier, count in sorted(counts[label].items()):
            if count > 1:
                v.block(f"{label} 重复：{identifier}；重复行不参与分配。")

    order_map: dict[str, dict[str, Any]] = {}
    parsed_orders = []
    for index, row in enumerate(orders):
        label = f"orders[{index}]"
        valid_id = v.identifier(row.get("id"), f"{label}.id")
        due = v.date(row.get("due_at"), f"{label}.due_at")
        planned_qty = v.quantity(row.get("planned_qty"), f"{label}.planned_qty")
        if row.get("approved") is not True:
            v.block(f"{label} 目标工单未审核。")
        if row.get("demand_state") not in ("present", "zero_confirmed", "missing"):
            v.block(f"{label}.demand_state 无效。")
        if row.get("demand_state") == "missing":
            v.block(f"{label} 用料清单缺失，不得视为零需求。")
        if due is not None and horizon_end is not None and due > horizon_end:
            v.block(f"{label} 计划完工晚于 horizon_end，窗口不足以作出结论。")
        item = {"raw": row, "due": due, "qty": planned_qty}
        parsed_orders.append(item)
        if valid_id and counts["orders.id"][row["id"]] == 1:
            order_map[row["id"]] = item
    target_ids = {row["id"] for row in orders if isinstance(row.get("id"), str)}

    units: dict[str, set[str]] = defaultdict(set)
    parsed_demands = []
    for index, row in enumerate(demands):
        label = f"demands[{index}]"
        valid = v.identifier(row.get("id"), f"{label}.id")
        valid &= v.identifier(row.get("order_id"), f"{label}.order_id")
        valid &= v.identifier(row.get("material_id"), f"{label}.material_id")
        valid &= v.identifier(row.get("unit"), f"{label}.unit")
        qty = v.quantity(row.get("qty"), f"{label}.qty")
        need = v.date(row.get("need_at"), f"{label}.need_at")
        priority = row.get("priority")
        if type(priority) is not int:
            v.block(f"{label}.priority 必须是整数，不能是布尔值或小数。")
            valid = False
        target = row.get("target")
        linked = isinstance(row.get("order_id"), str) and row["order_id"] in target_ids
        if type(target) is not bool or target != linked:
            v.block(f"{label}.target 与目标 orders 关联不一致（目标不存在或标记错误）。")
            valid = False
        order = order_map.get(row.get("order_id")) if isinstance(row.get("order_id"), str) else None
        if target is True:
            if order is None:
                v.block(f"{label} 对应的目标工单不存在或不唯一。")
                valid = False
            elif need is not None and order["due"] is not None and need != order["due"]:
                v.block(f"{label}.need_at 必须完全等于目标工单 due_at，不能以领料日期代替。")
                valid = False
        if isinstance(row.get("id"), str) and counts["demands.id"][row["id"]] > 1:
            valid = False
        if isinstance(row.get("material_id"), str) and isinstance(row.get("unit"), str):
            units[row["material_id"]].add(row["unit"])
        if need is not None and horizon_end is not None and need > horizon_end:
            valid = False
            v.warn(f"需求 {row.get('id')} 超出 horizon_end，不占用本窗口供给。")
        parsed_demands.append({"raw": row, "qty": qty, "need": need, "priority": priority,
                               "eligible": valid and qty is not None and need is not None,
                               "on_time": ZERO, "late": ZERO, "allocations": []})
    for item in parsed_orders:
        row = item["raw"]
        attached = [d for d in parsed_demands if d["raw"].get("order_id") == row.get("id")]
        if row.get("demand_state") == "present" and not attached:
            v.block(f"工单 {row.get('id')} 声明 present 但无用料行；只有 zero_confirmed 才能确认无需求。")
        if row.get("demand_state") == "zero_confirmed" and any(d["qty"] != ZERO for d in attached):
            v.block(f"工单 {row.get('id')} 声明 zero_confirmed 却含非零或未知用料数量。")

    parsed_supplies = []
    for index, row in enumerate(supplies):
        label = f"supplies[{index}]"
        valid = True
        for key in ("id", "resource_key", "material_id", "unit"):
            valid &= v.identifier(row.get(key), f"{label}.{key}")
        qty = v.quantity(row.get("qty"), f"{label}.qty")
        available = v.date(row.get("available_at"), f"{label}.available_at")
        source = row.get("source_type")
        if not isinstance(source, str) or source not in SOURCE_TYPES:
            v.block(f"{label}.source_type 不支持。")
            valid = False
        if type(row.get("conditional")) is not bool:
            v.block(f"{label}.conditional 必须是布尔值。")
            valid = False
        for key in ("source_order_id", "reserved_to_demand", "excluded_reason"):
            if row.get(key) is not None and not v.identifier(row[key], f"{label}.{key}"):
                valid = False
        reserved = row.get("reserved_to_demand")
        if reserved is not None and source != "stock":
            v.block(f"{label} 当前仅支持库存的独立定向预留 lot。")
            valid = False
        if isinstance(reserved, str) and reserved not in counts["demands.id"]:
            v.warn(f"供给 {row.get('id')} 预留需求不在快照；仍保持锁定，不能进入自由池。")
        gross = v.quantity(row["stock_qty"], f"{label}.stock_qty") if "stock_qty" in row else qty
        reserved_qty = v.quantity(row["reserved_qty"], f"{label}.reserved_qty") if "reserved_qty" in row else ZERO
        if source != "stock" and ("stock_qty" in row or "reserved_qty" in row):
            v.block(f"{label} 非库存供给不能携带库存数量元字段。")
            valid = False
        if isinstance(row.get("id"), str) and counts["supplies.id"][row["id"]] > 1:
            valid = False
        if isinstance(row.get("resource_key"), str) and counts["supplies.resource_key"][row["resource_key"]] > 1:
            valid = False
        if source == "stock" and available is not None and snapshot_at is not None and available != snapshot_at:
            v.block(f"{label} 库存 available_at 必须等于 snapshot_at，禁止推断历史库存。")
            valid = False
        if source != "stock" and available is not None and snapshot_at is not None and available < snapshot_at and not row.get("excluded_reason"):
            v.block(f"{label} 过期计划供给缺少 excluded_reason；应由提取阶段排除，不得推到当前或声称历史可用。")
            valid = False
        if isinstance(row.get("material_id"), str) and isinstance(row.get("unit"), str):
            units[row["material_id"]].add(row["unit"])
        if row.get("excluded_reason"):
            valid = False
            v.warn(f"供给 {row.get('id')} 已排除：{row['excluded_reason']}")
        if available is not None and horizon_end is not None and available > horizon_end:
            valid = False
            v.warn(f"供给 {row.get('id')} 晚于 horizon_end，已排除。")
        conditional = row.get("conditional") is True or source in ("production", "subcontract")
        if conditional:
            v.warn(f"供给 {row.get('id')} conditional=true：计划可得或其他条件性供给，上游未验证，不承诺生产按期完工。")
        parsed_supplies.append({"raw": row, "qty": qty, "remaining": qty, "available": available,
                                "gross": gross, "reserved_qty": reserved_qty, "conditional": conditional,
                                "eligible": valid and qty is not None and gross is not None and reserved_qty is not None and available is not None})
    bad_materials = set()
    for material_id, material_units in sorted(units.items()):
        if len(material_units) > 1:
            bad_materials.add(material_id)
            v.block(f"物料 {material_id} 单位不一致：{', '.join(sorted(material_units))}；不进行隐式单位换算。")
    for item in parsed_demands + parsed_supplies:
        material_id = item["raw"].get("material_id")
        if isinstance(material_id, str) and material_id in bad_materials:
            item["eligible"] = False
    if snapshot_at is None or horizon_end is None or horizon_end < snapshot_at:
        for item in parsed_demands + parsed_supplies:
            item["eligible"] = False
    with localcontext(Context(prec=v.precision(), rounding=ROUND_HALF_UP)):
        for supply in parsed_supplies:
            row = supply["raw"]
            if row.get("source_type") == "stock" and row.get("reserved_to_demand") is None:
                if supply["qty"] is not None and supply["gross"] is not None and supply["qty"] > supply["gross"]:
                    v.block(f"供给 {row.get('id')} free qty 大于 stock_qty。")
                    supply["eligible"] = False
                if "stock_qty" in row and "reserved_qty" in row and all(supply[k] is not None for k in ("qty", "gross", "reserved_qty")):
                    if supply["gross"] - supply["reserved_qty"] != supply["qty"]:
                        v.block(f"供给 {row.get('id')} 必须满足 qty=stock_qty-reserved_qty；qty 已为净量，不再扣预留。")
                        supply["eligible"] = False
        _allocate(parsed_demands, parsed_supplies)
        return _report(meta, orders, parsed_orders, parsed_demands, parsed_supplies, snapshot.get("supplies"), audit)


def _compatible(demand: dict[str, Any], supply: dict[str, Any]) -> bool:
    d, s = demand["raw"], supply["raw"]
    return (supply["eligible"] and s.get("material_id") == d.get("material_id")
            and s.get("unit") == d.get("unit")
            and (s.get("reserved_to_demand") is None or s["reserved_to_demand"] == d.get("id"))
            and (s.get("source_order_id") is None or s["source_order_id"] != d.get("order_id")))


def _allocate(demands: list[dict[str, Any]], supplies: list[dict[str, Any]]) -> None:
    sequence = sorted((d for d in demands if d["eligible"]),
                      key=lambda d: (d["need"], d["priority"], d["raw"]["id"]))
    pools: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for s in supplies:
        if s["eligible"]:
            pools[s["raw"]["material_id"]].append(s)
    for phase in ("on_time", "late"):
        for d in sequence:
            remaining = d["qty"] - d["on_time"] - d["late"]
            candidates = [s for s in pools.get(d["raw"]["material_id"], []) if _compatible(d, s)
                          and (s["available"] <= d["need"] if phase == "on_time" else s["available"] > d["need"])]
            # 自身定向预留优先，其余按可用时间、供给 id 稳定分配。
            candidates.sort(key=lambda s: (s["raw"].get("reserved_to_demand") is None, s["available"], s["raw"]["id"]))
            for s in candidates:
                if remaining == ZERO:
                    break
                used = min(remaining, s["remaining"])
                if used == ZERO:
                    continue
                s["remaining"] -= used
                remaining -= used
                d[phase] += used
                row = s["raw"]
                d["allocations"].append({"supply_id": row["id"], "source_type": row["source_type"],
                    "source_doc": row.get("source_doc"), "qty": decimal_string(used),
                    "available_at": timestamp_string(s["available"]),
                    "reserved": row.get("reserved_to_demand") is not None, "conditional": s["conditional"]})


def _ready(demand: dict[str, Any]) -> str | None:
    if demand["qty"] is None or demand["qty"] != demand["on_time"] + demand["late"]:
        return None
    return timestamp_string(max((datetime.fromisoformat(a["available_at"]) for a in demand["allocations"]), default=None))


def _status(demand: dict[str, Any], blocked: bool) -> str:
    if blocked:
        return "unknown"
    if demand["qty"] == ZERO:
        return "on_time"
    if demand["qty"] > demand["on_time"] + demand["late"]:
        return "shortage"
    return "late" if demand["late"] > ZERO else "on_time"


def _reason(status: str, blockers: list[Any], conditional: bool = False) -> str:
    reasons = {"on_time": "本快照下物料按期可用。", "late": "按期缺口可由窗口内晚到供给补齐。",
               "shortage": "本快照全窗口已知供给仍不足。", "no_demand": "已确认无需求。",
               "unknown": "数据不足或校验阻断；已知数量仅供审计，不得解读为确定齐套或缺料。"}
    text = reasons[status] + BOUNDARY
    if status == "unknown":
        text += "阻断：" + "；".join(str(b) for b in blockers)
    if conditional:
        text += "包含 conditional 计划供给，上游未验证，仅为条件性物料可用。"
    return text


def _report(meta: dict[str, Any], raw_orders: list[dict[str, Any]], orders: list[dict[str, Any]],
            demands: list[dict[str, Any]], supplies: list[dict[str, Any]], raw_supplies: Any,
            audit: dict[str, Any]) -> dict[str, Any]:
    blocked = bool(audit["blockers"])
    ledger = []
    material_lines: dict[int, dict[str, Any]] = {}
    for d in demands:
        row = d["raw"]
        qty = d["qty"]
        uncovered = qty - d["on_time"] - d["late"] if qty is not None else None
        status = _status(d, blocked)
        # unknown 时保留已知分配明细，但不输出确定性的齐套日期。
        ready = None if blocked else _ready(d)
        ledger.append({"demand_id": row.get("id"), "order_id": row.get("order_id"),
            "order_no": row.get("order_no"), "target": row.get("target"),
            "material_code": row.get("material_code"), "unit": row.get("unit"),
            "need_at": row.get("need_at"), "demand_qty": decimal_string(qty),
            "on_time_qty": decimal_string(d["on_time"]), "late_qty": decimal_string(d["late"]),
            "uncovered_qty": decimal_string(uncovered), "status": status,
            "reason": _reason(status, audit["blockers"], any(a["conditional"] for a in d["allocations"])),
            "allocations": deepcopy(d["allocations"])})
        usable = [s for s in supplies if _compatible(d, s)]
        stocks = [s for s in usable if s["raw"]["source_type"] == "stock"]
        own_stock = sum((Decimal(a["qty"]) for a in d["allocations"]
                         if a["source_type"] == "stock" and datetime.fromisoformat(a["available_at"]) <= d["need"]), ZERO) if d["need"] is not None else ZERO
        # 物理库存元字段按原始库存 lot 汇总；不把每工单的上下文再次跨工单相加。
        physical = [s for s in supplies if s["raw"].get("material_id") == row.get("material_id")
                    and s["raw"].get("source_type") == "stock" and s["eligible"]]
        gross = sum((s["gross"] for s in physical), ZERO)
        reserved = sum((s["reserved_qty"] for s in physical), ZERO)
        material_lines[id(d)] = {"demand_id": row.get("id"), "material_id": row.get("material_id"),
            "material_code": row.get("material_code"), "name": row.get("name"), "spec": row.get("spec"),
            "unit": row.get("unit"), "demand_qty": decimal_string(qty),
            "supply_qty": decimal_string(sum((s["qty"] for s in usable), ZERO)),
            "transit_qty": decimal_string(sum((s["qty"] for s in usable if s["raw"]["source_type"] in TRANSIT_TYPES), ZERO)),
            "pending_qty": decimal_string(sum((s["qty"] for s in usable if s["raw"]["source_type"] == "inspection"), ZERO)),
            "stock_qty": decimal_string(gross), "reserved_qty": decimal_string(reserved),
            "available_stock_qty": decimal_string(sum((s["qty"] for s in stocks), ZERO)),
            "shortage_qty": decimal_string(qty - d["on_time"] if qty is not None else None),
            "inventory_rate": rate(gross, qty), "available_inventory_rate": rate(own_stock, qty),
            "total_rate": rate(d["on_time"], qty), "on_time_qty": decimal_string(d["on_time"]),
            "late_qty": decimal_string(d["late"]), "uncovered_qty": decimal_string(uncovered),
            "ready_at": ready, "status": status,
            "reason": _reason(status, audit["blockers"], any(a["conditional"] for a in d["allocations"])),
            "allocations": deepcopy(d["allocations"])}
    output_orders = []
    for o in orders:
        row = o["raw"]
        attached = [d for d in demands if d["raw"].get("order_id") == row.get("id")]
        lines = [material_lines[id(d)] for d in attached]
        if blocked:
            status = "unknown"
        elif row.get("demand_state") == "zero_confirmed":
            status = "no_demand"
        elif any(m["status"] == "shortage" for m in lines):
            status = "shortage"
        elif any(m["status"] == "late" for m in lines):
            status = "late"
        else:
            status = "on_time"
        ready = timestamp_string(max((datetime.fromisoformat(m["ready_at"]) for m in lines if m["ready_at"] is not None), default=None)) if status in ("on_time", "late") else None
        output_orders.append({"id": row.get("id"), "no": row.get("no"), "product_name": row.get("product_name"),
            "planned_qty": decimal_string(o["qty"]), "due_at": row.get("due_at"), "status": status,
            "ready_at": ready, "reason": _reason(status, audit["blockers"],
                any(a["conditional"] for d in attached for a in d["allocations"])), "materials": lines})
    grouped: dict[str | None, list[dict[str, Any]]] = defaultdict(list)
    target_ids = {o.get("id") for o in raw_orders if isinstance(o.get("id"), str)}
    for d in demands:
        if d["raw"].get("target") is True or (isinstance(d["raw"].get("order_id"), str) and d["raw"]["order_id"] in target_ids):
            key = d["raw"].get("material_id")
            grouped[key if isinstance(key, str) else None].append(d)
    summaries = []
    for key in sorted(grouped, key=lambda x: (x is None, x or "")):
        group = grouped[key]
        row = group[0]["raw"]
        qty = sum((d["qty"] for d in group), ZERO) if all(d["qty"] is not None for d in group) else None
        on_time = sum((d["on_time"] for d in group), ZERO)
        late = sum((d["late"] for d in group), ZERO)
        summaries.append({"material_id": key, "material_code": row.get("material_code"), "name": row.get("name"),
            "spec": row.get("spec"), "unit": row.get("unit"), "demand_qty": decimal_string(qty),
            "on_time_qty": decimal_string(on_time), "late_qty": decimal_string(late),
            "uncovered_qty": decimal_string(qty - on_time - late if qty is not None else None),
            "order_count": len({d["raw"].get("order_id") for d in group if isinstance(d["raw"].get("order_id"), str)})})
    return {"meta": deepcopy(meta), "orders": output_orders, "materials": summaries,
            "ledger": ledger, "supplies": deepcopy(raw_supplies), "audit": audit}


class _OfflineTemplate(HTMLParser):
    """拒绝显式外部资源及刷新；CSP 再限制内联脚本的网络、资源与表单请求。"""
    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "meta" and (attributes.get("http-equiv") or "").lower() == "refresh":
            raise ValueError("模板不得包含 meta refresh。")
        for name, value in attrs:
            if name in {"src", "href", "action", "formaction", "poster", "data", "srcset", "ping"} and value:
                if not value.startswith(("#", "data:")):
                    raise ValueError(f"模板不得请求外部或本地资源：{tag}.{name}。")

    handle_startendtag = handle_starttag


def render_html(template: str, report: dict[str, Any]) -> str:
    if template.count("__REPORT_JSON__") != 1:
        raise ValueError("模板必须恰好包含一个 __REPORT_JSON__ 标记。")
    _OfflineTemplate().feed(template)
    payload = json.dumps(report, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    for character, escaped in (("&", "\\u0026"), ("<", "\\u003c"), (">", "\\u003e"),
                               ("\u2028", "\\u2028"), ("\u2029", "\\u2029")):
        payload = payload.replace(character, escaped)
    document = template.replace("__REPORT_JSON__", payload)
    policy = '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">'
    head = re.search(r"<head\b[^>]*>", document, re.IGNORECASE)
    if head:
        return document[:head.end()] + policy + document[head.end():]
    doctype = re.match(r"\s*<!doctype[^>]*>", document, re.IGNORECASE)
    position = doctype.end() if doctype else 0
    return document[:position] + policy + document[position:]


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"JSON 对象键重复：{key}")
        result[key] = value
    return result


def _invalid_constant(value: str) -> None:
    raise ValueError(f"JSON 不允许非有限常量：{value}")


def validate_paths(input_path: Path, template_path: Path, output_path: Path, html_path: Path) -> None:
    paths = [input_path, template_path, output_path, html_path]
    for index, left in enumerate(paths):
        for right in paths[index + 1:]:
            if left.resolve() == right.resolve() or (left.exists() and right.exists() and left.samefile(right)):
                raise ValueError("输入、模板、JSON 输出及 HTML 输出必须为不同文件，禁止覆盖输入或模板。")
    for path in (output_path, html_path):
        if not path.parent.is_dir():
            raise ValueError(f"输出父目录不存在，不自动创建：{path.parent}")
        if path.exists() and not path.is_file():
            raise ValueError(f"输出路径不是普通文件：{path}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MES 工单齐套离线快照分析（不连接数据库）。")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--html", required=True, type=Path)
    parser.epilog = "退出码：0=无阻断；1=已输出 unknown 阻断报告；2=输入、模板或输出失败。"
    args = parser.parse_args(argv)
    template_path = Path(__file__).resolve().parent.parent / "assets" / "dashboard.html"
    try:
        validate_paths(args.input, template_path, args.output, args.html)
        snapshot = json.loads(args.input.read_text(encoding="utf-8"),
                              object_pairs_hook=_unique_object, parse_constant=_invalid_constant)
        template = template_path.read_text(encoding="utf-8")
        report = analyze(snapshot)
        output = json.dumps(report, ensure_ascii=False, allow_nan=False, indent=2) + "\n"
        dashboard = render_html(template, report)
        args.output.write_text(output, encoding="utf-8")
        args.html.write_text(dashboard, encoding="utf-8")
    except (OSError, ValueError, TypeError, RecursionError) as error:
        parser.exit(2, f"分析失败：{error}\n")
    return 1 if report["audit"]["blockers"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
