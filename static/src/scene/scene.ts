"use strict";

import { GLC } from "../gl";
import { GameObject } from "./gameobject";
import { PointLight, DirectionalLight } from "./light";
import { Transform } from "./transform";
import { Serializable, isSceneData } from "./scene_format";

export class Scene implements Serializable<Scene> {
    constructor(
        public gl: GLC,
        public objects: GameObject[] = [],
        public name?: string
    ) {}

    static async make(gl: GLC) {
        return new Scene(gl);
    }

    // Traverse the scene graph and collect information
    traverse(callback: (obj: GameObject, parentTransform?: Transform) => void, parentTransform?: Transform) {
        for (const object of this.objects) {
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
            if (obj instanceof PointLight) {
                pointLights.push(obj);
                obj.visible = false; // Don't draw the light object
            } else if (obj instanceof DirectionalLight) {
                directionalLights.push(obj);
                obj.visible = false; // Don't draw the light object
            }
        });

        return { pointLights, directionalLights };
    }

    draw() {
        // draw (into gbuffer)
        for (const object of this.objects) {
            if (!object.visible) continue;
            object.draw();
        }
    }

    // Add serialization method
    toJSON(): any {
        return {
            name: this.name,
            objects: this.objects.map(obj => obj.toJSON())
        };
    }

    // Add deserialization method
    static async fromJSON(gl: GLC, data: any): Promise<Scene> {
        if (!isSceneData(data)) {
            throw new Error("Invalid scene data format");
        }

        const scene = new Scene(gl, [], data.name);
        
        // Load all objects
        for (const objData of data.objects) {
            const obj = await GameObject.fromJSON(gl, objData);
            scene.objects.push(obj);
        }

        return scene;
    }
}
