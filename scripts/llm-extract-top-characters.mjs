/**
 * 本地大模型可行性测试：从整本 TXT 小说中提取最重要的角色名（按重要度排序，JSON；人数由 TOP_CHARACTERS 配置，默认 20）。
 * 全文不抽样：正文按块多次请求，合并候选后再做一次全书裁决，避免单请求塞不下或人物不全。
 *
 * 依赖：Node.js 18+（内置 fetch）
 * 运行（在项目根目录）：
 *   node scripts/llm-extract-top-characters.mjs
 *
 * 环境变量：
 *   LLM_BASE_URL          默认 http://127.0.0.1:1234
 *   LLM_MODEL             默认 qwen3.5-0.8b
 *   CHUNK_CHARS           每段最大字符数（默认 10000）。全文不超过该值时走单次整书请求；超过则分段。
 *   CHUNK_OVERLAP         段与段重叠字符数（默认 800），减轻切段边界丢信息。
 *   MAX_NAMES_PER_CHUNK   每段模型最多报几个人名（默认 40）。
 *   MAX_CANDIDATES_FINAL  全书裁决阶段最多传入的候选数（默认 250，按各段出现次数优先）。
 *   TOP_CHARACTERS        需要提取的最重要角色人数上限（默认 20，范围 1～100）。也可写 MAX_TOP_CHARACTERS（与前者等价）。
 *                         若设得较大，建议同步调大 MAX_CANDIDATES_FINAL，以免裁决阶段候选池不够。
 *   LLM_TIMEOUT_MS        单次请求超时毫秒，默认 1800000（30 分钟）。
 */

import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import chardet from 'jschardet'
import iconv from 'iconv-lite'

const DEFAULT_NOVEL =
  'H:\\书籍\\【金庸】小说合集（三联版+世纪新修版+评论）\\金庸全集三联版\\神雕侠侣.txt'

const BASE_URL = (process.env.LLM_BASE_URL || 'http://127.0.0.1:1234').replace(/\/$/, '')
const MODEL = process.env.LLM_MODEL || 'qwen3.5-0.8b'
const CHUNK_CHARS = Number.parseInt(process.env.CHUNK_CHARS || '10000', 10)
const CHUNK_OVERLAP = Number.parseInt(process.env.CHUNK_OVERLAP || '800', 10)
const MAX_NAMES_PER_CHUNK = Number.parseInt(process.env.MAX_NAMES_PER_CHUNK || '40', 10)
const MAX_CANDIDATES_FINAL = Number.parseInt(process.env.MAX_CANDIDATES_FINAL || '250', 10)
const TIMEOUT_MS = process.env.LLM_TIMEOUT_MS
  ? Number.parseInt(process.env.LLM_TIMEOUT_MS, 10)
  : 1_800_000

function readTopCharactersLimit() {
  const raw = process.env.TOP_CHARACTERS ?? process.env.MAX_TOP_CHARACTERS ?? '20'
  const n = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n)) return 10
  return Math.min(100, Math.max(1, n))
}

const MAX_TOP_CHARACTERS = readTopCharactersLimit()

const SYSTEM_JSON =
  '你是文本分析助手。用户要求只输出 JSON。你必须严格遵守用户给出的 JSON 结构与字段名，不要 markdown 代码块，不要解释性文字。'

function readNovelAsUtf8(filePath) {
  const buf = readFileSync(filePath)
  const det = chardet.detect(buf)
  let enc = (det?.encoding || 'utf-8').toLowerCase()
  const map = {
    gb2312: 'gb18030',
    gbk: 'gb18030',
    'windows-1252': 'utf-8',
    ascii: 'utf-8',
  }
  enc = map[enc] || enc
  if (enc === 'utf-8' || enc === 'utf8') {
    return buf.toString('utf-8')
  }
  if (iconv.encodingExists(enc)) {
    return iconv.decode(buf, enc)
  }
  return iconv.decode(buf, 'gb18030')
}

/** @param {string} text @param {number} size @param {number} overlap */
function splitIntoChunks(text, size, overlap) {
  if (size <= 0) throw new Error('CHUNK_CHARS 必须为正整数')
  const ov = Math.max(0, Math.min(overlap, size - 1))
  const chunks = []
  let start = 0
  let index = 0
  while (start < text.length) {
    const end = Math.min(start + size, text.length)
    chunks.push({ index, start, end, text: text.slice(start, end) })
    if (end >= text.length) break
    start = end - ov
    index += 1
  }
  return chunks
}

function extractFirstJsonObject(text) {
  if (!text || typeof text !== 'string') return null
  const trimmed = text.trim()
  const m = trimmed.match(/\{[\s\S]*\}/)
  const jsonStr = m ? m[0] : trimmed
  try {
    return JSON.parse(jsonStr)
  } catch {
    return null
  }
}

