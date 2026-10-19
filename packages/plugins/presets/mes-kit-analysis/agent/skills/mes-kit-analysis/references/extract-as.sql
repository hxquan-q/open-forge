-- Copyright The Open Forge contributors.
-- AS数据库 齐套快照提取 SQL（只读，全部经 dbx MCP 执行为一次性查询，未落库、未建临时表）
-- 连接：dbx 连接名「AS数据库」 mysql 110.41.20.224:3306 / 库 asd_ai_mes
-- 执行时间：2026-10-10 16:49 (+08:00)
-- 对应产物：build_snapshot.py 中的常量表 / snapshot-live.json / snapshot-demo.json

-- 0. 环境与时区（快照时点、horizon 基准）
SELECT NOW() AS db_now, @@system_time_zone AS stz, TIMEDIFF(NOW(), UTC_TIMESTAMP()) AS offset_from_utc;

-- 1. 目标工单：已审核父项工单，且计划完工日期明确（窗口内）
SELECT o.id, o.order_no, o.product_code, o.product_name, o.quantity, o.completed_qty, o.stocked_qty,
       o.plan_start_date, o.plan_end_date, o.deadline, o.status, o.audit_status, o.org, o.org_id,
       (SELECT COUNT(*) FROM t_material_usage_header h WHERE h.prod_order_id = o.id AND h.deleted = 0) AS usage_headers
FROM t_prod_order o
WHERE o.deleted = 0 AND o.audit_status = 'APPROVED' AND o.order_type = '父项' AND o.plan_end_date IS NOT NULL
ORDER BY o.plan_end_date;

-- 1b. 已审核父项工单总体分布（用于说明范围缺口：4699 张待投产未审核、53 张已审核已投产、3 张生产中）
SELECT status, audit_status, order_type, COUNT(*) FROM t_prod_order WHERE deleted = 0 GROUP BY 1, 2, 3;

-- 2. 目标需求 + 竞争需求：用料清单未领数量 busunissueqty（行按工单聚合，跨该工单全部用料清单表头）
SELECT d.id AS detail_id, h.id AS header_id, h.prod_order_id, o.order_no, o.plan_end_date,
       d.material_id, d.unit, d.quantity AS bom_qty, d.plan_qty, d.needqty,
       d.busnumerator, d.busdenominator, d.busdemandqty, d.busactissueqty, d.busunissueqty,
       d.notified_qty, d.pushed_picking_qty, d.seq
FROM t_material_usage_detail d
JOIN t_material_usage_header h ON h.id = d.header_id AND h.deleted = 0
JOIN t_prod_order o ON o.id = h.prod_order_id AND o.deleted = 0
WHERE d.deleted = 0 AND o.audit_status = 'APPROVED';

-- 2b. 竞争需求（跨全部工单，不限于已审核）：范围内物料未领>0 且有明确需求时间
SELECT h.prod_order_id, o.order_no, o.audit_status, o.plan_end_date, d.material_id, d.busunissueqty, d.unit
FROM t_material_usage_detail d
JOIN t_material_usage_header h ON h.id = d.header_id
JOIN t_prod_order o ON o.id = h.prod_order_id
WHERE d.deleted = 0 AND d.material_id IN (244861, 244857, 244856, 9022, 9014, 9017, 8398, 8399) AND d.busunissueqty > 0;

-- 3. 单位解析：范围内物料在用料清单 / 工单 / 物料主数据中的单位取值
SELECT d.material_id, d.unit, COUNT(*) AS rows_cnt, SUM(d.busunissueqty > 0) AS with_unissued
FROM t_material_usage_detail d WHERE d.deleted = 0
  AND d.material_id IN (244861, 244857, 244856, 9022, 9014, 9017, 8398, 8399) GROUP BY 1, 2;
SELECT id, unit_code, unit_name FROM t_unit WHERE id = 490;   -- 490 → Pcs

-- 4. 库存：库内无独立即时库存表，库存数量承载在物料主数据
SELECT id, material_code, material_name, spec, unit, material_type, category, stock_qty, safety_stock
FROM t_base_material WHERE deleted = 0
  AND (id IN (244861, 244857, 244856, 9022, 9014, 9017, 8398, 8399) OR stock_qty > 0);

-- 5. 采购在途：范围内采购明细（承诺日期、未入库数量）
SELECT d.id, d.material_id, d.quantity, d.received_qty, d.inbound_qty, d.inbound_occupied_qty,
       d.agreed_delivery_date, d.supplier_reply_delivery_date, d.line_status, p.order_no, p.status
FROM t_purchase_order_detail d JOIN t_purchase_order p ON p.id = d.purchase_order_id
WHERE d.material_id IN (244861, 244857, 244856, 9022, 9014, 9017, 8398, 8399);

-- 6. 生产在途：范围内物料的产出工单（工单数量 / 已入库 / 计划完工）
SELECT id, order_no, product_id, product_code, quantity, completed_qty, stocked_qty,
       plan_end_date, status, audit_status
FROM t_prod_order WHERE deleted = 0
  AND product_id IN (9022, 9014, 9017, 244861, 244856, 244857, 8398, 8399, 245297, 244862)
ORDER BY product_id, plan_end_date;

-- 7. 委外 / SRM / 待检 / 拣货占用：范围内是否有其他供需来源
SELECT id, order_no, material_code, order_qty, plan_end_date, doc_status, exec_status FROM t_outsource_work_order;
SELECT COUNT(*) FROM t_outsource_material_usage_detail WHERE material_id IN (244861,244857,244856,9022,9014,9017,8398,8399);
SELECT COUNT(*) FROM t_srm_delivery_source_line        WHERE material_id IN (244861,244857,244856,9022,9014,9017,8398,8399);
SELECT COUNT(*) FROM t_sales_order_detail              WHERE material_id IN (244861,244857,244856,9022,9014,9017,8398,8399);
SELECT id, bill_no, bill_date, material_id, inspection_type, qty, status FROM t_qms_inspection_bill
 WHERE material_id IN (9022,9014,9017,244861,244856,244857,8398,8399) ORDER BY id;
SELECT id, material_id, source_type, apply_qty, require_date, line_status
FROM t_picking_order_source WHERE material_id IN (244861,244857,244856,9022,9014,9017,8398,8399);

-- 8. 范围组织（快照 meta.scope.organizations）
SELECT id, order_no, org, org_id FROM t_prod_order
 WHERE deleted = 0 AND id IN (9894,9885,9899,9896,9975,9897,9977,5491,5476,5477,5478,9882,9978,9883,9900,9983);
