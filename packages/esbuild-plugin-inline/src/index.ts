import { dirname } from 'path';

import {
  createInlineCompiler,
  vanillaExtractTransformPlugin,
  IdentifierOption,
  CreateInlineCompilerOptions,
} from '@vanilla-extract/integration';
import type { Plugin } from 'esbuild';

const vanillaCssNamespace = 'vanilla-extract-css-ns';

interface VanillaExtractPluginOptions {
  outputCss?: boolean;
  runtime?: boolean;
  processCss?: (css: string) => Promise<string>;
  identifiers?: IdentifierOption;
  compilerVitePlugins?: CreateInlineCompilerOptions['vitePlugins'];
}
export function vanillaExtractPlugin({
  outputCss = true,
  runtime = false,
  processCss,
  identifiers: identOption,
  compilerVitePlugins: vitePlugins,
}: VanillaExtractPluginOptions = {}): Plugin {
  if (runtime) {
    // If using runtime CSS then just apply fileScopes and debug IDs to code
    return vanillaExtractTransformPlugin({ identOption });
  }

  return {
    name: 'vanilla-extract',
    async setup(build) {
      const root = build.initialOptions.absWorkingDir || process.cwd();
      const identifiers =
        identOption || (build.initialOptions.minify ? 'short' : 'debug');

      const compiler = createInlineCompiler({ root, identifiers, vitePlugins });

      build.onDispose(async () => {
        await compiler.close();
      });

      build.onResolve({ filter: /\.vanilla\.css/ }, (args) => {
        return {
          path: args.path,
          namespace: vanillaCssNamespace,
        };
      });

      build.onLoad(
        { filter: /.*/, namespace: vanillaCssNamespace },
        async ({ path }) => {
          const [rootRelativePath] = path.split('.vanilla.css');

          let { css, filePath } = compiler.getCssForFile(rootRelativePath);

          if (typeof processCss === 'function') {
            css = await processCss(css);
          }

          return {
            contents: css,
            loader: 'css',
            resolveDir: dirname(filePath),
          };
        },
      );

      build.onLoad({ filter: /.*/ }, async ({ path }) => {
        const result = await compiler.processVanillaFile(path, {
          outputCss,
        });

        if (!result) {
          return;
        }

        return {
          contents: result.source,
          loader: 'js',
          watchFiles: Array.from(result.watchFiles),
        };
      });
    },
  };
}
