import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SceneDescription, loadScene } from './scene_format';
import { Scene } from './scene';
import { GameObject } from './gameobject';
import * as ObjModule from '../bits/obj';
import { vec3 } from 'gl-matrix';

// Mock WebGL context
const mockGL = {
    createBuffer: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    createTexture: vi.fn(),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    createProgram: vi.fn(),
    createShader: vi.fn(),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(),
    getShaderParameter: vi.fn(),
    getShaderInfoLog: vi.fn(),
    getProgramInfoLog: vi.fn(),
} as unknown as WebGL2RenderingContext;

let sceneMakeSpy: any;
let gameObjectMakeSpy: any;
let parseObjSpy: any;
let mtlMaterialSpy: any;
let OriginalMtlMaterial: any;

beforeEach(() => {
    vi.clearAllMocks();
    sceneMakeSpy = vi.spyOn(Scene, 'make').mockImplementation((gl) => Promise.resolve(new Scene(gl, [])));
    gameObjectMakeSpy = vi.spyOn(GameObject, 'make').mockResolvedValue(Object.create(GameObject.prototype));
    // Provide a realistic mock structure for ObjFile using constructors
    const group = new ObjModule.ObjGroup(new Float32Array(), new Uint32Array(), null);
    const obj = new ObjModule.ObjObject({ temp: group });
    const objects = { temp: obj };
    parseObjSpy = vi.spyOn(ObjModule, 'parseObj').mockResolvedValue(
        new ObjModule.ObjFile(objects, { x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, z: { min: 0, max: 1 } })
    );
    // Save the original constructor
    OriginalMtlMaterial = ObjModule.MtlMaterial;
    mtlMaterialSpy = vi.spyOn(ObjModule, 'MtlMaterial').mockImplementation(() => {
        const mat = new OriginalMtlMaterial();
        mat.diffuse = vec3.create();
        mat.specularExponent = 64;
        mat.map_diffuse = undefined;
        return mat;
    });
});
afterEach(() => {
    sceneMakeSpy.mockRestore();
    gameObjectMakeSpy.mockRestore();
    parseObjSpy.mockRestore();
    mtlMaterialSpy.mockRestore();
});

describe('Scene Format', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should load a basic scene with a single mesh object', async () => {
        const description: SceneDescription = {
            camera: {
                position: [0, 0, 0],
                rotation: [0, 0, 0, 1],
            },
            objects: [
                {
                    type: "mesh",
                    model: 'test.obj',
                    transform: {
                        position: [1, 2, 3],
                        rotation: [0, 0, 0, 1],
                        scale: [1, 1, 1],
                    },
                },
            ],
        };

        const scene = await loadScene(mockGL, description);
        expect(scene).toBeDefined();
        expect(scene.children.length).toBe(1);
    });

    it('should load a scene with nested objects', async () => {
        const description: SceneDescription = {
            camera: {
                position: [0, 0, 0],
                rotation: [0, 0, 0, 1],
            },
            objects: [
                {
                    type: "mesh",
                    model: 'parent.obj',
                    transform: {
                        position: [1, 2, 3],
                        rotation: [0, 0, 0, 1],
                        scale: [1, 1, 1],
                    },
                    children: [
                        {
                            type: "mesh",
                            model: 'child.obj',
                            transform: {
                                position: [1, 0, 0],
                                rotation: [0, 0, 0, 1],
                                scale: [0.5, 0.5, 0.5],
                            },
                        },
                    ],
                },
            ],
        };

        const scene = await loadScene(mockGL, description);
        expect(scene).toBeDefined();
        expect(scene.children.length).toBe(2);
    });

    it('should load a scene with materials', async () => {
        const description: SceneDescription = {
            camera: {
                position: [0, 0, 0],
                rotation: [0, 0, 0, 1],
            },
            objects: [
                {
                    type: "mesh",
                    model: 'test.obj',
                    transform: {
                        position: [0, 0, 0],
                        rotation: [0, 0, 0, 1],
                        scale: [1, 1, 1],
                    },
                    material: {
                        diffuse: [1, 0, 0],
                        specularExponent: 64,
                        diffuseTexture: 'texture.png',
                    },
                },
            ],
        };

        const scene = await loadScene(mockGL, description);
        expect(scene).toBeDefined();
        expect(scene.children[0].material).toBeDefined();
        const material = scene.children[0].material!;
        expect(material.diffuse).toEqual(vec3.fromValues(1, 0, 0));
        expect(material.specularExponent).toBe(64);
        expect(material.map_diffuse).toBeDefined();
    });

    it('should load a scene with lights', async () => {
        const description: SceneDescription = {
            camera: {
                position: [0, 0, 0],
                rotation: [0, 0, 0, 1],
            },
            objects: [
                {
                    type: "point_light",
                    transform: {
                        position: [1, 2, 3],
                    },
                    color: [1, 1, 1],
                    intensity: 0.5,
                    radius: 10,
                },
                {
                    type: "directional_light",
                    transform: {
                        rotation: [0, 0, 0, 1],
                    },
                    direction: [0, -1, 0],
                    color: [1, 0.95, 0.8],
                    intensity: 0.3,
                },
            ],
        };

        const scene = await loadScene(mockGL, description);
        expect(scene).toBeDefined();
        expect(scene.children.length).toBe(2);
        expect((scene.children[0] as any).type).toBe('point_light');
        expect((scene.children[1] as any).type).toBe('directional_light');
    });

    it('should handle missing optional properties', async () => {
        const description: SceneDescription = {
            camera: {
                position: [0, 0, 0],
                rotation: [0, 0, 0, 1],
            },
            objects: [
                {
                    type: "mesh",
                    model: 'test.obj',
                    transform: {},
                },
            ],
        };

        const scene = await loadScene(mockGL, description);
        expect(scene).toBeDefined();
        expect(scene.children.length).toBe(1);
    });

    it('should handle camera with all properties', async () => {
        const description: SceneDescription = {
            camera: {
                position: [0, 0, 0],
                rotation: [0, 0, 0, 1],
                fov: 45,
                aspect: 1.33,
                znear: 0.1,
                zfar: 100,
            },
            objects: [],
        };

        const scene = await loadScene(mockGL, description);
        expect(scene).toBeDefined();
    });

    it('should throw error for mesh without model', async () => {
        const description: SceneDescription = {
            camera: {
                position: [0, 0, 0],
                rotation: [0, 0, 0, 1],
            },
            objects: [
                {
                    type: "mesh",
                    transform: {},
                },
            ],
        };

        await expect(loadScene(mockGL, description)).rejects.toThrow("Mesh object must have a model property");
    });
}); 