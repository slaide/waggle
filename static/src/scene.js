"use strict";

import { GL } from "./gl.js";
import { parsePng } from "./png.js";
import { mat4, vec3, quat } from "glm";

/**
 * 
 * @param {GL} gl 
 * @param {("vert"|"frag")} stage 
 * @param {string} source 
 * @returns {WebGLShader}
 */
function createShaderStage(gl,stage, source){
    const shader=gl.createShader({
        "vert":GL.VERTEX_SHADER,
        "frag":GL.FRAGMENT_SHADER,
    }[stage]);
    if(!shader){const error=`shader compilation failed`;console.error(error);throw error;}

    gl.shaderSource(shader,source)
    gl.compileShader(shader)

    if(!gl.getShaderParameter(shader,GL.COMPILE_STATUS)){
        const error=`error compiling shader ${gl.getShaderInfoLog(shader)}`
        alert(error);throw error
    }
    
    return shader
}

/**
 * @param {GL} gl
 * @param {{vs:string,fs:string}} stageSources
 * @returns {Promise<WebGLProgram>}
 **/
export async function createShaderProgram(gl,stageSources){
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
    
    return shaderProgram;
}

/**
 * @typedef {{
 *     program: WebGLProgram,
 *     attribLocations: {
 *         vertexPosition: GLint,
 *         vertexUVCoords:GLint,
 *     },
 *     uniformLocations: {
 *         projectionMatrix: WebGLUniformLocation,
 *         modelViewMatrix: WebGLUniformLocation,
 *         uSampler: WebGLUniformLocation,
 *     }
 * }} ProgramInfo
 */
/**
 * 
 * @param {WebGL2RenderingContext} gl
 * @returns {Promise<ProgramInfo>}
 */
export async function makeProgram(gl){
    const shaderProgram=await createShaderProgram(gl,{
        vs:`
            attribute vec4 aVertexPosition;
            attribute vec2 aVertexTexCoord;

            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;

            varying highp vec2 vTextureCoord;

            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
                vTextureCoord = aVertexTexCoord;
            }
        `,
        fs:`
            varying highp vec2 vTextureCoord;

            uniform sampler2D uSampler;

            void main() {
                gl_FragColor = texture2D(uSampler, vTextureCoord);
            }
        `
    })

    /** @type {ProgramInfo} */
    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition"),
            vertexUVCoords: gl.getAttribLocation(shaderProgram, "aVertexTexCoord"),
        },
        uniformLocations: {
            projectionMatrix:
                (()=>{
                    const ret=gl.getUniformLocation(shaderProgram, "uProjectionMatrix");
                    if(!ret)if(!ret){const error=`getUniformLocation failed uProjectionMatrix`;console.error(error);throw error;}
                    return ret;
                })(),
            modelViewMatrix:
                (()=>{
                    const ret=gl.getUniformLocation(shaderProgram, "uModelViewMatrix");
                    if(!ret){const error=`getUniformLocation failed uModelViewMatrix`;console.error(error);throw error;}
                    return ret;
                })(),
            uSampler: 
                (()=>{
                    const ret=gl.getUniformLocation(shaderProgram, "uSampler");
                    if(!ret){const error=`getUniformLocation failed uSampler`;console.error(error);throw error;}
                    return ret;
                })(),
        },
    };

    return programInfo
}

/**
 * @typedef {{
 * position:WebGLBuffer,
 * uvs:WebGLBuffer,
 * indices:WebGLBuffer,
 * texture:WebGLTexture,
 * }} Buffer
 */
/**
 * 
 * @param {GL} gl 
 * @returns {Promise<Buffer>}
 */
export async function makeBuffers(gl){
    /** @type {Buffer} */
    const buffers={};

    buffers.position=gl.createBuffer();
    gl.bindBuffer(GL.ARRAY_BUFFER, buffers.position);
    const positions=new Float32Array([
        // Front face (4 edges)
        -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0,

        // Back face (4 edges)
        -1.0, -1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, -1.0, -1.0,

        // Top face (4 edges)
        -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, -1.0,

        // Bottom face (4 edges)
        -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, -1.0, -1.0, 1.0,

        // Right face (4 edges)
        1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0,

        // Left face (4 edges)
        -1.0, -1.0, -1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, -1.0,
    ]);
    gl.bufferData(GL.ARRAY_BUFFER, positions, GL.STATIC_DRAW);

    buffers.uvs=gl.createBuffer();
    gl.bindBuffer(GL.ARRAY_BUFFER, buffers.uvs);
    const uvs=new Float32Array([
        // Front
        0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0,
        // Back
        0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0,
        // Top
        0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0,
        // Bottom
        0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0,
        // Right
        0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0,
        // Left
        0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0,
    ]);
    gl.bufferData(GL.ARRAY_BUFFER, uvs, GL.STATIC_DRAW);

    buffers.indices=gl.createBuffer();
    gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER,buffers.indices);
    const indices=new Uint16Array([
        0,  1,  2,      0,  2,  3,    // front
        4,  5,  6,      4,  6,  7,    // back
        8,  9,  10,     8,  10, 11,   // top
        12, 13, 14,     12, 14, 15,   // bottom
        16, 17, 18,     16, 18, 19,   // right
        20, 21, 22,     20, 22, 23,   // left
    ]);
    gl.bufferData(GL.ELEMENT_ARRAY_BUFFER,indices,GL.STATIC_DRAW);

    buffers.texture=gl.createTexture();
    gl.bindTexture(GL.TEXTURE_2D, buffers.texture);

    // from http://pluspng.com/cat-png-1149.html, but hosted on a different platform with more permissive CORS
    // "https://i.ibb.co/d0FsH21r/cat.png"

    // from https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
    // "https://raw.githubusercontent.com/mdn/dom-examples/main/webgl-examples/tutorial/sample6/cubetexture.png"
    const {width,height,data}=await parsePng(
        "https://raw.githubusercontent.com/mdn/dom-examples/main/webgl-examples/tutorial/sample6/cubetexture.png"
    );

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

    return buffers;
}

