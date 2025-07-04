/**
 * TextMesh - Text rendering for WebGL2
 * 
 * IMPORTANT: WebGL LineWidth Limitations
 * =====================================
 * 
 * The `lineWidth` parameter in TextRenderConfig has severe limitations in modern browsers:
 * 
 * 1. **Most browsers only support lineWidth = 1.0**
 *    - Desktop browsers may support slightly wider lines (typically 1.0-10.0)
 *    - Mobile browsers almost universally only support 1.0
 *    - Any value > 1.0 is often ignored or clamped to 1.0
 * 
 * 2. **WebGL2 Specification Issue**
 *    - The WebGL spec allows implementations to support only lineWidth = 1.0
 *    - This is a cross-platform compatibility issue, not a bug
 * 
 * 3. **Current Behavior**
 *    - The code will warn when lineWidth exceeds the supported range
 *    - LineWidth is automatically clamped to the maximum supported value
 *    - Text may appear thinner than expected
 * 
 * 4. **Alternative Solutions for Thick Lines**
 *    - Use larger fontSize instead of lineWidth for thicker appearance
 *    - Implement geometry-based thick lines (convert lines to quads/triangles)
 *    - Use multiple parallel lines with slight offsets
 *    - Consider using filled polygons instead of wireframes
 * 
 * 5. **Recommended Approach**
 *    - Set lineWidth = 1.0 and rely on fontSize for thickness control
 *    - Use bright colors for better visibility
 *    - Consider adding a background or outline for better contrast
 */

import { vec3, Vec3Like } from "gl-matrix";
import { Model } from "./model";
import { Transform } from "./transform";
import { GLC } from "../gl";
import { TextMesh } from "../text";
import { MtlMaterial } from "../parsers/obj";

/**
 * Text rendering configuration for Model generation
 */
export interface TextRenderConfig {
    /** RGB color for text (both wireframe lines and filled triangles) */
    color: Vec3Like;
    /** Position where text should start (lower-left corner of first character) */
    position: Vec3Like;
}



/**
 * Generate a text Model from a TextMesh or FilledTextMesh
 * @param gl - WebGL context
 * @param textMesh - Text mesh data (wireframe or filled)
 * @param config - Rendering configuration
 * @param text - Text string (for naming purposes)
 * @param filled - Whether the mesh is filled (triangles) or wireframe (lines)
 * @param lineWidth - Line width for wireframe rendering
 * @returns Promise<Model> - A Model configured for text rendering
 */
export async function createTextModel(
    gl: GLC,
    textMesh: TextMesh,
    config: TextRenderConfig,
    text: string,
    filled: boolean,
    lineWidth: number = 1.0,
): Promise<Model> {
    // Convert text mesh vertices to Model format (8 components per vertex)
    const vertexData: number[] = [];
    const numVertices = textMesh.vertices.length / 3;
    
    for (let i = 0; i < numVertices; i++) {
        const x = textMesh.vertices[i * 3];
        const y = textMesh.vertices[i * 3 + 1];
        const z = textMesh.vertices[i * 3 + 2];
        
        vertexData.push(
            x, y, z,        // position
            0, 0, 1,        // normal (pointing forward)
            0, 0,            // texture coordinates (not used)
        );
    }
    
    // Create material for text rendering
    const textMaterial = new MtlMaterial();
    textMaterial.diffuse = vec3.clone(config.color);
    textMaterial.specularExponent = 1;
    
    // For filled text, ensure proper material properties
    if (filled) {
        textMaterial.ambient = vec3.fromValues(0.1, 0.1, 0.1); // Small ambient component
        textMaterial.specular = vec3.fromValues(0.2, 0.2, 0.2); // Small specular component
    }
    
    // Create buffers using Model infrastructure
    const buffers = await Model.makeBuffers(
        gl,
        "", // No texture
        new Float32Array(vertexData),
        new Uint32Array(textMesh.indices),
    );
    
    // Create forward program based on filled vs wireframe mode
    // Use flat_forward shaders for both filled and wireframe text to avoid UBO issues
    const shaderPaths = {
        vs: "/static/src/shaders/flat_forward.vert",
        fs: "/static/src/shaders/flat_forward.frag",
    };
    
    const forwardProgramInfo = await Model.makeForwardProgram(
        gl,
        textMaterial,
        shaderPaths,
    );
    
    // Create transform - set position from config since vertices are now at origin
    const transform = new Transform();
    transform.position = vec3.clone(config.position);
    
    // Calculate number of primitives based on mesh type
    const primitiveCount = filled 
        ? textMesh.indices.length / 3  // Triangles
        : textMesh.indices.length / 2; // Lines
    
    // Create the text model
    const textModel = new Model(
        gl,
        transform,
        buffers,
        forwardProgramInfo,
        primitiveCount,
        textMaterial,
        true,  // enabled
        true,  // visible
        `Text ${filled ? "(filled)" : "(wireframe)"}: ${text}`,
    );
    
    // Set forward rendering properties
    textModel.forwardRendered = true;
    textModel.forwardProgramInfo = forwardProgramInfo;
    textModel.forwardShaderPaths = shaderPaths;
    
    // Set rendering mode and properties based on mesh type
    if (filled) {
        textModel.drawMode = "triangles";
        
        // Note: Face culling is handled by the WebGL state, not per-model
        // For text rendering, face culling should be disabled globally when needed
        
        // For filled rendering, use the material's diffuse color
    } else {
        textModel.drawMode = "lines";
        textModel.lineWidth = lineWidth;
        textModel.lineColor = vec3.clone(config.color);
    }
    
    // Store indices for line drawing (Model class needs this)
    // Note: This is handled by the Model's internal buffer management
    
    // Store raw data for serialization
    textModel.rawVertexData = vertexData;
    textModel.rawIndices = Array.from(textMesh.indices);
    
    return textModel;
}

 