import { describe, expect, test, beforeAll } from 'bun:test';
import { 
    parseTTF, 
    debugTTFFont, 
    parseHeadTable, 
    parseHheaTable, 
    parseMaxpTable, 
    parseNameTable, 
    parseCmapTable 
} from '../../../../static/src/bits/ttf';

describe('TTF Parser', () => {
    let font: any;
    
    beforeAll(async () => {
        // Parse the font once for all tests
        font = await parseTTF('./static/resources/Raleway-Regular.ttf');
    });

    test('should parse Raleway font header and table directory', async () => {
        // Verify header structure
        expect(font.header).toBeDefined();
        expect(font.header.sfntVersion).toBe(0x00010000); // TrueType magic number
        expect(font.header.numTables).toBeGreaterThan(0);
        expect(font.header.numTables).toBeLessThan(100); // Reasonable upper bound
        
        // Verify we have tables
        expect(font.tables).toBeDefined();
        expect(font.tables.size).toBe(font.header.numTables);
        
        // Verify raw data is present
        expect(font.rawData).toBeDefined();
        expect(font.rawData.length).toBeGreaterThan(1000); // Font should be reasonably sized
        
        // Check for essential tables that should be present in any TTF
        expect(font.tables.has('head')).toBe(true); // Font header table
        expect(font.tables.has('hhea')).toBe(true); // Horizontal header table
        expect(font.tables.has('hmtx')).toBe(true); // Horizontal metrics table
        expect(font.tables.has('maxp')).toBe(true); // Maximum profile table
        expect(font.tables.has('name')).toBe(true); // Name table
        expect(font.tables.has('cmap')).toBe(true); // Character mapping table
        
        // Check table properties
        const headTable = font.tables.get('head');
        expect(headTable).toBeDefined();
        expect(headTable!.tag).toBe('head');
        expect(headTable!.offset).toBeGreaterThan(0);
        expect(headTable!.length).toBeGreaterThan(0);
        expect(typeof headTable!.checkSum).toBe('number'); // checkSum can be any 32-bit value
        
        // Debug output for manual inspection
        console.log('\n=== TTF Parser Test Results ===');
        debugTTFFont(font);
    });
    
    test('should parse head table correctly', () => {
        const headTable = parseHeadTable(font);
        
        expect(headTable).toBeDefined();
        expect(headTable!.majorVersion).toBe(1);
        expect(headTable!.minorVersion).toBe(0);
        expect(headTable!.magicNumber).toBe(0x5F0F3CF5); // TTF magic number
        expect(headTable!.unitsPerEm).toBeGreaterThan(0);
        expect(headTable!.unitsPerEm).toBeLessThan(10000); // Reasonable range
        
        // Check bounding box values are reasonable
        expect(headTable!.xMin).toBeLessThan(headTable!.xMax);
        expect(headTable!.yMin).toBeLessThan(headTable!.yMax);
        
        // Check dates are valid
        expect(headTable!.created).toBeInstanceOf(Date);
        expect(headTable!.modified).toBeInstanceOf(Date);
        expect(headTable!.created.getFullYear()).toBeGreaterThan(1990); // Reasonable date
        expect(headTable!.modified.getFullYear()).toBeGreaterThan(1990);
        
        // Check format values
        expect(headTable!.indexToLocFormat).toBeGreaterThanOrEqual(0);
        expect(headTable!.indexToLocFormat).toBeLessThanOrEqual(1);
        expect(headTable!.glyphDataFormat).toBe(0); // Current format
        
        console.log('Head table parsed:', {
            unitsPerEm: headTable!.unitsPerEm,
            created: headTable!.created.toISOString(),
            modified: headTable!.modified.toISOString(),
            boundingBox: {
                xMin: headTable!.xMin,
                yMin: headTable!.yMin,
                xMax: headTable!.xMax,
                yMax: headTable!.yMax
            }
        });
    });
    
    test('should parse hhea table correctly', () => {
        const hheaTable = parseHheaTable(font);
        
        expect(hheaTable).toBeDefined();
        expect(hheaTable!.majorVersion).toBe(1);
        expect(hheaTable!.minorVersion).toBe(0);
        
        // Ascender should be positive, descender should be negative
        expect(hheaTable!.ascender).toBeGreaterThan(0);
        expect(hheaTable!.descender).toBeLessThan(0);
        
        // Line gap can be zero or positive
        expect(hheaTable!.lineGap).toBeGreaterThanOrEqual(0);
        
        // Advance width max should be positive
        expect(hheaTable!.advanceWidthMax).toBeGreaterThan(0);
        
        // Number of horizontal metrics should be reasonable
        expect(hheaTable!.numberOfHMetrics).toBeGreaterThan(0);
        expect(hheaTable!.numberOfHMetrics).toBeLessThan(10000);
        
        console.log('Hhea table parsed:', {
            ascender: hheaTable!.ascender,
            descender: hheaTable!.descender,
            lineGap: hheaTable!.lineGap,
            advanceWidthMax: hheaTable!.advanceWidthMax,
            numberOfHMetrics: hheaTable!.numberOfHMetrics
        });
    });
    
    test('should parse maxp table correctly', () => {
        const maxpTable = parseMaxpTable(font);
        
        expect(maxpTable).toBeDefined();
        expect(maxpTable!.numGlyphs).toBeGreaterThan(0);
        expect(maxpTable!.numGlyphs).toBeLessThan(100000); // Reasonable upper bound
        
        // Check version - should be either 0.5 or 1.0
        expect(maxpTable!.version === 0x00005000 || maxpTable!.version === 0x00010000).toBe(true);
        
        if (maxpTable!.version === 0x00010000) {
            // Version 1.0 fields should be present
            expect(maxpTable!.maxPoints).toBeDefined();
            expect(maxpTable!.maxContours).toBeDefined();
            expect(maxpTable!.maxStackElements).toBeDefined();
            
            // Reasonable bounds
            expect(maxpTable!.maxPoints!).toBeGreaterThan(0);
            expect(maxpTable!.maxContours!).toBeGreaterThan(0);
        }
        
        console.log('Maxp table parsed:', {
            version: '0x' + maxpTable!.version.toString(16),
            numGlyphs: maxpTable!.numGlyphs,
            maxPoints: maxpTable!.maxPoints,
            maxContours: maxpTable!.maxContours
        });
    });
    
    test('should parse name table correctly', () => {
        const nameTable = parseNameTable(font);
        
        expect(nameTable).toBeDefined();
        expect(nameTable!.format).toBe(0); // Current format
        expect(nameTable!.count).toBeGreaterThan(0);
        expect(nameTable!.nameRecords.length).toBe(nameTable!.count);
        
        // Find font family name (nameID 1)
        const familyName = nameTable!.nameRecords.find(r => r.nameID === 1);
        expect(familyName).toBeDefined();
        expect(familyName!.value).toBeDefined();
        expect(familyName!.value!.length).toBeGreaterThan(0);
        
        // Find font style name (nameID 2)  
        const styleName = nameTable!.nameRecords.find(r => r.nameID === 2);
        expect(styleName).toBeDefined();
        expect(styleName!.value).toBeDefined();
        
        // Find full font name (nameID 4)
        const fullName = nameTable!.nameRecords.find(r => r.nameID === 4);
        expect(fullName).toBeDefined();
        expect(fullName!.value).toBeDefined();
        
        console.log('Name table parsed:', {
            familyName: familyName!.value,
            styleName: styleName!.value,
            fullName: fullName!.value,
            totalRecords: nameTable!.count
        });
    });
    
    test('should parse cmap table correctly', () => {
        const cmapTable = parseCmapTable(font);
        
        expect(cmapTable).toBeDefined();
        expect(cmapTable!.version).toBe(0); // Current version
        expect(cmapTable!.numTables).toBeGreaterThan(0);
        expect(cmapTable!.subtables.length).toBe(cmapTable!.numTables);
        
        // Find a Unicode subtable (platform 0 or platform 3, encoding 1)
        const unicodeSubtable = cmapTable!.subtables.find(s => 
            s.platformID === 0 || (s.platformID === 3 && s.encodingID === 1)
        );
        expect(unicodeSubtable).toBeDefined();
        
        // Check if we have format 4 data
        const format4Subtable = cmapTable!.subtables.find(s => s.format === 4);
        if (format4Subtable && format4Subtable.data) {
            const data = format4Subtable.data;
            expect(data.format).toBe(4);
            expect(data.segCountX2).toBeGreaterThan(0);
            expect(data.endCode.length).toBeGreaterThan(0);
            expect(data.startCode.length).toBe(data.endCode.length);
            expect(data.idDelta.length).toBe(data.endCode.length);
            expect(data.idRangeOffset.length).toBe(data.endCode.length);
            
            console.log('Cmap table parsed:', {
                version: cmapTable!.version,
                numSubtables: cmapTable!.numTables,
                format4SegmentCount: data.segCountX2 / 2,
                glyphIdArrayLength: data.glyphIdArray.length
            });
        }
    });
    
    test('should handle invalid font files gracefully', async () => {
        // Test with a non-existent file
        await expect(parseTTF('./nonexistent.ttf')).rejects.toThrow('Failed to read TTF file');
    });
    
    test('should calculate header values correctly', () => {
        // Basic validation of header calculation fields
        // These should follow the TrueType specification
        expect(font.header.searchRange).toBeGreaterThan(0);
        expect(font.header.entrySelector).toBeGreaterThan(0);
        expect(font.header.rangeShift).toBeGreaterThan(0);
        
        // Verify the mathematical relationships from the spec
        const numTables = font.header.numTables;
        const maxPowerOf2 = Math.pow(2, Math.floor(Math.log2(numTables)));
        
        expect(font.header.searchRange).toBe(maxPowerOf2 * 16);
        expect(font.header.entrySelector).toBe(Math.floor(Math.log2(maxPowerOf2)));
        expect(font.header.rangeShift).toBe(numTables * 16 - font.header.searchRange);
    });
    
    test('should provide character to glyph mapping functionality', () => {
        const cmapTable = parseCmapTable(font);
        const maxpTable = parseMaxpTable(font);
        
        expect(cmapTable).toBeDefined();
        expect(maxpTable).toBeDefined();
        
        // Basic validation that we can access the mapping structures
        const format4Subtable = cmapTable!.subtables.find(s => s.format === 4);
        if (format4Subtable && format4Subtable.data) {
            const data = format4Subtable.data;
            
            // The last segment should map to 0xFFFF (end of Unicode BMP)
            const lastSegment = data.endCode[data.endCode.length - 1];
            expect(lastSegment).toBe(0xFFFF);
            
            // Verify we have a reasonable number of segments for a real font
            const segmentCount = data.segCountX2 / 2;
            expect(segmentCount).toBeGreaterThan(1);
            expect(segmentCount).toBeLessThan(1000); // Reasonable upper bound
            
            console.log('Character mapping validation:', {
                segmentCount: segmentCount,
                lastEndCode: '0x' + lastSegment.toString(16),
                totalGlyphs: maxpTable!.numGlyphs
            });
        }
    });
}); 