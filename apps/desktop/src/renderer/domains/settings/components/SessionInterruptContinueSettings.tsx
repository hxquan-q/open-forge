// Copyright The Open Forge contributors.
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@shared/components/ui/select";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type InterruptMode = "off" | "notify" | "auto";

/** 会话中断续接：off / notify（默认）/ auto。 */
export function SessionInterruptContinueSettings(): JSX.Element {
	const { t } = useTranslation("settings");
	const [mode, setMode] = useState<InterruptMode>("notify");

	useEffect(() => {
		void window.vetta.settings.getSessionInterruptContinue().then((value) => {
			setMode(value.mode);
		});
	}, []);

	const onChange = useCallback(async (next: string) => {
		if (next !== "off" && next !== "notify" && next !== "auto") return;
		const previous = mode;
		setMode(next);
		try {
			await window.vetta.settings.setSessionInterruptContinue(next);
		} catch (error) {
			setMode(previous);
			console.error("[SessionInterruptContinueSettings] failed to save", error);
		}
	}, [mode]);

	return (
		<div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-4">
			<div className="flex flex-col gap-1">
				<label className="text-[13px] font-medium text-foreground" htmlFor="session-interrupt-continue">
					{t("sessionInterruptContinue.title")}
				</label>
				<p className="text-sm text-[var(--text-2)]">{t("sessionInterruptContinue.description")}</p>
			</div>
			<Select value={mode} onValueChange={(value) => void onChange(value)}>
				<SelectTrigger id="session-interrupt-continue" className="w-full max-w-xs">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="off">{t("sessionInterruptContinue.off")}</SelectItem>
					<SelectItem value="notify">{t("sessionInterruptContinue.notify")}</SelectItem>
					<SelectItem value="auto">{t("sessionInterruptContinue.auto")}</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
