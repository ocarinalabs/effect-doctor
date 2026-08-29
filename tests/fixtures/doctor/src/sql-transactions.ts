import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { SqlClient as SqlClientService } from "effect/unstable/sql/SqlClient";

export const manualTransaction = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`BEGIN`;
  yield* sql`COMMIT`;
});

export const aliasedManualTransaction = Effect.gen(function* () {
  const database = yield* SqlClientService;
  yield* database`ROLLBACK`;
});

export const managedTransaction = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(sql`SELECT 1`);
});

const sql = String.raw;

export const unrelatedTemplate = sql`BEGIN`;
