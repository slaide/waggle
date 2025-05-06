declare module "glm/common"{
    // https://glmatrix.net/docs/common.js.html

    /** default is 0.000001 */
    let EPSILON:number;
    /**
     * Tests whether or not the arguments have approximately the same value, within an absolute
     * or relative tolerance of glMatrix.EPSILON (an absolute tolerance is used for values less
     * than or equal to 1.0, and a relative tolerance is used for larger values)
     *
     * @param a The first number to test.
     * @param b The second number to test.
     * @returns True if the numbers are approximately equal, false otherwise.
     */
    function equals(a:number, b:number):boolean;

    /** Intrinsic order for rot3->matrix conversion, default is xyz (i.e. first around x etc.). */
    let ANGLE_ORDER:'xyz'|'xzy'|'yxz'|'yzx'|'zxy'|'zyx';

    /**
     * Convert Degree To Radian
     *
     * @param {Number} a Angle in Degrees
     */
    function toRadian(a:number):number;
    
    /**
     * Convert Radian To Degree
     *
     * @param {Number} a Angle in Radians
     */
    function toDegree(a:number):number;

    /**
     * Symmetric round
     * see https://www.npmjs.com/package/round-half-up-symmetric#user-content-detailed-background
     *
     * @param {Number} a value to round
     */
    function round(a:number):number;
}

declare module "glm/mat2"{
    // https://glmatrix.net/docs/module-mat2.html

    import { vec2 } from "glm/vec2";

    class mat2 extends Float32Array{
        static create(): mat2;
        static clone(a: mat2): mat2;
        static copy(out: mat2, a: mat2): mat2;
        static identity(out: mat2): mat2;
        static fromValues(m00: number, m01: number, m10: number, m11: number): mat2;
        static set(out: mat2, m00: number, m01: number, m10: number, m11: number): mat2;
        static transpose(out: mat2, a: mat2): mat2;
        static invert(out: mat2, a: mat2): mat2 | null;
        static adjoint(out: mat2, a: mat2): mat2;
        static determinant(a: mat2): number;
        static multiply(out: mat2, a: mat2, b: mat2): mat2;
        static rotate(out: mat2, a: mat2, rad: number): mat2;
        static scale(out: mat2, a: mat2, v: vec2): mat2;
        static fromRotation(out: mat2, rad: number): mat2;
        static fromScaling(out: mat2, v: vec2): mat2;
        static str(a: mat2): string;
        static frob(a: mat2): number;
        static LDU(L: mat2, D: mat2, U: mat2, a: mat2): [mat2, mat2, mat2];
        static add(out: mat2, a: mat2, b: mat2): mat2;
        static subtract(out: mat2, a: mat2, b: mat2): mat2;
    }
}
declare module "glm/mat2d"{
    // https://glmatrix.net/docs/module-mat2d.html

    import { vec2 } from "glm/vec2";

    class mat2d extends Float32Array{
        static create(): mat2d;
        static clone(a: mat2d): mat2d;
        static copy(out: mat2d, a: mat2d): mat2d;
        static identity(out: mat2d): mat2d;
        static fromValues(a: number, b: number, c: number, d: number, tx: number, ty: number): mat2d;
        static set(out: mat2d, a: number, b: number, c: number, d: number, tx: number, ty: number): mat2d;
        static invert(out: mat2d, a: mat2d): mat2d | null;
        static determinant(a: mat2d): number;
        static multiply(out: mat2d, a: mat2d, b: mat2d): mat2d;
        static rotate(out: mat2d, a: mat2d, rad: number): mat2d;
        static scale(out: mat2d, a: mat2d, v: vec2): mat2d;
        static translate(out: mat2d, a: mat2d, v: vec2): mat2d;
        static fromRotation(out: mat2d, rad: number): mat2d;
        static fromScaling(out: mat2d, v: vec2): mat2d;
        static fromTranslation(out: mat2d, v: vec2): mat2d;
        static str(a: mat2d): string;
        static frob(a: mat2d): number;
        static add(out: mat2d, a: mat2d, b: mat2d): mat2d;
        static subtract(out: mat2d, a: mat2d, b: mat2d): mat2d;
        static multiplyScalar(out: mat2d, a: mat2d, b: number): mat2d;
        static multiplyScalarAndAdd(out: mat2d, a: mat2d, b: mat2d, scale: number): mat2d;
        static exactEquals(a: mat2d, b: mat2d): boolean;
        static equals(a: mat2d, b: mat2d): boolean;
        /** Alias for multiply */
        static mul(out: mat2d, a: mat2d, b: mat2d): mat2d;
        /** Alias for subtract */
        static sub(out: mat2d, a: mat2d, b: mat2d): mat2d;
    }
}
declare module "glm/mat3"{
    // https://glmatrix.net/docs/module-mat3.html

