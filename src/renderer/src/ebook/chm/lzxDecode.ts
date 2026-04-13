/**
 * Microsoft LZX decompressor (CHM / CAB), logic ported from libmspack `lzxd.c`
 * (C) 2003–2023 Stuart Caie — used under GNU LGPL v2.1.
 * @see https://github.com/kyz/libmspack
 */

const LZX_MIN_MATCH = 2;
const LZX_NUM_CHARS = 256;
const LZX_BLOCKTYPE_VERBATIM = 1;
const LZX_BLOCKTYPE_ALIGNED = 2;
const LZX_BLOCKTYPE_UNCOMPRESSED = 3;
const LZX_PRETREE_NUM_ELEMENTS = 20;
const LZX_NUM_PRIMARY_LENGTHS = 7;
const LZX_NUM_SECONDARY_LENGTHS = 249;
const LZX_FRAME_SIZE = 32768;

const LZX_PRETREE_MAXSYMBOLS = LZX_PRETREE_NUM_ELEMENTS;
const LZX_PRETREE_TABLEBITS = 6;
const LZX_MAINTREE_MAXSYMBOLS = LZX_NUM_CHARS + 290 * 8;
const LZX_MAINTREE_TABLEBITS = 12;
const LZX_LENGTH_MAXSYMBOLS = LZX_NUM_SECONDARY_LENGTHS + 1;
const LZX_LENGTH_TABLEBITS = 12;
const LZX_ALIGNED_MAXSYMBOLS = 8;
const LZX_ALIGNED_TABLEBITS = 7;
const LZX_LENTABLE_SAFETY = 64;

const BITBUF_WIDTH = 32;

const positionSlots = [
  30, 32, 34, 36, 38, 42, 50, 66, 98, 162, 290,
] as const;

const extraBits = new Uint8Array([
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
  14, 14, 15, 15, 16, 16,
]);

const positionBase = new Uint32Array([
  0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048,
  3072, 4096, 6144, 8192, 12288, 16384, 24576, 32768, 49152, 65536, 98304, 131072, 196608, 262144,
  393216, 524288, 655360, 786432, 917504, 1048576, 1179648, 1310720, 1441792, 1572864, 1703936,
  1835008, 1966080, 2097152, 2228224, 2359296, 2490368, 2621440, 2752512, 2883584, 3014656, 3145728,
  3276800, 3407872, 3538944, 3670016, 3801088, 3932160, 4063232, 4194304, 4325376, 4456448, 4587520,
  4718592, 4849664, 4980736, 5111808, 5242880, 5373952, 5505024, 5636096, 5767168, 5898240, 6029312,
  6160384, 6291456, 6422528, 6553600, 6684672, 6815744, 6946816, 7077888, 7208960, 7340032, 7471104,
  7602176, 7733248, 7864320, 7995392, 8126464, 8257536, 8388608, 8519680, 8650752, 8781824, 8912896,
  9043968, 9175040, 9306112, 9437184, 9568256, 9699328, 9830400, 9961472, 10092544, 10223616,
  10354688, 10485760, 10616832, 10747904, 10878976, 11010048, 11141120, 11272192, 11403264,
  11534336, 11665408, 11796480, 11927552, 12058624, 12189696, 12320768, 12451840, 12582912, 12713984,
  12845056, 12976128, 13107200, 13238272, 13369344, 13500416, 13631488, 13762560, 13893632, 14024704,
  14155776, 14286848, 14417920, 14548992, 14680064, 14811136, 14942208, 15073280, 15204352, 15335424,
  15466496, 15597568, 15728640, 15859712, 15990784, 16121856, 16252928, 16384000, 16515072, 16646144,
  16777216, 16908288, 17039360, 17170432, 17301504, 17432576, 17563648, 17694720, 17825792, 17956864,
  18087936, 18219008, 18350080, 18481152, 18612224, 18743296, 18874368, 19005440, 19136512, 19267584,
  19398656, 19529728, 19660800, 19791872, 19922944, 20054016, 20185088, 20316160, 20447232, 20578304,
  20709376, 20840448, 20971520, 21102592, 21233664, 21364736, 21495808, 21626880, 21757952, 21889024,
  22020096, 22151168, 22282240, 22413312, 22544384, 22675456, 22806528, 22937600, 23068672, 23199744,
  23330816, 23461888, 23592960, 23724032, 23855104, 23986176, 24117248, 24248320, 24379392, 24510464,
  24641536, 24772608, 24903680, 25034752, 25165824, 25296896, 25427968, 25559040, 25690112, 25821184,
  25952256, 26083328, 26214400, 26345472, 26476544, 26607616, 26738688, 26869760, 27000832, 27131904,
  27262976, 27394048, 27525120, 27656192, 27787264, 27918336, 28049408, 28180480, 28311552, 28442624,
  28573696, 28704768, 28835840, 28966912, 29097984, 29229056, 29360128, 29491200, 29622272, 29753344,
  29884416, 30015488, 30146560, 30277632, 30408704, 30539776, 30670848, 30801920, 30932992, 31064064,
  31195136, 31326208, 31457280, 31588352, 31719424, 31850496, 31981568, 32112640, 32243712, 32374784,
  32505856, 32636928, 32768000, 32899072, 33030144, 33161216, 33292288, 33423360,
]);

