import { GL, GLC } from "../gl";
import { Transform } from "./transform";

type ProgramInfo = {
    program: WebGLProgram;
    attributeLocations: { [name: string]: GLint };
    uniformLocations: { [name: string]: WebGLUniformLocation };
    shaderSources: { vs: string, fs: string };
};

// Type for the fromJSON factory function
type GameObjectFactory = (gl: GLC, data: any) => Promise<GameObject>;

// Central registry for GameObject types
export class GameObjectRegistry {
    private static factories = new Map<string, GameObjectFactory>();
    
    // Register a GameObject type with its factory function
    static register(type: string, factory: GameObjectFactory): void {
        this.factories.set(type, factory);
    }
    
    // Create a GameObject instance from JSON data using the registry
    static async create(gl: GLC, data: any): Promise<GameObject> {
        // Type guard inline
        if (typeof data !== 'object' || data === null) {
            throw new Error("Invalid game object data format");
        }
        
        if (!data.type || typeof data.type !== 'string') {
            throw new Error("Game object must have a type field");
        }
        
        const factory = this.factories.get(data.type);
        if (!factory) {
            throw new Error(`Unknown or unregistered object type: ${data.type}`);
        }
        
        const gameObject = await factory(gl, data);
        
        // Handle children if they exist
        if (data.children && Array.isArray(data.children)) {
            for (const childData of data.children) {
                const child = await this.create(gl, childData);
                gameObject.addChild(child);
            }
        }
        
        return gameObject;
    }
    
    // Get all registered types (useful for debugging)
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
        const error = `shader compilation failed`;
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
export class GameObject {
    public type: "mesh" | "point_light" | "directional_light";
    public programInfo?: ProgramInfo;
    public forwardProgramInfo?: ProgramInfo;  // New program info for forward rendering
    public children: GameObject[] = [];
    private _parent?: GameObject;
    private _forwardRendered: boolean = false;  // New flag for forward rendering
    private _forwardShaderPaths?: { vs: string, fs: string };  // Custom forward shader paths
    
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
    
    constructor(
        public gl: GLC,
        public transform: Transform,
        public enabled: boolean = true,
        public visible: boolean = true,
        public name?: string,
    ) {
        // Type must be set by derived classes
        this.type = "mesh" as const;
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
        child.updateWorldTransforms();
    }

    removeChild(child: GameObject) {
        const index = this.children.indexOf(child);
        if (index !== -1) {
            this.children.splice(index, 1);
            child._parent = undefined;
            child.updateWorldTransforms();
        }
    }

    // Update world transforms for this object and all children recursively
    updateWorldTransforms() {
        this.transform.markDirty();
        
        for (const child of this.children) {
            child.transform.markDirty();
            child.updateWorldTransforms();
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
        this.draw();
    }

    // Base upload method - to be overridden by subclasses
    upload() {
        // Base implementation does nothing
    }

    // Base serialization
    toJSON() {
        const result: any = {
            type: this.type,
            name: this.name,
            enabled: this.enabled,
            visible: this.visible,
            forwardRendered: this._forwardRendered,  // Include forward rendering flag
            forwardShaderPaths: this._forwardShaderPaths,  // Include custom shader paths
            transform: this.transform.toJSON()
        };

        if (this.children.length > 0) {
            result.children = this.children.map(child => child.toJSON());
        }

        return result;
    }

    // Simplified deserialization using the registry
    static async fromJSON(gl: GLC, data: any): Promise<GameObject> {
        return GameObjectRegistry.create(gl, data);
    }
}