    import { mat4 } from "glm/mat4";
    import { vec2 } from "glm/vec2";
    import { mat2d } from "glm/mat2d";

    class mat3 extends Float32Array{
        static create(): mat3;
        static fromMat4(out: mat3, a: mat4): mat3;
        static clone(a: mat3): mat3;
        static copy(out: mat3, a: mat3): mat3;
        static fromValues(m00: number, m01: number, m02: number,
                          m10: number, m11: number, m12: number,
                          m20: number, m21: number, m22: number): mat3;
        static set(out: mat3,
                   m00: number, m01: number, m02: number,
                   m10: number, m11: number, m12: number,
                   m20: number, m21: number, m22: number): mat3;
        static identity(out: mat3): mat3;
        static transpose(out: mat3, a: mat3): mat3;
        static invert(out: mat3, a: mat3): mat3 | null;
        static adjoint(out: mat3, a: mat3): mat3;
        static determinant(a: mat3): number;
        static multiply(out: mat3, a: mat3, b: mat3): mat3;
        static translate(out: mat3, a: mat3, v: vec2): mat3;
        static rotate(out: mat3, a: mat3, rad: number): mat3;
        static scale(out: mat3, a: mat3, v: vec2): mat3;
        static fromTranslation(out: mat3, v: vec2): mat3;
        static fromRotation(out: mat3, rad: number): mat3;
        static fromScaling(out: mat3, v: vec2): mat3;
        static fromMat2d(out: mat3, a: mat2d): mat3;
        static str(a: mat3): string;
        static frob(a: mat3): number;
    }
}
declare module "glm/mat4"{
    // https://glmatrix.net/docs/module-mat4.html
    import {quat} from "glm/quat";
    import {vec3} from "glm/vec3";

    class mat4 extends Float32Array{
        static create(): mat4;
        static clone(a: mat4): mat4;
        static copy(out: mat4, a: mat4): mat4;
        static fromValues(
            m00: number, m01: number, m02: number, m03: number,
            m10: number, m11: number, m12: number, m13: number,
            m20: number, m21: number, m22: number, m23: number,
            m30: number, m31: number, m32: number, m33: number
        ): mat4;
        static set(
            out: mat4,
            m00: number, m01: number, m02: number, m03: number,
            m10: number, m11: number, m12: number, m13: number,
            m20: number, m21: number, m22: number, m23: number,
            m30: number, m31: number, m32: number, m33: number
        ): mat4;
        static identity(out: mat4): mat4;
        static transpose(out: mat4, a: mat4): mat4;
        static invert(out: mat4, a: mat4): mat4 | null;
        static adjoint(out: mat4, a: mat4): mat4;
        static determinant(a: mat4): number;
        static multiply(out: mat4, a: mat4, b: mat4): mat4;
        static translate(out: mat4, a: mat4, v: vec3): mat4;
        static scale(out: mat4, a: mat4, v: vec3): mat4;
        static rotate(out: mat4, a: mat4, rad: number, axis: vec3): mat4 | null;
        static rotateX(out: mat4, a: mat4, rad: number): mat4;
        static rotateY(out: mat4, a: mat4, rad: number): mat4;
        static rotateZ(out: mat4, a: mat4, rad: number): mat4;
        static fromTranslation(out: mat4, v: vec3): mat4;
        static fromScaling(out: mat4, v: vec3): mat4;
        static fromRotation(out: mat4, rad: number, axis: vec3): mat4 | null;
        static fromXRotation(out: mat4, rad: number): mat4;
        static fromYRotation(out: mat4, rad: number): mat4;
        static fromZRotation(out: mat4, rad: number): mat4;
        static perspective(out: mat4, fovy: number, aspect: number, near: number, far: number): mat4;
        static perspectiveFromFieldOfView(out:mat4, fov:{upDegrees:number, downDegrees:number, leftDegrees:number, rightDegrees:number}, near:number, far:number):mat4;
        static fromRotationTranslation(out: mat4, q: quat, v: vec3): mat4;
        static fromRotationTranslationScale(out: mat4, q: quat, v: vec3, s: vec3): mat4;
        static str(a: mat4): string;
        static frob(a: mat4): number;
        static lookAt(out:mat4, eye:vec3, center:vec3, up:vec3):mat4;
    }
}
declare module "glm/quat"{
    // https://glmatrix.net/docs/module-quat.html

