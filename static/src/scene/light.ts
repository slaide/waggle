import { GLC } from "../gl";
import { vec3 } from "gl-matrix";
import { Transform } from "./transform";
import { GameObject } from "./gameobject";

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

    override toJSON() {
        return {
            ...super.toJSON(),
            color: Array.from(this.color),
            intensity: this.intensity,
        };
    }
}

// Point light class
export class PointLight extends Light {
    public type = "point_light" as const;

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

    override toJSON() {
        return {
            ...super.toJSON(),
            type: "point_light" as const,
            radius: this.radius,
        };
    }

    static async fromJSON(gl: GLC, data: any): Promise<PointLight> {
        // Type guard inline
        if (typeof data !== 'object' || data === null || data.type !== "point_light") {
            throw new Error("Invalid point light data format");
        }
        
        if (!Array.isArray(data.color) || data.color.length !== 3) {
            throw new Error("Point light must have valid color array");
        }
        
        if (typeof data.intensity !== 'number' || typeof data.radius !== 'number') {
            throw new Error("Point light must have valid intensity and radius");
        }

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
    public type = "directional_light" as const;

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

    override toJSON() {
        return {
            ...super.toJSON(),
            type: "directional_light" as const,
            direction: Array.from(this.direction),
        };
    }

    static async fromJSON(gl: GLC, data: any): Promise<DirectionalLight> {
        // Type guard inline
        if (typeof data !== 'object' || data === null || data.type !== "directional_light") {
            throw new Error("Invalid directional light data format");
        }
        
        if (!Array.isArray(data.color) || data.color.length !== 3) {
            throw new Error("Directional light must have valid color array");
        }
        
        if (typeof data.intensity !== 'number') {
            throw new Error("Directional light must have valid intensity");
        }
        
        if (!Array.isArray(data.direction) || data.direction.length !== 3) {
            throw new Error("Directional light must have valid direction array");
        }

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