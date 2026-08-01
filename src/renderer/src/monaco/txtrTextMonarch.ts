import type * as monaco from "monaco-editor";
import {
  defaultReaderPaletteColorEnabled,
  type ReaderSurfaceColorEnabled,
} from "../constants/readerPalette";
import {
  buildTxtrCustomHighlightMonarchRules,
  type TxtrMonarchHighlightOptions,
} from "./txtrHighlightMonarch";

export type { TxtrMonarchHighlightOptions };

/**
 * 不含成对括号开符（由 root 中优先匹配并进入 string/bracket 状态）。
 * 保留闭符与独立标点，便于未配对时在 root 仍显示为标点。
 * 半角 < > 仅作标点（比较符）；全角 ＜ 为开符、未配对的 ＞ 作标点
 */
const PUNCTUATION_CLASS = /[,，.。!！?？:：;；、）\]\}｝】〗》＞><…—\-]/;

/**
 * BMP 拉丁字母：ASCII、全角拉丁、Latin-1 字母段（跳过 × U+00D7、÷ U+00F7）、Latin Extended-A/B（含拼音 ā/ō/ē/ǎ/ǖ 等）。
 * 不使用 `\p{Script=Latin}`：Monarch 分词所用正则引擎可能不支持 Unicode 属性类，会导致普通英文也无法匹配。
 */
const LATIN_LETTERS_BMP =
  "A-Za-z\\uFF21-\\uFF3A\\uFF41-\\uFF5A" +
  "\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u00FF" +
  "\\u0100-\\u017F" +
  "\\u0180-\\u024F";

/** 结合用变音标记（NFD：`a`+U+0301）；跟在拉丁字母后算同一词 */
const COMBINING_DIACRITIC_BMP = "\\u0300-\\u036F";

const LATIN_WORD = new RegExp(
  `(?:[${LATIN_LETTERS_BMP}][${COMBINING_DIACRITIC_BMP}]*)+`,
);

const NUMBER = /[0-9０-９]+/;
const SPECIAL_MARKERS = /[·•▪*＊✲❈※☆♡♥○●√✔☑×✘☒]/;

/**
 * 原文常会遗留单侧引号/括号；跨行状态若无限延续，会把后续整本内容误判为内部文字。
 * 此值仅作异常恢复边界，正常跨行对白、书名或括号说明不受影响。
 */
const TXTR_DELIMITED_CROSS_LINE_MAX_LINES = 32;

/** 在否定字符类中需要转义的闭括号字符 */
function escapeForNegatedClass(closeChar: string): string {
  if (closeChar === "]") return "\\]";
  if (closeChar === "\\") return "\\\\";
  if (closeChar === "-") return "\\-";
  if (closeChar === "^") return "\\^";
  return closeChar;
}

/**
 * 兜底：不含闭符、换行、数字、拉丁（含全角拉丁）。
 * 这里必须“单字符推进”而非 `+` 贪婪段匹配，否则会把「前缀+高亮词」整段吞掉，
 * 使高亮词规则（txtr.customHighlight.*）无法在中间位置命中。
 * 引号内额外排除括号开符，保证 `《…》` 能进入 bracket 子状态。
 */
function innerRestRe(
  closeChar: string,
  stopBeforeBracketOpeners: boolean,
): RegExp {
  const e = escapeForNegatedClass(closeChar);
  const noBracketOpen = stopBeforeBracketOpeners ? "《＜（【〖｛\\[\\(\\{" : "";
  return new RegExp(`[^${e}\\r\\n0-9${LATIN_LETTERS_BMP}${noBracketOpen}]`);
}

