//# allFunctionsCalledOnLoad

import { arrToUint16, BitBuffer } from "./bits";
import { ByteReader } from "./bytereader";

import { HuffmanTree } from "./huffman";

function parseNcodelengths(
    code_length_tree: HuffmanTree,
    ibuffer: BitBuffer,
    n: number,
): Uint8Array {
    const ret = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        const leaf = code_length_tree.parse(ibuffer);
        const code = leaf.value;

        if (code <= 15) {
            // emit literal
            ret[i] = code;
        } else if (code == 16) {
            // copy the previous code 3-6 times
            if (i == 0) throw "";
            const last_code = ret[i - 1];
            const numreps = 3 + ibuffer.nbits(2);
            for (let r = 0; r < numreps; r++) {
                ret[i + r] = last_code;
            }
            i += numreps - 1;
        } else if (code == 17) {
            // copy length 0 3-10 times
            const numreps = 3 + ibuffer.nbits(3);
            for (let r = 0; r < numreps; r++) {
                ret[i + r] = 0;
            }
            i += numreps - 1;
        } else if (code == 18) {
            // copy length 0 11-138 times
            const numreps = 11 + ibuffer.nbits(7);
            for (let r = 0; r < numreps; r++) {
                ret[i + r] = 0;
            }
            i += numreps - 1;
        } else {
            throw "";
        }
    }
    return ret;
}

// -- begin fixed huffman tree stuff
const code_lengths = new Uint8Array(288).map((v, i) => {
    if (i >= 0 && i <= 143) {
        return 8;
    } else if (i >= 144 && i <= 255) {
        return 9;
    } else if (i >= 256 && i <= 279) {
        return 7;
    } else if (i >= 280 && i <= 287) {
        return 8;
    } else {
        throw "";
    }
});
const dist_lengths = new Uint8Array(30).map(() => 5);
const fixed_huffman_litlen_tree = HuffmanTree.make(code_lengths);
const fixed_huffman_dist_tree = HuffmanTree.make(dist_lengths);
// -- end fixed huffman tree stuff

// code lengths are read in this order
const code_length_parse_order = Object.freeze([
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
]);

/**
 * decode DEFLATE compressed data
 *
 * deflate [rfc1951](https://www.rfc-editor.org/rfc/rfc1951)
 */
