import { ByteReader } from "./bytereader";

/**
 * format spec at:
 * https://developer.apple.com/fonts/TrueType-Reference-Manual/
 */

/**
 * TTF Table Directory Entry
 * Each table in the font has a directory entry
 */
export interface TTFTableEntry {
    tag: string;        // 4-byte table identifier (e.g., 'head', 'cmap', 'glyf')
    checkSum: number;   // checksum for this table
    offset: number;     // offset from beginning of file
    length: number;     // length of table in bytes
}

/**
 * TTF Font Header (Offset Table)
 * This appears at the beginning of every TTF file
 */
export interface TTFHeader {
    sfntVersion: number;    // 0x00010000 for TrueType fonts
    numTables: number;      // number of tables in the font
    searchRange: number;    // (max power of 2 <= numTables) * 16
    entrySelector: number;  // log2(max power of 2 <= numTables)
    rangeShift: number;     // numTables * 16 - searchRange
}

/**
 * TTF 'head' table - Font header table
 */
export interface TTFHeadTable {
    majorVersion: number;       // Major version number
    minorVersion: number;       // Minor version number
    fontRevision: number;       // Font revision (Fixed)
    checksumAdjustment: number; // Checksum adjustment
    magicNumber: number;        // 0x5F0F3CF5
    flags: number;              // Flags
    unitsPerEm: number;         // Units per EM (typically 1000 or 2048)
    created: Date;              // Created date
    modified: Date;             // Modified date
    xMin: number;               // Minimum x coordinate
    yMin: number;               // Minimum y coordinate
    xMax: number;               // Maximum x coordinate
    yMax: number;               // Maximum y coordinate
    macStyle: number;           // Mac style flags
    lowestRecPPEM: number;      // Smallest readable size in pixels
    fontDirectionHint: number;  // Font direction hint
    indexToLocFormat: number;   // 0 for short offsets, 1 for long offsets
    glyphDataFormat: number;    // 0 for current format
}

/**
 * TTF 'hhea' table - Horizontal header table
 */
export interface TTFHheaTable {
    majorVersion: number;       // Major version number
    minorVersion: number;       // Minor version number
    ascender: number;           // Typographic ascent
    descender: number;          // Typographic descent
    lineGap: number;            // Typographic line gap
    advanceWidthMax: number;    // Maximum advance width
    minLeftSideBearing: number; // Minimum left sidebearing
    minRightSideBearing: number;// Minimum right sidebearing
    xMaxExtent: number;         // Maximum x extent
    caretSlopeRise: number;     // Caret slope rise
    caretSlopeRun: number;      // Caret slope run
    caretOffset: number;        // Caret offset
    metricDataFormat: number;   // 0 for current format
    numberOfHMetrics: number;   // Number of hMetric entries
}

/**
 * TTF 'maxp' table - Maximum profile table
 */
export interface TTFMaxpTable {
    version: number;            // Version (0x00005000 for v0.5, 0x00010000 for v1.0)
    numGlyphs: number;          // Number of glyphs in the font
    // Version 1.0 fields (if version is 0x00010000)
    maxPoints?: number;         // Maximum points in a non-composite glyph
    maxContours?: number;       // Maximum contours in a non-composite glyph
    maxCompositePoints?: number;// Maximum points in a composite glyph
    maxCompositeContours?: number; // Maximum contours in a composite glyph
    maxZones?: number;          // 1 if instructions do not use the twilight zone, 2 otherwise
    maxTwilightPoints?: number; // Maximum points used in Z0
    maxStorage?: number;        // Number of Storage Area locations
    maxFunctionDefs?: number;   // Number of FDEFs
    maxInstructionDefs?: number;// Number of IDEFs
    maxStackElements?: number;  // Maximum stack depth
    maxSizeOfInstructions?: number; // Maximum byte count for glyph instructions
    maxComponentElements?: number;  // Maximum number of components at top level
    maxComponentDepth?: number;     // Maximum levels of recursion
}

/**
 * TTF 'name' table record
 */
export interface TTFNameRecord {
    platformID: number;         // Platform ID
    encodingID: number;         // Platform-specific encoding ID
    languageID: number;         // Language ID
    nameID: number;             // Name ID
    length: number;             // String length
    offset: number;             // String offset from start of storage area
    value?: string;             // Decoded string value
}

/**
 * TTF 'name' table
 */
