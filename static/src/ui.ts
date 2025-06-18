/**
 * UI Components for Waggle WebGL2 Framework
 * 
 * This module provides reusable UI components for creating rich user interfaces:
 * - UIPanel: Background panels with configurable colors and borders
 * - UIContainer: Layout containers for organizing UI elements
 * - Text wrapping and layout utilities
 */

import { vec3, type Vec3Like } from "gl-matrix";
import { Model } from "./scene/model";
import { Transform } from "./scene/transform";
import { GL, GLC } from "./gl";
import { MtlMaterial } from "./bits/obj";
import { Font } from "./text";
import { createTextModel } from "./scene/textmesh";

/**
 * UI Panel configuration
 */
export interface UIPanelConfig {
    /** Panel width in screen space units */
    width: number;
    /** Panel height in screen space units */
    height: number;
    /** Background color (RGBA) */
    backgroundColor: Vec3Like;
    /** Background alpha (0-1) */
    backgroundAlpha?: number;
    /** Border color (optional) */
    borderColor?: Vec3Like;
    /** Border width in pixels (optional) */
    borderWidth?: number;
    /** Corner radius for rounded corners (optional) */
    cornerRadius?: number;
}

/**
 * UI Text configuration for panels
 */
export interface UITextConfig {
    /** Text content */
    text: string;
    /** Text color */
    color: Vec3Like;
    /** Maximum width for text wrapping */
    maxWidth?: number;
    /** Line spacing multiplier */
    lineSpacing?: number;
    /** Text alignment */
    alignment?: "left" | "center" | "right";
}

/**
 * Create a rectangular panel mesh for UI backgrounds
 */
export function createPanelMesh(config: UIPanelConfig): { vertices: Float32Array; indices: Uint32Array } {
    const { width, height } = config;
    
    // Create vertices for a rectangle (two triangles)
    const vertices = new Float32Array([
        // Triangle 1
        0,     0,      0,  0, 0, 1,  0, 0,  // bottom-left
        width, 0,      0,  0, 0, 1,  1, 0,  // bottom-right
        width, height, 0,  0, 0, 1,  1, 1,  // top-right
        
        // Triangle 2
        0,     0,      0,  0, 0, 1,  0, 0,  // bottom-left
        width, height, 0,  0, 0, 1,  1, 1,  // top-right
        0,     height, 0,  0, 0, 1,  0, 1,  // top-left
    ]);
    
    const indices = new Uint32Array([0, 1, 2, 3, 4, 5]);
    
    return { vertices, indices };
}

/**
 * UI Panel class - represents a rectangular background panel
 */
export class UIPanel {
    public model: Model;
    public transform: Transform;
    public textElements: Model[] = [];
    private config: UIPanelConfig;
    
    constructor(
        private gl: GLC,
        config: UIPanelConfig,
        position: Vec3Like = vec3.create(),
    ) {
        this.config = config;
        this.transform = new Transform();
        this.transform.position = vec3.clone(position);
        
        // Create the panel model (will be initialized in init())
        this.model = null as any; // Will be set in init()
    }
    
    /**
     * Initialize the panel - must be called after construction
     */
    async init(): Promise<void> {
        const { vertices, indices } = createPanelMesh(this.config);
        
        // Create material
        const material = new MtlMaterial();
        material.diffuse = vec3.clone(this.config.backgroundColor);
        material.ambient = vec3.fromValues(0.1, 0.1, 0.1);
        material.specular = vec3.fromValues(0.1, 0.1, 0.1);
        material.specularExponent = 1;
        
        // Create buffers
        const buffers = await Model.makeBuffers(this.gl, "", vertices, indices);
        
        // Create shader program using flat_forward for UI panels
        const shaderPaths = {
            vs: "/static/src/shaders/flat_forward.vert",
            fs: "/static/src/shaders/flat_forward.frag",
        };
        
        const programInfo = await Model.makeForwardProgram(this.gl, material, shaderPaths);
        
        // Create the model
        this.model = new Model(
            this.gl,
            this.transform,
            buffers,
            programInfo,
            indices.length / 3, // triangles
            material,
            true,  // enabled
            true,  // visible
            "UI Panel",
        );
        
        // Set up for forward rendering
        this.model.forwardRendered = true;
        this.model.forwardProgramInfo = programInfo;
        this.model.forwardShaderPaths = shaderPaths;
        this.model.drawMode = "triangles";
        
        // Enable blending for transparency
        (this.model as any).useBlending = true;
        (this.model as any).blendSrc = GL.SRC_ALPHA;
        (this.model as any).blendDst = GL.ONE_MINUS_SRC_ALPHA;
    }
    
