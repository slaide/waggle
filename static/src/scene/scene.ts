"use strict";

import { GL, GLC } from "../gl.js";
import { parsePng } from "../bits/png.js";
import { MtlMaterial, ObjFile } from "../bits/obj.js";
import { mat4, vec3, quat, glMatrix as glm } from "gl-matrix";

import {Camera} from "./camera.js";
import {GameObject,createShaderProgram} from "./gameobject.js";

export class Scene{
    size:{width:number,height:number};

    gl:GLC;
    objects:GameObject[];
    camera:Camera;
    shouldDraw:boolean;

    gbuffer:WebGLFramebuffer;
    gbufferTextures:{[name:string]:WebGLTexture}={};
    
    readFbo:WebGLFramebuffer;
    readTextures:{[name:string]:WebGLTexture}={};
    readAttachments:any[]=[];

    constructor(
        gl:GLC,
        size:{width:number,height:number},
    ){
        this.gl=gl;
        this.objects=[];
        this.camera=new Camera();

        this.shouldDraw=true;

        this.size={width:0,height:0};

        this.readFbo=gl.createFramebuffer();
        // make initial framebuffer (just to complete field construction)
        this.gbuffer=gl.createFramebuffer();

        // make gbuffer
        this._resize(size);

        console.log(`${gl.checkFramebufferStatus(GL.FRAMEBUFFER)} == ${GL.FRAMEBUFFER_COMPLETE} ? ${gl.checkFramebufferStatus(GL.FRAMEBUFFER)==GL.FRAMEBUFFER_COMPLETE}`)
    }

