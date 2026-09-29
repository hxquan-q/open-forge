// @vitest-environment jsdom
/**
 * universal-db 预设的条件必填：DB_TYPE 驱动 sqlite 与网络库两套必填集，
 * 由 canSubmit 与字段 required 标记共同约束提交，而不是静态 required。
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getBuiltinMcpPresetById } from "../mcp/builtin-mcp-presets";
import { useBuiltinMcpSecretsDialogModel } from "./useBuiltinMcpSecretsDialogModel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const preset = getBuiltinMcpPresetById("universal-db");
if (!preset) throw new Error("universal-db preset missing");

function openDialog() {
	return renderHook(() => useBuiltinMcpSecretsDialogModel({ open: true, preset: preset ?? null }));
}

describe("universal-db secrets 对话框动态必填", () => {
	it("未选 DB_TYPE 时不可提交；DB_TYPE 以 options 暴露 17 个规范值", () => {
		const { result } = openDialog();
		const model = result.current;
		expect(model).not.toBeNull();
		expect(model?.canSubmit).toBe(false);
		const dbType = model?.fields.find((field) => field.envKey === "DB_TYPE");
		expect(dbType?.required).toBe(true);
		expect(dbType?.options).toHaveLength(17);
		expect(dbType?.options?.map((option) => option.value)).toContain("sqlite");
		// 选项带可读名 label（i18n key，mock 的 t 原样返回）
		expect(dbType?.options?.find((o) => o.value === "sqlite")?.label).toBe("mcpPresets.dbTypes.sqlite");
	});

	it("DB_TYPE=sqlite 时仅需 DB_FILE_PATH，网络字段整组隐藏", () => {
		const { result } = openDialog();
		act(() => result.current?.onChangeValue("DB_TYPE", "sqlite"));
		expect(result.current?.canSubmit).toBe(false);
		expect(result.current?.fields.map((f) => f.envKey)).toEqual(["DB_TYPE", "DB_FILE_PATH"]);
		expect(result.current?.fields.find((f) => f.envKey === "DB_FILE_PATH")?.required).toBe(true);

		act(() => result.current?.onChangeValue("DB_FILE_PATH", "/data/app.db"));
		expect(result.current?.canSubmit).toBe(true);
	});

	it("DB_TYPE=mysql 时 DB_HOST 必填、DB_FILE_PATH 隐藏", () => {
		const { result } = openDialog();
		act(() => result.current?.onChangeValue("DB_TYPE", "mysql"));
		expect(result.current?.fields.find((f) => f.envKey === "DB_HOST")?.required).toBe(true);
		expect(result.current?.fields.find((f) => f.envKey === "DB_FILE_PATH")).toBeUndefined();
		expect(result.current?.canSubmit).toBe(false);

		act(() => result.current?.onChangeValue("DB_HOST", "db.internal"));
		expect(result.current?.canSubmit).toBe(true);
	});

	it("切换 DB_TYPE 后隐藏字段的已填值被清除，不会混进提交的 env", () => {
		const { result } = openDialog();
		act(() => result.current?.onChangeValue("DB_TYPE", "mysql"));
		act(() => result.current?.onChangeValue("DB_HOST", "db.internal"));
		expect(result.current?.values.DB_HOST).toBe("db.internal");

		act(() => result.current?.onChangeValue("DB_TYPE", "sqlite"));
		expect(result.current?.values.DB_HOST).toBeUndefined();
		expect(result.current?.values.DB_PASSWORD).toBeUndefined();
	});

	it("弹窗文案走预设的 dialogCopy 槽位，而非默认「粘贴密钥」语境", () => {
		const { result } = openDialog();
		expect(result.current?.labels.setupBody).toBe("mcpPresets.dbDialog.lead");
		expect(result.current?.labels.stepPasteKey).toBe("mcpPresets.dbDialog.fieldsTitle");
		expect(result.current?.labels.openKeyPage).toBe("mcpPresets.dbDialog.helpCta");
		expect(result.current?.labels.continueCta).toBe("mcpPresets.dbDialog.continueCta");
	});

	it("无 dialogCopy 的预设回落到通用密钥文案", () => {
		const slack = getBuiltinMcpPresetById("slack");
		const { result } = renderHook(() => useBuiltinMcpSecretsDialogModel({ open: true, preset: slack ?? null }));
		expect(result.current?.labels.stepPasteKey).toBe("mcpPresets.stepPasteKey");
		expect(result.current?.labels.setupBody).toBe("mcpPresets.secretsDialogLead");
	});

	it("DB_HOST 填空白串仍按未填处理", () => {
		const { result } = openDialog();
		act(() => result.current?.onChangeValue("DB_TYPE", "postgres"));
		act(() => result.current?.onChangeValue("DB_HOST", "   "));
		expect(result.current?.canSubmit).toBe(false);
	});
});
