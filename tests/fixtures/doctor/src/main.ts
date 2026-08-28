// oxlint-disable effect-doctor/diagnostic-suppression
import * as EffectNamespace from "effect";
import { Config, Config as AppConfig } from "effect";
import * as ConfigModule from "effect/Config";
import { string as configString } from "effect/Config";

export const password = Config.string("DATABASE_PASSWORD");
export const token = AppConfig.string("SERVICE_TOKEN");
export const signingKey = EffectNamespace.Config.string("SIGNING_KEY");
export const privateKey = ConfigModule.string("PRIVATE_KEY");
export const apiSecret = configString("API_SECRET");
export const parenthesizedSecret = Config.string(("PARENTHESIZED_SECRET"));
export const assertedSecret = Config.string("ASSERTED_SECRET" as string);
export const nonNullSecret = Config.string("NON_NULL_SECRET"!);
export const satisfiesSecret = Config.string(
  "SATISFIES_SECRET" satisfies string
);
export const typeAssertionSecret = Config.string(
  <string>"TYPE_ASSERTION_SECRET"
);
export const templateSecret = Config.string(`TEMPLATE_SECRET`);
export const wrappedCalleeSecret = ((Config.string))("WRAPPED_CALLEE_SECRET");

export const publicKey = Config.string("PUBLIC_API_KEY");
export const publishableKey = Config.string("STRIPE_PUBLISHABLE_KEY");
export const clientId = Config.string("OAUTH_CLIENT_ID");
export const dynamicName = Config.string(process.env.CONFIG_NAME);
export const dynamicTemplateName = Config.string(`${process.env.CONFIG_NAME}`);

export const shadowed = (Config: { readonly string: (name: string) => string }) =>
  Config.string("LOCAL_SECRET");

// @ts-expect-error deliberate first-party liveness fixture
export const mismatch: number = "one";

// oxlint-disable-line effect-doctor/diagnostic-suppression
export const hiddenSuppression = true;
export const suppressionLookalike =
  "oxlint-disable-line effect-doctor/diagnostic-suppression";
export const suppressionTemplateLookalike =
  `example: ${"oxlint-disable-line imaginary/lookalike"}`;
// Documentation example: oxlint-disable-line imaginary/lookalike
