import { GL, GLC } from "../gl";
import { parsePng } from "../parsers/png";
import { MtlMaterial, ObjFile, parseObj } from "../parsers/obj";
import { vec3, Vec3Like } from "gl-matrix";
import { Transform } from "./transform";
import { TYPE_REGISTRY, makeStruct } from "../struct";
import { GameObject, GameObjectRegistry, BaseSerializedGameObject, Serializable } from "./gameobject";
import { getGlobalVFS, Path } from "../vfs";
import { isTestEnvironment, isMockWebGL } from "../environment";

// Define vector types for reuse
const Vec3 = TYPE_REGISTRY.f32.array(3);
// type Vec3Type=number[]; // Unused but kept for future reference
const Vec2 = TYPE_REGISTRY.f32.array(2);
// type Vec2Type=number[]; // Unused but kept for future reference
const VertexData=makeStruct([
    { name: "position", type: Vec3 },
    { name: "normal", type: Vec3 },
    { name: "texCoord", type: Vec2 },
]);
// Define the field types for type safety (currently unused but kept for future use)
// type VertexDataType={
//     position:Vec3Type;
//     normal:Vec3Type;
//     texCoord:Vec2Type;
// };

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
        const error = "shader compilation failed";
        console.error(error);
        throw error;
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, GL.COMPILE_STATUS)) {
        const error = `error compiling shader ${gl.getShaderInfoLog(shader)}`;
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
        throw error;
    }

    const vsinfo = gl.getShaderInfoLog(vsShader);
    if (vsinfo?.length ?? 0 > 0) {
        const error = `vs shader info: ${vsinfo}`;
        throw error;
    }
    const fsinfo = gl.getShaderInfoLog(fsShader);
    if (fsinfo?.length ?? 0 > 0) {
        const error = `fs shader info: ${fsinfo}`;
        throw error;
    }

    return shaderProgram;
}

// Serialized Model type interface
export interface SerializedModel extends BaseSerializedGameObject {
    type: "mesh";
    material?: {
        diffuse?: Vec3Like;
        specularExponent?: number;
        diffuseTexture?: string;
    };
    numTris: number;
    rawVertexData?: number[];
    rawIndices?: number[];
    rawTexturePath?: string;
    rawShaderSources?: { vs: string; fs: string };
    // Additional properties for different loading methods
    model?: string; // OBJ file path
    meshData?: { // For test data
        vertexData?: Float32Array;
        indices?: Uint32Array;
    };
}

// Model class for renderable objects
// Note: We use typed arrays internally for performance, but convert to regular arrays for serialization
export class Model extends GameObject implements Serializable<SerializedModel> {
    // Static type reference for serialization
    static SerializedType = {} as SerializedModel;

    public type = "mesh" as const;
    
