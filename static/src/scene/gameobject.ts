import { GL, GLC } from "../gl";
import { Transform } from "./transform";
import { Vec3Like } from "gl-matrix";

type ProgramInfo = {
    program: WebGLProgram;
    attributeLocations: { [name: string]: GLint };
    uniformLocations: { [name: string]: WebGLUniformLocation };
    shaderSources: { vs: string, fs: string };
};

// Type for serialized transform data (matches Transform.toJSON() output)
export interface SerializedTransform {
    position: [number, number, number];
    rotation: [number, number, number, number];
    scale: [number, number, number];
}

// Base serialized GameObject structure
export interface BaseSerializedGameObject {
    type: string;
    name?: string;
    enabled: boolean;
    visible: boolean;
    forwardRendered: boolean;
    forwardShaderPaths?: { vs: string; fs: string };
    transform: SerializedTransform;
    children?: BaseSerializedGameObject[];
}

// Contract that all serializable GameObjects must implement
export interface Serializable<TSerializedType> {
    toJSON(): TSerializedType;
}

// Type for the fromJSON factory function
type GameObjectFactory = (gl: GLC, data: BaseSerializedGameObject) => Promise<GameObject>;

// Registry to store GameObject factory functions by type
export class GameObjectRegistry {
    private static factories: Map<string, GameObjectFactory> = new Map();
    
    static register(type: string, factory: GameObjectFactory) {
        this.factories.set(type, factory);
    }
    
    static async create(gl: GLC, data: BaseSerializedGameObject): Promise<GameObject> {
        if (!data.type) {
            throw new Error("GameObject data must have a type property");
        }
        
        const factory = this.factories.get(data.type);
        if (!factory) {
            throw new Error(`Unknown GameObject type: ${data.type}`);
        }
        
        // Create the main object
        const gameObject = await factory(gl, data);
        
        // Recursively create and attach children
        if (data.children && data.children.length > 0) {
            for (const childData of data.children) {
                const child = await this.create(gl, childData);
                gameObject.addChild(child);
            }
        }
        
        return gameObject;
    }
    
    static getRegisteredTypes(): string[] {
        return Array.from(this.factories.keys());
    }
}

function createShaderStage(
    gl: GLC,
    stage: "vert" | "frag",
    source: string,
): WebGLShader {
    const shader = gl.createShader(
        {
            vert: GL.VERTEX_SHADER,
            frag: GL.FRAGMENT_SHADER,
        }[stage],
    );
    if (!shader) {
        const error = "shader compilation failed";
        console.error(error);
        throw error;
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, GL.COMPILE_STATUS)) {
        const error = `error compiling shader ${gl.getShaderInfoLog(shader)}`;
        alert(error);
        throw error;
    }

    return shader;
}

export async function createShaderProgram(
    gl: GLC,
    stageSources: {
        fs: string;
        vs: string;
    },
): Promise<WebGLProgram> {
    const { vs, fs } = stageSources;

    const vsShader = createShaderStage(gl, "vert", vs);
    const fsShader = createShaderStage(gl, "frag", fs);

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vsShader);
    gl.attachShader(shaderProgram, fsShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, GL.LINK_STATUS)) {
        const error = `failed to create shader because ${gl.getProgramInfoLog(shaderProgram)}`;
        alert(error);
        throw error;
    }

    const vsinfo = gl.getShaderInfoLog(vsShader);
    if (vsinfo?.length ?? 0 > 0) {
        const error = `vs shader info: ${vsinfo}`;
        alert(error);
        throw error;
    }
    const fsinfo = gl.getShaderInfoLog(fsShader);
    if (fsinfo?.length ?? 0 > 0) {
        const error = `fs shader info: ${fsinfo}`;
        alert(error);
        throw error;
    }

    return shaderProgram;
}

// Base class for all game objects
export class GameObject implements Serializable<BaseSerializedGameObject> {
    // Static counter for globally unique IDs
    private static nextId: number = 1;
    
    // Globally unique identifier for this GameObject instance
    public readonly id: number;
    
    public type: "mesh" | "point_light" | "directional_light";
    public programInfo?: ProgramInfo;
    public forwardProgramInfo?: ProgramInfo;
    public children: GameObject[] = [];
    private _parent?: GameObject;
    private _forwardRendered: boolean = false;
    private _forwardShaderPaths?: { vs: string, fs: string };
    
    // Line drawing properties
    private _drawMode: "triangles" | "lines" = "triangles";
    private _lineWidth: number = 1.0;
    private _lineColor?: Vec3Like;
    