/** 解析 models 返回的 characters：1～MAX_TOP_CHARACTERS 个均可接受，去重保序；超过上限则截断并标记 truncated */
function normalizeCharactersList(arr) {
  if (!Array.isArray(arr)) {
    return { ok: false, error: 'characters 不是数组' }
  }
  const seen = new Set()
  const all = []
  for (const x of arr) {
    if (typeof x !== 'string') continue
    const s = x.trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    all.push(s)
  }
  if (all.length === 0) {
    return { ok: false, error: 'characters 数组为空或无非空字符串' }
  }
  const truncated = all.length > MAX_TOP_CHARACTERS
  const characters = truncated ? all.slice(0, MAX_TOP_CHARACTERS) : all
  return { ok: true, characters, truncated }
}

/** 尝试从任意文本中提取人物数组（容错：代码块/键名变体/纯数组） */
function parseCharactersFromText(text) {
  if (!text || typeof text !== 'string') {
    return { ok: false, error: 'empty_text' }
  }

  const tryKeys = (obj) => {
    if (!obj || typeof obj !== 'object') return null
    const keys = ['characters', 'names', 'roles', 'role_names', 'result', 'list']
    for (const k of keys) {
      if (Array.isArray(obj[k])) {
        const norm = normalizeCharactersList(obj[k])
        if (norm.ok) return norm
      }
    }
    return null
  }

  const parsedObj = extractFirstJsonObject(text)
  const byObj = tryKeys(parsedObj)
  if (byObj) return byObj

  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (block?.[1]) {
    const parsedBlockObj = extractFirstJsonObject(block[1])
    const byBlockObj = tryKeys(parsedBlockObj)
    if (byBlockObj) return byBlockObj
    try {
      const arr = JSON.parse(block[1].trim())
      const norm = normalizeCharactersList(arr)
      if (norm.ok) return norm
    } catch {
      /* ignore */
    }
  }

  const arrMatch = text.match(/\[[\s\S]*\]/)
  if (arrMatch?.[0]) {
    try {
      const arr = JSON.parse(arrMatch[0])
      const norm = normalizeCharactersList(arr)
      if (norm.ok) return norm
    } catch {
      /* ignore */
    }
  }

  return { ok: false, error: 'cannot_parse_characters' }
}

async function chatCompletion(userContent, signal) {
  const url = `${BASE_URL}/v1/chat/completions`
  const payload = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_JSON },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
    stream: false,
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })
  const rawText = await res.text()
  let data = null
  try {
    data = JSON.parse(rawText)
  } catch {
    /* ignore */
  }
  const messageContent =
    data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? null
  return { res, rawText, messageContent }
}

function buildRepairCharactersPrompt(rawText) {
  return `请把下面这段助手输出改写成标准 JSON。你只能做格式修复，不要新增解释，不要增加原文没有的人名。

输出要求：
1. 只输出一个 JSON 对象，不要 markdown，不要其它文字。
2. 格式：{"characters":["姓名1","姓名2",...]}。
3. 数组元素为字符串，去重，最多 ${MAX_TOP_CHARACTERS} 个。

待修复文本：
${rawText}`
}

function buildChunkPrompt(chunk, chunkIndex, totalChunks) {
  return `这是长篇小说全文的一个连续片段（第 ${chunkIndex + 1}/${totalChunks} 段）。请列出在本段中**出现且在叙事上较为重要**的人物姓名（含书中常用称呼，如「杨过」「郭伯伯」）。忽略仅一笔带过、与主线无关的路人。

输出要求：
1. 只输出一个 JSON 对象，不要 markdown，不要其它文字。
2. 格式：{"names":["姓名1",...]}，字符串去重，最多 ${MAX_NAMES_PER_CHUNK} 个，大致按本段内重要度降序（不必绝对精确）。
3. 若确实没有合适人名，返回 {"names":[]}。

--- 片段开始 ---
${chunk}
--- 片段结束 ---`
}

