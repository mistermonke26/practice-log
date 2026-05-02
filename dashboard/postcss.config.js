export default {
  plugins: {
    '@tailwindcss/vite': {},
    autoprefixer: {},
    'postcss-preset-env': {
      stage: 3,
      features: {
        'nesting-rules': true,
        'custom-properties': true,
      },
    },
  },
}
