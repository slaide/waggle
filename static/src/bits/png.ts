//# allFunctionsCalledOnLoad

import {
    arrayBeginsWith,
} from "./bits";

import { zlibDecode } from "./zlib";
import { ByteReader } from "./bytereader";

/** from png spec https://www.w3.org/TR/png-3/#9Filter-type-4-Paeth */
function paethPredictor(a: number, b: number, c: number): number {
    // PaethPredictor(a,b,c)
    // p = a + b - c
    // pa = abs(p - a)
    // pb = abs(p - b)
    // pc = abs(p - c)
    // if pa <= pb and pa <= pc then Pr = a
    // else if pb <= pc then Pr = b
    // else Pr = c
    // return Pr
    // end
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) {
        return a;
    } else if (pb <= pc) {
        return b;
    } else {
        return c;
    }
}

type IHDRColortype = "G" | "RGB" | "Indexed" | "GA" | "RGBA";
const IHDR_COLORTYPE_ENUMS: { [i: number]: IHDRColortype } = {
    0: "G",
    2: "RGB",
    3: "Indexed",
    4: "GA",
    6: "RGBA",
};
type IHDRInterlacemethod = "nointerlace" | "Adam7";
const IHDR_INTERLACEMETHOD_ENUMS: { [i: number]: IHDRInterlacemethod } = {
    0: "nointerlace",
    1: "Adam7",
};

type IHDR_chunk = {
    width: number;
    height: number;
    bitdepth: number;
    colortype: IHDRColortype;
    compressionmethod: number;
    filtermethod: number;
    interlacemethod: IHDRInterlacemethod;
};

/** PNG header magic */
const PNG_START = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/**
 * spec at https://www.w3.org/TR/png-3/#10Compression
 *
 * zlib [rfc1950](https://www.rfc-editor.org/rfc/rfc1950)
 */
