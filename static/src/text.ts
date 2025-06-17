/**
 * Text Rendering System for Waggle WebGL2 Framework
 * 
 * This module provides a comprehensive text rendering system with two interfaces:
 * 
 * ## New Font Class Interface (Recommended)
 * 
 * ### FontOptions
 * Extensible configuration for font rendering:
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
 * **Note**: Current implementation supports both wireframe rendering with control points only (splineSteps=0)
 * and smooth outline rendering with configurable spline interpolation (splineSteps>0).
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
 * 
 * ## Legacy Interface (Backward Compatibility)
 * The old `generateTextMesh()` and related functions are still available for compatibility.
 * 
 * ## Integration with Rendering System
 * Use `createWireframeTextModelFromFont()` in `textmesh.ts` to create Model objects
 * that integrate with the Waggle rendering pipeline.
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
 * Text mesh data for wireframe rendering
 */
export interface TextMesh {
    /** Vertex positions as flat array (x,y,z,x,y,z,...) */
    vertices: Float32Array;
    /** Line indices connecting vertices for wireframe rendering */
    indices: Uint32Array;
    /** Bounding box of the text mesh */
    bounds: {
        /** Minimum corner of bounding box */
        min: vec3;
        /** Maximum corner of bounding box */
        max: vec3;
    };
}

/**
 * Font rendering options (extensible for future features)
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
 * Interpolate a quadratic Bézier curve point
 * @param p0 - Start point (x, y)
 * @param p1 - Control point (x, y)
 * @param p2 - End point (x, y)
 * @param t - Parameter from 0 to 1
 * @returns Interpolated point [x, y]
 */
function quadraticBezier(p0: [number, number], p1: [number, number], p2: [number, number], t: number): [number, number] {
    const oneMinusT = 1 - t;
    const x = oneMinusT * oneMinusT * p0[0] + 2 * oneMinusT * t * p1[0] + t * t * p2[0];
    const y = oneMinusT * oneMinusT * p0[1] + 2 * oneMinusT * t * p1[1] + t * t * p2[1];
    return [x, y];
}

/**
 * Generate smooth curve points from TrueType glyph contour following TrueType specification
 * @param contour - Glyph contour with on-curve and off-curve points
 * @param splineSteps - Number of interpolation steps per curve segment (0 = no interpolation)
 * @returns Array of interpolated points as [x, y] coordinates
 */
