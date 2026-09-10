import { defineRule } from "@oxlint/plugins";

export const fileCanary = defineRule({
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
