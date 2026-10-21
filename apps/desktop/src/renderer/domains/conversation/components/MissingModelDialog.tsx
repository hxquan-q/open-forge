// Copyright The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import { missingModelDialogOpenAtom } from "@shared/store/atoms";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@vetta-org/ui";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";

/**
 * 无可用模型时点发送的引导对话框。
 *
 * 发送被前置闸门拦下(不派发、无任何会话副作用),这里给出「去配置模型 key」的直达入口。
 * 不点不消失:只能经【取消】或【去配置模型 key】关闭,外部点击与 Esc 都不关闭,避免
 * 用户误触把引导丢掉。
 */
export function MissingModelDialog(): JSX.Element | null {
	const { t } = useTranslation(["chat", "common"]);
	const [open, setOpen] = useAtom(missingModelDialogOpenAtom);
	const navigate = useNavigate();

	if (!open) return null;

	const goConfigure = (): void => {
		setOpen(false);
		void navigate({
			to: "/settings/$tab",
			params: { tab: "models" },
			search: { section: "models-preset-providers" },
		});
	};

	return (
		<Dialog open onOpenChange={setOpen}>
			<DialogContent
				className="max-w-[420px]"
				showCloseButton={false}
				onInteractOutside={(event) => event.preventDefault()}
				onEscapeKeyDown={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{t("chat:missingModelDialog.title")}</DialogTitle>
					<DialogDescription>{t("chat:missingModelDialog.body")}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						{t("common:actions.cancel")}
					</Button>
					<Button variant="primary" onClick={goConfigure}>
						{t("chat:missingModelDialog.configureAction")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