    /** Static flag to track if lineWidth warning has been shown (to avoid console spam) */
    private static _lineWidthWarningShown = false;
    
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
                this._material.diffuse[2],
            ]) : undefined,
            specularExponent: this._material.specularExponent,
            diffuseTexture: this._material.map_diffuse?.source,
        };
    }

    // Setters for deserialization
    set rawVertexData(data: number[] | undefined) {
        this._rawVertexData = data;
    }

    set rawIndices(data: number[] | undefined) {
        this._rawIndices = data;
        if (data) {
            this._indices = new Uint32Array(data);
        }
    }

    set rawTexturePath(path: string | undefined) {
        this._rawTexturePath = path;
    }

    set rawShaderSources(sources: { vs: string, fs: string } | undefined) {
        this._rawShaderSources = sources;
    }

    set material(mat: MtlMaterial | { diffuse?: number[]; specularExponent?: number; diffuseTexture?: string; } | null | undefined) {
        if (!mat) {
            this._material = undefined;
            return;
        }
        if (mat instanceof MtlMaterial) {
            this._material = mat;
        } else {
            this._material = new MtlMaterial();
            if (mat.diffuse) {
                this._material.diffuse = vec3.fromValues(mat.diffuse[0], mat.diffuse[1], mat.diffuse[2]);
            }
            this._material.specularExponent = mat.specularExponent ?? 1.0;
            if (mat.diffuseTexture) {
                this._material.map_diffuse = { source: mat.diffuseTexture };
            }
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
    ) {
        if (!this.programInfo) return;

        const gl = this.gl;
        const modelMatrix = this.transform.worldMatrix;

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
                    new Float32Array([1, 1, 1, 1]),
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

        // Use the object's world matrix
        this.drawWithMatrix(this.transform.worldMatrix as Float32Array);
    }

    override drawWithMatrix(worldMatrix: Float32Array, viewMatrix?: Float32Array, projectionMatrix?: Float32Array) {
        if (!this.shouldDraw) return;
        if (!this.programInfo) return;

        const { buffers, programInfo } = this;
        const gl = this.gl;

        // prepare draw: activate shader
        gl.useProgram(programInfo.program);

        // Set the world matrix uniform using the passed matrix
        gl.uniformMatrix4fv(
            programInfo.uniformLocations.uModelMatrix,
            false,
            worldMatrix,
        );

        // Set view and projection matrices if provided
        if (viewMatrix) {
            gl.uniformMatrix4fv(
                programInfo.uniformLocations.uViewMatrix,
                false,
                viewMatrix,
            );
        }
        
        if (projectionMatrix) {
            gl.uniformMatrix4fv(
                programInfo.uniformLocations.uProjectionMatrix,
                false,
                projectionMatrix,
            );
        }

        // Set material properties
        if (this._material) {
            if (this._material.diffuse) {
                gl.uniform4fv(
                    programInfo.uniformLocations.uDiffuseColor,
                    new Float32Array([this._material.diffuse[0], this._material.diffuse[1], this._material.diffuse[2], 1.0]),
                );
            } else {
                gl.uniform4fv(
                    programInfo.uniformLocations.uDiffuseColor,
                    new Float32Array([1, 1, 1, 1]),
                );
            }

            gl.uniform1f(
                programInfo.uniformLocations.uSpecularExponent,
                this._material.specularExponent || 32,
            );
        }

        // Set texture usage flag
        const useTexture = !!(this._material?.map_diffuse);
        gl.uniform1i(programInfo.uniformLocations.uUseDiffuseTexture, useTexture ? 1 : 0);
        
        if (useTexture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.buffers.texture);
            gl.uniform1i(programInfo.uniformLocations.uDiffuseSampler, 0);
        }

        // Set object ID for picking (only if uniform exists)
        if (programInfo.uniformLocations.uObjectId) {
            gl.uniform1ui(programInfo.uniformLocations.uObjectId, this.id);
        }

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

    // New method for forward rendering
    drawForward(worldMatrix: Float32Array, viewMatrix: Float32Array, projectionMatrix: Float32Array, lightUBOs: {pointLightUBO: WebGLBuffer, directionalLightUBO: WebGLBuffer}, cameraPos: Float32Array) {
        if (!this.shouldDraw || !this.forwardRendered || !this.forwardProgramInfo) return;

        const { buffers, forwardProgramInfo } = this;
        const gl = this.gl;

        // Use forward rendering program
        gl.useProgram(forwardProgramInfo.program);

        // Set transformation matrices (check if uniforms exist)
        if (forwardProgramInfo.uniformLocations.uModelMatrix) {
            gl.uniformMatrix4fv(
                forwardProgramInfo.uniformLocations.uModelMatrix,
                false,
                worldMatrix,
            );
        }
        if (forwardProgramInfo.uniformLocations.uViewMatrix) {
            gl.uniformMatrix4fv(
                forwardProgramInfo.uniformLocations.uViewMatrix,
                false,
                viewMatrix,
            );
        }
        if (forwardProgramInfo.uniformLocations.uProjectionMatrix) {
            gl.uniformMatrix4fv(
                forwardProgramInfo.uniformLocations.uProjectionMatrix,
                false,
                projectionMatrix,
            );
        }

        // Set camera position for lighting calculations
        if (forwardProgramInfo.uniformLocations.uCamPos) {
            gl.uniform3fv(forwardProgramInfo.uniformLocations.uCamPos, cameraPos);
        }

        // Set material properties (check if uniforms exist)
        if (this._material && forwardProgramInfo.uniformLocations.uDiffuseColor) {
            if (this._material.diffuse) {
                gl.uniform4fv(
                    forwardProgramInfo.uniformLocations.uDiffuseColor,
                    new Float32Array([this._material.diffuse[0], this._material.diffuse[1], this._material.diffuse[2], 1.0]),
                );
            } else {
                gl.uniform4fv(
                    forwardProgramInfo.uniformLocations.uDiffuseColor,
                    new Float32Array([1, 1, 1, 1]),
                );
            }
        }

        if (this._material && forwardProgramInfo.uniformLocations.uSpecularExponent) {
            gl.uniform1f(
                forwardProgramInfo.uniformLocations.uSpecularExponent,
                this._material.specularExponent || 32,
            );
        }

        // Set texture usage flag (check if uniform exists)
        const useTexture = !!(this._material?.map_diffuse);
        if (forwardProgramInfo.uniformLocations.uUseDiffuseTexture) {
            gl.uniform1i(forwardProgramInfo.uniformLocations.uUseDiffuseTexture, useTexture ? 1 : 0);
        }
        
        if (useTexture && forwardProgramInfo.uniformLocations.uDiffuseSampler) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, buffers.texture);
            gl.uniform1i(forwardProgramInfo.uniformLocations.uDiffuseSampler, 0);
        }

        // Bind light uniform buffer objects only if the shader uses them
        const POINTLIGHTBLOCKBINDING = 1;
        const DIRECTIONALLIGHTBLOCKBINDING = 2;
        gl.bindBufferBase(gl.UNIFORM_BUFFER, POINTLIGHTBLOCKBINDING, lightUBOs.pointLightUBO);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, DIRECTIONALLIGHTBLOCKBINDING, lightUBOs.directionalLightUBO);

        // Bind vertex and index buffers
        gl.bindBuffer(GL.ARRAY_BUFFER, buffers.vertexData);
        gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, buffers.indices);

        // Set up vertex attributes (check if attribute locations exist)
        if (forwardProgramInfo.attributeLocations.aVertexPosition !== -1 && forwardProgramInfo.attributeLocations.aVertexPosition !== undefined) {
            gl.enableVertexAttribArray(forwardProgramInfo.attributeLocations.aVertexPosition);
            gl.vertexAttribPointer(
                forwardProgramInfo.attributeLocations.aVertexPosition,
                3,
                GL.FLOAT,
                false,
                VertexData.size,
                VertexData.fields.position.offset!,
            );
        }
        
        if (forwardProgramInfo.attributeLocations.aVertexNormal !== -1 && forwardProgramInfo.attributeLocations.aVertexNormal !== undefined) {
            gl.enableVertexAttribArray(forwardProgramInfo.attributeLocations.aVertexNormal);
            gl.vertexAttribPointer(
                forwardProgramInfo.attributeLocations.aVertexNormal,
                3,
                GL.FLOAT,
                false,
                VertexData.size,
                VertexData.fields.normal.offset!,
            );
        }
        
        if (forwardProgramInfo.attributeLocations.aVertexTexCoord !== -1 && forwardProgramInfo.attributeLocations.aVertexTexCoord !== undefined) {
            gl.enableVertexAttribArray(forwardProgramInfo.attributeLocations.aVertexTexCoord);
            gl.vertexAttribPointer(
                forwardProgramInfo.attributeLocations.aVertexTexCoord,
                2,
                GL.FLOAT,
                false,
                VertexData.size,
                VertexData.fields.texCoord.offset!,
            );
        }

        // Set line width if drawing lines
        if (this.drawMode === "lines") {
            // Check WebGL lineWidth support (most browsers only support 1.0)
            const lineWidthRange = gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE);
            if (this.lineWidth > lineWidthRange[1]) {
                // Only warn once per session to avoid console spam
                if (!Model._lineWidthWarningShown) {
                    console.warn(`WebGL lineWidth ${this.lineWidth} exceeds maximum supported width ${lineWidthRange[1]}. Most browsers only support lineWidth = 1.0. Consider using geometry-based thick lines instead.`);
                    Model._lineWidthWarningShown = true;
                }
            }
            gl.lineWidth(Math.min(this.lineWidth, lineWidthRange[1]));
        }
        
        // Set line color override if specified
        if (this.lineColor && forwardProgramInfo.uniformLocations.uDiffuseColor) {
            gl.uniform4fv(
                forwardProgramInfo.uniformLocations.uDiffuseColor,
                new Float32Array([this.lineColor[0], this.lineColor[1], this.lineColor[2], 1.0]),
            );
        }

        // Draw mesh with appropriate primitive type
        if (this.drawMode === "lines") {
            const elementCount = this._indices.length; // For lines, use all indices
            gl.drawElements(GL.LINES, elementCount, GL.UNSIGNED_INT, 0);
        } else {
            const elementCount = this.numTris * 3;
            gl.drawElements(GL.TRIANGLES, elementCount, GL.UNSIGNED_INT, 0);
        }
    }

    override toJSON(): SerializedModel {
        const base = super.toJSON();
        
        // Convert material to serializable format
        let serializedMaterial: SerializedModel["material"] = undefined;
        if (this._material) {
            serializedMaterial = {
                diffuse: this._material.diffuse ? new Float32Array(this._material.diffuse) : undefined,
                specularExponent: this._material.specularExponent,
                diffuseTexture: this._material.map_diffuse?.source,
            };
        }
        
        return {
            ...base,
            type: "mesh" as const,
            material: serializedMaterial,
            numTris: this.numTris,
            rawVertexData: this.rawVertexData,
            rawIndices: this.rawIndices,
            rawTexturePath: this.rawTexturePath,
            rawShaderSources: this.rawShaderSources,
        };
    }

    static async fromJSON(gl: GLC, data: BaseSerializedGameObject): Promise<Model> {
        // Type guard inline
        if (typeof data !== "object" || data === null || data.type !== "mesh") {
            throw new Error("Invalid mesh object data format");
        }

        // Cast to SerializedModel after type checking
        const modelData = data as SerializedModel;

        // Validate that either model or rawVertexData is provided (meshData is for tests)
        if (!modelData.model && !modelData.rawVertexData && !modelData.meshData) {
            throw new Error("Mesh object must have either a model property or meshData");
        }

        const transform = Transform.fromJSON(modelData.transform);
        
        // Handle loading from OBJ file if model path is provided
        if (modelData.model) {
            const objModelData = await parseObj(modelData.model, { normalizeSize: true });
            
            // Get the first object and group
            const firstObjectKey = Object.keys(objModelData.objects)[0];
            const firstGroupKey = Object.keys(objModelData.objects[firstObjectKey].groups)[0];
            const group = objModelData.objects[firstObjectKey].groups[firstGroupKey];
            
            // Create model object using the make method
            const model = await Model.make(gl, {
                objects: { 
                    [firstObjectKey]: { 
                        groups: { 
                            [firstGroupKey]: group, 
                        }, 
                    }, 
                },
                boundingBox: objModelData.boundingBox,
            }, transform);
            
            // Set the name and other properties from the JSON data
            if (modelData.name) {
                model.name = modelData.name;
            }
            if (modelData.enabled !== undefined) {
                model.enabled = modelData.enabled;
            }
            if (modelData.visible !== undefined) {
                model.visible = modelData.visible;
            }
            
            // Handle forward rendering properties for OBJ-loaded models
            if (modelData.forwardRendered) {

                
                // Create material for forward rendering
                const forwardMaterial = new MtlMaterial();
                if (modelData.material) {
                    if (modelData.material.diffuse) {
                        forwardMaterial.diffuse = vec3.fromValues(modelData.material.diffuse[0], modelData.material.diffuse[1], modelData.material.diffuse[2]);
                    }
                    forwardMaterial.specularExponent = modelData.material.specularExponent ?? 1.0;
                    if (modelData.material.diffuseTexture) {
                        forwardMaterial.map_diffuse = { source: modelData.material.diffuseTexture };
                    }
                } else {
                    // Set default material properties when no material data is provided
                    forwardMaterial.diffuse = vec3.fromValues(1, 1, 1);
                    forwardMaterial.specularExponent = 1.0;
                }
                
                const forwardProgramInfo = await Model.makeForwardProgram(gl, forwardMaterial, modelData.forwardShaderPaths);
                model.forwardRendered = true;
                model.forwardProgramInfo = forwardProgramInfo;
                model.forwardShaderPaths = modelData.forwardShaderPaths;
                model._material = forwardMaterial; // Use the properly parsed material
            }
            
            return model;
        }
        
        // Handle loading from serialized data
        const vertexData = modelData.rawVertexData ? new Float32Array(modelData.rawVertexData) : new Float32Array();
        const indices = modelData.rawIndices ? new Uint32Array(modelData.rawIndices) : new Uint32Array();
        
        // Create material from data
        const material = new MtlMaterial();
        if (modelData.material) {
            if (modelData.material.diffuse) {
                material.diffuse = vec3.fromValues(modelData.material.diffuse[0], modelData.material.diffuse[1], modelData.material.diffuse[2]);
            }
            material.specularExponent = modelData.material.specularExponent ?? 1.0;
            if (modelData.material.diffuseTexture) {
                material.map_diffuse = { source: modelData.material.diffuseTexture };
            }
        } else {
            // Set default material properties when no material data is provided
            material.specularExponent = 1.0;
        }
        
        const buffers = await Model.makeBuffers(
            gl,
            modelData.rawTexturePath ?? "",
            vertexData,
            indices,
        );

        // Create new program from shader sources
        let programInfo;
        if (modelData.rawShaderSources || vertexData.length > 0) {
            programInfo = await Model.makeProgram(gl, material);
        } else {
            programInfo = undefined;
        }

        // Create forward program if object is marked for forward rendering
        let forwardProgramInfo;
        if (modelData.forwardRendered) {
            forwardProgramInfo = await Model.makeForwardProgram(gl, material, modelData.forwardShaderPaths);
        }

        // Calculate numTris from indices if not provided but rawIndices exist
        const numTris = modelData.numTris ?? (indices.length > 0 ? indices.length / 3 : 0);

        const model = new Model(
            gl,
            transform,
            buffers,
            programInfo!,
            numTris,
            material,
            modelData.enabled ?? true,
            modelData.visible ?? true,
            modelData.name,
        );

        // Store raw data for future serialization as number[]
        model._rawVertexData = Array.from(vertexData);
        model._rawIndices = Array.from(indices);
        model._vertexData = new Float32Array(vertexData);
        model._indices = new Uint32Array(indices);
        model._rawTexturePath = modelData.rawTexturePath;
        model._rawShaderSources = modelData.rawShaderSources;

        // Set forward rendering properties
        if (modelData.forwardRendered) {
            model.forwardRendered = true;
            model.forwardProgramInfo = forwardProgramInfo;
            model.forwardShaderPaths = modelData.forwardShaderPaths;
        }

        return model;
    }

    static async make(
        gl: GLC,
        obj: ObjFile,
        transform: Transform,
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
        if (!material.map_diffuse && !material.diffuse) throw "";

        // Load shader files from static directory or use default in test environment
        let vsSource = "";
        let fsSource = "";
        
        // Check if we're in a test environment (no real WebGL context)
        const isTestEnv = isTestEnvironment() || isMockWebGL(gl);
        
        if (isTestEnv) {
            // Use minimal default shaders for testing
            vsSource = `#version 300 es
                in vec4 aVertexPosition;
                in vec3 aVertexNormal;
                in vec2 aVertexTexCoord;
                uniform mat4 uModelViewMatrix;
                uniform mat4 uProjectionMatrix;
                void main() {
                    gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
                }`;
            fsSource = `#version 300 es
                precision mediump float;
                out vec4 fragColor;
                void main() {
                    fragColor = vec4(1.0, 0.0, 0.0, 1.0);
                }`;
        } else {
            const vfs = getGlobalVFS();
            
            vsSource = await vfs.readText(new Path("static/src/shaders/geometry.vert"));
            fsSource = await vfs.readText(new Path("static/src/shaders/geometry.frag"));
        }

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
            shaderSources: { vs: vsSource, fs: fsSource },
        };
    }

    // New method to create forward rendering program
    static async makeForwardProgram(
        gl: GLC,
        material: MtlMaterial,
        customShaderPaths?: { vs: string, fs: string },
    ): Promise<ProgramInfo> {
        if (!material.map_diffuse && !material.diffuse) throw "";

        // Load forward rendering shader files
        let vsSource = "";
        let fsSource = "";
        
        // Check if we're in a test environment (no real WebGL context)
        const isTestEnv = isTestEnvironment() || isMockWebGL(gl);
        
        if (isTestEnv) {
            // Use minimal default shaders for testing
            vsSource = `#version 300 es
                in vec4 aVertexPosition;
                in vec3 aVertexNormal;
                in vec2 aVertexTexCoord;
                uniform mat4 uModelMatrix;
                uniform mat4 uViewMatrix;
                uniform mat4 uProjectionMatrix;
                out vec2 vTextureCoord;
                void main() {
                    gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * aVertexPosition;
                    vTextureCoord = aVertexTexCoord;
                }`;
            fsSource = `#version 300 es
                precision mediump float;
                uniform vec4 uDiffuseColor;
                in vec2 vTextureCoord;
                out vec4 fragColor;
                void main() {
                    fragColor = uDiffuseColor;
                }`;
        } else {
            // Use custom paths if provided, otherwise use defaults
            // Fix paths to be relative to the web server root
            const vsPath = customShaderPaths?.vs || "static/src/shaders/forward.vert";
            const fsPath = customShaderPaths?.fs || "static/src/shaders/forward.frag";
            
            // Convert absolute paths to relative paths
            const normalizedVsPath = vsPath.startsWith("/") ? vsPath.substring(1) : vsPath;
            const normalizedFsPath = fsPath.startsWith("/") ? fsPath.substring(1) : fsPath;
            
            const vfs = getGlobalVFS();
            
            vsSource = await vfs.readText(new Path(normalizedVsPath));
            fsSource = await vfs.readText(new Path(normalizedFsPath));
        }

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
            shaderSources: { vs: vsSource, fs: fsSource },
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
            // Check if we're in a test environment
            const isTestEnv = isTestEnvironment() || isMockWebGL(gl);
            
            if (isTestEnv) {
                // Create a 1x1 white texture for testing
                gl.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, 1, 1, 0, GL.RGBA, GL.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
            } else {
                // time the parsepng time
                const start = performance.now();
                const imageData = await parsePng(diffuseTexturePath);
                const end = performance.now();
                console.log(`parsePng took ${end - start}ms`);
                
                gl.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, imageData.width, imageData.height, 0, GL.RGBA, GL.UNSIGNED_BYTE, imageData.data);
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

    /**
     * Calculate the axis-aligned bounding box of this mesh in local space
     * @returns The bounding box as min/max coordinates
     */
    calculateBoundingBox(): { min: Vec3Like, max: Vec3Like } {
        if (!this._rawVertexData || this._rawVertexData.length === 0) {
            // Return default bounding box if no vertex data
            return {
                min: vec3.fromValues(-0.5, -0.5, -0.5),
                max: vec3.fromValues(0.5, 0.5, 0.5),
            };
        }

        const vertexData = this._rawVertexData;
        const NUM_VERT_COMPONENTS = 8; // position(3) + normal(3) + texcoord(2)
        
        // Initialize with first vertex position
        const min = vec3.fromValues(vertexData[0], vertexData[1], vertexData[2]);
        const max = vec3.fromValues(vertexData[0], vertexData[1], vertexData[2]);
        
        // Iterate through all vertices to find min/max
        for (let i = 0; i < vertexData.length; i += NUM_VERT_COMPONENTS) {
            const x = vertexData[i];
            const y = vertexData[i + 1];
            const z = vertexData[i + 2];
            
            min[0] = Math.min(min[0], x);
            min[1] = Math.min(min[1], y);
            min[2] = Math.min(min[2], z);
            
            max[0] = Math.max(max[0], x);
            max[1] = Math.max(max[1], y);
            max[2] = Math.max(max[2], z);
        }
        
        return { min, max };
    }

    /**
     * Create a wireframe bounding box child object for this model
     * @returns A new Model representing the wireframe cube
     */
    async createBoundingBoxWireframe(): Promise<Model> {
        const bbox = this.calculateBoundingBox();
        
        // Create cube vertices for the bounding box
        const cubeVertices = [
            // Bottom face
            bbox.min[0], bbox.min[1], bbox.min[2],  // 0
            bbox.max[0], bbox.min[1], bbox.min[2],  // 1
            bbox.max[0], bbox.min[1], bbox.max[2],  // 2
            bbox.min[0], bbox.min[1], bbox.max[2],  // 3
            // Top face
            bbox.min[0], bbox.max[1], bbox.min[2],  // 4
            bbox.max[0], bbox.max[1], bbox.min[2],  // 5
            bbox.max[0], bbox.max[1], bbox.max[2],  // 6
            bbox.min[0], bbox.max[1], bbox.max[2],  // 7
        ];
        
        // Create wireframe edges (lines)
        const wireframeIndices = [
            // Bottom face edges
            0, 1,  1, 2,  2, 3,  3, 0,
            // Top face edges  
            4, 5,  5, 6,  6, 7,  7, 4,
            // Vertical edges
            0, 4,  1, 5,  2, 6,  3, 7,
        ];
        
        // Create vertex data in the expected format (8 components per vertex)
        const vertexData: number[] = [];
        for (let i = 0; i < cubeVertices.length; i += 3) {
            vertexData.push(
                cubeVertices[i],     cubeVertices[i + 1], cubeVertices[i + 2], // position
                0, 1, 0,                                                       // normal (up)
                0, 0,                                                           // texture coordinates
            );
        }
        
        // Create material for wireframe
        const wireframeMaterial = new MtlMaterial();
        wireframeMaterial.diffuse = vec3.fromValues(0.0, 1.0, 0.0); // Green
        wireframeMaterial.specularExponent = 1;
        
        // Create buffers
        const buffers = await Model.makeBuffers(
            this.gl,
            "", // No texture
            new Float32Array(vertexData),
            new Uint32Array(wireframeIndices),
        );
        
        // Create forward program for wireframe rendering
        const forwardProgramInfo = await Model.makeForwardProgram(
            this.gl, 
            wireframeMaterial,
            {
                vs: "/static/src/shaders/wireframe_forward.vert",
                fs: "/static/src/shaders/wireframe_forward.frag",
            },
        );
        
        // Create identity transform (wireframe is in parent's local space)
        const wireframeTransform = new Transform();
        
        // Create the wireframe model
        const wireframeModel = new Model(
            this.gl,
            wireframeTransform,
            buffers,
            forwardProgramInfo, // Use forward program as main program 
            wireframeIndices.length / 3, // Number of triangles (though we're drawing lines)
            wireframeMaterial,
            true,  // enabled
            true,  // visible
            "Dynamic Wireframe Bounding Box",
        );
        
        // Set forward rendering properties
        wireframeModel.forwardRendered = true;
        wireframeModel.forwardProgramInfo = forwardProgramInfo;
        wireframeModel.forwardShaderPaths = {
            vs: "/static/src/shaders/wireframe_forward.vert",
            fs: "/static/src/shaders/wireframe_forward.frag",
        };
        
        // Set line drawing properties
        wireframeModel.drawMode = "lines";
        wireframeModel.lineWidth = 2.0;
        wireframeModel.lineColor = vec3.fromValues(0.0, 1.0, 0.0); // Green lines
        
        // Store raw data for the wireframe
        wireframeModel._rawVertexData = vertexData;
        wireframeModel._rawIndices = Array.from(wireframeIndices);
        wireframeModel._vertexData = new Float32Array(vertexData);
        wireframeModel._indices = new Uint32Array(wireframeIndices);
        
        return wireframeModel;
    }
}

// Register the Model class with the GameObjectRegistry
GameObjectRegistry.register("mesh", Model.fromJSON); 