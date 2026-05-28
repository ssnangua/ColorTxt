import { app } from "electron";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import {
  type AIConfig,
  defaultAIConfig,
  normalizeAiQuickQuestions,
  normalizeEmbeddingEndpoint,
  normalizeTokenPricePerMillion,
  normalizeTxt2ImgConfig,
} from "@shared/aiTypes";
import {
  SECRET_SLOT_AI_CHAT_API_KEY,
  SECRET_SLOT_AI_EMBEDDING_API_KEY,
  SECRET_SLOT_AI_TXT2IMG_API_KEY,
} from "@shared/secretSlots";
import {
  aiConfigFilePath,
  defaultBuiltinModelCacheRoot,
  resolveAiDataCacheRoot,
} from "./aiPaths";
import {
  readDataCacheRootBootstrap,
  upgradeLegacyAiDataLayoutIfNeeded,
  writeDataCacheRootBootstrap,
} from "./aiDataFs";
import { getSecret, setSecretsBatch } from "./secretStorage";

/** IPC / 磁盘读取后的不完整对象也可合并为完整 AIConfig */
export function mergeAiConfigWithDefaults(raw: unknown): AIConfig {
  const base = structuredClone(defaultAIConfig);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  if (typeof o.aiDataCacheDir === "string") {
    base.aiDataCacheDir = o.aiDataCacheDir;
  }
  if (o.chat && typeof o.chat === "object") {
    Object.assign(base.chat, o.chat as object);
    base.chat.tokenPricePerMillion = normalizeTokenPricePerMillion(
      (o.chat as Record<string, unknown>).tokenPricePerMillion,
    );
  }
  base.embedding = normalizeEmbeddingEndpoint(o.embedding);
  if (typeof o.aiEnabled === "boolean") {
    base.aiEnabled = o.aiEnabled;
  }
  if (typeof o.embeddingEnabled === "boolean") {
    base.embeddingEnabled = o.embeddingEnabled;
  }
  for (const k of [
    "chunkTargetTokens",
    "chunkMinTokens",
    "chunkOverlapRatio",
    "ragTopK",
  ] as const) {
    if (typeof o[k] === "number" && Number.isFinite(o[k])) {
      (base as unknown as Record<string, number>)[k] = o[k] as number;
    }
  }
  base.quickQuestions = normalizeAiQuickQuestions(o.quickQuestions);
  if (typeof o.showTokenUsage === "boolean") {
    base.showTokenUsage = o.showTokenUsage;
  }
  base.txt2img = normalizeTxt2ImgConfig(o.txt2img);
  return base;
}

function stripApiKeysForDisk(cfg: AIConfig): AIConfig {
  const disk = structuredClone(cfg);
  disk.chat.apiKey = "";
  disk.embedding.apiKey = "";
  disk.txt2img.apiKey = "";
  return disk;
}

async function hydrateApiKeysFromVault(cfg: AIConfig): Promise<{
  cfg: AIConfig;
  migratedPlaintext: boolean;
}> {
  const next = structuredClone(cfg);
  let migratedPlaintext = false;

  const chatVault = await getSecret(SECRET_SLOT_AI_CHAT_API_KEY);
  const embedVault = await getSecret(SECRET_SLOT_AI_EMBEDDING_API_KEY);
  const txt2imgVault = await getSecret(SECRET_SLOT_AI_TXT2IMG_API_KEY);

  if (chatVault) {
    next.chat.apiKey = chatVault;
  } else if (next.chat.apiKey.trim()) {
    migratedPlaintext = true;
  }

  if (embedVault) {
    next.embedding.apiKey = embedVault;
  } else if (next.embedding.apiKey.trim()) {
    migratedPlaintext = true;
  }

  if (txt2imgVault) {
    next.txt2img.apiKey = txt2imgVault;
  } else if (next.txt2img.apiKey.trim()) {
    migratedPlaintext = true;
  }

  if (migratedPlaintext) {
    await setSecretsBatch({
      [SECRET_SLOT_AI_CHAT_API_KEY]: next.chat.apiKey,
      [SECRET_SLOT_AI_EMBEDDING_API_KEY]: next.embedding.apiKey,
      [SECRET_SLOT_AI_TXT2IMG_API_KEY]: next.txt2img.apiKey,
    });
  }

  return { cfg: next, migratedPlaintext };
}

async function resolveConfigPathForLoad(): Promise<string> {
  await upgradeLegacyAiDataLayoutIfNeeded();
  const boot = await readDataCacheRootBootstrap();
  if (boot) return path.join(path.resolve(boot), "config.json");
  return aiConfigFilePath();
}

async function writeConfigJson(cfg: AIConfig): Promise<void> {
  const dir = resolveAiDataCacheRoot(cfg);
  await mkdir(dir, { recursive: true });
  const p = path.join(dir, "config.json");
  const diskCfg = stripApiKeysForDisk(cfg);
  const json = `${JSON.stringify(diskCfg, null, 2)}\n`;
  await writeFile(p, json, "utf-8");
  try {
    await chmod(p, 0o600);
  } catch {
    // Windows 等可能不支持
  }
  await writeDataCacheRootBootstrap(dir);
}

export async function loadAiConfig(): Promise<AIConfig> {
  try {
    const p = await resolveConfigPathForLoad();
    const buf = await readFile(p, "utf-8");
    const merged = mergeAiConfigWithDefaults(JSON.parse(buf));
    const { cfg, migratedPlaintext } = await hydrateApiKeysFromVault(merged);
    if (migratedPlaintext) {
      await writeConfigJson(cfg);
    }
    return cfg;
  } catch {
    const merged = structuredClone(defaultAIConfig);
    const { cfg } = await hydrateApiKeysFromVault(merged);
    return cfg;
  }
}

export async function saveAiConfig(cfg: AIConfig): Promise<void> {
  await setSecretsBatch({
    [SECRET_SLOT_AI_CHAT_API_KEY]: cfg.chat.apiKey,
    [SECRET_SLOT_AI_EMBEDDING_API_KEY]: cfg.embedding.apiKey,
    [SECRET_SLOT_AI_TXT2IMG_API_KEY]: cfg.txt2img.apiKey,
  });
  await writeConfigJson(cfg);
}

export function getDefaultAiDataCacheDirSync(): string {
  return resolveAiDataCacheRoot();
}

export function getDefaultBuiltinModelCacheDirSync(): string {
  return defaultBuiltinModelCacheRoot(app.getPath("userData"));
}