export interface TTFNameTable {
    format: number;             // Format selector (0)
    count: number;              // Number of name records
    stringOffset: number;       // Offset to start of string storage
    nameRecords: TTFNameRecord[];
}

/**
 * TTF 'cmap' subtable format 4 (most common)
 */
export interface TTFCmapSubtableFormat4 {
    format: number;             // Format number (4)
    length: number;             // Subtable length
    language: number;           // Language code
    segCountX2: number;         // 2 × segCount
    searchRange: number;        // 2 × (2^floor(log2(segCount)))
    entrySelector: number;      // log2(searchRange/2)
    rangeShift: number;         // 2 × segCount - searchRange
    endCode: number[];          // End character code for each segment
    startCode: number[];        // Start character code for each segment
    idDelta: number[];          // Delta for all character codes in segment
    idRangeOffset: number[];    // Offsets into glyphIdArray or 0
    glyphIdArray: number[];     // Glyph index array
}

/**
 * TTF 'cmap' subtable
 */
export interface TTFCmapSubtable {
    platformID: number;         // Platform ID
    encodingID: number;         // Platform-specific encoding ID
    offset: number;             // Byte offset from beginning of table
    format?: number;            // Subtable format
    data?: TTFCmapSubtableFormat4; // Parsed subtable data (format 4)
}

/**
 * TTF 'cmap' table - Character to glyph mapping
 */
export interface TTFCmapTable {
    version: number;            // Version number (0)
    numTables: number;          // Number of encoding tables
    subtables: TTFCmapSubtable[];
}

/**
 * Extended TTF Font structure with parsed tables
 */
export interface TTFFont {
    header: TTFHeader;
    tables: Map<string, TTFTableEntry>;
    rawData: Uint8Array;
    
    // Unified table access interface
    tableAccess: TTFTableAccess;
}

/**
 * Parse TTF font file - basic implementation that reads header and table directory
 * @param src - URL or path to the TTF file
 * @returns Promise<TTFFont> - parsed font structure
 */
export async function parseTTF(src: string): Promise<TTFFont> {
    let responseData: ArrayBuffer;
    
    // Check if we're in a browser environment or Node.js/Bun environment
    if (typeof window !== "undefined" && typeof fetch !== "undefined") {
        // Browser environment - use fetch
        responseData = await fetch(src, { method: "GET" })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch TTF file: ${response.status} ${response.statusText}`);
                }
                return await response.arrayBuffer();
            })
            .catch((error) => {
                const errorMsg = `Failed to fetch TTF file from ${src}: ${error.message}`;
                console.error(errorMsg);
                throw new Error(errorMsg);
            });
    } else {
        // Node.js/Bun environment - use file system
        try {
            const fs = await import("fs/promises");
            const buffer = await fs.readFile(src);
            responseData = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
        } catch (error) {
            const errorMsg = `Failed to read TTF file from ${src}: ${(error as Error).message}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }
    }

    // Create ByteReader for TTF data (TTF uses big-endian format)
    const reader = new ByteReader(responseData, false); // false = big-endian
    
    if (reader.getSize() < 12) {
        throw new Error("TTF file too small - missing header");
    }

    // Parse the offset table (header) - first 12 bytes
    const sfntVersion = reader.readUint32();
    const numTables = reader.readUint16();
    const searchRange = reader.readUint16();
    const entrySelector = reader.readUint16();
    const rangeShift = reader.readUint16();

    // Validate magic number
    if (sfntVersion !== 0x00010000) {
        throw new Error(`Invalid TTF magic number: 0x${sfntVersion.toString(16).padStart(8, "0")} (expected 0x00010000)`);
    }

    // Check if we have enough data for all table entries
    const expectedSize = 12 + (numTables * 16);
    if (reader.getSize() < expectedSize) {
        throw new Error(`TTF file too small - expected at least ${expectedSize} bytes for ${numTables} tables, got ${reader.getSize()}`);
    }

    const header: TTFHeader = {
        sfntVersion,
        numTables,
        searchRange,
        entrySelector,
        rangeShift,
    };

    // Parse table directory entries - 16 bytes each
    const tables = new Map<string, TTFTableEntry>();
    
    for (let i = 0; i < numTables; i++) {
        // Read table tag (4 bytes as string)
        const tag = reader.readFixedString(4, "ascii");
        
        // Read checksum (4 bytes)
        const checkSum = reader.readUint32();
        
        // Read table offset (4 bytes)
        const tableOffset = reader.readUint32();
        
        // Read table length (4 bytes)
        const length = reader.readUint32();

        const tableEntry: TTFTableEntry = {
            tag,
            checkSum,
            offset: tableOffset,
            length,
        };

        tables.set(tag, tableEntry);
    }

    const font: TTFFont = {
        header,
        tables,
        rawData: new Uint8Array(responseData),
        tableAccess: null as any, // Will be set below
    };
    
    // Create table access interface
    font.tableAccess = createTableAccess(font);
    
    return font;
}

