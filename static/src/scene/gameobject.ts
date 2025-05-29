"use strict";

import { GL, GLC } from "../gl.js";
import { parsePng } from "../bits/png.js";
import { MtlMaterial, ObjFile } from "../bits/obj.js";
import { vec3 } from "gl-matrix";
import { Transform } from "./transform.js";

type ProgramInfo={
    program: WebGLProgram,
    attributeLocations: {[name:string]:GLint},
    uniformLocations: {[name:string]:WebGLUniformLocation},
};

type Buffer={
    vertexData:WebGLBuffer;
    indices:WebGLBuffer;
    texture:WebGLTexture;
};

function createShaderStage(
    gl:GLC,
    stage:"vert"|"frag",
    source:string,
):WebGLShader{
    const shader=gl.createShader({
        "vert":GL.VERTEX_SHADER,
        "frag":GL.FRAGMENT_SHADER,
    }[stage]);
    if(!shader){const error=`shader compilation failed`;console.error(error);throw error;}

    gl.shaderSource(shader,source);
    gl.compileShader(shader);

    if(!gl.getShaderParameter(shader,GL.COMPILE_STATUS)){
        const error=`error compiling shader ${gl.getShaderInfoLog(shader)}`;
        alert(error);throw error;
    }
    
    return shader;
}

export async function createShaderProgram(
    gl:GLC,
    stageSources:{
        fs:string,
        vs:string
    },
):Promise<WebGLProgram>{
    const { vs, fs }=stageSources;

    const vsShader=createShaderStage(gl,"vert",vs);
    const fsShader=createShaderStage(gl,"frag",fs);

    const shaderProgram=gl.createProgram();
    gl.attachShader(shaderProgram,vsShader);
    gl.attachShader(shaderProgram,fsShader);
    gl.linkProgram(shaderProgram);

    if(!gl.getProgramParameter(shaderProgram,GL.LINK_STATUS)){
        const error=`failed to create shader because ${gl.getProgramInfoLog(shaderProgram)}`;
        alert(error);throw error;
    }

    const vsinfo=gl.getShaderInfoLog(vsShader);
    if(vsinfo?.length??0>0){
        const error=`vs shader info: ${vsinfo}`;
        alert(error);throw error;
    }
    const fsinfo=gl.getShaderInfoLog(fsShader);
    if(fsinfo?.length??0>0){
        const error=`fs shader info: ${fsinfo}`;
        alert(error);throw error;
    }
    
    return shaderProgram;
}

export class GameObject{
    constructor(
        public gl:GLC,
        public buffers:Buffer,
        public programInfo:ProgramInfo,
        public numTris:number,
        public transform:Transform,
    ){}

    static async make(
        gl:GLC,
        obj:ObjFile,
        transform:Transform,
    ){
        const defaultMaterial=new MtlMaterial();
        defaultMaterial.diffuse=vec3.fromValues(1,1,1);

        const shaderMaterial=obj.material??defaultMaterial;

        const diffuse_map_source=shaderMaterial?.map_diffuse?.source??"";

        return new GameObject(
            gl,
            await GameObject.makeBuffers(gl,diffuse_map_source,obj.vertexData,obj.indices),
            await GameObject.makeProgram(gl,shaderMaterial),
            obj.indices.length/3,
            transform,
        );
    }

    upload(){
        this.gl.bindBuffer(GL.ARRAY_BUFFER,this.buffers.vertexData);
        // bind vertex data: position (in common vertexdata buffer)
        this.gl.vertexAttribPointer(
            this.programInfo.attributeLocations.aVertexPosition,
            3,
            GL.FLOAT,
            false,
            5*4, // 3 floats for vert pos, then 2 floats for uv
            0,
        );
        // bind vertex data: uv coords (in common vertexdata buffer)
        this.gl.vertexAttribPointer(
            this.programInfo.attributeLocations.aVertexTexCoord,
            2,
            GL.FLOAT,
            false,
            5*4, // 3 floats for vert pos, then 2 floats for uv
            3*4, // starts past vert pos
        );

        // upload shader binding data
        this.gl.useProgram(this.programInfo.program);
        this.gl.uniformMatrix4fv(
            this.programInfo.uniformLocations.uModelViewMatrix,
            false,
            this.transform.matrix,
        );

        const gl=this.gl;
        // prepare draw: bind texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.buffers.texture);
        gl.uniform1i(this.programInfo.uniformLocations.uDiffuseSampler,0);
    }

    draw(){
        const {buffers,programInfo}=this;
        const gl=this.gl;

        // prepare draw: activate shader
        gl.useProgram(programInfo.program);

        // bind vertex and index buffers
        gl.bindBuffer(GL.ARRAY_BUFFER,buffers.vertexData)
        gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, buffers.indices);

        // prepare draw: enable vertex data
        gl.enableVertexAttribArray(programInfo.attributeLocations.aVertexPosition);
        gl.enableVertexAttribArray(programInfo.attributeLocations.aVertexTexCoord);

