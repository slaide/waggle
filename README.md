# Waggle

A modern WebGL2-based rendering framework written in TypeScript, featuring hybrid deferred/forward rendering capabilities, custom file loaders, and comprehensive scene management.

## Overview

Waggle is a 3D rendering engine that combines the efficiency of deferred shading with the flexibility of forward rendering. Built entirely in TypeScript and powered by WebGL2, it provides a complete solution for rendering complex 3D scenes with dynamic lighting, custom materials, and hierarchical object management.

## Technology Stack

### Core Technologies
- **WebGL2**: Modern graphics API for hardware-accelerated rendering
- **TypeScript**: Type-safe development with compile-time error checking
- **Bun**: Lightning-fast JavaScript runtime and build tool
- **gl-matrix**: Optimized linear algebra library for 3D transformations

### Architecture
- **Frontend**: Pure TypeScript/WebGL2 application with zero external runtime dependencies
- **Build System**: Bun-based bundling with minification and source maps
- **Backend**: Minimal Python static file server (via uv) for development
- **File Formats**: Custom loaders for OBJ models and PNG textures

## Key Features

### Hybrid Rendering Pipeline
- **Deferred Rendering**: Efficient G-buffer-based lighting for complex scenes
- **Forward Rendering**: Flexible per-object custom shaders and transparency support
- **Seamless Integration**: Mixed rendering modes in the same scene with proper depth testing

### Advanced Graphics Features
- **Dynamic Lighting**: Point lights and directional lights with real-time shadows
- **Custom Shaders**: Per-object vertex and fragment shader customization
- **Material System**: PBR-ready material properties with texture support
- **Hierarchical Transforms**: Parent-child relationships with automatic matrix propagation

### Custom File Loaders
- **OBJ Parser**: Complete Wavefront OBJ file support with material loading
- **PNG Decoder**: Native TypeScript PNG image decoder with compression support
- **TTF Font Parser**: Full TrueType font parsing with glyph extraction and curve data
- **Scene Serialization**: JSON-based scene format with hot-reloading

### Advanced Text Rendering System
Waggle features a sophisticated text rendering system with full TTF font support, smooth curve interpolation, and robust polygon triangulation for both wireframe and filled text rendering.

#### **Core Features**
- **TTF Font Support**: Complete TrueType font parsing and glyph extraction
- **Dual Rendering Modes**: Both wireframe outlines and filled triangle meshes
- **Smooth Curve Interpolation**: Configurable spline steps for high-quality curves
- **Robust Triangulation**: Advanced ear clipping with hole bridging support
- **Multi-Contour Handling**: Proper support for complex characters (i, d, o, etc.)

#### **Technical Implementation**

**Font Processing Pipeline**
```typescript
// Load font and create text renderer
const textRenderer = await TextRenderer.fromFile("./static/resources/Raleway-Regular.ttf");

// Create wireframe text
const wireframeText = await createTextModelFromRenderer(gl, textRenderer, "Hello", {
    fontSize: 1.0,
    lineWidth: 1.0,
    color: vec3.fromValues(0.0, 1.0, 0.0), // Green
    position: vec3.fromValues(-3, 0, -1),
    splineSteps: 8, // Smooth curve interpolation
    filled: false
});

// Create filled text
const filledText = await createTextModelFromRenderer(gl, textRenderer, "World", {
    fontSize: 1.0,
    color: vec3.fromValues(1.0, 0.0, 0.0), // Red
    position: vec3.fromValues(3, 0, -0.5),
    splineSteps: 8,
    filled: true
});
```

**Triangulation Algorithm**
- **Containment-Based Classification**: Automatically detects outer contours vs holes
- **Hole Bridging**: Connects holes to outer contours using rightmost vertex + visibility testing
- **Robust Ear Clipping**: Enhanced algorithm with centroid validation
- **Multi-Contour Support**: Handles characters like 'i' with separate dot and stem

**Character Processing Flow**
1. **Glyph Extraction**: Parse TTF glyph data and control points
2. **Curve Interpolation**: Generate smooth curves using quadratic Bézier interpolation
3. **Contour Classification**: Identify outer shapes vs holes using geometric containment
4. **Hole Bridging**: Connect holes to main contour with minimal bridge connections
5. **Triangulation**: Robust ear clipping with triangle validation
6. **Mesh Generation**: Convert triangles to WebGL vertex/index buffers

#### **Font Configuration Options**

