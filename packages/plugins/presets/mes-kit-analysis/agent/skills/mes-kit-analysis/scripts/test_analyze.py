# Copyright The Open Forge contributors.
"""全部测试使用内存或 mock；直接运行及 unittest 均禁用字节码文件。"""

import sys
sys.dont_write_bytecode = True

from contextlib import redirect_stderr
from copy import deepcopy
from decimal import Decimal, Inexact, ROUND_DOWN, localcontext
from io import StringIO
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import analyze as engine


SNAPSHOT = "2026-10-01T00:00:00+00:00"
DUE = "2026-10-05T00:00:00+00:00"
LATER = "2026-10-07T00:00:00+00:00"
HORIZON = "2026-10-10T00:00:00+00:00"


def order(identifier="o1", due=DUE, state="present"):
    return {"id": identifier, "no": identifier.upper(), "product_name": "产品",
            "planned_qty": "1", "due_at": due, "approved": True, "demand_state": state}


def demand(identifier="d1", order_id="o1", qty="10", need=DUE, target=True, priority=0):
    return {"id": identifier, "order_id": order_id, "order_no": order_id.upper(), "target": target,
            "material_id": "m1", "material_code": "M001", "name": "物料", "spec": "规格",
            "unit": "件", "qty": qty, "need_at": need, "priority": priority}


def supply(identifier="s1", qty="10", source="stock", available=SNAPSHOT, **extra):
    row = {"id": identifier, "resource_key": "resource:" + identifier, "material_id": "m1",
           "material_code": "M001", "name": "物料", "unit": "件", "qty": qty,
           "source_type": source, "source_doc": identifier.upper(), "available_at": available,
           "source_order_id": None, "reserved_to_demand": None, "conditional": False,
           "excluded_reason": None}
    row.update(extra)
    return row


def snapshot(qty="10", supplies=None):
    return {"meta": {"mode": "live", "snapshot_at": SNAPSHOT, "horizon_end": HORIZON,
                     "scope": {"organizations": ["org1"], "warehouses": ["wh1"]},
                     "allocation_policy": "due_fifo_on_time_first",
                     "coverage": {key: True for key in engine.COVERAGE_KEYS}, "warnings": []},
            "orders": [order()], "demands": [demand(qty=qty)],
            "supplies": [supply()] if supplies is None else supplies,
            "alternatives": [], "audit": {"blockers": [], "warnings": [], "query_log": []}}


