declare module "glm/common"{
    // https://glmatrix.net/docs/common.js.html#line27

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
    class mat2 extends Float32Array{
        static create():mat2;
        static clone(a:mat2):mat2;
        static copy(out:mat2,a:mat2):void;
        static identity(out:mat2):mat2;
    }
}
declare module "glm/mat3"{
    class mat3 extends Float32Array{
        static create():mat3;
        static clone(a:mat3):mat3;
        static copy(out:mat3,a:mat3):void;
        static identity(out:mat3):mat3;
    }
}
declare module "glm/mat4"{
    class mat4 extends Float32Array{
        static create():mat4;
        static clone(a:mat4):mat4;
        static copy(out:mat4,a:mat4):void;
        static identity(out:mat4):mat4;

        static perspective(out:mat4,fov_radians:number,aspect:number,znear:number,zfar:number):void;
        static translate(out:mat4,src:mat4,distance:number[]):void;
        static rotate(out:mat4,src:mat4,angle:number,axis:number[]):void;
    }
}

declare module "glm"{
    export { toRadian } from "glm/common";
    export { mat4 } from "glm/mat4";
}
