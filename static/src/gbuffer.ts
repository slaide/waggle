import { GL, GLC } from "./gl";
import { Camera } from "./scene/camera";
import { createShaderProgram } from "./scene/gameobject";
import { PointLight, DirectionalLight } from "./scene/light";
import { vec3, mat4 } from "gl-matrix";

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
            {
                name: "objectId",
                format: GL.R32UI,
                attachmentid: 3,
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

    /**
     * Bind framebuffer for drawing and clear all layers properly, including integer buffers
     */
    clearAndBind() {
        const { gl } = this;
        
        // Bind the GBuffer for clearing
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.gbuffer);
        gl.drawBuffers(this.layerAttachments);
        
        // Clear each buffer individually using the appropriate clear function
        for (let i = 0; i < this.layers.length; i++) {
            const layer = this.layers[i];
            
            if (layer.name === "objectId") {
                // Integer buffer needs special clearing
                const clearValue = new Uint32Array([0, 0, 0, 0]); // Clear to 0 (no object), WebGL expects 4 values
                gl.clearBufferuiv(gl.COLOR, layer.attachmentid, clearValue);
            } else {
                // Float buffers: clear each one individually
                const clearValue = new Float32Array([0.0, 0.0, 0.0, 0.0]);
                gl.clearBufferfv(gl.COLOR, layer.attachmentid, clearValue);
            }
        }
        
        // Clear depth buffer
        gl.clearBufferfv(gl.DEPTH, 0, new Float32Array([1.0]));
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

    /**
     * Get the object ID at the specified screen coordinates
     * @param x Screen x coordinate (0 to canvas width)
     * @param y Screen y coordinate (0 to canvas height) 
     * @returns GameObject ID or 0 if no object
     */
    pickObject(x: number, y: number, scene: any, camera: any): number {
        // Ensure coordinates are within bounds
        if (x < 0 || x >= this.size.width || y < 0 || y >= this.size.height) {
            return 0;
        }
        
        // Flip Y coordinate for WebGL
        const flippedY = this.size.height - y - 1;
        
        // Bind the read framebuffer to read from textures
        this.gl.bindFramebuffer(this.gl.READ_FRAMEBUFFER, this.readFbo);
        
        // Sample object ID from GBuffer
        this.gl.readBuffer(this.gl.COLOR_ATTACHMENT0 + 3); // Object ID attachment
        const objectIdPixel = new Uint32Array(1);
        this.gl.readPixels(x, flippedY, 1, 1, this.gl.RED_INTEGER, this.gl.UNSIGNED_INT, objectIdPixel);
        
        // Sample depth from GBuffer position layer (depth stored in position.w)
        this.gl.readBuffer(this.gl.COLOR_ATTACHMENT0 + 0); // Position attachment
        const positionPixel = new Float32Array(4);
        this.gl.readPixels(x, flippedY, 1, 1, this.gl.RGBA, this.gl.FLOAT, positionPixel);
        
        this.gl.bindFramebuffer(this.gl.READ_FRAMEBUFFER, null);
        
        const deferredObjectId = objectIdPixel[0];
        const deferredDepth = positionPixel[3]; // Depth is stored in position.w
        
        // If we hit a deferred object, check if any forward-rendered objects are closer
        if (deferredObjectId > 0) {
            const forwardHit = this.raycastForwardObjects(x, y, scene, camera);
            if (forwardHit && forwardHit.depth < deferredDepth) {
                return forwardHit.objectId;
            }
            return deferredObjectId;
        } else {
            // No deferred object hit, check forward-rendered objects only
            const forwardHit = this.raycastForwardObjects(x, y, scene, camera);
            return forwardHit ? forwardHit.objectId : 0;
        }
    }
    
    // Raycast against forward-rendered objects
    private raycastForwardObjects(x: number, y: number, scene: any, camera: any): { objectId: number, depth: number } | null {
        // Convert screen coordinates to normalized device coordinates
        const ndcX = (x / this.size.width) * 2 - 1;
        const ndcY = ((this.size.height - y) / this.size.height) * 2 - 1; // Flip Y for NDC
        
        // Create ray from camera through the pixel
        const ray = this.createCameraRay(ndcX, ndcY, camera);
        
        let closestHit: { objectId: number, depth: number } | null = null;
        let closestDistance = Infinity;
        
        // Test all forward-rendered objects
        const allObjects = scene.getAllObjects();
        const forwardObjects = allObjects.filter((obj: any) => obj.forwardRendered && obj.shouldDraw);
        
        forwardObjects.forEach((obj: any) => {
            const hit = this.rayBoxIntersect(ray, obj);
            if (hit && hit.distance < closestDistance) {
                closestDistance = hit.distance;
                closestHit = {
                    objectId: obj.id,
                    depth: hit.distance
                };
            }
        });
        
        return closestHit;
    }
    
    // Create a ray from camera through screen pixel
    private createCameraRay(ndcX: number, ndcY: number, camera: any): { origin: vec3, direction: vec3 } {
        
        // Get camera matrices
        const viewMatrix = camera.viewMatrix;
        const projMatrix = camera.projectionMatrix;
        
        // Create inverse matrices
        const invView = mat4.create();
        const invProj = mat4.create();
        mat4.invert(invView, viewMatrix);
        mat4.invert(invProj, projMatrix);
        
        // Ray in clip space
        const clipNear = vec3.fromValues(ndcX, ndcY, -1);
        const clipFar = vec3.fromValues(ndcX, ndcY, 1);
        
        // Transform to view space
        const viewNear = vec3.create();
        const viewFar = vec3.create();
        vec3.transformMat4(viewNear, clipNear, invProj);
        vec3.transformMat4(viewFar, clipFar, invProj);
        
        // Perspective divide
        viewNear[0] /= viewNear[3] || 1;
        viewNear[1] /= viewNear[3] || 1;
        viewNear[2] /= viewNear[3] || 1;
        viewFar[0] /= viewFar[3] || 1;
        viewFar[1] /= viewFar[3] || 1;
        viewFar[2] /= viewFar[3] || 1;
        
        // Transform to world space
        const worldNear = vec3.create();
        const worldFar = vec3.create();
        vec3.transformMat4(worldNear, viewNear, invView);
        vec3.transformMat4(worldFar, viewFar, invView);
        
        // Create ray
        const origin = vec3.clone(worldNear);
        const direction = vec3.create();
        vec3.subtract(direction, worldFar, worldNear);
        vec3.normalize(direction, direction);
        
        return { origin, direction };
    }
    
    // Ray-box intersection test
    private rayBoxIntersect(ray: { origin: vec3, direction: vec3 }, obj: any): { distance: number } | null {
        // Get object's world matrix
        const worldMatrix = obj.transform.worldMatrix;
        
        // Calculate bounding box in world space
        let min = vec3.fromValues(-0.5, -0.5, -0.5);
        let max = vec3.fromValues(0.5, 0.5, 0.5);
        
        // If object has a calculateBoundingBox method, use it
        if (typeof obj.calculateBoundingBox === 'function') {
            const bounds = obj.calculateBoundingBox();
            min = bounds.min;
            max = bounds.max;
        }
        
        // Transform bounding box to world space
        const worldMin = vec3.create();
        const worldMax = vec3.create();
        vec3.transformMat4(worldMin, min, worldMatrix);
        vec3.transformMat4(worldMax, max, worldMatrix);
        
        // Ensure min/max are correct after transformation
        const actualMin = vec3.fromValues(
            Math.min(worldMin[0], worldMax[0]),
            Math.min(worldMin[1], worldMax[1]),
            Math.min(worldMin[2], worldMax[2])
        );
        const actualMax = vec3.fromValues(
            Math.max(worldMin[0], worldMax[0]),
            Math.max(worldMin[1], worldMax[1]),
            Math.max(worldMin[2], worldMax[2])
        );
        
        // Ray-AABB intersection
        const invDir = vec3.fromValues(
            1.0 / ray.direction[0],
            1.0 / ray.direction[1],
            1.0 / ray.direction[2]
        );
        
        const t1 = vec3.fromValues(
            (actualMin[0] - ray.origin[0]) * invDir[0],
            (actualMin[1] - ray.origin[1]) * invDir[1],
            (actualMin[2] - ray.origin[2]) * invDir[2]
        );
        
        const t2 = vec3.fromValues(
            (actualMax[0] - ray.origin[0]) * invDir[0],
            (actualMax[1] - ray.origin[1]) * invDir[1],
            (actualMax[2] - ray.origin[2]) * invDir[2]
        );
        
        const tMin = vec3.fromValues(
            Math.min(t1[0], t2[0]),
            Math.min(t1[1], t2[1]),
            Math.min(t1[2], t2[2])
        );
        
        const tMax = vec3.fromValues(
            Math.max(t1[0], t2[0]),
            Math.max(t1[1], t2[1]),
            Math.max(t1[2], t2[2])
        );
        
        const tNear = Math.max(tMin[0], tMin[1], tMin[2]);
        const tFar = Math.min(tMax[0], tMax[1], tMax[2]);
        
        // Check if ray intersects box
        if (tNear <= tFar && tFar >= 0) {
            const distance = tNear >= 0 ? tNear : tFar;
            return { distance };
        }
        
        return null;
    }
}
