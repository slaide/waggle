import { GL, GLC } from "./gl";
import { Camera } from "./scene/camera";
import { createShaderProgram } from "./scene/gameobject";
import { PointLight, DirectionalLight } from "./scene/light";

const POINTLIGHTBLOCKBINDING = 1;
const DIRECTIONALLIGHTBLOCKBINDING = 2;

const MAX_NUM_POINTLIGHTS = 32;
const MAX_NUM_SPOTLIGHTS = 1;
const MAX_NUM_DIRECTIONALLIGHTS = 1;

export class GBuffer {
    constructor(
        public gl: GLC,
        public size: { width: number; height: number },

        /** full screen quad to draw lights with (gbuffer + lights -> screen) */
        public fsq: WebGLProgram,

        public camera: Camera = new Camera(),

        public gbuffer: WebGLFramebuffer = gl.createFramebuffer(),
        public layer_textures: { [name: string]: WebGLTexture } = {},
        public layer_depth: WebGLRenderbuffer = gl.createRenderbuffer(),

        public readFbo: WebGLFramebuffer = gl.createFramebuffer(),
        public readTextures: { [name: string]: WebGLTexture } = {},

        public pointLightUBO: WebGLBuffer = gl.createBuffer(),
        public directionalLightUBO: WebGLBuffer = gl.createBuffer(),

        public layers: {
            name: string;
            format: GLint;
            attachmentid: GLint;
        }[] = [],
        /** used with gl.drawBuffers */
        public layerAttachments: GLint[] = [],
    ) {
        // Initialize lights to empty arrays
        this.updatePointlights([]);
        this.updateDirectionalLights([]);
    }

    static async make(gl: GLC, size: { width: number; height: number }) {
        const fsq = await createShaderProgram(gl, {
            vs: await fetch('/static/src/shaders/deferred_lighting.vert').then(r => r.text()),
            fs: await fetch('/static/src/shaders/deferred_lighting.frag').then(r => r.text()),
        });

        // create with default size
        const gbuffer = new GBuffer(gl, { width: 1, height: 1 }, fsq);

        const extHF = gl.getExtension("EXT_color_buffer_half_float");
        if (!extHF) throw `EXT_color_buffer_half_float unimplemented`;
        gbuffer.layers = [
            {
                name: "position",
                format: extHF.RGBA16F_EXT,
                attachmentid: 0,
            },
            {
                name: "normal",
                format: extHF.RGBA16F_EXT,
                attachmentid: 1,
            },
            {
                name: "diffuse",
                format: GL.RGBA8,
                attachmentid: 2,
            },
        ];

        // then resize to current size
        gbuffer._resize(size);

        return gbuffer;
    }

    _resize(newsize: { width: number; height: number }) {
        const gl = this.gl;
        const { width: w, height: h } = newsize;

        // return if the size has not actually changed
        if (this.size.width == w && this.size.height == h) {
            return;
        }

        // update stored size
        this.size.width = w;
        this.size.height = h;

        // update camera aspect ratio
        this.camera.aspect = w / h;

        // create new gbuffer texture
        this.layer_textures = {};
        this.layer_depth = gl.createRenderbuffer();

        for (const layerinfo of this.layers) {
            const target_texture = gl.createTexture();
            this.layer_textures[layerinfo.name] = target_texture;

            const format = layerinfo.format;

            gl.bindTexture(GL.TEXTURE_2D, target_texture);
            gl.texStorage2D(GL.TEXTURE_2D, 1, format, w, h);
            gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
            gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
        }

        gl.bindRenderbuffer(GL.RENDERBUFFER, this.layer_depth);
        gl.renderbufferStorage(GL.RENDERBUFFER, GL.DEPTH24_STENCIL8, w, h);

        // create framebuffer
        const gbuffer = gl.createFramebuffer();
        this.gbuffer = gbuffer;

        // bind resources to framebuffer
        gl.bindFramebuffer(GL.FRAMEBUFFER, this.gbuffer);
        for (const layerinfo of this.layers) {
            gl.framebufferTexture2D(
                GL.FRAMEBUFFER,
                GL.COLOR_ATTACHMENT0 + layerinfo.attachmentid,
                GL.TEXTURE_2D,
                this.layer_textures[layerinfo.name],
                0,
            );
        }
        gl.framebufferRenderbuffer(
            GL.FRAMEBUFFER,
            GL.DEPTH_STENCIL_ATTACHMENT,
            GL.RENDERBUFFER,
            this.layer_depth,
        );

        this.layerAttachments = this.layers.map(
            (l) => GL.COLOR_ATTACHMENT0 + l.attachmentid,
        );

        console.assert(
            gl.checkFramebufferStatus(GL.FRAMEBUFFER) ===
                GL.FRAMEBUFFER_COMPLETE,
            "G-buffer incomplete:",
            gl.checkFramebufferStatus(GL.FRAMEBUFFER),
        );

        gl.bindFramebuffer(GL.FRAMEBUFFER, null);

        // set up read-only framebuffer..
        // (because webgl2 does not let you read from a texture that is used as write target
        // in a framebuffer, and webgl2 has no sync primitives to explicitely transition from
        // write to read, so instead we copy into an explicit read buffer, which wastes gpu
        // gpu bandwidth, but there is no other way)

        // create read only textures
        this.readTextures = {};
        for (const layerinfo of this.layers) {
            const tex = gl.createTexture();
            this.readTextures[layerinfo.name] = tex;

            gl.bindTexture(GL.TEXTURE_2D, tex);
            gl.texStorage2D(GL.TEXTURE_2D, 1, layerinfo.format, w, h);
            gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
            gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
        }

        this.readFbo = gl.createFramebuffer();

        // allocate storage and attach to readFbo
        gl.bindFramebuffer(GL.FRAMEBUFFER, this.readFbo);

        for (const [i, layerinfo] of this.layers.entries()) {
            const tex = this.readTextures[layerinfo.name];

            gl.framebufferTexture2D(
                GL.FRAMEBUFFER,
                this.layerAttachments[i],
                GL.TEXTURE_2D,
                tex,
                0,
            );
        }

        gl.bindFramebuffer(GL.FRAMEBUFFER, null);
    }

