import { describe, it, expect } from "bun:test";
import { vec3, quat, mat4 } from "gl-matrix";
import { Transform } from "../../../../static/src/scene/transform";

// Import the necessary modules for registration
import "../../../../static/src/scene/model";
import "../../../../static/src/scene/light";

describe("Scene Matrix Calculation Debug", () => {
    
    function exactSceneLogic() {
        // Exactly replicate what Scene.drawObjectHierarchy does
        
        // 1. Create identity matrix like Scene.draw() does
        const identityMatrix = new Float32Array(16);
        mat4.identity(identityMatrix as any);
        
        console.log("Identity matrix:", identityMatrix);
        
        // 2. Create parent bunny transform (0, -1, -4)
        const parentTransform = new Transform(
            vec3.fromValues(0, -1, -4),
            quat.identity(quat.create()),
            vec3.fromValues(1, 1, 1)
        );
        
        // 3. Get parent's local matrix
        const parentLocalMatrix = parentTransform.matrix;
        console.log("Parent local matrix:", parentLocalMatrix);
        console.log("Parent local position:", [parentLocalMatrix[12], parentLocalMatrix[13], parentLocalMatrix[14]]);
        
        // 4. Calculate parent world matrix
        const parentWorldMatrix = new Float32Array(16);
        mat4.multiply(parentWorldMatrix as any, identityMatrix as any, parentLocalMatrix as any);
        console.log("Parent world position:", [parentWorldMatrix[12], parentWorldMatrix[13], parentWorldMatrix[14]]);
        
        // 5. Create child bunny transform (1, 0, 0)
        const childTransform = new Transform(
            vec3.fromValues(1, 0, 0),
            quat.identity(quat.create()),
            vec3.fromValues(0.7, 0.7, 0.7)
        );
        
        // 6. Get child's local matrix
        const childLocalMatrix = childTransform.matrix;
        console.log("Child local matrix:", childLocalMatrix);
        console.log("Child local position:", [childLocalMatrix[12], childLocalMatrix[13], childLocalMatrix[14]]);
        
        // 7. Calculate child world matrix
        const childWorldMatrix = new Float32Array(16);
        mat4.multiply(childWorldMatrix as any, parentWorldMatrix as any, childLocalMatrix as any);
        console.log("Child world position:", [childWorldMatrix[12], childWorldMatrix[13], childWorldMatrix[14]]);
        
        return {
            parentWorldPos: [parentWorldMatrix[12], parentWorldMatrix[13], parentWorldMatrix[14]],
            childWorldPos: [childWorldMatrix[12], childWorldMatrix[13], childWorldMatrix[14]],
            identityMatrix,
            parentLocalMatrix,
            parentWorldMatrix,
            childLocalMatrix,
            childWorldMatrix
        };
    }
    
    it("should exactly replicate Scene.drawObjectHierarchy calculations", () => {
        const result = exactSceneLogic();
        
        // Parent should be at (0, -1, -4)
        expect(result.parentWorldPos[0]).toBeCloseTo(0, 6);
        expect(result.parentWorldPos[1]).toBeCloseTo(-1, 6);
        expect(result.parentWorldPos[2]).toBeCloseTo(-4, 6);
        
        // Child should be at (1, -1, -4) - parent position + child local offset
        expect(result.childWorldPos[0]).toBeCloseTo(1, 6);
        expect(result.childWorldPos[1]).toBeCloseTo(-1, 6);
        expect(result.childWorldPos[2]).toBeCloseTo(-4, 6);
    });
    
    it("should verify matrix format and values", () => {
        const result = exactSceneLogic();
        
        // Check identity matrix is correct
        const expectedIdentity = [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ];
        
        for (let i = 0; i < 16; i++) {
            expect(result.identityMatrix[i]).toBeCloseTo(expectedIdentity[i], 6);
        }
        
        // Check parent local matrix has correct translation
        expect(result.parentLocalMatrix[12]).toBeCloseTo(0, 6);  // X
        expect(result.parentLocalMatrix[13]).toBeCloseTo(-1, 6); // Y
        expect(result.parentLocalMatrix[14]).toBeCloseTo(-4, 6); // Z
        
        // Check child local matrix has correct translation
        expect(result.childLocalMatrix[12]).toBeCloseTo(1, 6);   // X
        expect(result.childLocalMatrix[13]).toBeCloseTo(0, 6);   // Y
        expect(result.childLocalMatrix[14]).toBeCloseTo(0, 6);   // Z
        
        // Check child local matrix has correct scale
        expect(result.childLocalMatrix[0]).toBeCloseTo(0.7, 6);  // Scale X
        expect(result.childLocalMatrix[5]).toBeCloseTo(0.7, 6);  // Scale Y
        expect(result.childLocalMatrix[10]).toBeCloseTo(0.7, 6); // Scale Z
    });
    
    it("should test manual matrix multiplication step by step", () => {
        // Manual calculation of parent world matrix
        const identity = mat4.create();
        const parentTransform = new Transform(
            vec3.fromValues(0, -1, -4),
            quat.identity(quat.create()),
            vec3.fromValues(1, 1, 1)
        );
        
        const parentLocal = parentTransform.matrix;
        const parentWorld = mat4.create();
        mat4.multiply(parentWorld, identity, parentLocal);
        
        console.log("Manual parent world:", mat4.getTranslation(vec3.create(), parentWorld));
        
        // Manual calculation of child world matrix
        const childTransform = new Transform(
            vec3.fromValues(1, 0, 0),
            quat.identity(quat.create()),
            vec3.fromValues(0.7, 0.7, 0.7)
        );
        
        const childLocal = childTransform.matrix;
        const childWorld = mat4.create();
        mat4.multiply(childWorld, parentWorld, childLocal);
        
        const childWorldPos = mat4.getTranslation(vec3.create(), childWorld);
        console.log("Manual child world:", childWorldPos);
        
        expect(childWorldPos[0]).toBeCloseTo(1, 6);
        expect(childWorldPos[1]).toBeCloseTo(-1, 6);
        expect(childWorldPos[2]).toBeCloseTo(-4, 6);
    });
}); 