function generateSmoothContour(contour: GlyphContour, splineSteps: number): [number, number][] {
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
    
    const segments: Array<{
        start: { x: number, y: number },
        control: { x: number, y: number } | null,
        end: { x: number, y: number }
    }> = [];
    
    // Process points to create segments following TrueType rules
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
            // This off-curve point should have been handled in the previous iteration
            // or it's the start of a sequence of off-curve points
            
            // If we start with an off-curve point, we need to find the first on-curve point
            // and create an implied start point
            let firstOnCurveIndex = -1;
            for (let j = 0; j < points.length; j++) {
                if (points[j].onCurve) {
                    firstOnCurveIndex = j;
                    break;
                }
            }
            
            if (firstOnCurveIndex === -1) {
                // No on-curve points at all - just return original points
                return points.map(p => [p.x, p.y] as [number, number]);
            }
            
            // Find previous off-curve point to create implied start
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
                const interpolated = quadraticBezier(p0, p1, p2, t);
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
     * @param fontPath - Path to TTF font file
     * @param options - Font rendering options
     * @returns Promise<Font>
     */
    static async fromFile(fontPath: string, options: FontOptions): Promise<Font> {
        const ttfFont = await parseTTF(fontPath);
        return new Font(ttfFont, options);
    }

    /**
     * Convert font units to world units
     * @param fontUnits - Value in font units
     * @returns Value in world units
     */
    private fontUnitsToWorld(fontUnits: number): number {
        return (fontUnits / this.unitsPerEm) * this.options.fontSize;
    }

    /**
     * Generate a wireframe mesh for a single character
     * @param character - Character to render
     * @param position - Position where the character should be placed (lower-left corner)
     * @returns TextMesh or null if character not found
     */
    generateCharacterMesh(character: string, position: vec3): TextMesh | null {
        // Get character code
        const charCode = character.charCodeAt(0);
        
        // Find glyph ID
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

        return this.generateGlyphWireframeMesh(outline, position);
    }

    /**
     * Generate a wireframe mesh for a text string
     * @param text - Text string to render
     * @param position - Position where the text should start (lower-left corner of first character)
     * @returns TextMesh with all characters combined
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
                bounds.min[0] = Math.min(bounds.min[0], charMesh.bounds.min[0]);
                bounds.min[1] = Math.min(bounds.min[1], charMesh.bounds.min[1]);
                bounds.min[2] = Math.min(bounds.min[2], charMesh.bounds.min[2]);
                bounds.max[0] = Math.max(bounds.max[0], charMesh.bounds.max[0]);
                bounds.max[1] = Math.max(bounds.max[1], charMesh.bounds.max[1]);
                bounds.max[2] = Math.max(bounds.max[2], charMesh.bounds.max[2]);
            }
            
            // Advance position for next character (simple spacing)
            currentX += this.options.fontSize * 0.7;
        }

        return {
            vertices: new Float32Array(allVertices),
            indices: new Uint32Array(allIndices),
            bounds
        };
    }

    /**
     * Generate a wireframe mesh from a glyph outline with optional spline interpolation
     * @param outline - Glyph outline data
     * @param position - Base position for the glyph
     * @returns Text mesh with vertices and line indices
     */
    private generateGlyphWireframeMesh(outline: GlyphOutline, position: vec3): TextMesh {
        const vertices: number[] = [];
        const indices: number[] = [];
        
        let vertexIndex = 0;
        const bounds = {
            min: vec3.fromValues(Infinity, Infinity, Infinity),
            max: vec3.fromValues(-Infinity, -Infinity, -Infinity)
        };

        // Process each contour
        for (const contour of outline.contours) {
            const contourStartIndex = vertexIndex;
            
            // Generate smooth contour points based on splineSteps setting
            const smoothPoints = generateSmoothContour(contour, this.options.splineSteps);
            
            // Add all points in the smooth contour as vertices
            for (const [pointX, pointY] of smoothPoints) {
                // Convert font units to world coordinates
                const worldX = this.fontUnitsToWorld(pointX);
                const worldY = this.fontUnitsToWorld(pointY);
                
                // Apply position
                const finalX = position[0] + worldX;
                const finalY = position[1] + worldY;
                const finalZ = position[2]; // Keep text flat for now
                
                vertices.push(finalX, finalY, finalZ);
                
                // Update bounds
                bounds.min[0] = Math.min(bounds.min[0], finalX);
                bounds.min[1] = Math.min(bounds.min[1], finalY);
                bounds.min[2] = Math.min(bounds.min[2], finalZ);
                bounds.max[0] = Math.max(bounds.max[0], finalX);
                bounds.max[1] = Math.max(bounds.max[1], finalY);
                bounds.max[2] = Math.max(bounds.max[2], finalZ);
                
                vertexIndex++;
            }
            
            // Connect consecutive points in the contour with lines
            for (let i = 0; i < smoothPoints.length; i++) {
                const currentIndex = contourStartIndex + i;
                const nextIndex = contourStartIndex + ((i + 1) % smoothPoints.length); // Wrap around to close contour
                
                // Add line segment
                indices.push(currentIndex, nextIndex);
            }
        }

        return {
            vertices: new Float32Array(vertices),
            indices: new Uint32Array(indices),
            bounds
        };
    }
}

/**
 * Text rendering configuration (legacy - kept for backward compatibility)
 */
export interface TextConfig {
    /** Font size in world units */
    fontSize: number;
    /** Base position in 3D space */
    position: vec3;
    /** Additional scaling factor */
    scale: vec3;
}

/**
 * Convert TTF font units to world units (legacy function)
 * @param fontUnits - Value in font units
 * @param unitsPerEm - Units per EM from font
 * @param fontSize - Desired font size in world units
 * @returns Value in world units
 */
