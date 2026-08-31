# eslint-plugin-effect-doctor

ESLint adapter for [Effect Doctor](https://github.com/ocarinalabs/effect-doctor). It exposes Effect Doctor's first-party, per-file findings through ESLint flat configuration.

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

The recommended flat configuration enables every first-party `effect-doctor/*` rule as a warning. Override individual rules after the preset:

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

This package adapts the rule set from [`oxlint-plugin-effect-doctor`](https://www.npmjs.com/package/oxlint-plugin-effect-doctor). Use the full CLI for type-aware Effect TSGo findings, official Effect Oxlint findings, suppression integrity, deterministic reports, and baseline comparison:

```sh
npx @ocarinalabs/effect-doctor@latest .
```

## License

MIT