function makeDecodeTable(
  nsyms: number,
  nbits: number,
  length: Uint8Array,
  table: Uint16Array,
): boolean {
  let sym: number;
  let nextSymbol: number;
  let leaf: number;
  let fill: number;
  let bitNum: number;
  let pos = 0;
  const tableMask = 1 << nbits;
  let bitMask = tableMask >> 1;

  for (bitNum = 1; bitNum <= nbits; bitNum++) {
    for (sym = 0; sym < nsyms; sym++) {
      if (length[sym] !== bitNum) continue;
      leaf = pos;
      if ((pos += bitMask) > tableMask) return true;
      for (fill = bitMask; fill-- > 0; ) table[leaf++] = sym;
    }
    bitMask >>= 1;
  }

  if (pos === tableMask) return false;

  for (sym = pos; sym < tableMask; sym++) table[sym] = 0xffff;

  nextSymbol = (tableMask >> 1 < nsyms) ? nsyms : tableMask >> 1;
  pos <<= 16;
  const tableMask2 = tableMask << 16;
  bitMask = 1 << 15;

  for (bitNum = nbits + 1; bitNum <= 16; bitNum++) {
    for (sym = 0; sym < nsyms; sym++) {
      if (length[sym] !== bitNum) continue;
      if (pos >= tableMask2) return true;
      leaf = pos >> 16;
      for (fill = 0; fill < bitNum - nbits; fill++) {
        if (table[leaf] === 0xffff) {
          table[nextSymbol << 1] = 0xffff;
          table[(nextSymbol << 1) + 1] = 0xffff;
          table[leaf] = nextSymbol++;
        }
        leaf = table[leaf] << 1;
        if ((pos >> (15 - fill)) & 1) leaf++;
      }
      table[leaf] = sym;
      pos += bitMask;
    }
    bitMask >>= 1;
  }

  return pos !== tableMask2;
}

export class LzxdDecoder {
  private readonly data: Uint8Array;
  private fileAbsPos: number;
  private readonly windowSize: number;
  private readonly resetInterval: number;
  private offset = 0;
  private length: number;
  private window: Uint8Array;
  private windowPosn = 0;
  private framePosn = 0;
  private frame = 0;
  private R0 = 1;
  private R1 = 1;
  private R2 = 1;
  private blockLength = 0;
  private blockRemaining = 0;
  private intelFilesize = 0;
  private intelStarted = 0;
  private blockType = 0;
  private headerRead = 0;
  private inputEnd = 0;
  private readonly inbuf: Uint8Array;
  private readonly inbufSize: number;
  private iPtr = 0;
  private iEnd = 0;
  private bitBuffer = 0;
  private bitsLeft = 0;
  private numOffsets = 0;
  private error = 0;

  private readonly PRETREE_len = new Uint8Array(LZX_PRETREE_MAXSYMBOLS + LZX_LENTABLE_SAFETY);
  private readonly MAINTREE_len = new Uint8Array(LZX_MAINTREE_MAXSYMBOLS + LZX_LENTABLE_SAFETY);
  private readonly LENGTH_len = new Uint8Array(LZX_LENGTH_MAXSYMBOLS + LZX_LENTABLE_SAFETY);
  private readonly ALIGNED_len = new Uint8Array(LZX_ALIGNED_MAXSYMBOLS + LZX_LENTABLE_SAFETY);