/**
 * Get a table's raw data from the font
 * @param font - TTF font structure
 * @param tableTag - 4-character table tag (e.g., 'head', 'cmap')
 * @returns Uint8Array of table data, or null if table not found
 */
export function getTableData(font: TTFFont, tableTag: string): Uint8Array | null {
    const tableEntry = font.tables.get(tableTag);
    if (!tableEntry) {
        return null;
    }
    
    return font.rawData.subarray(tableEntry.offset, tableEntry.offset + tableEntry.length);
}

/**
 * Parse TTF 'head' table
 * @param font - TTF font structure
 * @returns Parsed head table or null if not found
 */
export function parseHeadTable(font: TTFFont): TTFHeadTable | null {
    const tableData = getTableData(font, "head");
    if (!tableData) {
        return null;
    }

    const reader = new ByteReader(tableData.buffer.slice(tableData.byteOffset, tableData.byteOffset + tableData.byteLength) as ArrayBuffer, false);
    
    // Parse head table fields
    const majorVersion = reader.readUint16();
    const minorVersion = reader.readUint16();
    const fontRevision = reader.readUint32(); // Fixed point
    const checksumAdjustment = reader.readUint32();
    const magicNumber = reader.readUint32();
    const flags = reader.readUint16();
    const unitsPerEm = reader.readUint16();
    
    // Read dates (64-bit signed integers, seconds since 12:00 midnight, January 1, 1904)
    const createdHigh = reader.readUint32();
    const createdLow = reader.readUint32();
    const modifiedHigh = reader.readUint32();
    const modifiedLow = reader.readUint32();
    
    // Convert 64-bit timestamps to JavaScript Date objects
    const created = new Date((createdHigh * 0x100000000 + createdLow) * 1000 + new Date(1904, 0, 1).getTime());
    const modified = new Date((modifiedHigh * 0x100000000 + modifiedLow) * 1000 + new Date(1904, 0, 1).getTime());
    
    const xMin = reader.readInt16();
    const yMin = reader.readInt16();
    const xMax = reader.readInt16();
    const yMax = reader.readInt16();
    const macStyle = reader.readUint16();
    const lowestRecPPEM = reader.readUint16();
    const fontDirectionHint = reader.readInt16();
    const indexToLocFormat = reader.readInt16();
    const glyphDataFormat = reader.readInt16();

    return {
        majorVersion,
        minorVersion,
        fontRevision,
        checksumAdjustment,
        magicNumber,
        flags,
        unitsPerEm,
        created,
        modified,
        xMin,
        yMin,
        xMax,
        yMax,
        macStyle,
        lowestRecPPEM,
        fontDirectionHint,
        indexToLocFormat,
        glyphDataFormat,
    };
}

/**
 * Parse TTF 'hhea' table
 * @param font - TTF font structure
 * @returns Parsed hhea table or null if not found
 */
export function parseHheaTable(font: TTFFont): TTFHheaTable | null {
    const tableData = getTableData(font, "hhea");
    if (!tableData) {
        return null;
    }

    const reader = new ByteReader(tableData.buffer.slice(tableData.byteOffset, tableData.byteOffset + tableData.byteLength) as ArrayBuffer, false);
    
    const majorVersion = reader.readUint16();
    const minorVersion = reader.readUint16();
    const ascender = reader.readInt16();
    const descender = reader.readInt16();
    const lineGap = reader.readInt16();
    const advanceWidthMax = reader.readUint16();
    const minLeftSideBearing = reader.readInt16();
    const minRightSideBearing = reader.readInt16();
    const xMaxExtent = reader.readInt16();
    const caretSlopeRise = reader.readInt16();
    const caretSlopeRun = reader.readInt16();
    const caretOffset = reader.readInt16();
    reader.skip(8); // Reserved fields
    const metricDataFormat = reader.readInt16();
    const numberOfHMetrics = reader.readUint16();

    return {
        majorVersion,
        minorVersion,
        ascender,
        descender,
        lineGap,
        advanceWidthMax,
        minLeftSideBearing,
        minRightSideBearing,
        xMaxExtent,
        caretSlopeRise,
        caretSlopeRun,
        caretOffset,
        metricDataFormat,
        numberOfHMetrics,
    };
}

