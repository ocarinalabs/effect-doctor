import { Effect } from "effect";
import { HttpClient } from "effect/unstable/http";
import * as Http from "effect/unstable/http";
import {
  get as httpGet,
  HttpClient as HttpClientService,
} from "effect/unstable/http/HttpClient";
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

export const fetchInsideTransaction = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(
    Effect.promise((signal) =>
      fetch("https://example.com/in-transaction", { signal })
    )
  );
});

export const tryPromiseFetchInsideTransaction = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(
    Effect.tryPromise({
      try: (signal) =>
        fetch("https://example.com/try-in-transaction", { signal }),
      catch: (cause) => cause,
    })
  );
});

export const httpClientInsideTransaction = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(
    HttpClient.get("https://example.com/in-transaction")
  );
});

export const namedHttpClientInsideTransaction = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(
    httpGet("https://example.com/named-in-transaction")
  );
});

export const fetchInsideTransactionGenerator = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      return yield* Effect.promise((signal) =>
        fetch("https://example.com/generator-in-transaction", { signal })
      );
    })
  );
});

export const httpClientInsideTransactionGenerator = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      return yield* HttpClient.get("https://example.com/gen");
    })
  );
});

export const serviceClientInsideTransaction = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const client = yield* HttpClient.HttpClient;
  return yield* sql.withTransaction(
    client.get("https://example.com/service-in-transaction")
  );
});

export const namedServiceClientInsideTransaction = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const http = yield* HttpClientService;
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      return yield* http.post(
        "https://example.com/named-service-in-transaction"
      );
    })
  );
});

export const packageHttpClientInsideTransaction = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(
    Http.HttpClient.get("https://example.com/package-in-transaction")
  );
});

export const serviceClientBeforeTransaction = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const client = yield* HttpClient.HttpClient;
  const response = yield* client.get(
    "https://example.com/service-before-transaction"
  );
  yield* sql.withTransaction(sql`SELECT 1`);
  return response;
});

const clientLookalike = {
  get: (url: string) => Effect.succeed(url),
};

export const lookalikeClientInsideTransaction = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(
    clientLookalike.get("https://example.com/lookalike-in-transaction")
  );
});

export const fetchBeforeTransaction = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const response = yield* Effect.promise((signal) =>
    fetch("https://example.com/before-transaction", { signal })
  );
  yield* sql.withTransaction(sql`SELECT 1`);
  return response;
});

export const deferredFetchValue = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(
    Effect.succeed(() => fetch("https://example.com/deferred"))
  );
});

export const deferredNestedHttpEffect = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(
    Effect.succeed({
      later: Effect.gen(function* () {
        return yield* HttpClient.get("https://example.com/deferred-http");
      }),
    })
  );
});

export function* nonDelegatingGenerator() {
  const sql = yield SqlClient.SqlClient;
  return sql`BEGIN`;
}

const sql = String.raw;

export const unrelatedTemplate = sql`BEGIN`;
