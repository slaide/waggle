import { GLC } from "../gl";
import { GameObject } from "./gameobject";
import { Transform } from "./transform";
import { DirectionalLightObject } from "./scene_format";
import { vec3 } from "gl-matrix";

export class DirectionalLight extends GameObject {
    public type = "directional_light" as const;
    public color: [number, number, number];
    public intensity: number;
    public direction: [number, number, number];

    constructor(
        gl: GLC,
        transform: Transform,
        color: [number, number, number],
        intensity: number,
        direction: [number, number, number],
        enabled: boolean = true,
        visible: boolean = true,
        name?: string
    ) {
        super(gl, transform, enabled, visible, name);
        this.color = color;
        this.intensity = intensity;
        this.direction = direction;
    }

    toJSON(): DirectionalLightObject {
        return {
            ...super.toJSON(),
            type: "directional_light",
            color: this.color,
            intensity: this.intensity,
            direction: this.direction
        };
    }

    static async fromJSON(gl: GLC, data: DirectionalLightObject): Promise<DirectionalLight> {
        const transform = Transform.fromJSON(data.transform);
        return new DirectionalLight(
            gl,
            transform,
            data.color,
            data.intensity,
            data.direction,
            data.enabled,
            data.visible,
            data.name
        );
    }
} 