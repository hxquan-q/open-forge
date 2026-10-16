// Copyright The Open Forge contributors.

import type { WeKnoraConfigPatch, WeKnoraPublicConfig } from "@preload/api";
import { useAtom } from "jotai";
import { useCallback, useState } from "react";
import { weKnoraConfigAtom, weKnoraSaveErrorAtom } from "../atoms";
import { errorCodeOf } from "./weKnoraModelSupport";

/** 配置面板的入参（`baseUrl` + 可选的 API Key）。 */
export interface WeKnoraSetupInput {
	readonly baseUrl: string;
	readonly apiKey?: string;
}

export interface WeKnoraSetupState {
	readonly config: WeKnoraPublicConfig | null;
	/** 保存进行中（驱动「保存中…」与按钮禁用）。 */
	readonly saving: boolean;
	/** 读回主进程的配置并落到 atom；失败返回 `null`（不抛）。 */
	readonly loadConfig: () => Promise<WeKnoraPublicConfig | null>;
	/**
	 * 写入 `baseUrl` / API Key 并读回最新配置（④）。
	 *
	 * 失败**不抛出**：把归一化错误码写进 `weKnoraSaveErrorAtom`（连接层据此展示反馈），返回 `null`。
	 * 成功返回读回后的配置，由连接层决定是否刷新智能体 / 历史（那是别的 actor 的能力，本 hook 不越界）。
	 */
	readonly writeSetup: (input: WeKnoraSetupInput) => Promise<WeKnoraPublicConfig | null>;
}

/**
 * 配置 actor：只负责「服务地址 + API Key」的读写状态。
 *
 * Key 只写不读（红线 C2）：本 hook 从不把 Key 读回内存，只经 `set-api-key` 写入凭据库。
 */
export function useWeKnoraSetup(): WeKnoraSetupState {
	const [config, setConfig] = useAtom(weKnoraConfigAtom);
	const [saving, setSaving] = useState(false);
	const [, setSaveError] = useAtom(weKnoraSaveErrorAtom);

	const loadConfig = useCallback(async (): Promise<WeKnoraPublicConfig | null> => {
		try {
			const cfg = await window.vetta.weknora.getConfig();
			setConfig(cfg);
			return cfg;
		} catch {
			return null;
		}
	}, [setConfig]);

	const writeSetup = useCallback(
		async (input: WeKnoraSetupInput): Promise<WeKnoraPublicConfig | null> => {
			const baseUrl = input.baseUrl.trim();
			setSaveError(null);
			// ④：空地址在渲染层先拦住 —— 否则主进程 `requireNonEmptyString` 抛出的裸错误串只会变成
			// 「点保存没反应」（未处理的 rejection），用户看不到任何可操作提示。
			if (!baseUrl) {
				setSaveError("not_configured");
				return null;
			}
			setSaving(true);
			try {
				const patch: WeKnoraConfigPatch = { baseUrl };
				await window.vetta.weknora.setConfig(patch);
				const apiKey = input.apiKey?.trim();
				if (apiKey) await window.vetta.weknora.setApiKey(apiKey);
				const cfg = await window.vetta.weknora.getConfig();
				setConfig(cfg);
				return cfg;
			} catch (error) {
				// ④：补 catch —— 既消除未处理的 Promise rejection，也把失败码交给连接层展示（不再静默失败）。
				setSaveError(errorCodeOf(error));
				return null;
			} finally {
				setSaving(false);
			}
		},
		[setConfig, setSaveError],
	);

	return { config, saving, loadConfig, writeSetup };
}