function fontUnitsToWorld(fontUnits: number, unitsPerEm: number, fontSize: number): number {
    return (fontUnits / unitsPerEm) * fontSize;
}

/**
 * Generate a wireframe mesh from a glyph outline by connecting control points (legacy function)
 * @param outline - Glyph outline data
 * @param config - Text rendering configuration
 * @param unitsPerEm - Units per EM from font header
 * @returns Text mesh with vertices and line indices
 */
export function generateGlyphWireframeMesh(
    outline: GlyphOutline, 
    config: TextConfig, 
    unitsPerEm: number
): TextMesh {
    const vertices: number[] = [];
    const indices: number[] = [];
    
    let vertexIndex = 0;
    const bounds = {
        min: vec3.fromValues(Infinity, Infinity, Infinity),
        max: vec3.fromValues(-Infinity, -Infinity, -Infinity)
    };

    // Process each contour
    for (const contour of outline.contours) {
        const contourStartIndex = vertexIndex;
        
        // Add all points in the contour as vertices
        for (const point of contour.points) {
            // Convert font units to world coordinates
            const worldX = fontUnitsToWorld(point.x, unitsPerEm, config.fontSize);
            const worldY = fontUnitsToWorld(point.y, unitsPerEm, config.fontSize);
            
            // Apply position and scale
            const finalX = config.position[0] + worldX * config.scale[0];
            const finalY = config.position[1] + worldY * config.scale[1];
            const finalZ = config.position[2]; // Keep text flat for now
            
            vertices.push(finalX, finalY, finalZ);
            
            // Update bounds
            bounds.min[0] = Math.min(bounds.min[0], finalX);
            bounds.min[1] = Math.min(bounds.min[1], finalY);
            bounds.min[2] = Math.min(bounds.min[2], finalZ);
            bounds.max[0] = Math.max(bounds.max[0], finalX);
            bounds.max[1] = Math.max(bounds.max[1], finalY);
            bounds.max[2] = Math.max(bounds.max[2], finalZ);
            
            vertexIndex++;
        }
        
        // Connect consecutive points in the contour with lines
        for (let i = 0; i < contour.points.length; i++) {
            const currentIndex = contourStartIndex + i;
            const nextIndex = contourStartIndex + ((i + 1) % contour.points.length); // Wrap around to close contour
            
            // Add line segment
            indices.push(currentIndex, nextIndex);
        }
    }

    return {
        vertices: new Float32Array(vertices),
        indices: new Uint32Array(indices),
        bounds
    };
}

/**
 * Generate a wireframe mesh for a text character (legacy function)
 * @param font - Loaded TTF font
 * @param character - Character to render (e.g., 'A')
 * @param config - Text rendering configuration
 * @returns Text mesh or null if character not found
 */
export async function generateTextMesh(
    font: TTFFont, 
    character: string, 
    config: TextConfig
): Promise<TextMesh | null> {
    // Get character code
    const charCode = character.charCodeAt(0);
    
    // Find glyph ID
    const glyphId = getGlyphId(font, charCode);
    if (glyphId === 0) {
        console.warn(`Character '${character}' not found in font`);
        return null;
    }
    
    // Parse glyph outline
    const outline = parseGlyphOutline(font, glyphId);
    if (!outline) {
        console.warn(`Could not parse outline for character '${character}'`);
        return null;
    }
    
    // Get font metrics
    const headTable = parseHeadTable(font);
    if (!headTable) {
        console.warn('Could not parse head table');
        return null;
    }
    
    // Generate wireframe mesh
    return generateGlyphWireframeMesh(outline, config, headTable.unitsPerEm);
}

/**
 * Create a text mesh using the new Font class interface
 * @param text - Text string to render
 * @param fontPath - Path to TTF font file
 * @param options - Font rendering options
 * @param position - Position where text should start (lower-left corner of first character)
 * @returns Promise<TextMesh>
 */
export async function createTextMesh(
    text: string,
    fontPath: string,
    options: FontOptions,
    position: vec3
): Promise<TextMesh> {
    const font = await Font.fromFile(fontPath, options);
    return font.generateTextMesh(text, position);
} 