class AnalyzeTests(unittest.TestCase):
    def material(self, report):
        return report["orders"][0]["materials"][0]

    def assert_blocked(self, report, fragment=None):
        self.assertTrue(report["audit"]["blockers"])
        self.assertTrue(all(o["status"] == "unknown" and o["ready_at"] is None for o in report["orders"]))
        self.assertTrue(all(d["status"] == "unknown" for d in report["ledger"]))
        if fragment:
            self.assertIn(fragment, " ".join(str(x) for x in report["audit"]["blockers"]))

    def test_stock_shortage(self):
        report = engine.analyze(snapshot(supplies=[supply(qty="4")]))
        m = self.material(report)
        self.assertEqual(report["orders"][0]["status"], "shortage")
        self.assertEqual((m["on_time_qty"], m["shortage_qty"], m["uncovered_qty"]), ("4", "6", "6"))
        self.assertEqual((m["inventory_rate"], m["available_inventory_rate"], m["total_rate"]), ("40.00", "40.00", "40.00"))
        self.assertIsNone(report["orders"][0]["ready_at"])

    def test_purchase_on_due_timestamp(self):
        report = engine.analyze(snapshot(supplies=[supply(source="purchase", available=DUE)]))
        self.assertFalse(report["audit"]["blockers"])
        self.assertEqual(report["orders"][0]["status"], "on_time")
        self.assertEqual(self.material(report)["transit_qty"], "10")
        self.assertEqual(report["orders"][0]["ready_at"], DUE)

    def test_late_quantity_and_ready_date(self):
        report = engine.analyze(snapshot(supplies=[supply(qty="3"), supply("s2", "7", "purchase", LATER)]))
        m = self.material(report)
        self.assertEqual(report["orders"][0]["status"], "late")
        self.assertEqual((m["on_time_qty"], m["late_qty"], m["shortage_qty"], m["uncovered_qty"]), ("3", "7", "7", "0"))
        self.assertEqual(m["ready_at"], LATER)

    def test_competing_other_production_subcontract_and_sales(self):
        data = snapshot(supplies=[supply(qty="10")])
        data["demands"] += [demand("production", "other-prod", "2", SNAPSHOT, False),
                            demand("subcontract", "other-sub", "3", SNAPSHOT, False),
                            demand("sales", "sale", "4", SNAPSHOT, False)]
        report = engine.analyze(data)
        self.assertEqual(self.material(report)["on_time_qty"], "1")
        self.assertEqual(sum(Decimal(d["on_time_qty"]) for d in report["ledger"]), Decimal("10"))
        self.assertEqual(report["materials"][0]["demand_qty"], "10")

    def test_multiple_targets_share_pool_without_context_sum(self):
        data = snapshot(supplies=[supply(qty="15")])
        data["orders"].append(order("o2"))
        data["demands"].append(demand("d2", "o2"))
        report = engine.analyze(data)
        self.assertEqual([o["status"] for o in report["orders"]], ["on_time", "shortage"])
        self.assertEqual([o["materials"][0]["on_time_qty"] for o in report["orders"]], ["10", "5"])
        self.assertEqual([o["materials"][0]["supply_qty"] for o in report["orders"]], ["15", "15"])
        self.assertEqual(report["materials"][0]["on_time_qty"], "15")
        self.assertEqual(report["materials"][0]["order_count"], 2)

    def test_own_reserved_lot_first_no_double_deduction(self):
        data = snapshot(qty="8", supplies=[supply("free", "5", stock_qty="10", reserved_qty="5"),
                                          supply("own", "5", reserved_to_demand="d1", stock_qty="0", reserved_qty="0")])
        data["orders"].append(order("o2"))
        data["demands"].append(demand("d2", "o2", "2"))
        report = engine.analyze(data)
        self.assertFalse(report["audit"]["blockers"])
        m = self.material(report)
        self.assertEqual([a["supply_id"] for a in m["allocations"]], ["own", "free"])
        self.assertEqual([a["qty"] for a in m["allocations"]], ["5", "3"])
        self.assertEqual((m["available_stock_qty"], m["stock_qty"], m["reserved_qty"]), ("10", "10", "5"))
        self.assertEqual(report["orders"][1]["materials"][0]["on_time_qty"], "2")
        self.assertTrue(m["allocations"][0]["reserved"])

    def test_foreign_reserved_lot_locked(self):
        data = snapshot(qty="8", supplies=[supply("free", "3", stock_qty="8", reserved_qty="5"),
                                          supply("foreign", "5", reserved_to_demand="absent", stock_qty="0", reserved_qty="0")])
        report = engine.analyze(data)
        self.assertFalse(report["audit"]["blockers"])
        m = self.material(report)
        self.assertEqual((m["on_time_qty"], m["available_stock_qty"], m["stock_qty"]), ("3", "3", "8"))
        self.assertEqual(m["inventory_rate"], "100.00")
        self.assertEqual(m["available_inventory_rate"], "37.50")

    def test_lot_conservation_across_both_passes(self):
        data = snapshot(qty="2.7", supplies=[supply("s1", "1.1"), supply("s2", "2.9", "purchase", LATER)])
        data["orders"].append(order("o2", LATER))
        data["demands"].append(demand("d2", "o2", "1.8", LATER))
        report = engine.analyze(data)
        used = {}
        for row in report["ledger"]:
            for a in row["allocations"]:
                used[a["supply_id"]] = used.get(a["supply_id"], Decimal("0")) + Decimal(a["qty"])
            self.assertEqual(Decimal(row["demand_qty"]), Decimal(row["on_time_qty"]) + Decimal(row["late_qty"]) + Decimal(row["uncovered_qty"]))
        for row in data["supplies"]:
            self.assertLessEqual(used.get(row["id"], Decimal("0")), Decimal(row["qty"]))

    def test_self_production_supply_forbidden_and_upstream_conditional(self):
        data = snapshot(supplies=[supply("self", "10", "production", DUE, source_order_id="o1")])
        report = engine.analyze(data)
        self.assertEqual(self.material(report)["allocations"], [])
        self.assertEqual(report["orders"][0]["status"], "shortage")
        data["supplies"][0]["source_order_id"] = "upstream"
        report = engine.analyze(data)
        self.assertEqual(report["orders"][0]["status"], "on_time")
        self.assertTrue(self.material(report)["allocations"][0]["conditional"])
        self.assertFalse(report["supplies"][0]["conditional"])
        self.assertIn("上游未验证", report["orders"][0]["reason"])
        data["supplies"][0]["source_type"] = "subcontract"
        self.assertTrue(self.material(engine.analyze(data))["allocations"][0]["conditional"])

    def test_duplicate_supply_id_or_resource_blocks_and_does_not_multiply(self):
        for key in ("id", "resource_key"):
            with self.subTest(key=key):
                data = snapshot(supplies=[supply("s1", "5"), supply("s2", "5")])
                data["supplies"][1][key] = data["supplies"][0][key]
                report = engine.analyze(data)
                self.assert_blocked(report, "重复")
                self.assertEqual(self.material(report)["on_time_qty"], "0")

    def test_duplicate_demand_or_order_blocks(self):
        for section in ("demands", "orders"):
            with self.subTest(section=section):
                data = snapshot()
                data[section].append(deepcopy(data[section][0]))
                self.assert_blocked(engine.analyze(data), "重复")

    def test_zero_confirmed_only_no_demand(self):
        data = snapshot()
        data["orders"][0]["demand_state"] = "zero_confirmed"
        data["demands"] = []
        report = engine.analyze(data)
        self.assertEqual(report["orders"][0]["status"], "no_demand")
        self.assertIsNone(report["orders"][0]["ready_at"])
        data["orders"][0]["demand_state"] = "present"
        self.assert_blocked(engine.analyze(data), "无用料行")
        data["orders"][0]["demand_state"] = "missing"
        self.assert_blocked(engine.analyze(data), "缺失")
        data = snapshot(qty="0", supplies=[])
        self.assertEqual(engine.analyze(data)["orders"][0]["status"], "on_time")
        data["orders"][0]["demand_state"] = "zero_confirmed"
        self.assertEqual(engine.analyze(data)["orders"][0]["status"], "no_demand")
        data["demands"][0]["qty"] = "1"
        self.assert_blocked(engine.analyze(data), "zero_confirmed")

    def test_missing_and_naive_dates_block(self):
        fields = (("meta", "snapshot_at"), ("meta", "horizon_end"), ("orders", "due_at"),
                  ("demands", "need_at"), ("supplies", "available_at"))
        for section, field in fields:
            for value in (None, "2026-10-05T00:00:00", "2026-10-05"):
                with self.subTest(section=section, field=field, value=value):
                    data = snapshot()
                    row = data[section] if section == "meta" else data[section][0]
                    row[field] = value
                    self.assert_blocked(engine.analyze(data), "ISO")

    def test_target_need_equals_order_due_as_instant(self):
        data = snapshot()
        data["demands"][0]["need_at"] = "2026-10-05T08:00:00+08:00"
        self.assertFalse(engine.analyze(data)["audit"]["blockers"])
        data["demands"][0]["need_at"] = SNAPSHOT
        self.assert_blocked(engine.analyze(data), "完全等于")

    def test_every_live_coverage_key_must_be_true(self):
        for key in engine.COVERAGE_KEYS:
            for value in (False, None, 1, "true"):
                with self.subTest(key=key, value=value):
                    data = snapshot()
                    data["meta"]["coverage"][key] = value
                    report = engine.analyze(data)
                    self.assert_blocked(report, "coverage." + key)
                    self.assertEqual(self.material(report)["on_time_qty"], "10")
        data = snapshot()
        del data["meta"]["coverage"]["inventory"]
        self.assert_blocked(engine.analyze(data), "coverage.inventory")

    def test_scope_and_snapshot_unconfirmed_even_demo_block(self):
        for key in ("scope", "snapshot"):
            data = snapshot()
            data["meta"]["mode"] = "demo"
            data["meta"]["coverage"][key] = False
            self.assert_blocked(engine.analyze(data), "coverage." + key)
        for key in ("organizations", "warehouses"):
            data = snapshot()
            data["meta"]["scope"][key] = []
            self.assert_blocked(engine.analyze(data), "scope." + key)

    def test_invalid_decimal_does_not_silently_become_zero(self):
        for value in ("NaN", "Infinity", "-1", "1,000", " 1", "bad", "1_0", 1.25, 1, None, "1e10001"):
            with self.subTest(value=value):
                data = snapshot()
                data["demands"][0]["qty"] = value
                report = engine.analyze(data)
                self.assert_blocked(report, "Decimal")
                self.assertIsNone(self.material(report)["demand_qty"])
                self.assertIsNone(self.material(report)["uncovered_qty"])
                self.assertIsNone(report["materials"][0]["demand_qty"])
                for section, field in (("orders", "planned_qty"), ("supplies", "qty"),
                                       ("supplies", "stock_qty"), ("supplies", "reserved_qty")):
                    data = snapshot()
                    data[section][0][field] = value
                    self.assert_blocked(engine.analyze(data), "Decimal")

    def test_exact_decimal_independent_of_global_context(self):
        data = snapshot(qty="10000000000000000000000000000.00000000000000000001",
                        supplies=[supply(qty="10000000000000000000000000000"),
                                  supply("s2", "0.00000000000000000001")])
        with localcontext() as context:
            context.prec = 6
            report = engine.analyze(data)
        m = self.material(report)
        self.assertEqual(m["on_time_qty"], data["demands"][0]["qty"])
        self.assertEqual(m["uncovered_qty"], "0")
        self.assertEqual(m["total_rate"], "100.00")
        report = engine.analyze(snapshot(qty="0.3", supplies=[supply(qty="0.1"), supply("s2", "0.2")]))
        self.assertEqual(self.material(report)["on_time_qty"], "0.3")

    def test_global_decimal_traps_rounding_and_exponents_do_not_affect_engine(self):
        data = snapshot(qty="3", supplies=[supply(qty="1")])
        expected = engine.analyze(data)
        with localcontext() as context:
            context.prec = 2
            context.rounding = ROUND_DOWN
            context.traps[Inexact] = True
            context.Emax = 2
            context.Emin = -2
            self.assertEqual(engine.analyze(data), expected)
        self.assertEqual(self.material(expected)["total_rate"], "33.33")

    def test_microsecond_ready_dates_compare_chronologically(self):
        at_whole = DUE
        at_fraction = "2026-10-05T00:00:00.000001+00:00"
        data = snapshot(supplies=[supply("whole", "5", "purchase", at_whole),
                                  supply("fraction", "5", "purchase", at_fraction)])
        report = engine.analyze(data)
        self.assertEqual(report["orders"][0]["ready_at"], at_fraction)
        self.assertEqual((self.material(report)["on_time_qty"], self.material(report)["late_qty"]), ("5", "5"))
        data = snapshot()
        data["meta"]["snapshot_at"] = at_fraction
        data["supplies"][0]["available_at"] = at_fraction
        report = engine.analyze(data)
        self.assertEqual(self.material(report)["available_inventory_rate"], "0.00")
        self.assertEqual(report["orders"][0]["status"], "late")

    def test_unit_mismatch_blocks_without_conversion(self):
        data = snapshot()
        data["supplies"][0]["unit"] = "箱"
        report = engine.analyze(data)
        self.assert_blocked(report, "单位不一致")
        self.assertEqual(self.material(report)["on_time_qty"], "0")

    def test_current_stock_cannot_satisfy_past_due_on_time(self):
        data = snapshot()
        historical_due = "2026-09-30T00:00:00+00:00"
        data["orders"][0]["due_at"] = historical_due
        data["demands"][0]["need_at"] = historical_due
        report = engine.analyze(data)
        self.assertEqual(report["orders"][0]["status"], "late")
        self.assertEqual((self.material(report)["on_time_qty"], self.material(report)["late_qty"]), ("0", "10"))
        data["supplies"][0]["available_at"] = historical_due
        self.assert_blocked(engine.analyze(data), "库存 available_at")

    def test_late_pass_cannot_steal_later_on_time_supply(self):
        data = snapshot(supplies=[supply("future", "10", "purchase", LATER)])
        data["demands"].append(demand("early", "competitor", "10", DUE, False, -1))
        data["orders"][0]["due_at"] = LATER
        data["demands"][0]["need_at"] = LATER
        report = engine.analyze(data)
        self.assertEqual(report["orders"][0]["status"], "on_time")
        competitor = next(d for d in report["ledger"] if d["demand_id"] == "early")
        self.assertEqual((competitor["on_time_qty"], competitor["late_qty"], competitor["uncovered_qty"]), ("0", "0", "10"))
        self.assertIn("按期优先，再补逾期缺口", " ".join(report["audit"]["warnings"]))

    def test_priority_then_stable_id_and_input_order_independent(self):
        data = snapshot(supplies=[supply(qty="10")])
        data["orders"] += [order("o2"), order("o3")]
        data["demands"] = [demand("z", "o1", "5", priority=0), demand("a", "o2", "5", priority=0),
                           demand("b", "o3", "5", priority=-1)]
        report = engine.analyze(data)
        self.assertEqual({d["demand_id"]: d["on_time_qty"] for d in report["ledger"]}, {"z": "0", "a": "5", "b": "5"})
        data["demands"].reverse()
        second = engine.analyze(data)
        self.assertEqual({d["demand_id"]: d["allocations"] for d in report["ledger"]},
                         {d["demand_id"]: d["allocations"] for d in second["ledger"]})

    def test_target_order_missing_unapproved_and_flag_mismatch(self):
        for modification in ("missing", "unapproved", "false_target", "invalid_boolean"):
            with self.subTest(modification=modification):
                data = snapshot()
                if modification == "missing":
                    data["demands"][0]["order_id"] = "absent"
                elif modification == "unapproved":
                    data["orders"][0]["approved"] = False
                elif modification == "false_target":
                    data["demands"][0]["target"] = False
                else:
                    data["demands"][0]["target"] = 1
                self.assert_blocked(engine.analyze(data))

    def test_excluded_and_beyond_horizon_supply_not_allocated(self):
        data = snapshot(supplies=[supply("excluded", "10", "purchase", DUE, excluded_reason="订单作废"),
                                  supply("outside", "10", "purchase", "2026-10-11T00:00:00+00:00")])
        report = engine.analyze(data)
        self.assertFalse(report["audit"]["blockers"])
        self.assertEqual(report["orders"][0]["status"], "shortage")
        self.assertEqual(self.material(report)["supply_qty"], "0")
        self.assertEqual(report["supplies"], data["supplies"])

    def test_overdue_promised_supply_requires_extraction_exclusion(self):
        data = snapshot(supplies=[supply("overdue", "10", "purchase", "2026-09-30T00:00:00+00:00")])
        self.assert_blocked(engine.analyze(data), "过期计划供给")
        data["supplies"][0]["excluded_reason"] = "承诺日期过期，未确认到货"
        report = engine.analyze(data)
        self.assertFalse(report["audit"]["blockers"])
        self.assertEqual(self.material(report)["on_time_qty"], "0")

    def test_alternatives_explicitly_block_even_unapproved(self):
        data = snapshot()
        data["alternatives"] = [{"material_id": "m1", "substitute_material_id": "m2", "ratio": "1", "approved": False}]
        self.assert_blocked(engine.analyze(data), "不支持替代料")

    def test_window_and_missing_collections_block(self):
        data = snapshot()
        data["meta"]["horizon_end"] = "2026-10-04T00:00:00+00:00"
        self.assert_blocked(engine.analyze(data), "窗口不足")
        for key in ("orders", "demands", "supplies"):
            data = snapshot()
            del data[key]
            self.assert_blocked(engine.analyze(data), key)
        data = snapshot()
        data["meta"]["horizon_end"] = "2026-09-01T00:00:00+00:00"
        self.assert_blocked(engine.analyze(data), "快照窗口无效")

    def test_audit_preserved_and_input_not_mutated(self):
        data = snapshot()
        data["audit"] = {"blockers": ["提取结果被截断"], "warnings": ["已有警告"], "query_log": [{"query": "只读提取", "rows": 1}]}
        original = deepcopy(data)
        report = engine.analyze(data)
        self.assert_blocked(report, "截断")
        self.assertEqual(report["audit"]["query_log"], data["audit"]["query_log"])
        self.assertIn("已有警告", report["audit"]["warnings"])
        self.assertEqual(data, original)
        self.assertEqual(report, engine.analyze(data))

    def test_stock_metadata_must_describe_net_free(self):
        data = snapshot(supplies=[supply(qty="8", stock_qty="10", reserved_qty="5")])
        self.assert_blocked(engine.analyze(data), "qty=stock_qty-reserved_qty")

    def test_inspection_srm_and_output_contract(self):
        report = engine.analyze(snapshot(supplies=[supply("inspection", "6", "inspection", DUE), supply("srm", "4", "srm", DUE)]))
        m = self.material(report)
        self.assertEqual((m["pending_qty"], m["transit_qty"], m["supply_qty"]), ("6", "0", "10"))
        keys = {"demand_id", "material_id", "material_code", "name", "spec", "unit", "demand_qty", "supply_qty",
                "transit_qty", "pending_qty", "stock_qty", "reserved_qty", "available_stock_qty", "shortage_qty",
                "inventory_rate", "available_inventory_rate", "total_rate", "on_time_qty", "late_qty", "uncovered_qty",
                "ready_at", "status", "reason", "allocations"}
        self.assertEqual(set(m), keys)
        json.dumps(report, ensure_ascii=False, allow_nan=False)

    def test_order_ready_max_material_or_null_for_shortage(self):
        data = snapshot(supplies=[supply(), supply("s2", "10", "purchase", LATER, material_id="m2")])
        second = demand("d2")
        second["material_id"] = "m2"
        data["demands"].append(second)
        report = engine.analyze(data)
        self.assertEqual((report["orders"][0]["status"], report["orders"][0]["ready_at"]), ("late", LATER))
        data["supplies"][1]["qty"] = "9"
        report = engine.analyze(data)
        self.assertEqual((report["orders"][0]["status"], report["orders"][0]["ready_at"]), ("shortage", None))

    def test_malformed_types_fail_closed_not_crash(self):
        for section, field in (("demands", "material_id"), ("demands", "id"), ("demands", "order_id"),
                               ("supplies", "source_type"), ("supplies", "resource_key")):
            data = snapshot()
            data[section][0][field] = []
            with self.subTest(section=section, field=field):
                self.assert_blocked(engine.analyze(data))


