// Copyright The Open Forge contributors.
import { useEffect, useRef } from "react";
import { canvasHtmlWebviewAttributes, classifyCanvasHtmlNavigation } from "../../services/canvas-html-sandbox";

export interface CanvasHtmlSandboxProps {
	readonly src: string;
	readonly label: string;
	readonly onNavigate: (url: string) => void;
}

interface CanvasHtmlNavigateEvent extends Event {
	readonly url?: string;
}

/**
 * Isolated HTML guest. Attributes and navigation policy live in canvas-html-sandbox;
 * this component only wires the Electron <webview> to that contract.
 */
export function CanvasHtmlSandbox({ src, label, onNavigate }: CanvasHtmlSandboxProps): JSX.Element {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const attributes = canvasHtmlWebviewAttributes();

	useEffect(() => {
		const host = hostRef.current;
		const guest = host?.querySelector("webview");
		if (!guest) return;
		const block = (event: Event): void => {
			const url = (event as CanvasHtmlNavigateEvent).url ?? "";
			const decision = classifyCanvasHtmlNavigation(url);
			if (decision === "allow") return;
			event.preventDefault();
			if (decision === "external") onNavigate(url);
		};
		guest.addEventListener("will-navigate", block);
		guest.addEventListener("will-redirect", block);
		guest.addEventListener("new-window", block);
		return () => {
			guest.removeEventListener("will-navigate", block);
			guest.removeEventListener("will-redirect", block);
			guest.removeEventListener("new-window", block);
		};
	}, [onNavigate, src]);

	return (
		<div ref={hostRef} className="relative min-h-0 w-full flex-1">
			<webview
				src={src}
				partition={attributes.partition}
				webpreferences={attributes.webpreferences}
				title={label}
				aria-label={label}
				className="absolute inset-0 h-full w-full"
			/>
		</div>
	);
}
