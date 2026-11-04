// Copyright The Open Forge contributors.
import { useEffect, useRef, useState } from "react";
import { getAllstarProjectConfigDirectory, getAllstarProjectConfigPath } from "../services/project-configuration.js";

export type AllstarProjectConfigStatus =
	| "idle"
	| "loading"
	| "ready"
	| "saving"
	| "saved"
	| "load-error"
	| "save-error";

export interface AllstarProjectConfigModel {
	readonly open: boolean;
	readonly projectName: string;
	readonly content: string;
	readonly status: AllstarProjectConfigStatus;
	readonly dirty: boolean;
	openForProject: (cwd: string, projectName: string) => void;
	close: () => void;
	changeContent: (content: string) => void;
	save: () => Promise<void>;
}

interface ConfigTarget {
	readonly cwd: string;
	readonly projectName: string;
}

export function useAllstarProjectConfig(emptyTemplate: string): AllstarProjectConfigModel {
	const [target, setTarget] = useState<ConfigTarget | null>(null);
	const [content, setContent] = useState("");
	const [savedContent, setSavedContent] = useState("");
	const [status, setStatus] = useState<AllstarProjectConfigStatus>("idle");
	const generation = useRef(0);
	const emptyTemplateRef = useRef(emptyTemplate);
	emptyTemplateRef.current = emptyTemplate;

	useEffect(() => {
		if (!target) return;
		const request = ++generation.current;
		let cancelled = false;
		setStatus("loading");
		setContent("");
		setSavedContent("");

		void window.vetta.fs.readFile(getAllstarProjectConfigPath(target.cwd)).then(
			(snapshot) => {
				if (cancelled || request !== generation.current) return;
				if (snapshot.encoding !== "utf8") {
					setStatus("load-error");
					return;
				}
				const nextContent = snapshot.content || emptyTemplateRef.current;
				setContent(nextContent);
				setSavedContent(nextContent);
				setStatus("ready");
			},
			() => {
				if (!cancelled && request === generation.current) setStatus("load-error");
			},
		);

		return () => {
			cancelled = true;
		};
	}, [target]);

	const openForProject = (cwd: string, projectName: string) => {
		generation.current++;
		setContent("");
		setSavedContent("");
		setStatus("loading");
		setTarget({ cwd, projectName });
	};

	const close = () => {
		generation.current++;
		setTarget(null);
		setStatus("idle");
	};

	const changeContent = (nextContent: string) => {
		setContent(nextContent);
		setStatus("ready");
	};

	const save = async () => {
		if (!target) return;
		const request = generation.current;
		const nextContent = content;
		const directory = getAllstarProjectConfigDirectory(target.cwd);
		setStatus("saving");
		try {
			await window.vetta.fs.createDirectory(directory);
			await window.vetta.fs.writeFile(getAllstarProjectConfigPath(target.cwd), nextContent);
			if (request !== generation.current) return;
			setSavedContent(nextContent);
			setStatus("saved");
		} catch {
			if (request === generation.current) setStatus("save-error");
		}
	};

	return {
		open: target !== null,
		projectName: target?.projectName ?? "",
		content,
		status,
		dirty: content !== savedContent,
		openForProject,
		close,
		changeContent,
		save,
	};
}