    class quat extends Float32Array{
        static create(): quat;
        static identity(out: quat): quat;
        /** Sets a quat from the given angle and rotation axis,then returns it. */
        static setAxisAngle(out: quat, axis: Readonly<number[]>, rad: number): quat;
        /** Gets the rotation axis and angle for a given quaternion. If a quaternion is created with setAxisAngle, this method will return the same values as providied in the original parameter list OR functionally equivalent values.Example: The quaternion formed by axis [0, 0, 1] and angle -90 is the same as the quaternion formed by [0, 0, 1] and 270. This method favors the latter. */
        static getAxisAngle(out: number[], q: quat): number;
        /** Gets the angular distance between two unit quaternions */
        static getAngle(a: quat, b: quat): number;
        static multiply(out: quat, a: quat, b: quat): quat;
        /** Rotates a quaternion by the given angle about the X axis  */
        static rotateX(out: quat, a: quat, rad: number): quat;
        /** Rotates a quaternion by the given angle about the Y axis  */
        static rotateY(out: quat, a: quat, rad: number): quat;
        /** Rotates a quaternion by the given angle about the Z axis  */
        static rotateZ(out: quat, a: quat, rad: number): quat;
        static calculateW(out: quat, a: quat): quat;
        static exp(out: quat, a: quat): quat;
        static ln(out: quat, a: quat): quat;
        static pow(out: quat, a: quat, b: number): quat;
        static slerp(out: quat, a: quat, b: quat, t: number): quat;
        static random(out: quat): quat;
        static invert(out: quat, a: quat): quat;
        static conjugate(out: quat, a: quat): quat;
        static fromMat3(out: quat, m: Float32Array): quat;
        static fromEuler(out: quat, x: number, y: number, z: number, order?: 'xyz'|'xzy'|'yxz'|'yzx'|'zxy'|'zyx'): quat;
    }
}
declare module "glm/quat2"{
    // https://glmatrix.net/docs/module-quat2.html

    import {vec3} from "glm/vec3";
    import {mat4} from "glm/mat4";
    import {quat} from "glm/quat";

