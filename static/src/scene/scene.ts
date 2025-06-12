"use strict";

import { GL, GLC } from "../gl";
import { GameObject } from "./gameobject";
import { PointLight, DirectionalLight } from "./lights";
import { vec3 } from "gl-matrix";
import { Transform } from "./transform";

function glCheckError(gl: GLC, msg: string = "") {
    const err = gl.getError();
    if (err !== gl.NO_ERROR) {
        console.error("WebGL error: 0x" + err.toString(16), "at", msg);
    }
}

export class Scene {
    constructor(
        public gl: GLC,
        public children: GameObject[] = [],
        public shouldDraw: boolean = true,
    ) {}

    static async make(gl: GLC) {
        return new Scene(gl);
    }

    // Traverse the scene graph and collect information
    traverse(callback: (obj: GameObject, parentTransform?: Transform) => void, parentTransform?: Transform) {
        for (const object of this.children) {
            if (!object.enabled) continue;
            
            callback(object, parentTransform);
            
            // If this object has children, traverse them with this object's transform
            if ('children' in object && Array.isArray((object as any).children)) {
                const childScene = new Scene(this.gl, (object as any).children);
                childScene.traverse(callback, object.transform);
            }
        }
    }

    // Collect all lights from the scene
    collectLights(): { pointLights: PointLight[], directionalLights: DirectionalLight[] } {
        const pointLights: PointLight[] = [];
        const directionalLights: DirectionalLight[] = [];

        this.traverse((obj) => {
            // Check if this object is a light
            if ('type' in obj && (obj as any).type === 'point_light') {
                const light = obj as unknown as PointLight;
                pointLights.push({
                    position: vec3.clone(obj.transform.position),
                    radius: light.radius,
                    color: vec3.clone(light.color),
                    intensity: light.intensity
                });
                obj.visible = false; // Don't draw the light object
            } else if ('type' in obj && (obj as any).type === 'directional_light') {
                const light = obj as unknown as DirectionalLight;
                directionalLights.push({
                    direction: vec3.clone(light.direction),
                    color: vec3.clone(light.color),
                    intensity: light.intensity
                });
                obj.visible = false; // Don't draw the light object
            }
        });

        return { pointLights, directionalLights };
    }

    draw() {
        if (!this.shouldDraw) {
            return;
        }

        // draw (into gbuffer)
        for (const object of this.children) {
            if (!object.visible) continue;
            object.draw();
        }
    }
}
