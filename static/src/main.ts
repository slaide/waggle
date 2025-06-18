import { vec3, quat } from "gl-matrix";
import { GBuffer } from "./gbuffer";
import { GL } from "./gl";
import { loadScene, SceneDescription } from "./scene/scene";
// Import these to ensure GameObject types are registered
import "./scene/model";
import "./scene/light";
import "./scene/textmesh";

export async function main() {
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

    // Add text to the scene
    const { TextRenderer, createTextModelFromRenderer } = await import("./scene/textmesh");
    const textRenderer = await TextRenderer.fromFile("./static/resources/Raleway-Regular.ttf");
    
    // Create wireframe text
    const wireframeText = await createTextModelFromRenderer(gl, textRenderer, "Outlined", {
        fontSize: 1.0,
        lineWidth: 1.0,
        color: vec3.fromValues(0.0, 1.0, 0.0), // Green
        position: vec3.fromValues(-3, 0, -1),
        splineSteps: 8,
        filled: false
    });
    scene.objects.push(wireframeText);
    
    // Create filled text
    const filledText = await createTextModelFromRenderer(gl, textRenderer, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", {
        fontSize: 1.0,
        lineWidth: 1.0,
        color: vec3.fromValues(1.0, 0.0, 0.0), // Red
        position: vec3.fromValues(3, 0, -0.5),
        splineSteps: 8,
        filled: true
    });
    scene.objects.push(filledText);
    
    // Create lowercase text
    const filledText2 = await createTextModelFromRenderer(gl, textRenderer, "abcdefghijklmnopqrstuvwxyz,.-;:_'*!@#$%^&()[]{}öäüß", {
        fontSize: 0.8,
        lineWidth: 1.0,
        color: vec3.fromValues(0.0, 0.0, 1.0), // Blue
        position: vec3.fromValues(1, -2, -0.5),
        splineSteps: 8,
        filled: true
    });
    scene.objects.push(filledText2);

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
                if (selectedObject && dynamicWireframe) {
                    selectedObject.removeChild(dynamicWireframe);
                    dynamicWireframe = null;
                }
                
                // Select new object
                selectedObject = clickedObject;
                console.log(`Selected: ${selectedObject.name || selectedObject.id} (ID: ${objectId})`);
                
                // Create dynamic wireframe bounding box for mesh objects
                if (selectedObject.type === "mesh" && selectedObject.createBoundingBoxWireframe) {
                    try {
                        dynamicWireframe = await selectedObject.createBoundingBoxWireframe();
                        selectedObject.addChild(dynamicWireframe);
                    } catch (error) {
                        console.warn("Failed to create wireframe bounding box:", error);
                    }
                }
            }
        } else {
            // Clicked on empty space - deselect
            if (selectedObject && dynamicWireframe) {
                selectedObject.removeChild(dynamicWireframe);
                dynamicWireframe = null;
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

    let isDrawing = true;
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

        if (ev.key.toLowerCase() == "w") cameraSpeed.z = -cameraSpeedFactor.move;
        if (ev.key.toLowerCase() == "s") cameraSpeed.z = cameraSpeedFactor.move;
        if (ev.key.toLowerCase() == "a") cameraSpeed.x = -cameraSpeedFactor.move;
        if (ev.key.toLowerCase() == "d") cameraSpeed.x = cameraSpeedFactor.move;
        if (ev.key.toLowerCase() == "e") cameraSpeed.y = cameraSpeedFactor.move;
        if (ev.key.toLowerCase() == "q") cameraSpeed.y = -cameraSpeedFactor.move;
        if (ev.key == " ") cameraSpeed.y = cameraSpeedFactor.move;
        if (ev.key == "ArrowRight") cameraSpeed.roty = -cameraSpeedFactor.rotate;
        if (ev.key == "ArrowLeft") cameraSpeed.roty = cameraSpeedFactor.rotate;
        if (ev.key == "ArrowUp") cameraSpeed.rotx = cameraSpeedFactor.rotate;
        if (ev.key == "ArrowDown") cameraSpeed.rotx = -cameraSpeedFactor.rotate;
    });
    
    window.addEventListener("keyup", (ev) => {
        ev.preventDefault();

        if (ev.key.toLowerCase() == "w") cameraSpeed.z = 0;
        if (ev.key.toLowerCase() == "s") cameraSpeed.z = 0;
        if (ev.key.toLowerCase() == "a") cameraSpeed.x = 0;
        if (ev.key.toLowerCase() == "d") cameraSpeed.x = 0;
        if (ev.key.toLowerCase() == "e") cameraSpeed.y = 0;
        if (ev.key.toLowerCase() == "q") cameraSpeed.y = 0;
        if (ev.key == " ") cameraSpeed.y = 0;
        if (ev.key == "ArrowRight") cameraSpeed.roty = 0;
        if (ev.key == "ArrowLeft") cameraSpeed.roty = 0;
        if (ev.key == "ArrowUp") cameraSpeed.rotx = 0;
        if (ev.key == "ArrowDown") cameraSpeed.rotx = 0;
    });

    const onFrameLogic = (deltatime_ms: number) => {
        // Camera movement
        const xStep = -cameraSpeed.x * deltatime_ms;
        vec3.add(camera.position, camera.position, vec3.multiply(vec3.create(), camera.right, vec3.fromValues(xStep, xStep, xStep)));
        
        const yStep = cameraSpeed.y * deltatime_ms;
        vec3.add(camera.position, camera.position, vec3.multiply(vec3.create(), vec3.fromValues(0, 1, 0), vec3.fromValues(yStep, yStep, yStep)));
        
        const zStep = cameraSpeed.z * deltatime_ms;
        vec3.add(camera.position, camera.position, vec3.multiply(vec3.create(), camera.forward, vec3.fromValues(zStep, zStep, zStep)));

        // Camera rotation
        quat.multiply(camera.rotation, quat.setAxisAngle(quat.create(), camera.right, -cameraSpeed.rotx * deltatime_ms), camera.rotation);
        quat.multiply(camera.rotation, quat.setAxisAngle(quat.create(), [0, 1, 0], cameraSpeed.roty * deltatime_ms), camera.rotation);

        const projectionMatrix = camera.projectionMatrix;

        for (const object of scene.objects) {
            if (!object.programInfo) continue;

            // Animate bunny objects
            if (object.name && object.name.toLowerCase().includes("bunny")) {
                rotation += 40 * deltatime_ms;
                object.transform.rotation = quat.fromEuler(quat.create(), rotation * 0.3, rotation * 0.7, rotation);
            }

            // Set up uniforms for mesh objects
            if (object.type === "mesh") {
                const lightData = {
                    pointLights: scene.objects
                        .filter(obj => obj.type === "point_light")
                        .map(light => {
                            const pointLight = light as any;
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
                            const dirLight = light as any;
                            return {
                                direction: new Float32Array(dirLight.direction || [0, -1, 0]),
                                color: new Float32Array(dirLight.color || [1, 1, 1]),
                                intensity: dirLight.intensity || 1.0
                            };
                        })
                };

                (object as any).setUniforms(camera.viewMatrix, projectionMatrix, lightData);
            } else {
                // Fallback for non-mesh objects
                gl.useProgram(object.programInfo.program);
                gl.uniformMatrix4fv(object.programInfo.uniformLocations.uModelMatrix, false, object.transform.matrix);
                gl.uniformMatrix4fv(object.programInfo.uniformLocations.uViewMatrix, false, camera.viewMatrix);
                gl.uniformMatrix4fv(object.programInfo.uniformLocations.uProjectionMatrix, false, projectionMatrix);
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

        const average_fps = frametimes.length / frametimes.reduce((o, n) => o + n, 0);
        const min_fps = 1 / frametimes.reduce((o, n) => Math.max(o, n));
        const max_fps = 1 / frametimes.reduce((o, n) => Math.min(o, n));
        document.title = `${original_title} | fps ${average_fps.toFixed(1)} (${min_fps.toFixed(1)}, ${max_fps.toFixed(1)})`;

        onFrameLogic(deltatime_ms);

        // Deferred rendering pass
        gbuffer.clearAndBind();
        scene.draw(camera.viewMatrix as Float32Array, camera.projectionMatrix as Float32Array);
        gbuffer.draw();

        // Forward rendering pass
        gl.bindFramebuffer(GL.READ_FRAMEBUFFER, gbuffer.gbuffer);
        gl.bindFramebuffer(GL.DRAW_FRAMEBUFFER, null);
        gl.blitFramebuffer(0, 0, canvas_size.width, canvas_size.height, 0, 0, canvas_size.width, canvas_size.height, GL.DEPTH_BUFFER_BIT, GL.NEAREST);

        gl.bindFramebuffer(GL.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas_size.width, canvas_size.height);
        
        gl.enable(GL.BLEND);
        gl.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
        gl.depthFunc(GL.LEQUAL);
        gl.depthMask(false);

        const lightUBOs = {
            pointLightUBO: gbuffer.pointLightUBO,
            directionalLightUBO: gbuffer.directionalLightUBO
        };
        scene.drawForward(camera.viewMatrix as Float32Array, camera.projectionMatrix as Float32Array, lightUBOs, new Float32Array(camera.position));

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
