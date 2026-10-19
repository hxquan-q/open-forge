# Copyright The Open Forge contributors.
"""AS数据库(asd_ai_mes) 齐套快照构建 —— 提取阶段产物（不连接数据库）。

上游：dbx MCP 对 `AS数据库`(mysql 110.41.20.224:3306/asd_ai_mes) 的只读查询，SQL 见同目录 extract.sql。
本脚本把已经落地的提取结果（下方常量表，逐行可回溯到 SQL 行）装配成引擎输入快照：

  snapshot-live.json  真实口径：范围=已审核父项工单中计划完工日期明确的全部 16 张；coverage 按实际覆盖诚实标注
  snapshot-demo.json  可判定子集：范围=既有计划完工日期又有用料清单的 7 张；coverage 缺失降级为警告

提取口径（均为显式假设，未在 SKILL.md 定稿前不得默默使用）：
  R1 需求数量 = 用料清单 busunissueqty（未领数量）；需求时间 = 工单 plan_end_date；
     目标需求 need_at 必须等于该工单 due_at（引擎硬校验）。
  R2 日期型字段（DATE）按当日 00:00 (+08:00) 作为时点；数据库时区为 +08:00（SELECT NOW()/TIMEDIFF 实测）。
  R3 单位解析：用料清单/工单 unit 为纯数字时经 t_unit 映射为 unit_code（490=Pcs）；按物料维度取任一可解析值；
     仍无法解析的物料（244857）整体退出快照并计入 coverage.units=false。
  R4 供给：库存取 t_base_material.stock_qty（库内无独立即时库存表，全库仅 15 个物料该字段>0）；
     采购在途 = 未入库数量(quantity-received_qty-inbound_occupied_qty) 且承诺日期明确；
     生产在途 = 已审核工单 (quantity-stocked_qty) 且计划完工日期明确。
  R5 过期承诺（available_at < snapshot_at）的计划供给必须带 excluded_reason 排除，不得推为当前可用。
  R6 竞争需求（非目标工单的同料需求）= 全部未删除用料清单行中 busunissueqty>0 且其工单 plan_end_date 明确者；
     目标需求 priority=0，非目标需求 priority=10（目标工单优先占用净池）。
  R7 无计划完工日期的工单无法定时 → 不作为目标，其用料行也不能进入竞争需求（计入 coverage 降级）。
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

SNAPSHOT_AT = "2026-10-10T16:49:30+08:00"          # SELECT NOW() → 2026-10-10 16:49:30 (+08)
HORIZON_END = "2026-11-30T23:59:59+08:00"
UNIT_BY_ID = {"490": "Pcs"}                          # t_unit: id=490 unit_code=Pcs unit_name=Pcs
UNRESOLVED_UNIT_MATERIALS = ("244857",)              # 用料清单与物料主数据均无单位

# ---------------------------------------------------------------- 物料（提取行：t_base_material + 用料清单单位解析）
MATERIALS = {
    "9022":   ("110101000002",   "RFR42-20CT72701A",                "BeO连片 4.7*2.9*0.38mm 42Ω 20W 114A 厚膜未镀"),
    "9014":   ("110101000006",   "RFR50-100CT46803A-J",             "BeO单片 3*6.35*0.635mm50Ω 100W 86C 厚膜未镀 电极Au 普军"),
    "9017":   ("110101000009",   "RFR50-10CT0307B",                 "BeO单片 5*2.5*1mm 50Ω 10W 04C-7-B 厚膜镀Ni+Ag"),
    "244861": ("2XP0000001",     "粉料/2XP000045C",                  ""),
    "244856": ("2XP000048E",     "气缸-精加件/2XP000048E",            ""),
    "244857": ("2XP000048F",     "缸盖-精加件/2XP000048F",            ""),
    "8398":   ("1.05.001",       "单机头0015（批号）",                ""),
    "8399":   ("1.05.001.0007",  "主板0035（批号）",                  ""),
}
UNIT = {"9022": "Pcs", "9014": "Pcs", "9017": "Pcs", "8398": "Pcs", "8399": "Pcs",
        "244861": "个", "244856": "个", "244857": None}

# ---------------------------------------------------------------- 目标工单（t_prod_order，deleted=0 AND audit_status='APPROVED' AND order_type='父项'）
# (id, order_no, product_name, planned_qty, plan_end_date, org_id, 用料清单行数)
ORDERS = [
    ("9894", "TEST-011026090001-1",  "RFR42-20CT72501A",              "100",  "2026-09-22", "1004", 3),
    ("9885", "MO-20260920001",       "气缸-精加件/2XP000048E",         "500",  "2026-09-23", "1",    0),
    ("9899", "WO20260923",           "成套气缸产品/（缸+盖）2XP000049EF", "100", "2026-09-23", "1003", 2),
    ("9896", "MO-1-2XP000048E-A",    "气缸-精加件/2XP000048E",         "100",  "2026-09-24", "1",    1),
    ("9975", "MO000045-1",           "B-005智能手机（批号+序列号）",     "40",   "2026-09-26", "1021", 2),
    ("9897", "2XP000048E-B",         "气缸-精加件/2XP000048E",         "200",  "2026-09-28", "1",    1),
    ("9977", "2XP000048E-09",        "气缸-精加件/2XP000048E",         "100",  "2026-09-29", "1",    0),
    ("5491", "WO-MAN-20260911-001",  "M3平板电脑（批号+序列号）",        "100",  "2026-09-30", "1",    0),
    ("5476", "WO-DEMO-20260909-006", "主板（批号）",                   "100",  "2026-09-30", "1",    0),
    ("5477", "WO-DEMO-20260909-007", "M3平板电脑（批号+序列号）",        "100",  "2026-09-30", "1",    0),
    ("5478", "WO-DEMO-20260910-001", "底壳组件",                      "100",  "2026-09-30", "1",    0),
    ("9882", "MO-1-2XP000048E",      "气缸-精加件/2XP000048E",         "5000", "2026-09-30", "1",    0),
    ("9978", "2XP000048E-10",        "气缸-精加件/2XP000048E",         "1000", "2026-09-30", "1",    1),
    ("9883", "MO-2-2XP000048F",      "缸盖-精加件/2XP000048F",         "8000", "2026-09-30", "1",    0),
    ("9900", "WO20260924",           "成套气缸产品/（缸+盖）2XP000049EF", "100", "2026-09-30", "6",    2),
    ("9983", "2XP000048E -1009",     "气缸-精加件/2XP000048E",         "100",  "2026-10-16", "1",    0),
]
DEMO_TARGET_IDS = ("9894", "9899", "9896", "9975", "9897", "9978", "9900")   # 有完工日期且有用料清单

# ---------------------------------------------------------------- 目标需求（t_material_usage_detail → 未领数量 busunissueqty）
# (demand_id, order_id, material_id, qty)
TARGET_DEMANDS = [
    ("D-16544", "9894", "9022",   "108"),
    ("D-16545", "9894", "9014",   "108"),
    ("D-16546", "9894", "9017",   "109"),
    ("D-16825", "9975", "8398",   "0"),
    ("D-16826", "9975", "8399",   "0"),
    ("D-16547", "9897", "244861", "0"),
    ("D-16548", "9896", "244861", "0"),
    ("D-16549", "9899", "244856", "0"),
    ("D-16550", "9899", "244857", "0"),
    ("D-16551", "9900", "244856", "0"),
    ("D-16552", "9900", "244857", "0"),
    ("D-16827", "9978", "244861", "0"),
]

# ---------------------------------------------------------------- 竞争需求（其他工单同料未领>0，且有明确需求时间）
# (demand_id, order_id, order_no, material_id, qty, plan_end_date)
COMPETING_DEMANDS = [
    ("C-9913", "9913", "MO000023-3", "8399", "5",   "2018-01-06"),
    ("C-9911", "9911", "MO000023-1", "8399", "10",  "2018-01-11"),
    ("C-9912", "9912", "MO000023-2", "8399", "10",  "2018-01-11"),
    ("C-9910", "9910", "MO000017-1", "8398", "5",   "2018-01-12"),
    ("C-9923", "9923", "MO000028-1", "8398", "10",  "2018-02-03"),
    ("C-9922", "9922", "MO000027-1", "8398", "10",  "2018-02-12"),
    ("C-9935", "9935", "MO000041-1", "8399", "300", "2026-10-10"),
    ("C-9937", "9937", "MO000043-1", "8398", "300", "2026-10-12"),
]

# ---------------------------------------------------------------- 供给
# 库存：8 个范围物料的 t_base_material.stock_qty 全为 0 → 无库存行（coverage.inventory=true 仍成立：已全量读取）
# 采购在途：承诺日期已过期，必须带 excluded_reason（R5）
# (id, material_id, qty, available_at, source_doc, source_order_id, reserved_to_demand, conditional, excluded_reason)
SUPPLIES = [
    ("PO-12548", "8398", "20", "2026-09-24T00:00:00+08:00", "CGDD000026", None, None, False,
     "采购承诺日期 2026-09-24 早于快照时间，未确认到货；提取阶段排除，不推为当前可用"),
    ("PO-12549", "8399", "10", "2026-09-24T00:00:00+08:00", "CGDD000027", None, None, False,
     "采购承诺日期 2026-09-24 早于快照时间，未确认到货；提取阶段排除，不推为当前可用"),
    ("MO-9983",  "244856", "100", "2026-10-16T00:00:00+08:00", None, "9983", None, True, None),
]
CONDITIONAL_NOTE = "计划产出的可行性未由上游验证（conditional）"

WARNINGS_COMMON = [
    "口径：需求=用料清单未领数量(busunissueqty)，需求时间=工单计划完工日期；日期型字段按当日 00:00(+08:00) 取时点。",
    "供给范围：库存=t_base_material.stock_qty；采购在途=已承诺且未入库；生产在途=已审核工单待入库(quantity-stocked_qty)。",
    "竞争需求：全部未删除用料清单中未领>0 且工单计划完工日期明确的行，非目标需求 priority=10，目标需求 priority=0。",
]
WARNINGS_GAP = {
    "production_supply": "生产在途覆盖不完整：范围内物料的已审核产出工单多数缺计划完工日期（如 244856 有 20 张已审核工单无日期），无法计入窗口。",
    "units": "物料 244857 在物料主数据与全部用料清单中均无单位，按不隐式换算原则整体退出快照（相关需求行已剔除）。",
    "reservations": "拣货占用(t_picking_order_source)范围内物料存在 24 行占用登记，本期未建模为定向预留；范围物料账面库存为 0，未进入分配。",
}
BLOCKER_QUALITY = [
    "未审核(PENDING_AUDIT)工单的用料需求与计划产出不计入本快照（仅已审核工单口径）。",
    "已完成的工序检验单(t_qms_inspection_bill)不属于待检来料，未计入待检供给。",
]


def ts(date_text: str) -> str:
    return f"{date_text}T00:00:00+08:00"


def material_row(material_id: str) -> dict:
    code, name, spec = MATERIALS[material_id]
    return {"material_id": material_id, "material_code": code, "name": name, "spec": spec,
            "unit": UNIT[material_id]}


def build(target_ids: tuple[str, ...], mode: str, coverage_gaps: tuple[str, ...]) -> dict:
    orders = [row for row in ORDERS if row[0] in target_ids]
    order_ids = {row[0] for row in orders}
    warnings = list(WARNINGS_COMMON)
    coverage = {key: True for key in (
        "inventory", "production_demands", "subcontract_demands", "sales_demands",
        "purchase_supply", "production_supply", "subcontract_supply", "reservations",
        "units", "supply_dedup", "scope", "snapshot")}
    for gap in coverage_gaps:
        coverage[gap] = False
        warnings.append(WARNINGS_GAP[gap])
    warnings.extend(BLOCKER_QUALITY)

    snapshot_orders, snapshot_demands = [], []
    for order_id, order_no, product_name, qty, due, _org, header_rows in orders:
        attached = [d for d in TARGET_DEMANDS if d[1] == order_id and UNIT[d[2]] is not None]
        if header_rows == 0:
            state = "missing"
            warnings.append(f"工单 {order_no} 无生产用料清单：按引擎口径不得视为零需求，结论必然阻断。")
        elif not attached:
            state = "missing"
            warnings.append(f"工单 {order_no} 的用料行全部因单位无法解析被剔除，视同用料清单缺失。")
        else:
            state = "present"
        snapshot_orders.append({"id": order_id, "no": order_no, "product_name": product_name,
                                "planned_qty": qty, "due_at": ts(due), "approved": True,
                                "demand_state": state})
        for demand_id, _oid, material_id, demand_qty in attached:
            snapshot_demands.append({"id": demand_id, "order_id": order_id, "order_no": order_no,
                                     "target": True, **material_row(material_id),
                                     "qty": demand_qty, "need_at": ts(due), "priority": 0})
    for demand_id, order_id, order_no, material_id, demand_qty, due in COMPETING_DEMANDS:
        if UNIT[material_id] is None:
            continue
        snapshot_demands.append({"id": demand_id, "order_id": order_id, "order_no": order_no,
                                 "target": False, **material_row(material_id),
                                 "qty": demand_qty, "need_at": ts(due), "priority": 10})
    supplies = []
    for supply_id, material_id, qty, available_at, doc, source_order, reserved, conditional, excluded in SUPPLIES:
        if UNIT[material_id] is None:
            continue
        supplies.append({"id": supply_id, "resource_key": f"{material_id}:{supply_id}",
                         **material_row(material_id), "qty": qty, "source_type":
                         "purchase" if supply_id.startswith("PO-") else "production",
                         "source_doc": doc, "available_at": available_at,
                         "source_order_id": source_order, "reserved_to_demand": reserved,
                         "conditional": conditional, "excluded_reason": excluded})
    return {
        "meta": {"mode": mode, "snapshot_at": SNAPSHOT_AT, "horizon_end": HORIZON_END,
                 "allocation_policy": "due_fifo_on_time_first",
                 "scope": {"organizations": sorted({row[5] for row in orders}),
                           "warehouses": ["仓库维度未细分（库存数量取自 t_base_material.stock_qty，未分仓）"]},
                 "coverage": coverage, "warnings": warnings},
        "orders": snapshot_orders, "demands": snapshot_demands, "supplies": supplies,
        "alternatives": [],
        "audit": {"blockers": [],
                  "warnings": [CONDITIONAL_NOTE],
                  "query_log": [{"source": "dbx MCP / AS数据库 / asd_ai_mes", "sql_file": "extract.sql",
                                 "orders": len(snapshot_orders), "demands": len(snapshot_demands),
                                 "supplies": len(supplies)}]},
    }


def main() -> None:
    live = build(tuple(row[0] for row in ORDERS), "live", tuple(WARNINGS_GAP))
    demo = build(DEMO_TARGET_IDS, "demo", tuple(WARNINGS_GAP))
    for name, data in (("snapshot-live.json", live), ("snapshot-demo.json", demo)):
        path = HERE / name
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{name}: orders={len(data['orders'])} demands={len(data['demands'])} supplies={len(data['supplies'])}")


if __name__ == "__main__":
    main()
