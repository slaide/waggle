/**
 * Text Rendering System for Waggle WebGL2 Framework
 * 
 * This module provides a text rendering system with smooth contour generation and triangulation:
 * 
 * ### Font Configuration (Set at Construction)
 * - `smoothness`: Number of interpolation steps per curve segment (0 = no interpolation, just control points)
 * - `filled`: Whether to generate filled triangulated mesh (true) or wireframe outline (false)
 * - `fontSize`: Font size in world units
 * - `lineWidth`: Line width for wireframe rendering (pixels) - NOTE: Most browsers only support 1.0
 * 
 * ### Font Class
 * Main class for text rendering:
 * - `Font.fromFile(fontPath, smoothness, filled, fontSize, lineWidth)`: Create font from TTF file

 * - `font.generateText(text, position, color)`: Generate multi-character text mesh
 * 
 * ### Font Configuration
 * - **Smoothness**, **filled mode**, **fontSize**, and **lineWidth** are configured at Font construction time
 * - **Color** is the only option specified per text generation
 * - Glyph meshes are cached per character to avoid regeneration
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
 * // Create font with built-in configuration
 * const font = await Font.fromFile('./static/resources/Raleway-Regular.ttf', 8, true, 1.0, 1.0);
 * 
 * // Generate text with only color specification
 * const textMesh = font.generateText('ABC', vec3.fromValues(0, 0, -1), vec3.fromValues(1.0, 0.0, 0.0));
 * ```
 * 
 * ### Position Specification
 * The position parameter specifies the lower-left corner of the first character.
 * Characters are spaced automatically using simple character spacing (fontSize * 0.7).
 */

import { vec3, type Vec3Like } from "gl-matrix";
import { 
    TTFFont, 
    parseTTF, 
    getGlyphId, 
    parseGlyphOutline, 
    GlyphOutline, 
    GlyphContour,
    TTFHeadTable,
} from "./parsers/ttf";

/**
 * 3D point for text rendering
 */
export interface TextPoint {
    /** 3D position vector */
    position: Vec3Like;
}

/**
 * Bounding box type
 */