    _resize(newsize:{width:number,height:number}){
        const gl=this.gl;
        const {width:w,height:h}=newsize;

        // return if the size has not actually changed
        if(this.size.width==w && this.size.height==h){
            return;
        }

        // update stored size
        this.size.width=w;
        this.size.height=h;

        // update camera aspect ratio
        this.camera.aspect=w/h;

        // create new gbuffer texture
        this.gbufferTextures={
            position:gl.createTexture(),
            normal:gl.createTexture(),
            diffuse:gl.createTexture(),

            depth:gl.createRenderbuffer(),
        };

        const extHF = gl.getExtension("EXT_color_buffer_half_float");
        if(!extHF)throw`EXT_color_buffer_half_float unimplemented`;

        const formats:{[name:string]:GLenum} = {
            position: extHF.RGBA16F_EXT,
            normal:   extHF.RGBA16F_EXT,
            diffuse:  GL.RGBA8,
        };

        for(let name of Object.keys(this.gbufferTextures)){
            const target_texture=this.gbufferTextures[name];
            if(!(target_texture instanceof WebGLTexture))continue;

            const format=formats[name];

            gl.bindTexture(GL.TEXTURE_2D, target_texture);
            gl.texStorage2D(GL.TEXTURE_2D,1,format,w,h);
            gl.texParameteri(GL.TEXTURE_2D,GL.TEXTURE_MIN_FILTER,GL.NEAREST);
            gl.texParameteri(GL.TEXTURE_2D,GL.TEXTURE_MAG_FILTER,GL.NEAREST);
        }

        gl.bindRenderbuffer(GL.RENDERBUFFER,this.gbufferTextures.depth);
        gl.renderbufferStorage(GL.RENDERBUFFER,GL.DEPTH24_STENCIL8,w,h);

        // create framebuffer
        const gbuffer=gl.createFramebuffer();
        this.gbuffer=gbuffer;

        // bind resources to framebuffer
        gl.bindFramebuffer(GL.FRAMEBUFFER,this.gbuffer);
        gl.framebufferTexture2D(GL.FRAMEBUFFER,GL.COLOR_ATTACHMENT0,GL.TEXTURE_2D,this.gbufferTextures.position,0);
        gl.framebufferTexture2D(GL.FRAMEBUFFER,GL.COLOR_ATTACHMENT1,GL.TEXTURE_2D,this.gbufferTextures.normal,0);
        gl.framebufferTexture2D(GL.FRAMEBUFFER,GL.COLOR_ATTACHMENT2,GL.TEXTURE_2D,this.gbufferTextures.diffuse,0);
        gl.framebufferRenderbuffer(GL.FRAMEBUFFER,GL.DEPTH_STENCIL_ATTACHMENT,GL.RENDERBUFFER,this.gbufferTextures.depth);

        gl.drawBuffers([GL.COLOR_ATTACHMENT0,GL.COLOR_ATTACHMENT1,GL.COLOR_ATTACHMENT2]);

        console.assert(
            gl.checkFramebufferStatus(GL.FRAMEBUFFER) === GL.FRAMEBUFFER_COMPLETE,
            "G-buffer incomplete:", gl.checkFramebufferStatus(GL.FRAMEBUFFER)
        );

        gl.bindFramebuffer(GL.FRAMEBUFFER, null);

        // set up read-only framebuffer..
        // (because webgl2 does not let you read from a texture that is used as write target
        // in a framebuffer, and webgl2 has no sync primitives to explicitely transition from
        // write to read, so instead we copy into an explicit read buffer, which wastes gpu
        // gpu bandwidth, but there is no other way)

        // create read only textures
        this.readTextures = {
            position: gl.createTexture(),
            normal:   gl.createTexture(),
            diffuse:  gl.createTexture(),
        };
        for (let key of Object.keys(this.readTextures)) {
            const tex = this.readTextures[key];

            gl.bindTexture(GL.TEXTURE_2D, tex);
            //@ts-ignore
            gl.texStorage2D(GL.TEXTURE_2D, 1, formats[key], w, h);
            gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
            gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
        }

        this.readFbo = gl.createFramebuffer();

        // allocate storage and attach to readFbo
        gl.bindFramebuffer(GL.FRAMEBUFFER, this.readFbo);
        this.readAttachments = [
            GL.COLOR_ATTACHMENT0,
            GL.COLOR_ATTACHMENT1,
            GL.COLOR_ATTACHMENT2,
        ];

        for (let [i,key] of Object.keys(this.readTextures).entries()) {
            const tex = this.readTextures[key];

            gl.framebufferTexture2D(
                GL.FRAMEBUFFER,
                this.readAttachments[i],
                GL.TEXTURE_2D,
                tex,
                0
            );
        }

        // tell readFbo which attachments we’ll be writing into during blit
        gl.drawBuffers(this.readAttachments);

        gl.bindFramebuffer(GL.FRAMEBUFFER, null);
    }

