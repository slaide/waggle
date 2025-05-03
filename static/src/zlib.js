//# allFunctionsCalledOnLoad
"use strict";

import {
    stringToUint8Array,
    uint8ArrayToString,
    arrayBeginsWith,
    arrToUint32,
    arrToUint16,
    arrToUint8,
    reverseBits,
    binstr,
    bitmask,
} from "./bits.js";

const rtl=true;

class HuffmanTree{
    /**
     * 
     * @param {Uint16Array} codes 
     * @param {Uint8Array} lengths 
     * @param {HuffmanBranch|HuffmanLeaf} tree 
     */
    constructor( codes, lengths, tree ){
        this.codes=codes;
        this.lengths=lengths;
        this.tree=tree;
    }

    /**
     * make huffman tree
     * @param {Uint8Array} code_lengths 
     * @returns {HuffmanTree}
     */
    static make(code_lengths){
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
        /** @type {HuffmanLeaf[]} */
        let leafs=[];
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
    static sortLeafs(leafs,curlen,curbits){
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
    static #filterLeaf0(l,curlen){
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
    static #filterLeaf1(l,curlen){
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
    parse(ibuffer){
        const tree=this;

        let branch=tree.tree;
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
    /**
     * 
     * @param {number} len
     * @param {number} value
     * @param {number} code
     */
    constructor(len,value,code){
        this.len=len;
        this.value=value;
        this.code=code;
    }
}
class HuffmanBranch{
    /**
     * 
     * @param {number} len 
     * @param {HuffmanBranch|HuffmanLeaf|null} leaf0 
     * @param {HuffmanBranch|HuffmanLeaf|null} leaf1 
     */
    constructor(len,leaf0,leaf1){
        this.len=len;
        this.leaf0=leaf0;
        this.leaf1=leaf1;
    }
}

class BitBuffer{
    /**
     * 
     * @param {Uint8Array} data 
     * @param {number} dataindex 
     * @param {number} buffer 
     * @param {number} bufferlen 
     */
    constructor(data,dataindex,buffer,bufferlen){
        this.data=data;
        this.dataindex=dataindex;
        this.buffer=buffer;
        this.bufferlen=bufferlen;
    }

    /**
     * returns next 1 bit (peeks by default. will refill automatically though.)
     * calls skip after return if alsoskip is true.
     * @param {boolean?} [alsoskip=undefined]
     * @returns {number}
     */
    bit(alsoskip){
        const ibuffer=this;

        if(ibuffer.bufferlen<1){
            // just read 1 byte from input
            ibuffer.buffer=this.data[ibuffer.dataindex]
            ibuffer.bufferlen=8

            ibuffer.dataindex++
        }

        if(rtl){
            const ret=ibuffer.buffer&1;
            if(alsoskip)this.next();
            return ret;
        }else{
            const ret=(ibuffer.buffer>>(this.bufferlen-1))&1;
            if(alsoskip)this.next();
            return ret;
        }
    }

    /**
     * skip numbits bits
     * @param {number} [numbits=1] 
     */
    next(numbits=1){
        const ibuffer=this;

        if(numbits<0)throw `cannot skip ${numbits}<0 bits`;
        if(ibuffer.bufferlen<numbits)throw `invalid bufferlength`;

        if(rtl){
            // shift out leading bit
            ibuffer.buffer>>=numbits;
            ibuffer.bufferlen--;
        }else{
            // mask out leading bit
            ibuffer.buffer&=bitmask(this.bufferlen-1);
            ibuffer.bufferlen--;
        }
    }

    /**
     * get n bits as number
     * @param {number} n
     * @returns {number}
     */
    nbits(n){
        if(n<1)throw `n must be >=1, but is ${n}`;

        let ret=0;

        if(rtl){
            for(let i=0;i<n;i++){
                ret|=this.bit(true)<<i;
            }
        }else{
            for(let i=0;i<n;i++){
                ret|=this.bit(true)<<i;
            }
        }
        return ret;
    }
}

/**
 * 
 * @param {HuffmanTree} code_length_tree 
 * @param {BitBuffer} ibuffer  
 * @param {number} n 
 * @returns {Uint8Array}
 */
function parseNcodelengths(code_length_tree,ibuffer,n){
    const ret=new Uint8Array(n);
    for(let i=0;i<n;i++){
        const leaf=code_length_tree.parse(ibuffer);
        const code=leaf.value;

        if(code<=15){
            // emit literal
            ret[i]=code;
        }else if(code==16){
            // copy the previous code 3-6 times
            if(i==0)throw``;
            const last_code=ret[i-1];
            const numreps=3 + ibuffer.nbits(2);
            for(let r=0;r<numreps;r++){
                ret[i+r]=last_code;
            }
            i+=numreps-1;
        }else if(code==17){
            // copy length 0 3-10 times
            const numreps=3 + ibuffer.nbits(3);
            for(let r=0;r<numreps;r++){
                ret[i+r]=0;
            }
            i+=numreps-1;
        }else if(code==18){
            // copy length 0 11-138 times
            const numreps=11 + ibuffer.nbits(7);
            for(let r=0;r<numreps;r++){
                ret[i+r]=0;
            }
            i+=numreps-1;
        }else{throw ``;}
    }
    return ret;
}

// -- begin fixed huffman tree stuff
const code_lengths=new Uint8Array(288).map((v,i)=>{
    if(i>=0 && i<=143){
        return 8
    }else if(i>=144 && i<=255){
        return 9
    }else if(i>=256 && i<=279){
        return 7
    }else if(i>=280 && i<=287){
        return 8
    }else{throw ``}
});
const dist_lengths=new Uint8Array(30).map(()=>5);
const fixed_huffman_litlen_tree=HuffmanTree.make(code_lengths);
const fixed_huffman_dist_tree=HuffmanTree.make(dist_lengths);
// -- end fixed huffman tree stuff

// code lengths are read in this order
const code_length_parse_order=Object.freeze([
    16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15
]);

/**
 * decode DEFLATE compressed data
 * 
 * deflate [rfc1951](https://www.rfc-editor.org/rfc/rfc1951)
 * 
 * @param {Uint8Array} i 
 * @param {number} maxlen 
 * @returns {Uint8Array}
 */
function decode_deflate(i,maxlen){
    const ibuffer=new BitBuffer(
        i,
        0,
        0,
        0,
    );

    /// number of items currently in ret
    let nret=0;
    // dev note: for debugging, ret=[] also works
    const ret=new Uint8Array(maxlen);

    let bfinal=0;
    while(bfinal!==1){
        // read one block

        bfinal=ibuffer.nbits(1);
        const btype=ibuffer.nbits(2);

        /** @type {HuffmanTree?} */
        let litlen_tree=null;
        /** @type {HuffmanTree?} */
        let dist_tree=null;

        if(btype===0){
            // no compression

            // skip to byte boundary
            ibuffer.next(ibuffer.bufferlen);

            const LEN=arrToUint16(ibuffer.data.slice(ibuffer.dataindex))
            ibuffer.dataindex+=2
            const NLEN=arrToUint16(ibuffer.data.slice(ibuffer.dataindex))
            ibuffer.dataindex+=2

            if((LEN|NLEN)!=0xffff)throw `len+nlen invalid ${LEN}+${NLEN}=${LEN+NLEN} != ${0xffff}`

            console.log(`${LEN} ${NLEN}`)

            // copy LEN bytes into output
            for(let i=0;i<LEN;i++){
                ret[nret++]=ibuffer.data[ibuffer.dataindex++];
            }

            continue;
        }else if(btype===0b01){
            // fixed huffman

            litlen_tree=fixed_huffman_litlen_tree;
            dist_tree=fixed_huffman_dist_tree;
        }else if(btype===0b10){
            // dynamic huffman

            // 1) get number of entries in each list
            const hlit=ibuffer.nbits(5)+257;
            const hdist=ibuffer.nbits(5)+1;
            // number of code length codes
            const hclen=ibuffer.nbits(4)+4;
            // console.log(`hlit ${hlit} hdist ${hdist} hclen ${hclen}`);

            // 2) parse code length table
            const code_lengths=new Uint8Array(/*see code_length_parse_order*/19);
            for(let i=0;i<hclen;i++){
                // get next code length (as 3 bit unsigned integer)
                const code_length=ibuffer.nbits(3);

                // console.log(`length ${code_length} for code ${code_length_parse_order[i]}`);
                code_lengths[code_length_parse_order[i]]=code_length;
            }
            const code_length_tree=HuffmanTree.make(code_lengths);
            // console.log("made codelen tree");

            const litlen_code_lengths=parseNcodelengths(code_length_tree,ibuffer,hlit);
            const dist_code_lengths=parseNcodelengths(code_length_tree,ibuffer,hdist);

            litlen_tree=HuffmanTree.make(litlen_code_lengths);
            // console.log("made litlen tree")
            dist_tree=HuffmanTree.make(dist_code_lengths);
            // console.log("made dist tree")
        }else if(btype===0b11){
            throw `invalid btype ${btype}`;
        }else{throw `super duper invalid btype ${btype}`}

        // these cases can never happen, but TS does not know that.
        if(litlen_tree==null)throw `bug: litlen_tree invalid`;
        if(dist_tree==null)throw `bug: dist_tree invalid`;

        while(1){
            const leaf=litlen_tree.parse(ibuffer);
            //console.log(`leaf ${JSON.stringify(leaf)}`);
            
            const code=leaf.value;
            if(code<256){
                ret[nret++]=code;
                
                continue;
            }else if(code==256){
                break;
            }else if(code>287){
                throw `invalid leaf value ${JSON.stringify(leaf)}`;
            }

            // calculate length
            let length;
            if(code>=257 && code<=264){
                length=code-257+3;
            }else if(code>=265 && code<=268){
                length=(code-265)*(1<<1)+11+ibuffer.nbits(1);
            }else if(code>=269 && code<=272){
                length=(code-269)*(1<<2)+19+ibuffer.nbits(2);
            }else if(code>=273 && code<=276){
                length=(code-273)*(1<<3)+35+ibuffer.nbits(3);
            }else if(code>=277 && code<=280){
                length=(code-277)*(1<<4)+67+ibuffer.nbits(4);
            }else if(code>=281 && code<=284){
                length=(code-281)*(1<<5)+131+ibuffer.nbits(5);
            }else if(code==285){
                length=258;
            }else{
                throw `invalid length code`;
            }

            const dist_leaf=dist_tree.parse(ibuffer);
            const dist_code=dist_leaf.value;

            let dist;
            if(dist_code>=0 && dist_code<=3){
                dist=(dist_code-0)*(1<<0)+1;
            }else if(dist_code>=4 && dist_code<=5){
                dist=(dist_code-4)*(1<<1)+(1<<2)+1+ibuffer.nbits(1);
            }else if(dist_code>=6 && dist_code<=7){
                dist=(dist_code-6)*(1<<2)+(1<<3)+1+ibuffer.nbits(2);
            }else if(dist_code>=8 && dist_code<=9){
                dist=(dist_code-8)*(1<<3)+(1<<4)+1+ibuffer.nbits(3);
            }else if(dist_code>=10 && dist_code<=11){
                dist=(dist_code-10)*(1<<4)+(1<<5)+1+ibuffer.nbits(4);
            }else if(dist_code>=12 && dist_code<=13){
                dist=(dist_code-12)*(1<<5)+(1<<6)+1+ibuffer.nbits(5);
            }else if(dist_code>=14 && dist_code<=15){
                dist=(dist_code-14)*(1<<6)+(1<<7)+1+ibuffer.nbits(6);
            }else if(dist_code>=16 && dist_code<=17){
                dist=(dist_code-16)*(1<<7)+(1<<8)+1+ibuffer.nbits(7);
            }else if(dist_code>=18 && dist_code<=19){
                dist=(dist_code-18)*(1<<8)+(1<<9)+1+ibuffer.nbits(8);
            }else if(dist_code>=20 && dist_code<=21){
                dist=(dist_code-20)*(1<<9)+(1<<10)+1+ibuffer.nbits(9);
            }else if(dist_code>=22 && dist_code<=23){
                dist=(dist_code-22)*(1<<10)+(1<<11)+1+ibuffer.nbits(10);
            }else if(dist_code>=24 && dist_code<=25){
                dist=(dist_code-24)*(1<<11)+(1<<12)+1+ibuffer.nbits(11);
            }else if(dist_code>=26 && dist_code<=27){
                dist=(dist_code-26)*(1<<12)+(1<<13)+1+ibuffer.nbits(12);
            }else if(dist_code>=28 && dist_code<=29){
                dist=(dist_code-28)*(1<<13)+(1<<14)+1+ibuffer.nbits(13);
            }else{
                throw `invalid dist_code`;
            }

            for(let i=0;i<length;i++){
                const offset=nret-dist;
                if(offset<0)throw (`deflate decode out of bounds: ${offset} `
                    +`(length_code ${code} length ${length}, `
                    +`dist_code ${dist_code} ${dist})`);
                try{
                    ret[nret++]=ret[offset];
                }catch(e){
                    console.log(`array len ${nret}`);
                    throw e;
                }
            }
        }
    }

    if(!(ret instanceof Uint8Array)){
        return new Uint8Array(ret);
    }
    return ret;
}

/**
 * 
 * @param {Uint8Array} zlibCompressedData 
 * @param {number} maxlen 
 * @returns {Uint8Array}
 */
export function zlibDecode(zlibCompressedData,maxlen){
    let d=zlibCompressedData;

    const cmf=arrToUint8(d.slice(0,1));
    const flg=arrToUint8(d.slice(1,2));
    d=d.slice(2);

    const compression_method=cmf&0xf;
    const compression_info=cmf>>4;
    if(compression_method!=8){const error=`${compression_method}!=8`;alert(error);throw error}
    const window_size=1<<(compression_info+8);
    console.log(`window size ${window_size}`);

    const preset_dict=flg&(1<<5);
    console.log(`preset_dict? ${preset_dict}`);

    let dictid=0;
    if(preset_dict){
        dictid=arrToUint32(d.slice(0,4));
        d=d.slice(4);
    }

    const deflated=decode_deflate(new Uint8Array(d),maxlen);

    // TODO process DEFLATE data, followed by adler32 value (32bits)

    return deflated;
}