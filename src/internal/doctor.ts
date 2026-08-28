import {
  createScanner,
  LanguageVariant,
  SyntaxKind,
} from "typescript/unstable/ast";

import { fingerprintFinding } from "../fingerprint.js";
import type {
  EngineRun,
  Finding,
  FindingWithoutFingerprint,
  Position,
} from "../model.js";
import { DOCTOR_VERSION } from "../version.js";
import type { AnalyzedSource } from "./tsgo.js";

const DIRECTIVE_LINE =
  /^(?<prefix>\s*(?:\*\s*)?)(?<directive>(?:@effect-diagnostics(?:-next-line)?|@ts-(?:expect-error|ignore|nocheck)|(?:eslint|oxlint)-disable(?:-line|-next-line)?|biome-ignore)\b.*)$/u;

const positionAt = (source: string, offset: number): Position => {
  const before = source.slice(0, offset);
  const lines = before.split(/\r\n|\r|\n/u);
  return {
    column: [...(lines.at(-1) ?? "")].length + 1,
    line: lines.length,
  };
};

const directiveName = (evidence: string): string =>
  evidence.split(/\s/u, 1)[0] ?? evidence;

const analyzeComment = (
  analyzedSource: AnalyzedSource,
  commentStart: number,
  commentText: string
): readonly Finding[] => {
  const findings: Finding[] = [];
  const content = commentText.slice(2);
  const lines = content.split(/\r\n|\r|\n/u);
  let lineOffset = 0;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s*\*\/\s*$/u, "");
    const match = DIRECTIVE_LINE.exec(line);
    const prefix = match?.groups?.prefix;
    const matchedDirective = match?.groups?.directive;

    if (prefix !== undefined && matchedDirective !== undefined) {
      const evidence = matchedDirective.trimEnd();
      const startOffset = commentStart + 2 + lineOffset + prefix.length;
      const endOffset = startOffset + evidence.length;
      const withoutFingerprint = {
        category: "antipattern",
        evidence,
        location: {
          end: positionAt(analyzedSource.source, endOffset),
          file: analyzedSource.relative,
          start: positionAt(analyzedSource.source, startOffset),
        },
        message: `${directiveName(evidence)} suppresses analyzer diagnostics and should remain visible to review`,
        provenance: {
          engine: "effect-doctor",
          nativeRuleId: "diagnostic-suppression",
        },
        ruleId: "effect-doctor/diagnostic-suppression",
        severity: "advice",
        title: "Diagnostic Suppression",
      } satisfies FindingWithoutFingerprint;
      findings.push({
        ...withoutFingerprint,
        fingerprint: fingerprintFinding(withoutFingerprint),
      });
    }

    lineOffset += rawLine.length;
    const newline = content.slice(lineOffset).match(/^(?:\r\n|\r|\n)/u)?.[0];
    lineOffset += newline?.length ?? 0;
  }

  return findings;
};

const analyzeSource = (source: AnalyzedSource): readonly Finding[] => {
  const scanner = createScanner(false, LanguageVariant.Standard, source.source);
  const findings: Finding[] = [];

  for (let token = scanner.scan(); token !== SyntaxKind.EndOfFile;) {
    if (
      token === SyntaxKind.SingleLineCommentTrivia ||
      token === SyntaxKind.MultiLineCommentTrivia
    ) {
      findings.push(
        ...analyzeComment(
          source,
          scanner.getTokenStart(),
          scanner.getTokenText()
        )
      );
    }
    token = scanner.scan();
  }

  return findings;
};

export const analyzeDoctorRules = (
  sources: readonly AnalyzedSource[]
): readonly Finding[] => sources.flatMap(analyzeSource);

export const doctorEngineRun = (
  sources: readonly AnalyzedSource[]
): EngineRun => ({
  analyzedFiles: sources.map((source) => source.relative),
  complete: true,
  engine: "effect-doctor",
  version: DOCTOR_VERSION,
});
