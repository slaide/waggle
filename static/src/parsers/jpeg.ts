/**
 * @file A baseline JPEG (SOF0) parser in TypeScript.
 * @see https://www.w3.org/Graphics/JPEG/itu-t81.pdf
 * @see https://www.w3.org/Graphics/JPEG/jfif3.pdf
 * @see https://github.com/jpeg-js/jpeg-js/blob/master/lib/decoder.js
 */
import { HuffmanTree } from '../bits/huffman.js';
import { BitBuffer } from '../bits/bits.js';
import { ByteReader } from '../bits/bytereader.js';
import { getGlobalVFS, Path } from '../vfs.js';

// --- Error Classes ---
class CorruptError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CorruptError';
    }
}
class UnsupportedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnsupportedError';
    }
}

// --- Interfaces ---
interface StartOfScanComponent {
    /** component id */
    id: number;
    /** dc huffman table id */
    dcId: number;
    /** ac huffman table id */
    acId: number;
    /** image component corresponding to this scan component */
    imageComponent:ImageComponent;
}

/** JPEG uses little-endian byte order (which is 'false' in the ByteReader constructor) */
const JPEG_ENDIAN=false;

export function parseCOM(data:Uint8Array):string{
    const reader=new ByteReader(data.buffer,JPEG_ENDIAN);
    const len=reader.readUint16()-2;
    const comment=reader.readFixedString(len,"ascii");
    return comment;
}

export enum JFIFUnits{
    NoUnits=0,
    Inch=1,
    Cm=2,
}
export interface JFIFData{
    majorVersion:number;
    minorVersion:number;
    units:JFIFUnits;
    xDensity:number;
    yDensity:number;
    xThumbnail:number;
    yThumbnail:number;
    /** Uncompressed 24 bit RGB (8 bits per color channel) raster thumbnail data in the order R0, G0, B0, ... */
    thumbnailData:Uint8Array|null;
}
/** parse the JFIF segment, usually from APP0 */
export function parseJFIF(data:Uint8Array):JFIFData{
    const reader=new ByteReader(data.buffer,JPEG_ENDIAN);

    const JFIF_IDENTIFIER="JFIF\0";
    const jfif_head=reader.readFixedString(JFIF_IDENTIFIER.length,"ascii");
    if(jfif_head!==JFIF_IDENTIFIER){
        throw new CorruptError(`Expected JFIF identifier but got ${jfif_head} instead`);
    }

    const majorVersion = reader.readUint8();
    const minorVersion = reader.readUint8();
    const units = reader.readUint8() as JFIFUnits;
    const xDensity = reader.readUint16();
    const yDensity = reader.readUint16();
    const xThumbnail = reader.readUint8();
    const yThumbnail = reader.readUint8();
    
    let thumbnailData: Uint8Array | null = null;
    if (xThumbnail > 0 && yThumbnail > 0) {
        const thumbnailSize = xThumbnail * yThumbnail * 3; // RGB thumbnail
        thumbnailData = reader.readBytes(thumbnailSize);
    }
    
    return {
        majorVersion,
        minorVersion,
        units,
        xDensity,
        yDensity,
        xThumbnail,
        yThumbnail,
        thumbnailData,
    };
}

// Public interface for the parsed image data
export interface ImageDataLike {
    width: number;
    height: number;
    data: Uint8Array;
    optionalSegments:Map<JpegMarker,Uint8Array>;
}

const ZIGZAG=new Uint8Array([
    0,  1,  5,  6,  14, 15, 27, 28,
    2,  4,  7,  13, 16, 26, 29, 42,
    3,  8,  12, 17, 25, 30, 41, 43,
    9,  11, 18, 24, 31, 40, 44, 53,
    10, 19, 23, 32, 39, 45, 52, 54,
    20, 22, 33, 38, 46, 51, 55, 60,
    21, 34, 37, 47, 50, 56, 59, 61,
]);
const UNZIGZAG=new Uint8Array([
    0,  1,  8,  16, 9,  2,  3,  10,
    17, 24, 32, 25, 18, 11, 4,  5,
    12, 19, 26, 33, 40, 48, 41, 34,
    27, 20, 13, 6,  7,  14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36,
    29, 22, 15, 23, 30, 37, 44, 51,
    58, 59, 52, 45, 38, 31, 39, 46,
    53, 60, 61, 54, 47, 55, 62, 63,
]);

