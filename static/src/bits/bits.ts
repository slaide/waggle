//# allFunctionsCalledOnLoad
"use strict";

export function stringToUint8Array(str:string):Uint8Array {
    const uint8Array = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        uint8Array[i] = str.charCodeAt(i);  // Get ASCII value of each character
    }
    return uint8Array;
}
export function uint8ArrayToString(arr:Uint8Array):string{
    let ret=""
    for(let i=0;i<arr.length;i++){
        ret+=String.fromCharCode(arr[i])
    }
    return ret
}
export function arrayBeginsWith(a:Uint8Array,b:Uint8Array):boolean{
    const len=Math.min(a.length,b.length)
    for(let i=0;i<len;i++){
        if(a[i]!=b[i])return false;
    }
    return true;
}
/** return first x bytes as u32 */
export const arrToUint32=arrToUint(4);
/** return first x bytes as u16 */
export const arrToUint16=arrToUint(2);
/** return first x bytes as u8 */
export const arrToUint8=arrToUint(1);

export function arrToUint(
    /** number of bytes */
    n:number,
    littleendian:boolean=true,
):(ar:Uint8Array)=>number{
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

export function reverseBits(
    /** bits to reverse */
    b:number,
    /** number of bits to reverse */
    n:number,
):number{
    let ret=0;
    for(let i=0;i<n;i++){
        ret|=((b>>(n-1-i))&1)<<(i);
    }
    //console.log(`----\nforward  ${binstr(b,n)}\nbackward ${binstr(ret,n)}\n----`)
    return ret;
}
export function binstr(b:number,n:number):string{
    return b.toString(2).padStart(n,'0');
}
export function bitmask(n:number):number{
    return ((1<<n)-1);
}

const rtl=true;

export class BitBuffer{
    constructor(
        public data:Uint8Array,
        public dataindex:number,
        public buffer:number,
        public bufferlen:number,
    ){}

    #fillBuffer(){
        const numbytes=4;
        this.buffer=arrToUint(numbytes,false)(this.data.subarray(this.dataindex));
        this.bufferlen=8*numbytes;

        this.dataindex+=numbytes;
    }

    /**
     * returns next 1 bit (peeks by default. will refill automatically though.)
     * calls skip after return if alsoskip is true.
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

    /** get n bits as number */
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

    /** skip numbits bits */
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