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
        
        return factory(gl, data);
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
    
    get material(): any { return undefined; }
    set material(_: any) {}
    
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

    // Getter to determine if object should be drawn
    get shouldDraw(): boolean {
        return this.visible && this.enabled;
    }

    // Base draw method - to be overridden by subclasses
    draw() {
        // Base implementation does nothing
    }

    // Base upload method - to be overridden by subclasses
    upload() {
        // Base implementation does nothing
    }

    // Base serialization
    toJSON() {
        return {
            type: this.type,
            name: this.name,
            enabled: this.enabled,
            visible: this.visible,
            transform: this.transform.toJSON()
        };
    }

    // Simplified deserialization using the registry
    static async fromJSON(gl: GLC, data: any): Promise<GameObject> {
        return GameObjectRegistry.create(gl, data);
    }
}
