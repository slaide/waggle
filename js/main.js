// @ts-check

/** @typedef {Float32Array} mat4 */
/**
 * import from glMatrix
 * @type {{
 *      mat4:{
 *          create():mat4,
 *          perspective(out:mat4,fov_radians:number,aspect:number,znear:number,zfar:number):void,
 *          translate(out:mat4,src:mat4,distance:number[]):void,
*           clone(a:mat4):mat4,
*           copy(out:mat4,a:mat4):void,
 *      }
 * }}
 * @ts-ignore */ 
const {mat4}=glMatrix

/**
 * @param {WebGL2RenderingContext} gl
 * @param {{vs:string,fs:string}} stageSources
 * @returns {WebGLProgram}
 **/
function createShaderProgram(gl,stageSources){
    const {vs,fs}=stageSources

    const vsShader=createShaderStage("vert",vs)
    const fsShader=createShaderStage("frag",fs)

    const shaderProgram=gl.createProgram()
    gl.attachShader(shaderProgram,vsShader)
    gl.attachShader(shaderProgram,fsShader)
    gl.linkProgram(shaderProgram)

    if(!gl.getProgramParameter(shaderProgram,gl.LINK_STATUS)){
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
            "vert":gl.VERTEX_SHADER,
            "frag":gl.FRAGMENT_SHADER,
        }[stage])

        gl.shaderSource(shader,source)
        gl.compileShader(shader)

        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
            const error=`error compiling shader ${gl.getShaderInfoLog(shader)}`
            alert(error);throw error
        }
        
        return shader
    }
}

/** @typedef {{buffers:Buffer,programInfo:ProgramInfo}} Scene */

/**
 * 
 * @param {WebGL2RenderingContext} gl 
 * @param {Scene} scene 
 */
function drawScene(gl,scene){
    gl.clearColor(0,0,0,1)
    gl.clearDepth(1)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)

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
    gl.bindBuffer(gl.ARRAY_BUFFER,buffers.position)
    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        2,
        gl.FLOAT,
        false,
        0, // stride of zero means 'auto'
        0,
    )

    // bind vertex data: colors
    gl.bindBuffer(gl.ARRAY_BUFFER,buffers.color)
    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexColor,
        4,
        gl.FLOAT,
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
    const draw=()=>{
        /** delta time in ms */
        const deltatime=(performance.now()-last_frametime)*1e-3
        last_frametime=performance.now()

        // animate quad rotation
        const rotation=1.2*deltatime

        mat4.rotate(
            modelViewMatrix,
            modelViewMatrix,
            rotation,
            [0, 0, 1],
        );

        gl.useProgram(programInfo.program)
        gl.uniformMatrix4fv(
            programInfo.uniformLocations.modelViewMatrix,
            false,
            modelViewMatrix,
        )

        // clear screen to draw over
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

        // prepare draw: enable vertex data 
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition)
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor)
        // prepare draw: activate shader
        gl.useProgram(programInfo.program)

        // draw mesh
        gl.drawArrays(gl.TRIANGLE_STRIP,/*offset*/0,/*vertexCount*/4)

        requestAnimationFrame(draw)
    }
    draw()
}

/** @typedef {{position:WebGLBuffer,color:WebGLBuffer}} Buffer */
/**
 * 
 * @param {WebGL2RenderingContext} gl 
 * @returns {Buffer}
 */
function makeBuffers(gl){
    /** @type {Buffer} */
    const buffers={}

    buffers.position=gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position)
    const positions=new Float32Array([1,1, -1,1, 1,-1, -1,-1])
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

    buffers.color=gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color)
    const colors=new Float32Array([1,1,1,1, 1,0,0,1, 0,1,0,1, 0,0,1,1])
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW)
    
    return buffers
}

/**
 * @typedef {{
*     program: WebGLProgram,
*     attribLocations: {
*         vertexPosition: GLint,
*         vertexColor:GLint,
*     },
*     uniformLocations: {
*         projectionMatrix: WebGLUniformLocation,
*         modelViewMatrix: WebGLUniformLocation,
*     }
* }} ProgramInfo
* */
/**
 * 
 * @param {WebGL2RenderingContext} gl
 * @returns {ProgramInfo}
 */
function makeProgram(gl){
    const shaderProgram=createShaderProgram(gl,{
        vs:`
            attribute vec4 aVertexPosition;
            attribute vec4 aVertexColor;

            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;

            varying lowp vec4 vColor;

            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
                vColor = aVertexColor;
            }
        `,
        fs:`
            varying lowp vec4 vColor;

            void main() {
                gl_FragColor = vColor;
            }
        `
    })

    /** @type {ProgramInfo} */
    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition"),
            vertexColor: gl.getAttribLocation(shaderProgram, "aVertexColor"),
        },
        uniformLocations: {
            projectionMatrix: gl.getUniformLocation(shaderProgram, "uProjectionMatrix"),
            modelViewMatrix: gl.getUniformLocation(shaderProgram, "uModelViewMatrix"),
        },
    };

    return programInfo
}

async function main(){
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

    const programInfo=makeProgram(gl)
    const buffers=makeBuffers(gl)

    /** @type {Scene} */
    const scene={programInfo,buffers}

    drawScene(gl,scene)
}
window.addEventListener("load",main)