```typescript
interface FontOptions {
    fontSize: number;        // Font size in world units
    lineWidth: number;       // Line width for wireframe (most browsers support 1.0 only)
    color: vec3;             // RGB color for text (both wireframe lines and filled triangles)
    splineSteps: number;     // Curve interpolation steps (0 = no interpolation)
    filled?: boolean;        // Generate filled triangles vs wireframe outline
}
```

#### **Advanced Features**

**Smooth Curve Generation**
- **TrueType Specification Compliance**: Proper on-curve and off-curve point handling
- **Implied Point Generation**: Automatic midpoint calculation between consecutive off-curve points
- **Configurable Quality**: Adjustable spline steps for performance vs quality balance
- **Quadratic Bézier Curves**: Mathematical precision for smooth character outlines

**Robust Polygon Triangulation**
- **Hole Detection**: Geometric containment analysis rather than unreliable winding order
- **Bridge Optimization**: Rightmost vertex selection with visibility ray casting
- **Triangle Validation**: Centroid testing ensures triangles are inside valid fill areas
- **Fallback Strategies**: Multiple approaches for difficult polygon configurations

**Character Support**
- **Simple Characters**: Single contour letters (l, c, v, etc.)
- **Characters with Holes**: Proper hole handling (d, o, a, b, etc.)
- **Multi-Part Characters**: Separate contours (i with dot, j with dot)
- **Complex Shapes**: Nested contours and irregular geometries
- **Unicode Support**: Full character set including special symbols (öäüß, punctuation)

#### **Performance Characteristics**
- **Efficient Caching**: Generated meshes are cached for repeated use
- **Minimal GPU Impact**: Text rendered in standard forward/deferred pipeline
- **Scalable Quality**: Spline steps configurable for performance tuning
- **Memory Efficient**: Shared vertex data and optimized index buffers

#### **Usage Examples**

**Basic Text Creation**
```typescript
// Simple filled text
const text = await createFilledTextMesh(
    "Hello World",
    "./static/resources/Raleway-Regular.ttf",
    {
        fontSize: 2.0,
        lineWidth: 1.0,
        color: vec3.fromValues(1.0, 1.0, 1.0),
        splineSteps: 8
    },
    vec3.fromValues(0, 0, -5)
);
```

**Advanced Configuration**
```typescript
// High-quality wireframe text with custom styling
const styledText = await createTextModelFromRenderer(gl, textRenderer, "Waggle", {
    fontSize: 1.5,
    lineWidth: 1.0,
    color: vec3.fromValues(0.2, 0.8, 1.0), // Cyan
    position: vec3.fromValues(-2, 1, -3),
    splineSteps: 16, // High quality curves
    filled: false
});
scene.objects.push(styledText);
```

**Console Output**
The system provides clean triangle count feedback:
```
Character 'H': 52 triangles
Character 'e': 89 triangles  
Character 'l': 66 triangles
Character 'o': 127 triangles
```

#### **Supported Features**
- **Font Formats**: TrueType (.ttf) fonts with complete glyph support
- **Rendering Modes**: Wireframe outlines and filled triangle meshes
- **Text Layout**: Automatic character spacing and positioning
- **Material Integration**: Full material system support with lighting
- **Transform Hierarchy**: Text objects support parent-child relationships
- **Performance Scaling**: Configurable quality levels for different use cases

### Comprehensive Testing
- **Unit Tests**: Complete test coverage for core systems
- **Integration Tests**: Scene loading, rendering pipeline, and transform hierarchy tests
- **Forward Rendering Tests**: Nested object hierarchies and custom shader validation

### Hybrid Object Picking System
The application features a sophisticated hybrid object picking system that can accurately select both deferred and forward-rendered objects using different techniques optimized for each rendering path.

#### **Core Architecture**
- **Deferred Objects**: Pixel-perfect selection using GBuffer object ID sampling
- **Forward Objects**: Geometric ray-box intersection testing
- **Depth Integration**: Automatic depth comparison to select the closest object
- **Visual Feedback**: Dynamic wireframe generation with line-based rendering

#### **Technical Implementation**

**GBuffer-Based Picking (Deferred Objects)**
- Dedicated `R32UI` texture layer stores unique object IDs during geometry pass
- `pickObject(x, y)` samples both object ID and depth at screen coordinates
- Provides pixel-perfect accuracy for complex mesh geometry
- Handles irregular shapes, concave objects, and fine details automatically

