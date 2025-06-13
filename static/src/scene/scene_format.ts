import { vec3, quat } from "gl-matrix";
import { Transform } from "./transform";
import { GameObject } from "./gameobject";
import { Scene } from "./scene";
import { parseObj } from "../bits/obj";
import { MtlMaterial } from "../bits/obj";
import { PointLight } from "./point_light";
import { DirectionalLight } from "./directional_light";
import { Model } from "./model";

// Serializable interface for type checking
export interface Serializable<T> {
    toJSON(): any;
}

// Interface for static serialization methods
export interface SerializableStatic<T> {
    fromJSON(data: any): Promise<T>;
}

// Type definitions for the scene format
export interface SceneTransform {
    position?: [number, number, number];  // [x, y, z]
    rotation?: [number, number, number, number];  // [x, y, z, w] quaternion
    scale?: [number, number, number];  // [x, y, z]
}

// Type guard for SceneTransform
function isSceneTransform(data: any): data is SceneTransform {
    return (
        typeof data === 'object' &&
        data !== null &&
        (!data.position || (
            Array.isArray(data.position) &&
            data.position.length === 3 &&
            data.position.every((x: any) => typeof x === 'number')
        )) &&
        (!data.rotation || (
            Array.isArray(data.rotation) &&
            data.rotation.length === 4 &&
            data.rotation.every((x: any) => typeof x === 'number')
        )) &&
        (!data.scale || (
            Array.isArray(data.scale) &&
            data.scale.length === 3 &&
            data.scale.every((x: any) => typeof x === 'number')
        ))
    );
}

export interface SceneMaterial {
    diffuse?: Float32Array | [number, number, number];  // [r, g, b]
    specularExponent?: number;
    diffuseTexture?: string;  // path to texture file
}

// Type guard for SceneMaterial
function isSceneMaterial(data: any): data is SceneMaterial {
    return (
        typeof data === 'object' &&
        data !== null &&
        (!data.diffuse || (
            (Array.isArray(data.diffuse) || data.diffuse instanceof Float32Array) &&
            data.diffuse.length === 3 &&
            data.diffuse.every((x: any) => typeof x === 'number')
        )) &&
        (!data.specularExponent || typeof data.specularExponent === 'number') &&
        (!data.diffuseTexture || typeof data.diffuseTexture === 'string')
    );
}

// Base interface for all scene objects
export interface BaseSceneObject {
    name?: string;
    type: "mesh" | "point_light" | "directional_light";
    transform: SceneTransform;
    enabled?: boolean;
    visible?: boolean;
}

// Type guard for BaseSceneObject
function isBaseSceneObject(data: any): data is BaseSceneObject {
    return (
        typeof data === 'object' &&
        data !== null &&
        (!data.name || typeof data.name === 'string') &&
        typeof data.type === 'string' &&
        (data.type === "mesh" || data.type === "point_light" || data.type === "directional_light") &&
        isSceneTransform(data.transform) &&
        (!data.enabled || typeof data.enabled === 'boolean') &&
        (!data.visible || typeof data.visible === 'boolean')
    );
}

// Interface for mesh/model objects that can be rendered
export interface MeshObject extends BaseSceneObject {
    type: "mesh";
    // Mesh data can be either a model path or serialized data
    model?: string;  // path to .obj file
    meshData?: {
        vertexData: number[];  // Flattened vertex data array
        indices: number[];     // Flattened indices array
        texturePath?: string;  // Optional texture path
    };
    material?: SceneMaterial;
    children?: SceneObject[];  // Only mesh objects can have children
    // Runtime properties
    numTris?: number;
    rawVertexData?: number[];
    rawIndices?: number[];
    rawTexturePath?: string;
    rawShaderSources?: { vs: string, fs: string };
}

// Type guard for MeshObject
function isMeshObject(data: any): data is MeshObject {
    if (!isBaseSceneObject(data) || data.type !== "mesh") {
        return false;
    }
    
    const meshData = data as MeshObject;
    return (
        (!meshData.model || typeof meshData.model === 'string') &&
        (!meshData.meshData || (
            typeof meshData.meshData === 'object' &&
            Array.isArray(meshData.meshData.vertexData) &&
            Array.isArray(meshData.meshData.indices) &&
            (!meshData.meshData.texturePath || typeof meshData.meshData.texturePath === 'string')
        )) &&
        (!meshData.material || isSceneMaterial(meshData.material)) &&
        (!meshData.children || Array.isArray(meshData.children)) &&
        (!meshData.numTris || typeof meshData.numTris === 'number') &&
        (!meshData.rawVertexData || Array.isArray(meshData.rawVertexData)) &&
        (!meshData.rawIndices || Array.isArray(meshData.rawIndices)) &&
        (!meshData.rawTexturePath || typeof meshData.rawTexturePath === 'string') &&
        (!meshData.rawShaderSources || (
            typeof meshData.rawShaderSources === 'object' &&
            typeof meshData.rawShaderSources.vs === 'string' &&
            typeof meshData.rawShaderSources.fs === 'string'
        ))
    );
}

// Interface for point lights
export interface PointLightObject extends BaseSceneObject {
    type: "point_light";
    color: [number, number, number];  // [r, g, b]
    intensity: number;
    radius: number;
}

// Type guard for PointLightObject
function isPointLightObject(data: any): data is PointLightObject {
    if (!isBaseSceneObject(data) || data.type !== "point_light") {
        return false;
    }
    
    const lightData = data as PointLightObject;
    return (
        Array.isArray(lightData.color) &&
        lightData.color.length === 3 &&
        lightData.color.every((x: any) => typeof x === 'number') &&
        typeof lightData.intensity === 'number' &&
        typeof lightData.radius === 'number'
    );
}

