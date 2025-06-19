import { describe, it, expect } from "bun:test";
import { mat4 } from "gl-matrix";
import { Scene } from '../../../../static/src/scene/scene';
import { GameObject } from '../../../../static/src/scene/gameobject';
import { Transform } from '../../../../static/src/scene/transform';

// Simple mock GL context - just enough to create Scene
const mockGL = {} as WebGL2RenderingContext;

describe('Scene Nested Integration', () => {
    it('should create empty scene correctly', () => {
        const scene = new Scene(mockGL);
        
        expect(scene).toBeDefined();
        expect(scene.objects).toHaveLength(0);
    });

    it('should correctly calculate world transforms for nested objects', () => {
        const scene = new Scene(mockGL);
        
        // Create parent object at position (10, 20, 30) with scale (2, 2, 2)
        const parentTransform = new Transform();
        parentTransform.setPosition([10, 20, 30] as any);
        parentTransform.setScale([2, 2, 2] as any);
        
        const parent = new GameObject(mockGL, parentTransform, true, true, "Parent");
        
        // Create child object at local position (0, 0, 1) with scale (0.5, 0.5, 0.5)
        const childTransform = new Transform();
        childTransform.setPosition([0, 0, 1] as any);
        childTransform.setScale([0.5, 0.5, 0.5] as any);
        
        const child = new GameObject(mockGL, childTransform, true, true, "Child");
        
        // Build hierarchy
        parent.addChild(child);
        scene.objects.push(parent);
        
        // Test using the matrix passing system approach
        const parentLocalMatrix = new Float32Array(parent.transform.matrix);
        const childLocalMatrix = new Float32Array(child.transform.matrix);
        
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
        
        // Verify parent world position matches its local position
        expect(parentWorldPos[0]).toBeCloseTo(10, 5);
        expect(parentWorldPos[1]).toBeCloseTo(20, 5);
        expect(parentWorldPos[2]).toBeCloseTo(30, 5);
        
        // Child world position should be affected by parent's transform
        // Child local (0,0,1) * parent scale (2,2,2) + parent position (10,20,30) = (10,20,32)
        expect(childWorldPos[0]).toBeCloseTo(10, 5);
        expect(childWorldPos[1]).toBeCloseTo(20, 5);
        expect(childWorldPos[2]).toBeCloseTo(32, 5);
    });

    it('should traverse nested objects correctly in scene', () => {
        const scene = new Scene(mockGL);
        
        // Create hierarchy: Root -> Child1 -> Grandchild
        //                        -> Child2
        const root = new GameObject(mockGL, new Transform(), true, true, "Root");
        const child1 = new GameObject(mockGL, new Transform(), true, true, "Child1");
        const child2 = new GameObject(mockGL, new Transform(), true, true, "Child2");
        const grandchild = new GameObject(mockGL, new Transform(), true, true, "Grandchild");
        
        root.addChild(child1);
        root.addChild(child2);
        child1.addChild(grandchild);
        
        scene.objects.push(root);
        
        // Traverse and collect names
        const visitedNames: string[] = [];
        scene.traverse((obj) => {
            if (obj.name) {
                visitedNames.push(obj.name);
            }
        });
        
        // Should visit all objects in depth-first order
        expect(visitedNames).toEqual(["Root", "Child1", "Grandchild", "Child2"]);
    });

    it('should handle draw calls for nested objects', () => {
        const scene = new Scene(mockGL);
        
        // Create parent and child objects
        const parent = new GameObject(mockGL, new Transform(), true, true, "Parent");
        const child = new GameObject(mockGL, new Transform(), true, true, "Child");
        
        parent.addChild(child);
        scene.objects.push(parent);
        
        // Track draw calls
        let drawCallCount = 0;
        parent.draw = () => { drawCallCount++; };
        child.draw = () => { drawCallCount++; };
        
        // Simulate scene draw traversal
        scene.traverse((obj) => {
            if (obj.shouldDraw) {
                obj.draw();
            }
        });
        
        // Both parent and child should be drawn
        expect(drawCallCount).toBe(2);
    });

    it('should draw light children even when light itself is not drawn', async () => {
        // Import light classes
        const { PointLight } = await import('../../../../static/src/scene/light');
        
        const scene = new Scene(mockGL);
        
        // Create a point light with a child GameObject
        const light = new PointLight(
            mockGL,
            new Transform(),
            [1, 1, 1], // color
            10, // radius
            1.0, // intensity
            true, // enabled
            false, // visible - light itself should not be drawn
            "TestLight"
        );
        
        // Create a child GameObject that should be drawn
        const childObject = new GameObject(mockGL, new Transform(), true, true, "LightChild");
        light.addChild(childObject);
        
        scene.objects.push(light);
        
        // Track draw calls
        let lightDrawCalls = 0;
        let childDrawCalls = 0;
        
        light.draw = () => { lightDrawCalls++; };
        childObject.draw = () => { childDrawCalls++; };
        
        // Simulate scene draw traversal
        scene.traverse((obj) => {
            if (obj.shouldDraw) {
                obj.draw();
            }
        });
        
        // Light should not be drawn (visible = false), but child should be drawn
        expect(lightDrawCalls).toBe(0); // Light is not visible
        expect(childDrawCalls).toBe(1); // Child should be drawn
        
        // Verify light is not drawn but child is
        expect(light.shouldDraw).toBe(false); // enabled=true, visible=false
        expect(childObject.shouldDraw).toBe(true); // enabled=true, visible=true
    });
}); 