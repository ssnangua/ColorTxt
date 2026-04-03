/** electron-updater / Node 常见错误码 → 中文提示（主进程统一翻译后再发给渲染进程） */

const UPDATER_CODE_MESSAGES: Record<string, string> = {
  ERR_UPDATER_NO_PUBLISHED_VERSIONS: "GitHub 上暂无已发布的版本。",
  ERR_UPDATER_INVALID_RELEASE_FEED: "无法解析 GitHub 上的发布信息，请稍后重试。",
  ERR_UPDATER_CHANNEL_FILE_NOT_FOUND:
    "发布包中缺少更新描述文件（如 latest.yml），请确认已用 electron-builder 正确发布。",
  ERR_UPDATER_LATEST_VERSION_NOT_FOUND:
    "无法在 GitHub 上找到可用的最新版本，请确认已存在正式版 Release。",
  ERR_UPDATER_INVALID_UPDATE_INFO: "更新信息格式无效，请稍后重试或联系开发者。",
  ERR_UPDATER_NO_FILES_PROVIDED: "更新信息中未包含可下载的文件。",
  ERR_UPDATER_NO_CHECKSUM: "更新包缺少校验信息，无法安全下载。",
  ERR_UPDATER_ASSET_NOT_FOUND: "在发布资源中找不到对应的安装包文件。",
  ERR_UPDATER_INVALID_VERSION: "当前应用或服务器返回的版本号无效，无法比较更新。",
  ERR_UPDATER_INVALID_CHANNEL: "更新通道配置无效。",
  ERR_UPDATER_INVALID_PROVIDER_CONFIGURATION: "更新发布配置无效。",
  ERR_UPDATER_UNSUPPORTED_PROVIDER: "不支持的更新发布方式。",
  ERR_UPDATER_WEB_INSTALLER_DISABLED: "已禁用在线安装包方式，无法完成此次更新下载。",
  ERR_UPDATER_INVALID_SIGNATURE: "新版本安装包签名与当前应用不一致，已中止更新。",
  ERR_UPDATER_ZIP_FILE_NOT_FOUND: "未找到 macOS 更新所需的 ZIP 包。",
  ERR_UPDATER_OLD_FILE_NOT_FOUND: "无法定位当前 AppImage，更新无法继续。",
  ERR_UPDATER_RELEASE_NOT_FOUND: "在 GitLab 上找不到对应版本的发布。",
  ERR_UPDATER_BLOCKMAP_FILE_NOT_FOUND: "缺少差分更新所需的 blockmap 文件。",
  ERR_DATA_SPLITTER_BYTE_COUNT_MISMATCH: "更新数据异常，将尝试完整下载。",
  ERR_DATA_SPLITTER_TASK_INDEX_IS_NULL: "更新数据异常，将尝试完整下载。",
  ERR_DATA_SPLITTER_TASK_INDEX_ASSERT_FAILED: "更新数据异常，将尝试完整下载。",
  ERR_DATA_SPLITTER_LENGTH_MISMATCH: "更新数据异常，将尝试完整下载。",
};

/** Node 网络 / TLS 常见 errno（小写字符串码） */
const NODE_ERRNO_MESSAGES: Record<string, string> = {
  ENOTFOUND: "无法解析更新服务器地址，请检查网络或 DNS。",
  ECONNREFUSED: "无法连接更新服务器，请稍后重试。",
  ETIMEDOUT: "连接更新服务器超时，请稍后重试。",
  ECONNRESET: "与更新服务器的连接被中断，请稍后重试。",
  EAI_AGAIN: "暂时无法解析服务器地址，请稍后重试。",
  CERT_HAS_EXPIRED: "服务器证书已过期，无法建立安全连接。",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "无法验证服务器证书，连接已中止。",
};

/** 无 code 时的英文原文兜底（electron-updater 固定句式） */
const ENGLISH_MESSAGE_FALLBACKS: Record<string, string> = {
  "No published versions on GitHub": "GitHub 上暂无已发布的版本。",
};

function getErrorCode(e: unknown): string | undefined {
  if (e && typeof e === "object" && "code" in e) {
    const c = (e as { code?: unknown }).code;
    if (typeof c === "string" && c.length > 0) return c;
  }
  return undefined;
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * 将 electron-updater / 网络层错误转换为用户可见的中文说明。
 * 未知错误仍附带原始 message，便于排查。
 */
export function translateUpdaterError(error: unknown): string {
  const code = getErrorCode(error);
  if (code) {
    if (code in UPDATER_CODE_MESSAGES) {
      return UPDATER_CODE_MESSAGES[code]!;
    }
    if (code in NODE_ERRNO_MESSAGES) {
      return NODE_ERRNO_MESSAGES[code]!;
    }
  }

  const raw = getErrorMessage(error).trim();
  if (raw in ENGLISH_MESSAGE_FALLBACKS) {
    return ENGLISH_MESSAGE_FALLBACKS[raw]!;
  }

  if (raw) {
    return `更新失败：${raw}`;
  }
  return "更新失败，原因未知。";
}
