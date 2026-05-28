/** 主进程密钥保险库 slot 名（勿在 config / localStorage 明文持久化） */

export const SECRET_SLOT_AI_CHAT_API_KEY = "ai.chat.apiKey";
export const SECRET_SLOT_AI_EMBEDDING_API_KEY = "ai.embedding.apiKey";
export const SECRET_SLOT_VOICE_READ_DASHSCOPE_API_KEY =
  "voiceRead.dashscopeApiKey";
export const SECRET_SLOT_AI_TXT2IMG_API_KEY = "ai.txt2img.apiKey";

export type SecretSlotId =
  | typeof SECRET_SLOT_AI_CHAT_API_KEY
  | typeof SECRET_SLOT_AI_EMBEDDING_API_KEY
  | typeof SECRET_SLOT_VOICE_READ_DASHSCOPE_API_KEY
  | typeof SECRET_SLOT_AI_TXT2IMG_API_KEY;

export const ALL_SECRET_SLOT_IDS: readonly SecretSlotId[] = [
  SECRET_SLOT_AI_CHAT_API_KEY,
  SECRET_SLOT_AI_EMBEDDING_API_KEY,
  SECRET_SLOT_VOICE_READ_DASHSCOPE_API_KEY,
  SECRET_SLOT_AI_TXT2IMG_API_KEY,
];
