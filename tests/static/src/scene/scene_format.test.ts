import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { SceneDescription, loadScene } from '../../../../static/src/scene/scene';
import { Scene } from '../../../../static/src/scene/scene';
import { GameObject } from '../../../../static/src/scene/gameobject';
// Import these to ensure registration happens
import '../../../../static/src/scene/model';
import '../../../../static/src/scene/light';
import { Model } from '../../../../static/src/scene/model';
import * as ObjModule from '../../../../static/src/bits/obj';
import { vec3 } from 'gl-matrix';
import * as PngModule from '../../../../static/src/bits/png';
import { PointLight, DirectionalLight } from '../../../../static/src/scene/light';

// Mock WebGL context
const mockGL = {
    createBuffer: mock(() => {}),
    bindBuffer: mock(() => {}),
    bufferData: mock(() => {}),
    createTexture: mock(() => {}),
    bindTexture: mock(() => {}),
    texImage2D: mock(() => {}),
    createProgram: mock(() => ({})),
    createShader: mock(() => ({})),
    shaderSource: mock(() => {}),
    compileShader: mock(() => {}),
    attachShader: mock(() => {}),
    linkProgram: mock(() => {}),
    getProgramParameter: mock((program, pname) => pname === 35714 /* GL.LINK_STATUS */ ? true : 1),
    getShaderParameter: mock((shader, pname) => pname === 35713 /* GL.COMPILE_STATUS */ ? true : 1),
    getShaderInfoLog: mock(() => ''),
    getProgramInfoLog: mock(() => ''),
    pixelStorei: mock(() => {}),
    texParameteri: mock(() => {}),
    getAttribLocation: mock(() => {}),
    getUniformLocation: mock(() => ({})),
    getActiveAttrib: mock(() => ({ name: 'a_position' })),
    getActiveUniform: mock(() => ({ name: 'u_matrix' })),
    vertexAttribPointer: mock(() => {}),
    useProgram: mock(() => {}),
    uniformMatrix4fv: mock(() => {}),
    uniform1f: mock(() => {}),
    uniform4f: mock(() => {}),
    uniform1i: mock(() => {}),
    activeTexture: mock(() => {}),
    getBufferParameter: mock(() => 1024), // Mock buffer size
    enableVertexAttribArray: mock(() => {}),
    drawElements: mock(() => {}),
    enable: mock(() => {}),
    depthFunc: mock(() => {}),
    cullFace: mock(() => {}),
    frontFace: mock(() => {}),
    clearColor: mock(() => {}),
    clearDepth: mock(() => {}),
    viewport: mock(() => {}),
    clear: mock(() => {}),
    bindFramebuffer: mock(() => {}),
    drawBuffers: mock(() => {}),
} as unknown as WebGL2RenderingContext;

let sceneMakeSpy: any;
let gameObjectMakeSpy: any;
let parseObjSpy: any;
let mtlMaterialSpy: any;
let OriginalMtlMaterial: any;

beforeEach(() => {
    // Mock fetch to return dummy shader code or dummy PNG buffer
    globalThis.fetch = mock((url) => {
        if (typeof url === 'string' && url.endsWith('.png')) {
            return Promise.resolve({
                ok: true,
                arrayBuffer: () => Promise.resolve(new Uint8Array([128, 128, 128, 255]).buffer),
            });
        }
        return Promise.resolve({
            ok: true,
            text: () => Promise.resolve('// dummy shader code'),
        });
    }) as any;
    // Mock parsePng to always return a dummy image
    spyOn(PngModule, 'parsePng').mockResolvedValue({
        width: 1,
        height: 1,
        data: new Uint8Array([128, 128, 128, 255]),
    });
    // Mock alert to a no-op
    globalThis.alert = () => {};
    sceneMakeSpy = spyOn(Scene, 'make').mockImplementation((gl) => Promise.resolve(new Scene(gl, [])));
    // Remove the GameObject.fromJSON mock to allow actual loading
    // Provide a realistic mock structure for ObjFile using constructors
    const group = new ObjModule.ObjGroup(new Float32Array(), new Uint32Array(), null);
    const obj = new ObjModule.ObjObject({ temp: group });
    const objects = { temp: obj };
    parseObjSpy = spyOn(ObjModule, 'parseObj').mockResolvedValue(
        new ObjModule.ObjFile(objects, { x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, z: { min: 0, max: 1 } })
    );
    // Save the original constructor
    OriginalMtlMaterial = ObjModule.MtlMaterial;
    mtlMaterialSpy = (spyOn(ObjModule, 'MtlMaterial') as any).mockImplementation(() => {
        const mat = new OriginalMtlMaterial();
        mat.diffuse = vec3.fromValues(1, 0, 0);  // Set default diffuse color to red
        mat.specularExponent = 64;
        mat.map_diffuse = { source: 'texture.png' };
        return mat;
    });
});
afterEach(() => {
    sceneMakeSpy.mockRestore();
    parseObjSpy.mockRestore();
    mtlMaterialSpy.mockRestore();
    // Restore fetch
    delete (globalThis as any).fetch;
});