class DocsContractTests(unittest.TestCase):
    """文档漂移守卫：SKILL.md / api_reference.md / 看板模板必须与引擎契约一致。

    文档描述的契约若与引擎实现漂移，技能包复用时会产生错误快照。
    令牌取自引擎常量本身，而不是复制字面量，确保文档随代码演进。
    """
    SKILL_ROOT = Path(__file__).resolve().parent.parent

    def read(self, relative):
        return (self.SKILL_ROOT / relative).read_text(encoding="utf-8")

    def test_skill_md_final_and_pins_engine_contract(self):
        text = self.read("SKILL.md")
        self.assertNotIn("[TODO", text)
        tokens = (list(engine.COVERAGE_KEYS) + sorted(engine.SOURCE_TYPES) + [
            "due_fifo_on_time_first", "on_time", "late", "shortage", "no_demand", "unknown",
            "present", "zero_confirmed", "missing", "R1", "R2", "R3", "R4", "R5", "R6", "R7",
            "analyze.py", "退出码", "已输出 unknown 阻断报告"])
        for token in tokens:
            with self.subTest(token=token):
                self.assertIn(token, text)

    def test_api_reference_documents_snapshot_and_report_schema(self):
        text = self.read("references/api_reference.md")
        self.assertNotIn("[TODO", text)
        self.assertNotIn("placeholder", text.lower())
        tokens = (list(engine.COVERAGE_KEYS) + sorted(engine.SOURCE_TYPES) + [
            # 输入 meta / 顶层
            "mode", "snapshot_at", "horizon_end", "scope", "coverage", "allocation_policy",
            "organizations", "warehouses", "alternatives",
            # 输入 orders / demands / supplies
            "due_at", "planned_qty", "approved", "demand_state",
            "order_id", "material_id", "need_at", "priority", "target",
            "resource_key", "available_at", "conditional", "source_order_id",
            "reserved_to_demand", "excluded_reason", "stock_qty", "reserved_qty",
            # 输出 orders / materials / ledger / audit
            "ready_at", "reason", "allocations", "supply_qty", "transit_qty", "pending_qty",
            "available_stock_qty", "shortage_qty", "inventory_rate", "available_inventory_rate",
            "total_rate", "on_time_qty", "late_qty", "uncovered_qty", "order_count",
            "blockers", "warnings", "query_log"])
        for token in tokens:
            with self.subTest(token=token):
                self.assertIn(token, text)

    def test_dashboard_template_keeps_report_marker(self):
        text = self.read("assets/dashboard.html")
        self.assertEqual(text.count("__REPORT_JSON__"), 1)