/**
 * Parse TTF 'maxp' table
 * @param font - TTF font structure
 * @returns Parsed maxp table or null if not found
 */
export function parseMaxpTable(font: TTFFont): TTFMaxpTable | null {
    const tableData = getTableData(font, "maxp");
    if (!tableData) {
        return null;
    }

    const reader = new ByteReader(tableData.buffer.slice(tableData.byteOffset, tableData.byteOffset + tableData.byteLength) as ArrayBuffer, false);
    
    const version = reader.readUint32();
    const numGlyphs = reader.readUint16();

    const result: TTFMaxpTable = {
        version,
        numGlyphs,
    };

    // If version 1.0, read additional fields
    if (version === 0x00010000) {
        result.maxPoints = reader.readUint16();
        result.maxContours = reader.readUint16();
        result.maxCompositePoints = reader.readUint16();
        result.maxCompositeContours = reader.readUint16();
        result.maxZones = reader.readUint16();
        result.maxTwilightPoints = reader.readUint16();
        result.maxStorage = reader.readUint16();
        result.maxFunctionDefs = reader.readUint16();
        result.maxInstructionDefs = reader.readUint16();
        result.maxStackElements = reader.readUint16();
        result.maxSizeOfInstructions = reader.readUint16();
        result.maxComponentElements = reader.readUint16();
        result.maxComponentDepth = reader.readUint16();
    }

    return result;
}

/**
 * Parse TTF 'name' table
 * @param font - TTF font structure
 * @returns Parsed name table or null if not found
 */
export function parseNameTable(font: TTFFont): TTFNameTable | null {
    const tableData = getTableData(font, "name");
    if (!tableData) {
        return null;
    }

    const reader = new ByteReader(tableData.buffer.slice(tableData.byteOffset, tableData.byteOffset + tableData.byteLength) as ArrayBuffer, false);
    
    const format = reader.readUint16();
    const count = reader.readUint16();
    const stringOffset = reader.readUint16();

    const nameRecords: TTFNameRecord[] = [];
    
    // Read name records
    for (let i = 0; i < count; i++) {
        const platformID = reader.readUint16();
        const encodingID = reader.readUint16();
        const languageID = reader.readUint16();
        const nameID = reader.readUint16();
        const length = reader.readUint16();
        const offset = reader.readUint16();

        nameRecords.push({
            platformID,
            encodingID,
            languageID,
            nameID,
            length,
            offset,
        });
    }

    // Read string data for name records
    for (const record of nameRecords) {
        const stringReader = new ByteReader(tableData.buffer.slice(tableData.byteOffset, tableData.byteOffset + tableData.byteLength) as ArrayBuffer, false);
        stringReader.skip(stringOffset + record.offset);
        
        const stringBytes = stringReader.readBytes(record.length);
        
        // Decode string based on platform and encoding
        try {
            if (record.platformID === 0 || (record.platformID === 3 && record.encodingID === 1)) {
                // Unicode platform or Windows Unicode BMP
                const decoder = new TextDecoder("utf-16be");
                record.value = decoder.decode(stringBytes);
            } else if (record.platformID === 1) {
                // Macintosh platform
                const decoder = new TextDecoder("macintosh");
                record.value = decoder.decode(stringBytes);
            } else {
                // Default to ASCII
                const decoder = new TextDecoder("ascii");
                record.value = decoder.decode(stringBytes);
            }
        } catch {
            // Fallback to ASCII if decoding fails
            const decoder = new TextDecoder("ascii");
            record.value = decoder.decode(stringBytes);
        }
    }

    return {
        format,
        count,
        stringOffset,
        nameRecords,
    };
}

/**
 * Parse TTF 'cmap' table (basic structure, format 4 subtable)
 * @param font - TTF font structure
 * @returns Parsed cmap table or null if not found
 */
