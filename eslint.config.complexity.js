export default [
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest", // Auto-updates with Node version
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly"
      }
    },
    rules: {
      // Cyclomatic Complexity (max independent paths through code)
      "complexity": ["error", { "max": 10 }],

      // Nesting Depth (max nested blocks)
      "max-depth": ["error", { "max": 4 }],

      // Nested Callbacks (pyramid of doom)
      "max-nested-callbacks": ["error", { "max": 3 }],

      // Function Length (lines per function)
      "max-lines-per-function": ["warn", {
        "max": 50,
        "skipBlankLines": true,
        "skipComments": true
      }],

      // Statements per function
      "max-statements": ["warn", { "max": 15 }],

      // Function parameters
      "max-params": ["warn", { "max": 4 }]
    }
  }
];