enum JpegMarker {
    // Start of Frame markers, non-differential, Huffman coding
    SOF0 = 0xc0, // Baseline DCT
    SOF1 = 0xc1, // Extended sequential DCT
    SOF2 = 0xc2, // Progressive DCT
    SOF3 = 0xc3, // Lossless (sequential)
    // Start of Frame markers, differential, Huffman coding
    SOF5 = 0xc5, // Differential sequential DCT
    SOF6 = 0xc6, // Differential progressive DCT
    SOF7 = 0xc7, // Differential lossless (sequential)
    // Start of Frame markers, non-differential, arithmetic coding
    SOF9 = 0xc9, // Extended sequential DCT
    SOF10 = 0xca, // Progressive DCT
    SOF11 = 0xcb, // Lossless (sequential)
    // Start of Frame markers, differential, arithmetic coding
    SOF13 = 0xcd, // Differential sequential DCT
    SOF14 = 0xce, // Differential progressive DCT
    SOF15 = 0xcf, // Differential lossless (sequential)
    // Huffman table specification
    DHT = 0xc4, // Define Huffman table(s)
    // Arithmetic coding conditioning specification
    DAC = 0xcc, // Define arithmetic coding conditioning(s)
    // Restart interval termination
    RST0 = 0xd0,
    RST1 = 0xd1,
    RST2 = 0xd2,
    RST3 = 0xd3,
    RST4 = 0xd4,
    RST5 = 0xd5,
    RST6 = 0xd6,
    RST7 = 0xd7,

    /** Start of image */
    SOI = 0xd8,
    /** End of image */
    EOI = 0xd9,
    /** Start of scan */
    SOS = 0xda,
    /** Define quantization table(s) */
    DQT = 0xdb,
    /** Define number of lines */
    DNL = 0xdc,
    /** Define restart interval */
    DRI = 0xdd,
    /** Define hierarchical progression */
    DHP = 0xde,
    /** Expand reference component(s) */
    EXP = 0xdf,
    /** Application-specific */
    APP0 = 0xe0,
    /** Application-specific */
    APP1 = 0xe1,
    /** Application-specific */
    APP2 = 0xe2,
    /** Application-specific */
    APP3 = 0xe3,
    /** Application-specific */
    APP4 = 0xe4,
    /** Application-specific */
    APP5 = 0xe5,
    /** Application-specific */
    APP6 = 0xe6,
    /** Application-specific */
    APP7 = 0xe7,
    /** Application-specific */
    APP8 = 0xe8,
    /** Application-specific */
    APP9 = 0xe9,
    /** Application-specific */
    APP10 = 0xea,
    /** Application-specific */
    APP11 = 0xeb,
    /** Application-specific */
    APP12 = 0xec,
    /** Application-specific */
    APP13 = 0xed,
    /** Application-specific */
    APP14 = 0xee,
    /** Application-specific */
    APP15 = 0xef,
    /** Comment */
    COM = 0xfe,
}
function markerName(marker:JpegMarker):string{
    switch(marker){
        case JpegMarker.SOI:
            return "SOI";
        case JpegMarker.EOI:
            return "EOI";
        case JpegMarker.SOS:
            return "SOS";
        case JpegMarker.DHT:
            return "DHT";
        case JpegMarker.DQT:
            return "DQT";
        case JpegMarker.DRI:
            return "DRI";
        case JpegMarker.RST0:
            return "RST0";
        case JpegMarker.RST1:
            return "RST1";
        case JpegMarker.RST2:
            return "RST2";
        case JpegMarker.RST3:
            return "RST3";
        case JpegMarker.RST4:
            return "RST4";
        case JpegMarker.RST5:
            return "RST5";
        case JpegMarker.RST6:
            return "RST6";
        case JpegMarker.RST7:
            return "RST7";
        case JpegMarker.COM:
            return "COM";
        case JpegMarker.SOF0:
            return "SOF0";
        case JpegMarker.SOF1:
            return "SOF1";
        case JpegMarker.SOF2:
            return "SOF2";
        case JpegMarker.SOF3:
            return "SOF3";
        case JpegMarker.SOF5:
            return "SOF5";
        case JpegMarker.SOF6:
            return "SOF6";
        case JpegMarker.SOF7:
            return "SOF7";
        case JpegMarker.APP0:
            return "APP0";
        case JpegMarker.APP1:
            return "APP1";
        case JpegMarker.APP2:
            return "APP2";
        case JpegMarker.APP3:
            return "APP3";
        case JpegMarker.APP4:
            return "APP4";
        case JpegMarker.APP5:
            return "APP5";
        case JpegMarker.APP6:
            return "APP6";
        case JpegMarker.APP7:
            return "APP7";
        case JpegMarker.APP8:
            return "APP8";
        case JpegMarker.APP9:
            return "APP9";
        case JpegMarker.APP10:
            return "APP10";
        case JpegMarker.APP11:
            return "APP11";
        case JpegMarker.APP12:
            return "APP12";
        case JpegMarker.APP13:
            return "APP13";
        case JpegMarker.APP14:
            return "APP14";
        case JpegMarker.APP15:
            return "APP15";
        case JpegMarker.COM:
            return "COM";
        default:
            throw new CorruptError(`Unknown marker: ${marker.toString(16)}`);
    }
}