  private readonly PRETREE_table = new Uint16Array((1 << LZX_PRETREE_TABLEBITS) + LZX_PRETREE_MAXSYMBOLS * 2);
  private readonly MAINTREE_table = new Uint16Array(
    (1 << LZX_MAINTREE_TABLEBITS) + LZX_MAINTREE_MAXSYMBOLS * 2,
  );
  private readonly LENGTH_table = new Uint16Array((1 << LZX_LENGTH_TABLEBITS) + LZX_LENGTH_MAXSYMBOLS * 2);
  private readonly ALIGNED_table = new Uint16Array((1 << LZX_ALIGNED_TABLEBITS) + LZX_ALIGNED_MAXSYMBOLS * 2);
  private LENGTH_empty = 0;

  private oPtr = 0;
  private oEnd = 0;
  private readonly e8Buf = new Uint8Array(LZX_FRAME_SIZE);

  constructor(params: {
    data: Uint8Array;
    inputStart: number;
    windowBits: number;
    resetIntervalFrames: number;
    inputBufferSize: number;
    streamOutputLength: number;
  }) {
    this.data = params.data;
    this.fileAbsPos = params.inputStart;
    const wb = params.windowBits;
    if (wb < 15 || wb > 21) throw new Error("LZX: bad window bits");
    this.windowSize = 1 << wb;
    this.resetInterval = params.resetIntervalFrames;
    this.inbufSize = (params.inputBufferSize + 1) & -2;
    if (this.inbufSize < 2) throw new Error("LZX: bad input buffer");
    this.inbuf = new Uint8Array(this.inbufSize);
    this.window = new Uint8Array(this.windowSize);
    this.length = params.streamOutputLength;
    this.numOffsets = positionSlots[wb - 15]! << 3;
    this.iPtr = 0;
    this.iEnd = 0;
    this.bitBuffer = 0;
    this.bitsLeft = 0;
    this.inputEnd = 0;
    this.resetState();
  }

  private resetState(): void {
    this.R0 = 1;
    this.R1 = 1;
    this.R2 = 1;
    this.headerRead = 0;
    this.blockRemaining = 0;
    this.blockType = 0;
    this.MAINTREE_len.fill(0);
    this.LENGTH_len.fill(0);
  }

  private readInput(): void {
    const read = Math.min(this.inbufSize, this.data.length - this.fileAbsPos);
    let n = read;
    if (n <= 0) {
      if (this.inputEnd) {
        this.error = 1;
        return;
      }
      this.inbuf[0] = 0;
      this.inbuf[1] = 0;
      n = 2;
      this.inputEnd = 1;
    } else {
      this.inbuf.set(this.data.subarray(this.fileAbsPos, this.fileAbsPos + n), 0);
      this.fileAbsPos += n;
    }
    this.iPtr = 0;
    this.iEnd = n;
  }

  private readIfNeeded(): void {
    if (this.iPtr >= this.iEnd) {
      if (this.error) return;
      this.readInput();
    }
  }

  private ensureBits(nbits: number): void {
    while (this.bitsLeft < nbits) {
      this.readIfNeeded();
      if (this.error) return;
      const b0 = this.inbuf[this.iPtr++]!;
      this.readIfNeeded();
      if (this.error) return;
      const b1 = this.inbuf[this.iPtr++]!;
      const data = (b1 << 8) | b0;
      this.bitBuffer =
        (this.bitBuffer | (data << (BITBUF_WIDTH - 16 - this.bitsLeft))) >>> 0;
      this.bitsLeft += 16;
    }
  }

  private peekBits(nbits: number): number {
    return this.bitBuffer >>> (BITBUF_WIDTH - nbits);
  }

  private removeBits(nbits: number): void {
    this.bitBuffer = ((this.bitBuffer << nbits) >>> 0) as number;
    this.bitsLeft -= nbits;
  }

  private readBits(nbits: number): number {
    this.ensureBits(nbits);
    const v = this.peekBits(nbits);
    this.removeBits(nbits);
    return v;
  }

  private readHuffSym(table: Uint16Array, lens: Uint8Array, maxSym: number, tableBits: number): number {
    this.ensureBits(16);
    let huffSym = table[this.peekBits(tableBits)]!;
    if (huffSym >= maxSym) {
      let huffIdx = 1 << (BITBUF_WIDTH - tableBits);
      do {
        if ((huffIdx >>>= 1) === 0) {
          this.error = 1;
          return 0;
        }
        huffSym = table[(huffSym << 1) | ((this.bitBuffer & huffIdx) ? 1 : 0)]!;
      } while (huffSym >= maxSym);
    }
    const codeLen = lens[huffSym]!;
    this.removeBits(codeLen);
    return huffSym;
  }

