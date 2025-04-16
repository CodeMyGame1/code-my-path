// The reason we need to use CRACO is because MDX doesn't work with Create React
// App out of the box.
// https://github.com/orgs/mdx-js/discussions/1870
// https://github.com/orgs/mdx-js/discussions/2218

const { addAfterLoader, loaderByName } = require("@craco/craco");
const dotenv = require("dotenv");
// const { createProxyMiddleware } = require('http-proxy-middleware');

dotenv.config();

module.exports = async env => {
  const remarkGfm = (await import("remark-gfm")).default;

  return {
    devServer: {
      port: process.env.PORT
    },
    webpack: {
      configure: webpackConfig => {
        addAfterLoader(webpackConfig, loaderByName("babel-loader"), {
          test: /\.(md|mdx)$/,
          loader: require.resolve("@mdx-js/loader"),
          /** @type {import('@mdx-js/loader').Options} */
          options: {
            remarkPlugins: [remarkGfm]
          }
        });
        return webpackConfig;
      }
    },
    plugins: [
      { plugin: require("./craco-copy-webpack-plugin.js") },
      { plugin: require("./craco-fallback-util-plugin.js") },
      { plugin: require("./craco-service-worker-dev-plugin.js") },
      { plugin: require('react-app-alias').CracoAliasPlugin }
    ]
  };
};