interface ImageComponent{
    id:number;
    /** horizontal sampling factor, i.e. 1 value covers this many pixels */
    hFactor:number;
    /** vertical sampling factor, i.e. 1 value covers this many pixels */
    vFactor:number;
    /** quantization table id */
    quantId:number;
}

type QuantizationTable=Int16Array;

/**
calculate custom-width twos complement (for an integer)
 
Params:
   v = unsigned input value
   bit_width = number of bits to take into account for the calculation
Returns: signed twos complement representation of `v`
 */
function twos_complement(v:number,bit_width:number){
    if (bit_width === 0) return 0;
    
    const threshold = 1 << (bit_width - 1);
    if (v >= threshold) {
        // Positive values: unchanged
        return v;
    } else {
        // Negative values: v - (2^bit_width - 1)
        return v - ((1 << bit_width) - 1);
    }
}
function bitmask(num_bits:number){
    if(num_bits===0)return 0;
    return (1<<num_bits)-1;
}

function idct_spec_1d(spectrum:number,x:number){
    const freq=(2*x+1)*spectrum*Math.PI/16;
    const alpha=spectrum===0?1/Math.SQRT2:1;
    const value=alpha*Math.cos(freq);
    return value;
}

// Pre-calculate cosine values for IDCT with alpha factor included
const IDCT_COSINE_CACHE = new Float32Array(64);
for (let i = 0; i < 8; i++) {
    const alpha = i === 0 ? 1/Math.SQRT2 : 1;
    for (let j = 0; j < 8; j++) {
        IDCT_COSINE_CACHE[i * 8 + j] = alpha * Math.cos((2 * j + 1) * i * Math.PI / 16);
    }
}

// Reusable temporary arrays for IDCT calculation
const tempRow = new Float32Array(8);
const tempCol = new Float32Array(8);

function fastIdct(block: Int16Array, out: Int16Array = new Int16Array(64)) {
    // First pass - 1D IDCT on rows
    for (let y = 0; y < 8; y++) {
        const rowOffset = y * 8;
        
        // Process each row
        for (let x = 0; x < 8; x++) {
            let sum = 0;
            for (let u = 0; u < 8; u++) {
                const val = block[rowOffset + u];
                if (val !== 0) { // Skip zero coefficients
                    sum += val * IDCT_COSINE_CACHE[u * 8 + x];
                }
            }
            tempRow[x] = sum;
        }
        
        // Store row results
        for (let x = 0; x < 8; x++) {
            out[rowOffset + x] = tempRow[x];
        }
    }

    // Second pass - 1D IDCT on columns
    for (let x = 0; x < 8; x++) {
        // Process each column
        for (let y = 0; y < 8; y++) {
            let sum = 0;
            for (let v = 0; v < 8; v++) {
                const val = out[v * 8 + x];
                if (val !== 0) { // Skip zero coefficients
                    sum += val * IDCT_COSINE_CACHE[v * 8 + y];
                }
            }
            tempCol[y] = sum * 0.25; // Include the 1/4 scale factor here
        }
        
        // Store column results
        for (let y = 0; y < 8; y++) {
            out[y * 8 + x] = Math.round(tempCol[y]);
        }
    }

    return out;
}