export function parseCmapTable(font: TTFFont): TTFCmapTable | null {
    const tableData = getTableData(font, "cmap");
    if (!tableData) {
        return null;
    }

    const reader = new ByteReader(tableData.buffer.slice(tableData.byteOffset, tableData.byteOffset + tableData.byteLength) as ArrayBuffer, false);
    
    const version = reader.readUint16();
    const numTables = reader.readUint16();

    const subtables: TTFCmapSubtable[] = [];
    
    // Read encoding records
    for (let i = 0; i < numTables; i++) {
        const platformID = reader.readUint16();
        const encodingID = reader.readUint16();
        const offset = reader.readUint32();

        subtables.push({
            platformID,
            encodingID,
            offset,
        });
    }

    // Parse subtables (focus on format 4 which is most common)
    for (const subtable of subtables) {
        try {
            const subtableReader = new ByteReader(tableData.buffer.slice(tableData.byteOffset, tableData.byteOffset + tableData.byteLength) as ArrayBuffer, false);
            subtableReader.skip(subtable.offset);
            
            const format = subtableReader.readUint16();
            subtable.format = format;
            
            if (format === 4) {
                // Parse format 4 subtable
                const length = subtableReader.readUint16();
                const language = subtableReader.readUint16();
                const segCountX2 = subtableReader.readUint16();
                const segCount = segCountX2 / 2;
                const searchRange = subtableReader.readUint16();
                const entrySelector = subtableReader.readUint16();
                const rangeShift = subtableReader.readUint16();

                const endCode: number[] = [];
                for (let i = 0; i < segCount; i++) {
                    endCode.push(subtableReader.readUint16());
                }
                
                subtableReader.skip(2); // Reserved pad

                const startCode: number[] = [];
                for (let i = 0; i < segCount; i++) {
                    startCode.push(subtableReader.readUint16());
                }

                const idDelta: number[] = [];
                for (let i = 0; i < segCount; i++) {
                    idDelta.push(subtableReader.readInt16());
                }

                const idRangeOffset: number[] = [];
                for (let i = 0; i < segCount; i++) {
                    idRangeOffset.push(subtableReader.readUint16());
                }

                // Read remaining glyph ID array
                const glyphIdArray: number[] = [];
                const remainingBytes = subtableReader.getRemainingBytes();
                for (let i = 0; i < remainingBytes / 2; i++) {
                    glyphIdArray.push(subtableReader.readUint16());
                }

                subtable.data = {
                    format,
                    length,
                    language,
                    segCountX2,
                    searchRange,
                    entrySelector,
                    rangeShift,
                    endCode,
                    startCode,
                    idDelta,
                    idRangeOffset,
                    glyphIdArray,
                };
            }
        } catch (error) {
            // Skip subtables that fail to parse
            console.warn(`Failed to parse cmap subtable: ${error}`);
        }
    }

    return {
        version,
        numTables,
        subtables,
    };
}

/**
 * Get glyph ID for a character using cmap table
 * @param font - TTF font structure
 * @param charCode - Unicode character code
 * @returns Glyph ID or 0 if not found
 */
export function getGlyphId(font: TTFFont, charCode: number): number {
    const cmapTable = font.tableAccess.getParsedTable<TTFCmapTable>("cmap");
    if (!cmapTable) {
        return 0;
    }

    // Find a Unicode subtable (platform 0 or platform 3, encoding 1)
    const unicodeSubtable = cmapTable.subtables.find(s => 
        s.platformID === 0 || (s.platformID === 3 && s.encodingID === 1),
    );
    
    if (!unicodeSubtable || unicodeSubtable.format !== 4 || !unicodeSubtable.data) {
        return 0;
    }

    const data = unicodeSubtable.data;
    const segCount = data.segCountX2 / 2;

    // Binary search for the character in the segments
    for (let i = 0; i < segCount; i++) {
        if (charCode <= data.endCode[i] && charCode >= data.startCode[i]) {
            if (data.idRangeOffset[i] === 0) {
                // Simple delta mapping
                return (charCode + data.idDelta[i]) & 0xFFFF;
            } else {
                // Glyph index array lookup
                const index = data.idRangeOffset[i] / 2 + (charCode - data.startCode[i]) - (segCount - i);
                if (index >= 0 && index < data.glyphIdArray.length) {
                    const glyphId = data.glyphIdArray[index];
                    if (glyphId !== 0) {
                        return (glyphId + data.idDelta[i]) & 0xFFFF;
                    }
                }
            }
            break;
        }
    }

    return 0; // Not found
}

/**
 * Simple glyph outline point
 */
export interface GlyphPoint {
    /** X coordinate in font units */
    x: number;
    /** Y coordinate in font units */
    y: number;
    /** True if this is a control point, false if it's a curve point */
    onCurve: boolean;
}

/**
 * Simple glyph contour (list of points)
 */
