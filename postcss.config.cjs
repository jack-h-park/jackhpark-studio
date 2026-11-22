module.exports = {
  plugins: {
    // Resolve canonical primitive fragments before Tailwind expands cross-file @apply.
    "postcss-import": {
      filter: (url) => url.startsWith("./primitives/"),
    },
    tailwindcss: {},
    autoprefixer: {},
  },
};
