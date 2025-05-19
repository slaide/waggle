"use strict";

import {vec3,quat,mat4} from "gl-matrix";

export class Transform{
    constructor(
        public position:vec3=vec3.create(),
        public rotation:quat=quat.identity(quat.create()),
        public scale:vec3=vec3.fromValues(1,1,1),
    ){}

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