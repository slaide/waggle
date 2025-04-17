// @ts-check

const GL=WebGL2RenderingContext
/** @typedef {WebGL2RenderingContext} GL */

/** @typedef {Float32Array} mat4 */
/**
 * import from glMatrix
 * @type {{
 *      mat4:{
 *          create():mat4,
 *          perspective(out:mat4,fov_radians:number,aspect:number,znear:number,zfar:number):void,
 *          translate(out:mat4,src:mat4,distance:number[]):void,
 *          rotate(out:mat4,src:mat4,angle:number,axis:number[]):void,
 *          clone(a:mat4):mat4,
 *          copy(out:mat4,a:mat4):void,
 *      }
 * }}
 * @ts-ignore */ 
const {mat4}=glMatrix

/**
 * @param {GL} gl
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
        }[stage])

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
 * @returns {ProgramInfo}
 */
function makeProgram(gl){
    const shaderProgram=createShaderProgram(gl,{
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
            projectionMatrix: gl.getUniformLocation(shaderProgram, "uProjectionMatrix"),
            modelViewMatrix: gl.getUniformLocation(shaderProgram, "uModelViewMatrix"),
            uSampler: gl.getUniformLocation(shaderProgram, "uSampler"),
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
 * @returns {Buffer}
 */
function makeBuffers(gl){
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
    const width=4;const height=3;
    const imgData=new Uint8Array([
        255,0,0,255,
          0,0,0,255,
        255,0,0,255,
        255,0,0,255,
        
        255,0,0,255,
          0,0,0,255,
        255,0,0,255,
        255,0,0,255,

        255,0,0,255,
        255,0,0,255,
          0,0,0,255,
        255,0,0,255,
    ])

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
        imgData
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
