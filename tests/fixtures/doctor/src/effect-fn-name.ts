import { Effect as Fx } from "effect";
import * as EffectPackage from "effect";
import { fn as traced } from "effect/Effect";
import * as EffectModule from "effect/Effect";

export const loadUser = Fx.fn("fetchUser")(function* () {
  return yield* Fx.succeed("user");
});

export const saveUser = traced("writeUser")(function* () {
  return yield* Fx.succeed("saved");
});

export const handlers = {
  deleteUser: EffectModule.fn("removeUser")(function* () {
    return yield* Fx.succeed("deleted");
  }),
  refreshUser: EffectPackage.Effect.fn("reloadUser")(function* () {
    return yield* Fx.succeed("refreshed");
  }),
};

export const findUser = Fx.fn("findUser")(function* () {
  return yield* Fx.succeed("user");
});

export const listUsers = Fx.fn("Database.listUsers")(function* () {
  return yield* Fx.succeed(["user"]);
});

export const semanticOperationName = Fx.fn("Database.fetchUser")(function* () {
  return yield* Fx.succeed("user");
});

export const commandHandler = Fx.fn("command_handler")(function* () {
  return yield* Fx.succeed("handled");
});

export const validHandlers = {
  updateUser: traced("UserRepository.updateUser")(function* () {
    return yield* Fx.succeed("updated");
  }),
};

const assignedHandlers: Record<string, () => Fx.Effect<string>> = {};
assignedHandlers.archiveUser = traced("Handlers.archiveUser")(function* () {
  return yield* Fx.succeed("archived");
});

const dynamicSpanName: string = "dynamic";
export const dynamicName = Fx.fn(dynamicSpanName)(function* () {
  return yield* Fx.succeed("dynamic");
});

const computedPropertyName = "computedHandler";
export const computedHandlers = {
  [computedPropertyName]: Fx.fn("differentName")(function* () {
    return yield* Fx.succeed("computed");
  }),
};

export const anonymousFactories = [
  Fx.fn("unboundName")(function* () {
    return yield* Fx.succeed("anonymous");
  }),
];

const internalName = Fx.fn("internalName")(function* () {
  return yield* Fx.succeed("aliased");
});
export const indirectAlias = internalName;

const fakeEffect = {
  fn:
    (_name: string) =>
    <A>(body: () => A): (() => A) =>
      body,
};

export const lookalike = fakeEffect.fn("differentName")(() => "lookalike");

export const shadowedImport = () => {
  const Fx = fakeEffect;
  const localName = Fx.fn("differentName")(() => "shadowed");
  return localName;
};