  private readLengthsInto(lens: Uint8Array, first: number, last: number): void {
    let x: number;
    let y: number;
    let z: number;
    for (x = 0; x < 20; x++) this.PRETREE_len[x] = this.readBits(4);
    if (makeDecodeTable(LZX_PRETREE_MAXSYMBOLS, LZX_PRETREE_TABLEBITS, this.PRETREE_len, this.PRETREE_table)) {
      this.error = 1;
      return;
    }
    for (x = first; x < last; ) {
      z = this.readHuffSym(this.PRETREE_table, this.PRETREE_len, LZX_PRETREE_MAXSYMBOLS, LZX_PRETREE_TABLEBITS);
      if (z === 17) {
        y = this.readBits(4) + 4;
        while (y--) lens[x++] = 0;
      } else if (z === 18) {
        y = this.readBits(5) + 20;
        while (y--) lens[x++] = 0;
      } else if (z === 19) {
        y = this.readBits(1) + 4;
        z = this.readHuffSym(this.PRETREE_table, this.PRETREE_len, LZX_PRETREE_MAXSYMBOLS, LZX_PRETREE_TABLEBITS);
        z = lens[x]! - z;
        if (z < 0) z += 17;
        while (y--) lens[x++] = z;
      } else {
        z = lens[x]! - z;
        if (z < 0) z += 17;
        lens[x++] = z;
      }
    }
  }

  private buildMainAndLength(): void {
    this.readLengthsInto(this.MAINTREE_len, 0, 256);
    if (this.error) return;
    this.readLengthsInto(this.MAINTREE_len, 256, LZX_NUM_CHARS + this.numOffsets);
    if (this.error) return;
    if (
      makeDecodeTable(LZX_MAINTREE_MAXSYMBOLS, LZX_MAINTREE_TABLEBITS, this.MAINTREE_len, this.MAINTREE_table)
    ) {
      this.error = 1;
      return;
    }
    if (this.MAINTREE_len[0xe8] !== 0) this.intelStarted = 1;
    this.readLengthsInto(this.LENGTH_len, 0, LZX_NUM_SECONDARY_LENGTHS);
    if (this.error) return;
    this.LENGTH_empty = 0;
    if (makeDecodeTable(LZX_LENGTH_MAXSYMBOLS, LZX_LENGTH_TABLEBITS, this.LENGTH_len, this.LENGTH_table)) {
      let i: number;
      for (i = 0; i < LZX_LENGTH_MAXSYMBOLS; i++) {
        if (this.LENGTH_len[i]! > 0) {
          this.error = 1;
          return;
        }
      }
      this.LENGTH_empty = 1;
    }
  }

