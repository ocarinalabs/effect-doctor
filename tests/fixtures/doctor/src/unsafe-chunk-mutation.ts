import { Chunk } from "effect";
import {
  fromArrayUnsafe as unsafeFromArray,
  fromIterable,
} from "effect/Chunk";
import * as ChunkModule from "effect/Chunk";

const pushed = [1, 2, 3];
export const pushedChunk = Chunk.fromArrayUnsafe(pushed);
pushed.push(4);

const assigned = [1, 2, 3];
export const assignedChunk = ChunkModule.fromArrayUnsafe(assigned);
assigned[0] = 4;

const updated = [1, 2, 3];
export const updatedChunk = unsafeFromArray(updated);
updated[0]++;

const sorted = [3, 1, 2];
export const sortedChunk = Chunk.fromArrayUnsafe(sorted);
sorted.sort((left, right) => left - right);

const mutatedBeforeWrapping = [2, 1];
mutatedBeforeWrapping.sort((left, right) => left - right);
export const wrappedAfterMutation = Chunk.fromArrayUnsafe(
  mutatedBeforeWrapping
);

const aliased = [1, 2, 3];
const alias = aliased;
export const aliasedChunk = Chunk.fromArrayUnsafe(aliased);
alias.push(4);

let reassigned = [1, 2, 3];
export const reassignedChunk = Chunk.fromArrayUnsafe(reassigned);
reassigned = [4, 5, 6];

const safelyCopied = [1, 2, 3];
export const copiedChunk = fromIterable(safelyCopied);
safelyCopied.push(4);

const mutatesOpaque = (values: number[]): void => {
  values.push(4);
};

const opaqueMutation = [1, 2, 3];
export const opaqueChunk = Chunk.fromArrayUnsafe(opaqueMutation);
mutatesOpaque(opaqueMutation);

export const shadowedChunk = (
  Chunk: { readonly fromArrayUnsafe: <A>(values: readonly A[]) => readonly A[] }
) => {
  const values = [1, 2, 3];
  const chunk = Chunk.fromArrayUnsafe(values);
  values.push(4);
  return chunk;
};

export const shadowedBinding = () => {
  const values = [1, 2, 3];
  const chunk = Chunk.fromArrayUnsafe(values);
  {
    const values = [4, 5, 6];
    values.push(7);
  }
  return chunk;
};
