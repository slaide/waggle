#version 300 es

precision highp float;

in vec4 aVertexPosition;
in vec3 aVertexNormal;
in vec2 aVertexTexCoord;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;

out vec2 vTextureCoord;
out vec4 vWorldPos;
out vec3 vWorldNormal;

void main() {
    vec4 worldPos = uModelMatrix * aVertexPosition;
    gl_Position = uProjectionMatrix * uViewMatrix * worldPos;
    
    vWorldPos = worldPos;
    vTextureCoord = aVertexTexCoord;
    
    // Transform normal to world space
    mat3 normalMatrix = transpose(inverse(mat3(uModelMatrix)));
    vWorldNormal = normalize(normalMatrix * aVertexNormal);
} 