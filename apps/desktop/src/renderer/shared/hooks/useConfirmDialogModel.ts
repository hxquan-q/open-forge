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
		state?.onConfirm(state.checkbox?.checked ?? false, inputValue);
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