function buildFinalPrompt(candidates) {
  const payload = candidates.map((c) => ({ name: c.name, segmentHits: c.segmentHits }))
  return `我们在通读整本小说时，将全文按顺序切成多段，每一段各自列出了「该段较为重要的人物」。下面是汇总后的候选名单：每个姓名附带 segmentHits（在多少段里被标为重要；越高通常表示贯穿更多篇幅，但请以全书主线与结构为准综合判断）。

请从中选出**整部小说**全局最重要的角色，仅姓名，按重要程度从高到低排序。**长篇小说通常远多于 ${MAX_TOP_CHARACTERS} 位值得列入的重要角色，你应优先输出恰好 ${MAX_TOP_CHARACTERS} 人**（从候选中补足到 ${MAX_TOP_CHARACTERS} 位，含主角、关键配角与对主线影响大者）。**仅当你判断全书叙事上重要角色确实不足 ${MAX_TOP_CHARACTERS} 人时**，才可少于 ${MAX_TOP_CHARACTERS} 个。若候选有同一人多种称呼，请在输出里统一为全书最通行的一种。

只输出一个 JSON 对象：{"characters":["姓名1",...]}，数组长度为 1～${MAX_TOP_CHARACTERS}（长篇小说一般应为 ${MAX_TOP_CHARACTERS}），不要 markdown，不要其它文字。

候选（JSON 数组）：
${JSON.stringify(payload)}`
}

/** 进度写到 stderr，便于 stdout 只接 JSON */
function logProgress(percent, detail = '') {
  const p = Math.min(100, Math.max(0, Math.round(percent)))
  const tail = detail ? ` ${detail}` : ''
  console.error(`[progress] ${p}%${tail}`)
}

function buildOneShotFullBookPrompt(novelText) {
  return `以下是小说**完整正文**（未抽样）。请通读并分析，提取全书最重要的角色，仅输出角色姓名，按重要程度从高到低排序。**长篇小说通常远多于 ${MAX_TOP_CHARACTERS} 位重要角色，你应优先输出恰好 ${MAX_TOP_CHARACTERS} 人**（含主角、关键配角与对主线影响大者）。**仅当你判断全书叙事上重要角色确实不足 ${MAX_TOP_CHARACTERS} 人时**，才可少于 ${MAX_TOP_CHARACTERS} 个。

严格要求：
1. 只输出一个 JSON 对象，不要 markdown 代码块，不要任何解释性文字。
2. JSON 格式必须为：{"characters":["姓名1","姓名2",...]}，数组长度为 1～${MAX_TOP_CHARACTERS}（长篇小说一般应为 ${MAX_TOP_CHARACTERS}），元素为字符串（角色名）。
3. 姓名使用小说中通行的称呼即可（如「杨过」），不要括号说明。

--- 小说正文开始 ---
${novelText}
--- 小说正文结束 ---`
}

