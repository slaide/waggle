/**
 * Text Rendering System for Waggle WebGL2 Framework
 * 
 * This module provides a text rendering system with smooth contour generation:
 * 
 * ### FontOptions
 * Configuration for font rendering:
 * - `fontSize`: Font size in world units
 * - `lineWidth`: Line width for wireframe rendering (pixels) - NOTE: Most browsers only support 1.0
 * - `lineColor`: RGB color for lines (vec3)
 * - `splineSteps`: Number of interpolation steps per curve segment (default: 0 = no interpolation, just control points)
 * 
 * ### Font Class
 * Main class for text rendering:
 * - `Font.fromFile(fontPath, options)`: Create font from TTF file
 * - `font.generateCharacterMesh(char, position)`: Generate single character
 * - `font.generateTextMesh(text, position)`: Generate multi-character text
 * 
 * ### Usage Example
 * ```typescript
 * const fontOptions: FontOptions = {
 *     fontSize: 1.0,
 *     lineWidth: 3.0,
 *     lineColor: vec3.fromValues(1.0, 0.0, 0.0), // Red
 *     splineSteps: 8 // 8 steps per curve segment for smooth outlines
 * };
 * 
 * const font = await Font.fromFile('./static/resources/Raleway-Regular.ttf', fontOptions);
 * const textMesh = font.generateTextMesh('ABC', vec3.fromValues(0, 0, -1));
 * ```
 * 
 * ### Position Specification
 * The position parameter specifies the lower-left corner of the first character.
 * Characters are spaced automatically using simple character spacing (fontSize * 0.7).
 */

import { vec3 } from "gl-matrix";
import { 
    TTFFont, 
    parseTTF, 
    parseHeadTable, 
    getGlyphId, 
    parseGlyphOutline, 
    GlyphOutline, 
    GlyphContour 
} from "./bits/ttf";

/**
 * 3D point for text rendering
 */
export interface TextPoint {
    /** 3D position vector */
    position: vec3;
}

/**
 * Bounding box type
 */
export interface BoundingBox {
    /** Minimum corner of bounding box */
    min: vec3;
    /** Maximum corner of bounding box */
    max: vec3;
}

/**
 * Text mesh data for wireframe rendering
 */
export interface TextMesh {
    /** Vertex positions as flat array (x,y,z,x,y,z,...) */
    vertices: Float32Array;
    /** Line indices for wireframe rendering */
    indices: Uint32Array;
    /** Bounding box of the text mesh */
    bounds: BoundingBox;
    /** Advance width for this character/text in world units */
    advanceWidth: number;
}

/**
 * Font rendering options
 */
export interface FontOptions {
    /** Font size in world units */
    fontSize: number;
    /** Line width for wireframe rendering - NOTE: Most browsers only support 1.0 */
    lineWidth: number;
    /** RGB color for lines */
    lineColor: vec3;
    /** Number of interpolation steps per curve segment (0 = no interpolation, just control points) */
    splineSteps: number;
}

/**
 * Utility class for geometric operations used in text rendering
 */
class GeometryUtils {
    /**
     * Interpolate a quadratic Bézier curve point
     */
    static quadraticBezier(p0: [number, number], p1: [number, number], p2: [number, number], t: number): [number, number] {
        const oneMinusT = 1 - t;
        const x = oneMinusT * oneMinusT * p0[0] + 2 * oneMinusT * t * p1[0] + t * t * p2[0];
        const y = oneMinusT * oneMinusT * p0[1] + 2 * oneMinusT * t * p1[1] + t * t * p2[1];
        return [x, y];
    }
}

/**
 * Curve interpolation utility for smooth text rendering
 */