export interface GlyphContour {
    /** Array of points forming this contour */
    points: GlyphPoint[];
}

/**
 * Simple glyph outline data
 */
export interface GlyphOutline {
    /** Array of contours that make up this glyph */
    contours: GlyphContour[];
    /** Minimum X coordinate of the glyph bounding box */
    xMin: number;
    /** Minimum Y coordinate of the glyph bounding box */
    yMin: number;
    /** Maximum X coordinate of the glyph bounding box */
    xMax: number;
    /** Maximum Y coordinate of the glyph bounding box */
    yMax: number;
    /** Advance width for this glyph in font units */
    advanceWidth: number;
}

/**
 * Parse a simple glyph outline from the glyf table
 * @param font - TTF font structure
 * @param glyphId - Glyph ID to parse
 * @returns Glyph outline, or null only for critical errors (missing tables, invalid glyph ID, data corruption)
 *          Empty glyphs and composite glyphs return valid empty outlines rather than null
 */
export function parseGlyphOutline(font: TTFFont, glyphId: number): GlyphOutline | null {
    // Check cache first
    const cached = font.tableAccess.getCachedGlyphOutline(glyphId);
    if (cached) {
        return cached;
    }

    const maxpTable = font.tableAccess.getParsedTable<TTFMaxpTable>("maxp");
    if (!maxpTable || glyphId >= maxpTable.numGlyphs) {
        return null;
    }

    // Parse loca table to find glyph location
    const locaData = font.tableAccess.getRawTable("loca");
    const headTable = font.tableAccess.getParsedTable<TTFHeadTable>("head");
    if (!locaData || !headTable) {
        return null;
    }

    const locaReader = new ByteReader(locaData.buffer.slice(locaData.byteOffset, locaData.byteOffset + locaData.byteLength) as ArrayBuffer, false);
    
    let glyphOffset: number;
    let nextGlyphOffset: number;
    
    if (headTable.indexToLocFormat === 0) {
        // Short format: offsets are divided by 2
        locaReader.skip(glyphId * 2);
        glyphOffset = locaReader.readUint16() * 2;
        nextGlyphOffset = locaReader.readUint16() * 2;
    } else {
        // Long format: 32-bit offsets
        locaReader.skip(glyphId * 4);
        glyphOffset = locaReader.readUint32();
        nextGlyphOffset = locaReader.readUint32();
    }

    if (glyphOffset === nextGlyphOffset) {
        // Empty glyph (legitimate case like space character)
        // Get proper advance width from hmtx table
        let advanceWidth = 1000; // Default
        const hmtxData = font.tableAccess.getRawTable("hmtx");
        const hheaTable = font.tableAccess.getParsedTable<TTFHheaTable>("hhea");
        if (hmtxData && hheaTable) {
            const hmtxReader = new ByteReader(hmtxData.buffer.slice(hmtxData.byteOffset, hmtxData.byteOffset + hmtxData.byteLength) as ArrayBuffer, false);
            if (glyphId < hheaTable.numberOfHMetrics) {
                hmtxReader.skip(glyphId * 4);
                advanceWidth = hmtxReader.readUint16();
            } else {
                // Use last advance width
                hmtxReader.skip((hheaTable.numberOfHMetrics - 1) * 4);
                advanceWidth = hmtxReader.readUint16();
            }
        }
        
        const result = {
            contours: [],
            xMin: 0, yMin: 0, xMax: 0, yMax: 0,
            advanceWidth,
        };

        // Cache the result
        font.tableAccess.cacheGlyphOutline(glyphId, result);
        
        return result;
    }

    // Parse glyph data
    const glyfData = font.tableAccess.getRawTable("glyf");
    if (!glyfData) {
        return null;
    }

    const glyphReader = new ByteReader(glyfData.buffer.slice(glyfData.byteOffset, glyfData.byteOffset + glyfData.byteLength) as ArrayBuffer, false);
    glyphReader.skip(glyphOffset);

    const numberOfContours = glyphReader.readInt16();
    const xMin = glyphReader.readInt16();
    const yMin = glyphReader.readInt16();
    const xMax = glyphReader.readInt16();
    const yMax = glyphReader.readInt16();

    if (numberOfContours < -1) {
        // Invalid numberOfContours value
        throw new Error(`Invalid numberOfContours value: ${numberOfContours} for glyph ID ${glyphId}. Valid values are: -1 (composite glyph), 0 (empty glyph), or positive (simple glyph).`);
    }

    if (numberOfContours === -1) {
        // Composite glyph - not implemented yet
        throw new Error(`Composite glyph (glyph ID: ${glyphId}) not supported. numberOfContours=-1 indicates a composite glyph which requires component parsing that is not yet implemented.`);
    }

    if (numberOfContours === 0) {
        // No contours - get proper advance width
        let advanceWidth = 1000; // Default
        const hmtxData = font.tableAccess.getRawTable("hmtx");
        const hheaTable = font.tableAccess.getParsedTable<TTFHheaTable>("hhea");
        if (hmtxData && hheaTable) {
            const hmtxReader = new ByteReader(hmtxData.buffer.slice(hmtxData.byteOffset, hmtxData.byteOffset + hmtxData.byteLength) as ArrayBuffer, false);
            if (glyphId < hheaTable.numberOfHMetrics) {
                hmtxReader.skip(glyphId * 4);
                advanceWidth = hmtxReader.readUint16();
            } else {
                // Use last advance width
                hmtxReader.skip((hheaTable.numberOfHMetrics - 1) * 4);
                advanceWidth = hmtxReader.readUint16();
            }
        }
        
        const result = {
            contours: [],
            xMin, yMin, xMax, yMax,
            advanceWidth,
        };

        // Cache the result
        font.tableAccess.cacheGlyphOutline(glyphId, result);
        
        return result;
    }

    // Read contour end points
    const contourEndPts: number[] = [];
    for (let i = 0; i < numberOfContours; i++) {
        contourEndPts.push(glyphReader.readUint16());
    }

    const numPoints = contourEndPts[contourEndPts.length - 1] + 1;
    
    // Skip instruction length and instructions
    const instructionLength = glyphReader.readUint16();
    glyphReader.skip(instructionLength);

    // Read flags
    const flags: number[] = [];
    for (let i = 0; i < numPoints;) {
        const flag = glyphReader.readUint8();
        flags.push(flag);
        i++;
        
        // Check for repeat flag
        if (flag & 0x08) {
            const repeatCount = glyphReader.readUint8();
            for (let j = 0; j < repeatCount; j++) {
                flags.push(flag);
                i++;
            }
        }
    }

    // Read x coordinates
    const xCoords: number[] = [];
    let currentX = 0;
    for (let i = 0; i < numPoints; i++) {
        const flag = flags[i];
        if (flag & 0x02) { // X_SHORT_VECTOR
            const delta = glyphReader.readUint8();
            currentX += (flag & 0x10) ? delta : -delta; // POSITIVE_X_SHORT_VECTOR
        } else if (!(flag & 0x10)) { // Not SAME_X
            currentX += glyphReader.readInt16();
        }
        xCoords.push(currentX);
    }

    // Read y coordinates
    const yCoords: number[] = [];
    let currentY = 0;
    for (let i = 0; i < numPoints; i++) {
        const flag = flags[i];
        if (flag & 0x04) { // Y_SHORT_VECTOR
            const delta = glyphReader.readUint8();
            currentY += (flag & 0x20) ? delta : -delta; // POSITIVE_Y_SHORT_VECTOR
        } else if (!(flag & 0x20)) { // Not SAME_Y
            currentY += glyphReader.readInt16();
        }
        yCoords.push(currentY);
    }

    // Build contours
    const contours: GlyphContour[] = [];
    let pointIndex = 0;
    
    for (let contourIndex = 0; contourIndex < numberOfContours; contourIndex++) {
        const endPt = contourEndPts[contourIndex];
        const points: GlyphPoint[] = [];
        
        while (pointIndex <= endPt) {
            points.push({
                x: xCoords[pointIndex],
                y: yCoords[pointIndex],
                onCurve: (flags[pointIndex] & 0x01) !== 0, // ON_CURVE_POINT
            });
            pointIndex++;
        }
        
        contours.push({ points });
    }

    // Get advance width from hmtx table
    let advanceWidth = 1000; // Default
    const hmtxData = font.tableAccess.getRawTable("hmtx");
    const hheaTable = font.tableAccess.getParsedTable<TTFHheaTable>("hhea");
    if (hmtxData && hheaTable) {
        const hmtxReader = new ByteReader(hmtxData.buffer.slice(hmtxData.byteOffset, hmtxData.byteOffset + hmtxData.byteLength) as ArrayBuffer, false);
        if (glyphId < hheaTable.numberOfHMetrics) {
            hmtxReader.skip(glyphId * 4);
            advanceWidth = hmtxReader.readUint16();
        } else {
            // Use last advance width
            hmtxReader.skip((hheaTable.numberOfHMetrics - 1) * 4);
            advanceWidth = hmtxReader.readUint16();
        }
    }

    const result = {
        contours,
        xMin, yMin, xMax, yMax,
        advanceWidth,
    };

    // Cache the result
    font.tableAccess.cacheGlyphOutline(glyphId, result);
    
    return result;
}