    async draw(){
        const {gl}=this;

        gl.bindFramebuffer(GL.FRAMEBUFFER, this.gbuffer);

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

        const onFrameLogic:(deltatime_ms:number)=>void=(deltatime_ms:number)=>{
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
                    programInfo.uniformLocations.uModelViewMatrix,
                    false,
                    modelViewMatrix,
                );
                // also update camera projection matrix (TODO optimize to share this between draws)
                gl.uniformMatrix4fv(
                    programInfo.uniformLocations.uProjectionMatrix,
                    false,
                    projectionMatrix,
                );
            }
        };

        const fsq=await createShaderProgram(gl,{
            vs:`#version 300 es

                out vec2 vUV;

                // These three points form a triangle that covers the entire clipspace:
                const vec2 pos[3] = vec2[](
                    vec2(-1.0, -1.0),
                    vec2( 3.0, -1.0),
                    vec2(-1.0,  3.0)
                );

                void main() {
                    gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0);
                    vUV=pos[gl_VertexID]*0.5+0.5;
                }`,
            fs:`#version 300 es
                precision highp float;

                uniform sampler2D gPosition;
                uniform sampler2D gNormal;
                uniform sampler2D gAlbedoSpec;

                in vec2 vUV;

                out vec4 color;
                void main() {
                    color = vec4(texture(gAlbedoSpec,vUV).rgb,1.0);
                }`
        });

        // cleanup
        gl.bindTexture(GL.TEXTURE_2D, null);
        gl.bindFramebuffer(GL.FRAMEBUFFER, null);

        const frametimes=new Float32Array(30);
        let framenum=0;
        const original_title=document.title;

        let last_frametime=performance.now();
        const draw=()=>{
            const deltatime_ms=(performance.now()-last_frametime)*1e-3;
            last_frametime=performance.now();

            // run logic step
            onFrameLogic(deltatime_ms);

            if(!this.shouldDraw){
                requestAnimationFrame(draw);
                return;
            }

            frametimes[(framenum++)%frametimes.length]=deltatime_ms;

            const average_fps=frametimes.length/frametimes.reduce((o,n)=>o+n,0);
            const min_fps=1/frametimes.reduce((o,n)=>Math.max(o,n));
            const max_fps=1/frametimes.reduce((o,n)=>Math.min(o,n));
            document.title=`${original_title} | fps ${average_fps.toFixed(1)} (${min_fps.toFixed(1)}, ${max_fps.toFixed(1)})`

            // bind gbuffer
            gl.bindFramebuffer(GL.FRAMEBUFFER,this.gbuffer);
            gl.drawBuffers([
                gl.COLOR_ATTACHMENT0,
                gl.COLOR_ATTACHMENT1,
                gl.COLOR_ATTACHMENT2,
            ]);
            console.assert(
                gl.checkFramebufferStatus(GL.FRAMEBUFFER) === GL.FRAMEBUFFER_COMPLETE,
                "G-buffer incomplete:", gl.checkFramebufferStatus(GL.FRAMEBUFFER)
            );

            // clear gbuffer to draw over
            gl.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);

            // draw (into gbuffer)
            for(const object of this.objects){
                object.draw();
            }

            // render full screen quad

            // === 2) Bind the default (screen) framebuffer ===
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.gbuffer);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
            gl.drawBuffers([ gl.BACK ]);
            // (Or in pure WebGL2: gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null); 
            //  but binding FRAMEBUFFER resets both READ and DRAW targets.)

            // Reset viewport to canvas size:
            gl.viewport(0, 0, this.size.width, this.size.height);

            // Optional: clear out the backbuffer if you want
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            // bind the default VAO (no buffers needed)
            gl.bindVertexArray(null);
            gl.useProgram(fsq);

            //1) Copy G-buffer into readFbo
            gl.bindFramebuffer(GL.READ_FRAMEBUFFER, this.gbuffer);
            gl.bindFramebuffer(GL.DRAW_FRAMEBUFFER, this.readFbo);

            const{width:w,height:h}=this.size;
            // 1) blit both FLOAT attachments in one go
            gl.readBuffer(   gl.COLOR_ATTACHMENT0);
            gl.drawBuffers([ gl.COLOR_ATTACHMENT0 ]);
            gl.blitFramebuffer(
                0,0,w,h, 0,0,w,h,
                gl.COLOR_BUFFER_BIT,
                gl.NEAREST
            );

            gl.readBuffer(   gl.COLOR_ATTACHMENT1);
            gl.drawBuffers([ gl.NONE,gl.COLOR_ATTACHMENT1 ]);
            gl.blitFramebuffer(
                0,0,w,h, 0,0,w,h,
                gl.COLOR_BUFFER_BIT,
                gl.NEAREST
            );

            // 2) blit the FIXED-POINT diffuse
            gl.readBuffer(   gl.COLOR_ATTACHMENT2);
            gl.drawBuffers([ gl.NONE,gl.NONE,gl.COLOR_ATTACHMENT2 ]);
            gl.blitFramebuffer(
                0,0,w,h, 0,0,w,h,
                gl.COLOR_BUFFER_BIT,
                gl.NEAREST
            );

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

            // Draw 3 vertices (covering the whole screen)
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            requestAnimationFrame(draw);
        }
        await draw();
    }
}
