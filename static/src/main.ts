//# allFunctionsCalledOnLoad
"use strict";

import { vec3 } from "gl-matrix";

/// @ts-ignore
console.log(`running in strict mode? ${(function(){return !this})()}`)

import {Transform,Scene,GameObject,makeBuffers,makeProgram} from "./scene.js";
import {parseObj} from "./obj.js";

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

        const starttime=performance.now();
        const objpath="./resources/cube.obj";
        const {vertexData,indices,material}=await parseObj(objpath);
        console.log(`parsed ${objpath} in ${(performance.now()-starttime).toFixed(2)}ms`);

        const diffuse_map_source=material?.map_diffuse?.source??"";
        const newobject=new GameObject(
            gl,
            await makeBuffers(gl,diffuse_map_source,vertexData,indices),
            indices.length/3,
            await makeProgram(gl),
            transform,
        );
        scene.objects.push(newobject);
    }

    scene.draw();
}

type GamepadTouch={
  touchId:number,
  surfaceId:number,
  position: DOMPointReadOnly,
  surfaceDimensions?:DOMRectReadOnly,
};
/** https://developer.mozilla.org/en-US/docs/Web/API/GamepadPose */
type GamepadPose={
  hasOrientation:boolean,
  hasPosition:boolean,
  position:Float32Array,
  linearVelocity:Float32Array,
  linearAcceleration:Float32Array,
  orientation:Float32Array,
  angularVelocity:number,
  angularAcceleration:number,
};
/** https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/hand */
type GamepadHand=""|"right"|"left";
type Gamepad2=Gamepad&{
  hand?:GamepadHand,
  pose?:GamepadPose,
  hapticActuators?:GamepadHapticActuator[],
  touches?:GamepadTouch[],
};
window.addEventListener("gamepadconnected",async (e)=>{
    const gpid=e.gamepad.index;

    const gp:Gamepad2|null=navigator.getGamepads()[gpid];
    if(gp==null)throw`gamepad not found (this is a bug)`;
    console.log(
        `Gamepad connected at index ${gp.index}: `
        + `'${gp.id}'. ${gp.buttons.length} buttons, `
        + `${gp.axes.length} axes.`
    );
    await gp.vibrationActuator?.reset();

    // proposal: https://w3c.github.io/gamepad/extensions.html
    // 
    // gp.hapticActuators}`);
    // 

    setInterval(async ()=>{
        const gp:Gamepad2|null=navigator.getGamepads()[gpid];
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