import { promise } from 'matched';

var entry = '\0rollup-plugin-multi-entry:entry-point';

function nextChar(c) {
  return String.fromCharCode(c.charCodeAt(0) + 1);
}

function replaceAt(oldStr, i, newStr) {
  return oldStr.substr(0, i) + newStr + oldStr.substr(i + newStr.length);
}

var _name = '';
function nextName() {
  for (var i = _name.length - 1; i >= 0; i--) {
    var char = _name[i];

    if (char !== 'z') {
      _name = replaceAt(_name, i, nextChar(char));
      return _name;
    }

    _name = replaceAt(_name, i, 'a');
  }

  _name = 'a' + _name;
  return _name;
}

function multiEntry() {
  var config = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;

  var include = [];
  var exclude = [];
  var exporter = function exporter(path, importer) {
    var str = 'export * from ' + JSON.stringify(path) + ';';

    // `matched` forces Unix path separators, even on Windows
    // `fetchModule` needs native path separators
    var _path = require('path').normalize(path);

    return this.fetchModule(path.replace(/\//g, '\\'), importer).then(function (module) {
      if (module.ast.body.filter(function (node) {
        if (node.type === 'ExportNamedDeclaration') {
          return node.specifiers.filter(function (specifier) {
            return specifier.exported.name === 'default';
          }).length;
        } else {
          return node.type === 'ExportDefaultDeclaration';
        }
      }).length) {
        str += '\nexport { default as ' + nextName() + ' } from ' + JSON.stringify(path) + ';';
      }
      return str;
    });
  };
  function configure(config) {
    if (typeof config === 'string') {
      include = [config];
    } else if (Array.isArray(config)) {
      include = config;
    } else {
      include = config.include || [];
      exclude = config.exclude || [];
      if (config.exports === false) {
        exporter = function exporter(path) {
          return 'import ' + JSON.stringify(path) + ';';
        };
      }
    }
  }

  if (config) {
    configure(config);
  }

  return {
    options: function options(_options) {
      if (_options.input && _options.input !== entry) {
        configure(_options.input);
      }
      _options.input = entry;
    },
    resolveId: function resolveId(id) {
      if (id === entry) {
        return entry;
      }
    },
    load: function load(id) {
      var _this = this;

      if (id === entry) {
        if (!include.length) {
          return Promise.resolve('');
        }
        var patterns = include.concat(exclude.map(function (pattern) {
          return '!' + pattern;
        }));
        return promise(patterns).then(function (paths) {
          return Promise.all(paths.map(function (path) {
            return exporter.call(_this, path, id);
          }));
        }).then(function (strings) {
          return strings.join('\n');
        });
      }
    }
  };
}

export default multiEntry;
