"use strict";

import {vec3} from "gl-matrix";

class MtlTexture{
    constructor(
        public source:string,

        public blendu?:boolean,
        public blendv?:boolean,
        /** boost bump map values (mult by this factor) */
        public boost?:number,
    ){}
};

export class MtlMaterial{
    ambient?:vec3;
    diffuse?:vec3;
    specular?:vec3;
    specularExponent?:number;
    transparency?:number;
    
    illuminationMode?:number;

    map_ambient?:MtlTexture;
    map_diffuse?:MtlTexture;
    map_specular?:MtlTexture;
    map_specularExponent?:MtlTexture;
}

class MtlFile{
    constructor(
        public path:string,
        public materials:{
            [mtlName:string]:MtlMaterial;
        },
    ){}
};

function parseMtl(path:string,s:string):MtlFile{
    const ret:MtlFile={path,materials:{}};

    let lastMaterial=new MtlMaterial();
    const lines=(s
        // ensure whitespace is tabs only
        .replace("\t"," ")
        // remove carriage returns
        .replace("\r","")
        // splice line continuations
        .replace("\\\n","")
        // split into lines
        .split("\n")
    );
    for(const line of lines){
        if(line==null)break;

        const line_segments=line.split(" ").filter(l=>l.length);

        // skip empty line
        if(line_segments.length===0)continue;

        const [directive,...args]=line_segments;

        // skip comment
        if(directive[0]==="#")continue;

        switch(directive){
            case "newmtl":{
                const materialName=args[0];

                lastMaterial=new MtlMaterial();
                ret.materials[materialName]=lastMaterial;

                continue;
            }
            case "Ka":{
                const color:number[]=[];
                for(let i=0;i<3;i++){
                    color.push(parseFloat(args[i]));
                }
                lastMaterial.ambient=vec3.fromValues(color[0],color[1],color[2]);
                continue;
            }
            case "Kd":{
                const color:number[]=[];
                for(let i=0;i<3;i++){
                    color.push(parseFloat(args[i]));
                }
                lastMaterial.diffuse=vec3.fromValues(color[0],color[1],color[2]);
                continue;
            }
            case "Ks":{
                const color:number[]=[];
                for(let i=0;i<3;i++){
                    color.push(parseFloat(args[i]));
                }
                lastMaterial.specular=vec3.fromValues(color[0],color[1],color[2]);
                continue;
            }
            case "Ns":
                lastMaterial.specularExponent=parseFloat(args[0]);
                continue;
            case "d":
                lastMaterial.transparency=1-parseFloat(args[0]);
                continue;
            case "Tr":
                lastMaterial.transparency=parseFloat(args[0]);
                continue;
            case "illum":
                // should be an integer, but may be floatThatIsNotQuiteAnInt (seen in real world data)
                lastMaterial.illuminationMode=Math.round(parseFloat(args[0]));
                continue;
            case "map_Ka":
                // map relative to absolute path
                lastMaterial.map_ambient=new MtlTexture(
                    path.substring(0,path.lastIndexOf("/")+1)+args[0]
                );
                continue;
            case "map_Kd":
                // map relative to absolute path
                lastMaterial.map_diffuse=new MtlTexture(
                    path.substring(0,path.lastIndexOf("/")+1)+args[0]
                );
                continue;
            case "map_Ks":
                // map relative to absolute path
                lastMaterial.map_specular=new MtlTexture(
                    path.substring(0,path.lastIndexOf("/")+1)+args[0]
                );
                continue;
            default:
                throw `unknown mtl directive ${directive}`;
        }
    }
    return ret;
}

/**
 * performance comparison: https://aras-p.info/blog/2022/05/14/comparing-obj-parse-libraries/
 * (this implementation is really slow..)
 */