class HtmlAndCliTests(unittest.TestCase):
    TEMPLATE = '<!doctype html><html><head></head><body><script id="report" type="application/json">__REPORT_JSON__</script></body></html>'

    def test_html_json_escape_round_trip(self):
        report = {"attack": "</script><script>alert(1)</script>&>\u2028\u2029", "中文": "物料"}
        result = engine.render_html(self.TEMPLATE, report)
        start = result.index('<script id="report" type="application/json">') + len('<script id="report" type="application/json">')
        payload = result[start:result.index("</script>", start)]
        for character in ("<", ">", "&", "\u2028", "\u2029"):
            self.assertNotIn(character, payload)
        self.assertIn("\\u003c/script\\u003e", payload)
        self.assertEqual(json.loads(payload), report)
        self.assertIn("connect-src 'none'", result)
        self.assertLess(result.index("Content-Security-Policy"), result.index('<script id="report"'))

    def test_template_marker_and_external_requests_rejected(self):
        for template in ("missing", "__REPORT_JSON____REPORT_JSON__", '<script src="https://invalid.test/a.js"></script>__REPORT_JSON__',
                         '<link href="local.css">__REPORT_JSON__', '<meta http-equiv="refresh" content="0">__REPORT_JSON__'):
            with self.subTest(template=template), self.assertRaises(ValueError):
                engine.render_html(template, {})

    def test_duplicate_json_keys_and_nonfinite_constants_rejected(self):
        for text in ('{"x":1,"x":2}', '{"x":NaN}', '{"x":Infinity}'):
            with self.subTest(text=text), self.assertRaises(ValueError):
                json.loads(text, object_pairs_hook=engine._unique_object, parse_constant=engine._invalid_constant)

    def test_protected_paths_and_aliases_without_file_access(self):
        paths = [Path("input.json"), Path("template.html"), Path("report.json"), Path("dashboard.html")]
        for index in range(4):
            for other in range(index + 1, 4):
                with self.subTest(index=index, other=other):
                    duplicate = list(paths)
                    duplicate[other] = duplicate[index]
                    with patch.object(Path, "exists", return_value=False), patch.object(Path, "is_dir", return_value=True):
                        with self.assertRaises(ValueError):
                            engine.validate_paths(*duplicate)
        with patch.object(Path, "exists", return_value=True), patch.object(Path, "samefile", return_value=True):
            with self.assertRaises(ValueError):
                engine.validate_paths(*paths)

    def test_cli_memory_only_utf8_and_exit_codes(self):
        args = ["--input", "input.json", "--output", "report.json", "--html", "dashboard.html"]
        for blocked in (False, True):
            data = snapshot()
            if blocked:
                data["meta"]["coverage"]["inventory"] = False
            with self.subTest(blocked=blocked), patch.object(engine, "validate_paths"), \
                    patch.object(Path, "read_text", side_effect=[json.dumps(data), self.TEMPLATE]) as read, \
                    patch.object(Path, "write_text") as write:
                self.assertEqual(engine.main(args), 1 if blocked else 0)
                self.assertEqual(write.call_count, 2)
                self.assertTrue(all(call.kwargs["encoding"] == "utf-8" for call in read.call_args_list + write.call_args_list))
                report = json.loads(write.call_args_list[0].args[0])
                self.assertEqual(report["orders"][0]["status"], "unknown" if blocked else "on_time")

    def test_cli_missing_template_or_invalid_template_writes_nothing(self):
        for template in (FileNotFoundError("模板不存在"), "no marker"):
            with self.subTest(template=template), patch.object(engine, "validate_paths"), \
                    patch.object(Path, "read_text", side_effect=[json.dumps(snapshot()), template]), \
                    patch.object(Path, "write_text") as write, redirect_stderr(StringIO()):
                with self.assertRaises(SystemExit) as raised:
                    engine.main(["--input", "input.json", "--output", "report.json", "--html", "dashboard.html"])
                self.assertEqual(raised.exception.code, 2)
                write.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