**Raycast-Based Picking (Forward Objects)**
- Camera ray generation from screen coordinates through inverse projection
- Ray-AABB (Axis-Aligned Bounding Box) intersection testing
- Uses actual mesh bounding boxes when available, falls back to unit cube
- Transforms bounding boxes to world space using object hierarchy matrices

**Hybrid Depth Resolution**
```typescript
// Simplified picking logic
const deferredHit = sampleGBuffer(x, y);  // Object ID + depth
const forwardHit = raycastForwardObjects(x, y);  // Distance along ray

// Select closest object between rendering passes
if (deferredHit.objectId > 0 && forwardHit) {
    return forwardHit.depth < deferredHit.depth ? forwardHit : deferredHit;
}
return deferredHit.objectId > 0 ? deferredHit : forwardHit;
```

#### **Transform Hierarchy System**
- **Immediate Propagation**: Parent transforms automatically update all children
- **World Matrix Caching**: Efficient matrix calculations with dirty flagging  
- **Pre-Raycast Updates**: All transforms resolved before picking operations
- **Bidirectional Relationships**: Parents and children maintain proper references

#### **Dynamic Wireframe Generation**
- **Mesh-Aware Bounds**: Calculates actual geometry bounding boxes from vertex data
- **Line-Based Rendering**: Uses `GL.LINES` primitive with configurable width and color
- **Forward Rendered**: Wireframes use forward rendering to avoid GBuffer conflicts
- **Automatic Cleanup**: Dynamic creation/destruction based on selection state

#### **Usage Examples**

**Basic Object Selection**
```typescript
// Click handling (automatic in main.ts)
canvas.addEventListener("click", (event) => {
    const objectId = gbuffer.pickObject(x, y, scene, camera);
    if (objectId > 0) {
        const selectedObject = scene.findObjectById(objectId);
        // Object selected - show wireframe, log details, etc.
    }
});
```

**Custom Forward Object Setup**
```json
{
    "type": "mesh",
    "name": "Forward Rendered Cube",
    "forwardRendered": true,
    "model": "./static/resources/cube.obj",
    "transform": {
        "position": [0, 2, -5],
        "scale": [0.1, 0.1, 0.1]
    }
}
```

**Line Rendering Configuration**
```typescript
// Set object to use line rendering (for wireframes, etc.)
object.drawMode = "lines";
object.lineWidth = 2.0;
object.lineColor = vec3.fromValues(0.0, 1.0, 0.0); // Green
```

#### **Performance Characteristics**
- **Deferred Picking**: O(1) - Single texture sample per click
- **Forward Picking**: O(n) - Linear with number of forward objects (typically very small)
- **Memory Overhead**: One additional R32UI texture layer in GBuffer
- **CPU Usage**: Minimal - raycast only runs on click events

#### **Supported Object Types**
- **Deferred Meshes**: Complex geometry with pixel-perfect accuracy
- **Forward Meshes**: Custom shaders, transparency, special effects
- **Child Objects**: Proper hierarchy support with parent transforms
- **Scaled Objects**: Automatic bounding box transformation
- **Light Indicators**: Small forward-rendered debug objects

**How to Use:**
1. **Click to Select**: Click on any rendered object (mesh, light indicator, etc.)
2. **Visual Feedback**: Selected objects display green wireframe outlines
3. **Console Information**: Object details logged to browser console
4. **Deselection**: Click empty space to clear selection
5. **Multiple Objects**: System automatically selects closest object to camera

**Console Output Example:**
```
Selected object: Right Bunny (ID: 2)
Object type: mesh
Object position: Float32Array(3) [1.5, 0, -6]
Created dynamic wireframe bounding box for selected object
```

## Quick Start

