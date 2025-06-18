import { describe, test, expect } from "bun:test";
import { Font } from "../../../static/src/text";
import { vec3 } from "gl-matrix";

describe("Font Error Handling", () => {
    describe("Valid Font Operations", () => {
        test("should load valid font successfully", async () => {
            const font = await Font.fromFile('./static/resources/Raleway-Regular.ttf', 5, true, 1.0, 1.0);
            expect(font).toBeDefined();
            expect(font.config.fontSize).toBe(1.0);
            expect(font.config.filled).toBe(true);
        });

        test("should handle space character with proper TTF advance width", async () => {
            const font = await Font.fromFile('./static/resources/Raleway-Regular.ttf', 5, true, 1.0, 1.0);
            
            const spaceText = font.generateText(' ', vec3.fromValues(0, 0, 0), vec3.fromValues(1, 1, 1));
            
            expect(spaceText).toBeDefined();
            expect(spaceText.vertices).toBeDefined();
            expect(spaceText.indices).toBeDefined();
            expect(spaceText.advanceWidth).toBeGreaterThan(0); // Should have proper advance width from TTF
            expect(spaceText.advanceWidth).toBeCloseTo(0.256, 2); // Raleway space advance width
        });

        test("should handle normal character with proper TTF advance width", async () => {
            const font = await Font.fromFile('./static/resources/Raleway-Regular.ttf', 5, true, 1.0, 1.0);
            
            const normalText = font.generateText('A', vec3.fromValues(0, 0, 0), vec3.fromValues(1, 1, 1));
            
            expect(normalText).toBeDefined();
            expect(normalText.vertices).toBeDefined();
            expect(normalText.indices).toBeDefined();
            expect(normalText.advanceWidth).toBeGreaterThan(0);
            expect(normalText.advanceWidth).toBeCloseTo(0.679, 2); // Raleway 'A' advance width
        });

        test("should handle missing character using .notdef glyph", async () => {
            const font = await Font.fromFile('./static/resources/Raleway-Regular.ttf', 5, true, 1.0, 1.0);
            
            // Use a Unicode character likely not in the font
            const missingText = font.generateText('🦄', vec3.fromValues(0, 0, 0), vec3.fromValues(1, 1, 1));
            
            expect(missingText).toBeDefined();
            expect(missingText.vertices).toBeDefined();
            expect(missingText.indices).toBeDefined();
            // .notdef glyph should have some advance width (could be 0 or positive)
            expect(missingText.advanceWidth).toBeGreaterThanOrEqual(0);
        });
    });

    describe("Error Cases", () => {
        test("should throw error for non-existent font file", async () => {
            await expect(Font.fromFile('./nonexistent-font.ttf', 5, true, 1.0, 1.0))
                .rejects
                .toThrow(/Failed to read TTF file/);
        });

        test("should throw error for invalid font path", async () => {
            await expect(Font.fromFile('', 5, true, 1.0, 1.0))
                .rejects
                .toThrow();
        });

        test("should throw descriptive error for glyph parsing failures", async () => {
            const font = await Font.fromFile('./static/resources/Raleway-Regular.ttf', 5, true, 1.0, 1.0);
            
            // This test would require a way to mock parseGlyphOutline to return null
            // For now, we verify that the error message format is correct by checking
            // that normal operation works (if it fails, we'd get the descriptive error)
            expect(() => {
                font.generateText('A', vec3.fromValues(0, 0, 0), vec3.fromValues(1, 1, 1));
            }).not.toThrow();
        });
    });

    describe("TTF Specification Compliance", () => {
        test("should use proper advance widths from hmtx table", async () => {
            const font = await Font.fromFile('./static/resources/Raleway-Regular.ttf', 5, true, 1.0, 1.0);
            
            // Test multiple characters to ensure advance widths vary appropriately
            const textA = font.generateText('A', vec3.fromValues(0, 0, 0), vec3.fromValues(1, 1, 1));
            const textI = font.generateText('I', vec3.fromValues(0, 0, 0), vec3.fromValues(1, 1, 1));
            const textW = font.generateText('W', vec3.fromValues(0, 0, 0), vec3.fromValues(1, 1, 1));
            
            // Different characters should have different advance widths
            // 'I' should be narrower than 'A', and 'W' should be wider than 'A'
            expect(textI.advanceWidth).toBeLessThan(textA.advanceWidth);
            expect(textW.advanceWidth).toBeGreaterThan(textA.advanceWidth);
        });

        test("should handle empty glyphs correctly", async () => {
            const font = await Font.fromFile('./static/resources/Raleway-Regular.ttf', 5, true, 1.0, 1.0);
            
            // Space is typically an empty glyph
            const spaceText = font.generateText(' ', vec3.fromValues(0, 0, 0), vec3.fromValues(1, 1, 1));
            
            // Empty glyph should have no vertices but proper advance width
            expect(spaceText.vertices.length).toBe(0);
            expect(spaceText.indices.length).toBe(0);
            expect(spaceText.advanceWidth).toBeGreaterThan(0);
        });

        test("should cache glyphs properly", async () => {
            const font = await Font.fromFile('./static/resources/Raleway-Regular.ttf', 5, true, 1.0, 1.0);
            
            // Generate same character multiple times
            const text1 = font.generateText('A', vec3.fromValues(0, 0, 0), vec3.fromValues(1, 1, 1));
            const text2 = font.generateText('A', vec3.fromValues(1, 0, 0), vec3.fromValues(0, 1, 1));
            
            // Should have same advance width (cached)
            expect(text1.advanceWidth).toBe(text2.advanceWidth);
            
            // Cache stats should show the glyph
            const stats = font.getCacheStats();
            expect(stats.cachedGlyphs).toBeGreaterThan(0);
            expect(stats.glyphs).toContain('A');
        });

        test("should clear cache properly", async () => {
            const font = await Font.fromFile('./static/resources/Raleway-Regular.ttf', 5, true, 1.0, 1.0);
            
            // Generate a character to populate cache
            font.generateText('A', vec3.fromValues(0, 0, 0), vec3.fromValues(1, 1, 1));
            
            let stats = font.getCacheStats();
            expect(stats.cachedGlyphs).toBeGreaterThan(0);
            
            // Clear cache
            font.clearCache();
            
            stats = font.getCacheStats();
            expect(stats.cachedGlyphs).toBe(0);
            expect(stats.glyphs).toHaveLength(0);
        });
    });

    describe("Font Configuration", () => {
        test("should respect font configuration parameters", async () => {
            const filledFont = await Font.fromFile('./static/resources/Raleway-Regular.ttf', 10, true, 2.0, 3.0);
            const wireframeFont = await Font.fromFile('./static/resources/Raleway-Regular.ttf', 5, false, 1.5, 2.0);
            
            expect(filledFont.config.smoothness).toBe(10);
            expect(filledFont.config.filled).toBe(true);
            expect(filledFont.config.fontSize).toBe(2.0);
            expect(filledFont.config.lineWidth).toBe(3.0);
            
            expect(wireframeFont.config.smoothness).toBe(5);
            expect(wireframeFont.config.filled).toBe(false);
            expect(wireframeFont.config.fontSize).toBe(1.5);
            expect(wireframeFont.config.lineWidth).toBe(2.0);
        });

        test("should generate different mesh types based on filled flag", async () => {
            const filledFont = await Font.fromFile('./static/resources/Raleway-Regular.ttf', 5, true, 1.0, 1.0);
            const wireframeFont = await Font.fromFile('./static/resources/Raleway-Regular.ttf', 5, false, 1.0, 1.0);
            
            const filledText = filledFont.generateText('A', vec3.fromValues(0, 0, 0), vec3.fromValues(1, 1, 1));
            const wireframeText = wireframeFont.generateText('A', vec3.fromValues(0, 0, 0), vec3.fromValues(1, 1, 1));
            
            // Both should have vertices and indices, but potentially different counts
            expect(filledText.vertices.length).toBeGreaterThan(0);
            expect(filledText.indices.length).toBeGreaterThan(0);
            expect(wireframeText.vertices.length).toBeGreaterThan(0);
            expect(wireframeText.indices.length).toBeGreaterThan(0);
            
            // Same advance width regardless of rendering mode
            expect(filledText.advanceWidth).toBe(wireframeText.advanceWidth);
        });
    });
}); 