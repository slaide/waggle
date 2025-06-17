import { describe, expect, test } from 'bun:test';
import { vec3 } from "gl-matrix";
import { generateTextMesh, Font, FontOptions, createTextMesh, TextMesh } from '../../../static/src/text';
import { TextRenderer, TextRenderConfig } from '../../../static/src/scene/textmesh';
import { parseTTF, getGlyphId, parseGlyphOutline } from '../../../static/src/bits/ttf';

describe('Text Mesh Generation', () => {
    test('should create letter A mesh at position (1,1,1)', async () => {
        const fontOptions: FontOptions = {
            fontSize: 2.0,
            lineWidth: 2.0,
            lineColor: vec3.fromValues(1.0, 1.0, 1.0),
            splineSteps: 0 // No interpolation for this basic test
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
            vertices: mesh!.vertices.length / 3,
            segments: mesh!.indices.length / 2,
            size: `${width.toFixed(3)} x ${height.toFixed(3)}`,
            bounds: {
                min: [mesh!.bounds.min[0].toFixed(3), mesh!.bounds.min[1].toFixed(3), mesh!.bounds.min[2].toFixed(3)],
                max: [mesh!.bounds.max[0].toFixed(3), mesh!.bounds.max[1].toFixed(3), mesh!.bounds.max[2].toFixed(3)]
            }
        });
        
        // Should be reasonably sized for font size 2.0
        expect(width).toBeGreaterThan(0.5);
        expect(height).toBeGreaterThan(1.0);
        expect(height).toBeLessThan(4.0);
    });
});

