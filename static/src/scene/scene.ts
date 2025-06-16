
import { GLC } from "../gl";
import { GameObject } from "./gameobject";
import { PointLight, DirectionalLight } from "./light";
import { Transform } from "./transform";
import { Camera } from "./camera";
import { parseObj } from "../bits/obj";
import { Model } from "./model";
import { vec3, quat } from "gl-matrix";

// Type definitions for scene serialization
export interface SceneDescription {
    name?: string;
    camera: ReturnType<Camera['toJSON']>;
    objects: any[];  // Using any[] to allow for different object types
}

export interface SceneData {
    name?: string;
    objects: any[];
}

// Type guard for SceneData
export function isSceneData(data: any): data is SceneData {
    return (
        typeof data === 'object' &&
        data !== null &&
        (!data.name || typeof data.name === 'string') &&
        Array.isArray(data.objects)
    );
}

export class Scene {
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

    // Helper function to convert scene transform to Transform object
    static createTransform(transform: any): Transform {
        const t = new Transform();
        if (transform.position) {
            t.position = vec3.fromValues(transform.position[0], transform.position[1], transform.position[2]);
        }
        if (transform.rotation) {
            t.rotation = quat.fromValues(transform.rotation[0], transform.rotation[1], transform.rotation[2], transform.rotation[3]);
        }
        if (transform.scale) {
            t.scale = vec3.fromValues(transform.scale[0], transform.scale[1], transform.scale[2]);
        }
        return t;
    }

    // Main function to load a scene from a description (moved from scene_format.ts)
    static async loadScene(gl: GLC, description: SceneDescription): Promise<Scene> {
        const scene = await Scene.make(gl);
        
        // Load all objects recursively
        async function loadObject(obj: any, parentTransform?: Transform): Promise<GameObject> {
            const transform = Scene.createTransform(obj.transform);
            if (parentTransform) {
                // Apply parent transform
                vec3.add(transform.position, transform.position, parentTransform.position);
                quat.multiply(transform.rotation, transform.rotation, parentTransform.rotation);
                vec3.multiply(transform.scale, transform.scale, parentTransform.scale);
            }

            let gameObject: GameObject;

            if (obj.type === "point_light" || obj.type === "directional_light") {
                if (obj.type === "point_light") {
                    gameObject = await PointLight.fromJSON(gl, obj);
                } else {
                    gameObject = await DirectionalLight.fromJSON(gl, obj);
                }
            } else {
                // Create regular mesh object
                if (!obj.model && !obj.meshData) {
                    throw new Error("Mesh object must have either a model property or meshData");
                }

                if (obj.model) {
                    // Load from OBJ file
                    const modelData = await parseObj(obj.model, { normalizeSize: true });
                    
                    // Create model object
                    gameObject = await Model.make(gl, {
                        objects: { temp: { groups: { temp: modelData.objects[Object.keys(modelData.objects)[0]].groups[Object.keys(modelData.objects[Object.keys(modelData.objects)[0]].groups)[0]] } } },
                        boundingBox: modelData.boundingBox
                    }, transform);
                } else {
                    // Create from serialized data
                    gameObject = await Model.fromJSON(gl, {
                        ...obj,
                        material: obj.material ? {
                            diffuse: obj.material.diffuse,
                            specularExponent: obj.material.specularExponent,
                            diffuseTexture: obj.material.diffuseTexture
                        } : undefined
                    });
                }

                // Load children recursively (only for mesh objects)
                if (obj.type === "mesh" && obj.children) {
                    for (const child of obj.children) {
                        await loadObject(child, transform);
                    }
                }
            }

            gameObject.upload();
            scene.objects.push(gameObject);

            return gameObject;
        }

        // Load all objects
        for (const obj of description.objects) {
            await loadObject(obj);
        }

        return scene;
    }
}

// Export loadScene function at module level for compatibility
export const loadScene = Scene.loadScene;
