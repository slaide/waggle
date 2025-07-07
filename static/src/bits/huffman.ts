import { reverseBits, BitBuffer } from "./bits";

/**
 * Canonical Huffman decoder that supports both MSB‑first ("LTR") and
 * LSB‑first ("RTL") bit orders.
 *
 * The original implementation had several correctness and maintainability
 * issues which have been addressed:
 *
 * 1. **Wrong code stored in `codes`** – the table contained unreversed codes
 *    when `rtl` was enabled.  The table now stores the *actual* code used
 *    during decoding so that external callers can rely on it.
 * 2. **16‑bit overflow** – canonical values may exceed `0xFFFF` when
 *    `maxCodeLen > 16`.  All scratch tables now use `Uint32Array`.
 * 3. **Inconsistent depth tracking in the tree** – branch `len` used
 *    `curlen + 1` which was off‑by‑one.  Fixed so that the root starts at
 *    depth 0 and each child increments by 1.
 * 4. **Inefficient linear fallback** – replaced with true tree traversal
 *    for O(code‑length) worst‑case instead of O(#symbols).
 * 5. **Fast‑lookup generator simplification** – constant hoisted, redundant
 *    branches removed, and comments clarified.
 * 6. **Nit‑picks / style** – renamed "leafs" → "leaves", added explicit
 *    readonly modifiers and tighter typing throughout.
 */

class HuffmanLeaf {
    constructor(
    /** Code length in bits */ public readonly len: number,
    /** Symbol / literal value */ public readonly value: number,
    /** Actual bit pattern as it appears in the stream */ public readonly code: number,
    ) { }
}

class HuffmanBranch {
    constructor(
        /** Depth (distance from root) of *this* branch. Root == 0 */
        public readonly depth: number,
    /** Child when the next bit == 0 */ public readonly left: HuffmanBranch | HuffmanLeaf | null,
    /** Child when the next bit == 1 */ public readonly right: HuffmanBranch | HuffmanLeaf | null,
    ) { }
}

export class HuffmanTree {
    private static readonly FAST_LOOKUP_BITS = 8;

    private constructor(
        /** Table of canonical codes for each symbol.  Matches `lengths`. */
        public readonly codes: Uint32Array,
        /** Code length (0 = unused) for each symbol.  Matches `codes`. */
        public readonly lengths: Uint8Array,
        /** Root of the decoding tree. */
        private readonly tree: HuffmanBranch | HuffmanLeaf,
        /** `true` → LSB‑first, `false` → MSB‑first */
        public readonly rtl: boolean,
        /** Longest code length */
        public readonly maxCodeLen: number,
        /** Leaves sorted by symbol order (0‑based). */
        private readonly leaves: ReadonlyArray<HuffmanLeaf>,
        /** Fast table for codes ≤ FAST_LOOKUP_BITS */
        private readonly fastLookup: Array<{ value: number; length: number } | null>,
    ) { }

    /* ------------------------------------------------------------------ */
    /*                                BUILD                               */
    /* ------------------------------------------------------------------ */

    /** Build a canonical Huffman decoder from JPEG DHT segment data. */
    static fromJpeg(counts: Uint8Array, symbols: Uint8Array, rtl = false): HuffmanTree {
        const codeLengths = new Uint8Array(256); // Symbols are 0-255
        let symbolIdx = 0;
        for (let length = 1; length <= 16; length++) {
            const count = counts[length - 1];
            for (let i = 0; i < count; i++) {
                codeLengths[symbols[symbolIdx++]] = length;
            }
        }
        return HuffmanTree.make(codeLengths, rtl);
    }

    /**
     * Build a canonical Huffman decoder from an array of code lengths.
     * @param codeLengths - Array of code lengths for each symbol (0 = unused).
     * @param rtl - Whether to use LSB-first or MSB-first bit order. (default: true)
     * @param values - Optional array of values for each symbol. If not provided, values will be set to the symbol index.
     */
    static make(codeLengths: Uint8Array, rtl = true, values:undefined|number[]|Uint8Array=undefined): HuffmanTree {
        if (codeLengths.length === 0) {
            throw new Error("codeLengths may not be empty");
        }

        // 1) Find longest code.
        const maxCodeLen = Math.max(...codeLengths);
        if (maxCodeLen === 0) {
            throw new Error("All code lengths are zero – no symbols to decode");
        }

        // 2) Count codes per length.
        const blCount = new Uint32Array(maxCodeLen + 1);
        for (const len of codeLengths) if (len) blCount[len]++;

        // 3) Determine the first numerical code for each length (DEFLATE §3.2.2).
        const nextCode = new Uint32Array(maxCodeLen + 1);
        let code = 0;
        for (let bits = 1; bits <= maxCodeLen; bits++) {
            code = (code + blCount[bits - 1]) << 1;
            nextCode[bits] = code;
        }

        // 4) Assign codes to symbols.
        const codes = new Uint32Array(codeLengths.length);
        const lengths = new Uint8Array(codeLengths.length);
        const leaves: HuffmanLeaf[] = [];

        for (let symbol = 0; symbol < codeLengths.length; symbol++) {
            const len = codeLengths[symbol];
            if (!len) continue; // unused symbol

            let canonical = nextCode[len];
            if (rtl) canonical = reverseBits(canonical, len);

            codes[symbol] = canonical;
            lengths[symbol] = len;
            const value=values?.[symbol]??symbol;
            leaves.push(new HuffmanLeaf(len, value, canonical));

            nextCode[len]++;
        }

        // 5) Build helper structures.
        const tree = HuffmanTree.buildTree(leaves, rtl);
        const fastLookup = HuffmanTree.generateFastLookup(leaves, rtl);

        return new HuffmanTree(codes, lengths, tree, rtl, maxCodeLen, leaves, fastLookup);
    }