export async function parseJpeg(
    source: string | Uint8Array,
): Promise<ImageDataLike> {
    if (typeof source === 'string') {
        const vfs = getGlobalVFS();
        let responseData: ArrayBuffer;
        try {
            responseData = await vfs.readBinary(new Path(source));
        } catch (error) {
            const errorMsg = `Failed to read JPEG file from ${source}: ${error instanceof Error ? error.message : String(error)}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }
        return parseJpegFromBuffer(new Uint8Array(responseData));
    } else {
        return parseJpegFromBuffer(source);
    }
}

export async function parseJpegFromBuffer(
    source: Uint8Array,
): Promise<ImageDataLike> {
    // Handle different ArrayBuffer access patterns
    let buffer: ArrayBuffer;
    if (source.buffer && source.buffer instanceof ArrayBuffer) {
        buffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    } else {
        buffer = new Uint8Array(source).buffer;
    }
    const reader = new ByteReader(buffer, JPEG_ENDIAN);

    console.log(`source.length=${source.length}`);

    let width=0;
    let height=0;
    let restartInterval=0;
    const optionalSegments=new Map<JpegMarker,Uint8Array>();
    const quantizationTables=new Map<number,QuantizationTable>();
    const imageComponents:ImageComponent[]=[];
    const acHuffmanTables=new Map<number,HuffmanTree>();
    const dcHuffmanTables=new Map<number,HuffmanTree>();
    let scanData: Int16Array[] = [];

    let soiFound=false;

    parseSegments: while(reader.getRemainingBytes()>0){
        const ff=reader.readUint8();
        if(ff!==0xFF){
            throw new CorruptError(`Expected FF but got ${ff.toString(16)}`);
        }

        const marker=reader.readUint8();
        console.log(`Marker: ${marker.toString(16)} ${markerName(marker)}`);

        if(marker==JpegMarker.SOI){
            if(soiFound){
                throw new CorruptError("Multiple SOI markers");
            }
            soiFound=true;
            continue;
        }else if(!soiFound){
            throw new CorruptError(`SOI marker must be first marker, but instead got ${marker}`);
        }
        
        switch(marker){
            case JpegMarker.EOI:
                break parseSegments;
            case JpegMarker.DRI:
                // B 2.4.4
                {
                    const len=reader.readUint16()-2;
                    if(len!==2){
                        throw new CorruptError("Expected DRI length of 2");
                    }
                    restartInterval=reader.readUint16();
                    console.log(`DRI: restart interval=${restartInterval}`);
                    break;
                }

            case JpegMarker.SOF0:
            case JpegMarker.SOF2:
                // B 2.2.2
                {
                    const len=reader.readUint16()-2;

                    const p=reader.readUint8();
                    if(p!==8){
                        throw new UnsupportedError(`Only 8-bit precision is supported for SOF`);
                    }
                    height=reader.readUint16();
                    width=reader.readUint16();
                    console.log(`${marker === JpegMarker.SOF0 ? 'SOF0' : 'SOF2'}: ${width}x${height}`);

                    const numComponents=reader.readUint8();
                    for(let i=0;i<numComponents;i++){
                        const compId=reader.readUint8();
                        const hv=reader.readUint8();
                        const hFactor=hv>>4;
                        const vFactor=hv&0xF;
                        const quantId=reader.readUint8();
                        imageComponents.push({
                            id:compId,
                            hFactor,
                            vFactor,
                            quantId,
                        });
                        console.log(`component ${compId}: hFactor=${hFactor}, vFactor=${vFactor}, quantId=${quantId}`);
                    }
                    break;
                }
            
            case JpegMarker.APP0:
                // B 2.4.6
                {
                    const len=reader.readUint16()-2;
                    const bytes=reader.readBytes(len);
                    try{
                        const jfifData=parseJFIF(bytes);
                        console.log(jfifData);
                    }catch{
                        console.log(`found APP0, which is not a JFIF segment`);
                    }
                    break;
                }
            case JpegMarker.APP1:
            case JpegMarker.APP2:
            case JpegMarker.APP3:
            case JpegMarker.APP4:
            case JpegMarker.APP5:
            case JpegMarker.APP6:
            case JpegMarker.APP7:
            case JpegMarker.APP8:
            case JpegMarker.APP9:
            case JpegMarker.APP10:
            case JpegMarker.APP11:
            case JpegMarker.APP12:
            case JpegMarker.APP13:
            case JpegMarker.APP14:
            case JpegMarker.APP15:
            case JpegMarker.COM:
                // 2.4.5
                {
                    const len=reader.readUint16()-2;
                    console.log(`bytes in segment ${len}`);
                    for(let i=0;i<len;i++){
                        reader.readUint8();
                    }
                    break;
                }
            case JpegMarker.DHT:
                // B 2.4.2
                {
                    const len=reader.readUint16()-2;
                    let remaining=len;
                    while(remaining>0){
                        const tcth=reader.readUint8();
                        const tc=tcth>>4;
                        const th=tcth&0xF;
                        // number of codes for each length
                        const numLengths=reader.readBytes(16);

                        remaining-=16+1;

                        const numCodes=numLengths.reduce((acc,len)=>acc+len,0);
                        const codeLengths=new Uint8Array(numCodes);
                        let codeIndex=0;
                        for(let i=0;i<16;i++){
                            for(let j=0;j<numLengths[i];j++){
                                codeLengths[codeIndex++]=i+1;
                            }
                        }

                        const codeValues=new Uint8Array(numCodes);
                        for(let i=0;i<numCodes;i++){
                            codeValues[i]=reader.readUint8();
                        }
                        remaining-=numCodes;

                        const huffmanTable=HuffmanTree.make(codeLengths,JPEG_ENDIAN,codeValues);
                        if(tc===0){
                            dcHuffmanTables.set(th,huffmanTable);
                        }else{
                            acHuffmanTables.set(th,huffmanTable);
                        }
                        console.log(`read DHT table ${th} class ${tc} with ${numCodes} entries`);
                    }

                    break;
                }
            case JpegMarker.DQT:
                // B 2.4.1
                {
                    const len=reader.readUint16()-2;
                    let remaining=len;
                    while(remaining>0){
                        const pqtq=reader.readUint8();
                        /** pq is the precision of the table, 0 for 8 bit, 1 for 16 bit */
                        const pq=pqtq>>4;
                        if(pq!==0){
                            throw new UnsupportedError(`Precision of quantization table must be 8 bits, but got ${pq}`);
                        }
                        const tq=pqtq&0xF;
                        const tableData:QuantizationTable=new Int16Array(reader.readBytes(64));
                        quantizationTables.set(tq,tableData);
                        remaining-=64+1;

                        console.log(`read DQT table ${tq} with ${tableData.length} bytes`);
                    }
                    break;
                }

            case JpegMarker.SOS:
                // B 2.3
                {
                    // Read length but don't use it for validation since SOS parsing is more complex
                    reader.readUint16(); // skip length

                    const numScanComponents=reader.readUint8();
                    console.log(`numScanComponents=${numScanComponents}`);

                    const scanComponents:StartOfScanComponent[]=[];

                    for(let i=0;i<numScanComponents;i++){
                        const scanCompId=reader.readUint8();
                        const tdta=reader.readUint8();
                        const acId=tdta&0xF;
                        const dcId=tdta>>4;

                        console.log(`scanCompId=${scanCompId}, tdta=${tdta}, acId=${acId}, dcId=${dcId}`);

                        const imageComponent=imageComponents.find(c=>c.id===scanCompId);
                        if(!imageComponent){
                            throw new CorruptError(`Scan component ${scanCompId} does not match any image component`);
                        }

                        if(!dcHuffmanTables.has(dcId)){
                            throw new CorruptError(`DC Huffman table ${dcId} not found`);
                        }
                        // AC table validation will be done later when actually needed

                        scanComponents.push({
                            id:scanCompId,
                            dcId,
                            acId,
                            imageComponent,
                        });
                    }

                    const Ss=reader.readUint8();
                    const Se=reader.readUint8();
                    const ahal=reader.readUint8();
                    const ah=ahal>>4;
                    const al=ahal&0xF;

                    console.log(`Ss=${Ss}, Se=${Se}, ah=${ah}, al=${al}`);
                    
                    // Progressive JPEG handling
                    if (Ss !== 0 || Se !== 63) {
                        throw new UnsupportedError(`Progressive JPEG scans not fully supported. This implementation requires baseline/sequential JPEGs with Ss=0, Se=63. Found Ss=${Ss}, Se=${Se}`);
                    }

                    // allocate data for all scans
                    // per component
                    scanData=[
                        new Int16Array(width*height),
                        new Int16Array(width*height),
                        new Int16Array(width*height),
                    ];

                    const numScanLines=Math.ceil(height/8);
                    const numMCUsPerScanline=Math.ceil(width/8);
                    // -1 because we increment before checking the restart interval
                    let totalMcuIndex=-1;
                    let numRestarts=0;

                    let eob_run=0;
                    let diffdc=[0,0,0,0];
                    

                    let chunkData:number[]=[];
                    let chunkBitReader=new BitBuffer(new Uint8Array(chunkData),0,0,0,JPEG_ENDIAN);
                    for(let scanlineIndex=0;scanlineIndex<numScanLines;scanlineIndex++){
                        console.log(`scanlineIndex=${scanlineIndex}, numScanLines=${numScanLines}`);
                        for(let mcuIndex=0;mcuIndex<numMCUsPerScanline;mcuIndex++){

                            totalMcuIndex++;

                            if(restartInterval>0 && totalMcuIndex%restartInterval===0){
                                eob_run=0;
                                diffdc=[0,0,0,0];

                                if(totalMcuIndex>0){
                                    // expect a restart marker next: 0xFFDn
                                    const v0=reader.readUint8();
                                    const v1=reader.readUint8();
                                    if(v0!==0xFF){
                                        throw new CorruptError(`Expected 0xFF but got ${v0.toString(16)}`);
                                    }
                                    console.log(`v1=${markerName(v1)}`);
                                    if(numRestarts%8!==(v1-JpegMarker.RST0)){
                                        console.error(`Expected restart marker ${JpegMarker.RST0+numRestarts%8} but got ${v1}`);
                                    }
                                    numRestarts++;
                                    if((v1&0xf0)!==JpegMarker.RST0){
                                        throw new CorruptError(`Expected restart marker but got ${v1.toString(16)}`);
                                    }
                                }

                                // read the entropy coded data until the next restart marker, while removing stuffed bytes
                                chunkData=[];
                                while (true) {
                                    const byte = reader.readUint8();
                                    
                                    // Check for restart markers (0xFF followed by 0xD0-0xD7)
                                    if (byte === 0xFF) {
                                        const nextByte = reader.readUint8();
                                        if (nextByte >= JpegMarker.RST0 && nextByte <= JpegMarker.RST7) {
                                            reader.skip(-2);
                                            // Found restart marker, stop reading
                                            break;
                                        }
                                        if(nextByte==JpegMarker.EOI){
                                            reader.skip(-2);
                                            // Found EOI marker, stop reading
                                            break;
                                        }
                                        if (nextByte === 0x00) {
                                            // This is a stuffed byte (0xFF 0x00), skip the 0x00
                                            chunkData.push(byte);
                                            continue;
                                        } else {
                                            // This might be another marker, push both bytes and continue
                                            chunkData.push(byte);
                                            chunkData.push(nextByte);
                                            continue;
                                        }
                                    }
                                    
                                    // Regular byte, add to chunk data
                                    chunkData.push(byte);
                                }
                                console.log(`chunkData.length=${chunkData.length}`);
                                console.log(`old bitreader exhaustion: ${chunkBitReader.dataIndex} of ${chunkBitReader.data.length} (left in bufer: ${chunkBitReader.bufferLen})`);
                                if(chunkBitReader.dataIndex!==chunkBitReader.data.length){
                                    console.error(`chunkBitReader NOT exhausted`);
                                }
                                chunkBitReader=new BitBuffer(new Uint8Array(chunkData),0,0,0,JPEG_ENDIAN);
                            }

                            for(let componentIndex=0;componentIndex<numScanComponents;componentIndex++){
                                const component=scanComponents[componentIndex];

                                // check dc table (only required if Ss is 0)
                                const dcTable=dcHuffmanTables.get(component.dcId);
                                if(!dcTable && Ss===0){
                                    throw new CorruptError(`DC Huffman table ${component.dcId} not found`);
                                }

                                // check ac table (only required if Se > 0 or not progressive)
                                const acTable=acHuffmanTables.get(component.acId);
                                if(!acTable && Se>0){
                                    throw new CorruptError(`AC Huffman table ${component.acId} not found`);
                                }
                                
                                const numBlocksPerMcu=component.imageComponent.hFactor*component.imageComponent.vFactor;
                                const base_index=(numMCUsPerScanline*scanlineIndex*numBlocksPerMcu+mcuIndex)*64;

                                let spectrum=Ss;
                                if(spectrum===0){
                                    let dc_value=diffdc[componentIndex];

                                    const dc_magnitude=dcTable!.tryParse(chunkBitReader);
                                    if(!dc_magnitude){
                                        throw new CorruptError(`Invalid DC magnitude: ${dc_magnitude}`);
                                    }

                                    if(dc_magnitude.value===0){}else if(dc_magnitude.value>=1 && dc_magnitude.value<=11){
                                        const diff_bits=chunkBitReader.nbits(dc_magnitude.value);
                                        const diff_value = twos_complement(diff_bits,dc_magnitude.value);
                                        dc_value+=diff_value;
                                    }else{
                                        throw new CorruptError(`Invalid DC magnitude: ${dc_magnitude.value}`);
                                    }
                                    diffdc[componentIndex]=dc_value;

                                    scanData[componentIndex][base_index]=dc_value<<al;
                                    
                                    spectrum+=1;
                                }

								if(spectrum<=Se && eob_run>0){
									eob_run--;
									continue;
								}

                                for(;spectrum<=Se;spectrum++){
                                    const ac_bits=acTable!.tryParse(chunkBitReader);
                                    if(!ac_bits){
                                        throw new CorruptError(`Invalid AC magnitude: ${ac_bits}`);
                                    }

                                    if(ac_bits.value===0)break;

                                    const num_zeros=ac_bits.value>>4;
                                    const ac_magnitude=ac_bits.value&0xF;

                                    if(ac_magnitude===0){
                                        if(num_zeros===15){
                                            spectrum+=15;
                                            continue;
                                        }else{
											eob_run=0;
											if(num_zeros>0){
												eob_run=bitmask(num_zeros)+chunkBitReader.nbits(num_zeros);
											}
											break;
										}
                                    }

                                    spectrum+=num_zeros;
                                    if(spectrum>Se)break;

                                    if(ac_magnitude>=1 && ac_magnitude<=10){
                                        ;// empty
                                    }else{
                                        throw new CorruptError(`Invalid AC magnitude: ${ac_magnitude}`);
                                    }

									const ac_val_bits=chunkBitReader.nbits(ac_magnitude);
									const sample=twos_complement(ac_val_bits,ac_magnitude);
					
									scanData[componentIndex][base_index+spectrum]=sample<<al;
                                }
                            }
                        }
                    }
                }
                break;
            default:
                throw new CorruptError(`Unknown marker: ${marker.toString(16)}`);
        }
    }

    const imageData=new Uint8Array(width*height*4);

    let maxHFactor = 0;
    let maxVFactor = 0;
    for (const comp of imageComponents) {
        if (comp.hFactor > maxHFactor) maxHFactor = comp.hFactor;
        if (comp.vFactor > maxVFactor) maxVFactor = comp.vFactor;
    }

    // Validate that this implementation only supports 4:4:4 (no subsampling)
    // All components should have hFactor=1 and vFactor=1
    for (const comp of imageComponents) {
        if (comp.hFactor !== 1 || comp.vFactor !== 1) {
            throw new UnsupportedError(`This IDCT implementation only supports 4:4:4 images (no subsampling). Component ${comp.id} has hFactor=${comp.hFactor}, vFactor=${comp.vFactor}`);
        }
    }

    const mcuWidth = maxHFactor * 8;
    const mcuHeight = maxVFactor * 8;
    const numMCUsH = Math.ceil(width / mcuWidth);
    const numMCUsV = Math.ceil(height / mcuHeight);

    // For 4:4:4 images, all components have the same dimensions
    const componentData: Int16Array[] = [];
    for (let i = 0; i < imageComponents.length; i++) {
        const component = imageComponents[i];
        const hFactor = component.hFactor;
        const vFactor = component.vFactor;
        const componentWidth = numMCUsH * hFactor * 8;
        const componentHeight = numMCUsV * vFactor * 8;
        componentData.push(new Int16Array(componentWidth * componentHeight));
    }
    
    // Reusable arrays for IDCT processing
    const block = new Int16Array(64);
    const idctBlock = new Int16Array(64);

    let mcuIndex = 0;
    for (let mcuY = 0; mcuY < numMCUsV; mcuY++) {
        for (let mcuX = 0; mcuX < numMCUsH; mcuX++) {
            for (let compIdx = 0; compIdx < imageComponents.length; compIdx++) {
                const component = imageComponents[compIdx];
                const quantTable = quantizationTables.get(component.quantId);
                if (!quantTable) throw new CorruptError(`Quantization table ${component.quantId} not found`);
                const componentOut = componentData[compIdx];
                const componentIn = scanData[compIdx];

                for (let v = 0; v < component.vFactor; v++) {
                    for (let h = 0; h < component.hFactor; h++) {
                        const blockIndex = mcuIndex * (component.hFactor * component.vFactor) + v * component.hFactor + h;
                        const srcOffset = blockIndex * 64;

                        // Un-zigzag and dequantize
                        for (let i = 0; i < 64; i++) {
                            const zigZagIndex = UNZIGZAG[i];
                            block[zigZagIndex] = componentIn[srcOffset + i] * quantTable[i];
                        }
                        
                        // Reuse idctBlock array
                        fastIdct(block, idctBlock);

                        const componentWidth = numMCUsH * component.hFactor * 8;
                        const dstX = mcuX * component.hFactor * 8 + h * 8;
                        const dstY = mcuY * component.vFactor * 8 + v * 8;
                        
                        // Copy block to output using a single loop to improve cache locality
                        for (let i = 0; i < 64; i++) {
                            const x = i & 7;  // i % 8
                            const y = i >> 3; // Math.floor(i / 8)
                            const dstIdx = (dstY + y) * componentWidth + (dstX + x);
                            componentOut[dstIdx] = idctBlock[i];
                        }
                    }
                }
            }
            mcuIndex++;
        }
    }

    // YCbCr to RGB conversion
    // For 4:4:4 images, all components have the same dimensions and no subsampling
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // All components have the same stride for 4:4:4 images
            const componentWidth = numMCUsH * 8; // Same for all components since hFactor=1
            const componentIndex = y * componentWidth + x;
            
            // Level shift by +128 for all components since IDCT output is in [-128, 127]
            const Y = componentData[0][componentIndex] + 128;
            const Cb = componentData[1][componentIndex] + 128;
            const Cr = componentData[2][componentIndex] + 128;

            // Standard JPEG YCbCr to RGB conversion
            const r = Y + 1.402 * (Cr - 128);
            const g = Y - 0.344136 * (Cb - 128) - 0.714136 * (Cr - 128);
            const b = Y + 1.772 * (Cb - 128);

            const i = (y * width + x) * 4;
            imageData[i]     = Math.max(0, Math.min(255, Math.round(r)));
            imageData[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
            imageData[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
            imageData[i + 3] = 255;
        }
    }

    return {
        width: width,
        height: height,
        data: imageData,
        optionalSegments,
    };
}


