//# allFunctionsCalledOnLoad
"use strict";

/**
 * 
 * @param {string} str 
 * @returns {Uint8Array}
 */
export function stringToUint8Array(str) {
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
export function uint8ArrayToString(arr){
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
export function arrayBeginsWith(a,b){
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
export function arrToUint(n,littleendian=true){
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
export function reverseBits(b,n){
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
export function binstr(b,n){
    return b.toString(2).padStart(n,'0');
}
/**
 * for testing
 * @param {number} b 
 * @param {number} n 
 */
function printreversedbits(b,n){
    let forward=b;
    let backward=reverseBits(b,n);
    console.log(`----\nforward  ${binstr(forward,n)}\nbackward ${binstr(backward,n)}\n----`)
}
/**
 * 
 * @param {number} n 
 * @returns {number}
 */
export function bitmask(n){
    return ((1<<n)-1);
}