    updatePointlights(pointLightsArray: PointLight[]) {
        const { gl, fsq } = this;

        gl.useProgram(fsq);
        const pointBlockIndex = gl.getUniformBlockIndex(fsq, "PointLightBlock");
        const blockSizeBytes = gl.getActiveUniformBlockParameter(
            fsq,
            pointBlockIndex,
            gl.UNIFORM_BLOCK_DATA_SIZE,
        );
        gl.uniformBlockBinding(fsq, pointBlockIndex, POINTLIGHTBLOCKBINDING);

        // dirLightsArray is JS array of {direction:[x,y,z], color:[r,g,b], intensity:f}
        // You also need to store numDirLights and pad three floats.
        const data = new ArrayBuffer(blockSizeBytes);
        const dataView = new DataView(data);

        let offset = 0;

        // Write numDirLights at offset 0
        dataView.setInt32(offset, pointLightsArray.length, true);
        offset += 4;

        // data[1..3] = 0 (padding)
        offset += 3 * 4;

        // Starting at offset 4 floats (index=4), we write each DirLight as:
        //    [dir.x, dir.y, dir.z, pad0=0]
        //    [col.r, col.g, col.b, intensity]
        for (
            let i = 0;
            i < Math.min(pointLightsArray.length, MAX_NUM_POINTLIGHTS);
            ++i
        ) {
            const d = pointLightsArray[i];

            dataView.setFloat32(offset + 0 * 4, d.transform.position[0], true);
            dataView.setFloat32(offset + 1 * 4, d.transform.position[1], true);
            dataView.setFloat32(offset + 2 * 4, d.transform.position[2], true);

            dataView.setFloat32(offset + 3 * 4, d.radius, true);

            dataView.setFloat32(offset + 4 * 4, d.color[0], true);
            dataView.setFloat32(offset + 5 * 4, d.color[1], true);
            dataView.setFloat32(offset + 6 * 4, d.color[2], true);

            dataView.setFloat32(offset + 7 * 4, d.intensity, true);

            offset += 8 * 4; // next DirLight (8 floats = 32 bytes)
        }

        // 4) Create UBO and upload
        const ubo = gl.createBuffer();
        gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
        gl.bufferData(gl.UNIFORM_BUFFER, dataView.buffer, gl.STATIC_DRAW);
        // 5) Bind it to binding point 0:
        gl.bindBufferBase(gl.UNIFORM_BUFFER, POINTLIGHTBLOCKBINDING, ubo);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);

