import { defineRule, eslintCompatPlugin } from "@oxlint/plugins";
import type { Comment, Context, ESTree, Rule, Variable } from "@oxlint/plugins";

const CANARY_RULE = "__file-canary";
export const INTEGRITY_VISIT_MESSAGE =
  "Effect Doctor suppression integrity file visit.";

type ImportBinding = "config-namespace" | "config-string" | "effect-namespace";

type TransparentExpression = Extract<
  ESTree.Expression,
  { readonly expression: ESTree.Expression }
>;

const TRANSPARENT_EXPRESSION_TYPES: ReadonlySet<string> = new Set([
  "ChainExpression",
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);

const IMPORT_BINDINGS: ReadonlyMap<string, ImportBinding> = new Map([
  ["effect:namespace", "effect-namespace"],
  ["effect:named:Config", "config-namespace"],
  ["effect/Config:namespace", "config-namespace"],
  ["effect/Config:named:string", "config-string"],
]);

const PUBLIC_SECRET_PATTERNS = [
  ["PUBLIC"],
  ["PUBLISHABLE"],
  ["CLIENT", "ID"],
] as const;

const PRIVATE_SECRET_PATTERNS = [
  ["SECRET"],
  ["PASSWORD"],
  ["PASSWD"],
  ["PASSPHRASE"],
  ["TOKEN"],
  ["KEY", "API"],
  ["KEY", "ACCESS"],
  ["KEY", "PRIVATE"],
  ["KEY", "SIGNING"],
  ["KEY", "ENCRYPTION"],
] as const;

const moduleExportName = (node: ESTree.ModuleExportName): string | undefined =>
  node.type === "Identifier" ? node.name : node.value;

const isTransparentExpression = (
  node: ESTree.Expression
): node is TransparentExpression => TRANSPARENT_EXPRESSION_TYPES.has(node.type);

const unwrapExpression = (initial: ESTree.Expression): ESTree.Expression => {
  let node = initial;
  while (isTransparentExpression(node)) {
    node = node.expression;
  }
  return node;
};

const staticString = (
  node: ESTree.Argument | undefined
): string | undefined => {
  if (node === undefined || node.type === "SpreadElement") {
    return undefined;
  }
  const expression = unwrapExpression(node);
  if (expression.type === "Literal" && typeof expression.value === "string") {
    return expression.value;
  }
  if (
    expression.type === "TemplateLiteral" &&
    expression.expressions.length === 0 &&
    expression.quasis.length === 1
  ) {
    return expression.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
};

const variableForReference = (
  context: Context,
  identifier: ESTree.IdentifierReference
): Variable | undefined => {
  const reference = context.sourceCode.scopeManager.scopes
    .flatMap((scope) => scope.references)
    .find((candidate) => candidate.identifier.range[0] === identifier.range[0]);
  return reference?.resolved ?? undefined;
};

const bindingForReference = (
  context: Context,
  bindings: ReadonlyMap<number, ImportBinding>,
  identifier: ESTree.IdentifierReference
): ImportBinding | undefined => {
  const variable = variableForReference(context, identifier);
  const definition = variable?.defs.find(
    (candidate) => candidate.type === "ImportBinding"
  );
  return definition === undefined
    ? undefined
    : bindings.get(definition.name.range[0]);
};

const importBinding = (
  source: string,
  specifier: ESTree.ImportDeclaration["specifiers"][number]
): ImportBinding | undefined => {
  if (specifier.type === "ImportNamespaceSpecifier") {
    return IMPORT_BINDINGS.get(`${source}:namespace`);
  }
  if (specifier.type !== "ImportSpecifier") {
    return undefined;
  }
  return IMPORT_BINDINGS.get(
    `${source}:named:${moduleExportName(specifier.imported)}`
  );
};

type ImportDeclaration = Extract<
  ESTree.Program["body"][number],
  { readonly type: "ImportDeclaration" }
>;

type ImportBindingEntry = readonly [number, ImportBinding];

const isImportDeclaration = (
  statement: ESTree.Program["body"][number]
): statement is ImportDeclaration => statement.type === "ImportDeclaration";

const importBindingEntry = (
  source: string,
  specifier: ImportDeclaration["specifiers"][number]
): ImportBindingEntry | undefined => {
  const binding = importBinding(source, specifier);
  return binding === undefined
    ? undefined
    : [specifier.local.range[0], binding];
};

const isImportBindingEntry = (
  entry: ImportBindingEntry | undefined
): entry is ImportBindingEntry => entry !== undefined;

const collectImportBindings = (
  program: ESTree.Program
): ReadonlyMap<number, ImportBinding> =>
  new Map(
    program.body
      .filter(isImportDeclaration)
      .flatMap((statement) =>
        statement.specifiers.map((specifier) =>
          importBindingEntry(statement.source.value, specifier)
        )
      )
      .filter(isImportBindingEntry)
  );

const identifierHasBinding = (
  context: Context,
  bindings: ReadonlyMap<number, ImportBinding>,
  expression: ESTree.Expression,
  expected: ImportBinding
): boolean => {
  const node = unwrapExpression(expression);
  return (
    node.type === "Identifier" &&
    bindingForReference(context, bindings, node) === expected
  );
};

const namedMember = (
  expression: ESTree.Expression,
  name: string
): ESTree.MemberExpression | undefined => {
  const node = unwrapExpression(expression);
  if (
    node.type !== "MemberExpression" ||
    node.computed ||
    node.property.name !== name
  ) {
    return undefined;
  }
  return node;
};

const isImportedConfigString = (
  context: Context,
  bindings: ReadonlyMap<number, ImportBinding>,
  callee: ESTree.Expression
): boolean =>
  callee.type === "Identifier" &&
  bindingForReference(context, bindings, callee) === "config-string";

const isNamespaceConfigString = (
  context: Context,
  bindings: ReadonlyMap<number, ImportBinding>,
  callee: ESTree.Expression
): boolean => {
  const stringMember = namedMember(callee, "string");
  if (stringMember === undefined) {
    return false;
  }
  if (
    identifierHasBinding(
      context,
      bindings,
      stringMember.object,
      "config-namespace"
    )
  ) {
    return true;
  }
  const configMember = namedMember(stringMember.object, "Config");
  return (
    configMember !== undefined &&
    identifierHasBinding(
      context,
      bindings,
      configMember.object,
      "effect-namespace"
    )
  );
};

const isConfigStringCall = (
  context: Context,
  bindings: ReadonlyMap<number, ImportBinding>,
  call: ESTree.CallExpression
): boolean => {
  const callee = unwrapExpression(call.callee);
  return (
    isImportedConfigString(context, bindings, callee) ||
    isNamespaceConfigString(context, bindings, callee)
  );
};

const matchesTokenPattern = (
  tokens: ReadonlySet<string>,
  pattern: readonly string[]
): boolean => pattern.every((token) => tokens.has(token));

const isSecretName = (name: string): boolean => {
  const normalized = name.toUpperCase().replaceAll(/[^A-Z0-9]+/gu, "_");
  const tokens = new Set(normalized.split("_").filter(Boolean));
  if (
    PUBLIC_SECRET_PATTERNS.some((pattern) =>
      matchesTokenPattern(tokens, pattern)
    )
  ) {
    return false;
  }
  return (
    PRIVATE_SECRET_PATTERNS.some((pattern) =>
      matchesTokenPattern(tokens, pattern)
    ) ||
    normalized === "DATABASE_URL" ||
    normalized.endsWith("_DATABASE_URL")
  );
};

const preferConfigRedacted = defineRule({
  meta: {
    docs: {
      description:
        "Prefer Config.redacted for statically named secret configuration values.",
    },
    type: "suggestion",
  },
  createOnce(context) {
    let bindings: ReadonlyMap<number, ImportBinding> = new Map();
    return {
      before() {
        bindings = collectImportBindings(context.sourceCode.ast);
      },
      CallExpression(node) {
        const name = staticString(node.arguments[0]);
        if (
          name === undefined ||
          !isSecretName(name) ||
          !isConfigStringCall(context, bindings, node)
        ) {
          return;
        }
        context.report({
          message: `Use Config.redacted for secret configuration ${name}.`,
          node,
        });
      },
    };
  },
});

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

const diagnosticSuppressionIntegrity = defineRule({
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

const fileCanary = defineRule({
  meta: {
    docs: { description: "Internal Effect Doctor plugin liveness canary." },
    type: "problem",
  },
  createOnce(context) {
    return {
      Program(node) {
        context.report({ message: "Effect Doctor file canary.", node });
      },
    };
  },
});

export const doctorPluginRules = {
  [CANARY_RULE]: fileCanary,
  "__diagnostic-suppression-integrity": diagnosticSuppressionIntegrity,
  "prefer-config-redacted": preferConfigRedacted,
} satisfies Readonly<Record<string, Rule>>;

export default eslintCompatPlugin({
  meta: { name: "effect-doctor" },
  rules: doctorPluginRules,
});
