/**
 * Text Rendering System for Waggle WebGL2 Framework
 * 
 * This module provides a text rendering system with smooth contour generation and triangulation:
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
 * - `font.generateCharacterMesh(char, position)`: Generate single character wireframe
 * - `font.generateTextMesh(text, position)`: Generate multi-character text wireframe
 * - `font.generateFilledCharacterMesh(char, position)`: Generate single character filled mesh
 * - `font.generateFilledTextMesh(text, position)`: Generate multi-character filled text mesh
 * 
 * ### Triangulation Algorithm Roadmap
 * 🔷 Step-by-Step Hole Bridging + Ear Clipping Implementation:
 * 
 * 1. **Ensure Correct Winding**
 *    - Outer contours: Counter-clockwise (CCW)
 *    - Inner contours (holes): Clockwise (CW)
 *    - Use signed area to determine and correct winding
 * 
 * 2. **Bridge Each Hole to Outer Polygon**
 *    a. Find hole's rightmost vertex
 *    b. Find visible outer vertex using ray casting
 *    c. Connect hole to outer polygon along bridge
 *    d. Merge hole into outer polygon
 * 
 * 3. **Ear Clipping Triangulation**
 *    - Identify convex vertices (ears)
 *    - Check if ear contains other vertices
 *    - Clip valid ears to create triangles
 *    - Repeat until polygon is fully triangulated
 * 
 * 4. **Workflow Summary**
 *    - Input: outer contour + holes array
 *    - Fix windings for all contours
 *    - Bridge all holes to outer contour
 *    - Ear clip the merged polygon
 *    - Output: triangle array for filled rendering
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
 * const wireframeMesh = font.generateTextMesh('ABC', vec3.fromValues(0, 0, -1));
 * const filledMesh = font.generateFilledTextMesh('ABC', vec3.fromValues(0, 0, -1));
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
 * Filled text mesh data for triangle rendering
 */
export interface FilledTextMesh {
    /** Vertex positions as flat array (x,y,z,x,y,z,...) */
    vertices: Float32Array;
    /** Triangle indices for filled rendering */
    indices: Uint32Array;
    /** Bounding box of the text mesh */
    bounds: BoundingBox;
    /** Advance width for this character/text in world units */
    advanceWidth: number;
}

/**
 * 2D polygon representation for triangulation
 */
export interface Polygon2D {
    /** Array of 2D points [x, y] */
    points: [number, number][];
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
    /** Whether to generate filled triangulated mesh (true) or wireframe outline (false) */
    filled?: boolean;
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
 * Simple and robust polygon triangulation using ear clipping
 * Focuses on proper winding order and correct triangle orientation
 */
class PolygonTriangulator {
    /**
     * Calculate signed area of a polygon
     * Positive area = counter-clockwise, negative area = clockwise
     */
    static signedArea(polygon: [number, number][]): number {
        let area = 0;
        for (let i = 0; i < polygon.length; i++) {
            const [x1, y1] = polygon[i];
            const [x2, y2] = polygon[(i + 1) % polygon.length];
            area += (x1 * y2 - x2 * y1);
        }
        return area / 2;
    }

    /**
     * Check if a point is inside a polygon using ray casting algorithm
     */
    static pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
        const [x, y] = point;
        let inside = false;
        
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [xi, yi] = polygon[i];
            const [xj, yj] = polygon[j];
            
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        
        return inside;
    }

    /**
     * Calculate the centroid of a triangle
     */
    static triangleCentroid(a: [number, number], b: [number, number], c: [number, number]): [number, number] {
        return [
            (a[0] + b[0] + c[0]) / 3,
            (a[1] + b[1] + c[1]) / 3
        ];
    }

    /**
     * Check if three consecutive vertices form a convex angle (ear)
     * Returns true if the angle at vertex b is convex (< 180 degrees)
     * For a CCW polygon, we want the cross product of edges (a->b) and (b->c)
     */
    static isConvex(a: [number, number], b: [number, number], c: [number, number]): boolean {
        // Calculate vectors: edge1 = b - a, edge2 = c - b
        const edge1x = b[0] - a[0];
        const edge1y = b[1] - a[1];
        const edge2x = c[0] - b[0];
        const edge2y = c[1] - b[1];
        
        // Cross product of edge1 and edge2
        // For CCW polygon, positive cross product means convex angle (left turn)
        const cross = edge1x * edge2y - edge1y * edge2x;
        return cross > 0;
    }

