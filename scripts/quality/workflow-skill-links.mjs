// Copyright The Open Forge contributors.
// Repository inline Markdown links, not a full CommonMark or anchor validator.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function relativeMarkdownLinks(markdown) {
	let fence = null;
	const prose = markdown
		.split(/\r?\n/)
		.filter((line) => {
			const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})/);
			if (delimiter) {
				const run = delimiter[1];
				if (!fence) fence = run;
				else if (run[0] === fence[0] && run.length >= fence.length) fence = null;
				return false;
			}
			return !fence && !/^(?: {4}|\t)/.test(line);
		})
		.join("\n")
		.replace(/(`+)[\s\S]*?\1/g, "");
	const pattern =
		/\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|((?:\\.|[^\s()]|\([^()\n]*\))+))(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^\n)]*\)))?\s*\)/g;
	return [...prose.matchAll(pattern)]
		.map((match) => match[1] ?? match[2])
		.filter((link) => !/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(link));
}

export function brokenFileLinks(file, markdown, accept = () => true) {
	return relativeMarkdownLinks(markdown)
		.filter(accept)
		.flatMap((link) => {
			const path = link.split("#")[0];
			return existsSync(resolve(dirname(file), path)) ? [] : [`Broken link: ${file} -> ${link}`];
		});
}
