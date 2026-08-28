import { Effect } from "effect";

import { InvalidAnalyzerOutput } from "../errors.js";
import type { ProviderReceipt } from "../model.js";
import type { ProjectSnapshot } from "./project-snapshot.js";

const ENGINE_ORDER = ["effect-doctor", "effect-oxlint", "effect-tsgo"] as const;

export const validateProviderReceipts = Effect.fn("validateProviderReceipts")(
  function* (snapshot: ProjectSnapshot, receipts: readonly ProviderReceipt[]) {
    const expectedFiles = snapshot.files.map((file) => file.relative);
    const validated: ProviderReceipt[] = [];

    for (const engine of ENGINE_ORDER) {
      const matching = receipts.filter((receipt) => receipt.engine === engine);
      const [receipt] = matching;
      if (
        matching.length !== 1 ||
        receipt === undefined ||
        !receipt.complete ||
        JSON.stringify(receipt.analyzedFiles) !== JSON.stringify(expectedFiles)
      ) {
        return yield* new InvalidAnalyzerOutput({
          engine,
          message: `${engine} did not prove exact project snapshot coverage`,
        });
      }
      validated.push(receipt);
    }

    if (receipts.length !== ENGINE_ORDER.length) {
      return yield* new InvalidAnalyzerOutput({
        engine: "effect-doctor",
        message: "Analyzer providers returned unexpected receipts",
      });
    }
    return validated;
  }
);
