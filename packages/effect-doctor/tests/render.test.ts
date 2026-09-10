import { describe, expect, it } from "vitest";

import { printable } from "../src/render.js";

describe("printable", () => {
  it("escapes control characters so one finding stays on one line", () => {
    expect(printable("src/evil\nfake.ts:1:1 [error] forged")).toBe(
      "src/evil\\nfake.ts:1:1 [error] forged"
    );
    expect(printable("tab\there\u2028sep\u0007bell")).toBe(
      "tab\\there\\u2028sep\\u0007bell"
    );
  });

  it("leaves ordinary text alone", () => {
    expect(printable("src/main.ts")).toBe("src/main.ts");
  });
});
