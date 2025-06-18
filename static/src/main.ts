import { vec3, quat } from "gl-matrix";
import { GBuffer } from "./gbuffer";
import { GL } from "./gl";
import { loadScene, SceneDescription } from "./scene/scene";
import { OrthographicCamera } from "./scene/camera";
// Import these to ensure GameObject types are registered
import "./scene/model";
import "./scene/light";
import "./scene/textmesh";

/**
 * Manager class for dynamic UI text that only updates mesh when content changes
 */
class UITextManager {
    private gl: any;
    private textRenderer: any;
    private textModel: any;
    private config: any;
    private currentText: string;
    private uiObjects: any[];
    private modelIndex: number;
    
    constructor(gl: any, textRenderer: any, textModel: any, config: any, initialText: string, uiObjects: any[], modelIndex: number) {
        this.gl = gl;
        this.textRenderer = textRenderer;
        this.textModel = textModel;
        this.config = config;
        this.currentText = initialText;
        this.uiObjects = uiObjects;
        this.modelIndex = modelIndex;
    }
    
    /**
     * Update the text content - only regenerates mesh if text actually changed
     */
    async setText(newText: string): Promise<void> {
        if (newText === this.currentText) {
            return; // No change, do nothing
        }
        
        this.currentText = newText;
        await this.recreateModel();
    }
    
    /**
     * Get the current text content
     */
    getText(): string {
        return this.currentText;
    }
    
    /**
     * Get the current text model
     */
    getModel(): any {
        return this.textModel;
    }
    
    /**
     * Force update the mesh (rarely needed)
     */
    async forceUpdate(): Promise<void> {
        await this.recreateModel();
    }
    
