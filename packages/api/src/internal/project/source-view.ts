import { Buffer } from "node:buffer";

import { lineIndexAt, makePositionIndex } from "@effect-doctor/core";
import type { PositionIndex, SourcePosition } from "@effect-doctor/core";

export type AnalyzedSource = {
  readonly absolute: string;
  readonly bomLength: number;
  readonly relative: string;
  readonly source: string;
};

export type SourceView = {
  readonly bytes: Buffer;
  readonly byteLineStarts: readonly number[];
  readonly index: PositionIndex;
  readonly isAscii: boolean;
};

const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const SEPARATOR_LEAD = 0xe2;
const SEPARATOR_SECOND = 0x80;
const LINE_SEPARATOR_TAIL = 0xa8;
const PARAGRAPH_SEPARATOR_TAIL = 0xa9;
const FIRST_CONTINUATION_BYTE = 0x80;
const LAST_CONTINUATION_BYTE = 0xbf;

const views = new WeakMap<AnalyzedSource, SourceView>();

const isSeparatorAt = (bytes: Buffer, index: number): boolean =>
  bytes[index] === SEPARATOR_LEAD &&
  bytes[index + 1] === SEPARATOR_SECOND &&
  (bytes[index + 2] === LINE_SEPARATOR_TAIL ||
    bytes[index + 2] === PARAGRAPH_SEPARATOR_TAIL);

const byteLineStartOffsets = (bytes: Buffer): readonly number[] => {
  const starts = [0];
  let index = 0;
  while (index < bytes.byteLength) {
    const byte = bytes[index];
    if (byte === CARRIAGE_RETURN) {
      if (bytes[index + 1] === LINE_FEED) {
        index += 1;
      }
      starts.push(index + 1);
    } else if (byte === LINE_FEED) {
      starts.push(index + 1);
    } else if (isSeparatorAt(bytes, index)) {
      index += 2;
      starts.push(index + 1);
    }
    index += 1;
  }
  return starts;
};

export const sourceView = (source: AnalyzedSource): SourceView => {
  const cached = views.get(source);
  if (cached !== undefined) {
    return cached;
  }
  const bytes = Buffer.from(source.source, "utf-8");
  const view: SourceView = {
    byteLineStarts: byteLineStartOffsets(bytes),
    bytes,
    index: makePositionIndex(source.source),
    isAscii: bytes.byteLength === source.source.length,
  };
  views.set(source, view);
  return view;
};

export const bytePositionAt = (
  view: SourceView,
  byteOffset: number
): SourcePosition | undefined => {
  if (
    !Number.isInteger(byteOffset) ||
    byteOffset < 0 ||
    byteOffset > view.bytes.byteLength
  ) {
    return undefined;
  }
  const line = lineIndexAt(view.byteLineStarts, byteOffset);
  return {
    column: byteOffset - (view.byteLineStarts[line] ?? 0) + 1,
    line: line + 1,
  };
};

const isContinuationByte = (byte: number | undefined): boolean =>
  byte !== undefined &&
  byte >= FIRST_CONTINUATION_BYTE &&
  byte <= LAST_CONTINUATION_BYTE;

export const codeUnitOffsetAt = (
  view: SourceView,
  byteOffset: number
): number | undefined => {
  if (
    !Number.isInteger(byteOffset) ||
    byteOffset < 0 ||
    byteOffset > view.bytes.byteLength
  ) {
    return undefined;
  }
  if (view.isAscii) {
    return byteOffset;
  }
  if (
    byteOffset < view.bytes.byteLength &&
    isContinuationByte(view.bytes[byteOffset])
  ) {
    return undefined;
  }
  return view.bytes.toString("utf-8", 0, byteOffset).length;
};
