import * as EffectPackage from "effect";
import { Schema as RootSchema, SchemaParser as RootParser } from "effect";
import { defineRule as otherPackageDecode } from "@oxlint/plugins";
import {
  decodeUnknownSync as directSchemaDecode,
  encodeUnknownSync as directSchemaEncode,
} from "effect/Schema";
import * as SchemaNamespace from "effect/Schema";
import { decodeUnknownResult as directParserDecode } from "effect/SchemaParser";
import * as ParserNamespace from "effect/SchemaParser";

const StableLeaf = RootSchema.NonEmptyString;
const StableUser = RootSchema.Struct({
  id: RootSchema.Int,
  name: RootSchema.String,
});
const stableUserDecoder = RootSchema.decodeUnknownSync(StableUser);
const StableSpreadFields = { inherited: RootSchema.String } as const;
const stableComputedKey = "computed" as const;
let writableSchema = RootSchema.String;

export const rootNamedNamespace = (input: unknown) =>
  RootSchema.decodeUnknownSync(
    RootSchema.Struct({ name: RootSchema.String })
  )(input);

export const schemaSubpathNamespace = (input: unknown) =>
  SchemaNamespace.is(SchemaNamespace.Array(SchemaNamespace.Number))(input);

export const directSchemaAdapterAlias = (input: unknown) =>
  directSchemaDecode(
    SchemaNamespace.Tuple([SchemaNamespace.String, SchemaNamespace.Number])
  )(input);

export const rootSchemaParserNamespace = (input: unknown) =>
  (
    RootParser as typeof RootParser & {
      readonly decodeUnknownOption: typeof RootSchema.decodeUnknownOption;
    }
  ).decodeUnknownOption(RootSchema.Record(RootSchema.String, RootSchema.Int))(
    input
  );

export const parserSubpathNamespace = (input: unknown) =>
  ParserNamespace.encodeUnknownResult(
    SchemaNamespace.Literals(["open", "closed"])
  )(input);

export const directParserAdapterAlias = (input: unknown) =>
  directParserDecode(RootSchema.NonEmptyArray(RootSchema.String))(input);

export const transparentTypeScriptWrappers = (input: unknown) =>
  (RootSchema.decodeUnknownSync(
    RootSchema.Struct({ wrapped: RootSchema.Boolean }) satisfies RootSchema.Top
  ) as (value: unknown) => { readonly wrapped: boolean })(input);

export const nestedClosedConstruction = (input: unknown) =>
  SchemaNamespace.decodeUnknownSync(
    SchemaNamespace.Struct({
      records: SchemaNamespace.Array(
        SchemaNamespace.Union([
          SchemaNamespace.Tuple([
            SchemaNamespace.Literal("entry"),
            SchemaNamespace.Number,
          ]),
          SchemaNamespace.Literal(true),
        ])
      ),
    })
  )(input);

export const enclosingImmutableSchemaLeaf = (input: unknown) =>
  RootSchema.decodeUnknownSync(
    RootSchema.Struct({ stable: StableLeaf })
  )(input);

export const applicationTimeOptions = (input: unknown) =>
  directSchemaEncode(RootSchema.Literal("ready"))(input, { errors: "all" });

export const reusableAdapter = (input: unknown) => stableUserDecoder(input);

export const immediateStableSchema = (input: unknown) =>
  RootSchema.decodeUnknownSync(StableUser)(input);

export const schemaParameter = (
  schema: typeof StableUser,
  input: unknown
) => RootSchema.decodeUnknownSync(schema)(input);

export const functionLocalSchema = (input: unknown) => {
  const schema = RootSchema.Struct({ local: RootSchema.String });
  return RootSchema.decodeUnknownSync(schema)(input);
};

export const functionLocalLiteral = (
  tag: "open" | "closed",
  input: unknown
) =>
  RootSchema.decodeUnknownSync(
    RootSchema.Struct({ tag: RootSchema.Literal(tag) })
  )(input);

export const functionLocalFieldSchema = (
  schema: typeof RootSchema.String,
  input: unknown
) =>
  RootSchema.decodeUnknownSync(RootSchema.Struct({ value: schema }))(input);

export const factoryTimeOptions = (input: unknown) =>
  RootSchema.decodeUnknownSync(
    RootSchema.Struct({ configured: RootSchema.String }),
    { errors: "all" }
  )(input);

export const spreadFields = (input: unknown) =>
  RootSchema.decodeUnknownSync(
    RootSchema.Struct({
      ...StableSpreadFields,
      own: RootSchema.String,
    })
  )(input);

export const computedStructKey = (input: unknown) =>
  RootSchema.decodeUnknownSync(
    RootSchema.Struct({ [stableComputedKey]: RootSchema.String })
  )(input);

export const accessorStructField = (input: unknown) =>
  RootSchema.decodeUnknownSync(
    RootSchema.Struct({
      get value() {
        return RootSchema.String;
      },
    })
  )(input);

export const methodStructField = (input: unknown) =>
  RootSchema.decodeUnknownSync(
    RootSchema.Struct(
      ({
        value() {
          return RootSchema.String;
        },
      } as unknown) as { readonly value: typeof RootSchema.String }
    )
  )(input);

export const optionalAdapterCalls = (input: unknown) =>
  RootSchema.decodeUnknownSync?.(
    RootSchema.Struct({ optional: RootSchema.Boolean })
  )?.(input);

export const computedAdapterProperty = (input: unknown) =>
  RootSchema["decodeUnknownSync"](
    RootSchema.Struct({ computed: RootSchema.String })
  )(input);

