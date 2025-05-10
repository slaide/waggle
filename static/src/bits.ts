//# allFunctionsCalledOnLoad
"use strict";

/**
 * 
 * @param {string} str 
 * @returns {Uint8Array}
 */
export function stringToUint8Array(str:string):Uint8Array {
    const uint8Array = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        uint8Array[i] = str.charCodeAt(i);  // Get ASCII value of each character
    }
    return uint8Array;
}
/**
 * 
 * @param {Uint8Array} arr 
 * @returns {string}
 */
export function uint8ArrayToString(arr:Uint8Array):string{
    let ret=""
    for(let i=0;i<arr.length;i++){
        ret+=String.fromCharCode(arr[i])
    }
    return ret
}
/**
 * 
 * @param {Uint8Array} a 
 * @param {Uint8Array} b 
 * @returns {boolean}
 */
export function arrayBeginsWith(a:Uint8Array,b:Uint8Array):boolean{
    const len=Math.min(a.length,b.length)
    for(let i=0;i<len;i++){
        if(a[i]!=b[i])return false;
    }
    return true;
}
/**
 * return first x bytes as u32
 * @param {Uint8Array} arr 
 * @returns {number}
 */
export const arrToUint32=arrToUint(4);
/**
 * return first x bytes as u16
 * @param {Uint8Array} arr 
 * @returns {number}
 */
export const arrToUint16=arrToUint(2);
/**
 * return first x bytes as u8
 * @param {Uint8Array} arr 
 * @returns {number}
 */
export const arrToUint8=arrToUint(1);

/**
 * @param {number} n number of bytes
 * @param {boolean} [littleendian=true]
 * @returns {function(Uint8Array):number}
 */
export function arrToUint(n:number,littleendian:boolean=true):(ar:Uint8Array)=>number{
    return function(arr){
        if (arr.length < n) {
            throw new Error(`Not enough bytes to form an unsigned integer with ${n} bytes.`);
        }

        // Slice a portion of the array (length 4) and convert to Uint32
        let ret=0;
        for(let i=0;i<n;i++){
            if(littleendian){
                ret|=arr[i]<<(8*(n-1-i));
            }else{
                ret|=arr[i]<<(8*i);
            }
        }

        return ret;
    }
}

/**
 * 
 * @param {number} b bits to reverse
 * @param {number} n number of bits to reverse
 * @returns {number}
 */
export function reverseBits(b:number,n:number):number{
    let ret=0;
    for(let i=0;i<n;i++){
        ret|=((b>>(n-1-i))&1)<<(i);
    }
    //console.log(`----\nforward  ${binstr(b,n)}\nbackward ${binstr(ret,n)}\n----`)
    return ret;
}
/**
 * 
 * @param {number} b 
 * @param {number} n 
 * @returns {string}
 */
export function binstr(b:number,n:number):string{
    return b.toString(2).padStart(n,'0');
}
/**
/**
 * 
 * @param {number} n 
 * @returns {number}
 */
export function bitmask(n:number):number{
    return ((1<<n)-1);
}

const rtl=true;

export class BitBuffer{
    data:Uint8Array;
    dataindex:number;
    buffer:number;
    bufferlen:number;

    /**
     * 
     * @param {Uint8Array} data 
     * @param {number} dataindex 
     * @param {number} buffer 
     * @param {number} bufferlen 
     */
    constructor(data:Uint8Array,dataindex:number,buffer:number,bufferlen:number){
        this.data=data;
        this.dataindex=dataindex;
        this.buffer=buffer;
        this.bufferlen=bufferlen;
    }

    #fillBuffer(){
        const numbytes=4;
        this.buffer=arrToUint(numbytes,false)(this.data.subarray(this.dataindex));
        this.bufferlen=8*numbytes;

        this.dataindex+=numbytes;
    }

    /**
     * returns next 1 bit (peeks by default. will refill automatically though.)
     * calls skip after return if alsoskip is true.
     * @param {boolean?} [alsoskip=undefined]
     * @returns {number}
     */
    bit(alsoskip:boolean|undefined){
        if(this.bufferlen===0){
            this.#fillBuffer();
        }

        if(rtl){
            const ret=this.buffer&1;
            if(alsoskip)this.next();
            return ret;
        }else{
            const ret=(this.buffer>>(this.bufferlen-1))&1;
            if(alsoskip)this.next();
            return ret;
        }
    }

    /**
     * get n bits as number
     * @param {number} n
     * @returns {number}
     */
    nbits(n:number){
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

    /**
     * skip numbits bits
     * @param {number} [numbits=1] 
     */
    next(numbits:number=1){
        if(numbits<0)throw `cannot skip ${numbits}<0 bits`;
        if(this.bufferlen<numbits)throw `invalid bufferlength`;

        if(rtl){
            // shift out leading bit
            this.buffer>>=numbits;
            this.bufferlen--;
        }else{
            // mask out leading bit
            this.buffer&=bitmask(this.bufferlen-1);
            this.bufferlen--;
        }
    }
}