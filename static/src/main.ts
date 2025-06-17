import { vec3, quat } from "gl-matrix";
import { GBuffer } from "./gbuffer";
import { GL } from "./gl";
import { loadScene, SceneDescription } from "./scene/scene";
// Import these to ensure GameObject types are registered
import "./scene/model";
import "./scene/light";

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
    const dpr = 1;
    const canvas_size = {
        width: Math.floor(el.clientWidth * dpr),
        height: Math.floor(el.clientHeight * dpr),
    };

    const gbuffer = await GBuffer.make(gl, canvas_size);
    
    // Load scene from description
    const sceneDescription: SceneDescription = await fetch('./static/resources/current_scene.json').then(r => r.json());
    const scene = await loadScene(gl, sceneDescription);

    // Ensure all transforms are properly calculated after loading
    scene.updateAllTransforms();

    // Collect and update lights
    const { pointLights, directionalLights } = scene.collectLights();
    gbuffer.updatePointlights(pointLights);
    gbuffer.updateDirectionalLights(directionalLights);

    window.addEventListener("keydown", (ev) => {
        if (ev.key == "f") {
            el.requestFullscreen();
        }
    });

    // Object picking on mouse click
    let selectedObject: any = null;
    let dynamicWireframe: any = null;
    
    el.addEventListener("click", async (ev) => {
        const rect = el.getBoundingClientRect();
        const x = (ev.clientX - rect.left) * dpr;
        const y = (ev.clientY - rect.top) * dpr;
        
        const objectId = gbuffer.pickObject(x, y, scene, camera);
        
        if (objectId > 0) {
            const clickedObject = scene.findObjectById(objectId);
            if (clickedObject) {
                // Deselect previous
                if (selectedObject) {
                    console.log(`Deselected: ${selectedObject.name || selectedObject.id}`);
                    
                    // Remove dynamic wireframe from previous selection
                    if (dynamicWireframe) {
                        selectedObject.removeChild(dynamicWireframe);
                        dynamicWireframe = null;
                    }
                }
                
                // Select new object
                selectedObject = clickedObject;
                console.log(`Selected object: ${selectedObject.name || selectedObject.id} (ID: ${objectId})`);
                console.log(`Object type: ${selectedObject.type}`);
                console.log(`Object position:`, selectedObject.transform.position);
                
                // Create dynamic wireframe bounding box for mesh objects
                if (selectedObject.type === "mesh" && selectedObject.createBoundingBoxWireframe) {
                    try {
                        dynamicWireframe = await selectedObject.createBoundingBoxWireframe();
                        selectedObject.addChild(dynamicWireframe);
                        console.log("Created dynamic wireframe bounding box for selected object");
                    } catch (error) {
                        console.warn("Failed to create wireframe bounding box:", error);
                    }
                }
            }
        } else {
            // Clicked on empty space - deselect
            if (selectedObject) {
                console.log(`Deselected: ${selectedObject.name || selectedObject.id}`);
                
                // Remove dynamic wireframe
                if (dynamicWireframe) {
                    selectedObject.removeChild(dynamicWireframe);
                    dynamicWireframe = null;
                }
                
                selectedObject = null;
            }
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
        gbuffer._resize({ width, height });
    };
    onresize();
    window.addEventListener("resize", onresize);

    let isDrawing = true;  // Add flag to control drawing loop

    window.addEventListener("visibilitychange", () => {
        isDrawing = !document.hidden;
    });

    // setup drawing loop
    let rotation = 0;

    const camera = gbuffer.camera;
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

        for (const object of scene.objects) {
            // Skip objects without program info (like lights)
            if (!object.programInfo) continue;

            // animate quad rotation
            rotation += 40 * deltatime_ms;
            object.transform.rotation = quat.fromEuler(
                quat.create(),
                rotation * 0.3,
                rotation * 0.7,
                rotation,
            );

            // Set up all uniforms including lighting for Model objects
            if (object.type === "mesh") {
                // Collect light data from scene
                const lightData = {
                    pointLights: scene.objects
                        .filter(obj => obj.type === "point_light")
                        .map(light => {
                            const pointLight = light as any; // Cast to access light-specific properties
                            return {
                                position: new Float32Array(light.transform.position),
                                color: new Float32Array(pointLight.color || [1, 1, 1]),
                                intensity: pointLight.intensity || 1.0,
                                radius: pointLight.radius || 10.0
                            };
                        }),
                    directionalLights: scene.objects
                        .filter(obj => obj.type === "directional_light")
                        .map(light => {
                            const dirLight = light as any; // Cast to access light-specific properties
                            return {
                                direction: new Float32Array(dirLight.direction || [0, -1, 0]),
                                color: new Float32Array(dirLight.color || [1, 1, 1]),
                                intensity: dirLight.intensity || 1.0
                            };
                        })
                };

                // Call setUniforms which handles all uniform setup including lighting
                (object as any).setUniforms(camera.viewMatrix, projectionMatrix, lightData);
            } else {
                // Fallback for non-mesh objects - just set transformation matrices
                gl.useProgram(object.programInfo.program);
                gl.uniformMatrix4fv(
                    object.programInfo.uniformLocations.uModelMatrix,
                    false,
                    object.transform.matrix,
                );
                gl.uniformMatrix4fv(
                    object.programInfo.uniformLocations.uViewMatrix,
                    false,
                    camera.viewMatrix,
                );
                gl.uniformMatrix4fv(
                    object.programInfo.uniformLocations.uProjectionMatrix,
                    false,
                    projectionMatrix,
                );
            }
        }
    };

    const frametimes = new Float32Array(32);
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

        // bind gbuffer and clear it properly (including integer buffers)
        gbuffer.clearAndBind();

        // draw scene into gbuffer (deferred rendering pass - only non-forward objects)
        scene.draw(camera.viewMatrix as Float32Array, camera.projectionMatrix as Float32Array);

        // process gbuffer + lights into screen output (deferred lighting pass)
        gbuffer.draw();

        // Forward rendering pass - draw forward rendered objects directly to screen after deferred lighting
        gl.bindFramebuffer(GL.FRAMEBUFFER, null);
        
        // Enable depth testing for forward pass and read from depth buffer written during deferred pass
        // We need to copy depth from gbuffer to default framebuffer first
        gl.bindFramebuffer(GL.READ_FRAMEBUFFER, gbuffer.gbuffer);
        gl.bindFramebuffer(GL.DRAW_FRAMEBUFFER, null);
        gl.blitFramebuffer(
            0, 0, canvas_size.width, canvas_size.height,
            0, 0, canvas_size.width, canvas_size.height,
            GL.DEPTH_BUFFER_BIT,
            GL.NEAREST
        );

        // Now bind default framebuffer for forward rendering
        gl.bindFramebuffer(GL.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas_size.width, canvas_size.height);
        
        // Enable blending for forward rendering (to blend with deferred result)
        gl.enable(GL.BLEND);
        gl.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
        
        // Keep depth testing enabled but set to LEQUAL to use existing depth
        gl.depthFunc(GL.LEQUAL);
        gl.depthMask(false); // Don't write to depth buffer in forward pass

        // Draw forward rendered objects
        const lightUBOs = {
            pointLightUBO: gbuffer.pointLightUBO,
            directionalLightUBO: gbuffer.directionalLightUBO
        };
        scene.drawForward(
            camera.viewMatrix as Float32Array, 
            camera.projectionMatrix as Float32Array,
            lightUBOs,
            new Float32Array(camera.position)
        );

        // Restore rendering state
        gl.disable(GL.BLEND);
        gl.depthFunc(GL.LEQUAL);
        gl.depthMask(true);
    };

    const drawLoop = () => {
        if (isDrawing) {
            draw();
        }
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