export class ObjFile{
    constructor(
        public vertexData:Float32Array,
        public indices:Uint32Array,
        public material:MtlMaterial|null,
    ){}
}
export async function parseObj(filepath:string):Promise<ObjFile>{
    const filedata=await fetch(filepath,{}).then(v=>v.text());

    const vertexPositions:number[]=[];
    const vertexUVs:number[][]=[];
    const vertexNormals:number[][]=[];

    let materialFile:MtlFile|null=null;
    let material:MtlMaterial|null=null;

    const vertexData:number[]=[];
    const indices:number[]=[];

    const lines=(filedata
        // ensure whitespace is tabs only
        .replace("\t"," ")
        // remove carriage returns
        .replace("\r","")
        // splice line continuations
        .replace("\\\n","")
        // split into lines
        .split("\n")
    );
    for(const line of lines){
        if(line==null)break;

        const line_segments=line.split(" ").filter(l=>l.length);

        // skip empty line
        if(line_segments.length===0)continue;

        const [directive,...args]=line_segments;

        // skip comment
        if(directive[0]==="#")continue;

        switch(directive){
            case "v":{
                // format: x y z [w=1.0]
                const data=[0,0,0,1];

                for(let i=0;i<Math.min(data.length,args.length);i++){
                    const arg=args[i];

                    const number=parseFloat(arg);
                    data[i]=number;
                }

                vertexPositions.push(...data);

                break;
            }
            case "vt":{
                // format: u [ v=0 [w=0] ]
                const data=[0,0,0];

                for(let i=0;i<Math.min(data.length,args.length);i++){
                    const arg=args[i];

                    const number=parseFloat(arg);
                    data[i]=number;
                }

                vertexUVs.push(data);

                break;
            }
            case "vn":{
                // format: x y z
                const data=[0,0,0];

                for(let i=0;i<Math.min(data.length,args.length);i++){
                    const arg=args[i];

                    const number=parseFloat(arg);
                    data[i]=number;
                }

                vertexNormals.push(data);

                break;
            }
            case "f":{
                // format: v/vt/vn v/vt/vn v/vt/vn [v/vt/vn]
                // (data contains indices into vertexData, which entries are constructed on the fly)
                const data=[0,0,0,0];
                let isQuad=false;

                for(let i=0;i<Math.min(4,args.length);i++){
                    /** data for a single vertex in this face */
                    const faceVertexData=new Uint32Array([0,0,0]);

                    const face_segments=args[i].split("/");
                    for(let s=0;s<face_segments.length;s++){
                        const number=parseInt(face_segments[s]||"0");

                        faceVertexData[s]=number-1;
                    }

                    // .at() does handle negative indices like obj spec
                    // (e.g. -1 returns last element in array)
                    if((faceVertexData[0]*4)>=vertexPositions.length)throw`vertexPositions`;
                    let vertexUV=vertexUVs.at(faceVertexData[1])??[0,0,0];
                    vertexData.push(...[
                        vertexPositions[faceVertexData[0]*4],
                        vertexPositions[faceVertexData[0]*4+1],
                        vertexPositions[faceVertexData[0]*4+2],
                        vertexUV[0],vertexUV[1],
                    ]);

                    data[i]=(vertexData.length/5)-1;
                }

                if(isQuad){
                    throw `isQuad unimplemented`;
                }else{
                    indices.push(data[0],data[1],data[2]);
                }

                break;
            }
            case "mtllib":{
                const filename=args[0];

                const currentFileStem=filepath.substring(0,filepath.lastIndexOf("/")+1);
                const mtllibpath=currentFileStem+filename;

                const mtlFileContents=await fetch(mtllibpath,{}).then(r=>r.text());
                materialFile=parseMtl(mtllibpath,mtlFileContents);
                const defaultMaterial=materialFile.materials[Object.keys(materialFile.materials)[0]];
                if(!defaultMaterial)throw`got mtl file (${mtllibpath}) without materials in it`;
                material=defaultMaterial;

                break;
            }
            case "usemtl":{
                const materialName=args[0];
                if(!materialFile)throw`usemtl without mtllib`;
                const mat=materialFile.materials[materialName];
                if(!mat)throw`did not find material ${materialName} in materialfile ${materialFile.path}`;
                material=mat;

                break;
            }
            case "o":{
                // todo
                break;
            }
            case "g":{
                // todo
                break;
            }
            case "s":{
                // todo
                break;
            }
            default:{
                throw `unknown directive '${directive}'`;
            }
        }
    }

    const vertexDataFloat=new Float32Array(vertexData);
    const indicesUInt=new Uint32Array(indices);

    return new ObjFile(
        vertexDataFloat,
        indicesUInt,
        material,
    );
}