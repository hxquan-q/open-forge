// Modified by The Open Forge contributors.
import { useTranslation } from "react-i18next";
import { Button, cn } from "@vetta-org/ui";
import type { ModelsSettingsModel } from "./useModelsSettingsModel";

/** 面板实际消费的 model 字段——窄合同方便组件测试与复用。 */
export type FetchedModelsPanelModel = Pick<
	ModelsSettingsModel,
	| "config"
	| "fetchedModels"
	| "saving"
	| "onToggleFetchedModel"
	| "onSetAllFetchedSelected"
	| "onCancelFetchedModels"
	| "onApplyFetchedModels"
>;

/**
 * 展示 `GET {baseUrl}/models` 拉取到的模型 id，勾选后批量写入 provider。
 * 默认不勾选（中转网关可能返回上百个模型），由用户挑选或点「全选」；
 * 已在配置里的 id 显示为已添加、不可再勾选。
 */
export function ModelsFetchedModelsPanel({
	name,
	model,
}: {
	name: string;
	model: FetchedModelsPanelModel;
}): JSX.Element | null {
	const { t } = useTranslation("settings");
	const fetched = model.fetchedModels;
	if (!fetched || fetched.provider !== name) return null;

	const existing = new Set((model.config?.providers[name]?.models || []).map((item) => item.id));
	const addable = fetched.models.filter((id) => !existing.has(id));
	const allSelected = addable.length > 0 && addable.every((id) => fetched.selected.includes(id));

	return (
		<div className="border-t border-border/50 bg-secondary/50 px-5 py-3">
			{fetched.error ? (
				<div className="text-[12px] text-destructive">{fetched.error}</div>
			) : (
				<>
					<div className="mb-2 flex items-center justify-between gap-2">
						<span className="text-[11px] text-muted-foreground">
							{t("fetchedModelsHint", { n: fetched.models.length })}
						</span>
						{addable.length > 0 && (
							<Button
								variant="ghost"
								size="sm"
								className="h-6 px-2 text-[11px]"
								onClick={() => model.onSetAllFetchedSelected(!allSelected)}
							>
								{allSelected ? t("deselectAllModels") : t("selectAllModels")}
							</Button>
						)}
					</div>
					<div className="max-h-56 overflow-y-auto rounded border border-border">
						{fetched.models.map((id) => {
							const isExisting = existing.has(id);
							const isSelected = isExisting || fetched.selected.includes(id);
							return (
								<button
									key={id}
									type="button"
									disabled={isExisting}
									onClick={() => model.onToggleFetchedModel(id)}
									className={cn(
										"flex w-full items-center gap-2 border-b border-border/50 px-3 py-1.5 text-left last:border-b-0",
										isExisting ? "cursor-default opacity-60" : "hover:bg-accent",
									)}
								>
									<span
										className={cn(
											"h-3.5 w-3.5 shrink-0",
											isSelected
												? "icon-[mdi--checkbox-marked] text-primary"
												: "icon-[mdi--checkbox-blank-outline] text-muted-foreground",
											isExisting && "text-muted-foreground",
										)}
									/>
									<span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{id}</span>
									{isExisting && <span className="text-[10px] text-muted-foreground">{t("alreadyAdded")}</span>}
								</button>
							);
						})}
					</div>
				</>
			)}
			<div className="mt-3 flex items-center gap-2">
				{!fetched.error && (
					<Button
						size="sm"
						onClick={() => void model.onApplyFetchedModels(name)}
						disabled={model.saving || fetched.selected.length === 0}
					>
						{t("addSelectedModels", { n: fetched.selected.length })}
					</Button>
				)}
				<Button variant="ghost" size="sm" onClick={model.onCancelFetchedModels}>
					{t("cancel")}
				</Button>
			</div>
		</div>
	);
}