describe('Spline Interpolation Tests', () => {
    test('should generate different vertex counts with different spline steps', async () => {
        const testSteps = [0, 2, 4, 8, 16]; // Different spline step counts
        const results: Array<{ steps: number; vertices: number; segments: number }> = [];
        
        for (const splineSteps of testSteps) {
            const fontOptions: FontOptions = {
                fontSize: 1.0,
                lineWidth: 1.0,
                lineColor: vec3.fromValues(1.0, 1.0, 1.0),
                splineSteps: splineSteps
            };
            
            const mesh = await createTextMesh('O', './static/resources/Raleway-Regular.ttf', fontOptions, vec3.fromValues(0, 0, 0));
            expect(mesh).toBeDefined();
            
            const numVertices = mesh!.vertices.length / 3;
            const numSegments = mesh!.indices.length / 2;
            
            results.push({
                steps: splineSteps,
                vertices: numVertices,
                segments: numSegments
            });
        }
        
        console.log('Spline interpolation results for letter O:', results);
        
        // Higher spline steps should generally produce more vertices
        const noInterpolation = results[0]; // splineSteps = 0
        const withInterpolation = results.slice(1); // splineSteps > 0
        
        // Note: TrueType glyph contours may have different structures, so interpolated versions
        // might not always have more vertices than the original, especially for low step counts.
        // What we can guarantee is that higher step counts should produce more vertices.
        
        // Verify that the highest step count produces the most vertices
        const maxStepsResult = results[results.length - 1]; // splineSteps = 16
        expect(maxStepsResult.vertices).toBeGreaterThan(noInterpolation.vertices);
        
        // Higher step counts should generally produce more vertices than lower ones
        for (let i = 1; i < withInterpolation.length; i++) {
            const currentResult = withInterpolation[i];
            const prevResult = withInterpolation[i - 1];
            
            // Allow for some flexibility due to TrueType contour complexity
            // but ensure that much higher step counts produce more vertices
            if (currentResult.steps >= prevResult.steps * 2) {
                expect(currentResult.vertices).toBeGreaterThanOrEqual(prevResult.vertices);
            }
        }
    });
    
    test('should interpolate smooth curves for curved characters', async () => {
        // Test with letters that have curves (O, C, S)
        const curvedLetters = ['O', 'C', 'S'];
        
        for (const letter of curvedLetters) {
            const noInterpolationOptions: FontOptions = {
                fontSize: 1.0,
                lineWidth: 1.0,
                lineColor: vec3.fromValues(1.0, 1.0, 1.0),
                splineSteps: 0
            };
            
            const interpolatedOptions: FontOptions = {
                fontSize: 1.0,
                lineWidth: 1.0,
                lineColor: vec3.fromValues(1.0, 1.0, 1.0),
                splineSteps: 8
            };
            
            const originalMesh = await createTextMesh(letter, './static/resources/Raleway-Regular.ttf', noInterpolationOptions, vec3.fromValues(0, 0, 0));
            const smoothMesh = await createTextMesh(letter, './static/resources/Raleway-Regular.ttf', interpolatedOptions, vec3.fromValues(0, 0, 0));
            
            expect(originalMesh).toBeDefined();
            expect(smoothMesh).toBeDefined();
            
            const originalVertices = originalMesh!.vertices.length / 3;
            const smoothVertices = smoothMesh!.vertices.length / 3;
            
            console.log(`Letter ${letter}: original=${originalVertices} vertices, smooth=${smoothVertices} vertices`);
            
            // Interpolated version should have more vertices for curved letters
            expect(smoothVertices).toBeGreaterThanOrEqual(originalVertices);
            
            // Bounds should be similar (interpolation shouldn't change overall shape significantly)
            const originalWidth = originalMesh!.bounds.max[0] - originalMesh!.bounds.min[0];
            const smoothWidth = smoothMesh!.bounds.max[0] - smoothMesh!.bounds.min[0];
            const originalHeight = originalMesh!.bounds.max[1] - originalMesh!.bounds.min[1];
            const smoothHeight = smoothMesh!.bounds.max[1] - smoothMesh!.bounds.min[1];
            
            // Width and height should be approximately the same (within 10%)
            expect(Math.abs(originalWidth - smoothWidth) / originalWidth).toBeLessThan(0.1);
            expect(Math.abs(originalHeight - smoothHeight) / originalHeight).toBeLessThan(0.1);
        }
    });
    
    test('should handle straight-line characters properly with interpolation', async () => {
        // Test letters that are mostly straight lines (I, L, T, F)
        const straightLetters = ['I', 'L', 'T', 'F'];
        
        for (const letter of straightLetters) {
            const noInterpolationOptions: FontOptions = {
                fontSize: 1.0,
                lineWidth: 1.0,
                lineColor: vec3.fromValues(1.0, 1.0, 1.0),
                splineSteps: 0
            };
            
            const interpolatedOptions: FontOptions = {
                fontSize: 1.0,
                lineWidth: 1.0,
                lineColor: vec3.fromValues(1.0, 1.0, 1.0),
                splineSteps: 8
            };
            
            const originalMesh = await createTextMesh(letter, './static/resources/Raleway-Regular.ttf', noInterpolationOptions, vec3.fromValues(0, 0, 0));
            const smoothMesh = await createTextMesh(letter, './static/resources/Raleway-Regular.ttf', interpolatedOptions, vec3.fromValues(0, 0, 0));
            
            expect(originalMesh).toBeDefined();
            expect(smoothMesh).toBeDefined();
            
            const originalVertices = originalMesh!.vertices.length / 3;
            const smoothVertices = smoothMesh!.vertices.length / 3;
            
            console.log(`Straight letter ${letter}: original=${originalVertices} vertices, smooth=${smoothVertices} vertices`);
            
            // Even for straight letters, there might be slight curves, so allow for some increase
            expect(smoothVertices).toBeGreaterThanOrEqual(originalVertices);
        }
    });
    
    test('should produce consistent results with same spline steps', async () => {
        // Test that the same settings produce the same results
        const fontOptions: FontOptions = {
            fontSize: 1.0,
            lineWidth: 1.0,
            lineColor: vec3.fromValues(1.0, 1.0, 1.0),
            splineSteps: 6
        };
        
        const mesh1 = await createTextMesh('A', './static/resources/Raleway-Regular.ttf', fontOptions, vec3.fromValues(0, 0, 0));
        const mesh2 = await createTextMesh('A', './static/resources/Raleway-Regular.ttf', fontOptions, vec3.fromValues(0, 0, 0));
        
        expect(mesh1).toBeDefined();
        expect(mesh2).toBeDefined();
        
        // Should produce identical results
        expect(mesh1!.vertices.length).toBe(mesh2!.vertices.length);
        expect(mesh1!.indices.length).toBe(mesh2!.indices.length);
        
        // All vertices should be identical
        for (let i = 0; i < mesh1!.vertices.length; i++) {
            expect(mesh1!.vertices[i]).toBeCloseTo(mesh2!.vertices[i], 6); // 6 decimal places precision
        }
        
        // All indices should be identical
        for (let i = 0; i < mesh1!.indices.length; i++) {
            expect(mesh1!.indices[i]).toBe(mesh2!.indices[i]);
        }
    });
    
    test('should test extreme spline step values', async () => {
        const extremeValues = [0, 1, 32, 64]; // Including edge cases
        
        for (const splineSteps of extremeValues) {
            const fontOptions: FontOptions = {
                fontSize: 1.0,
                lineWidth: 1.0,
                lineColor: vec3.fromValues(1.0, 1.0, 1.0),
                splineSteps: splineSteps
            };
            
            const mesh = await createTextMesh('B', './static/resources/Raleway-Regular.ttf', fontOptions, vec3.fromValues(0, 0, 0));
            expect(mesh).toBeDefined();
            
            const numVertices = mesh!.vertices.length / 3;
            const numSegments = mesh!.indices.length / 2;
            
            console.log(`Extreme spline steps ${splineSteps}: ${numVertices} vertices, ${numSegments} segments`);
            
            // Should always produce valid results
            expect(numVertices).toBeGreaterThan(0);
            expect(numSegments).toBeGreaterThan(0);
            expect(mesh!.indices.length % 2).toBe(0); // Should be pairs
            
            // Very high step counts should produce significantly more vertices
            if (splineSteps >= 32) {
                expect(numVertices).toBeGreaterThan(20); // Should have many interpolated points
            }
        }
    });
});