class CurveGenerator {
    /**
     * Generate smooth curve points from TrueType glyph contour following TrueType specification
     */
    static generateSmoothContour(contour: GlyphContour, splineSteps: number): [number, number][] {
        if (splineSteps === 0 || contour.points.length === 0) {
            // No interpolation - just return original points
            return contour.points.map(p => [p.x, p.y] as [number, number]);
        }

        const smoothPoints: [number, number][] = [];
        const points = contour.points;
        
        if (points.length === 0) {
            return smoothPoints;
        }

        // TrueType specification implementation:
        // 1. Create a list of curve segments where each segment has exactly one off-curve control point
        // 2. Implied on-curve points are created between consecutive off-curve points
        // 3. Each segment is interpolated as a quadratic Bézier curve
        
        const segments = this.createCurveSegments(points);
        
        // Now interpolate all segments
        for (let segIndex = 0; segIndex < segments.length; segIndex++) {
            const segment = segments[segIndex];
            
            // Add start point (avoid duplicates by checking if it's already the last added point)
            const lastPoint = smoothPoints[smoothPoints.length - 1];
            if (!lastPoint || lastPoint[0] !== segment.start.x || lastPoint[1] !== segment.start.y) {
                smoothPoints.push([segment.start.x, segment.start.y]);
            }
            
            if (segment.control) {
                // Curve segment - interpolate
                const p0: [number, number] = [segment.start.x, segment.start.y];
                const p1: [number, number] = [segment.control.x, segment.control.y];
                const p2: [number, number] = [segment.end.x, segment.end.y];
                
                // Generate interpolated points (skip t=0 and t=1 to avoid duplicates)
                for (let step = 1; step < splineSteps; step++) {
                    const t = step / splineSteps;
                    const interpolated = GeometryUtils.quadraticBezier(p0, p1, p2, t);
                    smoothPoints.push(interpolated);
                }
            }
            
            // Add end point for the last segment or if it's not the start of the next segment
            if (segIndex === segments.length - 1) {
                const endPoint = [segment.end.x, segment.end.y] as [number, number];
                const lastAdded = smoothPoints[smoothPoints.length - 1];
                if (!lastAdded || lastAdded[0] !== endPoint[0] || lastAdded[1] !== endPoint[1]) {
                    smoothPoints.push(endPoint);
                }
            }
        }

        return smoothPoints;
    }

    /**
     * Create curve segments from TrueType points
     */
    private static createCurveSegments(points: Array<{x: number, y: number, onCurve: boolean}>) {
        const segments: Array<{
            start: { x: number, y: number },
            control: { x: number, y: number } | null,
            end: { x: number, y: number }
        }> = [];
        
        let i = 0;
        while (i < points.length) {
            const currentPoint = points[i];
            
            if (currentPoint.onCurve) {
                // Start a new segment from this on-curve point
                const nextIndex = (i + 1) % points.length;
                const nextPoint = points[nextIndex];
                
                if (nextPoint.onCurve) {
                    // Straight line segment: on-curve -> on-curve
                    segments.push({
                        start: { x: currentPoint.x, y: currentPoint.y },
                        control: null,
                        end: { x: nextPoint.x, y: nextPoint.y }
                    });
                    i++;
                } else {
                    // Curve segment: on-curve -> off-curve -> ...
                    const controlPoint = nextPoint;
                    
                    // Find the end point for this curve
                    let endIndex = (i + 2) % points.length;
                    let endPoint;
                    
                    if (points[endIndex].onCurve) {
                        // Simple case: on-curve -> off-curve -> on-curve
                        endPoint = points[endIndex];
                        i += 2; // Skip the control point and move to end point
                    } else {
                        // Implied on-curve point between consecutive off-curve points
                        const nextOffCurve = points[endIndex];
                        endPoint = {
                            x: (controlPoint.x + nextOffCurve.x) / 2,
                            y: (controlPoint.y + nextOffCurve.y) / 2,
                            onCurve: true
                        };
                        i++; // Move to the control point (next iteration will process the off-curve point)
                    }
                    
                    segments.push({
                        start: { x: currentPoint.x, y: currentPoint.y },
                        control: { x: controlPoint.x, y: controlPoint.y },
                        end: { x: endPoint.x, y: endPoint.y }
                    });
                }
            } else {
                // Handle off-curve points at the start or in sequence
                const prevIndex = (i - 1 + points.length) % points.length;
                const prevPoint = points[prevIndex];
                
                if (!prevPoint.onCurve) {
                    // Create implied on-curve point
                    const impliedStart = {
                        x: (prevPoint.x + currentPoint.x) / 2,
                        y: (prevPoint.y + currentPoint.y) / 2,
                        onCurve: true
                    };
                    
                    // Find end point
                    const nextIndex = (i + 1) % points.length;
                    const nextPoint = points[nextIndex];
                    let endPoint;
                    
                    if (nextPoint.onCurve) {
                        endPoint = nextPoint;
                    } else {
                        // Another implied point
                        endPoint = {
                            x: (currentPoint.x + nextPoint.x) / 2,
                            y: (currentPoint.y + nextPoint.y) / 2,
                            onCurve: true
                        };
                    }
                    
                    segments.push({
                        start: impliedStart,
                        control: { x: currentPoint.x, y: currentPoint.y },
                        end: endPoint
                    });
                }
                
                i++;
            }
        }
        
        return segments;
    }
}

/**
 * Font class for text rendering
 */
export class Font {
    private ttfFont: TTFFont;
    private unitsPerEm: number;
    public options: FontOptions;

    constructor(ttfFont: TTFFont, options: FontOptions) {
        this.ttfFont = ttfFont;
        this.options = { ...options }; // Clone options
        
        // Get font metrics
        const headTable = parseHeadTable(ttfFont);
        if (!headTable) {
            throw new Error('Could not parse font head table');
        }
        this.unitsPerEm = headTable.unitsPerEm;
    }

