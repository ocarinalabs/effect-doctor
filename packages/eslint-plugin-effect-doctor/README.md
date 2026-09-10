# eslint-plugin-effect-doctor

ESLint adapter for [Effect Doctor](https://github.com/ocarinalabs/effect-doctor). It exposes Effect Doctor's 24 per-file rules through ESLint flat configuration.

## Install

```sh
npm install --save-dev eslint eslint-plugin-effect-doctor
```

```sh
pnpm add --save-dev eslint eslint-plugin-effect-doctor
```

```sh
bun add --dev eslint eslint-plugin-effect-doctor
```

## Usage

```js
import effectDoctor from "eslint-plugin-effect-doctor";

export default [effectDoctor.configs.recommended];
```

The recommended flat configuration enables every `effect-doctor/*` rule as a warning. It does not set a parser. ESLint's default parser rejects TypeScript syntax, so give `.ts` files a TypeScript parser such as `typescript-eslint` before the preset:

```js
import effectDoctor from "eslint-plugin-effect-doctor";
import tseslint from "typescript-eslint";

export default [...tseslint.configs.base, effectDoctor.configs.recommended];
```

Override individual rules after the preset:

```js
import effectDoctor from "eslint-plugin-effect-doctor";

export default [
  effectDoctor.configs.recommended,
  {
    rules: {
      "effect-doctor/no-throw-in-effect-generator": "error",
      "effect-doctor/prefer-config-redacted": "off",
    },
  },
];
```

This package adapts the rule set from [`oxlint-plugin-effect-doctor`](https://www.npmjs.com/package/oxlint-plugin-effect-doctor). Use the full CLI for type-aware Effect TSGo findings, suppression checks, deterministic reports, and baseline comparison:

```sh
npx dr-effect@latest .
```

## License

MIT
