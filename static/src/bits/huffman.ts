import { reverseBits, BitBuffer } from "./bits";

const rtl = true;

export class HuffmanTree {
    constructor(
        public codes: Uint16Array,
        public lengths: Uint8Array,
        public tree: HuffmanBranch | HuffmanLeaf,
    ) {}

    /** make huffman tree */
    static make(code_lengths: Uint8Array): HuffmanTree {
        const bl_count = new Uint8Array(16);
        // step 1) count number of codes for each length N
        for (const length of code_lengths) {
            if (length == 0) continue;
            bl_count[length]++;
        }
        // step 2) calculate min code for each length
        let code = 0;
        const next_code = new Uint16Array(16);
        for (let length = 1; length < 16; length++) {
            code = (code + bl_count[length - 1]) << 1;
            next_code[length] = code;
        }

        const codes = new Uint16Array(code_lengths.length);
        const leafs: HuffmanLeaf[] = [];
        for (let i = 0; i < code_lengths.length; i++) {
            const code_length = code_lengths[i];

            if (code_length == 0) continue;

            if (rtl) {
                codes[i] = reverseBits(next_code[code_length], code_length);
            } else {
                codes[i] = next_code[code_length];
            }
            next_code[code_length]++;

            leafs.push(new HuffmanLeaf(code_length, i, codes[i]));
        }

        const tree = HuffmanTree.sortLeafs(leafs, 1, 0);
        if (tree == null) {
            const error = "huffman tree root is null";
            console.error(error);
            throw error;
        }
        return new HuffmanTree(codes, code_lengths, tree);
    }

    static sortLeafs(
        /** leafs yet to be sorted */
        leafs: HuffmanLeaf[],
        /** current length */
        curlen: number,
        /** current bits */
        curbits: number,
    ): HuffmanBranch | HuffmanLeaf | null {
        if (leafs.length == 0) return null;
        if (leafs.length == 1) return leafs[0];

        // get all leafs that have bit 0 at next position
        const leafs0 = leafs.filter((l) => HuffmanTree.#filterLeaf0(l, curlen));
        // get all leafs that have bit 1 at next position
        const leafs1 = leafs.filter((l) => HuffmanTree.#filterLeaf1(l, curlen));

        const leaf0 = HuffmanTree.sortLeafs(
            leafs0,
            curlen + 1,
            (curbits << 1) + 0,
        );
        const leaf1 = HuffmanTree.sortLeafs(
            leafs1,
            curlen + 1,
            (curbits << 1) + 1,
        );

        return new HuffmanBranch(curlen + 1, leaf0, leaf1);
    }

    static #filterLeaf0(l: HuffmanLeaf, curlen: number): boolean {
        // filter all leafs that have no next position
        if (l.len < curlen) return false;

        // check for last bit
        if (rtl) {
            const last_bit = (l.code >> (curlen - 1)) & 1;
            return last_bit === 0;
        } else {
            const last_bit = (l.code >> (l.len - 1 - curlen)) & 1;
            return last_bit === 0;
        }
    }
    static #filterLeaf1(l: HuffmanLeaf, curlen: number): boolean {
        // filter all leafs that have no next position
        if (l.len < curlen) return false;

        // check for last bit
        if (rtl) {
            const last_bit = (l.code >> (curlen - 1)) & 1;
            return last_bit === 1;
        } else {
            const last_bit = (l.code >> (l.len - 1 - curlen)) & 1;
            return last_bit === 1;
        }
    }

    parse(ibuffer: BitBuffer): HuffmanLeaf {
        let branch = this.tree;
        let curnumbits = 0;

        while (1) {
            if (branch instanceof HuffmanLeaf) {
                if (branch.len != curnumbits)
                    throw `code too short in treeParse (${branch.len} < ${curnumbits})`;
                return branch;
            }

            const nextbit = ibuffer.bit(true);
            curnumbits++;
            if (nextbit === 0) {
                if (branch.leaf0 == null)
                    throw `branch leaf0 is required but invalid after ${curnumbits} bits`;
                branch = branch.leaf0;
            } else {
                if (branch.leaf1 == null)
                    throw `branch leaf1 is required but invalid after ${curnumbits} bits`;
                branch = branch.leaf1;
            }
        }
        // eslint-disable-next-line no-unreachable
        throw new Error("Unreachable code in huffman tree parse");
    }
}
class HuffmanLeaf {
    constructor(
        public len: number,
        public value: number,
        public code: number,
    ) {}
}
class HuffmanBranch {
    constructor(
        public len: number,
        public leaf0: HuffmanBranch | HuffmanLeaf | null,
        public leaf1: HuffmanBranch | HuffmanLeaf | null,
    ) {}
}