/** 与 root 一致；在引号内须排在自定义高亮词之后，避免 `《` 抢在高亮词匹配之前进入括号状态 */
function bracketOpenerRules(): monaco.languages.IMonarchLanguageRule[] {
  return [
    [/《/, { token: "txtr.punctuation", next: "bracketBook" }],
    [/＜/, { token: "txtr.punctuation", next: "bracketAngleFull" }],
    [/\(/, { token: "txtr.punctuation", next: "bracketParenAscii" }],
    [/（/, { token: "txtr.punctuation", next: "bracketParenFull" }],
    [/\[/, { token: "txtr.punctuation", next: "bracketSquareAscii" }],
    [/【/, { token: "txtr.punctuation", next: "bracketCjk" }],
    [/〖/, { token: "txtr.punctuation", next: "bracketFancy" }],
    [/\{/, { token: "txtr.punctuation", next: "bracketCurlyAscii" }],
    [/｛/, { token: "txtr.punctuation", next: "bracketCurlyFull" }],
  ];
}

/**
 * 跨行引号中不进入嵌套状态，避免闭合内层时恢复旧的外层行计数。
 * 仅命中同一物理行内的成对开括号；内容继续逐字符分词，以保留高亮词、数字和标点颜色。
 */
function inlineBracketRules(): monaco.languages.IMonarchLanguageRule[] {
  return [
    [/《(?=[^》\r\n]*》)/, "txtr.punctuation"],
    [/＜(?=[^＞\r\n]*＞)/, "txtr.punctuation"],
    [/\((?=[^\)\r\n]*\))/, "txtr.punctuation"],
    [/（(?=[^）\r\n]*）)/, "txtr.punctuation"],
    [/\[(?=[^\]\r\n]*\])/, "txtr.punctuation"],
    [/【(?=[^】\r\n]*】)/, "txtr.punctuation"],
    [/〖(?=[^〗\r\n]*〗)/, "txtr.punctuation"],
    [/\{(?=[^\}\r\n]*\})/, "txtr.punctuation"],
    [/｛(?=[^｝\r\n]*｝)/, "txtr.punctuation"],
  ];
}

function tokenInsideDelimited(
  innerToken: "txtr.quoteInner" | "txtr.bracketInner",
  specificToken: string,
  enabled: boolean,
): string {
  return enabled ? specificToken : innerToken;
}

type QuoteBracketMode = "nested" | "inline" | "none";

type DelimitedStateSpec = {
  name: string;
  closeMatch: RegExp;
  closeChar: string;
  innerToken: "txtr.quoteInner" | "txtr.bracketInner";
  isQuote?: boolean;
};

const DELIMITED_STATE_SPECS: readonly DelimitedStateSpec[] = [
  {
    name: "stringDouble",
    closeMatch: /"/,
    closeChar: '"',
    innerToken: "txtr.quoteInner",
    isQuote: true,
  },
  {
    name: "stringCorner",
    closeMatch: /」/,
    closeChar: "」",
    innerToken: "txtr.quoteInner",
    isQuote: true,
  },
  {
    name: "stringWhite",
    closeMatch: /』/,
    closeChar: "』",
    innerToken: "txtr.quoteInner",
    isQuote: true,
  },
  {
    name: "stringLdquo",
    closeMatch: /\u201D/,
    closeChar: "\u201D",
    innerToken: "txtr.quoteInner",
    isQuote: true,
  },
  {
    name: "stringLsquo",
    closeMatch: /\u2019/,
    closeChar: "\u2019",
    innerToken: "txtr.quoteInner",
    isQuote: true,
  },
  {
    name: "bracketBook",
    closeMatch: /》/,
    closeChar: "》",
    innerToken: "txtr.bracketInner",
  },
  {
    name: "bracketAngleFull",
    closeMatch: /＞/,
    closeChar: "＞",
    innerToken: "txtr.bracketInner",
  },
  {
    name: "bracketParenAscii",
    closeMatch: /\)/,
    closeChar: ")",
    innerToken: "txtr.bracketInner",
  },
  {
    name: "bracketParenFull",
    closeMatch: /）/,
    closeChar: "）",
    innerToken: "txtr.bracketInner",
  },
  {
    name: "bracketSquareAscii",
    closeMatch: /\]/,
    closeChar: "]",
    innerToken: "txtr.bracketInner",
  },
  {
    name: "bracketCjk",
    closeMatch: /】/,
    closeChar: "】",
    innerToken: "txtr.bracketInner",
  },
  {
    name: "bracketFancy",
    closeMatch: /〗/,
    closeChar: "〗",
    innerToken: "txtr.bracketInner",
  },
  {
    name: "bracketCurlyAscii",
    closeMatch: /\}/,
    closeChar: "}",
    innerToken: "txtr.bracketInner",
  },
  {
    name: "bracketCurlyFull",
    closeMatch: /｝/,
    closeChar: "｝",
    innerToken: "txtr.bracketInner",
  },
];

function crossLineStateName(stateName: string, line: number): string {
  return `${stateName}.crossLine.${line}`;
}

/**
 * 引号/括号内侧：自定义高亮词优先于引号/括号内侧兜底；引号内再在高亮词之后尝试括号开符，以便「《书名》」仍为 bracketInner。
 * 数字、英文、标点等可独立上色；对应开关关闭时在引号/括号内回退为 quoteInner / bracketInner（而非 root 的 english 等）。
 */