    get material(): any { return undefined; }
    set material(_: any) {}
    
    // New getter/setter for forward rendering flag
    get forwardRendered(): boolean {
        return this._forwardRendered;
    }
    
    set forwardRendered(value: boolean) {
        this._forwardRendered = value;
    }
    
    // Getter/setter for custom forward shader paths
    get forwardShaderPaths(): { vs: string, fs: string } | undefined {
        return this._forwardShaderPaths;
    }
    
    set forwardShaderPaths(paths: { vs: string, fs: string } | undefined) {
        this._forwardShaderPaths = paths;
    }
    
    // Line drawing getters/setters
    get drawMode(): "triangles" | "lines" {
        return this._drawMode;
    }
    
    set drawMode(mode: "triangles" | "lines") {
        this._drawMode = mode;
    }
    
    get lineWidth(): number {
        return this._lineWidth;
    }
    
    set lineWidth(width: number) {
        this._lineWidth = Math.max(0.1, width); // Ensure minimum line width
    }
    
    get lineColor(): Vec3Like | undefined {
        return this._lineColor;
    }
    
    set lineColor(color: Vec3Like | undefined) {
        this._lineColor = color;
    }
    
    constructor(
        public gl: GLC,
        public transform: Transform,
        public enabled: boolean = true,
        public visible: boolean = true,
        public name?: string,
    ) {
        this.id = GameObject.nextId++;
        this.type = "mesh" as const;
    }

    // Static method to set the next ID (useful for deserialization)
    static setNextId(id: number): void {
        GameObject.nextId = Math.max(GameObject.nextId, id);
    }

    // Parent-child relationship management
    get parent(): GameObject | undefined {
        return this._parent;
    }

    addChild(child: GameObject) {
        if (child._parent) {
            child._parent.removeChild(child);
        }
        
        this.children.push(child);
        child._parent = this;
        
        // Set up transform parent relationship
        child.transform.parent = this.transform;
        
        child.updateWorldTransforms();
    }

    removeChild(child: GameObject) {
        const index = this.children.indexOf(child);
        if (index !== -1) {
            this.children.splice(index, 1);
            child._parent = undefined;
            
            // Clear transform parent relationship
            child.transform.parent = undefined;
            
            child.updateWorldTransforms();
        }
    }

    // Update world transforms for this object and all children recursively
    updateWorldTransforms() {
        // Use the new transform system's updateWorldMatrix method
        this.transform.updateWorldMatrix();
    }
    
    // Method to ensure all transforms are up to date (useful after scene loading)
    ensureTransformsUpdated() {
        this.transform.updateWorldMatrix();
        
        // Recursively ensure children are updated
        for (const child of this.children) {
            child.ensureTransformsUpdated();
        }
    }

    // Traverse this object and all its children
    traverse(callback: (obj: GameObject, depth: number) => void, depth: number = 0) {
        callback(this, depth);
        
        for (const child of this.children) {
            child.traverse(callback, depth + 1);
        }
    }

    // Getter to determine if object should be drawn
    get shouldDraw(): boolean {
        return this.visible && this.enabled;
    }

    // Base draw method - to be overridden by subclasses
    draw() {
        // Base implementation does nothing
        // Children are drawn by the scene traversal system
    }

    // Draw method with explicit world matrix - to be overridden by subclasses
    drawWithMatrix(worldMatrix: Float32Array, viewMatrix?: Float32Array, projectionMatrix?: Float32Array) {
        // Default implementation just calls regular draw
        // Parameters are intentionally unused in base class but required for subclass override compatibility
        void worldMatrix; // Explicitly mark as unused
        void viewMatrix;
        void projectionMatrix;
        this.draw();
    }

    // Base upload method - to be overridden by subclasses
    upload() {
        // Base implementation does nothing
    }

    // Serialization implementation
    toJSON(): BaseSerializedGameObject {
        const result: BaseSerializedGameObject = {
            type: this.type,
            name: this.name,
            enabled: this.enabled,
            visible: this.visible,
            forwardRendered: this._forwardRendered,
            forwardShaderPaths: this._forwardShaderPaths,
            transform: this.transform.toJSON(),
        };

        if (this.children.length > 0) {
            result.children = this.children.map(child => child.toJSON());
        }

        return result;
    }

    // Deserialization
    static async fromJSON(gl: GLC, data: BaseSerializedGameObject): Promise<GameObject> {
        return GameObjectRegistry.create(gl, data);
    }
}
