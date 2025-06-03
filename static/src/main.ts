//# allFunctionsCalledOnLoad
"use strict";

import { vec3, quat } from "gl-matrix";

console.log(
    `running in strict mode? ${(function () {
        /// @ts-ignore
        return !this;
    })()}`,
);

import { GL } from "./gl.js";
import { Scene } from "./scene/scene.js";
import { Transform } from "./scene/transform.js";
import { GameObject } from "./scene/gameobject.js";
import { MtlMaterial, parseObj } from "./bits/obj.js";

export async function main() {
    // import wasm like this (instead of top level import!)
    // const {...}=await import("./mod.js");

    const canvas_element_id = "main-canvas";

    const el = document.getElementById(canvas_element_id);
    if (!(el instanceof HTMLCanvasElement)) {
        const error = `element #${canvas_element_id} not found`;
        alert(error);
        throw error;
    }

    const gl = el.getContext("webgl2", {
        depth: true,
        desynchronized: false,
        antialias: false,
        failIfMajorPerformanceCaveat: true,
        powerPreference: "default",
        preserveDrawingBuffer: false,
    });
    if (!gl) {
        const error = `could not create webgl2 context`;
        alert(error);
        throw error;
    }

    // enable depth testing
    gl.enable(GL.DEPTH_TEST);
    gl.depthFunc(GL.LEQUAL);
    // enable face culling
    gl.enable(GL.CULL_FACE);
    gl.cullFace(GL.FRONT);
    gl.frontFace(GL.CW);
    // set clear color
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);

    /** device pixel ration (window.devicePixelRatio) */
    let dpr = 1;
    let canvas_size = {
        width: Math.floor(el.clientWidth * dpr),
        height: Math.floor(el.clientHeight * dpr),
    };

    const scene = await Scene.make(gl, canvas_size);

    window.addEventListener("keydown", (ev) => {
        if (ev.key == "f") {
            console.log("requesting fullscreen");
            el.requestFullscreen();
        }
    });

    const onresize = () => {
        const width = Math.floor(el.clientWidth * dpr);
        const height = Math.floor(el.clientHeight * dpr);

        // update canvas size (actual drawable surface)
        el.width = width;
        el.height = height;
        // update viewport (active drawing area in canvas area)
        gl.viewport(0, 0, width, height);

        // resize canvas/gbuffer
        scene.gbuffer._resize({ width, height });
    };
    onresize();
    window.addEventListener("resize", onresize);

    window.addEventListener("visibilitychange", (_ev) => {
        scene.shouldDraw = !document.hidden;
    });

    for (let i = 0; i < 2; i++) {
        const transform = new Transform();
        transform.position = vec3.fromValues(-1.5 + i * 3, 0, -6);

        const objpath = "./resources/cube.obj";
        const obj = await parseObj(objpath);

        const newobject = await GameObject.make(gl, obj, transform);
        newobject.upload();

        scene.children.push(newobject);
    }

    // setup drawing loop

    // this is used as part of game logic
    let rotation = 0;

    const camera = scene.gbuffer.camera;
    const cameraSpeedFactor = {
        move: 2,
        rotate: 0.8,
    };
    const cameraSpeed = {
        x: 0,
        y: 0,
        z: 0,
        rotx: 0,
        roty: 0,
    };
    window.addEventListener("keydown", (ev) => {
        ev.preventDefault();

        if (ev.key.toLowerCase() == "w") {
            cameraSpeed.z = -cameraSpeedFactor.move;
        }
        if (ev.key.toLowerCase() == "s") {
            cameraSpeed.z = cameraSpeedFactor.move;
        }
        if (ev.key.toLowerCase() == "a") {
            cameraSpeed.x = -cameraSpeedFactor.move;
        }
        if (ev.key.toLowerCase() == "d") {
            cameraSpeed.x = cameraSpeedFactor.move;
        }
        if (ev.key.toLowerCase() == "e") {
            cameraSpeed.y = cameraSpeedFactor.move;
        }
        if (ev.key.toLowerCase() == "q") {
            cameraSpeed.y = -cameraSpeedFactor.move;
        }
        if (ev.key == " ") {
            cameraSpeed.y = cameraSpeedFactor.move;
        }
        if (ev.key == "ArrowRight") {
            cameraSpeed.roty = -cameraSpeedFactor.rotate;
        }
        if (ev.key == "ArrowLeft") {
            cameraSpeed.roty = cameraSpeedFactor.rotate;
        }
        if (ev.key == "ArrowUp") {
            cameraSpeed.rotx = cameraSpeedFactor.rotate;
        }
        if (ev.key == "ArrowDown") {
            cameraSpeed.rotx = -cameraSpeedFactor.rotate;
        }
    });
    window.addEventListener("keyup", (ev) => {
        ev.preventDefault();

        if (ev.key.toLowerCase() == "w") {
            cameraSpeed.z = 0;
        }
        if (ev.key.toLowerCase() == "s") {
            cameraSpeed.z = 0;
        }
        if (ev.key.toLowerCase() == "a") {
            cameraSpeed.x = 0;
        }
        if (ev.key.toLowerCase() == "d") {
            cameraSpeed.x = 0;
        }
        if (ev.key.toLowerCase() == "e") {
            cameraSpeed.y = 0;
        }
        if (ev.key.toLowerCase() == "q") {
            cameraSpeed.y = 0;
        }
        if (ev.key == " ") {
            cameraSpeed.y = 0;
        }
        if (ev.key == "ArrowRight") {
            cameraSpeed.roty = 0;
        }
        if (ev.key == "ArrowLeft") {
            cameraSpeed.roty = 0;
        }
        if (ev.key == "ArrowUp") {
            cameraSpeed.rotx = 0;
        }
        if (ev.key == "ArrowDown") {
            cameraSpeed.rotx = 0;
        }
    });

    const onFrameLogic: (deltatime_ms: number) => void = (
        deltatime_ms: number,
    ) => {
        const xStep = -cameraSpeed.x * deltatime_ms;
        vec3.add(
            camera.position,
            camera.position,
            vec3.multiply(
                vec3.create(),
                camera.right,
                vec3.fromValues(xStep, xStep, xStep),
            ),
        );
        const yStep = cameraSpeed.y * deltatime_ms;
        vec3.add(
            camera.position,
            camera.position,
            vec3.multiply(
                vec3.create(),
                vec3.fromValues(0, 1, 0),
                vec3.fromValues(yStep, yStep, yStep),
            ),
        );
        const zStep = cameraSpeed.z * deltatime_ms;
        vec3.add(
            camera.position,
            camera.position,
            vec3.multiply(
                vec3.create(),
                camera.forward,
                vec3.fromValues(zStep, zStep, zStep),
            ),
        );

        quat.multiply(
            camera.rotation,
            quat.setAxisAngle(
                quat.create(),
                /// @ts-ignore
                camera.right,
                -cameraSpeed.rotx * deltatime_ms,
            ),
            camera.rotation,
        );
        quat.multiply(
            camera.rotation,
            quat.setAxisAngle(
                quat.create(),
                [0, 1, 0],
                cameraSpeed.roty * deltatime_ms,
            ),
            camera.rotation,
        );

        // set up camera
        const projectionMatrix = camera.projectionMatrix;

        for (const object of scene.children) {
            const { programInfo } = object;

            // animate quad rotation
            rotation += 40 * deltatime_ms;
            object.transform.rotation = quat.fromEuler(
                quat.create(),
                rotation * 0.3,
                rotation * 0.7,
                rotation,
            );

            gl.useProgram(programInfo.program);
            // ensure transform is up to date
            gl.uniformMatrix4fv(
                programInfo.uniformLocations.uModelMatrix,
                false,
                object.transform.matrix,
            );
            // ensure transform is up to date
            gl.uniformMatrix4fv(
                programInfo.uniformLocations.uViewMatrix,
                false,
                camera.viewMatrix,
            );
            // also update camera projection matrix (TODO optimize to share this between draws)
            gl.uniformMatrix4fv(
                programInfo.uniformLocations.uProjectionMatrix,
                false,
                projectionMatrix,
            );
        }
    };

    scene.gbuffer.updatePointlights([
        {
            position: vec3.fromValues(0, 1, -6),
            radius: 50,
            color: vec3.fromValues(1.0, 1.0, 1.0),
            intensity: 0.3,
        },
    ]);

    const frametimes = new Float32Array(30);
    let framenum = 0;
    const original_title = document.title;

    let last_frametime = performance.now();
    const draw = () => {
        const deltatime_ms = (performance.now() - last_frametime) * 1e-3;
        last_frametime = performance.now();

        frametimes[framenum++ % frametimes.length] = deltatime_ms;

        const average_fps =
            frametimes.length / frametimes.reduce((o, n) => o + n, 0);
        const min_fps = 1 / frametimes.reduce((o, n) => Math.max(o, n));
        const max_fps = 1 / frametimes.reduce((o, n) => Math.min(o, n));
        document.title = `${original_title} | fps ${average_fps.toFixed(1)} (${min_fps.toFixed(1)}, ${max_fps.toFixed(1)})`;

        // run logic step
        onFrameLogic(deltatime_ms);

        // bind gbuffer
        gl.bindFramebuffer(GL.DRAW_FRAMEBUFFER, scene.gbuffer.gbuffer);
        gl.drawBuffers(scene.gbuffer.layerAttachments);

        // clear gbuffer to draw over
        gl.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);

        // draw scene into gbuffer
        scene.draw();

        // process gbuffer + lights into screen output
        scene.gbuffer.draw();
    };

    const drawLoop = () => {
        draw();
        requestAnimationFrame(drawLoop);
    };
    drawLoop();
}