function rulesInsideDelimited(
  closeMatch: RegExp,
  closeChar: string,
  innerToken: "txtr.quoteInner" | "txtr.bracketInner",
  highlightRules: monaco.languages.IMonarchLanguageRule[],
  colorEnabled: ReaderSurfaceColorEnabled,
  /** 引号内括号处理方式：独立嵌套状态、无状态单行着色或不处理 */
  quoteBracketMode: QuoteBracketMode = "none",
  /** undefined = 换行即退出；null = 达到跨行恢复边界后清空全部嵌套状态 */
  crossLineNextState?: string | null,
): monaco.languages.IMonarchLanguageRule[] {
  const newlineRule: monaco.languages.IMonarchLanguageRule =
    crossLineNextState === undefined
      ? [/\r?\n/, { token: "", next: "@pop" }]
      : crossLineNextState === null
        ? [/\r?\n/, { token: "", next: "@popall" }]
        : [/\r?\n/, { token: "", switchTo: crossLineNextState }];
  return [
    newlineRule,
    ...highlightRules,
    ...(quoteBracketMode === "nested"
      ? bracketOpenerRules()
      : quoteBracketMode === "inline"
        ? inlineBracketRules()
        : []),
    [closeMatch, { token: "txtr.punctuation", next: "@pop" }],
    [
      SPECIAL_MARKERS,
      tokenInsideDelimited(
        innerToken,
        "txtr.specialMarker",
        colorEnabled.txtrSpecialMarker,
      ),
    ],
    [
      NUMBER,
      tokenInsideDelimited(innerToken, "txtr.number", colorEnabled.txtrNumber),
    ],
    [
      LATIN_WORD,
      tokenInsideDelimited(
        innerToken,
        "txtr.english",
        colorEnabled.txtrEnglish,
      ),
    ],
    [
      PUNCTUATION_CLASS,
      tokenInsideDelimited(
        innerToken,
        "txtr.punctuation",
        colorEnabled.txtrPunctuation,
      ),
    ],
    [innerRestRe(closeChar, quoteBracketMode === "nested"), innerToken],
  ];
}

/**
 * `includeLF: true` 时行尾 \\n 可匹配，未闭合的引号/括号在换行处 @pop（不跨行）。
 * 开启跨行时，状态最多延续 {@link TXTR_DELIMITED_CROSS_LINE_MAX_LINES} 个后续物理行；
 * 到达边界后强制恢复 root，避免 EPUB/TXT 的单侧符号污染后续整段内容。
 * 标点 token 仅在 root 匹配；引号内为 txtr.quoteInner；成对括号内为 txtr.bracketInner。
 * root 先括号开符再高亮词；引号内先高亮词再括号开符，故高亮词优先于引号内侧、括号开符仍优先于纯引号内兜底。
 */
