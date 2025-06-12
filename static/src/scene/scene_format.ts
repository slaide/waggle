import { vec3, quat } from "gl-matrix";
import { Transform } from "./transform";
import { GameObject } from "./gameobject";
import { Scene } from "./scene";
import { Camera } from "./camera";
import { PointLight } from "./lights";
import { parseObj } from "../bits/obj";
import { MtlMaterial } from "../bits/obj";

// Type definitions for the scene format
export interface SceneTransform {
    position?: [number, number, number];  // [x, y, z]
    rotation?: [number, number, number, number];  // [x, y, z, w] quaternion
    scale?: [number, number, number];  // [x, y, z]
}

export interface SceneMaterial {
    diffuse?: [number, number, number];  // [r, g, b]
    specularExponent?: number;
    diffuseTexture?: string;  // path to texture file
}

export interface SceneObject {
    name?: string;
    type?: "mesh" | "point_light" | "directional_light";  // Default is "mesh"
    model?: string;  // path to .obj file, required for mesh type
    transform: SceneTransform;
    material?: SceneMaterial;
    children?: SceneObject[];
    // Light-specific properties
    color?: [number, number, number];  // [r, g, b]
    intensity?: number;
    radius?: number;  // for point lights
    direction?: [number, number, number];  // for directional lights
}

export interface SceneCamera {
    fov?: number;
    aspect?: number;
    znear?: number;
    zfar?: number;
    position: [number, number, number];
    rotation: [number, number, number, number];  // quaternion
}

export interface SceneDescription {
    name?: string;
    camera: SceneCamera;
    objects: SceneObject[];
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

// Helper function to create a camera from scene description
function createCamera(camera: SceneCamera): Camera {
    return new Camera(
        camera.fov,
        camera.aspect,
        camera.znear,
        camera.zfar,
        vec3.fromValues(...camera.position),
        quat.fromValues(...camera.rotation)
    );
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
            // Create light object
            gameObject = new GameObject(
                gl,
                { vertexData: 0, indices: 0, texture: 0 },
                transform,
                undefined,  // No program info for lights
                0,  // No triangles
                undefined,  // No material
                true,  // enabled
                true,  // visible
                obj.type === "point_light" ? "PointLight" : "DirectionalLight"
            );

            // Add light properties
            (gameObject as any).type = obj.type;
            (gameObject as any).color = vec3.fromValues(...(obj.color || [1, 1, 1]));
            (gameObject as any).intensity = obj.intensity || 1.0;

            if (obj.type === "point_light") {
                if (!obj.transform.position) {
                    console.warn("Point light missing position, defaulting to [0, 0, 0]");
                }
                (gameObject as any).radius = obj.radius || 10.0;
            } else if (obj.type === "directional_light") {
                if (!obj.direction) {
                    console.warn("Directional light missing direction, defaulting to [0, -1, 0]");
                    transform.rotation = quat.rotationTo(
                        quat.create(),
                        vec3.fromValues(0, 0, -1),
                        vec3.fromValues(0, -1, 0)
                    );
                } else {
                    transform.rotation = quat.rotationTo(
                        quat.create(),
                        vec3.fromValues(0, 0, -1),
                        vec3.fromValues(...obj.direction)
                    );
                }
                (gameObject as any).direction = vec3.fromValues(...(obj.direction || [0, -1, 0]));
            }
        } else {
            // Create regular mesh object
            if (!obj.model) {
                throw new Error("Mesh object must have a model property");
            }

            // Load the model
            const modelData = await parseObj(obj.model, { normalizeSize: true });
            
            // Create game object
            gameObject = await GameObject.make(gl, {
                objects: { temp: { groups: { temp: modelData.objects[Object.keys(modelData.objects)[0]].groups[Object.keys(modelData.objects[Object.keys(modelData.objects)[0]].groups)[0]] } } },
                boundingBox: modelData.boundingBox
            }, transform);

            // Apply material if specified
            if (obj.material) {
                if (!gameObject.material) {
                    gameObject.material = new MtlMaterial();
                }
                if (obj.material.diffuse) {
                    gameObject.material.diffuse = vec3.fromValues(...obj.material.diffuse);
                }
                if (obj.material.specularExponent) {
                    gameObject.material.specularExponent = obj.material.specularExponent;
                }
                if (obj.material.diffuseTexture) {
                    gameObject.material.map_diffuse = { source: obj.material.diffuseTexture };
                }
            }
        }

        gameObject.upload();
        scene.children.push(gameObject);

        // Load children recursively
        if (obj.children) {
            for (const child of obj.children) {
                await loadObject(child, transform);
            }
        }

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