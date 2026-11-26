// Modified by The Open Forge contributors.
import { useShortcutScope } from "@shared/shortcuts";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ConfirmDialogViewProps } from "../components/ui/ConfirmDialogView";
import { confirmDialogAtom } from "../store/atoms";

export function useConfirmDialogModel(): ConfirmDialogViewProps {
	const { t } = useTranslation("common");
	const [state, setState] = useAtom(confirmDialogAtom);
	const overlayRef = useRef<HTMLDivElement>(null);
	const [inputValue, setInputValue] = useState("");

	useEffect(() => {
		setInputValue(state?.input?.defaultValue ?? "");
	}, [state]);

	const onCancel = useCallback(() => {
		state?.onCancel?.();
		setState(null);
	}, [setState, state]);

	const onConfirm = useCallback(() => {
		// onConfirm 自身可以是 async（如删除会话编排）：返回的 Promise 用 void 明确
		// 不承接，rejection 归回调内部自理。try/catch 只接住调用本身的同步抛出，
		// 此时按「确认即关闭」的合同照常关框并把异常记入日志。
		try {
			void state?.onConfirm(state.checkbox?.checked ?? false, inputValue);
		} catch (error) {
			console.error("[confirm-dialog] onConfirm threw synchronously", error);
		}
		setState(null);
	}, [setState, state, inputValue]);

	const onCheckboxCheckedChange = useCallback(
		(checked: boolean) => {
			setState((current) =>
				current?.checkbox ? { ...current, checkbox: { ...current.checkbox, checked } } : current,
			);
		},
		[setState],
	);

	const onInputChange = useCallback((value: string) => {
		setInputValue(value);
	}, []);

	useShortcutScope({
		id: "modal:confirm-dialog",
		kind: "modal",
		active: state != null,
		exclusive: true,
		bindings: [
			{
				key: "escape",
				run: () => {
					state?.onCancel?.();
					setState(null);
				},
			},
		],
	});

	return useMemo(
		() => ({
			labels: {
				cancel: t("actions.cancel"),
				confirm: t("actions.confirm"),
			},
			onCancel,
			onCheckboxCheckedChange,
			onConfirm,
			onInputChange,
			overlayRef,
			state: state
				? {
						cancelLabel: state.cancelLabel,
						checkbox: state.checkbox,
						confirmLabel: state.confirmLabel,
						input: state.input ? { ...state.input, value: inputValue } : undefined,
						message: state.message,
						title: state.title,
						variant: state.variant,
					}
				: null,
		}),
		[inputValue, onCancel, onCheckboxCheckedChange, onConfirm, onInputChange, state, t],
	);
}
