"use strict";

import {vec3} from "gl-matrix";

class Reader{
    bytes:string;
    i:number;

    /**
     * 
     * @param bytes 
     */
    constructor(bytes:string){
        this.bytes=bytes;
        this.i=0;
    }

    get c():string{
        return this.bytes[this.i];
    }

    /** get next byte */
    next():string{
        return this.bytes[this.i++];
    }

    /**
     * get next `n` bytes
     * @param n 
     * @returns 
     */
    getN(n:number):string{
        return this.bytes.substring(this.i,this.i+n);
    }
    /**
     * 
     * @param n 
     */
    skipN(n:number):void{
        this.i+=n;
    }

    /** returns true if `i` points past the current contents */
    get empty():boolean{
        return this.bytes.length<=this.i;
    }

    /**
     * 
     * @param f returns true if `c`should be skipped
     */
    skipWhile(f:(c:string)=>boolean):void{
        while(!this.empty && f(this.c))this.i++;
    }
    /**
     * 
     * @param f returns true if `c`should be skipped
     */
    skipUntil(f:(c:string)=>boolean):void{
        while(!this.empty && !f(this.c))this.i++;
    }
    /**
     * 
     * @param f returns true if `c`should be included
     */
    takeWhile(f:(c:string)=>boolean):string{
        let i=this.i;
        while(!this.empty && f(this.bytes[i]))i++;
        return this.bytes.substring(this.i,i);
    }
    /**
     * 
     * @param f returns true if `c`should be included
     */
    takeUntil(f:(c:string)=>boolean):string{
        let i=this.i;
        while(!this.empty && !f(this.bytes[i]))i++;
        return this.bytes.substring(this.i,i);
    }

    /**
     * returns number as string (length may be zero)
     */
    parseFloat():string{
        const number=this.takeWhile(c=>"0123456789.e+-".indexOf(c)>=0);
        this.skipN(number.length);
        return number;
    }
    /**
     * returns number as string (length may be zero)
     */
    parseInteger():string{
        const number=this.takeWhile(c=>"0123456789+-".indexOf(c)>=0);
        this.skipN(number.length);
        return number;
    }

    /** skip to, and then over, newline */
    skipOverLineEnd():void{
        this.skipWhile(c=>c!=="\n");
        this.skipN(1);
    }
}

/**
 * 
 * @param c 
 * @returns 
 */
function isWhitespace(c:string):boolean{
    return " \t\r".indexOf(c)!==-1;
}
/**
 * 
 * @param c 
 * @returns 
 */
function isWhitespaceOrNewline(c:string):boolean{
    return " \t\r\n".indexOf(c)!==-1;
}

class ObjMaterialTexture{
    source:string;
    blendu?:boolean;
    blendv?:boolean;
    boost?:number;
    
    constructor(source:string){
        this.source=source;
    }
};

class ObjMaterial{
    ambient?:vec3;
    diffuse?:vec3;
    specular?:vec3;
    specularExponent?:number;
    transparency?:number;
    
    illuminationMode?:number;

    map_ambient?:ObjMaterialTexture;
    map_diffuse?:ObjMaterialTexture;
    map_specular?:ObjMaterialTexture;
    map_specularExponent?:ObjMaterialTexture;
}

class ObjMtlFile{
    path:string;
    materials:{
        [mtlName:string]:ObjMaterial;
    };
    
    constructor(
        path:string,
        materials:{
            [mtlName:string]:ObjMaterial;
        },
    ){
        this.path=path;
        this.materials=materials;
    }
};

