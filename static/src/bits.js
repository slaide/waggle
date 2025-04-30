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
export function arrToUint32(arr) {
    const numbytes=4
    if (arr.length < numbytes) {
        throw new Error("Not enough bytes to form a Uint32.");
    }
    
    // Slice a portion of the array (length 4) and convert to Uint32
    let ret=0
    for(let i=0;i<numbytes;i++){
        ret|=arr[i]<<(8*(numbytes-1-i))
    }
    
    return ret
}

/**
 * return first x bytes as u16
 * @param {Uint8Array} arr 
 * @returns {number}
 */
export function arrToUint16(arr) {
    const numbytes=2
    if (arr.length < numbytes) {
        throw new Error("Not enough bytes to form a Uint32.");
    }

    // Slice a portion of the array (length 4) and convert to Uint32
    let ret=0
    for(let i=0;i<numbytes;i++){
        ret|=arr[i]<<(8*(numbytes-1-i))
    }

    return ret
}
/**
 * return first x bytes as u8
 * @param {Uint8Array} arr 
 * @returns {number}
 */
export function arrToUint8(arr) {
    const numbytes=1
    if (arr.length < numbytes) {
        throw new Error("Not enough bytes to form a Uint32.");
    }

    // Slice a portion of the array (length 4) and convert to Uint32
    let ret=0
    for(let i=0;i<numbytes;i++){
        ret|=arr[i]<<(8*(numbytes-1-i))
    }

    return ret
}