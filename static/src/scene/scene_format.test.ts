import { SceneDescription, loadScene } from './scene_format';
import { Scene } from './scene';
import { GameObject } from './gameobject';
import { Camera } from './camera';
import { vec3, quat } from 'gl-matrix';

// Mock WebGL context
const mockGL = {
    createBuffer: jest.fn(),
    bindBuffer: jest.fn(),
    bufferData: jest.fn(),
    createTexture: jest.fn(),
    bindTexture: jest.fn(),
    texImage2D: jest.fn(),
    createProgram: jest.fn(),
    createShader: jest.fn(),
    shaderSource: jest.fn(),
    compileShader: jest.fn(),
    attachShader: jest.fn(),
    linkProgram: jest.fn(),
    getProgramParameter: jest.fn(),
    getShaderParameter: jest.fn(),
    getShaderInfoLog: jest.fn(),
    getProgramInfoLog: jest.fn(),
} as unknown as WebGL2RenderingContext;

// Mock Scene.make
jest.mock('./scene', () => ({
    Scene: {
        make: jest.fn().mockImplementation(() => Promise.resolve({
            children: [],
        })),
    },
}));

// Mock GameObject.make and GameObject constructor
jest.mock('./gameobject', () => {
    const mockGameObject = jest.fn().mockImplementation(() => ({
        material: null,
        upload: jest.fn(),
    }));
    return {
        GameObject: Object.assign(mockGameObject, {
            make: jest.fn().mockResolvedValue({
                material: null,
                upload: jest.fn(),
            }),
        }),
    };
});

// Mock MtlMaterial
jest.mock('../bits/obj', () => ({
    parseObj: jest.fn().mockResolvedValue({
        objects: {
            temp: {
                groups: {
                    temp: {
                        vertices: [],
                        indices: [],
                    },
                },
            },
        },
        boundingBox: {
            min: [0, 0, 0],
            max: [1, 1, 1],
        },
    }),
    MtlMaterial: jest.fn().mockImplementation(() => ({
        diffuse: vec3.create(),
        specularExponent: 64,
        map_diffuse: null,
    })),
}));

describe('Scene Format', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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