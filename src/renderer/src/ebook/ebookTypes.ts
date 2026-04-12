export type ColorTxtArtifacts = {
  utf8: string;
  /** 相对转换结果 txt 所在目录的路径，如 `abc.epub.Images/cover.jpg` */
  imageWrites?: Array<{ relativePath: string; data: ArrayBuffer }>;
};