function parseMtl(path:string,s:string):ObjMtlFile{
    const ret:ObjMtlFile={path,materials:{}};
    const reader=new Reader(s);

    let lastMaterial=new ObjMaterial();
    while(!reader.empty){
        reader.skipWhile(isWhitespace);

        // skip comment
        if(reader.c=="#"){
            reader.skipOverLineEnd();
            continue;
        }

        // skip empty line
        if(reader.c=="\n"){
            reader.skipN(1);
            continue;
        }

        const directive=reader.takeUntil(isWhitespace);
        reader.skipN(directive.length);
        reader.skipWhile(isWhitespace);

        if(directive=="newmtl"){
            const materialName=reader.takeUntil(isWhitespace);
            reader.skipN(materialName.length);

            lastMaterial=new ObjMaterial();
            ret.materials[materialName]=lastMaterial;

            reader.skipOverLineEnd();
            continue;
        }else if(directive=="Ka"){
            const color:number[]=[];
            for(let i=0;i<3;i++){
                color.push(parseFloat(reader.parseFloat()));
                reader.skipWhile(isWhitespace);
            }
            lastMaterial.ambient=vec3.fromValues(color[0],color[1],color[2]);
            reader.skipOverLineEnd();
            continue;
        }else if(directive=="Kd"){
            const color:number[]=[];
            for(let i=0;i<3;i++){
                color.push(parseFloat(reader.parseFloat()));
                reader.skipWhile(isWhitespace);
            }
            lastMaterial.diffuse=vec3.fromValues(color[0],color[1],color[2]);
            reader.skipOverLineEnd();
            continue;
        }else if(directive=="Ks"){
            const color:number[]=[];
            for(let i=0;i<3;i++){
                color.push(parseFloat(reader.parseFloat()));
                reader.skipWhile(isWhitespace);
            }
            lastMaterial.specular=vec3.fromValues(color[0],color[1],color[2]);
            reader.skipOverLineEnd();
            continue;
        }else if(directive=="Ns"){
            lastMaterial.specularExponent=parseFloat(reader.parseFloat());
            reader.skipOverLineEnd();
            continue;
        }else if(directive=="d"){
            lastMaterial.transparency=1-parseFloat(reader.parseFloat());
            reader.skipOverLineEnd();
            continue;
        }else if(directive=="Tr"){
            lastMaterial.transparency=parseFloat(reader.parseFloat());
            reader.skipOverLineEnd();
            continue;
        }else if(directive=="illum"){
            // should be an integer, but may be floatThatIsNotQuiteAnInt (seen in real world data)
            lastMaterial.illuminationMode=Math.round(parseFloat(reader.parseFloat()));
            reader.skipOverLineEnd();
            continue;
        }else if(directive=="map_Ka"){
            // map relative to absolute path
            lastMaterial.map_ambient=new ObjMaterialTexture(
                path.substring(0,path.lastIndexOf("/")+1)+reader.takeUntil(isWhitespaceOrNewline)
            );
            reader.skipOverLineEnd();
            continue;
        }else if(directive=="map_Kd"){
            // map relative to absolute path
            lastMaterial.map_diffuse=new ObjMaterialTexture(
                path.substring(0,path.lastIndexOf("/")+1)+reader.takeUntil(isWhitespaceOrNewline)
            );
            reader.skipOverLineEnd();
            continue;
        }else if(directive=="map_Ks"){
            // map relative to absolute path
            lastMaterial.map_specular=new ObjMaterialTexture(
                path.substring(0,path.lastIndexOf("/")+1)+reader.takeUntil(isWhitespaceOrNewline)
            );
            reader.skipOverLineEnd();
            continue;
        }else{
            throw `unknown mtl directive ${directive}`;
        }
    }
    return ret;
}

/**
 * performance comparison: https://aras-p.info/blog/2022/05/14/comparing-obj-parse-libraries/
 * (this implementation is really slow..)
 */
class ObjFile{
    vertexData:Float32Array;
    indices:Uint32Array;
    material:ObjMaterial|null;

    /**
     * 
     * @param vertexData 
     * @param indices 
     * @param material
     */
    constructor(
        vertexData:Float32Array,
        indices:Uint32Array,
        material:ObjMaterial|null,
    ){
        this.vertexData=vertexData;
        this.indices=indices;
        this.material=material;
    }
}
/**
 * 
 * @param {string} filepath 
 * @returns {Promise<ObjFile>}
 */
