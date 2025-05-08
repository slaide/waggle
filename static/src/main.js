//# allFunctionsCalledOnLoad
"use strict";

import { vec3 } from "glm";

/// @ts-ignore
console.log(`running in strict mode? ${(function(){return !this})()}`)

import {Transform,Scene,GameObject,makeBuffers,makeProgram} from "./scene.js";
import { uint8ArrayToString } from "./bits.js";

class ByteReader{
    /**
     * 
     * @param {Uint8Array} bytes 
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
        return this.bytes.subarray(this.i,this.i+n);
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
     * @param {(c:number)=>boolean} f returns true if `c`should be skipped
     */
    skipWhile(f){
        while(!this.empty && f(this.c))this.i++;
    }
    /**
     * 
     * @param {(c:number)=>boolean} f returns true if `c`should be included
     */
    takeWhile(f){
        let i=this.i;
        while(!this.empty && f(this.bytes[i]))i++;
        return this.bytes.subarray(this.i,i);
    }
}

/**
 * 
 * @param {number} c 
 * @returns 
 */
function isWhitespace(c){
    return " \t".indexOf(String.fromCharCode(c))>=0;
}
/**
 * 
 * @param {string} filepath 
 * @returns {Promise<{vertexData:Float32Array,indices:Uint16Array}>}
 */
async function parseObj(filepath){
    const filedata=await fetch(filepath,{}).then(v=>v.arrayBuffer());
    const bytes=new ByteReader(new Uint8Array(filedata));

    const charHash="#".charCodeAt(0);
    const charNewline="\n".charCodeAt(0);
    const charSpace=" ".charCodeAt(0);
    const charSlash="/".charCodeAt(0);

    /** @type {Float32Array[]} */
    const vertexPositions=[];
    /** @type {Float32Array[]} */
    const vertexUVs=[];
    /** @type {number[]} */
    const vertexNormals=[];

    /** @type {number[]} */
    const vertexData=[];
    /** @type {number[]} */
    const indices=[];
    while(!bytes.empty){
        bytes.skipWhile(isWhitespace);

        // skip empty line
        if(bytes.c==charNewline){
            bytes.skipN(1);
            continue;
        }

        // skip comment
        if(bytes.c==charHash){
            // skip over rest of current line
            bytes.skipWhile(c=>c!=charNewline);
            bytes.skipN(1);
            continue;
        }

        // check for directives:
        // v: vertex position
        // vn: vertex normal
        // vt: vertex texture coordinate
        const directive=bytes.takeWhile(c=>c!=charSpace);
        const directiveString=String.fromCharCode(...directive);
        if(directiveString=="v"){
            // format: x y z [w=1.0]
            const data=new Float32Array([0,0,0,1]);

            // skip over directive
            bytes.skipN(directiveString.length);

            for(let i=0;i<data.length;i++){
                // skip over whitespace
                bytes.skipWhile(isWhitespace);

                const number_charBytes=bytes.takeWhile(c=>"0123456789.e+-".indexOf(String.fromCharCode(c))>=0);
                if(number_charBytes.length==0){
                    if(i<3){
                        throw `number_charBytes has length zero`;
                    }
                    // w is optional
                    break;
                }
                const number_string=String.fromCharCode(...number_charBytes);
                const number=parseFloat(number_string);
                bytes.skipN(number_charBytes.length);

                data[i]=number;
            }

            bytes.skipWhile(c=>c!=charNewline);
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

                const number_charBytes=bytes.takeWhile(c=>"0123456789.e+-".indexOf(String.fromCharCode(c))>=0);
                if(number_charBytes.length==0){
                    if(i<1){
                        throw `number_charBytes has length zero`;
                    }
                    // v w are optional
                    break;
                }
                const number_string=String.fromCharCode(...number_charBytes);
                const number=parseFloat(number_string);
                bytes.skipN(number_charBytes.length);

                data[i]=number;
            }

            bytes.skipWhile(c=>c!=charNewline);
            bytes.skipN(1);

            vertexUVs.push(data);

            continue;
        }else if(directiveString=="f"){
            // format: v/vt/vn v/vt/vn v/vt/vn [v/vt/vn]
            // (data contains indices into vertexData, which entries are constructed on the fly)
            const data=new Uint16Array([0,0,0,0]);
            let isQuad=false;

            // skip over directive
            bytes.skipN(directiveString.length);

            for(let i=0;i<data.length;i++){
                // skip over whitespace
                bytes.skipWhile(isWhitespace);

                if(bytes.c==charNewline){
                    if(i==3)
                        break;
                    throw `laksjdfölkjasdf`;
                }

                /** data for a single vertex in this face */
                const faceVertexData=new Uint16Array([0,0,0]);

                for(let s=0;s<3;){
                    const number_charBytes=bytes.takeWhile(c=>"-0123456789".indexOf(String.fromCharCode(c))>=0);
                    if(number_charBytes.length==0){
                        if(bytes.c==charSlash){
                            bytes.skipN(1);
                            s++;
                            continue;
                        }
                        break;
                    }

                    const number_string=String.fromCharCode(...number_charBytes);
                    const number=parseInt(number_string);
                    bytes.skipN(number_charBytes.length);

                    faceVertexData[s]=number;
                }

                // .at() does handle negative indices like obj spec
                // (e.g. -1 returns last element in array)
                const vertexPos=vertexPositions.at(faceVertexData[0]);
                if(!vertexPos)throw`vertexPositions`;
                const vertexUV=vertexUVs.at(faceVertexData[1]);
                if(!vertexUV)throw`vertexUV`;
                vertexData.push(...[
                    vertexPos[0],vertexPos[1],vertexPos[2],
                    vertexUV[0],vertexUV[1],
                ]);

                data[i]=(vertexData.length/5)-1;
            }

            bytes.skipWhile(c=>c!=charNewline);
            bytes.skipN(1);

            if(isQuad){
                throw `isQuad unimplemented`;
            }else{
                indices.push(...data.subarray(0,3));
            }

            continue;
        }else{
            console.log(`unknown directive '${directiveString}'`);
            break;
        }
    }

    return {
        vertexData:new Float32Array(vertexData),
        indices:new Uint16Array(indices),
    };
}

