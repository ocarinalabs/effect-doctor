import type { Context, ESTree } from "@oxlint/plugins";

import {
  bindingForReference,
  collectImportBindings,
  unwrapExpression,
} from "./ast.ts";

export type EffectModule = {
  readonly moduleName: string;
  readonly namedImports: readonly string[];
  readonly packagePath: string;
};

export type ModuleBinding =
  | { readonly kind: "export"; readonly name: string }
  | { readonly kind: "module" }
  | { readonly kind: "package" };

export type ModuleBindings = ReadonlyMap<number, ModuleBinding>;

const PACKAGE_BINDING: ModuleBinding = { kind: "package" };
const MODULE_BINDING: ModuleBinding = { kind: "module" };

export const defineEffectModule = (
  packagePath: string,
  moduleName: string,
  namedImports: readonly string[] = []
): EffectModule => ({ moduleName, namedImports, packagePath });

export const moduleImportBindings = (
  module: EffectModule
): ReadonlyMap<string, ModuleBinding> =>
  new Map<string, ModuleBinding>([
    [`${module.packagePath}:namespace`, PACKAGE_BINDING],
    [`${module.packagePath}:named:${module.moduleName}`, MODULE_BINDING],
    [`${module.packagePath}/${module.moduleName}:namespace`, MODULE_BINDING],
    ...module.namedImports.map((name): readonly [string, ModuleBinding] => [
      `${module.packagePath}/${module.moduleName}:named:${name}`,
      { kind: "export", name },
    ]),
  ]);

export const collectModuleBindings = (
  context: Context,
  module: EffectModule
): ModuleBindings =>
  collectImportBindings(context.sourceCode.ast, moduleImportBindings(module));

const bindingKind = (
  context: Context,
  bindings: ModuleBindings,
  expression: ESTree.Expression | ESTree.Super
): ModuleBinding["kind"] | undefined => {
  if (expression.type === "Super") {
    return undefined;
  }
  const node = unwrapExpression(expression);
  return node.type === "Identifier"
    ? bindingForReference(context, bindings, node)?.kind
    : undefined;
};

const isModuleObject = (
  context: Context,
  bindings: ModuleBindings,
  module: EffectModule,
  expression: ESTree.Expression | ESTree.Super
): boolean => {
  if (expression.type === "Super") {
    return false;
  }
  const node = unwrapExpression(expression);
  if (node.type === "Identifier") {
    return bindingKind(context, bindings, node) === "module";
  }
  return (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property.type === "Identifier" &&
    node.property.name === module.moduleName &&
    bindingKind(context, bindings, node.object) === "package"
  );
};

export const moduleExportName = (
  context: Context,
  bindings: ModuleBindings,
  module: EffectModule,
  expression: ESTree.Expression | ESTree.Super
): string | undefined => {
  if (expression.type === "Super") {
    return undefined;
  }
  const node = unwrapExpression(expression);
  if (node.type === "Identifier") {
    const binding = bindingForReference(context, bindings, node);
    return binding?.kind === "export" ? binding.name : undefined;
  }
  if (
    node.type !== "MemberExpression" ||
    node.computed ||
    node.property.type !== "Identifier"
  ) {
    return undefined;
  }
  return isModuleObject(context, bindings, module, node.object)
    ? node.property.name
    : undefined;
};
