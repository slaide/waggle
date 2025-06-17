#version 300 es

precision highp float;

in vec4 aVertexPosition;
in vec3 aVertexNormal;
in vec2 aVertexTexCoord;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;

out vec2 vTextureCoord;

void main() {
    vec4 worldPos = uModelMatrix * aVertexPosition;
    gl_Position = uProjectionMatrix * uViewMatrix * worldPos;
    
    vTextureCoord = aVertexTexCoord;
} 