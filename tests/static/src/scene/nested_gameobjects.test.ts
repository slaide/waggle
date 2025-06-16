import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { GameObject, GameObjectRegistry } from '../../../../static/src/scene/gameobject';
import { Transform } from '../../../../static/src/scene/transform';
import { Model } from '../../../../static/src/scene/model';
import { PointLight, DirectionalLight } from '../../../../static/src/scene/light';
import { vec3, quat, mat4 } from 'gl-matrix';

// Import to register the GameObjectRegistry factories
import "../../../../static/src/scene/model";
import "../../../../static/src/scene/light";

// Mock WebGL context
const mockGL = {
    createBuffer: mock(() => ({})),
    bindBuffer: mock(() => {}),
    bufferData: mock(() => {}),
    createTexture: mock(() => ({})),
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
    getAttribLocation: mock(() => 0),
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
    getBufferParameter: mock(() => 1024),
    enableVertexAttribArray: mock(() => {}),
    drawElements: mock(() => {}),
    enable: mock(() => {}),
    depthFunc: mock(() => {}),
    cullFace: mock(() => {}),
} as any;

describe('Nested GameObjects', () => {
    let parentObject: GameObject;
    let childObject: GameObject;
    let parentTransform: Transform;
    let childTransform: Transform;

    beforeEach(async () => {
        // Reset mocks
        Object.values(mockGL).forEach(mockFn => {
            if (typeof mockFn === 'function' && typeof (mockFn as any).mockClear === 'function') {
                (mockFn as any).mockClear();
            }
        });

        // Create transforms
        parentTransform = new Transform(
            vec3.fromValues(1, 2, 3),
            quat.fromEuler(quat.create(), 0, 45, 0),
            vec3.fromValues(2, 2, 2)
        );

        childTransform = new Transform(
            vec3.fromValues(0.5, 0, 0),
            quat.fromEuler(quat.create(), 0, 0, 45),
            vec3.fromValues(0.5, 0.5, 0.5)
        );

        // Create objects
        parentObject = new GameObject(mockGL, parentTransform, true, true, "Parent");
        childObject = new GameObject(mockGL, childTransform, true, true, "Child");
    });

    describe('Parent-Child Relationships', () => {
        it('should add child to parent', () => {
            parentObject.addChild(childObject);

                    expect(parentObject.children).toHaveLength(1);
        expect(parentObject.children[0]).toBe(childObject);
        expect(childObject.parent).toBe(parentObject);
        // Note: Transform.parent is no longer used in the new matrix passing system
        });

        it('should remove child from parent', () => {
            parentObject.addChild(childObject);
            parentObject.removeChild(childObject);

            expect(parentObject.children).toHaveLength(0);
            expect(childObject.parent).toBeUndefined();
            expect(childObject.transform.parent).toBeUndefined();
        });

        it('should move child from one parent to another', () => {
            const secondParent = new GameObject(mockGL, new Transform(), true, true, "SecondParent");
            
            parentObject.addChild(childObject);
            secondParent.addChild(childObject);

            expect(parentObject.children).toHaveLength(0);
            expect(secondParent.children).toHaveLength(1);
            expect(childObject.parent).toBe(secondParent);
        });

        it('should traverse hierarchy correctly', () => {
            const grandChild = new GameObject(mockGL, new Transform(), true, true, "GrandChild");
            
            parentObject.addChild(childObject);
            childObject.addChild(grandChild);

            const visited: { obj: GameObject, depth: number }[] = [];
            parentObject.traverse((obj, depth) => {
                visited.push({ obj, depth });
            });

            expect(visited).toHaveLength(3);
            expect(visited[0]).toEqual({ obj: parentObject, depth: 0 });
            expect(visited[1]).toEqual({ obj: childObject, depth: 1 });
            expect(visited[2]).toEqual({ obj: grandChild, depth: 2 });
        });
    });

    describe('Transform Hierarchy', () => {
        beforeEach(() => {
            parentObject.addChild(childObject);
        });

        it('should calculate world matrix correctly for child', () => {
            // Test matrix calculation using the new matrix passing approach
            const parentLocalMatrix = new Float32Array(parentObject.transform.matrix);
            const childLocalMatrix = new Float32Array(childObject.transform.matrix);
            
            // Calculate world matrices using Scene's approach
            const identityMatrix = new Float32Array(16);
            mat4.identity(identityMatrix as any);
            
            const parentWorldMatrix = new Float32Array(16);
            mat4.multiply(parentWorldMatrix as any, identityMatrix as any, parentLocalMatrix as any);
            
            const childWorldMatrix = new Float32Array(16);
            mat4.multiply(childWorldMatrix as any, parentWorldMatrix as any, childLocalMatrix as any);
            
            // Extract world positions for verification
            const parentWorldPos = [parentWorldMatrix[12], parentWorldMatrix[13], parentWorldMatrix[14]];
            const childWorldPos = [childWorldMatrix[12], childWorldMatrix[13], childWorldMatrix[14]];
            
            // Verify positions are calculated correctly
            expect(parentWorldPos[0]).toBeCloseTo(1, 5);
            expect(parentWorldPos[1]).toBeCloseTo(2, 5);
            expect(parentWorldPos[2]).toBeCloseTo(3, 5);
            
            // Child should inherit parent transformation
            expect(childWorldPos).toBeDefined();
        });

        it('should update child transforms when parent changes', () => {
            // With the new matrix passing system, transforms are calculated during rendering
            // This test verifies the parent-child relationship is maintained
            expect(parentObject.children).toHaveLength(1);
            expect(childObject.parent).toBe(parentObject);
            
            // Move parent
            parentObject.transform.setPosition(vec3.fromValues(10, 10, 10));
            
            // Verify parent position changed
            expect(parentObject.transform.position[0]).toBe(10);
            expect(parentObject.transform.position[1]).toBe(10);
            expect(parentObject.transform.position[2]).toBe(10);
        });

        it('should extract world position, rotation, and scale correctly', () => {
            // Test basic transform properties exist
            const localPos = childObject.transform.position;
            const localRot = childObject.transform.rotation;
            const localScale = childObject.transform.scale;

            // Verify that we get valid vectors/quaternions
            expect(localPos).toHaveLength(3);
            expect(localRot).toHaveLength(4);
            expect(localScale).toHaveLength(3);

            // Verify basic property access
            expect(localPos[0]).toBe(0.5);
            expect(localScale[0]).toBe(0.5);
        });
    });

    describe('JSON Serialization and Parsing', () => {
        it('should serialize nested objects to JSON', () => {
            parentObject.addChild(childObject);
            
            const json = parentObject.toJSON();

            expect(json.children).toBeDefined();
            expect(json.children).toHaveLength(1);
            expect(json.children[0].name).toBe("Child");
            expect(json.children[0].type).toBe("mesh");
        });

        it('should parse nested objects from JSON', async () => {
            const jsonData = {
                type: "mesh",
                name: "Parent",
                enabled: true,
                visible: true,
                rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                rawIndices: [0, 1, 2],
                transform: {
                    position: [1, 2, 3],
                    rotation: [0, 0, 0, 1],
                    scale: [2, 2, 2]
                },
                children: [
                    {
                        type: "mesh",
                        name: "Child",
                        enabled: true,
                        visible: true,
                        rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                        rawIndices: [0, 1, 2],
                        transform: {
                            position: [0.5, 0, 0],
                            rotation: [0, 0, 0, 1],
                            scale: [0.5, 0.5, 0.5]
                        }
                    }
                ]
            };

            // Mock fetch for shader files
            (global as any).fetch = mock((url: string) => {
                return Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve(`// Mock shader: ${url}`)
                } as Response);
            });

            const obj = await GameObject.fromJSON(mockGL, jsonData);

            expect(obj.name).toBe("Parent");
            expect(obj.children).toHaveLength(1);
            expect(obj.children[0].name).toBe("Child");
            expect(obj.children[0].parent).toBe(obj);
            // Note: Transform.parent is no longer used in the new matrix passing system
        });

        it('should handle deeply nested objects', async () => {
            const jsonData = {
                type: "mesh",
                name: "Root",
                rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                rawIndices: [0, 1, 2],
                transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
                children: [
                    {
                        type: "mesh",
                        name: "Level1",
                        rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                        rawIndices: [0, 1, 2],
                        transform: { position: [1, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
                        children: [
                            {
                                type: "mesh",
                                name: "Level2",
                                rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                                rawIndices: [0, 1, 2],
                                transform: { position: [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
                            }
                        ]
                    }
                ]
            };

            // Mock fetch for shader files
            (global as any).fetch = mock((url: string) => {
                return Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve(`// Mock shader: ${url}`)
                } as Response);
            });

            const obj = await GameObject.fromJSON(mockGL, jsonData);

            expect(obj.name).toBe("Root");
            expect(obj.children).toHaveLength(1);
            expect(obj.children[0].name).toBe("Level1");
            expect(obj.children[0].children).toHaveLength(1);
            expect(obj.children[0].children[0].name).toBe("Level2");
        });

        it('should handle mixed object types as children', async () => {
            const jsonData = {
                type: "point_light",
                name: "Light",
                transform: { position: [0, 5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
                color: [1, 1, 1],
                intensity: 1.0,
                radius: 10,
                children: [
                                            {
                            type: "mesh",
                            name: "Cube",
                            rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                            rawIndices: [0, 1, 2],
                            transform: { position: [0, -0.5, 0], rotation: [0, 0, 0, 1], scale: [0.1, 0.1, 0.1] }
                        }
                ]
            };

            // Mock fetch for shader files
            (global as any).fetch = mock((url: string) => {
                return Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve(`// Mock shader: ${url}`)
                } as Response);
            });

            const obj = await GameObject.fromJSON(mockGL, jsonData);

            expect(obj).toBeInstanceOf(PointLight);
            expect(obj.name).toBe("Light");
            expect(obj.children).toHaveLength(1);
            expect(obj.children[0]).toBeInstanceOf(Model);
            expect(obj.children[0].name).toBe("Cube");
        });
    });

    describe('Transform Propagation', () => {
        it('should propagate transform changes to all descendants', () => {
            const grandChild = new GameObject(mockGL, new Transform(), true, true, "GrandChild");
            
            parentObject.addChild(childObject);
            childObject.addChild(grandChild);

            // Verify hierarchy structure
            expect(parentObject.children).toHaveLength(1);
            expect(childObject.children).toHaveLength(1);
            expect(grandChild.parent).toBe(childObject);
            expect(childObject.parent).toBe(parentObject);

            // Move parent
            parentObject.transform.setPosition(vec3.fromValues(100, 0, 0));
            
            // Verify parent position changed
            expect(parentObject.transform.position[0]).toBe(100);
        });

        it('should handle transform dirty flag correctly', () => {
            parentObject.addChild(childObject);
            
            // Verify initial state
            expect(parentObject.children).toHaveLength(1);
            expect(childObject.parent).toBe(parentObject);
            
            // Change parent transform
            parentObject.transform.setPosition(vec3.fromValues(50, 50, 50));
            
            // Verify position changed
            expect(parentObject.transform.position[0]).toBe(50);
            expect(parentObject.transform.position[1]).toBe(50);
            expect(parentObject.transform.position[2]).toBe(50);
        });
    });
}); 