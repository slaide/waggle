import { GL, GLC } from "../gl";
import { parsePng } from "../bits/png";
import { MtlMaterial, ObjFile } from "../bits/obj";
import { vec3 } from "gl-matrix";
import { Transform } from "./transform";
import { TYPE_REGISTRY, makeStruct } from "../struct";
import { GameObject } from "./gameobject";

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

async function createShaderProgram(
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

// Model class for renderable objects
// Note: We use typed arrays internally for performance, but convert to regular arrays for serialization
export class Model extends GameObject {
    public type = "mesh" as const;
    // Internal storage using typed arrays for performance
    private _rawVertexData?: number[];
    private _rawIndices?: number[];
    private _rawTexturePath?: string;
    private _rawShaderSources?: { vs: string, fs: string };
    private _material?: MtlMaterial;
    // Add private fields for internal use
    private _vertexData: Float32Array = new Float32Array();
    private _indices: Uint32Array = new Uint32Array();

    constructor(
        gl: GLC,
        transform: Transform,
        public buffers: Buffer,
        public programInfo: ProgramInfo,
        public numTris: number = 0,
        material?: MtlMaterial,
        enabled: boolean = true,
        visible: boolean = true,
        name?: string,
    ) {
        super(gl, transform, enabled, visible, name);
        this._material = material;
    }

    // Getters for serialization
    get rawVertexData(): number[] | undefined {
        return this._rawVertexData;
    }

    get rawIndices(): number[] | undefined {
        return this._rawIndices;
    }

    get rawTexturePath(): string | undefined {
        return this._rawTexturePath;
    }

    get rawShaderSources(): { vs: string, fs: string } | undefined {
        return this._rawShaderSources;
    }

    get material() {
        if (!this._material) return undefined;
        return {
            diffuse: this._material.diffuse ? new Float32Array([
                this._material.diffuse[0],
                this._material.diffuse[1],
                this._material.diffuse[2]
            ]) : undefined,
            specularExponent: this._material.specularExponent,
            diffuseTexture: this._material.map_diffuse?.source
        };
    }

    // Setters for deserialization
    set rawVertexData(data: number[] | undefined) {
        this._rawVertexData = data;
    }

    set rawIndices(data: number[] | undefined) {
        this._rawIndices = data;
    }

    set rawTexturePath(path: string | undefined) {
        this._rawTexturePath = path;
    }

    set rawShaderSources(sources: { vs: string, fs: string } | undefined) {
        this._rawShaderSources = sources;
    }

    set material(mat: any) {
        if (!mat) {
            this._material = undefined;
            return;
        }
        this._material = new MtlMaterial();
        if (mat.diffuse) {
            this._material.diffuse = vec3.fromValues(mat.diffuse[0], mat.diffuse[1], mat.diffuse[2]);
        }
        this._material.specularExponent = mat.specularExponent ?? 1.0;
        if (mat.diffuseTexture) {
            this._material.map_diffuse = { source: mat.diffuseTexture };
        }
    }

    override get shouldDraw(): boolean {
        return super.shouldDraw && !!this.programInfo;
    }

    override upload() {
        // All buffers are created during construction
        // This method is for compatibility with the GameObject interface
    }

    // sets up uniforms for lighting
    setUniforms(
        viewMatrix: Float32Array,
        projectionMatrix: Float32Array,
        lightData: {
            pointLights?: Array<{
                position: Float32Array;
                color: Float32Array;
                intensity: number;
                radius: number;
            }>;
            directionalLights?: Array<{
                direction: Float32Array;
                color: Float32Array;
                intensity: number;
            }>;
        } = {}
    ) {
        if (!this.programInfo) return;

        const gl = this.gl;
        const modelMatrix = this.transform.matrix;

        // Activate the shader program first
        gl.useProgram(this.programInfo.program);

        // Set transformation matrices
        gl.uniformMatrix4fv(
            this.programInfo.uniformLocations.uModelMatrix,
            false,
            modelMatrix,
        );
        gl.uniformMatrix4fv(
            this.programInfo.uniformLocations.uViewMatrix,
            false,
            viewMatrix,
        );
        gl.uniformMatrix4fv(
            this.programInfo.uniformLocations.uProjectionMatrix,
            false,
            projectionMatrix,
        );

        // Set material properties
        if (this._material) {
            if (this._material.diffuse) {
                gl.uniform4fv(
                    this.programInfo.uniformLocations.uDiffuseColor,
                    new Float32Array([this._material.diffuse[0], this._material.diffuse[1], this._material.diffuse[2], 1.0]),
                );
            } else {
                gl.uniform4fv(
                    this.programInfo.uniformLocations.uDiffuseColor,
                    new Float32Array([1, 1, 1, 1])
                );
            }

            gl.uniform1f(
                this.programInfo.uniformLocations.uSpecularExponent,
                this._material.specularExponent || 32,
            );
        }

        // Note: Lighting is handled in the deferred rendering pass, not here
        // This shader just outputs to G-buffer (position, normal, albedo+specular)

        // Set texture usage flag
        const useTexture = !!(this._material?.map_diffuse);
        gl.uniform1i(this.programInfo.uniformLocations.uUseDiffuseTexture, useTexture ? 1 : 0);
        
        if (useTexture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.buffers.texture);
            gl.uniform1i(this.programInfo.uniformLocations.uDiffuseSampler, 0);
        }
    }

    override draw() {
        if (!this.shouldDraw) return;
        if (!this.programInfo) return;

        const { buffers, programInfo } = this;
        const gl = this.gl;

        // prepare draw: activate shader
        gl.useProgram(programInfo.program);

        // bind vertex and index buffers
        gl.bindBuffer(GL.ARRAY_BUFFER, buffers.vertexData);
        gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, buffers.indices);

        // prepare draw: enable vertex data and set up attribute pointers
        gl.enableVertexAttribArray(
            programInfo.attributeLocations.aVertexPosition,
        );
        gl.vertexAttribPointer(
            programInfo.attributeLocations.aVertexPosition,
            3,
            GL.FLOAT,
            false,
            VertexData.size,
            VertexData.fields.position.offset!,
        );
        
        gl.enableVertexAttribArray(
            programInfo.attributeLocations.aVertexNormal,
        );
        gl.vertexAttribPointer(
            programInfo.attributeLocations.aVertexNormal,
            3,
            GL.FLOAT,
            false,
            VertexData.size,
            VertexData.fields.normal.offset!,
        );
        
        gl.enableVertexAttribArray(
            programInfo.attributeLocations.aVertexTexCoord,
        );
        gl.vertexAttribPointer(
            programInfo.attributeLocations.aVertexTexCoord,
            2,
            GL.FLOAT,
            false,
            VertexData.size,
            VertexData.fields.texCoord.offset!,
        );

        // bind texture buffer
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.buffers.texture);

        // draw mesh
        const elementCount = this.numTris * 3;
        
        gl.drawElements(GL.TRIANGLES, elementCount, GL.UNSIGNED_INT, 0);
    }

    override toJSON() {
        const base = super.toJSON();
        return {
            ...base,
            type: "mesh" as const,
            material: this.material,
            numTris: this.numTris,
            rawVertexData: this.rawVertexData,
            rawIndices: this.rawIndices,
            rawTexturePath: this.rawTexturePath,
            rawShaderSources: this.rawShaderSources
        };
    }

    static async fromJSON(gl: GLC, data: any): Promise<Model> {
        // Type guard inline
        if (typeof data !== 'object' || data === null || data.type !== "mesh") {
            throw new Error("Invalid mesh object data format");
        }

        const transform = Transform.fromJSON(data.transform);
        
        // Always convert to typed arrays before passing to makeBuffers
        const vertexData = data.rawVertexData ? new Float32Array(data.rawVertexData) : new Float32Array();
        const indices = data.rawIndices ? new Uint32Array(data.rawIndices) : new Uint32Array();
        
        // Create material from data
        const material = new MtlMaterial();
        if (data.material) {
            if (data.material.diffuse) {
                material.diffuse = vec3.fromValues(data.material.diffuse[0], data.material.diffuse[1], data.material.diffuse[2]);
            }
            material.specularExponent = data.material.specularExponent ?? 1.0;
            if (data.material.diffuseTexture) {
                material.map_diffuse = { source: data.material.diffuseTexture };
            }
        } else {
            // Set default material properties when no material data is provided
            material.specularExponent = 1.0;
        }
        
        const buffers = await Model.makeBuffers(
            gl,
            data.rawTexturePath ?? "",
            vertexData,
            indices
        );

        // Create new program from shader sources
        const programInfo = data.rawShaderSources ? 
            await Model.makeProgram(gl, material) : 
            undefined;

        const model = new Model(
            gl,
            transform,
            buffers,
            programInfo!,
            data.numTris ?? 0,
            material,
            data.enabled ?? true,
            data.visible ?? true,
            data.name
        );

        // Store raw data for future serialization as number[]
        model._rawVertexData = Array.from(vertexData);
        model._rawIndices = Array.from(indices);
        model._vertexData = new Float32Array(vertexData);
        model._indices = new Uint32Array(indices);
        model._rawTexturePath = data.rawTexturePath;
        model._rawShaderSources = data.rawShaderSources;

        return model;
    }

    static async make(
        gl: GLC,
        obj: ObjFile,
        transform: Transform
    ): Promise<Model> {
        // Get the first (and only) group from the temporary structure
        const group = Object.values(Object.values(obj.objects)[0].groups)[0];
        const shaderMaterial = group.material ?? new MtlMaterial();
        if (!shaderMaterial.diffuse) {
            shaderMaterial.diffuse = vec3.fromValues(1, 1, 1);
        }
        if (shaderMaterial.specularExponent === undefined) {
            shaderMaterial.specularExponent = 1.0;
        }

        const diffuse_map_source = shaderMaterial?.map_diffuse?.source ?? "";

        // Create buffers and store raw data
        const buffers = await Model.makeBuffers(
            gl,
            diffuse_map_source,
            group.vertexData,
            group.indices,
        );

        // Create program and store shader sources
        const programInfo = await Model.makeProgram(gl, shaderMaterial);

        const model = new Model(
            gl,
            transform,
            buffers,
            programInfo,
            group.indices.length / 3,
            shaderMaterial,
        );

        // Store raw data
        model._rawVertexData = Array.from(group.vertexData);
        model._rawIndices = Array.from(group.indices);
        model._vertexData = new Float32Array(group.vertexData);
        model._indices = new Uint32Array(group.indices);
        model._rawTexturePath = diffuse_map_source;
        model._rawShaderSources = programInfo.shaderSources;

        return model;
    }

    static async makeProgram(
        gl: GLC,
        material: MtlMaterial,
    ): Promise<ProgramInfo> {
        if (!material.map_diffuse && !material.diffuse) throw ``;

        // Load shader files from static directory
        const [vsSource, fsSource] = await Promise.all([
            fetch('/static/src/shaders/geometry.vert').then(r => {
                if (!r.ok) throw new Error(`Failed to load vertex shader: ${r.statusText}`);
                return r.text();
            }),
            fetch('/static/src/shaders/geometry.frag').then(r => {
                if (!r.ok) throw new Error(`Failed to load fragment shader: ${r.statusText}`);
                return r.text();
            })
        ]);

        const shaderProgram = await createShaderProgram(gl, {
            vs: vsSource,
            fs: fsSource,
        });

        const attributeLocations: { [name: string]: GLint } = {};
        const uniformLocations: { [name: string]: WebGLUniformLocation } = {};

        // Get attribute locations
        const numAttributes = gl.getProgramParameter(shaderProgram, GL.ACTIVE_ATTRIBUTES);
        for (let i = 0; i < numAttributes; i++) {
            const info = gl.getActiveAttrib(shaderProgram, i);
            if (info) {
                attributeLocations[info.name] = gl.getAttribLocation(shaderProgram, info.name);
            }
        }

        // Get uniform locations
        const numUniforms = gl.getProgramParameter(shaderProgram, GL.ACTIVE_UNIFORMS);
        for (let i = 0; i < numUniforms; i++) {
            const info = gl.getActiveUniform(shaderProgram, i);
            if (info) {
                const location = gl.getUniformLocation(shaderProgram, info.name);
                if (location) {
                    uniformLocations[info.name] = location;
                }
            }
        }

        return {
            program: shaderProgram,
            attributeLocations,
            uniformLocations,
            shaderSources: { vs: vsSource, fs: fsSource }
        };
    }

    static async makeBuffers(
        gl: GLC,
        diffuseTexturePath: string,
        vertexData: Float32Array | number[],
        indices: Uint32Array | number[],
    ): Promise<Buffer> {
        // Create vertex buffer
        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(GL.ARRAY_BUFFER, vertexBuffer);
        
        // Convert to Float32Array if needed
        const vertexArray = vertexData instanceof Float32Array ? vertexData : new Float32Array(vertexData);
        gl.bufferData(GL.ARRAY_BUFFER, vertexArray, GL.STATIC_DRAW);

        // Create index buffer
        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, indexBuffer);
        
        // Convert to Uint32Array if needed
        const indexArray = indices instanceof Uint32Array ? indices : new Uint32Array(indices);
        gl.bufferData(GL.ELEMENT_ARRAY_BUFFER, indexArray, GL.STATIC_DRAW);

        // Create texture
        const texture = gl.createTexture();
        gl.bindTexture(GL.TEXTURE_2D, texture);

        // Load texture or create default
        if (diffuseTexturePath && diffuseTexturePath.length > 0) {
            try {
                const response = await fetch(diffuseTexturePath);
                if (!response.ok) {
                    throw new Error(`Failed to load texture: ${response.statusText}`);
                }
                const buffer = await response.arrayBuffer();
                const imageData = await parsePng(diffuseTexturePath);
                
                gl.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, imageData.width, imageData.height, 0, GL.RGBA, GL.UNSIGNED_BYTE, imageData.data);
            } catch (error) {
                console.warn('Failed to load texture, using default:', error);
                // Create a 1x1 white texture as fallback
                gl.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, 1, 1, 0, GL.RGBA, GL.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
            }
        } else {
            // Create a 1x1 white texture
            gl.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, 1, 1, 0, GL.RGBA, GL.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
        }

        // Set texture parameters
        gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
        gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
        gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.LINEAR);
        gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.LINEAR);

        return {
            vertexData: vertexBuffer,
            indices: indexBuffer,
            texture: texture,
        };
    }
} 