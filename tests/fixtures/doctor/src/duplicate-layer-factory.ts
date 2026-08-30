import { Layer } from "effect";
import {
  fresh as freshLayer,
  mergeAll as mergeAllLayers,
  provideMerge as provideAndRetain,
} from "effect/Layer";

const databaseLayer = () => Layer.empty;
const cacheLayer = () => Layer.empty;
const serviceLayer = () => Layer.empty;

export const duplicateInMerge = Layer.merge(
  databaseLayer(),
  databaseLayer()
);

export const duplicateInNestedGraph = Layer.mergeAll(
  Layer.merge(cacheLayer(), databaseLayer()),
  cacheLayer()
);

export const duplicateInNamedMergeAll = mergeAllLayers(
  serviceLayer(),
  serviceLayer()
);

export const duplicateInProvideMerge = provideAndRetain(
  Layer.merge(databaseLayer(), serviceLayer()),
  databaseLayer()
);

export const duplicateInPipeline = databaseLayer().pipe(
  Layer.provide(databaseLayer())
);

const configuredLayer = (_name: string) => Layer.empty;

export const configuredInstances = Layer.merge(
  configuredLayer("primary"),
  configuredLayer("replica")
);

export const intentionallyFresh = Layer.mergeAll(
  databaseLayer(),
  Layer.fresh(databaseLayer()),
  freshLayer(databaseLayer())
);

export const separateGraphOne = Layer.merge(databaseLayer(), cacheLayer());
export const separateGraphTwo = Layer.merge(databaseLayer(), serviceLayer());

const factories = {
  database: databaseLayer,
};

export const memberFactories = Layer.merge(
  factories.database(),
  factories.database()
);

export const computedFactories = Layer.merge(
  factories["database"](),
  factories["database"]()
);

let mutableFactory = databaseLayer;
mutableFactory = cacheLayer;

export const mutableIdentity = Layer.merge(
  mutableFactory(),
  mutableFactory()
);

export const parameterIdentity = (
  factory: () => Layer.Layer<never>
): Layer.Layer<never> => Layer.merge(factory(), factory());

const LayerLookalike = {
  merge: (...layers: ReadonlyArray<Layer.Layer<never>>) => layers,
};

export const unrelatedComposer = LayerLookalike.merge(
  databaseLayer(),
  databaseLayer()
);