    /**
     * Check if a point is inside a triangle using barycentric coordinates
     */
    static pointInTriangle(p: [number, number], a: [number, number], b: [number, number], c: [number, number]): boolean {
        const [px, py] = p;
        const [ax, ay] = a;
        const [bx, by] = b;
        const [cx, cy] = c;

        // Calculate barycentric coordinates
        const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(denom) < 1e-10) return false; // Degenerate triangle

        const alpha = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denom;
        const beta = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denom;
        const gamma = 1 - alpha - beta;

        const epsilon = 1e-10;
        return alpha > epsilon && beta > epsilon && gamma > epsilon;
    }

    /**
     * Check if a triangle is degenerate (has zero or near-zero area)
     */
    static isDegenerate(a: [number, number], b: [number, number], c: [number, number]): boolean {
        const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
        return area < 1e-10;
    }

    /**
     * Main triangulation function - fills the outer contour only
     * Input polygon must be a simple polygon (no self-intersections)
     */
    static triangulate(polygon: [number, number][]): Array<[[number, number], [number, number], [number, number]]> {
        if (polygon.length < 3) {
            console.warn('Polygon must have at least 3 vertices');
            return [];
        }

        console.log(`🔺 Starting triangulation: ${polygon.length} vertices`);

        // Clean the polygon - remove consecutive duplicate points
        const cleaned = this.cleanPolygon(polygon);
        if (cleaned.length < 3) {
            console.warn('Polygon became degenerate after cleaning');
            return [];
        }

        // Ensure counter-clockwise winding for proper triangle orientation
        let vertices = [...cleaned];
        if (this.signedArea(vertices) < 0) {
            vertices.reverse();
            console.log('Fixed polygon winding to counter-clockwise');
        }

        const triangles: Array<[[number, number], [number, number], [number, number]]> = [];
        let iterationCount = 0;
        const maxIterations = vertices.length * 2;

        // Ear clipping algorithm
        while (vertices.length > 3 && iterationCount < maxIterations) {
            iterationCount++;
            let earFound = false;

            for (let i = 0; i < vertices.length; i++) {
                const prev = vertices[(i - 1 + vertices.length) % vertices.length];
                const curr = vertices[i];
                const next = vertices[(i + 1) % vertices.length];

                // Check if this vertex forms a convex angle (potential ear)
                const isConvexAngle = this.isConvex(prev, curr, next);
                if (!isConvexAngle) {
                    continue; // Skip reflex vertices
                }

                // Check if the triangle is degenerate
                if (this.isDegenerate(prev, curr, next)) {
                    continue;
                }

                // Check if any other vertex is inside this triangle
                let hasInteriorPoint = false;
                for (let j = 0; j < vertices.length; j++) {
                    if (j === i || j === (i - 1 + vertices.length) % vertices.length || j === (i + 1) % vertices.length) {
                        continue; // Skip the triangle's own vertices
                    }
                    
                    if (this.pointInTriangle(vertices[j], prev, curr, next)) {
                        hasInteriorPoint = true;
                        break;
                    }
                }

                if (!hasInteriorPoint) {
                    // Additional validation: check if triangle centroid is inside the original polygon
                    const triangleCentroid = this.triangleCentroid(prev, curr, next);
                    const centroidInside = this.pointInPolygon(triangleCentroid, cleaned);
                    
                    if (!centroidInside) {
                        // Triangle extends outside the polygon - skip this ear
                        continue;
                    }
                    
                    // Found a valid ear! Add triangle with correct winding order
                    // Double-check triangle orientation
                    const triangleArea = this.signedArea([prev, curr, next]);
                    if (triangleArea > 0) {
                        triangles.push([prev, curr, next]);
                    } else {
                        // This shouldn't happen with correct winding, but let's be safe
                        console.warn(`Triangle has wrong orientation, flipping: area=${triangleArea}`);
                        triangles.push([prev, next, curr]);
                    }
                    vertices.splice(i, 1); // Remove the ear vertex
                    earFound = true;
                    break;
                }
            }

            if (!earFound) {
                console.warn(`No ear found at iteration ${iterationCount}, remaining vertices: ${vertices.length}`);
                // Log remaining vertices for debugging
                console.warn('Remaining vertices:', vertices);
                break; // Prevent infinite loop
            }
        }

        // Add the final triangle if we have exactly 3 vertices left
        if (vertices.length === 3) {
            const [a, b, c] = vertices;
            if (!this.isDegenerate(a, b, c)) {
                triangles.push([a, b, c]);
            }
        }

        console.log(`✅ Triangulation complete: ${triangles.length} triangles generated in ${iterationCount} iterations`);
        return triangles;
    }

    /**
     * Triangulation with proper hole bridging
     * Bridges holes to outer polygon and then triangulates the merged result
     */
    static triangulateWithHoles(outer: [number, number][], holes: [number, number][][]): Array<[[number, number], [number, number], [number, number]]> {
        console.log(`🔺 Triangulation with holes: outer=${outer.length} points, holes=${holes.length}`);
        
        if (holes.length === 0) {
            // No holes, just triangulate the outer polygon
            return this.triangulate(outer);
        }
        
        console.log(`   Processing ${holes.length} holes for bridging`);
        
        // Start with the outer polygon
        let mergedPolygon = [...outer];
        
        // Ensure outer polygon has correct winding (CCW)
        if (this.signedArea(mergedPolygon) < 0) {
            mergedPolygon.reverse();
            console.log(`   Fixed outer polygon winding to CCW`);
        }
        
        // Bridge each hole to the merged polygon
        for (let i = 0; i < holes.length; i++) {
            let hole = [...holes[i]];
            
            // Ensure hole has correct winding (CW for holes)
            if (this.signedArea(hole) > 0) {
                hole.reverse();
                console.log(`   Fixed hole ${i} winding to CW`);
            }
            
            // Bridge this hole to the current merged polygon
            mergedPolygon = this.bridgeHoleToOuter(mergedPolygon, hole);
        }
        
        console.log(`   Final merged polygon: ${mergedPolygon.length} vertices`);
        
        // Triangulate the merged polygon
        return this.triangulate(mergedPolygon);
    }

    /**
     * Clean polygon by removing consecutive duplicate points
     */
    static cleanPolygon(polygon: [number, number][]): [number, number][] {
        if (polygon.length === 0) return [];

        const cleaned: [number, number][] = [];
        const epsilon = 1e-8;

        for (let i = 0; i < polygon.length; i++) {
            const current = polygon[i];
            const next = polygon[(i + 1) % polygon.length];

            // Only add point if it's not too close to the next point
            const dx = Math.abs(current[0] - next[0]);
            const dy = Math.abs(current[1] - next[1]);

            if (dx > epsilon || dy > epsilon) {
                cleaned.push(current);
            }
        }

        return cleaned;
    }

    /**
     * Find the rightmost vertex in a polygon
     */
    static getRightmostVertex(polygon: [number, number][]): { vertex: [number, number], index: number } {
        let rightmostIndex = 0;
        let rightmostX = polygon[0][0];
        
        for (let i = 1; i < polygon.length; i++) {
            if (polygon[i][0] > rightmostX) {
                rightmostX = polygon[i][0];
                rightmostIndex = i;
            }
        }
        
        return { vertex: polygon[rightmostIndex], index: rightmostIndex };
    }

    /**
     * Check if two line segments intersect
     */
    static segmentsIntersect(
        a1: [number, number], a2: [number, number],
        b1: [number, number], b2: [number, number]
    ): boolean {
        const d1 = this.crossProduct2D(
            [b1[0] - a1[0], b1[1] - a1[1]],
            [a2[0] - a1[0], a2[1] - a1[1]]
        );
        const d2 = this.crossProduct2D(
            [b2[0] - a1[0], b2[1] - a1[1]],
            [a2[0] - a1[0], a2[1] - a1[1]]
        );
        const d3 = this.crossProduct2D(
            [a1[0] - b1[0], a1[1] - b1[1]],
            [b2[0] - b1[0], b2[1] - b1[1]]
        );
        const d4 = this.crossProduct2D(
            [a2[0] - b1[0], a2[1] - b1[1]],
            [b2[0] - b1[0], b2[1] - b1[1]]
        );
        
        return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
               ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
    }

    /**
     * Calculate 2D cross product
     */
    static crossProduct2D(v1: [number, number], v2: [number, number]): number {
        return v1[0] * v2[1] - v1[1] * v2[0];
    }

    /**
     * Check if a line segment from point to target is visible (doesn't intersect polygon edges)
     */
    static isVisible(
        point: [number, number],
        target: [number, number],
        polygon: [number, number][]
    ): boolean {
        for (let i = 0; i < polygon.length; i++) {
            const edgeStart = polygon[i];
            const edgeEnd = polygon[(i + 1) % polygon.length];
            
            // Skip if the edge shares a vertex with our line
            if ((edgeStart[0] === point[0] && edgeStart[1] === point[1]) ||
                (edgeStart[0] === target[0] && edgeStart[1] === target[1]) ||
                (edgeEnd[0] === point[0] && edgeEnd[1] === point[1]) ||
                (edgeEnd[0] === target[0] && edgeEnd[1] === target[1])) {
                continue;
            }
            
            if (this.segmentsIntersect(point, target, edgeStart, edgeEnd)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Find the best bridge point on the outer polygon for connecting a hole
     */
    static findBridgePoint(
        holeVertex: [number, number],
        outerPolygon: [number, number][]
    ): { vertex: [number, number], index: number } | null {
        let bestPoint = null;
        let bestDistance = Infinity;
        
        // Try to find a visible vertex on the outer polygon
        for (let i = 0; i < outerPolygon.length; i++) {
            const outerVertex = outerPolygon[i];
            
            // Check if this vertex is visible from the hole vertex
            if (this.isVisible(holeVertex, outerVertex, outerPolygon)) {
                const distance = Math.sqrt(
                    Math.pow(outerVertex[0] - holeVertex[0], 2) +
                    Math.pow(outerVertex[1] - holeVertex[1], 2)
                );
                
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestPoint = { vertex: outerVertex, index: i };
                }
            }
        }
        
        // If no direct visibility, find the closest point to the right
        if (!bestPoint) {
            for (let i = 0; i < outerPolygon.length; i++) {
                const outerVertex = outerPolygon[i];
                
                // Only consider vertices to the right of the hole vertex
                if (outerVertex[0] >= holeVertex[0]) {
                    const distance = Math.sqrt(
                        Math.pow(outerVertex[0] - holeVertex[0], 2) +
                        Math.pow(outerVertex[1] - holeVertex[1], 2)
                    );
                    
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        bestPoint = { vertex: outerVertex, index: i };
                    }
                }
            }
        }
        
        return bestPoint;
    }

    /**
     * Bridge a hole to the outer polygon by connecting vertices
     */
    static bridgeHoleToOuter(
        outerPolygon: [number, number][],
        hole: [number, number][]
    ): [number, number][] {
        console.log(`   🌉 Bridging hole with ${hole.length} vertices to outer polygon`);
        
        // Find the rightmost vertex of the hole
        const { vertex: holeVertex, index: holeIndex } = this.getRightmostVertex(hole);
        console.log(`   Hole rightmost vertex at index ${holeIndex}: [${holeVertex[0].toFixed(2)}, ${holeVertex[1].toFixed(2)}]`);
        
        // Find the best bridge point on the outer polygon
        const bridgePoint = this.findBridgePoint(holeVertex, outerPolygon);
        if (!bridgePoint) {
            console.warn(`   ⚠️ Could not find bridge point for hole`);
            return outerPolygon; // Return original if bridging fails
        }
        
        console.log(`   Bridge point at index ${bridgePoint.index}: [${bridgePoint.vertex[0].toFixed(2)}, ${bridgePoint.vertex[1].toFixed(2)}]`);
        
        // Create the merged polygon
        const merged: [number, number][] = [];
        
        // Add outer polygon vertices up to the bridge point
        for (let i = 0; i <= bridgePoint.index; i++) {
            merged.push(outerPolygon[i]);
        }
        
        // Add the bridge connection to hole
        merged.push(bridgePoint.vertex); // Duplicate bridge point
        
        // Add hole vertices starting from the rightmost vertex
        for (let i = 0; i < hole.length; i++) {
            const holeVertexIndex = (holeIndex + i) % hole.length;
            merged.push(hole[holeVertexIndex]);
        }
        
        // Add the bridge connection back to outer
        merged.push(holeVertex); // Duplicate hole vertex
        merged.push(bridgePoint.vertex); // Return to bridge point
        
        // Add remaining outer polygon vertices
        for (let i = bridgePoint.index + 1; i < outerPolygon.length; i++) {
            merged.push(outerPolygon[i]);
        }
        
        console.log(`   ✅ Merged polygon: ${outerPolygon.length} + ${hole.length} -> ${merged.length} vertices`);
        return merged;
    }

    /**
     * Check if one polygon is completely contained within another
     */
    static isPolygonContained(inner: [number, number][], outer: [number, number][]): boolean {
        // Test several points from the inner polygon to see if they're all inside the outer
        const testPoints = Math.min(inner.length, 5); // Test up to 5 points for efficiency
        let containedCount = 0;
        
        for (let i = 0; i < testPoints; i++) {
            const testIndex = Math.floor(i * inner.length / testPoints);
            if (this.pointInPolygon(inner[testIndex], outer)) {
                containedCount++;
            }
        }
        
        // Consider contained if most test points are inside
        return containedCount >= Math.ceil(testPoints * 0.6);
    }

    /**
     * Classify contours as outer contours vs holes using containment analysis
     */
    static classifyContours(contours: [number, number][][]): {
        outerContours: { polygon: [number, number][], index: number }[],
        holes: { polygon: [number, number][], index: number, parentIndex: number }[]
    } {
        console.log(`   🔍 Classifying ${contours.length} contours using containment analysis`);
        
        const contourData = contours.map((poly, index) => ({
            polygon: poly,
            area: this.signedArea(poly),
            absArea: Math.abs(this.signedArea(poly)),
            index: index
        }));
        
        // Sort by absolute area (largest first) - larger contours are more likely to be outer
        contourData.sort((a, b) => b.absArea - a.absArea);
        
        const outerContours: { polygon: [number, number][], index: number }[] = [];
        const holes: { polygon: [number, number][], index: number, parentIndex: number }[] = [];
        
        for (let i = 0; i < contourData.length; i++) {
            const current = contourData[i];
            let isHole = false;
            let parentIndex = -1;
            
            // Check if this contour is contained within any larger contour
            for (let j = 0; j < i; j++) {
                const potential_parent = contourData[j];
                if (this.isPolygonContained(current.polygon, potential_parent.polygon)) {
                    isHole = true;
                    parentIndex = potential_parent.index;
                    console.log(`     Contour ${current.index} (area=${current.area.toFixed(2)}) is HOLE inside contour ${parentIndex}`);
                    break;
                }
            }
            
            if (isHole) {
                holes.push({
                    polygon: current.polygon,
                    index: current.index,
                    parentIndex: parentIndex
                });
            } else {
                console.log(`     Contour ${current.index} (area=${current.area.toFixed(2)}) is OUTER contour`);
                outerContours.push({
                    polygon: current.polygon,
                    index: current.index
                });
            }
        }
        
        console.log(`   📊 Classification result: ${outerContours.length} outer, ${holes.length} holes`);
        return { outerContours, holes };
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
     * Generate a filled mesh for a single character using triangulation
     */
    generateFilledCharacterMesh(character: string, position: vec3): FilledTextMesh | null {
        console.log(`🔤 Generating filled mesh for character: '${character}'`);
        
        // Get advance width for this character
        const advanceWidth = this.getCharacterAdvanceWidth(character);

        // Handle space character specially - it has no visible geometry
        if (character === ' ') {
            return this.createEmptyFilledMesh(position, advanceWidth);
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

        if (outline.contours.length === 0) {
            console.log(`  Character '${character}' has no contours`);
            return this.createEmptyFilledMesh(position, advanceWidth);
        }

        console.log(`  Character '${character}' has ${outline.contours.length} contours`);

        // Convert contours to 2D polygons for triangulation
        const contourPolygons: [number, number][][] = [];
        
        for (const contour of outline.contours) {
            const smoothPoints = CurveGenerator.generateSmoothContour(contour, this.options.splineSteps);
            if (smoothPoints.length >= 3) {
                contourPolygons.push(smoothPoints);
                console.log(`    Contour: ${contour.points.length} -> ${smoothPoints.length} points`);
            }
        }

        if (contourPolygons.length === 0) {
            console.log(`  No valid contours after smoothing`);
            return this.createEmptyFilledMesh(position, advanceWidth);
        }

        let triangles: Array<[[number, number], [number, number], [number, number]]>;

        // Simple case: single contour
        if (contourPolygons.length === 1) {
            console.log(`  Simple character: single contour triangulation`);
            triangles = PolygonTriangulator.triangulate(contourPolygons[0]);
        } else {
            // Multiple contours - use containment analysis for proper classification
            console.log(`  Multiple contours: ${contourPolygons.length} contours`);
            
            // Use robust containment-based classification
            const { outerContours, holes } = PolygonTriangulator.classifyContours(contourPolygons);

            if (outerContours.length === 0) {
                console.warn(`  No outer contours found for character '${character}'`);
                return this.createEmptyFilledMesh(position, advanceWidth);
            }

            // Handle multiple outer contours (like 'i' with dot and stem)
            if (outerContours.length > 1) {
                console.log(`  Character has ${outerContours.length} separate outer contours (e.g., 'i' with dot)`);
                
                // Triangulate each outer contour separately with its associated holes
                triangles = [];
                
                for (const outerContour of outerContours) {
                    // Find holes that belong to this outer contour
                    const associatedHoles = holes
                        .filter(hole => hole.parentIndex === outerContour.index)
                        .map(hole => hole.polygon);
                    
                    console.log(`   Outer contour ${outerContour.index}: ${outerContour.polygon.length} points, ${associatedHoles.length} holes`);
                    
                    // Triangulate this outer contour with its holes
                    const contourTriangles = associatedHoles.length > 0 
                        ? PolygonTriangulator.triangulateWithHoles(outerContour.polygon, associatedHoles)
                        : PolygonTriangulator.triangulate(outerContour.polygon);
                    
                    triangles.push(...contourTriangles);
                    console.log(`   Generated ${contourTriangles.length} triangles for outer contour ${outerContour.index}`);
                }
            } else {
                // Single outer contour with holes (like 'd', 'o')
                const mainOuter = outerContours[0];
                const allHoles = holes.map(hole => hole.polygon);

                console.log(`   Single outer contour with ${mainOuter.polygon.length} points`);
                console.log(`   Processing ${allHoles.length} holes with bridging`);
                
                // Use proper hole bridging triangulation
                triangles = PolygonTriangulator.triangulateWithHoles(mainOuter.polygon, allHoles);
            }
        }

        if (triangles.length === 0) {
            console.warn(`  No triangles generated for character '${character}'`);
            return this.createEmptyFilledMesh(position, advanceWidth);
        }

        console.log(`  Generated ${triangles.length} triangles for character '${character}'`);

        // Convert triangles to mesh data
        const vertices: number[] = [];
        const indices: number[] = [];
        const bounds = this.createBounds();
        
        let vertexIndex = 0;
        const vertexMap = new Map<string, number>();

        for (const [a, b, c] of triangles) {
            for (const point of [a, b, c]) {
                const key = `${point[0]},${point[1]}`;
                let index = vertexMap.get(key);
                
                if (index === undefined) {
                    const [finalX, finalY, finalZ] = this.transformPoint(point[0], point[1], position);
                    vertices.push(finalX, finalY, finalZ);
                    this.updateBoundsWithPoint(bounds, finalX, finalY, finalZ);
                    index = vertexIndex++;
                    vertexMap.set(key, index);
                }
                
                indices.push(index);
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
     * Generate a filled mesh for a text string using triangulation
     */
    generateFilledTextMesh(text: string, position: vec3): FilledTextMesh {
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
            
            const charMesh = this.generateFilledCharacterMesh(char, charPosition);
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
     * Create an empty filled mesh for characters like spaces
     */
    private createEmptyFilledMesh(position: vec3, advanceWidth: number): FilledTextMesh {
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

/**
 * Convenience function to create a filled text mesh from a font file path
 * @param text - Text string to render
 * @param fontPath - Path to TTF font file
 * @param fontOptions - Font rendering options
 * @param position - Position for the text
 * @returns Promise<FilledTextMesh | null> - Generated filled text mesh or null if failed
 */
export async function createFilledTextMesh(
    text: string, 
    fontPath: string, 
    fontOptions: FontOptions, 
    position: vec3
): Promise<FilledTextMesh | null> {
    try {
        const font = await Font.fromFile(fontPath, fontOptions);
        if (text.length === 1) {
            return font.generateFilledCharacterMesh(text, position);
        } else {
            return font.generateFilledTextMesh(text, position);
        }
    } catch (error) {
        console.error(`Failed to create filled text mesh: ${error}`);
        return null;
    }
}

/**
 * Convenience function to generate filled text mesh from a parsed TTF font
 * @param ttfFont - Parsed TTF font structure
 * @param text - Text string to render
 * @param config - Text configuration
 * @returns Promise<FilledTextMesh | null> - Generated filled text mesh or null if failed
 */
export async function generateFilledTextMesh(
    ttfFont: any,
    text: string,
    config: TextConfig
): Promise<FilledTextMesh | null> {
    try {
        const fontOptions: FontOptions = {
            fontSize: config.fontSize,
            lineWidth: 1.0,
            lineColor: vec3.fromValues(1.0, 1.0, 1.0),
            splineSteps: 0
        };
        
        const font = new Font(ttfFont, fontOptions);
        if (text.length === 1) {
            return font.generateFilledCharacterMesh(text, config.position);
        } else {
            return font.generateFilledTextMesh(text, config.position);
        }
    } catch (error) {
        console.error(`Failed to generate filled text mesh: ${error}`);
        return null;
    }
}

/**
 * Test function for debugging triangulation
 * Tests the clean triangulation implementation
 */
export function testTriangulation(): void {
    console.log('🧪 Testing clean triangulation implementation...');
    
    // Test 1: Simple square (should produce 2 triangles)
    console.log('\n=== Test 1: Square ===');
    const square: [number, number][] = [
        [0, 0], [1, 0], [1, 1], [0, 1]
    ];
    
    console.log('Square vertices:', square);
    console.log('Square signed area:', PolygonTriangulator.signedArea(square));
    
    const squareTriangles = PolygonTriangulator.triangulate(square);
    console.log('Square triangles:', squareTriangles);
    
    // Test 2: Triangle (should produce 1 triangle)
    console.log('\n=== Test 2: Triangle ===');
    const triangle: [number, number][] = [
        [0, 0], [1, 0], [0.5, 1]
    ];
    
    const triangleResult = PolygonTriangulator.triangulate(triangle);
    console.log('Triangle result:', triangleResult);
    
    // Test 3: Pentagon (should produce 3 triangles)
    console.log('\n=== Test 3: Pentagon ===');
    const pentagon: [number, number][] = [
        [0, 1], [0.95, 0.31], [0.59, -0.81], [-0.59, -0.81], [-0.95, 0.31]
    ];
    
    const pentagonResult = PolygonTriangulator.triangulate(pentagon);
    console.log('Pentagon triangles:', pentagonResult.length);
    
    // Summary
    console.log('\n=== Summary ===');
    console.log(`Square: ${squareTriangles.length} triangles (expected 2)`);
    console.log(`Triangle: ${triangleResult.length} triangles (expected 1)`);
    console.log(`Pentagon: ${pentagonResult.length} triangles (expected 3)`);
    
    const allPassed = squareTriangles.length === 2 && 
                     triangleResult.length === 1 && 
                     pentagonResult.length === 3;
    
    console.log(allPassed ? '✅ All tests passed!' : '❌ Some tests failed');
}

// Make the test function available globally for debugging
(globalThis as any).testTriangulation = testTriangulation;