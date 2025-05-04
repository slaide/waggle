declare module "glm/common"{
    // https://glmatrix.net/docs/common.js.html

    /**
     * Convert Degree To Radian
     *
     * @param a Angle in Degrees
     */
    function toRadian(a:number):number;
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
}

declare module "glm/mat2"{
    // https://glmatrix.net/docs/module-mat2.html

    class mat2 extends Float32Array{
        static create():mat2;
        static clone(a:mat2):mat2;
        static copy(out:mat2,a:mat2):void;
        static identity(out:mat2):mat2;
    }
}
declare module "glm/mat2d"{
    // https://glmatrix.net/docs/module-mat2d.html

    class mat2d extends Float32Array{
        static create():mat2d;
        static clone(a:mat2d):mat2d;
        static copy(out:mat2d,a:mat2d):void;
        static identity(out:mat2d):mat2d;

    }
}
declare module "glm/mat3"{
    // https://glmatrix.net/docs/module-mat3.html

    class mat3 extends Float32Array{
        static create():mat3;
        static clone(a:mat3):mat3;
        static copy(out:mat3,a:mat3):void;
        static identity(out:mat3):mat3;
    }
}
declare module "glm/mat4"{
    // https://glmatrix.net/docs/module-mat4.html
    import {quat} from "glm/quat";
    import {vec3} from "glm/vec3";

    class mat4 extends Float32Array{
        static create():mat4;
        static clone(a:mat4):mat4;
        static copy(out:mat4,a:mat4):void;
        static identity(out:mat4):mat4;

        static perspective(out:mat4,fov_radians:number,aspect:number,znear:number,zfar:number):void;
        static translate(out:mat4,src:mat4,distance:number[]):void;
        static rotate(out:mat4,src:mat4,angle:number,axis:number[]):void;
        
        /**
         * Creates a matrix from a quaternion rotation, vector translation and vector scale
         * This is equivalent to (but much faster than):
         *
         *     mat4.identity(dest);
         *     mat4.translate(dest, dest, vec);
         *     let quatMat = mat4.create();
         *     mat4.fromQuat(quatMat, quat);
         *     mat4.multiply(dest, dest, quatMat);
         *     mat4.scale(dest, dest, scale)
         *
         * @param {mat4} out mat4 receiving operation result
         * @param {quat} q Rotation quaternion
         * @param {ReadonlyVec3} v Translation vector
         * @param {ReadonlyVec3} s Scaling vector
         * @returns {mat4} out
         */
        static fromRotationTranslationScale(out:mat4, q:quat, v:vec3, s:vec3):mat4;
    }
}
declare module "glm/quat"{
    // https://glmatrix.net/docs/module-quat.html

    class quat extends Float32Array{
        static create():quat;
        static clone(a:quat):quat;
        static copy(out:quat,a:quat):void;
        static identity(out:quat):quat;

        /**
         * Creates a quaternion from the given euler angle x, y, z using the provided intrinsic order for the conversion.
         *
         * @param {quat} out the receiving quaternion
         * @param {Number} x Angle to rotate around X axis in degrees.
         * @param {Number} y Angle to rotate around Y axis in degrees.
         * @param {Number} z Angle to rotate around Z axis in degrees.
         * @param {'xyz'|'xzy'|'yxz'|'yzx'|'zxy'|'zyx'} [order=glMatrix.ANGLE_ORDER] Intrinsic order for conversion, default is zyx.
         * @returns {quat} out
         * @function
         */
        static fromEuler(
            out:quat, 
            x:number, y:number, z:number, 
            // default value -> optional argument (from type perspective)
            order?:'xyz'|'xzy'|'yxz'|'yzx'|'zxy'|'zyx'
        ):quat;
    }
}
declare module "glm/quat2"{
    // https://glmatrix.net/docs/module-quat2.html

    class quat2 extends Float32Array{
        static create():quat2;
        static clone(a:quat2):quat2;
        static copy(out:quat2,a:quat2):void;
        static identity(out:quat2):quat2;

    }
}
declare module "glm/vec2"{
    // https://glmatrix.net/docs/module-mat2d.html

    class vec2 extends Float32Array{
        static create():vec2;
        static clone(a:vec2):vec2;
        static copy(out:vec2,a:vec2):void;
        static identity(out:vec2):vec2;

        /**
         * Creates a new vec2 initialized with the given values
         *
         * @param {Number} x X component
         * @param {Number} y Y component
         * @returns {vec2} a new vector
         */
        static fromValues(x:number, y:number):vec2;

        static add(out:vec2,a:vec2,b:vec2):vec2;
    }
}
declare module "glm/vec3"{
    // https://glmatrix.net/docs/module-mat2d.html

    class vec3 extends Float32Array{
        static create():vec3;
        static clone(a:vec3):vec3;
        static copy(out:vec3,a:vec3):void;
        static identity(out:vec3):vec3;

        /**
         * Creates a new vec2 initialized with the given values
         *
         * @param {Number} x X component
         * @param {Number} y Y component
         * @returns {vec2} a new vector
         */
        static fromValues(x:number, y:number, z:number):vec3;

        static add(out:vec3,a:vec3,b:vec3):vec3;
    }
}
declare module "glm/vec4"{
    // https://glmatrix.net/docs/module-mat2d.html

    class vec4 extends Float32Array{
        static create():vec4;
        static clone(a:vec4):vec4;
        static copy(out:vec4,a:vec4):void;
        static identity(out:vec4):vec4;

        /**
         * Creates a new vec2 initialized with the given values
         *
         * @param {Number} x X component
         * @param {Number} y Y component
         * @returns {vec2} a new vector
         */
        static fromValues(x:number, y:number, z:number, w:number):vec4;

        static add(out:vec4,a:vec4,b:vec4):vec4;
    }
}

declare module "glm"{
    // https://glmatrix.net/docs

    export { toRadian } from "glm/common";

    export { mat4 } from "glm/mat4";
    export { mat3 } from "glm/mat3";
    export { mat2 } from "glm/mat2";

    export { mat2d } from "glm/mat2d";

    export { vec4 } from "glm/vec4";
    export { vec3 } from "glm/vec3";
    export { vec2 } from "glm/vec2";

    export { quat } from "glm/quat";
    export { quat2 } from "glm/quat2";
}
