//# allFunctionsCalledOnLoad

export function stringToUint8Array(str: string): Uint8Array {
    const uint8Array = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        uint8Array[i] = str.charCodeAt(i);  // Get ASCII value of each character
    }
    return uint8Array;
}
export function uint8ArrayToString(arr: Uint8Array): string {
    let ret = "";
    for (let i = 0; i < arr.length; i++) {
        ret += String.fromCharCode(arr[i]);
    }
    return ret;
}
export function arrayBeginsWith(a: Uint8Array, b: Uint8Array): boolean {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        if (a[i] != b[i]) return false;
    }
    return true;
}
/** return first x bytes as u32 */
export const arrToUint32 = arrToUint(4);
/** return first x bytes as u16 */
export const arrToUint16 = arrToUint(2);
/** return first x bytes as u8 */
export const arrToUint8 = arrToUint(1);

export function arrToUint(
    /** number of bytes */
    n: number,
    littleendian: boolean = true,
): (ar: Uint8Array) => number {
    return function (arr) {
        if (arr.length < n) {
            throw new Error(`Not enough bytes to form an unsigned integer with ${n} bytes.`);
        }

        // Slice a portion of the array (length 4) and convert to Uint32
        let ret = 0;
        for (let i = 0; i < n; i++) {
            if (littleendian) {
                ret |= arr[i] << (8 * (n - 1 - i));
            } else {
                ret |= arr[i] << (8 * i);
            }
        }

        return ret;
    };
}

/** Reverse the lowest *n* bits of *b* (LSB <-> MSB). */
export function reverseBits(b: number, n: number): number {
    let ret = 0;
    for (let i = 0; i < n; i++) {
        ret |= ((b >>> (n - 1 - i)) & 1) << i;
    }
    return ret >>> 0; // keep it unsigned
}
/** Return *b* as a binary string padded to *n* bits (debug helper). */
export function binstr(b: number, n: number): string {
    return b.toString(2).padStart(n, "0");
}
/** Bit‑mask with the lowest *n* bits set. */
export function bitmask(n: number): number {
    if (n > 32) throw new RangeError(`Cannot create bitmask with >32 bits (asked for ${n})`);
    if (n == 32) return 0xffffffff;
    return (1 << n) - 1;
}



/**
 * Sliding 32‑bit bit‑buffer that supports both little‑endian (LSB‑first)
 * and big‑endian (MSB‑first) reading.  Designed for DEFLATE / PNG style
 * streams where at most 15 bits are needed at a time, but the class is
 * safe up to 32 bits.
 */
export class BitBuffer {
    /** number of bytes in buffer */
    private static readonly BUFFERSIZEBYTES = 4;
    /** max bits in buffer */
    private static readonly MAX_BITS = BitBuffer.BUFFERSIZEBYTES * 8;

    constructor(
        public data: Uint8Array,
        public dataIndex: number = 0,
        public buffer: number = 0,
        public bufferLen: number = 0,
        /** `true` → LSB‑first (right‑to‑left, as in DEFLATE); `false` → MSB‑first. */
        public readonly rtl: boolean = true,
    ) { }

    /** True if no more input bytes are available and the buffer is empty. */
    get eof(): boolean {
        return this.dataIndex >= this.data.length && this.bufferLen === 0;
    }

    /** Ensure at least *n* bits are buffered (up to 32). */
    ensureBufferLength(n: number): void {
        if (n > BitBuffer.MAX_BITS)
            throw new RangeError(`Cannot request >${BitBuffer.MAX_BITS} bits (asked for ${n})`);

        if(this.bufferLen>=n) return;

        const missingWholeBytes=Math.floor((BitBuffer.MAX_BITS-this.bufferLen)/8);
        for (let i=0;i<missingWholeBytes && this.dataIndex<this.data.length;i++) {
            this.#pullByte();
        }
    }

    /** Pull exactly one byte from `data` into the bit‑buffer. */
    #pullByte(): void {
        if (this.dataIndex >= this.data.length) return; // out of data
        const byte = this.data[this.dataIndex++];

        if (this.rtl) {
            // from D: this.bitbuffer|=new_data_byte<<this.bufferlen;
            this.buffer |= byte << this.bufferLen;
        } else {
            // from D: this.bitbuffer|=new_data_byte<<(7*8-this.bufferlen);
            this.buffer |= byte << ((BitBuffer.BUFFERSIZEBYTES - 1) * 8 - this.bufferLen);
        }
        this.bufferLen += 8;
    }

    /** Return *n* bits and CONSUME them (LSB of return = first bit read). */
    nbits(n: number): number {
        if (n < 1) throw new RangeError("n must be >= 1");
        this.ensureBufferLength(n);

        if (this.bufferLen < n) {
            throw new Error(`Not enough bits: requested ${n}, have ${this.bufferLen}`);
        }

        const ret = this.peekn(n);
        this.next(n);

        return ret;
    }

    /** Peek *n* bits without consuming. */
    peekn(n: number): number {
        if (n < 1) throw new RangeError('n must be >= 1');
        this.ensureBufferLength(n);
        if (this.bufferLen < n)
            throw new Error(
                `Not enough bits in buffer: requested ${n}, but only have ${
                    this.bufferLen
                }. The underlying data buffer is ${
                    this.dataIndex >= this.data.length ? 'exhausted' : 'not exhausted'
                } (index ${this.dataIndex}/${this.data.length}).`,
            );

        let ret: number;
        if (this.rtl) {
            ret = this.buffer & bitmask(n);
        } else {
            // from D: this.bitbuffer>>(ulong.sizeof*8-n);
            ret = this.buffer >>> (BitBuffer.BUFFERSIZEBYTES * 8 - n);
        }

        return ret;
    }

    /** Discard *n* bits (default = 1). */
    next(n: number = 1): void {
        if (n < 0) throw new RangeError("Cannot skip negative bits");
        if (n === 0) return;
        if (this.bufferLen < n) throw new Error("Buffer underrun on skip");

        if (this.rtl) {
            this.buffer >>>= n;
            this.bufferLen -= n;
        } else {
            // MSB-first: discard the n highest bits by shifting left
            this.bufferLen -= n;
            this.buffer <<= n;
            this.buffer &= bitmask(BitBuffer.MAX_BITS);
        }
    }

    /** Align to next byte boundary (consume up to 7 padding bits). */
    alignToByte(): void {
        const mod = this.bufferLen & 7;
        if (mod) this.next(mod);
    }
}
