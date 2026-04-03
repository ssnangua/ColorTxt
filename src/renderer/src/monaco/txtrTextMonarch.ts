import type * as monaco from "monaco-editor";

/**
 * 不含成对括号开符（由 root 中优先匹配并进入 string/bracket 状态）。
 * 保留闭符与独立标点，便于未配对时在 root 仍显示为标点。
 */
const PUNCTUATION_CLASS = /[,，.。!！?？:：;；、）\]\}｝】〗》＞>…—\-]/;

/** ASCII + 全角拉丁字母（U+FF21–FF3A、U+FF41–FF5A，如 Ａ、ａ） */
const LATIN_WORD = /[A-Za-z\uFF21-\uFF3A\uFF41-\uFF5A]+/;

const NUMBER = /[0-9０-９]+/;
const SPECIAL_MARKERS = /[·•▪*＊✲❈※☆♡♥○●√✔☑×✘☒]/;

/** 在否定字符类中需要转义的闭括号字符 */
function escapeForNegatedClass(closeChar: string): string {
  if (closeChar === "]") return "\\]";
  if (closeChar === "\\") return "\\\\";
  if (closeChar === "-") return "\\-";
  if (closeChar === "^") return "\\^";
  return closeChar;
}

/**
 * 兜底：不含闭符、换行、数字、拉丁（含全角拉丁），避免 [^"]+ 整段吞掉「中文后的 123」等。
 */
function innerRestRe(closeChar: string): RegExp {
  const e = escapeForNegatedClass(closeChar);
  return new RegExp(`[^${e}\\r\\n0-9A-Za-z\\uFF21-\\uFF3A\\uFF41-\\uFF5A]+`);
}

/**
 * 引号/括号内侧：数字、英文、标点优先；txtr.quoteInner / txtr.bracketInner 仅兜底（优先级最低）。
 */
function rulesInsideDelimited(
  closeMatch: RegExp,
  closeChar: string,
  innerToken: "txtr.quoteInner" | "txtr.bracketInner",
): monaco.languages.IMonarchLanguageRule[] {
  return [
    [/[\r\n]/, { token: "", next: "@pop" }],
    [closeMatch, { token: "txtr.punctuation", next: "@pop" }],
    [SPECIAL_MARKERS, "txtr.specialMarker"],
    [NUMBER, "txtr.number"],
    [LATIN_WORD, "txtr.english"],
    [PUNCTUATION_CLASS, "txtr.punctuation"],
    [innerRestRe(closeChar), innerToken],
  ];
}

/**
 * 成对引号/括号仅作用于当前行：`includeLF` 使行尾 \\n 参与匹配，从而在换行前 @pop，不延续到下一行。
 * 标点 token 仅在 root 匹配；引号内为 txtr.quoteInner；成对括号内为 txtr.bracketInner。
 */
export function createTxtrTextMonarchLanguage(): monaco.languages.IMonarchLanguage {
  return {
    defaultToken: "",
    /** 行尾带 \\n 参与匹配，否则 [\\r\\n] 无法在行末触发，引号/括号状态会延续到下一行 */
    includeLF: true,
    tokenizer: {
      root: [
        [/"/, { token: "txtr.punctuation", next: "stringDouble" }],
        [/'/, { token: "txtr.punctuation", next: "stringSingle" }],
        [/「/, { token: "txtr.punctuation", next: "stringCorner" }],
        [/『/, { token: "txtr.punctuation", next: "stringWhite" }],
        [/\u201C/, { token: "txtr.punctuation", next: "stringLdquo" }],
        [/\u2018/, { token: "txtr.punctuation", next: "stringLsquo" }],
        [/《/, { token: "txtr.punctuation", next: "bracketBook" }],
        [/</, { token: "txtr.punctuation", next: "bracketAngleAscii" }],
        [/＜/, { token: "txtr.punctuation", next: "bracketAngleFull" }],
        [/\(/, { token: "txtr.punctuation", next: "bracketParenAscii" }],
        [/（/, { token: "txtr.punctuation", next: "bracketParenFull" }],
        [/\[/, { token: "txtr.punctuation", next: "bracketSquareAscii" }],
        [/【/, { token: "txtr.punctuation", next: "bracketCjk" }],
        [/〖/, { token: "txtr.punctuation", next: "bracketFancy" }],
        [/\{/, { token: "txtr.punctuation", next: "bracketCurlyAscii" }],
        [/｛/, { token: "txtr.punctuation", next: "bracketCurlyFull" }],
        [SPECIAL_MARKERS, "txtr.specialMarker"],
        [NUMBER, "txtr.number"],
        [LATIN_WORD, "txtr.english"],
        [PUNCTUATION_CLASS, "txtr.punctuation"],
        [/./, ""],
      ],

      stringDouble: rulesInsideDelimited(/"/, '"', "txtr.quoteInner"),

      stringSingle: rulesInsideDelimited(/'/, "'", "txtr.quoteInner"),

      stringCorner: rulesInsideDelimited(/」/, "」", "txtr.quoteInner"),

      stringWhite: rulesInsideDelimited(/』/, "』", "txtr.quoteInner"),

      stringLdquo: rulesInsideDelimited(/\u201D/, "\u201D", "txtr.quoteInner"),

      stringLsquo: rulesInsideDelimited(/\u2019/, "\u2019", "txtr.quoteInner"),

      bracketBook: rulesInsideDelimited(/》/, "》", "txtr.bracketInner"),

      bracketAngleAscii: rulesInsideDelimited(/>/, ">", "txtr.bracketInner"),

      bracketAngleFull: rulesInsideDelimited(/＞/, "＞", "txtr.bracketInner"),

      bracketParenAscii: rulesInsideDelimited(/\)/, ")", "txtr.bracketInner"),

      bracketParenFull: rulesInsideDelimited(/）/, "）", "txtr.bracketInner"),

      bracketSquareAscii: rulesInsideDelimited(/\]/, "]", "txtr.bracketInner"),

      bracketCjk: rulesInsideDelimited(/】/, "】", "txtr.bracketInner"),

      bracketFancy: rulesInsideDelimited(/〗/, "〗", "txtr.bracketInner"),

      bracketCurlyAscii: rulesInsideDelimited(/\}/, "}", "txtr.bracketInner"),

      bracketCurlyFull: rulesInsideDelimited(/｝/, "｝", "txtr.bracketInner"),
    },
  };
}
