import { defineRule } from "@oxlint/plugins";
import type { Comment, Context } from "@oxlint/plugins";

import { INTEGRITY_VISIT_MESSAGE } from "./diagnostic-suppression-contract.ts";

const DIRECTIVE_LINE =
  /^(?<prefix>\s*(?:\*\s*)?)(?<directive>(?:@effect-diagnostics(?:-next-line)?|@ts-(?:expect-error|ignore|nocheck)|(?:eslint-disable|oxlint(?:-|_)disable)(?:-line|-next-line)?|biome-ignore)\b.*)$/u;

type DirectiveMatch = {
  readonly evidence: string;
  readonly prefixLength: number;
};

const matchDirective = (rawLine: string): DirectiveMatch | undefined => {
  const line = rawLine.replace(/\s*\*\/\s*$/u, "");
  const match = DIRECTIVE_LINE.exec(line);
  if (match === null) {
    return undefined;
  }
  const { directive = "", prefix = "" } = match.groups ?? {};
  return { evidence: directive.trimEnd(), prefixLength: prefix.length };
};

const reportDirective = (
  context: Context,
  baseOffset: number,
  lineOffset: number,
  rawLine: string
): void => {
  const directive = matchDirective(rawLine);
  if (directive === undefined) {
    return;
  }
  const start = baseOffset + lineOffset + directive.prefixLength;
  const canonicalEvidence = directive.evidence.replace(/^oxlint_/u, "oxlint-");
  const [directiveName] = canonicalEvidence.split(/\s/u, 1);
  context.report({
    loc: {
      end: context.sourceCode.getLocFromIndex(
        start + directive.evidence.length
      ),
      start: context.sourceCode.getLocFromIndex(start),
    },
    message: `${directiveName ?? canonicalEvidence} suppresses analyzer diagnostics and should remain visible to review.`,
  });
};

const newlineLengthAt = (source: string, offset: number): number =>
  source.slice(offset).match(/^(?:\r\n|\r|\n)/u)?.[0].length ?? 0;

const reportCommentSuppressions = (
  context: Context,
  comment: Comment
): void => {
  const baseOffset = comment.range[0] + 2;
  const lines = comment.value.split(/\r\n|\r|\n/u);
  let lineOffset = 0;
  for (const rawLine of lines) {
    reportDirective(context, baseOffset, lineOffset, rawLine);
    lineOffset += rawLine.length;
    lineOffset += newlineLengthAt(comment.value, lineOffset);
  }
};

export const diagnosticSuppressionIntegrity = defineRule({
  meta: {
    docs: {
      description: "Keep analyzer suppression directives visible for review.",
    },
    type: "suggestion",
  },
  createOnce(context) {
    return {
      Program(node) {
        context.report({ message: INTEGRITY_VISIT_MESSAGE, node });
        for (const comment of context.sourceCode.getAllComments()) {
          reportCommentSuppressions(context, comment);
        }
      },
    };
  },
});
