"use strict";

import {
    reverseBits,
    BitBuffer,
} from "./bits.js";

const rtl=true;

export class HuffmanTree{
    codes:Uint16Array;
    lengths:Uint8Array;
    tree:HuffmanBranch|HuffmanLeaf;

    /**
     * 
     * @param {Uint16Array} codes 
     * @param {Uint8Array} lengths 
     * @param {HuffmanBranch|HuffmanLeaf} tree 
     */
    constructor( codes:Uint16Array, lengths:Uint8Array, tree:HuffmanBranch|HuffmanLeaf ){
        this.codes=codes;
        this.lengths=lengths;
        this.tree=tree;
    }

    /**
     * make huffman tree
     * @param {Uint8Array} code_lengths 
     * @returns {HuffmanTree}
     */
    static make(code_lengths:Uint8Array):HuffmanTree{
        const bl_count=new Uint8Array(16)
        // step 1) count number of codes for each length N
        for(const length of code_lengths){
            if(length==0)continue;
            bl_count[length]++;
        }
        // console.log("bl_count",bl_count);
        // step 2) calculate min code for each length
        let code=0;
        const next_code=new Uint16Array(16);
        for(let length=1;length<16;length++){
            // console.log(`${code} ${bl_count[length-1]} ${(code + bl_count[length-1])<<1}`)
            code=(code + bl_count[length-1])<<1;
            // console.log(`code of len ${length} is ${binstr(code,length)}`)
            next_code[length]=code;
        }
        // console.log("next code",next_code);

        let codes=new Uint16Array(code_lengths.length);
        let leafs:HuffmanLeaf[]=[];
        for(let i=0;i<code_lengths.length;i++){
            const code_length=code_lengths[i];

            if(code_length==0)continue;

            if(rtl){
                codes[i]=reverseBits(next_code[code_length],code_length);
            }else{
                codes[i]=next_code[code_length];
            }
            next_code[code_length]++;

            // debug:
            // const code_binary_asString=binstr(codes[i],code_length);
            // console.log(`leaf ${i} has len ${code_length} code ${code_binary_asString}`);

            leafs.push(new HuffmanLeaf(
                code_length,
                i,
                codes[i],
            ));
        }

        const tree=HuffmanTree.sortLeafs(leafs,1,0);
        if(tree==null){const error=`huffman tree root is null`;console.error(error);throw error;}
        return new HuffmanTree(
            codes,
            code_lengths,
            tree
        );
    }

    /**
     * 
     * @param {HuffmanLeaf[]} leafs leafs yet to be sorted
     * @param {number} curlen current length
     * @param {number} curbits current bits
     * @returns {HuffmanBranch|HuffmanLeaf|null}
     */
    static sortLeafs(leafs:HuffmanLeaf[],curlen:number,curbits:number):HuffmanBranch|HuffmanLeaf|null{
        if(leafs.length==0)return null;
        if(leafs.length==1)return leafs[0];

        // get all leafs that have bit 0 at next position
        const leafs0=leafs.filter(l=>HuffmanTree.#filterLeaf0(l,curlen));
        // get all leafs that have bit 1 at next position
        const leafs1=leafs.filter(l=>HuffmanTree.#filterLeaf1(l,curlen));

        const leaf0=HuffmanTree.sortLeafs(
            leafs0,
            curlen+1,
            (curbits<<1)+0,
        );
        const leaf1=HuffmanTree.sortLeafs(
            leafs1,
            curlen+1,
            (curbits<<1)+1,
        );
        
        return new HuffmanBranch(
            curlen+1,
            leaf0,
            leaf1,
        );
    }

    /**
     * 
     * @param {HuffmanLeaf} l
     * @param {number} curlen
     * @returns {boolean}
     */
    static #filterLeaf0(l:HuffmanLeaf,curlen:number):boolean{
        // filter all leafs that have no next position
        if(l.len<curlen)return false;

        // check for last bit
        if(rtl){
            const last_bit=(l.code>>(curlen-1)) & 1;
            return last_bit === 0;
        }else{
            const last_bit=(l.code>>(l.len-1-curlen)) & 1;
            return last_bit === 0;
        }
    }
    /**
     * 
     * @param {HuffmanLeaf} l
     * @param {number} curlen
     * @returns {boolean}
     */
    static #filterLeaf1(l:HuffmanLeaf,curlen:number):boolean{
        // filter all leafs that have no next position
        if(l.len<curlen)return false;

        // check for last bit
        if(rtl){
            const last_bit=(l.code>>(curlen-1)) & 1;
            return last_bit === 1;
        }else{
            const last_bit=(l.code>>(l.len-1-curlen)) & 1;
            return last_bit === 1;
        }
    }

    /**
     * 
     * @param {BitBuffer} ibuffer 
     * @returns {HuffmanLeaf}
     */
    parse(ibuffer:BitBuffer):HuffmanLeaf{
        let branch=this.tree;
        let curnumbits=0;

        while(1){
            if(branch instanceof HuffmanLeaf){
                if(branch.len!=curnumbits) throw `code too short in treeParse (${branch.len} < ${curnumbits})`;
                return branch;
            }

            const nextbit=ibuffer.bit(true);
            // console.log(`bit ${nextbit}`);
            curnumbits++;
            if(nextbit===0){
                if(branch.leaf0==null)throw `branch leaf0 is required but invalid after ${curnumbits} bits`;
                branch = branch.leaf0;
            }else{
                if(branch.leaf1==null)throw `branch leaf1 is required but invalid after ${curnumbits} bits`;
                branch = branch.leaf1;
            }
        }

        const error=`no valid leaf found when parsing huffman tree`;console.error(error);throw error;
    }
}
class HuffmanLeaf{
    len:number;
    value:number;
    code:number;
    /**
     * 
     * @param {number} len
     * @param {number} value
     * @param {number} code
     */
    constructor(len:number,value:number,code:number){
        this.len=len;
        this.value=value;
        this.code=code;
    }
}
class HuffmanBranch{
    len:number;
    leaf0:HuffmanBranch|HuffmanLeaf|null;
    leaf1:HuffmanBranch|HuffmanLeaf|null;

    /**
     * 
     * @param {number} len 
     * @param {HuffmanBranch|HuffmanLeaf|null} leaf0 
     * @param {HuffmanBranch|HuffmanLeaf|null} leaf1 
     */
    constructor(len:number,leaf0:HuffmanBranch|HuffmanLeaf|null,leaf1:HuffmanBranch|HuffmanLeaf|null){
        this.len=len;
        this.leaf0=leaf0;
        this.leaf1=leaf1;
    }
}