describe('Scene Format', () => {
    beforeEach(() => {
        // Clear all mocks - Bun doesn't have a direct equivalent, but individual mocks can be cleared
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
        expect(scene.objects.length).toBe(1);
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
        expect(scene.objects.length).toBe(1); // Only parent object is in top-level
        expect(scene.objects[0].children.length).toBe(1); // Child is nested
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
        expect(scene.objects[0].material).toBeDefined();
        const material = scene.objects[0].material!;
        expect(Array.from(material.diffuse!)).toEqual([1, 0, 0]);
        expect(material.specularExponent).toBe(64);
        expect(material.diffuseTexture).toBeDefined();
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
                        rotation: [0, 0, 0, 1],
                        scale: [1, 1, 1],
                    },
                    color: [1, 1, 1],
                    intensity: 0.5,
                    radius: 10,
                },
                {
                    type: "directional_light",
                    transform: {
                        position: [0, 0, 0],
                        rotation: [0, 0, 0, 1],
                        scale: [1, 1, 1],
                    },
                    direction: [0, -1, 0],
                    color: [1, 0.95, 0.8],
                    intensity: 0.3,
                },
            ],
        };

        const scene = await loadScene(mockGL, description);
        expect(scene).toBeDefined();
        expect(scene.objects.length).toBe(2);
        
        // Check if objects are instances of the correct light classes
        expect(scene.objects[0]).toBeInstanceOf(PointLight);
        expect(scene.objects[1]).toBeInstanceOf(DirectionalLight);
        
        // Verify point light properties
        const pointLight = scene.objects[0] as PointLight;
        expect(pointLight.color).toEqual(vec3.fromValues(1, 1, 1));
        expect(pointLight.intensity).toBe(0.5);
        expect(pointLight.radius).toBe(10);
        expect(pointLight.transform.position).toEqual(vec3.fromValues(1, 2, 3));
        
        // Verify directional light properties
        const directionalLight = scene.objects[1] as DirectionalLight;
        expect(directionalLight.color).toEqual(vec3.fromValues(1, 0.95, 0.8));
        expect(directionalLight.intensity).toBe(0.3);
        expect(directionalLight.direction).toEqual(vec3.fromValues(0, -1, 0));
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
        expect(scene.objects.length).toBe(1);
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

        await expect(loadScene(mockGL, description)).rejects.toThrow(
            "Mesh object must have either a model property or meshData"
        );
    });

    it('should load a scene with serialized mesh data', async () => {
        const description: SceneDescription = {
            camera: {
                position: [0, 0, 0],
                rotation: [0, 0, 0, 1],
            },
            objects: [
                {
                    type: "mesh",
                    meshData: {
                        vertexData: [0, 0, 0, 0, 1, 0, 1, 0, 0],  // Simple triangle
                        indices: [0, 1, 2],
                        texturePath: 'texture.png'
                    },
                    transform: {
                        position: [0, 0, 0],
                        rotation: [0, 0, 0, 1],
                        scale: [1, 1, 1],
                    },
                    material: {
                        diffuse: [1, 0, 0],
                        specularExponent: 64,
                    },
                },
            ],
        };

        const scene = await loadScene(mockGL, description);
        expect(scene).toBeDefined();
        expect(scene.objects.length).toBe(1);
        expect(scene.objects[0].material).toBeDefined();
        expect(scene.objects[0].material!.diffuseTexture).toBeDefined();
        expect(scene.objects[0].material!.diffuseTexture).toBe('texture.png');
    });

    it('should load a scene with mixed mesh data sources', async () => {
        const description: SceneDescription = {
            camera: {
                position: [0, 0, 0],
                rotation: [0, 0, 0, 1],
            },
            objects: [
                {
                    type: "mesh",
                    model: 'test.obj',  // OBJ file
                    transform: {
                        position: [0, 0, 0],
                    },
                },
                {
                    type: "mesh",
                    meshData: {  // Serialized data
                        vertexData: [0, 0, 0, 0, 1, 0, 1, 0, 0],
                        indices: [0, 1, 2],
                    },
                    transform: {
                        position: [1, 0, 0],
                    },
                },
            ],
        };

        const scene = await loadScene(mockGL, description);
        expect(scene).toBeDefined();
        expect(scene.objects.length).toBe(2);
        expect(parseObjSpy).toHaveBeenCalledTimes(1);  // Should only parse OBJ once
    });

    it('should throw error for mesh without model or meshData', async () => {
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

        await expect(loadScene(mockGL, description)).rejects.toThrow(
            "Mesh object must have either a model property or meshData"
        );
    });
}); 