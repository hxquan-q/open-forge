// Copyright The Open Forge contributors.

import { Textarea } from "@shared/components/ui/textarea";
import { Button, Spin } from "@vetta-org/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export interface WeKnoraComposerProps {
	/** 无可用智能体时为真：输入与发送都禁用（AC-19）。 */
	readonly disabled: boolean;
	readonly isStreaming: boolean;
	readonly onSend: (text: string) => void;
	readonly onCancel: () => void;
}

/**
 * 输入框 + 发送 + 取消。
 *
 * 进行中（`isStreaming`）时显示「正在生成回答」并**禁用发送**（不可重复提交，AC-7），
 * 同时给出取消入口（AC-8）。取消后已收到的部分文本由消息区保留，本组件不负责清空。
 */
export function WeKnoraComposer({ disabled, isStreaming, onSend, onCancel }: WeKnoraComposerProps): JSX.Element {
	const { t } = useTranslation("weknora");
	const [text, setText] = useState("");

	const canSubmit = !disabled && !isStreaming && text.trim().length > 0;

	const submit = (): void => {
		if (!canSubmit) return;
		onSend(text);
		setText("");
	};

	return (
		<form
			className="flex shrink-0 items-end gap-2 border-t border-border/40 pt-4"
			onSubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<Textarea
				className="flex-1"
				disabled={disabled}
				onChange={(event) => setText(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						submit();
					}
				}}
				placeholder={disabled ? t("composer.unavailable") : t("composer.placeholder")}
				value={text}
			/>
			{isStreaming ? <Spin className="text-primary" label={t("composer.sending")} size="sm" /> : null}
			{isStreaming ? (
				<Button onClick={onCancel} type="button" variant="outline">
					{t("composer.cancel")}
				</Button>
			) : null}
			<Button disabled={!canSubmit} type="submit" variant="primary">
				{t("composer.send")}
			</Button>
		</form>
	);
}