### Prerequisites
- [Bun](https://bun.sh/) - JavaScript runtime and package manager
- [uv](https://docs.astral.sh/uv/) - Python version and package manager

### Installation & Setup

```bash
# Clone the repository
git clone https://github.com/slaide/waggle.git
cd waggle

# Install dependencies
bun install

# Build the application
bun run build

# Start the server using uv
uv run server.py
```

### Access the Application
- **With server**: Open `http://localhost:8000`
- **Direct file access**: Open `static/index.html` in your browser

## Architecture Deep Dive

### Rendering Pipeline

1. **G-buffer Pass**: Deferred objects are rendered to geometry buffers
   - Position, normal, and albedo data stored in high-precision textures
   - Efficient for scenes with many lights

2. **Deferred Lighting Pass**: Screen-space lighting computation
   - Point lights and directional lights processed in parallel
   - Uniform buffer objects (UBOs) for optimal GPU performance

3. **Forward Pass**: Custom-shaded objects rendered directly
   - Alpha blending support for transparent materials
   - Custom shader support for special effects
   - Proper depth integration with deferred objects

### File Structure

```
waggle/
├── static/
│   ├── src/
│   │   ├── main.ts              # Application entry point
│   │   ├── scene/               # Scene management
│   │   │   ├── camera.ts        # Camera controls and matrices
│   │   │   ├── gameobject.ts    # Base object class and registry
│   │   │   ├── model.ts         # 3D model rendering
│   │   │   ├── scene.ts         # Scene traversal and management
│   │   │   ├── transform.ts     # 3D transformations
│   │   │   └── light.ts         # Lighting system
│   │   ├── shaders/             # GLSL shader programs
│   │   │   ├── geometry.*       # Deferred rendering shaders
│   │   │   ├── deferred_lighting.* # Lighting computation
│   │   │   ├── forward.*        # Default forward shaders
│   │   │   ├── flat_forward.*   # Unlit forward shaders
│   │   │   └── wireframe_forward.* # Wireframe effect shaders
│   │   ├── bits/                # Custom file loaders
│   │   │   ├── obj.ts           # Wavefront OBJ parser
│   │   │   ├── png.ts           # PNG image decoder
│   │   │   ├── ttf.ts           # TTF font parser
│   │   │   └── ...              # Additional utilities
│   │   ├── text.ts              # Text rendering system
│   │   └── gbuffer.ts           # G-buffer management
│   ├── resources/               # 3D models and textures
│   └── index.html               # Application entry point
├── tests/                       # Comprehensive test suite
│   └── static/src/
│       ├── scene/               # Scene system tests
│       ├── bits/                # File loader tests
│       └── ...
├── server.py                    # Development server
└── package.json                 # Build configuration
```

## Custom File Loaders

### OBJ Model Loader (`bits/obj.ts`)
- **Full OBJ Support**: Vertices, normals, texture coordinates, faces
- **Material Loading**: MTL file parsing with diffuse and specular properties
- **Optimization**: Automatic vertex deduplication and normal generation
- **Error Handling**: Graceful fallbacks for malformed files

```typescript
// Load a 3D model
const modelData = await parseObj('./static/resources/bunny.obj', { 
    normalizeSize: true 
});
```

### PNG Image Decoder (`bits/png.ts`)
- **Pure TypeScript**: No external dependencies for image loading
- **Compression Support**: Complete PNG specification implementation
- **Memory Efficient**: Streaming decoder with minimal memory footprint
- **WebGL Integration**: Direct texture upload with proper format handling

```typescript
// Load a texture
const imageData = await parsePng('./static/resources/texture.png');
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, imageData.width, imageData.height, 
              0, gl.RGBA, gl.UNSIGNED_BYTE, imageData.data);
```

## Text Rendering System

Waggle includes a comprehensive text rendering system built on a custom TTF font parser, enabling 3D text rendering with wireframe visualization.

### TTF Font Parser (`bits/ttf.ts`)
- **Pure TypeScript**: Complete TTF font file parsing with no external dependencies
- **Glyph Extraction**: Character-to-glyph mapping with Unicode support
- **Outline Parsing**: Vector-based glyph contour extraction for precise geometry
- **Font Metrics**: Proper scaling using font units per em (unitsPerEm)

### Font Class Interface (`text.ts`)
The Font class provides a clean, extensible API for text rendering:

```typescript
import { Font, FontOptions } from './text';
import { vec3 } from 'gl-matrix';

// Configure font rendering options
const fontOptions: FontOptions = {
    fontSize: 1.0,                              // Font size in world units
    lineWidth: 1.0,                             // Line width (most browsers only support 1.0)
    lineColor: vec3.fromValues(0.0, 1.0, 0.0)   // Green wireframe color
};

// Load font and generate text
const font = await Font.fromFile('./static/resources/Raleway-Regular.ttf', fontOptions);
const textMesh = font.generateTextMesh('ABC', vec3.fromValues(0, 0, -1));
```

### Features
- **World-Space Positioning**: Text positioned using 3D coordinates with lower-left corner specification
- **Automatic Character Spacing**: Intelligent character spacing based on font size (fontSize × 0.7)
- **Wireframe Rendering**: Line-based text rendering integrated with WebGL2 pipeline
- **Extensible Options**: FontOptions interface designed for future feature expansion
- **Single Character Support**: Individual character mesh generation for custom layouts

### Integration with Rendering Pipeline
Text meshes integrate seamlessly with Waggle's forward rendering system:

```typescript
import { createTextModel } from './scene/textmesh';

// Convert text mesh to renderable Model object
const textModel = createTextModel(textMesh, fontOptions.lineColor, fontOptions.lineWidth);
scene.addObject(textModel);
```

### Current Limitations & Future Enhancements
**Note**: The current implementation supports wireframe-only text rendering. Future versions will include:
- **Smooth Outline Rendering**: Anti-aliased text outlines for improved visual quality
- **Filled Text Rendering**: Solid text appearance with proper triangulation
- **Advanced Typography**: Kerning, ligatures, and multi-line text support

### Performance Characteristics
- **Font Loading**: O(1) - Fonts cached after initial parse
- **Text Generation**: O(n) - Linear with character count
- **Memory Usage**: Efficient typed arrays for vertex data
- **Rendering**: Uses GL.LINES primitive with configurable line width

## Forward Rendering System

### Overview
The forward rendering system allows objects to be rendered with custom shaders after the deferred lighting pass, enabling:
- **Transparent Materials**: Alpha blending with proper depth testing
- **Custom Effects**: Per-object vertex and fragment shader customization
- **Special Materials**: Materials that don't fit the G-buffer format

### Usage

#### Enable Forward Rendering
```json
{
    "type": "mesh",
    "name": "Forward Rendered Object",
    "forwardRendered": true,
    "model": "./static/resources/cube.obj",
    "material": {
        "diffuse": [1.0, 0.5, 0.0],
        "specularExponent": 32
    }
}
```

#### Custom Shaders
```json
{
    "type": "mesh",
    "name": "Custom Shader Object",
    "forwardRendered": true,
    "forwardShaderPaths": {
        "vs": "static/src/shaders/my_custom.vert",
        "fs": "static/src/shaders/my_custom.frag"
    },
    "model": "./static/resources/model.obj"
}
```

### Available Shaders
- **`forward.*`**: Default forward rendering with full lighting
- **`flat_forward.*`**: Unlit rendering for UI elements and indicators
- **`wireframe_forward.*`**: Wireframe effect with barycentric coordinates

## Scene Format

Waggle uses a flexible JSON-based scene format:

```json
{
    "name": "Example Scene",
    "camera": {
        "position": [0, 0, 0],
        "rotation": [0, 0, 0, 1],
        "fov": 45,
        "aspect": 1.33,
        "znear": 0.1,
        "zfar": 100
    },
    "objects": [
        {
            "type": "mesh",
            "name": "3D Model",
            "model": "./static/resources/bunny.obj",
            "transform": {
                "position": [0, 0, -5],
                "rotation": [0, 0, 0, 1],
                "scale": [1, 1, 1]
            },
            "children": [
                {
                    "type": "mesh",
                    "name": "Child Object",
                    "forwardRendered": true,
                    "model": "./static/resources/cube.obj",
                    "transform": {
                        "position": [0, 1, 0],
                        "scale": [0.5, 0.5, 0.5]
                    }
                }
            ]
        },
        {
            "type": "point_light",
            "name": "Scene Light",
            "transform": {
                "position": [2, 3, -2]
            },
            "color": [1.0, 1.0, 1.0],
            "intensity": 0.8,
            "radius": 10
        }
    ]
}
```

## Lighting System

Waggle supports two types of dynamic lights with real-time rendering in both deferred and forward rendering pipelines.

### Point Lights

Point lights emit light in all directions from a single point in 3D space, with distance-based attenuation.

```json
{
    "type": "point_light",
    "name": "Scene Light",
    "transform": {
        "position": [0, 2, -6],
        "rotation": [0, 0, 0, 1],
        "scale": [1, 1, 1]
    },
    "color": [1.0, 1.0, 1.0],
    "intensity": 0.8,
    "radius": 10
}
```

#### Point Light Parameters
- **`color`**: RGB color values (0.0 to 1.0) - The color of the light
- **`intensity`**: Light strength multiplier (typically 0.1 to 2.0) - Higher values create brighter illumination
- **`radius`**: Maximum distance for light attenuation (world units) - Light intensity falls off to zero at this distance
- **`transform.position`**: World space position of the light source

Point lights use quadratic falloff for realistic lighting attenuation. The deferred rendering pipeline supports a maximum of 32 point lights (configurable in shaders).

### Directional Lights

Directional lights simulate distant light sources (like the sun) with parallel rays and no distance attenuation.

```json
{
    "type": "directional_light",
    "name": "Sun Light",
    "transform": {
        "position": [0, 0, 0],
        "rotation": [0, 0, 0, 1],
        "scale": [1, 1, 1]
    },
    "direction": [0, -1, 0],
    "color": [1.0, 0.95, 0.8],
    "intensity": 0.5
}
```

#### Directional Light Parameters
- **`direction`**: 3D vector indicating light direction (will be normalized) - Points from the light source toward the scene
- **`color`**: RGB color values (0.0 to 1.0) - The color of the light
- **`intensity`**: Light strength multiplier (typically 0.1 to 1.0) - Controls overall brightness
- **`transform.position`**: Used only for light indicator positioning (doesn't affect lighting)

The deferred rendering pipeline supports a maximum of 1 directional light (configurable in shaders).

## Testing

The project includes comprehensive tests covering all major systems:

### Test Coverage
- **Scene Management**: Object hierarchies, transforms, and serialization
- **Forward Rendering**: Custom shaders and mixed rendering modes
- **File Loaders**: OBJ parsing and PNG decoding
- **Data Structures**: Type-safe binary data handling

### Running Tests
```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Run specific test file
bun test tests/static/src/scene/forward_rendering_nested.test.ts
```

### Test Files
- `scene/`: Scene loading, transform hierarchies, forward rendering integration
- `bits/obj.test.ts`: OBJ file parsing and material loading
- `struct.test.ts`: Binary data structure handling

## Build System

### Bun-based Pipeline
- **Fast Builds**: Bun's native TypeScript compilation
- **Optimization**: Minification and tree-shaking for production
- **Source Maps**: Full debugging support during development
- **Watch Mode**: Automatic rebuilds during development

### Build Commands
```bash
# Development build
bun run build

# Production build (same, but minified)
bun run bundle

# Clean build with type checking
bun run build --clean
```

## Development Server

A minimal Python server is included for development convenience:

```bash
# Start server with Python
python server.py

# Or with uv for dependency management
uv run server.py
```

The server provides:
- Static file serving from the `static/` directory
- CORS headers for local development
- Automatic MIME type detection
- Hot-reload friendly (no caching)

## Performance Characteristics

### Rendering Performance
- **Deferred Rendering**: O(pixels × lights) complexity
- **Forward Rendering**: O(objects × lights) complexity  
- **Hybrid Benefits**: Optimal performance for mixed scene types
- **GPU Utilization**: Efficient use of modern graphics hardware

### Memory Usage
- **Typed Arrays**: Native binary data handling for vertices and indices
- **Texture Compression**: Automatic format optimization
- **G-buffer Optimization**: Half-float precision where possible
- **Garbage Collection**: Minimal allocation during rendering

## Milestones

1. **Basic Rendering** [#366ec80](https://github.com/slaide/waggle/tree/366ec804f1c94cbb850c10a818588260f3306f34): Rotating cube with vertex data
2. **Custom File Loaders**: Native TypeScript OBJ and PNG parsers
3. **Deferred Shading** [#ef840e0](https://github.com/slaide/waggle/tree/ef840e0d8112817dd0bd7706f3ef9bb012d167f3): G-buffer implementation with lighting
4. **Scene Serialization** [#cd95c5a](https://github.com/slaide/waggle/tree/cd95c5a39782056aa00b5df7d4fe2a8cf39c28c2): JSON-based scene format
5. **Forward Rendering**: Hybrid pipeline with custom shader support
6. **Object Picking** (Complete): Hybrid system supporting both deferred (GBuffer-based) and forward-rendered (raycast-based) object selection with dynamic wireframe feedback

## Contributing

The project follows modern TypeScript best practices:
- **Type Safety**: Strict TypeScript configuration with comprehensive type checking
- **Code Quality**: ESLint configuration with import sorting and JSDoc requirements
- **Testing**: Comprehensive test coverage with Bun's built-in test runner
- **Documentation**: Self-documenting code with detailed comments

## License

GPL-3.0 License - see [LICENSE](LICENSE) file for details.

## Related Technologies

- **WebGL2**: [OpenGL ES 3.0 specification](https://www.khronos.org/webgl/)
- **gl-matrix**: [High-performance matrix operations](https://glmatrix.net/)
- **Bun**: [Fast JavaScript runtime](https://bun.sh/)
- **TypeScript**: [Typed JavaScript](https://www.typescriptlang.org/)
