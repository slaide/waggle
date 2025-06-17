import { GLC } from "../gl";
import { GameObject } from "./gameobject";
import { PointLight, DirectionalLight } from "./light";
import { Transform } from "./transform";
import { Camera } from "./camera";
import { parseObj } from "../bits/obj";
import { Model } from "./model";
import { vec3, quat, mat4 } from "gl-matrix";

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
            
            // Use the new GameObject traverse method which handles children automatically
            object.traverse((obj, depth) => {
                callback(obj, obj.parent?.transform);
            });
        }
    }

    // Collect all lights from the scene
    collectLights(): { pointLights: PointLight[], directionalLights: DirectionalLight[] } {
        const pointLights: PointLight[] = [];
        const directionalLights: DirectionalLight[] = [];

        this.traverse((obj) => {
            if (obj instanceof PointLight) {
                pointLights.push(obj);
            } else if (obj instanceof DirectionalLight) {
                directionalLights.push(obj);
            }
        });

        return { pointLights, directionalLights };
    }

    draw(viewMatrix?: Float32Array, projectionMatrix?: Float32Array) {
        // draw (into gbuffer) - traverse all objects including children
        // Only draw non-forward rendered objects in this pass
        for (const object of this.objects) {
            // Skip entirely disabled objects and their children
            if (!object.enabled) continue;
            
            // Draw with identity matrix as the root parent transform
            const identityMatrix = new Float32Array(16);
            mat4.identity(identityMatrix as any);
            this.drawObjectHierarchy(object, identityMatrix, viewMatrix!, projectionMatrix!);
        }
    }

    // New method to draw forward rendered objects
    drawForward(viewMatrix: Float32Array, projectionMatrix: Float32Array, lightUBOs: {pointLightUBO: WebGLBuffer, directionalLightUBO: WebGLBuffer}, cameraPos: Float32Array) {
        // Draw only forward rendered objects after deferred lighting pass
        for (const object of this.objects) {
            // Skip entirely disabled objects and their children
            if (!object.enabled) continue;
            
            // Draw with identity matrix as the root parent transform
            const identityMatrix = new Float32Array(16);
            mat4.identity(identityMatrix as any);
            this.drawForwardObjectHierarchy(object, identityMatrix, viewMatrix, projectionMatrix, lightUBOs, cameraPos);
        }
    }

    private drawObjectHierarchy(obj: GameObject, parentWorldMatrix: Float32Array, viewMatrix: Float32Array, projectionMatrix: Float32Array) {
        if (!obj.enabled) return;

        // Get this object's local transform matrix
        const localMatrix = obj.transform.matrix;
        
        // Calculate this object's world matrix by multiplying parent world matrix with local matrix
        const worldMatrix = new Float32Array(16);
        mat4.multiply(worldMatrix as any, parentWorldMatrix as any, localMatrix as any);

        // Draw this object if it should draw and it's not forward rendered (deferred only)
        if (obj.shouldDraw && !obj.forwardRendered) {
            obj.drawWithMatrix(worldMatrix, viewMatrix, projectionMatrix);
        }

        // Recursively draw children with this object's world matrix as their parent matrix
        for (const child of obj.children) {
            this.drawObjectHierarchy(child, worldMatrix, viewMatrix, projectionMatrix);
        }
    }

    private drawForwardObjectHierarchy(obj: GameObject, parentWorldMatrix: Float32Array, viewMatrix: Float32Array, projectionMatrix: Float32Array, lightUBOs: {pointLightUBO: WebGLBuffer, directionalLightUBO: WebGLBuffer}, cameraPos: Float32Array) {
        if (!obj.enabled) return;

        // Get this object's local transform matrix
        const localMatrix = obj.transform.matrix;
        
        // Calculate this object's world matrix by multiplying parent world matrix with local matrix
        const worldMatrix = new Float32Array(16);
        mat4.multiply(worldMatrix as any, parentWorldMatrix as any, localMatrix as any);

        // Draw this object if it's forward rendered
        if (obj.shouldDraw && obj.forwardRendered && obj.type === "mesh") {
            // Cast to Model to access drawForward method
            const model = obj as any;
            if (model.drawForward) {
                model.drawForward(worldMatrix, viewMatrix, projectionMatrix, lightUBOs, cameraPos);
            }
        }

        // Recursively draw children with this object's world matrix as their parent matrix
        for (const child of obj.children) {
            this.drawForwardObjectHierarchy(child, worldMatrix, viewMatrix, projectionMatrix, lightUBOs, cameraPos);
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
        
        // Load all objects using the GameObjectRegistry system
        for (const objData of description.objects) {
            const gameObject = await GameObject.fromJSON(gl, objData);
            scene.objects.push(gameObject);
        }

        return scene;
    }
}

// Export loadScene function at module level for compatibility
export const loadScene = Scene.loadScene;