        // bind texture buffer
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.buffers.texture);

        // draw mesh
        // in triangle mode: 3 elements per tri (hence count=numTris*3)
        // in line mode: 2 elements per line (hence count=numLines*2)
        // in point mode: 1 element per point (hence count=numPoints)
        gl.drawElements(GL.TRIANGLES,this.numTris*3,GL.UNSIGNED_INT,0);

        gl.bindVertexArray
    }

    static async makeProgram(gl:GLC,material:MtlMaterial):Promise<ProgramInfo>{
        const hasDiffuseTexture=material.map_diffuse?1:0;
        if(!hasDiffuseTexture && !material.diffuse)throw ``;

        const shaderProgram=await createShaderProgram(gl,{
            vs:`#version 300 es // vert
                
                precision highp float;

                in vec4 aVertexPosition;
                in vec2 aVertexTexCoord;

                uniform mat4 uModelViewMatrix;
                uniform mat4 uProjectionMatrix;

                out vec2 vTextureCoord;
                // placeholder
                out vec4 vpos;

                void main() {
                    vpos=uProjectionMatrix * uModelViewMatrix * aVertexPosition;
                    gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
                    vTextureCoord = aVertexTexCoord;
                }
            `,
            fs:`#version 300 es // frag

                precision highp float;

                layout (location = 0) out vec3 gPosition;
                layout (location = 1) out vec3 gNormal;
                layout (location = 2) out vec4 gAlbedoSpec;

                in vec2 vTextureCoord;
                in vec4 vpos;

                #if ${hasDiffuseTexture?'1':'0'}
                    uniform sampler2D uDiffuseSampler;
                #else
                    uniform vec4 uDiffuseColor;
                #endif

                void main() {
                    gPosition=vpos.xyz;
                    gNormal=vec3(0,0,0);

                    #if ${hasDiffuseTexture?'1':'0'}
                        gAlbedoSpec=texture(uDiffuseSampler, vTextureCoord);
                    #else
                        gAlbedoSpec=vec4(uDiffuseColor.rgb,1.0);
                    #endif
                }
            `
        });

        const numAttributes=gl.getProgramParameter(shaderProgram, gl.ACTIVE_ATTRIBUTES);
        const attributeLocations:{[name:string]:GLint}={};
        for(let i=0;i<numAttributes;i++){
            const attribute=gl.getActiveAttrib(shaderProgram, i);
            // should not happen
            if(attribute==null)continue;
            const {name,size,type}=attribute;

            const loc=gl.getAttribLocation(shaderProgram, name);

            attributeLocations[name]=loc;
        }

        const numUniforms=gl.getProgramParameter(shaderProgram, gl.ACTIVE_UNIFORMS);
        const uniformLocations:{[name:string]:WebGLUniformLocation}={};
        for(let i=0;i<numUniforms;i++){
            const uniform=gl.getActiveUniform(shaderProgram, i);
            // should not happen
            if(uniform==null)continue;
            const {name,size,type}=uniform;

            const loc=gl.getUniformLocation(shaderProgram, name);
            if(!loc){const error=`getUniformLocation failed ${name}`;console.error(error);throw error;}

            uniformLocations[name]=loc;
        }

        const programInfo:ProgramInfo = {
            program: shaderProgram,
            attributeLocations,
            uniformLocations,
        };

        return programInfo;
    }

    static async makeBuffers(
        gl:GLC,
        diffuseTexturePath:string,
        vertexData:Float32Array,
        indices:Uint32Array
    ):Promise<Buffer>{
        const buffers:Buffer={
            vertexData:0,
            indices:0,
            texture:0,
        };

        buffers.vertexData=gl.createBuffer();
        gl.bindBuffer(GL.ARRAY_BUFFER, buffers.vertexData);
        gl.bufferData(GL.ARRAY_BUFFER, vertexData, GL.STATIC_DRAW);

        buffers.indices=gl.createBuffer();
        gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER,buffers.indices);
        gl.bufferData(GL.ELEMENT_ARRAY_BUFFER,indices,GL.STATIC_DRAW);

        buffers.texture=gl.createTexture();
        gl.bindTexture(GL.TEXTURE_2D, buffers.texture);

        let imageres={width:1,height:1,data:new Uint8Array([0.5,0.5,0.5,1])};
        if(diffuseTexturePath){
            // @ts-ignore
            imageres=await parsePng(diffuseTexturePath);
        }
        const {width,height,data}=imageres;

        // Flip image pixels into the bottom-to-top order that WebGL expects.
        // must be called BEFORE image data is uploaded!
        gl.pixelStorei(GL.UNPACK_FLIP_Y_WEBGL, true);

        gl.texImage2D(
            GL.TEXTURE_2D,
            0,
            GL.RGBA,
            width,height,
            0,
            GL.RGBA,
            GL.UNSIGNED_BYTE,
            data
        );

        // set these parameters on the bound texture (anytime between creation and usage)
        gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
        gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
        gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
        gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);

        //const hasDiffuseTexture=material
        //const diffuseColor:vec3=hasDiffuseTexture?vec3.fromValues(0.2,0.2,0.2):material.diffuse;
        //`vec4(${diffuseColor.join(',')},1)`;

        return buffers;
    }
}