    /**
     * Add text to the panel
     */
    async addText(font: Font, textConfig: UITextConfig, offsetX: number = 10, offsetY: number = 10): Promise<Model> {
        const { text, color, maxWidth, lineSpacing = 1.2 } = textConfig;
        
        // Determine effective max width
        const effectiveMaxWidth = maxWidth || (this.config.width - offsetX * 2);
        
        // Wrap text if needed
        const lines = font.wrapText(text, effectiveMaxWidth);
        
        // Calculate text position relative to panel (origin at bottom-left)
        // For UI panels, we want text positioned from top-left, so invert Y
        const textPosition = vec3.fromValues(0, 0, 0); // Generate text at origin first
        
        // Generate multiline text mesh with top-left anchoring for UI
        const textMesh = font.generateMultilineText(lines, textPosition, color, lineSpacing, true);
        
        // Create text model
        const textModel = await createTextModel(
            this.gl,
            textMesh,
            { color, position: textPosition },
            text,
            font.config.filled,
            font.config.lineWidth,
        );
        
        // Position text relative to panel: from top-left corner with offset
        // Panel coordinates: (0,0) = bottom-left, (width,height) = top-right
        // For top-left anchored text, position at the top of the panel
        textModel.transform.position = vec3.fromValues(
            offsetX, 
            this.config.height - offsetY, // Top of panel minus offset
            0.1, // Slightly in front of panel
        );
        
        // Set up parent-child relationship so text moves with panel
        textModel.transform.parent = this.transform;
        
        // Add to our text elements
        this.textElements.push(textModel);
        
        return textModel;
    }
    
    /**
     * Clear all text elements
     */
    clearText(): void {
        this.textElements = [];
    }
    
    /**
     * Get all renderable elements (panel + text)
     * Returns panel first, then text elements to ensure proper rendering order
     */
    getAllElements(): Model[] {
        return [this.model, ...this.textElements];
    }
    
    /**
     * Get elements in separate categories for different rendering passes
     */
    getBackgroundElements(): Model[] {
        return [this.model];
    }
    
    getTextElements(): Model[] {
        return this.textElements;
    }
    
    /**
     * Update panel position
     */
    setPosition(position: Vec3Like): void {
        vec3.copy(this.transform.position, position);
        this.transform.markDirty();
    }
    
    /**
     * Get panel bounds
     */
    getBounds(): { width: number; height: number } {
        return {
            width: this.config.width,
            height: this.config.height,
        };
    }
}

/**
 * UI Container for organizing multiple UI elements
 */
export class UIContainer {
    public elements: (UIPanel | Model)[] = [];
    public transform: Transform;
    
    constructor(position: Vec3Like = vec3.create()) {
        this.transform = new Transform();
        this.transform.position = vec3.clone(position);
    }
    
    /**
     * Add an element to the container
     */
    addElement(element: UIPanel | Model): void {
        this.elements.push(element);
    }
    
    /**
     * Remove an element from the container
     */
    removeElement(element: UIPanel | Model): void {
        const index = this.elements.indexOf(element);
        if (index !== -1) {
            this.elements.splice(index, 1);
        }
    }
    
    /**
     * Get all renderable models from all elements
     */
    getAllModels(): Model[] {
        const models: Model[] = [];
        
        for (const element of this.elements) {
            if (element instanceof UIPanel) {
                models.push(...element.getAllElements());
            } else {
                models.push(element);
            }
        }
        
        return models;
    }
    
    /**
     * Update container position (affects all child elements)
     */
    setPosition(position: Vec3Like): void {
        const deltaX = position[0] - this.transform.position[0];
        const deltaY = position[1] - this.transform.position[1];
        const deltaZ = position[2] - this.transform.position[2];
        
        vec3.copy(this.transform.position, position);
        
        // Update all child element positions
        for (const element of this.elements) {
            if (element instanceof UIPanel) {
                const currentPos = element.transform.position;
                element.setPosition(vec3.fromValues(
                    currentPos[0] + deltaX,
                    currentPos[1] + deltaY,
                    currentPos[2] + deltaZ,
                ));
            } else {
                const currentPos = element.transform.position;
                vec3.add(currentPos, currentPos, vec3.fromValues(deltaX, deltaY, deltaZ));
                element.transform.markDirty();
            }
        }
    }
}

/**
 * Utility functions for UI layout
 */
export class UILayoutUtils {
    /**
     * Format transform data for display
     */
    static formatTransformData(transform: Transform): string {
        const pos = transform.position;
        const rot = transform.rotation;
        const scale = transform.scale;
        
        // Format with shorter labels to prevent wrapping
        const posStr = `Pos: (${pos[0].toFixed(2)}, ${pos[1].toFixed(2)}, ${pos[2].toFixed(2)})`;
        const rotStr = `Rot: (${rot[0].toFixed(2)}, ${rot[1].toFixed(2)}, ${rot[2].toFixed(2)}, ${rot[3].toFixed(2)})`;
        const scaleStr = `Scale: (${scale[0].toFixed(2)}, ${scale[1].toFixed(2)}, ${scale[2].toFixed(2)})`;
        
        return `${posStr}\n${rotStr}\n${scaleStr}`;
    }
    
    /**
     * Calculate safe panel position to avoid screen edges
     */
    static calculateSafePanelPosition(
        panelWidth: number, 
        panelHeight: number, 
        screenWidth: number, 
        screenHeight: number,
        mouseX?: number,
        mouseY?: number,
    ): Vec3Like {
        let x = mouseX ?? screenWidth * 0.7;
        let y = mouseY ?? screenHeight * 0.3;
        
        // Ensure panel doesn't go off screen
        if (x + panelWidth > screenWidth / 2) {
            x = screenWidth / 2 - panelWidth - 20;
        }
        if (x < -screenWidth / 2) {
            x = -screenWidth / 2 + 20;
        }
        
        if (y + panelHeight > screenHeight / 2) {
            y = screenHeight / 2 - panelHeight - 20;
        }
        if (y < -screenHeight / 2) {
            y = -screenHeight / 2 + 20;
        }
        
        return vec3.fromValues(x, y, 0);
    }
} 