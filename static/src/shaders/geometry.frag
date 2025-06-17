#version 300 es

precision highp float;

layout (location = 0) out vec3 gPosition;
layout (location = 1) out vec3 gNormal;
layout (location = 2) out vec4 gAlbedoSpec;
layout (location = 3) out uint gObjectId;

in vec2 vTextureCoord;
in vec4 vGlobalPos;
in vec3 vNormal;

uniform bool uUseDiffuseTexture;
uniform sampler2D uDiffuseSampler;
uniform vec4 uDiffuseColor;
uniform float uSpecularExponent;
uniform uint uObjectId;

void main() {
    gPosition = vGlobalPos.xyz;
    gNormal = vNormal;

    vec3 diffuseColor;
    if (uUseDiffuseTexture) {
        diffuseColor = texture(uDiffuseSampler, vTextureCoord).rgb;
    } else {
        diffuseColor = uDiffuseColor.rgb;
    }
    gAlbedoSpec = vec4(diffuseColor, uSpecularExponent);
    
    // Output the object ID for picking
    gObjectId = uObjectId;
} 