export function createTxtrTextMonarchLanguage(
  highlight?: TxtrMonarchHighlightOptions,
  /** 为 true 时成对引号/括号可跨行（有异常恢复边界） */
  delimitedMatchCrossLine = false,
  colorEnabled: ReaderSurfaceColorEnabled = defaultReaderPaletteColorEnabled,
): monaco.languages.IMonarchLanguage {
  const hl = highlight ?? {
    enabled: false,
    highlightColorsLength: 0,
    highlightWordsByIndex: undefined,
  };
  const hlRules = buildTxtrCustomHighlightMonarchRules(hl);
  const crossLineEffective = Boolean(hl.enabled) && delimitedMatchCrossLine;
  const crossLineQuoteBracketMode: QuoteBracketMode = crossLineEffective
    ? "inline"
    : "nested";
  const insideColor = { ...defaultReaderPaletteColorEnabled, ...colorEnabled };
  const crossLineTokenizerStates: Record<
    string,
    monaco.languages.IMonarchLanguageRule[]
  > = {};
  if (crossLineEffective) {
    for (const spec of DELIMITED_STATE_SPECS) {
      for (
        let line = 1;
        line <= TXTR_DELIMITED_CROSS_LINE_MAX_LINES;
        line += 1
      ) {
        crossLineTokenizerStates[crossLineStateName(spec.name, line)] =
          rulesInsideDelimited(
            spec.closeMatch,
            spec.closeChar,
            spec.innerToken,
            hlRules,
            insideColor,
            spec.isQuote ? "inline" : "none",
            line === TXTR_DELIMITED_CROSS_LINE_MAX_LINES
              ? null
              : crossLineStateName(spec.name, line + 1),
          );
      }
    }
  }

  return {
    defaultToken: "",
    includeLF: true,
    tokenizer: {
      root: [
        ...bracketOpenerRules(),
        [/"/, { token: "txtr.punctuation", next: "stringDouble" }],
        [/「/, { token: "txtr.punctuation", next: "stringCorner" }],
        [/『/, { token: "txtr.punctuation", next: "stringWhite" }],
        [/\u201C/, { token: "txtr.punctuation", next: "stringLdquo" }],
        [/\u2018/, { token: "txtr.punctuation", next: "stringLsquo" }],
        ...hlRules,
        [SPECIAL_MARKERS, "txtr.specialMarker"],
        [NUMBER, "txtr.number"],
        [LATIN_WORD, "txtr.english"],
        [PUNCTUATION_CLASS, "txtr.punctuation"],
        [/./, ""],
      ],

      stringDouble: rulesInsideDelimited(
        /"/,
        '"',
        "txtr.quoteInner",
        hlRules,
        insideColor,
        crossLineQuoteBracketMode,
        crossLineEffective
          ? crossLineStateName("stringDouble", 1)
          : undefined,
      ),

      stringCorner: rulesInsideDelimited(
        /」/,
        "」",
        "txtr.quoteInner",
        hlRules,
        insideColor,
        crossLineQuoteBracketMode,
        crossLineEffective
          ? crossLineStateName("stringCorner", 1)
          : undefined,
      ),

      stringWhite: rulesInsideDelimited(
        /』/,
        "』",
        "txtr.quoteInner",
        hlRules,
        insideColor,
        crossLineQuoteBracketMode,
        crossLineEffective
          ? crossLineStateName("stringWhite", 1)
          : undefined,
      ),

      stringLdquo: rulesInsideDelimited(
        /\u201D/,
        "\u201D",
        "txtr.quoteInner",
        hlRules,
        insideColor,
        crossLineQuoteBracketMode,
        crossLineEffective
          ? crossLineStateName("stringLdquo", 1)
          : undefined,
      ),

      stringLsquo: rulesInsideDelimited(
        /\u2019/,
        "\u2019",
        "txtr.quoteInner",
        hlRules,
        insideColor,
        crossLineQuoteBracketMode,
        crossLineEffective
          ? crossLineStateName("stringLsquo", 1)
          : undefined,
      ),

      bracketBook: rulesInsideDelimited(
        /》/,
        "》",
        "txtr.bracketInner",
        hlRules,
        insideColor,
        "none",
        crossLineEffective ? crossLineStateName("bracketBook", 1) : undefined,
      ),

      bracketAngleFull: rulesInsideDelimited(
        /＞/,
        "＞",
        "txtr.bracketInner",
        hlRules,
        insideColor,
        "none",
        crossLineEffective
          ? crossLineStateName("bracketAngleFull", 1)
          : undefined,
      ),

      bracketParenAscii: rulesInsideDelimited(
        /\)/,
        ")",
        "txtr.bracketInner",
        hlRules,
        insideColor,
        "none",
        crossLineEffective
          ? crossLineStateName("bracketParenAscii", 1)
          : undefined,
      ),

      bracketParenFull: rulesInsideDelimited(
        /）/,
        "）",
        "txtr.bracketInner",
        hlRules,
        insideColor,
        "none",
        crossLineEffective
          ? crossLineStateName("bracketParenFull", 1)
          : undefined,
      ),

      bracketSquareAscii: rulesInsideDelimited(
        /\]/,
        "]",
        "txtr.bracketInner",
        hlRules,
        insideColor,
        "none",
        crossLineEffective
          ? crossLineStateName("bracketSquareAscii", 1)
          : undefined,
      ),

      bracketCjk: rulesInsideDelimited(
        /】/,
        "】",
        "txtr.bracketInner",
        hlRules,
        insideColor,
        "none",
        crossLineEffective ? crossLineStateName("bracketCjk", 1) : undefined,
      ),

      bracketFancy: rulesInsideDelimited(
        /〗/,
        "〗",
        "txtr.bracketInner",
        hlRules,
        insideColor,
        "none",
        crossLineEffective
          ? crossLineStateName("bracketFancy", 1)
          : undefined,
      ),

      bracketCurlyAscii: rulesInsideDelimited(
        /\}/,
        "}",
        "txtr.bracketInner",
        hlRules,
        insideColor,
        "none",
        crossLineEffective
          ? crossLineStateName("bracketCurlyAscii", 1)
          : undefined,
      ),

      bracketCurlyFull: rulesInsideDelimited(
        /｝/,
        "｝",
        "txtr.bracketInner",
        hlRules,
        insideColor,
        "none",
        crossLineEffective
          ? crossLineStateName("bracketCurlyFull", 1)
          : undefined,
      ),
      ...crossLineTokenizerStates,
    },
  };
}