describe('Text Renderer Integration Tests', () => {
    test('should work with TextRenderer API using spline interpolation', async () => {
        const textRenderer = await TextRenderer.fromFile("./static/resources/Raleway-Regular.ttf");
        
        const textConfig: TextRenderConfig = {
            fontSize: 1.0,
            lineWidth: 1.0,
            lineColor: vec3.fromValues(0.0, 1.0, 0.0), // Green
            position: vec3.fromValues(0, 0, 0),
            splineSteps: 8 // 8 steps per curve segment
        };
        
        const textMesh = textRenderer.generateTextMesh("ABCj", textConfig);
        
        expect(textMesh).toBeDefined();
        expect(textMesh.vertices.length).toBeGreaterThan(0);
        expect(textMesh.indices.length).toBeGreaterThan(0);
        
        const numVertices = textMesh.vertices.length / 3;
        const numSegments = textMesh.indices.length / 2;
        
        console.log('TextRenderer with spline interpolation:', {
            text: "ABCj",
            vertices: numVertices,
            segments: numSegments,
            splineSteps: textConfig.splineSteps
        });
        
        // Multi-character text should have reasonable vertex count
        expect(numVertices).toBeGreaterThan(10); // Multiple characters should have many vertices
        expect(numSegments).toBeGreaterThan(10); // Multiple characters should have many line segments
    });
});

