#version 300 es
precision highp float;

// --- Helper: linear attenuation (0..1) based on distance/radius ---
float ComputeAttenuation( float distance, float radius )
{
    return clamp(1.0 - (distance / radius), 0.0, 1.0);
}

#define MAX_POINT_LIGHTS 32
#define MAX_DIRECTIONAL_LIGHTS 1

struct PointLight{
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

// --- Point Light Contribution ---
vec3 CalcPointLight(
    PointLight p,
    vec3 fragPos,
    vec3 norm,
    vec3 viewDir,
    vec3 albedo,
    float specGloss
){
    // Calculate light direction and distance
    vec3 lightDir = p.position - fragPos;
    float distance = length(lightDir);
    lightDir = normalize(lightDir);
    
    // Normalize vectors
    vec3 N = normalize(norm);
    vec3 V = normalize(viewDir);
    
    // Calculate diffuse term
    float diffuse = max(dot(N, lightDir), 0.0);
    
    // Calculate specular term (Phong)
    float specular = 0.0;
    if(diffuse > 0.0) {
        vec3 R = reflect(-lightDir, N);
        specular = pow(max(dot(R, V), 0.0), specGloss);
    }
    
    // Calculate distance attenuation (linear falloff)
    float distanceAttenuation = clamp(1.0 - (distance / p.radius), 0.0, 1.0);
    distanceAttenuation = distanceAttenuation * distanceAttenuation; // Square for more natural falloff
    
    // Combine terms with proper attenuation
    vec3 diffuseTerm = albedo * diffuse * p.color * p.intensity;
    vec3 specularTerm = p.color * specular * p.intensity;
    vec3 colorLinear = (diffuseTerm + specularTerm) * distanceAttenuation;
    
    // Apply gamma correction (assuming input colors are in linear space)
    const float screenGamma = 2.2;
    vec3 colorGammaCorrected = pow(colorLinear, vec3(1.0 / screenGamma));
    
    return clamp(colorGammaCorrected, 0.0, 1.0);
}

// --- Directional Light Contribution ---
vec3 CalcDirectionalLight(
    DirectionalLight d,
    vec3 fragPos,
    vec3 norm,
    vec3 viewDir,
    vec3 albedo,
    float specGloss
){
    // Directional lights have no position, just direction
    vec3 lightDir = normalize(-d.direction);
    
    // Normalize vectors
    vec3 N = normalize(norm);
    vec3 V = normalize(viewDir);
    
    // Calculate diffuse term
    float diffuse = max(dot(N, lightDir), 0.0);
    
    // Calculate specular term (Phong)
    float specular = 0.0;
    if(diffuse > 0.0) {
        vec3 R = reflect(-lightDir, N);
        specular = pow(max(dot(R, V), 0.0), specGloss);
    }
    
    // Combine terms (no attenuation for directional lights)
    vec3 diffuseTerm = albedo * diffuse * d.color * d.intensity;
    vec3 specularTerm = d.color * specular * d.intensity;
    vec3 colorLinear = diffuseTerm + specularTerm;
    
    // Apply gamma correction (assuming input colors are in linear space)
    const float screenGamma = 2.2;
    vec3 colorGammaCorrected = pow(colorLinear, vec3(1.0 / screenGamma));
    
    return clamp(colorGammaCorrected, 0.0, 1.0);
}

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

uniform sampler2D gPosition;
uniform sampler2D gNormal;
uniform sampler2D gAlbedoSpec;
uniform vec3 uCamPos;

in vec2 vUV;

out vec4 color;
void main() {
    // Sample and normalize G-buffer data
    vec3 fragPos = texture(gPosition, vUV).rgb;
    vec3 fragNormal = normalize(texture(gNormal, vUV).rgb);
    vec4 albSpec = texture(gAlbedoSpec, vUV);
    vec3 albedo = albSpec.rgb;
    float specGloss = albSpec.a;
    vec3 viewDir = normalize(uCamPos - fragPos);

    vec3 result = vec3(0.0);
    // Point lights
    for(int i = 0; i < numPointLights; i++) {
        result += CalcPointLight(pointLights[i], fragPos, fragNormal, viewDir, albedo, specGloss);
    }
    // Directional lights
    for(int i = 0; i < numDirectionalLights; i++) {
        result += CalcDirectionalLight(directionalLights[i], fragPos, fragNormal, viewDir, albedo, specGloss);
    }
    // Ensure final result stays in [0,1]
    color = vec4(clamp(result, 0.0, 1.0), 1.0);
} 