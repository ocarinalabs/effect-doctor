import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

import {
  bindingForReference,
  collectImportBindings,
  identifierHasBinding,
  namedMember,
  unwrapExpression,
} from "./ast.ts";
import { jsonStringifyCall } from "./json.ts";

type HttpResponseBinding = "namespace" | "text";

const HTTP_RESPONSE_IMPORTS: ReadonlyMap<string, HttpResponseBinding> = new Map(
  [
    ["effect/unstable/http:named:HttpServerResponse", "namespace"],
    ["effect/unstable/http/HttpServerResponse:namespace", "namespace"],
    ["effect/unstable/http/HttpServerResponse:named:text", "text"],
  ]
);

const isTextResponse = (
  context: Context,
  bindings: ReadonlyMap<number, HttpResponseBinding>,
  expression: ESTree.Expression
): boolean => {
  const callee = unwrapExpression(expression);
  if (callee.type === "Identifier") {
    return bindingForReference(context, bindings, callee) === "text";
  }
  const member = namedMember(callee, "text");
  return (
    member !== undefined &&
    identifierHasBinding(context, bindings, member.object, "namespace")
  );
};

export const preferHttpJsonResponse = defineRule({
  meta: {
    docs: {
      description:
        "Use Effect's JSON response constructor instead of stringifying into a text response.",
    },
    type: "suggestion",
  },
  createOnce(context) {
    let bindings: ReadonlyMap<number, HttpResponseBinding> = new Map();
    return {
      before() {
        bindings = collectImportBindings(
          context.sourceCode.ast,
          HTTP_RESPONSE_IMPORTS
        );
      },
      CallExpression(node) {
        if (!isTextResponse(context, bindings, node.callee)) {
          return;
        }
        const [body] = node.arguments;
        if (body === undefined || body.type === "SpreadElement") {
          return;
        }
        const stringify = jsonStringifyCall(context, body);
        if (stringify !== undefined) {
          context.report({
            message:
              "Use HttpServerResponse.json so serialization failures and content type remain explicit.",
            node: stringify,
          });
        }
      },
    };
  },
});
