import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { defaultTxt2ImgConfig } from "@shared/aiTypes";
import { fetchTxt2ImgImageBuffer } from "./index";

const originalDispatcher = getGlobalDispatcher();
let http: MockAgent;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD4UAAAAASUVORK5CYII=",
  "base64",
);
const key = "fixture";

beforeEach(() => {
  http = new MockAgent();
  http.disableNetConnect();
  setGlobalDispatcher(http);
});

afterEach(async () => {
  setGlobalDispatcher(originalDispatcher);
  try {
    http.assertNoPendingInterceptors();
  } finally {
    await http.close();
  }
});

function generate(cloudModel: string, apiBaseUrl: string) {
  return fetchTxt2ImgImageBuffer({
    ...defaultTxt2ImgConfig,
    backend: "minimax_images",
    apiKey: key,
    apiBaseUrl,
    cloudModel,
    width: 1024,
    height: 1024,
  }, " a landscape ", "");
}

for (const [model, base, origin] of [
  ["MiniMax-H3-Image", "https://api.minimaxi.com/v1", "https://api.minimax.cn"],
  ["MiniMax-H3-Image-Highspeed", "https://api.minimax.io", "https://api.minimax.io"],
]) {
  test(`dispatches ${model} to its regional generation endpoint`, async () => {
    http.get(origin).intercept({
      path: "/v1/images/generations",
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model, prompt: "a landscape", size: "1024x1024",
        output_format: "png", response_format: "b64_json",
      }),
    }).reply(200, { data: [{ b64_json: png.toString("base64") }] });
    assert.deepEqual(await generate(model, base), { ok: true, buffer: png });
  });
}

test("surfaces a per-image error in a successful HTTP response", async () => {
  http.get("https://api.minimax.cn").intercept({
    path: "/v1/images/generations", method: "POST",
  }).reply(200, { data: [{ error: { code: "1027", message: "Image withheld" } }] });
  assert.deepEqual(await generate("MiniMax-H3-Image", "https://api.minimax.cn"), {
    ok: false, error: "Image withheld",
  });
});

test("uses the successful image in a partial response", async () => {
  http.get("https://api.minimax.io").intercept({
    path: "/v1/images/generations", method: "POST",
  }).reply(200, { data: [
    { error: { code: "1027", message: "Image withheld" } },
    { b64_json: png.toString("base64") },
  ] });
  assert.deepEqual(await generate("MiniMax-H3-Image", "https://api.minimax.io/v1"), {
    ok: true, buffer: png,
  });
});

test("surfaces a rate limit without retrying generation", async () => {
  http.get("https://custom.example").intercept({
    path: "/proxy/images/generations", method: "POST",
  }).reply(429, { type: "error", error: { message: "Rate limit exceeded" } });
  assert.deepEqual(await generate("MiniMax-H3-Image", "https://custom.example/proxy"), {
    ok: false, error: "Rate limit exceeded",
  });
});

test("keeps the legacy protocol when the model is left blank", async () => {
  http.get("https://api.minimaxi.com").intercept({
    path: "/v1/image_generation", method: "POST",
    body: JSON.stringify({
      model: "image-01", prompt: "a landscape", aspect_ratio: "1:1",
      response_format: "base64",
    }),
  }).reply(200, { data: { image_base64: [png.toString("base64")] } });
  assert.deepEqual(await generate("", ""), { ok: true, buffer: png });
});
