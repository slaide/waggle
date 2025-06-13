"use strict";

import { GL, GLC } from "../gl";
import { parsePng } from "../bits/png";
import { MtlMaterial, ObjFile } from "../bits/obj";
import { vec3 } from "gl-matrix";
import { Transform } from "./transform";
import { TYPE_REGISTRY, makeStruct, asObj } from "../struct";

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

export class GameObject {
    constructor(
        public gl: GLC,
        public buffers: Buffer,
        public transform: Transform,
        public programInfo?: ProgramInfo,  // Make programInfo optional
        public numTris: number = 0,  // Default to 0 for lights
        public material?: MtlMaterial,
        public enabled: boolean = true,  // if false, children won't be traversed
        public visible: boolean = true,  // if false, object won't be drawn
        public name?: string,  // optional name for the object
    ) {}

    // Getter to determine if object should be drawn
    get shouldDraw(): boolean {
        return this.visible && this.enabled && !!this.programInfo;
    }

    upload() {
        if (!this.programInfo) return;  // Skip if no program info

        this.gl.bindBuffer(GL.ARRAY_BUFFER, this.buffers.vertexData);
        // bind vertex data: position (in common vertexdata buffer)
        this.gl.vertexAttribPointer(
            this.programInfo.attributeLocations.aVertexPosition,
            3,
            GL.FLOAT,
            false,
            VertexData.size,
            VertexData.fields.position.offset!,
        );
        // bind vertex data: normal (in common vertexdata buffer)
        this.gl.vertexAttribPointer(
            this.programInfo.attributeLocations.aVertexNormal,
            3,
            GL.FLOAT,
            false,
            VertexData.size,
            VertexData.fields.normal.offset!,
        );
        // bind vertex data: uv coords (in common vertexdata buffer)
        this.gl.vertexAttribPointer(
            this.programInfo.attributeLocations.aVertexTexCoord,
            2,
            GL.FLOAT,
            false,
            VertexData.size,
            VertexData.fields.texCoord.offset!,
        );

        // upload shader binding data
        this.gl.useProgram(this.programInfo.program);
        this.gl.uniformMatrix4fv(
            this.programInfo.uniformLocations.uModelMatrix,
            false,
            this.transform.matrix,
        );

        // Set specular exponent uniform
        const specularExponent = this.material?.specularExponent ?? 64.0;
        this.gl.uniform1f(
            this.programInfo.uniformLocations.uSpecularExponent,
            specularExponent
        );

        // Set diffuse color uniform
        if (this.material?.diffuse) {
            this.gl.uniform4f(
                this.programInfo.uniformLocations.uDiffuseColor,
                this.material.diffuse[0],
                this.material.diffuse[1],
                this.material.diffuse[2],
                1.0
            );
        }

        const gl = this.gl;
        // Set texture usage flag and bind texture if needed
        const useTexture = this.material?.map_diffuse !== undefined;
        gl.uniform1i(this.programInfo.uniformLocations.uUseDiffuseTexture, useTexture ? 1 : 0);
        
        if (useTexture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.buffers.texture);
            gl.uniform1i(this.programInfo.uniformLocations.uDiffuseSampler, 0);
        }
    }

    draw() {
        if (!this.shouldDraw) return;  // Use the getter instead of visible flag
        if (!this.programInfo) return;  // Extra safety check

        const { buffers, programInfo } = this;
        const gl = this.gl;

        // prepare draw: activate shader
        gl.useProgram(programInfo.program);

        // bind vertex and index buffers
        gl.bindBuffer(GL.ARRAY_BUFFER, buffers.vertexData);
        gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, buffers.indices);

        // prepare draw: enable vertex data
        gl.enableVertexAttribArray(
            programInfo.attributeLocations.aVertexPosition,
        );
        gl.enableVertexAttribArray(
            programInfo.attributeLocations.aVertexNormal,
        );
        gl.enableVertexAttribArray(
            programInfo.attributeLocations.aVertexTexCoord,
        );

        // bind texture buffer
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.buffers.texture);

        // draw mesh
        // in triangle mode: 3 elements per tri (hence count=numTris*3)
        // in line mode: 2 elements per line (hence count=numLines*2)
        // in point mode: 1 element per point (hence count=numPoints)
        gl.drawElements(GL.TRIANGLES, this.numTris * 3, GL.UNSIGNED_INT, 0);

        gl.bindVertexArray;
    }

    static async make(
        gl: GLC,
        obj: ObjFile,
        transform: Transform
    ) {
        // Get the first (and only) group from the temporary structure
        const group = Object.values(Object.values(obj.objects)[0].groups)[0];
        const shaderMaterial = group.material ?? new MtlMaterial();
        if (!shaderMaterial.diffuse) {
            shaderMaterial.diffuse = vec3.fromValues(1, 1, 1);
        }

        const diffuse_map_source = shaderMaterial?.map_diffuse?.source ?? "";

        return new GameObject(
            gl,
            await GameObject.makeBuffers(
                gl,
                diffuse_map_source,
                group.vertexData,
                group.indices,
            ),
            transform,
            await GameObject.makeProgram(gl, shaderMaterial),
            group.indices.length / 3,
            shaderMaterial,
        );
    }

    static async makeProgram(
        gl: GLC,
        material: MtlMaterial,
    ): Promise<ProgramInfo> {
        if (!material.map_diffuse && !material.diffuse) throw ``;

        // Load shader files from static directory
        const [vsSource, fsSource] = await Promise.all([
            fetch('/static/src/shaders/gbuffer.vert').then(r => {
                if (!r.ok) throw new Error(`Failed to load vertex shader: ${r.statusText}`);
                return r.text();
            }),
            fetch('/static/src/shaders/gbuffer.frag').then(r => {
                if (!r.ok) throw new Error(`Failed to load fragment shader: ${r.statusText}`);
                return r.text();
            })
        ]);

        const shaderProgram = await createShaderProgram(gl, {
            vs: vsSource,
            fs: fsSource
        });

        const numAttributes = gl.getProgramParameter(
            shaderProgram,
            gl.ACTIVE_ATTRIBUTES,
        );
        const attributeLocations: { [name: string]: GLint } = {};
        for (let i = 0; i < numAttributes; i++) {
            const attribute = gl.getActiveAttrib(shaderProgram, i);
            // should not happen
            if (attribute == null) continue;
            const { name } = attribute;

            const loc = gl.getAttribLocation(shaderProgram, name);

            attributeLocations[name] = loc;
        }

        const numUniforms = gl.getProgramParameter(
            shaderProgram,
            gl.ACTIVE_UNIFORMS,
        );
        const uniformLocations: { [name: string]: WebGLUniformLocation } = {};
        for (let i = 0; i < numUniforms; i++) {
            const uniform = gl.getActiveUniform(shaderProgram, i);
            // should not happen
            if (uniform == null) continue;

            const loc = gl.getUniformLocation(shaderProgram, uniform.name);
            if (!loc) {
                const error = `getUniformLocation failed ${name}`;
                console.error(error);
                throw error;
            }

            uniformLocations[uniform.name] = loc;
        }

        const programInfo: ProgramInfo = {
            program: shaderProgram,
            attributeLocations,
            uniformLocations,
        };

        return programInfo;
    }

    static async makeBuffers(
        gl: GLC,
        diffuseTexturePath: string,
        vertexData: Float32Array,
        indices: Uint32Array,
    ): Promise<Buffer> {
        const buffers: Buffer = {
            vertexData: 0,
            indices: 0,
            texture: 0,
        };

        buffers.vertexData = gl.createBuffer();
        gl.bindBuffer(GL.ARRAY_BUFFER, buffers.vertexData);
        gl.bufferData(GL.ARRAY_BUFFER, vertexData, GL.STATIC_DRAW);

        buffers.indices = gl.createBuffer();
        gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, buffers.indices);
        gl.bufferData(GL.ELEMENT_ARRAY_BUFFER, indices, GL.STATIC_DRAW);

        buffers.texture = gl.createTexture();
        gl.bindTexture(GL.TEXTURE_2D, buffers.texture);

        let imageres = {
            width: 1,
            height: 1,
            data: new Uint8Array([0.5, 0.5, 0.5, 1]),
        };
        if (diffuseTexturePath) {
            // @ts-ignore
            imageres = await parsePng(diffuseTexturePath);
        }
        const { width, height, data } = imageres;

        // Flip image pixels into the bottom-to-top order that WebGL expects.
        // must be called BEFORE image data is uploaded!
        gl.pixelStorei(GL.UNPACK_FLIP_Y_WEBGL, true);

        gl.texImage2D(
            GL.TEXTURE_2D,
            0,
            GL.RGBA,
            width,
            height,
            0,
            GL.RGBA,
            GL.UNSIGNED_BYTE,
            data,
        );

        // set these parameters on the bound texture (anytime between creation and usage)
        gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
        gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
        gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
        gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);

        return buffers;
    }
}