export class Scene{
    /**
     * 
     * @param {GL} gl 
     */
    constructor(
        gl,
    ){
        this.gl=gl;
        /** @type {GameObject[]} */
        this.objects=[];
    }

    /**
     * 
     */
    draw(){
        const {gl}=this;

        gl.clearColor(0,0,0,1);
        gl.clearDepth(1);
        gl.enable(GL.DEPTH_TEST);
        gl.depthFunc(GL.LEQUAL);

        const fov=(45*Math.PI)/180;
        const aspect=800/600;
        const znear=0.1;
        const zfar=100;
        
        // set up camera
        const projectionMatrix=mat4.create();
        mat4.perspective(projectionMatrix,fov,aspect,znear,zfar);

        // init model matrices
        for(const object of this.objects){
            const {buffers,programInfo}=object;

            const modelViewMatrix=mat4.create();
            mat4.translate(
                modelViewMatrix,
                modelViewMatrix,
                [0,0,-6]
            );

            // bind vertex data: position
            gl.bindBuffer(GL.ARRAY_BUFFER,buffers.position);
            gl.vertexAttribPointer(
                programInfo.attribLocations.vertexPosition,
                3,
                GL.FLOAT,
                false,
                0, // stride of zero means 'auto'
                0,
            );

            // bind vertex data: uv coords
            gl.bindBuffer(GL.ARRAY_BUFFER,buffers.uvs);
            gl.vertexAttribPointer(
                programInfo.attribLocations.vertexUVCoords,
                2,
                GL.FLOAT,
                false,
                0,
                0,
            );

            // upload shader binding data
            gl.useProgram(programInfo.program);
            gl.uniformMatrix4fv(
                programInfo.uniformLocations.projectionMatrix,
                false,
                projectionMatrix,
            );
            gl.uniformMatrix4fv(
                programInfo.uniformLocations.modelViewMatrix,
                false,
                modelViewMatrix,
            );
        }

        // this is used as part of game logic
        let rotation=0;

        /** @type {function(number):void} */
        const onFrameLogic=(deltatime_ms)=>{
            for(const object of this.objects){
                const {programInfo}=object;

                // animate quad rotation
                rotation+=40*deltatime_ms;
                object.transform.rotation=quat.fromEuler(quat.create(),rotation*0.3,rotation*0.7,rotation);

                const modelViewMatrix=object.transform.matrix;

                gl.useProgram(programInfo.program);
                gl.uniformMatrix4fv(
                    programInfo.uniformLocations.modelViewMatrix,
                    false,
                    modelViewMatrix,
                );
            }
        };

        let last_frametime=performance.now();
        const draw=()=>{
            const deltatime_ms=(performance.now()-last_frametime)*1e-3
            last_frametime=performance.now()

            // run logic step
            onFrameLogic(deltatime_ms);

            // clear screen to draw over
            gl.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);

            for(const object of this.objects){
                const {buffers,programInfo}=object;

                gl.bindBuffer(GL.ARRAY_BUFFER,buffers.position)
                gl.bindBuffer(GL.ARRAY_BUFFER,buffers.uvs)
                gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, buffers.indices);
                
                // prepare draw: bind texture
                gl.activeTexture(gl.TEXTURE0)
                gl.bindTexture(gl.TEXTURE_2D, buffers.texture)
                gl.uniform1i(programInfo.uniformLocations.uSampler,0)
                // prepare draw: enable vertex data 
                gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition)
                gl.enableVertexAttribArray(programInfo.attribLocations.vertexUVCoords)
                // prepare draw: activate shader
                gl.useProgram(programInfo.program)

                // draw mesh
                gl.drawElements(GL.TRIANGLES,36,GL.UNSIGNED_SHORT,0)
            }

            requestAnimationFrame(draw)
        }
        draw()
    }
}

export class Transform{
    constructor(){
        this.position=vec3.create();
        this.rotation=quat.identity(quat.create());
        this.scale=vec3.fromValues(1,1,1);
    }
    get matrix(){
        const modelViewMatrix=mat4.fromRotationTranslationScale(
            mat4.create(),
            this.rotation,
            this.position,
            this.scale,
        );
        
        return modelViewMatrix;
    }
}

export class GameObject{
    /**
     *
     * @param {GL} gl 
     * @param {Buffer} buffers 
     * @param {ProgramInfo} programInfo
     */
    constructor( gl, buffers, programInfo, ){
        this.gl=gl;
        this.buffers=buffers;
        this.programInfo=programInfo;

        this.transform=new Transform();
    }
}
