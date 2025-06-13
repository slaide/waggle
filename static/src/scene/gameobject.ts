"use strict";

import { GL, GLC } from "../gl";
import { parsePng } from "../bits/png";
import { MtlMaterial, ObjFile } from "../bits/obj";
import { vec3 } from "gl-matrix";
import { Transform } from "./transform";
import { TYPE_REGISTRY, makeStruct, asObj } from "../struct";
import { 
    Serializable, 
    SerializableStatic, 
    SceneObject, 
    isSceneObject,
    BaseSceneObject,
    MeshObject,
    PointLightObject,
    DirectionalLightObject,
    SceneTransform
} from "./scene_format";

// Define vector types for reuse
const Vec3 = TYPE_REGISTRY.f32.array(3);
type Vec3Type=number[];
const Vec2 = TYPE_REGISTRY.f32.array(2);
type Vec2Type=number[];
const VertexData=makeStruct([
    { name: 'position', type: Vec3 },
    { name: 'normal', type: Vec3 },
    { name: 'texCoord', type: Vec2 }
]);
// Define the field types for type safety
type VertexDataType={
    position:Vec3Type;
    normal:Vec3Type;
    texCoord:Vec2Type;
};

type ProgramInfo = {
    program: WebGLProgram;
    attributeLocations: { [name: string]: GLint };
    uniformLocations: { [name: string]: WebGLUniformLocation };
    shaderSources: { vs: string, fs: string };
};

type Buffer = {
    vertexData: WebGLBuffer;
    indices: WebGLBuffer;
    texture: WebGLTexture;
};

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
export class GameObject implements Serializable<GameObject> {
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
    toJSON(): SceneObject {
        return {
            type: this.type,
            name: this.name,
            enabled: this.enabled,
            visible: this.visible,
            transform: {
                position: Array.from(this.transform.position) as [number, number, number],
                rotation: Array.from(this.transform.rotation) as [number, number, number, number],
                scale: Array.from(this.transform.scale) as [number, number, number]
            }
        } as SceneObject;
    }

    // Base deserialization
    static async fromJSON(gl: GLC, data: SceneObject): Promise<GameObject> {
        if (!isSceneObject(data)) {
            throw new Error("Invalid game object data format");
        }

        const transform = Transform.fromJSON(data.transform);
        
        // Import dynamically to avoid circular dependencies
        const { Model } = await import("./model");
        const { PointLight, DirectionalLight } = await import("./light");
        
        const type = (data as BaseSceneObject).type;
        switch (type) {
            case "mesh":
                return Model.fromJSON(gl, data as MeshObject);
            case "point_light":
                return PointLight.fromJSON(gl, data as PointLightObject);
            case "directional_light":
                return DirectionalLight.fromJSON(gl, data as DirectionalLightObject);
            default:
                throw new Error(`Unknown object type: ${type}`);
        }
    }
}
