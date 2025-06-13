"use strict";

import {vec3,quat,mat4} from "gl-matrix";
import { Serializable, SerializableStatic, SceneTransform } from "./scene_format";

// Type guard for SceneTransform
function isSceneTransform(data: any): data is SceneTransform {
    return (
        typeof data === 'object' &&
        data !== null &&
        (!data.position || (
            Array.isArray(data.position) &&
            data.position.length === 3 &&
            data.position.every((x: any) => typeof x === 'number')
        )) &&
        (!data.rotation || (
            Array.isArray(data.rotation) &&
            data.rotation.length === 4 &&
            data.rotation.every((x: any) => typeof x === 'number')
        )) &&
        (!data.scale || (
            Array.isArray(data.scale) &&
            data.scale.length === 3 &&
            data.scale.every((x: any) => typeof x === 'number')
        ))
    );
}

export class Transform implements Serializable<Transform> {
    constructor(
        public position: vec3 = vec3.create(),
        public rotation: quat = quat.identity(quat.create()),
        public scale: vec3 = vec3.fromValues(1, 1, 1),
    ) {}

    get matrix() {
        const modelViewMatrix = mat4.fromRotationTranslationScale(
            mat4.create(),
            this.rotation,
            this.position,
            this.scale,
        );
        
        return modelViewMatrix;
    }

    toJSON(): any {
        return {
            position: Array.from(this.position) as [number, number, number],
            rotation: Array.from(this.rotation) as [number, number, number, number],
            scale: Array.from(this.scale) as [number, number, number]
        };
    }

    static fromJSON(data: any): Transform {
        if (!isSceneTransform(data)) {
            throw new Error("Invalid transform data format");
        }

        const transform = new Transform();
        if (data.position) {
            transform.position = vec3.fromValues(data.position[0], data.position[1], data.position[2]);
        }
        if (data.rotation) {
            transform.rotation = quat.fromValues(data.rotation[0], data.rotation[1], data.rotation[2], data.rotation[3]);
        }
        if (data.scale) {
            transform.scale = vec3.fromValues(data.scale[0], data.scale[1], data.scale[2]);
        }
        return transform;
    }
}