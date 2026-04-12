declare module "pdfjs-dist/build/pdf.mjs" {
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(src: Record<string, unknown>): {
    promise: Promise<{
      numPages: number;
      getPage: (i: number) => Promise<{
        getTextContent: () => Promise<{ items: unknown[] }>;
      }>;
      destroy: () => Promise<void>;
    }>;
  };
}
