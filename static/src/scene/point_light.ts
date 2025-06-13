import { GLC } from "../gl";
import { GameObject } from "./gameobject";
import { Transform } from "./transform";
import { PointLightObject } from "./scene_format";
import { vec3 } from "gl-matrix";

export class PointLight extends GameObject {
    public type = "point_light" as const;
    public color: [number, number, number];
    public intensity: number;
    public radius: number;

    constructor(
        gl: GLC,
        transform: Transform,
        color: [number, number, number],
        intensity: number,
        radius: number,
        enabled: boolean = true,
        visible: boolean = true,
        name?: string
    ) {
        super(gl, transform, enabled, visible, name);
        this.color = color;
        this.intensity = intensity;
        this.radius = radius;
    }

    toJSON(): PointLightObject {
        return {
            ...super.toJSON(),
            type: "point_light",
            color: this.color,
            intensity: this.intensity,
            radius: this.radius
        };
    }

    static async fromJSON(gl: GLC, data: PointLightObject): Promise<PointLight> {
        const transform = Transform.fromJSON(data.transform);
        return new PointLight(
            gl,
            transform,
            data.color,
            data.intensity,
            data.radius,
            data.enabled,
            data.visible,
            data.name
        );
    }
} 