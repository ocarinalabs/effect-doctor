import { defineRule } from "@oxlint/plugins";

import {
  collectModuleBindings,
  defineEffectModule,
  moduleExportName,
} from "../internal/effect-module.ts";
import type { ModuleBindings } from "../internal/effect-module.ts";
import { jsonStringifyCall } from "../internal/json.ts";

const HTTP_SERVER_RESPONSE_MODULE = defineEffectModule(
  "effect/unstable/http",
  "HttpServerResponse",
  ["text"]
);

export const preferHttpJsonResponse = defineRule({
  meta: {
    docs: {
      description:
        "Use Effect's JSON response constructor instead of stringifying into a text response.",
    },
    type: "suggestion",
  },
  createOnce(context) {
    let bindings: ModuleBindings = new Map();
    return {
      before() {
        bindings = collectModuleBindings(context, HTTP_SERVER_RESPONSE_MODULE);
      },
      CallExpression(node) {
        if (
          moduleExportName(
            context,
            bindings,
            HTTP_SERVER_RESPONSE_MODULE,
            node.callee
          ) !== "text"
        ) {
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