    /**
     * Create a Font instance from a font file
     */
    static async fromFile(fontPath: string, options: FontOptions): Promise<Font> {
        const ttfFont = await parseTTF(fontPath);
        return new Font(ttfFont, options);
    }

    /**
     * Convert font units to world units
     */
    private fontUnitsToWorld(fontUnits: number): number {
        return (fontUnits / this.unitsPerEm) * this.options.fontSize;
    }

    /**
     * Get the advance width for a character in world units
     */
    private getCharacterAdvanceWidth(character: string): number {
        // Handle space character specially
        if (character === ' ') {
            // For space, use a typical space width (roughly 1/4 of font size)
            return this.options.fontSize * 0.25;
        }

        // Get character code and glyph ID
        const charCode = character.charCodeAt(0);
        const glyphId = getGlyphId(this.ttfFont, charCode);
        if (glyphId === 0) {
            // Character not found, use default spacing
            return this.options.fontSize * 0.5;
        }
        
        // Parse glyph outline to get advance width
        const outline = parseGlyphOutline(this.ttfFont, glyphId);
        if (!outline) {
            // Could not parse outline, use default spacing
            return this.options.fontSize * 0.5;
        }

        // Convert font units to world units
        return this.fontUnitsToWorld(outline.advanceWidth);
    }

    /**
     * Generate a mesh for a single character
     */
    generateCharacterMesh(character: string, position: vec3): TextMesh | null {
        // Get advance width for this character
        const advanceWidth = this.getCharacterAdvanceWidth(character);

        // Handle space character specially - it has no visible geometry
        if (character === ' ') {
            return this.createEmptyMesh(position, advanceWidth);
        }

        // Get character code and glyph ID
        const charCode = character.charCodeAt(0);
        const glyphId = getGlyphId(this.ttfFont, charCode);
        if (glyphId === 0) {
            console.warn(`Character '${character}' not found in font`);
            return null;
        }
        
        // Parse glyph outline
        const outline = parseGlyphOutline(this.ttfFont, glyphId);
        if (!outline) {
            console.warn(`Could not parse outline for character '${character}'`);
            return null;
        }

        // Generate wireframe mesh from outline
        const vertices: number[] = [];
        const indices: number[] = [];
        let vertexIndex = 0;
        
        const bounds = this.createBounds();

        for (const contour of outline.contours) {
            const contourStartIndex = vertexIndex;
            
            // Generate smooth contour points
            const smoothPoints = CurveGenerator.generateSmoothContour(contour, this.options.splineSteps);
            
            // Add all points as vertices
            for (const [pointX, pointY] of smoothPoints) {
                const [finalX, finalY, finalZ] = this.transformPoint(pointX, pointY, position);
                vertices.push(finalX, finalY, finalZ);
                this.updateBoundsWithPoint(bounds, finalX, finalY, finalZ);
                vertexIndex++;
            }
            
            // Connect consecutive points with lines
            for (let i = 0; i < smoothPoints.length; i++) {
                const currentIndex = contourStartIndex + i;
                const nextIndex = contourStartIndex + ((i + 1) % smoothPoints.length);
                indices.push(currentIndex, nextIndex);
            }
        }

        return {
            vertices: new Float32Array(vertices),
            indices: new Uint32Array(indices),
            bounds,
            advanceWidth
        };
    }

    /**
     * Generate a mesh for a text string
     */
    generateTextMesh(text: string, position: vec3): TextMesh {
        const allVertices: number[] = [];
        const allIndices: number[] = [];
        let vertexOffset = 0;
        
        const bounds = {
            min: vec3.fromValues(Infinity, Infinity, Infinity),
            max: vec3.fromValues(-Infinity, -Infinity, -Infinity)
        };

        let currentX = position[0];
        const baseY = position[1];
        const baseZ = position[2];
        let totalAdvanceWidth = 0;

        // Process each character
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const charPosition = vec3.fromValues(currentX, baseY, baseZ);
            
            const charMesh = this.generateCharacterMesh(char, charPosition);
            if (charMesh) {
                // Add vertices
                for (let j = 0; j < charMesh.vertices.length; j++) {
                    allVertices.push(charMesh.vertices[j]);
                }
                
                // Add indices with offset
                for (let j = 0; j < charMesh.indices.length; j++) {
                    allIndices.push(charMesh.indices[j] + vertexOffset);
                }
                
                vertexOffset += charMesh.vertices.length / 3;
                
                // Update bounds
                this.updateBounds(bounds, charMesh.bounds);
                
                // Advance position using proper character advance width
                currentX += charMesh.advanceWidth;
                totalAdvanceWidth += charMesh.advanceWidth;
            } else {
                // If character mesh generation failed, use fallback advance width
                const fallbackAdvance = this.getCharacterAdvanceWidth(char);
                currentX += fallbackAdvance;
                totalAdvanceWidth += fallbackAdvance;
            }
        }