/**
 * Unified table access interface for TTF fonts
 * Provides consistent API for both raw and parsed table data with comprehensive caching
 */
export class TTFTableAccess {
    private font: TTFFont;
    private parsedCache = new Map<string, any>();
    private rawCache = new Map<string, Uint8Array>();
    private glyphCache = new Map<number, GlyphOutline>();

    constructor(font: TTFFont) {
        this.font = font;
    }

    /**
     * Get raw table data as Uint8Array with caching
     * @param tableTag - 4-character table identifier (e.g., 'hmtx', 'glyf', 'loca')
     * @returns Raw table data or null if table doesn't exist
     */
    getRawTable(tableTag: string): Uint8Array | null {
        // Check cache first
        if (this.rawCache.has(tableTag)) {
            return this.rawCache.get(tableTag)!;
        }

        // Get table data
        const tableEntry = this.font.tables.get(tableTag);
        if (!tableEntry) {
            return null;
        }
        
        const tableData = this.font.rawData.subarray(tableEntry.offset, tableEntry.offset + tableEntry.length);
        
        // Cache the result
        this.rawCache.set(tableTag, tableData);
        
        return tableData;
    }

    /**
     * Get parsed table data with automatic caching
     * @param tableTag - 4-character table identifier 
     * @returns Parsed table structure or null if table doesn't exist or can't be parsed
     */
    getParsedTable<T>(tableTag: string): T | null {
        // Check cache first
        if (this.parsedCache.has(tableTag)) {
            return this.parsedCache.get(tableTag) as T;
        }

        let parsed: T | null = null;

        switch (tableTag) {
        case "head":
            parsed = parseHeadTable(this.font) as T;
            break;
        case "hhea":
            parsed = parseHheaTable(this.font) as T;
            break;
        case "maxp":
            parsed = parseMaxpTable(this.font) as T;
            break;
        case "name":
            parsed = parseNameTable(this.font) as T;
            break;
        case "cmap":
            parsed = parseCmapTable(this.font) as T;
            break;
        default:
            // For tables without dedicated parsers, return null
            return null;
        }

        // Cache the result
        if (parsed !== null) {
            this.parsedCache.set(tableTag, parsed);
        }

        return parsed;
    }