  /** @returns false on failure */
  decompress(outBytes: number, write: (buf: Uint8Array, start: number, len: number) => void): boolean {
    if (this.error) return false;
    let i = this.oEnd - this.oPtr;
    if (i > outBytes) i = outBytes;
    if (i > 0) {
      write(this.e8Buf, this.oPtr, i);
      this.oPtr += i;
      this.offset += i;
      outBytes -= i;
    }
    if (outBytes === 0) return true;

    let window = this.window;
    let windowPosn = this.windowPosn;
    let R0 = this.R0;
    let R1 = this.R1;
    let R2 = this.R2;
    let warned = 0;

    const endFrame = ((this.offset + outBytes) / LZX_FRAME_SIZE | 0) + 1;

    while (this.frame < endFrame) {
      if (this.resetInterval && this.frame % this.resetInterval === 0) {
        if (this.blockRemaining && !warned) warned = 1;
        this.resetState();
        R0 = this.R0;
        R1 = this.R1;
        R2 = this.R2;
      }

      if (!this.headerRead) {
        let hi = 0;
        let lo = 0;
        const bit = this.readBits(1);
        if (bit) {
          hi = this.readBits(16);
          lo = this.readBits(16);
        }
        this.intelFilesize = (hi << 16) | lo;
        this.headerRead = 1;
        if (this.error) return false;
      }

      let frameSize = LZX_FRAME_SIZE;
      if (this.length && this.length - this.offset < frameSize) {
        frameSize = this.length - this.offset;
      }

      let bytesTodo = this.framePosn + frameSize - windowPosn;
      while (bytesTodo > 0) {
        if (this.blockRemaining === 0) {
          if (this.blockType === LZX_BLOCKTYPE_UNCOMPRESSED && (this.blockLength & 1)) {
            this.readIfNeeded();
            if (this.error) return false;
            this.iPtr++;
          }
          this.blockType = this.readBits(3);
          const i16 = this.readBits(16);
          const j8 = this.readBits(8);
          this.blockRemaining = this.blockLength = (i16 << 8) | j8;
          if (this.error) return false;

          switch (this.blockType) {
            case LZX_BLOCKTYPE_ALIGNED: {
              for (let j = 0; j < 8; j++) this.ALIGNED_len[j] = this.readBits(3);
              if (makeDecodeTable(LZX_ALIGNED_MAXSYMBOLS, LZX_ALIGNED_TABLEBITS, this.ALIGNED_len, this.ALIGNED_table)) {
                this.error = 1;
                return false;
              }
            }
            // fall through
            case LZX_BLOCKTYPE_VERBATIM:
              this.buildMainAndLength();
              if (this.error) return false;
              break;
            case LZX_BLOCKTYPE_UNCOMPRESSED:
              this.intelStarted = 1;
              if (this.bitsLeft === 0) this.ensureBits(16);
              this.bitsLeft = 0;
              this.bitBuffer = 0;
              {
                const buf = new Uint8Array(12);
                for (let k = 0; k < 12; k++) {
                  this.readIfNeeded();
                  if (this.error) return false;
                  buf[k] = this.inbuf[this.iPtr++]!;
                }
                R0 = buf[0]! | (buf[1]! << 8) | (buf[2]! << 16) | (buf[3]! << 24);
                R1 = buf[4]! | (buf[5]! << 8) | (buf[6]! << 16) | (buf[7]! << 24);
                R2 = buf[8]! | (buf[9]! << 8) | (buf[10]! << 16) | (buf[11]! << 24);
              }
              R0 >>>= 0;
              R1 >>>= 0;
              R2 >>>= 0;
              break;
            default:
              this.error = 1;
              return false;
          }
        }

        let thisRun = this.blockRemaining;
        if (thisRun > bytesTodo) thisRun = bytesTodo;
        bytesTodo -= thisRun;
        this.blockRemaining -= thisRun;

        switch (this.blockType) {
          case LZX_BLOCKTYPE_ALIGNED:
          case LZX_BLOCKTYPE_VERBATIM:
            while (thisRun > 0) {
              const mainElement = this.readHuffSym(
                this.MAINTREE_table,
                this.MAINTREE_len,
                LZX_MAINTREE_MAXSYMBOLS,
                LZX_MAINTREE_TABLEBITS,
              );
              if (this.error) return false;
              if (mainElement < LZX_NUM_CHARS) {
                window[windowPosn++] = mainElement;
                thisRun--;
              } else {
                let matchLength = (mainElement - LZX_NUM_CHARS) & LZX_NUM_PRIMARY_LENGTHS;
                if (matchLength === LZX_NUM_PRIMARY_LENGTHS) {
                  if (this.LENGTH_empty) {
                    this.error = 1;
                    return false;
                  }
                  const lengthFooter = this.readHuffSym(
                    this.LENGTH_table,
                    this.LENGTH_len,
                    LZX_LENGTH_MAXSYMBOLS,
                    LZX_LENGTH_TABLEBITS,
                  );
                  if (this.error) return false;
                  matchLength += lengthFooter;
                }
                matchLength += LZX_MIN_MATCH;

                let matchOffset = (mainElement - LZX_NUM_CHARS) >> 3;
                switch (matchOffset) {
                  case 0:
                    matchOffset = R0;
                    break;
                  case 1:
                    matchOffset = R1;
                    R1 = R0;
                    R0 = matchOffset;
                    break;
                  case 2:
                    matchOffset = R2;
                    R2 = R0;
                    R0 = matchOffset;
                    break;
                  default: {
                    const ex = matchOffset >= 36 ? 17 : extraBits[matchOffset]!;
                    matchOffset = positionBase[matchOffset]! - 2;
                    if (ex >= 3 && this.blockType === LZX_BLOCKTYPE_ALIGNED) {
                      if (ex > 3) {
                        matchOffset += this.readBits(ex - 3) << 3;
                      }
                      const alignedBits = this.readHuffSym(
                        this.ALIGNED_table,
                        this.ALIGNED_len,
                        LZX_ALIGNED_MAXSYMBOLS,
                        LZX_ALIGNED_TABLEBITS,
                      );
                      if (this.error) return false;
                      matchOffset += alignedBits;
                    } else if (ex) {
                      matchOffset += this.readBits(ex);
                    }
                    R2 = R1;
                    R1 = R0;
                    R0 = matchOffset;
                  }
                }

                if (windowPosn + matchLength > this.windowSize) {
                  this.error = 1;
                  return false;
                }

                let rundest = windowPosn;
                let runLeft = matchLength;
                if (matchOffset > windowPosn) {
                  const j = matchOffset - windowPosn;
                  if (j > this.windowSize) {
                    this.error = 1;
                    return false;
                  }
                  let runsrc = this.windowSize - j;
                  if (j < runLeft) {
                    runLeft -= j;
                    for (let c = j; c-- > 0; ) window[rundest++] = window[runsrc++];
                    runsrc = 0;
                  }
                  while (runLeft-- > 0) window[rundest++] = window[runsrc++]!;
                } else {
                  let runsrc = rundest - matchOffset;
                  while (runLeft-- > 0) window[rundest++] = window[runsrc++]!;
                }
                windowPosn = rundest;
                thisRun -= matchLength;
              }
            }
            break;

          case LZX_BLOCKTYPE_UNCOMPRESSED: {
            let rundest = windowPosn;
            windowPosn += thisRun;
            let left = thisRun;
            while (left > 0) {
              let avail = this.iEnd - this.iPtr;
              if (avail === 0) {
                this.readIfNeeded();
                if (this.error) return false;
                avail = this.iEnd - this.iPtr;
              }
              const take = Math.min(avail, left);
              window.set(this.inbuf.subarray(this.iPtr, this.iPtr + take), rundest);
              rundest += take;
              this.iPtr += take;
              left -= take;
            }
            break;
          }
          default:
            this.error = 1;
            return false;
        }

        if (thisRun < 0) {
          if (-thisRun > this.blockRemaining) {
            this.error = 1;
            return false;
          }
          this.blockRemaining -= -thisRun;
        }
      }

      if (windowPosn - this.framePosn !== frameSize) {
        this.error = 1;
        return false;
      }

      if (this.bitsLeft > 0) this.ensureBits(16);
      if (this.bitsLeft & 15) this.removeBits(this.bitsLeft & 15);

      if (this.oPtr !== this.oEnd) {
        this.error = 1;
        return false;
      }

      let outSlice: Uint8Array;
      let outStart: number;
      if (this.intelStarted && this.intelFilesize && this.frame < 32768 && frameSize > 10) {
        const data = this.e8Buf;
        data.set(window.subarray(this.framePosn, this.framePosn + frameSize));
        let dataPtr = 0;
        const dataEnd = frameSize - 10;
        let curpos = this.offset;
        const filesize = this.intelFilesize;
        while (dataPtr < dataEnd) {
          if (data[dataPtr++]! !== 0xe8) {
            curpos++;
            continue;
          }
          const absOff =
            data[dataPtr]! |
            (data[dataPtr + 1]! << 8) |
            (data[dataPtr + 2]! << 16) |
            (data[dataPtr + 3]! << 24);
          const signedAbs = absOff | 0;
          if (signedAbs >= -curpos && signedAbs < filesize) {
            const relOff = signedAbs >= 0 ? signedAbs - curpos : signedAbs + filesize;
            data[dataPtr] = relOff & 0xff;
            data[dataPtr + 1] = (relOff >> 8) & 0xff;
            data[dataPtr + 2] = (relOff >> 16) & 0xff;
            data[dataPtr + 3] = (relOff >> 24) & 0xff;
          }
          dataPtr += 4;
          curpos += 5;
        }
        outSlice = data;
        outStart = 0;
        this.oPtr = 0;
        this.oEnd = frameSize;
      } else {
        outSlice = window;
        outStart = this.framePosn;
        this.oPtr = this.framePosn;
        this.oEnd = this.framePosn + frameSize;
      }

      let emit = outBytes < frameSize ? outBytes : frameSize;
      write(outSlice, outStart, emit);
      this.oPtr += emit;
      this.offset += emit;
      outBytes -= emit;

      this.framePosn += frameSize;
      this.frame++;
      if (windowPosn === this.windowSize) windowPosn = 0;
      if (this.framePosn === this.windowSize) this.framePosn = 0;
    }

    if (outBytes !== 0) {
      this.error = 1;
      return false;
    }

    this.windowPosn = windowPosn;
    this.R0 = R0;
    this.R1 = R1;
    this.R2 = R2;
    return true;
  }

  getOutputOffset(): number {
    return this.offset;
  }
}
