import { HttpServerResponse } from "effect/unstable/http";
import { text as responseText } from "effect/unstable/http/HttpServerResponse";

const payload = { ok: true };

export const namespaceTextResponse = HttpServerResponse.text(
  JSON.stringify(payload)
);
export const namedTextResponse = responseText(JSON.stringify(payload), {
  status: 201,
});

export const jsonResponse = HttpServerResponse.json(payload);
export const formattedTextResponse = HttpServerResponse.text(
  JSON.stringify(payload, null, 2)
);

export const shadowedJsonResponse = () => {
  const JSON = { stringify: (value: unknown) => String(value) };
  return responseText(JSON.stringify(payload));
};