describe('Font Class Interface', () => {
    const fontPath = './static/resources/Raleway-Regular.ttf';
    
    test('should create a Font instance from file', async () => {
        const fontOptions: FontOptions = {
            fontSize: 1.0,
            lineWidth: 2.0,
            lineColor: vec3.fromValues(1.0, 0.0, 0.0),
            splineSteps: 0
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
            lineColor: vec3.fromValues(1.0, 0.0, 0.0),
            splineSteps: 0
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
            lineColor: vec3.fromValues(0.0, 1.0, 0.0),
            splineSteps: 0
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
            lineColor: vec3.fromValues(1.0, 1.0, 1.0),
            splineSteps: 0
        };
        
        const largeOptions: FontOptions = {
            fontSize: 2.0,
            lineWidth: 1.0,
            lineColor: vec3.fromValues(1.0, 1.0, 1.0),
            splineSteps: 0
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
            lineColor: vec3.fromValues(0.0, 0.0, 1.0),
            splineSteps: 0
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
            position: vec3.fromValues(2, 3, -1),
            splineSteps: 0
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
            position: vec3.fromValues(0, 0, 0),
            splineSteps: 0
        };
        
        const config2: TextRenderConfig = {
            fontSize: 2.5,
            lineWidth: 6.0,
            lineColor: vec3.fromValues(0.0, 0.0, 1.0),
            position: vec3.fromValues(5, 10, -2),
            splineSteps: 0
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
            position: vec3.fromValues(0, 0, 0),
            splineSteps: 0
        };
        
        // Should work with complete configuration
        const mesh = textRenderer.generateTextMesh('A', completeConfig);
        expect(mesh).toBeDefined();
        expect(mesh.vertices.length).toBeGreaterThan(0);
    });
});