        return {
            vertices: new Float32Array(allVertices),
            indices: new Uint32Array(allIndices),
            bounds,
            advanceWidth: totalAdvanceWidth
        };
    }

    /**
     * Transform a point from font units to world coordinates
     */
    private transformPoint(fontX: number, fontY: number, position: vec3): [number, number, number] {
        const worldX = this.fontUnitsToWorld(fontX);
        const worldY = this.fontUnitsToWorld(fontY);
        
        return [
            position[0] + worldX,
            position[1] + worldY,
            position[2]
        ];
    }

    /**
     * Create an empty mesh for characters like spaces
     */
    private createEmptyMesh(position: vec3, advanceWidth: number): TextMesh {
        return {
            vertices: new Float32Array([]),
            indices: new Uint32Array([]),
            bounds: {
                min: vec3.fromValues(position[0], position[1], position[2]),
                max: vec3.fromValues(position[0], position[1], position[2])
            },
            advanceWidth
        };
    }

    /**
     * Create initial bounds object
     */
    private createBounds(): BoundingBox {
        return {
            min: vec3.fromValues(Infinity, Infinity, Infinity),
            max: vec3.fromValues(-Infinity, -Infinity, -Infinity)
        };
    }

    /**
     * Update bounds with a single point
     */
    private updateBoundsWithPoint(bounds: BoundingBox, x: number, y: number, z: number): void {
        bounds.min[0] = Math.min(bounds.min[0], x);
        bounds.min[1] = Math.min(bounds.min[1], y);
        bounds.min[2] = Math.min(bounds.min[2], z);
        bounds.max[0] = Math.max(bounds.max[0], x);
        bounds.max[1] = Math.max(bounds.max[1], y);
        bounds.max[2] = Math.max(bounds.max[2], z);
    }

    /**
     * Update bounds with another bounds object
     */
    private updateBounds(bounds: BoundingBox, otherBounds: BoundingBox): void {
        bounds.min[0] = Math.min(bounds.min[0], otherBounds.min[0]);
        bounds.min[1] = Math.min(bounds.min[1], otherBounds.min[1]);
        bounds.min[2] = Math.min(bounds.min[2], otherBounds.min[2]);
        bounds.max[0] = Math.max(bounds.max[0], otherBounds.max[0]);
        bounds.max[1] = Math.max(bounds.max[1], otherBounds.max[1]);
        bounds.max[2] = Math.max(bounds.max[2], otherBounds.max[2]);
    }
}

/**
 * Configuration for text mesh generation (used by convenience functions)
 */
export interface TextConfig {
    fontSize: number;
    position: vec3;
    scale: vec3;
}

/**
 * Convenience function to create a text mesh from a font file path
 * @param text - Text string to render
 * @param fontPath - Path to TTF font file
 * @param fontOptions - Font rendering options
 * @param position - Position for the text
 * @returns Promise<TextMesh | null> - Generated text mesh or null if failed
 */
export async function createTextMesh(
    text: string, 
    fontPath: string, 
    fontOptions: FontOptions, 
    position: vec3
): Promise<TextMesh | null> {
    try {
        const font = await Font.fromFile(fontPath, fontOptions);
        if (text.length === 1) {
            return font.generateCharacterMesh(text, position);
        } else {
            return font.generateTextMesh(text, position);
        }
    } catch (error) {
        console.error(`Failed to create text mesh: ${error}`);
        return null;
    }
}

/**
 * Convenience function to generate text mesh from a parsed TTF font
 * @param ttfFont - Parsed TTF font structure
 * @param text - Text string to render
 * @param config - Text configuration
 * @returns Promise<TextMesh | null> - Generated text mesh or null if failed
 */
export async function generateTextMesh(
    ttfFont: any,
    text: string,
    config: TextConfig
): Promise<TextMesh | null> {
    try {
        const fontOptions: FontOptions = {
            fontSize: config.fontSize,
            lineWidth: 1.0,
            lineColor: vec3.fromValues(1.0, 1.0, 1.0),
            splineSteps: 0
        };
        
        const font = new Font(ttfFont, fontOptions);
        if (text.length === 1) {
            return font.generateCharacterMesh(text, config.position);
        } else {
            return font.generateTextMesh(text, config.position);
        }
    } catch (error) {
        console.error(`Failed to generate text mesh: ${error}`);
        return null;
    }
}