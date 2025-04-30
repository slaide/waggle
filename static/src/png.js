"use strict";

import {
    stringToUint8Array,
    uint8ArrayToString,
    arrayBeginsWith,
    arrToUint32,
    arrToUint16,
    arrToUint8,
} from "./bits.js";

import {zlibDecode} from "./zlib.js";

/** @typedef {"G"|"RGB"|"Indexed"|"GA"|"RGBA"} IHDRColortype */
/** @type {{[i:number]:IHDRColortype}} */
const IHDR_COLORTYPE_ENUMS={
    0:"G",
    2:"RGB",
    3:"Indexed",
    4:"GA",
    6:"RGBA",
};
/** @typedef {"nointerlace"|"Adam7"} IHDRInterlacemethod */
/** @type {{[i:number]:IHDRInterlacemethod}} */
const IHDR_INTERLACEMETHOD_ENUMS={
    0:"nointerlace",
    1:"Adam7",
};

/**
 * @typedef {{
* width:number,
* height:number,
* bitdepth:number,
* colortype:IHDRColortype,
* compressionmethod:number,
* filtermethod:number,
* interlacemethod:IHDRInterlacemethod,
* }} IHDR_chunk
*/

/**
 * spec at https://www.w3.org/TR/png-3/#10Compression
 * 
 * zlib [rfc1950](https://www.rfc-editor.org/rfc/rfc1950)
 * deflate [rfc1951](https://www.rfc-editor.org/rfc/rfc1951)
 * 
 * @param {string} src 
 * @returns {Promise<{width:number,height:number,data:Uint8Array}>}
 */
export async function parsePng(src){
    let responseData=await (new Promise((resolve,reject)=>{
        const xhr=new XMLHttpRequest()
        xhr.open("GET",src,true)
        xhr.responseType = 'arraybuffer'
        xhr.onload=ev=>{
            resolve(xhr.response)
        }
        xhr.onerror=ev=>{
            alert(`failed to fetch png`)
            reject({xhr,ev})
        }
        xhr.send()
    }));

    /** @type {IHDR_chunk?} */
    let IHDR=null;
    /** @type {Uint8Array?} */
    let IDAT=null;

    const pngdata=new Uint8Array(responseData)
    console.log(`got ${pngdata.length} bytes`)

    let pngslice=pngdata.slice(0)

    const png_start=new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    if(!arrayBeginsWith(pngslice,png_start)){const error=`png start invalid`;alert(error);throw error;}
    pngslice=pngslice.slice(png_start.length)

    while(pngslice.length>0){
        let chunklength=arrToUint32(pngslice.slice(0,4))
        let header=uint8ArrayToString(pngslice.slice(4,8))
        let chunkdata=pngslice.slice(8,8+chunklength)
        let crc=pngslice.slice(8+chunklength,8+chunklength+4)

        pngslice=pngslice.slice(8+chunklength+4)

        console.log(`chunk: ${header} len ${chunklength}`)
        if(header=="IHDR"){
            /**
             * Width	4 bytes
                Height	4 bytes
                Bit depth	1 byte
                Color type	1 byte
                Compression method	1 byte
                Filter method	1 byte
                Interlace method	1 byte
                */
            const width=arrToUint32(chunkdata.slice(0,4))
            const height=arrToUint32(chunkdata.slice(4,8))
            const bitdepth=arrToUint8(chunkdata.slice(8,9))
            const colortype_raw=arrToUint8(chunkdata.slice(9,10))
            const compressionmethod=arrToUint8(chunkdata.slice(10,11))
            const filtermethod=arrToUint8(chunkdata.slice(11,12))
            const interlacemethod_raw=arrToUint8(chunkdata.slice(12,13))

            const colortype=IHDR_COLORTYPE_ENUMS[colortype_raw];
            if(compressionmethod!=0){const error=`compressionmethod ${compressionmethod}!=0`;alert(error);throw error;}
            if(filtermethod!=0){const error=`filtermethod ${filtermethod}!=0`;alert(error);throw error;}
            const interlacemethod=IHDR_INTERLACEMETHOD_ENUMS[interlacemethod_raw];

            IHDR={
                width,
                height,
                bitdepth,
                colortype,
                compressionmethod,
                filtermethod,
                interlacemethod,
            };
            console.log("IHDR:",JSON.stringify(IHDR));
        }else if(header=="IDAT"){
            if(!IDAT){
                IDAT=chunkdata;
            }else{
                /** @type {Uint8Array} */
                const newar=new Uint8Array(IDAT.length+chunkdata.length);
                newar.set(IDAT,0);
                newar.set(chunkdata,IDAT.length);
                IDAT=newar;
            }
        }
    }

    if(IDAT==null){const error=`IDAT is missing`;console.error(error);throw error;}
    console.log(`IDAT length: ${IDAT.length}`);
    // idat is a zlib compressed stream. zlib only supports one compression method: deflate. (compression method 0 in the png ihdr)

    const filteredData=zlibDecode(IDAT);

    if(!IHDR)throw``;
    const {width,height}=IHDR;

    const outdata=new Uint8Array(width*height*4)

    throw `TODO (process filteredData into outdata)`;
    // TODO

    const ret={width,height,outdata};
    //return ret;
}