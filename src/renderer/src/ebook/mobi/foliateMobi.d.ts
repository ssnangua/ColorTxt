/** 与 vendored `foliateMobi.js`（foliate-js）导出形状一致的最小类型声明 */

export function isMOBI(file: unknown): Promise<boolean>;

export class MOBI {
  constructor(opts: { unzlib: (data: Uint8Array) => Uint8Array });
  open(file: unknown): Promise<{
    mobi: { loadResource(index: number): Promise<ArrayBuffer | Uint8Array> };
    sections: Array<{ createDocument?: () => Promise<Document> }>;
    metadata?: { title?: string };
    destroy?: () => void;
  }>;
}