export interface BoundingBox {
    /** Minimum corner of bounding box */
    min: Vec3Like;
    /** Maximum corner of bounding box */
    max: Vec3Like;
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
 * 2D polygon representation for triangulation
 */
export interface Polygon2D {
    /** Array of 2D points [x, y] */
    points: [number, number][];
}



/**
 * Internal cached glyph data
 */
interface CachedGlyph {
    /** Wireframe mesh vertices in font units */
    wireframeVertices: [number, number][];
    /** Wireframe indices (line pairs) */
    wireframeIndices: number[];
    /** Filled mesh vertices in font units (null if font is not filled) */
    filledVertices?: [number, number][];
    /** Filled mesh indices (triangles) (null if font is not filled) */
    filledIndices?: number[];
    /** Advance width in font units */
    advanceWidth: number;
    /** Bounding box in font units */
    bounds: { min: [number, number], max: [number, number] };
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
                        end: { x: nextPoint.x, y: nextPoint.y },
                    });
                    i++;
                } else {
                    // Curve segment: on-curve -> off-curve -> ...
                    const controlPoint = nextPoint;
                    
                    // Find the end point for this curve
                    const endIndex = (i + 2) % points.length;
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
                            onCurve: true,
                        };
                        i++; // Move to the control point (next iteration will process the off-curve point)
                    }
                    
                    segments.push({
                        start: { x: currentPoint.x, y: currentPoint.y },
                        control: { x: controlPoint.x, y: controlPoint.y },
                        end: { x: endPoint.x, y: endPoint.y },
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
                        onCurve: true,
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
                            onCurve: true,
                        };
                    }
                    
                    segments.push({
                        start: impliedStart,
                        control: { x: currentPoint.x, y: currentPoint.y },
                        end: endPoint,
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
            (a[1] + b[1] + c[1]) / 3,
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
            return [];
        }

        // Clean the polygon - remove consecutive duplicate points
        const cleaned = this.cleanPolygon(polygon);
        if (cleaned.length < 3) {
            return [];
        }

        // Ensure counter-clockwise winding for proper triangle orientation
        const vertices = [...cleaned];
        if (this.signedArea(vertices) < 0) {
            vertices.reverse();
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
                    const triangleArea = this.signedArea([prev, curr, next]);
                    if (triangleArea > 0) {
                        triangles.push([prev, curr, next]);
                    } else {
                        triangles.push([prev, next, curr]);
                    }
                    vertices.splice(i, 1); // Remove the ear vertex
                    earFound = true;
                    break;
                }
            }

            if (!earFound) {
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

        return triangles;
    }

    /**
     * Triangulation with proper hole bridging
     * Bridges holes to outer polygon and then triangulates the merged result
     */
    static triangulateWithHoles(outer: [number, number][], holes: [number, number][][]): Array<[[number, number], [number, number], [number, number]]> {
        if (holes.length === 0) {
            // No holes, just triangulate the outer polygon
            return this.triangulate(outer);
        }
        
        // Start with the outer polygon
        let mergedPolygon = [...outer];
        
        // Ensure outer polygon has correct winding (CCW)
        if (this.signedArea(mergedPolygon) < 0) {
            mergedPolygon.reverse();
        }
        
        // Bridge each hole to the merged polygon
        for (let i = 0; i < holes.length; i++) {
            const hole = [...holes[i]];
            
            // Ensure hole has correct winding (CW for holes)
            if (this.signedArea(hole) > 0) {
                hole.reverse();
            }
            
            // Bridge this hole to the current merged polygon
            mergedPolygon = this.bridgeHoleToOuter(mergedPolygon, hole);
        }
        
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
        b1: [number, number], b2: [number, number],
    ): boolean {
        const d1 = this.crossProduct2D(
            [b1[0] - a1[0], b1[1] - a1[1]],
            [a2[0] - a1[0], a2[1] - a1[1]],
        );
        const d2 = this.crossProduct2D(
            [b2[0] - a1[0], b2[1] - a1[1]],
            [a2[0] - a1[0], a2[1] - a1[1]],
        );
        const d3 = this.crossProduct2D(
            [a1[0] - b1[0], a1[1] - b1[1]],
            [b2[0] - b1[0], b2[1] - b1[1]],
        );
        const d4 = this.crossProduct2D(
            [a2[0] - b1[0], a2[1] - b1[1]],
            [b2[0] - b1[0], b2[1] - b1[1]],
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
        polygon: [number, number][],
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
        outerPolygon: [number, number][],
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
                    Math.pow(outerVertex[1] - holeVertex[1], 2),
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
                        Math.pow(outerVertex[1] - holeVertex[1], 2),
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
        hole: [number, number][],
    ): [number, number][] {
        // Find the rightmost vertex of the hole
        const { vertex: holeVertex, index: holeIndex } = this.getRightmostVertex(hole);
        
        // Find the best bridge point on the outer polygon
        const bridgePoint = this.findBridgePoint(holeVertex, outerPolygon);
        if (!bridgePoint) {
            return outerPolygon; // Return original if bridging fails
        }
        
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
        const contourData = contours.map((poly, index) => ({
            polygon: poly,
            area: this.signedArea(poly),
            absArea: Math.abs(this.signedArea(poly)),
            index: index,
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
                    break;
                }
            }
            
            if (isHole) {
                holes.push({
                    polygon: current.polygon,
                    index: current.index,
                    parentIndex: parentIndex,
                });
            } else {
                outerContours.push({
                    polygon: current.polygon,
                    index: current.index,
                });
            }
        }
        
        return { outerContours, holes };
    }
}

/**
 * Font class for text rendering with caching
 */
export class Font {
    private ttfFont: TTFFont;
    private unitsPerEm: number;
    private smoothness: number;
    private filled: boolean;
    private fontSize: number;
    private lineWidth: number;
    private glyphCache: Map<string, CachedGlyph> = new Map();

    constructor(ttfFont: TTFFont, smoothness: number, filled: boolean, fontSize: number, lineWidth: number) {
        this.ttfFont = ttfFont;
        this.smoothness = smoothness;
        this.filled = filled;
        this.fontSize = fontSize;
        this.lineWidth = lineWidth;
        
        // Get font metrics
        const headTable = ttfFont.tableAccess.getParsedTable<TTFHeadTable>("head");
        if (!headTable) {
            throw new Error("Could not parse font head table");
        }
        this.unitsPerEm = headTable.unitsPerEm;
    }

