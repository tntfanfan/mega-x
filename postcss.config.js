/**
 * Root PostCSS config.
 *
 * Vite finds this from cwd. Tailwind+autoprefixer apply globally, but
 * tailwind.config.ts scopes `content` to console/ only — so marketing
 * CSS files under styles/ are processed by autoprefixer but get no
 * Tailwind utilities injected (they don't use @tailwind directives).
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
