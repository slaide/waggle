import { GLC } from "../gl";
import { vec3 } from "gl-matrix";
import { Transform } from "./transform";
import { GameObject, GameObjectRegistry, BaseSerializedGameObject } from "./gameobject";

// Serialized light interfaces
interface SerializedPointLight extends BaseSerializedGameObject {
    type: "point_light";
    color: number[];
    intensity: number;
    radius: number;
}

interface SerializedDirectionalLight extends BaseSerializedGameObject {
    type: "directional_light";
    color: number[];
    intensity: number;
    direction: number[];
}

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

    // Light objects themselves should not be drawn (they're not visual)
    override get shouldDraw(): boolean {
        return false;
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

    static async fromJSON(gl: GLC, data: BaseSerializedGameObject): Promise<PointLight> {
        // Type guard inline
        if (typeof data !== 'object' || data === null || data.type !== "point_light") {
            throw new Error("Invalid point light data format");
        }
        
        // Cast to specific light type after validation
        const lightData = data as SerializedPointLight;
        
        if (!Array.isArray(lightData.color) || lightData.color.length !== 3) {
            throw new Error("Point light must have valid color array");
        }
        
        if (typeof lightData.intensity !== 'number' || typeof lightData.radius !== 'number') {
            throw new Error("Point light must have valid intensity and radius");
        }

        const transform = Transform.fromJSON(lightData.transform);
        return new PointLight(
            gl,
            transform,
            vec3.fromValues(lightData.color[0], lightData.color[1], lightData.color[2]),
            lightData.intensity,
            lightData.radius,
            lightData.enabled ?? true,
            lightData.visible ?? true,
            lightData.name
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

    static async fromJSON(gl: GLC, data: BaseSerializedGameObject): Promise<DirectionalLight> {
        // Type guard inline
        if (typeof data !== 'object' || data === null || data.type !== "directional_light") {
            throw new Error("Invalid directional light data format");
        }
        
        // Cast to specific light type after validation
        const lightData = data as SerializedDirectionalLight;
        
        if (!Array.isArray(lightData.color) || lightData.color.length !== 3) {
            throw new Error("Directional light must have valid color array");
        }
        
        if (typeof lightData.intensity !== 'number') {
            throw new Error("Directional light must have valid intensity");
        }
        
        if (!Array.isArray(lightData.direction) || lightData.direction.length !== 3) {
            throw new Error("Directional light must have valid direction array");
        }

        const transform = Transform.fromJSON(lightData.transform);
        return new DirectionalLight(
            gl,
            transform,
            vec3.fromValues(lightData.color[0], lightData.color[1], lightData.color[2]),
            lightData.intensity,
            vec3.fromValues(lightData.direction[0], lightData.direction[1], lightData.direction[2]),
            lightData.enabled ?? true,
            lightData.visible ?? true,
            lightData.name
        );
    }
}

// Register the light classes with the GameObjectRegistry
GameObjectRegistry.register("point_light", PointLight.fromJSON);
GameObjectRegistry.register("directional_light", DirectionalLight.fromJSON); 