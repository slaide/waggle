import { GLC } from "../gl";
import { vec3 } from "gl-matrix";
import { Transform } from "./transform";
import { GameObject } from "./gameobject";
import { PointLightObject, DirectionalLightObject } from "./scene_format";

// Base class for lights
export class Light extends GameObject {
    constructor(
        gl: GLC,
        transform: Transform,
        public color: vec3,
        public intensity: number,
        enabled: boolean = true,
        visible: boolean = true,
        name?: string,
    ) {
        super(gl, transform, enabled, visible, name);
    }

    override toJSON(): any {
        return {
            ...super.toJSON(),
            color: Array.from(this.color),
            intensity: this.intensity,
        };
    }
}

// Point light class
export class PointLight extends Light {
    constructor(
        gl: GLC,
        transform: Transform,
        color: vec3,
        intensity: number,
        public radius: number,
        enabled: boolean = true,
        visible: boolean = true,
        name?: string,
    ) {
        super(gl, transform, color, intensity, enabled, visible, name);
    }

    override toJSON(): any {
        return {
            ...super.toJSON(),
            type: "point_light",
            radius: this.radius,
        };
    }

    static async fromJSON(gl: GLC, data: PointLightObject): Promise<PointLight> {
        const transform = Transform.fromJSON(data.transform);
        return new PointLight(
            gl,
            transform,
            vec3.fromValues(data.color[0], data.color[1], data.color[2]),
            data.intensity,
            data.radius,
            data.enabled ?? true,
            data.visible ?? true,
            data.name
        );
    }
}

// Directional light class
export class DirectionalLight extends Light {
    constructor(
        gl: GLC,
        transform: Transform,
        color: vec3,
        intensity: number,
        public direction: vec3,
        enabled: boolean = true,
        visible: boolean = true,
        name?: string,
    ) {
        super(gl, transform, color, intensity, enabled, visible, name);
    }

    override toJSON(): any {
        return {
            ...super.toJSON(),
            type: "directional_light",
            direction: Array.from(this.direction),
        };
    }

    static async fromJSON(gl: GLC, data: DirectionalLightObject): Promise<DirectionalLight> {
        const transform = Transform.fromJSON(data.transform);
        return new DirectionalLight(
            gl,
            transform,
            vec3.fromValues(data.color[0], data.color[1], data.color[2]),
            data.intensity,
            vec3.fromValues(data.direction[0], data.direction[1], data.direction[2]),
            data.enabled ?? true,
            data.visible ?? true,
            data.name
        );
    }
} 