function decode_deflate(i: Uint8Array, maxlen: number): Uint8Array {
    const ibuffer = new BitBuffer(i, 0, 0, 0);

    /// number of items currently in ret
    let nret = 0;
    // dev note: for debugging, ret=[] also works
    const ret = new Uint8Array(maxlen);

    let bfinal = 0;
    while (bfinal !== 1) {
        // read one block

        bfinal = ibuffer.nbits(1);
        const btype = ibuffer.nbits(2);

        let litlen_tree: HuffmanTree | null = null;
        let dist_tree: HuffmanTree | null = null;

        if (btype === 0) {
            // no compression

            // skip to byte boundary
            // 1) skip fractional byte
            ibuffer.next(ibuffer.bufferlen % 8);
            // 2) shift index into array back by full bytes
            ibuffer.dataindex -= ibuffer.bufferlen / 8;
            // 3) indicate that buffer is now empty
            ibuffer.bufferlen = 0;

            const LEN = arrToUint16(ibuffer.data.subarray(ibuffer.dataindex));
            ibuffer.dataindex += 2;
            const NLEN = arrToUint16(ibuffer.data.subarray(ibuffer.dataindex));
            ibuffer.dataindex += 2;

            if ((LEN | NLEN) != 0xffff)
                throw `len+nlen invalid ${LEN}+${NLEN}=${LEN + NLEN} != ${0xffff}`;

            // copy LEN bytes into output
            for (let i = 0; i < LEN; i++) {
                ret[nret++] = ibuffer.data[ibuffer.dataindex++];
            }

            continue;
        } else if (btype === 0b01) {
            // fixed huffman

            litlen_tree = fixed_huffman_litlen_tree;
            dist_tree = fixed_huffman_dist_tree;
        } else if (btype === 0b10) {
            // dynamic huffman

            // 1) get number of entries in each list
            const hlit = ibuffer.nbits(5) + 257;
            const hdist = ibuffer.nbits(5) + 1;
            // number of code length codes
            const hclen = ibuffer.nbits(4) + 4;

            // 2) parse code length table
            const code_lengths = new Uint8Array(
                /*see code_length_parse_order*/ 19,
            );
            for (let i = 0; i < hclen; i++) {
                // get next code length (as 3 bit unsigned integer)
                const code_length = ibuffer.nbits(3);

                code_lengths[code_length_parse_order[i]] = code_length;
            }
            const code_length_tree = HuffmanTree.make(code_lengths);

            const combined = parseNcodelengths(
                code_length_tree,
                ibuffer,
                hlit + hdist,
            );
            const litlen_code_lengths = combined.subarray(0, hlit);
            const dist_code_lengths = combined.subarray(hlit);

            litlen_tree = HuffmanTree.make(litlen_code_lengths);
            dist_tree = HuffmanTree.make(dist_code_lengths);
        } else if (btype === 0b11) {
            throw `invalid btype ${btype}`;
        } else {
            throw `super duper invalid btype ${btype}`;
        }

        // these cases can never happen, but TS does not know that.
        if (litlen_tree == null) throw "bug: litlen_tree invalid";
        if (dist_tree == null) throw "bug: dist_tree invalid";

        while (1) {
            const leaf = litlen_tree.parse(ibuffer);

            const code = leaf.value;
            if (code < 256) {
                ret[nret++] = code;

                continue;
            } else if (code == 256) {
                break;
            } else if (code > 287) {
                throw `invalid leaf value ${JSON.stringify(leaf)}`;
            }

            // calculate length
            let length;
            if (code >= 257 && code <= 264) {
                length = code - 257 + 3;
            } else {
                if (code >= 265 && code <= 268) {
                    length = (code - 265) * (1 << 1) + 11 + ibuffer.nbits(1);
                } else if (code >= 269 && code <= 272) {
                    length = (code - 269) * (1 << 2) + 19 + ibuffer.nbits(2);
                } else if (code >= 273 && code <= 276) {
                    length = (code - 273) * (1 << 3) + 35 + ibuffer.nbits(3);
                } else if (code >= 277 && code <= 280) {
                    length = (code - 277) * (1 << 4) + 67 + ibuffer.nbits(4);
                } else if (code >= 281 && code <= 284) {
                    length = (code - 281) * (1 << 5) + 131 + ibuffer.nbits(5);
                } else if (code == 285) {
                    length = 258;
                } else {
                    throw "invalid length code";
                }
            }

            const dist_leaf = dist_tree.parse(ibuffer);
            const dist_code = dist_leaf.value;

            let dist;
            if (dist_code >= 0 && dist_code <= 3) {
                dist = dist_code + 1;
            } else {
                const dist_level = Math.floor(dist_code / 2);
                if (dist_level > 14) throw "";

                const num_extra_bits = dist_level - 1;
                const dist_code_offset = 2 * dist_level;

                dist =
                    (dist_code - dist_code_offset) * (1 << num_extra_bits) +
                    1 +
                    (1 << (num_extra_bits + 1)) +
                    ibuffer.nbits(num_extra_bits);
            }

            for (let i = 0; i < length; i++) {
                const offset = nret - dist;

                if (offset < 0)
                    throw (
                        `deflate decode out of bounds: ${offset} ` +
                        `(length_code ${code} length ${length}, ` +
                        `dist_code ${dist_code} ${dist})`
                    );

                ret[nret++] = ret[offset];
            }
        }
    }

    if (!(ret instanceof Uint8Array)) {
        return new Uint8Array(ret);
    }
    return ret;
}

export function zlibDecode(
    reader: ByteReader,
    maxlen: number,
): Uint8Array {
    // Parse zlib header using ByteReader (zlib uses big-endian)
    const cmf = reader.readUint8();
    const flg = reader.readUint8();

    const compression_method = cmf & 0xf;
    if (compression_method != 8) {
        const error = `${compression_method}!=8`;
        alert(error);
        throw error;
    }
    const preset_dict = flg & (1 << 5);

    if (preset_dict) {
        reader.readUint32();
        throw "zlib preset dict unimplemented";
    }

    // Get remaining deflate data as Uint8Array for decode_deflate
    const deflateData = reader.readBytes(reader.getRemainingBytes());
    const deflated = decode_deflate(deflateData, maxlen);

    return deflated;
}
