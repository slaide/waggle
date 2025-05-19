"use strict";

import {vec3,quat,mat4,glMatrix as glm} from "gl-matrix";

export class Camera{
    constructor(
        public fov:number=45,
        public aspect:number=800/600,
        public znear:number=0.1,
        public zfar:number=100,
        public position:vec3=vec3.fromValues(0,0,0),
        public rotation:quat=quat.identity(quat.create()),
    ){}

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