    /**
     * Create a Font instance from a font file
     */
    static async fromFile(
        fontPath: string, 
        smoothness: number = 0, 
        filled: boolean = false, 
        fontSize: number = 1.0, 
        lineWidth: number = 1.0,
    ): Promise<Font> {
        const ttfFont = await parseTTF(fontPath);
        return new Font(ttfFont, smoothness, filled, fontSize, lineWidth);
    }

    /**
     * Get font configuration
     */
    get config() {
        return {
            smoothness: this.smoothness,
            filled: this.filled,
            fontSize: this.fontSize,
            lineWidth: this.lineWidth,
        };
    }

    /**
     * Convert font units to world units
     */
    private fontUnitsToWorld(fontUnits: number): number {
        return (fontUnits / this.unitsPerEm) * this.fontSize;
    }

    /**
     * Get or generate cached glyph data
     */
    private getCachedGlyph(character: string): CachedGlyph {
        // Check cache first
        if (this.glyphCache.has(character)) {
            return this.glyphCache.get(character)!;
        }



        // Get character code and glyph ID
        const charCode = character.charCodeAt(0);
        let glyphId = getGlyphId(this.ttfFont, charCode);
        if (glyphId === 0) {
            // Character not found in font - use .notdef glyph (glyph ID 0)
            // This is the standard TTF behavior for missing characters
            glyphId = 0;
        }
        
        // Parse glyph outline
        const outline = parseGlyphOutline(this.ttfFont, glyphId);
        if (!outline) {
            throw new Error(`Failed to parse glyph outline for character '${character}' (glyph ID: ${glyphId}). This could indicate font corruption, missing required font tables, or unsupported glyph features (like composite glyphs).`);
        }

        // Generate glyph mesh data
        const cachedGlyph = this.generateGlyphData(outline);
        
        // Cache the result
        this.glyphCache.set(character, cachedGlyph);
        
        return cachedGlyph;
    }

    /**
     * Generate glyph data from outline
     */
    private generateGlyphData(outline: GlyphOutline): CachedGlyph {
        const wireframeVertices: [number, number][] = [];
        const wireframeIndices: number[] = [];
        let vertexIndex = 0;
        
        // Calculate bounds
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        // Generate wireframe mesh
        for (const contour of outline.contours) {
            const contourStartIndex = vertexIndex;
            
            // Generate smooth contour points
            const smoothPoints = CurveGenerator.generateSmoothContour(contour, this.smoothness);
            
            // Add all points as vertices
            for (const [pointX, pointY] of smoothPoints) {
                wireframeVertices.push([pointX, pointY]);
                
                // Update bounds
                minX = Math.min(minX, pointX);
                minY = Math.min(minY, pointY);
                maxX = Math.max(maxX, pointX);
                maxY = Math.max(maxY, pointY);
                
                vertexIndex++;
            }
            
            // Connect consecutive points with lines
            for (let i = 0; i < smoothPoints.length; i++) {
                const currentIndex = contourStartIndex + i;
                const nextIndex = contourStartIndex + ((i + 1) % smoothPoints.length);
                wireframeIndices.push(currentIndex, nextIndex);
            }
        }

        // Generate filled mesh if needed
        let filledVertices: [number, number][] | undefined;
        let filledIndices: number[] | undefined;
        
        if (this.filled && outline.contours.length > 0) {
            // Convert contours to 2D polygons for triangulation
            const contourPolygons: [number, number][][] = [];
            
            for (const contour of outline.contours) {
                const smoothPoints = CurveGenerator.generateSmoothContour(contour, this.smoothness);
                if (smoothPoints.length >= 3) {
                    contourPolygons.push(smoothPoints);
                }
            }

            if (contourPolygons.length > 0) {
                let triangles: Array<[[number, number], [number, number], [number, number]]>;

                // Simple case: single contour
                if (contourPolygons.length === 1) {
                    triangles = PolygonTriangulator.triangulate(contourPolygons[0]);
                } else {
                    // Multiple contours - use containment analysis for proper classification
                    const { outerContours, holes } = PolygonTriangulator.classifyContours(contourPolygons);

                    if (outerContours.length > 0) {
                        // Handle multiple outer contours (like 'i' with dot and stem)
                        if (outerContours.length > 1) {
                            // Triangulate each outer contour separately with its associated holes
                            triangles = [];
                            
                            for (const outerContour of outerContours) {
                                // Find holes that belong to this outer contour
                                const associatedHoles = holes
                                    .filter(hole => hole.parentIndex === outerContour.index)
                                    .map(hole => hole.polygon);
                                
                                // Triangulate this outer contour with its holes
                                const contourTriangles = associatedHoles.length > 0 
                                    ? PolygonTriangulator.triangulateWithHoles(outerContour.polygon, associatedHoles)
                                    : PolygonTriangulator.triangulate(outerContour.polygon);
                                
                                triangles.push(...contourTriangles);
                            }
                        } else {
                            // Single outer contour with holes (like 'd', 'o')
                            const mainOuter = outerContours[0];
                            const allHoles = holes.map(hole => hole.polygon);
                            
                            // Use proper hole bridging triangulation
                            triangles = PolygonTriangulator.triangulateWithHoles(mainOuter.polygon, allHoles);
                        }
                    } else {
                        triangles = [];
                    }
                }

                // Convert triangles to vertex/index data
                if (triangles.length > 0) {
                    filledVertices = [];
                    filledIndices = [];
                    const vertexMap = new Map<string, number>();
                    let filledVertexIndex = 0;

                    for (const [a, b, c] of triangles) {
                        for (const point of [a, b, c]) {
                            const key = `${point[0]},${point[1]}`;
                            let index = vertexMap.get(key);
                            
                            if (index === undefined) {
                                filledVertices.push([point[0], point[1]]);
                                index = filledVertexIndex++;
                                vertexMap.set(key, index);
                            }
                            
                            filledIndices.push(index);
                        }
                    }
                }
            }
        }

        return {
            wireframeVertices,
            wireframeIndices,
            filledVertices,
            filledIndices,
            advanceWidth: outline.advanceWidth,
            bounds: { 
                min: [isFinite(minX) ? minX : 0, isFinite(minY) ? minY : 0], 
                max: [isFinite(maxX) ? maxX : 0, isFinite(maxY) ? maxY : 0], 
            },
        };
    }

