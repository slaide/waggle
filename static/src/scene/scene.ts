"use strict";

import { GL, GLC } from "../gl.js";
import { parsePng } from "../bits/png.js";
import { MtlMaterial, ObjFile } from "../bits/obj.js";
import { mat4, vec3, quat, glMatrix as glm } from "gl-matrix";

import {Camera} from "./camera.js";
import {GameObject} from "./gameobject.js";

export class Scene{
    gl:GLC;
    objects:GameObject[];
    camera:Camera;
    shouldDraw:boolean;

    constructor(
        gl:GLC,
    ){
        this.gl=gl;
        this.objects=[];
        this.camera=new Camera();

        this.shouldDraw=true;
    }

    draw(){
        const {gl}=this;

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
                object.draw();
            }

            requestAnimationFrame(draw)
        }
        draw()
    }
}