export async function parseObj(filepath:string){
    const filedata=await fetch(filepath,{}).then(v=>v.text());
    /* could be used to preallocate all required memory...
    let numVs=0;
    let numFs=0;
    for(let i=0;i<filedata.length;i++){
        if(filedata[i]=="v"){numVs++}
        else if(filedata[i]=="f"){numFs++}
    }
    console.log(`num v ${numVs} f ${numFs}`)
    */

    const bytes=new Reader(filedata);

    const vertexPositions:number[]=[];
    const vertexUVs:number[][]=[];
    const vertexNormals:number[]=[];

    let materialFile:ObjMtlFile|null=null;
    let material:ObjMaterial|null=null;

    const vertexData:number[]=[];
    const indices:number[]=[];
    while(!bytes.empty){
        bytes.skipWhile(isWhitespace);

        // skip empty line
        if(bytes.c==="\n"){
            bytes.skipN(1);
            continue;
        }

        // skip comment
        if(bytes.c==="#"){
            // skip over rest of current line
            bytes.skipOverLineEnd();
            continue;
        }

        // check for directives:
        // v: vertex position
        // vn: vertex normal
        // vt: vertex texture coordinate
        const directive=bytes.takeUntil(isWhitespace);
        const directiveString=directive;
        if(directiveString==="v"){
            // format: x y z [w=1.0]
            const data=[0,0,0,1];

            // skip over directive
            bytes.skipN(directiveString.length);

            for(let i=0;i<data.length;i++){
                // skip over whitespace
                bytes.skipWhile(isWhitespace);

                const number_string=bytes.parseFloat();
                if(number_string.length==0){
                    if(i<3){
                        throw `number_charBytes has length zero`;
                    }
                    // w is optional
                    break;
                }
                const number=parseFloat(number_string);

                data[i]=number;
            }

            bytes.skipOverLineEnd();

            vertexPositions.push(...data);

            continue;
        }else if(directiveString==="vt"){
            // format: u [ v=0 [w=0] ]
            const data=[0,0,0];

            // skip over directive
            bytes.skipN(directiveString.length);

            for(let i=0;i<data.length;i++){
                // skip over whitespace
                bytes.skipWhile(isWhitespace);

                const number_string=bytes.parseFloat();
                if(number_string.length==0){
                    if(i<1){
                        throw `number_string has length zero`;
                    }
                    // v w are optional
                    break;
                }
                const number=parseFloat(number_string);

                data[i]=number;
            }

            bytes.skipOverLineEnd();

            vertexUVs.push(data);

            continue;
        }else if(directiveString==="f"){
            // format: v/vt/vn v/vt/vn v/vt/vn [v/vt/vn]
            // (data contains indices into vertexData, which entries are constructed on the fly)
            const data=[0,0,0,0];
            let isQuad=false;

            // skip over directive
            bytes.skipN(directiveString.length);

            for(let i=0;i<data.length;i++){
                // skip over whitespace
                bytes.skipWhile(isWhitespace);

                if(bytes.c=="\n"){
                    if(i==3)
                        break;
                    throw `laksjdfölkjasdf`;
                }

                /** data for a single vertex in this face */
                const faceVertexData=new Uint32Array([0,0,0]);

                for(let s=0;s<3;){
                    const number_string=bytes.parseFloat();
                    if(number_string.length==0){
                        if(bytes.c=="/"){
                            bytes.skipN(1);
                            s++;
                            continue;
                        }
                        break;
                    }
                    const number=parseInt(number_string);

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

            bytes.skipOverLineEnd();

            if(isQuad){
                throw `isQuad unimplemented`;
            }else{
                indices.push(data[0],data[1],data[2]);
            }

            continue;
        }else if(directiveString==="mtllib"){
            // skip over directive
            bytes.skipN(directiveString.length);

            bytes.skipWhile(isWhitespace);
            const filename=bytes.takeUntil(isWhitespaceOrNewline);
            bytes.skipN(filename.length);

            const currentFileStem=filepath.substring(0,filepath.lastIndexOf("/")+1);
            const mtllibpath=currentFileStem+filename;

            const mtlFileContents=await fetch(mtllibpath,{}).then(r=>r.text());
            materialFile=parseMtl(mtllibpath,mtlFileContents);
            const defaultMaterial=materialFile.materials[Object.keys(materialFile.materials)[0]];
            if(!defaultMaterial)throw`got mtl file (${mtllibpath}) without materials in it`;
            material=defaultMaterial;

            bytes.skipOverLineEnd();
            continue;
        }else if(directiveString==="usemtl"){
            // skip over directive
            bytes.skipN(directiveString.length);

            const materialName=bytes.takeUntil(isWhitespace);
            if(!materialFile)throw`usemtl without mtllib`;
            const mat=materialFile.materials[materialName];
            if(!mat)throw`did not find material ${materialName} in materialfile ${materialFile.path}`;
            material=mat;

            bytes.skipOverLineEnd();
            continue;
        }else if(directiveString==="o"){
            bytes.skipOverLineEnd();
            continue;
        }else if(directiveString==="g"){
            bytes.skipOverLineEnd();
            continue;
        }else if(directiveString==="s"){
            bytes.skipOverLineEnd();
            continue;
        }else{
            throw `unknown directive '${directiveString}'`;
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