export async function main(){
    const canvas_element_id="main-canvas";

    const el=document.getElementById(canvas_element_id);
    if(!(el instanceof HTMLCanvasElement)){
        const error=`element #${canvas_element_id} not found`;
        alert(error);throw error;
    }

    const gl=el.getContext("webgl2",{
        depth: true,
        desynchronized: false,
        antialias: false,
        failIfMajorPerformanceCaveat: true,
        powerPreference: 'default',
        preserveDrawingBuffer: false,
    });
    if(!gl){
        const error=`could not create webgl2 context`;
        alert(error);throw error;
    }

    const scene=new Scene(gl);

    window.addEventListener("keydown",ev=>{
        if(ev.key=="f"){
            console.log("requesting fullscreen")
            el.requestFullscreen()
        }
    })

    const onresize=()=>{
        const dpr=1;//window.devicePixelRatio;
        const {width,height}={
            width:Math.floor(el.clientWidth*dpr),
            height:Math.floor(el.clientHeight*dpr),
        };

        // update canvas size (actual drawable surface)
        el.width=width;
        el.height=height;
        // update viewport (active drawing area in canvas area)
        gl.viewport(0,0,width,height);

        scene.camera.aspect=width/height;
    };
    onresize();
    window.addEventListener("resize",onresize);

    window.addEventListener("visibilitychange",ev=>{
        scene.shouldDraw=!document.hidden;
    });

    for(let i=0;i<2;i++){
        const transform=new Transform();
        transform.position=vec3.fromValues(-1.5+i*3,0,-6);

        const {vertexData,indices}=await parseObj("./resources/cube.obj");
        const newobject=new GameObject(
            gl,
            await makeBuffers(gl,vertexData,indices),
            indices.length/3,
            await makeProgram(gl),
            transform,
        );
        scene.objects.push(newobject);
    }

    scene.draw();
}

/**
 * @typedef {{
 *   touchId:number,
 *   surfaceId:number,
 *   position: DOMPointReadOnly,
 *   surfaceDimensions?:DOMRectReadOnly,
 * }} GamepadTouch
 * */
/**
 * @typedef {{
 *   hasOrientation:boolean,
 *   hasPosition:boolean,
 *   position:Float32Array,
 *   linearVelocity:Float32Array,
 *   linearAcceleration:Float32Array,
 *   orientation:Float32Array,
 *   angularVelocity:number,
 *   angularAcceleration:number,
 * }} GamepadPose
 * https://developer.mozilla.org/en-US/docs/Web/API/GamepadPose
 * */
