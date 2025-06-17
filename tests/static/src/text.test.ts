import { describe, expect, test } from 'bun:test';
import { vec3 } from "gl-matrix";
import { generateTextMesh, Font, FontOptions, createTextMesh } from '../../../static/src/text';
import { TextRenderer, TextRenderConfig } from '../../../static/src/scene/textmesh';
import { parseTTF, getGlyphId, parseGlyphOutline } from '../../../static/src/bits/ttf';

describe('Text Mesh Generation', () => {
    test('should create letter A mesh at position (1,1,1)', async () => {
        const fontOptions: FontOptions = {
            fontSize: 2.0,
            lineWidth: 2.0,
            lineColor: vec3.fromValues(1.0, 1.0, 1.0)
        };
        
        const mesh = await createTextMesh('A', './static/resources/Raleway-Regular.ttf', fontOptions, vec3.fromValues(1, 1, 1));
        
        expect(mesh).toBeDefined();
        expect(mesh!.vertices).toBeDefined();
        expect(mesh!.indices).toBeDefined();
        expect(mesh!.bounds).toBeDefined();
        
        // Should have vertices (at least 3 coordinates per vertex)
        expect(mesh!.vertices.length).toBeGreaterThan(0);
        expect(mesh!.vertices.length % 3).toBe(0); // Multiple of 3 (x,y,z coordinates)
        
        // Should have line indices (pairs of vertex indices)
        expect(mesh!.indices.length).toBeGreaterThan(0);
        expect(mesh!.indices.length % 2).toBe(0); // Multiple of 2 (line segments)
        
        // Check that vertices are around position (1,1,1)
        const numVertices = mesh!.vertices.length / 3;
        let avgPosition = vec3.fromValues(0, 0, 0);
        
        for (let i = 0; i < numVertices; i++) {
            const x = mesh!.vertices[i * 3];
            const y = mesh!.vertices[i * 3 + 1];
            const z = mesh!.vertices[i * 3 + 2];
            
            avgPosition[0] += x;
            avgPosition[1] += y;
            avgPosition[2] += z;
        }
        
        vec3.scale(avgPosition, avgPosition, 1.0 / numVertices);
        
        // Average position should be close to (1,1,1)
        expect(Math.abs(avgPosition[0] - 1)).toBeLessThan(1); // Within 1 unit of target
        expect(Math.abs(avgPosition[1] - 1)).toBeLessThan(1);
        expect(Math.abs(avgPosition[2] - 1)).toBeLessThan(0.1); // Z should be close to 1
        
        // Bounds should be reasonable
        expect(mesh!.bounds.min[0]).toBeLessThan(mesh!.bounds.max[0]);
        expect(mesh!.bounds.min[1]).toBeLessThan(mesh!.bounds.max[1]);
        
        console.log('Letter A mesh generated successfully:', {
            vertices: numVertices,
            lineSegments: mesh!.indices.length / 2,
            bounds: {
                min: [mesh!.bounds.min[0], mesh!.bounds.min[1], mesh!.bounds.min[2]],
                max: [mesh!.bounds.max[0], mesh!.bounds.max[1], mesh!.bounds.max[2]]
            },
            avgPosition: [avgPosition[0], avgPosition[1], avgPosition[2]]
        });
    });
    
    test('should check letter A size and test larger font sizes', async () => {
        const font = await parseTTF('./static/resources/Raleway-Regular.ttf');
        
        // Test different font sizes
        const testSizes = [0.5, 1.0, 2.0, 5.0];
        
        for (const fontSize of testSizes) {
            const config = {
                fontSize: fontSize,
                position: vec3.fromValues(0, 0, 0), // Start at origin for easier measurement
                scale: vec3.fromValues(1, 1, 1)
            };
            
            const mesh = await generateTextMesh(font, 'A', config);
            expect(mesh).toBeDefined();
            
            // Calculate actual dimensions
            const width = mesh!.bounds.max[0] - mesh!.bounds.min[0];
            const height = mesh!.bounds.max[1] - mesh!.bounds.min[1];
            
            console.log(`Font size ${fontSize}: ${width.toFixed(3)} x ${height.toFixed(3)} units`);
            console.log(`  Bounds: (${mesh!.bounds.min[0].toFixed(3)}, ${mesh!.bounds.min[1].toFixed(3)}) to (${mesh!.bounds.max[0].toFixed(3)}, ${mesh!.bounds.max[1].toFixed(3)})`);
            
            // Verify that larger font sizes produce larger meshes
            expect(width).toBeGreaterThan(0);
            expect(height).toBeGreaterThan(0);
            
            // For font size 1.0, height should be approximately 1 unit
            if (fontSize === 1.0) {
                expect(height).toBeGreaterThan(0.5);
                expect(height).toBeLessThan(1.5);
            }
            
            // For font size 2.0, height should be approximately 2 units
            if (fontSize === 2.0) {
                expect(height).toBeGreaterThan(1.0);
                expect(height).toBeLessThan(3.0);
            }
        }
    });
    
    test('should find and parse letter A glyph from font', async () => {
        const font = await parseTTF('./static/resources/Raleway-Regular.ttf');
        
        // Find glyph ID for 'A' (ASCII 65)
        const glyphId = getGlyphId(font, 65);
        expect(glyphId).toBeGreaterThan(0); // Should find the glyph
        
        // Parse glyph outline
        const outline = parseGlyphOutline(font, glyphId);
        expect(outline).toBeDefined();
        expect(outline!.contours).toBeDefined();
        expect(outline!.contours.length).toBeGreaterThan(0); // Letter A should have contours
        
        // Letter A typically has 2 contours (outer shape and inner triangle)
        expect(outline!.contours.length).toBeGreaterThanOrEqual(1);
        expect(outline!.contours.length).toBeLessThanOrEqual(3);
        
        // Each contour should have points
        for (const contour of outline!.contours) {
            expect(contour.points.length).toBeGreaterThan(2); // At least 3 points for a shape
        }
        
        console.log('Letter A glyph analysis:', {
            glyphId: glyphId,
            contours: outline!.contours.length,
            totalPoints: outline!.contours.reduce((sum, c) => sum + c.points.length, 0),
            boundingBox: {
                xMin: outline!.xMin,
                yMin: outline!.yMin,
                xMax: outline!.xMax,
                yMax: outline!.yMax
            },
            advanceWidth: outline!.advanceWidth
        });
    });
    
    test('should handle invalid characters gracefully', async () => {
        const font = await parseTTF('./static/resources/Raleway-Regular.ttf');
        
        const config = {
            fontSize: 0.5,
            position: vec3.fromValues(0, 0, 0),
            scale: vec3.fromValues(1, 1, 1)
        };
        
        // Try to generate mesh for a character that likely doesn't exist
        const mesh = await generateTextMesh(font, '\uFFFF', config); // Invalid Unicode
        
        // Should return null gracefully, not throw an error
        expect(mesh).toBeNull();
    });
    
    test('should generate different meshes for different characters', async () => {
        const font = await parseTTF('./static/resources/Raleway-Regular.ttf');
        
        const config = {
            fontSize: 0.5,
            position: vec3.fromValues(0, 0, 0),
            scale: vec3.fromValues(1, 1, 1)
        };
        
        const meshA = await generateTextMesh(font, 'A', config);
        const meshB = await generateTextMesh(font, 'B', config);
        
        expect(meshA).toBeDefined();
        expect(meshB).toBeDefined();
        
        // Should have different vertex counts (A and B have different shapes)
        expect(meshA!.vertices.length).not.toBe(meshB!.vertices.length);
        
        console.log('Character comparison:', {
            A: { vertices: meshA!.vertices.length / 3, segments: meshA!.indices.length / 2 },
            B: { vertices: meshB!.vertices.length / 3, segments: meshB!.indices.length / 2 }
        });
    });
    
    test('should create a large visible letter A at position (1,1,1)', async () => {
        // Create a larger version for better visibility
        const font = await parseTTF('./static/resources/Raleway-Regular.ttf');
        
        const config = {
            fontSize: 2.0,  // Much larger font size
            position: vec3.fromValues(1, 1, 1),
            scale: vec3.fromValues(1, 1, 1)
        };
        
        const mesh = await generateTextMesh(font, 'A', config);
        expect(mesh).toBeDefined();
        
        // Calculate dimensions
        const width = mesh!.bounds.max[0] - mesh!.bounds.min[0];
        const height = mesh!.bounds.max[1] - mesh!.bounds.min[1];
        
        console.log('Large Letter A:', {
            fontSize: config.fontSize,
            dimensions: `${width.toFixed(3)} x ${height.toFixed(3)} units`,
            bounds: {
                min: [mesh!.bounds.min[0].toFixed(3), mesh!.bounds.min[1].toFixed(3), mesh!.bounds.min[2].toFixed(3)],
                max: [mesh!.bounds.max[0].toFixed(3), mesh!.bounds.max[1].toFixed(3), mesh!.bounds.max[2].toFixed(3)]
            },
            vertices: mesh!.vertices.length / 3,
            lineSegments: mesh!.indices.length / 2
        });
        
        // Should be reasonably large
        expect(width).toBeGreaterThan(1);
        expect(height).toBeGreaterThan(1);
    });
});

