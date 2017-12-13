/* @flow */

type Config = string | Array<string> | { include?: Array<string>, exclude?: Array<string>, exports?: boolean };

import { promise as matched } from 'matched';

const entry = '\0rollup-plugin-multi-entry:entry-point';

function nextChar(c) {
  return String.fromCharCode(c.charCodeAt(0) + 1);
}

function replaceAt(oldStr, i, newStr) {
  return oldStr.substr(0, i) + newStr + oldStr.substr(i + newStr.length);
}

let _name = '';
function nextName() {
  for (let i = _name.length - 1; i >= 0; i--) {
    let char = _name[i];

    if (char !== 'z') {
      _name = replaceAt(_name, i, nextChar(char));
      return _name;
    }

    _name = replaceAt(_name, i, 'a');
  }

  _name = 'a' + _name;
  return _name;
}

export default function multiEntry(config: ?Config=null) {
  let include = [];
  let exclude = [];
  let exporter = function(path, importer) {
    let str = `export * from ${JSON.stringify(path)};`;

    // `matched` forces Unix path separators, even on Windows
    // `fetchModule` needs native path separators
    let _path = require('path').normalize(path);

    return this.fetchModule(path.replace(/\//g, '\\'), importer).then(module => {
      if (module.ast.body.filter(node => {
        if (node.type === 'ExportNamedDeclaration') {
          return node.specifiers.filter(specifier => {
            return specifier.exported.name === 'default';
          }).length;
        } else {
          return node.type === 'ExportDefaultDeclaration';
        }
      }).length) {
        str += `\nexport { default as ${nextName()} } from ${JSON.stringify(path)};`
      }
      return str;
    });
  };
  let defaultExporter = path => `export { default as ${nextName()} } from ${JSON.stringify(path)};`;

  function configure(config: Config) {
    if (typeof config === 'string') {
      include = [config];
    } else if (Array.isArray(config)) {
      include = config;
    } else {
      include = config.include || [];
      exclude = config.exclude || [];
      if (config.exports === false) {
        exporter = path => `import ${JSON.stringify(path)};`;
      }
    }
  }

  if (config) {
    configure(config);
  }

  return {
    options(options: { input: ?string }) {
      if (options.input && options.input !== entry) {
        configure(options.input);
      }
      options.input = entry;
    },

    resolveId(id: string): ?string {
      if (id === entry) {
        return entry;
      }
    },

    load(id: string): ?Promise<string> {
      if (id === entry) {
        if (!include.length) {
          return Promise.resolve('');
        }
        const patterns = include.concat(exclude.map(pattern => '!' + pattern));
        return matched(patterns).then(paths => {
          return Promise.all(paths.map(path => exporter.call(this, path, id)));
        }).then(strings => {
          return strings.join('\n');
        });
      }
    }
  }
}