    /**
     * Get cached glyph outline data
     * @param glyphId - Glyph ID to retrieve
     * @returns Cached glyph outline or null if not cached or invalid
     */
    getCachedGlyphOutline(glyphId: number): GlyphOutline | null {
        return this.glyphCache.get(glyphId) || null;
    }

    /**
     * Cache glyph outline data
     * @param glyphId - Glyph ID 
     * @param outline - Glyph outline to cache
     */
    cacheGlyphOutline(glyphId: number, outline: GlyphOutline): void {
        this.glyphCache.set(glyphId, outline);
    }

    /**
     * Check if a table exists in the font
     * @param tableTag - 4-character table identifier
     * @returns True if table exists, false otherwise
     */
    hasTable(tableTag: string): boolean {
        return this.font.tables.has(tableTag);
    }

    /**
     * Get table metadata (offset, length, checksum)
     * @param tableTag - 4-character table identifier
     * @returns Table entry or null if table doesn't exist
     */
    getTableInfo(tableTag: string): TTFTableEntry | null {
        return this.font.tables.get(tableTag) || null;
    }

    /**
     * List all available tables in the font
     * @returns Array of table tags
     */
    listTables(): string[] {
        return Array.from(this.font.tables.keys()).sort();
    }

    /**
     * Clear all caches
     */
    clearCache(): void {
        this.parsedCache.clear();
        this.rawCache.clear();
        this.glyphCache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            parsedTables: this.parsedCache.size,
            rawTables: this.rawCache.size,
            cachedGlyphs: this.glyphCache.size,
        };
    }
}

/**
 * Create a table access interface for a TTF font
 * @param font - TTF font structure
 * @returns Table access interface
 */
export function createTableAccess(font: TTFFont): TTFTableAccess {
    return new TTFTableAccess(font);
} 