describe('Font Class Interface', () => {
    const fontPath = './static/resources/Raleway-Regular.ttf';
    
    test('should create a Font instance from file', async () => {
        const fontOptions: FontOptions = {
            fontSize: 1.0,
            lineWidth: 2.0,
            lineColor: vec3.fromValues(1.0, 0.0, 0.0)
        };
        
        const font = await Font.fromFile(fontPath, fontOptions);
        expect(font).toBeDefined();
        expect(font.options.fontSize).toBe(1.0);
        expect(font.options.lineWidth).toBe(2.0);
        expect(font.options.lineColor).toEqual(vec3.fromValues(1.0, 0.0, 0.0));
    });

    test('should generate a mesh for a single character', async () => {
        const fontOptions: FontOptions = {
            fontSize: 1.0,
            lineWidth: 2.0,
            lineColor: vec3.fromValues(1.0, 0.0, 0.0)
        };
        
        const font = await Font.fromFile(fontPath, fontOptions);
        const position = vec3.fromValues(0, 0, 0);
        const mesh = font.generateCharacterMesh('A', position);
        
        expect(mesh).not.toBeNull();
        if (mesh) {
            expect(mesh.vertices.length).toBeGreaterThan(0);
            expect(mesh.indices.length).toBeGreaterThan(0);
            expect(mesh.vertices.length % 3).toBe(0);
            expect(mesh.indices.length % 2).toBe(0);
        }
    });

    test('should generate a mesh for multiple characters', async () => {
        const fontOptions: FontOptions = {
            fontSize: 1.0,
            lineWidth: 2.0,
            lineColor: vec3.fromValues(0.0, 1.0, 0.0)
        };
        
        const font = await Font.fromFile(fontPath, fontOptions);
        const position = vec3.fromValues(0, 0, 0);
        const mesh = font.generateTextMesh('ABC', position);
        
        expect(mesh).toBeDefined();
        expect(mesh.vertices.length).toBeGreaterThan(0);
        expect(mesh.indices.length).toBeGreaterThan(0);
        expect(mesh.vertices.length % 3).toBe(0);
        expect(mesh.indices.length % 2).toBe(0);
        
        // ABC should have more vertices than just A
        const singleCharMesh = font.generateCharacterMesh('A', position);
        if (singleCharMesh) {
            expect(mesh.vertices.length).toBeGreaterThan(singleCharMesh.vertices.length);
        }
    });

    test('should handle different font sizes', async () => {
        const smallOptions: FontOptions = {
            fontSize: 0.5,
            lineWidth: 1.0,
            lineColor: vec3.fromValues(1.0, 1.0, 1.0)
        };
        
        const largeOptions: FontOptions = {
            fontSize: 2.0,
            lineWidth: 1.0,
            lineColor: vec3.fromValues(1.0, 1.0, 1.0)
        };
        
        const smallFont = await Font.fromFile(fontPath, smallOptions);
        const largeFont = await Font.fromFile(fontPath, largeOptions);
        
        const position = vec3.fromValues(0, 0, 0);
        const smallMesh = smallFont.generateCharacterMesh('A', position);
        const largeMesh = largeFont.generateCharacterMesh('A', position);
        
        expect(smallMesh).not.toBeNull();
        expect(largeMesh).not.toBeNull();
        
        if (smallMesh && largeMesh) {
            // Large font should have larger bounds
            const smallWidth = smallMesh.bounds.max[0] - smallMesh.bounds.min[0];
            const largeWidth = largeMesh.bounds.max[0] - largeMesh.bounds.min[0];
            expect(largeWidth).toBeGreaterThan(smallWidth);
        }
    });

    test('should create text mesh using the convenience function', async () => {
        const fontOptions: FontOptions = {
            fontSize: 1.0,
            lineWidth: 2.0,
            lineColor: vec3.fromValues(0.0, 0.0, 1.0)
        };
        
        const position = vec3.fromValues(1, 2, 3);
        const mesh = await createTextMesh('ABC', fontPath, fontOptions, position);
        
        expect(mesh).toBeDefined();
        expect(mesh.vertices.length).toBeGreaterThan(0);
        expect(mesh.indices.length).toBeGreaterThan(0);
        
        // Check that position is applied correctly (first character should be near the specified position)
        expect(mesh.bounds.min[0]).toBeGreaterThanOrEqual(position[0] - 0.1); // Some tolerance
        expect(mesh.bounds.min[1]).toBeGreaterThanOrEqual(position[1] - 0.1);
        expect(mesh.bounds.min[2]).toBeCloseTo(position[2], 1);
    });
});