    class quat2 extends Float32Array{
        static create(): quat2;
        static clone(a: quat2): quat2;
        static fromValues(x1: number, y1: number, z1: number, w1: number, x2: number, y2: number, z2: number, w2: number): quat2;
        static fromRotationTranslationValues(x1: number, y1: number, z1: number, w1: number, x2: number, y2: number, z2: number): quat2;
        static fromRotationTranslation(out: quat2, q: quat, t: vec3): quat2;
        static fromTranslation(out: quat2, v: vec3): quat2;
        static fromRotation(out: quat2, q: quat): quat2;
        static fromMat4(out: quat2, a: mat4): quat2;
        static copy(out: quat2, a: quat2): quat2;
        static identity(out: quat2): quat2;
        static set(out: quat2, x1: number, y1: number, z1: number, w1: number, x2: number, y2: number, z2: number, w2: number): quat2;
        static getReal(out: quat, a: quat2): quat;
        static getDual(out: quat, a: quat2): quat;
        static setReal(out: quat2, q: quat): quat2;
        static setDual(out: quat2, q: quat): quat2;
        static getTranslation(out: vec3, a: quat2): vec3;
        static translate(out: quat2, a: quat2, v: vec3): quat2;
        static rotateX(out: quat2, a: quat2, rad: number): quat2;
        static rotateY(out: quat2, a: quat2, rad: number): quat2;
        static rotateZ(out: quat2, a: quat2, rad: number): quat2;
        static rotateByQuatAppend(out: quat2, a: quat2, q: quat): quat2;
        static rotateByQuatPrepend(out: quat2, q: quat, a: quat2): quat2;
        static rotateAroundAxis(out: quat2, a: quat2, axis: [number, number, number], rad: number): quat2;
        static add(out: quat2, a: quat2, b: quat2): quat2;
        static multiply(out: quat2, a: quat2, b: quat2): quat2;
        static scale(out: quat2, a: quat2, b: number): quat2;
        static lerp(out: quat2, a: quat2, b: quat2, t: number): quat2;
        static invert(out: quat2, a: quat2): quat2;
        static conjugate(out: quat2, a: quat2): quat2;
        static normalize(out: quat2, a: quat2): quat2;
        static str(a: quat2): string;
        static exactEquals(a: quat2, b: quat2): boolean;
        static equals(a: quat2, b: quat2): boolean;
    }
}
declare module "glm/vec2"{
    // https://glmatrix.net/docs/module-vec2.html

    import {mat2} from "glm/mat2";
    import {mat2d} from "glm/mat2d";
    import {mat3} from "glm/mat3";
    import {mat4} from "glm/mat4";

    class vec2 extends Float32Array{
        static create(): vec2;
        static clone(a: vec2): vec2;
        static copy(out: vec2, a: vec2): vec2;
        static fromValues(x: number, y: number): vec2;
        static set(out: vec2, x: number, y: number): vec2;
        static add(out: vec2, a: vec2, b: vec2): vec2;
        static subtract(out: vec2, a: vec2, b: vec2): vec2;
        static multiply(out: vec2, a: vec2, b: vec2): vec2;
        static divide(out: vec2, a: vec2, b: vec2): vec2;
        static ceil(out: vec2, a: vec2): vec2;
        static floor(out: vec2, a: vec2): vec2;
        static min(out: vec2, a: vec2, b: vec2): vec2;
        static max(out: vec2, a: vec2, b: vec2): vec2;
        static round(out: vec2, a: vec2): vec2;
        static scale(out: vec2, a: vec2, b: number): vec2;
        static scaleAndAdd(out: vec2, a: vec2, b: vec2, scale: number): vec2;
        static distance(a: vec2, b: vec2): number;
        static squaredDistance(a: vec2, b: vec2): number;
        static length(a: vec2): number;
        static squaredLength(a: vec2): number;
        static negate(out: vec2, a: vec2): vec2;
        static inverse(out: vec2, a: vec2): vec2;
        static normalize(out: vec2, a: vec2): vec2;
        static dot(a: vec2, b: vec2): number;
        static cross(out: Float32Array, a: vec2, b: vec2): Float32Array;
        static lerp(out: vec2, a: vec2, b: vec2, t: number): vec2;
        static random(out: vec2, scale?: number): vec2;
        static transformMat2(out: vec2, a: vec2, m: mat2): vec2;
        static transformMat2d(out: vec2, a: vec2, m: mat2d): vec2;
        static transformMat3(out: vec2, a: vec2, m: mat3): vec2;
        static transformMat4(out: vec2, a: vec2, m: mat4): vec2;
    }
}
declare module "glm/vec3"{
    // https://glmatrix.net/docs/module-vec3.html

    import {mat3} from "glm/mat3";
    import {mat4} from "glm/mat4";
    import {quat} from "glm/quat";

