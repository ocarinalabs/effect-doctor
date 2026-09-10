// oxlint-disable effect-doctor/diagnostic-suppression
import * as EffectNamespace from "effect";
import { Config, Config as AppConfig, Schema } from "effect";
import * as ConfigModule from "effect/Config";
import { String as configString } from "effect/Config";
import * as SchemaModule from "effect/Schema";
import { String as SchemaString } from "effect/Schema";

export const password = Config.String("DATABASE_PASSWORD");
export const token = AppConfig.String("SERVICE_TOKEN");
export const signingKey = EffectNamespace.Config.String("SIGNING_KEY");
export const privateKey = ConfigModule.String("PRIVATE_KEY");
export const apiSecret = configString("API_SECRET");
export const parenthesizedSecret = Config.String(("PARENTHESIZED_SECRET"));
export const assertedSecret = Config.String("ASSERTED_SECRET" as string);
export const nonNullSecret = Config.String("NON_NULL_SECRET"!);
export const satisfiesSecret = Config.String(
  "SATISFIES_SECRET" satisfies string
);
export const typeAssertionSecret = Config.String(
  <string>"TYPE_ASSERTION_SECRET"
);
export const templateSecret = Config.String(`TEMPLATE_SECRET`);
export const wrappedCalleeSecret = ((Config.String))("WRAPPED_CALLEE_SECRET");
export const schemaPassword = Config.schema(
  Schema.String,
  "SCHEMA_PASSWORD"
);
export const nonEmptySchemaToken = AppConfig.schema(
  Schema.NonEmptyString,
  "SCHEMA_TOKEN"
);
export const packageSchemaSecret = EffectNamespace.Config.schema(
  EffectNamespace.Schema.String,
  "PACKAGE_SECRET"
);
export const moduleSchemaPrivateKey = ConfigModule.schema(
  SchemaModule.String,
  "MODULE_PRIVATE_KEY"
);
export const importedSchemaAccessKey = Config.schema(
  SchemaString,
  "IMPORTED_ACCESS_KEY"
);

export const publicKey = Config.String("PUBLIC_API_KEY");
export const publishableKey = Config.String("STRIPE_PUBLISHABLE_KEY");
export const clientId = Config.String("OAUTH_CLIENT_ID");
export const dynamicName = Config.String(process.env.CONFIG_NAME);
export const dynamicTemplateName = Config.String(`${process.env.CONFIG_NAME}`);
export const redactedSchema = Config.schema(
  Schema.Redacted(Schema.String),
  "SAFE_PASSWORD"
);
export const publicSchemaKey = Config.schema(
  Schema.String,
  "PUBLIC_SCHEMA_KEY"
);
const customSecretSchema = Schema.Redacted(Schema.NonEmptyString);
export const opaqueRedactedSchema = Config.schema(
  customSecretSchema,
  "CUSTOM_PASSWORD"
);

export const shadowed = (Config: { readonly string: (name: string) => string }) =>
  Config.String("LOCAL_SECRET");

// @ts-expect-error deliberate first-party liveness fixture
export const mismatch: number = "one";

// oxlint-disable-line effect-doctor/diagnostic-suppression
export const hiddenSuppression = true;
export const suppressionLookalike =
  "oxlint-disable-line effect-doctor/diagnostic-suppression";
export const suppressionTemplateLookalike =
  `example: ${"oxlint-disable-line imaginary/lookalike"}`;
// Documentation example: oxlint-disable-line imaginary/lookalike
export const ttl = Config.String("TOKEN_TTL_SECONDS");
export const santa = Config.String("SECRET_SANTA_ENABLED");
export const minLength = Config.String("PASSWORD_MIN_LENGTH");
export const resetUrl = Config.String("PASSWORD_RESET_URL");
export const keyPath = Config.String("PRIVATE_KEY_PATH");
export const apiKey = Config.String("apiKey");
