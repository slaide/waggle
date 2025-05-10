"use strict";

import {vec3} from "glm";

class Reader{
    /**
     * 
     * @param {string} bytes 
     */
    constructor(bytes){
        this.bytes=bytes;
        this.i=0;
    }

    get c(){
        return this.bytes[this.i];
    }

    /** get next byte */
    next(){
        return this.bytes[this.i++];
    }

    /**
     * get next `n` bytes
     * @param {number} n 
     * @returns 
     */
    getN(n){
        return this.bytes.substring(this.i,this.i+n);
    }
    /**
     * 
     * @param {number} n 
     */
    skipN(n){
        this.i+=n;
    }

    /** returns true if `i` points past the current contents */
    get empty(){
        return this.bytes.length<=this.i;
    }

    /**
     * 
     * @param {(c:string)=>boolean} f returns true if `c`should be skipped
     */
    skipWhile(f){
        while(!this.empty && f(this.c))this.i++;
    }
    /**
     * 
     * @param {(c:string)=>boolean} f returns true if `c`should be included
     */
    takeWhile(f){
        let i=this.i;
        while(!this.empty && f(this.bytes[i]))i++;
        return this.bytes.substring(this.i,i);
    }

    /**
     * returns number as string (length may be zero)
     */
    parseFloat(){
        const number_charBytes=this.takeWhile(c=>"0123456789.e+-".indexOf(c)>=0);
        this.skipN(number_charBytes.length);
        return number_charBytes;
    }
    /**
     * returns number as string (length may be zero)
     */
    parseInteger(){
        const number_charBytes=this.takeWhile(c=>"0123456789+-".indexOf(c)>=0);
        this.skipN(number_charBytes.length);
        return number_charBytes;
    }

    /** skip to, and then over, newline */
    skipOverLineEnd(){
        this.skipWhile(c=>c!="\n");
        this.skipN(1);
    }
}

/**
 * 
 * @param {string} c 
 * @returns 
 */
function isWhitespace(c){
    return " \t\r".indexOf(c)>=0;
}
/**
 * 
 * @param {string} c 
 * @returns 
 */
function isWhitespaceOrNewline(c){
    return "\n".indexOf(c)>=0 || isWhitespace(c);
}

/**
 * 
 * @param {string} path
 * @param {string} s 
 * @returns {ObjMtlFile}
 */
function parseMtl(path,s){
    /** @type {ObjMtlFile} */
    const ret={path,materials:{}};
    const reader=new Reader(s);

    /** @type {ObjMaterial} */
    let lastMaterial={};
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

        const directive=reader.takeWhile(c=>!isWhitespace(c));
        reader.skipN(directive.length);
        reader.skipWhile(isWhitespace);

        if(directive=="newmtl"){
            const materialName=reader.takeWhile(c=>!isWhitespace(c));
            reader.skipN(materialName.length);

            lastMaterial={};
            ret.materials[materialName]=lastMaterial;

            reader.skipOverLineEnd();
            continue;
        }else if(directive=="Ka"){
            /** @type {number[]} */
            const color=[];
            for(let i=0;i<3;i++){
                color.push(parseFloat(reader.parseFloat()));
                reader.skipWhile(isWhitespace);
            }
            lastMaterial.ambient=vec3.fromValues(color[0],color[1],color[2]);
            reader.skipOverLineEnd();
            continue;
        }else if(directive=="Kd"){
            /** @type {number[]} */
            const color=[];
            for(let i=0;i<3;i++){
                color.push(parseFloat(reader.parseFloat()));
                reader.skipWhile(isWhitespace);
            }
            lastMaterial.diffuse=vec3.fromValues(color[0],color[1],color[2]);
            reader.skipOverLineEnd();
            continue;
        }else if(directive=="Ks"){
            /** @type {number[]} */
            const color=[];
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
            lastMaterial.map_ambient=path.substring(0,path.lastIndexOf("/")+1)+reader.takeWhile(c=>!isWhitespace(c));
            reader.skipOverLineEnd();
            continue;
        }else if(directive=="map_Kd"){
            // map relative to absolute path
            lastMaterial.map_diffuse=path.substring(0,path.lastIndexOf("/")+1)+reader.takeWhile(c=>!isWhitespace(c));
            reader.skipOverLineEnd();
            continue;
        }else if(directive=="map_Ks"){
            // map relative to absolute path
            lastMaterial.map_specular=path.substring(0,path.lastIndexOf("/")+1)+reader.takeWhile(c=>!isWhitespace(c));
            reader.skipOverLineEnd();
            continue;
        }else{
            throw `unknown mtl directive ${directive}`;
        }
    }
    return ret;
}

