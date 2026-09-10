import type { Context } from "@oxlint/plugins";

import { defineEffectModule } from "./effect-module.ts";
import { makeServiceTracker } from "./service-tracker.ts";
import type { ServiceTracker } from "./service-tracker.ts";

const SQL_CLIENT_MODULE = defineEffectModule(
  "effect/unstable/sql",
  "SqlClient",
  ["SqlClient"]
);

export type SqlClientTracker = ServiceTracker;

export const makeSqlClientTracker = (context: Context): SqlClientTracker =>
  makeServiceTracker(context, SQL_CLIENT_MODULE, "SqlClient");
