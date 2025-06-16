
import {vec3,quat,mat4} from "gl-matrix";

export class Transform {
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

    toJSON() {
        return {
            position: Array.from(this.position) as [number, number, number],
            rotation: Array.from(this.rotation) as [number, number, number, number],
            scale: Array.from(this.scale) as [number, number, number]
        };
    }

    static fromJSON(data: any): Transform {
        // Type guard inline
        if (typeof data !== 'object' || data === null) {
            throw new Error("Invalid transform data format");
        }

        const transform = new Transform();
        if (data.position) {
            if (!Array.isArray(data.position) || data.position.length !== 3) {
                throw new Error("Invalid position format");
            }
            transform.position = vec3.fromValues(data.position[0], data.position[1], data.position[2]);
        }
        if (data.rotation) {
            if (!Array.isArray(data.rotation) || data.rotation.length !== 4) {
                throw new Error("Invalid rotation format");
            }
            transform.rotation = quat.fromValues(data.rotation[0], data.rotation[1], data.rotation[2], data.rotation[3]);
        }
        if (data.scale) {
            if (!Array.isArray(data.scale) || data.scale.length !== 3) {
                throw new Error("Invalid scale format");
            }
            transform.scale = vec3.fromValues(data.scale[0], data.scale[1], data.scale[2]);
        }
        return transform;
    }
}