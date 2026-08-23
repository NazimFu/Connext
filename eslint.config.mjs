import nextConfig from "eslint-config-next";

export default [
  ...nextConfig,
  {
    // These React Compiler-oriented rules assume code written with the
    // compiler's constraints in mind; this codebase predates that and isn't
    // opted into it, so they'd just flag long-standing, normal patterns.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
    },
  },
];