// Interface for directional lights
export interface DirectionalLightObject extends BaseSceneObject {
    type: "directional_light";
    color: [number, number, number];  // [r, g, b]
    intensity: number;
    direction: [number, number, number];
}

// Type guard for DirectionalLightObject
function isDirectionalLightObject(data: any): data is DirectionalLightObject {
    if (!isBaseSceneObject(data) || data.type !== "directional_light") {
        return false;
    }
    
    const lightData = data as DirectionalLightObject;
    return (
        Array.isArray(lightData.color) &&
        lightData.color.length === 3 &&
        lightData.color.every((x: any) => typeof x === 'number') &&
        typeof lightData.intensity === 'number' &&
        Array.isArray(lightData.direction) &&
        lightData.direction.length === 3 &&
        lightData.direction.every((x: any) => typeof x === 'number')
    );
}

// Union type for all scene objects
export type SceneObject = MeshObject | PointLightObject | DirectionalLightObject;

// Type guard for SceneObject
export function isSceneObject(data: any): data is SceneObject {
    return isMeshObject(data) || isPointLightObject(data) || isDirectionalLightObject(data);
}

export interface SceneCamera {
    fov?: number;
    aspect?: number;
    znear?: number;
    zfar?: number;
    position: [number, number, number];
    rotation: [number, number, number, number];  // quaternion
}

// Type guard for SceneCamera
function isSceneCamera(data: any): data is SceneCamera {
    return (
        typeof data === 'object' &&
        data !== null &&
        (!data.fov || typeof data.fov === 'number') &&
        (!data.aspect || typeof data.aspect === 'number') &&
        (!data.znear || typeof data.znear === 'number') &&
        (!data.zfar || typeof data.zfar === 'number') &&
        Array.isArray(data.position) &&
        data.position.length === 3 &&
        data.position.every((x: any) => typeof x === 'number') &&
        Array.isArray(data.rotation) &&
        data.rotation.length === 4 &&
        data.rotation.every((x: any) => typeof x === 'number')
    );
}

export interface SceneDescription {
    name?: string;
    camera: SceneCamera;
    objects: SceneObject[];
}

// Type guard for SceneDescription
function isSceneDescription(data: any): data is SceneDescription {
    return (
        typeof data === 'object' &&
        data !== null &&
        (!data.name || typeof data.name === 'string') &&
        isSceneCamera(data.camera) &&
        Array.isArray(data.objects) &&
        data.objects.every(isSceneObject)
    );
}

// Helper function to convert scene transform to Transform object
function createTransform(transform: SceneTransform): Transform {
    const t = new Transform();
    if (transform.position) {
        t.position = vec3.fromValues(...transform.position);
    }
    if (transform.rotation) {
        t.rotation = quat.fromValues(...transform.rotation);
    }
    if (transform.scale) {
        t.scale = vec3.fromValues(...transform.scale);
    }
    return t;
}

// Main function to load a scene from a description
export async function loadScene(gl: WebGL2RenderingContext, description: SceneDescription): Promise<Scene> {
    const scene = await Scene.make(gl);
    
    // Load all objects recursively
    async function loadObject(obj: SceneObject, parentTransform?: Transform): Promise<GameObject> {
        const transform = createTransform(obj.transform);
        if (parentTransform) {
            // Apply parent transform
            vec3.add(transform.position, transform.position, parentTransform.position);
            quat.multiply(transform.rotation, transform.rotation, parentTransform.rotation);
            vec3.multiply(transform.scale, transform.scale, parentTransform.scale);
        }

        let gameObject: GameObject;

        if (obj.type === "point_light" || obj.type === "directional_light") {
            if (obj.type === "point_light") {
                gameObject = await PointLight.fromJSON(gl, obj as PointLightObject);
            } else {
                gameObject = await DirectionalLight.fromJSON(gl, obj as DirectionalLightObject);
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

// Example scene description:
/*
{
    "name": "Example Scene",
    "camera": {
        "position": [0, 0, 0],
        "rotation": [0, 0, 0, 1],
        "fov": 45,
        "aspect": 1.33,
        "znear": 0.1,
        "zfar": 100
    },
    "objects": [
        {
            "name": "Main Cube",
            "type": "mesh",
            "model": "./static/resources/cube.obj",
            "transform": {
                "position": [0, 0, -5],
                "rotation": [0, 0, 0, 1],
                "scale": [1, 1, 1]
            },
            "material": {
                "diffuse": [1, 0, 0],
                "specularExponent": 64,
                "diffuseTexture": "./static/resources/texture.png"
            },
            "children": [
                {
                    "name": "Child Cube",
                    "type": "mesh",
                    "model": "./static/resources/cube.obj",
                    "transform": {
                        "position": [2, 0, 0],
                        "rotation": [0, 0, 0, 1],
                        "scale": [0.5, 0.5, 0.5]
                    }
                }
            ]
        },
        {
            "name": "Point Light",
            "type": "point_light",
            "transform": {
                "position": [0, 2, -6]
            },
            "color": [1, 1, 1],
            "intensity": 0.5,
            "radius": 10
        },
        {
            "name": "Directional Light",
            "type": "directional_light",
            "transform": {
                "rotation": [0, 0, 0, 1]
            },
            "direction": [0, -1, 0],
            "color": [1, 0.95, 0.8],
            "intensity": 0.3
        }
    ]
}
*/

export interface SceneData {
    name?: string;
    objects: SceneObject[];
}

// Type guard for SceneData
export function isSceneData(data: any): data is SceneData {
    return (
        typeof data === 'object' &&
        data !== null &&
        (!data.name || typeof data.name === 'string') &&
        Array.isArray(data.objects) &&
        data.objects.every(isSceneObject)
    );
} 