#version 300 es

precision highp float;

#define MAX_POINT_LIGHTS 32
#define MAX_DIRECTIONAL_LIGHTS 1

struct PointLight {
    vec3 position;
    float radius;
    vec3 color;
    float intensity;
};

struct DirectionalLight {
    vec3 direction;
    float pad0;
    vec3 color;
    float intensity;
};

layout(std140) uniform PointLightBlock {
    int numPointLights;
    // 12 bytes of padding
    PointLight pointLights[MAX_POINT_LIGHTS];
};

layout(std140) uniform DirectionalLightBlock {
    int numDirectionalLights;
    // 12 bytes of padding
    DirectionalLight directionalLights[MAX_DIRECTIONAL_LIGHTS];
};

uniform sampler2D uDiffuseSampler;
uniform vec4 uDiffuseColor;
uniform float uSpecularExponent;
uniform bool uUseDiffuseTexture;
uniform vec3 uCamPos;

in vec2 vTextureCoord;
in vec4 vWorldPos;
in vec3 vWorldNormal;

out vec4 fragColor;

// Point Light Calculation
vec3 CalcPointLight(PointLight light, vec3 fragPos, vec3 normal, vec3 viewDir, vec3 albedo, float specExp) {
    vec3 lightDir = light.position - fragPos;
    float distance = length(lightDir);
    lightDir = normalize(lightDir);
    
    // Diffuse
    float diff = max(dot(normal, lightDir), 0.0);
    
    // Specular (Phong)
    float spec = 0.0;
    if (diff > 0.0) {
        vec3 reflectDir = reflect(-lightDir, normal);
        spec = pow(max(dot(viewDir, reflectDir), 0.0), specExp);
    }
    
    // Attenuation
    float attenuation = clamp(1.0 - (distance / light.radius), 0.0, 1.0);
    attenuation = attenuation * attenuation;
    
    vec3 diffuse = diff * albedo * light.color * light.intensity;
    vec3 specular = spec * light.color * light.intensity;
    
    return (diffuse + specular) * attenuation;
}

// Directional Light Calculation
vec3 CalcDirectionalLight(DirectionalLight light, vec3 normal, vec3 viewDir, vec3 albedo, float specExp) {
    vec3 lightDir = normalize(-light.direction);
    
    // Diffuse
    float diff = max(dot(normal, lightDir), 0.0);
    
    // Specular (Phong)
    float spec = 0.0;
    if (diff > 0.0) {
        vec3 reflectDir = reflect(-lightDir, normal);
        spec = pow(max(dot(viewDir, reflectDir), 0.0), specExp);
    }
    
    vec3 diffuse = diff * albedo * light.color * light.intensity;
    vec3 specular = spec * light.color * light.intensity;
    
    return diffuse + specular;
}

void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDir = normalize(uCamPos - vWorldPos.xyz);
    
    // Get material properties
    vec3 albedo;
    if (uUseDiffuseTexture) {
        albedo = texture(uDiffuseSampler, vTextureCoord).rgb;
    } else {
        albedo = uDiffuseColor.rgb;
    }
    
    vec3 result = vec3(0.0);
    
    // Calculate lighting from point lights
    for (int i = 0; i < numPointLights; i++) {
        result += CalcPointLight(pointLights[i], vWorldPos.xyz, normal, viewDir, albedo, uSpecularExponent);
    }
    
    // Calculate lighting from directional lights
    for (int i = 0; i < numDirectionalLights; i++) {
        result += CalcDirectionalLight(directionalLights[i], normal, viewDir, albedo, uSpecularExponent);
    }
    
    // Apply gamma correction
    const float gamma = 2.2;
    result = pow(result, vec3(1.0 / gamma));
    
    fragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
} 