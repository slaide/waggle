import tseslint from "typescript-eslint";

export default [
    {
        files: ["**/*.ts", "**/*.tsx"],
        plugins: {
            "@typescript-eslint": tseslint.plugin,
        },
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: "./tsconfig.json",
            },
        },
        rules: {
            // TypeScript rules - keeping these strict
            "@typescript-eslint/no-unused-vars": "error",
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-non-null-assertion": "warn",
            
            // Code style - making these more lenient
            "quotes": ["warn", "double", { "avoidEscape": true }],
            "comma-dangle": ["warn", "always-multiline"],
            "indent": ["warn", 4],
            "semi": ["warn", "always"],
            
            // Best practices - keeping these strict
            "no-console": ["warn", { allow: ["warn", "error"] }],
            "no-debugger": "warn",
            "no-duplicate-imports": "error",
            "no-unreachable": "error",
            "no-var": "warn",
            "prefer-const": "warn",
        },
    },
];