/**
 * @typedef {""|"right"|"left"} GamepadHand
 * https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/hand
 * */
/**
 * @typedef {{
 *   hand?:GamepadHand,
 *   pose?:GamepadPose,
 *   hapticActuators?:GamepadHapticActuator[],
 *   touches?:GamepadTouch[],
 * }} Gamepad2
 * */
window.addEventListener("gamepadconnected",async (e)=>{
    const gpid=e.gamepad.index;

    /** @type {(Gamepad&Gamepad2)|null} */
    const gp=navigator.getGamepads()[gpid];
    if(gp==null)throw`gamepad not found (this is a bug)`;
    console.log(
        `Gamepad connected at index ${gp.index}: `
        + `'${gp.id}'. ${gp.buttons.length} buttons, `
        + `${gp.axes.length} axes.`
    );
    await gp.vibrationActuator?.reset();

    // proposal: https://w3c.github.io/gamepad/extensions.html
    console.log(`hand: ${gp.hand}`);
    console.log(`hapticActuators: ${gp.hapticActuators}`);
    console.log(`pose: ${gp.pose}`);

    setInterval(async ()=>{
        /** @type {(Gamepad&Gamepad2)|null} */
        const gp=navigator.getGamepads()[gpid];
        if(gp==null)throw`gamepad not found (this is a bug)`;

        gp.buttons.forEach((v,i)=>{
            console.log(`button ${i} pressed ${v.pressed} touched ${v.touched} value ${v.value.toFixed(3)}`)
        })
        gp.axes.forEach((v,i)=>{
            console.log(`axis ${i} value ${v.toFixed(3)}`)
        })
        gp.touches?.forEach((v,i)=>{
            console.log(`touch ${i} value ${v}`)
        })

        // standard mapping: https://w3c.github.io/gamepad/#remapping
        const lefttriggervalue=Math.min(gp.buttons[6].value,1)
        const righttriggervalue=Math.min(gp.buttons[7].value,1)
        const leftbumper=Math.min(gp.buttons[4].value,1)
        const rightbumper=Math.min(gp.buttons[5].value,1)
        const buttonbottom=gp.buttons[0]
        const buttonright=gp.buttons[1]
        const buttonleft=gp.buttons[2]
        const buttontop=gp.buttons[3]
        if(leftbumper){
            await gp.vibrationActuator?.playEffect(
                /*type does not have an effect in practice*/
                "trigger-rumble",
                {
                    duration:150/*ms*/,
                    rightTrigger:1,
                }
            )
            await gp.vibrationActuator?.playEffect(
                /*type does not have an effect in practice*/
                "trigger-rumble",
                {
                    startDelay:200,
                    duration:150/*ms*/,
                    rightTrigger:1,
                }
            );
        }
        console.log(`buttons bottom ${buttonbottom.touched} right ${buttonright.touched} left ${buttonleft.touched} top ${buttontop.touched}`)
        console.log(`bumpers left ${leftbumper} right ${rightbumper}`)
        console.log(`lefttriggervalue ${lefttriggervalue} righttriggervalue ${righttriggervalue}`)
        if(0)gp.vibrationActuator?.playEffect(
            /*type does not have an effect in practice*/
            "trigger-rumble",
            {
                // magnitudes must be in range [0;1]

                duration:1000/*ms*/,
                // strong and weak are differnt kinds of vibration frequencies (?)
                strongMagnitude:rightbumper,
                weakMagnitude:leftbumper,
                // for those controllers that support it (trigger vibration)
                // (these are switched, at least with an xbox controller on macos)
                leftTrigger:righttriggervalue,
                rightTrigger:lefttriggervalue,
            }
        );
    },50)
})

// prevent default on dragenter and dragover to stop the browser from handling
// the drop event by e.g. opening the media in a new tab natively.
window.addEventListener("dragenter",ev=>ev.preventDefault())
window.addEventListener("dragover",ev=>ev.preventDefault())
window.addEventListener("drop",async ev=>{
    ev.preventDefault()

    console.log(`dropped in:`,ev);
    const files=ev.dataTransfer?.files;
    if(files!=null && files.length>0){
        console.log(`dropped in file with ${files[0].size} bytes`);
    }else{
        console.log(`no files found`);
    }
})