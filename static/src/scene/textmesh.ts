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

import { vec3 } from "gl-matrix";
import { Model } from "./model";
import { Transform } from "./transform";
import { GL, GLC } from "../gl";
import { TextMesh, Font, FontOptions } from "../text";
import { MtlMaterial } from "../bits/obj";

/**
 * Text rendering configuration for Model generation
 */
export interface TextRenderConfig {
    /** Font size in world units */
    fontSize: number;
    /** Line width for wireframe rendering (pixels) - NOTE: Most browsers only support 1.0 */
    lineWidth: number;
    /** RGB color for lines */
    lineColor: vec3;
    /** Position where text should start (lower-left corner of first character) */
    position: vec3;
    /** Number of interpolation steps per curve segment (0 = no interpolation, just control points) */
    splineSteps: number;
}

/**
 * TextRenderer class for managing fonts and generating text meshes
 * Handles font loading, preprocessing, and provides a clean interface for text rendering
 */
export class TextRenderer {
    private font: Font;
    private fontPath: string;

    private constructor(font: Font, fontPath: string) {
        this.font = font;
        this.fontPath = fontPath;
    }

    /**
     * Create a TextRenderer instance from a font file
     * @param fontPath - Path to TTF font file
     * @returns Promise<TextRenderer>
     */
    static async fromFile(fontPath: string): Promise<TextRenderer> {
        // Create a minimal FontOptions just for font loading (actual rendering options are specified later)
        const loadingOptions: FontOptions = {
            fontSize: 1.0,  // Will be overridden during rendering
            lineWidth: 1.0, // Will be overridden during rendering  
            lineColor: vec3.fromValues(1.0, 1.0, 1.0), // Will be overridden during rendering
            splineSteps: 0 // Will be overridden during rendering
        };
        
        const font = await Font.fromFile(fontPath, loadingOptions);
        return new TextRenderer(font, fontPath);
    }

    /**
     * Generate a text mesh with explicit configuration
     * @param text - Text string to render
     * @param config - Complete rendering configuration (no defaults)
     * @returns TextMesh with vertices and indices
     */
    generateTextMesh(text: string, config: TextRenderConfig): TextMesh {
        // Update font options with the provided configuration
        this.font.options.fontSize = config.fontSize;
        this.font.options.lineWidth = config.lineWidth;
        this.font.options.lineColor = vec3.clone(config.lineColor);
        this.font.options.splineSteps = config.splineSteps;
        
        return this.font.generateTextMesh(text, config.position);
    }

    /**
     * Get the font path for this renderer
     */
    get path(): string {
        return this.fontPath;
    }
}

/**
 * Generate a wireframe text Model from a TextMesh
 * @param gl - WebGL context
 * @param textMesh - Text mesh data
 * @param config - Rendering configuration
 * @param text - Text string (for naming purposes)
 * @returns Promise<Model> - A Model configured for wireframe text rendering
 */
export async function createTextModel(
    gl: GLC,
    textMesh: TextMesh,
    config: TextRenderConfig,
    text: string
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
            0, 0            // texture coordinates (not used)
        );
    }
    
    // Create material for wireframe text
    const textMaterial = new MtlMaterial();
    textMaterial.diffuse = vec3.clone(config.lineColor);
    textMaterial.specularExponent = 1;
    
    // Create buffers using Model infrastructure
    const buffers = await Model.makeBuffers(
        gl,
        "", // No texture
        new Float32Array(vertexData),
        new Uint32Array(textMesh.indices)
    );
    
    // Create forward program for wireframe text rendering
    const forwardProgramInfo = await Model.makeForwardProgram(
        gl,
        textMaterial,
        {
            vs: "/static/src/shaders/flat_forward.vert",
            fs: "/static/src/shaders/flat_forward.frag"
        }
    );
    
    // Create transform (position is already applied to vertices, so use origin)
    const transform = new Transform();
    transform.position = vec3.fromValues(0, 0, 0);
    
    // Create the wireframe text model
    const textModel = new Model(
        gl,
        transform,
        buffers,
        forwardProgramInfo,
        textMesh.indices.length / 3, // Number of triangles (though we're drawing lines)
        textMaterial,
        true,  // enabled
        true,  // visible
        `Text: ${text}`
    );
    
    // Set forward rendering properties
    textModel.forwardRendered = true;
    textModel.forwardProgramInfo = forwardProgramInfo;
    textModel.forwardShaderPaths = {
        vs: "/static/src/shaders/flat_forward.vert",
        fs: "/static/src/shaders/flat_forward.frag"
    };
    
    // Set line drawing properties from configuration
    textModel.drawMode = "lines";
    textModel.lineWidth = config.lineWidth;
    textModel.lineColor = vec3.clone(config.lineColor);
    
    // Store indices for line drawing (Model class needs this)
    (textModel as any)._indices = new Uint32Array(textMesh.indices);
    
    // Store raw data for serialization
    textModel.rawVertexData = vertexData;
    textModel.rawIndices = Array.from(textMesh.indices);
    
    return textModel;
}

/**
 * Convenience function to create a text Model with explicit parameters
 * @param gl - WebGL context
 * @param textRenderer - Pre-loaded text renderer
 * @param text - Text string to render
 * @param config - Complete rendering configuration (no defaults)
 * @returns Promise<Model> - A Model configured for wireframe text rendering
 */
export async function createTextModelFromRenderer(
    gl: GLC,
    textRenderer: TextRenderer,
    text: string,
    config: TextRenderConfig
): Promise<Model> {
    const textMesh = textRenderer.generateTextMesh(text, config);
    return createTextModel(gl, textMesh, config, text);
}

 