    /**
     * Generate a mesh for a text string
     * Uses the font's configured rendering mode (wireframe/filled) and caching automatically
     * Handles newline characters by converting them to multiline rendering
     */
    generateText(text: string, position: Vec3Like, color: Vec3Like): TextMesh {
        // Check if text contains newlines - if so, use multiline rendering
        if (text.includes("\n")) {
            const lines = text.split("\n");
            return this.generateMultilineText(lines, position, color, 1.2, false); // Default to bottom-left for backward compatibility
        }
        
        // Single line rendering (original logic)
        const allVertices: number[] = [];
        const allIndices: number[] = [];
        let vertexOffset = 0;
        
        const bounds = {
            min: vec3.fromValues(Infinity, Infinity, Infinity),
            max: vec3.fromValues(-Infinity, -Infinity, -Infinity),
        };

        let currentX = 0; // Start at origin X - overall position handled by Transform
        const baseY = position[1]; // Respect Y position for line spacing in multiline text
        const baseZ = 0; // Z position handled by Transform
        let totalAdvanceWidth = 0;

        // Process each character (skip newlines since we handle them above)
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            
            // Skip control characters that don't have visual representation
            if (char === "\n" || char === "\r" || char === "\t") {
                continue;
            }
            
            const charPosition = vec3.fromValues(currentX, baseY, baseZ);
            
            const cachedGlyph = this.getCachedGlyph(char);
            const charMesh = this.createMeshFromCache(cachedGlyph, charPosition, color);
            
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
        }