    /**
     * Recreate the entire text model with new content
     */
    private async recreateModel(): Promise<void> {
        try {
            // Import the function we need
            const { createTextModel } = await import("./scene/textmesh");
            
            // Store the old model's transform
            const oldPosition = this.textModel.transform.position;
            
            // Generate the text mesh first
            const textMesh = this.textRenderer.generateTextMesh(this.currentText, this.config);
            
            // Create a completely new text model
            const fontConfig = this.textRenderer.fontConfig;
            const newTextModel = await createTextModel(this.gl, textMesh, this.config, this.currentText, fontConfig.filled, fontConfig.lineWidth);
            
            // Restore the position
            newTextModel.transform.position = oldPosition;
            
            // Replace the old model in the uiObjects array
            this.uiObjects[this.modelIndex] = newTextModel;
            this.textModel = newTextModel;
        } catch (error) {
            console.error("Failed to recreate text model:", error);
        }
    }
}

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
    const dpr = window.devicePixelRatio;
    const canvas_size = {
        width: Math.floor(el.clientWidth * dpr),
        height: Math.floor(el.clientHeight * dpr),
    };

    const gbuffer = await GBuffer.make(gl, canvas_size);
    
    // Create UI camera for orthographic UI rendering
    const uiCamera = new OrthographicCamera();
    uiCamera.updateBounds(canvas_size.width, canvas_size.height);
    uiCamera.znear = -10;
    uiCamera.zfar = 10;
    
    // Load scene from description
    const sceneDescription: SceneDescription = await fetch('./static/resources/current_scene.json').then(r => r.json());
    const scene = await loadScene(gl, sceneDescription);

    // Add text demonstrations to the 3D scene
    const { TextRenderer, createTextModel } = await import("./scene/textmesh");
    
    // Create outline (wireframe) text renderer for 3D world space
    const outlineTextRenderer = await TextRenderer.fromFile(
        "./static/resources/Raleway-Regular.ttf",
        8,        // smoothness - 8 steps for smooth curves
        false,    // filled - false for wireframe outline
        0.8,      // fontSize - medium size for 3D world
        1.0       // lineWidth - 1.0 (browser limitation)
    );
    
    // Create wireframe text in 3D space - left side
    const wireframeConfig = {
        color: vec3.fromValues(0.0, 1.0, 0.0), // Green outlines
        position: vec3.fromValues(-4, 1, -1)
    };
    const wireframeMesh = outlineTextRenderer.generateTextMesh("Outline Text", wireframeConfig);
    const wireframeText = await createTextModel(gl, wireframeMesh, wireframeConfig, "Outline Text", outlineTextRenderer.fontConfig.filled, outlineTextRenderer.fontConfig.lineWidth);
    scene.objects.push(wireframeText);
    
    // Create filled text renderer for 3D world space  
    const filledTextRenderer = await TextRenderer.fromFile(
        "./static/resources/Raleway-Regular.ttf",
        8,        // smoothness - 8 steps for smooth curves
        true,     // filled - true for solid triangles
        0.8,      // fontSize - medium size for 3D world
        1.0       // lineWidth - not used for filled text
    );
    
    // Create filled text in 3D space - right side
    const filledConfig = {
        color: vec3.fromValues(1.0, 0.2, 0.2), // Red filled triangles  
        position: vec3.fromValues(1, 1, -1)
    };
    const filledMesh = filledTextRenderer.generateTextMesh("Filled Text", filledConfig);
    const filledText = await createTextModel(gl, filledMesh, filledConfig, "Filled Text", filledTextRenderer.fontConfig.filled, filledTextRenderer.fontConfig.lineWidth);
    scene.objects.push(filledText);
    
    // Add alphabet demonstration - filled text below
    const alphabetConfig = {
        color: vec3.fromValues(0.8, 0.4, 1.0), // Purple
        position: vec3.fromValues(-4, -0.5, -1)
    };
    const alphabetMesh = filledTextRenderer.generateTextMesh("ABCDEFGHIJKLM", alphabetConfig);
    const alphabetText = await createTextModel(gl, alphabetMesh, alphabetConfig, "ABCDEFGHIJKLM", filledTextRenderer.fontConfig.filled, filledTextRenderer.fontConfig.lineWidth);
    scene.objects.push(alphabetText);
    
    const numbersConfig = {
        color: vec3.fromValues(1.0, 0.8, 0.2), // Orange
        position: vec3.fromValues(-2, -1.5, -1)
    };
    const numbersMesh = filledTextRenderer.generateTextMesh("0123456789", numbersConfig);
    const numbersText = await createTextModel(gl, numbersMesh, numbersConfig, "0123456789", filledTextRenderer.fontConfig.filled, filledTextRenderer.fontConfig.lineWidth);
    scene.objects.push(numbersText);
    
    // Create UI objects array for orthographic UI rendering
    const uiObjects: any[] = [];
    
    // Create UI text renderer - filled for better readability
    const baseFontSize = Math.min(canvas_size.width, canvas_size.height) / 30; // Responsive base size
    const uiTextRenderer = await TextRenderer.fromFile(
        "./static/resources/Raleway-Regular.ttf",
        8,               // smoothness - 8 steps for smooth UI text
        true,            // filled - true for solid, readable UI text
        baseFontSize,    // fontSize - responsive to screen size
        1.0              // lineWidth - not used for filled text
    );
    
    // Create UI title
    const uiTitleConfig = {
        color: vec3.fromValues(1.0, 1.0, 0.0), // Yellow
        position: vec3.fromValues(0, 0, 0) // Start at origin, will position via transform
    };
    const uiTitleMesh = uiTextRenderer.generateTextMesh("3D Text Demo - UI Layer", uiTitleConfig);
    const uiTitle = await createTextModel(gl, uiTitleMesh, uiTitleConfig, "3D Text Demo - UI Layer", uiTextRenderer.fontConfig.filled, uiTextRenderer.fontConfig.lineWidth);
    // Position in top-left corner with margin
    uiTitle.transform.position = vec3.fromValues(-canvas_size.width/2 + 20, canvas_size.height/2 - baseFontSize * 2, 0);
    uiObjects.push(uiTitle);
    
    // Store config for UI info text so we can update it dynamically
    const uiInfoConfig = {
        color: vec3.fromValues(0.8, 0.8, 0.8), // Light gray
        position: vec3.fromValues(0, 0, 0) // Start at origin, will position via transform
    };
    
    const initialUIText = "FPS: 0.0 | Selected: None";
    const uiInfoMesh = uiTextRenderer.generateTextMesh(initialUIText, uiInfoConfig);
    const uiInfo = await createTextModel(gl, uiInfoMesh, uiInfoConfig, initialUIText, uiTextRenderer.fontConfig.filled, uiTextRenderer.fontConfig.lineWidth);
    // Position below title
    uiInfo.transform.position = vec3.fromValues(-canvas_size.width/2 + 20, canvas_size.height/2 - baseFontSize * 4, 0);
    uiObjects.push(uiInfo);
    
    // Create UI text manager for dynamic updates
    const uiInfoManager = new UITextManager(gl, uiTextRenderer, uiInfo, uiInfoConfig, initialUIText, uiObjects, 1); // Index 1 in uiObjects array
    
    // Create smaller UI renderer for help text
    const smallUITextRenderer = await TextRenderer.fromFile(
        "./static/resources/Raleway-Regular.ttf",
        6,                    // smoothness - slightly less for small text
        true,                 // filled - true for readable small text
        baseFontSize * 0.8,   // fontSize - smaller for help text
        1.0                   // lineWidth - not used for filled text
    );
    
    const uiControlsConfig = {
        color: vec3.fromValues(0.6, 0.6, 0.6), // Gray
        position: vec3.fromValues(0, 0, 0) // Start at origin, will position via transform
    };
    const uiControlsMesh = smallUITextRenderer.generateTextMesh("Controls: WASD+QE=Move, Arrows=Look, F=Fullscreen", uiControlsConfig);
    const uiControls = await createTextModel(gl, uiControlsMesh, uiControlsConfig, "Controls: WASD+QE=Move, Arrows=Look, F=Fullscreen", smallUITextRenderer.fontConfig.filled, smallUITextRenderer.fontConfig.lineWidth);
    // Position in bottom-left corner with margin
    uiControls.transform.position = vec3.fromValues(-canvas_size.width/2 + 20, -canvas_size.height/2 + baseFontSize * 2, 0);
    uiObjects.push(uiControls);
    
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
                
                // Note: UI text will be updated by the main draw loop with current FPS
                
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
                
                // Note: UI text will be updated by the main draw loop with current FPS
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
        
        // Update UI camera bounds
        uiCamera.updateBounds(width, height);
        
        // Update UI object positions based on new canvas size
        if (uiObjects.length > 0) {
            const newBaseFontSize = Math.min(width, height) / 30;
            uiObjects[0].transform.position = vec3.fromValues(-width/2 + 20, height/2 - newBaseFontSize * 2, 0);
            uiObjects[1].transform.position = vec3.fromValues(-width/2 + 20, height/2 - newBaseFontSize * 4, 0);
            uiObjects[2].transform.position = vec3.fromValues(-width/2 + 20, -height/2 + newBaseFontSize * 2, 0);
        }
        
        // Update canvas_size reference
        canvas_size.width = width;
        canvas_size.height = height;
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

    const onFrameLogic = (deltatime_ms: number, fps: number) => {
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
        
        // Update UI object transforms to ensure they're calculated
        for (const uiObject of uiObjects) {
            uiObject.transform.updateWorldMatrix();
        }
    };

    const frametimes = new Float32Array(32);
    let framenum = 0;
    let lastUIUpdateFrame = 0;

    let last_frametime = performance.now();
    const draw = () => {
        const deltatime_ms = (performance.now() - last_frametime) * 1e-3;
        last_frametime = performance.now();

        frametimes[framenum++ % frametimes.length] = deltatime_ms;

        const average_fps = frametimes.length / frametimes.reduce((o, n) => o + n, 0);

        // Update UI text periodically (not every frame) - let the manager handle change detection
        if (framenum - lastUIUpdateFrame >= 30) { // Update every ~0.5 seconds at 60fps
            const selectedName = selectedObject ? (selectedObject.name || `ID: ${selectedObject.id}`) : "None";
            const currentUIText = `FPS: ${average_fps.toFixed(1)} | Selected: ${selectedName}`; // Use toFixed(1) for XX.Y format
            
            uiInfoManager.setText(currentUIText).catch(error => console.warn("Failed to update UI text:", error)); // Manager will only update mesh if text changed
            lastUIUpdateFrame = framenum;
        }

        onFrameLogic(deltatime_ms, average_fps);

        // 1. Deferred rendering pass (3D scene to G-buffer)
        gbuffer.clearAndBind();
        scene.draw(camera.viewMatrix as Float32Array, camera.projectionMatrix as Float32Array);
        gbuffer.draw();

        // 2. Forward rendering pass (transparent/alpha objects)
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

        // 3. UI rendering pass (orthographic, screen space)
        // Disable depth testing for UI elements so they always render on top
        gl.disable(GL.DEPTH_TEST);
        gl.enable(GL.BLEND);
        gl.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
        
        // Render UI objects with orthographic camera
        for (const uiObject of uiObjects) {
            if (!uiObject.shouldDraw) continue;
            
            // Use the text object's built-in rendering method
            if (uiObject.forwardRendered && uiObject.drawForward) {
                // For forward-rendered objects (like text), use drawForward
                uiObject.drawForward(
                    uiObject.transform.worldMatrix as Float32Array,
                    uiCamera.viewMatrix as Float32Array,
                    uiCamera.projectionMatrix as Float32Array,
                    lightUBOs,
                    new Float32Array([0, 0, 0]) // UI camera position (not relevant for UI)
                );
            } else {
                // Fallback: use drawWithMatrix for other objects
                uiObject.drawWithMatrix(
                    uiObject.transform.worldMatrix as Float32Array,
                    uiCamera.viewMatrix as Float32Array,
                    uiCamera.projectionMatrix as Float32Array
                );
            }
        }
        
        // Re-enable depth testing for next frame
        gl.enable(GL.DEPTH_TEST);
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
