#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { effectDoctorCommand } from "./cli.js";
import { DOCTOR_VERSION } from "./version.js";

effectDoctorCommand.pipe(
  Command.run({ version: DOCTOR_VERSION }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain({ disableErrorReporting: true })
);
