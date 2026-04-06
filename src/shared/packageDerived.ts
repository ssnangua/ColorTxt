/**
 * 构建时由 electron-vite `define` 注入，值来自项目根 `package.json`
 *（与 `electron.vite.config.ts` 中读取逻辑一致）。
 */
declare const __APP_DISPLAY_NAME__: string;
declare const __GITHUB_REPO_URL__: string;

export const APP_DISPLAY_NAME: string = __APP_DISPLAY_NAME__;

export const GITHUB_REPO_URL: string = __GITHUB_REPO_URL__;

export const GITHUB_RELEASES_LATEST_URL = `${GITHUB_REPO_URL}/releases/latest`;
