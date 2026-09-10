export type SourcePosition = {
  readonly column: number;
  readonly line: number;
};

export type PositionIndex = {
  readonly length: number;
  readonly positionAt: (offset: number) => SourcePosition | undefined;
};

const CARRIAGE_RETURN = 0x0d;
const LINE_FEED = 0x0a;
const LINE_SEPARATOR = 0x20_28;
const PARAGRAPH_SEPARATOR = 0x20_29;

const isSingleLineBreak = (code: number): boolean =>
  code === LINE_FEED || code === LINE_SEPARATOR || code === PARAGRAPH_SEPARATOR;

const lineStartOffsets = (source: string): readonly number[] => {
  const starts = [0];
  let index = 0;
  while (index < source.length) {
    const code = source.codePointAt(index);
    if (code === CARRIAGE_RETURN) {
      if (source.codePointAt(index + 1) === LINE_FEED) {
        index += 1;
      }
      starts.push(index + 1);
    } else if (code !== undefined && isSingleLineBreak(code)) {
      starts.push(index + 1);
    }
    index += 1;
  }
  return starts;
};

export const lineIndexAt = (
  starts: readonly number[],
  offset: number
): number => {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((starts[middle] ?? 0) <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
};

export const makePositionIndex = (source: string): PositionIndex => {
  const starts = lineStartOffsets(source);
  return {
    length: source.length,
    positionAt: (offset) => {
      if (!Number.isInteger(offset) || offset < 0 || offset > source.length) {
        return undefined;
      }
      const line = lineIndexAt(starts, offset);
      return { column: offset - (starts[line] ?? 0) + 1, line: line + 1 };
    },
  };
};