        return {
            vertices: new Float32Array(allVertices),
            indices: new Uint32Array(allIndices),
            bounds,
            advanceWidth: totalAdvanceWidth,
        };
    }

    /**
     * Create mesh from cached glyph data using the font's configured rendering mode
     */
    private createMeshFromCache(cachedGlyph: CachedGlyph, position: Vec3Like, _color: Vec3Like): TextMesh {
        void _color; // Color is handled in the calling function, not used here
        const vertices: number[] = [];
        const bounds = this.createBounds();

        if (this.filled) {
            // Use filled mesh data
            if (!cachedGlyph.filledVertices || !cachedGlyph.filledIndices) {
                // No filled data available, return empty mesh
                return {
                    vertices: new Float32Array([]),
                    indices: new Uint32Array([]),
                    bounds: {
                        min: vec3.fromValues(position[0], position[1], position[2]),
                        max: vec3.fromValues(position[0], position[1], position[2]),
                    },
                    advanceWidth: this.fontUnitsToWorld(cachedGlyph.advanceWidth),
                };
            }

            // Transform filled vertices to world coordinates
            for (const [x, y] of cachedGlyph.filledVertices) {
                const [finalX, finalY, finalZ] = this.transformPoint(x, y, position);
                vertices.push(finalX, finalY, finalZ);
                this.updateBoundsWithPoint(bounds, finalX, finalY, finalZ);
            }

            return {
                vertices: new Float32Array(vertices),
                indices: new Uint32Array(cachedGlyph.filledIndices),
                bounds,
                advanceWidth: this.fontUnitsToWorld(cachedGlyph.advanceWidth),
            };
        } else {
            // Use wireframe mesh data
            for (const [x, y] of cachedGlyph.wireframeVertices) {
                const [finalX, finalY, finalZ] = this.transformPoint(x, y, position);
                vertices.push(finalX, finalY, finalZ);
                this.updateBoundsWithPoint(bounds, finalX, finalY, finalZ);
            }

            return {
                vertices: new Float32Array(vertices),
                indices: new Uint32Array(cachedGlyph.wireframeIndices),
                bounds,
                advanceWidth: this.fontUnitsToWorld(cachedGlyph.advanceWidth),
            };
        }
    }



    /**
     * Measure text dimensions without creating a mesh
     * Handles newlines by measuring as multiline text
     * @param text Text to measure
     * @returns Object with width, height, and line count information
     */
    measureText(text: string): { width: number; height: number; lineHeight: number } {
        if (!text || text.length === 0) {
            return { width: 0, height: this.fontSize, lineHeight: this.fontSize };
        }

        // If text contains newlines, measure as multiline
        if (text.includes("\n")) {
            const lines = text.split("\n");
            let maxWidth = 0;
            
            for (const line of lines) {
                if (line.trim() === "") continue; // Skip empty lines for width calculation
                
                let lineWidth = 0;
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    // Skip control characters
                    if (char === "\r" || char === "\t") continue;
                    
                    const cachedGlyph = this.getCachedGlyph(char);
                    lineWidth += this.fontUnitsToWorld(cachedGlyph.advanceWidth);
                }
                maxWidth = Math.max(maxWidth, lineWidth);
            }
            
            return {
                width: maxWidth,
                height: Math.max(1, lines.length) * this.fontSize * 1.2, // Ensure at least one line height
                lineHeight: this.fontSize,
            };
        }

        // Single line measurement
        let totalWidth = 0;
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            // Skip control characters
            if (char === "\n" || char === "\r" || char === "\t") continue;
            
            const cachedGlyph = this.getCachedGlyph(char);
            totalWidth += this.fontUnitsToWorld(cachedGlyph.advanceWidth);
        }

        return {
            width: totalWidth,
            height: this.fontSize,
            lineHeight: this.fontSize,
        };
    }

    /**
     * Wrap text to fit within a specified width, breaking at spaces
     * Preserves explicit line breaks (\n) in the input text
     * @param text Text to wrap
     * @param maxWidth Maximum width in world units
     * @returns Array of text lines that fit within maxWidth
     */
    wrapText(text: string, maxWidth: number): string[] {
        if (!text || text.length === 0) {
            return [];
        }

        const lines: string[] = [];
        
        // First split by explicit newlines
        const paragraphs = text.split("\n");
        
        for (const paragraph of paragraphs) {
            if (paragraph.trim() === "") {
                // Empty line - preserve it
                lines.push("");
                continue;
            }
            
            // Wrap each paragraph
            const words = paragraph.split(" ");
            let currentLine = "";

            for (const word of words) {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                const { width } = this.measureText(testLine);

                if (width <= maxWidth) {
                    currentLine = testLine;
                } else {
                    if (currentLine) {
                        lines.push(currentLine);
                        currentLine = word;
                    } else {
                        // Single word exceeds max width - force break
                        lines.push(word);
                    }
                }
            }

            if (currentLine) {
                lines.push(currentLine);
            }
        }

        return lines.length > 0 ? lines : [""];
    }

    /**
     * Generate multi-line text mesh with proper line spacing
     * @param lines Array of text lines
     * @param position Starting position (top-left corner)
     * @param color Text color
     * @param lineSpacing Multiplier for line height spacing (default 1.2)
     * @param topLeftAnchor If true, position is treated as top-left corner; if false, bottom-left (default false for backward compatibility)
     * @returns TextMesh for all lines combined
     */
    generateMultilineText(lines: string[], position: Vec3Like, color: Vec3Like, lineSpacing: number = 1.2, topLeftAnchor: boolean = false): TextMesh {
        if (lines.length === 0) {
            return {
                vertices: new Float32Array([]),
                indices: new Uint32Array([]),
                bounds: {
                    min: vec3.clone(position),
                    max: vec3.clone(position),
                },
                advanceWidth: 0,
            };
        }

        const allVertices: number[] = [];
        const allIndices: number[] = [];
        let vertexOffset = 0;
        let maxWidth = 0;
        
        const bounds = {
            min: vec3.fromValues(Infinity, Infinity, Infinity),
            max: vec3.fromValues(-Infinity, -Infinity, -Infinity),
        };

        const lineHeight = this.fontSize * lineSpacing;

        // Calculate starting Y position based on anchor type (relative to origin)
        let startY: number;
        if (topLeftAnchor) {
            // For top-left anchor, start from the top and move down
            // The first line should be positioned one line height below the anchor point
            startY = -this.fontSize; // Start first line one font size down from top
        } else {
            // For bottom-left anchor (default), start from bottom and move up
            startY = 0;
        }

        // Process each line
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            let lineY: number;
            
            if (topLeftAnchor) {
                // For top-left anchor, move down for each line
                lineY = startY - (lineIndex * lineHeight);
            } else {
                // For bottom-left anchor, move up for each line (original behavior)
                lineY = startY + ((lines.length - 1 - lineIndex) * lineHeight);
            }
            
            const linePosition = vec3.fromValues(
                0, // X position handled by Transform
                lineY,
                0,  // Z position handled by Transform
            );

            const lineMesh = this.generateText(line, linePosition, color);
            
            // Add vertices
            for (let j = 0; j < lineMesh.vertices.length; j++) {
                allVertices.push(lineMesh.vertices[j]);
            }
            
            // Add indices with offset
            for (let j = 0; j < lineMesh.indices.length; j++) {
                allIndices.push(lineMesh.indices[j] + vertexOffset);
            }
            
            vertexOffset += lineMesh.vertices.length / 3;
            
            // Update bounds
            this.updateBounds(bounds, lineMesh.bounds);
            
            // Track maximum width
            maxWidth = Math.max(maxWidth, lineMesh.advanceWidth);
        }

        return {
            vertices: new Float32Array(allVertices),
            indices: new Uint32Array(allIndices),
            bounds,
            advanceWidth: maxWidth,
        };
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            cachedGlyphs: this.glyphCache.size,
            glyphs: Array.from(this.glyphCache.keys()),
        };
    }

    /**
     * Clear glyph cache
     */
    clearCache() {
        this.glyphCache.clear();
    }

    /**
     * Transform a point from font units to world coordinates (with character position but not text block position)
     */
    private transformPoint(fontX: number, fontY: number, position: Vec3Like): [number, number, number] {
        const worldX = this.fontUnitsToWorld(fontX);
        const worldY = this.fontUnitsToWorld(fontY);
        
        // Apply character position (for character advancement) but not overall text position
        // Overall text position is handled by Transform system
        return [
            position[0] + worldX,  // Character X offset (for advancement)
            position[1] + worldY,  // Character Y offset (for line positioning)
            position[2],            // Character Z offset
        ];
    }

    /**
     * Create initial bounds object
     */
    private createBounds(): BoundingBox {
        return {
            min: vec3.fromValues(Infinity, Infinity, Infinity),
            max: vec3.fromValues(-Infinity, -Infinity, -Infinity),
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


