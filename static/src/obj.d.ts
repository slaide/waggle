import {vec3} from "glm";

declare global{
    type ObjMaterialTexture={
        source:string;
        blendu?:boolean;
        blendv?:boolean;
        boost:number;
    };

    type ObjMaterial={
        ambient?:vec3;
        diffuse?:vec3;
        specular?:vec3;
        specularExponent?:number;
        transparency?:number;

        illuminationMode?:number;

        map_ambient?:string;
        map_diffuse?:string;
        map_specular?:string;
        map_specularExponent?:string;
    };

    type ObjMtlFile={
        path:string;
        materials:{
            [mtlName:string]:ObjMaterial|undefined;
        };
    };
}
export {};
