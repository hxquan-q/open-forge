// Copyright The Open Forge contributors.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

interface Step { action: "visible" | "click" | "fill" | "text"; selector: string; value?: string; }
interface Plan { version: 1; steps: Step[]; }
interface Screenshot { path: string; sha256: string; }
interface Check { theme: string; mode: string; assertions: number; screenshot: Screenshot; }

/** Only controller-validated data enters this fixed Playwright callback. No model-supplied JS. */
export function acceptanceProgram(plan: Plan, artifactDirectory: string): string {
	if (!plan || plan.version !== 1 || Object.keys(plan).some((key) => !["version", "steps"].includes(key)) || !Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 32) throw new Error("Invalid UI plan");
	for (const step of plan.steps) {
		if (!step || Object.keys(step).some((key) => !["action", "selector", "value"].includes(key)) || !["visible", "click", "fill", "text"].includes(step.action) || typeof step.selector !== "string" || step.selector.length < 1 || step.selector.length > 500 || (step.value !== undefined && (typeof step.value !== "string" || step.value.length > 2000)) || (["fill", "text"].includes(step.action) && typeof step.value !== "string")) throw new Error("Invalid UI step");
	}
	if (!plan.steps.some((step) => ["click", "fill"].includes(step.action))) throw new Error("UI plan needs an interaction");
	return `async page => {
 const steps = ${JSON.stringify(plan.steps)};
 const artifacts = ${JSON.stringify(artifactDirectory)};
 const errors = [], checks = [];
 const onError = error => errors.push(String(error.message));
 page.on('pageerror', onError);
 try {
  for (const theme of ['mono','sand','default']) for (const mode of ['light','dark']) {
   await page.evaluate(({theme,mode}) => { document.documentElement.dataset.theme=theme; document.documentElement.dataset.mode=mode; }, {theme,mode});
   await page.locator('#root').waitFor({state:'visible',timeout:10000});
   let assertions=1;
   for (const step of steps) {
    const target=page.locator(step.selector);
    await target.waitFor({state:'visible',timeout:10000});
    if (step.action==='click') await target.click({timeout:10000});
    else if (step.action==='fill') { await target.fill(step.value,{timeout:10000}); if(await target.inputValue()!==step.value) throw Error('Input value mismatch'); }
    else if(step.action==='text' && !(await target.innerText()).includes(step.value)) throw Error('Expected text absent');
    assertions++;
   }
   const layout=await page.evaluate(() => ({ width:innerWidth, overflow:document.documentElement.scrollWidth > innerWidth+2 }));
   if(layout.width<=0 || layout.overflow) throw Error('Invalid viewport or horizontal overflow');
   assertions++;
   const path=artifacts+'/'+theme+'-'+mode+'.png';
   await page.screenshot({path,fullPage:true});
   checks.push({theme,mode,assertions,screenshot:{path}});
  }
 } finally { page.off('pageerror',onError); }
 return {checks,errors};
}`;
}

export async function verifyUiAcceptance(options: {
	plan: Plan; reportFile: string;
	layout: { artifactDir: string };
	runPlaywright: (layout: unknown, args: string[], capture: boolean) => { status: number | null; stdout?: string; stderr?: string };
}): Promise<{ checks: Check[]; errors: string[] }> {
	const directory = dirname(options.reportFile);
	const callback = join(directory, "ui-acceptance.js");
	writeFileSync(callback, acceptanceProgram(options.plan, directory));
	const result = options.runPlaywright(options.layout, ["run-code", `--filename=${callback}`], true);
	if (result.status !== 0) throw new Error("Playwright UI acceptance failed");
	const block = result.stdout?.split(/### Result\r?\n/u)[1]?.split(/\r?\n### /u)[0].trim();
	if (!block) throw new Error("Playwright returned no acceptance result");
	const raw: unknown = JSON.parse(block);
	if (!raw || typeof raw !== "object" || !("checks" in raw) || !("errors" in raw) || !Array.isArray(raw.checks) || !Array.isArray(raw.errors) || raw.errors.some((e) => typeof e !== "string")) throw new Error("Invalid UI result");
	const checks: Check[] = raw.checks.map((value: unknown) => {
		if (!value || typeof value !== "object" || !("theme" in value) || typeof value.theme !== "string" || !("mode" in value) || typeof value.mode !== "string" || !("assertions" in value) || typeof value.assertions !== "number") throw new Error("Invalid UI assertion result");
		const path = join(directory, `${value.theme}-${value.mode}.png`);
		if (!["mono", "sand", "default"].includes(value.theme) || !["light", "dark"].includes(value.mode)) throw new Error("Invalid UI theme or mode");
		return { theme: value.theme, mode: value.mode, assertions: value.assertions, screenshot: { path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") } };
	});
	return { checks, errors: raw.errors };
}