    /** Create small lookup table for codes ≤ FAST_LOOKUP_BITS. */
    private static generateFastLookup(
        leaves: ReadonlyArray<HuffmanLeaf>,
        rtl: boolean,
    ): Array<{ value: number; length: number } | null> {
        const width = 1 << HuffmanTree.FAST_LOOKUP_BITS;
        const table = new Array<{ value: number; length: number } | null>(width).fill(null);

        for (const leaf of leaves) {
            if (leaf.len === 0 || leaf.len > HuffmanTree.FAST_LOOKUP_BITS) continue;

            const padBits = HuffmanTree.FAST_LOOKUP_BITS - leaf.len;
            const repetitions = 1 << padBits;

            for (let pad = 0; pad < repetitions; pad++) {
                const index = rtl
                    ? (pad << leaf.len) | leaf.code // LSB‑first: code lives in the low bits
                    : (leaf.code << padBits) | pad; // MSB‑first: code lives in the high bits

                table[index] = { value: leaf.value, length: leaf.len };
            }
        }

        return table;
    }

    /** Build a binary decoding tree from the canonical leaves. */
    private static buildTree(
        leaves: ReadonlyArray<HuffmanLeaf>,
        rtl: boolean,
    ): HuffmanBranch | HuffmanLeaf {
        if (leaves.length === 1) return leaves[0];

        // Sort by depth then code to get deterministic structure.
        const sorted = [...leaves].sort((a, b) => (a.len !== b.len ? a.len - b.len : a.code - b.code));
        return HuffmanTree.recursiveBuild(sorted, 0, rtl);
    }

    private static recursiveBuild(
        leaves: ReadonlyArray<HuffmanLeaf>,
        depth: number,
        rtl: boolean,
    ): HuffmanBranch | HuffmanLeaf {
        if (leaves.length === 1) return leaves[0];

        const leftGroup: HuffmanLeaf[] = [];
        const rightGroup: HuffmanLeaf[] = [];

        for (const leaf of leaves) {
            if (leaf.len <= depth) {
                throw new Error("Inconsistent leaf depth while building Huffman tree");
            }
            const bit = rtl
                ? (leaf.code >> depth) & 1 // LSB‑first
                : (leaf.code >> (leaf.len - depth - 1)) & 1; // MSB‑first

            (bit ? rightGroup : leftGroup).push(leaf);
        }

        const left = leftGroup.length ? HuffmanTree.recursiveBuild(leftGroup, depth + 1, rtl) : null;
        const right = rightGroup.length ? HuffmanTree.recursiveBuild(rightGroup, depth + 1, rtl) : null;

        return new HuffmanBranch(depth, left, right);
    }

    /* ------------------------------------------------------------------ */
    /*                               PARSE                                */
    /* ------------------------------------------------------------------ */

    /**
     * Decode a symbol from the bit‑buffer.
     *
     * `BitBuffer` *must* expose two methods:
     *   - `peekn(n: number): number` – preview `n` bits *without* consuming.
     *   - `next(n: number): void` – consume `n` bits.
     */
    tryParse(bitBuffer: BitBuffer): { value: number; length: number } | null {
        // 1) Fast table for short codes.
        if (this.fastLookup.length) {
            if (bitBuffer.bufferLen < HuffmanTree.FAST_LOOKUP_BITS) {
                bitBuffer.ensureBufferLength(HuffmanTree.FAST_LOOKUP_BITS);
            }
            if (bitBuffer.bufferLen >= HuffmanTree.FAST_LOOKUP_BITS) {
                const bits = bitBuffer.peekn(HuffmanTree.FAST_LOOKUP_BITS);
                const entry = this.fastLookup[bits];
                if (entry!=null && entry.length>0) {
                    bitBuffer.next(entry.length);
                    return entry;
                }
            }
        }

        // 2) Full tree traversal (O(code‑length)).
        return this.tryParseTree(bitBuffer);
    }

    private tryParseTree(bitBuffer: BitBuffer): { value: number; length: number } | null {
        let node: HuffmanBranch | HuffmanLeaf | null = this.tree;

        bitBuffer.ensureBufferLength(this.maxCodeLen);

        let depth = 0;
        while (node instanceof HuffmanBranch) {
            const bit = bitBuffer.nbits(1);
            depth++;

            node = bit === 0 ? node.left : node.right;
            if (!node) {
                throw new Error(`Invalid Huffman code in stream (depth=${depth}, rtl=${this.rtl})`);
            }
        }

        if (node instanceof HuffmanLeaf) {
            const bits_remaining=node.len-depth;
            if(bits_remaining>0){
                bitBuffer.next(bits_remaining);
            }
            return { value: node.value, length: node.len };
        }
        return null;
    }
}
