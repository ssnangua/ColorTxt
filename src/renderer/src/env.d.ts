/// <reference types="vite/client" />

import type { ColorTxtApi } from "../../preload";

declare global {
  interface Window {
    colorTxt: ColorTxtApi;
    __COLORTXT_PRELOAD__?: boolean;
  }
}

export {}

