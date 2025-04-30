//# allFunctionsCalledOnLoad
"use strict";

import { mat4 } from "glm";

import { parsePng } from "./png.js";

/// @ts-ignore
console.log(`running in strict mode? ${(function(){return !this})()}`)

const GL=WebGL2RenderingContext
/** @typedef {WebGL2RenderingContext} GL */

/**
 * @param {GL} gl
 * @param {{vs:string,fs:string}} stageSources
 * @returns {Promise<WebGLProgram>}
 **/
async function createShaderProgram(gl,stageSources){
    const {vs,fs}=stageSources

    const vsShader=createShaderStage("vert",vs)
    const fsShader=createShaderStage("frag",fs)

    const shaderProgram=gl.createProgram()
    gl.attachShader(shaderProgram,vsShader)
    gl.attachShader(shaderProgram,fsShader)
    gl.linkProgram(shaderProgram)

    if(!gl.getProgramParameter(shaderProgram,GL.LINK_STATUS)){
        const error=`failed to create shader because ${gl.getProgramInfoLog(shaderProgram)}`
        alert(error);throw error
    }
    
    return shaderProgram

    /**
     * 
     * @param {("vert"|"frag")} stage 
     * @param {string} source 
     * @returns {WebGLShader}
     */
    function createShaderStage(stage, source){
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
* */
/**
 * 
 * @param {WebGL2RenderingContext} gl
 * @returns {Promise<ProgramInfo>}
 */
async function makeProgram(gl){
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
 * */
/**
 * 
 * @param {GL} gl 
 * @returns {Promise<Buffer>}
 */
async function makeBuffers(gl){
    /** @type {Buffer} */
    const buffers={}

    buffers.position=gl.createBuffer()
    gl.bindBuffer(GL.ARRAY_BUFFER, buffers.position)
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
    ])
    gl.bufferData(GL.ARRAY_BUFFER, positions, GL.STATIC_DRAW)

    buffers.uvs=gl.createBuffer()
    gl.bindBuffer(GL.ARRAY_BUFFER, buffers.uvs)
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
    ])
    gl.bufferData(GL.ARRAY_BUFFER, uvs, GL.STATIC_DRAW)

    buffers.indices=gl.createBuffer()
    gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER,buffers.indices)
    const indices=new Uint16Array([
        0,  1,  2,      0,  2,  3,    // front
        4,  5,  6,      4,  6,  7,    // back
        8,  9,  10,     8,  10, 11,   // top
        12, 13, 14,     12, 14, 15,   // bottom
        16, 17, 18,     16, 18, 19,   // right
        20, 21, 22,     20, 22, 23,   // left
    ])
    gl.bufferData(GL.ELEMENT_ARRAY_BUFFER,indices,GL.STATIC_DRAW)

    buffers.texture=gl.createTexture()
    gl.bindTexture(GL.TEXTURE_2D, buffers.texture)

    // from http://pluspng.com/cat-png-1149.html, but hosted on a different platform with more permissive CORS
    // "https://i.ibb.co/d0FsH21r/cat.png"

    // from https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
    // "https://raw.githubusercontent.com/mdn/dom-examples/main/webgl-examples/tutorial/sample6/cubetexture.png"
    const {width,height,data}=await parsePng("https://raw.githubusercontent.com/mdn/dom-examples/main/webgl-examples/tutorial/sample6/cubetexture.png")

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
    )

    // set these parameters on the bound texture (anytime between creation and usage)
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE)
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE)
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST)
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST)

    return buffers
}

/** @typedef {{buffers:Buffer,programInfo:ProgramInfo}} Scene */

/**
 * 
 * @param {GL} gl 
 * @param {Scene} scene 
 */
function drawScene(gl,scene){
    gl.clearColor(0,0,0,1)
    gl.clearDepth(1)
    gl.enable(GL.DEPTH_TEST)
    gl.depthFunc(GL.LEQUAL)

    const {buffers,programInfo}=scene

    const fov=(45*Math.PI)/180
    const aspect=800/600
    const znear=0.1
    const zfar=100
    
    const projectionMatrix=mat4.create()
    mat4.perspective(projectionMatrix,fov,aspect,znear,zfar)

    const modelViewMatrix=mat4.create()
    mat4.translate(
        modelViewMatrix,
        modelViewMatrix,
        [0,0,-6]
    )

    // bind vertex data: position
    gl.bindBuffer(GL.ARRAY_BUFFER,buffers.position)
    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        3,
        GL.FLOAT,
        false,
        0, // stride of zero means 'auto'
        0,
    )

    // bind vertex data: uv coords
    gl.bindBuffer(GL.ARRAY_BUFFER,buffers.uvs)
    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexUVCoords,
        2,
        GL.FLOAT,
        false,
        0,
        0,
    )

    // upload shader binding data
    gl.useProgram(programInfo.program)
    gl.uniformMatrix4fv(
        programInfo.uniformLocations.projectionMatrix,
        false,
        projectionMatrix,
    )
    gl.uniformMatrix4fv(
        programInfo.uniformLocations.modelViewMatrix,
        false,
        modelViewMatrix,
    )

    let last_frametime=performance.now()

    let rotation=0
    const draw=()=>{
        /** delta time in ms */
        const deltatime=(performance.now()-last_frametime)*1e-3
        last_frametime=performance.now()

        // animate quad rotation
        rotation+=1.2*deltatime

        const modelViewMatrix=mat4.create()
        mat4.translate(
            modelViewMatrix,
            modelViewMatrix,
            [0,0,-6]
        )
        mat4.rotate(
            modelViewMatrix,
            modelViewMatrix,
            rotation,
            [0, 0, 1],
        );
        mat4.rotate(
            modelViewMatrix,
            modelViewMatrix,
            rotation*0.7,
            [0, 1, 0],
        );
        mat4.rotate(
            modelViewMatrix,
            modelViewMatrix,
            rotation*0.3,
            [1, 0, 0],
        );

        gl.useProgram(programInfo.program)
        gl.uniformMatrix4fv(
            programInfo.uniformLocations.modelViewMatrix,
            false,
            modelViewMatrix,
        )

        // clear screen to draw over
        gl.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT)

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

        requestAnimationFrame(draw)
    }
    draw()
}