        this.pointLightUBO = ubo;
    }

    updateDirectionalLights(directionalLightsArray: DirectionalLight[]) {
        const { gl, fsq } = this;

        gl.useProgram(fsq);
        const dirBlockIndex = gl.getUniformBlockIndex(fsq, "DirectionalLightBlock");
        const blockSizeBytes = gl.getActiveUniformBlockParameter(
            fsq,
            dirBlockIndex,
            gl.UNIFORM_BLOCK_DATA_SIZE,
        );
        gl.uniformBlockBinding(fsq, dirBlockIndex, DIRECTIONALLIGHTBLOCKBINDING);

        const data = new ArrayBuffer(blockSizeBytes);
        const dataView = new DataView(data);

        let offset = 0;

        // Write numDirLights at offset 0
        dataView.setInt32(offset, directionalLightsArray.length, true);
        offset += 4;

        // data[1..3] = 0 (padding)
        offset += 3 * 4;

        // Starting at offset 4 floats (index=4), we write each DirLight as:
        //    [dir.x, dir.y, dir.z, pad0=0]
        //    [col.r, col.g, col.b, intensity]
        for (
            let i = 0;
            i < Math.min(directionalLightsArray.length, MAX_NUM_DIRECTIONALLIGHTS);
            ++i
        ) {
            const d = directionalLightsArray[i];

            dataView.setFloat32(offset + 0 * 4, d.direction[0], true);
            dataView.setFloat32(offset + 1 * 4, d.direction[1], true);
            dataView.setFloat32(offset + 2 * 4, d.direction[2], true);
            dataView.setFloat32(offset + 3 * 4, 0.0, true); // pad0

            dataView.setFloat32(offset + 4 * 4, d.color[0], true);
            dataView.setFloat32(offset + 5 * 4, d.color[1], true);
            dataView.setFloat32(offset + 6 * 4, d.color[2], true);
            dataView.setFloat32(offset + 7 * 4, d.intensity, true);

            offset += 8 * 4; // next DirLight (8 floats = 32 bytes)
        }

        // Create UBO and upload
        const ubo = gl.createBuffer();
        gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
        gl.bufferData(gl.UNIFORM_BUFFER, dataView.buffer, gl.STATIC_DRAW);
        // Bind it to binding point
        gl.bindBufferBase(gl.UNIFORM_BUFFER, DIRECTIONALLIGHTBLOCKBINDING, ubo);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);

        this.directionalLightUBO = ubo;
    }

    draw() {
        const { gl, fsq } = this;

        // read from gbuffer
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.gbuffer);
        // draw into default framebuffer (to screen)
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        gl.drawBuffers([gl.BACK]);

        // Reset viewport to canvas size:
        gl.viewport(0, 0, this.size.width, this.size.height);

        // Optional: clear out the backbuffer if you want
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        //1) Copy G-buffer into readFbo
        gl.bindFramebuffer(GL.READ_FRAMEBUFFER, this.gbuffer);
        gl.bindFramebuffer(GL.DRAW_FRAMEBUFFER, this.readFbo);

        const { width: w, height: h } = this.size;
        for (const [i, attachment] of this.layerAttachments.entries()) {
            // because of reasons i dont fully understand, the draw buffers
            // are not reset at each invocation, so to e.g. write into COLOR_ATTACHMENT1,
            // the arguments to gl.drawBuffers must be an array where unused
            // attachment slots (by position!) are gl.NONE.
            const drawBuffers = [];
            for (let j = 0; j < i; j++) {
                drawBuffers.push(gl.NONE);
            }
            drawBuffers.push(attachment);

            gl.readBuffer(attachment);
            gl.drawBuffers(drawBuffers);
            gl.blitFramebuffer(
                0,
                0,
                w,
                h,
                0,
                0,
                w,
                h,
                gl.COLOR_BUFFER_BIT,
                gl.NEAREST,
            );
        }

        // 2) Now go back to default framebuffer
        gl.bindFramebuffer(GL.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.size.width, this.size.height);

        // 3) Sample from readTextures in your FSQ shader
        gl.useProgram(fsq);
        gl.activeTexture(GL.TEXTURE0);
        gl.bindTexture(GL.TEXTURE_2D, this.readTextures.position);
        gl.uniform1i(gl.getUniformLocation(fsq, "gPosition"), 0);

        gl.activeTexture(GL.TEXTURE1);
        gl.bindTexture(GL.TEXTURE_2D, this.readTextures.normal);
        gl.uniform1i(gl.getUniformLocation(fsq, "gNormal"), 1);

        gl.activeTexture(GL.TEXTURE2);
        gl.bindTexture(GL.TEXTURE_2D, this.readTextures.diffuse);
        gl.uniform1i(gl.getUniformLocation(fsq, "gAlbedoSpec"), 2);

        const camPosLoc = gl.getUniformLocation(fsq, "uCamPos");
        gl.uniform3fv(camPosLoc, new Float32Array(this.camera.position));

        gl.bindBufferBase(
            gl.UNIFORM_BUFFER,
            POINTLIGHTBLOCKBINDING,
            this.pointLightUBO,
        );

        gl.bindBufferBase(
            gl.UNIFORM_BUFFER,
            DIRECTIONALLIGHTBLOCKBINDING,
            this.directionalLightUBO,
        );

        // Draw 3 vertices (covering the whole screen)
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
}
