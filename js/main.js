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

    /**
     * 
     * @param {string} str 
     * @returns {Uint8Array}
     */
    function stringToUint8Array(str) {
        const uint8Array = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
            uint8Array[i] = str.charCodeAt(i);  // Get ASCII value of each character
        }
        return uint8Array;
    }
    /**
     * 
     * @param {Uint8Array} ar 
     * @returns {string}
     */
    function uint8ArrayToString(ar){
        let ret=""
        for(let i=0;i<ar.length;i++){
            ret+=String.fromCharCode(ar[i])
        }
        return ret
    }
    /**
     * 
     * @param {Uint8Array} a 
     * @param {Uint8Array} b 
     * @returns {boolean}
     */
    function arrayBeginsWith(a,b){
        const len=Math.min(a.length,b.length)
        for(let i=0;i<len;i++){
            if(a[i]!=b[i])return false;
        }
        return true;
    }
    /**
     * 
     * @param {Uint8Array} uint8Array 
     * @returns {number}
     */
    function arrToUint32(uint8Array) {
        const numbytes=4
        if (uint8Array.length < numbytes) {
            throw new Error("Not enough bytes to form a Uint32.");
        }
      
        // Slice a portion of the array (length 4) and convert to Uint32
        let ret=0
        for(let i=0;i<numbytes;i++){
            ret|=uint8Array[i]<<(8*(numbytes-1-i))
        }
      
        return ret
    }
    /**
     * 
     * @param {Uint8Array} uint8Array 
     * @returns {number}
     */
    function arrToUint16(uint8Array) {
        const numbytes=2
        if (uint8Array.length < numbytes) {
            throw new Error("Not enough bytes to form a Uint32.");
        }
      
        // Slice a portion of the array (length 4) and convert to Uint32
        let ret=0
        for(let i=0;i<numbytes;i++){
            ret|=uint8Array[i]<<(8*(numbytes-1-i))
        }
      
        return ret
    }
    /**
     * 
     * @param {Uint8Array} uint8Array 
     * @returns {number}
     */
    function arrToUint8(uint8Array) {
        const numbytes=1
        if (uint8Array.length < numbytes) {
            throw new Error("Not enough bytes to form a Uint32.");
        }
      
        // Slice a portion of the array (length 4) and convert to Uint32
        let ret=0
        for(let i=0;i<numbytes;i++){
            ret|=uint8Array[i]<<(8*(numbytes-1-i))
        }
      
        return ret
    }

    /**
     * spec at https://www.w3.org/TR/png-3/#10Compression
     * 
     * zlib [rfc1950](https://www.rfc-editor.org/rfc/rfc1950)
     * deflate [rfc1951](https://www.rfc-editor.org/rfc/rfc1951)
     * 
     * @param {string} src 
     * @returns {Promise<{width:number,height:number,data:Uint8Array}>}
     */
    async function parsePng(src){
        let responseData=await (new Promise((resolve,reject)=>{
            const xhr=new XMLHttpRequest()
            xhr.open("GET",src,true)
            xhr.responseType = 'arraybuffer'
            xhr.onload=ev=>{
                resolve(xhr.response)
            }
            xhr.onerror=ev=>{
                alert(`failed to fetch png`)
                reject({xhr,ev})
            }
            xhr.send()
        }));

        /**
         * @typedef {{
         * width:number,
         * height:number,
         * bitdepth:number,
         * colortype:"RBG"|"RGBA"|"G"|"GA"|"Indexed",
         * compressionmethod:number,
         * filtermethod:number,
         * interlacemethod:"nointerlace"|"Adam7",
         * }} IHDR_chunk
         */
        /** @type {IHDR_chunk?} */
        let IHDR=null
        /** @type {Uint8Array?} */
        let IDAT=null

        let width
        let height

        const pngdata=new Uint8Array(responseData)
        console.log(`got ${pngdata.length} bytes`)

        let pngslice=pngdata.slice(0)

        const png_start=new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        if(!arrayBeginsWith(pngslice,png_start)){const error=`png start invalid`;alert(error);throw error;}
        pngslice=pngslice.slice(png_start.length)

        while(pngslice.length>0){
            let chunklength=arrToUint32(pngslice.slice(0,4))
            let header=uint8ArrayToString(pngslice.slice(4,8))
            let chunkdata=pngslice.slice(8,8+chunklength)
            let crc=pngslice.slice(8+chunklength,8+chunklength+4)

            pngslice=pngslice.slice(8+chunklength+4)

            console.log(`chunk: ${header} len ${chunklength}`)
            if(header=="IHDR"){
                /**
                 * Width	4 bytes
                    Height	4 bytes
                    Bit depth	1 byte
                    Color type	1 byte
                    Compression method	1 byte
                    Filter method	1 byte
                    Interlace method	1 byte
                 */
                width=arrToUint32(chunkdata.slice(0,4))
                height=arrToUint32(chunkdata.slice(4,8))
                const bitdepth=arrToUint8(chunkdata.slice(8,9))
                const colortype_raw=arrToUint8(chunkdata.slice(9,10))
                const compressionmethod=arrToUint8(chunkdata.slice(10,11))
                const filtermethod=arrToUint8(chunkdata.slice(11,12))
                const interlacemethod_raw=arrToUint8(chunkdata.slice(12,13))

                const colortype={
                    0:"G",
                    2:"RGB",
                    3:"Indexed",
                    4:"GA",
                    6:"RGBA",
                }[colortype_raw]
                if(compressionmethod!=0){const error=`compressionmethod ${compressionmethod}!=0`;alert(error);throw error;}
                if(filtermethod!=0){const error=`filtermethod ${filtermethod}!=0`;alert(error);throw error;}
                const interlacemethod={
                    0:"nointerlace",
                    1:"Adam7",
                }[interlacemethod_raw]

                IHDR={
                    width,height,
                    bitdepth,
                    /// @ts-ignore
                    colortype,
                    compressionmethod,
                    filtermethod,
                    /// @ts-ignore
                    interlacemethod,
                }
                console.log("IHDR:",JSON.stringify(IHDR))
            }else if(header=="IDAT"){
                if(!IDAT){
                    IDAT=chunkdata
                }else{
                    /** @type {Uint8Array} */
                    const newar=new Uint8Array(IDAT.length+chunkdata.length)
                    newar.set(IDAT)
                    newar.set(chunkdata,IDAT.length)
                    IDAT=newar
                }
            }
        }

        console.log(`IDAT length: ${IDAT.length}.. TODO decode`)
        // idat is a zlib compressed stream. zlib only supports one compression method: deflate. (compression method 0 in the png ihdr)

        /**
         * 
         * @param {Uint8Array} zlibCompressedData 
         * @returns {Uint8Array}
         */
        function zlib(zlibCompressedData){
            /** @type {number[]} */
            const ret=[]
            let d=zlibCompressedData

            while(1){
                const cmf=arrToUint8(d.slice(0,1))
                const flg=arrToUint8(d.slice(1,2))
                d=d.slice(2)

                const compression_method=cmf&0xf
                const compression_info=cmf>>4
                if(compression_method!=8){const error=`${compression_method}!=8`;alert(error);throw error}
                const window_size=1<<(compression_info+8)
                console.log(`window size ${window_size}`)

                const preset_dict=flg&(1<<5)
                console.log(`preset_dict? ${preset_dict}`)

                const dictid=preset_dict?arrToUint32(d.slice(2,6)):0
                if(preset_dict){d=d.slice(4)}

                // TODO implement deflate

                break
            }

            return new Uint8Array(ret)
        }
        const filteredData=zlib(IDAT)

        const data=new Uint8Array(width*height*4)

        // TODO 

        return {width,height,data}
    }

    // from http://pluspng.com/cat-png-1149.html, but hosted on a different platform with more permissive CORS
    const {width,height,data}=await parsePng("https://i.ibb.co/d0FsH21r/cat.png")

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

    const programInfo=await makeProgram(gl)
    const buffers=await makeBuffers(gl)

    /** @type {Scene} */
    const scene={programInfo,buffers}

    drawScene(gl,scene)
}
window.addEventListener("load",main)
