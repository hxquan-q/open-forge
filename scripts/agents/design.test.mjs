// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { auditDesign } from "./design.mjs";

const path = "apps/desktop/src/renderer/example.tsx";
describe("DESIGN source checks are explicit about their coverage", () => {
	it("finds new violations including a copied occurrence of existing bad style", () => {
		const before = 'const a = <div className="bg-red-500" />;';
		const after = `${before} const b = <button className="bg-red-500 rounded-3xl transition-all border-2 text-[18px]" />;`;
		const result = auditDesign([{ path, before, after }]);
		expect(new Set(result.findings.map((finding) => finding.rule))).toEqual(
			new Set(["D01", "D03", "D04", "D05", "D06", "D07"]),
		);
		expect(result.accepted).toBe(false);
	});
	it("does not treat literal token compliance as proof of behavior or screenshots", () => {
		const result = auditDesign([
			{ path, before: "", after: 'const a = <Button className="bg-primary text-foreground text-[14px]" />;' },
		]);
		expect(result.lint).toBe("passed");
		expect(result.accepted).toBe(false);
		expect(result.gaps.some((gap) => gap.includes("six theme"))).toBe(true);
		expect(auditDesign([{ path: "README.md", before: "", after: "bg-red-500" }]).accepted).toBe(true);
	});
	it("does not flag unchanged legacy styles but records malformed sources as a gap", () => {
		expect(auditDesign([{ path, before: 'const a="bg-red-500";', after: 'const a="bg-red-500";' }]).findings).toEqual(
			[],
		);
		expect(
			auditDesign([{ path, before: "", after: "const a = <" }]).gaps.some((gap) => gap.includes("parse failed")),
		).toBe(true);
	});
});