type GamepadTouch = {
    touchId: number;
    surfaceId: number;
    position: DOMPointReadOnly;
    surfaceDimensions?: DOMRectReadOnly;
};
/** https://developer.mozilla.org/en-US/docs/Web/API/GamepadPose */
type GamepadPose = {
    hasOrientation: boolean;
    hasPosition: boolean;
    position: Float32Array;
    linearVelocity: Float32Array;
    linearAcceleration: Float32Array;
    orientation: Float32Array;
    angularVelocity: number;
    angularAcceleration: number;
};
/** https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/hand */
type GamepadHand = "" | "right" | "left";
type Gamepad2 = Gamepad & {
    hand?: GamepadHand;
    pose?: GamepadPose;
    hapticActuators?: GamepadHapticActuator[];
    touches?: GamepadTouch[];
};
window.addEventListener("gamepadconnected", async (e) => {
    const gpid = e.gamepad.index;

    const gp: Gamepad2 | null = navigator.getGamepads()[gpid];
    if (gp == null) throw `gamepad not found (this is a bug)`;
    console.log(
        `Gamepad connected at index ${gp.index}: ` +
            `'${gp.id}'. ${gp.buttons.length} buttons, ` +
            `${gp.axes.length} axes.`,
    );
    await gp.vibrationActuator?.reset();

    // proposal: https://w3c.github.io/gamepad/extensions.html
    //
    // gp.hapticActuators}`);
    //

    setInterval(async () => {
        const gp: Gamepad2 | null = navigator.getGamepads()[gpid];
        if (gp == null) throw `gamepad not found (this is a bug)`;

        gp.buttons.forEach((v, i) => {
            console.log(
                `button ${i} pressed ${v.pressed} touched ${v.touched} value ${v.value.toFixed(3)}`,
            );
        });
        gp.axes.forEach((v, i) => {
            console.log(`axis ${i} value ${v.toFixed(3)}`);
        });
        gp.touches?.forEach((v, i) => {
            console.log(`touch ${i} value ${v}`);
        });

        // standard mapping: https://w3c.github.io/gamepad/#remapping
        const lefttriggervalue = Math.min(gp.buttons[6].value, 1);
        const righttriggervalue = Math.min(gp.buttons[7].value, 1);
        const leftbumper = Math.min(gp.buttons[4].value, 1);
        const rightbumper = Math.min(gp.buttons[5].value, 1);
        const buttonbottom = gp.buttons[0];
        const buttonright = gp.buttons[1];
        const buttonleft = gp.buttons[2];
        const buttontop = gp.buttons[3];
        if (leftbumper) {
            await gp.vibrationActuator?.playEffect(
                /*type does not have an effect in practice*/
                "trigger-rumble",
                {
                    duration: 150 /*ms*/,
                    rightTrigger: 1,
                },
            );
            await gp.vibrationActuator?.playEffect(
                /*type does not have an effect in practice*/
                "trigger-rumble",
                {
                    startDelay: 200,
                    duration: 150 /*ms*/,
                    rightTrigger: 1,
                },
            );
        }
        console.log(
            `buttons bottom ${buttonbottom.touched} right ${buttonright.touched} left ${buttonleft.touched} top ${buttontop.touched}`,
        );
        console.log(`bumpers left ${leftbumper} right ${rightbumper}`);
        console.log(
            `lefttriggervalue ${lefttriggervalue} righttriggervalue ${righttriggervalue}`,
        );
        if (0)
            gp.vibrationActuator?.playEffect(
                /*type does not have an effect in practice*/
                "trigger-rumble",
                {
                    // magnitudes must be in range [0;1]

                    duration: 1000 /*ms*/,
                    // strong and weak are differnt kinds of vibration frequencies (?)
                    strongMagnitude: rightbumper,
                    weakMagnitude: leftbumper,
                    // for those controllers that support it (trigger vibration)
                    // (these are switched, at least with an xbox controller on macos)
                    leftTrigger: righttriggervalue,
                    rightTrigger: lefttriggervalue,
                },
            );
    }, 50);
});

// prevent default on dragenter and dragover to stop the browser from handling
// the drop event by e.g. opening the media in a new tab natively.
window.addEventListener("dragenter", (ev) => ev.preventDefault());
window.addEventListener("dragover", (ev) => ev.preventDefault());
window.addEventListener("drop", async (ev) => {
    ev.preventDefault();

    console.log(`dropped in:`, ev);
    const files = ev.dataTransfer?.files;
    if (files != null && files.length > 0) {
        console.log(`dropped in file with ${files[0].size} bytes`);
    } else {
        console.log(`no files found`);
    }
});
