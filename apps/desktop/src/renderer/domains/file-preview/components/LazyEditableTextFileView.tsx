// Copyright The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import { waitForCommittedPaint } from "@shared/lib/committed-paint";
import { Spin } from "@vetta-org/ui";
import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EditableTextFileView } from "./EditableTextFileView";
import { loadEditableTextFileView } from "./editable-text-file-loader";

export function LazyEditableTextFileView(props: ComponentProps<typeof EditableTextFileView>): JSX.Element {
	const { t } = useTranslation("chat");
	const [Editor, setEditor] = useState<typeof EditableTextFileView | null>(null);
	const [failed, setFailed] = useState(false);
	const [attempt, setAttempt] = useState(0);

	useEffect(() => {
		let active = true;
		void (async () => {
			await waitForCommittedPaint();
			if (!active) return;
			try {
				const LoadedEditor = await loadEditableTextFileView();
				if (active) setEditor(() => LoadedEditor);
			} catch {
				if (active) setFailed(true);
			}
		})();
		return () => {
			active = false;
		};
	}, [attempt]);

	if (Editor) return <Editor {...props} />;
	if (failed) {
		return (
			<div role="alert" className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4">
				<p className="text-[13px] text-muted-foreground">{t("fileEditor.errorLoadEditor")}</p>
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						setFailed(false);
						setAttempt((value) => value + 1);
					}}
				>
					{t("fileEditor.retry")}
				</Button>
			</div>
		);
	}
	return (
		<div
			role="status"
			className="flex min-h-0 flex-1 items-center justify-center gap-2 p-4 text-[13px] text-muted-foreground"
		>
			<Spin size="sm" />
			{t("fileEditor.loading")}
		</div>
	);
}