async function main() {
  const novelPath = resolve(process.argv[2] || DEFAULT_NOVEL)
  const tAll0 = performance.now()

  console.error(`[info] 小说路径: ${novelPath}`)
  console.error(
    `[info] LLM: ${BASE_URL}  model=${MODEL}  TOP_CHARACTERS=${MAX_TOP_CHARACTERS}  CHUNK_CHARS=${CHUNK_CHARS}  OVERLAP=${CHUNK_OVERLAP}`,
  )

  const novelText = readNovelAsUtf8(novelPath)
  const chunks =
    novelText.length <= CHUNK_CHARS
      ? [{ index: 0, start: 0, end: novelText.length, text: novelText }]
      : splitIntoChunks(novelText, CHUNK_CHARS, CHUNK_OVERLAP)

  console.error(`[info] 全文 ${novelText.length} 字，分 ${chunks.length} 次段落请求 + 1 次全书裁决`)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  const hitMap = new Map()
  let chunkHttpFailures = 0
  let chunkParseFailures = 0
  let phase1TotalMs = 0

  try {
    if (chunks.length === 1 && novelText.length <= CHUNK_CHARS) {
      logProgress(0, '单次整书请求')
      const t0 = performance.now()
      const { res, rawText, messageContent } = await chatCompletion(
        buildOneShotFullBookPrompt(novelText),
        controller.signal,
      )
      const elapsedMs = Math.round(performance.now() - t0)
      clearTimeout(timer)
      logProgress(100, '完成')

      const out = {
        ok: res.ok,
        httpStatus: res.status,
        elapsedMs,
        mode: 'one_shot_full_text',
        novelChars: novelText.length,
        chunkChars: CHUNK_CHARS,
        model: MODEL,
        baseUrl: BASE_URL,
        topCharacters: MAX_TOP_CHARACTERS,
        charactersJson: null,
        parseError: null,
      }
      if (!res.ok) out.upstreamBodySnippet = rawText.slice(0, 2000)

      const norm = parseCharactersFromText(messageContent || '')
      if (norm.ok) {
        out.charactersJson = { characters: norm.characters }
        if (norm.truncated) out.charactersTruncated = true
      } else {
        out.parseError = '无法解析 characters 数组'
      }
      console.log(JSON.stringify(out, null, 2))
      return
    }

    const totalSteps = chunks.length + 1
    logProgress(0, `共 ${chunks.length} 段 + 裁决`)

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]
      logProgress((100 * i) / totalSteps, `段落 ${i + 1}/${chunks.length} 请求中`)
      const tChunk0 = performance.now()
      const userContent = buildChunkPrompt(c.text, i, chunks.length)
      const { res, messageContent } = await chatCompletion(userContent, controller.signal)
      phase1TotalMs += Math.round(performance.now() - tChunk0)

      if (!res.ok) {
        chunkHttpFailures += 1
        logProgress((100 * (i + 1)) / totalSteps, `段落 ${i + 1}/${chunks.length} HTTP 失败`)
        continue
      }

      const parsed = extractFirstJsonObject(messageContent || '')
      const names = Array.isArray(parsed?.names) ? parsed.names : null
      if (!names) {
        chunkParseFailures += 1
        logProgress((100 * (i + 1)) / totalSteps, `段落 ${i + 1}/${chunks.length} 解析失败`)
        continue
      }

      const seenLocal = new Set()
      for (const n of names) {
        if (typeof n !== 'string') continue
        const s = n.trim()
        if (!s || seenLocal.has(s)) continue
        seenLocal.add(s)
        hitMap.set(s, (hitMap.get(s) || 0) + 1)
      }
      logProgress((100 * (i + 1)) / totalSteps, `段落 ${i + 1}/${chunks.length} 完成`)
    }

    const candidates = [...hitMap.entries()]
      .map(([name, segmentHits]) => ({ name, segmentHits }))
      .sort((a, b) => b.segmentHits - a.segmentHits || a.name.localeCompare(b.name, 'zh-Hans-CN'))
      .slice(0, MAX_CANDIDATES_FINAL)

    if (candidates.length === 0) {
      clearTimeout(timer)
      const elapsedMs = Math.round(performance.now() - tAll0)
      logProgress(100, '失败结束')
      console.log(
        JSON.stringify(
          {
            ok: false,
            elapsedMs,
            error: '各段均未得到有效人名，无法做全书裁决',
            chunkHttpFailures,
            chunkParseFailures,
            phase1Chunks: chunks.length,
            topCharacters: MAX_TOP_CHARACTERS,
            model: MODEL,
            baseUrl: BASE_URL,
          },
          null,
          2,
        ),
      )
      process.exit(1)
    }

    logProgress((100 * chunks.length) / totalSteps, '全书裁决 请求中')
    const tFinal0 = performance.now()
    const finalUser = buildFinalPrompt(candidates)
    const { res: resF, rawText: rawF, messageContent: msgF } = await chatCompletion(
      finalUser,
      controller.signal,
    )
    const finalElapsedMs = Math.round(performance.now() - tFinal0)
    clearTimeout(timer)
    logProgress(100, '完成')

    const out = {
      ok: resF.ok,
      httpStatusFinal: resF.status,
      elapsedMs: Math.round(performance.now() - tAll0),
      mode: 'chunked_merge',
      phase1Chunks: chunks.length,
      phase1TotalMs,
      phase2FinalMs: finalElapsedMs,
      chunkHttpFailures,
      chunkParseFailures,
      chunkChars: CHUNK_CHARS,
      chunkOverlap: CHUNK_OVERLAP,
      novelChars: novelText.length,
      candidatesConsidered: candidates.length,
      candidatesUnique: hitMap.size,
      topCharacters: MAX_TOP_CHARACTERS,
      model: MODEL,
      baseUrl: BASE_URL,
      charactersJson: null,
      parseError: null,
    }

    if (!resF.ok) {
      out.upstreamBodySnippetFinal = rawF.slice(0, 2000)
    }

    let normFinal = parseCharactersFromText(msgF || '')
    if (!normFinal.ok && msgF && resF.ok) {
      logProgress(99, '裁决结果格式修复中')
      const repaired = await chatCompletion(buildRepairCharactersPrompt(msgF), controller.signal)
      if (repaired.res.ok) {
        normFinal = parseCharactersFromText(repaired.messageContent || '')
      }
    }
    if (normFinal.ok) {
      out.charactersJson = { characters: normFinal.characters }
      if (normFinal.truncated) out.charactersTruncated = true
    } else {
      out.parseError = '裁决阶段无法解析 characters 数组'
    }

    console.log(JSON.stringify(out, null, 2))
  } catch (err) {
    clearTimeout(timer)
    const elapsedMs = Math.round(performance.now() - tAll0)
    console.log(
      JSON.stringify(
        {
          ok: false,
          elapsedMs,
          error: err instanceof Error ? err.message : String(err),
          model: MODEL,
          baseUrl: BASE_URL,
        },
        null,
        2,
      ),
    )
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[fatal]', err)
  process.exit(1)
})