class ObjFile{
    /**
     * 
     * @param {Float32Array} vertexData 
     * @param {Uint32Array} indices 
     * @param {ObjMaterial?} material
     */
    constructor(
        vertexData,
        indices,
        material,
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
export async function parseObj(filepath){
    const filedata=await fetch(filepath,{}).then(v=>v.text());
    const bytes=new Reader(filedata);

    /** @type {Float32Array[]} */
    const vertexPositions=[];
    /** @type {Float32Array[]} */
    const vertexUVs=[];
    /** @type {number[]} */
    const vertexNormals=[];

    /** @type {ObjMtlFile?} */
    let materialFile=null;
    /** @type {ObjMaterial?} */
    let material=null;

    /** @type {number[]} */
    const vertexData=[];
    /** @type {number[]} */
    const indices=[];
    while(!bytes.empty){
        bytes.skipWhile(isWhitespace);

        // skip empty line
        if(bytes.c=="\n"){
            bytes.skipN(1);
            continue;
        }

        // skip comment
        if(bytes.c=="#"){
            // skip over rest of current line
            bytes.skipWhile(c=>c!="\n");
            bytes.skipN(1);
            continue;
        }

        // check for directives:
        // v: vertex position
        // vn: vertex normal
        // vt: vertex texture coordinate
        const directive=bytes.takeWhile(c=>!isWhitespace(c));
        const directiveString=directive;
        if(directiveString=="v"){
            // format: x y z [w=1.0]
            const data=new Float32Array([0,0,0,1]);

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

            bytes.skipWhile(c=>c!="\n");
            bytes.skipN(1);

            vertexPositions.push(data);

            continue;
        }else if(directiveString=="vt"){
            // format: u [ v=0 [w=0] ]
            const data=new Float32Array([0,0,0]);

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

            bytes.skipWhile(c=>c!="\n");
            bytes.skipN(1);

            vertexUVs.push(data);

            continue;
        }else if(directiveString=="f"){
            // format: v/vt/vn v/vt/vn v/vt/vn [v/vt/vn]
            // (data contains indices into vertexData, which entries are constructed on the fly)
            const data=new Uint32Array([0,0,0,0]);
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
                const vertexPos=vertexPositions.at(faceVertexData[0]);
                if(!vertexPos)throw`vertexPositions`;
                let vertexUV=vertexUVs.at(faceVertexData[1])??new Float32Array([0,0]);
                vertexData.push(...[
                    vertexPos[0],vertexPos[1],vertexPos[2],
                    vertexUV[0],vertexUV[1],
                ]);

                data[i]=(vertexData.length/5)-1;
            }

            bytes.skipWhile(c=>c!="\n");
            bytes.skipN(1);

            if(isQuad){
                throw `isQuad unimplemented`;
            }else{
                indices.push(...data.subarray(0,3));
            }

            continue;
        }else if(directiveString=="mtllib"){
            // skip over directive
            bytes.skipN(directiveString.length);

            bytes.skipWhile(isWhitespace);
            const filename=bytes.takeWhile(c=>!isWhitespaceOrNewline(c));
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
        }else if(directiveString=="usemtl"){
            // skip over directive
            bytes.skipN(directiveString.length);

            const materialName=bytes.takeWhile(c=>!isWhitespace(c));
            if(!materialFile)throw`usemtl without mtllib`;
            const mat=materialFile.materials[materialName];
            if(!mat)throw`did not find material ${materialName} in materialfile ${materialFile.path}`;
            material=mat;

            bytes.skipOverLineEnd();
            continue;
        }else if(directiveString=="o"){
            bytes.skipOverLineEnd();
            continue;
        }else if(directiveString=="g"){
            bytes.skipOverLineEnd();
            continue;
        }else if(directiveString=="s"){
            bytes.skipOverLineEnd();
            continue;
        }else{
            console.log(`unknown directive '${directiveString}'`);
            break;
        }
    }

    return new ObjFile(
        new Float32Array(vertexData),
        new Uint32Array(indices),
        material,
    );
}