export const returnAdapter = () =>
  RootSchema.decodeUnknownSync(
    RootSchema.Struct({ returned: RootSchema.String })
  );

const keepAdapter = <A>(adapter: A): A => adapter;

export const passAdapter = () =>
  keepAdapter(
    RootSchema.decodeUnknownSync(
      RootSchema.Struct({ passed: RootSchema.String })
    )
  );

export const moduleScopeInvocation = RootSchema.decodeUnknownSync(
  RootSchema.Struct({ once: RootSchema.String })
)({ once: "value" });

export const directAssertion = (input: unknown) => {
  RootSchema.asserts(
    RootSchema.Struct({ asserted: RootSchema.String }),
    input
  );
  return input;
};

export const toTypeConstruction = (input: unknown) =>
  RootSchema.decodeUnknownSync(
    RootSchema.toType(RootSchema.Struct({ value: RootSchema.String }))
  )(input);

export const flippedConstruction = (input: unknown) =>
  RootSchema.decodeUnknownSync(
    RootSchema.flip(RootSchema.Struct({ value: RootSchema.String }))
  )(input);

export const jsonStringConstruction = (input: unknown) =>
  RootSchema.decodeUnknownSync(
    RootSchema.fromJsonString(
      RootSchema.Struct({ value: RootSchema.String })
    )
  )(input);

export const checkedConstruction = (input: unknown) =>
  RootSchema.decodeUnknownSync(
    RootSchema.String.check(RootSchema.isMinLength(1))
  )(input);

class StableModel extends RootSchema.Class<StableModel>("StableModel")({
  value: RootSchema.String,
}) {}

export const stableClassSchema = (input: unknown) =>
  RootSchema.decodeUnknownSync(StableModel)(input);

const LocalSchema = {
  decodeUnknownSync: RootSchema.decodeUnknownSync,
  Struct: RootSchema.Struct,
};

export const localSchemaLookalike = (input: unknown) =>
  LocalSchema.decodeUnknownSync(
    LocalSchema.Struct({ local: RootSchema.String })
  )(input);

export const shadowedSchemaAlias = (
  RootSchema: typeof SchemaNamespace,
  input: unknown
) =>
  RootSchema.decodeUnknownSync(
    RootSchema.Struct({ shadowed: RootSchema.String })
  )(input);

export const shadowedDirectAdapter = (
  directSchemaDecode: typeof SchemaNamespace.decodeUnknownSync,
  input: unknown
) =>
  directSchemaDecode(
    RootSchema.Struct({ shadowed: RootSchema.String })
  )(input);

export const otherPackageImport = (input: unknown) =>
  (otherPackageDecode as unknown as typeof RootSchema.decodeUnknownSync)(
    RootSchema.Struct({ external: RootSchema.String })
  )(input);

declare const requireSchema: (
  path: "effect/Schema"
) => typeof import("effect/Schema");

const CommonJsSchema = requireSchema("effect/Schema");

export const commonJsImport = (input: unknown) =>
  CommonJsSchema.decodeUnknownSync(
    CommonJsSchema.Struct({ commonJs: CommonJsSchema.String })
  )(input);

const wrappedDecode = RootSchema.decodeUnknownSync;

export const reexportedWrapper = (input: unknown) =>
  wrappedDecode(RootSchema.Struct({ wrapped: RootSchema.String }))(input);

export const effectPackageChain = (input: unknown) =>
  EffectPackage.Schema.decodeUnknownSync(
    EffectPackage.Schema.Struct({ chained: EffectPackage.Schema.String })
  )(input);

const v3Compat = RootSchema as typeof RootSchema & {
  readonly decode: typeof RootSchema.decodeUnknownSync;
};

export const v3OnlySpelling = (input: unknown) =>
  v3Compat.decode(RootSchema.Struct({ legacy: RootSchema.String }))(input);

export const writableEnclosingBinding = (input: unknown) =>
  RootSchema.decodeUnknownSync(
    RootSchema.Struct({ writable: writableSchema })
  )(input);

const makeSchema = () => RootSchema.String;

export const arbitraryNestedCall = (input: unknown) =>
  RootSchema.decodeUnknownSync(
    RootSchema.Struct({ arbitrary: makeSchema() })
  )(input);

export const computedSchemaMember = (input: unknown) =>
  RootSchema.decodeUnknownSync(
    RootSchema.Struct({ computed: RootSchema["String"] })
  )(input);

class SchemaOwner {
  readonly schema = RootSchema.String;

  decode(input: unknown) {
    return RootSchema.decodeUnknownSync(
      RootSchema.Struct({ owned: this.schema })
    )(input);
  }
}

export const schemaOwner = new SchemaOwner();

class BaseSchemaOwner {
  protected get schema() {
    return RootSchema.String;
  }
}

export class DerivedSchemaOwner extends BaseSchemaOwner {
  decode(input: unknown) {
    return RootSchema.decodeUnknownSync(
      RootSchema.Struct({ inherited: super.schema })
    )(input);
  }
}

export const awaitedSchemaLeaf = async (input: unknown) =>
  RootSchema.decodeUnknownSync(
    RootSchema.Struct({
      value: await Promise.resolve(RootSchema.String),
    })
  )(input);

export function* yieldedSchemaLeaf(
  input: unknown
): Generator<typeof RootSchema.String, unknown, typeof RootSchema.String> {
  return RootSchema.decodeUnknownSync(
    RootSchema.Struct({ value: yield RootSchema.String })
  )(input);
}