export async function main(){
    const canvas_element_id="main-canvas"
    const el=document.getElementById(canvas_element_id)
    if(!(el instanceof HTMLCanvasElement)){
        const error=`element #${canvas_element_id} not found`
        alert(error);throw error
    }

    const gl=el.getContext("webgl2",{})
    if(!gl){
        const error=`could not create webgl2 context`
        alert(error);throw error
    }

    const programInfo=await makeProgram(gl)
    const buffers=await makeBuffers(gl)

    /** @type {Scene} */
    const scene={programInfo,buffers}

    drawScene(gl,scene)
}

/**
 * @typedef {{
 * touchId:number,
 * surfaceId:number,
 * position: DOMPointReadOnly,
 * surfaceDimensions?:DOMRectReadOnly,
 * }} GamepadTouch
 * */
/**
 * @typedef {{
 * hasOrientation:boolean,
 * hasPosition:boolean,
 * position:Float32Array,
 * linearVelocity:Float32Array,
 * linearAcceleration:Float32Array,
 * orientation:Float32Array,
 * angularVelocity:number,
 * angularAcceleration:number,
 * }} GamepadPose
 * https://developer.mozilla.org/en-US/docs/Web/API/GamepadPose
 * */
/**
 * @typedef {""|"right"|"left"} GamepadHand
 * https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/hand
 * */
/**
 * @typedef {{
 * hand?:GamepadHand,
 * pose?:GamepadPose,
 * hapticActuators?:GamepadHapticActuator[],
 * touches?:GamepadTouch[],
 * }} Gamepad2
 * */
window.addEventListener("gamepadconnected",async (e)=>{
    const gpid=e.gamepad.index;

    /** @type {(Gamepad&Gamepad2)|null} */
    const gp=navigator.getGamepads()[gpid];
    if(gp==null)throw`gamepad not found (this is a bug)`;
    console.log(
        `Gamepad connected at index ${gp.index}: `
        + `'${gp.id}'. ${gp.buttons.length} buttons, `
        + `${gp.axes.length} axes.`
    );
    await gp.vibrationActuator?.reset();

    // proposal: https://w3c.github.io/gamepad/extensions.html
    console.log(`hand: ${gp.hand}`);
    console.log(`hapticActuators: ${gp.hapticActuators}`);
    console.log(`pose: ${gp.pose}`);

    setInterval(async ()=>{
        /** @type {(Gamepad&Gamepad2)|null} */
        const gp=navigator.getGamepads()[gpid];
        if(gp==null)throw`gamepad not found (this is a bug)`;

        gp.buttons.forEach((v,i)=>{
            console.log(`button ${i} pressed ${v.pressed} touched ${v.touched} value ${v.value.toFixed(3)}`)
        })
        gp.axes.forEach((v,i)=>{
            console.log(`axis ${i} value ${v.toFixed(3)}`)
        })
        gp.touches?.forEach((v,i)=>{
            console.log(`touch ${i} value ${v}`)
        })

        // standard mapping: https://w3c.github.io/gamepad/#remapping
        const lefttriggervalue=Math.min(gp.buttons[6].value,1)
        const righttriggervalue=Math.min(gp.buttons[7].value,1)
        const leftbumper=Math.min(gp.buttons[4].value,1)
        const rightbumper=Math.min(gp.buttons[5].value,1)
        const buttonbottom=gp.buttons[0]
        const buttonright=gp.buttons[1]
        const buttonleft=gp.buttons[2]
        const buttontop=gp.buttons[3]
        if(leftbumper){
            await gp.vibrationActuator?.playEffect(
                /*type does not have an effect in practice*/
                "trigger-rumble",
                {
                    duration:150/*ms*/,
                    rightTrigger:1,
                }
            )
            await gp.vibrationActuator?.playEffect(
                /*type does not have an effect in practice*/
                "trigger-rumble",
                {
                    startDelay:200,
                    duration:150/*ms*/,
                    rightTrigger:1,
                }
            );
        }
        console.log(`buttons bottom ${buttonbottom.touched} right ${buttonright.touched} left ${buttonleft.touched} top ${buttontop.touched}`)
        console.log(`bumpers left ${leftbumper} right ${rightbumper}`)
        console.log(`lefttriggervalue ${lefttriggervalue} righttriggervalue ${righttriggervalue}`)
        if(0)gp.vibrationActuator?.playEffect(
            /*type does not have an effect in practice*/
            "trigger-rumble",
            {
                // magnitudes must be in range [0;1]

                duration:1000/*ms*/,
                // strong and weak are differnt kinds of vibration frequencies (?)
                strongMagnitude:rightbumper,
                weakMagnitude:leftbumper,
                // for those controllers that support it (trigger vibration)
                // (these are switched, at least with an xbox controller on macos)
                leftTrigger:righttriggervalue,
                rightTrigger:lefttriggervalue,
            }
        );
    },50)
})
