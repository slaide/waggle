"use strict";

import { GL } from "./gl.js";
import { parsePng } from "./png.js";
import { mat4, vec3, quat, glMatrix as glm } from "glm";

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

    gl.shaderSource(shader,source);
    gl.compileShader(shader);

    if(!gl.getShaderParameter(shader,GL.COMPILE_STATUS)){
        const error=`error compiling shader ${gl.getShaderInfoLog(shader)}`;
        alert(error);throw error;
    }
    
    return shader;
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
 *         vertexUVCoords: GLint,
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
        vs:`#version 300 es // vert
            
            precision highp float;

            in vec4 aVertexPosition;
            in vec2 aVertexTexCoord;

            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;

            out vec2 vTextureCoord;

            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
                vTextureCoord = aVertexTexCoord;
            }
        `,
        fs:`#version 300 es // frag

            precision highp float;

            in vec2 vTextureCoord;
            out vec4 fragColor;

            uniform sampler2D uSampler;

            void main() {
                fragColor = texture(uSampler, vTextureCoord);
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

    return programInfo;
}

/**
 * @typedef {{
 *   vertexData:WebGLBuffer,
 *   indices:WebGLBuffer,
 *   texture:WebGLTexture,
 * }} Buffer
 */
/**
 * 
 * @param {GL} gl 
 * @param {string} diffuseTexturePath
 * @param {Float32Array} vertexData
 * @param {Uint32Array} indices
 * @returns {Promise<Buffer>}
 */
export async function makeBuffers(gl,diffuseTexturePath,vertexData,indices){
    /** @type {Buffer} */
    const buffers={};

    buffers.vertexData=gl.createBuffer();
    gl.bindBuffer(GL.ARRAY_BUFFER, buffers.vertexData);
    gl.bufferData(GL.ARRAY_BUFFER, vertexData, GL.STATIC_DRAW);

    buffers.indices=gl.createBuffer();
    gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER,buffers.indices);
    gl.bufferData(GL.ELEMENT_ARRAY_BUFFER,indices,GL.STATIC_DRAW);

    buffers.texture=gl.createTexture();
    gl.bindTexture(GL.TEXTURE_2D, buffers.texture);

    let imageres={width:1,height:1,data:new Uint8Array([1,1,1,1])};
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

    return buffers;
}

export class Camera{
    constructor(){
        this.fov=45;
        this.aspect=800/600;
        this.znear=0.1;
        this.zfar=100;

        this.position=vec3.fromValues(0,0,0);
        this.rotation=quat.identity(quat.create());
    }
    get #target(){
        const worldForward=vec3.create();
        vec3.transformQuat(worldForward,vec3.fromValues(0,0,-1),this.rotation);
        const target=vec3.create();
        //subtract(vec3.create(),this.position,vec3.fromValues(0,0,1));
        vec3.add(target,this.position,worldForward);

        return target;
    }
    get forward(){
        const target=this.#target;

        // 1) forward  = normalize(center – eye)
        const forward = vec3.create();
        vec3.subtract(forward, this.position, target);
        vec3.normalize(forward, forward);

        return forward;
    }
    get right(){
        const forward=this.forward;
        const worldUp=vec3.fromValues(0,1,0);

        // 2) right    = normalize(cross(forward, worldUp))
        const right = vec3.create();
        vec3.cross(right, forward, worldUp);
        vec3.normalize(right, right);

        return right;
    }
    get up(){
        const forward=this.forward;
        const right = this.right;

        // 3) up       = cross(right, forward)
        const up = vec3.create();
        vec3.cross(up, right, forward);

        return up;
    }
    get viewMatrix(){
        const camTransform=mat4.fromRotationTranslation(
            mat4.create(),
            this.rotation,
            this.position,
        );
        const ret=mat4.invert(mat4.create(),camTransform);
        if(ret==null)throw `unable to invert matrix`;
        return ret;
    }
    get projectionMatrix(){
        return mat4.perspective(
            mat4.create(),
            glm.toRadian(this.fov),
            this.aspect,
            this.znear,
            this.zfar
        );
    }
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
        this.camera=new Camera();

        this.shouldDraw=true;
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

        // this is used as part of game logic
        let rotation=0;

        const cameraSpeedFactor={
            move:2,
            rotate:0.8
        };
        const cameraSpeed={
            x:0,
            y:0,
            z:0,
            rotx:0,
            roty:0,
        };
        window.addEventListener("keydown",ev=>{
            ev.preventDefault();

            if(ev.key.toLowerCase()=="w"){
                cameraSpeed.z=-cameraSpeedFactor.move;
            }
            if(ev.key.toLowerCase()=="s"){
                cameraSpeed.z=cameraSpeedFactor.move;
            }
            if(ev.key.toLowerCase()=="a"){
                cameraSpeed.x=-cameraSpeedFactor.move;
            }
            if(ev.key.toLowerCase()=="d"){
                cameraSpeed.x=cameraSpeedFactor.move;
            }
            if(ev.key.toLowerCase()=="e"){
                cameraSpeed.y=cameraSpeedFactor.move;
            }
            if(ev.key.toLowerCase()=="q"){
                cameraSpeed.y=-cameraSpeedFactor.move;
            }
            if(ev.key==" "){
                cameraSpeed.y=cameraSpeedFactor.move;
            }
            if(ev.key=="ArrowRight"){
                cameraSpeed.roty=-cameraSpeedFactor.rotate;
            }
            if(ev.key=="ArrowLeft"){
                cameraSpeed.roty=cameraSpeedFactor.rotate;
            }
            if(ev.key=="ArrowUp"){
                cameraSpeed.rotx=cameraSpeedFactor.rotate;
            }
            if(ev.key=="ArrowDown"){
                cameraSpeed.rotx=-cameraSpeedFactor.rotate;
            }
        })
        window.addEventListener("keyup",ev=>{
            ev.preventDefault();

            if(ev.key.toLowerCase()=="w"){
                cameraSpeed.z=0;
            }
            if(ev.key.toLowerCase()=="s"){
                cameraSpeed.z=0;
            }
            if(ev.key.toLowerCase()=="a"){
                cameraSpeed.x=0;
            }
            if(ev.key.toLowerCase()=="d"){
                cameraSpeed.x=0;
            }
            if(ev.key.toLowerCase()=="e"){
                cameraSpeed.y=0;
            }
            if(ev.key.toLowerCase()=="q"){
                cameraSpeed.y=0;
            }
            if(ev.key==" "){
                cameraSpeed.y=0;
            }
            if(ev.key=="ArrowRight"){
                cameraSpeed.roty=0;
            }
            if(ev.key=="ArrowLeft"){
                cameraSpeed.roty=0;
            }
            if(ev.key=="ArrowUp"){
                cameraSpeed.rotx=0;
            }
            if(ev.key=="ArrowDown"){
                cameraSpeed.rotx=0;
            }
        })

        /** @type {function(number):void} */
        const onFrameLogic=(deltatime_ms)=>{
            const xStep=-cameraSpeed.x*deltatime_ms;
            vec3.add(this.camera.position,this.camera.position,vec3.multiply(
                vec3.create(),
                this.camera.right,
                vec3.fromValues(xStep,xStep,xStep)
            ));
            const yStep=cameraSpeed.y*deltatime_ms;
            vec3.add(this.camera.position,this.camera.position,vec3.multiply(
                vec3.create(),
                vec3.fromValues(0,1,0),
                vec3.fromValues(yStep,yStep,yStep)
            ));
            const zStep=cameraSpeed.z*deltatime_ms;
            vec3.add(this.camera.position,this.camera.position,vec3.multiply(
                vec3.create(),
                this.camera.forward,
                vec3.fromValues(zStep,zStep,zStep)
            ));

            quat.multiply( 
                this.camera.rotation,
                quat.setAxisAngle(
                    quat.create(),
                    /// @ts-ignore
                    this.camera.right,
                    -cameraSpeed.rotx*deltatime_ms
                ),
                this.camera.rotation,
            );
            quat.multiply( 
                this.camera.rotation,
                quat.setAxisAngle(
                    quat.create(),
                    [0,1,0],
                    cameraSpeed.roty*deltatime_ms
                ),
                this.camera.rotation,
            );

            // set up camera
            const projectionMatrix=this.camera.projectionMatrix;

            for(const object of this.objects){
                const {programInfo}=object;

                // animate quad rotation
                rotation+=40*deltatime_ms;
                object.transform.rotation=quat.fromEuler(quat.create(),rotation*0.3,rotation*0.7,rotation);

                const modelViewMatrix=mat4.multiply(
                    mat4.create(),
                    this.camera.viewMatrix,
                    object.transform.matrix
                );

                gl.useProgram(programInfo.program);
                // ensure transform is up to date
                gl.uniformMatrix4fv(
                    programInfo.uniformLocations.modelViewMatrix,
                    false,
                    modelViewMatrix,
                );
                // also update camera projection matrix (TODO optimize to share this between draws)
                gl.uniformMatrix4fv(
                    programInfo.uniformLocations.projectionMatrix,
                    false,
                    projectionMatrix,
                );
            }
        };

        const frametimes=new Float32Array(30);
        let framenum=0;
        const original_title=document.title;

        let last_frametime=performance.now();
        const draw=()=>{
            if(!this.shouldDraw){
                requestAnimationFrame(draw);
                return;
            }

            const deltatime_ms=(performance.now()-last_frametime)*1e-3
            last_frametime=performance.now()

            frametimes[(framenum++)%frametimes.length]=deltatime_ms;

            const average_fps=frametimes.length/frametimes.reduce((o,n)=>o+n,0);
            const min_fps=1/frametimes.reduce((o,n)=>Math.max(o,n));
            const max_fps=1/frametimes.reduce((o,n)=>Math.min(o,n));
            document.title=`${original_title} | fps ${average_fps.toFixed(1)} (${min_fps.toFixed(1)}, ${max_fps.toFixed(1)})`

            // run logic step
            onFrameLogic(deltatime_ms);

            // clear screen to draw over
            gl.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);

            for(const object of this.objects){
                const {buffers,programInfo,numTris}=object;

                gl.bindBuffer(GL.ARRAY_BUFFER,buffers.vertexData)
                gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, buffers.indices);

                // prepare draw: activate shader
                gl.useProgram(programInfo.program)
                // prepare draw: bind texture
                gl.activeTexture(gl.TEXTURE0)
                gl.bindTexture(gl.TEXTURE_2D, buffers.texture)
                gl.uniform1i(programInfo.uniformLocations.uSampler,0)
                // prepare draw: enable vertex data 
                gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition)
                gl.enableVertexAttribArray(programInfo.attribLocations.vertexUVCoords)

                // draw mesh
                // in triangle mode: 3 elements per tri (hence count=numTris*3)
                // in line mode: 2 elements per line (hence count=numLines*2)
                // in point mode: 1 element per point (hence count=numPoints)
                gl.drawElements(GL.TRIANGLES,numTris*3,GL.UNSIGNED_INT,0)
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
     * @param {number} numTris 
     * @param {ProgramInfo} programInfo
     * @param {Transform} transform
     */
    constructor( gl, buffers, numTris, programInfo, transform ){
        this.gl=gl;
        this.buffers=buffers;
        this.numTris=numTris;
        this.programInfo=programInfo;
        this.transform=transform;

        gl.bindBuffer(GL.ARRAY_BUFFER,buffers.vertexData);
        // bind vertex data: position (in common vertexdata buffer)
        gl.vertexAttribPointer(
            programInfo.attribLocations.vertexPosition,
            3,
            GL.FLOAT,
            false,
            5*4, // 3 floats for vert pos, then 2 floats for uv
            0,
        );
        // bind vertex data: uv coords (in common vertexdata buffer)
        gl.vertexAttribPointer(
            programInfo.attribLocations.vertexUVCoords,
            2,
            GL.FLOAT,
            false,
            5*4, // 3 floats for vert pos, then 2 floats for uv
            3*4, // starts past vert pos
        );

        // upload shader binding data
        gl.useProgram(programInfo.program);
        gl.uniformMatrix4fv(
            programInfo.uniformLocations.modelViewMatrix,
            false,
            this.transform.matrix,
        );
    }
}
