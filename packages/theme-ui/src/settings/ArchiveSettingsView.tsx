// Copyright The Open Forge contributors.
import type { JSX, ReactNode } from "react";

/**
 * 「已归档」页的壳：页标题 + 若干节。归档有两类对象（项目、会话），
 * 页面只负责标题与留白，各节自己渲染卡片，避免把两类列表塞进一个组件。
 */
export interface ArchiveSettingsViewProps {
	readonly title: string;
	readonly children: ReactNode;
}

export function ArchiveSettingsView({ title, children }: ArchiveSettingsViewProps): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 pt-2 pb-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">{title}</h1>
			{children}
		</div>
	);
}
