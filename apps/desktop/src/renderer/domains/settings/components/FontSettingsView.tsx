// Copyright The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui/select";
import { fontFamily } from "@shared/theme/fonts";
import type { FontPreferences } from "@shared/theme/fonts";
import { useId } from "react";
import { SettingHeading } from "@vetta-org/theme-ui/settings";
import { SETTINGS_SECTION } from "../registry";
import type { FontSettingsModel } from "./useFontSettingsModel";

function FontChoice({ model, kind }: { model: FontSettingsModel; kind: keyof FontPreferences }) {
	const id = useId();
	const selected = model.preferences[kind];
	const label = kind === "ui" ? model.labels.ui : model.labels.code;
	const fallback = kind === "ui" ? "var(--font-sans)" : "var(--font-mono)";
	const available = model.fonts.filter((font) => kind === "ui" || font.monospace);
	const choices = available.filter((font) =>
		font.family.toLocaleLowerCase().includes(model.query.trim().toLocaleLowerCase()),
	);
	const missing = model.loaded && Boolean(selected) && !available.some((font) => font.family === selected);
	return (
		<div className="min-w-0 space-y-2">
			<label htmlFor={id} className="text-[12px] font-medium text-foreground">
				{label}
			</label>
			<div className="flex items-center gap-2">
				<Select
					value={selected ? `font:${selected}` : "default"}
					onValueChange={(value) => model.actions.choose(kind, value === "default" ? "" : value.slice(5))}
				>
					<SelectTrigger id={id} className="min-w-0 flex-1">
						<SelectValue>{selected || model.labels.default}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="default">{model.labels.default}</SelectItem>
						{choices.map((font) => (
							<SelectItem key={font.family} value={`font:${font.family}`}>
								<span style={{ fontFamily: fontFamily(font.family, fallback) }}>{font.family}</span>
							</SelectItem>
						))}
						{model.loaded && choices.length === 0 && (
							<p className="px-2 py-2 text-[12px] text-muted-foreground">{model.labels.empty}</p>
						)}
					</SelectContent>
				</Select>
				<Button
					variant="ghost"
					size="icon-sm"
					disabled={!selected}
					aria-label={kind === "ui" ? model.labels.resetUi : model.labels.resetCode}
					onClick={() => model.actions.choose(kind, "")}
				>
					<span aria-hidden="true" className="icon-[lucide--rotate-ccw] size-3.5" />
				</Button>
			</div>
			{missing && <p className="text-[12px] text-muted-foreground">{model.labels.missing}</p>}
			<p
				className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground"
				style={{ fontFamily: fontFamily(selected, fallback) }}
			>
				{kind === "ui" ? model.labels.preview : model.labels.codePreview}
			</p>
		</div>
	);
}

export function FontSettingsView({ model }: { model: FontSettingsModel }) {
	const section = SETTINGS_SECTION["appearance-fonts"];
	return (
		<section className="mb-6 space-y-3" aria-labelledby={section.id}>
			<SettingHeading section={section} title={model.labels.title} />
			<p className="text-[12px] text-muted-foreground">{model.labels.hint}</p>
			<Button variant="outline" size="sm" disabled={model.loading} onClick={() => void model.actions.load()}>
				{model.labels.load}
			</Button>
			{model.loading && (
				<p role="status" className="text-[12px] text-muted-foreground">
					{model.labels.loading}
				</p>
			)}
			{model.error && (
				<p role="alert" className="text-[12px] text-destructive">
					{model.error}
				</p>
			)}
			{model.loaded && (
				<Input
					aria-label={model.labels.search}
					placeholder={model.labels.search}
					value={model.query}
					onChange={(event) => model.actions.setQuery(event.target.value)}
				/>
			)}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<FontChoice model={model} kind="ui" />
				<FontChoice model={model} kind="code" />
			</div>
		</section>
	);
}