export async function parsePng(
    src: string,
): Promise<{ width: number; height: number; data: Uint8Array }> {
    const responseData = await fetch(src, { method: "GET" })
        .then(async (e) => {
            return await e.arrayBuffer();
        })
        .catch((e) => {
            alert("failed to fetch png");
            throw e;
        });

    let IHDR: IHDR_chunk | null = null;
    let IDAT: Uint8Array | null = null;

    // Create ByteReader with big-endian format (PNG uses big-endian)
    const reader = new ByteReader(responseData, false);

    // Check PNG signature
    const pngSignature = reader.readBytes(PNG_START.length);
    if (!arrayBeginsWith(pngSignature, PNG_START)) {
        const error = "png start invalid";
        alert(error);
        throw error;
    }

    pngfiletotal: while (reader.getRemainingBytes() > 0) {
        const chunklength = reader.readUint32();
        const header = reader.readFixedString(4, "ascii");
        const chunkdata = reader.readBytes(chunklength);
        // Important: read CRC even though we don't use it - maintains data alignment
        const crc = reader.readBytes(4);
        void crc; // CRC is not used

        switch (header) {
        case "IHDR": {
            /*
                    Width	4 bytes
                    Height	4 bytes
                    Bit depth	1 byte
                    Color type	1 byte
                    Compression method	1 byte
                    Filter method	1 byte
                    Interlace method	1 byte
                */
            const chunkReader = new ByteReader(chunkdata.buffer.slice(chunkdata.byteOffset, chunkdata.byteOffset + chunkdata.byteLength) as ArrayBuffer, false);
                
            const width = chunkReader.readUint32();
            const height = chunkReader.readUint32();
            const bitdepth = chunkReader.readUint8();
            const colortype_raw = chunkReader.readUint8();
            const compressionmethod = chunkReader.readUint8();
            const filtermethod = chunkReader.readUint8();
            const interlacemethod_raw = chunkReader.readUint8();

            const colortype = IHDR_COLORTYPE_ENUMS[colortype_raw];
            if (compressionmethod != 0) {
                const error = `compressionmethod ${compressionmethod}!=0`;
                alert(error);
                throw error;
            }
            if (filtermethod != 0) {
                const error = `filtermethod ${filtermethod}!=0`;
                alert(error);
                throw error;
            }
            const interlacemethod =
                    IHDR_INTERLACEMETHOD_ENUMS[interlacemethod_raw];

            IHDR = {
                width,
                height,
                bitdepth,
                colortype,
                compressionmethod,
                filtermethod,
                interlacemethod,
            };

            break;
        }
        case "IDAT": {
            if (!IDAT) {
                IDAT = chunkdata;
            } else {
                const newar: Uint8Array = new Uint8Array(
                    IDAT.length + chunkdata.length,
                );
                newar.set(IDAT, 0);
                newar.set(chunkdata, IDAT.length);
                IDAT = newar;
            }
            break;
        }
        case "IEND": {
            break pngfiletotal;
        }
        default: {
            console.warn(
                `png chunk: ${header} ( len ${chunklength} ) unimplemented.`,
            );
        }
        }
    }

    if (IDAT == null) {
        const error = "IDAT is missing";
        console.error(error);
        throw error;
    }
    // idat is a zlib compressed stream. zlib only supports one compression method: deflate. (compression method 0 in the png ihdr)

    if (!IHDR) throw "no IHDR in png file";
    const { width, height } = IHDR;

    const bpp = {
        G: 1,
        GA: 2,
        RGB: 3,
        RGBA: 4,
        Indexed: 1,
    }[IHDR.colortype];

    const ScanlineCompressionType = Object.freeze({
        None: 0,
        Sub: 1,
        Up: 2,
        Average: 3,
        Paeth: 4,
    });

    // Create ByteReader for IDAT data (zlib uses big-endian)
    const idatReader = new ByteReader(IDAT.buffer.slice(IDAT.byteOffset, IDAT.byteOffset + IDAT.byteLength) as ArrayBuffer, false);
    const filteredData = zlibDecode(idatReader, (1 + width * bpp) * height);

    // this does modulo on copy into it, which is the desired behaviour
    const outdata = new Uint8Array(width * height * bpp);

    const scanline_numbytes = 1 + width * bpp;
    if (height * scanline_numbytes != filteredData.length) {
        throw `unexpected size ${height * scanline_numbytes} != ${filteredData.length}`;
    }

    /** just to make typing faster ( s[so] is start of scanline ) */
    const s = filteredData;
    for (let row = 0; row < height; row++) {
        const so = row * (width * bpp + 1) + 1;
        const scanline_compression_type = s[so - 1];

        // positions:
        // c (top left) , b (top)
        // a (left),      x (current)

        if (scanline_compression_type == ScanlineCompressionType.None) {
            // Recon(x) = Filt(x)
            for (let col = 0; col < width * bpp; col++) {
                const x = s[so + col];
                outdata[row * width * bpp + col] = x;
            }
        } else if (scanline_compression_type == ScanlineCompressionType.Sub) {
            // Recon(x) = Filt(x) + Recon(a)
            for (let col = 0; col < width * bpp; col++) {
                const x = s[so + col];
                const a =
                    col >= bpp ? outdata[row * width * bpp + col - bpp] : 0;
                outdata[row * width * bpp + col] = x + a;
            }
        } else if (scanline_compression_type == ScanlineCompressionType.Up) {
            // Recon(x) = Filt(x) + Recon(b)
            for (let col = 0; col < width * bpp; col++) {
                const x = s[so + col];
                const b = row >= 1 ? outdata[(row - 1) * width * bpp + col] : 0;
                outdata[row * width * bpp + col] = x + b;
            }
        } else if (
            scanline_compression_type == ScanlineCompressionType.Average
        ) {
            // Recon(x) = Filt(x) + floor((Recon(a) + Recon(b)) / 2)
            for (let col = 0; col < width * bpp; col++) {
                const x = s[so + col];
                const a =
                    col >= bpp ? outdata[row * width * bpp + col - bpp] : 0;
                const b = row >= 1 ? outdata[(row - 1) * width * bpp + col] : 0;
                outdata[row * width * bpp + col] = x + Math.floor((a + b) / 2);
            }
        } else if (scanline_compression_type == ScanlineCompressionType.Paeth) {
            // Recon(x) = Filt(x) + PaethPredictor(Recon(a), Recon(b), Recon(c))

            for (let col = 0; col < width * bpp; col++) {
                const x = s[so + col];
                const a =
                    col >= bpp ? outdata[row * width * bpp + col - bpp] : 0;
                const b = row >= 1 ? outdata[(row - 1) * width * bpp + col] : 0;
                const c =
                    col >= bpp && row >= 1
                        ? outdata[(row - 1) * width * bpp + col - bpp]
                        : 0;
                outdata[row * width * bpp + col] = x + paethPredictor(a, b, c);
            }
        } else {
            throw `png scanline type ${scanline_compression_type} is invalid.`;
        }
    }

    const ret = { width, height, data: outdata };
    return ret;
}