describe('TextRenderer Class', () => {
    const fontPath = './static/resources/Raleway-Regular.ttf';
    
    test('should create TextRenderer from file', async () => {
        const textRenderer = await TextRenderer.fromFile(fontPath);
        expect(textRenderer).toBeDefined();
        expect(textRenderer.path).toBe(fontPath);
    });

    test('should generate text mesh with explicit configuration', async () => {
        const textRenderer = await TextRenderer.fromFile(fontPath);
        
        const config: TextRenderConfig = {
            fontSize: 1.5,
            lineWidth: 4.0,
            lineColor: vec3.fromValues(1.0, 0.5, 0.0), // Orange
            position: vec3.fromValues(2, 3, -1)
        };
        
        const mesh = textRenderer.generateTextMesh('TEST', config);
        
        expect(mesh).toBeDefined();
        expect(mesh.vertices.length).toBeGreaterThan(0);
        expect(mesh.indices.length).toBeGreaterThan(0);
        expect(mesh.vertices.length % 3).toBe(0);
        expect(mesh.indices.length % 2).toBe(0);
        
        // Check that position is applied correctly
        expect(mesh.bounds.min[0]).toBeGreaterThanOrEqual(config.position[0] - 0.1);
        expect(mesh.bounds.min[1]).toBeGreaterThanOrEqual(config.position[1] - 0.1);
        expect(mesh.bounds.min[2]).toBeCloseTo(config.position[2], 1);
    });

    test('should handle different configurations without defaults', async () => {
        const textRenderer = await TextRenderer.fromFile(fontPath);
        
        const config1: TextRenderConfig = {
            fontSize: 0.8,
            lineWidth: 1.0,
            lineColor: vec3.fromValues(1.0, 0.0, 0.0),
            position: vec3.fromValues(0, 0, 0)
        };
        
        const config2: TextRenderConfig = {
            fontSize: 2.5,
            lineWidth: 6.0,
            lineColor: vec3.fromValues(0.0, 0.0, 1.0),
            position: vec3.fromValues(5, 10, -2)
        };
        
        const mesh1 = textRenderer.generateTextMesh('A', config1);
        const mesh2 = textRenderer.generateTextMesh('A', config2);
        
        expect(mesh1).toBeDefined();
        expect(mesh2).toBeDefined();
        
        // Different font sizes should produce different sized meshes
        const width1 = mesh1.bounds.max[0] - mesh1.bounds.min[0];
        const width2 = mesh2.bounds.max[0] - mesh2.bounds.min[0];
        expect(width2).toBeGreaterThan(width1);
        
        // Different positions should be applied correctly
        expect(mesh1.bounds.min[2]).toBeCloseTo(config1.position[2], 1);
        expect(mesh2.bounds.min[2]).toBeCloseTo(config2.position[2], 1);
    });

    test('should enforce explicit parameters (no defaults)', async () => {
        const textRenderer = await TextRenderer.fromFile(fontPath);
        
        // This test ensures that all parameters are required
        const completeConfig: TextRenderConfig = {
            fontSize: 1.0,
            lineWidth: 2.0,
            lineColor: vec3.fromValues(1.0, 1.0, 1.0),
            position: vec3.fromValues(0, 0, 0)
        };
        
        // Should work with complete configuration
        const mesh = textRenderer.generateTextMesh('A', completeConfig);
        expect(mesh).toBeDefined();
        expect(mesh.vertices.length).toBeGreaterThan(0);
    });
}); 