    class vec3 extends Float32Array{
        static create(): vec3;
        static clone(a: vec3): vec3;
        static copy(out: vec3, a: vec3): vec3;
        static fromValues(x: number, y: number, z: number): vec3;
        static set(out: vec3, x: number, y: number, z: number): vec3;
        static add(out: vec3, a: vec3, b: vec3): vec3;
        static subtract(out: vec3, a: vec3, b: vec3): vec3;
        static multiply(out: vec3, a: vec3, b: vec3): vec3;
        static divide(out: vec3, a: vec3, b: vec3): vec3;
        static ceil(out: vec3, a: vec3): vec3;
        static floor(out: vec3, a: vec3): vec3;
        static min(out: vec3, a: vec3, b: vec3): vec3;
        static max(out: vec3, a: vec3, b: vec3): vec3;
        static round(out: vec3, a: vec3): vec3;
        static scale(out: vec3, a: vec3, b: number): vec3;
        static scaleAndAdd(out: vec3, a: vec3, b: vec3, scale: number): vec3;
        static distance(a: vec3, b: vec3): number;
        static squaredDistance(a: vec3, b: vec3): number;
        static length(a: vec3): number;
        static squaredLength(a: vec3): number;
        static negate(out: vec3, a: vec3): vec3;
        static inverse(out: vec3, a: vec3): vec3;
        static normalize(out: vec3, a: vec3): vec3;
        static dot(a: vec3, b: vec3): number;
        static cross(out: vec3, a: vec3, b: vec3): vec3;
        static lerp(out: vec3, a: vec3, b: vec3, t: number): vec3;
        static slerp(out: vec3, a: vec3, b: vec3, t: number): vec3;
        static hermite(out: vec3, a: vec3, b: vec3, c: vec3, d: vec3, t: number): vec3;
        static bezier(out: vec3, a: vec3, b: vec3, c: vec3, d: vec3, t: number): vec3;
        static random(out: vec3, scale?: number): vec3;
        static transformMat4(out: vec3, a: vec3, m: mat4): vec3;
        static transformMat3(out: vec3, a: vec3, m: mat3): vec3;
        static transformQuat(out: vec3, a: vec3, q:quat):vec3;
    }
}
declare module "glm/vec4"{
    // https://glmatrix.net/docs/module-vec4.html

    import {mat4} from "glm/mat4";

    class vec4 extends Float32Array{
        static create(): vec4;
        static clone(a: vec4): vec4;
        static copy(out: vec4, a: vec4): vec4;
        static fromValues(x: number, y: number, z: number, w: number): vec4;
        static set(out: vec4, x: number, y: number, z: number, w: number): vec4;
        static add(out: vec4, a: vec4, b: vec4): vec4;
        static subtract(out: vec4, a: vec4, b: vec4): vec4;
        static multiply(out: vec4, a: vec4, b: vec4): vec4;
        static divide(out: vec4, a: vec4, b: vec4): vec4;
        static ceil(out: vec4, a: vec4): vec4;
        static floor(out: vec4, a: vec4): vec4;
        static min(out: vec4, a: vec4, b: vec4): vec4;
        static max(out: vec4, a: vec4, b: vec4): vec4;
        static round(out: vec4, a: vec4): vec4;
        static scale(out: vec4, a: vec4, b: number): vec4;
        static scaleAndAdd(out: vec4, a: vec4, b: vec4, scale: number): vec4;
        static distance(a: vec4, b: vec4): number;
        static squaredDistance(a: vec4, b: vec4): number;
        static length(a: vec4): number;
        static squaredLength(a: vec4): number;
        static negate(out: vec4, a: vec4): vec4;
        static inverse(out: vec4, a: vec4): vec4;
        static normalize(out: vec4, a: vec4): vec4;
        static dot(a: vec4, b: vec4): number;
        static cross(out: vec4, u: vec4, v: vec4, w: vec4): vec4;
        static lerp(out: vec4, a: vec4, b: vec4, t: number): vec4;
        static random(out: vec4, scale?: number): vec4;
        static transformMat4(out: vec4, a: vec4, m: mat4): vec4;
    }
}

declare module "glm"{
    // https://glmatrix.net/docs

    export * as glMatrix from "glm/common";

    export { mat2 } from "glm/mat2";
    export { mat3 } from "glm/mat3";
    export { mat4 } from "glm/mat4";

    export { mat2d } from "glm/mat2d";

    export { vec2 } from "glm/vec2";
    export { vec3 } from "glm/vec3";
    export { vec4 } from "glm/vec4";

    export { quat } from "glm/quat";
    export { quat2 } from "glm/quat2";
}