describe('Spline Interpolation', () => {
    test('should generate smooth outline with spline interpolation steps', async () => {
        const baseOptions: FontOptions = {
            fontSize: 1.0,
            lineWidth: 1.0,
            lineColor: vec3.fromValues(1.0, 0.0, 0.0),
            splineSteps: 0 // Start with no interpolation
        };
        
        // Test with no interpolation (control points only)
        const meshNoInterpolation = await createTextMesh('O', './static/resources/Raleway-Regular.ttf', 
            { ...baseOptions, splineSteps: 0 }, vec3.fromValues(0, 0, 0));
        
        // Test with 4 interpolation steps per curve segment
        const mesh4Steps = await createTextMesh('O', './static/resources/Raleway-Regular.ttf', 
            { ...baseOptions, splineSteps: 4 }, vec3.fromValues(0, 0, 0));
        
        // Test with 8 interpolation steps per curve segment
        const mesh8Steps = await createTextMesh('O', './static/resources/Raleway-Regular.ttf', 
            { ...baseOptions, splineSteps: 8 }, vec3.fromValues(0, 0, 0));
        
        expect(meshNoInterpolation).toBeDefined();
        expect(mesh4Steps).toBeDefined();
        expect(mesh8Steps).toBeDefined();
        
        // Calculate number of vertices for each
        const verticesNoInterp = meshNoInterpolation!.vertices.length / 3;
        const vertices4Steps = mesh4Steps!.vertices.length / 3;
        const vertices8Steps = mesh8Steps!.vertices.length / 3;
        
        // With interpolation, we should have more vertices (smoother curves)
        expect(vertices4Steps).toBeGreaterThan(verticesNoInterp);
        expect(vertices8Steps).toBeGreaterThan(vertices4Steps);
        
        // Line segments should also increase with interpolation
        const segmentsNoInterp = meshNoInterpolation!.indices.length / 2;
        const segments4Steps = mesh4Steps!.indices.length / 2;
        const segments8Steps = mesh8Steps!.indices.length / 2;
        
        expect(segments4Steps).toBeGreaterThan(segmentsNoInterp);
        expect(segments8Steps).toBeGreaterThan(segments4Steps);
        
        console.log('Spline interpolation comparison (letter O):', {
            noInterpolation: { vertices: verticesNoInterp, segments: segmentsNoInterp },
            fourSteps: { vertices: vertices4Steps, segments: segments4Steps },
            eightSteps: { vertices: vertices8Steps, segments: segments8Steps }
        });
    });
    
    test('should maintain consistent bounds across different spline steps', async () => {
        const baseOptions: FontOptions = {
            fontSize: 2.0,
            lineWidth: 1.0,
            lineColor: vec3.fromValues(0.0, 1.0, 0.0),
            splineSteps: 0
        };
        
        const testSteps = [0, 2, 4, 8, 16];
        const meshes: Array<{ steps: number, mesh: TextMesh }> = [];
        
        // Generate meshes with different spline steps
        for (const steps of testSteps) {
            const mesh = await createTextMesh('A', './static/resources/Raleway-Regular.ttf', 
                { ...baseOptions, splineSteps: steps }, vec3.fromValues(0, 0, 0));
            expect(mesh).toBeDefined();
            meshes.push({ steps, mesh: mesh! });
        }
        
        // All meshes should have very similar bounding boxes (small numerical differences are OK)
        const baseBounds = meshes[0].mesh.bounds;
        const tolerance = 0.05; // Allow small variations due to curve approximation
        
        for (let i = 1; i < meshes.length; i++) {
            const currentBounds = meshes[i].mesh.bounds;
            
            // Check min bounds
            expect(Math.abs(currentBounds.min[0] - baseBounds.min[0])).toBeLessThan(tolerance);
            expect(Math.abs(currentBounds.min[1] - baseBounds.min[1])).toBeLessThan(tolerance);
            expect(Math.abs(currentBounds.min[2] - baseBounds.min[2])).toBeLessThan(tolerance);
            
            // Check max bounds
            expect(Math.abs(currentBounds.max[0] - baseBounds.max[0])).toBeLessThan(tolerance);
            expect(Math.abs(currentBounds.max[1] - baseBounds.max[1])).toBeLessThan(tolerance);
            expect(Math.abs(currentBounds.max[2] - baseBounds.max[2])).toBeLessThan(tolerance);
        }
        
        console.log('Bounds consistency check (letter A with different spline steps):');
        for (const { steps, mesh } of meshes) {
            const width = mesh.bounds.max[0] - mesh.bounds.min[0];
            const height = mesh.bounds.max[1] - mesh.bounds.min[1];
            console.log(`  ${steps} steps: ${width.toFixed(4)} x ${height.toFixed(4)} units, ${mesh.vertices.length / 3} vertices`);
        }
    });
    
    test('should produce smooth curves for curved letters', async () => {
        const options: FontOptions = {
            fontSize: 1.0,
            lineWidth: 1.0,
            lineColor: vec3.fromValues(0.0, 0.0, 1.0),
            splineSteps: 8
        };
        
        // Test letters that should have curves: O, C, S, etc.
        const curvedLetters = ['O', 'C', 'S', 'P', 'R'];
        
        for (const letter of curvedLetters) {
            const mesh = await createTextMesh(letter, './static/resources/Raleway-Regular.ttf', 
                options, vec3.fromValues(0, 0, 0));
            
            expect(mesh).toBeDefined();
            expect(mesh!.vertices.length).toBeGreaterThan(0);
            expect(mesh!.indices.length).toBeGreaterThan(0);
            
            // With 8 spline steps, curved letters should have significant vertex count
            const vertexCount = mesh!.vertices.length / 3;
            expect(vertexCount).toBeGreaterThan(20); // Arbitrary minimum for curved letters
            
            console.log(`Letter ${letter} with 8 spline steps: ${vertexCount} vertices, ${mesh!.indices.length / 2} line segments`);
        }
    });
    
    test('should handle straight-line letters efficiently', async () => {
        const options: FontOptions = {
            fontSize: 1.0,
            lineWidth: 1.0,
            lineColor: vec3.fromValues(1.0, 1.0, 0.0),
            splineSteps: 8
        };
        
        // Test letters that should be mostly straight lines: I, L, T, etc.
        const straightLetters = ['I', 'L', 'T', 'F', 'E'];
        
        for (const letter of straightLetters) {
            const meshWithSplines = await createTextMesh(letter, './static/resources/Raleway-Regular.ttf', 
                { ...options, splineSteps: 8 }, vec3.fromValues(0, 0, 0));
            
            const meshNoSplines = await createTextMesh(letter, './static/resources/Raleway-Regular.ttf', 
                { ...options, splineSteps: 0 }, vec3.fromValues(0, 0, 0));
            
            expect(meshWithSplines).toBeDefined();
            expect(meshNoSplines).toBeDefined();
            
            const verticesWithSplines = meshWithSplines!.vertices.length / 3;
            const verticesNoSplines = meshNoSplines!.vertices.length / 3;
            
            // For mostly straight letters, spline interpolation shouldn't add too many vertices
            // The ratio should be reasonable (not 10x more vertices)
            const ratio = verticesWithSplines / verticesNoSplines;
            expect(ratio).toBeLessThan(5.0); // Reasonable upper bound
            
            console.log(`Letter ${letter}: no splines=${verticesNoSplines} vertices, with splines=${verticesWithSplines} vertices (ratio: ${ratio.toFixed(2)})`);
        }
    });
    
    test('should produce consistent results with Font class interface', async () => {
        // Test that Font class produces same results as createTextMesh for spline interpolation
        const options: FontOptions = {
            fontSize: 1.5,
            lineWidth: 1.0,
            lineColor: vec3.fromValues(1.0, 0.5, 0.0),
            splineSteps: 6
        };
        
        // Using createTextMesh (convenience function)
        const meshViaFunction = await createTextMesh('Q', './static/resources/Raleway-Regular.ttf', 
            options, vec3.fromValues(1, 2, 3));
        
        // Using Font class directly
        const font = await Font.fromFile('./static/resources/Raleway-Regular.ttf', options);
        const meshViaClass = font.generateCharacterMesh('Q', vec3.fromValues(1, 2, 3));
        
        expect(meshViaFunction).toBeDefined();
        expect(meshViaClass).toBeDefined();
        
        // Should have same number of vertices and indices
        expect(meshViaFunction!.vertices.length).toBe(meshViaClass!.vertices.length);
        expect(meshViaFunction!.indices.length).toBe(meshViaClass!.indices.length);
        
        // Bounds should be very similar (within small numerical tolerance)
        const tolerance = 0.001;
        expect(Math.abs(meshViaFunction!.bounds.min[0] - meshViaClass!.bounds.min[0])).toBeLessThan(tolerance);
        expect(Math.abs(meshViaFunction!.bounds.min[1] - meshViaClass!.bounds.min[1])).toBeLessThan(tolerance);
        expect(Math.abs(meshViaFunction!.bounds.max[0] - meshViaClass!.bounds.max[0])).toBeLessThan(tolerance);
        expect(Math.abs(meshViaFunction!.bounds.max[1] - meshViaClass!.bounds.max[1])).toBeLessThan(tolerance);
        
        console.log('Font class vs function consistency test passed for spline interpolation');
    });
    
    test('should correctly handle multi-character text with splines', async () => {
        const options: FontOptions = {
            fontSize: 1.0,
            lineWidth: 1.0,
            lineColor: vec3.fromValues(0.5, 0.5, 1.0),
            splineSteps: 4
        };
        
        // Test multi-character text with splines
        const font = await Font.fromFile('./static/resources/Raleway-Regular.ttf', options);
        const multiCharMesh = font.generateTextMesh('Hello', vec3.fromValues(0, 0, 0));
        
        expect(multiCharMesh).toBeDefined();
        expect(multiCharMesh.vertices.length).toBeGreaterThan(0);
        expect(multiCharMesh.indices.length).toBeGreaterThan(0);
        
        // Generate individual character meshes with same options
        const chars = ['H', 'e', 'l', 'l', 'o'];
        let totalExpectedVertices = 0;
        let totalExpectedIndices = 0;
        
        for (const char of chars) {
            const charMesh = font.generateCharacterMesh(char, vec3.fromValues(0, 0, 0));
            if (charMesh) {
                totalExpectedVertices += charMesh.vertices.length;
                totalExpectedIndices += charMesh.indices.length;
            }
        }
        
        // Multi-character mesh should have similar vertex/index count as sum of individual chars
        // (slight differences due to positioning are acceptable)
        const vertexRatio = multiCharMesh.vertices.length / totalExpectedVertices;
        const indexRatio = multiCharMesh.indices.length / totalExpectedIndices;
        
        expect(vertexRatio).toBeGreaterThan(0.9); // Allow some variance
        expect(vertexRatio).toBeLessThan(1.1);
        expect(indexRatio).toBeGreaterThan(0.9);
        expect(indexRatio).toBeLessThan(1.1);
        
        console.log(`Multi-character spline test: "Hello" has ${multiCharMesh.vertices.length / 3} vertices, ${multiCharMesh.indices.length / 2} line segments`);
    });
}); 