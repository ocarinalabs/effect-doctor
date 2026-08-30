import type { Finding } from "../model.js";
import { compareCodeUnits } from "./order.js";

export const compareFindingOrder = (left: Finding, right: Finding): number =>
  compareCodeUnits(left.location.file, right.location.file) ||
  left.location.start.line - right.location.start.line ||
  left.location.start.column - right.location.start.column ||
  compareCodeUnits(left.ruleId, right.ruleId) ||
  compareCodeUnits(left.message, right.message);
