/**
 * @file A baseline JPEG (SOF0) parser in TypeScript.
 * @see https://www.w3.org/Graphics/JPEG/itu-t81.pdf
 * @see https://www.w3.org/Graphics/JPEG/jfif3.pdf
 * @see https://github.com/jpeg-js/jpeg-js/blob/master/lib/decoder.js
 */
import { HuffmanTree } from '../bits/huffman.js';
import { BitBuffer, bitmask } from '../bits/bits.js';
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
    imageComponent: ImageComponent;
}

/** JPEG uses little-endian byte order (which is 'false' in the ByteReader constructor) */
const JPEG_ENDIAN = false;

export function parseCOM(data: Uint8Array): string {
    const reader = new ByteReader(data.buffer, JPEG_ENDIAN);
    const len = reader.readUint16() - 2;
    const comment = reader.readFixedString(len, "ascii");
    return comment;
}

export enum JFIFUnits {
    NoUnits = 0,
    Inch = 1,
    Cm = 2,
}
export interface JFIFData {
    majorVersion: number;
    minorVersion: number;
    units: JFIFUnits;
    xDensity: number;
    yDensity: number;
    xThumbnail: number;
    yThumbnail: number;
    /** Uncompressed 24 bit RGB (8 bits per color channel) raster thumbnail data in the order R0, G0, B0, ... */
    thumbnailData: Uint8Array | null;
}
/** parse the JFIF segment, usually from APP0 */
export function parseJFIF(data: Uint8Array): JFIFData {
    const reader = new ByteReader(data.buffer, JPEG_ENDIAN);

    const JFIF_IDENTIFIER = "JFIF\0";
    const jfif_head = reader.readFixedString(JFIF_IDENTIFIER.length, "ascii");
    if (jfif_head !== JFIF_IDENTIFIER) {
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
    optionalSegments: Map<JpegMarker, Uint8Array>;
}

const ZIGZAG = new Uint8Array([
    0, 1, 5, 6, 14, 15, 27, 28,
    2, 4, 7, 13, 16, 26, 29, 42,
    3, 8, 12, 17, 25, 30, 41, 43,
    9, 11, 18, 24, 31, 40, 44, 53,
    10, 19, 23, 32, 39, 45, 52, 54,
    20, 22, 33, 38, 46, 51, 55, 60,
    21, 34, 37, 47, 50, 56, 59, 61,
]);
const UNZIGZAG = new Uint8Array([
    0, 1, 8, 16, 9, 2, 3, 10,
    17, 24, 32, 25, 18, 11, 4, 5,
    12, 19, 26, 33, 40, 48, 41, 34,
    27, 20, 13, 6, 7, 14, 21, 28,
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
function markerName(marker: JpegMarker): string {
    switch (marker) {
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

interface ImageComponent {
    id: number;
    /** horizontal sampling factor, i.e. 1 value covers this many pixels */
    hFactor: number;
    /** vertical sampling factor, i.e. 1 value covers this many pixels */
    vFactor: number;
    /** quantization table id */
    quantId: number;
}

// Quantisation tables remain 8-bit so Int16 is fine, but decoded coefficients can exceed
// the 16-bit range.  Keep the table itself in Int16 but store coefficients in Int32.
type QuantizationTable = Int16Array;

/**
calculate custom-width twos complement (for an integer)
 
Params:
   v = unsigned input value
   bit_width = number of bits to take into account for the calculation
Returns: signed twos complement representation of `v`
 */
function twos_complement(v: number, bit_width: number) {
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

function idct_spec_1d(spectrum: number, x: number) {
    const freq = (2 * x + 1) * spectrum * Math.PI / 16;
    const alpha = spectrum === 0 ? 1 / Math.SQRT2 : 1;
    const value = alpha * Math.cos(freq);
    return value;
}

/** Pre-calculate cosine values for IDCT with alpha factor included */
const IDCT_COSINE_CACHE = new Float32Array(64);
for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
        IDCT_COSINE_CACHE[i * 8 + j] = idct_spec_1d(i, j);
    }
}

// Reusable temporary arrays for IDCT calculation
const tempRow = new Float32Array(8);
const tempCol = new Float32Array(8);

function fastIdct(block: Float32Array, out: Int16Array = new Int16Array(64)) {
    // Find last non-zero coefficient in zigzag order.
    // also, start at back because most blocks will have lots of non-zeros followed by a few zeros.
    // (this is a heuristic, but it's a good one, which also shows that using lastNonZero to skip the accumulator does _not_ work)
    let lastNonZero = 63;
    while (lastNonZero < 0 && block[UNZIGZAG[lastNonZero]] === 0) {
        lastNonZero--;
    }

    // If only DC coefficient is non-zero, fast path
    if (lastNonZero === 0) {
        const dc = block[0] / 8; // Correct scaling for DC-only case
        const dcRounded = Math.round(dc);
        for (let i = 0; i < 64; i++) {
            out[i] = dcRounded;
        }
        return out;
    }

    // First pass - 1D IDCT on rows
    for (let y = 0; y < 8; y++) {
        const rowOffset = y * 8;

        // Process each row
        for (let x = 0; x < 8; x++) {
            let sum = 0;
            for (let u = 0; u < 8; u++) {
                const val = block[rowOffset + u];
                if (val !== 0) {
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
                if (val !== 0) {
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

// Pre-calculate YCbCr to RGB conversion tables
const YCbCrToRGB_R = new Int16Array(256 * 256); // Y * Cr lookup table
const YCbCrToRGB_G = new Int16Array(256 * 256 * 2); // Y * (Cb,Cr) lookup table
const YCbCrToRGB_B = new Int16Array(256 * 256); // Y * Cb lookup table

for (let y = 0; y < 256; y++) {
    for (let c = 0; c < 256; c++) {
        YCbCrToRGB_R[y * 256 + c] = Math.round(y + 1.402 * (c - 128));
        YCbCrToRGB_B[y * 256 + c] = Math.round(y + 1.772 * (c - 128));
    }
}

for (let cb = 0; cb < 256; cb++) {
    for (let cr = 0; cr < 256; cr++) {
        YCbCrToRGB_G[cb * 256 + cr] = Math.round(-0.344136 * (cb - 128) - 0.714136 * (cr - 128));
    }
}

/** Calculate block index for a component based on MCU position and block position within MCU */
function getCoefficientBlockIndex(
    scanlineIndex: number,
    mcuIndex: number,
    vBlock: number,
    hBlock: number,
    hSamples: number,
    vSamples: number,
    numMcuPerScanline: number,
    interleaved: boolean
): number {
    if (interleaved) {
        const blocksPerMcu = vSamples * hSamples;
        const numBlocksBeforeCurrentScanline = scanlineIndex * numMcuPerScanline * blocksPerMcu;
        const indexIntoMcu = vBlock * hSamples + hBlock;
        return numBlocksBeforeCurrentScanline + mcuIndex * blocksPerMcu + indexIntoMcu;
    } else {
        const iMcuIndex = Math.floor((mcuIndex * hSamples + vBlock) % numMcuPerScanline);
        const iVBlock = Math.floor((mcuIndex * hSamples + vBlock) / numMcuPerScanline);
        return getCoefficientBlockIndex(
            scanlineIndex,
            iMcuIndex,
            iVBlock,
            hBlock,
            hSamples,
            vSamples,
            numMcuPerScanline,
            true
        );
    }
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

    let width = 0;
    let height = 0;
    let paddedWidth = 0;
    let paddedHeight = 0;
    let restartInterval = 0;
    const optionalSegments = new Map<JpegMarker, Uint8Array>();
    const quantizationTables = new Map<number, QuantizationTable>();
    const imageComponents: ImageComponent[] = [];
    const acHuffmanTables = new Map<number, HuffmanTree>();
    const dcHuffmanTables = new Map<number, HuffmanTree>();
    let scanData: Int32Array[] = [];

    let soiFound = false;

    console.time("parseSegments");

    parseSegments: while (reader.getRemainingBytes() > 0) {
        const ff = reader.readUint8();
        if (ff !== 0xFF) {
            throw new CorruptError(`Expected FF but got ${ff.toString(16)}`);
        }

        const marker = reader.readUint8();
        console.log(`Marker: ${marker.toString(16)} ${markerName(marker)}`);

        if (marker == JpegMarker.SOI) {
            if (soiFound) {
                throw new CorruptError("Multiple SOI markers");
            }
            soiFound = true;
            continue;
        } else if (!soiFound) {
            throw new CorruptError(`SOI marker must be first marker, but instead got ${marker}`);
        }

        switch (marker) {
            case JpegMarker.EOI:
                break parseSegments;
            case JpegMarker.DRI:
                // B 2.4.4
                {
                    const len = reader.readUint16() - 2;
                    if (len !== 2) {
                        throw new CorruptError("Expected DRI length of 2");
                    }
                    restartInterval = reader.readUint16();
                    console.log(`DRI: restart interval=${restartInterval}`);
                    break;
                }

            case JpegMarker.SOF0:
            case JpegMarker.SOF2:
                // B 2.2.2
                {
                    const len = reader.readUint16() - 2;

                    const p = reader.readUint8();
                    if (p !== 8) {
                        throw new UnsupportedError(`Only 8-bit precision is supported for SOF`);
                    }
                    height = reader.readUint16();
                    width = reader.readUint16();
                    console.log(`${marker === JpegMarker.SOF0 ? 'SOF0' : 'SOF2'}: ${width}x${height}`);

                    const numComponents = reader.readUint8();

                    for (let i = 0; i < numComponents; i++) {
                        const compId = reader.readUint8();
                        const hv = reader.readUint8();
                        const hFactor = hv >> 4;
                        const vFactor = hv & 0xF;
                        const quantId = reader.readUint8();
                        const component = {
                            id: compId,
                            hFactor,
                            vFactor,
                            quantId,
                        };
                        imageComponents.push(component);
                        console.log(`component ${compId}: hFactor=${hFactor}, vFactor=${vFactor}, quantId=${quantId}`);
                    }

                    const maxHFactor = Math.max(...imageComponents.map(c => c.hFactor));
                    const maxVFactor = Math.max(...imageComponents.map(c => c.vFactor));

                    // Calculate padded dimensions to accommodate complete MCUs
                    const mcuWidth = maxHFactor * 8;
                    const mcuHeight = maxVFactor * 8;
                    const numMCUsH = Math.ceil(width / mcuWidth);
                    const numMCUsV = Math.ceil(height / mcuHeight);
                    paddedWidth = numMCUsH * mcuWidth;
                    paddedHeight = numMCUsV * mcuHeight;

                    console.log(`Image dimensions: ${width}x${height}`);
                    console.log(`MCU dimensions: ${mcuWidth}x${mcuHeight}`);
                    console.log(`Padded dimensions: ${paddedWidth}x${paddedHeight}`);

                    break;
                }

            case JpegMarker.APP0:
                // B 2.4.6
                {
                    const len = reader.readUint16() - 2;
                    const bytes = reader.readBytes(len);
                    try {
                        const jfifData = parseJFIF(bytes);
                        console.log(jfifData);
                    } catch {
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
                    const len = reader.readUint16() - 2;
                    console.log(`bytes in segment ${len}`);
                    for (let i = 0; i < len; i++) {
                        reader.readUint8();
                    }
                    break;
                }
            case JpegMarker.DHT:
                // B 2.4.2
                {
                    const len = reader.readUint16() - 2;
                    let remaining = len;
                    while (remaining > 0) {
                        const tcth = reader.readUint8();
                        const tc = tcth >> 4;
                        const th = tcth & 0xF;
                        // number of codes for each length
                        const numLengths = reader.readBytes(16);

                        remaining -= 16 + 1;

                        const numCodes = numLengths.reduce((acc, len) => acc + len, 0);
                        const codeLengths = new Uint8Array(numCodes);
                        let codeIndex = 0;
                        for (let i = 0; i < 16; i++) {
                            for (let j = 0; j < numLengths[i]; j++) {
                                codeLengths[codeIndex++] = i + 1;
                            }
                        }

                        const codeValues = new Uint8Array(numCodes);
                        for (let i = 0; i < numCodes; i++) {
                            codeValues[i] = reader.readUint8();
                        }
                        remaining -= numCodes;

                        const huffmanTable = HuffmanTree.make(codeLengths, JPEG_ENDIAN, codeValues);
                        if (tc === 0) {
                            dcHuffmanTables.set(th, huffmanTable);
                        } else {
                            acHuffmanTables.set(th, huffmanTable);
                        }
                        console.log(`read DHT table ${th} class ${tc} with ${numCodes} entries`);
                    }

                    break;
                }
            case JpegMarker.DQT:
                // B 2.4.1
                {
                    const len = reader.readUint16() - 2;
                    let remaining = len;
                    while (remaining > 0) {
                        const pqtq = reader.readUint8();
                        /** pq is the precision of the table, 0 for 8 bit, 1 for 16 bit */
                        const pq = pqtq >> 4;
                        if (pq !== 0) {
                            throw new UnsupportedError(`Precision of quantization table must be 8 bits, but got ${pq}`);
                        }
                        const tq = pqtq & 0xF;
                        const tableData: QuantizationTable = new Int16Array(reader.readBytes(64));
                        quantizationTables.set(tq, tableData);
                        remaining -= 64 + 1;

                        console.log(`read DQT table ${tq} with ${tableData.length} bytes`);
                    }
                    break;
                }

            case JpegMarker.SOS:
                // B 2.3
                {
                    // Read length but don't use it for validation since SOS parsing is more complex
                    reader.readUint16(); // skip length

                    const numScanComponents = reader.readUint8();
                    console.log(`SOS: numScanComponents=${numScanComponents}`);

                    const scanComponents: StartOfScanComponent[] = [];

                    // Debug: verify image components before scan
                    console.log("Image components before scan processing:");
                    imageComponents.forEach((comp, idx) => {
                        console.log(`Component ${idx}: id=${comp.id}, hFactor=${comp.hFactor}, vFactor=${comp.vFactor}`);
                    });

                    for (let i = 0; i < numScanComponents; i++) {
                        const scanCompId = reader.readUint8();
                        const tdta = reader.readUint8();
                        const acId = tdta & 0xF;
                        const dcId = tdta >> 4;

                        const imageComponent = imageComponents.find(c => c.id === scanCompId);
                        if (!imageComponent) {
                            throw new CorruptError(`Scan component ${scanCompId} does not match any image component`);
                        }

                        console.log(`Scan component ${i}: id=${scanCompId}, acId=${acId}, dcId=${dcId}, hFactor=${imageComponent.hFactor}, vFactor=${imageComponent.vFactor}`);

                        if (!dcHuffmanTables.has(dcId)) {
                            throw new CorruptError(`DC Huffman table ${dcId} not found`);
                        }

                        scanComponents.push({
                            id: scanCompId,
                            dcId,
                            acId,
                            imageComponent,
                        });
                    }

                    // Debug: verify scan components
                    console.log("Scan components after setup:");
                    scanComponents.forEach((comp, idx) => {
                        console.log(`Scan component ${idx}: id=${comp.id}, hFactor=${comp.imageComponent.hFactor}, vFactor=${comp.imageComponent.vFactor}`);
                    });

                    const Ss = reader.readUint8();
                    const Se = reader.readUint8();
                    const ahal = reader.readUint8();
                    const ah = ahal >> 4;
                    const al = ahal & 0xF;

                    console.log(`Ss=${Ss}, Se=${Se}, ah=${ah}, al=${al}`);

                    if (ah !== 0) {
                        throw new UnsupportedError(`ah=${ah} not supported`);
                    }

                    // Progressive JPEG handling
                    if (Ss !== 0 || Se !== 63) {
                        throw new UnsupportedError(`Progressive JPEG scans not fully supported. This implementation requires baseline/sequential JPEGs with Ss=0, Se=63. Found Ss=${Ss}, Se=${Se}`);
                    }

                    // Calculate MCU dimensions based on max sampling factors
                    let maxHFactor = 0;
                    let maxVFactor = 0;
                    for (const comp of imageComponents) {
                        if (comp.hFactor > maxHFactor) maxHFactor = comp.hFactor;
                        if (comp.vFactor > maxVFactor) maxVFactor = comp.vFactor;
                    }

                    console.log(`MCU setup: maxHFactor=${maxHFactor}, maxVFactor=${maxVFactor}`);

                    // MCU size in pixels
                    const mcuWidth = maxHFactor * 8;
                    const mcuHeight = maxVFactor * 8;

                    // Number of MCUs needed to cover the image
                    const numMCUsH = Math.ceil(width / mcuWidth);
                    const numMCUsV = Math.ceil(height / mcuHeight);
                    const totalMCUs = numMCUsH * numMCUsV;

                    // Calculate the padded image dimensions (might be larger than actual image)
                    const paddedWidth = numMCUsH * mcuWidth;
                    const paddedHeight = numMCUsV * mcuHeight;

                    console.log(`Image dimensions: ${width}x${height}`);
                    console.log(`Padded dimensions: ${paddedWidth}x${paddedHeight}`);
                    console.log(`MCU dimensions: ${mcuWidth}x${mcuHeight}, grid: ${numMCUsH}x${numMCUsV}, total: ${totalMCUs}`);

                    // Pre-calculate number of blocks per component in an MCU
                    const blocksPerComponentInMCU = scanComponents.map(comp => {
                        const hBlocks = comp.imageComponent.hFactor;
                        const vBlocks = comp.imageComponent.vFactor;
                        console.log(`Component ${comp.id}: blocks per MCU = ${hBlocks}x${vBlocks} = ${hBlocks * vBlocks}`);
                        return hBlocks * vBlocks;
                    });

                    // allocate data for all scans based on actual component dimensions
                    scanData = scanComponents.map(comp => {
                        const hFactor = comp.imageComponent.hFactor;
                        const vFactor = comp.imageComponent.vFactor;
                        // Calculate component dimensions based on sampling factors
                        const componentWidth = Math.ceil(paddedWidth * (hFactor / maxHFactor));
                        const componentHeight = Math.ceil(paddedHeight * (vFactor / maxVFactor));
                        const numBlocks = totalMCUs * (hFactor * vFactor);
                        console.log(`Component ${comp.id}: dimensions=${componentWidth}x${componentHeight}, numBlocks=${numBlocks}`);
                        return new Int32Array(numBlocks * 64);
                    });

                    let eob_run = 0;
                    // JPEG DC predictors are not limited to 16-bit; use plain numbers to avoid
                    // silent wrap-around when the running sum exceeds ±32 768.
                    let diffdc: number[] = new Array(numScanComponents).fill(0);
                    let totalMcuIndex = -1;  // -1 because we increment before checking the restart interval
                    let numRestarts = 0;

                    let chunkData: number[] = [];
                    let chunkBitReader = new BitBuffer(new Uint8Array(chunkData), 0, 0, 0, JPEG_ENDIAN);

                    function fillChunkData() {
                        eob_run = 0;
                        diffdc = new Array(numScanComponents).fill(0);

                        if (totalMcuIndex > 0 && restartInterval > 0) {
                            // expect a restart marker next: 0xFFDn
                            const v0 = reader.readUint8();
                            const v1 = reader.readUint8();
                            if (v0 !== 0xFF) {
                                throw new CorruptError(`Expected 0xFF but got ${v0.toString(16)}`);
                            }
                            if (numRestarts % 8 !== (v1 - JpegMarker.RST0)) {
                                throw new CorruptError(`Expected restart marker ${JpegMarker.RST0 + numRestarts % 8} but got ${v1}`);
                            }
                            numRestarts++;
                            if ((v1 & 0xf0) !== JpegMarker.RST0) {
                                throw new CorruptError(`Expected restart marker but got ${v1.toString(16)}`);
                            }
                        }

                        // Read the entropy-coded segment for the current restart interval.
                        // The JPEG bitstream may contain arbitrary `0xFF` fill bytes between
                        // MCUs.  The actual marker is the *first* byte that follows the fill
                        // bytes which is *not* another `0xFF`.  Handle the following special
                        // cases correctly:
                        //   • 0xFF 0x00 → stuffed data byte 0xFF (part of entropy data)
                        //   • 0xFF Dn  → restart marker – stop reading *before* the marker
                        //   • 0xFF ??  → any other marker (e.g. EOI) – stop as well, the outer
                        //               segment parser will take care of it.
                        chunkData = [];
                        while (true) {
                            const byte = reader.readUint8();

                            if (byte !== 0xFF) {
                                // Regular entropy byte.
                                chunkData.push(byte);
                                continue;
                            }

                            // We have encountered 0xFF – could be fill bytes, a stuffed 0xFF
                            // (0x00), or an actual marker.  Consume all consecutive 0xFF fill
                            // bytes to find the *real* following byte.
                            let nextByte = reader.readUint8();
                            while (nextByte === 0xFF) {
                                // Additional fill byte, keep searching.
                                nextByte = reader.readUint8();
                            }

                            if (nextByte === 0x00) {
                                // Stuffed 0xFF byte → part of entropy data.
                                chunkData.push(0xFF);
                                continue;
                            }

                            // At this point we have found a non-fill, non-stuffed byte which
                            // *must* be a marker.
                            if (
                                (nextByte >= JpegMarker.RST0 && nextByte <= JpegMarker.RST7) ||
                                nextByte === JpegMarker.EOI
                            ) {
                                // Legitimate in-scan markers – rewind so the outer parser can
                                // see the marker.
                                reader.skip(-2);
                            } else {
                                // Any other marker should also terminate the entropy segment –
                                // backtrack so the outer loop can handle it.
                                reader.skip(-2);
                            }
                            break; // End of entropy segment for this restart interval.
                        }
                        if (chunkBitReader.dataIndex !== chunkBitReader.data.length) {
                            throw new CorruptError(`chunkBitReader NOT exhausted`);
                        }
                        
                        chunkBitReader = new BitBuffer(new Uint8Array(chunkData), 0, 0, 0, JPEG_ENDIAN);
                    }

                    // fill chunks to begin with
                    fillChunkData();

                    // Process MCUs
                    mcuLoop:
                    for (let mcuY = 0; mcuY < numMCUsV; mcuY++) {
                        for (let mcuX = 0; mcuX < numMCUsH; mcuX++) {
                            totalMcuIndex++;
                            // console.log(`Processing MCU ${mcuX},${mcuY} (totalMcuIndex=${totalMcuIndex})`);

                            // Handle restart markers
                            const requires_restart = restartInterval > 0 && totalMcuIndex % restartInterval === 0 && totalMcuIndex > 0;
                            if (requires_restart) {
                                fillChunkData();
                            }

                            // Process each component in the MCU
                            for (let componentIndex = 0; componentIndex < numScanComponents; componentIndex++) {
                                const component = scanComponents[componentIndex];
                                const imgComp = component.imageComponent;
                                const hBlocks = imgComp.hFactor;
                                const vBlocks = imgComp.vFactor;

                                // DC coefficient
                                const dcTable = dcHuffmanTables.get(component.dcId);
                                if (!dcTable) {
                                    throw new CorruptError(`DC Huffman table ${component.dcId} not found`);
                                }

                                // AC coefficients
                                const acTable = acHuffmanTables.get(component.acId);
                                if (!acTable) {
                                    throw new CorruptError(`AC Huffman table ${component.acId} not found`);
                                }

                                // Process each block in the component
                                for (let blockY = 0; blockY < vBlocks; blockY++) {
                                    for (let blockX = 0; blockX < hBlocks; blockX++) {
                                        // We must parse all blocks in an MCU that has any valid pixels,
                                        // because the chroma components need their samples
                                        const blockIndex = getCoefficientBlockIndex(
                                            mcuY,
                                            mcuX,
                                            blockY,
                                            blockX,
                                            hBlocks,
                                            vBlocks,
                                            numMCUsH,
                                            true // interleaved
                                        );
                                        const blockOffset = blockIndex * 64;

                                        let spectrum = Ss;

                                        // decode block
                                        if (spectrum === 0) {
                                            let dc_magnitude = dcTable.tryParse(chunkBitReader);
                                            if (!dc_magnitude && chunkBitReader.eof) {
                                                // We have consumed the current entropy segment; load the
                                                // next chunk (after the restart marker) and retry once.
                                                fillChunkData();
                                                dc_magnitude = dcTable.tryParse(chunkBitReader);
                                            }
                                            if (!dc_magnitude) {
                                                if (chunkBitReader.eof && chunkBitReader.dataIndex >= chunkBitReader.data.length) {
                                                    // Reached end of JPEG stream, stop processing blocks
                                                    break mcuLoop;
                                                }
                                                throw new CorruptError("Invalid DC magnitude: null");
                                            }

                                            if (dc_magnitude.value === 0) {
                                                // No change in DC
                                            } else if (dc_magnitude.value >= 1 && dc_magnitude.value <= 11) {
                                                const diff_bits = chunkBitReader.nbits(dc_magnitude.value);
                                                const diff_value = twos_complement(diff_bits, dc_magnitude.value);
                                                diffdc[componentIndex] += diff_value;
                                            } else {
                                                throw new CorruptError(`Invalid DC magnitude: ${dc_magnitude.value}`);
                                            }

                                            const final_dc_value = (diffdc[componentIndex] << al);
                                            scanData[componentIndex][blockOffset] = final_dc_value;
                                            spectrum += 1;
                                        }

                                        if (spectrum <= Se && eob_run > 0) {
                                            eob_run--;
                                            continue;
                                        }

                                        // Process AC coefficients
                                        for (; spectrum <= Se; spectrum++) {
                                            const ac_bits = acTable.tryParse(chunkBitReader);
                                            if (!ac_bits) {
                                                throw new CorruptError(`Invalid AC magnitude`);
                                            }

                                            if (ac_bits.value == 0) break;

                                            const num_zeros = ac_bits.value >> 4;    // run-length of zeros
                                            const ac_magnitude = ac_bits.value & 0x0f;  // size of coefficient

                                            if (ac_magnitude === 0) {
                                                if (num_zeros === 15) {
                                                    spectrum += 15;
                                                    continue;
                                                }

                                                eob_run = 0;
                                                if (num_zeros > 0) {
                                                    eob_run = bitmask(num_zeros) + chunkBitReader.nbits(num_zeros);
                                                }
                                                break;  // End of block
                                            }

                                            spectrum += num_zeros;
                                            if (spectrum > Se) break;

                                            const val_bits = chunkBitReader.nbits(ac_magnitude);
                                            const val = twos_complement(val_bits, ac_magnitude);
                                            const final_ac_value = (val << al);
                                            scanData[componentIndex][blockOffset + spectrum] = final_ac_value;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // If we have consumed the entire chunk (i.e. we just reached a restart
                    // marker that was *not* preceded by an explicit DRI interval), load the
                    // next entropy segment so decoding can continue.
                    if (chunkBitReader.eof) {
                        fillChunkData();
                    }
                }
                break;
            default:
                throw new CorruptError(`Unknown marker: ${marker.toString(16)}`);
        }
    }

    console.timeEnd("parseSegments");

    const imageData = new Uint8Array(width * height * 4);

    let maxHFactor = 0;
    let maxVFactor = 0;
    for (const comp of imageComponents) {
        if (comp.hFactor > maxHFactor) maxHFactor = comp.hFactor;
        if (comp.vFactor > maxVFactor) maxVFactor = comp.vFactor;
    }

    const mcuWidth = maxHFactor * 8;
    const mcuHeight = maxVFactor * 8;
    const numMCUsH = Math.ceil(width / mcuWidth);
    const numMCUsV = Math.ceil(height / mcuHeight);

    // Calculate component dimensions based on sampling factors
    const componentData: Int16Array[] = [];
    for (let i = 0; i < imageComponents.length; i++) {
        const component = imageComponents[i];
        const hScale = maxHFactor / component.hFactor;
        const vScale = maxVFactor / component.vFactor;
        const componentWidth = Math.ceil(paddedWidth / hScale);
        const componentHeight = Math.ceil(paddedHeight / vScale);
        componentData.push(new Int16Array(componentWidth * componentHeight));
    }

    // Reusable arrays for IDCT processing – use float for the working block to avoid
    // integer overflow during de-quantisation.
    const block = new Float32Array(64);
    const idctBlock = new Int16Array(64);

    console.time("idct");

    let mcuIndex = 0;
    for (let mcuY = 0; mcuY < numMCUsV; mcuY++) {
        for (let mcuX = 0; mcuX < numMCUsH; mcuX++) {
            for (let compIdx = 0; compIdx < imageComponents.length; compIdx++) {
                const component = imageComponents[compIdx];
                const quantTable = quantizationTables.get(component.quantId);
                if (!quantTable) throw new CorruptError(`Quantization table ${component.quantId} not found`);
                const componentOut = componentData[compIdx];
                const componentIn = scanData[compIdx];

                // Calculate component-specific dimensions and offsets
                const hBlocks = component.hFactor;
                const vBlocks = component.vFactor;
                const componentStride = Math.ceil(paddedWidth * (component.hFactor / maxHFactor));

                for (let v = 0; v < vBlocks; v++) {
                    for (let h = 0; h < hBlocks; h++) {
                        const blockIndex = getCoefficientBlockIndex(mcuY, mcuX, v, h, hBlocks, vBlocks, numMCUsH, true);
                        const srcOffset = blockIndex * 64;

                        // Un-zigzag and dequantize
                        for (let i = 0; i < 64; i++) {
                            const zigZagIndex = UNZIGZAG[i];
                            block[zigZagIndex] = componentIn[srcOffset + i] * quantTable[i];
                        }

                        // Reuse idctBlock array
                        fastIdct(block, idctBlock);

                        const dstX = mcuX * hBlocks * 8 + h * 8;
                        const dstY = mcuY * vBlocks * 8 + v * 8;

                        // Copy block to output considering component stride
                        for (let y = 0; y < 8; y++) {
                            const dstRow = (dstY + y) * componentStride + dstX;
                            const srcRow = y * 8;
                            for (let x = 0; x < 8; x++) {
                                componentOut[dstRow + x] = idctBlock[srcRow + x];
                            }
                        }
                    }
                }
            }
            mcuIndex++;
        }
    }

    console.timeEnd("idct");

    console.time("ycbcr");

    function clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(value, max));
    }

    // Calculate scaling factors for each component
    const yComponent = imageComponents[0];
    const cbComponent = imageComponents[1];
    const crComponent = imageComponents[2];

    const cbHScale = yComponent.hFactor / cbComponent.hFactor;
    const cbVScale = yComponent.vFactor / cbComponent.vFactor;
    const crHScale = yComponent.hFactor / crComponent.hFactor;
    const crVScale = yComponent.vFactor / crComponent.vFactor;

    // YCbCr to RGB conversion using lookup tables and interpolation for subsampled components
    for (let y = 0; y < height; y++) {
        const yOffset = y * width;

        // Calculate source y positions and weights for chroma components
        const cbY = Math.floor(y / cbVScale);
        const cbYNext = Math.min(cbY + 1, Math.ceil(paddedHeight / cbVScale) - 1);
        const cbYWeight = (y % cbVScale) / cbVScale;

        const crY = Math.floor(y / crVScale);
        const crYNext = Math.min(crY + 1, Math.ceil(paddedHeight / crVScale) - 1);
        const crYWeight = (y % crVScale) / crVScale;

        for (let x = 0; x < width; x++) {
            // Get Y component directly from padded buffer
            const yValue = componentData[0][y * paddedWidth + x] + 128;

            // Calculate source x positions and weights for chroma components
            const cbX = Math.floor(x / cbHScale);
            const cbXNext = Math.min(cbX + 1, Math.ceil(paddedWidth / cbHScale) - 1);
            const cbXWeight = (x % cbHScale) / cbHScale;

            const crX = Math.floor(x / crHScale);
            const crXNext = Math.min(crX + 1, Math.ceil(paddedWidth / crHScale) - 1);
            const crXWeight = (x % crHScale) / crHScale;

            // Bilinear interpolation for Cb component
            const cbStride = Math.ceil(paddedWidth / cbHScale);
            const cb00 = componentData[1][cbY * cbStride + cbX] + 128;
            const cb01 = componentData[1][cbY * cbStride + cbXNext] + 128;
            const cb10 = componentData[1][cbYNext * cbStride + cbX] + 128;
            const cb11 = componentData[1][cbYNext * cbStride + cbXNext] + 128;

            const cbTop = cb00 * (1 - cbXWeight) + cb01 * cbXWeight;
            const cbBottom = cb10 * (1 - cbXWeight) + cb11 * cbXWeight;
            const cbValue = cbTop * (1 - cbYWeight) + cbBottom * cbYWeight;

            // Bilinear interpolation for Cr component
            const crStride = Math.ceil(paddedWidth / crHScale);
            const cr00 = componentData[2][crY * crStride + crX] + 128;
            const cr01 = componentData[2][crY * crStride + crXNext] + 128;
            const cr10 = componentData[2][crYNext * crStride + crX] + 128;
            const cr11 = componentData[2][crYNext * crStride + crXNext] + 128;

            const crTop = cr00 * (1 - crXWeight) + cr01 * crXWeight;
            const crBottom = cr10 * (1 - crXWeight) + cr11 * crXWeight;
            const crValue = crTop * (1 - crYWeight) + crBottom * crYWeight;

            // Clamp Y, Cb, Cr to [0, 255]
            const yc = clamp(yValue, 0, 255);
            const cbc = clamp(cbValue, 0, 255);
            const crc = clamp(crValue, 0, 255);

            // Use lookup tables for RGB conversion
            const outIndex = (yOffset + x) * 4;
            const r = YCbCrToRGB_R[yc * 256 + Math.round(crc)];
            const g = yc + YCbCrToRGB_G[Math.round(cbc) * 256 + Math.round(crc)];
            const b = YCbCrToRGB_B[yc * 256 + Math.round(cbc)];

            // Clamp RGB values and write to output
            imageData[outIndex] = clamp(r, 0, 255);
            imageData[outIndex + 1] = clamp(g, 0, 255);
            imageData[outIndex + 2] = clamp(b, 0, 255);
            imageData[outIndex + 3] = 255;
        }
    }

    console.timeEnd("ycbcr");

    return {
        width: width,
        height: height,
        data: imageData,
        optionalSegments,
    };
}


