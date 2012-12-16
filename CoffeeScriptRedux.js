var CoffeeScript = (function(){var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var cached = require.cache[resolved];
    var res = cached? cached.exports : mod();
    return res;
};

require.paths = [];
require.modules = {};
require.cache = {};
require.extensions = [".js",".coffee",".json"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            x = path.normalize(x);
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = path.normalize(x + '/package.json');
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key);
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

(function () {
    var process = {};
    var global = typeof window !== 'undefined' ? window : {};
    var definedProcess = false;
    
    require.define = function (filename, fn) {
        if (!definedProcess && require.modules.__browserify_process) {
            process = require.modules.__browserify_process();
            definedProcess = true;
        }
        
        var dirname = require._core[filename]
            ? ''
            : require.modules.path().dirname(filename)
        ;
        
        var require_ = function (file) {
            var requiredModule = require(file, dirname);
            var cached = require.cache[require.resolve(file, dirname)];

            if (cached && cached.parent === null) {
                cached.parent = module_;
            }

            return requiredModule;
        };
        require_.resolve = function (name) {
            return require.resolve(name, dirname);
        };
        require_.modules = require.modules;
        require_.define = require.define;
        require_.cache = require.cache;
        var module_ = {
            id : filename,
            filename: filename,
            exports : {},
            loaded : false,
            parent: null
        };
        
        require.modules[filename] = function () {
            require.cache[filename] = module_;
            fn.call(
                module_.exports,
                require_,
                module_,
                module_.exports,
                dirname,
                filename,
                process,
                global
            );
            module_.loaded = true;
            return module_.exports;
        };
    };
})();


require.define("path",function(require,module,exports,__dirname,__filename,process,global){function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

});

require.define("__browserify_process",function(require,module,exports,__dirname,__filename,process,global){var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
        && window.setImmediate;
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    if (name === 'evals') return (require)('vm')
    else throw new Error('No such module. (Possibly not yet loaded)')
};

(function () {
    var cwd = '/';
    var path;
    process.cwd = function () { return cwd };
    process.chdir = function (dir) {
        if (!path) path = require('path');
        cwd = path.resolve(dir, cwd);
    };
})();

});

require.define("fs",function(require,module,exports,__dirname,__filename,process,global){// nothing to see here... no file methods for the browser

});

require.define("/lib/coffee-script/helpers.js",function(require,module,exports,__dirname,__filename,process,global){// Generated by CoffeeScript 2.0.0-dev
var beingDeclared, cleanMarkers, concat, concatMap, CS, difference, envEnrichments, envEnrichments_, foldl, humanReadable, map, nub, numberLines, pointToErrorLocation, usedAsExpression, usedAsExpression_;
cache$ = require('./functional-helpers');
concat = cache$.concat;
concatMap = cache$.concatMap;
difference = cache$.difference;
foldl = cache$.foldl;
map = cache$.map;
nub = cache$.nub;
CS = require('./nodes');
this.numberLines = numberLines = function (input, startLine) {
  var lines, numbered, padSize;
  if (null == startLine)
    startLine = 1;
  lines = input.split('\n');
  padSize = ('' + (lines.length + startLine - 1)).length;
  numbered = function (accum$) {
    var currLine, i, line, pad;
    for (var i$ = 0, length$ = lines.length; i$ < length$; ++i$) {
      line = lines[i$];
      i = i$;
      currLine = '' + (i + startLine);
      pad = Array(padSize + 1).join('0').slice(currLine.length);
      accum$.push('' + pad + currLine + ' : ' + lines[i]);
    }
    return accum$;
  }.call(this, []);
  return numbered.join('\n');
};
cleanMarkers = function (str) {
  return str.replace(/[\uEFEF\uEFFE\uEFFF]/g, '');
};
this.humanReadable = humanReadable = function (str) {
  return str.replace(/\uEFEF/g, '(INDENT)').replace(/\uEFFE/g, '(DEDENT)').replace(/\uEFFF/g, '(TERM)');
};
this.formatParserError = function (input, e) {
  var found, message, realColumn, unicode;
  realColumn = cleanMarkers(('' + input.split('\n')[e.line - 1] + '\n').slice(0, e.column)).length;
  if (!(null != e.found))
    return 'Syntax error on line ' + e.line + ', column ' + realColumn + ': unexpected end of input';
  found = JSON.stringify(humanReadable(e.found));
  found = found.replace(/^"|"$/g, '').replace(/'/g, "\\'").replace(/\\"/g, '"');
  unicode = e.found.charCodeAt(0).toString(16).toUpperCase();
  unicode = '\\u' + '0000'.slice(unicode.length) + unicode;
  message = 'Syntax error on line ' + e.line + ', column ' + realColumn + ": unexpected '" + found + "' (" + unicode + ')';
  return '' + message + '\n' + pointToErrorLocation(input, e.line, realColumn);
};
this.pointToErrorLocation = pointToErrorLocation = function (source, line, column, numLinesOfContext) {
  var currentLineOffset, lines, numberedLines, padSize, postLines, preLines, startLine;
  if (null == numLinesOfContext)
    numLinesOfContext = 3;
  lines = source.split('\n');
  currentLineOffset = line - 1;
  startLine = currentLineOffset - numLinesOfContext;
  if (startLine < 0)
    startLine = 0;
  preLines = lines.slice(startLine, +currentLineOffset + 1 || 9e9);
  postLines = lines.slice(currentLineOffset + 1, +(currentLineOffset + numLinesOfContext) + 1 || 9e9);
  numberedLines = numberLines(cleanMarkers([].slice.call(preLines).concat([].slice.call(postLines)).join('\n')), startLine + 1).split('\n');
  preLines = numberedLines.slice(0, preLines.length);
  postLines = numberedLines.slice(preLines.length);
  column = cleanMarkers(('' + lines[currentLineOffset] + '\n').slice(0, column)).length;
  padSize = (currentLineOffset + 1 + postLines.length).toString(10).length;
  return [].slice.call(preLines).concat(['' + Array(padSize + 1).join('^') + ' :~' + Array(column).join('~') + '^'], [].slice.call(postLines)).join('\n');
};
this.beingDeclared = beingDeclared = function (assignment) {
  switch (false) {
  case !!(null != assignment):
    return [];
  case !assignment['instanceof'](CS.Identifiers):
    return [assignment.data];
  case !assignment['instanceof'](CS.Rest):
    return beingDeclared(assignment.expression);
  case !assignment['instanceof'](CS.MemberAccessOps):
    return [];
  case !assignment['instanceof'](CS.DefaultParam):
    return beingDeclared(assignment.param);
  case !assignment['instanceof'](CS.ArrayInitialiser):
    return concatMap(assignment.members, beingDeclared);
  case !assignment['instanceof'](CS.ObjectInitialiser):
    return concatMap(assignment.vals(), beingDeclared);
  default:
    throw new Error('beingDeclared: Non-exhaustive patterns in case: ' + assignment.className);
  }
};
this.declarationsFor = function (node, inScope) {
  var vars;
  vars = envEnrichments(node, inScope);
  return foldl(new CS.Undefined().g(), vars, function (expr, v) {
    return new CS.AssignOp(new CS.Identifier(v).g(), expr).g();
  });
};
usedAsExpression_ = function (ancestors) {
  var grandparent, parent;
  parent = ancestors[0];
  grandparent = ancestors[1];
  switch (false) {
  case !!(null != parent):
    return true;
  case !parent['instanceof'](CS.Program, CS.Class):
    return false;
  case !parent['instanceof'](CS.SeqOp):
    return this === parent.right && usedAsExpression(parent, ancestors.slice(1));
  case !(parent['instanceof'](CS.Block) && parent.statements.indexOf(this) !== parent.statements.length - 1):
    return false;
  case !(parent['instanceof'](CS.Functions) && parent.body === this && null != grandparent && grandparent['instanceof'](CS.Constructor)):
    return false;
  default:
    return true;
  }
};
this.usedAsExpression = usedAsExpression = function (node, ancestors) {
  return usedAsExpression_.call(node, ancestors);
};
envEnrichments_ = function (inScope) {
  var possibilities;
  if (null == inScope)
    inScope = [];
  possibilities = function () {
    var this$, this$1;
    switch (false) {
    case !this['instanceof'](CS.AssignOp):
      return nub(beingDeclared(this.assignee));
    case !this['instanceof'](CS.Class):
      return nub(concat([
        beingDeclared(this.nameAssignee),
        envEnrichments(this.parent),
        'undefined' !== typeof name && null != name ? [name] : []
      ]));
    case !this['instanceof'](CS.ForIn, CS.ForOf):
      return nub(concat([
        concatMap(this.childNodes, (this$ = this, function (child) {
          if (in$(child, this$.listMembers)) {
            return concatMap(this$[child], function (m) {
              return envEnrichments(m, inScope);
            });
          } else {
            return envEnrichments(this$[child], inScope);
          }
        })),
        beingDeclared(this.keyAssignee),
        beingDeclared(this.valAssignee)
      ]));
    case !this['instanceof'](CS.Functions):
      return [];
    default:
      return nub(concatMap(this.childNodes, (this$1 = this, function (child) {
        if (in$(child, this$1.listMembers)) {
          return concatMap(this$1[child], function (m) {
            return envEnrichments(m, inScope);
          });
        } else {
          return envEnrichments(this$1[child], inScope);
        }
      })));
    }
  }.call(this);
  return difference(possibilities, inScope);
};
this.envEnrichments = envEnrichments = function (node, args) {
  args = 2 <= arguments.length ? [].slice.call(arguments, 1) : [];
  if (null != node) {
    return envEnrichments_.apply(node, args);
  } else {
    return [];
  }
};
function in$(member, list) {
  for (var i = 0, length = list.length; i < length; ++i)
    if (i in list && list[i] === member)
      return true;
  return false;
}

});

require.define("/lib/coffee-script/functional-helpers.js",function(require,module,exports,__dirname,__filename,process,global){// Generated by CoffeeScript 2.0.0-dev
var concat, foldl, map, nub, span;
this.any = function (list, fn) {
  var e;
  for (var i$ = 0, length$ = list.length; i$ < length$; ++i$) {
    e = list[i$];
    if (fn(e))
      return true;
  }
  return false;
};
this.all = function (list, fn) {
  var e;
  for (var i$ = 0, length$ = list.length; i$ < length$; ++i$) {
    e = list[i$];
    if (!fn(e))
      return false;
  }
  return true;
};
this.foldl = foldl = function (memo, list, fn) {
  var i;
  for (var i$ = 0, length$ = list.length; i$ < length$; ++i$) {
    i = list[i$];
    memo = fn(memo, i);
  }
  return memo;
};
this.foldl1 = function (list, fn) {
  return foldl(list[0], list.slice(1), fn);
};
this.map = map = function (list, fn) {
  return function (accum$) {
    var e;
    for (var i$ = 0, length$ = list.length; i$ < length$; ++i$) {
      e = list[i$];
      accum$.push(fn(e));
    }
    return accum$;
  }.call(this, []);
};
this.concat = concat = function (list) {
  var cache$;
  return (cache$ = []).concat.apply(cache$, [].slice.call(list).concat());
};
this.concatMap = function (list, fn) {
  return concat(map(list, fn));
};
this.intersect = function (listA, listB) {
  return function (accum$) {
    var a;
    for (var i$ = 0, length$ = listA.length; i$ < length$; ++i$) {
      a = listA[i$];
      if (!in$(a, listB))
        continue;
      accum$.push(a);
    }
    return accum$;
  }.call(this, []);
};
this.difference = function (listA, listB) {
  return function (accum$) {
    var a;
    for (var i$ = 0, length$ = listA.length; i$ < length$; ++i$) {
      a = listA[i$];
      if (!!in$(a, listB))
        continue;
      accum$.push(a);
    }
    return accum$;
  }.call(this, []);
};
this.nub = nub = function (list) {
  var i, result;
  result = [];
  for (var i$ = 0, length$ = list.length; i$ < length$; ++i$) {
    i = list[i$];
    if (!!in$(i, result))
      continue;
    result.push(i);
  }
  return result;
};
this.union = function (listA, listB) {
  return listA.concat(function (accum$) {
    var b;
    for (var cache$ = nub(listB), i$ = 0, length$ = cache$.length; i$ < length$; ++i$) {
      b = cache$[i$];
      if (!!in$(b, listA))
        continue;
      accum$.push(b);
    }
    return accum$;
  }.call(this, []));
};
this.flip = function (fn) {
  return function (b, a) {
    return fn.call(this, a, b);
  };
};
this.owns = function (hop) {
  return function (a, b) {
    return hop.call(a, b);
  };
}({}.hasOwnProperty);
this.span = span = function (list, f) {
  var cache$, ys, zs;
  if (list.length === 0) {
    return [
      [],
      []
    ];
  } else if (f(list[0])) {
    cache$ = span(list.slice(1), f);
    ys = cache$[0];
    zs = cache$[1];
    return [
      [list[0]].concat([].slice.call(ys)),
      zs
    ];
  } else {
    return [
      [],
      list
    ];
  }
};
this.divMod = function (a, b) {
  var c, div, mod;
  c = a % b;
  mod = c < 0 ? c + b : c;
  div = Math.floor(a / b);
  return [
    div,
    mod
  ];
};
function in$(member, list) {
  for (var i = 0, length = list.length; i < length; ++i)
    if (i in list && list[i] === member)
      return true;
  return false;
}

});

require.define("/lib/coffee-script/nodes.js",function(require,module,exports,__dirname,__filename,process,global){// Generated by CoffeeScript 2.0.0-dev
var ArrayInitialiser, Block, Bool, Class, CompoundAssignOp, concat, concatMap, Conditional, createNodes, difference, exports, ForOf, FunctionApplications, Functions, GenSym, handleLists, handlePrimitives, HeregExp, Identifier, Identifiers, map, NegatedConditional, NewOp, Nodes, nub, ObjectInitialiser, Primitives, Range, RegExp, RegExps, Slice, StaticMemberAccessOps, Super, Switch, SwitchCase, union, While;
cache$ = require('./functional-helpers');
map = cache$.map;
concat = cache$.concat;
concatMap = cache$.concatMap;
difference = cache$.difference;
nub = cache$.nub;
union = cache$.union;
exports = null != ('undefined' !== typeof module && null != module ? module.exports : void 0) ? 'undefined' !== typeof module && null != module ? module.exports : void 0 : this;
createNodes = function (subclasses, superclasses) {
  var className, specs;
  if (null == superclasses)
    superclasses = [];
  for (className in subclasses) {
    if (!isOwn$(subclasses, className))
      continue;
    specs = subclasses[className];
    (function (className) {
      var isCategory, klass, params, superclass;
      superclass = null != superclasses[0] ? superclasses[0] : function () {
      };
      isCategory = 'undefined' !== typeof specs && null != specs && specs.length === 2;
      params = 'undefined' !== typeof specs && null != specs ? function () {
        switch (specs.length) {
        case 0:
          return [];
        case 1:
        case 2:
          return specs[0];
        }
      }.call(this) : null;
      if (null != params)
        params;
      else
        params = null != superclass.prototype.childNodes ? superclass.prototype.childNodes : [];
      klass = function (super$) {
        var externalCtor$;
        extends$(class$, super$);
        externalCtor$ = isCategory ? function () {
        } : function () {
          var i, param;
          for (var i$ = 0, length$ = params.length; i$ < length$; ++i$) {
            param = params[i$];
            i = i$;
            this[param] = arguments[i];
          }
          if (null != this.initialise)
            this.initialise.apply(this, arguments);
          return this;
        };
        function class$() {
          return externalCtor$.apply(this, arguments);
        }
        class$.prototype.className = className;
        class$.superclasses = superclasses;
        return class$;
      }(superclass);
      if (null != ('undefined' !== typeof specs && null != specs ? specs[0] : void 0))
        klass.prototype.childNodes = specs[0];
      if (isCategory)
        createNodes(specs[1], [klass].concat([].slice.call(superclasses)));
      return exports[className] = klass;
    }(className));
  }
};
createNodes({
  Nodes: [
    [],
    {
      BinOps: [
        [
          'left',
          'right'
        ],
        {
          AssignOps: [
            [
              'assignee',
              'expression'
            ],
            {
              AssignOp: null,
              ClassProtoAssignOp: null,
              CompoundAssignOp: [[
                  'op',
                  'assignee',
                  'expression'
                ]],
              ExistsAssignOp: null
            }
          ],
          BitOps: [
            null,
            {
              BitAndOp: null,
              BitOrOp: null,
              BitXorOp: null,
              LeftShiftOp: null,
              SignedRightShiftOp: null,
              UnsignedRightShiftOp: null
            }
          ],
          ComparisonOps: [
            null,
            {
              EQOp: null,
              GTEOp: null,
              GTOp: null,
              LTEOp: null,
              LTOp: null,
              NEQOp: null
            }
          ],
          ConcatOp: null,
          ExistsOp: null,
          ExtendsOp: null,
          InOp: null,
          InstanceofOp: null,
          LogicalOps: [
            null,
            {
              LogicalAndOp: null,
              LogicalOrOp: null
            }
          ],
          MathsOps: [
            null,
            {
              ExpOp: null,
              DivideOp: null,
              MultiplyOp: null,
              RemOp: null,
              SubtractOp: null
            }
          ],
          OfOp: null,
          PlusOp: null,
          Range: [[
              'isInclusive',
              'left',
              'right'
            ]],
          SeqOp: null
        }
      ],
      Statements: [
        [],
        {
          Break: null,
          Continue: null,
          Debugger: null,
          Return: [['expression']],
          Throw: [['expression']]
        }
      ],
      UnaryOps: [
        ['expression'],
        {
          BitNotOp: null,
          DeleteOp: null,
          DoOp: null,
          LogicalNotOp: null,
          NewOp: [[
              'ctor',
              'arguments'
            ]],
          PreDecrementOp: null,
          PreIncrementOp: null,
          PostDecrementOp: null,
          PostIncrementOp: null,
          TypeofOp: null,
          UnaryExistsOp: null,
          UnaryNegateOp: null,
          UnaryPlusOp: null
        }
      ],
      MemberAccessOps: [
        null,
        {
          StaticMemberAccessOps: [
            [
              'expression',
              'memberName'
            ],
            {
              MemberAccessOp: null,
              ProtoMemberAccessOp: null,
              SoakedMemberAccessOp: null,
              SoakedProtoMemberAccessOp: null
            }
          ],
          DynamicMemberAccessOps: [
            [
              'expression',
              'indexingExpr'
            ],
            {
              DynamicMemberAccessOp: null,
              DynamicProtoMemberAccessOp: null,
              SoakedDynamicMemberAccessOp: null,
              SoakedDynamicProtoMemberAccessOp: null
            }
          ]
        }
      ],
      ChainedComparisonOp: [['expression']],
      FunctionApplications: [
        [
          'function',
          'arguments'
        ],
        {
          FunctionApplication: null,
          SoakedFunctionApplication: null
        }
      ],
      Super: [['arguments']],
      Program: [['body']],
      Block: [['statements']],
      Conditional: [[
          'condition',
          'consequent',
          'alternate'
        ]],
      ForIn: [[
          'valAssignee',
          'keyAssignee',
          'target',
          'step',
          'filter',
          'body'
        ]],
      ForOf: [[
          'isOwn',
          'keyAssignee',
          'valAssignee',
          'target',
          'filter',
          'body'
        ]],
      Switch: [[
          'expression',
          'cases',
          'alternate'
        ]],
      SwitchCase: [[
          'conditions',
          'consequent'
        ]],
      Try: [[
          'body',
          'catchAssignee',
          'catchBody',
          'finallyBody'
        ]],
      While: [[
          'condition',
          'body'
        ]],
      ArrayInitialiser: [['members']],
      ObjectInitialiser: [['members']],
      ObjectInitialiserMember: [[
          'key',
          'expression'
        ]],
      Class: [[
          'nameAssignee',
          'parent',
          'ctor',
          'body',
          'boundMembers'
        ]],
      Constructor: [['expression']],
      Functions: [
        [
          'parameters',
          'body'
        ],
        {
          Function: null,
          BoundFunction: null
        }
      ],
      DefaultParam: [[
          'param',
          'default'
        ]],
      Identifiers: [
        ['data'],
        {
          Identifier: null,
          GenSym: null
        }
      ],
      Null: null,
      Primitives: [
        ['data'],
        {
          Bool: null,
          JavaScript: null,
          Numbers: [
            null,
            {
              Int: null,
              Float: null
            }
          ],
          String: null
        }
      ],
      RegExps: [
        null,
        {
          RegExp: [[
              'data',
              'flags'
            ]],
          HeregExp: [[
              'expression',
              'flags'
            ]]
        }
      ],
      This: null,
      Undefined: null,
      Slice: [[
          'expression',
          'isInclusive',
          'left',
          'right'
        ]],
      Rest: [['expression']],
      Spread: [['expression']]
    }
  ]
});
cache$1 = exports;
Nodes = cache$1.Nodes;
Primitives = cache$1.Primitives;
CompoundAssignOp = cache$1.CompoundAssignOp;
StaticMemberAccessOps = cache$1.StaticMemberAccessOps;
Range = cache$1.Range;
ArrayInitialiser = cache$1.ArrayInitialiser;
ObjectInitialiser = cache$1.ObjectInitialiser;
NegatedConditional = cache$1.NegatedConditional;
Conditional = cache$1.Conditional;
Identifier = cache$1.Identifier;
ForOf = cache$1.ForOf;
Functions = cache$1.Functions;
While = cache$1.While;
Class = cache$1.Class;
Block = cache$1.Block;
NewOp = cache$1.NewOp;
Bool = cache$1.Bool;
FunctionApplications = cache$1.FunctionApplications;
RegExps = cache$1.RegExps;
RegExp = cache$1.RegExp;
HeregExp = cache$1.HeregExp;
Super = cache$1.Super;
Slice = cache$1.Slice;
Switch = cache$1.Switch;
Identifiers = cache$1.Identifiers;
SwitchCase = cache$1.SwitchCase;
GenSym = cache$1.GenSym;
Nodes.fromJSON = function (json) {
  return exports[json.type].fromJSON(json);
};
Nodes.prototype.listMembers = [];
Nodes.prototype.toJSON = function () {
  var child, json;
  json = { type: this.className };
  if (null != this.line)
    json.line = this.line;
  if (null != this.column)
    json.column = this.column;
  if (null != this.raw) {
    json.raw = this.raw;
    if (null != this.offset)
      json.range = [
        this.offset,
        this.offset + this.raw.length
      ];
  }
  for (var i$ = 0, length$ = this.childNodes.length; i$ < length$; ++i$) {
    child = this.childNodes[i$];
    if (in$(child, this.listMembers)) {
      json[child] = function (accum$) {
        var p;
        for (var i$1 = 0, length$1 = this[child].length; i$1 < length$1; ++i$1) {
          p = this[child][i$1];
          accum$.push(p.toJSON());
        }
        return accum$;
      }.call(this, []);
    } else {
      json[child] = null != this[child] ? this[child].toJSON() : void 0;
    }
  }
  return json;
};
Nodes.prototype.fold = function (memo, fn) {
  var child;
  for (var i$ = 0, length$ = this.childNodes.length; i$ < length$; ++i$) {
    child = this.childNodes[i$];
    if (in$(child, this.listMembers)) {
      memo = function (accum$) {
        var p;
        for (var i$1 = 0, length$1 = this[child].length; i$1 < length$1; ++i$1) {
          p = this[child][i$1];
          accum$.push(p.fold(memo, fn));
        }
        return accum$;
      }.call(this, []);
    } else {
      memo = this[child].fold(memo, fn);
    }
  }
  return fn(memo, this);
};
Nodes.prototype.clone = function () {
  var ctor, k, n, v;
  ctor = function () {
  };
  ctor.prototype = this.constructor.prototype;
  n = new ctor;
  for (k in this) {
    if (!isOwn$(this, k))
      continue;
    v = this[k];
    n[k] = v;
  }
  return n;
};
Nodes.prototype['instanceof'] = function (ctors) {
  var ctor, superclasses;
  ctors = 1 <= arguments.length ? [].slice.call(arguments, 0) : [];
  superclasses = map(this.constructor.superclasses, function (c) {
    return c.prototype.className;
  });
  for (var i$ = 0, length$ = ctors.length; i$ < length$; ++i$) {
    ctor = ctors[i$];
    if (!in$(ctor.prototype.className, [this.className].concat([].slice.call(superclasses))))
      continue;
    return true;
  }
  return false;
};
Nodes.prototype.r = function (param$) {
  this.raw = param$;
  return this;
};
Nodes.prototype.p = function (param$, param$1, param$2) {
  this.line = param$;
  this.column = param$1;
  this.offset = param$2;
  return this;
};
Nodes.prototype.generated = false;
Nodes.prototype.g = function () {
  this.generated = true;
  return this;
};
handlePrimitives = function (ctor, primitives) {
  primitives = 2 <= arguments.length ? [].slice.call(arguments, 1) : [];
  ctor.prototype.childNodes = difference(ctor.prototype.childNodes, primitives);
  return ctor.prototype.toJSON = function () {
    var json, primitive;
    json = Nodes.prototype.toJSON.call(this);
    for (var i$ = 0, length$ = primitives.length; i$ < length$; ++i$) {
      primitive = primitives[i$];
      json[primitive] = this[primitive];
    }
    return json;
  };
};
handlePrimitives(Class, 'boundMembers');
handlePrimitives(CompoundAssignOp, 'op');
handlePrimitives(ForOf, 'isOwn');
handlePrimitives(HeregExp, 'flags');
handlePrimitives(Identifiers, 'data');
handlePrimitives(Primitives, 'data');
handlePrimitives(Range, 'isInclusive');
handlePrimitives(RegExp, 'data', 'flags');
handlePrimitives(Slice, 'isInclusive');
handlePrimitives(StaticMemberAccessOps, 'memberName');
handleLists = function (ctor, listProps) {
  listProps = 2 <= arguments.length ? [].slice.call(arguments, 1) : [];
  return ctor.prototype.listMembers = listProps;
};
handleLists(ArrayInitialiser, 'members');
handleLists(Block, 'statements');
handleLists(Functions, 'parameters');
handleLists(FunctionApplications, 'arguments');
handleLists(NewOp, 'arguments');
handleLists(ObjectInitialiser, 'members');
handleLists(Super, 'arguments');
handleLists(Switch, 'cases');
handleLists(SwitchCase, 'conditions');
Block.wrap = function (s) {
  return new Block(null != s ? [s] : []).r(s.raw).p(s.line, s.column);
};
Class.prototype.initialise = function () {
  if (null != this.boundMembers)
    this.boundMembers;
  else
    this.boundMembers = [];
  this.name = new GenSym('class');
  if (null != this.nameAssignee)
    return this.name = function () {
      switch (false) {
      case !this.nameAssignee['instanceof'](Identifier):
        return new Identifier(this.nameAssignee.data);
      case !this.nameAssignee['instanceof'](StaticMemberAccessOps):
        return new Identifier(this.nameAssignee.memberName);
      default:
        return this.name;
      }
    }.call(this);
};
Class.prototype.childNodes.push('name');
ObjectInitialiser.prototype.keys = function () {
  return map(this.members, function (m) {
    return m.key;
  });
};
ObjectInitialiser.prototype.vals = function () {
  return map(this.members, function (m) {
    return m.expression;
  });
};
RegExps.prototype.initialise = function (_, flags) {
  var flag;
  this.flags = {};
  for (var cache$2 = [
        'g',
        'i',
        'm',
        'y'
      ], i$ = 0, length$ = cache$2.length; i$ < length$; ++i$) {
    flag = cache$2[i$];
    this.flags[flag] = in$(flag, flags);
  }
};
exports.NegatedConditional = function (super$) {
  extends$(NegatedConditional, super$);
  function NegatedConditional() {
    Conditional.apply(this, arguments);
  }
  return NegatedConditional;
}(Conditional);
exports.NegatedWhile = function (super$) {
  extends$(NegatedWhile, super$);
  function NegatedWhile() {
    While.apply(this, arguments);
  }
  return NegatedWhile;
}(While);
exports.Loop = function (super$) {
  extends$(Loop, super$);
  function Loop(body) {
    While.call(this, new Bool(true).g(), body);
  }
  return Loop;
}(While);
function isOwn$(o, p) {
  return {}.hasOwnProperty.call(o, p);
}
function extends$(child, parent) {
  var key;
  for (key in parent)
    if (isOwn$(parent, key))
      child[key] = parent[key];
  function ctor() {
    this.constructor = child;
  }
  ctor.prototype = parent.prototype;
  child.prototype = new ctor;
  child.__super__ = parent.prototype;
  return child;
}
function in$(member, list) {
  for (var i = 0, length = list.length; i < length; ++i)
    if (i in list && list[i] === member)
      return true;
  return false;
}

});

require.define("/lib/coffee-script/preprocessor.js",function(require,module,exports,__dirname,__filename,process,global){// Generated by CoffeeScript 2.0.0-dev
var EventEmitter, fs, inspect, pointToErrorLocation, Preprocessor, StringScanner;
fs = require('fs');
EventEmitter = require('events').EventEmitter;
pointToErrorLocation = require('./helpers').pointToErrorLocation;
StringScanner = require('StringScanner');
inspect = function (o) {
  return require('util').inspect(o, false, 9e9, true);
};
this.Preprocessor = Preprocessor = function (super$) {
  var DEDENT, INDENT, processInput, TERM, ws;
  extends$(Preprocessor, super$);
  ws = '\\t\\x0B\\f \\xA0\\u1680\\u180E\\u2000-\\u200A\\u202F\\u205F\\u3000\\uFEFF';
  INDENT = '\uefef';
  DEDENT = '\ueffe';
  TERM = '\uefff';
  function Preprocessor() {
    this.base = this.indent = null;
    this.context = [];
    this.context.peek = function () {
      if (this.length) {
        return this[this.length - 1];
      } else {
        return null;
      }
    };
    this.context.err = function (c) {
      throw new Error('Unexpected ' + inspect(c));
    };
    this.context.observe = function (c) {
      var top;
      top = this.peek();
      switch (c) {
      case '"""':
      case "'''":
      case '"':
      case "'":
      case '###':
      case '`':
      case '///':
      case '/':
        if (top === c) {
          this.pop();
        } else {
          this.push(c);
        }
        break;
      case INDENT:
      case '#':
      case '#{':
      case '[':
      case '(':
      case '{':
      case '\\':
      case 'regexp-[':
      case 'regexp-(':
      case 'regexp-{':
      case 'heregexp-#':
      case 'heregexp-[':
      case 'heregexp-(':
      case 'heregexp-{':
        this.push(c);
        break;
      case DEDENT:
        if (!(top === INDENT))
          this.err(c);
        this.pop();
        break;
      case '\n':
        if (!(top === '#' || top === 'heregexp-#'))
          this.err(c);
        this.pop();
        break;
      case ']':
        if (!(top === '[' || top === 'regexp-[' || top === 'heregexp-['))
          this.err(c);
        this.pop();
        break;
      case ')':
        if (!(top === '(' || top === 'regexp-(' || top === 'heregexp-('))
          this.err(c);
        this.pop();
        break;
      case '}':
        if (!(top === '#{' || top === '{' || top === 'regexp-{' || top === 'heregexp-{'))
          this.err(c);
        this.pop();
        break;
      case 'end-\\':
        if (!(top === '\\'))
          this.err(c);
        this.pop();
        break;
      default:
        throw new Error('undefined token observed: ' + c);
      }
      return this;
    };
    this.ss = new StringScanner('');
  }
  Preprocessor.prototype.p = function (s) {
    if (null != s)
      this.emit('data', s);
    return s;
  };
  Preprocessor.prototype.scan = function (r) {
    return this.p(this.ss.scan(r));
  };
  processInput = function (isEnd) {
    return function (data) {
      var context, delta, lastChar, level, lines, message, newLevel, nonIdentifierBefore, pos, spaceBefore, tok;
      if (!isEnd)
        this.ss.concat(data);
      while (!this.ss.eos()) {
        switch (this.context.peek()) {
        case null:
        case INDENT:
        case '#{':
        case '[':
        case '(':
        case '{':
          if (this.ss.bol() || this.scan(new RegExp('(?:[' + ws + ']*\\n)+'))) {
            this.scan(new RegExp('(?:[' + ws + ']*(\\#\\#?(?!\\#)[^\\n]*)?\\n)+'));
            if (!isEnd && null != this.ss.check(new RegExp('[' + ws + '\\n]*$')))
              return;
            if (null != this.base) {
              if (!(null != this.scan(this.base))) {
                throw new Error('inconsistent base indentation');
              }
            } else {
              this.base = new RegExp('' + this.scan(new RegExp('[' + ws + ']*')) + '');
            }
            if (null != this.indent) {
              level = function (accum$) {
                var c;
                for (var i$ = 0, length$ = this.context.length; i$ < length$; ++i$) {
                  c = this.context[i$];
                  if (!(c === INDENT))
                    continue;
                  accum$.push(0);
                }
                return accum$;
              }.call(this, []).length;
              if (this.ss.check(new RegExp('(?:' + this.indent + '){' + (level + 1) + '}[^' + ws + '#]'))) {
                this.scan(new RegExp('(?:' + this.indent + '){' + (level + 1) + '}'));
                this.context.observe(INDENT);
                this.p(INDENT);
              } else if (level > 0 && this.ss.check(new RegExp('(?:' + this.indent + '){0,' + (level - 1) + '}[^' + ws + ']'))) {
                newLevel = 0;
                while (this.scan(new RegExp('' + this.indent + ''))) {
                  ++newLevel;
                }
                delta = level - newLevel;
                while (delta--) {
                  this.context.observe(DEDENT);
                  this.p('' + DEDENT + TERM);
                }
              } else if (this.ss.check(new RegExp('(?:' + this.indent + '){' + level + '}[^' + ws + ']'))) {
                this.scan(new RegExp('(?:' + this.indent + '){' + level + '}'));
              } else {
                lines = this.ss.str.substr(0, this.ss.pos).split(/\n/) || [''];
                message = 'Syntax error on line ' + lines.length + ': invalid indentation';
                context = pointToErrorLocation(this.ss.str, lines.length, 1 + (level + 1) * this.indent.length);
                throw new Error('' + message + '\n' + context);
              }
            } else if (this.ss.check(new RegExp('[' + ws + ']+[^' + ws + '#]'))) {
              this.indent = this.scan(new RegExp('[' + ws + ']+'));
              this.context.observe(INDENT);
              this.p(INDENT);
            }
          }
          tok = function () {
            switch (this.context.peek()) {
            case '[':
              this.scan(/[^\n'"\\\/#`[({\]]+/);
              return this.scan(/\]/);
            case '(':
              this.scan(/[^\n'"\\\/#`[({)]+/);
              return this.scan(/\)/);
            case '#{':
            case '{':
              this.scan(/[^\n'"\\\/#`[({}]+/);
              return this.scan(/\}/);
            default: {
                this.scan(/[^\n'"\\\/#`[({]+/);
                return null;
              }
            }
          }.call(this);
          if (tok) {
            this.context.observe(tok);
            continue;
          }
          if (tok = this.scan(/"""|'''|\/\/\/|###|["'`#[({\\]/)) {
            this.context.observe(tok);
          } else if (tok = this.scan(/\//)) {
            pos = this.ss.position();
            if (pos > 1) {
              lastChar = this.ss.string()[pos - 2];
              spaceBefore = new RegExp('[' + ws + ']').test(lastChar);
              nonIdentifierBefore = /[\W_$]/.test(lastChar);
            }
            if (pos === 1 || (spaceBefore ? !this.ss.check(new RegExp('[' + ws + '=]')) : nonIdentifierBefore))
              this.context.observe('/');
          }
          break;
        case '\\':
          if (this.scan(/[\s\S]/))
            this.context.observe('end-\\');
          break;
        case '"""':
          this.scan(/(?:[^"#\\]+|""?(?!")|#(?!{)|\\.)+/);
          this.ss.scan(/\\\n/);
          if (tok = this.scan(/#{|"""/)) {
            this.context.observe(tok);
          } else if (tok = this.scan(/#{|"""/)) {
            this.context.observe(tok);
          }
          break;
        case '"':
          this.scan(/(?:[^"#\\]+|#(?!{)|\\.)+/);
          this.ss.scan(/\\\n/);
          if (tok = this.scan(/#{|"/))
            this.context.observe(tok);
          break;
        case "'''":
          this.scan(/(?:[^'\\]+|''?(?!')|\\.)+/);
          this.ss.scan(/\\\n/);
          if (tok = this.scan(/'''/))
            this.context.observe(tok);
          break;
        case "'":
          this.scan(/(?:[^'\\]+|\\.)+/);
          this.ss.scan(/\\\n/);
          if (tok = this.scan(/'/))
            this.context.observe(tok);
          break;
        case '###':
          this.scan(/(?:[^#]+|##?(?!#))+/);
          if (tok = this.scan(/###/))
            this.context.observe(tok);
          break;
        case '#':
          this.scan(/[^\n]+/);
          if (tok = this.scan(/\n/))
            this.context.observe(tok);
          break;
        case '`':
          this.scan(/[^`]+/);
          if (tok = this.scan(/`/))
            this.context.observe(tok);
          break;
        case '///':
          this.scan(/(?:[^[/#\\]+|\/\/?(?!\/)|\\.)+/);
          if (tok = this.scan(/#{|\/\/\/|\\/)) {
            this.context.observe(tok);
          } else if (this.ss.scan(/#/)) {
            this.context.observe('heregexp-#');
          } else if (tok = this.scan(/[\[]/)) {
            this.context.observe('heregexp-' + tok);
          }
          break;
        case 'heregexp-[':
          this.scan(/(?:[^\]\/\\]+|\/\/?(?!\/))+/);
          if (tok = this.scan(/[\]\\]|#{|\/\/\//))
            this.context.observe(tok);
          break;
        case 'heregexp-#':
          this.ss.scan(/(?:[^\n/]+|\/\/?(?!\/))+/);
          if (tok = this.scan(/\n|\/\/\//))
            this.context.observe(tok);
          break;
        case '/':
          this.scan(/[^[/\\]+/);
          if (tok = this.scan(/[\/\\]/)) {
            this.context.observe(tok);
          } else if (tok = this.scan(/\[/)) {
            this.context.observe('regexp-' + tok);
          }
          break;
        case 'regexp-[':
          this.scan(/[^\]\\]+/);
          if (tok = this.scan(/[\]\\]/))
            this.context.observe(tok);
        }
      }
      if (isEnd) {
        this.scan(new RegExp('[' + ws + '\\n]*$'));
        while (this.context.length && INDENT === this.context.peek()) {
          this.context.observe(DEDENT);
          this.p('' + DEDENT + TERM);
        }
        if (this.context.length)
          throw new Error('Unclosed ' + inspect(this.context.peek()) + ' at EOF');
        this.emit('end');
        return;
      }
    };
  };
  Preprocessor.prototype.processData = processInput(false);
  Preprocessor.prototype.processEnd = processInput(true);
  Preprocessor.processSync = function (input) {
    var output, pre;
    pre = new Preprocessor;
    output = '';
    pre.emit = function (type, data) {
      if (type === 'data')
        return output += data;
    };
    pre.processData(input);
    pre.processEnd();
    return output;
  };
  return Preprocessor;
}(EventEmitter);
function isOwn$(o, p) {
  return {}.hasOwnProperty.call(o, p);
}
function extends$(child, parent) {
  var key;
  for (key in parent)
    if (isOwn$(parent, key))
      child[key] = parent[key];
  function ctor() {
    this.constructor = child;
  }
  ctor.prototype = parent.prototype;
  child.prototype = new ctor;
  child.__super__ = parent.prototype;
  return child;
}

});

require.define("events",function(require,module,exports,__dirname,__filename,process,global){if (!process.EventEmitter) process.EventEmitter = function () {};

var EventEmitter = exports.EventEmitter = process.EventEmitter;
var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    }
;
function indexOf (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (x === xs[i]) return i;
    }
    return -1;
}

// By default EventEmitters will print a warning if more than
// 10 listeners are added to it. This is a useful default which
// helps finding memory leaks.
//
// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
var defaultMaxListeners = 10;
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!this._events) this._events = {};
  this._events.maxListeners = n;
};


EventEmitter.prototype.emit = function(type) {
  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  var handler = this._events[type];
  if (!handler) return false;

  if (typeof handler == 'function') {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        var args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
    return true;

  } else if (isArray(handler)) {
    var args = Array.prototype.slice.call(arguments, 1);

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  } else {
    return false;
  }
};

// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
EventEmitter.prototype.addListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit('newListener', type, listener);

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {

    // Check for listener leak
    if (!this._events[type].warned) {
      var m;
      if (this._events.maxListeners !== undefined) {
        m = this._events.maxListeners;
      } else {
        m = defaultMaxListeners;
      }

      if (m && m > 0 && this._events[type].length > m) {
        this._events[type].warned = true;
        console.error('(node) warning: possible EventEmitter memory ' +
                      'leak detected. %d listeners added. ' +
                      'Use emitter.setMaxListeners() to increase limit.',
                      this._events[type].length);
        console.trace();
      }
    }

    // If we've already got an array, just append.
    this._events[type].push(listener);
  } else {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  var self = this;
  self.on(type, function g() {
    self.removeListener(type, g);
    listener.apply(this, arguments);
  });

  return this;
};

EventEmitter.prototype.removeListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = indexOf(list, listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter.prototype.listeners = function(type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

});

require.define("/node_modules/StringScanner/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./lib/StringScanner"}
});

require.define("/node_modules/StringScanner/lib/StringScanner.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
  var StringScanner;
  StringScanner = (function() {
    function StringScanner(str) {
      this.str = str != null ? str : '';
      this.str = '' + this.str;
      this.pos = 0;
      this.lastMatch = {
        reset: function() {
          this.str = null;
          this.captures = [];
          return this;
        }
      }.reset();
      this;
    }
    StringScanner.prototype.bol = function() {
      return this.pos <= 0 || (this.str[this.pos - 1] === "\n");
    };
    StringScanner.prototype.captures = function() {
      return this.lastMatch.captures;
    };
    StringScanner.prototype.check = function(pattern) {
      var matches;
      if (this.str.substr(this.pos).search(pattern) !== 0) {
        this.lastMatch.reset();
        return null;
      }
      matches = this.str.substr(this.pos).match(pattern);
      this.lastMatch.str = matches[0];
      this.lastMatch.captures = matches.slice(1);
      return this.lastMatch.str;
    };
    StringScanner.prototype.checkUntil = function(pattern) {
      var matches, patternPos;
      patternPos = this.str.substr(this.pos).search(pattern);
      if (patternPos < 0) {
        this.lastMatch.reset();
        return null;
      }
      matches = this.str.substr(this.pos + patternPos).match(pattern);
      this.lastMatch.captures = matches.slice(1);
      return this.lastMatch.str = this.str.substr(this.pos, patternPos) + matches[0];
    };
    StringScanner.prototype.clone = function() {
      var clone, prop, value, _ref;
      clone = new this.constructor(this.str);
      clone.pos = this.pos;
      clone.lastMatch = {};
      _ref = this.lastMatch;
      for (prop in _ref) {
        value = _ref[prop];
        clone.lastMatch[prop] = value;
      }
      return clone;
    };
    StringScanner.prototype.concat = function(str) {
      this.str += str;
      return this;
    };
    StringScanner.prototype.eos = function() {
      return this.pos === this.str.length;
    };
    StringScanner.prototype.exists = function(pattern) {
      var matches, patternPos;
      patternPos = this.str.substr(this.pos).search(pattern);
      if (patternPos < 0) {
        this.lastMatch.reset();
        return null;
      }
      matches = this.str.substr(this.pos + patternPos).match(pattern);
      this.lastMatch.str = matches[0];
      this.lastMatch.captures = matches.slice(1);
      return patternPos;
    };
    StringScanner.prototype.getch = function() {
      return this.scan(/./);
    };
    StringScanner.prototype.match = function() {
      return this.lastMatch.str;
    };
    StringScanner.prototype.matches = function(pattern) {
      this.check(pattern);
      return this.matchSize();
    };
    StringScanner.prototype.matched = function() {
      return this.lastMatch.str != null;
    };
    StringScanner.prototype.matchSize = function() {
      if (this.matched()) {
        return this.match().length;
      } else {
        return null;
      }
    };
    StringScanner.prototype.peek = function(len) {
      return this.str.substr(this.pos, len);
    };
    StringScanner.prototype.pointer = function() {
      return this.pos;
    };
    StringScanner.prototype.setPointer = function(pos) {
      pos = +pos;
      if (pos < 0) {
        pos = 0;
      }
      if (pos > this.str.length) {
        pos = this.str.length;
      }
      return this.pos = pos;
    };
    StringScanner.prototype.reset = function() {
      this.lastMatch.reset();
      this.pos = 0;
      return this;
    };
    StringScanner.prototype.rest = function() {
      return this.str.substr(this.pos);
    };
    StringScanner.prototype.scan = function(pattern) {
      var chk;
      chk = this.check(pattern);
      if (chk != null) {
        this.pos += chk.length;
      }
      return chk;
    };
    StringScanner.prototype.scanUntil = function(pattern) {
      var chk;
      chk = this.checkUntil(pattern);
      if (chk != null) {
        this.pos += chk.length;
      }
      return chk;
    };
    StringScanner.prototype.skip = function(pattern) {
      this.scan(pattern);
      return this.matchSize();
    };
    StringScanner.prototype.skipUntil = function(pattern) {
      this.scanUntil(pattern);
      return this.matchSize();
    };
    StringScanner.prototype.string = function() {
      return this.str;
    };
    StringScanner.prototype.terminate = function() {
      this.pos = this.str.length;
      this.lastMatch.reset();
      return this;
    };
    StringScanner.prototype.toString = function() {
      return "#<StringScanner " + (this.eos() ? 'fin' : "" + this.pos + "/" + this.str.length + " @ " + (this.str.length > 8 ? "" + (this.str.substr(0, 5)) + "..." : this.str)) + ">";
    };
    return StringScanner;
  })();
  StringScanner.prototype.beginningOfLine = StringScanner.prototype.bol;
  StringScanner.prototype.clear = StringScanner.prototype.terminate;
  StringScanner.prototype.dup = StringScanner.prototype.clone;
  StringScanner.prototype.endOfString = StringScanner.prototype.eos;
  StringScanner.prototype.exist = StringScanner.prototype.exists;
  StringScanner.prototype.getChar = StringScanner.prototype.getch;
  StringScanner.prototype.position = StringScanner.prototype.pointer;
  StringScanner.StringScanner = StringScanner;
  module.exports = StringScanner;
}).call(this);

});

require.define("util",function(require,module,exports,__dirname,__filename,process,global){var events = require('events');

exports.isArray = isArray;
exports.isDate = function(obj){return Object.prototype.toString.call(obj) === '[object Date]'};
exports.isRegExp = function(obj){return Object.prototype.toString.call(obj) === '[object RegExp]'};


exports.print = function () {};
exports.puts = function () {};
exports.debug = function() {};

exports.inspect = function(obj, showHidden, depth, colors) {
  var seen = [];

  var stylize = function(str, styleType) {
    // http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
    var styles =
        { 'bold' : [1, 22],
          'italic' : [3, 23],
          'underline' : [4, 24],
          'inverse' : [7, 27],
          'white' : [37, 39],
          'grey' : [90, 39],
          'black' : [30, 39],
          'blue' : [34, 39],
          'cyan' : [36, 39],
          'green' : [32, 39],
          'magenta' : [35, 39],
          'red' : [31, 39],
          'yellow' : [33, 39] };

    var style =
        { 'special': 'cyan',
          'number': 'blue',
          'boolean': 'yellow',
          'undefined': 'grey',
          'null': 'bold',
          'string': 'green',
          'date': 'magenta',
          // "name": intentionally not styling
          'regexp': 'red' }[styleType];

    if (style) {
      return '\033[' + styles[style][0] + 'm' + str +
             '\033[' + styles[style][1] + 'm';
    } else {
      return str;
    }
  };
  if (! colors) {
    stylize = function(str, styleType) { return str; };
  }

  function format(value, recurseTimes) {
    // Provide a hook for user-specified inspect functions.
    // Check that value is an object with an inspect function on it
    if (value && typeof value.inspect === 'function' &&
        // Filter out the util module, it's inspect function is special
        value !== exports &&
        // Also filter out any prototype objects using the circular check.
        !(value.constructor && value.constructor.prototype === value)) {
      return value.inspect(recurseTimes);
    }

    // Primitive types cannot have properties
    switch (typeof value) {
      case 'undefined':
        return stylize('undefined', 'undefined');

      case 'string':
        var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                                 .replace(/'/g, "\\'")
                                                 .replace(/\\"/g, '"') + '\'';
        return stylize(simple, 'string');

      case 'number':
        return stylize('' + value, 'number');

      case 'boolean':
        return stylize('' + value, 'boolean');
    }
    // For some reason typeof null is "object", so special case here.
    if (value === null) {
      return stylize('null', 'null');
    }

    // Look up the keys of the object.
    var visible_keys = Object_keys(value);
    var keys = showHidden ? Object_getOwnPropertyNames(value) : visible_keys;

    // Functions without properties can be shortcutted.
    if (typeof value === 'function' && keys.length === 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        var name = value.name ? ': ' + value.name : '';
        return stylize('[Function' + name + ']', 'special');
      }
    }

    // Dates without properties can be shortcutted
    if (isDate(value) && keys.length === 0) {
      return stylize(value.toUTCString(), 'date');
    }

    var base, type, braces;
    // Determine the object type
    if (isArray(value)) {
      type = 'Array';
      braces = ['[', ']'];
    } else {
      type = 'Object';
      braces = ['{', '}'];
    }

    // Make functions say that they are functions
    if (typeof value === 'function') {
      var n = value.name ? ': ' + value.name : '';
      base = (isRegExp(value)) ? ' ' + value : ' [Function' + n + ']';
    } else {
      base = '';
    }

    // Make dates with properties first say the date
    if (isDate(value)) {
      base = ' ' + value.toUTCString();
    }

    if (keys.length === 0) {
      return braces[0] + base + braces[1];
    }

    if (recurseTimes < 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        return stylize('[Object]', 'special');
      }
    }

    seen.push(value);

    var output = keys.map(function(key) {
      var name, str;
      if (value.__lookupGetter__) {
        if (value.__lookupGetter__(key)) {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Getter/Setter]', 'special');
          } else {
            str = stylize('[Getter]', 'special');
          }
        } else {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Setter]', 'special');
          }
        }
      }
      if (visible_keys.indexOf(key) < 0) {
        name = '[' + key + ']';
      }
      if (!str) {
        if (seen.indexOf(value[key]) < 0) {
          if (recurseTimes === null) {
            str = format(value[key]);
          } else {
            str = format(value[key], recurseTimes - 1);
          }
          if (str.indexOf('\n') > -1) {
            if (isArray(value)) {
              str = str.split('\n').map(function(line) {
                return '  ' + line;
              }).join('\n').substr(2);
            } else {
              str = '\n' + str.split('\n').map(function(line) {
                return '   ' + line;
              }).join('\n');
            }
          }
        } else {
          str = stylize('[Circular]', 'special');
        }
      }
      if (typeof name === 'undefined') {
        if (type === 'Array' && key.match(/^\d+$/)) {
          return str;
        }
        name = JSON.stringify('' + key);
        if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
          name = name.substr(1, name.length - 2);
          name = stylize(name, 'name');
        } else {
          name = name.replace(/'/g, "\\'")
                     .replace(/\\"/g, '"')
                     .replace(/(^"|"$)/g, "'");
          name = stylize(name, 'string');
        }
      }

      return name + ': ' + str;
    });

    seen.pop();

    var numLinesEst = 0;
    var length = output.reduce(function(prev, cur) {
      numLinesEst++;
      if (cur.indexOf('\n') >= 0) numLinesEst++;
      return prev + cur.length + 1;
    }, 0);

    if (length > 50) {
      output = braces[0] +
               (base === '' ? '' : base + '\n ') +
               ' ' +
               output.join(',\n  ') +
               ' ' +
               braces[1];

    } else {
      output = braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
    }

    return output;
  }
  return format(obj, (typeof depth === 'undefined' ? 2 : depth));
};


function isArray(ar) {
  return ar instanceof Array ||
         Array.isArray(ar) ||
         (ar && ar !== Object.prototype && isArray(ar.__proto__));
}


function isRegExp(re) {
  return re instanceof RegExp ||
    (typeof re === 'object' && Object.prototype.toString.call(re) === '[object RegExp]');
}


function isDate(d) {
  if (d instanceof Date) return true;
  if (typeof d !== 'object') return false;
  var properties = Date.prototype && Object_getOwnPropertyNames(Date.prototype);
  var proto = d.__proto__ && Object_getOwnPropertyNames(d.__proto__);
  return JSON.stringify(proto) === JSON.stringify(properties);
}

function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}

var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}

exports.log = function (msg) {};

exports.pump = null;

var Object_keys = Object.keys || function (obj) {
    var res = [];
    for (var key in obj) res.push(key);
    return res;
};

var Object_getOwnPropertyNames = Object.getOwnPropertyNames || function (obj) {
    var res = [];
    for (var key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) res.push(key);
    }
    return res;
};

var Object_create = Object.create || function (prototype, properties) {
    // from es5-shim
    var object;
    if (prototype === null) {
        object = { '__proto__' : null };
    }
    else {
        if (typeof prototype !== 'object') {
            throw new TypeError(
                'typeof prototype[' + (typeof prototype) + '] != \'object\''
            );
        }
        var Type = function () {};
        Type.prototype = prototype;
        object = new Type();
        object.__proto__ = prototype;
    }
    if (typeof properties !== 'undefined' && Object.defineProperties) {
        Object.defineProperties(object, properties);
    }
    return object;
};

exports.inherits = function(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object_create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
};

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (typeof f !== 'string') {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(exports.inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j': return JSON.stringify(args[i++]);
      default:
        return x;
    }
  });
  for(var x = args[i]; i < len; x = args[++i]){
    if (x === null || typeof x !== 'object') {
      str += ' ' + x;
    } else {
      str += ' ' + exports.inspect(x);
    }
  }
  return str;
};

});

require.define("/lib/coffee-script/parser.js",function(require,module,exports,__dirname,__filename,process,global){module.exports = (function(){
  /*
   * Generated by PEG.js 0.7.0.
   *
   * http://pegjs.majda.cz/
   */
  
  function subclass(child, parent) {
    function ctor() { this.constructor = child; }
    ctor.prototype = parent.prototype;
    child.prototype = new ctor();
  }
  
  function quote(s) {
    /*
     * ECMA-262, 5th ed., 7.8.4: All characters may appear literally in a
     * string literal except for the closing quote character, backslash,
     * carriage return, line separator, paragraph separator, and line feed.
     * Any character may appear in the form of an escape sequence.
     *
     * For portability, we also escape escape all control and non-ASCII
     * characters. Note that "\0" and "\v" escape sequences are not used
     * because JSHint does not like the first and IE the second.
     */
     return '"' + s
      .replace(/\\/g, '\\\\')  // backslash
      .replace(/"/g, '\\"')    // closing quote character
      .replace(/\x08/g, '\\b') // backspace
      .replace(/\t/g, '\\t')   // horizontal tab
      .replace(/\n/g, '\\n')   // line feed
      .replace(/\f/g, '\\f')   // form feed
      .replace(/\r/g, '\\r')   // carriage return
      .replace(/[\x00-\x07\x0B\x0E-\x1F\x80-\uFFFF]/g, escape)
      + '"';
  }
  
  var result = {
    /*
     * Parses the input with a generated parser. If the parsing is successful,
     * returns a value explicitly or implicitly specified by the grammar from
     * which the parser was generated (see |PEG.buildParser|). If the parsing is
     * unsuccessful, throws |PEG.parser.SyntaxError| describing the error.
     */
    parse: function(input) {
      var parseFunctions = {
        "program": parse_program
      };
      
      var options = arguments.length > 1 ? arguments[1] : {},
          startRule;
      
      if (options.startRule !== undefined) {
        startRule = options.startRule;
        
        if (parseFunctions[startRule] === undefined) {
          throw new Error("Can't start parsing from rule " + quote(startRule) + ".");
        }
      } else {
        startRule = "program";
      }
      
      var pos = 0;
      var reportedPos = 0;
      var cachedReportedPos = 0;
      var cachedReportedPosDetails = { line: 1, column: 1, seenCR: false };
      var reportFailures = 0;
      var rightmostFailuresPos = 0;
      var rightmostFailuresExpected = [];
      var cache = {};
      
      function padLeft(input, padding, length) {
        var result = input;
        
        var padLength = length - input.length;
        for (var i = 0; i < padLength; i++) {
          result = padding + result;
        }
        
        return result;
      }
      
      function escape(ch) {
        var charCode = ch.charCodeAt(0);
        var escapeChar;
        var length;
        
        if (charCode <= 0xFF) {
          escapeChar = 'x';
          length = 2;
        } else {
          escapeChar = 'u';
          length = 4;
        }
        
        return '\\' + escapeChar + padLeft(charCode.toString(16).toUpperCase(), '0', length);
      }
      
      function computeReportedPosDetails() {
        function advanceCachedReportedPos() {
          var ch;
          
          for (; cachedReportedPos < reportedPos; cachedReportedPos++) {
            ch = input.charAt(cachedReportedPos);
            if (ch === "\n") {
              if (!cachedReportedPosDetails.seenCR) { cachedReportedPosDetails.line++; }
              cachedReportedPosDetails.column = 1;
              cachedReportedPosDetails.seenCR = false;
            } else if (ch === "\r" || ch === "\u2028" || ch === "\u2029") {
              cachedReportedPosDetails.line++;
              cachedReportedPosDetails.column = 1;
              cachedReportedPosDetails.seenCR = true;
            } else {
              cachedReportedPosDetails.column++;
              cachedReportedPosDetails.seenCR = false;
            }
          }
        }
        
        if (cachedReportedPos !== reportedPos) {
          if (cachedReportedPos > reportedPos) {
            cachedReportedPos = 0;
            cachedReportedPosDetails = { line: 1, column: 1, seenCR: false };
          }
          advanceCachedReportedPos();
        }
        
        return cachedReportedPosDetails;
      }
      
      function text() {
        return input.substring(reportedPos, pos);
      }
      
      function offset() {
        return reportedPos;
      }
      
      function line() {
        return computeReportedPosDetails().line;
      }
      
      function column() {
        return computeReportedPosDetails().column;
      }
      
      function matchFailed(failure) {
        if (pos < rightmostFailuresPos) {
          return;
        }
        
        if (pos > rightmostFailuresPos) {
          rightmostFailuresPos = pos;
          rightmostFailuresExpected = [];
        }
        
        rightmostFailuresExpected.push(failure);
      }
      
      function parse_program() {
        var cacheKey = "program@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_TERMINATOR();
        r3 = r3 !== null ? r3 : "";
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_toplevelBlock();
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(leader, b) {
              return rp(new CS.Program(b || null));
            })(r3, r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_toplevelBlock() {
        var cacheKey = "toplevelBlock@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_toplevelStatement();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            r8 = parse_TERMINATOR();
            if (r8 !== null) {
              r9 = parse__();
              if (r9 !== null) {
                r10 = parse_toplevelStatement();
                if (r10 !== null) {
                  r5 = [r7, r8, r9, r10];
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              r8 = parse_TERMINATOR();
              if (r8 !== null) {
                r9 = parse__();
                if (r9 !== null) {
                  r10 = parse_toplevelStatement();
                  if (r10 !== null) {
                    r5 = [r7, r8, r9, r10];
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r5 = parse_TERMINATOR();
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(s, ss) {
              return rp(new CS.Block([s].concat(ss.map(function(s){ return s[3]; }))));
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_toplevelStatement() {
        var cacheKey = "toplevelStatement@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        r2 = pos;
        r4 = pos;
        reportFailures++;
        r3 = parse_return();
        if (r3 === null) {
          r3 = parse_continue();
          if (r3 === null) {
            r3 = parse_break();
          }
        }
        reportFailures--;
        if (r3 === null) {
          r3 = "";
        } else {
          r3 = null;
          pos = r4;
        }
        if (r3 !== null) {
          r4 = parse_statement();
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(s) { return s; })(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_block() {
        var cacheKey = "block@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_statement();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            r8 = parse_TERMINATOR();
            if (r8 !== null) {
              r9 = parse__();
              if (r9 !== null) {
                r10 = parse_statement();
                if (r10 !== null) {
                  r5 = [r7, r8, r9, r10];
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              r8 = parse_TERMINATOR();
              if (r8 !== null) {
                r9 = parse__();
                if (r9 !== null) {
                  r10 = parse_statement();
                  if (r10 !== null) {
                    r5 = [r7, r8, r9, r10];
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r5 = parse_TERMINATOR();
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(s, ss) {
              return rp(new CS.Block([s].concat(ss.map(function(s){ return s[3]; }))));
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_statement() {
        var cacheKey = "statement@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        r0 = parse_expression();
        if (r0 === null) {
          r0 = parse_return();
          if (r0 === null) {
            r0 = parse_continue();
            if (r0 === null) {
              r0 = parse_break();
              if (r0 === null) {
                r0 = parse_throw();
                if (r0 === null) {
                  r0 = parse_debugger();
                }
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_expression() {
        var cacheKey = "expression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        r0 = parse_expressionworthy();
        if (r0 === null) {
          r0 = parse_seqExpression();
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_secondaryStatement() {
        var cacheKey = "secondaryStatement@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        r0 = parse_secondaryExpression();
        if (r0 === null) {
          r0 = parse_return();
          if (r0 === null) {
            r0 = parse_continue();
            if (r0 === null) {
              r0 = parse_break();
              if (r0 === null) {
                r0 = parse_throw();
                if (r0 === null) {
                  r0 = parse_debugger();
                }
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_secondaryExpression() {
        var cacheKey = "secondaryExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        r0 = parse_expressionworthy();
        if (r0 === null) {
          r0 = parse_assignmentExpression();
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_expressionworthy() {
        var cacheKey = "expressionworthy@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        r0 = parse_functionLiteral();
        if (r0 === null) {
          r0 = parse_conditional();
          if (r0 === null) {
            r0 = parse_while();
            if (r0 === null) {
              r0 = parse_loop();
              if (r0 === null) {
                r0 = parse_try();
                if (r0 === null) {
                  r0 = parse_forOf();
                  if (r0 === null) {
                    r0 = parse_forIn();
                    if (r0 === null) {
                      r0 = parse_class();
                      if (r0 === null) {
                        r0 = parse_switch();
                        if (r0 === null) {
                          r0 = parse_implicitObjectLiteral();
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_seqExpression() {
        var cacheKey = "seqExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_postfixControlFlowExpression();
        if (r3 !== null) {
          r5 = pos;
          r6 = parse__();
          if (r6 !== null) {
            if (input.charCodeAt(pos) === 59) {
              r7 = ";";
              pos++;
            } else {
              r7 = null;
              if (reportFailures === 0) {
                matchFailed("\";\"");
              }
            }
            if (r7 !== null) {
              r8 = parse_TERMINATOR();
              r8 = r8 !== null ? r8 : "";
              if (r8 !== null) {
                r9 = parse__();
                if (r9 !== null) {
                  r10 = parse_expression();
                  if (r10 !== null) {
                    r4 = [r6, r7, r8, r9, r10];
                  } else {
                    r4 = null;
                    pos = r5;
                  }
                } else {
                  r4 = null;
                  pos = r5;
                }
              } else {
                r4 = null;
                pos = r5;
              }
            } else {
              r4 = null;
              pos = r5;
            }
          } else {
            r4 = null;
            pos = r5;
          }
          r4 = r4 !== null ? r4 : "";
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(left, right) {
              if(!right) return left;
              return rp(new CS.SeqOp(left, right[4]));
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_postfixControlFlowExpression() {
        var cacheKey = "postfixControlFlowExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_secondaryStatement();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            r8 = parse_postfixControlFlowOp();
            if (r8 !== null) {
              r5 = [r7, r8];
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              r8 = parse_postfixControlFlowOp();
              if (r8 !== null) {
                r5 = [r7, r8];
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(expr, postfixes) {
              return foldl(function(expr, postfixContainer){
                var constructor, cond,
                    postfix = postfixContainer[1],
                    indicator = postfix.type;
                switch(indicator){
                  case 'if':
                  case 'unless':
                    constructor = ('unless' === indicator) ? CS.NegatedConditional : CS.Conditional;
                    cond = ('unless' === indicator) ? new CS.LogicalNotOp(postfix.cond).g() : postfix.cond;
                    return rp(new constructor(cond, expr, null));
                  case 'while':
                  case 'until':
                    constructor = ('unless' === indicator) ? CS.NegatedWhile : CS.While;
                    cond = ('unless' === indicator) ? new CS.LogicalNotOp(postfix.cond).g() : postfix.cond;
                    return rp(new constructor(cond, expr));
                  case 'for-in':
                    return rp(new CS.ForIn(postfix.val, postfix.key, postfix.list, postfix.step, postfix.filter, expr));
                  case 'for-of':
                    return rp(new CS.ForOf(postfix.own, postfix.key, postfix.val, postfix.obj, postfix.filter, expr));
                }
              }, expr, postfixes)
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_postfixControlFlowOp() {
        var cacheKey = "postfixControlFlowOp@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_IF();
        if (r3 === null) {
          r3 = parse_UNLESS();
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_assignmentExpression();
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(kw, e) { return {type: kw, cond: e}; })(r3, r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r3 = parse_WHILE();
          if (r3 === null) {
            r3 = parse_UNTIL();
          }
          if (r3 !== null) {
            r4 = parse__();
            if (r4 !== null) {
              r5 = parse_assignmentExpression();
              if (r5 !== null) {
                r0 = [r3, r4, r5];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(kw, e) { return {type: kw, cond: e}; })(r3, r5);
          }
          if (r0 === null) {
            pos = r1;
          }
          if (r0 === null) {
            r1 = pos;
            r2 = pos;
            r3 = parse_FOR();
            if (r3 !== null) {
              r4 = parse__();
              if (r4 !== null) {
                r5 = parse_Assignable();
                if (r5 !== null) {
                  r6 = parse__();
                  if (r6 !== null) {
                    r8 = pos;
                    if (input.charCodeAt(pos) === 44) {
                      r9 = ",";
                      pos++;
                    } else {
                      r9 = null;
                      if (reportFailures === 0) {
                        matchFailed("\",\"");
                      }
                    }
                    if (r9 !== null) {
                      r10 = parse__();
                      if (r10 !== null) {
                        r11 = parse_Assignable();
                        if (r11 !== null) {
                          r12 = parse__();
                          if (r12 !== null) {
                            r7 = [r9, r10, r11, r12];
                          } else {
                            r7 = null;
                            pos = r8;
                          }
                        } else {
                          r7 = null;
                          pos = r8;
                        }
                      } else {
                        r7 = null;
                        pos = r8;
                      }
                    } else {
                      r7 = null;
                      pos = r8;
                    }
                    r7 = r7 !== null ? r7 : "";
                    if (r7 !== null) {
                      r8 = parse_IN();
                      if (r8 !== null) {
                        r9 = parse__();
                        if (r9 !== null) {
                          r10 = parse_assignmentExpression();
                          if (r10 !== null) {
                            r12 = pos;
                            r13 = parse__();
                            if (r13 !== null) {
                              r14 = parse_BY();
                              if (r14 !== null) {
                                r15 = parse__();
                                if (r15 !== null) {
                                  r16 = parse_assignmentExpression();
                                  if (r16 !== null) {
                                    r11 = [r13, r14, r15, r16];
                                  } else {
                                    r11 = null;
                                    pos = r12;
                                  }
                                } else {
                                  r11 = null;
                                  pos = r12;
                                }
                              } else {
                                r11 = null;
                                pos = r12;
                              }
                            } else {
                              r11 = null;
                              pos = r12;
                            }
                            r11 = r11 !== null ? r11 : "";
                            if (r11 !== null) {
                              r13 = pos;
                              r14 = parse__();
                              if (r14 !== null) {
                                r15 = parse_WHEN();
                                if (r15 !== null) {
                                  r16 = parse__();
                                  if (r16 !== null) {
                                    r17 = parse_assignmentExpression();
                                    if (r17 !== null) {
                                      r12 = [r14, r15, r16, r17];
                                    } else {
                                      r12 = null;
                                      pos = r13;
                                    }
                                  } else {
                                    r12 = null;
                                    pos = r13;
                                  }
                                } else {
                                  r12 = null;
                                  pos = r13;
                                }
                              } else {
                                r12 = null;
                                pos = r13;
                              }
                              r12 = r12 !== null ? r12 : "";
                              if (r12 !== null) {
                                r0 = [r3, r4, r5, r6, r7, r8, r9, r10, r11, r12];
                              } else {
                                r0 = null;
                                pos = r2;
                              }
                            } else {
                              r0 = null;
                              pos = r2;
                            }
                          } else {
                            r0 = null;
                            pos = r2;
                          }
                        } else {
                          r0 = null;
                          pos = r2;
                        }
                      } else {
                        r0 = null;
                        pos = r2;
                      }
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
            if (r0 !== null) {
              reportedPos = r1;
              r0 = (function(val, maybeKey, list, maybeStep, maybeFilter) {
                    var key = maybeKey ? maybeKey[2] : null,
                        step = maybeStep ? maybeStep[3] : new CS.Int(1).r('1').g(),
                        filter = maybeFilter ? maybeFilter[3] : null;
                    return 0,
                      { type: 'for-in'
                      , val: val, key: key, list: list, step: step, filter: filter
                      };
                  })(r5, r7, r10, r11, r12);
            }
            if (r0 === null) {
              pos = r1;
            }
            if (r0 === null) {
              r1 = pos;
              r2 = pos;
              r3 = parse_FOR();
              if (r3 !== null) {
                r4 = parse__();
                if (r4 !== null) {
                  r6 = pos;
                  r7 = parse_OWN();
                  if (r7 !== null) {
                    r8 = parse__();
                    if (r8 !== null) {
                      r5 = [r7, r8];
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                  r5 = r5 !== null ? r5 : "";
                  if (r5 !== null) {
                    r6 = parse_Assignable();
                    if (r6 !== null) {
                      r7 = parse__();
                      if (r7 !== null) {
                        r9 = pos;
                        if (input.charCodeAt(pos) === 44) {
                          r10 = ",";
                          pos++;
                        } else {
                          r10 = null;
                          if (reportFailures === 0) {
                            matchFailed("\",\"");
                          }
                        }
                        if (r10 !== null) {
                          r11 = parse__();
                          if (r11 !== null) {
                            r12 = parse_Assignable();
                            if (r12 !== null) {
                              r13 = parse__();
                              if (r13 !== null) {
                                r8 = [r10, r11, r12, r13];
                              } else {
                                r8 = null;
                                pos = r9;
                              }
                            } else {
                              r8 = null;
                              pos = r9;
                            }
                          } else {
                            r8 = null;
                            pos = r9;
                          }
                        } else {
                          r8 = null;
                          pos = r9;
                        }
                        r8 = r8 !== null ? r8 : "";
                        if (r8 !== null) {
                          r9 = parse_OF();
                          if (r9 !== null) {
                            r10 = parse__();
                            if (r10 !== null) {
                              r11 = parse_assignmentExpression();
                              if (r11 !== null) {
                                r13 = pos;
                                r14 = parse__();
                                if (r14 !== null) {
                                  r15 = parse_WHEN();
                                  if (r15 !== null) {
                                    r16 = parse__();
                                    if (r16 !== null) {
                                      r17 = parse_assignmentExpression();
                                      if (r17 !== null) {
                                        r12 = [r14, r15, r16, r17];
                                      } else {
                                        r12 = null;
                                        pos = r13;
                                      }
                                    } else {
                                      r12 = null;
                                      pos = r13;
                                    }
                                  } else {
                                    r12 = null;
                                    pos = r13;
                                  }
                                } else {
                                  r12 = null;
                                  pos = r13;
                                }
                                r12 = r12 !== null ? r12 : "";
                                if (r12 !== null) {
                                  r0 = [r3, r4, r5, r6, r7, r8, r9, r10, r11, r12];
                                } else {
                                  r0 = null;
                                  pos = r2;
                                }
                              } else {
                                r0 = null;
                                pos = r2;
                              }
                            } else {
                              r0 = null;
                              pos = r2;
                            }
                          } else {
                            r0 = null;
                            pos = r2;
                          }
                        } else {
                          r0 = null;
                          pos = r2;
                        }
                      } else {
                        r0 = null;
                        pos = r2;
                      }
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
              if (r0 !== null) {
                reportedPos = r1;
                r0 = (function(maybeOwn, key, maybeVal, obj, maybeFilter) {
                      var own = !!maybeOwn,
                          val = maybeVal ? maybeVal[2] : null,
                          filter = maybeFilter ? maybeFilter[3] : null;
                      return 0,
                        { type: 'for-of'
                        , own: own, key: key, val: val, obj: obj, filter: filter
                        };
                    })(r5, r6, r8, r11, r12);
              }
              if (r0 === null) {
                pos = r1;
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_assignmentExpression() {
        var cacheKey = "assignmentExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        r0 = parse_assignmentOp();
        if (r0 === null) {
          r0 = parse_compoundAssignmentOp();
          if (r0 === null) {
            r0 = parse_existsAssignmentOp();
            if (r0 === null) {
              r0 = parse_logicalOrExpression();
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_assignmentOp() {
        var cacheKey = "assignmentOp@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_Assignable();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            if (input.charCodeAt(pos) === 61) {
              r5 = "=";
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\"=\"");
              }
            }
            if (r5 !== null) {
              r7 = pos;
              reportFailures++;
              if (input.charCodeAt(pos) === 61) {
                r6 = "=";
                pos++;
              } else {
                r6 = null;
                if (reportFailures === 0) {
                  matchFailed("\"=\"");
                }
              }
              reportFailures--;
              if (r6 === null) {
                r6 = "";
              } else {
                r6 = null;
                pos = r7;
              }
              if (r6 !== null) {
                r8 = pos;
                r9 = pos;
                r10 = parse_TERMINDENT();
                if (r10 !== null) {
                  r11 = parse_secondaryExpression();
                  if (r11 !== null) {
                    r12 = parse_DEDENT();
                    if (r12 !== null) {
                      r7 = [r10, r11, r12];
                    } else {
                      r7 = null;
                      pos = r9;
                    }
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                } else {
                  r7 = null;
                  pos = r9;
                }
                if (r7 !== null) {
                  reportedPos = r8;
                  r7 = (function(e) { return e; })(r11);
                }
                if (r7 === null) {
                  pos = r8;
                }
                if (r7 === null) {
                  r8 = pos;
                  r9 = pos;
                  r10 = parse_TERMINATOR();
                  r10 = r10 !== null ? r10 : "";
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      r12 = parse_secondaryExpression();
                      if (r12 !== null) {
                        r7 = [r10, r11, r12];
                      } else {
                        r7 = null;
                        pos = r9;
                      }
                    } else {
                      r7 = null;
                      pos = r9;
                    }
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                  if (r7 !== null) {
                    reportedPos = r8;
                    r7 = (function(e) { return e; })(r12);
                  }
                  if (r7 === null) {
                    pos = r8;
                  }
                }
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(left, right) {
                return rp(new CS.AssignOp(left, right));
              })(r3, r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_CompoundAssignmentOperators() {
        var cacheKey = "CompoundAssignmentOperators@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        if (input.substr(pos, 2) === "**") {
          r0 = "**";
          pos += 2;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("\"**\"");
          }
        }
        if (r0 === null) {
          if (input.charCodeAt(pos) === 42) {
            r0 = "*";
            pos++;
          } else {
            r0 = null;
            if (reportFailures === 0) {
              matchFailed("\"*\"");
            }
          }
          if (r0 === null) {
            if (input.charCodeAt(pos) === 47) {
              r0 = "/";
              pos++;
            } else {
              r0 = null;
              if (reportFailures === 0) {
                matchFailed("\"/\"");
              }
            }
            if (r0 === null) {
              if (input.charCodeAt(pos) === 37) {
                r0 = "%";
                pos++;
              } else {
                r0 = null;
                if (reportFailures === 0) {
                  matchFailed("\"%\"");
                }
              }
              if (r0 === null) {
                if (input.charCodeAt(pos) === 43) {
                  r0 = "+";
                  pos++;
                } else {
                  r0 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"+\"");
                  }
                }
                if (r0 === null) {
                  if (input.charCodeAt(pos) === 45) {
                    r0 = "-";
                    pos++;
                  } else {
                    r0 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"-\"");
                    }
                  }
                  if (r0 === null) {
                    if (input.substr(pos, 2) === "<<") {
                      r0 = "<<";
                      pos += 2;
                    } else {
                      r0 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"<<\"");
                      }
                    }
                    if (r0 === null) {
                      if (input.substr(pos, 3) === ">>>") {
                        r0 = ">>>";
                        pos += 3;
                      } else {
                        r0 = null;
                        if (reportFailures === 0) {
                          matchFailed("\">>>\"");
                        }
                      }
                      if (r0 === null) {
                        if (input.substr(pos, 2) === ">>") {
                          r0 = ">>";
                          pos += 2;
                        } else {
                          r0 = null;
                          if (reportFailures === 0) {
                            matchFailed("\">>\"");
                          }
                        }
                        if (r0 === null) {
                          r0 = parse_AND();
                          if (r0 === null) {
                            r0 = parse_OR();
                            if (r0 === null) {
                              if (input.substr(pos, 2) === "&&") {
                                r0 = "&&";
                                pos += 2;
                              } else {
                                r0 = null;
                                if (reportFailures === 0) {
                                  matchFailed("\"&&\"");
                                }
                              }
                              if (r0 === null) {
                                if (input.substr(pos, 2) === "||") {
                                  r0 = "||";
                                  pos += 2;
                                } else {
                                  r0 = null;
                                  if (reportFailures === 0) {
                                    matchFailed("\"||\"");
                                  }
                                }
                                if (r0 === null) {
                                  if (input.charCodeAt(pos) === 38) {
                                    r0 = "&";
                                    pos++;
                                  } else {
                                    r0 = null;
                                    if (reportFailures === 0) {
                                      matchFailed("\"&\"");
                                    }
                                  }
                                  if (r0 === null) {
                                    if (input.charCodeAt(pos) === 94) {
                                      r0 = "^";
                                      pos++;
                                    } else {
                                      r0 = null;
                                      if (reportFailures === 0) {
                                        matchFailed("\"^\"");
                                      }
                                    }
                                    if (r0 === null) {
                                      if (input.charCodeAt(pos) === 124) {
                                        r0 = "|";
                                        pos++;
                                      } else {
                                        r0 = null;
                                        if (reportFailures === 0) {
                                          matchFailed("\"|\"");
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_compoundAssignmentOp() {
        var cacheKey = "compoundAssignmentOp@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_CompoundAssignable();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_CompoundAssignmentOperators();
            if (r5 !== null) {
              if (input.charCodeAt(pos) === 61) {
                r6 = "=";
                pos++;
              } else {
                r6 = null;
                if (reportFailures === 0) {
                  matchFailed("\"=\"");
                }
              }
              if (r6 !== null) {
                r8 = pos;
                r9 = pos;
                r10 = parse_TERMINDENT();
                if (r10 !== null) {
                  r11 = parse_secondaryExpression();
                  if (r11 !== null) {
                    r12 = parse_DEDENT();
                    if (r12 !== null) {
                      r7 = [r10, r11, r12];
                    } else {
                      r7 = null;
                      pos = r9;
                    }
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                } else {
                  r7 = null;
                  pos = r9;
                }
                if (r7 !== null) {
                  reportedPos = r8;
                  r7 = (function(e) { return e; })(r11);
                }
                if (r7 === null) {
                  pos = r8;
                }
                if (r7 === null) {
                  r8 = pos;
                  r9 = pos;
                  r10 = parse_TERMINATOR();
                  r10 = r10 !== null ? r10 : "";
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      r12 = parse_secondaryExpression();
                      if (r12 !== null) {
                        r7 = [r10, r11, r12];
                      } else {
                        r7 = null;
                        pos = r9;
                      }
                    } else {
                      r7 = null;
                      pos = r9;
                    }
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                  if (r7 !== null) {
                    reportedPos = r8;
                    r7 = (function(e) { return e; })(r12);
                  }
                  if (r7 === null) {
                    pos = r8;
                  }
                }
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(left, op, right) {
                return rp(new CS.CompoundAssignOp(constructorLookup[op].prototype.className, left, right));
              })(r3, r5, r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_existsAssignmentOp() {
        var cacheKey = "existsAssignmentOp@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_CompoundAssignable();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            if (input.substr(pos, 2) === "?=") {
              r5 = "?=";
              pos += 2;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\"?=\"");
              }
            }
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r8 = pos;
                r9 = pos;
                r10 = parse_TERMINDENT();
                if (r10 !== null) {
                  r11 = parse_secondaryExpression();
                  if (r11 !== null) {
                    r12 = parse_DEDENT();
                    if (r12 !== null) {
                      r7 = [r10, r11, r12];
                    } else {
                      r7 = null;
                      pos = r9;
                    }
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                } else {
                  r7 = null;
                  pos = r9;
                }
                if (r7 !== null) {
                  reportedPos = r8;
                  r7 = (function(e) { return e; })(r11);
                }
                if (r7 === null) {
                  pos = r8;
                }
                if (r7 === null) {
                  r8 = pos;
                  r9 = pos;
                  r10 = parse_TERMINATOR();
                  r10 = r10 !== null ? r10 : "";
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      r12 = parse_secondaryExpression();
                      if (r12 !== null) {
                        r7 = [r10, r11, r12];
                      } else {
                        r7 = null;
                        pos = r9;
                      }
                    } else {
                      r7 = null;
                      pos = r9;
                    }
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                  if (r7 !== null) {
                    reportedPos = r8;
                    r7 = (function(e) { return e; })(r12);
                  }
                  if (r7 === null) {
                    pos = r8;
                  }
                }
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(left, right) {
                return rp(new CS.ExistsAssignOp(left, right));
              })(r3, r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_logicalOrExpression() {
        var cacheKey = "logicalOrExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_logicalAndExpression();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            if (input.substr(pos, 2) === "||") {
              r8 = "||";
              pos += 2;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("\"||\"");
              }
            }
            if (r8 === null) {
              r8 = parse_OR();
            }
            if (r8 !== null) {
              r10 = pos;
              reportFailures++;
              if (input.charCodeAt(pos) === 61) {
                r9 = "=";
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\"=\"");
                }
              }
              reportFailures--;
              if (r9 === null) {
                r9 = "";
              } else {
                r9 = null;
                pos = r10;
              }
              if (r9 !== null) {
                r10 = parse_TERMINATOR();
                r10 = r10 !== null ? r10 : "";
                if (r10 !== null) {
                  r11 = parse__();
                  if (r11 !== null) {
                    r12 = parse_expressionworthy();
                    if (r12 === null) {
                      r12 = parse_logicalAndExpression();
                    }
                    if (r12 !== null) {
                      r5 = [r7, r8, r9, r10, r11, r12];
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              if (input.substr(pos, 2) === "||") {
                r8 = "||";
                pos += 2;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\"||\"");
                }
              }
              if (r8 === null) {
                r8 = parse_OR();
              }
              if (r8 !== null) {
                r10 = pos;
                reportFailures++;
                if (input.charCodeAt(pos) === 61) {
                  r9 = "=";
                  pos++;
                } else {
                  r9 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"=\"");
                  }
                }
                reportFailures--;
                if (r9 === null) {
                  r9 = "";
                } else {
                  r9 = null;
                  pos = r10;
                }
                if (r9 !== null) {
                  r10 = parse_TERMINATOR();
                  r10 = r10 !== null ? r10 : "";
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      r12 = parse_expressionworthy();
                      if (r12 === null) {
                        r12 = parse_logicalAndExpression();
                      }
                      if (r12 !== null) {
                        r5 = [r7, r8, r9, r10, r11, r12];
                      } else {
                        r5 = null;
                        pos = r6;
                      }
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(left, rights) {
              if(!rights) return left;
              return foldl(function(expr, right){
                return rp(new CS.LogicalOrOp(expr, right[5]));
              }, left, rights);
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_logicalAndExpression() {
        var cacheKey = "logicalAndExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_bitwiseOrExpression();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            if (input.substr(pos, 2) === "&&") {
              r8 = "&&";
              pos += 2;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("\"&&\"");
              }
            }
            if (r8 === null) {
              r8 = parse_AND();
            }
            if (r8 !== null) {
              r10 = pos;
              reportFailures++;
              if (input.charCodeAt(pos) === 61) {
                r9 = "=";
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\"=\"");
                }
              }
              reportFailures--;
              if (r9 === null) {
                r9 = "";
              } else {
                r9 = null;
                pos = r10;
              }
              if (r9 !== null) {
                r10 = parse_TERMINATOR();
                r10 = r10 !== null ? r10 : "";
                if (r10 !== null) {
                  r11 = parse__();
                  if (r11 !== null) {
                    r12 = parse_expressionworthy();
                    if (r12 === null) {
                      r12 = parse_bitwiseOrExpression();
                    }
                    if (r12 !== null) {
                      r5 = [r7, r8, r9, r10, r11, r12];
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              if (input.substr(pos, 2) === "&&") {
                r8 = "&&";
                pos += 2;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\"&&\"");
                }
              }
              if (r8 === null) {
                r8 = parse_AND();
              }
              if (r8 !== null) {
                r10 = pos;
                reportFailures++;
                if (input.charCodeAt(pos) === 61) {
                  r9 = "=";
                  pos++;
                } else {
                  r9 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"=\"");
                  }
                }
                reportFailures--;
                if (r9 === null) {
                  r9 = "";
                } else {
                  r9 = null;
                  pos = r10;
                }
                if (r9 !== null) {
                  r10 = parse_TERMINATOR();
                  r10 = r10 !== null ? r10 : "";
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      r12 = parse_expressionworthy();
                      if (r12 === null) {
                        r12 = parse_bitwiseOrExpression();
                      }
                      if (r12 !== null) {
                        r5 = [r7, r8, r9, r10, r11, r12];
                      } else {
                        r5 = null;
                        pos = r6;
                      }
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(left, rights) {
              if(!rights) return left;
              return foldl(function(expr, right){
                return rp(new CS.LogicalAndOp(expr, right[5]));
              }, left, rights);
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_bitwiseOrExpression() {
        var cacheKey = "bitwiseOrExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_bitwiseXorExpression();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            if (input.charCodeAt(pos) === 124) {
              r8 = "|";
              pos++;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("\"|\"");
              }
            }
            if (r8 !== null) {
              r10 = pos;
              reportFailures++;
              if (input.charCodeAt(pos) === 61) {
                r9 = "=";
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\"=\"");
                }
              }
              reportFailures--;
              if (r9 === null) {
                r9 = "";
              } else {
                r9 = null;
                pos = r10;
              }
              if (r9 !== null) {
                r10 = parse_TERMINATOR();
                r10 = r10 !== null ? r10 : "";
                if (r10 !== null) {
                  r11 = parse__();
                  if (r11 !== null) {
                    r12 = parse_expressionworthy();
                    if (r12 === null) {
                      r12 = parse_bitwiseXorExpression();
                    }
                    if (r12 !== null) {
                      r5 = [r7, r8, r9, r10, r11, r12];
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              if (input.charCodeAt(pos) === 124) {
                r8 = "|";
                pos++;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\"|\"");
                }
              }
              if (r8 !== null) {
                r10 = pos;
                reportFailures++;
                if (input.charCodeAt(pos) === 61) {
                  r9 = "=";
                  pos++;
                } else {
                  r9 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"=\"");
                  }
                }
                reportFailures--;
                if (r9 === null) {
                  r9 = "";
                } else {
                  r9 = null;
                  pos = r10;
                }
                if (r9 !== null) {
                  r10 = parse_TERMINATOR();
                  r10 = r10 !== null ? r10 : "";
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      r12 = parse_expressionworthy();
                      if (r12 === null) {
                        r12 = parse_bitwiseXorExpression();
                      }
                      if (r12 !== null) {
                        r5 = [r7, r8, r9, r10, r11, r12];
                      } else {
                        r5 = null;
                        pos = r6;
                      }
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(left, rights) {
              if(!rights) return left;
              return foldl(function(expr, right){
                return rp(new CS.BitOrOp(expr, right[5]));
              }, left, rights);
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_bitwiseXorExpression() {
        var cacheKey = "bitwiseXorExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_bitwiseAndExpression();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            if (input.charCodeAt(pos) === 94) {
              r8 = "^";
              pos++;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("\"^\"");
              }
            }
            if (r8 !== null) {
              r10 = pos;
              reportFailures++;
              if (input.charCodeAt(pos) === 61) {
                r9 = "=";
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\"=\"");
                }
              }
              reportFailures--;
              if (r9 === null) {
                r9 = "";
              } else {
                r9 = null;
                pos = r10;
              }
              if (r9 !== null) {
                r10 = parse_TERMINATOR();
                r10 = r10 !== null ? r10 : "";
                if (r10 !== null) {
                  r11 = parse__();
                  if (r11 !== null) {
                    r12 = parse_expressionworthy();
                    if (r12 === null) {
                      r12 = parse_bitwiseAndExpression();
                    }
                    if (r12 !== null) {
                      r5 = [r7, r8, r9, r10, r11, r12];
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              if (input.charCodeAt(pos) === 94) {
                r8 = "^";
                pos++;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\"^\"");
                }
              }
              if (r8 !== null) {
                r10 = pos;
                reportFailures++;
                if (input.charCodeAt(pos) === 61) {
                  r9 = "=";
                  pos++;
                } else {
                  r9 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"=\"");
                  }
                }
                reportFailures--;
                if (r9 === null) {
                  r9 = "";
                } else {
                  r9 = null;
                  pos = r10;
                }
                if (r9 !== null) {
                  r10 = parse_TERMINATOR();
                  r10 = r10 !== null ? r10 : "";
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      r12 = parse_expressionworthy();
                      if (r12 === null) {
                        r12 = parse_bitwiseAndExpression();
                      }
                      if (r12 !== null) {
                        r5 = [r7, r8, r9, r10, r11, r12];
                      } else {
                        r5 = null;
                        pos = r6;
                      }
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(left, rights) {
              if(!rights) return left;
              return foldl(function(expr, right){
                return rp(new CS.BitXorOp(expr, right[5]));
              }, left, rights);
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_bitwiseAndExpression() {
        var cacheKey = "bitwiseAndExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_existentialExpression();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            if (input.charCodeAt(pos) === 38) {
              r8 = "&";
              pos++;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("\"&\"");
              }
            }
            if (r8 !== null) {
              r10 = pos;
              reportFailures++;
              if (input.charCodeAt(pos) === 61) {
                r9 = "=";
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\"=\"");
                }
              }
              reportFailures--;
              if (r9 === null) {
                r9 = "";
              } else {
                r9 = null;
                pos = r10;
              }
              if (r9 !== null) {
                r10 = parse_TERMINATOR();
                r10 = r10 !== null ? r10 : "";
                if (r10 !== null) {
                  r11 = parse__();
                  if (r11 !== null) {
                    r12 = parse_expressionworthy();
                    if (r12 === null) {
                      r12 = parse_existentialExpression();
                    }
                    if (r12 !== null) {
                      r5 = [r7, r8, r9, r10, r11, r12];
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              if (input.charCodeAt(pos) === 38) {
                r8 = "&";
                pos++;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\"&\"");
                }
              }
              if (r8 !== null) {
                r10 = pos;
                reportFailures++;
                if (input.charCodeAt(pos) === 61) {
                  r9 = "=";
                  pos++;
                } else {
                  r9 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"=\"");
                  }
                }
                reportFailures--;
                if (r9 === null) {
                  r9 = "";
                } else {
                  r9 = null;
                  pos = r10;
                }
                if (r9 !== null) {
                  r10 = parse_TERMINATOR();
                  r10 = r10 !== null ? r10 : "";
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      r12 = parse_expressionworthy();
                      if (r12 === null) {
                        r12 = parse_existentialExpression();
                      }
                      if (r12 !== null) {
                        r5 = [r7, r8, r9, r10, r11, r12];
                      } else {
                        r5 = null;
                        pos = r6;
                      }
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(left, rights) {
              if(!rights) return left;
              return foldl(function(expr, right){
                return rp(new CS.BitAndOp(expr, right[5]));
              }, left, rights);
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_existentialExpression() {
        var cacheKey = "existentialExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_comparisonExpression();
        if (r3 !== null) {
          r5 = pos;
          r6 = parse__();
          if (r6 !== null) {
            if (input.charCodeAt(pos) === 63) {
              r7 = "?";
              pos++;
            } else {
              r7 = null;
              if (reportFailures === 0) {
                matchFailed("\"?\"");
              }
            }
            if (r7 !== null) {
              r9 = pos;
              reportFailures++;
              if (input.charCodeAt(pos) === 61) {
                r8 = "=";
                pos++;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\"=\"");
                }
              }
              reportFailures--;
              if (r8 === null) {
                r8 = "";
              } else {
                r8 = null;
                pos = r9;
              }
              if (r8 !== null) {
                r9 = parse_TERMINATOR();
                r9 = r9 !== null ? r9 : "";
                if (r9 !== null) {
                  r10 = parse__();
                  if (r10 !== null) {
                    r11 = parse_expressionworthy();
                    if (r11 === null) {
                      r11 = parse_existentialExpression();
                    }
                    if (r11 !== null) {
                      r4 = [r6, r7, r8, r9, r10, r11];
                    } else {
                      r4 = null;
                      pos = r5;
                    }
                  } else {
                    r4 = null;
                    pos = r5;
                  }
                } else {
                  r4 = null;
                  pos = r5;
                }
              } else {
                r4 = null;
                pos = r5;
              }
            } else {
              r4 = null;
              pos = r5;
            }
          } else {
            r4 = null;
            pos = r5;
          }
          r4 = r4 !== null ? r4 : "";
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(left, right) {
              if(!right) return left;
              return rp(new CS.ExistsOp(left, right[5]));
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_comparisonExpression() {
        var cacheKey = "comparisonExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_relationalExpression();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            if (input.substr(pos, 2) === "<=") {
              r8 = "<=";
              pos += 2;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("\"<=\"");
              }
            }
            if (r8 === null) {
              if (input.substr(pos, 2) === ">=") {
                r8 = ">=";
                pos += 2;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\">=\"");
                }
              }
              if (r8 === null) {
                if (input.charCodeAt(pos) === 60) {
                  r8 = "<";
                  pos++;
                } else {
                  r8 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"<\"");
                  }
                }
                if (r8 === null) {
                  if (input.charCodeAt(pos) === 62) {
                    r8 = ">";
                    pos++;
                  } else {
                    r8 = null;
                    if (reportFailures === 0) {
                      matchFailed("\">\"");
                    }
                  }
                  if (r8 === null) {
                    if (input.substr(pos, 2) === "==") {
                      r8 = "==";
                      pos += 2;
                    } else {
                      r8 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"==\"");
                      }
                    }
                    if (r8 === null) {
                      r8 = parse_IS();
                      if (r8 === null) {
                        if (input.substr(pos, 2) === "!=") {
                          r8 = "!=";
                          pos += 2;
                        } else {
                          r8 = null;
                          if (reportFailures === 0) {
                            matchFailed("\"!=\"");
                          }
                        }
                        if (r8 === null) {
                          r8 = parse_ISNT();
                        }
                      }
                    }
                  }
                }
              }
            }
            if (r8 !== null) {
              r9 = parse__();
              if (r9 !== null) {
                r10 = parse_expressionworthy();
                if (r10 === null) {
                  r10 = parse_relationalExpression();
                }
                if (r10 !== null) {
                  r5 = [r7, r8, r9, r10];
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              if (input.substr(pos, 2) === "<=") {
                r8 = "<=";
                pos += 2;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\"<=\"");
                }
              }
              if (r8 === null) {
                if (input.substr(pos, 2) === ">=") {
                  r8 = ">=";
                  pos += 2;
                } else {
                  r8 = null;
                  if (reportFailures === 0) {
                    matchFailed("\">=\"");
                  }
                }
                if (r8 === null) {
                  if (input.charCodeAt(pos) === 60) {
                    r8 = "<";
                    pos++;
                  } else {
                    r8 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"<\"");
                    }
                  }
                  if (r8 === null) {
                    if (input.charCodeAt(pos) === 62) {
                      r8 = ">";
                      pos++;
                    } else {
                      r8 = null;
                      if (reportFailures === 0) {
                        matchFailed("\">\"");
                      }
                    }
                    if (r8 === null) {
                      if (input.substr(pos, 2) === "==") {
                        r8 = "==";
                        pos += 2;
                      } else {
                        r8 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"==\"");
                        }
                      }
                      if (r8 === null) {
                        r8 = parse_IS();
                        if (r8 === null) {
                          if (input.substr(pos, 2) === "!=") {
                            r8 = "!=";
                            pos += 2;
                          } else {
                            r8 = null;
                            if (reportFailures === 0) {
                              matchFailed("\"!=\"");
                            }
                          }
                          if (r8 === null) {
                            r8 = parse_ISNT();
                          }
                        }
                      }
                    }
                  }
                }
              }
              if (r8 !== null) {
                r9 = parse__();
                if (r9 !== null) {
                  r10 = parse_expressionworthy();
                  if (r10 === null) {
                    r10 = parse_relationalExpression();
                  }
                  if (r10 !== null) {
                    r5 = [r7, r8, r9, r10];
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(left, rights) {
              if(!rights) return left;
              var tree = foldl(function(expr, right){
                return rp(new constructorLookup[right[1]](expr, right[3]));
              }, left, rights);
              return rights.length < 2 ? tree : rp(new CS.ChainedComparisonOp(tree));
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_relationalExpression() {
        var cacheKey = "relationalExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_bitwiseShiftExpression();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            r8 = parse_relationalExpressionOperator();
            if (r8 !== null) {
              r9 = parse_TERMINATOR();
              r9 = r9 !== null ? r9 : "";
              if (r9 !== null) {
                r10 = parse__();
                if (r10 !== null) {
                  r11 = parse_expressionworthy();
                  if (r11 === null) {
                    r11 = parse_bitwiseShiftExpression();
                  }
                  if (r11 !== null) {
                    r5 = [r7, r8, r9, r10, r11];
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              r8 = parse_relationalExpressionOperator();
              if (r8 !== null) {
                r9 = parse_TERMINATOR();
                r9 = r9 !== null ? r9 : "";
                if (r9 !== null) {
                  r10 = parse__();
                  if (r10 !== null) {
                    r11 = parse_expressionworthy();
                    if (r11 === null) {
                      r11 = parse_bitwiseShiftExpression();
                    }
                    if (r11 !== null) {
                      r5 = [r7, r8, r9, r10, r11];
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(left, rights) {
              if(!rights) return left;
              return foldl(function(expr, right){
                return rp(right[1](expr, right[4]));
              }, left, rights);
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_relationalExpressionOperator() {
        var cacheKey = "relationalExpressionOperator@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r0 = parse_EXTENDS();
        if (r0 === null) {
          r0 = parse_INSTANCEOF();
          if (r0 === null) {
            r0 = parse_IN();
            if (r0 === null) {
              r0 = parse_OF();
            }
          }
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(op) {
                return function(left, right){
                  return new constructorLookup[op](left, right);
                };
              })(r0);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r3 = parse_NOT();
          if (r3 !== null) {
            r4 = parse__();
            if (r4 !== null) {
              r5 = parse_INSTANCEOF();
              if (r5 === null) {
                r5 = parse_IN();
                if (r5 === null) {
                  r5 = parse_OF();
                }
              }
              if (r5 !== null) {
                r0 = [r3, r4, r5];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(op) {
                  return function(left, right){
                    return new CS.LogicalNotOp(new constructorLookup[op](left, right)).g();
                  };
                })(r5);
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_bitwiseShiftExpression() {
        var cacheKey = "bitwiseShiftExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_additiveExpression();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            if (input.substr(pos, 2) === "<<") {
              r8 = "<<";
              pos += 2;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("\"<<\"");
              }
            }
            if (r8 === null) {
              if (input.substr(pos, 3) === ">>>") {
                r8 = ">>>";
                pos += 3;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\">>>\"");
                }
              }
              if (r8 === null) {
                if (input.substr(pos, 2) === ">>") {
                  r8 = ">>";
                  pos += 2;
                } else {
                  r8 = null;
                  if (reportFailures === 0) {
                    matchFailed("\">>\"");
                  }
                }
              }
            }
            if (r8 !== null) {
              r10 = pos;
              reportFailures++;
              if (input.charCodeAt(pos) === 61) {
                r9 = "=";
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\"=\"");
                }
              }
              reportFailures--;
              if (r9 === null) {
                r9 = "";
              } else {
                r9 = null;
                pos = r10;
              }
              if (r9 !== null) {
                r10 = parse_TERMINATOR();
                r10 = r10 !== null ? r10 : "";
                if (r10 !== null) {
                  r11 = parse__();
                  if (r11 !== null) {
                    r12 = parse_expressionworthy();
                    if (r12 === null) {
                      r12 = parse_additiveExpression();
                    }
                    if (r12 !== null) {
                      r5 = [r7, r8, r9, r10, r11, r12];
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              if (input.substr(pos, 2) === "<<") {
                r8 = "<<";
                pos += 2;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\"<<\"");
                }
              }
              if (r8 === null) {
                if (input.substr(pos, 3) === ">>>") {
                  r8 = ">>>";
                  pos += 3;
                } else {
                  r8 = null;
                  if (reportFailures === 0) {
                    matchFailed("\">>>\"");
                  }
                }
                if (r8 === null) {
                  if (input.substr(pos, 2) === ">>") {
                    r8 = ">>";
                    pos += 2;
                  } else {
                    r8 = null;
                    if (reportFailures === 0) {
                      matchFailed("\">>\"");
                    }
                  }
                }
              }
              if (r8 !== null) {
                r10 = pos;
                reportFailures++;
                if (input.charCodeAt(pos) === 61) {
                  r9 = "=";
                  pos++;
                } else {
                  r9 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"=\"");
                  }
                }
                reportFailures--;
                if (r9 === null) {
                  r9 = "";
                } else {
                  r9 = null;
                  pos = r10;
                }
                if (r9 !== null) {
                  r10 = parse_TERMINATOR();
                  r10 = r10 !== null ? r10 : "";
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      r12 = parse_expressionworthy();
                      if (r12 === null) {
                        r12 = parse_additiveExpression();
                      }
                      if (r12 !== null) {
                        r5 = [r7, r8, r9, r10, r11, r12];
                      } else {
                        r5 = null;
                        pos = r6;
                      }
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(left, rights) {
              if(!rights) return left;
              return foldl(function(expr, right){
                return rp(new constructorLookup[right[1]](expr, right[5]));
              }, left, rights);
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_additiveExpression() {
        var cacheKey = "additiveExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_multiplicativeExpression();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            r9 = pos;
            if (input.charCodeAt(pos) === 43) {
              r10 = "+";
              pos++;
            } else {
              r10 = null;
              if (reportFailures === 0) {
                matchFailed("\"+\"");
              }
            }
            if (r10 !== null) {
              r12 = pos;
              reportFailures++;
              if (/^[+=]/.test(input.charAt(pos))) {
                r11 = input.charAt(pos);
                pos++;
              } else {
                r11 = null;
                if (reportFailures === 0) {
                  matchFailed("[+=]");
                }
              }
              reportFailures--;
              if (r11 === null) {
                r11 = "";
              } else {
                r11 = null;
                pos = r12;
              }
              if (r11 !== null) {
                r8 = [r10, r11];
              } else {
                r8 = null;
                pos = r9;
              }
            } else {
              r8 = null;
              pos = r9;
            }
            if (r8 === null) {
              r9 = pos;
              if (input.charCodeAt(pos) === 45) {
                r10 = "-";
                pos++;
              } else {
                r10 = null;
                if (reportFailures === 0) {
                  matchFailed("\"-\"");
                }
              }
              if (r10 !== null) {
                r12 = pos;
                reportFailures++;
                if (/^[\-=]/.test(input.charAt(pos))) {
                  r11 = input.charAt(pos);
                  pos++;
                } else {
                  r11 = null;
                  if (reportFailures === 0) {
                    matchFailed("[\\-=]");
                  }
                }
                reportFailures--;
                if (r11 === null) {
                  r11 = "";
                } else {
                  r11 = null;
                  pos = r12;
                }
                if (r11 !== null) {
                  r8 = [r10, r11];
                } else {
                  r8 = null;
                  pos = r9;
                }
              } else {
                r8 = null;
                pos = r9;
              }
            }
            if (r8 !== null) {
              r9 = parse_TERMINATOR();
              r9 = r9 !== null ? r9 : "";
              if (r9 !== null) {
                r10 = parse__();
                if (r10 !== null) {
                  r11 = parse_expressionworthy();
                  if (r11 === null) {
                    r11 = parse_multiplicativeExpression();
                  }
                  if (r11 !== null) {
                    r5 = [r7, r8, r9, r10, r11];
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              r9 = pos;
              if (input.charCodeAt(pos) === 43) {
                r10 = "+";
                pos++;
              } else {
                r10 = null;
                if (reportFailures === 0) {
                  matchFailed("\"+\"");
                }
              }
              if (r10 !== null) {
                r12 = pos;
                reportFailures++;
                if (/^[+=]/.test(input.charAt(pos))) {
                  r11 = input.charAt(pos);
                  pos++;
                } else {
                  r11 = null;
                  if (reportFailures === 0) {
                    matchFailed("[+=]");
                  }
                }
                reportFailures--;
                if (r11 === null) {
                  r11 = "";
                } else {
                  r11 = null;
                  pos = r12;
                }
                if (r11 !== null) {
                  r8 = [r10, r11];
                } else {
                  r8 = null;
                  pos = r9;
                }
              } else {
                r8 = null;
                pos = r9;
              }
              if (r8 === null) {
                r9 = pos;
                if (input.charCodeAt(pos) === 45) {
                  r10 = "-";
                  pos++;
                } else {
                  r10 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"-\"");
                  }
                }
                if (r10 !== null) {
                  r12 = pos;
                  reportFailures++;
                  if (/^[\-=]/.test(input.charAt(pos))) {
                    r11 = input.charAt(pos);
                    pos++;
                  } else {
                    r11 = null;
                    if (reportFailures === 0) {
                      matchFailed("[\\-=]");
                    }
                  }
                  reportFailures--;
                  if (r11 === null) {
                    r11 = "";
                  } else {
                    r11 = null;
                    pos = r12;
                  }
                  if (r11 !== null) {
                    r8 = [r10, r11];
                  } else {
                    r8 = null;
                    pos = r9;
                  }
                } else {
                  r8 = null;
                  pos = r9;
                }
              }
              if (r8 !== null) {
                r9 = parse_TERMINATOR();
                r9 = r9 !== null ? r9 : "";
                if (r9 !== null) {
                  r10 = parse__();
                  if (r10 !== null) {
                    r11 = parse_expressionworthy();
                    if (r11 === null) {
                      r11 = parse_multiplicativeExpression();
                    }
                    if (r11 !== null) {
                      r5 = [r7, r8, r9, r10, r11];
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(left, rights) {
              if(!rights) return left;
              return foldl(function(expr, right){
                return rp(new constructorLookup[right[1][0]](expr, right[4]));
              }, left, rights);
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_multiplicativeExpression() {
        var cacheKey = "multiplicativeExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_exponentiationExpression();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            if (/^[*\/%]/.test(input.charAt(pos))) {
              r8 = input.charAt(pos);
              pos++;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("[*\\/%]");
              }
            }
            if (r8 !== null) {
              r10 = pos;
              reportFailures++;
              if (input.charCodeAt(pos) === 61) {
                r9 = "=";
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\"=\"");
                }
              }
              reportFailures--;
              if (r9 === null) {
                r9 = "";
              } else {
                r9 = null;
                pos = r10;
              }
              if (r9 !== null) {
                r10 = parse_TERMINATOR();
                r10 = r10 !== null ? r10 : "";
                if (r10 !== null) {
                  r11 = parse__();
                  if (r11 !== null) {
                    r12 = parse_expressionworthy();
                    if (r12 === null) {
                      r12 = parse_exponentiationExpression();
                    }
                    if (r12 !== null) {
                      r5 = [r7, r8, r9, r10, r11, r12];
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              if (/^[*\/%]/.test(input.charAt(pos))) {
                r8 = input.charAt(pos);
                pos++;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("[*\\/%]");
                }
              }
              if (r8 !== null) {
                r10 = pos;
                reportFailures++;
                if (input.charCodeAt(pos) === 61) {
                  r9 = "=";
                  pos++;
                } else {
                  r9 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"=\"");
                  }
                }
                reportFailures--;
                if (r9 === null) {
                  r9 = "";
                } else {
                  r9 = null;
                  pos = r10;
                }
                if (r9 !== null) {
                  r10 = parse_TERMINATOR();
                  r10 = r10 !== null ? r10 : "";
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      r12 = parse_expressionworthy();
                      if (r12 === null) {
                        r12 = parse_exponentiationExpression();
                      }
                      if (r12 !== null) {
                        r5 = [r7, r8, r9, r10, r11, r12];
                      } else {
                        r5 = null;
                        pos = r6;
                      }
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(left, rights) {
              if(!rights) return left;
              return foldl(function(expr, right){
                return rp(new constructorLookup[right[1]](expr, right[5]));
              }, left, rights);
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_exponentiationExpression() {
        var cacheKey = "exponentiationExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_prefixExpression();
        if (r3 !== null) {
          r5 = pos;
          r6 = parse__();
          if (r6 !== null) {
            if (input.substr(pos, 2) === "**") {
              r7 = "**";
              pos += 2;
            } else {
              r7 = null;
              if (reportFailures === 0) {
                matchFailed("\"**\"");
              }
            }
            if (r7 !== null) {
              r9 = pos;
              reportFailures++;
              if (input.charCodeAt(pos) === 61) {
                r8 = "=";
                pos++;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\"=\"");
                }
              }
              reportFailures--;
              if (r8 === null) {
                r8 = "";
              } else {
                r8 = null;
                pos = r9;
              }
              if (r8 !== null) {
                r9 = parse_TERMINATOR();
                r9 = r9 !== null ? r9 : "";
                if (r9 !== null) {
                  r10 = parse__();
                  if (r10 !== null) {
                    r11 = parse_expressionworthy();
                    if (r11 === null) {
                      r11 = parse_exponentiationExpression();
                    }
                    if (r11 !== null) {
                      r4 = [r6, r7, r8, r9, r10, r11];
                    } else {
                      r4 = null;
                      pos = r5;
                    }
                  } else {
                    r4 = null;
                    pos = r5;
                  }
                } else {
                  r4 = null;
                  pos = r5;
                }
              } else {
                r4 = null;
                pos = r5;
              }
            } else {
              r4 = null;
              pos = r5;
            }
          } else {
            r4 = null;
            pos = r5;
          }
          r4 = r4 !== null ? r4 : "";
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(left, right) {
              if(!right) return left;
              return rp(new CS.ExpOp(left, right[5]));
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_prefixExpression() {
        var cacheKey = "prefixExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10;
        
        r0 = parse_postfixExpression();
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          if (input.substr(pos, 2) === "++") {
            r3 = "++";
            pos += 2;
          } else {
            r3 = null;
            if (reportFailures === 0) {
              matchFailed("\"++\"");
            }
          }
          if (r3 !== null) {
            r4 = parse__();
            if (r4 !== null) {
              r5 = parse_expressionworthy();
              if (r5 === null) {
                r5 = parse_prefixExpression();
              }
              if (r5 !== null) {
                r0 = [r3, r4, r5];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(e) { return rp(new CS.PreIncrementOp(e)); })(r5);
          }
          if (r0 === null) {
            pos = r1;
          }
          if (r0 === null) {
            r1 = pos;
            r2 = pos;
            if (input.substr(pos, 2) === "--") {
              r3 = "--";
              pos += 2;
            } else {
              r3 = null;
              if (reportFailures === 0) {
                matchFailed("\"--\"");
              }
            }
            if (r3 !== null) {
              r4 = parse__();
              if (r4 !== null) {
                r5 = parse_expressionworthy();
                if (r5 === null) {
                  r5 = parse_prefixExpression();
                }
                if (r5 !== null) {
                  r0 = [r3, r4, r5];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
            if (r0 !== null) {
              reportedPos = r1;
              r0 = (function(e) { return rp(new CS.PreDecrementOp(e)); })(r5);
            }
            if (r0 === null) {
              pos = r1;
            }
            if (r0 === null) {
              r1 = pos;
              r2 = pos;
              if (input.charCodeAt(pos) === 43) {
                r3 = "+";
                pos++;
              } else {
                r3 = null;
                if (reportFailures === 0) {
                  matchFailed("\"+\"");
                }
              }
              if (r3 !== null) {
                r4 = parse__();
                if (r4 !== null) {
                  r5 = parse_expressionworthy();
                  if (r5 === null) {
                    r5 = parse_prefixExpression();
                  }
                  if (r5 !== null) {
                    r0 = [r3, r4, r5];
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
              if (r0 !== null) {
                reportedPos = r1;
                r0 = (function(e) { return rp(new CS.UnaryPlusOp(e)); })(r5);
              }
              if (r0 === null) {
                pos = r1;
              }
              if (r0 === null) {
                r1 = pos;
                r2 = pos;
                if (input.charCodeAt(pos) === 45) {
                  r3 = "-";
                  pos++;
                } else {
                  r3 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"-\"");
                  }
                }
                if (r3 !== null) {
                  r4 = parse__();
                  if (r4 !== null) {
                    r5 = parse_expressionworthy();
                    if (r5 === null) {
                      r5 = parse_prefixExpression();
                    }
                    if (r5 !== null) {
                      r0 = [r3, r4, r5];
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
                if (r0 !== null) {
                  reportedPos = r1;
                  r0 = (function(e) { return rp(new CS.UnaryNegateOp(e)); })(r5);
                }
                if (r0 === null) {
                  pos = r1;
                }
                if (r0 === null) {
                  r1 = pos;
                  r2 = pos;
                  if (input.charCodeAt(pos) === 33) {
                    r3 = "!";
                    pos++;
                  } else {
                    r3 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"!\"");
                    }
                  }
                  if (r3 === null) {
                    r3 = parse_NOT();
                  }
                  if (r3 !== null) {
                    r4 = parse__();
                    if (r4 !== null) {
                      r5 = parse_expressionworthy();
                      if (r5 === null) {
                        r5 = parse_prefixExpression();
                      }
                      if (r5 !== null) {
                        r0 = [r3, r4, r5];
                      } else {
                        r0 = null;
                        pos = r2;
                      }
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                  if (r0 !== null) {
                    reportedPos = r1;
                    r0 = (function(o, e) { return rp(new CS.LogicalNotOp(e)); })(r3, r5);
                  }
                  if (r0 === null) {
                    pos = r1;
                  }
                  if (r0 === null) {
                    r1 = pos;
                    r2 = pos;
                    if (input.charCodeAt(pos) === 126) {
                      r3 = "~";
                      pos++;
                    } else {
                      r3 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"~\"");
                      }
                    }
                    if (r3 !== null) {
                      r4 = parse__();
                      if (r4 !== null) {
                        r5 = parse_expressionworthy();
                        if (r5 === null) {
                          r5 = parse_prefixExpression();
                        }
                        if (r5 !== null) {
                          r0 = [r3, r4, r5];
                        } else {
                          r0 = null;
                          pos = r2;
                        }
                      } else {
                        r0 = null;
                        pos = r2;
                      }
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                    if (r0 !== null) {
                      reportedPos = r1;
                      r0 = (function(e) { return rp(new CS.BitNotOp(e)); })(r5);
                    }
                    if (r0 === null) {
                      pos = r1;
                    }
                    if (r0 === null) {
                      r1 = pos;
                      r2 = pos;
                      r3 = parse_DO();
                      if (r3 !== null) {
                        r4 = parse__();
                        if (r4 !== null) {
                          r6 = pos;
                          reportFailures++;
                          r5 = parse_unassignable();
                          reportFailures--;
                          if (r5 === null) {
                            r5 = "";
                          } else {
                            r5 = null;
                            pos = r6;
                          }
                          if (r5 !== null) {
                            r6 = parse_identifier();
                            if (r6 !== null) {
                              r7 = parse__();
                              if (r7 !== null) {
                                if (input.charCodeAt(pos) === 61) {
                                  r8 = "=";
                                  pos++;
                                } else {
                                  r8 = null;
                                  if (reportFailures === 0) {
                                    matchFailed("\"=\"");
                                  }
                                }
                                if (r8 !== null) {
                                  r9 = parse__();
                                  if (r9 !== null) {
                                    r10 = parse_functionLiteral();
                                    if (r10 !== null) {
                                      r0 = [r3, r4, r5, r6, r7, r8, r9, r10];
                                    } else {
                                      r0 = null;
                                      pos = r2;
                                    }
                                  } else {
                                    r0 = null;
                                    pos = r2;
                                  }
                                } else {
                                  r0 = null;
                                  pos = r2;
                                }
                              } else {
                                r0 = null;
                                pos = r2;
                              }
                            } else {
                              r0 = null;
                              pos = r2;
                            }
                          } else {
                            r0 = null;
                            pos = r2;
                          }
                        } else {
                          r0 = null;
                          pos = r2;
                        }
                      } else {
                        r0 = null;
                        pos = r2;
                      }
                      if (r0 !== null) {
                        reportedPos = r1;
                        r0 = (function(a, f) { return rp(new CS.DoOp(new CS.AssignOp(a, f))); })(r6, r10);
                      }
                      if (r0 === null) {
                        pos = r1;
                      }
                      if (r0 === null) {
                        r1 = pos;
                        r2 = pos;
                        r3 = parse_DO();
                        if (r3 !== null) {
                          r4 = parse__();
                          if (r4 !== null) {
                            r5 = parse_expressionworthy();
                            if (r5 === null) {
                              r5 = parse_prefixExpression();
                            }
                            if (r5 !== null) {
                              r0 = [r3, r4, r5];
                            } else {
                              r0 = null;
                              pos = r2;
                            }
                          } else {
                            r0 = null;
                            pos = r2;
                          }
                        } else {
                          r0 = null;
                          pos = r2;
                        }
                        if (r0 !== null) {
                          reportedPos = r1;
                          r0 = (function(e) { return rp(new CS.DoOp(e)); })(r5);
                        }
                        if (r0 === null) {
                          pos = r1;
                        }
                        if (r0 === null) {
                          r1 = pos;
                          r2 = pos;
                          r3 = parse_TYPEOF();
                          if (r3 !== null) {
                            r4 = parse__();
                            if (r4 !== null) {
                              r5 = parse_expressionworthy();
                              if (r5 === null) {
                                r5 = parse_prefixExpression();
                              }
                              if (r5 !== null) {
                                r0 = [r3, r4, r5];
                              } else {
                                r0 = null;
                                pos = r2;
                              }
                            } else {
                              r0 = null;
                              pos = r2;
                            }
                          } else {
                            r0 = null;
                            pos = r2;
                          }
                          if (r0 !== null) {
                            reportedPos = r1;
                            r0 = (function(e) { return rp(new CS.TypeofOp(e)); })(r5);
                          }
                          if (r0 === null) {
                            pos = r1;
                          }
                          if (r0 === null) {
                            r1 = pos;
                            r2 = pos;
                            r3 = parse_DELETE();
                            if (r3 !== null) {
                              r4 = parse__();
                              if (r4 !== null) {
                                r5 = parse_expressionworthy();
                                if (r5 === null) {
                                  r5 = parse_prefixExpression();
                                }
                                if (r5 !== null) {
                                  r0 = [r3, r4, r5];
                                } else {
                                  r0 = null;
                                  pos = r2;
                                }
                              } else {
                                r0 = null;
                                pos = r2;
                              }
                            } else {
                              r0 = null;
                              pos = r2;
                            }
                            if (r0 !== null) {
                              reportedPos = r1;
                              r0 = (function(e) { return rp(new CS.DeleteOp(e)); })(r5);
                            }
                            if (r0 === null) {
                              pos = r1;
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_postfixExpression() {
        var cacheKey = "postfixExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_leftHandSideExpression();
        if (r3 !== null) {
          r4 = [];
          if (input.charCodeAt(pos) === 63) {
            r5 = "?";
            pos++;
          } else {
            r5 = null;
            if (reportFailures === 0) {
              matchFailed("\"?\"");
            }
          }
          if (r5 === null) {
            if (input.substr(pos, 4) === "[..]") {
              r5 = "[..]";
              pos += 4;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\"[..]\"");
              }
            }
            if (r5 === null) {
              if (input.substr(pos, 2) === "++") {
                r5 = "++";
                pos += 2;
              } else {
                r5 = null;
                if (reportFailures === 0) {
                  matchFailed("\"++\"");
                }
              }
              if (r5 === null) {
                if (input.substr(pos, 2) === "--") {
                  r5 = "--";
                  pos += 2;
                } else {
                  r5 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"--\"");
                  }
                }
              }
            }
          }
          while (r5 !== null) {
            r4.push(r5);
            if (input.charCodeAt(pos) === 63) {
              r5 = "?";
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\"?\"");
              }
            }
            if (r5 === null) {
              if (input.substr(pos, 4) === "[..]") {
                r5 = "[..]";
                pos += 4;
              } else {
                r5 = null;
                if (reportFailures === 0) {
                  matchFailed("\"[..]\"");
                }
              }
              if (r5 === null) {
                if (input.substr(pos, 2) === "++") {
                  r5 = "++";
                  pos += 2;
                } else {
                  r5 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"++\"");
                  }
                }
                if (r5 === null) {
                  if (input.substr(pos, 2) === "--") {
                    r5 = "--";
                    pos += 2;
                  } else {
                    r5 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"--\"");
                    }
                  }
                }
              }
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(expr, ops) {
              return foldl(function(expr, op){
                switch(op){
                  case '?': return rp(new CS.UnaryExistsOp(expr));
                  case '[..]': return rp(new CS.ShallowCopyArray(expr));
                  case '++': return rp(new CS.PostIncrementOp(expr));
                  case '--': return rp(new CS.PostDecrementOp(expr));
                }
              }, expr, ops);
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_leftHandSideExpression() {
        var cacheKey = "leftHandSideExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        r0 = parse_callExpression();
        if (r0 === null) {
          r0 = parse_newExpression();
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_argumentList() {
        var cacheKey = "argumentList@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 63) {
          r3 = "?";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"?\"");
          }
        }
        r3 = r3 !== null ? r3 : "";
        if (r3 !== null) {
          if (input.charCodeAt(pos) === 40) {
            r4 = "(";
            pos++;
          } else {
            r4 = null;
            if (reportFailures === 0) {
              matchFailed("\"(\"");
            }
          }
          if (r4 !== null) {
            r5 = parse__();
            if (r5 !== null) {
              r6 = parse_argumentListContents();
              r6 = r6 !== null ? r6 : "";
              if (r6 !== null) {
                r7 = parse__();
                if (r7 !== null) {
                  if (input.charCodeAt(pos) === 41) {
                    r8 = ")";
                    pos++;
                  } else {
                    r8 = null;
                    if (reportFailures === 0) {
                      matchFailed("\")\"");
                    }
                  }
                  if (r8 !== null) {
                    r0 = [r3, r4, r5, r6, r7, r8];
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(soaked, a) {
                return rp(
                  { op: soaked ? CS.SoakedFunctionApplication : CS.FunctionApplication
                  , operands: [a || []]
                  }
                );
              })(r3, r6);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_argumentListContents() {
        var cacheKey = "argumentListContents@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_argument();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            if (input.charCodeAt(pos) === 44) {
              r8 = ",";
              pos++;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("\",\"");
              }
            }
            if (r8 === null) {
              r8 = parse_TERMINATOR();
            }
            if (r8 !== null) {
              r9 = parse__();
              if (r9 !== null) {
                r10 = parse_argument();
                if (r10 !== null) {
                  r5 = [r7, r8, r9, r10];
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              if (input.charCodeAt(pos) === 44) {
                r8 = ",";
                pos++;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\",\"");
                }
              }
              if (r8 === null) {
                r8 = parse_TERMINATOR();
              }
              if (r8 !== null) {
                r9 = parse__();
                if (r9 !== null) {
                  r10 = parse_argument();
                  if (r10 !== null) {
                    r5 = [r7, r8, r9, r10];
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            if (input.charCodeAt(pos) === 44) {
              r5 = ",";
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\",\"");
              }
            }
            if (r5 === null) {
              r5 = parse_TERMINATOR();
            }
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(e, es) {
                return [e].concat(es.map(function(e){ return e[3]; }));
              })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r3 = parse_TERMINDENT();
          if (r3 !== null) {
            r4 = parse_argumentListContents();
            if (r4 !== null) {
              r5 = parse_DEDENT();
              if (r5 !== null) {
                r6 = parse_TERMINATOR();
                r6 = r6 !== null ? r6 : "";
                if (r6 !== null) {
                  r0 = [r3, r4, r5, r6];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(a) { return a; })(r4);
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_argument() {
        var cacheKey = "argument@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        r0 = parse_spread();
        if (r0 === null) {
          r0 = parse_expression();
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_secondaryArgumentList() {
        var cacheKey = "secondaryArgumentList@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14;
        
        r1 = pos;
        r2 = pos;
        r3 = parse___();
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r6 = pos;
          if (/^[+-\/]/.test(input.charAt(pos))) {
            r7 = input.charAt(pos);
            pos++;
          } else {
            r7 = null;
            if (reportFailures === 0) {
              matchFailed("[+-\\/]");
            }
          }
          if (r7 !== null) {
            r8 = parse___();
            if (r8 !== null) {
              r4 = [r7, r8];
            } else {
              r4 = null;
              pos = r6;
            }
          } else {
            r4 = null;
            pos = r6;
          }
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r5 = parse_secondaryArgument();
            if (r5 !== null) {
              r6 = [];
              r8 = pos;
              r9 = parse__();
              if (r9 !== null) {
                if (input.charCodeAt(pos) === 44) {
                  r10 = ",";
                  pos++;
                } else {
                  r10 = null;
                  if (reportFailures === 0) {
                    matchFailed("\",\"");
                  }
                }
                if (r10 !== null) {
                  r11 = parse__();
                  if (r11 !== null) {
                    r12 = parse_TERMINATOR();
                    r12 = r12 !== null ? r12 : "";
                    if (r12 !== null) {
                      r13 = parse__();
                      if (r13 !== null) {
                        r14 = parse_secondaryArgument();
                        if (r14 !== null) {
                          r7 = [r9, r10, r11, r12, r13, r14];
                        } else {
                          r7 = null;
                          pos = r8;
                        }
                      } else {
                        r7 = null;
                        pos = r8;
                      }
                    } else {
                      r7 = null;
                      pos = r8;
                    }
                  } else {
                    r7 = null;
                    pos = r8;
                  }
                } else {
                  r7 = null;
                  pos = r8;
                }
              } else {
                r7 = null;
                pos = r8;
              }
              while (r7 !== null) {
                r6.push(r7);
                r8 = pos;
                r9 = parse__();
                if (r9 !== null) {
                  if (input.charCodeAt(pos) === 44) {
                    r10 = ",";
                    pos++;
                  } else {
                    r10 = null;
                    if (reportFailures === 0) {
                      matchFailed("\",\"");
                    }
                  }
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      r12 = parse_TERMINATOR();
                      r12 = r12 !== null ? r12 : "";
                      if (r12 !== null) {
                        r13 = parse__();
                        if (r13 !== null) {
                          r14 = parse_secondaryArgument();
                          if (r14 !== null) {
                            r7 = [r9, r10, r11, r12, r13, r14];
                          } else {
                            r7 = null;
                            pos = r8;
                          }
                        } else {
                          r7 = null;
                          pos = r8;
                        }
                      } else {
                        r7 = null;
                        pos = r8;
                      }
                    } else {
                      r7 = null;
                      pos = r8;
                    }
                  } else {
                    r7 = null;
                    pos = r8;
                  }
                } else {
                  r7 = null;
                  pos = r8;
                }
              }
              if (r6 !== null) {
                r8 = pos;
                if (input.charCodeAt(pos) === 44) {
                  r9 = ",";
                  pos++;
                } else {
                  r9 = null;
                  if (reportFailures === 0) {
                    matchFailed("\",\"");
                  }
                }
                r9 = r9 !== null ? r9 : "";
                if (r9 !== null) {
                  r10 = parse_TERMINDENT();
                  if (r10 !== null) {
                    r11 = parse_implicitObjectLiteral();
                    if (r11 !== null) {
                      r12 = parse_DEDENT();
                      if (r12 !== null) {
                        r7 = [r9, r10, r11, r12];
                      } else {
                        r7 = null;
                        pos = r8;
                      }
                    } else {
                      r7 = null;
                      pos = r8;
                    }
                  } else {
                    r7 = null;
                    pos = r8;
                  }
                } else {
                  r7 = null;
                  pos = r8;
                }
                r7 = r7 !== null ? r7 : "";
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(e, es, obj) {
                es = [e].concat(es.map(function(e){ return e[5]; }));
                if(obj) es.push(obj[2]);
                return es;
              })(r5, r6, r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r3 = parse_TERMINDENT();
          if (r3 !== null) {
            r4 = parse_implicitObjectLiteral();
            if (r4 !== null) {
              r5 = parse_DEDENT();
              if (r5 !== null) {
                r0 = [r3, r4, r5];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(o) { return [o]; })(r4);
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_secondaryArgument() {
        var cacheKey = "secondaryArgument@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        r0 = parse_spread();
        if (r0 === null) {
          r0 = parse_secondaryExpression();
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_callExpression() {
        var cacheKey = "callExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_memberExpression();
        if (r3 !== null) {
          r4 = [];
          r5 = parse_argumentList();
          if (r5 === null) {
            r5 = parse_MemberAccessOps();
          }
          while (r5 !== null) {
            r4.push(r5);
            r5 = parse_argumentList();
            if (r5 === null) {
              r5 = parse_MemberAccessOps();
            }
          }
          if (r4 !== null) {
            r6 = pos;
            if (input.charCodeAt(pos) === 63) {
              r7 = "?";
              pos++;
            } else {
              r7 = null;
              if (reportFailures === 0) {
                matchFailed("\"?\"");
              }
            }
            r7 = r7 !== null ? r7 : "";
            if (r7 !== null) {
              r8 = parse_secondaryArgumentList();
              if (r8 !== null) {
                r5 = [r7, r8];
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(fn, accesses, secondaryArgs) {
              if(accesses) fn = createMemberExpression(fn, accesses);
              var soaked, secondaryCtor;
              if(secondaryArgs) {
                soaked = secondaryArgs[0];
                secondaryCtor = soaked ? CS.SoakedFunctionApplication : CS.FunctionApplication;
                fn = rp(new secondaryCtor(fn, secondaryArgs[1]));
              }
              return fn;
            })(r3, r4, r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_newExpression() {
        var cacheKey = "newExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r0 = parse_memberExpression();
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r3 = parse_NEW();
          if (r3 !== null) {
            r4 = parse___();
            if (r4 !== null) {
              r5 = parse_expressionworthy();
              if (r5 === null) {
                r5 = parse_newExpression();
                if (r5 === null) {
                  r5 = parse_prefixExpression();
                }
              }
              if (r5 !== null) {
                r0 = [r3, r4, r5];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(e) {
                return rp(new CS.NewOp(e, []));
              })(r5);
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_memberExpression() {
        var cacheKey = "memberExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_primaryExpression();
        if (r3 === null) {
          r4 = pos;
          r5 = pos;
          r6 = parse_NEW();
          if (r6 !== null) {
            r7 = parse___();
            if (r7 !== null) {
              r8 = parse_memberExpression();
              if (r8 !== null) {
                r9 = parse_argumentList();
                if (r9 !== null) {
                  r3 = [r6, r7, r8, r9];
                } else {
                  r3 = null;
                  pos = r5;
                }
              } else {
                r3 = null;
                pos = r5;
              }
            } else {
              r3 = null;
              pos = r5;
            }
          } else {
            r3 = null;
            pos = r5;
          }
          if (r3 !== null) {
            reportedPos = r4;
            r3 = (function(e, args) { return rp(new CS.NewOp(e, args.operands[0])); })(r8, r9);
          }
          if (r3 === null) {
            pos = r4;
          }
        }
        if (r3 !== null) {
          r4 = [];
          r5 = parse_MemberAccessOps();
          while (r5 !== null) {
            r4.push(r5);
            r5 = parse_MemberAccessOps();
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(e, accesses) {
              return createMemberExpression(e, accesses || []);
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r3 = parse_NEW();
          if (r3 !== null) {
            r4 = parse___();
            if (r4 !== null) {
              r5 = parse_memberExpression();
              if (r5 !== null) {
                r6 = parse_secondaryArgumentList();
                if (r6 !== null) {
                  r0 = [r3, r4, r5, r6];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(e, args) {
                return rp(new CS.NewOp(e, args));
              })(r5, r6);
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_memberAccess() {
        var cacheKey = "memberAccess@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_primaryExpression();
        if (r3 === null) {
          r4 = pos;
          r5 = pos;
          r6 = parse_NEW();
          if (r6 !== null) {
            r7 = parse___();
            if (r7 !== null) {
              r8 = parse_memberExpression();
              if (r8 !== null) {
                r9 = parse_argumentList();
                if (r9 !== null) {
                  r3 = [r6, r7, r8, r9];
                } else {
                  r3 = null;
                  pos = r5;
                }
              } else {
                r3 = null;
                pos = r5;
              }
            } else {
              r3 = null;
              pos = r5;
            }
          } else {
            r3 = null;
            pos = r5;
          }
          if (r3 !== null) {
            reportedPos = r4;
            r3 = (function(e, args) { return rp(new CS.NewOp(e, args.operands[0])); })(r8, r9);
          }
          if (r3 === null) {
            pos = r4;
          }
        }
        if (r3 !== null) {
          r6 = pos;
          r7 = parse_argumentList();
          if (r7 !== null) {
            r8 = parse_MemberAccessOps();
            if (r8 !== null) {
              r5 = [r7, r8];
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          if (r5 === null) {
            r5 = parse_MemberAccessOps();
          }
          if (r5 !== null) {
            r4 = [];
            while (r5 !== null) {
              r4.push(r5);
              r6 = pos;
              r7 = parse_argumentList();
              if (r7 !== null) {
                r8 = parse_MemberAccessOps();
                if (r8 !== null) {
                  r5 = [r7, r8];
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
              if (r5 === null) {
                r5 = parse_MemberAccessOps();
              }
            }
          } else {
            r4 = null;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(e, accesses) {
                var acc = foldl(function(memo, a){ return memo.concat(a); }, [], accesses);
                return createMemberExpression(e, acc);
              })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_MemberAccessOps() {
        var cacheKey = "MemberAccessOps@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_TERMINATOR();
        r3 = r3 !== null ? r3 : "";
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            if (input.charCodeAt(pos) === 46) {
              r5 = ".";
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\".\"");
              }
            }
            if (r5 !== null) {
              r6 = parse_TERMINATOR();
              r6 = r6 !== null ? r6 : "";
              if (r6 !== null) {
                r7 = parse__();
                if (r7 !== null) {
                  r8 = parse_identifierName();
                  if (r8 !== null) {
                    r0 = [r3, r4, r5, r6, r7, r8];
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(e) { return rp({op: CS.MemberAccessOp, operands: [e]}); })(r8);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          if (input.substr(pos, 2) === "?.") {
            r3 = "?.";
            pos += 2;
          } else {
            r3 = null;
            if (reportFailures === 0) {
              matchFailed("\"?.\"");
            }
          }
          if (r3 !== null) {
            r4 = parse__();
            if (r4 !== null) {
              r5 = parse_identifierName();
              if (r5 !== null) {
                r0 = [r3, r4, r5];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(e) { return rp({op: CS.SoakedMemberAccessOp, operands: [e]}); })(r5);
          }
          if (r0 === null) {
            pos = r1;
          }
          if (r0 === null) {
            r1 = pos;
            r2 = pos;
            if (input.charCodeAt(pos) === 91) {
              r3 = "[";
              pos++;
            } else {
              r3 = null;
              if (reportFailures === 0) {
                matchFailed("\"[\"");
              }
            }
            if (r3 !== null) {
              r4 = parse__();
              if (r4 !== null) {
                r5 = parse_expression();
                if (r5 !== null) {
                  r6 = parse__();
                  if (r6 !== null) {
                    if (input.charCodeAt(pos) === 93) {
                      r7 = "]";
                      pos++;
                    } else {
                      r7 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"]\"");
                      }
                    }
                    if (r7 !== null) {
                      r0 = [r3, r4, r5, r6, r7];
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
            if (r0 !== null) {
              reportedPos = r1;
              r0 = (function(e) { return rp({op: CS.DynamicMemberAccessOp, operands: [e]}); })(r5);
            }
            if (r0 === null) {
              pos = r1;
            }
            if (r0 === null) {
              r1 = pos;
              r2 = pos;
              if (input.substr(pos, 2) === "?[") {
                r3 = "?[";
                pos += 2;
              } else {
                r3 = null;
                if (reportFailures === 0) {
                  matchFailed("\"?[\"");
                }
              }
              if (r3 !== null) {
                r4 = parse__();
                if (r4 !== null) {
                  r5 = parse_expression();
                  if (r5 !== null) {
                    r6 = parse__();
                    if (r6 !== null) {
                      if (input.charCodeAt(pos) === 93) {
                        r7 = "]";
                        pos++;
                      } else {
                        r7 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"]\"");
                        }
                      }
                      if (r7 !== null) {
                        r0 = [r3, r4, r5, r6, r7];
                      } else {
                        r0 = null;
                        pos = r2;
                      }
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
              if (r0 !== null) {
                reportedPos = r1;
                r0 = (function(e) { return rp({op: CS.SoakedDynamicMemberAccessOp, operands: [e]}); })(r5);
              }
              if (r0 === null) {
                pos = r1;
              }
              if (r0 === null) {
                r1 = pos;
                r2 = pos;
                if (input.substr(pos, 2) === "::") {
                  r3 = "::";
                  pos += 2;
                } else {
                  r3 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"::\"");
                  }
                }
                if (r3 !== null) {
                  r4 = parse__();
                  if (r4 !== null) {
                    r5 = parse_identifierName();
                    if (r5 !== null) {
                      r0 = [r3, r4, r5];
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
                if (r0 !== null) {
                  reportedPos = r1;
                  r0 = (function(e) { return rp({op: CS.ProtoMemberAccessOp, operands: [e]}); })(r5);
                }
                if (r0 === null) {
                  pos = r1;
                }
                if (r0 === null) {
                  r1 = pos;
                  r2 = pos;
                  if (input.substr(pos, 3) === "::[") {
                    r3 = "::[";
                    pos += 3;
                  } else {
                    r3 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"::[\"");
                    }
                  }
                  if (r3 !== null) {
                    r4 = parse__();
                    if (r4 !== null) {
                      r5 = parse_expression();
                      if (r5 !== null) {
                        r6 = parse__();
                        if (r6 !== null) {
                          if (input.charCodeAt(pos) === 93) {
                            r7 = "]";
                            pos++;
                          } else {
                            r7 = null;
                            if (reportFailures === 0) {
                              matchFailed("\"]\"");
                            }
                          }
                          if (r7 !== null) {
                            r0 = [r3, r4, r5, r6, r7];
                          } else {
                            r0 = null;
                            pos = r2;
                          }
                        } else {
                          r0 = null;
                          pos = r2;
                        }
                      } else {
                        r0 = null;
                        pos = r2;
                      }
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                  if (r0 !== null) {
                    reportedPos = r1;
                    r0 = (function(e) { return rp({op: CS.DynamicProtoMemberAccessOp, operands: [e]}); })(r5);
                  }
                  if (r0 === null) {
                    pos = r1;
                  }
                  if (r0 === null) {
                    r1 = pos;
                    r2 = pos;
                    if (input.substr(pos, 3) === "?::") {
                      r3 = "?::";
                      pos += 3;
                    } else {
                      r3 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"?::\"");
                      }
                    }
                    if (r3 !== null) {
                      r4 = parse__();
                      if (r4 !== null) {
                        r5 = parse_identifierName();
                        if (r5 !== null) {
                          r0 = [r3, r4, r5];
                        } else {
                          r0 = null;
                          pos = r2;
                        }
                      } else {
                        r0 = null;
                        pos = r2;
                      }
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                    if (r0 !== null) {
                      reportedPos = r1;
                      r0 = (function(e) { return rp({op: CS.SoakedProtoMemberAccessOp, operands: [e]}); })(r5);
                    }
                    if (r0 === null) {
                      pos = r1;
                    }
                    if (r0 === null) {
                      r1 = pos;
                      r2 = pos;
                      if (input.substr(pos, 4) === "?::[") {
                        r3 = "?::[";
                        pos += 4;
                      } else {
                        r3 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"?::[\"");
                        }
                      }
                      if (r3 !== null) {
                        r4 = parse__();
                        if (r4 !== null) {
                          r5 = parse_expression();
                          if (r5 !== null) {
                            r6 = parse__();
                            if (r6 !== null) {
                              if (input.charCodeAt(pos) === 93) {
                                r7 = "]";
                                pos++;
                              } else {
                                r7 = null;
                                if (reportFailures === 0) {
                                  matchFailed("\"]\"");
                                }
                              }
                              if (r7 !== null) {
                                r0 = [r3, r4, r5, r6, r7];
                              } else {
                                r0 = null;
                                pos = r2;
                              }
                            } else {
                              r0 = null;
                              pos = r2;
                            }
                          } else {
                            r0 = null;
                            pos = r2;
                          }
                        } else {
                          r0 = null;
                          pos = r2;
                        }
                      } else {
                        r0 = null;
                        pos = r2;
                      }
                      if (r0 !== null) {
                        reportedPos = r1;
                        r0 = (function(e) { return rp({op: CS.SoakedDynamicProtoMemberAccessOp, operands: [e]}); })(r5);
                      }
                      if (r0 === null) {
                        pos = r1;
                      }
                      if (r0 === null) {
                        r1 = pos;
                        r2 = pos;
                        if (input.charCodeAt(pos) === 91) {
                          r3 = "[";
                          pos++;
                        } else {
                          r3 = null;
                          if (reportFailures === 0) {
                            matchFailed("\"[\"");
                          }
                        }
                        if (r3 !== null) {
                          r4 = parse__();
                          if (r4 !== null) {
                            r5 = parse_assignmentExpression();
                            r5 = r5 !== null ? r5 : "";
                            if (r5 !== null) {
                              r6 = parse__();
                              if (r6 !== null) {
                                if (input.substr(pos, 2) === "..") {
                                  r7 = "..";
                                  pos += 2;
                                } else {
                                  r7 = null;
                                  if (reportFailures === 0) {
                                    matchFailed("\"..\"");
                                  }
                                }
                                if (r7 !== null) {
                                  if (input.charCodeAt(pos) === 46) {
                                    r8 = ".";
                                    pos++;
                                  } else {
                                    r8 = null;
                                    if (reportFailures === 0) {
                                      matchFailed("\".\"");
                                    }
                                  }
                                  r8 = r8 !== null ? r8 : "";
                                  if (r8 !== null) {
                                    r9 = parse__();
                                    if (r9 !== null) {
                                      r10 = parse_assignmentExpression();
                                      r10 = r10 !== null ? r10 : "";
                                      if (r10 !== null) {
                                        r11 = parse__();
                                        if (r11 !== null) {
                                          if (input.charCodeAt(pos) === 93) {
                                            r12 = "]";
                                            pos++;
                                          } else {
                                            r12 = null;
                                            if (reportFailures === 0) {
                                              matchFailed("\"]\"");
                                            }
                                          }
                                          if (r12 !== null) {
                                            r0 = [r3, r4, r5, r6, r7, r8, r9, r10, r11, r12];
                                          } else {
                                            r0 = null;
                                            pos = r2;
                                          }
                                        } else {
                                          r0 = null;
                                          pos = r2;
                                        }
                                      } else {
                                        r0 = null;
                                        pos = r2;
                                      }
                                    } else {
                                      r0 = null;
                                      pos = r2;
                                    }
                                  } else {
                                    r0 = null;
                                    pos = r2;
                                  }
                                } else {
                                  r0 = null;
                                  pos = r2;
                                }
                              } else {
                                r0 = null;
                                pos = r2;
                              }
                            } else {
                              r0 = null;
                              pos = r2;
                            }
                          } else {
                            r0 = null;
                            pos = r2;
                          }
                        } else {
                          r0 = null;
                          pos = r2;
                        }
                        if (r0 !== null) {
                          reportedPos = r1;
                          r0 = (function(left, exclusive, right) {
                                return rp({op: CS.Slice, operands: [!exclusive, left || null, right || null]});
                              })(r5, r8, r10);
                        }
                        if (r0 === null) {
                          pos = r1;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_primaryExpression() {
        var cacheKey = "primaryExpression@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9;
        
        r0 = parse_macro();
        if (r0 === null) {
          r0 = parse_Numbers();
          if (r0 === null) {
            r0 = parse_bool();
            if (r0 === null) {
              r0 = parse_null();
              if (r0 === null) {
                r0 = parse_undefined();
                if (r0 === null) {
                  r0 = parse_contextVar();
                  if (r0 === null) {
                    r1 = pos;
                    r0 = parse_THIS();
                    if (r0 === null) {
                      if (input.charCodeAt(pos) === 64) {
                        r0 = "@";
                        pos++;
                      } else {
                        r0 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"@\"");
                        }
                      }
                    }
                    if (r0 !== null) {
                      reportedPos = r1;
                      r0 = (function(r) { return rp(new CS.This); })(r0);
                    }
                    if (r0 === null) {
                      pos = r1;
                    }
                    if (r0 === null) {
                      r0 = parse_identifier();
                      if (r0 === null) {
                        r0 = parse_range();
                        if (r0 === null) {
                          r0 = parse_arrayLiteral();
                          if (r0 === null) {
                            r0 = parse_objectLiteral();
                            if (r0 === null) {
                              r0 = parse_interpolation();
                              if (r0 === null) {
                                r0 = parse_JSLiteral();
                                if (r0 === null) {
                                  r0 = parse_string();
                                  if (r0 === null) {
                                    r0 = parse_regexp();
                                    if (r0 === null) {
                                      r1 = pos;
                                      r2 = pos;
                                      if (input.charCodeAt(pos) === 40) {
                                        r3 = "(";
                                        pos++;
                                      } else {
                                        r3 = null;
                                        if (reportFailures === 0) {
                                          matchFailed("\"(\"");
                                        }
                                      }
                                      if (r3 !== null) {
                                        r4 = parse_TERMINDENT();
                                        if (r4 !== null) {
                                          r5 = parse_expression();
                                          if (r5 !== null) {
                                            r6 = parse_DEDENT();
                                            if (r6 !== null) {
                                              r7 = parse_TERMINATOR();
                                              r7 = r7 !== null ? r7 : "";
                                              if (r7 !== null) {
                                                if (input.charCodeAt(pos) === 41) {
                                                  r8 = ")";
                                                  pos++;
                                                } else {
                                                  r8 = null;
                                                  if (reportFailures === 0) {
                                                    matchFailed("\")\"");
                                                  }
                                                }
                                                if (r8 !== null) {
                                                  r0 = [r3, r4, r5, r6, r7, r8];
                                                } else {
                                                  r0 = null;
                                                  pos = r2;
                                                }
                                              } else {
                                                r0 = null;
                                                pos = r2;
                                              }
                                            } else {
                                              r0 = null;
                                              pos = r2;
                                            }
                                          } else {
                                            r0 = null;
                                            pos = r2;
                                          }
                                        } else {
                                          r0 = null;
                                          pos = r2;
                                        }
                                      } else {
                                        r0 = null;
                                        pos = r2;
                                      }
                                      if (r0 !== null) {
                                        reportedPos = r1;
                                        r0 = (function(e) { return r(e.clone()); })(r5);
                                      }
                                      if (r0 === null) {
                                        pos = r1;
                                      }
                                      if (r0 === null) {
                                        r1 = pos;
                                        r2 = pos;
                                        if (input.charCodeAt(pos) === 40) {
                                          r3 = "(";
                                          pos++;
                                        } else {
                                          r3 = null;
                                          if (reportFailures === 0) {
                                            matchFailed("\"(\"");
                                          }
                                        }
                                        if (r3 !== null) {
                                          r4 = parse__();
                                          if (r4 !== null) {
                                            r5 = parse_expression();
                                            if (r5 !== null) {
                                              r6 = parse__();
                                              if (r6 !== null) {
                                                r7 = parse_TERMINATOR();
                                                r7 = r7 !== null ? r7 : "";
                                                if (r7 !== null) {
                                                  r8 = parse__();
                                                  if (r8 !== null) {
                                                    if (input.charCodeAt(pos) === 41) {
                                                      r9 = ")";
                                                      pos++;
                                                    } else {
                                                      r9 = null;
                                                      if (reportFailures === 0) {
                                                        matchFailed("\")\"");
                                                      }
                                                    }
                                                    if (r9 !== null) {
                                                      r0 = [r3, r4, r5, r6, r7, r8, r9];
                                                    } else {
                                                      r0 = null;
                                                      pos = r2;
                                                    }
                                                  } else {
                                                    r0 = null;
                                                    pos = r2;
                                                  }
                                                } else {
                                                  r0 = null;
                                                  pos = r2;
                                                }
                                              } else {
                                                r0 = null;
                                                pos = r2;
                                              }
                                            } else {
                                              r0 = null;
                                              pos = r2;
                                            }
                                          } else {
                                            r0 = null;
                                            pos = r2;
                                          }
                                        } else {
                                          r0 = null;
                                          pos = r2;
                                        }
                                        if (r0 !== null) {
                                          reportedPos = r1;
                                          r0 = (function(e) { return r(e.clone()); })(r5);
                                        }
                                        if (r0 === null) {
                                          pos = r1;
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_contextVar() {
        var cacheKey = "contextVar@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        r2 = pos;
        r4 = pos;
        if (input.charCodeAt(pos) === 64) {
          r3 = "@";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"@\"");
          }
        }
        if (r3 !== null) {
          reportedPos = r4;
          r3 = (function() { return rp(new CS.This); })();
        }
        if (r3 === null) {
          pos = r4;
        }
        if (r3 !== null) {
          r4 = parse_identifierName();
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(a, m) {
                return rp(new CS.MemberAccessOp(a, m));
              })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_JSLiteral() {
        var cacheKey = "JSLiteral@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 96) {
          r3 = "`";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"`\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          r4 = [];
          if (/^[^`]/.test(input.charAt(pos))) {
            r6 = input.charAt(pos);
            pos++;
          } else {
            r6 = null;
            if (reportFailures === 0) {
              matchFailed("[^`]");
            }
          }
          while (r6 !== null) {
            r4.push(r6);
            if (/^[^`]/.test(input.charAt(pos))) {
              r6 = input.charAt(pos);
              pos++;
            } else {
              r6 = null;
              if (reportFailures === 0) {
                matchFailed("[^`]");
              }
            }
          }
          if (r4 !== null) {
            r4 = input.substring(pos, r5);
          }
          if (r4 !== null) {
            if (input.charCodeAt(pos) === 96) {
              r5 = "`";
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\"`\"");
              }
            }
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(d) { return rp(new CS.JavaScript(d)); })(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_spread() {
        var cacheKey = "spread@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_postfixExpression();
        if (r3 !== null) {
          if (input.substr(pos, 3) === "...") {
            r4 = "...";
            pos += 3;
          } else {
            r4 = null;
            if (reportFailures === 0) {
              matchFailed("\"...\"");
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(e) { return rp(new CS.Spread(e)); })(r3);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_conditional() {
        var cacheKey = "conditional@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_IF();
        if (r3 === null) {
          r3 = parse_UNLESS();
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_assignmentExpression();
            if (r5 !== null) {
              r6 = parse_conditionalBody();
              if (r6 !== null) {
                r7 = parse_elseClause();
                r7 = r7 !== null ? r7 : "";
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(kw, cond, body, elseClause) {
              var constructor = 'unless' === kw ? CS.NegatedConditional : CS.Conditional;
              if('unless' === kw) cond = new CS.LogicalNotOp(cond).g();
              return rp(new constructor(cond, body.block, elseClause || null));
            })(r3, r5, r6, r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_conditionalBody() {
        var cacheKey = "conditionalBody@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        r3 = parse__();
        if (r3 !== null) {
          r4 = parse_TERMINDENT();
          if (r4 !== null) {
            r5 = parse_block();
            if (r5 !== null) {
              r6 = parse_DEDENT();
              if (r6 !== null) {
                r0 = [r3, r4, r5, r6];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(b) { return {block: b}; })(r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r3 = parse_TERMINATOR();
          r3 = r3 !== null ? r3 : "";
          if (r3 !== null) {
            r4 = parse__();
            if (r4 !== null) {
              r5 = parse_THEN();
              if (r5 !== null) {
                r6 = parse__();
                if (r6 !== null) {
                  r7 = parse_statement();
                  if (r7 !== null) {
                    r0 = [r3, r4, r5, r6, r7];
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(s) { return {block: s}; })(r7);
          }
          if (r0 === null) {
            pos = r1;
          }
          if (r0 === null) {
            r1 = pos;
            r2 = pos;
            r3 = parse__();
            if (r3 !== null) {
              r4 = parse_THEN();
              if (r4 !== null) {
                r0 = [r3, r4];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
            if (r0 !== null) {
              reportedPos = r1;
              r0 = (function() { return {block: null}; })();
            }
            if (r0 === null) {
              pos = r1;
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_elseClause() {
        var cacheKey = "elseClause@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        r3 = parse__();
        if (r3 !== null) {
          r4 = parse_TERMINATOR();
          r4 = r4 !== null ? r4 : "";
          if (r4 !== null) {
            r5 = parse__();
            if (r5 !== null) {
              r6 = parse_ELSE();
              if (r6 !== null) {
                r7 = parse_functionBody();
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(b) { return b; })(r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_while() {
        var cacheKey = "while@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_WHILE();
        if (r3 === null) {
          r3 = parse_UNTIL();
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_assignmentExpression();
            if (r5 !== null) {
              r6 = parse_conditionalBody();
              if (r6 !== null) {
                r0 = [r3, r4, r5, r6];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(kw, cond, body) {
              var constructor = 'until' === kw ? CS.NegatedWhile : CS.While;
              if('until' === kw) cond = new CS.LogicalNotOp(cond).g();
              return rp(new constructor(cond, body.block));
            })(r3, r5, r6);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_loop() {
        var cacheKey = "loop@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_LOOP();
        if (r3 !== null) {
          r4 = parse_conditionalBody();
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(body) {
              return rp(new CS.Loop(body.block));
            })(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_try() {
        var cacheKey = "try@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_TRY();
        if (r3 !== null) {
          r4 = parse_tryBody();
          if (r4 !== null) {
            r5 = parse_catchClause();
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r6 = parse_finallyClause();
              r6 = r6 !== null ? r6 : "";
              if (r6 !== null) {
                r0 = [r3, r4, r5, r6];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(body, c, f) {
              return rp(new CS.Try(body.block, c ? c.assignee : null, c ? c.block : null, f ? f.block : null));
            })(r4, r5, r6);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_tryBody() {
        var cacheKey = "tryBody@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1;
        
        r1 = pos;
        r0 = parse_functionBody();
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(b) { return {block: b}; })(r0);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r0 = parse_conditionalBody();
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_catchClause() {
        var cacheKey = "catchClause@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_TERMINATOR();
        r3 = r3 !== null ? r3 : "";
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_CATCH();
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r7 = parse_Assignable();
                if (r7 !== null) {
                  r8 = parse_conditionalBody();
                  if (r8 !== null) {
                    r0 = [r3, r4, r5, r6, r7, r8];
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(e, body) {
              return r({block: body.block, assignee: e});
            })(r7, r8);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_finallyClause() {
        var cacheKey = "finallyClause@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_TERMINATOR();
        r3 = r3 !== null ? r3 : "";
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_FINALLY();
            if (r5 !== null) {
              r6 = parse_tryBody();
              if (r6 !== null) {
                r0 = [r3, r4, r5, r6];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(body) {
              return r({block: body.block});
            })(r6);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_class() {
        var cacheKey = "class@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_CLASS();
        if (r3 !== null) {
          r5 = pos;
          r6 = parse__();
          if (r6 !== null) {
            r7 = parse_Assignable();
            if (r7 !== null) {
              r4 = [r6, r7];
            } else {
              r4 = null;
              pos = r5;
            }
          } else {
            r4 = null;
            pos = r5;
          }
          r4 = r4 !== null ? r4 : "";
          if (r4 !== null) {
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              r8 = parse_EXTENDS();
              if (r8 !== null) {
                r9 = parse__();
                if (r9 !== null) {
                  r10 = parse_extendee();
                  if (r10 !== null) {
                    r5 = [r7, r8, r9, r10];
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r6 = parse_classBody();
              if (r6 !== null) {
                r0 = [r3, r4, r5, r6];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(name, parent, body) {
              var ctor = null;
              name = name ? name[1] : null;
              parent = parent ? parent[3] : null;
              var boundMembers = [];
              var stmts = body ? body.statements || [body] : [];
              for(var i = 0, l = stmts.length; i < l; ++i) {
                var m = stmts[i];
                if(m.instanceof(CS.Constructor)) {
                  ctor = m;
                } else if(m.instanceof(CS.ClassProtoAssignOp) && m.expression.instanceof(CS.BoundFunction)) {
                  boundMembers.push(m);
                }
              }
              return rp(new CS.Class(name, parent, ctor, body, boundMembers));
            })(r4, r5, r6);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_extendee() {
        var cacheKey = "extendee@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9;
        
        r0 = parse_expressionworthy();
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r4 = pos;
          reportFailures++;
          r5 = pos;
          r6 = parse_memberExpression();
          if (r6 !== null) {
            r7 = [];
            r8 = parse_MemberAccessOps();
            if (r8 === null) {
              r8 = parse_argumentList();
            }
            while (r8 !== null) {
              r7.push(r8);
              r8 = parse_MemberAccessOps();
              if (r8 === null) {
                r8 = parse_argumentList();
              }
            }
            if (r7 !== null) {
              r8 = parse_TERMINDENT();
              if (r8 !== null) {
                r9 = parse_implicitObjectLiteralMember();
                if (r9 !== null) {
                  r3 = [r6, r7, r8, r9];
                } else {
                  r3 = null;
                  pos = r5;
                }
              } else {
                r3 = null;
                pos = r5;
              }
            } else {
              r3 = null;
              pos = r5;
            }
          } else {
            r3 = null;
            pos = r5;
          }
          reportFailures--;
          if (r3 === null) {
            r3 = "";
          } else {
            r3 = null;
            pos = r4;
          }
          if (r3 !== null) {
            r4 = parse_assignmentExpression();
            if (r4 !== null) {
              r0 = [r3, r4];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(a) { return a; })(r4);
          }
          if (r0 === null) {
            pos = r1;
          }
          if (r0 === null) {
            r1 = pos;
            r2 = pos;
            r3 = parse_memberExpression();
            if (r3 !== null) {
              r5 = pos;
              r6 = parse_argumentList();
              if (r6 !== null) {
                r7 = [];
                r8 = parse_MemberAccessOps();
                if (r8 === null) {
                  r8 = parse_argumentList();
                }
                while (r8 !== null) {
                  r7.push(r8);
                  r8 = parse_MemberAccessOps();
                  if (r8 === null) {
                    r8 = parse_argumentList();
                  }
                }
                if (r7 !== null) {
                  r4 = [r6, r7];
                } else {
                  r4 = null;
                  pos = r5;
                }
              } else {
                r4 = null;
                pos = r5;
              }
              r4 = r4 !== null ? r4 : "";
              if (r4 !== null) {
                r0 = [r3, r4];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
            if (r0 !== null) {
              reportedPos = r1;
              r0 = (function(fn, accesses) {
                    if(!accesses) return fn;
                    return createMemberExpression(fn, [accesses[0]].concat(accesses[1] || []));
                  })(r3, r4);
            }
            if (r0 === null) {
              pos = r1;
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_classBody() {
        var cacheKey = "classBody@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6;
        
        r1 = pos;
        r2 = pos;
        r3 = parse__();
        if (r3 !== null) {
          r4 = parse_TERMINDENT();
          if (r4 !== null) {
            r5 = parse_classBlock();
            if (r5 !== null) {
              r6 = parse_DEDENT();
              if (r6 !== null) {
                r0 = [r3, r4, r5, r6];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(b) { return b; })(r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r3 = parse__();
          if (r3 !== null) {
            r4 = parse_THEN();
            if (r4 !== null) {
              r5 = parse__();
              if (r5 !== null) {
                r6 = parse_classStatement();
                if (r6 !== null) {
                  r0 = [r3, r4, r5, r6];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(s) { return s; })(r6);
          }
          if (r0 === null) {
            pos = r1;
          }
          if (r0 === null) {
            r1 = pos;
            r2 = pos;
            r3 = parse__();
            if (r3 !== null) {
              r4 = parse_THEN();
              if (r4 !== null) {
                r0 = [r3, r4];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
            r0 = r0 !== null ? r0 : "";
            if (r0 !== null) {
              reportedPos = r1;
              r0 = (function() { return new CS.Block([]); })();
            }
            if (r0 === null) {
              pos = r1;
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_classBlock() {
        var cacheKey = "classBlock@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_classStatement();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            r8 = parse_TERMINATOR();
            if (r8 !== null) {
              r9 = parse__();
              if (r9 !== null) {
                r10 = parse_classStatement();
                if (r10 !== null) {
                  r5 = [r7, r8, r9, r10];
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              r8 = parse_TERMINATOR();
              if (r8 !== null) {
                r9 = parse__();
                if (r9 !== null) {
                  r10 = parse_classStatement();
                  if (r10 !== null) {
                    r5 = [r7, r8, r9, r10];
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r5 = parse_TERMINATOR();
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(s, ss) {
                return rp(new CS.Block([s].concat(ss.map(function(s){ return s[3]; }))));
              })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_classStatement() {
        var cacheKey = "classStatement@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        r0 = parse_classProtoAssignment();
        if (r0 === null) {
          r0 = parse_staticAssignment();
          if (r0 === null) {
            r0 = parse_constructor();
            if (r0 === null) {
              r0 = parse_expression();
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_constructor() {
        var cacheKey = "constructor@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r4 = pos;
        r3 = parse_ObjectInitialiserKeys();
        if (r3 !== null) {
          reportedPos = r4;
          r3 = (function(key) { return key.instanceof(CS.String, CS.Identifier) && 'constructor' === key.data || null; })(r3);
        }
        if (r3 === null) {
          pos = r4;
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            if (input.charCodeAt(pos) === 58) {
              r5 = ":";
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\":\"");
              }
            }
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r8 = pos;
                r9 = pos;
                r10 = parse_TERMINDENT();
                if (r10 !== null) {
                  r11 = parse_expression();
                  if (r11 !== null) {
                    r12 = parse_DEDENT();
                    if (r12 !== null) {
                      r7 = [r10, r11, r12];
                    } else {
                      r7 = null;
                      pos = r9;
                    }
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                } else {
                  r7 = null;
                  pos = r9;
                }
                if (r7 !== null) {
                  reportedPos = r8;
                  r7 = (function(e) { return e; })(r11);
                }
                if (r7 === null) {
                  pos = r8;
                }
                if (r7 === null) {
                  r8 = pos;
                  r9 = pos;
                  r10 = parse_TERMINATOR();
                  r10 = r10 !== null ? r10 : "";
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      r12 = parse_expression();
                      if (r12 !== null) {
                        r7 = [r10, r11, r12];
                      } else {
                        r7 = null;
                        pos = r9;
                      }
                    } else {
                      r7 = null;
                      pos = r9;
                    }
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                  if (r7 !== null) {
                    reportedPos = r8;
                    r7 = (function(e) { return e; })(r12);
                  }
                  if (r7 === null) {
                    pos = r8;
                  }
                }
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(e) {
                if(e.instanceof(CS.BoundFunction))
                  e = c(new CS.Function(e.parameters, e.block).r(e.raw), e);
                return rp(new CS.Constructor(e));
              })(r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_staticAssignment() {
        var cacheKey = "staticAssignment@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_contextVar();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            if (input.charCodeAt(pos) === 58) {
              r5 = ":";
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\":\"");
              }
            }
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r7 = parse_expression();
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(key, e) {
                return rp(new CS.AssignOp(key, e));
              })(r3, r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_classProtoAssignment() {
        var cacheKey = "classProtoAssignment@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_ObjectInitialiserKeys();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            if (input.charCodeAt(pos) === 58) {
              r5 = ":";
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\":\"");
              }
            }
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r8 = pos;
                r9 = pos;
                r10 = parse_TERMINDENT();
                if (r10 !== null) {
                  r11 = parse_expression();
                  if (r11 !== null) {
                    r12 = parse_DEDENT();
                    if (r12 !== null) {
                      r7 = [r10, r11, r12];
                    } else {
                      r7 = null;
                      pos = r9;
                    }
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                } else {
                  r7 = null;
                  pos = r9;
                }
                if (r7 !== null) {
                  reportedPos = r8;
                  r7 = (function(e) { return r({expr: e}); })(r11);
                }
                if (r7 === null) {
                  pos = r8;
                }
                if (r7 === null) {
                  r8 = pos;
                  r9 = pos;
                  r10 = parse_TERMINATOR();
                  r10 = r10 !== null ? r10 : "";
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      r12 = parse_expression();
                      if (r12 !== null) {
                        r7 = [r10, r11, r12];
                      } else {
                        r7 = null;
                        pos = r9;
                      }
                    } else {
                      r7 = null;
                      pos = r9;
                    }
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                  if (r7 !== null) {
                    reportedPos = r8;
                    r7 = (function(e) { return r({expr: e}); })(r12);
                  }
                  if (r7 === null) {
                    pos = r8;
                  }
                }
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(key, e) {
                if('constructor' === key.data) return null;
                return rp(new CS.ClassProtoAssignOp(key, e.expr));
              })(r3, r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_forOf() {
        var cacheKey = "forOf@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_FOR();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r6 = pos;
            r7 = parse_OWN();
            if (r7 !== null) {
              r8 = parse__();
              if (r8 !== null) {
                r5 = [r7, r8];
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r6 = parse_Assignable();
              if (r6 !== null) {
                r7 = parse__();
                if (r7 !== null) {
                  r9 = pos;
                  if (input.charCodeAt(pos) === 44) {
                    r10 = ",";
                    pos++;
                  } else {
                    r10 = null;
                    if (reportFailures === 0) {
                      matchFailed("\",\"");
                    }
                  }
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      r12 = parse_Assignable();
                      if (r12 !== null) {
                        r13 = parse__();
                        if (r13 !== null) {
                          r8 = [r10, r11, r12, r13];
                        } else {
                          r8 = null;
                          pos = r9;
                        }
                      } else {
                        r8 = null;
                        pos = r9;
                      }
                    } else {
                      r8 = null;
                      pos = r9;
                    }
                  } else {
                    r8 = null;
                    pos = r9;
                  }
                  r8 = r8 !== null ? r8 : "";
                  if (r8 !== null) {
                    r9 = parse_OF();
                    if (r9 !== null) {
                      r10 = parse__();
                      if (r10 !== null) {
                        r11 = parse_assignmentExpression();
                        if (r11 !== null) {
                          r12 = parse__();
                          if (r12 !== null) {
                            r14 = pos;
                            r15 = parse_WHEN();
                            if (r15 !== null) {
                              r16 = parse__();
                              if (r16 !== null) {
                                r17 = parse_assignmentExpression();
                                if (r17 !== null) {
                                  r18 = parse__();
                                  if (r18 !== null) {
                                    r13 = [r15, r16, r17, r18];
                                  } else {
                                    r13 = null;
                                    pos = r14;
                                  }
                                } else {
                                  r13 = null;
                                  pos = r14;
                                }
                              } else {
                                r13 = null;
                                pos = r14;
                              }
                            } else {
                              r13 = null;
                              pos = r14;
                            }
                            r13 = r13 !== null ? r13 : "";
                            if (r13 !== null) {
                              r14 = parse_conditionalBody();
                              if (r14 !== null) {
                                r0 = [r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14];
                              } else {
                                r0 = null;
                                pos = r2;
                              }
                            } else {
                              r0 = null;
                              pos = r2;
                            }
                          } else {
                            r0 = null;
                            pos = r2;
                          }
                        } else {
                          r0 = null;
                          pos = r2;
                        }
                      } else {
                        r0 = null;
                        pos = r2;
                      }
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(own, key, maybeVal, obj, maybeFilter, body) {
              var val = maybeVal ? maybeVal[2] : null;
              var filter = maybeFilter ? maybeFilter[2] : null;
              return rp(new CS.ForOf(!!own, key, val, obj, filter, body.block));
            })(r5, r6, r8, r11, r13, r14);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_forIn() {
        var cacheKey = "forIn@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_FOR();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_Assignable();
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r8 = pos;
                if (input.charCodeAt(pos) === 44) {
                  r9 = ",";
                  pos++;
                } else {
                  r9 = null;
                  if (reportFailures === 0) {
                    matchFailed("\",\"");
                  }
                }
                if (r9 !== null) {
                  r10 = parse__();
                  if (r10 !== null) {
                    r11 = parse_Assignable();
                    if (r11 !== null) {
                      r12 = parse__();
                      if (r12 !== null) {
                        r7 = [r9, r10, r11, r12];
                      } else {
                        r7 = null;
                        pos = r8;
                      }
                    } else {
                      r7 = null;
                      pos = r8;
                    }
                  } else {
                    r7 = null;
                    pos = r8;
                  }
                } else {
                  r7 = null;
                  pos = r8;
                }
                r7 = r7 !== null ? r7 : "";
                if (r7 !== null) {
                  r8 = parse_IN();
                  if (r8 !== null) {
                    r9 = parse__();
                    if (r9 !== null) {
                      r10 = parse_assignmentExpression();
                      if (r10 !== null) {
                        r11 = parse__();
                        if (r11 !== null) {
                          r13 = pos;
                          r14 = parse_BY();
                          if (r14 !== null) {
                            r15 = parse__();
                            if (r15 !== null) {
                              r16 = parse_assignmentExpression();
                              if (r16 !== null) {
                                r17 = parse__();
                                if (r17 !== null) {
                                  r12 = [r14, r15, r16, r17];
                                } else {
                                  r12 = null;
                                  pos = r13;
                                }
                              } else {
                                r12 = null;
                                pos = r13;
                              }
                            } else {
                              r12 = null;
                              pos = r13;
                            }
                          } else {
                            r12 = null;
                            pos = r13;
                          }
                          r12 = r12 !== null ? r12 : "";
                          if (r12 !== null) {
                            r14 = pos;
                            r15 = parse_WHEN();
                            if (r15 !== null) {
                              r16 = parse__();
                              if (r16 !== null) {
                                r17 = parse_assignmentExpression();
                                if (r17 !== null) {
                                  r18 = parse__();
                                  if (r18 !== null) {
                                    r13 = [r15, r16, r17, r18];
                                  } else {
                                    r13 = null;
                                    pos = r14;
                                  }
                                } else {
                                  r13 = null;
                                  pos = r14;
                                }
                              } else {
                                r13 = null;
                                pos = r14;
                              }
                            } else {
                              r13 = null;
                              pos = r14;
                            }
                            r13 = r13 !== null ? r13 : "";
                            if (r13 !== null) {
                              r14 = parse_conditionalBody();
                              if (r14 !== null) {
                                r0 = [r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14];
                              } else {
                                r0 = null;
                                pos = r2;
                              }
                            } else {
                              r0 = null;
                              pos = r2;
                            }
                          } else {
                            r0 = null;
                            pos = r2;
                          }
                        } else {
                          r0 = null;
                          pos = r2;
                        }
                      } else {
                        r0 = null;
                        pos = r2;
                      }
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(val, maybeKey, list, maybeStep, maybeFilter, body) {
              var key = maybeKey ? maybeKey[2] : null;
              var step = maybeStep ? maybeStep[2] : new CS.Int(1).r('1').g();
              var filter = maybeFilter ? maybeFilter[2] : null;
              return rp(new CS.ForIn(val, key, list, step, filter, body.block));
            })(r5, r7, r10, r12, r13, r14);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_switch() {
        var cacheKey = "switch@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_SWITCH();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_expressionworthy();
            if (r5 === null) {
              r5 = parse_assignmentExpression();
            }
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r6 = parse_switchBody();
              if (r6 !== null) {
                r0 = [r3, r4, r5, r6];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(e, body) {
              return rp(new CS.Switch(e || null, body.cases, body['else'] || null));
            })(r5, r6);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_switchBody() {
        var cacheKey = "switchBody@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6;
        
        r1 = pos;
        r2 = pos;
        r3 = parse__();
        if (r3 !== null) {
          r4 = parse_TERMINDENT();
          if (r4 !== null) {
            r5 = parse_switchBlock();
            if (r5 !== null) {
              r6 = parse_DEDENT();
              if (r6 !== null) {
                r0 = [r3, r4, r5, r6];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(b) { return r({cases: b.cases, 'else': b['else']}); })(r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r3 = parse__();
          if (r3 !== null) {
            r4 = parse_THEN();
            if (r4 !== null) {
              r5 = parse__();
              if (r5 !== null) {
                r6 = parse_case();
                if (r6 !== null) {
                  r0 = [r3, r4, r5, r6];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(c) { return r({cases: [c]}); })(r6);
          }
          if (r0 === null) {
            pos = r1;
          }
          if (r0 === null) {
            r1 = pos;
            r2 = pos;
            r3 = parse__();
            if (r3 !== null) {
              r4 = parse_THEN();
              if (r4 !== null) {
                r0 = [r3, r4];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
            if (r0 !== null) {
              reportedPos = r1;
              r0 = (function() { return r({cases: []}); })();
            }
            if (r0 === null) {
              pos = r1;
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_switchBlock() {
        var cacheKey = "switchBlock@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_case();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            r8 = parse_TERMINATOR();
            if (r8 !== null) {
              r9 = parse__();
              if (r9 !== null) {
                r10 = parse_case();
                if (r10 !== null) {
                  r5 = [r7, r8, r9, r10];
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              r8 = parse_TERMINATOR();
              if (r8 !== null) {
                r9 = parse__();
                if (r9 !== null) {
                  r10 = parse_case();
                  if (r10 !== null) {
                    r5 = [r7, r8, r9, r10];
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              r8 = parse_TERMINATOR();
              if (r8 !== null) {
                r9 = parse__();
                if (r9 !== null) {
                  r10 = parse_elseClause();
                  if (r10 !== null) {
                    r5 = [r7, r8, r9, r10];
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r6 = parse_TERMINATOR();
              r6 = r6 !== null ? r6 : "";
              if (r6 !== null) {
                r0 = [r3, r4, r5, r6];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(c, cs, elseClause) {
                var cases = [c].concat(cs.map(function(w){ return w[3]; }));
                return r({cases: cases, 'else': elseClause ? elseClause[3] : null});
              })(r3, r4, r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_case() {
        var cacheKey = "case@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_WHEN();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_caseConditions();
            if (r5 !== null) {
              r6 = parse_conditionalBody();
              if (r6 !== null) {
                r0 = [r3, r4, r5, r6];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(conditions, body) {
                return rp(new CS.SwitchCase(conditions, body.block));
              })(r5, r6);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_caseConditions() {
        var cacheKey = "caseConditions@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_assignmentExpression();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            if (input.charCodeAt(pos) === 44) {
              r8 = ",";
              pos++;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("\",\"");
              }
            }
            if (r8 !== null) {
              r9 = parse__();
              if (r9 !== null) {
                r10 = parse_assignmentExpression();
                if (r10 !== null) {
                  r5 = [r7, r8, r9, r10];
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              if (input.charCodeAt(pos) === 44) {
                r8 = ",";
                pos++;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\",\"");
                }
              }
              if (r8 !== null) {
                r9 = parse__();
                if (r9 !== null) {
                  r10 = parse_assignmentExpression();
                  if (r10 !== null) {
                    r5 = [r7, r8, r9, r10];
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(c, cs) {
                return [c].concat(cs.map(function(c){ return c[3]; }));
              })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_functionLiteral() {
        var cacheKey = "functionLiteral@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13;
        
        r1 = pos;
        r2 = pos;
        r4 = pos;
        if (input.charCodeAt(pos) === 40) {
          r5 = "(";
          pos++;
        } else {
          r5 = null;
          if (reportFailures === 0) {
            matchFailed("\"(\"");
          }
        }
        if (r5 !== null) {
          r6 = parse__();
          if (r6 !== null) {
            r8 = pos;
            r9 = pos;
            r10 = parse_TERMINDENT();
            if (r10 !== null) {
              r11 = parse_parameterList();
              if (r11 !== null) {
                r12 = parse_DEDENT();
                if (r12 !== null) {
                  r13 = parse_TERMINATOR();
                  if (r13 !== null) {
                    r7 = [r10, r11, r12, r13];
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                } else {
                  r7 = null;
                  pos = r9;
                }
              } else {
                r7 = null;
                pos = r9;
              }
            } else {
              r7 = null;
              pos = r9;
            }
            if (r7 !== null) {
              reportedPos = r8;
              r7 = (function(p) { return p; })(r11);
            }
            if (r7 === null) {
              pos = r8;
            }
            if (r7 === null) {
              r7 = parse_parameterList();
            }
            r7 = r7 !== null ? r7 : "";
            if (r7 !== null) {
              r8 = parse__();
              if (r8 !== null) {
                if (input.charCodeAt(pos) === 41) {
                  r9 = ")";
                  pos++;
                } else {
                  r9 = null;
                  if (reportFailures === 0) {
                    matchFailed("\")\"");
                  }
                }
                if (r9 !== null) {
                  r10 = parse__();
                  if (r10 !== null) {
                    r3 = [r5, r6, r7, r8, r9, r10];
                  } else {
                    r3 = null;
                    pos = r4;
                  }
                } else {
                  r3 = null;
                  pos = r4;
                }
              } else {
                r3 = null;
                pos = r4;
              }
            } else {
              r3 = null;
              pos = r4;
            }
          } else {
            r3 = null;
            pos = r4;
          }
        } else {
          r3 = null;
          pos = r4;
        }
        r3 = r3 !== null ? r3 : "";
        if (r3 !== null) {
          if (input.substr(pos, 2) === "->") {
            r4 = "->";
            pos += 2;
          } else {
            r4 = null;
            if (reportFailures === 0) {
              matchFailed("\"->\"");
            }
          }
          if (r4 === null) {
            if (input.substr(pos, 2) === "=>") {
              r4 = "=>";
              pos += 2;
            } else {
              r4 = null;
              if (reportFailures === 0) {
                matchFailed("\"=>\"");
              }
            }
          }
          if (r4 !== null) {
            r5 = parse_functionBody();
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(params, arrow, body) {
              var constructor;
              switch(arrow) {
                case '->': constructor = CS.Function; break;
                case '=>': constructor = CS.BoundFunction; break;
                default: throw new Error('parsed function arrow ("' + arrow + '") not associated with a constructor');
              }
              return rp(new constructor(params && params[2] || [], body || null));
            })(r3, r4, r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_functionBody() {
        var cacheKey = "functionBody@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6;
        
        r1 = pos;
        r2 = pos;
        r3 = parse__();
        if (r3 !== null) {
          r4 = parse_TERMINDENT();
          if (r4 !== null) {
            r5 = parse_block();
            if (r5 !== null) {
              r6 = parse_DEDENT();
              if (r6 !== null) {
                r0 = [r3, r4, r5, r6];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(b) { return b; })(r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r3 = parse__();
          if (r3 !== null) {
            r4 = parse_statement();
            if (r4 !== null) {
              r0 = [r3, r4];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(s) { return s; })(r4);
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_parameter() {
        var cacheKey = "parameter@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_Assignable();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            if (input.charCodeAt(pos) === 61) {
              r5 = "=";
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\"=\"");
              }
            }
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r7 = parse_secondaryExpression();
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(param, default_) {
                return rp(new CS.DefaultParam(param, default_));
              })(r3, r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r0 = parse_rest();
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_rest() {
        var cacheKey = "rest@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_Assignable();
        if (r3 !== null) {
          if (input.substr(pos, 3) === "...") {
            r4 = "...";
            pos += 3;
          } else {
            r4 = null;
            if (reportFailures === 0) {
              matchFailed("\"...\"");
            }
          }
          r4 = r4 !== null ? r4 : "";
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(a, rest) {
                  return rp(rest ? new CS.Rest(a) : a);
                })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_parameterList() {
        var cacheKey = "parameterList@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_parameter();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            r9 = pos;
            if (input.charCodeAt(pos) === 44) {
              r10 = ",";
              pos++;
            } else {
              r10 = null;
              if (reportFailures === 0) {
                matchFailed("\",\"");
              }
            }
            if (r10 !== null) {
              r11 = parse_TERMINATOR();
              r11 = r11 !== null ? r11 : "";
              if (r11 !== null) {
                r8 = [r10, r11];
              } else {
                r8 = null;
                pos = r9;
              }
            } else {
              r8 = null;
              pos = r9;
            }
            if (r8 === null) {
              r8 = parse_TERMINATOR();
            }
            if (r8 !== null) {
              r9 = parse__();
              if (r9 !== null) {
                r10 = parse_parameter();
                if (r10 !== null) {
                  r5 = [r7, r8, r9, r10];
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              r9 = pos;
              if (input.charCodeAt(pos) === 44) {
                r10 = ",";
                pos++;
              } else {
                r10 = null;
                if (reportFailures === 0) {
                  matchFailed("\",\"");
                }
              }
              if (r10 !== null) {
                r11 = parse_TERMINATOR();
                r11 = r11 !== null ? r11 : "";
                if (r11 !== null) {
                  r8 = [r10, r11];
                } else {
                  r8 = null;
                  pos = r9;
                }
              } else {
                r8 = null;
                pos = r9;
              }
              if (r8 === null) {
                r8 = parse_TERMINATOR();
              }
              if (r8 !== null) {
                r9 = parse__();
                if (r9 !== null) {
                  r10 = parse_parameter();
                  if (r10 !== null) {
                    r5 = [r7, r8, r9, r10];
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(e, es) {
                return [e].concat(es.map(function(e){ return e[3]; }));
              })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_range() {
        var cacheKey = "range@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 91) {
          r3 = "[";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"[\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_secondaryExpression();
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                if (input.substr(pos, 2) === "..") {
                  r7 = "..";
                  pos += 2;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"..\"");
                  }
                }
                if (r7 !== null) {
                  if (input.charCodeAt(pos) === 46) {
                    r8 = ".";
                    pos++;
                  } else {
                    r8 = null;
                    if (reportFailures === 0) {
                      matchFailed("\".\"");
                    }
                  }
                  r8 = r8 !== null ? r8 : "";
                  if (r8 !== null) {
                    r9 = parse__();
                    if (r9 !== null) {
                      r10 = parse_secondaryExpression();
                      if (r10 !== null) {
                        r11 = parse__();
                        if (r11 !== null) {
                          if (input.charCodeAt(pos) === 93) {
                            r12 = "]";
                            pos++;
                          } else {
                            r12 = null;
                            if (reportFailures === 0) {
                              matchFailed("\"]\"");
                            }
                          }
                          if (r12 !== null) {
                            r0 = [r3, r4, r5, r6, r7, r8, r9, r10, r11, r12];
                          } else {
                            r0 = null;
                            pos = r2;
                          }
                        } else {
                          r0 = null;
                          pos = r2;
                        }
                      } else {
                        r0 = null;
                        pos = r2;
                      }
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(left, exclusiveDot, right) {
              var inclusive = !exclusiveDot;
              return rp(new CS.Range(inclusive, left, right));
            })(r5, r8, r10);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_arrayLiteral() {
        var cacheKey = "arrayLiteral@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 91) {
          r3 = "[";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"[\"");
          }
        }
        if (r3 !== null) {
          r4 = parse_arrayLiteralBody();
          if (r4 !== null) {
            r5 = parse_TERMINATOR();
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                if (input.charCodeAt(pos) === 93) {
                  r7 = "]";
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"]\"");
                  }
                }
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(members) {
              return rp(new CS.ArrayInitialiser(members));
            })(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_arrayLiteralBody() {
        var cacheKey = "arrayLiteralBody@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_TERMINDENT();
        if (r3 !== null) {
          r4 = parse_arrayLiteralMemberList();
          if (r4 !== null) {
            r5 = parse_DEDENT();
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(members) { return members; })(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r3 = parse__();
          if (r3 !== null) {
            r4 = parse_arrayLiteralMemberList();
            r4 = r4 !== null ? r4 : "";
            if (r4 !== null) {
              r0 = [r3, r4];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(members) { return members || []; })(r4);
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_arrayLiteralMemberList() {
        var cacheKey = "arrayLiteralMemberList@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_arrayLiteralMember();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = [];
            r7 = pos;
            r8 = parse_arrayLiteralMemberSeparator();
            if (r8 !== null) {
              r9 = parse__();
              if (r9 !== null) {
                r10 = parse_arrayLiteralMember();
                if (r10 !== null) {
                  r11 = parse__();
                  if (r11 !== null) {
                    r6 = [r8, r9, r10, r11];
                  } else {
                    r6 = null;
                    pos = r7;
                  }
                } else {
                  r6 = null;
                  pos = r7;
                }
              } else {
                r6 = null;
                pos = r7;
              }
            } else {
              r6 = null;
              pos = r7;
            }
            while (r6 !== null) {
              r5.push(r6);
              r7 = pos;
              r8 = parse_arrayLiteralMemberSeparator();
              if (r8 !== null) {
                r9 = parse__();
                if (r9 !== null) {
                  r10 = parse_arrayLiteralMember();
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      r6 = [r8, r9, r10, r11];
                    } else {
                      r6 = null;
                      pos = r7;
                    }
                  } else {
                    r6 = null;
                    pos = r7;
                  }
                } else {
                  r6 = null;
                  pos = r7;
                }
              } else {
                r6 = null;
                pos = r7;
              }
            }
            if (r5 !== null) {
              r6 = parse_arrayLiteralMemberSeparator();
              r6 = r6 !== null ? r6 : "";
              if (r6 !== null) {
                r0 = [r3, r4, r5, r6];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(e, es) {
                return [e].concat(es.map(function(e){ return e[2]; }));
              })(r3, r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_arrayLiteralMember() {
        var cacheKey = "arrayLiteralMember@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r0 = parse_spread();
        if (r0 === null) {
          r0 = parse_expression();
          if (r0 === null) {
            r1 = pos;
            r2 = pos;
            r3 = parse_TERMINDENT();
            if (r3 !== null) {
              r4 = parse_implicitObjectLiteral();
              if (r4 !== null) {
                r5 = parse_DEDENT();
                if (r5 !== null) {
                  r0 = [r3, r4, r5];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
            if (r0 !== null) {
              reportedPos = r1;
              r0 = (function(o) { return o; })(r4);
            }
            if (r0 === null) {
              pos = r1;
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_arrayLiteralMemberSeparator() {
        var cacheKey = "arrayLiteralMemberSeparator@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_TERMINATOR();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            if (input.charCodeAt(pos) === 44) {
              r5 = ",";
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\",\"");
              }
            }
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          if (input.charCodeAt(pos) === 44) {
            r3 = ",";
            pos++;
          } else {
            r3 = null;
            if (reportFailures === 0) {
              matchFailed("\",\"");
            }
          }
          if (r3 !== null) {
            r4 = parse_TERMINATOR();
            r4 = r4 !== null ? r4 : "";
            if (r4 !== null) {
              r5 = parse__();
              if (r5 !== null) {
                r0 = [r3, r4, r5];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            r0 = input.substring(pos, r1);
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_objectLiteral() {
        var cacheKey = "objectLiteral@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 123) {
          r3 = "{";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"{\"");
          }
        }
        if (r3 !== null) {
          r4 = parse_objectLiteralBody();
          if (r4 !== null) {
            r5 = parse_TERMINATOR();
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                if (input.charCodeAt(pos) === 125) {
                  r7 = "}";
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"}\"");
                  }
                }
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(members) {
            return rp(new CS.ObjectInitialiser(members));
          })(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_objectLiteralBody() {
        var cacheKey = "objectLiteralBody@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_TERMINDENT();
        if (r3 !== null) {
          r4 = parse_objectLiteralMemberList();
          if (r4 !== null) {
            r5 = parse_DEDENT();
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(members) { return members; })(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r3 = parse__();
          if (r3 !== null) {
            r4 = parse_objectLiteralMemberList();
            r4 = r4 !== null ? r4 : "";
            if (r4 !== null) {
              r0 = [r3, r4];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(members) { return members || []; })(r4);
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_objectLiteralMemberList() {
        var cacheKey = "objectLiteralMemberList@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_objectLiteralMember();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = [];
            r7 = pos;
            r8 = parse_arrayLiteralMemberSeparator();
            if (r8 !== null) {
              r9 = parse__();
              if (r9 !== null) {
                r10 = parse_objectLiteralMember();
                if (r10 !== null) {
                  r11 = parse__();
                  if (r11 !== null) {
                    r6 = [r8, r9, r10, r11];
                  } else {
                    r6 = null;
                    pos = r7;
                  }
                } else {
                  r6 = null;
                  pos = r7;
                }
              } else {
                r6 = null;
                pos = r7;
              }
            } else {
              r6 = null;
              pos = r7;
            }
            while (r6 !== null) {
              r5.push(r6);
              r7 = pos;
              r8 = parse_arrayLiteralMemberSeparator();
              if (r8 !== null) {
                r9 = parse__();
                if (r9 !== null) {
                  r10 = parse_objectLiteralMember();
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      r6 = [r8, r9, r10, r11];
                    } else {
                      r6 = null;
                      pos = r7;
                    }
                  } else {
                    r6 = null;
                    pos = r7;
                  }
                } else {
                  r6 = null;
                  pos = r7;
                }
              } else {
                r6 = null;
                pos = r7;
              }
            }
            if (r5 !== null) {
              if (input.charCodeAt(pos) === 44) {
                r6 = ",";
                pos++;
              } else {
                r6 = null;
                if (reportFailures === 0) {
                  matchFailed("\",\"");
                }
              }
              r6 = r6 !== null ? r6 : "";
              if (r6 !== null) {
                r0 = [r3, r4, r5, r6];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(e, es) {
                return [e].concat(es.map(function(e){ return e[2]; }));
              })(r3, r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_objectLiteralMember() {
        var cacheKey = "objectLiteralMember@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_ObjectInitialiserKeys();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            if (input.charCodeAt(pos) === 58) {
              r5 = ":";
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\":\"");
              }
            }
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r7 = parse_expression();
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(key, val) {
                return rp(new CS.ObjectInitialiserMember(key, val));
              })(r3, r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r0 = parse_contextVar();
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(v) {
                  var key = p(new CS.String(v.memberName).g());
                  return rp(new CS.ObjectInitialiserMember(key, v));
                })(r0);
          }
          if (r0 === null) {
            pos = r1;
          }
          if (r0 === null) {
            r1 = pos;
            r0 = parse_ObjectInitialiserKeys();
            if (r0 !== null) {
              reportedPos = r1;
              r0 = (function(v) {
                    return rp(new CS.ObjectInitialiserMember(v, v));
                  })(r0);
            }
            if (r0 === null) {
              pos = r1;
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_ObjectInitialiserKeys() {
        var cacheKey = "ObjectInitialiserKeys@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1;
        
        r1 = pos;
        r0 = parse_identifierName();
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(i) { return rp(new CS.Identifier(i)); })(r0);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r0 = parse_string();
          if (r0 === null) {
            r0 = parse_Numbers();
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_implicitObjectLiteral() {
        var cacheKey = "implicitObjectLiteral@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1;
        
        r1 = pos;
        r0 = parse_implicitObjectLiteralMemberList();
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(members) {
            return rp(new CS.ObjectInitialiser(members));
          })(r0);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_implicitObjectLiteralMemberList() {
        var cacheKey = "implicitObjectLiteralMemberList@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_implicitObjectLiteralMember();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse_implicitObjectLiteralMemberSeparator();
          if (r7 !== null) {
            r8 = parse__();
            if (r8 !== null) {
              r9 = parse_implicitObjectLiteralMember();
              if (r9 !== null) {
                r5 = [r7, r8, r9];
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse_implicitObjectLiteralMemberSeparator();
            if (r7 !== null) {
              r8 = parse__();
              if (r8 !== null) {
                r9 = parse_implicitObjectLiteralMember();
                if (r9 !== null) {
                  r5 = [r7, r8, r9];
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(e, es) {
                return [e].concat(es.map(function(e){ return e[2]; }));
              })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_implicitObjectLiteralMemberSeparator() {
        var cacheKey = "implicitObjectLiteralMemberSeparator@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        r2 = parse_TERMINATOR();
        if (r2 !== null) {
          if (input.charCodeAt(pos) === 44) {
            r3 = ",";
            pos++;
          } else {
            r3 = null;
            if (reportFailures === 0) {
              matchFailed("\",\"");
            }
          }
          r3 = r3 !== null ? r3 : "";
          if (r3 !== null) {
            r4 = parse__();
            if (r4 !== null) {
              r0 = [r2, r3, r4];
            } else {
              r0 = null;
              pos = r1;
            }
          } else {
            r0 = null;
            pos = r1;
          }
        } else {
          r0 = null;
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          if (input.charCodeAt(pos) === 44) {
            r2 = ",";
            pos++;
          } else {
            r2 = null;
            if (reportFailures === 0) {
              matchFailed("\",\"");
            }
          }
          if (r2 !== null) {
            r3 = parse_TERMINATOR();
            r3 = r3 !== null ? r3 : "";
            if (r3 !== null) {
              r0 = [r2, r3];
            } else {
              r0 = null;
              pos = r1;
            }
          } else {
            r0 = null;
            pos = r1;
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_implicitObjectLiteralMember() {
        var cacheKey = "implicitObjectLiteralMember@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_ObjectInitialiserKeys();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            if (input.charCodeAt(pos) === 58) {
              r5 = ":";
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\":\"");
              }
            }
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r7 = parse_implicitObjectLiteralMemberValue();
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(key, val) {
                return rp(new CS.ObjectInitialiserMember(key, val));
              })(r3, r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_implicitObjectLiteralMemberValue() {
        var cacheKey = "implicitObjectLiteralMemberValue@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r0 = parse_expression();
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r3 = parse_TERMINDENT();
          if (r3 !== null) {
            r4 = parse_implicitObjectLiteral();
            if (r4 !== null) {
              r5 = parse_DEDENT();
              if (r5 !== null) {
                r0 = [r3, r4, r5];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(o) { return o; })(r4);
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_macro() {
        var cacheKey = "macro@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1;
        
        r1 = pos;
        if (input.substr(pos, 8) === "__LINE__") {
          r0 = "__LINE__";
          pos += 8;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("\"__LINE__\"");
          }
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function() { return rp(new CS.Int(line())); })();
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          if (input.substr(pos, 12) === "__FILENAME__") {
            r0 = "__FILENAME__";
            pos += 12;
          } else {
            r0 = null;
            if (reportFailures === 0) {
              matchFailed("\"__FILENAME__\"");
            }
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function() { return rp(new CS.String(options.inputSource || "")); })();
          }
          if (r0 === null) {
            pos = r1;
          }
          if (r0 === null) {
            r1 = pos;
            if (input.substr(pos, 8) === "__DATE__") {
              r0 = "__DATE__";
              pos += 8;
            } else {
              r0 = null;
              if (reportFailures === 0) {
                matchFailed("\"__DATE__\"");
              }
            }
            if (r0 !== null) {
              reportedPos = r1;
              r0 = (function() { return rp(new CS.String((new Date).toDateString().slice(4))); })();
            }
            if (r0 === null) {
              pos = r1;
            }
            if (r0 === null) {
              r1 = pos;
              if (input.substr(pos, 8) === "__TIME__") {
                r0 = "__TIME__";
                pos += 8;
              } else {
                r0 = null;
                if (reportFailures === 0) {
                  matchFailed("\"__TIME__\"");
                }
              }
              if (r0 !== null) {
                reportedPos = r1;
                r0 = (function() { return rp(new CS.String((new Date).toTimeString().slice(0, 8))); })();
              }
              if (r0 === null) {
                pos = r1;
              }
              if (r0 === null) {
                r1 = pos;
                if (input.substr(pos, 14) === "__DATETIMEMS__") {
                  r0 = "__DATETIMEMS__";
                  pos += 14;
                } else {
                  r0 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"__DATETIMEMS__\"");
                  }
                }
                if (r0 !== null) {
                  reportedPos = r1;
                  r0 = (function() { return rp(new CS.Int(+new Date)); })();
                }
                if (r0 === null) {
                  pos = r1;
                }
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_bool() {
        var cacheKey = "bool@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1;
        
        r1 = pos;
        r0 = parse_TRUE();
        if (r0 === null) {
          r0 = parse_YES();
          if (r0 === null) {
            r0 = parse_ON();
          }
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function() { return rp(new CS.Bool(true)); })();
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r0 = parse_FALSE();
          if (r0 === null) {
            r0 = parse_NO();
            if (r0 === null) {
              r0 = parse_OFF();
            }
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function() { return rp(new CS.Bool(false)); })();
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_Numbers() {
        var cacheKey = "Numbers@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 2) === "0b") {
          r3 = "0b";
          pos += 2;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"0b\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          r6 = parse_bit();
          if (r6 !== null) {
            r4 = [];
            while (r6 !== null) {
              r4.push(r6);
              r6 = parse_bit();
            }
          } else {
            r4 = null;
          }
          if (r4 !== null) {
            r4 = input.substring(pos, r5);
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(bs) { return rp(new CS.Int(parseInt(bs, 2))); })(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          if (input.substr(pos, 2) === "0o") {
            r3 = "0o";
            pos += 2;
          } else {
            r3 = null;
            if (reportFailures === 0) {
              matchFailed("\"0o\"");
            }
          }
          if (r3 !== null) {
            r5 = pos;
            r6 = parse_octalDigit();
            if (r6 !== null) {
              r4 = [];
              while (r6 !== null) {
                r4.push(r6);
                r6 = parse_octalDigit();
              }
            } else {
              r4 = null;
            }
            if (r4 !== null) {
              r4 = input.substring(pos, r5);
            }
            if (r4 !== null) {
              r0 = [r3, r4];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(os) { return rp(new CS.Int(parseInt(os, 8))); })(r4);
          }
          if (r0 === null) {
            pos = r1;
          }
          if (r0 === null) {
            r1 = pos;
            r2 = pos;
            if (input.substr(pos, 2) === "0x") {
              r3 = "0x";
              pos += 2;
            } else {
              r3 = null;
              if (reportFailures === 0) {
                matchFailed("\"0x\"");
              }
            }
            if (r3 !== null) {
              r5 = pos;
              r6 = parse_hexDigit();
              if (r6 !== null) {
                r4 = [];
                while (r6 !== null) {
                  r4.push(r6);
                  r6 = parse_hexDigit();
                }
              } else {
                r4 = null;
              }
              if (r4 !== null) {
                r4 = input.substring(pos, r5);
              }
              if (r4 !== null) {
                r0 = [r3, r4];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
            if (r0 !== null) {
              reportedPos = r1;
              r0 = (function(hs) { return rp(new CS.Int(parseInt(hs, 16))); })(r4);
            }
            if (r0 === null) {
              pos = r1;
            }
            if (r0 === null) {
              r1 = pos;
              r2 = pos;
              r3 = parse_decimal();
              if (r3 !== null) {
                if (/^[eE]/.test(input.charAt(pos))) {
                  r4 = input.charAt(pos);
                  pos++;
                } else {
                  r4 = null;
                  if (reportFailures === 0) {
                    matchFailed("[eE]");
                  }
                }
                if (r4 !== null) {
                  if (/^[+\-]/.test(input.charAt(pos))) {
                    r5 = input.charAt(pos);
                    pos++;
                  } else {
                    r5 = null;
                    if (reportFailures === 0) {
                      matchFailed("[+\\-]");
                    }
                  }
                  r5 = r5 !== null ? r5 : "";
                  if (r5 !== null) {
                    r6 = parse_decimal();
                    if (r6 !== null) {
                      r0 = [r3, r4, r5, r6];
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
              if (r0 !== null) {
                reportedPos = r1;
                r0 = (function(base, e, sign, exponent) {
                    return rp(new CS.Float(parseFloat('' + base.data + e + sign + exponent.data, 10)));
                  })(r3, r4, r5, r6);
              }
              if (r0 === null) {
                pos = r1;
              }
              if (r0 === null) {
                r0 = parse_decimal();
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_decimal() {
        var cacheKey = "decimal@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_integer();
        if (r3 !== null) {
          r5 = pos;
          r6 = pos;
          if (input.charCodeAt(pos) === 46) {
            r7 = ".";
            pos++;
          } else {
            r7 = null;
            if (reportFailures === 0) {
              matchFailed("\".\"");
            }
          }
          if (r7 !== null) {
            r9 = parse_decimalDigit();
            if (r9 !== null) {
              r8 = [];
              while (r9 !== null) {
                r8.push(r9);
                r9 = parse_decimalDigit();
              }
            } else {
              r8 = null;
            }
            if (r8 !== null) {
              r4 = [r7, r8];
            } else {
              r4 = null;
              pos = r6;
            }
          } else {
            r4 = null;
            pos = r6;
          }
          r4 = r4 !== null ? r4 : "";
          if (r4 !== null) {
            r4 = input.substring(pos, r5);
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(integral, fractional) {
              return fractional
                ? rp(new CS.Float(parseFloat(integral + fractional, 10)))
                : rp(new CS.Int(+integral));
            })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_integer() {
        var cacheKey = "integer@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        if (input.charCodeAt(pos) === 48) {
          r0 = "0";
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("\"0\"");
          }
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          if (/^[1-9]/.test(input.charAt(pos))) {
            r3 = input.charAt(pos);
            pos++;
          } else {
            r3 = null;
            if (reportFailures === 0) {
              matchFailed("[1-9]");
            }
          }
          if (r3 !== null) {
            r4 = [];
            r5 = parse_decimalDigit();
            while (r5 !== null) {
              r4.push(r5);
              r5 = parse_decimalDigit();
            }
            if (r4 !== null) {
              r0 = [r3, r4];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            r0 = input.substring(pos, r1);
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_decimalDigit() {
        var cacheKey = "decimalDigit@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        if (/^[0-9]/.test(input.charAt(pos))) {
          r0 = input.charAt(pos);
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("[0-9]");
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_hexDigit() {
        var cacheKey = "hexDigit@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        if (/^[0-9a-fA-F]/.test(input.charAt(pos))) {
          r0 = input.charAt(pos);
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("[0-9a-fA-F]");
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_octalDigit() {
        var cacheKey = "octalDigit@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        if (/^[0-7]/.test(input.charAt(pos))) {
          r0 = input.charAt(pos);
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("[0-7]");
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_bit() {
        var cacheKey = "bit@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        if (/^[01]/.test(input.charAt(pos))) {
          r0 = input.charAt(pos);
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("[01]");
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_string() {
        var cacheKey = "string@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 3) === "\"\"\"") {
          r3 = "\"\"\"";
          pos += 3;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"\\\"\\\"\\\"\"");
          }
        }
        if (r3 !== null) {
          r5 = parse_stringData();
          if (r5 === null) {
            if (input.charCodeAt(pos) === 39) {
              r5 = "'";
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\"'\"");
              }
            }
            if (r5 === null) {
              r6 = pos;
              if (input.charCodeAt(pos) === 34) {
                r7 = "\"";
                pos++;
              } else {
                r7 = null;
                if (reportFailures === 0) {
                  matchFailed("\"\\\"\"");
                }
              }
              if (r7 !== null) {
                if (input.charCodeAt(pos) === 34) {
                  r8 = "\"";
                  pos++;
                } else {
                  r8 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"\\\"\"");
                  }
                }
                r8 = r8 !== null ? r8 : "";
                if (r8 !== null) {
                  r10 = pos;
                  reportFailures++;
                  if (input.charCodeAt(pos) === 34) {
                    r9 = "\"";
                    pos++;
                  } else {
                    r9 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"\\\"\"");
                    }
                  }
                  reportFailures--;
                  if (r9 === null) {
                    r9 = "";
                  } else {
                    r9 = null;
                    pos = r10;
                  }
                  if (r9 !== null) {
                    r5 = [r7, r8, r9];
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            }
          }
          if (r5 !== null) {
            r4 = [];
            while (r5 !== null) {
              r4.push(r5);
              r5 = parse_stringData();
              if (r5 === null) {
                if (input.charCodeAt(pos) === 39) {
                  r5 = "'";
                  pos++;
                } else {
                  r5 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"'\"");
                  }
                }
                if (r5 === null) {
                  r6 = pos;
                  if (input.charCodeAt(pos) === 34) {
                    r7 = "\"";
                    pos++;
                  } else {
                    r7 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"\\\"\"");
                    }
                  }
                  if (r7 !== null) {
                    if (input.charCodeAt(pos) === 34) {
                      r8 = "\"";
                      pos++;
                    } else {
                      r8 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"\\\"\"");
                      }
                    }
                    r8 = r8 !== null ? r8 : "";
                    if (r8 !== null) {
                      r10 = pos;
                      reportFailures++;
                      if (input.charCodeAt(pos) === 34) {
                        r9 = "\"";
                        pos++;
                      } else {
                        r9 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"\\\"\"");
                        }
                      }
                      reportFailures--;
                      if (r9 === null) {
                        r9 = "";
                      } else {
                        r9 = null;
                        pos = r10;
                      }
                      if (r9 !== null) {
                        r5 = [r7, r8, r9];
                      } else {
                        r5 = null;
                        pos = r6;
                      }
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                }
              }
            }
          } else {
            r4 = null;
          }
          if (r4 !== null) {
            if (input.substr(pos, 3) === "\"\"\"") {
              r5 = "\"\"\"";
              pos += 3;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\"\\\"\\\"\\\"\"");
              }
            }
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(d) {
              return rp(new CS.String(stripLeadingWhitespace(d.join(''))));
            })(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          if (input.substr(pos, 3) === "'''") {
            r3 = "'''";
            pos += 3;
          } else {
            r3 = null;
            if (reportFailures === 0) {
              matchFailed("\"'''\"");
            }
          }
          if (r3 !== null) {
            r5 = parse_stringData();
            if (r5 === null) {
              if (input.charCodeAt(pos) === 34) {
                r5 = "\"";
                pos++;
              } else {
                r5 = null;
                if (reportFailures === 0) {
                  matchFailed("\"\\\"\"");
                }
              }
              if (r5 === null) {
                if (input.charCodeAt(pos) === 35) {
                  r5 = "#";
                  pos++;
                } else {
                  r5 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"#\"");
                  }
                }
                if (r5 === null) {
                  r6 = pos;
                  if (input.charCodeAt(pos) === 39) {
                    r7 = "'";
                    pos++;
                  } else {
                    r7 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"'\"");
                    }
                  }
                  if (r7 !== null) {
                    if (input.charCodeAt(pos) === 39) {
                      r8 = "'";
                      pos++;
                    } else {
                      r8 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"'\"");
                      }
                    }
                    r8 = r8 !== null ? r8 : "";
                    if (r8 !== null) {
                      r10 = pos;
                      reportFailures++;
                      if (input.charCodeAt(pos) === 39) {
                        r9 = "'";
                        pos++;
                      } else {
                        r9 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"'\"");
                        }
                      }
                      reportFailures--;
                      if (r9 === null) {
                        r9 = "";
                      } else {
                        r9 = null;
                        pos = r10;
                      }
                      if (r9 !== null) {
                        r5 = [r7, r8, r9];
                      } else {
                        r5 = null;
                        pos = r6;
                      }
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                }
              }
            }
            if (r5 !== null) {
              r4 = [];
              while (r5 !== null) {
                r4.push(r5);
                r5 = parse_stringData();
                if (r5 === null) {
                  if (input.charCodeAt(pos) === 34) {
                    r5 = "\"";
                    pos++;
                  } else {
                    r5 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"\\\"\"");
                    }
                  }
                  if (r5 === null) {
                    if (input.charCodeAt(pos) === 35) {
                      r5 = "#";
                      pos++;
                    } else {
                      r5 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"#\"");
                      }
                    }
                    if (r5 === null) {
                      r6 = pos;
                      if (input.charCodeAt(pos) === 39) {
                        r7 = "'";
                        pos++;
                      } else {
                        r7 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"'\"");
                        }
                      }
                      if (r7 !== null) {
                        if (input.charCodeAt(pos) === 39) {
                          r8 = "'";
                          pos++;
                        } else {
                          r8 = null;
                          if (reportFailures === 0) {
                            matchFailed("\"'\"");
                          }
                        }
                        r8 = r8 !== null ? r8 : "";
                        if (r8 !== null) {
                          r10 = pos;
                          reportFailures++;
                          if (input.charCodeAt(pos) === 39) {
                            r9 = "'";
                            pos++;
                          } else {
                            r9 = null;
                            if (reportFailures === 0) {
                              matchFailed("\"'\"");
                            }
                          }
                          reportFailures--;
                          if (r9 === null) {
                            r9 = "";
                          } else {
                            r9 = null;
                            pos = r10;
                          }
                          if (r9 !== null) {
                            r5 = [r7, r8, r9];
                          } else {
                            r5 = null;
                            pos = r6;
                          }
                        } else {
                          r5 = null;
                          pos = r6;
                        }
                      } else {
                        r5 = null;
                        pos = r6;
                      }
                    }
                  }
                }
              }
            } else {
              r4 = null;
            }
            if (r4 !== null) {
              if (input.substr(pos, 3) === "'''") {
                r5 = "'''";
                pos += 3;
              } else {
                r5 = null;
                if (reportFailures === 0) {
                  matchFailed("\"'''\"");
                }
              }
              if (r5 !== null) {
                r0 = [r3, r4, r5];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(d) {
                return rp(new CS.String(stripLeadingWhitespace(d.join(''))));
              })(r4);
          }
          if (r0 === null) {
            pos = r1;
          }
          if (r0 === null) {
            r1 = pos;
            r2 = pos;
            if (input.charCodeAt(pos) === 34) {
              r3 = "\"";
              pos++;
            } else {
              r3 = null;
              if (reportFailures === 0) {
                matchFailed("\"\\\"\"");
              }
            }
            if (r3 !== null) {
              r4 = [];
              r5 = parse_stringData();
              if (r5 === null) {
                if (input.charCodeAt(pos) === 39) {
                  r5 = "'";
                  pos++;
                } else {
                  r5 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"'\"");
                  }
                }
              }
              while (r5 !== null) {
                r4.push(r5);
                r5 = parse_stringData();
                if (r5 === null) {
                  if (input.charCodeAt(pos) === 39) {
                    r5 = "'";
                    pos++;
                  } else {
                    r5 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"'\"");
                    }
                  }
                }
              }
              if (r4 !== null) {
                if (input.charCodeAt(pos) === 34) {
                  r5 = "\"";
                  pos++;
                } else {
                  r5 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"\\\"\"");
                  }
                }
                if (r5 !== null) {
                  r0 = [r3, r4, r5];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
            if (r0 !== null) {
              reportedPos = r1;
              r0 = (function(d) { return rp(new CS.String(d.join(''))); })(r4);
            }
            if (r0 === null) {
              pos = r1;
            }
            if (r0 === null) {
              r1 = pos;
              r2 = pos;
              if (input.charCodeAt(pos) === 39) {
                r3 = "'";
                pos++;
              } else {
                r3 = null;
                if (reportFailures === 0) {
                  matchFailed("\"'\"");
                }
              }
              if (r3 !== null) {
                r4 = [];
                r5 = parse_stringData();
                if (r5 === null) {
                  if (input.charCodeAt(pos) === 34) {
                    r5 = "\"";
                    pos++;
                  } else {
                    r5 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"\\\"\"");
                    }
                  }
                  if (r5 === null) {
                    if (input.charCodeAt(pos) === 35) {
                      r5 = "#";
                      pos++;
                    } else {
                      r5 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"#\"");
                      }
                    }
                  }
                }
                while (r5 !== null) {
                  r4.push(r5);
                  r5 = parse_stringData();
                  if (r5 === null) {
                    if (input.charCodeAt(pos) === 34) {
                      r5 = "\"";
                      pos++;
                    } else {
                      r5 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"\\\"\"");
                      }
                    }
                    if (r5 === null) {
                      if (input.charCodeAt(pos) === 35) {
                        r5 = "#";
                        pos++;
                      } else {
                        r5 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"#\"");
                        }
                      }
                    }
                  }
                }
                if (r4 !== null) {
                  if (input.charCodeAt(pos) === 39) {
                    r5 = "'";
                    pos++;
                  } else {
                    r5 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"'\"");
                    }
                  }
                  if (r5 !== null) {
                    r0 = [r3, r4, r5];
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
              if (r0 !== null) {
                reportedPos = r1;
                r0 = (function(d) { return rp(new CS.String(d.join(''))); })(r4);
              }
              if (r0 === null) {
                pos = r1;
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_stringData() {
        var cacheKey = "stringData@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8;
        
        if (/^[^"'\\#]/.test(input.charAt(pos))) {
          r0 = input.charAt(pos);
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("[^\"'\\\\#]");
          }
        }
        if (r0 === null) {
          r0 = parse_UnicodeEscapeSequence();
          if (r0 === null) {
            r1 = pos;
            r2 = pos;
            if (input.substr(pos, 2) === "\\x") {
              r3 = "\\x";
              pos += 2;
            } else {
              r3 = null;
              if (reportFailures === 0) {
                matchFailed("\"\\\\x\"");
              }
            }
            if (r3 !== null) {
              r5 = pos;
              r6 = pos;
              r7 = parse_hexDigit();
              if (r7 !== null) {
                r8 = parse_hexDigit();
                if (r8 !== null) {
                  r4 = [r7, r8];
                } else {
                  r4 = null;
                  pos = r6;
                }
              } else {
                r4 = null;
                pos = r6;
              }
              if (r4 !== null) {
                r4 = input.substring(pos, r5);
              }
              if (r4 !== null) {
                r0 = [r3, r4];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
            if (r0 !== null) {
              reportedPos = r1;
              r0 = (function(h) { return String.fromCharCode(parseInt(h, 16)); })(r4);
            }
            if (r0 === null) {
              pos = r1;
            }
            if (r0 === null) {
              r1 = pos;
              r2 = pos;
              if (input.substr(pos, 2) === "\\0") {
                r3 = "\\0";
                pos += 2;
              } else {
                r3 = null;
                if (reportFailures === 0) {
                  matchFailed("\"\\\\0\"");
                }
              }
              if (r3 !== null) {
                r5 = pos;
                reportFailures++;
                r4 = parse_decimalDigit();
                reportFailures--;
                if (r4 === null) {
                  r4 = "";
                } else {
                  r4 = null;
                  pos = r5;
                }
                if (r4 !== null) {
                  r0 = [r3, r4];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
              if (r0 !== null) {
                reportedPos = r1;
                r0 = (function() { return '\0'; })();
              }
              if (r0 === null) {
                pos = r1;
              }
              if (r0 === null) {
                r1 = pos;
                r2 = pos;
                if (input.substr(pos, 2) === "\\0") {
                  r3 = "\\0";
                  pos += 2;
                } else {
                  r3 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"\\\\0\"");
                  }
                }
                if (r3 !== null) {
                  r5 = pos;
                  reportFailures++;
                  r4 = parse_decimalDigit();
                  reportFailures--;
                  if (r4 !== null) {
                    r4 = "";
                    pos = r5;
                  } else {
                    r4 = null;
                  }
                  if (r4 !== null) {
                    r0 = [r3, r4];
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
                if (r0 !== null) {
                  reportedPos = r1;
                  r0 = (function() { throw new SyntaxError(['string data'], 'octal escape sequence', offset(), line(), column()); })();
                }
                if (r0 === null) {
                  pos = r1;
                }
                if (r0 === null) {
                  r1 = pos;
                  if (input.substr(pos, 2) === "\\b") {
                    r0 = "\\b";
                    pos += 2;
                  } else {
                    r0 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"\\\\b\"");
                    }
                  }
                  if (r0 !== null) {
                    reportedPos = r1;
                    r0 = (function() { return '\b'; })();
                  }
                  if (r0 === null) {
                    pos = r1;
                  }
                  if (r0 === null) {
                    r1 = pos;
                    if (input.substr(pos, 2) === "\\t") {
                      r0 = "\\t";
                      pos += 2;
                    } else {
                      r0 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"\\\\t\"");
                      }
                    }
                    if (r0 !== null) {
                      reportedPos = r1;
                      r0 = (function() { return '\t'; })();
                    }
                    if (r0 === null) {
                      pos = r1;
                    }
                    if (r0 === null) {
                      r1 = pos;
                      if (input.substr(pos, 2) === "\\n") {
                        r0 = "\\n";
                        pos += 2;
                      } else {
                        r0 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"\\\\n\"");
                        }
                      }
                      if (r0 !== null) {
                        reportedPos = r1;
                        r0 = (function() { return '\n'; })();
                      }
                      if (r0 === null) {
                        pos = r1;
                      }
                      if (r0 === null) {
                        r1 = pos;
                        if (input.substr(pos, 2) === "\\v") {
                          r0 = "\\v";
                          pos += 2;
                        } else {
                          r0 = null;
                          if (reportFailures === 0) {
                            matchFailed("\"\\\\v\"");
                          }
                        }
                        if (r0 !== null) {
                          reportedPos = r1;
                          r0 = (function() { return '\v'; })();
                        }
                        if (r0 === null) {
                          pos = r1;
                        }
                        if (r0 === null) {
                          r1 = pos;
                          if (input.substr(pos, 2) === "\\f") {
                            r0 = "\\f";
                            pos += 2;
                          } else {
                            r0 = null;
                            if (reportFailures === 0) {
                              matchFailed("\"\\\\f\"");
                            }
                          }
                          if (r0 !== null) {
                            reportedPos = r1;
                            r0 = (function() { return '\f'; })();
                          }
                          if (r0 === null) {
                            pos = r1;
                          }
                          if (r0 === null) {
                            r1 = pos;
                            if (input.substr(pos, 2) === "\\r") {
                              r0 = "\\r";
                              pos += 2;
                            } else {
                              r0 = null;
                              if (reportFailures === 0) {
                                matchFailed("\"\\\\r\"");
                              }
                            }
                            if (r0 !== null) {
                              reportedPos = r1;
                              r0 = (function() { return '\r'; })();
                            }
                            if (r0 === null) {
                              pos = r1;
                            }
                            if (r0 === null) {
                              r1 = pos;
                              r2 = pos;
                              if (input.charCodeAt(pos) === 92) {
                                r3 = "\\";
                                pos++;
                              } else {
                                r3 = null;
                                if (reportFailures === 0) {
                                  matchFailed("\"\\\\\"");
                                }
                              }
                              if (r3 !== null) {
                                if (input.length > pos) {
                                  r4 = input.charAt(pos);
                                  pos++;
                                } else {
                                  r4 = null;
                                  if (reportFailures === 0) {
                                    matchFailed("any character");
                                  }
                                }
                                if (r4 !== null) {
                                  r0 = [r3, r4];
                                } else {
                                  r0 = null;
                                  pos = r2;
                                }
                              } else {
                                r0 = null;
                                pos = r2;
                              }
                              if (r0 !== null) {
                                reportedPos = r1;
                                r0 = (function(c) { return c; })(r4);
                              }
                              if (r0 === null) {
                                pos = r1;
                              }
                              if (r0 === null) {
                                r1 = pos;
                                r2 = pos;
                                if (input.charCodeAt(pos) === 35) {
                                  r3 = "#";
                                  pos++;
                                } else {
                                  r3 = null;
                                  if (reportFailures === 0) {
                                    matchFailed("\"#\"");
                                  }
                                }
                                if (r3 !== null) {
                                  r5 = pos;
                                  reportFailures++;
                                  if (input.charCodeAt(pos) === 123) {
                                    r4 = "{";
                                    pos++;
                                  } else {
                                    r4 = null;
                                    if (reportFailures === 0) {
                                      matchFailed("\"{\"");
                                    }
                                  }
                                  reportFailures--;
                                  if (r4 === null) {
                                    r4 = "";
                                  } else {
                                    r4 = null;
                                    pos = r5;
                                  }
                                  if (r4 !== null) {
                                    r0 = [r3, r4];
                                  } else {
                                    r0 = null;
                                    pos = r2;
                                  }
                                } else {
                                  r0 = null;
                                  pos = r2;
                                }
                                if (r0 !== null) {
                                  reportedPos = r1;
                                  r0 = (function(c) { return c; })(r3);
                                }
                                if (r0 === null) {
                                  pos = r1;
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_interpolation() {
        var cacheKey = "interpolation@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 3) === "\"\"\"") {
          r3 = "\"\"\"";
          pos += 3;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"\\\"\\\"\\\"\"");
          }
        }
        if (r3 !== null) {
          r6 = pos;
          r7 = parse_stringData();
          if (r7 === null) {
            if (input.charCodeAt(pos) === 39) {
              r7 = "'";
              pos++;
            } else {
              r7 = null;
              if (reportFailures === 0) {
                matchFailed("\"'\"");
              }
            }
            if (r7 === null) {
              r8 = pos;
              if (input.charCodeAt(pos) === 34) {
                r9 = "\"";
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\"\\\"\"");
                }
              }
              if (r9 !== null) {
                if (input.charCodeAt(pos) === 34) {
                  r10 = "\"";
                  pos++;
                } else {
                  r10 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"\\\"\"");
                  }
                }
                r10 = r10 !== null ? r10 : "";
                if (r10 !== null) {
                  r12 = pos;
                  reportFailures++;
                  if (input.charCodeAt(pos) === 34) {
                    r11 = "\"";
                    pos++;
                  } else {
                    r11 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"\\\"\"");
                    }
                  }
                  reportFailures--;
                  if (r11 === null) {
                    r11 = "";
                  } else {
                    r11 = null;
                    pos = r12;
                  }
                  if (r11 !== null) {
                    r7 = [r9, r10, r11];
                  } else {
                    r7 = null;
                    pos = r8;
                  }
                } else {
                  r7 = null;
                  pos = r8;
                }
              } else {
                r7 = null;
                pos = r8;
              }
            }
          }
          if (r7 !== null) {
            r5 = [];
            while (r7 !== null) {
              r5.push(r7);
              r7 = parse_stringData();
              if (r7 === null) {
                if (input.charCodeAt(pos) === 39) {
                  r7 = "'";
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"'\"");
                  }
                }
                if (r7 === null) {
                  r8 = pos;
                  if (input.charCodeAt(pos) === 34) {
                    r9 = "\"";
                    pos++;
                  } else {
                    r9 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"\\\"\"");
                    }
                  }
                  if (r9 !== null) {
                    if (input.charCodeAt(pos) === 34) {
                      r10 = "\"";
                      pos++;
                    } else {
                      r10 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"\\\"\"");
                      }
                    }
                    r10 = r10 !== null ? r10 : "";
                    if (r10 !== null) {
                      r12 = pos;
                      reportFailures++;
                      if (input.charCodeAt(pos) === 34) {
                        r11 = "\"";
                        pos++;
                      } else {
                        r11 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"\\\"\"");
                        }
                      }
                      reportFailures--;
                      if (r11 === null) {
                        r11 = "";
                      } else {
                        r11 = null;
                        pos = r12;
                      }
                      if (r11 !== null) {
                        r7 = [r9, r10, r11];
                      } else {
                        r7 = null;
                        pos = r8;
                      }
                    } else {
                      r7 = null;
                      pos = r8;
                    }
                  } else {
                    r7 = null;
                    pos = r8;
                  }
                }
              }
            }
          } else {
            r5 = null;
          }
          if (r5 !== null) {
            reportedPos = r6;
            r5 = (function(d) { return rp(new CS.String(d.join(''))); })(r5);
          }
          if (r5 === null) {
            pos = r6;
          }
          if (r5 === null) {
            r6 = pos;
            r7 = pos;
            if (input.substr(pos, 2) === "#{") {
              r8 = "#{";
              pos += 2;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("\"#{\"");
              }
            }
            if (r8 !== null) {
              r9 = parse__();
              if (r9 !== null) {
                r10 = parse_expression();
                if (r10 !== null) {
                  r11 = parse__();
                  if (r11 !== null) {
                    if (input.charCodeAt(pos) === 125) {
                      r12 = "}";
                      pos++;
                    } else {
                      r12 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"}\"");
                      }
                    }
                    if (r12 !== null) {
                      r5 = [r8, r9, r10, r11, r12];
                    } else {
                      r5 = null;
                      pos = r7;
                    }
                  } else {
                    r5 = null;
                    pos = r7;
                  }
                } else {
                  r5 = null;
                  pos = r7;
                }
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(e) { return e; })(r10);
            }
            if (r5 === null) {
              pos = r6;
            }
          }
          if (r5 !== null) {
            r4 = [];
            while (r5 !== null) {
              r4.push(r5);
              r6 = pos;
              r7 = parse_stringData();
              if (r7 === null) {
                if (input.charCodeAt(pos) === 39) {
                  r7 = "'";
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"'\"");
                  }
                }
                if (r7 === null) {
                  r8 = pos;
                  if (input.charCodeAt(pos) === 34) {
                    r9 = "\"";
                    pos++;
                  } else {
                    r9 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"\\\"\"");
                    }
                  }
                  if (r9 !== null) {
                    if (input.charCodeAt(pos) === 34) {
                      r10 = "\"";
                      pos++;
                    } else {
                      r10 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"\\\"\"");
                      }
                    }
                    r10 = r10 !== null ? r10 : "";
                    if (r10 !== null) {
                      r12 = pos;
                      reportFailures++;
                      if (input.charCodeAt(pos) === 34) {
                        r11 = "\"";
                        pos++;
                      } else {
                        r11 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"\\\"\"");
                        }
                      }
                      reportFailures--;
                      if (r11 === null) {
                        r11 = "";
                      } else {
                        r11 = null;
                        pos = r12;
                      }
                      if (r11 !== null) {
                        r7 = [r9, r10, r11];
                      } else {
                        r7 = null;
                        pos = r8;
                      }
                    } else {
                      r7 = null;
                      pos = r8;
                    }
                  } else {
                    r7 = null;
                    pos = r8;
                  }
                }
              }
              if (r7 !== null) {
                r5 = [];
                while (r7 !== null) {
                  r5.push(r7);
                  r7 = parse_stringData();
                  if (r7 === null) {
                    if (input.charCodeAt(pos) === 39) {
                      r7 = "'";
                      pos++;
                    } else {
                      r7 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"'\"");
                      }
                    }
                    if (r7 === null) {
                      r8 = pos;
                      if (input.charCodeAt(pos) === 34) {
                        r9 = "\"";
                        pos++;
                      } else {
                        r9 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"\\\"\"");
                        }
                      }
                      if (r9 !== null) {
                        if (input.charCodeAt(pos) === 34) {
                          r10 = "\"";
                          pos++;
                        } else {
                          r10 = null;
                          if (reportFailures === 0) {
                            matchFailed("\"\\\"\"");
                          }
                        }
                        r10 = r10 !== null ? r10 : "";
                        if (r10 !== null) {
                          r12 = pos;
                          reportFailures++;
                          if (input.charCodeAt(pos) === 34) {
                            r11 = "\"";
                            pos++;
                          } else {
                            r11 = null;
                            if (reportFailures === 0) {
                              matchFailed("\"\\\"\"");
                            }
                          }
                          reportFailures--;
                          if (r11 === null) {
                            r11 = "";
                          } else {
                            r11 = null;
                            pos = r12;
                          }
                          if (r11 !== null) {
                            r7 = [r9, r10, r11];
                          } else {
                            r7 = null;
                            pos = r8;
                          }
                        } else {
                          r7 = null;
                          pos = r8;
                        }
                      } else {
                        r7 = null;
                        pos = r8;
                      }
                    }
                  }
                }
              } else {
                r5 = null;
              }
              if (r5 !== null) {
                reportedPos = r6;
                r5 = (function(d) { return rp(new CS.String(d.join(''))); })(r5);
              }
              if (r5 === null) {
                pos = r6;
              }
              if (r5 === null) {
                r6 = pos;
                r7 = pos;
                if (input.substr(pos, 2) === "#{") {
                  r8 = "#{";
                  pos += 2;
                } else {
                  r8 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"#{\"");
                  }
                }
                if (r8 !== null) {
                  r9 = parse__();
                  if (r9 !== null) {
                    r10 = parse_expression();
                    if (r10 !== null) {
                      r11 = parse__();
                      if (r11 !== null) {
                        if (input.charCodeAt(pos) === 125) {
                          r12 = "}";
                          pos++;
                        } else {
                          r12 = null;
                          if (reportFailures === 0) {
                            matchFailed("\"}\"");
                          }
                        }
                        if (r12 !== null) {
                          r5 = [r8, r9, r10, r11, r12];
                        } else {
                          r5 = null;
                          pos = r7;
                        }
                      } else {
                        r5 = null;
                        pos = r7;
                      }
                    } else {
                      r5 = null;
                      pos = r7;
                    }
                  } else {
                    r5 = null;
                    pos = r7;
                  }
                } else {
                  r5 = null;
                  pos = r7;
                }
                if (r5 !== null) {
                  reportedPos = r6;
                  r5 = (function(e) { return e; })(r10);
                }
                if (r5 === null) {
                  pos = r6;
                }
              }
            }
          } else {
            r4 = null;
          }
          if (r4 !== null) {
            if (input.substr(pos, 3) === "\"\"\"") {
              r5 = "\"\"\"";
              pos += 3;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\"\\\"\\\"\\\"\"");
              }
            }
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(es) {
              return rp(createInterpolation(es));
            })(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          if (input.charCodeAt(pos) === 34) {
            r3 = "\"";
            pos++;
          } else {
            r3 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\\"\"");
            }
          }
          if (r3 !== null) {
            r6 = pos;
            r7 = parse_stringData();
            if (r7 === null) {
              if (input.charCodeAt(pos) === 39) {
                r7 = "'";
                pos++;
              } else {
                r7 = null;
                if (reportFailures === 0) {
                  matchFailed("\"'\"");
                }
              }
            }
            if (r7 !== null) {
              r5 = [];
              while (r7 !== null) {
                r5.push(r7);
                r7 = parse_stringData();
                if (r7 === null) {
                  if (input.charCodeAt(pos) === 39) {
                    r7 = "'";
                    pos++;
                  } else {
                    r7 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"'\"");
                    }
                  }
                }
              }
            } else {
              r5 = null;
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(d) { return rp(new CS.String(d.join(''))); })(r5);
            }
            if (r5 === null) {
              pos = r6;
            }
            if (r5 === null) {
              r6 = pos;
              r7 = pos;
              if (input.substr(pos, 2) === "#{") {
                r8 = "#{";
                pos += 2;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\"#{\"");
                }
              }
              if (r8 !== null) {
                r9 = parse__();
                if (r9 !== null) {
                  r10 = parse_expression();
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      if (input.charCodeAt(pos) === 125) {
                        r12 = "}";
                        pos++;
                      } else {
                        r12 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"}\"");
                        }
                      }
                      if (r12 !== null) {
                        r5 = [r8, r9, r10, r11, r12];
                      } else {
                        r5 = null;
                        pos = r7;
                      }
                    } else {
                      r5 = null;
                      pos = r7;
                    }
                  } else {
                    r5 = null;
                    pos = r7;
                  }
                } else {
                  r5 = null;
                  pos = r7;
                }
              } else {
                r5 = null;
                pos = r7;
              }
              if (r5 !== null) {
                reportedPos = r6;
                r5 = (function(e) { return e; })(r10);
              }
              if (r5 === null) {
                pos = r6;
              }
            }
            if (r5 !== null) {
              r4 = [];
              while (r5 !== null) {
                r4.push(r5);
                r6 = pos;
                r7 = parse_stringData();
                if (r7 === null) {
                  if (input.charCodeAt(pos) === 39) {
                    r7 = "'";
                    pos++;
                  } else {
                    r7 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"'\"");
                    }
                  }
                }
                if (r7 !== null) {
                  r5 = [];
                  while (r7 !== null) {
                    r5.push(r7);
                    r7 = parse_stringData();
                    if (r7 === null) {
                      if (input.charCodeAt(pos) === 39) {
                        r7 = "'";
                        pos++;
                      } else {
                        r7 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"'\"");
                        }
                      }
                    }
                  }
                } else {
                  r5 = null;
                }
                if (r5 !== null) {
                  reportedPos = r6;
                  r5 = (function(d) { return rp(new CS.String(d.join(''))); })(r5);
                }
                if (r5 === null) {
                  pos = r6;
                }
                if (r5 === null) {
                  r6 = pos;
                  r7 = pos;
                  if (input.substr(pos, 2) === "#{") {
                    r8 = "#{";
                    pos += 2;
                  } else {
                    r8 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"#{\"");
                    }
                  }
                  if (r8 !== null) {
                    r9 = parse__();
                    if (r9 !== null) {
                      r10 = parse_expression();
                      if (r10 !== null) {
                        r11 = parse__();
                        if (r11 !== null) {
                          if (input.charCodeAt(pos) === 125) {
                            r12 = "}";
                            pos++;
                          } else {
                            r12 = null;
                            if (reportFailures === 0) {
                              matchFailed("\"}\"");
                            }
                          }
                          if (r12 !== null) {
                            r5 = [r8, r9, r10, r11, r12];
                          } else {
                            r5 = null;
                            pos = r7;
                          }
                        } else {
                          r5 = null;
                          pos = r7;
                        }
                      } else {
                        r5 = null;
                        pos = r7;
                      }
                    } else {
                      r5 = null;
                      pos = r7;
                    }
                  } else {
                    r5 = null;
                    pos = r7;
                  }
                  if (r5 !== null) {
                    reportedPos = r6;
                    r5 = (function(e) { return e; })(r10);
                  }
                  if (r5 === null) {
                    pos = r6;
                  }
                }
              }
            } else {
              r4 = null;
            }
            if (r4 !== null) {
              if (input.charCodeAt(pos) === 34) {
                r5 = "\"";
                pos++;
              } else {
                r5 = null;
                if (reportFailures === 0) {
                  matchFailed("\"\\\"\"");
                }
              }
              if (r5 !== null) {
                r0 = [r3, r4, r5];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(es) {
                return rp(createInterpolation(es));
              })(r4);
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_regexp() {
        var cacheKey = "regexp@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 3) === "///") {
          r3 = "///";
          pos += 3;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"///\"");
          }
        }
        if (r3 !== null) {
          r6 = pos;
          if (/^[ \r\n]/.test(input.charAt(pos))) {
            r7 = input.charAt(pos);
            pos++;
          } else {
            r7 = null;
            if (reportFailures === 0) {
              matchFailed("[ \\r\\n]");
            }
          }
          if (r7 !== null) {
            r5 = [];
            while (r7 !== null) {
              r5.push(r7);
              if (/^[ \r\n]/.test(input.charAt(pos))) {
                r7 = input.charAt(pos);
                pos++;
              } else {
                r7 = null;
                if (reportFailures === 0) {
                  matchFailed("[ \\r\\n]");
                }
              }
            }
          } else {
            r5 = null;
          }
          if (r5 !== null) {
            reportedPos = r6;
            r5 = (function() { return [rp(new CS.String('').g())]; })();
          }
          if (r5 === null) {
            pos = r6;
          }
          if (r5 === null) {
            r6 = pos;
            if (/^[^\\\/#[ \r\n]/.test(input.charAt(pos))) {
              r7 = input.charAt(pos);
              pos++;
            } else {
              r7 = null;
              if (reportFailures === 0) {
                matchFailed("[^\\\\\\/#[ \\r\\n]");
              }
            }
            if (r7 !== null) {
              r5 = [];
              while (r7 !== null) {
                r5.push(r7);
                if (/^[^\\\/#[ \r\n]/.test(input.charAt(pos))) {
                  r7 = input.charAt(pos);
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("[^\\\\\\/#[ \\r\\n]");
                  }
                }
              }
            } else {
              r5 = null;
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(s) { return [rp(new CS.String(s.join('')).g())]; })(r5);
            }
            if (r5 === null) {
              pos = r6;
            }
            if (r5 === null) {
              r5 = parse_hereregexpData();
            }
          }
          if (r5 !== null) {
            r4 = [];
            while (r5 !== null) {
              r4.push(r5);
              r6 = pos;
              if (/^[ \r\n]/.test(input.charAt(pos))) {
                r7 = input.charAt(pos);
                pos++;
              } else {
                r7 = null;
                if (reportFailures === 0) {
                  matchFailed("[ \\r\\n]");
                }
              }
              if (r7 !== null) {
                r5 = [];
                while (r7 !== null) {
                  r5.push(r7);
                  if (/^[ \r\n]/.test(input.charAt(pos))) {
                    r7 = input.charAt(pos);
                    pos++;
                  } else {
                    r7 = null;
                    if (reportFailures === 0) {
                      matchFailed("[ \\r\\n]");
                    }
                  }
                }
              } else {
                r5 = null;
              }
              if (r5 !== null) {
                reportedPos = r6;
                r5 = (function() { return [rp(new CS.String('').g())]; })();
              }
              if (r5 === null) {
                pos = r6;
              }
              if (r5 === null) {
                r6 = pos;
                if (/^[^\\\/#[ \r\n]/.test(input.charAt(pos))) {
                  r7 = input.charAt(pos);
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("[^\\\\\\/#[ \\r\\n]");
                  }
                }
                if (r7 !== null) {
                  r5 = [];
                  while (r7 !== null) {
                    r5.push(r7);
                    if (/^[^\\\/#[ \r\n]/.test(input.charAt(pos))) {
                      r7 = input.charAt(pos);
                      pos++;
                    } else {
                      r7 = null;
                      if (reportFailures === 0) {
                        matchFailed("[^\\\\\\/#[ \\r\\n]");
                      }
                    }
                  }
                } else {
                  r5 = null;
                }
                if (r5 !== null) {
                  reportedPos = r6;
                  r5 = (function(s) { return [rp(new CS.String(s.join('')).g())]; })(r5);
                }
                if (r5 === null) {
                  pos = r6;
                }
                if (r5 === null) {
                  r5 = parse_hereregexpData();
                }
              }
            }
          } else {
            r4 = null;
          }
          if (r4 !== null) {
            if (input.substr(pos, 3) === "///") {
              r5 = "///";
              pos += 3;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\"///\"");
              }
            }
            if (r5 !== null) {
              r6 = [];
              if (/^[gimy]/.test(input.charAt(pos))) {
                r7 = input.charAt(pos);
                pos++;
              } else {
                r7 = null;
                if (reportFailures === 0) {
                  matchFailed("[gimy]");
                }
              }
              while (r7 !== null) {
                r6.push(r7);
                if (/^[gimy]/.test(input.charAt(pos))) {
                  r7 = input.charAt(pos);
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("[gimy]");
                  }
                }
              }
              if (r6 !== null) {
                r0 = [r3, r4, r5, r6];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(es, flags) {
              if(!isValidRegExpFlags(flags))
                throw new SyntaxError(['regular expression flags'], 'regular expression flags', offset(), line(), column());
              if(!flags) flags = [];
              var interp = createInterpolation(foldl(function(memo, e){ return memo.concat(e); }, [], es));
              if(interp instanceof CS.String) return p(new CS.RegExp(interp.data, flags));
              return rp(new CS.HeregExp(interp, flags));
            })(r4, r6);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          if (input.charCodeAt(pos) === 47) {
            r3 = "/";
            pos++;
          } else {
            r3 = null;
            if (reportFailures === 0) {
              matchFailed("\"/\"");
            }
          }
          if (r3 !== null) {
            r4 = [];
            r5 = parse_regexpData();
            if (r5 === null) {
              r6 = pos;
              if (/^[^\/\\[\n]/.test(input.charAt(pos))) {
                r7 = input.charAt(pos);
                pos++;
              } else {
                r7 = null;
                if (reportFailures === 0) {
                  matchFailed("[^\\/\\\\[\\n]");
                }
              }
              if (r7 !== null) {
                r5 = [];
                while (r7 !== null) {
                  r5.push(r7);
                  if (/^[^\/\\[\n]/.test(input.charAt(pos))) {
                    r7 = input.charAt(pos);
                    pos++;
                  } else {
                    r7 = null;
                    if (reportFailures === 0) {
                      matchFailed("[^\\/\\\\[\\n]");
                    }
                  }
                }
              } else {
                r5 = null;
              }
              if (r5 !== null) {
                reportedPos = r6;
                r5 = (function(d) { return d.join(''); })(r5);
              }
              if (r5 === null) {
                pos = r6;
              }
            }
            while (r5 !== null) {
              r4.push(r5);
              r5 = parse_regexpData();
              if (r5 === null) {
                r6 = pos;
                if (/^[^\/\\[\n]/.test(input.charAt(pos))) {
                  r7 = input.charAt(pos);
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("[^\\/\\\\[\\n]");
                  }
                }
                if (r7 !== null) {
                  r5 = [];
                  while (r7 !== null) {
                    r5.push(r7);
                    if (/^[^\/\\[\n]/.test(input.charAt(pos))) {
                      r7 = input.charAt(pos);
                      pos++;
                    } else {
                      r7 = null;
                      if (reportFailures === 0) {
                        matchFailed("[^\\/\\\\[\\n]");
                      }
                    }
                  }
                } else {
                  r5 = null;
                }
                if (r5 !== null) {
                  reportedPos = r6;
                  r5 = (function(d) { return d.join(''); })(r5);
                }
                if (r5 === null) {
                  pos = r6;
                }
              }
            }
            if (r4 !== null) {
              if (input.charCodeAt(pos) === 47) {
                r5 = "/";
                pos++;
              } else {
                r5 = null;
                if (reportFailures === 0) {
                  matchFailed("\"/\"");
                }
              }
              if (r5 !== null) {
                r6 = [];
                if (/^[gimy]/.test(input.charAt(pos))) {
                  r7 = input.charAt(pos);
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("[gimy]");
                  }
                }
                while (r7 !== null) {
                  r6.push(r7);
                  if (/^[gimy]/.test(input.charAt(pos))) {
                    r7 = input.charAt(pos);
                    pos++;
                  } else {
                    r7 = null;
                    if (reportFailures === 0) {
                      matchFailed("[gimy]");
                    }
                  }
                }
                if (r6 !== null) {
                  r0 = [r3, r4, r5, r6];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(d, flags) {
                if(!isValidRegExpFlags(flags))
                  throw new SyntaxError(['regular expression flags'], 'regular expression flags', offset(), line(), column());
                return rp(new CS.RegExp(d.join(''), flags));
              })(r4, r6);
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_regexpData() {
        var cacheKey = "regexpData@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 91) {
          r3 = "[";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"[\"");
          }
        }
        if (r3 !== null) {
          r4 = [];
          if (/^[^\\\]\n]/.test(input.charAt(pos))) {
            r5 = input.charAt(pos);
            pos++;
          } else {
            r5 = null;
            if (reportFailures === 0) {
              matchFailed("[^\\\\\\]\\n]");
            }
          }
          if (r5 === null) {
            r5 = parse_regexpData();
          }
          while (r5 !== null) {
            r4.push(r5);
            if (/^[^\\\]\n]/.test(input.charAt(pos))) {
              r5 = input.charAt(pos);
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("[^\\\\\\]\\n]");
              }
            }
            if (r5 === null) {
              r5 = parse_regexpData();
            }
          }
          if (r4 !== null) {
            if (input.charCodeAt(pos) === 93) {
              r5 = "]";
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\"]\"");
              }
            }
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(d) { return '[' + d.join('') + ']'; })(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          if (input.charCodeAt(pos) === 92) {
            r3 = "\\";
            pos++;
          } else {
            r3 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\\\\"");
            }
          }
          if (r3 !== null) {
            if (input.length > pos) {
              r4 = input.charAt(pos);
              pos++;
            } else {
              r4 = null;
              if (reportFailures === 0) {
                matchFailed("any character");
              }
            }
            if (r4 !== null) {
              r0 = [r3, r4];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            r0 = input.substring(pos, r1);
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_hereregexpData() {
        var cacheKey = "hereregexpData@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 91) {
          r3 = "[";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"[\"");
          }
        }
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r5 = parse_hereregexpData();
          if (r5 !== null) {
            reportedPos = r6;
            r5 = (function(h) { return h[0]; })(r5);
          }
          if (r5 === null) {
            pos = r6;
          }
          if (r5 === null) {
            r6 = pos;
            if (/^[^\\\/\]]/.test(input.charAt(pos))) {
              r5 = input.charAt(pos);
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("[^\\\\\\/\\]]");
              }
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(s) { return p(new CS.String(s)); })(r5);
            }
            if (r5 === null) {
              pos = r6;
            }
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r5 = parse_hereregexpData();
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(h) { return h[0]; })(r5);
            }
            if (r5 === null) {
              pos = r6;
            }
            if (r5 === null) {
              r6 = pos;
              if (/^[^\\\/\]]/.test(input.charAt(pos))) {
                r5 = input.charAt(pos);
                pos++;
              } else {
                r5 = null;
                if (reportFailures === 0) {
                  matchFailed("[^\\\\\\/\\]]");
                }
              }
              if (r5 !== null) {
                reportedPos = r6;
                r5 = (function(s) { return p(new CS.String(s)); })(r5);
              }
              if (r5 === null) {
                pos = r6;
              }
            }
          }
          if (r4 !== null) {
            if (input.charCodeAt(pos) === 93) {
              r5 = "]";
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\"]\"");
              }
            }
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(d) {
                return [p(new CS.String("["))].concat(d || []).concat([p(new CS.String("]"))]);
              })(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r3 = pos;
          if (input.charCodeAt(pos) === 92) {
            r4 = "\\";
            pos++;
          } else {
            r4 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\\\\"");
            }
          }
          if (r4 !== null) {
            if (input.length > pos) {
              r5 = input.charAt(pos);
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("any character");
              }
            }
            if (r5 !== null) {
              r0 = [r4, r5];
            } else {
              r0 = null;
              pos = r3;
            }
          } else {
            r0 = null;
            pos = r3;
          }
          if (r0 !== null) {
            r0 = input.substring(pos, r2);
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(d) { return [rp(new CS.String(d))]; })(r0);
          }
          if (r0 === null) {
            pos = r1;
          }
          if (r0 === null) {
            r1 = pos;
            r2 = pos;
            r3 = pos;
            if (input.charCodeAt(pos) === 47) {
              r4 = "/";
              pos++;
            } else {
              r4 = null;
              if (reportFailures === 0) {
                matchFailed("\"/\"");
              }
            }
            if (r4 !== null) {
              if (input.charCodeAt(pos) === 47) {
                r5 = "/";
                pos++;
              } else {
                r5 = null;
                if (reportFailures === 0) {
                  matchFailed("\"/\"");
                }
              }
              r5 = r5 !== null ? r5 : "";
              if (r5 !== null) {
                r7 = pos;
                reportFailures++;
                if (input.charCodeAt(pos) === 47) {
                  r6 = "/";
                  pos++;
                } else {
                  r6 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"/\"");
                  }
                }
                reportFailures--;
                if (r6 === null) {
                  r6 = "";
                } else {
                  r6 = null;
                  pos = r7;
                }
                if (r6 !== null) {
                  r0 = [r4, r5, r6];
                } else {
                  r0 = null;
                  pos = r3;
                }
              } else {
                r0 = null;
                pos = r3;
              }
            } else {
              r0 = null;
              pos = r3;
            }
            if (r0 !== null) {
              r0 = input.substring(pos, r2);
            }
            if (r0 !== null) {
              reportedPos = r1;
              r0 = (function(s) { return [rp(new CS.String(s))]; })(r0);
            }
            if (r0 === null) {
              pos = r1;
            }
            if (r0 === null) {
              r1 = pos;
              r2 = pos;
              if (input.charCodeAt(pos) === 35) {
                r3 = "#";
                pos++;
              } else {
                r3 = null;
                if (reportFailures === 0) {
                  matchFailed("\"#\"");
                }
              }
              if (r3 !== null) {
                r5 = pos;
                reportFailures++;
                if (input.charCodeAt(pos) === 123) {
                  r4 = "{";
                  pos++;
                } else {
                  r4 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"{\"");
                  }
                }
                reportFailures--;
                if (r4 === null) {
                  r4 = "";
                } else {
                  r4 = null;
                  pos = r5;
                }
                if (r4 !== null) {
                  r0 = [r3, r4];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
              if (r0 !== null) {
                reportedPos = r1;
                r0 = (function(c) { return [rp(new CS.String(c))]; })(r3);
              }
              if (r0 === null) {
                pos = r1;
              }
              if (r0 === null) {
                r1 = pos;
                r2 = pos;
                if (input.substr(pos, 2) === "#{") {
                  r3 = "#{";
                  pos += 2;
                } else {
                  r3 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"#{\"");
                  }
                }
                if (r3 !== null) {
                  r4 = parse__();
                  if (r4 !== null) {
                    r5 = parse_expression();
                    if (r5 !== null) {
                      r6 = parse__();
                      if (r6 !== null) {
                        if (input.charCodeAt(pos) === 125) {
                          r7 = "}";
                          pos++;
                        } else {
                          r7 = null;
                          if (reportFailures === 0) {
                            matchFailed("\"}\"");
                          }
                        }
                        if (r7 !== null) {
                          r0 = [r3, r4, r5, r6, r7];
                        } else {
                          r0 = null;
                          pos = r2;
                        }
                      } else {
                        r0 = null;
                        pos = r2;
                      }
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
                if (r0 !== null) {
                  reportedPos = r1;
                  r0 = (function(e) { return [e]; })(r5);
                }
                if (r0 === null) {
                  pos = r1;
                }
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_throw() {
        var cacheKey = "throw@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_THROW();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_secondaryExpression();
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(e) { return rp(new CS.Throw(e)); })(r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_return() {
        var cacheKey = "return@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_RETURN();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_secondaryExpression();
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(e) { return rp(new CS.Return(e || null)); })(r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_continue() {
        var cacheKey = "continue@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1;
        
        r1 = pos;
        r0 = parse_CONTINUE();
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function() { return rp(new CS.Continue); })();
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_break() {
        var cacheKey = "break@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1;
        
        r1 = pos;
        r0 = parse_BREAK();
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function() { return rp(new CS.Break); })();
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_debugger() {
        var cacheKey = "debugger@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1;
        
        r1 = pos;
        r0 = parse_DEBUGGER();
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function() { return rp(new CS.Debugger); })();
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_undefined() {
        var cacheKey = "undefined@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1;
        
        r1 = pos;
        r0 = parse_UNDEFINED();
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function() { return rp(new CS.Undefined); })();
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_null() {
        var cacheKey = "null@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1;
        
        r1 = pos;
        r0 = parse_NULL();
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function() { return rp(new CS.Null); })();
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_unassignable() {
        var cacheKey = "unassignable@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        if (input.substr(pos, 9) === "arguments") {
          r2 = "arguments";
          pos += 9;
        } else {
          r2 = null;
          if (reportFailures === 0) {
            matchFailed("\"arguments\"");
          }
        }
        if (r2 === null) {
          if (input.substr(pos, 4) === "eval") {
            r2 = "eval";
            pos += 4;
          } else {
            r2 = null;
            if (reportFailures === 0) {
              matchFailed("\"eval\"");
            }
          }
        }
        if (r2 !== null) {
          r4 = pos;
          reportFailures++;
          r3 = parse_identifierPart();
          reportFailures--;
          if (r3 === null) {
            r3 = "";
          } else {
            r3 = null;
            pos = r4;
          }
          if (r3 !== null) {
            r0 = [r2, r3];
          } else {
            r0 = null;
            pos = r1;
          }
        } else {
          r0 = null;
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_CompoundAssignable() {
        var cacheKey = "CompoundAssignable@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4;
        
        r0 = parse_memberAccess();
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r4 = pos;
          reportFailures++;
          r3 = parse_unassignable();
          reportFailures--;
          if (r3 === null) {
            r3 = "";
          } else {
            r3 = null;
            pos = r4;
          }
          if (r3 !== null) {
            r4 = parse_identifier();
            if (r4 !== null) {
              r0 = [r3, r4];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(i) { return i; })(r4);
          }
          if (r0 === null) {
            pos = r1;
          }
          if (r0 === null) {
            r0 = parse_contextVar();
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_Assignable() {
        var cacheKey = "Assignable@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4;
        
        r0 = parse_memberAccess();
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r4 = pos;
          reportFailures++;
          r3 = parse_unassignable();
          reportFailures--;
          if (r3 === null) {
            r3 = "";
          } else {
            r3 = null;
            pos = r4;
          }
          if (r3 !== null) {
            r4 = parse_identifier();
            if (r4 !== null) {
              r0 = [r3, r4];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(i) { return i; })(r4);
          }
          if (r0 === null) {
            pos = r1;
          }
          if (r0 === null) {
            r0 = parse_contextVar();
            if (r0 === null) {
              r0 = parse_positionalDestructuring();
              if (r0 === null) {
                r0 = parse_namedDestructuring();
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_positionalDestructuring() {
        var cacheKey = "positionalDestructuring@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 91) {
          r3 = "[";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"[\"");
          }
        }
        if (r3 !== null) {
          r4 = parse_positionalDestructuringBody();
          if (r4 !== null) {
            r5 = parse_TERMINATOR();
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                if (input.charCodeAt(pos) === 93) {
                  r7 = "]";
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"]\"");
                  }
                }
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(members) {
              return rp(new CS.ArrayInitialiser(members));
            })(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_positionalDestructuringBody() {
        var cacheKey = "positionalDestructuringBody@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_TERMINDENT();
        if (r3 !== null) {
          r4 = parse_positionalDestructuringMemberList();
          if (r4 !== null) {
            r5 = parse_DEDENT();
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(members) { return members; })(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r3 = parse__();
          if (r3 !== null) {
            r4 = parse_positionalDestructuringMemberList();
            r4 = r4 !== null ? r4 : "";
            if (r4 !== null) {
              r0 = [r3, r4];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(members) { return members || []; })(r4);
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_positionalDestructuringMemberList() {
        var cacheKey = "positionalDestructuringMemberList@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_positionalDestructuringMember();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            if (input.charCodeAt(pos) === 44) {
              r8 = ",";
              pos++;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("\",\"");
              }
            }
            if (r8 !== null) {
              r9 = parse__();
              if (r9 !== null) {
                r10 = parse_positionalDestructuringMember();
                if (r10 !== null) {
                  r5 = [r7, r8, r9, r10];
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse__();
            if (r7 !== null) {
              if (input.charCodeAt(pos) === 44) {
                r8 = ",";
                pos++;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\",\"");
                }
              }
              if (r8 !== null) {
                r9 = parse__();
                if (r9 !== null) {
                  r10 = parse_positionalDestructuringMember();
                  if (r10 !== null) {
                    r5 = [r7, r8, r9, r10];
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(e, es) {
                return [e].concat(es.map(function(e){ return e[3]; }));
              })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_positionalDestructuringMember() {
        var cacheKey = "positionalDestructuringMember@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        r0 = parse_rest();
        if (r0 === null) {
          r0 = parse_Assignable();
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_namedDestructuring() {
        var cacheKey = "namedDestructuring@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 123) {
          r3 = "{";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"{\"");
          }
        }
        if (r3 !== null) {
          r4 = parse_namedDestructuringBody();
          if (r4 !== null) {
            r5 = parse_TERMINATOR();
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                if (input.charCodeAt(pos) === 125) {
                  r7 = "}";
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"}\"");
                  }
                }
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(members) {
            return rp(new CS.ObjectInitialiser(members));
          })(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_namedDestructuringBody() {
        var cacheKey = "namedDestructuringBody@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_TERMINDENT();
        if (r3 !== null) {
          r4 = parse_namedDestructuringMemberList();
          if (r4 !== null) {
            r5 = parse_DEDENT();
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(members) { return members; })(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          r3 = parse__();
          if (r3 !== null) {
            r4 = parse_namedDestructuringMemberList();
            r4 = r4 !== null ? r4 : "";
            if (r4 !== null) {
              r0 = [r3, r4];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(members) { return members || []; })(r4);
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_namedDestructuringMemberList() {
        var cacheKey = "namedDestructuringMemberList@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_namedDestructuringMember();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = parse_TERMINATOR();
          r7 = r7 !== null ? r7 : "";
          if (r7 !== null) {
            r8 = parse__();
            if (r8 !== null) {
              if (input.charCodeAt(pos) === 44) {
                r9 = ",";
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\",\"");
                }
              }
              if (r9 === null) {
                r9 = parse_TERMINATOR();
              }
              if (r9 !== null) {
                r10 = parse_TERMINATOR();
                r10 = r10 !== null ? r10 : "";
                if (r10 !== null) {
                  r11 = parse__();
                  if (r11 !== null) {
                    r12 = parse_namedDestructuringMember();
                    if (r12 !== null) {
                      r5 = [r7, r8, r9, r10, r11, r12];
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = parse_TERMINATOR();
            r7 = r7 !== null ? r7 : "";
            if (r7 !== null) {
              r8 = parse__();
              if (r8 !== null) {
                if (input.charCodeAt(pos) === 44) {
                  r9 = ",";
                  pos++;
                } else {
                  r9 = null;
                  if (reportFailures === 0) {
                    matchFailed("\",\"");
                  }
                }
                if (r9 === null) {
                  r9 = parse_TERMINATOR();
                }
                if (r9 !== null) {
                  r10 = parse_TERMINATOR();
                  r10 = r10 !== null ? r10 : "";
                  if (r10 !== null) {
                    r11 = parse__();
                    if (r11 !== null) {
                      r12 = parse_namedDestructuringMember();
                      if (r12 !== null) {
                        r5 = [r7, r8, r9, r10, r11, r12];
                      } else {
                        r5 = null;
                        pos = r6;
                      }
                    } else {
                      r5 = null;
                      pos = r6;
                    }
                  } else {
                    r5 = null;
                    pos = r6;
                  }
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(e, es) {
                return [e].concat(es.map(function(e){ return e[5]; }));
              })(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_namedDestructuringMember() {
        var cacheKey = "namedDestructuringMember@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_ObjectInitialiserKeys();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            if (input.charCodeAt(pos) === 58) {
              r5 = ":";
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\":\"");
              }
            }
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r7 = parse_Assignable();
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(key, val) {
                return rp(new CS.ObjectInitialiserMember(key, val));
              })(r3, r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r0 = parse_contextVar();
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(v) {
                  var key = rp(new CS.String(v.memberName));
                  return rp(new CS.ObjectInitialiserMember(key, v));
                })(r0);
          }
          if (r0 === null) {
            pos = r1;
          }
          if (r0 === null) {
            r1 = pos;
            r2 = pos;
            r4 = pos;
            reportFailures++;
            r3 = parse_unassignable();
            reportFailures--;
            if (r3 === null) {
              r3 = "";
            } else {
              r3 = null;
              pos = r4;
            }
            if (r3 !== null) {
              r4 = parse_identifier();
              if (r4 !== null) {
                r0 = [r3, r4];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
            if (r0 !== null) {
              reportedPos = r1;
              r0 = (function(i) {
                    return rp(new CS.ObjectInitialiserMember(i, i));
                  })(r4);
            }
            if (r0 === null) {
              pos = r1;
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_identifier() {
        var cacheKey = "identifier@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        r2 = pos;
        r4 = pos;
        reportFailures++;
        r3 = parse_reserved();
        reportFailures--;
        if (r3 === null) {
          r3 = "";
        } else {
          r3 = null;
          pos = r4;
        }
        if (r3 !== null) {
          r4 = parse_identifierName();
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(i) { return rp(new CS.Identifier(i)); })(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_identifierName() {
        var cacheKey = "identifierName@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_identifierStart();
        if (r3 !== null) {
          r4 = [];
          r5 = parse_identifierPart();
          while (r5 !== null) {
            r4.push(r5);
            r5 = parse_identifierPart();
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_identifierStart() {
        var cacheKey = "identifierStart@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        r0 = parse_UnicodeLetter();
        if (r0 === null) {
          if (/^[$_]/.test(input.charAt(pos))) {
            r0 = input.charAt(pos);
            pos++;
          } else {
            r0 = null;
            if (reportFailures === 0) {
              matchFailed("[$_]");
            }
          }
          if (r0 === null) {
            r0 = parse_UnicodeEscapeSequence();
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_identifierPart() {
        var cacheKey = "identifierPart@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        r0 = parse_identifierStart();
        if (r0 === null) {
          r0 = parse_UnicodeCombiningMark();
          if (r0 === null) {
            r0 = parse_UnicodeDigit();
            if (r0 === null) {
              r0 = parse_UnicodeConnectorPunctuation();
              if (r0 === null) {
                r0 = parse_ZWNJ();
                if (r0 === null) {
                  r0 = parse_ZWJ();
                }
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse___() {
        var cacheKey = "__@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8;
        
        r1 = pos;
        r2 = pos;
        r4 = parse_whitespace();
        if (r4 !== null) {
          r3 = [];
          while (r4 !== null) {
            r3.push(r4);
            r4 = parse_whitespace();
          }
        } else {
          r3 = null;
        }
        if (r3 !== null) {
          r5 = pos;
          r6 = parse_blockComment();
          if (r6 !== null) {
            r8 = parse_whitespace();
            if (r8 !== null) {
              r7 = [];
              while (r8 !== null) {
                r7.push(r8);
                r8 = parse_whitespace();
              }
            } else {
              r7 = null;
            }
            if (r7 !== null) {
              r4 = [r6, r7];
            } else {
              r4 = null;
              pos = r5;
            }
          } else {
            r4 = null;
            pos = r5;
          }
          r4 = r4 !== null ? r4 : "";
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse__() {
        var cacheKey = "_@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        r0 = parse___();
        r0 = r0 !== null ? r0 : "";
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_comment() {
        var cacheKey = "comment@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        r0 = parse_blockComment();
        if (r0 === null) {
          r0 = parse_singleLineComment();
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_singleLineComment() {
        var cacheKey = "singleLineComment@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 35) {
          r3 = "#";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"#\"");
          }
        }
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r8 = pos;
          reportFailures++;
          r7 = parse_TERM();
          reportFailures--;
          if (r7 === null) {
            r7 = "";
          } else {
            r7 = null;
            pos = r8;
          }
          if (r7 !== null) {
            if (input.length > pos) {
              r8 = input.charAt(pos);
              pos++;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("any character");
              }
            }
            if (r8 !== null) {
              r5 = [r7, r8];
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r8 = pos;
            reportFailures++;
            r7 = parse_TERM();
            reportFailures--;
            if (r7 === null) {
              r7 = "";
            } else {
              r7 = null;
              pos = r8;
            }
            if (r7 !== null) {
              if (input.length > pos) {
                r8 = input.charAt(pos);
                pos++;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("any character");
                }
              }
              if (r8 !== null) {
                r5 = [r7, r8];
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_blockComment() {
        var cacheKey = "blockComment@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 3) === "###") {
          r3 = "###";
          pos += 3;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"###\"");
          }
        }
        if (r3 !== null) {
          if (/^[^#]/.test(input.charAt(pos))) {
            r4 = input.charAt(pos);
            pos++;
          } else {
            r4 = null;
            if (reportFailures === 0) {
              matchFailed("[^#]");
            }
          }
          if (r4 !== null) {
            r5 = [];
            if (/^[^#]/.test(input.charAt(pos))) {
              r6 = input.charAt(pos);
              pos++;
            } else {
              r6 = null;
              if (reportFailures === 0) {
                matchFailed("[^#]");
              }
            }
            if (r6 === null) {
              r7 = pos;
              if (input.charCodeAt(pos) === 35) {
                r8 = "#";
                pos++;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\"#\"");
                }
              }
              if (r8 !== null) {
                if (input.charCodeAt(pos) === 35) {
                  r9 = "#";
                  pos++;
                } else {
                  r9 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"#\"");
                  }
                }
                r9 = r9 !== null ? r9 : "";
                if (r9 !== null) {
                  r11 = pos;
                  reportFailures++;
                  if (input.charCodeAt(pos) === 35) {
                    r10 = "#";
                    pos++;
                  } else {
                    r10 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"#\"");
                    }
                  }
                  reportFailures--;
                  if (r10 === null) {
                    r10 = "";
                  } else {
                    r10 = null;
                    pos = r11;
                  }
                  if (r10 !== null) {
                    r6 = [r8, r9, r10];
                  } else {
                    r6 = null;
                    pos = r7;
                  }
                } else {
                  r6 = null;
                  pos = r7;
                }
              } else {
                r6 = null;
                pos = r7;
              }
            }
            while (r6 !== null) {
              r5.push(r6);
              if (/^[^#]/.test(input.charAt(pos))) {
                r6 = input.charAt(pos);
                pos++;
              } else {
                r6 = null;
                if (reportFailures === 0) {
                  matchFailed("[^#]");
                }
              }
              if (r6 === null) {
                r7 = pos;
                if (input.charCodeAt(pos) === 35) {
                  r8 = "#";
                  pos++;
                } else {
                  r8 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"#\"");
                  }
                }
                if (r8 !== null) {
                  if (input.charCodeAt(pos) === 35) {
                    r9 = "#";
                    pos++;
                  } else {
                    r9 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"#\"");
                    }
                  }
                  r9 = r9 !== null ? r9 : "";
                  if (r9 !== null) {
                    r11 = pos;
                    reportFailures++;
                    if (input.charCodeAt(pos) === 35) {
                      r10 = "#";
                      pos++;
                    } else {
                      r10 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"#\"");
                      }
                    }
                    reportFailures--;
                    if (r10 === null) {
                      r10 = "";
                    } else {
                      r10 = null;
                      pos = r11;
                    }
                    if (r10 !== null) {
                      r6 = [r8, r9, r10];
                    } else {
                      r6 = null;
                      pos = r7;
                    }
                  } else {
                    r6 = null;
                    pos = r7;
                  }
                } else {
                  r6 = null;
                  pos = r7;
                }
              }
            }
            if (r5 !== null) {
              if (input.substr(pos, 3) === "###") {
                r6 = "###";
                pos += 3;
              } else {
                r6 = null;
                if (reportFailures === 0) {
                  matchFailed("\"###\"");
                }
              }
              if (r6 !== null) {
                r0 = [r3, r4, r5, r6];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_whitespace() {
        var cacheKey = "whitespace@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        if (/^[\t\x0B\f \xA0\uFEFF\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/.test(input.charAt(pos))) {
          r0 = input.charAt(pos);
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("[\\t\\x0B\\f \\xA0\\uFEFF\\u1680\\u180E\\u2000-\\u200A\\u202F\\u205F\\u3000]");
          }
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          if (input.charCodeAt(pos) === 92) {
            r3 = "\\";
            pos++;
          } else {
            r3 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\\\\"");
            }
          }
          if (r3 !== null) {
            if (input.charCodeAt(pos) === 13) {
              r4 = "\r";
              pos++;
            } else {
              r4 = null;
              if (reportFailures === 0) {
                matchFailed("\"\\r\"");
              }
            }
            r4 = r4 !== null ? r4 : "";
            if (r4 !== null) {
              if (input.charCodeAt(pos) === 10) {
                r5 = "\n";
                pos++;
              } else {
                r5 = null;
                if (reportFailures === 0) {
                  matchFailed("\"\\n\"");
                }
              }
              if (r5 !== null) {
                r0 = [r3, r4, r5];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            r0 = input.substring(pos, r1);
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_INDENT() {
        var cacheKey = "INDENT@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        r2 = pos;
        r3 = parse___();
        if (r3 !== null) {
          if (input.charCodeAt(pos) === 61423) {
            r4 = "\uEFEF";
            pos++;
          } else {
            r4 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\uEFEF\"");
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(ws) { return ws; })(r3);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_DEDENT() {
        var cacheKey = "DEDENT@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        r4 = pos;
        r5 = pos;
        r6 = parse_TERMINATOR();
        r6 = r6 !== null ? r6 : "";
        if (r6 !== null) {
          r7 = parse__();
          if (r7 !== null) {
            r3 = [r6, r7];
          } else {
            r3 = null;
            pos = r5;
          }
        } else {
          r3 = null;
          pos = r5;
        }
        if (r3 !== null) {
          r3 = input.substring(pos, r4);
        }
        if (r3 !== null) {
          if (input.charCodeAt(pos) === 61438) {
            r4 = "\uEFFE";
            pos++;
          } else {
            r4 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\uEFFE\"");
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(ws) { return ws; })(r3);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_TERM() {
        var cacheKey = "TERM@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 13) {
          r3 = "\r";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"\\r\"");
          }
        }
        r3 = r3 !== null ? r3 : "";
        if (r3 !== null) {
          if (input.charCodeAt(pos) === 10) {
            r4 = "\n";
            pos++;
          } else {
            r4 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\n\"");
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        if (r0 === null) {
          r1 = pos;
          if (input.charCodeAt(pos) === 61439) {
            r0 = "\uEFFF";
            pos++;
          } else {
            r0 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\uEFFF\"");
            }
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function() { return ''; })();
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_TERMINATOR() {
        var cacheKey = "TERMINATOR@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r3 = pos;
        r4 = parse__();
        if (r4 !== null) {
          r5 = parse_comment();
          r5 = r5 !== null ? r5 : "";
          if (r5 !== null) {
            r6 = parse_TERM();
            if (r6 !== null) {
              r7 = parse_blockComment();
              r7 = r7 !== null ? r7 : "";
              if (r7 !== null) {
                r2 = [r4, r5, r6, r7];
              } else {
                r2 = null;
                pos = r3;
              }
            } else {
              r2 = null;
              pos = r3;
            }
          } else {
            r2 = null;
            pos = r3;
          }
        } else {
          r2 = null;
          pos = r3;
        }
        if (r2 !== null) {
          r0 = [];
          while (r2 !== null) {
            r0.push(r2);
            r3 = pos;
            r4 = parse__();
            if (r4 !== null) {
              r5 = parse_comment();
              r5 = r5 !== null ? r5 : "";
              if (r5 !== null) {
                r6 = parse_TERM();
                if (r6 !== null) {
                  r7 = parse_blockComment();
                  r7 = r7 !== null ? r7 : "";
                  if (r7 !== null) {
                    r2 = [r4, r5, r6, r7];
                  } else {
                    r2 = null;
                    pos = r3;
                  }
                } else {
                  r2 = null;
                  pos = r3;
                }
              } else {
                r2 = null;
                pos = r3;
              }
            } else {
              r2 = null;
              pos = r3;
            }
          }
        } else {
          r0 = null;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_TERMINDENT() {
        var cacheKey = "TERMINDENT@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_TERMINATOR();
        if (r3 !== null) {
          r4 = parse_INDENT();
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_AND() {
        var cacheKey = "AND@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 3) === "and") {
          r3 = "and";
          pos += 3;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"and\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_BREAK() {
        var cacheKey = "BREAK@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 5) === "break") {
          r3 = "break";
          pos += 5;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"break\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_BY() {
        var cacheKey = "BY@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 2) === "by") {
          r3 = "by";
          pos += 2;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"by\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_CATCH() {
        var cacheKey = "CATCH@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 5) === "catch") {
          r3 = "catch";
          pos += 5;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"catch\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_CONTINUE() {
        var cacheKey = "CONTINUE@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 8) === "continue") {
          r3 = "continue";
          pos += 8;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"continue\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_CLASS() {
        var cacheKey = "CLASS@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 5) === "class") {
          r3 = "class";
          pos += 5;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"class\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_DELETE() {
        var cacheKey = "DELETE@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 6) === "delete") {
          r3 = "delete";
          pos += 6;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"delete\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_DEBUGGER() {
        var cacheKey = "DEBUGGER@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 8) === "debugger") {
          r3 = "debugger";
          pos += 8;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"debugger\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_DO() {
        var cacheKey = "DO@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 2) === "do") {
          r3 = "do";
          pos += 2;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"do\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_ELSE() {
        var cacheKey = "ELSE@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 4) === "else") {
          r3 = "else";
          pos += 4;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"else\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_EXTENDS() {
        var cacheKey = "EXTENDS@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 7) === "extends") {
          r3 = "extends";
          pos += 7;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"extends\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_FALSE() {
        var cacheKey = "FALSE@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 5) === "false") {
          r3 = "false";
          pos += 5;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"false\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_FINALLY() {
        var cacheKey = "FINALLY@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 7) === "finally") {
          r3 = "finally";
          pos += 7;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"finally\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_FOR() {
        var cacheKey = "FOR@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 3) === "for") {
          r3 = "for";
          pos += 3;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"for\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_IF() {
        var cacheKey = "IF@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 2) === "if") {
          r3 = "if";
          pos += 2;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"if\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_IN() {
        var cacheKey = "IN@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 2) === "in") {
          r3 = "in";
          pos += 2;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"in\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_INSTANCEOF() {
        var cacheKey = "INSTANCEOF@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 10) === "instanceof") {
          r3 = "instanceof";
          pos += 10;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"instanceof\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_IS() {
        var cacheKey = "IS@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 2) === "is") {
          r3 = "is";
          pos += 2;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"is\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_ISNT() {
        var cacheKey = "ISNT@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 4) === "isnt") {
          r3 = "isnt";
          pos += 4;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"isnt\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_LOOP() {
        var cacheKey = "LOOP@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 4) === "loop") {
          r3 = "loop";
          pos += 4;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"loop\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_NEW() {
        var cacheKey = "NEW@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 3) === "new") {
          r3 = "new";
          pos += 3;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"new\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_NO() {
        var cacheKey = "NO@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 2) === "no") {
          r3 = "no";
          pos += 2;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"no\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_NOT() {
        var cacheKey = "NOT@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 3) === "not") {
          r3 = "not";
          pos += 3;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"not\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_NULL() {
        var cacheKey = "NULL@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 4) === "null") {
          r3 = "null";
          pos += 4;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"null\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_OF() {
        var cacheKey = "OF@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 2) === "of") {
          r3 = "of";
          pos += 2;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"of\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_OFF() {
        var cacheKey = "OFF@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 3) === "off") {
          r3 = "off";
          pos += 3;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"off\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_ON() {
        var cacheKey = "ON@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 2) === "on") {
          r3 = "on";
          pos += 2;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"on\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_OR() {
        var cacheKey = "OR@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 2) === "or") {
          r3 = "or";
          pos += 2;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"or\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_OWN() {
        var cacheKey = "OWN@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 3) === "own") {
          r3 = "own";
          pos += 3;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"own\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_RETURN() {
        var cacheKey = "RETURN@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 6) === "return") {
          r3 = "return";
          pos += 6;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"return\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_SWITCH() {
        var cacheKey = "SWITCH@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 6) === "switch") {
          r3 = "switch";
          pos += 6;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"switch\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_THEN() {
        var cacheKey = "THEN@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 4) === "then") {
          r3 = "then";
          pos += 4;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"then\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_THIS() {
        var cacheKey = "THIS@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 4) === "this") {
          r3 = "this";
          pos += 4;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"this\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_THROW() {
        var cacheKey = "THROW@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 5) === "throw") {
          r3 = "throw";
          pos += 5;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"throw\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_TRUE() {
        var cacheKey = "TRUE@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 4) === "true") {
          r3 = "true";
          pos += 4;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"true\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_TRY() {
        var cacheKey = "TRY@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 3) === "try") {
          r3 = "try";
          pos += 3;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"try\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_TYPEOF() {
        var cacheKey = "TYPEOF@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 6) === "typeof") {
          r3 = "typeof";
          pos += 6;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"typeof\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_UNDEFINED() {
        var cacheKey = "UNDEFINED@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 9) === "undefined") {
          r3 = "undefined";
          pos += 9;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"undefined\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_UNLESS() {
        var cacheKey = "UNLESS@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 6) === "unless") {
          r3 = "unless";
          pos += 6;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"unless\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_UNTIL() {
        var cacheKey = "UNTIL@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 5) === "until") {
          r3 = "until";
          pos += 5;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"until\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_WHEN() {
        var cacheKey = "WHEN@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 4) === "when") {
          r3 = "when";
          pos += 4;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"when\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_WHILE() {
        var cacheKey = "WHILE@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 5) === "while") {
          r3 = "while";
          pos += 5;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"while\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_YES() {
        var cacheKey = "YES@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 3) === "yes") {
          r3 = "yes";
          pos += 3;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"yes\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          reportFailures++;
          r4 = parse_identifierPart();
          reportFailures--;
          if (r4 === null) {
            r4 = "";
          } else {
            r4 = null;
            pos = r5;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r1);
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_SharedKeywords() {
        var cacheKey = "SharedKeywords@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        if (input.substr(pos, 4) === "true") {
          r2 = "true";
          pos += 4;
        } else {
          r2 = null;
          if (reportFailures === 0) {
            matchFailed("\"true\"");
          }
        }
        if (r2 === null) {
          if (input.substr(pos, 5) === "false") {
            r2 = "false";
            pos += 5;
          } else {
            r2 = null;
            if (reportFailures === 0) {
              matchFailed("\"false\"");
            }
          }
          if (r2 === null) {
            if (input.substr(pos, 4) === "null") {
              r2 = "null";
              pos += 4;
            } else {
              r2 = null;
              if (reportFailures === 0) {
                matchFailed("\"null\"");
              }
            }
            if (r2 === null) {
              if (input.substr(pos, 4) === "this") {
                r2 = "this";
                pos += 4;
              } else {
                r2 = null;
                if (reportFailures === 0) {
                  matchFailed("\"this\"");
                }
              }
              if (r2 === null) {
                if (input.substr(pos, 3) === "new") {
                  r2 = "new";
                  pos += 3;
                } else {
                  r2 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"new\"");
                  }
                }
                if (r2 === null) {
                  if (input.substr(pos, 6) === "delete") {
                    r2 = "delete";
                    pos += 6;
                  } else {
                    r2 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"delete\"");
                    }
                  }
                  if (r2 === null) {
                    if (input.substr(pos, 6) === "typeof") {
                      r2 = "typeof";
                      pos += 6;
                    } else {
                      r2 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"typeof\"");
                      }
                    }
                    if (r2 === null) {
                      if (input.substr(pos, 10) === "instanceof") {
                        r2 = "instanceof";
                        pos += 10;
                      } else {
                        r2 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"instanceof\"");
                        }
                      }
                      if (r2 === null) {
                        if (input.substr(pos, 2) === "in") {
                          r2 = "in";
                          pos += 2;
                        } else {
                          r2 = null;
                          if (reportFailures === 0) {
                            matchFailed("\"in\"");
                          }
                        }
                        if (r2 === null) {
                          if (input.substr(pos, 6) === "return") {
                            r2 = "return";
                            pos += 6;
                          } else {
                            r2 = null;
                            if (reportFailures === 0) {
                              matchFailed("\"return\"");
                            }
                          }
                          if (r2 === null) {
                            if (input.substr(pos, 5) === "throw") {
                              r2 = "throw";
                              pos += 5;
                            } else {
                              r2 = null;
                              if (reportFailures === 0) {
                                matchFailed("\"throw\"");
                              }
                            }
                            if (r2 === null) {
                              if (input.substr(pos, 5) === "break") {
                                r2 = "break";
                                pos += 5;
                              } else {
                                r2 = null;
                                if (reportFailures === 0) {
                                  matchFailed("\"break\"");
                                }
                              }
                              if (r2 === null) {
                                if (input.substr(pos, 8) === "continue") {
                                  r2 = "continue";
                                  pos += 8;
                                } else {
                                  r2 = null;
                                  if (reportFailures === 0) {
                                    matchFailed("\"continue\"");
                                  }
                                }
                                if (r2 === null) {
                                  if (input.substr(pos, 8) === "debugger") {
                                    r2 = "debugger";
                                    pos += 8;
                                  } else {
                                    r2 = null;
                                    if (reportFailures === 0) {
                                      matchFailed("\"debugger\"");
                                    }
                                  }
                                  if (r2 === null) {
                                    if (input.substr(pos, 2) === "if") {
                                      r2 = "if";
                                      pos += 2;
                                    } else {
                                      r2 = null;
                                      if (reportFailures === 0) {
                                        matchFailed("\"if\"");
                                      }
                                    }
                                    if (r2 === null) {
                                      if (input.substr(pos, 4) === "else") {
                                        r2 = "else";
                                        pos += 4;
                                      } else {
                                        r2 = null;
                                        if (reportFailures === 0) {
                                          matchFailed("\"else\"");
                                        }
                                      }
                                      if (r2 === null) {
                                        if (input.substr(pos, 6) === "switch") {
                                          r2 = "switch";
                                          pos += 6;
                                        } else {
                                          r2 = null;
                                          if (reportFailures === 0) {
                                            matchFailed("\"switch\"");
                                          }
                                        }
                                        if (r2 === null) {
                                          if (input.substr(pos, 3) === "for") {
                                            r2 = "for";
                                            pos += 3;
                                          } else {
                                            r2 = null;
                                            if (reportFailures === 0) {
                                              matchFailed("\"for\"");
                                            }
                                          }
                                          if (r2 === null) {
                                            if (input.substr(pos, 5) === "while") {
                                              r2 = "while";
                                              pos += 5;
                                            } else {
                                              r2 = null;
                                              if (reportFailures === 0) {
                                                matchFailed("\"while\"");
                                              }
                                            }
                                            if (r2 === null) {
                                              if (input.substr(pos, 2) === "do") {
                                                r2 = "do";
                                                pos += 2;
                                              } else {
                                                r2 = null;
                                                if (reportFailures === 0) {
                                                  matchFailed("\"do\"");
                                                }
                                              }
                                              if (r2 === null) {
                                                if (input.substr(pos, 3) === "try") {
                                                  r2 = "try";
                                                  pos += 3;
                                                } else {
                                                  r2 = null;
                                                  if (reportFailures === 0) {
                                                    matchFailed("\"try\"");
                                                  }
                                                }
                                                if (r2 === null) {
                                                  if (input.substr(pos, 5) === "catch") {
                                                    r2 = "catch";
                                                    pos += 5;
                                                  } else {
                                                    r2 = null;
                                                    if (reportFailures === 0) {
                                                      matchFailed("\"catch\"");
                                                    }
                                                  }
                                                  if (r2 === null) {
                                                    if (input.substr(pos, 7) === "finally") {
                                                      r2 = "finally";
                                                      pos += 7;
                                                    } else {
                                                      r2 = null;
                                                      if (reportFailures === 0) {
                                                        matchFailed("\"finally\"");
                                                      }
                                                    }
                                                    if (r2 === null) {
                                                      if (input.substr(pos, 5) === "class") {
                                                        r2 = "class";
                                                        pos += 5;
                                                      } else {
                                                        r2 = null;
                                                        if (reportFailures === 0) {
                                                          matchFailed("\"class\"");
                                                        }
                                                      }
                                                      if (r2 === null) {
                                                        if (input.substr(pos, 7) === "extends") {
                                                          r2 = "extends";
                                                          pos += 7;
                                                        } else {
                                                          r2 = null;
                                                          if (reportFailures === 0) {
                                                            matchFailed("\"extends\"");
                                                          }
                                                        }
                                                        if (r2 === null) {
                                                          if (input.substr(pos, 5) === "super") {
                                                            r2 = "super";
                                                            pos += 5;
                                                          } else {
                                                            r2 = null;
                                                            if (reportFailures === 0) {
                                                              matchFailed("\"super\"");
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        if (r2 !== null) {
          r4 = pos;
          reportFailures++;
          r3 = parse_identifierPart();
          reportFailures--;
          if (r3 === null) {
            r3 = "";
          } else {
            r3 = null;
            pos = r4;
          }
          if (r3 !== null) {
            r0 = [r2, r3];
          } else {
            r0 = null;
            pos = r1;
          }
        } else {
          r0 = null;
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_JSKeywords() {
        var cacheKey = "JSKeywords@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        if (input.substr(pos, 4) === "case") {
          r2 = "case";
          pos += 4;
        } else {
          r2 = null;
          if (reportFailures === 0) {
            matchFailed("\"case\"");
          }
        }
        if (r2 === null) {
          if (input.substr(pos, 7) === "default") {
            r2 = "default";
            pos += 7;
          } else {
            r2 = null;
            if (reportFailures === 0) {
              matchFailed("\"default\"");
            }
          }
          if (r2 === null) {
            if (input.substr(pos, 8) === "function") {
              r2 = "function";
              pos += 8;
            } else {
              r2 = null;
              if (reportFailures === 0) {
                matchFailed("\"function\"");
              }
            }
            if (r2 === null) {
              if (input.substr(pos, 3) === "var") {
                r2 = "var";
                pos += 3;
              } else {
                r2 = null;
                if (reportFailures === 0) {
                  matchFailed("\"var\"");
                }
              }
              if (r2 === null) {
                if (input.substr(pos, 4) === "void") {
                  r2 = "void";
                  pos += 4;
                } else {
                  r2 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"void\"");
                  }
                }
                if (r2 === null) {
                  if (input.substr(pos, 4) === "with") {
                    r2 = "with";
                    pos += 4;
                  } else {
                    r2 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"with\"");
                    }
                  }
                  if (r2 === null) {
                    if (input.substr(pos, 5) === "const") {
                      r2 = "const";
                      pos += 5;
                    } else {
                      r2 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"const\"");
                      }
                    }
                    if (r2 === null) {
                      if (input.substr(pos, 3) === "let") {
                        r2 = "let";
                        pos += 3;
                      } else {
                        r2 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"let\"");
                        }
                      }
                      if (r2 === null) {
                        if (input.substr(pos, 4) === "enum") {
                          r2 = "enum";
                          pos += 4;
                        } else {
                          r2 = null;
                          if (reportFailures === 0) {
                            matchFailed("\"enum\"");
                          }
                        }
                        if (r2 === null) {
                          if (input.substr(pos, 6) === "export") {
                            r2 = "export";
                            pos += 6;
                          } else {
                            r2 = null;
                            if (reportFailures === 0) {
                              matchFailed("\"export\"");
                            }
                          }
                          if (r2 === null) {
                            if (input.substr(pos, 6) === "import") {
                              r2 = "import";
                              pos += 6;
                            } else {
                              r2 = null;
                              if (reportFailures === 0) {
                                matchFailed("\"import\"");
                              }
                            }
                            if (r2 === null) {
                              if (input.substr(pos, 6) === "native") {
                                r2 = "native";
                                pos += 6;
                              } else {
                                r2 = null;
                                if (reportFailures === 0) {
                                  matchFailed("\"native\"");
                                }
                              }
                              if (r2 === null) {
                                if (input.substr(pos, 10) === "implements") {
                                  r2 = "implements";
                                  pos += 10;
                                } else {
                                  r2 = null;
                                  if (reportFailures === 0) {
                                    matchFailed("\"implements\"");
                                  }
                                }
                                if (r2 === null) {
                                  if (input.substr(pos, 9) === "interface") {
                                    r2 = "interface";
                                    pos += 9;
                                  } else {
                                    r2 = null;
                                    if (reportFailures === 0) {
                                      matchFailed("\"interface\"");
                                    }
                                  }
                                  if (r2 === null) {
                                    if (input.substr(pos, 7) === "package") {
                                      r2 = "package";
                                      pos += 7;
                                    } else {
                                      r2 = null;
                                      if (reportFailures === 0) {
                                        matchFailed("\"package\"");
                                      }
                                    }
                                    if (r2 === null) {
                                      if (input.substr(pos, 7) === "private") {
                                        r2 = "private";
                                        pos += 7;
                                      } else {
                                        r2 = null;
                                        if (reportFailures === 0) {
                                          matchFailed("\"private\"");
                                        }
                                      }
                                      if (r2 === null) {
                                        if (input.substr(pos, 9) === "protected") {
                                          r2 = "protected";
                                          pos += 9;
                                        } else {
                                          r2 = null;
                                          if (reportFailures === 0) {
                                            matchFailed("\"protected\"");
                                          }
                                        }
                                        if (r2 === null) {
                                          if (input.substr(pos, 6) === "public") {
                                            r2 = "public";
                                            pos += 6;
                                          } else {
                                            r2 = null;
                                            if (reportFailures === 0) {
                                              matchFailed("\"public\"");
                                            }
                                          }
                                          if (r2 === null) {
                                            if (input.substr(pos, 6) === "static") {
                                              r2 = "static";
                                              pos += 6;
                                            } else {
                                              r2 = null;
                                              if (reportFailures === 0) {
                                                matchFailed("\"static\"");
                                              }
                                            }
                                            if (r2 === null) {
                                              if (input.substr(pos, 5) === "yield") {
                                                r2 = "yield";
                                                pos += 5;
                                              } else {
                                                r2 = null;
                                                if (reportFailures === 0) {
                                                  matchFailed("\"yield\"");
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        if (r2 !== null) {
          r4 = pos;
          reportFailures++;
          r3 = parse_identifierPart();
          reportFailures--;
          if (r3 === null) {
            r3 = "";
          } else {
            r3 = null;
            pos = r4;
          }
          if (r3 !== null) {
            r0 = [r2, r3];
          } else {
            r0 = null;
            pos = r1;
          }
        } else {
          r0 = null;
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_CSKeywords() {
        var cacheKey = "CSKeywords@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        if (input.substr(pos, 9) === "undefined") {
          r2 = "undefined";
          pos += 9;
        } else {
          r2 = null;
          if (reportFailures === 0) {
            matchFailed("\"undefined\"");
          }
        }
        if (r2 === null) {
          if (input.substr(pos, 4) === "then") {
            r2 = "then";
            pos += 4;
          } else {
            r2 = null;
            if (reportFailures === 0) {
              matchFailed("\"then\"");
            }
          }
          if (r2 === null) {
            if (input.substr(pos, 6) === "unless") {
              r2 = "unless";
              pos += 6;
            } else {
              r2 = null;
              if (reportFailures === 0) {
                matchFailed("\"unless\"");
              }
            }
            if (r2 === null) {
              if (input.substr(pos, 5) === "until") {
                r2 = "until";
                pos += 5;
              } else {
                r2 = null;
                if (reportFailures === 0) {
                  matchFailed("\"until\"");
                }
              }
              if (r2 === null) {
                if (input.substr(pos, 4) === "loop") {
                  r2 = "loop";
                  pos += 4;
                } else {
                  r2 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"loop\"");
                  }
                }
                if (r2 === null) {
                  if (input.substr(pos, 3) === "off") {
                    r2 = "off";
                    pos += 3;
                  } else {
                    r2 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"off\"");
                    }
                  }
                  if (r2 === null) {
                    if (input.substr(pos, 2) === "by") {
                      r2 = "by";
                      pos += 2;
                    } else {
                      r2 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"by\"");
                      }
                    }
                    if (r2 === null) {
                      if (input.substr(pos, 4) === "when") {
                        r2 = "when";
                        pos += 4;
                      } else {
                        r2 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"when\"");
                        }
                      }
                      if (r2 === null) {
                        if (input.substr(pos, 3) === "and") {
                          r2 = "and";
                          pos += 3;
                        } else {
                          r2 = null;
                          if (reportFailures === 0) {
                            matchFailed("\"and\"");
                          }
                        }
                        if (r2 === null) {
                          if (input.substr(pos, 2) === "or") {
                            r2 = "or";
                            pos += 2;
                          } else {
                            r2 = null;
                            if (reportFailures === 0) {
                              matchFailed("\"or\"");
                            }
                          }
                          if (r2 === null) {
                            if (input.substr(pos, 4) === "isnt") {
                              r2 = "isnt";
                              pos += 4;
                            } else {
                              r2 = null;
                              if (reportFailures === 0) {
                                matchFailed("\"isnt\"");
                              }
                            }
                            if (r2 === null) {
                              if (input.substr(pos, 2) === "is") {
                                r2 = "is";
                                pos += 2;
                              } else {
                                r2 = null;
                                if (reportFailures === 0) {
                                  matchFailed("\"is\"");
                                }
                              }
                              if (r2 === null) {
                                if (input.substr(pos, 3) === "not") {
                                  r2 = "not";
                                  pos += 3;
                                } else {
                                  r2 = null;
                                  if (reportFailures === 0) {
                                    matchFailed("\"not\"");
                                  }
                                }
                                if (r2 === null) {
                                  if (input.substr(pos, 3) === "yes") {
                                    r2 = "yes";
                                    pos += 3;
                                  } else {
                                    r2 = null;
                                    if (reportFailures === 0) {
                                      matchFailed("\"yes\"");
                                    }
                                  }
                                  if (r2 === null) {
                                    if (input.substr(pos, 2) === "no") {
                                      r2 = "no";
                                      pos += 2;
                                    } else {
                                      r2 = null;
                                      if (reportFailures === 0) {
                                        matchFailed("\"no\"");
                                      }
                                    }
                                    if (r2 === null) {
                                      if (input.substr(pos, 2) === "on") {
                                        r2 = "on";
                                        pos += 2;
                                      } else {
                                        r2 = null;
                                        if (reportFailures === 0) {
                                          matchFailed("\"on\"");
                                        }
                                      }
                                      if (r2 === null) {
                                        if (input.substr(pos, 2) === "of") {
                                          r2 = "of";
                                          pos += 2;
                                        } else {
                                          r2 = null;
                                          if (reportFailures === 0) {
                                            matchFailed("\"of\"");
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        if (r2 !== null) {
          r4 = pos;
          reportFailures++;
          r3 = parse_identifierPart();
          reportFailures--;
          if (r3 === null) {
            r3 = "";
          } else {
            r3 = null;
            pos = r4;
          }
          if (r3 !== null) {
            r0 = [r2, r3];
          } else {
            r0 = null;
            pos = r1;
          }
        } else {
          r0 = null;
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_StandardPredefinedMacros() {
        var cacheKey = "StandardPredefinedMacros@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        if (input.substr(pos, 2) === "__") {
          r2 = "__";
          pos += 2;
        } else {
          r2 = null;
          if (reportFailures === 0) {
            matchFailed("\"__\"");
          }
        }
        if (r2 !== null) {
          if (input.substr(pos, 8) === "FILENAME") {
            r3 = "FILENAME";
            pos += 8;
          } else {
            r3 = null;
            if (reportFailures === 0) {
              matchFailed("\"FILENAME\"");
            }
          }
          if (r3 === null) {
            if (input.substr(pos, 4) === "LINE") {
              r3 = "LINE";
              pos += 4;
            } else {
              r3 = null;
              if (reportFailures === 0) {
                matchFailed("\"LINE\"");
              }
            }
            if (r3 === null) {
              if (input.substr(pos, 10) === "DATETIMEMS") {
                r3 = "DATETIMEMS";
                pos += 10;
              } else {
                r3 = null;
                if (reportFailures === 0) {
                  matchFailed("\"DATETIMEMS\"");
                }
              }
              if (r3 === null) {
                if (input.substr(pos, 4) === "DATE") {
                  r3 = "DATE";
                  pos += 4;
                } else {
                  r3 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"DATE\"");
                  }
                }
                if (r3 === null) {
                  if (input.substr(pos, 4) === "TIME") {
                    r3 = "TIME";
                    pos += 4;
                  } else {
                    r3 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"TIME\"");
                    }
                  }
                }
              }
            }
          }
          if (r3 !== null) {
            if (input.substr(pos, 2) === "__") {
              r4 = "__";
              pos += 2;
            } else {
              r4 = null;
              if (reportFailures === 0) {
                matchFailed("\"__\"");
              }
            }
            if (r4 !== null) {
              r0 = [r2, r3, r4];
            } else {
              r0 = null;
              pos = r1;
            }
          } else {
            r0 = null;
            pos = r1;
          }
        } else {
          r0 = null;
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_reserved() {
        var cacheKey = "reserved@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        r0 = parse_StandardPredefinedMacros();
        if (r0 === null) {
          r0 = parse_SharedKeywords();
          if (r0 === null) {
            r0 = parse_CSKeywords();
            if (r0 === null) {
              r0 = parse_JSKeywords();
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_UnicodeEscapeSequence() {
        var cacheKey = "UnicodeEscapeSequence@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 2) === "\\u") {
          r3 = "\\u";
          pos += 2;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"\\\\u\"");
          }
        }
        if (r3 !== null) {
          r4 = parse_hexDigit();
          if (r4 !== null) {
            r5 = parse_hexDigit();
            if (r5 !== null) {
              r6 = parse_hexDigit();
              if (r6 !== null) {
                r7 = parse_hexDigit();
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(h0, h1, h2, h3) { return String.fromCharCode(parseInt(h0 + h1 + h2 + h3, 16)); })(r4, r5, r6, r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_UnicodeLetter() {
        var cacheKey = "UnicodeLetter@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3;
        
        if (/^[A-Z\xC0-\xD6\xD8-\xDE\u0100\u0102\u0104\u0106\u0108\u010A\u010C\u010E\u0110\u0112\u0114\u0116\u0118\u011A\u011C\u011E\u0120\u0122\u0124\u0126\u0128\u012A\u012C\u012E\u0130\u0132\u0134\u0136\u0139\u013B\u013D\u013F\u0141\u0143\u0145\u0147\u014A\u014C\u014E\u0150\u0152\u0154\u0156\u0158\u015A\u015C\u015E\u0160\u0162\u0164\u0166\u0168\u016A\u016C\u016E\u0170\u0172\u0174\u0176\u0178\u0179\u017B\u017D\u0181\u0182\u0184\u0186\u0187\u0189-\u018B\u018E-\u0191\u0193\u0194\u0196-\u0198\u019C\u019D\u019F\u01A0\u01A2\u01A4\u01A6\u01A7\u01A9\u01AC\u01AE\u01AF\u01B1-\u01B3\u01B5\u01B7\u01B8\u01BC\u01C4\u01C7\u01CA\u01CD\u01CF\u01D1\u01D3\u01D5\u01D7\u01D9\u01DB\u01DE\u01E0\u01E2\u01E4\u01E6\u01E8\u01EA\u01EC\u01EE\u01F1\u01F4\u01F6-\u01F8\u01FA\u01FC\u01FE\u0200\u0202\u0204\u0206\u0208\u020A\u020C\u020E\u0210\u0212\u0214\u0216\u0218\u021A\u021C\u021E\u0220\u0222\u0224\u0226\u0228\u022A\u022C\u022E\u0230\u0232\u023A\u023B\u023D\u023E\u0241\u0243-\u0246\u0248\u024A\u024C\u024E\u0370\u0372\u0376\u0386\u0388-\u038A\u038C\u038E\u038F\u0391-\u03A1\u03A3-\u03AB\u03CF\u03D2-\u03D4\u03D8\u03DA\u03DC\u03DE\u03E0\u03E2\u03E4\u03E6\u03E8\u03EA\u03EC\u03EE\u03F4\u03F7\u03F9\u03FA\u03FD-\u042F\u0460\u0462\u0464\u0466\u0468\u046A\u046C\u046E\u0470\u0472\u0474\u0476\u0478\u047A\u047C\u047E\u0480\u048A\u048C\u048E\u0490\u0492\u0494\u0496\u0498\u049A\u049C\u049E\u04A0\u04A2\u04A4\u04A6\u04A8\u04AA\u04AC\u04AE\u04B0\u04B2\u04B4\u04B6\u04B8\u04BA\u04BC\u04BE\u04C0\u04C1\u04C3\u04C5\u04C7\u04C9\u04CB\u04CD\u04D0\u04D2\u04D4\u04D6\u04D8\u04DA\u04DC\u04DE\u04E0\u04E2\u04E4\u04E6\u04E8\u04EA\u04EC\u04EE\u04F0\u04F2\u04F4\u04F6\u04F8\u04FA\u04FC\u04FE\u0500\u0502\u0504\u0506\u0508\u050A\u050C\u050E\u0510\u0512\u0514\u0516\u0518\u051A\u051C\u051E\u0520\u0522\u0524\u0526\u0531-\u0556\u10A0-\u10C5\u1E00\u1E02\u1E04\u1E06\u1E08\u1E0A\u1E0C\u1E0E\u1E10\u1E12\u1E14\u1E16\u1E18\u1E1A\u1E1C\u1E1E\u1E20\u1E22\u1E24\u1E26\u1E28\u1E2A\u1E2C\u1E2E\u1E30\u1E32\u1E34\u1E36\u1E38\u1E3A\u1E3C\u1E3E\u1E40\u1E42\u1E44\u1E46\u1E48\u1E4A\u1E4C\u1E4E\u1E50\u1E52\u1E54\u1E56\u1E58\u1E5A\u1E5C\u1E5E\u1E60\u1E62\u1E64\u1E66\u1E68\u1E6A\u1E6C\u1E6E\u1E70\u1E72\u1E74\u1E76\u1E78\u1E7A\u1E7C\u1E7E\u1E80\u1E82\u1E84\u1E86\u1E88\u1E8A\u1E8C\u1E8E\u1E90\u1E92\u1E94\u1E9E\u1EA0\u1EA2\u1EA4\u1EA6\u1EA8\u1EAA\u1EAC\u1EAE\u1EB0\u1EB2\u1EB4\u1EB6\u1EB8\u1EBA\u1EBC\u1EBE\u1EC0\u1EC2\u1EC4\u1EC6\u1EC8\u1ECA\u1ECC\u1ECE\u1ED0\u1ED2\u1ED4\u1ED6\u1ED8\u1EDA\u1EDC\u1EDE\u1EE0\u1EE2\u1EE4\u1EE6\u1EE8\u1EEA\u1EEC\u1EEE\u1EF0\u1EF2\u1EF4\u1EF6\u1EF8\u1EFA\u1EFC\u1EFE\u1F08-\u1F0F\u1F18-\u1F1D\u1F28-\u1F2F\u1F38-\u1F3F\u1F48-\u1F4D\u1F59\u1F5B\u1F5D\u1F5F\u1F68-\u1F6F\u1FB8-\u1FBB\u1FC8-\u1FCB\u1FD8-\u1FDB\u1FE8-\u1FEC\u1FF8-\u1FFB\u2102\u2107\u210B-\u210D\u2110-\u2112\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u2130-\u2133\u213E\u213F\u2145\u2183\u2C00-\u2C2E\u2C60\u2C62-\u2C64\u2C67\u2C69\u2C6B\u2C6D-\u2C70\u2C72\u2C75\u2C7E-\u2C80\u2C82\u2C84\u2C86\u2C88\u2C8A\u2C8C\u2C8E\u2C90\u2C92\u2C94\u2C96\u2C98\u2C9A\u2C9C\u2C9E\u2CA0\u2CA2\u2CA4\u2CA6\u2CA8\u2CAA\u2CAC\u2CAE\u2CB0\u2CB2\u2CB4\u2CB6\u2CB8\u2CBA\u2CBC\u2CBE\u2CC0\u2CC2\u2CC4\u2CC6\u2CC8\u2CCA\u2CCC\u2CCE\u2CD0\u2CD2\u2CD4\u2CD6\u2CD8\u2CDA\u2CDC\u2CDE\u2CE0\u2CE2\u2CEB\u2CED\uA640\uA642\uA644\uA646\uA648\uA64A\uA64C\uA64E\uA650\uA652\uA654\uA656\uA658\uA65A\uA65C\uA65E\uA660\uA662\uA664\uA666\uA668\uA66A\uA66C\uA680\uA682\uA684\uA686\uA688\uA68A\uA68C\uA68E\uA690\uA692\uA694\uA696\uA722\uA724\uA726\uA728\uA72A\uA72C\uA72E\uA732\uA734\uA736\uA738\uA73A\uA73C\uA73E\uA740\uA742\uA744\uA746\uA748\uA74A\uA74C\uA74E\uA750\uA752\uA754\uA756\uA758\uA75A\uA75C\uA75E\uA760\uA762\uA764\uA766\uA768\uA76A\uA76C\uA76E\uA779\uA77B\uA77D\uA77E\uA780\uA782\uA784\uA786\uA78B\uA78D\uA790\uA7A0\uA7A2\uA7A4\uA7A6\uA7A8\uFF21-\uFF3Aa-z\xAA\xB5\xBA\xDF-\xF6\xF8-\xFF\u0101\u0103\u0105\u0107\u0109\u010B\u010D\u010F\u0111\u0113\u0115\u0117\u0119\u011B\u011D\u011F\u0121\u0123\u0125\u0127\u0129\u012B\u012D\u012F\u0131\u0133\u0135\u0137\u0138\u013A\u013C\u013E\u0140\u0142\u0144\u0146\u0148\u0149\u014B\u014D\u014F\u0151\u0153\u0155\u0157\u0159\u015B\u015D\u015F\u0161\u0163\u0165\u0167\u0169\u016B\u016D\u016F\u0171\u0173\u0175\u0177\u017A\u017C\u017E-\u0180\u0183\u0185\u0188\u018C\u018D\u0192\u0195\u0199-\u019B\u019E\u01A1\u01A3\u01A5\u01A8\u01AA\u01AB\u01AD\u01B0\u01B4\u01B6\u01B9\u01BA\u01BD-\u01BF\u01C6\u01C9\u01CC\u01CE\u01D0\u01D2\u01D4\u01D6\u01D8\u01DA\u01DC\u01DD\u01DF\u01E1\u01E3\u01E5\u01E7\u01E9\u01EB\u01ED\u01EF\u01F0\u01F3\u01F5\u01F9\u01FB\u01FD\u01FF\u0201\u0203\u0205\u0207\u0209\u020B\u020D\u020F\u0211\u0213\u0215\u0217\u0219\u021B\u021D\u021F\u0221\u0223\u0225\u0227\u0229\u022B\u022D\u022F\u0231\u0233-\u0239\u023C\u023F\u0240\u0242\u0247\u0249\u024B\u024D\u024F-\u0293\u0295-\u02AF\u0371\u0373\u0377\u037B-\u037D\u0390\u03AC-\u03CE\u03D0\u03D1\u03D5-\u03D7\u03D9\u03DB\u03DD\u03DF\u03E1\u03E3\u03E5\u03E7\u03E9\u03EB\u03ED\u03EF-\u03F3\u03F5\u03F8\u03FB\u03FC\u0430-\u045F\u0461\u0463\u0465\u0467\u0469\u046B\u046D\u046F\u0471\u0473\u0475\u0477\u0479\u047B\u047D\u047F\u0481\u048B\u048D\u048F\u0491\u0493\u0495\u0497\u0499\u049B\u049D\u049F\u04A1\u04A3\u04A5\u04A7\u04A9\u04AB\u04AD\u04AF\u04B1\u04B3\u04B5\u04B7\u04B9\u04BB\u04BD\u04BF\u04C2\u04C4\u04C6\u04C8\u04CA\u04CC\u04CE\u04CF\u04D1\u04D3\u04D5\u04D7\u04D9\u04DB\u04DD\u04DF\u04E1\u04E3\u04E5\u04E7\u04E9\u04EB\u04ED\u04EF\u04F1\u04F3\u04F5\u04F7\u04F9\u04FB\u04FD\u04FF\u0501\u0503\u0505\u0507\u0509\u050B\u050D\u050F\u0511\u0513\u0515\u0517\u0519\u051B\u051D\u051F\u0521\u0523\u0525\u0527\u0561-\u0587\u1D00-\u1D2B\u1D62-\u1D77\u1D79-\u1D9A\u1E01\u1E03\u1E05\u1E07\u1E09\u1E0B\u1E0D\u1E0F\u1E11\u1E13\u1E15\u1E17\u1E19\u1E1B\u1E1D\u1E1F\u1E21\u1E23\u1E25\u1E27\u1E29\u1E2B\u1E2D\u1E2F\u1E31\u1E33\u1E35\u1E37\u1E39\u1E3B\u1E3D\u1E3F\u1E41\u1E43\u1E45\u1E47\u1E49\u1E4B\u1E4D\u1E4F\u1E51\u1E53\u1E55\u1E57\u1E59\u1E5B\u1E5D\u1E5F\u1E61\u1E63\u1E65\u1E67\u1E69\u1E6B\u1E6D\u1E6F\u1E71\u1E73\u1E75\u1E77\u1E79\u1E7B\u1E7D\u1E7F\u1E81\u1E83\u1E85\u1E87\u1E89\u1E8B\u1E8D\u1E8F\u1E91\u1E93\u1E95-\u1E9D\u1E9F\u1EA1\u1EA3\u1EA5\u1EA7\u1EA9\u1EAB\u1EAD\u1EAF\u1EB1\u1EB3\u1EB5\u1EB7\u1EB9\u1EBB\u1EBD\u1EBF\u1EC1\u1EC3\u1EC5\u1EC7\u1EC9\u1ECB\u1ECD\u1ECF\u1ED1\u1ED3\u1ED5\u1ED7\u1ED9\u1EDB\u1EDD\u1EDF\u1EE1\u1EE3\u1EE5\u1EE7\u1EE9\u1EEB\u1EED\u1EEF\u1EF1\u1EF3\u1EF5\u1EF7\u1EF9\u1EFB\u1EFD\u1EFF-\u1F07\u1F10-\u1F15\u1F20-\u1F27\u1F30-\u1F37\u1F40-\u1F45\u1F50-\u1F57\u1F60-\u1F67\u1F70-\u1F7D\u1F80-\u1F87\u1F90-\u1F97\u1FA0-\u1FA7\u1FB0-\u1FB4\u1FB6\u1FB7\u1FBE\u1FC2-\u1FC4\u1FC6\u1FC7\u1FD0-\u1FD3\u1FD6\u1FD7\u1FE0-\u1FE7\u1FF2-\u1FF4\u1FF6\u1FF7\u210A\u210E\u210F\u2113\u212F\u2134\u2139\u213C\u213D\u2146-\u2149\u214E\u2184\u2C30-\u2C5E\u2C61\u2C65\u2C66\u2C68\u2C6A\u2C6C\u2C71\u2C73\u2C74\u2C76-\u2C7C\u2C81\u2C83\u2C85\u2C87\u2C89\u2C8B\u2C8D\u2C8F\u2C91\u2C93\u2C95\u2C97\u2C99\u2C9B\u2C9D\u2C9F\u2CA1\u2CA3\u2CA5\u2CA7\u2CA9\u2CAB\u2CAD\u2CAF\u2CB1\u2CB3\u2CB5\u2CB7\u2CB9\u2CBB\u2CBD\u2CBF\u2CC1\u2CC3\u2CC5\u2CC7\u2CC9\u2CCB\u2CCD\u2CCF\u2CD1\u2CD3\u2CD5\u2CD7\u2CD9\u2CDB\u2CDD\u2CDF\u2CE1\u2CE3\u2CE4\u2CEC\u2CEE\u2D00-\u2D25\uA641\uA643\uA645\uA647\uA649\uA64B\uA64D\uA64F\uA651\uA653\uA655\uA657\uA659\uA65B\uA65D\uA65F\uA661\uA663\uA665\uA667\uA669\uA66B\uA66D\uA681\uA683\uA685\uA687\uA689\uA68B\uA68D\uA68F\uA691\uA693\uA695\uA697\uA723\uA725\uA727\uA729\uA72B\uA72D\uA72F-\uA731\uA733\uA735\uA737\uA739\uA73B\uA73D\uA73F\uA741\uA743\uA745\uA747\uA749\uA74B\uA74D\uA74F\uA751\uA753\uA755\uA757\uA759\uA75B\uA75D\uA75F\uA761\uA763\uA765\uA767\uA769\uA76B\uA76D\uA76F\uA771-\uA778\uA77A\uA77C\uA77F\uA781\uA783\uA785\uA787\uA78C\uA78E\uA791\uA7A1\uA7A3\uA7A5\uA7A7\uA7A9\uA7FA\uFB00-\uFB06\uFB13-\uFB17\uFF41-\uFF5A\u01C5\u01C8\u01CB\u01F2\u1F88-\u1F8F\u1F98-\u1F9F\u1FA8-\u1FAF\u1FBC\u1FCC\u1FFC\u02B0-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0374\u037A\u0559\u0640\u06E5\u06E6\u07F4\u07F5\u07FA\u081A\u0824\u0828\u0971\u0E46\u0EC6\u10FC\u17D7\u1843\u1AA7\u1C78-\u1C7D\u1D2C-\u1D61\u1D78\u1D9B-\u1DBF\u2071\u207F\u2090-\u209C\u2C7D\u2D6F\u2E2F\u3005\u3031-\u3035\u303B\u309D\u309E\u30FC-\u30FE\uA015\uA4F8-\uA4FD\uA60C\uA67F\uA717-\uA71F\uA770\uA788\uA9CF\uAA70\uAADD\uFF70\uFF9E\uFF9F\u01BB\u01C0-\u01C3\u0294\u05D0-\u05EA\u05F0-\u05F2\u0620-\u063F\u0641-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u0800-\u0815\u0840-\u0858\u0904-\u0939\u093D\u0950\u0958-\u0961\u0972-\u0977\u0979-\u097F\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E45\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EDC\u0EDD\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10D0-\u10FA\u1100-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17DC\u1820-\u1842\u1844-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191C\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16\u1A20-\u1A54\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BC0-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C77\u1CE9-\u1CEC\u1CEE-\u1CF1\u2135-\u2138\u2D30-\u2D65\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u3006\u303C\u3041-\u3096\u309F\u30A1-\u30FA\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400\u4DB5\u4E00\u9FCB\uA000-\uA014\uA016-\uA48C\uA4D0-\uA4F7\uA500-\uA60B\uA610-\uA61F\uA62A\uA62B\uA66E\uA6A0-\uA6E5\uA7FB-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA6F\uAA71-\uAA76\uAA7A\uAA80-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB\uAADC\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uABC0-\uABE2\uAC00\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA2D\uFA30-\uFA6D\uFA70-\uFAD9\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF66-\uFF6F\uFF71-\uFF9D\uFFA0-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC\u16EE-\u16F0\u2160-\u2182\u2185-\u2188\u3007\u3021-\u3029\u3038-\u303A\uA6E6-\uA6EF]/.test(input.charAt(pos))) {
          r0 = input.charAt(pos);
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("[A-Z\\xC0-\\xD6\\xD8-\\xDE\\u0100\\u0102\\u0104\\u0106\\u0108\\u010A\\u010C\\u010E\\u0110\\u0112\\u0114\\u0116\\u0118\\u011A\\u011C\\u011E\\u0120\\u0122\\u0124\\u0126\\u0128\\u012A\\u012C\\u012E\\u0130\\u0132\\u0134\\u0136\\u0139\\u013B\\u013D\\u013F\\u0141\\u0143\\u0145\\u0147\\u014A\\u014C\\u014E\\u0150\\u0152\\u0154\\u0156\\u0158\\u015A\\u015C\\u015E\\u0160\\u0162\\u0164\\u0166\\u0168\\u016A\\u016C\\u016E\\u0170\\u0172\\u0174\\u0176\\u0178\\u0179\\u017B\\u017D\\u0181\\u0182\\u0184\\u0186\\u0187\\u0189-\\u018B\\u018E-\\u0191\\u0193\\u0194\\u0196-\\u0198\\u019C\\u019D\\u019F\\u01A0\\u01A2\\u01A4\\u01A6\\u01A7\\u01A9\\u01AC\\u01AE\\u01AF\\u01B1-\\u01B3\\u01B5\\u01B7\\u01B8\\u01BC\\u01C4\\u01C7\\u01CA\\u01CD\\u01CF\\u01D1\\u01D3\\u01D5\\u01D7\\u01D9\\u01DB\\u01DE\\u01E0\\u01E2\\u01E4\\u01E6\\u01E8\\u01EA\\u01EC\\u01EE\\u01F1\\u01F4\\u01F6-\\u01F8\\u01FA\\u01FC\\u01FE\\u0200\\u0202\\u0204\\u0206\\u0208\\u020A\\u020C\\u020E\\u0210\\u0212\\u0214\\u0216\\u0218\\u021A\\u021C\\u021E\\u0220\\u0222\\u0224\\u0226\\u0228\\u022A\\u022C\\u022E\\u0230\\u0232\\u023A\\u023B\\u023D\\u023E\\u0241\\u0243-\\u0246\\u0248\\u024A\\u024C\\u024E\\u0370\\u0372\\u0376\\u0386\\u0388-\\u038A\\u038C\\u038E\\u038F\\u0391-\\u03A1\\u03A3-\\u03AB\\u03CF\\u03D2-\\u03D4\\u03D8\\u03DA\\u03DC\\u03DE\\u03E0\\u03E2\\u03E4\\u03E6\\u03E8\\u03EA\\u03EC\\u03EE\\u03F4\\u03F7\\u03F9\\u03FA\\u03FD-\\u042F\\u0460\\u0462\\u0464\\u0466\\u0468\\u046A\\u046C\\u046E\\u0470\\u0472\\u0474\\u0476\\u0478\\u047A\\u047C\\u047E\\u0480\\u048A\\u048C\\u048E\\u0490\\u0492\\u0494\\u0496\\u0498\\u049A\\u049C\\u049E\\u04A0\\u04A2\\u04A4\\u04A6\\u04A8\\u04AA\\u04AC\\u04AE\\u04B0\\u04B2\\u04B4\\u04B6\\u04B8\\u04BA\\u04BC\\u04BE\\u04C0\\u04C1\\u04C3\\u04C5\\u04C7\\u04C9\\u04CB\\u04CD\\u04D0\\u04D2\\u04D4\\u04D6\\u04D8\\u04DA\\u04DC\\u04DE\\u04E0\\u04E2\\u04E4\\u04E6\\u04E8\\u04EA\\u04EC\\u04EE\\u04F0\\u04F2\\u04F4\\u04F6\\u04F8\\u04FA\\u04FC\\u04FE\\u0500\\u0502\\u0504\\u0506\\u0508\\u050A\\u050C\\u050E\\u0510\\u0512\\u0514\\u0516\\u0518\\u051A\\u051C\\u051E\\u0520\\u0522\\u0524\\u0526\\u0531-\\u0556\\u10A0-\\u10C5\\u1E00\\u1E02\\u1E04\\u1E06\\u1E08\\u1E0A\\u1E0C\\u1E0E\\u1E10\\u1E12\\u1E14\\u1E16\\u1E18\\u1E1A\\u1E1C\\u1E1E\\u1E20\\u1E22\\u1E24\\u1E26\\u1E28\\u1E2A\\u1E2C\\u1E2E\\u1E30\\u1E32\\u1E34\\u1E36\\u1E38\\u1E3A\\u1E3C\\u1E3E\\u1E40\\u1E42\\u1E44\\u1E46\\u1E48\\u1E4A\\u1E4C\\u1E4E\\u1E50\\u1E52\\u1E54\\u1E56\\u1E58\\u1E5A\\u1E5C\\u1E5E\\u1E60\\u1E62\\u1E64\\u1E66\\u1E68\\u1E6A\\u1E6C\\u1E6E\\u1E70\\u1E72\\u1E74\\u1E76\\u1E78\\u1E7A\\u1E7C\\u1E7E\\u1E80\\u1E82\\u1E84\\u1E86\\u1E88\\u1E8A\\u1E8C\\u1E8E\\u1E90\\u1E92\\u1E94\\u1E9E\\u1EA0\\u1EA2\\u1EA4\\u1EA6\\u1EA8\\u1EAA\\u1EAC\\u1EAE\\u1EB0\\u1EB2\\u1EB4\\u1EB6\\u1EB8\\u1EBA\\u1EBC\\u1EBE\\u1EC0\\u1EC2\\u1EC4\\u1EC6\\u1EC8\\u1ECA\\u1ECC\\u1ECE\\u1ED0\\u1ED2\\u1ED4\\u1ED6\\u1ED8\\u1EDA\\u1EDC\\u1EDE\\u1EE0\\u1EE2\\u1EE4\\u1EE6\\u1EE8\\u1EEA\\u1EEC\\u1EEE\\u1EF0\\u1EF2\\u1EF4\\u1EF6\\u1EF8\\u1EFA\\u1EFC\\u1EFE\\u1F08-\\u1F0F\\u1F18-\\u1F1D\\u1F28-\\u1F2F\\u1F38-\\u1F3F\\u1F48-\\u1F4D\\u1F59\\u1F5B\\u1F5D\\u1F5F\\u1F68-\\u1F6F\\u1FB8-\\u1FBB\\u1FC8-\\u1FCB\\u1FD8-\\u1FDB\\u1FE8-\\u1FEC\\u1FF8-\\u1FFB\\u2102\\u2107\\u210B-\\u210D\\u2110-\\u2112\\u2115\\u2119-\\u211D\\u2124\\u2126\\u2128\\u212A-\\u212D\\u2130-\\u2133\\u213E\\u213F\\u2145\\u2183\\u2C00-\\u2C2E\\u2C60\\u2C62-\\u2C64\\u2C67\\u2C69\\u2C6B\\u2C6D-\\u2C70\\u2C72\\u2C75\\u2C7E-\\u2C80\\u2C82\\u2C84\\u2C86\\u2C88\\u2C8A\\u2C8C\\u2C8E\\u2C90\\u2C92\\u2C94\\u2C96\\u2C98\\u2C9A\\u2C9C\\u2C9E\\u2CA0\\u2CA2\\u2CA4\\u2CA6\\u2CA8\\u2CAA\\u2CAC\\u2CAE\\u2CB0\\u2CB2\\u2CB4\\u2CB6\\u2CB8\\u2CBA\\u2CBC\\u2CBE\\u2CC0\\u2CC2\\u2CC4\\u2CC6\\u2CC8\\u2CCA\\u2CCC\\u2CCE\\u2CD0\\u2CD2\\u2CD4\\u2CD6\\u2CD8\\u2CDA\\u2CDC\\u2CDE\\u2CE0\\u2CE2\\u2CEB\\u2CED\\uA640\\uA642\\uA644\\uA646\\uA648\\uA64A\\uA64C\\uA64E\\uA650\\uA652\\uA654\\uA656\\uA658\\uA65A\\uA65C\\uA65E\\uA660\\uA662\\uA664\\uA666\\uA668\\uA66A\\uA66C\\uA680\\uA682\\uA684\\uA686\\uA688\\uA68A\\uA68C\\uA68E\\uA690\\uA692\\uA694\\uA696\\uA722\\uA724\\uA726\\uA728\\uA72A\\uA72C\\uA72E\\uA732\\uA734\\uA736\\uA738\\uA73A\\uA73C\\uA73E\\uA740\\uA742\\uA744\\uA746\\uA748\\uA74A\\uA74C\\uA74E\\uA750\\uA752\\uA754\\uA756\\uA758\\uA75A\\uA75C\\uA75E\\uA760\\uA762\\uA764\\uA766\\uA768\\uA76A\\uA76C\\uA76E\\uA779\\uA77B\\uA77D\\uA77E\\uA780\\uA782\\uA784\\uA786\\uA78B\\uA78D\\uA790\\uA7A0\\uA7A2\\uA7A4\\uA7A6\\uA7A8\\uFF21-\\uFF3Aa-z\\xAA\\xB5\\xBA\\xDF-\\xF6\\xF8-\\xFF\\u0101\\u0103\\u0105\\u0107\\u0109\\u010B\\u010D\\u010F\\u0111\\u0113\\u0115\\u0117\\u0119\\u011B\\u011D\\u011F\\u0121\\u0123\\u0125\\u0127\\u0129\\u012B\\u012D\\u012F\\u0131\\u0133\\u0135\\u0137\\u0138\\u013A\\u013C\\u013E\\u0140\\u0142\\u0144\\u0146\\u0148\\u0149\\u014B\\u014D\\u014F\\u0151\\u0153\\u0155\\u0157\\u0159\\u015B\\u015D\\u015F\\u0161\\u0163\\u0165\\u0167\\u0169\\u016B\\u016D\\u016F\\u0171\\u0173\\u0175\\u0177\\u017A\\u017C\\u017E-\\u0180\\u0183\\u0185\\u0188\\u018C\\u018D\\u0192\\u0195\\u0199-\\u019B\\u019E\\u01A1\\u01A3\\u01A5\\u01A8\\u01AA\\u01AB\\u01AD\\u01B0\\u01B4\\u01B6\\u01B9\\u01BA\\u01BD-\\u01BF\\u01C6\\u01C9\\u01CC\\u01CE\\u01D0\\u01D2\\u01D4\\u01D6\\u01D8\\u01DA\\u01DC\\u01DD\\u01DF\\u01E1\\u01E3\\u01E5\\u01E7\\u01E9\\u01EB\\u01ED\\u01EF\\u01F0\\u01F3\\u01F5\\u01F9\\u01FB\\u01FD\\u01FF\\u0201\\u0203\\u0205\\u0207\\u0209\\u020B\\u020D\\u020F\\u0211\\u0213\\u0215\\u0217\\u0219\\u021B\\u021D\\u021F\\u0221\\u0223\\u0225\\u0227\\u0229\\u022B\\u022D\\u022F\\u0231\\u0233-\\u0239\\u023C\\u023F\\u0240\\u0242\\u0247\\u0249\\u024B\\u024D\\u024F-\\u0293\\u0295-\\u02AF\\u0371\\u0373\\u0377\\u037B-\\u037D\\u0390\\u03AC-\\u03CE\\u03D0\\u03D1\\u03D5-\\u03D7\\u03D9\\u03DB\\u03DD\\u03DF\\u03E1\\u03E3\\u03E5\\u03E7\\u03E9\\u03EB\\u03ED\\u03EF-\\u03F3\\u03F5\\u03F8\\u03FB\\u03FC\\u0430-\\u045F\\u0461\\u0463\\u0465\\u0467\\u0469\\u046B\\u046D\\u046F\\u0471\\u0473\\u0475\\u0477\\u0479\\u047B\\u047D\\u047F\\u0481\\u048B\\u048D\\u048F\\u0491\\u0493\\u0495\\u0497\\u0499\\u049B\\u049D\\u049F\\u04A1\\u04A3\\u04A5\\u04A7\\u04A9\\u04AB\\u04AD\\u04AF\\u04B1\\u04B3\\u04B5\\u04B7\\u04B9\\u04BB\\u04BD\\u04BF\\u04C2\\u04C4\\u04C6\\u04C8\\u04CA\\u04CC\\u04CE\\u04CF\\u04D1\\u04D3\\u04D5\\u04D7\\u04D9\\u04DB\\u04DD\\u04DF\\u04E1\\u04E3\\u04E5\\u04E7\\u04E9\\u04EB\\u04ED\\u04EF\\u04F1\\u04F3\\u04F5\\u04F7\\u04F9\\u04FB\\u04FD\\u04FF\\u0501\\u0503\\u0505\\u0507\\u0509\\u050B\\u050D\\u050F\\u0511\\u0513\\u0515\\u0517\\u0519\\u051B\\u051D\\u051F\\u0521\\u0523\\u0525\\u0527\\u0561-\\u0587\\u1D00-\\u1D2B\\u1D62-\\u1D77\\u1D79-\\u1D9A\\u1E01\\u1E03\\u1E05\\u1E07\\u1E09\\u1E0B\\u1E0D\\u1E0F\\u1E11\\u1E13\\u1E15\\u1E17\\u1E19\\u1E1B\\u1E1D\\u1E1F\\u1E21\\u1E23\\u1E25\\u1E27\\u1E29\\u1E2B\\u1E2D\\u1E2F\\u1E31\\u1E33\\u1E35\\u1E37\\u1E39\\u1E3B\\u1E3D\\u1E3F\\u1E41\\u1E43\\u1E45\\u1E47\\u1E49\\u1E4B\\u1E4D\\u1E4F\\u1E51\\u1E53\\u1E55\\u1E57\\u1E59\\u1E5B\\u1E5D\\u1E5F\\u1E61\\u1E63\\u1E65\\u1E67\\u1E69\\u1E6B\\u1E6D\\u1E6F\\u1E71\\u1E73\\u1E75\\u1E77\\u1E79\\u1E7B\\u1E7D\\u1E7F\\u1E81\\u1E83\\u1E85\\u1E87\\u1E89\\u1E8B\\u1E8D\\u1E8F\\u1E91\\u1E93\\u1E95-\\u1E9D\\u1E9F\\u1EA1\\u1EA3\\u1EA5\\u1EA7\\u1EA9\\u1EAB\\u1EAD\\u1EAF\\u1EB1\\u1EB3\\u1EB5\\u1EB7\\u1EB9\\u1EBB\\u1EBD\\u1EBF\\u1EC1\\u1EC3\\u1EC5\\u1EC7\\u1EC9\\u1ECB\\u1ECD\\u1ECF\\u1ED1\\u1ED3\\u1ED5\\u1ED7\\u1ED9\\u1EDB\\u1EDD\\u1EDF\\u1EE1\\u1EE3\\u1EE5\\u1EE7\\u1EE9\\u1EEB\\u1EED\\u1EEF\\u1EF1\\u1EF3\\u1EF5\\u1EF7\\u1EF9\\u1EFB\\u1EFD\\u1EFF-\\u1F07\\u1F10-\\u1F15\\u1F20-\\u1F27\\u1F30-\\u1F37\\u1F40-\\u1F45\\u1F50-\\u1F57\\u1F60-\\u1F67\\u1F70-\\u1F7D\\u1F80-\\u1F87\\u1F90-\\u1F97\\u1FA0-\\u1FA7\\u1FB0-\\u1FB4\\u1FB6\\u1FB7\\u1FBE\\u1FC2-\\u1FC4\\u1FC6\\u1FC7\\u1FD0-\\u1FD3\\u1FD6\\u1FD7\\u1FE0-\\u1FE7\\u1FF2-\\u1FF4\\u1FF6\\u1FF7\\u210A\\u210E\\u210F\\u2113\\u212F\\u2134\\u2139\\u213C\\u213D\\u2146-\\u2149\\u214E\\u2184\\u2C30-\\u2C5E\\u2C61\\u2C65\\u2C66\\u2C68\\u2C6A\\u2C6C\\u2C71\\u2C73\\u2C74\\u2C76-\\u2C7C\\u2C81\\u2C83\\u2C85\\u2C87\\u2C89\\u2C8B\\u2C8D\\u2C8F\\u2C91\\u2C93\\u2C95\\u2C97\\u2C99\\u2C9B\\u2C9D\\u2C9F\\u2CA1\\u2CA3\\u2CA5\\u2CA7\\u2CA9\\u2CAB\\u2CAD\\u2CAF\\u2CB1\\u2CB3\\u2CB5\\u2CB7\\u2CB9\\u2CBB\\u2CBD\\u2CBF\\u2CC1\\u2CC3\\u2CC5\\u2CC7\\u2CC9\\u2CCB\\u2CCD\\u2CCF\\u2CD1\\u2CD3\\u2CD5\\u2CD7\\u2CD9\\u2CDB\\u2CDD\\u2CDF\\u2CE1\\u2CE3\\u2CE4\\u2CEC\\u2CEE\\u2D00-\\u2D25\\uA641\\uA643\\uA645\\uA647\\uA649\\uA64B\\uA64D\\uA64F\\uA651\\uA653\\uA655\\uA657\\uA659\\uA65B\\uA65D\\uA65F\\uA661\\uA663\\uA665\\uA667\\uA669\\uA66B\\uA66D\\uA681\\uA683\\uA685\\uA687\\uA689\\uA68B\\uA68D\\uA68F\\uA691\\uA693\\uA695\\uA697\\uA723\\uA725\\uA727\\uA729\\uA72B\\uA72D\\uA72F-\\uA731\\uA733\\uA735\\uA737\\uA739\\uA73B\\uA73D\\uA73F\\uA741\\uA743\\uA745\\uA747\\uA749\\uA74B\\uA74D\\uA74F\\uA751\\uA753\\uA755\\uA757\\uA759\\uA75B\\uA75D\\uA75F\\uA761\\uA763\\uA765\\uA767\\uA769\\uA76B\\uA76D\\uA76F\\uA771-\\uA778\\uA77A\\uA77C\\uA77F\\uA781\\uA783\\uA785\\uA787\\uA78C\\uA78E\\uA791\\uA7A1\\uA7A3\\uA7A5\\uA7A7\\uA7A9\\uA7FA\\uFB00-\\uFB06\\uFB13-\\uFB17\\uFF41-\\uFF5A\\u01C5\\u01C8\\u01CB\\u01F2\\u1F88-\\u1F8F\\u1F98-\\u1F9F\\u1FA8-\\u1FAF\\u1FBC\\u1FCC\\u1FFC\\u02B0-\\u02C1\\u02C6-\\u02D1\\u02E0-\\u02E4\\u02EC\\u02EE\\u0374\\u037A\\u0559\\u0640\\u06E5\\u06E6\\u07F4\\u07F5\\u07FA\\u081A\\u0824\\u0828\\u0971\\u0E46\\u0EC6\\u10FC\\u17D7\\u1843\\u1AA7\\u1C78-\\u1C7D\\u1D2C-\\u1D61\\u1D78\\u1D9B-\\u1DBF\\u2071\\u207F\\u2090-\\u209C\\u2C7D\\u2D6F\\u2E2F\\u3005\\u3031-\\u3035\\u303B\\u309D\\u309E\\u30FC-\\u30FE\\uA015\\uA4F8-\\uA4FD\\uA60C\\uA67F\\uA717-\\uA71F\\uA770\\uA788\\uA9CF\\uAA70\\uAADD\\uFF70\\uFF9E\\uFF9F\\u01BB\\u01C0-\\u01C3\\u0294\\u05D0-\\u05EA\\u05F0-\\u05F2\\u0620-\\u063F\\u0641-\\u064A\\u066E\\u066F\\u0671-\\u06D3\\u06D5\\u06EE\\u06EF\\u06FA-\\u06FC\\u06FF\\u0710\\u0712-\\u072F\\u074D-\\u07A5\\u07B1\\u07CA-\\u07EA\\u0800-\\u0815\\u0840-\\u0858\\u0904-\\u0939\\u093D\\u0950\\u0958-\\u0961\\u0972-\\u0977\\u0979-\\u097F\\u0985-\\u098C\\u098F\\u0990\\u0993-\\u09A8\\u09AA-\\u09B0\\u09B2\\u09B6-\\u09B9\\u09BD\\u09CE\\u09DC\\u09DD\\u09DF-\\u09E1\\u09F0\\u09F1\\u0A05-\\u0A0A\\u0A0F\\u0A10\\u0A13-\\u0A28\\u0A2A-\\u0A30\\u0A32\\u0A33\\u0A35\\u0A36\\u0A38\\u0A39\\u0A59-\\u0A5C\\u0A5E\\u0A72-\\u0A74\\u0A85-\\u0A8D\\u0A8F-\\u0A91\\u0A93-\\u0AA8\\u0AAA-\\u0AB0\\u0AB2\\u0AB3\\u0AB5-\\u0AB9\\u0ABD\\u0AD0\\u0AE0\\u0AE1\\u0B05-\\u0B0C\\u0B0F\\u0B10\\u0B13-\\u0B28\\u0B2A-\\u0B30\\u0B32\\u0B33\\u0B35-\\u0B39\\u0B3D\\u0B5C\\u0B5D\\u0B5F-\\u0B61\\u0B71\\u0B83\\u0B85-\\u0B8A\\u0B8E-\\u0B90\\u0B92-\\u0B95\\u0B99\\u0B9A\\u0B9C\\u0B9E\\u0B9F\\u0BA3\\u0BA4\\u0BA8-\\u0BAA\\u0BAE-\\u0BB9\\u0BD0\\u0C05-\\u0C0C\\u0C0E-\\u0C10\\u0C12-\\u0C28\\u0C2A-\\u0C33\\u0C35-\\u0C39\\u0C3D\\u0C58\\u0C59\\u0C60\\u0C61\\u0C85-\\u0C8C\\u0C8E-\\u0C90\\u0C92-\\u0CA8\\u0CAA-\\u0CB3\\u0CB5-\\u0CB9\\u0CBD\\u0CDE\\u0CE0\\u0CE1\\u0CF1\\u0CF2\\u0D05-\\u0D0C\\u0D0E-\\u0D10\\u0D12-\\u0D3A\\u0D3D\\u0D4E\\u0D60\\u0D61\\u0D7A-\\u0D7F\\u0D85-\\u0D96\\u0D9A-\\u0DB1\\u0DB3-\\u0DBB\\u0DBD\\u0DC0-\\u0DC6\\u0E01-\\u0E30\\u0E32\\u0E33\\u0E40-\\u0E45\\u0E81\\u0E82\\u0E84\\u0E87\\u0E88\\u0E8A\\u0E8D\\u0E94-\\u0E97\\u0E99-\\u0E9F\\u0EA1-\\u0EA3\\u0EA5\\u0EA7\\u0EAA\\u0EAB\\u0EAD-\\u0EB0\\u0EB2\\u0EB3\\u0EBD\\u0EC0-\\u0EC4\\u0EDC\\u0EDD\\u0F00\\u0F40-\\u0F47\\u0F49-\\u0F6C\\u0F88-\\u0F8C\\u1000-\\u102A\\u103F\\u1050-\\u1055\\u105A-\\u105D\\u1061\\u1065\\u1066\\u106E-\\u1070\\u1075-\\u1081\\u108E\\u10D0-\\u10FA\\u1100-\\u1248\\u124A-\\u124D\\u1250-\\u1256\\u1258\\u125A-\\u125D\\u1260-\\u1288\\u128A-\\u128D\\u1290-\\u12B0\\u12B2-\\u12B5\\u12B8-\\u12BE\\u12C0\\u12C2-\\u12C5\\u12C8-\\u12D6\\u12D8-\\u1310\\u1312-\\u1315\\u1318-\\u135A\\u1380-\\u138F\\u13A0-\\u13F4\\u1401-\\u166C\\u166F-\\u167F\\u1681-\\u169A\\u16A0-\\u16EA\\u1700-\\u170C\\u170E-\\u1711\\u1720-\\u1731\\u1740-\\u1751\\u1760-\\u176C\\u176E-\\u1770\\u1780-\\u17B3\\u17DC\\u1820-\\u1842\\u1844-\\u1877\\u1880-\\u18A8\\u18AA\\u18B0-\\u18F5\\u1900-\\u191C\\u1950-\\u196D\\u1970-\\u1974\\u1980-\\u19AB\\u19C1-\\u19C7\\u1A00-\\u1A16\\u1A20-\\u1A54\\u1B05-\\u1B33\\u1B45-\\u1B4B\\u1B83-\\u1BA0\\u1BAE\\u1BAF\\u1BC0-\\u1BE5\\u1C00-\\u1C23\\u1C4D-\\u1C4F\\u1C5A-\\u1C77\\u1CE9-\\u1CEC\\u1CEE-\\u1CF1\\u2135-\\u2138\\u2D30-\\u2D65\\u2D80-\\u2D96\\u2DA0-\\u2DA6\\u2DA8-\\u2DAE\\u2DB0-\\u2DB6\\u2DB8-\\u2DBE\\u2DC0-\\u2DC6\\u2DC8-\\u2DCE\\u2DD0-\\u2DD6\\u2DD8-\\u2DDE\\u3006\\u303C\\u3041-\\u3096\\u309F\\u30A1-\\u30FA\\u30FF\\u3105-\\u312D\\u3131-\\u318E\\u31A0-\\u31BA\\u31F0-\\u31FF\\u3400\\u4DB5\\u4E00\\u9FCB\\uA000-\\uA014\\uA016-\\uA48C\\uA4D0-\\uA4F7\\uA500-\\uA60B\\uA610-\\uA61F\\uA62A\\uA62B\\uA66E\\uA6A0-\\uA6E5\\uA7FB-\\uA801\\uA803-\\uA805\\uA807-\\uA80A\\uA80C-\\uA822\\uA840-\\uA873\\uA882-\\uA8B3\\uA8F2-\\uA8F7\\uA8FB\\uA90A-\\uA925\\uA930-\\uA946\\uA960-\\uA97C\\uA984-\\uA9B2\\uAA00-\\uAA28\\uAA40-\\uAA42\\uAA44-\\uAA4B\\uAA60-\\uAA6F\\uAA71-\\uAA76\\uAA7A\\uAA80-\\uAAAF\\uAAB1\\uAAB5\\uAAB6\\uAAB9-\\uAABD\\uAAC0\\uAAC2\\uAADB\\uAADC\\uAB01-\\uAB06\\uAB09-\\uAB0E\\uAB11-\\uAB16\\uAB20-\\uAB26\\uAB28-\\uAB2E\\uABC0-\\uABE2\\uAC00\\uD7A3\\uD7B0-\\uD7C6\\uD7CB-\\uD7FB\\uF900-\\uFA2D\\uFA30-\\uFA6D\\uFA70-\\uFAD9\\uFB1D\\uFB1F-\\uFB28\\uFB2A-\\uFB36\\uFB38-\\uFB3C\\uFB3E\\uFB40\\uFB41\\uFB43\\uFB44\\uFB46-\\uFBB1\\uFBD3-\\uFD3D\\uFD50-\\uFD8F\\uFD92-\\uFDC7\\uFDF0-\\uFDFB\\uFE70-\\uFE74\\uFE76-\\uFEFC\\uFF66-\\uFF6F\\uFF71-\\uFF9D\\uFFA0-\\uFFBE\\uFFC2-\\uFFC7\\uFFCA-\\uFFCF\\uFFD2-\\uFFD7\\uFFDA-\\uFFDC\\u16EE-\\u16F0\\u2160-\\u2182\\u2185-\\u2188\\u3007\\u3021-\\u3029\\u3038-\\u303A\\uA6E6-\\uA6EF]");
          }
        }
        if (r0 === null) {
          r1 = pos;
          if (input.charCodeAt(pos) === 55340) {
            r2 = "\uD82C";
            pos++;
          } else {
            r2 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\uD82C\"");
            }
          }
          if (r2 !== null) {
            if (/^[\uDC00\uDC01]/.test(input.charAt(pos))) {
              r3 = input.charAt(pos);
              pos++;
            } else {
              r3 = null;
              if (reportFailures === 0) {
                matchFailed("[\\uDC00\\uDC01]");
              }
            }
            if (r3 !== null) {
              r0 = [r2, r3];
            } else {
              r0 = null;
              pos = r1;
            }
          } else {
            r0 = null;
            pos = r1;
          }
          if (r0 === null) {
            r1 = pos;
            if (input.charCodeAt(pos) === 55304) {
              r2 = "\uD808";
              pos++;
            } else {
              r2 = null;
              if (reportFailures === 0) {
                matchFailed("\"\\uD808\"");
              }
            }
            if (r2 !== null) {
              if (/^[\uDC00-\uDF6E]/.test(input.charAt(pos))) {
                r3 = input.charAt(pos);
                pos++;
              } else {
                r3 = null;
                if (reportFailures === 0) {
                  matchFailed("[\\uDC00-\\uDF6E]");
                }
              }
              if (r3 !== null) {
                r0 = [r2, r3];
              } else {
                r0 = null;
                pos = r1;
              }
            } else {
              r0 = null;
              pos = r1;
            }
            if (r0 === null) {
              r1 = pos;
              if (input.charCodeAt(pos) === 55401) {
                r2 = "\uD869";
                pos++;
              } else {
                r2 = null;
                if (reportFailures === 0) {
                  matchFailed("\"\\uD869\"");
                }
              }
              if (r2 !== null) {
                if (/^[\uDED6\uDF00]/.test(input.charAt(pos))) {
                  r3 = input.charAt(pos);
                  pos++;
                } else {
                  r3 = null;
                  if (reportFailures === 0) {
                    matchFailed("[\\uDED6\\uDF00]");
                  }
                }
                if (r3 !== null) {
                  r0 = [r2, r3];
                } else {
                  r0 = null;
                  pos = r1;
                }
              } else {
                r0 = null;
                pos = r1;
              }
              if (r0 === null) {
                r1 = pos;
                if (input.charCodeAt(pos) === 55305) {
                  r2 = "\uD809";
                  pos++;
                } else {
                  r2 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"\\uD809\"");
                  }
                }
                if (r2 !== null) {
                  if (/^[\uDC00-\uDC62]/.test(input.charAt(pos))) {
                    r3 = input.charAt(pos);
                    pos++;
                  } else {
                    r3 = null;
                    if (reportFailures === 0) {
                      matchFailed("[\\uDC00-\\uDC62]");
                    }
                  }
                  if (r3 !== null) {
                    r0 = [r2, r3];
                  } else {
                    r0 = null;
                    pos = r1;
                  }
                } else {
                  r0 = null;
                  pos = r1;
                }
                if (r0 === null) {
                  r1 = pos;
                  if (input.charCodeAt(pos) === 55349) {
                    r2 = "\uD835";
                    pos++;
                  } else {
                    r2 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"\\uD835\"");
                    }
                  }
                  if (r2 !== null) {
                    if (/^[\uDC00-\uDC19\uDC34-\uDC4D\uDC68-\uDC81\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB5\uDCD0-\uDCE9\uDD04\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD38\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD6C-\uDD85\uDDA0-\uDDB9\uDDD4-\uDDED\uDE08-\uDE21\uDE3C-\uDE55\uDE70-\uDE89\uDEA8-\uDEC0\uDEE2-\uDEFA\uDF1C-\uDF34\uDF56-\uDF6E\uDF90-\uDFA8\uDFCA\uDC1A-\uDC33\uDC4E-\uDC54\uDC56-\uDC67\uDC82-\uDC9B\uDCB6-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDCCF\uDCEA-\uDD03\uDD1E-\uDD37\uDD52-\uDD6B\uDD86-\uDD9F\uDDBA-\uDDD3\uDDEE-\uDE07\uDE22-\uDE3B\uDE56-\uDE6F\uDE8A-\uDEA5\uDEC2-\uDEDA\uDEDC-\uDEE1\uDEFC-\uDF14\uDF16-\uDF1B\uDF36-\uDF4E\uDF50-\uDF55\uDF70-\uDF88\uDF8A-\uDF8F\uDFAA-\uDFC2\uDFC4-\uDFC9\uDFCB]/.test(input.charAt(pos))) {
                      r3 = input.charAt(pos);
                      pos++;
                    } else {
                      r3 = null;
                      if (reportFailures === 0) {
                        matchFailed("[\\uDC00-\\uDC19\\uDC34-\\uDC4D\\uDC68-\\uDC81\\uDC9C\\uDC9E\\uDC9F\\uDCA2\\uDCA5\\uDCA6\\uDCA9-\\uDCAC\\uDCAE-\\uDCB5\\uDCD0-\\uDCE9\\uDD04\\uDD05\\uDD07-\\uDD0A\\uDD0D-\\uDD14\\uDD16-\\uDD1C\\uDD38\\uDD39\\uDD3B-\\uDD3E\\uDD40-\\uDD44\\uDD46\\uDD4A-\\uDD50\\uDD6C-\\uDD85\\uDDA0-\\uDDB9\\uDDD4-\\uDDED\\uDE08-\\uDE21\\uDE3C-\\uDE55\\uDE70-\\uDE89\\uDEA8-\\uDEC0\\uDEE2-\\uDEFA\\uDF1C-\\uDF34\\uDF56-\\uDF6E\\uDF90-\\uDFA8\\uDFCA\\uDC1A-\\uDC33\\uDC4E-\\uDC54\\uDC56-\\uDC67\\uDC82-\\uDC9B\\uDCB6-\\uDCB9\\uDCBB\\uDCBD-\\uDCC3\\uDCC5-\\uDCCF\\uDCEA-\\uDD03\\uDD1E-\\uDD37\\uDD52-\\uDD6B\\uDD86-\\uDD9F\\uDDBA-\\uDDD3\\uDDEE-\\uDE07\\uDE22-\\uDE3B\\uDE56-\\uDE6F\\uDE8A-\\uDEA5\\uDEC2-\\uDEDA\\uDEDC-\\uDEE1\\uDEFC-\\uDF14\\uDF16-\\uDF1B\\uDF36-\\uDF4E\\uDF50-\\uDF55\\uDF70-\\uDF88\\uDF8A-\\uDF8F\\uDFAA-\\uDFC2\\uDFC4-\\uDFC9\\uDFCB]");
                      }
                    }
                    if (r3 !== null) {
                      r0 = [r2, r3];
                    } else {
                      r0 = null;
                      pos = r1;
                    }
                  } else {
                    r0 = null;
                    pos = r1;
                  }
                  if (r0 === null) {
                    r1 = pos;
                    if (input.charCodeAt(pos) === 55300) {
                      r2 = "\uD804";
                      pos++;
                    } else {
                      r2 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"\\uD804\"");
                      }
                    }
                    if (r2 !== null) {
                      if (/^[\uDC03-\uDC37\uDC83-\uDCAF]/.test(input.charAt(pos))) {
                        r3 = input.charAt(pos);
                        pos++;
                      } else {
                        r3 = null;
                        if (reportFailures === 0) {
                          matchFailed("[\\uDC03-\\uDC37\\uDC83-\\uDCAF]");
                        }
                      }
                      if (r3 !== null) {
                        r0 = [r2, r3];
                      } else {
                        r0 = null;
                        pos = r1;
                      }
                    } else {
                      r0 = null;
                      pos = r1;
                    }
                    if (r0 === null) {
                      r1 = pos;
                      if (input.charCodeAt(pos) === 55296) {
                        r2 = "\uD800";
                        pos++;
                      } else {
                        r2 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"\\uD800\"");
                        }
                      }
                      if (r2 !== null) {
                        if (/^[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDE80-\uDE9C\uDEA0-\uDED0\uDF00-\uDF1E\uDF30-\uDF40\uDF42-\uDF49\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDD40-\uDD74\uDF41\uDF4A\uDFD1-\uDFD5]/.test(input.charAt(pos))) {
                          r3 = input.charAt(pos);
                          pos++;
                        } else {
                          r3 = null;
                          if (reportFailures === 0) {
                            matchFailed("[\\uDC00-\\uDC0B\\uDC0D-\\uDC26\\uDC28-\\uDC3A\\uDC3C\\uDC3D\\uDC3F-\\uDC4D\\uDC50-\\uDC5D\\uDC80-\\uDCFA\\uDE80-\\uDE9C\\uDEA0-\\uDED0\\uDF00-\\uDF1E\\uDF30-\\uDF40\\uDF42-\\uDF49\\uDF80-\\uDF9D\\uDFA0-\\uDFC3\\uDFC8-\\uDFCF\\uDD40-\\uDD74\\uDF41\\uDF4A\\uDFD1-\\uDFD5]");
                          }
                        }
                        if (r3 !== null) {
                          r0 = [r2, r3];
                        } else {
                          r0 = null;
                          pos = r1;
                        }
                      } else {
                        r0 = null;
                        pos = r1;
                      }
                      if (r0 === null) {
                        r1 = pos;
                        if (input.charCodeAt(pos) === 55308) {
                          r2 = "\uD80C";
                          pos++;
                        } else {
                          r2 = null;
                          if (reportFailures === 0) {
                            matchFailed("\"\\uD80C\"");
                          }
                        }
                        if (r2 !== null) {
                          if (/^[\uDC00-\uDFFF]/.test(input.charAt(pos))) {
                            r3 = input.charAt(pos);
                            pos++;
                          } else {
                            r3 = null;
                            if (reportFailures === 0) {
                              matchFailed("[\\uDC00-\\uDFFF]");
                            }
                          }
                          if (r3 !== null) {
                            r0 = [r2, r3];
                          } else {
                            r0 = null;
                            pos = r1;
                          }
                        } else {
                          r0 = null;
                          pos = r1;
                        }
                        if (r0 === null) {
                          r1 = pos;
                          if (input.charCodeAt(pos) === 55297) {
                            r2 = "\uD801";
                            pos++;
                          } else {
                            r2 = null;
                            if (reportFailures === 0) {
                              matchFailed("\"\\uD801\"");
                            }
                          }
                          if (r2 !== null) {
                            if (/^[\uDC00-\uDC9D]/.test(input.charAt(pos))) {
                              r3 = input.charAt(pos);
                              pos++;
                            } else {
                              r3 = null;
                              if (reportFailures === 0) {
                                matchFailed("[\\uDC00-\\uDC9D]");
                              }
                            }
                            if (r3 !== null) {
                              r0 = [r2, r3];
                            } else {
                              r0 = null;
                              pos = r1;
                            }
                          } else {
                            r0 = null;
                            pos = r1;
                          }
                          if (r0 === null) {
                            r1 = pos;
                            if (input.charCodeAt(pos) === 55406) {
                              r2 = "\uD86E";
                              pos++;
                            } else {
                              r2 = null;
                              if (reportFailures === 0) {
                                matchFailed("\"\\uD86E\"");
                              }
                            }
                            if (r2 !== null) {
                              if (/^[\uDC1D]/.test(input.charAt(pos))) {
                                r3 = input.charAt(pos);
                                pos++;
                              } else {
                                r3 = null;
                                if (reportFailures === 0) {
                                  matchFailed("[\\uDC1D]");
                                }
                              }
                              if (r3 !== null) {
                                r0 = [r2, r3];
                              } else {
                                r0 = null;
                                pos = r1;
                              }
                            } else {
                              r0 = null;
                              pos = r1;
                            }
                            if (r0 === null) {
                              r1 = pos;
                              if (input.charCodeAt(pos) === 55299) {
                                r2 = "\uD803";
                                pos++;
                              } else {
                                r2 = null;
                                if (reportFailures === 0) {
                                  matchFailed("\"\\uD803\"");
                                }
                              }
                              if (r2 !== null) {
                                if (/^[\uDC00-\uDC48]/.test(input.charAt(pos))) {
                                  r3 = input.charAt(pos);
                                  pos++;
                                } else {
                                  r3 = null;
                                  if (reportFailures === 0) {
                                    matchFailed("[\\uDC00-\\uDC48]");
                                  }
                                }
                                if (r3 !== null) {
                                  r0 = [r2, r3];
                                } else {
                                  r0 = null;
                                  pos = r1;
                                }
                              } else {
                                r0 = null;
                                pos = r1;
                              }
                              if (r0 === null) {
                                r1 = pos;
                                if (input.charCodeAt(pos) === 55360) {
                                  r2 = "\uD840";
                                  pos++;
                                } else {
                                  r2 = null;
                                  if (reportFailures === 0) {
                                    matchFailed("\"\\uD840\"");
                                  }
                                }
                                if (r2 !== null) {
                                  if (/^[\uDC00]/.test(input.charAt(pos))) {
                                    r3 = input.charAt(pos);
                                    pos++;
                                  } else {
                                    r3 = null;
                                    if (reportFailures === 0) {
                                      matchFailed("[\\uDC00]");
                                    }
                                  }
                                  if (r3 !== null) {
                                    r0 = [r2, r3];
                                  } else {
                                    r0 = null;
                                    pos = r1;
                                  }
                                } else {
                                  r0 = null;
                                  pos = r1;
                                }
                                if (r0 === null) {
                                  r1 = pos;
                                  if (input.charCodeAt(pos) === 55422) {
                                    r2 = "\uD87E";
                                    pos++;
                                  } else {
                                    r2 = null;
                                    if (reportFailures === 0) {
                                      matchFailed("\"\\uD87E\"");
                                    }
                                  }
                                  if (r2 !== null) {
                                    if (/^[\uDC00-\uDE1D]/.test(input.charAt(pos))) {
                                      r3 = input.charAt(pos);
                                      pos++;
                                    } else {
                                      r3 = null;
                                      if (reportFailures === 0) {
                                        matchFailed("[\\uDC00-\\uDE1D]");
                                      }
                                    }
                                    if (r3 !== null) {
                                      r0 = [r2, r3];
                                    } else {
                                      r0 = null;
                                      pos = r1;
                                    }
                                  } else {
                                    r0 = null;
                                    pos = r1;
                                  }
                                  if (r0 === null) {
                                    r1 = pos;
                                    if (input.charCodeAt(pos) === 55405) {
                                      r2 = "\uD86D";
                                      pos++;
                                    } else {
                                      r2 = null;
                                      if (reportFailures === 0) {
                                        matchFailed("\"\\uD86D\"");
                                      }
                                    }
                                    if (r2 !== null) {
                                      if (/^[\uDF34\uDF40]/.test(input.charAt(pos))) {
                                        r3 = input.charAt(pos);
                                        pos++;
                                      } else {
                                        r3 = null;
                                        if (reportFailures === 0) {
                                          matchFailed("[\\uDF34\\uDF40]");
                                        }
                                      }
                                      if (r3 !== null) {
                                        r0 = [r2, r3];
                                      } else {
                                        r0 = null;
                                        pos = r1;
                                      }
                                    } else {
                                      r0 = null;
                                      pos = r1;
                                    }
                                    if (r0 === null) {
                                      r1 = pos;
                                      if (input.charCodeAt(pos) === 55322) {
                                        r2 = "\uD81A";
                                        pos++;
                                      } else {
                                        r2 = null;
                                        if (reportFailures === 0) {
                                          matchFailed("\"\\uD81A\"");
                                        }
                                      }
                                      if (r2 !== null) {
                                        if (/^[\uDC00-\uDE38]/.test(input.charAt(pos))) {
                                          r3 = input.charAt(pos);
                                          pos++;
                                        } else {
                                          r3 = null;
                                          if (reportFailures === 0) {
                                            matchFailed("[\\uDC00-\\uDE38]");
                                          }
                                        }
                                        if (r3 !== null) {
                                          r0 = [r2, r3];
                                        } else {
                                          r0 = null;
                                          pos = r1;
                                        }
                                      } else {
                                        r0 = null;
                                        pos = r1;
                                      }
                                      if (r0 === null) {
                                        r1 = pos;
                                        if (input.charCodeAt(pos) === 55298) {
                                          r2 = "\uD802";
                                          pos++;
                                        } else {
                                          r2 = null;
                                          if (reportFailures === 0) {
                                            matchFailed("\"\\uD802\"");
                                          }
                                        }
                                        if (r2 !== null) {
                                          if (/^[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDD00-\uDD15\uDD20-\uDD39\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE60-\uDE7C\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72]/.test(input.charAt(pos))) {
                                            r3 = input.charAt(pos);
                                            pos++;
                                          } else {
                                            r3 = null;
                                            if (reportFailures === 0) {
                                              matchFailed("[\\uDC00-\\uDC05\\uDC08\\uDC0A-\\uDC35\\uDC37\\uDC38\\uDC3C\\uDC3F-\\uDC55\\uDD00-\\uDD15\\uDD20-\\uDD39\\uDE00\\uDE10-\\uDE13\\uDE15-\\uDE17\\uDE19-\\uDE33\\uDE60-\\uDE7C\\uDF00-\\uDF35\\uDF40-\\uDF55\\uDF60-\\uDF72]");
                                            }
                                          }
                                          if (r3 !== null) {
                                            r0 = [r2, r3];
                                          } else {
                                            r0 = null;
                                            pos = r1;
                                          }
                                        } else {
                                          r0 = null;
                                          pos = r1;
                                        }
                                        if (r0 === null) {
                                          r1 = pos;
                                          if (input.charCodeAt(pos) === 55309) {
                                            r2 = "\uD80D";
                                            pos++;
                                          } else {
                                            r2 = null;
                                            if (reportFailures === 0) {
                                              matchFailed("\"\\uD80D\"");
                                            }
                                          }
                                          if (r2 !== null) {
                                            if (/^[\uDC00-\uDC2E]/.test(input.charAt(pos))) {
                                              r3 = input.charAt(pos);
                                              pos++;
                                            } else {
                                              r3 = null;
                                              if (reportFailures === 0) {
                                                matchFailed("[\\uDC00-\\uDC2E]");
                                              }
                                            }
                                            if (r3 !== null) {
                                              r0 = [r2, r3];
                                            } else {
                                              r0 = null;
                                              pos = r1;
                                            }
                                          } else {
                                            r0 = null;
                                            pos = r1;
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_UnicodeCombiningMark() {
        var cacheKey = "UnicodeCombiningMark@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3;
        
        if (/^[\u0300-\u036F\u0483-\u0487\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u0711\u0730-\u074A\u07A6-\u07B0\u07EB-\u07F3\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u0900-\u0902\u093A\u093C\u0941-\u0948\u094D\u0951-\u0957\u0962\u0963\u0981\u09BC\u09C1-\u09C4\u09CD\u09E2\u09E3\u0A01\u0A02\u0A3C\u0A41\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A70\u0A71\u0A75\u0A81\u0A82\u0ABC\u0AC1-\u0AC5\u0AC7\u0AC8\u0ACD\u0AE2\u0AE3\u0B01\u0B3C\u0B3F\u0B41-\u0B44\u0B4D\u0B56\u0B62\u0B63\u0B82\u0BC0\u0BCD\u0C3E-\u0C40\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C62\u0C63\u0CBC\u0CBF\u0CC6\u0CCC\u0CCD\u0CE2\u0CE3\u0D41-\u0D44\u0D4D\u0D62\u0D63\u0DCA\u0DD2-\u0DD4\u0DD6\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0EB1\u0EB4-\u0EB9\u0EBB\u0EBC\u0EC8-\u0ECD\u0F18\u0F19\u0F35\u0F37\u0F39\u0F71-\u0F7E\u0F80-\u0F84\u0F86\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102D-\u1030\u1032-\u1037\u1039\u103A\u103D\u103E\u1058\u1059\u105E-\u1060\u1071-\u1074\u1082\u1085\u1086\u108D\u109D\u135D-\u135F\u1712-\u1714\u1732-\u1734\u1752\u1753\u1772\u1773\u17B7-\u17BD\u17C6\u17C9-\u17D3\u17DD\u180B-\u180D\u18A9\u1920-\u1922\u1927\u1928\u1932\u1939-\u193B\u1A17\u1A18\u1A56\u1A58-\u1A5E\u1A60\u1A62\u1A65-\u1A6C\u1A73-\u1A7C\u1A7F\u1B00-\u1B03\u1B34\u1B36-\u1B3A\u1B3C\u1B42\u1B6B-\u1B73\u1B80\u1B81\u1BA2-\u1BA5\u1BA8\u1BA9\u1BE6\u1BE8\u1BE9\u1BED\u1BEF-\u1BF1\u1C2C-\u1C33\u1C36\u1C37\u1CD0-\u1CD2\u1CD4-\u1CE0\u1CE2-\u1CE8\u1CED\u1DC0-\u1DE6\u1DFC-\u1DFF\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302F\u3099\u309A\uA66F\uA67C\uA67D\uA6F0\uA6F1\uA802\uA806\uA80B\uA825\uA826\uA8C4\uA8E0-\uA8F1\uA926-\uA92D\uA947-\uA951\uA980-\uA982\uA9B3\uA9B6-\uA9B9\uA9BC\uAA29-\uAA2E\uAA31\uAA32\uAA35\uAA36\uAA43\uAA4C\uAAB0\uAAB2-\uAAB4\uAAB7\uAAB8\uAABE\uAABF\uAAC1\uABE5\uABE8\uABED\uFB1E\uFE00-\uFE0F\uFE20-\uFE26\u0903\u093B\u093E-\u0940\u0949-\u094C\u094E\u094F\u0982\u0983\u09BE-\u09C0\u09C7\u09C8\u09CB\u09CC\u09D7\u0A03\u0A3E-\u0A40\u0A83\u0ABE-\u0AC0\u0AC9\u0ACB\u0ACC\u0B02\u0B03\u0B3E\u0B40\u0B47\u0B48\u0B4B\u0B4C\u0B57\u0BBE\u0BBF\u0BC1\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCC\u0BD7\u0C01-\u0C03\u0C41-\u0C44\u0C82\u0C83\u0CBE\u0CC0-\u0CC4\u0CC7\u0CC8\u0CCA\u0CCB\u0CD5\u0CD6\u0D02\u0D03\u0D3E-\u0D40\u0D46-\u0D48\u0D4A-\u0D4C\u0D57\u0D82\u0D83\u0DCF-\u0DD1\u0DD8-\u0DDF\u0DF2\u0DF3\u0F3E\u0F3F\u0F7F\u102B\u102C\u1031\u1038\u103B\u103C\u1056\u1057\u1062-\u1064\u1067-\u106D\u1083\u1084\u1087-\u108C\u108F\u109A-\u109C\u17B6\u17BE-\u17C5\u17C7\u17C8\u1923-\u1926\u1929-\u192B\u1930\u1931\u1933-\u1938\u19B0-\u19C0\u19C8\u19C9\u1A19-\u1A1B\u1A55\u1A57\u1A61\u1A63\u1A64\u1A6D-\u1A72\u1B04\u1B35\u1B3B\u1B3D-\u1B41\u1B43\u1B44\u1B82\u1BA1\u1BA6\u1BA7\u1BAA\u1BE7\u1BEA-\u1BEC\u1BEE\u1BF2\u1BF3\u1C24-\u1C2B\u1C34\u1C35\u1CE1\u1CF2\uA823\uA824\uA827\uA880\uA881\uA8B4-\uA8C3\uA952\uA953\uA983\uA9B4\uA9B5\uA9BA\uA9BB\uA9BD-\uA9C0\uAA2F\uAA30\uAA33\uAA34\uAA4D\uAA7B\uABE3\uABE4\uABE6\uABE7\uABE9\uABEA\uABEC]/.test(input.charAt(pos))) {
          r0 = input.charAt(pos);
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("[\\u0300-\\u036F\\u0483-\\u0487\\u0591-\\u05BD\\u05BF\\u05C1\\u05C2\\u05C4\\u05C5\\u05C7\\u0610-\\u061A\\u064B-\\u065F\\u0670\\u06D6-\\u06DC\\u06DF-\\u06E4\\u06E7\\u06E8\\u06EA-\\u06ED\\u0711\\u0730-\\u074A\\u07A6-\\u07B0\\u07EB-\\u07F3\\u0816-\\u0819\\u081B-\\u0823\\u0825-\\u0827\\u0829-\\u082D\\u0859-\\u085B\\u0900-\\u0902\\u093A\\u093C\\u0941-\\u0948\\u094D\\u0951-\\u0957\\u0962\\u0963\\u0981\\u09BC\\u09C1-\\u09C4\\u09CD\\u09E2\\u09E3\\u0A01\\u0A02\\u0A3C\\u0A41\\u0A42\\u0A47\\u0A48\\u0A4B-\\u0A4D\\u0A51\\u0A70\\u0A71\\u0A75\\u0A81\\u0A82\\u0ABC\\u0AC1-\\u0AC5\\u0AC7\\u0AC8\\u0ACD\\u0AE2\\u0AE3\\u0B01\\u0B3C\\u0B3F\\u0B41-\\u0B44\\u0B4D\\u0B56\\u0B62\\u0B63\\u0B82\\u0BC0\\u0BCD\\u0C3E-\\u0C40\\u0C46-\\u0C48\\u0C4A-\\u0C4D\\u0C55\\u0C56\\u0C62\\u0C63\\u0CBC\\u0CBF\\u0CC6\\u0CCC\\u0CCD\\u0CE2\\u0CE3\\u0D41-\\u0D44\\u0D4D\\u0D62\\u0D63\\u0DCA\\u0DD2-\\u0DD4\\u0DD6\\u0E31\\u0E34-\\u0E3A\\u0E47-\\u0E4E\\u0EB1\\u0EB4-\\u0EB9\\u0EBB\\u0EBC\\u0EC8-\\u0ECD\\u0F18\\u0F19\\u0F35\\u0F37\\u0F39\\u0F71-\\u0F7E\\u0F80-\\u0F84\\u0F86\\u0F87\\u0F8D-\\u0F97\\u0F99-\\u0FBC\\u0FC6\\u102D-\\u1030\\u1032-\\u1037\\u1039\\u103A\\u103D\\u103E\\u1058\\u1059\\u105E-\\u1060\\u1071-\\u1074\\u1082\\u1085\\u1086\\u108D\\u109D\\u135D-\\u135F\\u1712-\\u1714\\u1732-\\u1734\\u1752\\u1753\\u1772\\u1773\\u17B7-\\u17BD\\u17C6\\u17C9-\\u17D3\\u17DD\\u180B-\\u180D\\u18A9\\u1920-\\u1922\\u1927\\u1928\\u1932\\u1939-\\u193B\\u1A17\\u1A18\\u1A56\\u1A58-\\u1A5E\\u1A60\\u1A62\\u1A65-\\u1A6C\\u1A73-\\u1A7C\\u1A7F\\u1B00-\\u1B03\\u1B34\\u1B36-\\u1B3A\\u1B3C\\u1B42\\u1B6B-\\u1B73\\u1B80\\u1B81\\u1BA2-\\u1BA5\\u1BA8\\u1BA9\\u1BE6\\u1BE8\\u1BE9\\u1BED\\u1BEF-\\u1BF1\\u1C2C-\\u1C33\\u1C36\\u1C37\\u1CD0-\\u1CD2\\u1CD4-\\u1CE0\\u1CE2-\\u1CE8\\u1CED\\u1DC0-\\u1DE6\\u1DFC-\\u1DFF\\u20D0-\\u20DC\\u20E1\\u20E5-\\u20F0\\u2CEF-\\u2CF1\\u2D7F\\u2DE0-\\u2DFF\\u302A-\\u302F\\u3099\\u309A\\uA66F\\uA67C\\uA67D\\uA6F0\\uA6F1\\uA802\\uA806\\uA80B\\uA825\\uA826\\uA8C4\\uA8E0-\\uA8F1\\uA926-\\uA92D\\uA947-\\uA951\\uA980-\\uA982\\uA9B3\\uA9B6-\\uA9B9\\uA9BC\\uAA29-\\uAA2E\\uAA31\\uAA32\\uAA35\\uAA36\\uAA43\\uAA4C\\uAAB0\\uAAB2-\\uAAB4\\uAAB7\\uAAB8\\uAABE\\uAABF\\uAAC1\\uABE5\\uABE8\\uABED\\uFB1E\\uFE00-\\uFE0F\\uFE20-\\uFE26\\u0903\\u093B\\u093E-\\u0940\\u0949-\\u094C\\u094E\\u094F\\u0982\\u0983\\u09BE-\\u09C0\\u09C7\\u09C8\\u09CB\\u09CC\\u09D7\\u0A03\\u0A3E-\\u0A40\\u0A83\\u0ABE-\\u0AC0\\u0AC9\\u0ACB\\u0ACC\\u0B02\\u0B03\\u0B3E\\u0B40\\u0B47\\u0B48\\u0B4B\\u0B4C\\u0B57\\u0BBE\\u0BBF\\u0BC1\\u0BC2\\u0BC6-\\u0BC8\\u0BCA-\\u0BCC\\u0BD7\\u0C01-\\u0C03\\u0C41-\\u0C44\\u0C82\\u0C83\\u0CBE\\u0CC0-\\u0CC4\\u0CC7\\u0CC8\\u0CCA\\u0CCB\\u0CD5\\u0CD6\\u0D02\\u0D03\\u0D3E-\\u0D40\\u0D46-\\u0D48\\u0D4A-\\u0D4C\\u0D57\\u0D82\\u0D83\\u0DCF-\\u0DD1\\u0DD8-\\u0DDF\\u0DF2\\u0DF3\\u0F3E\\u0F3F\\u0F7F\\u102B\\u102C\\u1031\\u1038\\u103B\\u103C\\u1056\\u1057\\u1062-\\u1064\\u1067-\\u106D\\u1083\\u1084\\u1087-\\u108C\\u108F\\u109A-\\u109C\\u17B6\\u17BE-\\u17C5\\u17C7\\u17C8\\u1923-\\u1926\\u1929-\\u192B\\u1930\\u1931\\u1933-\\u1938\\u19B0-\\u19C0\\u19C8\\u19C9\\u1A19-\\u1A1B\\u1A55\\u1A57\\u1A61\\u1A63\\u1A64\\u1A6D-\\u1A72\\u1B04\\u1B35\\u1B3B\\u1B3D-\\u1B41\\u1B43\\u1B44\\u1B82\\u1BA1\\u1BA6\\u1BA7\\u1BAA\\u1BE7\\u1BEA-\\u1BEC\\u1BEE\\u1BF2\\u1BF3\\u1C24-\\u1C2B\\u1C34\\u1C35\\u1CE1\\u1CF2\\uA823\\uA824\\uA827\\uA880\\uA881\\uA8B4-\\uA8C3\\uA952\\uA953\\uA983\\uA9B4\\uA9B5\\uA9BA\\uA9BB\\uA9BD-\\uA9C0\\uAA2F\\uAA30\\uAA33\\uAA34\\uAA4D\\uAA7B\\uABE3\\uABE4\\uABE6\\uABE7\\uABE9\\uABEA\\uABEC]");
          }
        }
        if (r0 === null) {
          r1 = pos;
          if (input.charCodeAt(pos) === 56128) {
            r2 = "\uDB40";
            pos++;
          } else {
            r2 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\uDB40\"");
            }
          }
          if (r2 !== null) {
            if (/^[\uDD00-\uDDEF]/.test(input.charAt(pos))) {
              r3 = input.charAt(pos);
              pos++;
            } else {
              r3 = null;
              if (reportFailures === 0) {
                matchFailed("[\\uDD00-\\uDDEF]");
              }
            }
            if (r3 !== null) {
              r0 = [r2, r3];
            } else {
              r0 = null;
              pos = r1;
            }
          } else {
            r0 = null;
            pos = r1;
          }
          if (r0 === null) {
            r1 = pos;
            if (input.charCodeAt(pos) === 55348) {
              r2 = "\uD834";
              pos++;
            } else {
              r2 = null;
              if (reportFailures === 0) {
                matchFailed("\"\\uD834\"");
              }
            }
            if (r2 !== null) {
              if (/^[\uDD67-\uDD69\uDD7B-\uDD82\uDD85-\uDD8B\uDDAA-\uDDAD\uDE42-\uDE44\uDD65\uDD66\uDD6D-\uDD72]/.test(input.charAt(pos))) {
                r3 = input.charAt(pos);
                pos++;
              } else {
                r3 = null;
                if (reportFailures === 0) {
                  matchFailed("[\\uDD67-\\uDD69\\uDD7B-\\uDD82\\uDD85-\\uDD8B\\uDDAA-\\uDDAD\\uDE42-\\uDE44\\uDD65\\uDD66\\uDD6D-\\uDD72]");
                }
              }
              if (r3 !== null) {
                r0 = [r2, r3];
              } else {
                r0 = null;
                pos = r1;
              }
            } else {
              r0 = null;
              pos = r1;
            }
            if (r0 === null) {
              r1 = pos;
              if (input.charCodeAt(pos) === 55300) {
                r2 = "\uD804";
                pos++;
              } else {
                r2 = null;
                if (reportFailures === 0) {
                  matchFailed("\"\\uD804\"");
                }
              }
              if (r2 !== null) {
                if (/^[\uDC01\uDC38-\uDC46\uDC80\uDC81\uDCB3-\uDCB6\uDCB9\uDCBA\uDC00\uDC02\uDC82\uDCB0-\uDCB2\uDCB7\uDCB8]/.test(input.charAt(pos))) {
                  r3 = input.charAt(pos);
                  pos++;
                } else {
                  r3 = null;
                  if (reportFailures === 0) {
                    matchFailed("[\\uDC01\\uDC38-\\uDC46\\uDC80\\uDC81\\uDCB3-\\uDCB6\\uDCB9\\uDCBA\\uDC00\\uDC02\\uDC82\\uDCB0-\\uDCB2\\uDCB7\\uDCB8]");
                  }
                }
                if (r3 !== null) {
                  r0 = [r2, r3];
                } else {
                  r0 = null;
                  pos = r1;
                }
              } else {
                r0 = null;
                pos = r1;
              }
              if (r0 === null) {
                r1 = pos;
                if (input.charCodeAt(pos) === 55296) {
                  r2 = "\uD800";
                  pos++;
                } else {
                  r2 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"\\uD800\"");
                  }
                }
                if (r2 !== null) {
                  if (/^[\uDDFD]/.test(input.charAt(pos))) {
                    r3 = input.charAt(pos);
                    pos++;
                  } else {
                    r3 = null;
                    if (reportFailures === 0) {
                      matchFailed("[\\uDDFD]");
                    }
                  }
                  if (r3 !== null) {
                    r0 = [r2, r3];
                  } else {
                    r0 = null;
                    pos = r1;
                  }
                } else {
                  r0 = null;
                  pos = r1;
                }
                if (r0 === null) {
                  r1 = pos;
                  if (input.charCodeAt(pos) === 55298) {
                    r2 = "\uD802";
                    pos++;
                  } else {
                    r2 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"\\uD802\"");
                    }
                  }
                  if (r2 !== null) {
                    if (/^[\uDE01-\uDE03\uDE05\uDE06\uDE0C-\uDE0F\uDE38-\uDE3A\uDE3F]/.test(input.charAt(pos))) {
                      r3 = input.charAt(pos);
                      pos++;
                    } else {
                      r3 = null;
                      if (reportFailures === 0) {
                        matchFailed("[\\uDE01-\\uDE03\\uDE05\\uDE06\\uDE0C-\\uDE0F\\uDE38-\\uDE3A\\uDE3F]");
                      }
                    }
                    if (r3 !== null) {
                      r0 = [r2, r3];
                    } else {
                      r0 = null;
                      pos = r1;
                    }
                  } else {
                    r0 = null;
                    pos = r1;
                  }
                }
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_UnicodeDigit() {
        var cacheKey = "UnicodeDigit@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0, r1, r2, r3;
        
        if (/^[0-9\u0660-\u0669\u06F0-\u06F9\u07C0-\u07C9\u0966-\u096F\u09E6-\u09EF\u0A66-\u0A6F\u0AE6-\u0AEF\u0B66-\u0B6F\u0BE6-\u0BEF\u0C66-\u0C6F\u0CE6-\u0CEF\u0D66-\u0D6F\u0E50-\u0E59\u0ED0-\u0ED9\u0F20-\u0F29\u1040-\u1049\u1090-\u1099\u17E0-\u17E9\u1810-\u1819\u1946-\u194F\u19D0-\u19D9\u1A80-\u1A89\u1A90-\u1A99\u1B50-\u1B59\u1BB0-\u1BB9\u1C40-\u1C49\u1C50-\u1C59\uA620-\uA629\uA8D0-\uA8D9\uA900-\uA909\uA9D0-\uA9D9\uAA50-\uAA59\uABF0-\uABF9\uFF10-\uFF19]/.test(input.charAt(pos))) {
          r0 = input.charAt(pos);
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("[0-9\\u0660-\\u0669\\u06F0-\\u06F9\\u07C0-\\u07C9\\u0966-\\u096F\\u09E6-\\u09EF\\u0A66-\\u0A6F\\u0AE6-\\u0AEF\\u0B66-\\u0B6F\\u0BE6-\\u0BEF\\u0C66-\\u0C6F\\u0CE6-\\u0CEF\\u0D66-\\u0D6F\\u0E50-\\u0E59\\u0ED0-\\u0ED9\\u0F20-\\u0F29\\u1040-\\u1049\\u1090-\\u1099\\u17E0-\\u17E9\\u1810-\\u1819\\u1946-\\u194F\\u19D0-\\u19D9\\u1A80-\\u1A89\\u1A90-\\u1A99\\u1B50-\\u1B59\\u1BB0-\\u1BB9\\u1C40-\\u1C49\\u1C50-\\u1C59\\uA620-\\uA629\\uA8D0-\\uA8D9\\uA900-\\uA909\\uA9D0-\\uA9D9\\uAA50-\\uAA59\\uABF0-\\uABF9\\uFF10-\\uFF19]");
          }
        }
        if (r0 === null) {
          r1 = pos;
          if (input.charCodeAt(pos) === 55349) {
            r2 = "\uD835";
            pos++;
          } else {
            r2 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\uD835\"");
            }
          }
          if (r2 !== null) {
            if (/^[\uDFCE-\uDFFF]/.test(input.charAt(pos))) {
              r3 = input.charAt(pos);
              pos++;
            } else {
              r3 = null;
              if (reportFailures === 0) {
                matchFailed("[\\uDFCE-\\uDFFF]");
              }
            }
            if (r3 !== null) {
              r0 = [r2, r3];
            } else {
              r0 = null;
              pos = r1;
            }
          } else {
            r0 = null;
            pos = r1;
          }
          if (r0 === null) {
            r1 = pos;
            if (input.charCodeAt(pos) === 55300) {
              r2 = "\uD804";
              pos++;
            } else {
              r2 = null;
              if (reportFailures === 0) {
                matchFailed("\"\\uD804\"");
              }
            }
            if (r2 !== null) {
              if (/^[\uDC66-\uDC6F]/.test(input.charAt(pos))) {
                r3 = input.charAt(pos);
                pos++;
              } else {
                r3 = null;
                if (reportFailures === 0) {
                  matchFailed("[\\uDC66-\\uDC6F]");
                }
              }
              if (r3 !== null) {
                r0 = [r2, r3];
              } else {
                r0 = null;
                pos = r1;
              }
            } else {
              r0 = null;
              pos = r1;
            }
            if (r0 === null) {
              r1 = pos;
              if (input.charCodeAt(pos) === 55297) {
                r2 = "\uD801";
                pos++;
              } else {
                r2 = null;
                if (reportFailures === 0) {
                  matchFailed("\"\\uD801\"");
                }
              }
              if (r2 !== null) {
                if (/^[\uDCA0-\uDCA9]/.test(input.charAt(pos))) {
                  r3 = input.charAt(pos);
                  pos++;
                } else {
                  r3 = null;
                  if (reportFailures === 0) {
                    matchFailed("[\\uDCA0-\\uDCA9]");
                  }
                }
                if (r3 !== null) {
                  r0 = [r2, r3];
                } else {
                  r0 = null;
                  pos = r1;
                }
              } else {
                r0 = null;
                pos = r1;
              }
            }
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_UnicodeConnectorPunctuation() {
        var cacheKey = "UnicodeConnectorPunctuation@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        if (/^[_\u203F\u2040\u2054\uFE33\uFE34\uFE4D-\uFE4F\uFF3F]/.test(input.charAt(pos))) {
          r0 = input.charAt(pos);
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("[_\\u203F\\u2040\\u2054\\uFE33\\uFE34\\uFE4D-\\uFE4F\\uFF3F]");
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_ZWNJ() {
        var cacheKey = "ZWNJ@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        if (input.charCodeAt(pos) === 8204) {
          r0 = "\u200C";
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("\"\\u200C\"");
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      function parse_ZWJ() {
        var cacheKey = "ZWJ@" + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var r0;
        
        if (input.charCodeAt(pos) === 8205) {
          r0 = "\u200D";
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("\"\\u200D\"");
          }
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  r0
        };
        return r0;
      }
      
      
      function cleanupExpected(expected) {
        expected.sort();
        
        var lastExpected = null;
        var cleanExpected = [];
        for (var i = 0; i < expected.length; i++) {
          if (expected[i] !== lastExpected) {
            cleanExpected.push(expected[i]);
            lastExpected = expected[i];
          }
        }
        return cleanExpected;
      }
      
      
      var CS = require("./nodes"),
      
        constructorLookup =
          { ';': CS.SeqOp
          , '=': CS.AssignOp
          , '&&': CS.LogicalAndOp
          , and: CS.LogicalAndOp
          , '||': CS.LogicalOrOp
          , or: CS.LogicalOrOp
          , '|': CS.BitOrOp
          , '^': CS.BitXorOp
          , '&': CS.BitAndOp
          , '?': CS.ExistsOp
          , '==': CS.EQOp
          , is: CS.EQOp
          , '!=': CS.NEQOp
          , isnt: CS.NEQOp
          , '<=': CS.LTEOp
          , '>=': CS.GTEOp
          , '<': CS.LTOp
          , '>': CS.GTOp
          , extends: CS.ExtendsOp
          , instanceof: CS.InstanceofOp
          , in: CS.InOp
          , of: CS.OfOp
          , '<<': CS.LeftShiftOp
          , '>>': CS.SignedRightShiftOp
          , '>>>': CS.UnsignedRightShiftOp
          , '+': CS.PlusOp
          , '-': CS.SubtractOp
          , '*': CS.MultiplyOp
          , '/': CS.DivideOp
          , '%': CS.RemOp
          , '**': CS.ExpOp
          },
      
        foldl = function(fn, memo, list){
          for(var i = 0, l = list.length; i < l; ++i)
            memo = fn(memo, list[i]);
          return memo;
        },
        foldr = function(fn, memo, list){
          for(var i = list.length; i--;)
            memo = fn(memo, list[i]);
          return memo;
        },
      
        createInterpolation = function(es){
          var init = new CS.String('').g();
          return foldl(function(memo, s){
            if(s instanceof CS.String) {
              var left = memo;
              while(left)
                if(left instanceof CS.String) {
                  if(left === init) {
                    c(left, s);
                    delete left.generated;
                  }
                  left.data = left.data + s.data;
                  return memo;
                } else if(left instanceof CS.ConcatOp) {
                  left = left.right
                } else {
                  break;
                }
            }
            return new CS.ConcatOp(memo, s);
          }, init, es);
        },
      
        createMemberExpression = function(e, accesses){
          return foldl(function(left, access){
            var F = function(){};
            F.prototype = access.op.prototype;
            var o = new F;
            // rather safely assumes access.op is returning non-Object
            access.op.apply(o, [left].concat(access.operands));
            return c(o.r(left.raw + access.raw), access);
          }, e, accesses);
        },
      
        isValidRegExpFlags = function(flags) {
          if(!flags) return true;
          if(flags.length > 4) return false;
          flags.sort();
          var flag = null;
          for(var i = 0, l = flags.length; i < l; ++i)
            if(flag == flags[i]) return false;
            else flag = flags[i];
          return true;
        },
      
        stripLeadingWhitespace = function(str){
          str = str.replace(/\s+$/, '');
          var attempt, match, matchStr = str, indent = null;
          while(match = /\n+([^\n\S]*)/.exec(matchStr)) {
            attempt = match[1];
            matchStr = matchStr.slice(match.index + match[0].length);
            if (indent == null || 0 < attempt.length && attempt.length < indent.length)
              indent = attempt;
          }
          if(indent) str = str.replace(new RegExp('\\n' + indent, 'g'), '\n');
          str = str.replace(/^\n/, '');
          return str;
        },
      
        // the identity function
        id = function(x){ return x; },
        // store raw parse information
        r = options.raw ? function(node){
          node.raw = text();
          return node;
        } : id,
        // store position information
        p = options.raw ? function(node){
          node.line = line();
          node.column = column();
          node.offset = offset();
          return node;
        } : id,
        // composition of r and p
        rp = options.raw ? function(node){ return r(p(node)); } : id,
        // copy position information
        c = options.raw ? function(to, from){
          to.line = from.line;
          to.column = from.column;
          to.offset = from.offset;
          return to;
        } : id;
      
      
      
      var result = parseFunctions[startRule]();
      
      /*
       * The parser is now in one of the following three states:
       *
       * 1. The parser successfully parsed the whole input.
       *
       *    - |result !== null|
       *    - |pos === input.length|
       *    - |rightmostFailuresExpected| may or may not contain something
       *
       * 2. The parser successfully parsed only a part of the input.
       *
       *    - |result !== null|
       *    - |pos < input.length|
       *    - |rightmostFailuresExpected| may or may not contain something
       *
       * 3. The parser did not successfully parse any part of the input.
       *
       *   - |result === null|
       *   - |pos === 0|
       *   - |rightmostFailuresExpected| contains at least one failure
       *
       * All code following this comment (including called functions) must
       * handle these states.
       */
      if (result === null || pos !== input.length) {
        reportedPos = Math.max(pos, rightmostFailuresPos);
        var found = reportedPos < input.length ? input.charAt(reportedPos) : null;
        var reportedPosDetails = computeReportedPosDetails();
        
        throw new this.SyntaxError(
          cleanupExpected(rightmostFailuresExpected),
          found,
          reportedPos,
          reportedPosDetails.line,
          reportedPosDetails.column
        );
      }
      
      return result;
    }
  };
  
  /* Thrown when a parser encounters a syntax error. */
  
  result.SyntaxError = function(expected, found, offset, line, column) {
    function buildMessage(expected, found) {
      var expectedHumanized, foundHumanized;
      
      switch (expected.length) {
        case 0:
          expectedHumanized = "end of input";
          break;
        case 1:
          expectedHumanized = expected[0];
          break;
        default:
          expectedHumanized = expected.slice(0, expected.length - 1).join(", ")
            + " or "
            + expected[expected.length - 1];
      }
      
      foundHumanized = found ? quote(found) : "end of input";
      
      return "Expected " + expectedHumanized + " but " + foundHumanized + " found.";
    }
    
    this.name = "SyntaxError";
    this.expected = expected;
    this.found = found;
    this.message = buildMessage(expected, found);
    this.offset = offset;
    this.line = line;
    this.column = column;
  };
  
  subclass(result.SyntaxError, Error);
  
  return result;
})();

});

require.define("/lib/coffee-script/optimiser.js",function(require,module,exports,__dirname,__filename,process,global){// Generated by CoffeeScript 2.0.0-dev
var all, any, beingDeclared, concat, concatMap, CS, declarationsFor, difference, envEnrichments, exports, foldl, foldl1, isFalsey, isTruthy, makeDispatcher, mayHaveSideEffects, union, usedAsExpression;
cache$ = require('./functional-helpers');
all = cache$.all;
any = cache$.any;
concat = cache$.concat;
concatMap = cache$.concatMap;
difference = cache$.difference;
foldl = cache$.foldl;
foldl1 = cache$.foldl1;
union = cache$.union;
cache$1 = require('./helpers');
beingDeclared = cache$1.beingDeclared;
declarationsFor = cache$1.declarationsFor;
usedAsExpression = cache$1.usedAsExpression;
envEnrichments = cache$1.envEnrichments;
CS = require('./nodes');
exports = null != ('undefined' !== typeof module && null != module ? module.exports : void 0) ? 'undefined' !== typeof module && null != module ? module.exports : void 0 : this;
makeDispatcher = function (defaultValue, handlers, defaultHandler) {
  var cache$2, ctor, ctors, handler, handlers_, size$;
  if (null == defaultHandler)
    defaultHandler = function () {
    };
  handlers_ = {};
  for (var i$ = 0, length$ = handlers.length; i$ < length$; ++i$) {
    {
      cache$2 = handlers[i$];
      size$ = cache$2.length;
      ctors = size$ > 1 ? [].slice.call(cache$2, 0, size$ - 1) : [];
      handler = cache$2[size$ - 1];
    }
    for (var i$1 = 0, length$1 = ctors.length; i$1 < length$1; ++i$1) {
      ctor = ctors[i$1];
      handlers_[ctor.prototype.className] = handler;
    }
  }
  return function (node, args) {
    args = 2 <= arguments.length ? [].slice.call(arguments, 1) : [];
    if (!(null != node))
      return defaultValue;
    handler = Object.prototype.hasOwnProperty.call(handlers_, node.className) ? handlers_[node.className] : defaultHandler;
    return handler.apply(node, args);
  };
};
isTruthy = makeDispatcher(false, [
  [
    CS.ArrayInitialiser,
    CS.Class,
    CS.DeleteOp,
    CS.ForIn,
    CS.ForOf,
    CS.Function,
    CS.BoundFunction,
    CS.HeregExp,
    CS.ObjectInitialiser,
    CS.Range,
    CS.RegExp,
    CS.Slice,
    CS.TypeofOp,
    CS.While,
    function () {
      return true;
    }
  ],
  [
    CS.AssignOp,
    function () {
      return isTruthy(this.expression);
    }
  ],
  [
    CS.Block,
    function () {
      if (this.statements.length === 0) {
        return false;
      } else {
        return isTruthy(this.statements[this.statements.length - 1]);
      }
    }
  ],
  [
    CS.Bool,
    CS.Float,
    CS.Int,
    CS.String,
    function () {
      return !!this.data;
    }
  ],
  [
    CS.Conditional,
    function () {
      return isTruthy(this.condition) && isTruthy(this.consequent) || isFalsey(this.condition) && isTruthy(this.alternate);
    }
  ],
  [
    CS.LogicalAndOp,
    function () {
      return isTruthy(this.left) && isTruthy(this.right);
    }
  ],
  [
    CS.LogicalNotOp,
    function () {
      return isFalsey(this.expression);
    }
  ],
  [
    CS.LogicalOrOp,
    function () {
      return isTruthy(this.left) || isTruthy(this.right);
    }
  ],
  [
    CS.Program,
    function () {
      return isTruthy(this.body);
    }
  ],
  [
    CS.SeqOp,
    function () {
      return isTruthy(this.right);
    }
  ],
  [
    CS.Switch,
    function () {
      return all(this.cases, isTruthy) && (null != this.alternate ? isTruthy(this.alternate) : true);
    }
  ],
  [
    CS.SwitchCase,
    function () {
      return isTruthy(this.consequent);
    }
  ],
  [
    CS.UnaryExistsOp,
    function () {
      return isTruthy(this.expression) || this.expression['instanceof'](CS.Int, CS.Float, CS.String, CS.UnaryPlusOp, CS.UnaryNegateOp, CS.LogicalNotOp);
    }
  ]
], function () {
  return false;
});
isFalsey = makeDispatcher(false, [
  [
    CS.Null,
    CS.Undefined,
    function () {
      return true;
    }
  ],
  [
    CS.AssignOp,
    function () {
      return isFalsey(this.expression);
    }
  ],
  [
    CS.Block,
    function () {
      if (this.statements.length === 0) {
        return true;
      } else {
        return isFalsey(this.statements[this.statements.length - 1]);
      }
    }
  ],
  [
    CS.Bool,
    CS.Float,
    CS.Int,
    CS.String,
    function () {
      return !this.data;
    }
  ],
  [
    CS.Conditional,
    function () {
      return isTruthy(this.condition) && isFalsey(this.consequent) || isFalsey(this.condition) && isFalsey(this.alternate);
    }
  ],
  [
    CS.LogicalAndOp,
    function () {
      return isFalsey(this.left) || isFalsey(this.right);
    }
  ],
  [
    CS.LogicalNotOp,
    function () {
      return isTruthy(this.expression);
    }
  ],
  [
    CS.LogicalOrOp,
    function () {
      return isFalsey(this.left) && isFalsey(this.right);
    }
  ],
  [
    CS.Program,
    function () {
      return isFalsey(this.body);
    }
  ],
  [
    CS.SeqOp,
    function () {
      return isFalsey(this.right);
    }
  ],
  [
    CS.Switch,
    function () {
      return all(this.cases, isFalsey) && (null != this.alternate ? isFalsey(this.alternate) : true);
    }
  ],
  [
    CS.SwitchCase,
    function () {
      return isFalsey(this.block);
    }
  ],
  [
    CS.UnaryExistsOp,
    function () {
      return this.expression['instanceof'](CS.Null, CS.Undefined);
    }
  ]
], function () {
  return false;
});
mayHaveSideEffects = makeDispatcher(false, [
  [
    CS.Function,
    CS.BoundFunction,
    CS.Null,
    CS.RegExp,
    CS.This,
    CS.Undefined,
    function () {
      return false;
    }
  ],
  [
    CS.Break,
    CS.Continue,
    CS.Debugger,
    CS.DeleteOp,
    CS.NewOp,
    CS.Return,
    CS.Super,
    CS.PreDecrementOp,
    CS.PreIncrementOp,
    CS.PostDecrementOp,
    CS.PostIncrementOp,
    CS.ClassProtoAssignOp,
    CS.Constructor,
    CS.Throw,
    CS.JavaScript,
    CS.ExtendsOp,
    function () {
      return true;
    }
  ],
  [
    CS.Class,
    function (inScope) {
      return mayHaveSideEffects(this.parent, inScope) || null != this.nameAssignee && (this.name || beingDeclared(this.nameAssignee).length > 0);
    }
  ],
  [
    CS.Conditional,
    function (inScope) {
      return mayHaveSideEffects(this.condition, inScope) || !isFalsey(this.condition) && mayHaveSideEffects(this.consequent, inScope) || !isTruthy(this.condition) && mayHaveSideEffects(this.alternate, inScope);
    }
  ],
  [
    CS.DoOp,
    function (inScope) {
      var args, newScope;
      if (!this.expression['instanceof'](CS.Functions))
        return true;
      newScope = difference(inScope, concatMap(this.expression.parameters, beingDeclared));
      args = function (accum$) {
        var p;
        for (var i$ = 0, length$ = this.expression.parameters.length; i$ < length$; ++i$) {
          p = this.expression.parameters[i$];
          accum$.push(p['instanceof'](CS.AssignOp) ? p.expression : p);
        }
        return accum$;
      }.call(this, []);
      if (any(args, function (a) {
          return mayHaveSideEffects(a, newScope);
        }))
        return true;
      return mayHaveSideEffects(this.expression.body, newScope);
    }
  ],
  [
    CS.ExistsOp,
    function (inScope) {
      if (mayHaveSideEffects(this.left, inScope))
        return true;
      if (this.left['instanceof'](CS.Undefined, CS.Null))
        return false;
      return mayHaveSideEffects(this.right, inScope);
    }
  ],
  [
    CS.FunctionApplication,
    CS.SoakedFunctionApplication,
    function (inScope) {
      var newScope;
      if (!this['function']['instanceof'](CS.Function, CS.BoundFunction))
        return true;
      newScope = difference(inScope, concatMap(this['function'].parameters, beingDeclared));
      if (any(this['arguments'], function (a) {
          return mayHaveSideEffects(a, newScope);
        }))
        return true;
      return mayHaveSideEffects(this['function'].body, newScope);
    }
  ],
  [
    CS.LogicalAndOp,
    function (inScope) {
      if (mayHaveSideEffects(this.left, inScope))
        return true;
      if (isFalsey(this.left))
        return false;
      return mayHaveSideEffects(this.right, inScope);
    }
  ],
  [
    CS.LogicalOrOp,
    function (inScope) {
      if (mayHaveSideEffects(this.left, inScope))
        return true;
      if (isTruthy(this.left))
        return false;
      return mayHaveSideEffects(this.right, inScope);
    }
  ],
  [
    CS.While,
    function (inScope) {
      return mayHaveSideEffects(this.condition, inScope) || !isFalsey(this.condition) && mayHaveSideEffects(this.body, inScope);
    }
  ],
  [
    CS.AssignOp,
    CS.ClassProtoAssignOp,
    CS.CompoundAssignOp,
    CS.ExistsAssignOp,
    function (inScope) {
      return true;
    }
  ],
  [
    CS.Bool,
    CS.Float,
    CS.Identifier,
    CS.Int,
    CS.String,
    function () {
      return false;
    }
  ]
], function (inScope) {
  var this$;
  return any(this.childNodes, (this$ = this, function (child) {
    if (in$(child, this$.listMembers)) {
      return any(this$[child], function (m) {
        return mayHaveSideEffects(m, inScope);
      });
    } else {
      return mayHaveSideEffects(this$[child], inScope);
    }
  }));
});
exports.Optimiser = function () {
  var defaultRules, this$;
  Optimiser.optimise = (this$ = Optimiser, function () {
    var cache$2;
    return (cache$2 = new this$).optimise.apply(cache$2, [].slice.call(arguments).concat());
  });
  Optimiser.isTruthy = isTruthy;
  Optimiser.isFalsey = isFalsey;
  Optimiser.mayHaveSideEffects = mayHaveSideEffects;
  defaultRules = [
    [
      CS.Program,
      function () {
        if (null != this.body && mayHaveSideEffects(this.body, [])) {
          return this;
        } else {
          return new CS.Program(null);
        }
      }
    ],
    [
      CS.Block,
      function (param$) {
        var inScope;
        inScope = param$.inScope;
        switch (this.statements.length) {
        case 0:
          return new CS.Undefined().g();
        case 1:
          return this.statements[0];
        default:
          return foldl(this.statements[0], this.statements.slice(1), function (expr, s) {
            return new CS.SeqOp(expr, s);
          });
        }
      }
    ],
    [
      CS.SeqOp,
      function (param$) {
        var ancestry, cache$2, canDropLast, decls, inScope;
        {
          cache$2 = param$;
          inScope = cache$2.inScope;
          ancestry = cache$2.ancestry;
        }
        canDropLast = !usedAsExpression(this, ancestry);
        if (mayHaveSideEffects(this.left, inScope)) {
          if (mayHaveSideEffects(this.right, inScope)) {
            return this;
          } else if (!canDropLast) {
            return this;
          } else if (this.right['instanceof'](CS.Undefined)) {
            return this.left;
          } else {
            return new CS.SeqOp(this.left, declarationsFor(this.right, union(inScope, envEnrichments(this.left, inScope))));
          }
        } else if (this.right['instanceof'](CS.Identifier) && this.right.data === 'eval' && ((null != ancestry[0] ? ancestry[0]['instanceof'](CS.FunctionApplication) : void 0) && ancestry[0]['function'] === this || (null != ancestry[0] ? ancestry[0]['instanceof'](CS.DoOp) : void 0) && ancestry[0].expression === this)) {
          if (this.left['instanceof'](CS.Int) && (0 <= this.left.data && this.left.data <= 9)) {
            return this;
          } else if (mayHaveSideEffects(this.left, inScope)) {
            return this;
          } else {
            return new CS.SeqOp(new CS.Int(0).g(), this.right);
          }
        } else if (mayHaveSideEffects(this.right, inScope)) {
          decls = declarationsFor(this.left, inScope);
          if (decls['instanceof'](CS.Undefined)) {
            return this.right;
          } else {
            return this;
          }
        } else if (canDropLast) {
          return declarationsFor(this, inScope);
        } else {
          return this.right;
        }
      }
    ],
    [
      CS.AssignOp,
      function () {
        if (!this.expression['instanceof'](CS.SeqOp))
          return this;
        return new CS.SeqOp(this.expression.left, new CS.AssignOp(this.assignee, this.expression.right));
      }
    ],
    [
      CS.While,
      function (param$) {
        var inScope;
        inScope = param$.inScope;
        if (isFalsey(this.condition)) {
          return new CS.Block([
            mayHaveSideEffects(this.condition, inScope) ? new CS.SeqOp(this.condition, declarationsFor(this.body)) : null != this.body ? declarationsFor(this.body, inScope) : new CS.Undefined,
            new CS.ArrayInitialiser([])
          ]);
        } else if (isTruthy(this.condition)) {
          if (mayHaveSideEffects(this.condition, inScope)) {
            return this;
          } else if (null != this.body) {
            if (this instanceof CS.Loop) {
              return this;
            } else {
              return new CS.Loop(this.body).g();
            }
          } else {
            return new CS.ArrayInitialiser([]);
          }
        } else {
          return this;
        }
      }
    ],
    [
      CS.Conditional,
      function (param$) {
        var block, cache$2, cache$3, decls, inScope, removedBlock;
        inScope = param$.inScope;
        if (isFalsey(this.condition)) {
          cache$2 = [
            this.consequent,
            this.alternate
          ];
          removedBlock = cache$2[0];
          block = cache$2[1];
          cache$2;
        } else if (isTruthy(this.condition)) {
          cache$3 = [
            this.consequent,
            this.alternate
          ];
          block = cache$3[0];
          removedBlock = cache$3[1];
          cache$3;
        } else {
          return this;
        }
        decls = declarationsFor(removedBlock, inScope);
        block = null != block ? new CS.SeqOp(decls, block) : decls;
        if (mayHaveSideEffects(this.condition, inScope))
          block = new CS.SeqOp(this.condition, block);
        return block;
      }
    ],
    [
      CS.ForIn,
      function (param$) {
        var inScope;
        inScope = param$.inScope;
        if (!(this.target['instanceof'](CS.ArrayInitialiser) && this.target.members.length === 0))
          return this;
        return new CS.SeqOp(declarationsFor(this, inScope), new CS.ArrayInitialiser([]).g());
      }
    ],
    [
      CS.ForOf,
      function (param$) {
        var inScope;
        inScope = param$.inScope;
        if (!(this.isOwn && this.target['instanceof'](CS.ObjectInitialiser) && this.target.members.length === 0))
          return this;
        return new CS.SeqOp(declarationsFor(this, inScope), new CS.ArrayInitialiser([]).g());
      }
    ],
    [
      CS.ForIn,
      CS.ForOf,
      function (param$) {
        var inScope;
        inScope = param$.inScope;
        if (!isFalsey(this.filter))
          return this;
        return new CS.SeqOp(declarationsFor(this, inScope), new CS.ArrayInitialiser([]).g());
      }
    ],
    [
      CS.ForIn,
      function () {
        if (!isTruthy(this.filter))
          return this;
        return new CS.ForIn(this.valAssignee, this.keyAssignee, this.target, this.step, null, this.body);
      }
    ],
    [
      CS.ForOf,
      function () {
        if (!isTruthy(this.filter))
          return this;
        return new CS.ForOf(this.isOwn, this.keyAssignee, this.valAssignee, this.target, null, this.body);
      }
    ],
    [
      CS.ArrayInitialiser,
      function (param$) {
        var ancestry, cache$2, inScope;
        {
          cache$2 = param$;
          inScope = cache$2.inScope;
          ancestry = cache$2.ancestry;
        }
        if (usedAsExpression(this, ancestry)) {
          return this;
        } else {
          return foldl(new CS.Undefined().g(), this.members, function (expr, m) {
            return new CS.SeqOp(expr, m);
          });
        }
      }
    ],
    [
      CS.ExistsOp,
      function () {
        if (this.left['instanceof'](CS.Null, CS.Undefined)) {
          return this.right;
        } else {
          return this;
        }
      }
    ],
    [
      CS.UnaryExistsOp,
      function () {
        if (this.expression['instanceof'](CS.Null, CS.Undefined)) {
          return new CS.Bool(false).g();
        } else {
          return this;
        }
      }
    ],
    [
      CS.LogicalNotOp,
      function (param$) {
        var inScope;
        inScope = param$.inScope;
        switch (false) {
        case !this.expression['instanceof'](CS.Int, CS.Float, CS.String, CS.Bool):
          return new CS.Bool(!this.expression.data).g();
        case !this.expression['instanceof'](CS.Functions):
          return new CS.Bool(false).g();
        case !this.expression['instanceof'](CS.Null, CS.Undefined):
          return new CS.Bool(true).g();
        case !this.expression['instanceof'](CS.ArrayInitialiser, CS.ObjectInitialiser):
          if (mayHaveSideEffects(this.expression, inScope)) {
            return this;
          } else {
            return new CS.SeqOp(declarationsFor(this.expression, inScope), new CS.Bool(false).g());
          }
        case !this.expression['instanceof'](CS.LogicalNotOp):
          if (this.expression.expression['instanceof'](CS.LogicalNotOp)) {
            return this.expression.expression;
          } else {
            return this;
          }
        default:
          return this;
        }
      }
    ],
    [
      CS.TypeofOp,
      function () {
        switch (false) {
        case !this.expression['instanceof'](CS.Int, CS.Float, CS.UnaryNegateOp, CS.UnaryPlusOp):
          return new CS.String('number').g();
        case !this.expression['instanceof'](CS.String):
          return new CS.String('string').g();
        case !this.expression['instanceof'](CS.Functions):
          return new CS.String('function').g();
        case !this.expression['instanceof'](CS.Undefined):
          return new CS.String('undefined').g();
        default:
          return this;
        }
      }
    ],
    [
      CS.SeqOp,
      function (param$) {
        var ancestry;
        ancestry = param$.ancestry;
        if (!((null != ancestry[0] ? ancestry[0]['instanceof'](CS.Functions) : void 0) && ancestry[0].body === this))
          return this;
        if (this.right['instanceof'](CS.Return) && null != this.right.expression) {
          return new CS.SeqOp(this.left, this.right.expression);
        } else if (this.right['instanceof'](CS.Undefined)) {
          return new CS.SeqOp(this.left, new CS.Return);
        } else {
          return this;
        }
      }
    ],
    [
      CS.Function,
      CS.BoundFunction,
      function () {
        if (!(null != this.block && (this.block['instanceof'](CS.Undefined) || this.block['instanceof'](CS.Return) && !(null != this.block.expression))))
          return this;
        return new this.constructor(this.parameters, null);
      }
    ],
    [
      CS.Return,
      function () {
        if (null != this.expression ? this.expression['instanceof'](CS.Undefined) : void 0) {
          return new CS.Return;
        } else {
          return this;
        }
      }
    ],
    [
      CS.Slice,
      function () {
        if ((null != this.left ? this.left['instanceof'](CS.Int, CS.String) : void 0) && +this.left.data === 0) {
          return new CS.Slice(this.expression, this.isInclusive, null, this.right);
        } else if (this.isInclusive && (null != this.right ? this.right['instanceof'](CS.UnaryNegateOp) : void 0) && this.right.expression['instanceof'](CS.Int) && this.right.expression.data === 1) {
          return new CS.Slice(this.expression, true, this.left, null);
        } else {
          return this;
        }
      }
    ]
  ];
  function Optimiser() {
    var cache$2, ctor, ctors, handler, size$;
    this.rules = {};
    for (var i$ = 0, length$ = defaultRules.length; i$ < length$; ++i$) {
      {
        cache$2 = defaultRules[i$];
        size$ = cache$2.length;
        ctors = size$ > 1 ? [].slice.call(cache$2, 0, size$ - 1) : [];
        handler = cache$2[size$ - 1];
      }
      for (var i$1 = 0, length$1 = ctors.length; i$1 < length$1; ++i$1) {
        ctor = ctors[i$1];
        this.addRule(ctor.prototype.className, handler);
      }
    }
  }
  Optimiser.prototype.addRule = function (ctor, handler) {
    (null != this.rules[ctor] ? this.rules[ctor] : this.rules[ctor] = []).push(handler);
    return this;
  };
  Optimiser.prototype.optimise = function () {
    var walk;
    walk = function (fn, inScope, ancestry) {
      var childName, jsNode, member, n, p;
      if (null == inScope)
        inScope = [];
      if (null == ancestry)
        ancestry = [];
      if (!(null != this) || this === global)
        throw new Error('Optimiser rules must produce a node. `null` is not a node.');
      if (in$(this, ancestry))
        return this;
      ancestry.unshift(this);
      for (var i$ = 0, length$ = this.childNodes.length; i$ < length$; ++i$) {
        childName = this.childNodes[i$];
        if (!(null != this[childName]))
          continue;
        if (in$(childName, this.listMembers)) {
          for (var i$1 = 0, length$1 = this[childName].length; i$1 < length$1; ++i$1) {
            member = this[childName][i$1];
            n = i$1;
            while (this[childName][n] !== walk.call(this[childName][n] = fn.call(this[childName][n], {
                inScope: inScope,
                ancestry: ancestry
              }), fn, inScope, ancestry)) {
            }
            inScope = union(inScope, envEnrichments(this[childName][n], inScope));
          }
        } else {
          while (this[childName] !== walk.call(this[childName] = fn.call(this[childName], {
              inScope: inScope,
              ancestry: ancestry
            }), fn, inScope, ancestry)) {
          }
          inScope = union(inScope, envEnrichments(this[childName], inScope));
        }
      }
      ancestry.shift();
      jsNode = fn.call(this, {
        inScope: inScope,
        ancestry: ancestry
      });
      for (var cache$2 = [
            'raw',
            'line',
            'column',
            'offset'
          ], i$2 = 0, length$2 = cache$2.length; i$2 < length$2; ++i$2) {
        p = cache$2[i$2];
        jsNode[p] = this[p];
      }
      return jsNode;
    };
    return function (ast) {
      var rules;
      rules = this.rules;
      return walk.call(ast, function () {
        var cache$3, memo, oldClassName, rule;
        memo = this;
        oldClassName = null;
        while (oldClassName !== memo.className) {
          for (var cache$2 = (cache$3 = rules[oldClassName = memo.className], null != cache$3 ? cache$3 : []), i$ = 0, length$ = cache$2.length; i$ < length$; ++i$) {
            rule = cache$2[i$];
            memo = rule.apply(memo, arguments);
            if (!(oldClassName === memo.className))
              break;
          }
        }
        return memo;
      });
    };
  }();
  return Optimiser;
}();
function in$(member, list) {
  for (var i = 0, length = list.length; i < length; ++i)
    if (i in list && list[i] === member)
      return true;
  return false;
}

});

require.define("/lib/coffee-script/compiler.js",function(require,module,exports,__dirname,__filename,process,global){// Generated by CoffeeScript 2.0.0-dev
var any, assignment, beingDeclared, collectIdentifiers, concat, concatMap, CS, declarationsNeeded, declarationsNeededRecursive, difference, divMod, dynamicMemberAccess, enabledHelpers, envEnrichments, exports, expr, fn, fn, foldl1, forceBlock, generateMutatingWalker, generateSoak, genSym, h, h, hasSoak, helperNames, helpers, inlineHelpers, JS, jsReserved, makeReturn, makeVarDeclaration, map, memberAccess, needsCaching, nub, owns, span, stmt, union, usedAsExpression;
cache$ = require('./functional-helpers');
any = cache$.any;
concat = cache$.concat;
concatMap = cache$.concatMap;
difference = cache$.difference;
divMod = cache$.divMod;
foldl1 = cache$.foldl1;
map = cache$.map;
nub = cache$.nub;
owns = cache$.owns;
span = cache$.span;
union = cache$.union;
cache$1 = require('./helpers');
beingDeclared = cache$1.beingDeclared;
usedAsExpression = cache$1.usedAsExpression;
envEnrichments = cache$1.envEnrichments;
CS = require('./nodes');
JS = require('./js-nodes');
exports = null != ('undefined' !== typeof module && null != module ? module.exports : void 0) ? 'undefined' !== typeof module && null != module ? module.exports : void 0 : this;
jsReserved = [
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'native',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'arguments',
  'eval'
];
genSym = function () {
  var genSymCounter;
  genSymCounter = 0;
  return function (pre) {
    return new JS.GenSym(pre, ++genSymCounter);
  };
}();
stmt = function (e) {
  var walk;
  if (!(null != e))
    return e;
  if (e.isStatement) {
    return e;
  } else if (e['instanceof'](JS.SequenceExpression)) {
    walk = function (seq) {
      return concatMap(seq.expressions, function (e) {
        if (e['instanceof'](JS.SequenceExpression)) {
          return walk(e);
        } else {
          return [stmt(e)];
        }
      });
    };
    return new JS.BlockStatement(walk(e));
  } else if (e['instanceof'](JS.ConditionalExpression)) {
    return new JS.IfStatement(expr(e.test), stmt(e.consequent), stmt(e.alternate));
  } else {
    return new JS.ExpressionStatement(e);
  }
};
expr = function (s) {
  var accum, alternate, block, consequent, iife, lastExpression, push;
  if (!(null != s))
    return s;
  if (s.isExpression) {
    return s;
  } else if (s['instanceof'](JS.BlockStatement)) {
    switch (s.body.length) {
    case 0:
      return helpers.undef();
    case 1:
      return expr(s.body[0]);
    default:
      return new JS.SequenceExpression(map(s.body, expr));
    }
  } else if (s['instanceof'](JS.ExpressionStatement)) {
    return s.expression;
  } else if (s['instanceof'](JS.ThrowStatement)) {
    return new JS.CallExpression(new JS.FunctionExpression(null, [], forceBlock(s)), []);
  } else if (s['instanceof'](JS.IfStatement)) {
    consequent = expr(null != s.consequent ? s.consequent : helpers.undef());
    alternate = expr(null != s.alternate ? s.alternate : helpers.undef());
    return new JS.ConditionalExpression(s.test, consequent, alternate);
  } else if (s['instanceof'](JS.ForInStatement, JS.ForStatement, JS.WhileStatement)) {
    accum = genSym('accum');
    push = function (x) {
      return stmt(new JS.CallExpression(memberAccess(accum, 'push'), [x]));
    };
    s.body = forceBlock(s.body);
    if (s.body.body.length) {
      lastExpression = s.body.body.slice(-1)[0];
      if (!lastExpression['instanceof'](JS.ThrowStatement))
        s.body.body[s.body.body.length - 1] = push(expr(lastExpression));
    } else {
      s.body.body.push(push(helpers.undef()));
    }
    block = new JS.BlockStatement([
      s,
      new JS.ReturnStatement(accum)
    ]);
    iife = new JS.FunctionExpression(null, [accum], block);
    return new JS.CallExpression(memberAccess(iife, 'call'), [
      new JS.ThisExpression,
      new JS.ArrayExpression([])
    ]);
  } else if (s['instanceof'](JS.SwitchStatement, JS.TryStatement)) {
    block = new JS.BlockStatement([makeReturn(s)]);
    iife = new JS.FunctionExpression(null, [], block);
    return new JS.CallExpression(memberAccess(iife, 'call'), [new JS.ThisExpression]);
  } else {
    throw new Error('expr: Cannot use a ' + s.type + ' as a value');
  }
};
makeReturn = function (node) {
  var stmts;
  if (!(null != node))
    return new JS.ReturnStatement;
  if (node['instanceof'](JS.BlockStatement)) {
    return new JS.BlockStatement([].slice.call(node.body.slice(0, -1)).concat([makeReturn(node.body.slice(-1)[0])]));
  } else if (node['instanceof'](JS.SequenceExpression)) {
    return new JS.SequenceExpression([].slice.call(node.expressions.slice(0, -1)).concat([makeReturn(node.expressions.slice(-1)[0])]));
  } else if (node['instanceof'](JS.IfStatement)) {
    return new JS.IfStatement(node.test, makeReturn(node.consequent), null != node.alternate ? makeReturn(node.alternate) : null);
  } else if (node['instanceof'](JS.SwitchStatement)) {
    return new JS.SwitchStatement(node.discriminant, map(node.cases, makeReturn));
  } else if (node['instanceof'](JS.SwitchCase)) {
    if (!node.consequent.length)
      return node;
    stmts = node.consequent.slice(-1)[0]['instanceof'](JS.BreakStatement) ? node.consequent.slice(0, -1) : node.consequent;
    return new JS.SwitchCase(node.test, [].slice.call(stmts.slice(0, -1)).concat([makeReturn(stmts.slice(-1)[0])]));
  } else if (node['instanceof'](JS.TryStatement)) {
    return new JS.TryStatement(makeReturn(node.block), map(node.handlers, makeReturn), null != node.finalizer ? makeReturn(node.finalizer) : null);
  } else if (node['instanceof'](JS.CatchClause)) {
    return new JS.CatchClause(node.param, makeReturn(node.body));
  } else if (node['instanceof'](JS.ThrowStatement, JS.ReturnStatement, JS.BreakStatement, JS.ContinueStatement, JS.DebuggerStatement)) {
    return node;
  } else if (node['instanceof'](JS.UnaryExpression) && node.operator === 'void') {
    return new JS.ReturnStatement;
  } else {
    return new JS.ReturnStatement(expr(node));
  }
};
generateMutatingWalker = function (fn) {
  return function (node, args) {
    var childName;
    args = 2 <= arguments.length ? [].slice.call(arguments, 1) : [];
    for (var i$ = 0, length$ = node.childNodes.length; i$ < length$; ++i$) {
      childName = node.childNodes[i$];
      if (!(null != node[childName]))
        continue;
      node[childName] = in$(childName, node.listMembers) ? function (accum$) {
        var n;
        for (var i$1 = 0, length$1 = node[childName].length; i$1 < length$1; ++i$1) {
          n = node[childName][i$1];
          accum$.push(fn.apply(n, args));
        }
        return accum$;
      }.call(this, []) : fn.apply(node[childName], args);
    }
    return node;
  };
};
declarationsNeeded = function (node) {
  if (!(null != node))
    return [];
  if (node['instanceof'](JS.AssignmentExpression) && node.operator === '=' && node.left['instanceof'](JS.Identifier)) {
    return [node.left];
  } else if (node['instanceof'](JS.ForInStatement)) {
    return [node.left];
  } else {
    return [];
  }
};
declarationsNeededRecursive = function (node) {
  if (!(null != node))
    return [];
  if (node['instanceof'](JS.FunctionExpression, JS.FunctionDeclaration)) {
    return [];
  } else {
    return union(declarationsNeeded(node), concatMap(node.childNodes, function (childName) {
      if (!(null != node[childName]))
        return [];
      if (in$(childName, node.listMembers)) {
        return concatMap(node[childName], declarationsNeededRecursive);
      } else {
        return declarationsNeededRecursive(node[childName]);
      }
    }));
  }
};
collectIdentifiers = function (node) {
  return nub(function () {
    switch (false) {
    case !!(null != node):
      return [];
    case !node['instanceof'](JS.Identifier):
      return [node.name];
    case !(node['instanceof'](JS.MemberExpression) && !node.computed):
      return collectIdentifiers(node.object);
    default:
      return concatMap(node.childNodes, function (childName) {
        if (!(null != node[childName]))
          return [];
        if (in$(childName, node.listMembers)) {
          return concatMap(node[childName], collectIdentifiers);
        } else {
          return collectIdentifiers(node[childName]);
        }
      });
    }
  }.call(this));
};
needsCaching = function (node) {
  if (!(null != node))
    return false;
  return envEnrichments(node, []).length > 0 || node['instanceof'](CS.FunctionApplications, CS.DoOp, CS.NewOp, CS.ArrayInitialiser, CS.ObjectInitialiser, CS.RegExp, CS.HeregExp, CS.PreIncrementOp, CS.PostIncrementOp, CS.PreDecrementOp, CS.PostDecrementOp) || any(difference(node.childNodes, node.listMembers), function (n) {
    return needsCaching(node[n]);
  }) || any(node.listMembers, function (n) {
    return any(node[n], needsCaching);
  });
};
forceBlock = function (node) {
  if (!(null != node))
    return new JS.BlockStatement([]);
  node = stmt(node);
  if (node['instanceof'](JS.BlockStatement)) {
    return node;
  } else {
    return new JS.BlockStatement([node]);
  }
};
makeVarDeclaration = function (vars) {
  var decls;
  vars.sort(function (a, b) {
    a = a.name.toLowerCase();
    b = b.name.toLowerCase();
    if (a < b) {
      return -1;
    } else if (a > b) {
      return 1;
    } else {
      return 0;
    }
  });
  decls = function (accum$) {
    var v;
    for (var i$ = 0, length$ = vars.length; i$ < length$; ++i$) {
      v = vars[i$];
      accum$.push(new JS.VariableDeclarator(v));
    }
    return accum$;
  }.call(this, []);
  return new JS.VariableDeclaration('var', decls);
};
memberAccess = function (e, member) {
  var isIdentifierName;
  isIdentifierName = /^[$_a-z][$_a-z0-9]*$/i;
  if (in$(member, jsReserved) || !isIdentifierName.test(member)) {
    return new JS.MemberExpression(true, expr(e), new JS.Literal(member));
  } else {
    return new JS.MemberExpression(false, expr(e), new JS.Identifier(member));
  }
};
dynamicMemberAccess = function (e, index) {
  if (index['instanceof'](JS.Literal) && typeof index.value === 'string') {
    return memberAccess(e, index.value);
  } else {
    return new JS.MemberExpression(true, e, index);
  }
};
assignment = function (assignee, expression, valueUsed) {
  var alternate, assignments, consequent, e, elements, i, index, m, numElements, p, propName, restName, size, test;
  if (null == valueUsed)
    valueUsed = false;
  assignments = [];
  switch (false) {
  case !assignee.rest:
  case !assignee['instanceof'](JS.ArrayExpression):
    e = expr(expression);
    if (valueUsed || assignee.elements.length > 1) {
      e = genSym('cache');
      assignments.push(new JS.AssignmentExpression('=', e, expr(expression)));
    }
    elements = assignee.elements;
    for (var i$ = 0, length$ = elements.length; i$ < length$; ++i$) {
      m = elements[i$];
      i = i$;
      if (m.rest)
        break;
      assignments.push(assignment(m, dynamicMemberAccess(e, new JS.Literal(i)), valueUsed));
    }
    if (elements.length > 0) {
      if (elements.slice(-1)[0].rest) {
        numElements = elements.length;
        restName = elements[numElements - 1] = elements[numElements - 1].expression;
        test = new JS.BinaryExpression('<=', new JS.Literal(numElements), memberAccess(e, 'length'));
        consequent = helpers.slice(e, new JS.Literal(numElements - 1));
        alternate = new JS.ArrayExpression([]);
        assignments.push(stmt(new JS.AssignmentExpression('=', restName, new JS.ConditionalExpression(test, consequent, alternate))));
      } else if (any(elements, function (p) {
          return p.rest;
        })) {
        restName = index = null;
        for (var i$1 = 0, length$1 = elements.length; i$1 < length$1; ++i$1) {
          p = elements[i$1];
          i = i$1;
          if (!p.rest)
            continue;
          restName = p.expression;
          index = i;
          break;
        }
        elements.splice(index, 1);
        numElements = elements.length;
        size = genSym('size');
        assignments.push(new JS.AssignmentExpression('=', size, memberAccess(e, 'length')));
        test = new JS.BinaryExpression('>', size, new JS.Literal(numElements));
        consequent = helpers.slice(e, new JS.Literal(index), new JS.BinaryExpression('-', size, new JS.Literal(numElements - index)));
        assignments.push(new JS.AssignmentExpression('=', restName, new JS.ConditionalExpression(test, consequent, new JS.ArrayExpression([]))));
        for (var i$2 = 0, length$2 = elements.slice(index).length; i$2 < length$2; ++i$2) {
          p = elements.slice(index)[i$2];
          i = i$2;
          assignments.push(stmt(new JS.AssignmentExpression('=', p, new JS.MemberExpression(true, e, new JS.BinaryExpression('-', size, new JS.Literal(numElements - index - i))))));
        }
      }
      if (any(elements, function (p) {
          return p.rest;
        }))
        throw new Error('Positional destructuring assignments may not have more than one rest operator');
    }
    break;
  case !assignee['instanceof'](JS.ObjectExpression):
    e = expression;
    if (valueUsed || assignee.properties.length > 1) {
      e = genSym('cache');
      assignments.push(new JS.AssignmentExpression('=', e, expression));
    }
    for (var i$3 = 0, length$3 = assignee.properties.length; i$3 < length$3; ++i$3) {
      m = assignee.properties[i$3];
      propName = m.key['instanceof'](JS.Identifier) ? new JS.Literal(m.key.name) : m.key;
      assignments.push(assignment(m.value, dynamicMemberAccess(e, propName), valueUsed));
    }
    break;
  case !assignee['instanceof'](JS.Identifier, JS.GenSym, JS.MemberExpression):
    assignments.push(new JS.AssignmentExpression('=', assignee, expr(expression)));
    break;
  default:
    throw new Error('compile: assignment: unassignable assignee: ' + assignee.type);
  }
  switch (assignments.length) {
  case 0:
    if (e === expression) {
      return helpers.undef();
    } else {
      return expression;
    }
  case 1:
    return assignments[0];
  default:
    return new JS.SequenceExpression(valueUsed ? [].slice.call(assignments).concat([e]) : assignments);
  }
};
hasSoak = function (node) {
  switch (false) {
  case !node['instanceof'](CS.SoakedFunctionApplication, CS.SoakedMemberAccessOp, CS.SoakedProtoMemberAccessOp, CS.SoakedDynamicMemberAccessOp, CS.SoakedDynamicProtoMemberAccessOp):
    return true;
  case !node['instanceof'](CS.FunctionApplication):
    return hasSoak(node['function']);
  case !node['instanceof'](CS.MemberAccessOps):
    return hasSoak(node.expression);
  default:
    return false;
  }
};
generateSoak = function () {
  var fn;
  fn = function (node) {
    var cache$2, cache$3, cache$4, cache$5, cache$6, ctor, e, memberName, sym, tests, typeofTest;
    switch (false) {
    case !node['instanceof'](CS.MemberAccessOp, CS.ProtoMemberAccessOp):
      cache$2 = fn(node.expression);
      tests = cache$2[0];
      e = cache$2[1];
      return [
        tests,
        new node.constructor(e, node.memberName)
      ];
    case !node['instanceof'](CS.DynamicMemberAccessOp, CS.DynamicProtoMemberAccessOp):
      cache$3 = fn(node.expression);
      tests = cache$3[0];
      e = cache$3[1];
      return [
        tests,
        new node.constructor(e, node.indexingExpr)
      ];
    case !node['instanceof'](CS.FunctionApplication):
      cache$4 = fn(node['function']);
      tests = cache$4[0];
      e = cache$4[1];
      return [
        tests,
        new CS.FunctionApplication(e, node['arguments'])
      ];
    case !node['instanceof'](CS.SoakedFunctionApplication):
      cache$5 = fn(node['function']);
      tests = cache$5[0];
      e = cache$5[1];
      typeofTest = function (e) {
        return new CS.EQOp(new CS.String('function'), new CS.TypeofOp(e));
      };
      if (needsCaching(e)) {
        sym = new CS.GenSym('cache');
        return [
          [].slice.call(tests).concat([typeofTest(new CS.AssignOp(sym, e))]),
          new CS.FunctionApplication(sym, node['arguments'])
        ];
      } else {
        return [
          [].slice.call(tests).concat([typeofTest(e)]),
          new CS.FunctionApplication(e, node['arguments'])
        ];
      }
    case !node['instanceof'](CS.SoakedMemberAccessOp, CS.SoakedProtoMemberAccessOp, CS.SoakedDynamicMemberAccessOp, CS.SoakedDynamicProtoMemberAccessOp):
      memberName = function () {
        switch (false) {
        case !node['instanceof'](CS.SoakedMemberAccessOp, CS.SoakedProtoMemberAccessOp):
          return 'memberName';
        case !node['instanceof'](CS.SoakedDynamicMemberAccessOp, CS.SoakedDynamicProtoMemberAccessOp):
          return 'indexingExpr';
        }
      }.call(this);
      ctor = function () {
        switch (false) {
        case !node['instanceof'](CS.SoakedMemberAccessOp):
          return CS.MemberAccessOp;
        case !node['instanceof'](CS.SoakedProtoMemberAccessOp):
          return CS.ProtoMemberAccessOp;
        case !node['instanceof'](CS.SoakedDynamicMemberAccessOp):
          return CS.DynamicMemberAccessOp;
        case !node['instanceof'](CS.SoakedDynamicProtoMemberAccessOp):
          return CS.DynamicProtoMemberAccessOp;
        }
      }.call(this);
      cache$6 = fn(node.expression);
      tests = cache$6[0];
      e = cache$6[1];
      if (needsCaching(e)) {
        sym = new CS.GenSym('cache');
        return [
          [].slice.call(tests).concat([new CS.UnaryExistsOp(new CS.AssignOp(sym, e))]),
          new ctor(sym, node[memberName])
        ];
      } else {
        return [
          [].slice.call(tests).concat([new CS.UnaryExistsOp(e)]),
          new ctor(e, node[memberName])
        ];
      }
    default:
      return [
        [],
        node
      ];
    }
  };
  return function (node) {
    var cache$2, e, tests;
    cache$2 = fn(node);
    tests = cache$2[0];
    e = cache$2[1];
    return new CS.Conditional(foldl1(tests, function (memo, t) {
      return new CS.LogicalAndOp(memo, t);
    }), e);
  };
}();
helperNames = {};
helpers = {
  extends: function () {
    var block, child, ctor, f, key, parent, protoAccess;
    protoAccess = function (e) {
      return memberAccess(e, 'prototype');
    };
    child = new JS.Identifier('child');
    parent = new JS.Identifier('parent');
    ctor = new JS.Identifier('ctor');
    key = new JS.Identifier('key');
    block = [
      new JS.ForInStatement(key, parent, new JS.IfStatement(helpers.isOwn(parent, key), f = stmt(new JS.AssignmentExpression('=', new JS.MemberExpression(true, child, key), new JS.MemberExpression(true, parent, key))))),
      new JS.FunctionDeclaration(ctor, [], new JS.BlockStatement([stmt(new JS.AssignmentExpression('=', memberAccess(new JS.ThisExpression, 'constructor'), child))])),
      new JS.AssignmentExpression('=', protoAccess(ctor), protoAccess(parent)),
      new JS.AssignmentExpression('=', protoAccess(child), new JS.NewExpression(ctor, [])),
      new JS.AssignmentExpression('=', memberAccess(child, '__super__'), protoAccess(parent)),
      new JS.ReturnStatement(child)
    ];
    return new JS.FunctionDeclaration(helperNames['extends'], [
      child,
      parent
    ], new JS.BlockStatement(map(block, stmt)));
  },
  construct: function () {
    var args, block, child, ctor, fn, result;
    child = new JS.Identifier('child');
    ctor = new JS.Identifier('ctor');
    fn = new JS.Identifier('fn');
    args = new JS.Identifier('args');
    result = new JS.Identifier('result');
    block = [
      new JS.VariableDeclaration('var', [new JS.VariableDeclarator(fn, new JS.FunctionExpression(null, [], new JS.BlockStatement([])))]),
      new JS.AssignmentExpression('=', memberAccess(fn, 'prototype'), memberAccess(ctor, 'prototype')),
      new JS.VariableDeclaration('var', [
        new JS.VariableDeclarator(child, new JS.NewExpression(fn, [])),
        new JS.VariableDeclarator(result, new JS.CallExpression(memberAccess(ctor, 'apply'), [
          child,
          args
        ]))
      ]),
      new JS.ReturnStatement(new JS.ConditionalExpression(new JS.BinaryExpression('===', result, new JS.CallExpression(new JS.Identifier('Object'), [result])), result, child))
    ];
    return new JS.FunctionDeclaration(helperNames.construct, [
      ctor,
      args
    ], new JS.BlockStatement(map(block, stmt)));
  },
  isOwn: function () {
    var args, functionBody, hop, params;
    hop = memberAccess(new JS.ObjectExpression([]), 'hasOwnProperty');
    params = args = [
      new JS.Identifier('o'),
      new JS.Identifier('p')
    ];
    functionBody = [new JS.CallExpression(memberAccess(hop, 'call'), args)];
    return new JS.FunctionDeclaration(helperNames.isOwn, params, makeReturn(new JS.BlockStatement(map(functionBody, stmt))));
  },
  in: function () {
    var functionBody, i, length, list, loopBody, member, varDeclaration;
    member = new JS.Identifier('member');
    list = new JS.Identifier('list');
    i = new JS.Identifier('i');
    length = new JS.Identifier('length');
    varDeclaration = new JS.VariableDeclaration('var', [
      new JS.VariableDeclarator(i, new JS.Literal(0)),
      new JS.VariableDeclarator(length, memberAccess(list, 'length'))
    ]);
    loopBody = new JS.IfStatement(new JS.BinaryExpression('&&', new JS.BinaryExpression('in', i, list), new JS.BinaryExpression('===', new JS.MemberExpression(true, list, i), member)), new JS.ReturnStatement(new JS.Literal(true)));
    functionBody = [
      new JS.ForStatement(varDeclaration, new JS.BinaryExpression('<', i, length), new JS.UpdateExpression('++', true, i), loopBody),
      new JS.Literal(false)
    ];
    return new JS.FunctionDeclaration(helperNames['in'], [
      member,
      list
    ], makeReturn(new JS.BlockStatement(map(functionBody, stmt))));
  }
};
enabledHelpers = [];
for (h in helpers) {
  if (!isOwn$(helpers, h))
    continue;
  fn = helpers[h];
  helperNames[h] = genSym(h);
  helpers[h] = function (h, fn) {
    return function () {
      enabledHelpers.push(fn());
      return (helpers[h] = function () {
        return new JS.CallExpression(helperNames[h], arguments);
      }).apply(this, arguments);
    };
  }(h, fn);
}
inlineHelpers = {
  exp: function () {
    return new JS.CallExpression(memberAccess(new JS.Identifier('Math'), 'pow'), arguments);
  },
  undef: function () {
    return new JS.UnaryExpression('void', new JS.Literal(0));
  },
  slice: function () {
    return new JS.CallExpression(memberAccess(memberAccess(new JS.ArrayExpression([]), 'slice'), 'call'), arguments);
  }
};
for (h in inlineHelpers) {
  if (!isOwn$(inlineHelpers, h))
    continue;
  fn = inlineHelpers[h];
  helpers[h] = fn;
}
exports.Compiler = function () {
  var defaultRules, this$;
  Compiler.compile = (this$ = Compiler, function () {
    var cache$2;
    return (cache$2 = new this$).compile.apply(cache$2, [].slice.call(arguments).concat());
  });
  defaultRules = [
    [
      CS.Program,
      function (param$) {
        var block, body, cache$2, decls, inScope, options, pkg, program;
        {
          cache$2 = param$;
          body = cache$2.body;
          inScope = cache$2.inScope;
          options = cache$2.options;
        }
        if (!(null != body))
          return new JS.Program([]);
        block = stmt(body);
        block = block['instanceof'](JS.BlockStatement) ? block.body : [block];
        [].push.apply(block, enabledHelpers);
        decls = nub(concatMap(block, declarationsNeededRecursive));
        if (decls.length > 0)
          if (options.bare) {
            block.unshift(makeVarDeclaration(decls));
          } else {
            block = [stmt(new JS.UnaryExpression('void', new JS.CallExpression(memberAccess(new JS.FunctionExpression(null, [], new JS.BlockStatement(block)), 'call'), [new JS.ThisExpression])))];
          }
        pkg = require('./../../package.json');
        program = new JS.Program(block);
        program.leadingComments = [{
            type: 'Line',
            value: ' Generated by CoffeeScript ' + pkg.version
          }];
        return program;
      }
    ],
    [
      CS.Block,
      function (param$) {
        var statements;
        statements = param$.statements;
        switch (statements.length) {
        case 0:
          return new JS.EmptyStatement;
        case 1:
          return new stmt(statements[0]);
        default:
          return new JS.BlockStatement(map(statements, stmt));
        }
      }
    ],
    [
      CS.SeqOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.SequenceExpression([
          left,
          right
        ]);
      }
    ],
    [
      CS.Conditional,
      function (param$) {
        var alternate, ancestry, cache$2, condition, consequent, inspect;
        {
          cache$2 = param$;
          condition = cache$2.condition;
          consequent = cache$2.consequent;
          alternate = cache$2.alternate;
          ancestry = cache$2.ancestry;
        }
        if (null != alternate) {
          if (!(null != consequent))
            throw new Error('Conditional with non-null alternate requires non-null consequent');
          if (!alternate['instanceof'](JS.IfStatement))
            alternate = forceBlock(alternate);
        }
        if (null != alternate || (null != ancestry[0] ? ancestry[0]['instanceof'](CS.Conditional) : void 0))
          consequent = forceBlock(consequent);
        inspect = function (o) {
          return require('util').inspect(o, false, 2, true);
        };
        return new JS.IfStatement(expr(condition), stmt(consequent), alternate);
      }
    ],
    [
      CS.ForIn,
      function (param$) {
        var block, body, cache$2, e, filter, i, keyAssignee, length, step, target, valAssignee, varDeclaration;
        {
          cache$2 = param$;
          valAssignee = cache$2.valAssignee;
          keyAssignee = cache$2.keyAssignee;
          target = cache$2.target;
          step = cache$2.step;
          filter = cache$2.filter;
          body = cache$2.body;
        }
        i = genSym('i');
        length = genSym('length');
        block = forceBlock(body);
        if (!block.body.length)
          block.body.push(stmt(helpers.undef()));
        e = needsCaching(this.target) ? genSym('cache') : target;
        varDeclaration = new JS.VariableDeclaration('var', [
          new JS.VariableDeclarator(i, new JS.Literal(0)),
          new JS.VariableDeclarator(length, memberAccess(e, 'length'))
        ]);
        if (!(e === target))
          varDeclaration.declarations.unshift(new JS.VariableDeclarator(e, target));
        if (null != this.filter)
          block.body.unshift(stmt(new JS.IfStatement(new JS.UnaryExpression('!', filter), new JS.ContinueStatement)));
        if (null != keyAssignee)
          block.body.unshift(stmt(assignment(keyAssignee, i)));
        block.body.unshift(stmt(assignment(valAssignee, new JS.MemberExpression(true, e, i))));
        return new JS.ForStatement(varDeclaration, new JS.BinaryExpression('<', i, length), new JS.UpdateExpression('++', true, i), block);
      }
    ],
    [
      CS.ForOf,
      function (param$) {
        var block, body, cache$2, e, filter, keyAssignee, right, target, valAssignee;
        {
          cache$2 = param$;
          keyAssignee = cache$2.keyAssignee;
          valAssignee = cache$2.valAssignee;
          target = cache$2.target;
          filter = cache$2.filter;
          body = cache$2.body;
        }
        block = forceBlock(body);
        if (!block.body.length)
          block.body.push(stmt(helpers.undef()));
        e = this.isOwn && needsCaching(this.target) ? genSym('cache') : expr(target);
        if (null != this.filter)
          block.body.unshift(stmt(new JS.IfStatement(new JS.UnaryExpression('!', filter), new JS.ContinueStatement)));
        if (null != valAssignee)
          block.body.unshift(stmt(assignment(valAssignee, new JS.MemberExpression(true, e, keyAssignee))));
        if (this.isOwn)
          block.body.unshift(stmt(new JS.IfStatement(new JS.UnaryExpression('!', helpers.isOwn(e, keyAssignee)), new JS.ContinueStatement)));
        right = e === target ? e : new JS.AssignmentExpression('=', e, target);
        return new JS.ForInStatement(keyAssignee, right, block);
      }
    ],
    [
      CS.While,
      function (param$) {
        var body, cache$2, condition;
        {
          cache$2 = param$;
          condition = cache$2.condition;
          body = cache$2.body;
        }
        return new JS.WhileStatement(expr(condition), forceBlock(body));
      }
    ],
    [
      CS.Switch,
      function (param$) {
        var alternate, c, cache$2, cases, expression;
        {
          cache$2 = param$;
          expression = cache$2.expression;
          cases = cache$2.cases;
          alternate = cache$2.alternate;
        }
        cases = concat(cases);
        if (!(null != expression)) {
          expression = new JS.Literal(false);
          for (var i$ = 0, length$ = cases.length; i$ < length$; ++i$) {
            c = cases[i$];
            c.test = new JS.UnaryExpression('!', c.test);
          }
        }
        if (null != alternate)
          cases.push(new JS.SwitchCase(null, [stmt(alternate)]));
        for (var i$1 = 0, length$1 = cases.slice(0, -1).length; i$1 < length$1; ++i$1) {
          c = cases.slice(0, -1)[i$1];
          if (!((null != c.consequent ? c.consequent.length : void 0) > 0))
            continue;
          c.consequent.push(new JS.BreakStatement);
        }
        return new JS.SwitchStatement(expression, cases);
      }
    ],
    [
      CS.SwitchCase,
      function (param$) {
        var block, cache$2, cases, conditions, consequent;
        {
          cache$2 = param$;
          conditions = cache$2.conditions;
          consequent = cache$2.consequent;
        }
        cases = map(conditions, function (c) {
          return new JS.SwitchCase(c, []);
        });
        block = stmt(consequent);
        block = null != block ? block['instanceof'](JS.BlockStatement) ? block.body : [block] : [];
        cases[cases.length - 1].consequent = block;
        return cases;
      }
    ],
    [
      CS.Try,
      function (param$) {
        var body, cache$2, catchAssignee, catchBlock, catchBody, e, finallyBlock, finallyBody, handlers;
        {
          cache$2 = param$;
          body = cache$2.body;
          catchAssignee = cache$2.catchAssignee;
          catchBody = cache$2.catchBody;
          finallyBody = cache$2.finallyBody;
        }
        finallyBlock = null != finallyBody ? forceBlock(finallyBody) : null;
        e = genSym('e');
        catchBlock = forceBlock(catchBody);
        if (null != catchAssignee)
          catchBlock.body.unshift(stmt(assignment(catchAssignee, e)));
        handlers = [new JS.CatchClause(e, catchBlock)];
        return new JS.TryStatement(forceBlock(body), handlers, finallyBlock);
      }
    ],
    [
      CS.Throw,
      function (param$) {
        var expression;
        expression = param$.expression;
        return new JS.ThrowStatement(expression);
      }
    ],
    [
      CS.Range,
      function (param$) {
        var accum, body, cache$2, condition, conditionAlternate, conditionConsequent, conditionTest, i, left, left_, range, rawLeft, rawRight, right, right_, update, vars;
        {
          cache$2 = param$;
          left_ = cache$2.left;
          right_ = cache$2.right;
        }
        if ((this.left['instanceof'](CS.Int) || this.left['instanceof'](CS.UnaryNegateOp) && this.left.expression['instanceof'](CS.Int)) && (this.right['instanceof'](CS.Int) || this.right['instanceof'](CS.UnaryNegateOp) && this.right.expression['instanceof'](CS.Int))) {
          rawLeft = this.left['instanceof'](CS.UnaryNegateOp) ? -this.left.expression.data : this.left.data;
          rawRight = this.right['instanceof'](CS.UnaryNegateOp) ? -this.right.expression.data : this.right.data;
          if (Math.abs(rawLeft - rawRight) <= 20) {
            range = this.isInclusive ? function () {
              var accum$;
              accum$ = [];
              for (var i$ = rawLeft; rawLeft <= rawRight ? i$ <= rawRight : i$ >= rawRight; rawLeft <= rawRight ? ++i$ : --i$)
                accum$.push(i$);
              return accum$;
            }.apply(this, arguments) : function () {
              var accum$;
              accum$ = [];
              for (var i$ = rawLeft; rawLeft <= rawRight ? i$ < rawRight : i$ > rawRight; rawLeft <= rawRight ? ++i$ : --i$)
                accum$.push(i$);
              return accum$;
            }.apply(this, arguments);
            return new JS.ArrayExpression(map(range, function (n) {
              if (n < 0) {
                return new JS.UnaryExpression('-', new JS.Literal(-n));
              } else {
                return new JS.Literal(n);
              }
            }));
          }
        }
        accum = genSym('accum');
        body = [stmt(new JS.AssignmentExpression('=', accum, new JS.ArrayExpression([])))];
        if (needsCaching(left_)) {
          left = genSym('from');
          body.push(stmt(new JS.AssignmentExpression('=', left, left_)));
        } else {
          left = left_;
        }
        if (needsCaching(right_)) {
          right = genSym('to');
          body.push(stmt(new JS.AssignmentExpression('=', right, right_)));
        } else {
          right = right_;
        }
        i = genSym('i');
        vars = new JS.VariableDeclaration('var', [new JS.VariableDeclarator(i, left)]);
        conditionTest = new JS.BinaryExpression('<=', left, right);
        conditionConsequent = new JS.BinaryExpression(this.isInclusive ? '<=' : '<', i, right);
        conditionAlternate = new JS.BinaryExpression(this.isInclusive ? '>=' : '>', i, right);
        condition = new JS.ConditionalExpression(conditionTest, conditionConsequent, conditionAlternate);
        update = new JS.ConditionalExpression(conditionTest, new JS.UpdateExpression('++', true, i), new JS.UpdateExpression('--', true, i));
        body.push(new JS.ForStatement(vars, condition, update, stmt(new JS.CallExpression(memberAccess(accum, 'push'), [i]))));
        body.push(new JS.ReturnStatement(accum));
        return new JS.CallExpression(memberAccess(new JS.FunctionExpression(null, [], new JS.BlockStatement(body)), 'apply'), [
          new JS.ThisExpression,
          new JS.Identifier('arguments')
        ]);
      }
    ],
    [
      CS.ArrayInitialiser,
      function () {
        var groupMembers;
        groupMembers = function (members) {
          var cache$2, cache$3, sliced, ys, zs;
          if (members.length === 0) {
            return [];
          } else {
            cache$2 = span(members, function (x) {
              return !x.spread;
            });
            ys = cache$2[0];
            zs = cache$2[1];
            if (ys.length === 0) {
              sliced = helpers.slice(zs[0].expression);
              cache$3 = [
                sliced,
                zs.slice(1)
              ];
              ys = cache$3[0];
              zs = cache$3[1];
              cache$3;
            } else {
              ys = new JS.ArrayExpression(map(ys, expr));
            }
            return [ys].concat(groupMembers(zs));
          }
        };
        return function (param$) {
          var cache$2, compile, grouped, members;
          {
            cache$2 = param$;
            members = cache$2.members;
            compile = cache$2.compile;
          }
          if (any(members, function (m) {
              return m.spread;
            })) {
            grouped = groupMembers(members);
            return new JS.CallExpression(memberAccess(grouped[0], 'concat'), grouped.slice(1));
          } else {
            return new JS.ArrayExpression(map(members, expr));
          }
        };
      }()
    ],
    [
      CS.Spread,
      function (param$) {
        var expression;
        expression = param$.expression;
        return {
          spread: true,
          expression: expression
        };
      }
    ],
    [
      CS.ObjectInitialiser,
      function (param$) {
        var members;
        members = param$.members;
        return new JS.ObjectExpression(members);
      }
    ],
    [
      CS.ObjectInitialiserMember,
      function (param$) {
        var cache$2, expression, key;
        {
          cache$2 = param$;
          key = cache$2.key;
          expression = cache$2.expression;
        }
        return new JS.Property(key, expr(expression));
      }
    ],
    [
      CS.DefaultParam,
      function (param$) {
        var cache$2, d, param;
        {
          cache$2 = param$;
          param = cache$2.param;
          d = cache$2['default'];
        }
        return {
          param: param,
          default: d
        };
      }
    ],
    [
      CS.Function,
      CS.BoundFunction,
      function () {
        var handleParam;
        handleParam = function (param, original, block) {
          var p;
          switch (false) {
          case !original['instanceof'](CS.Rest):
            return param;
          case !original['instanceof'](CS.Identifier):
            return param;
          case !original['instanceof'](CS.MemberAccessOps, CS.ObjectInitialiser, CS.ArrayInitialiser):
            p = genSym('param');
            block.body.unshift(stmt(assignment(param, p)));
            return p;
          case !original['instanceof'](CS.DefaultParam):
            block.body.unshift(new JS.IfStatement(new JS.BinaryExpression('==', new JS.Literal(null), param.param), stmt(new JS.AssignmentExpression('=', param.param, param['default']))));
            return handleParam.call(this, param.param, original.param, block);
          default:
            throw new Error('Unsupported parameter type: ' + original.className);
          }
        };
        return function (param$) {
          var alternate, ancestry, block, body, cache$2, consequent, i, index, last, newThis, numArgs, numParams, p, parameters, parameters_, paramName, performedRewrite, pIndex, reassignments, rewriteThis, test;
          {
            cache$2 = param$;
            parameters = cache$2.parameters;
            body = cache$2.body;
            ancestry = cache$2.ancestry;
          }
          if (!(null != ancestry[0] ? ancestry[0]['instanceof'](CS.Constructor) : void 0))
            body = makeReturn(body);
          block = forceBlock(body);
          last = block.body.slice(-1)[0];
          if ((null != last ? last['instanceof'](JS.ReturnStatement) : void 0) && !(null != last.argument))
            block.body = block.body.slice(0, -1);
          parameters_ = parameters.length === 0 ? [] : (pIndex = parameters.length, function (accum$) {
            while (pIndex--) {
              accum$.push(handleParam.call(this, parameters[pIndex], this.parameters[pIndex], block));
            }
            return accum$;
          }.call(this, []));
          parameters = parameters_.reverse();
          if (parameters.length > 0) {
            if (parameters.slice(-1)[0].rest) {
              numParams = parameters.length;
              paramName = parameters[numParams - 1] = parameters[numParams - 1].expression;
              test = new JS.BinaryExpression('<=', new JS.Literal(numParams), memberAccess(new JS.Identifier('arguments'), 'length'));
              consequent = helpers.slice(new JS.Identifier('arguments'), new JS.Literal(numParams - 1));
              alternate = new JS.ArrayExpression([]);
              block.body.unshift(stmt(new JS.AssignmentExpression('=', paramName, new JS.ConditionalExpression(test, consequent, alternate))));
            } else if (any(parameters, function (p) {
                return p.rest;
              })) {
              paramName = index = null;
              for (var i$ = 0, length$ = parameters.length; i$ < length$; ++i$) {
                p = parameters[i$];
                i = i$;
                if (!p.rest)
                  continue;
                paramName = p.expression;
                index = i;
                break;
              }
              parameters.splice(index, 1);
              numParams = parameters.length;
              numArgs = genSym('numArgs');
              reassignments = new JS.IfStatement(new JS.BinaryExpression('>', new JS.AssignmentExpression('=', numArgs, memberAccess(new JS.Identifier('arguments'), 'length')), new JS.Literal(numParams)), new JS.BlockStatement([stmt(new JS.AssignmentExpression('=', paramName, helpers.slice(new JS.Identifier('arguments'), new JS.Literal(index), new JS.BinaryExpression('-', numArgs, new JS.Literal(numParams - index)))))]), new JS.BlockStatement([stmt(new JS.AssignmentExpression('=', paramName, new JS.ArrayExpression([])))]));
              for (var i$1 = 0, length$1 = parameters.slice(index).length; i$1 < length$1; ++i$1) {
                p = parameters.slice(index)[i$1];
                i = i$1;
                reassignments.consequent.body.push(stmt(new JS.AssignmentExpression('=', p, new JS.MemberExpression(true, new JS.Identifier('arguments'), new JS.BinaryExpression('-', numArgs, new JS.Literal(numParams - index - i))))));
              }
              block.body.unshift(reassignments);
            }
            if (any(parameters, function (p) {
                return p.rest;
              }))
              throw new Error('Parameter lists may not have more than one rest operator');
          }
          performedRewrite = false;
          if (this['instanceof'](CS.BoundFunction)) {
            newThis = genSym('this');
            rewriteThis = generateMutatingWalker(function () {
              if (this['instanceof'](JS.ThisExpression)) {
                performedRewrite = true;
                return newThis;
              } else if (this['instanceof'](JS.FunctionExpression, JS.FunctionDeclaration)) {
                return this;
              } else {
                return rewriteThis(this);
              }
            });
            rewriteThis(block);
          }
          fn = new JS.FunctionExpression(null, parameters, block);
          if (performedRewrite) {
            return new JS.SequenceExpression([
              new JS.AssignmentExpression('=', newThis, new JS.ThisExpression),
              fn
            ]);
          } else {
            return fn;
          }
        };
      }()
    ],
    [
      CS.Rest,
      function (param$) {
        var expression;
        expression = param$.expression;
        return {
          rest: true,
          expression: expression,
          isExpression: true,
          isStatement: true
        };
      }
    ],
    [
      CS.Class,
      function (param$) {
        var args, block, body, c, cache$2, compile, ctor, ctorIndex, ctorRef, i, iife, instance, member, memberName, name, nameAssignee, params, parent, parentRef, protoAssignOp, protoMember, ps, rewriteThis;
        {
          cache$2 = param$;
          nameAssignee = cache$2.nameAssignee;
          parent = cache$2.parent;
          name = cache$2.name;
          ctor = cache$2.ctor;
          body = cache$2.body;
          compile = cache$2.compile;
        }
        args = [];
        params = [];
        parentRef = genSym('super');
        block = forceBlock(body);
        if (name['instanceof'](JS.Identifier) && in$(name.name, jsReserved))
          name = genSym(name.name);
        if (null != ctor) {
          for (var i$ = 0, length$ = block.body.length; i$ < length$; ++i$) {
            c = block.body[i$];
            i = i$;
            if (!c['instanceof'](JS.FunctionDeclaration))
              continue;
            ctorIndex = i;
            break;
          }
          block.body.splice(ctorIndex, 1, ctor);
        } else {
          ctor = new JS.FunctionDeclaration(name, [], new JS.BlockStatement([]));
          ctorIndex = 0;
          block.body.unshift(ctor);
        }
        ctor.id = name;
        if (null != this.ctor && !this.ctor.expression['instanceof'](CS.Functions)) {
          ctorRef = genSym('externalCtor');
          ctor.body.body.push(makeReturn(new JS.CallExpression(memberAccess(ctorRef, 'apply'), [
            new JS.ThisExpression,
            new JS.Identifier('arguments')
          ])));
          block.body.splice(ctorIndex, 0, stmt(new JS.AssignmentExpression('=', ctorRef, expr(compile(this.ctor.expression)))));
        }
        if (this.boundMembers.length > 0) {
          instance = genSym('instance');
          for (var i$1 = 0, length$1 = this.boundMembers.length; i$1 < length$1; ++i$1) {
            protoAssignOp = this.boundMembers[i$1];
            memberName = protoAssignOp.assignee.data.toString();
            ps = function (accum$) {
              var _;
              for (var i$2 = 0, length$2 = protoAssignOp.expression.parameters.length; i$2 < length$2; ++i$2) {
                _ = protoAssignOp.expression.parameters[i$2];
                accum$.push(genSym());
              }
              return accum$;
            }.call(this, []);
            member = memberAccess(new JS.ThisExpression, memberName);
            protoMember = memberAccess(memberAccess(name, 'prototype'), memberName);
            fn = new JS.FunctionExpression(null, ps, new JS.BlockStatement([makeReturn(new JS.CallExpression(memberAccess(protoMember, 'apply'), [
                instance,
                new JS.Identifier('arguments')
              ]))]));
            ctor.body.body.unshift(stmt(new JS.AssignmentExpression('=', member, fn)));
          }
          ctor.body.body.unshift(stmt(new JS.AssignmentExpression('=', instance, new JS.ThisExpression)));
        }
        if (null != parent) {
          params.push(parentRef);
          args.push(parent);
          block.body.unshift(stmt(helpers['extends'](name, parentRef)));
        }
        block.body.push(new JS.ReturnStatement(new JS.ThisExpression));
        rewriteThis = generateMutatingWalker(function () {
          if (this['instanceof'](JS.ThisExpression)) {
            return name;
          } else if (this['instanceof'](JS.FunctionExpression, JS.FunctionDeclaration)) {
            return this;
          } else {
            return rewriteThis(this);
          }
        });
        rewriteThis(block);
        iife = new JS.CallExpression(new JS.FunctionExpression(null, params, block), args);
        if (null != nameAssignee) {
          return assignment(nameAssignee, iife);
        } else {
          return iife;
        }
      }
    ],
    [
      CS.Constructor,
      function (param$) {
        var expression, tmpName;
        expression = param$.expression;
        tmpName = genSym('class');
        if (this.expression['instanceof'](CS.Functions)) {
          return new JS.FunctionDeclaration(tmpName, expression.params, forceBlock(expression.body));
        } else {
          return new JS.FunctionDeclaration(tmpName, [], new JS.BlockStatement([]));
        }
      }
    ],
    [
      CS.ClassProtoAssignOp,
      function (param$) {
        var assignee, cache$2, compile, expression, protoMember;
        {
          cache$2 = param$;
          assignee = cache$2.assignee;
          expression = cache$2.expression;
          compile = cache$2.compile;
        }
        if (this.expression['instanceof'](CS.BoundFunction)) {
          return compile(new CS.ClassProtoAssignOp(this.assignee, new CS.Function(this.expression.parameters, this.expression.body)));
        } else {
          protoMember = memberAccess(memberAccess(new JS.ThisExpression, 'prototype'), this.assignee.data);
          return new JS.AssignmentExpression('=', protoMember, expression);
        }
      }
    ],
    [
      CS.AssignOp,
      function (param$) {
        var ancestry, assignee, cache$2, expression;
        {
          cache$2 = param$;
          assignee = cache$2.assignee;
          expression = cache$2.expression;
          ancestry = cache$2.ancestry;
        }
        return assignment(assignee, expression, usedAsExpression(this, ancestry));
      }
    ],
    [
      CS.CompoundAssignOp,
      function (param$) {
        var assignee, cache$2, expression, op;
        {
          cache$2 = param$;
          assignee = cache$2.assignee;
          expression = cache$2.expression;
        }
        op = function () {
          switch (this.op) {
          case CS.LogicalAndOp.prototype.className:
            return '&&';
          case CS.LogicalOrOp.prototype.className:
            return '||';
          case CS.BitOrOp.prototype.className:
            return '|';
          case CS.BitXorOp.prototype.className:
            return '^';
          case CS.BitAndOp.prototype.className:
            return '&';
          case CS.LeftShiftOp.prototype.className:
            return '<<';
          case CS.SignedRightShiftOp.prototype.className:
            return '>>';
          case CS.UnsignedRightShiftOp.prototype.className:
            return '>>>';
          case CS.PlusOp.prototype.className:
            return '+';
          case CS.SubtractOp.prototype.className:
            return '-';
          case CS.MultiplyOp.prototype.className:
            return '*';
          case CS.DivideOp.prototype.className:
            return '/';
          case CS.RemOp.prototype.className:
            return '%';
          case CS.ExpOp.prototype.className:
            return '**';
          default:
            throw new Error('Unrecognised compound assignment operator');
          }
        }.call(this);
        if (op === '&&' || op === '||') {
          return new JS.BinaryExpression(op, assignee, new JS.AssignmentExpression('=', assignee, expr(expression)));
        } else if (op === '**') {
          return new JS.AssignmentExpression('=', assignee, helpers.exp(assignee, expr(expression)));
        } else {
          return new JS.AssignmentExpression('' + op + '=', assignee, expression);
        }
      }
    ],
    [
      CS.ExistsAssignOp,
      function (param$) {
        var assignee, cache$2, condition, expression, inScope;
        {
          cache$2 = param$;
          assignee = cache$2.assignee;
          expression = cache$2.expression;
          inScope = cache$2.inScope;
        }
        if (assignee['instanceof'](JS.Identifier) && !in$(assignee.name, inScope))
          throw new Error('the variable "' + assignee.name + '" can\'t be assigned with ?= because it has not been defined.');
        condition = new JS.BinaryExpression('!=', new JS.Literal(null), assignee);
        return new JS.ConditionalExpression(condition, assignee, new JS.AssignmentExpression('=', assignee, expr(expression)));
      }
    ],
    [
      CS.ChainedComparisonOp,
      function (param$) {
        var cache$2, compile, expression, left, lhs;
        {
          cache$2 = param$;
          expression = cache$2.expression;
          compile = cache$2.compile;
        }
        if (!this.expression.left['instanceof'](CS.ComparisonOps))
          return expression;
        left = expression.left.right;
        lhs = compile(new CS.ChainedComparisonOp(this.expression.left));
        if (needsCaching(this.expression.left.right)) {
          left = genSym('cache');
          if (this.expression.left.left['instanceof'](CS.ComparisonOps)) {
            lhs.right.right = new JS.AssignmentExpression('=', left, lhs.right.right);
          } else {
            lhs.right = new JS.AssignmentExpression('=', left, lhs.right);
          }
        }
        return new JS.BinaryExpression('&&', lhs, new JS.BinaryExpression(expression.operator, left, expression.right));
      }
    ],
    [
      CS.FunctionApplication,
      function (param$) {
        var args, cache$2, compile, context, lhs;
        {
          cache$2 = param$;
          fn = cache$2['function'];
          args = cache$2['arguments'];
          compile = cache$2.compile;
        }
        if (any(args, function (m) {
            return m.spread;
          })) {
          lhs = this['function'];
          context = new CS.Null;
          if (needsCaching(this['function'])) {
            context = new CS.GenSym('cache');
            lhs = this['function']['instanceof'](CS.StaticMemberAccessOps) ? new this['function'].constructor(new CS.AssignOp(context, lhs.expression), this['function'].memberName) : this['function']['instanceof'](CS.DynamicMemberAccessOps) ? new this['function'].constructor(new CS.AssignOp(context, lhs.expression), this['function'].indexingExpr) : new CS.AssignOp(context, lhs);
          } else if (lhs['instanceof'](CS.MemberAccessOps)) {
            context = lhs.expression;
          }
          if (this['function']['instanceof'](CS.ProtoMemberAccessOp, CS.DynamicProtoMemberAccessOp)) {
            context = new CS.MemberAccessOp(context, 'prototype');
          } else if (this['function']['instanceof'](CS.SoakedProtoMemberAccessOp, CS.SoakedDynamicProtoMemberAccessOp)) {
            context = new CS.SoakedMemberAccessOp(context, 'prototype');
          }
          return compile(new CS.FunctionApplication(new CS.MemberAccessOp(lhs, 'apply'), [
            context,
            new CS.ArrayInitialiser(this['arguments'])
          ]));
        } else if (hasSoak(this)) {
          return compile(generateSoak(this));
        } else {
          return new JS.CallExpression(expr(fn), map(args, expr));
        }
      }
    ],
    [
      CS.SoakedFunctionApplication,
      function (param$) {
        var compile;
        compile = param$.compile;
        return compile(generateSoak(this));
      }
    ],
    [
      CS.NewOp,
      function (param$) {
        var args, cache$2, compile, ctor;
        {
          cache$2 = param$;
          ctor = cache$2.ctor;
          args = cache$2['arguments'];
          compile = cache$2.compile;
        }
        if (any(args, function (m) {
            return m.spread;
          })) {
          return helpers.construct(ctor, compile(new CS.ArrayInitialiser(this['arguments'])));
        } else {
          return new JS.NewExpression(ctor, map(args, expr));
        }
      }
    ],
    [
      CS.HeregExp,
      function (param$) {
        var args, expression, flags;
        expression = param$.expression;
        args = [expression];
        if (flags = function (accum$) {
            var flag;
            for (var cache$2 = [
                  'g',
                  'i',
                  'm',
                  'y'
                ], i$ = 0, length$ = cache$2.length; i$ < length$; ++i$) {
              flag = cache$2[i$];
              if (!this.flags[flag])
                continue;
              accum$.push(flag);
            }
            return accum$;
          }.call(this, []).join(''))
          args.push(new JS.Literal(flags));
        return new JS.NewExpression(new JS.Identifier('RegExp'), args);
      }
    ],
    [
      CS.RegExp,
      function () {
        var flags, re;
        flags = function (accum$) {
          var flag;
          for (var cache$2 = [
                'g',
                'i',
                'm',
                'y'
              ], i$ = 0, length$ = cache$2.length; i$ < length$; ++i$) {
            flag = cache$2[i$];
            if (!this.flags[flag])
              continue;
            accum$.push(flag);
          }
          return accum$;
        }.call(this, []).join('');
        re = new RegExp(this.data, flags);
        return new JS.Literal(re);
      }
    ],
    [
      CS.ConcatOp,
      function (param$) {
        var ancestry, cache$2, left, leftmost, plusOp, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
          ancestry = cache$2.ancestry;
        }
        plusOp = new JS.BinaryExpression('+', expr(left), expr(right));
        if (!ancestry[0]['instanceof'](CS.ConcatOp)) {
          leftmost = plusOp;
          while (null != (null != leftmost.left ? leftmost.left.left : void 0)) {
            leftmost = leftmost.left;
          }
          if (!(leftmost.left['instanceof'](JS.Literal) && 'string' === typeof leftmost.left.value))
            leftmost.left = new JS.BinaryExpression('+', new JS.Literal(''), leftmost.left);
        }
        return plusOp;
      }
    ],
    [
      CS.MemberAccessOp,
      CS.SoakedMemberAccessOp,
      function (param$) {
        var cache$2, compile, expression;
        {
          cache$2 = param$;
          expression = cache$2.expression;
          compile = cache$2.compile;
        }
        if (hasSoak(this)) {
          return expr(compile(generateSoak(this)));
        } else {
          return memberAccess(expression, this.memberName);
        }
      }
    ],
    [
      CS.ProtoMemberAccessOp,
      CS.SoakedProtoMemberAccessOp,
      function (param$) {
        var cache$2, compile, expression;
        {
          cache$2 = param$;
          expression = cache$2.expression;
          compile = cache$2.compile;
        }
        if (hasSoak(this)) {
          return expr(compile(generateSoak(this)));
        } else {
          return memberAccess(memberAccess(expression, 'prototype'), this.memberName);
        }
      }
    ],
    [
      CS.DynamicMemberAccessOp,
      CS.SoakedDynamicMemberAccessOp,
      function (param$) {
        var cache$2, compile, expression, indexingExpr;
        {
          cache$2 = param$;
          expression = cache$2.expression;
          indexingExpr = cache$2.indexingExpr;
          compile = cache$2.compile;
        }
        if (hasSoak(this)) {
          return expr(compile(generateSoak(this)));
        } else {
          return dynamicMemberAccess(expression, indexingExpr);
        }
      }
    ],
    [
      CS.DynamicProtoMemberAccessOp,
      CS.SoakedDynamicProtoMemberAccessOp,
      function (param$) {
        var cache$2, compile, expression, indexingExpr;
        {
          cache$2 = param$;
          expression = cache$2.expression;
          indexingExpr = cache$2.indexingExpr;
          compile = cache$2.compile;
        }
        if (hasSoak(this)) {
          return expr(compile(generateSoak(this)));
        } else {
          return dynamicMemberAccess(memberAccess(expression, 'prototype'), indexingExpr);
        }
      }
    ],
    [
      CS.Slice,
      function (param$) {
        var args, cache$2, expression, left, right;
        {
          cache$2 = param$;
          expression = cache$2.expression;
          left = cache$2.left;
          right = cache$2.right;
        }
        args = null != left ? [left] : null != right ? [new JS.Literal(0)] : [];
        if (null != right)
          args.push(this.isInclusive ? right['instanceof'](JS.Literal) && typeof right.data === 'number' ? new JS.Literal(right.data + 1) : new JS.BinaryExpression('||', new JS.BinaryExpression('+', new JS.UnaryExpression('+', right), new JS.Literal(1)), new JS.Literal(9e9)) : right);
        return new JS.CallExpression(memberAccess(expression, 'slice'), args);
      }
    ],
    [
      CS.ExistsOp,
      function (param$) {
        var cache$2, condition, e, inScope, left, node, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
          inScope = cache$2.inScope;
        }
        e = needsCaching(this.left) ? genSym('cache') : expr(left);
        condition = new JS.BinaryExpression('!=', new JS.Literal(null), e);
        if (e['instanceof'](JS.Identifier) && !in$(e.name, inScope))
          condition = new JS.BinaryExpression('&&', new JS.BinaryExpression('!==', new JS.Literal('undefined'), new JS.UnaryExpression('typeof', e)), condition);
        node = new JS.ConditionalExpression(condition, e, expr(right));
        if (e === left) {
          return node;
        } else {
          return new JS.SequenceExpression([
            new JS.AssignmentExpression('=', e, left),
            node
          ]);
        }
      }
    ],
    [
      CS.UnaryExistsOp,
      function (param$) {
        var cache$2, expression, inScope, nullTest, typeofTest;
        {
          cache$2 = param$;
          expression = cache$2.expression;
          inScope = cache$2.inScope;
        }
        nullTest = new JS.BinaryExpression('!=', new JS.Literal(null), expression);
        if (expression['instanceof'](JS.Identifier) && !in$(expression.name, inScope)) {
          typeofTest = new JS.BinaryExpression('!==', new JS.Literal('undefined'), new JS.UnaryExpression('typeof', expression));
          return new JS.BinaryExpression('&&', typeofTest, nullTest);
        } else {
          return nullTest;
        }
      }
    ],
    [
      CS.DoOp,
      function () {
        var deriveArgsFromParams;
        deriveArgsFromParams = function (params) {
          var args;
          return args = function (accum$) {
            var index, param;
            for (var i$ = 0, length$ = params.length; i$ < length$; ++i$) {
              param = params[i$];
              index = i$;
              accum$.push(function () {
                switch (false) {
                case !param['instanceof'](CS.DefaultParam):
                  params[index] = param.param;
                  return param['default'];
                case !param['instanceof'](CS.Identifier, CS.MemberAccessOp):
                  return param;
                default:
                  return helpers.undef();
                }
              }.call(this));
            }
            return accum$;
          }.call(this, []);
        };
        return function (param$) {
          var args, cache$2, compile, expression;
          {
            cache$2 = param$;
            expression = cache$2.expression;
            compile = cache$2.compile;
          }
          args = [];
          if (this.expression['instanceof'](CS.AssignOp) && this.expression.expression['instanceof'](CS.Function)) {
            args = deriveArgsFromParams(this.expression.expression.parameters);
          } else if (this.expression['instanceof'](CS.Function)) {
            args = deriveArgsFromParams(this.expression.parameters);
          }
          return compile(new CS.FunctionApplication(this.expression, args));
        };
      }()
    ],
    [
      CS.Return,
      function (param$) {
        var e;
        e = param$.expression;
        return new JS.ReturnStatement(expr(e));
      }
    ],
    [
      CS.Break,
      function () {
        return new JS.BreakStatement;
      }
    ],
    [
      CS.Continue,
      function () {
        return new JS.ContinueStatement;
      }
    ],
    [
      CS.Debugger,
      function () {
        return new JS.DebuggerStatement;
      }
    ],
    [
      CS.ExpOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return helpers.exp(expr(left), expr(right));
      }
    ],
    [
      CS.DivideOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('/', expr(left), expr(right));
      }
    ],
    [
      CS.MultiplyOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('*', expr(left), expr(right));
      }
    ],
    [
      CS.RemOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('%', expr(left), expr(right));
      }
    ],
    [
      CS.PlusOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('+', expr(left), expr(right));
      }
    ],
    [
      CS.SubtractOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('-', expr(left), expr(right));
      }
    ],
    [
      CS.OfOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('in', expr(left), expr(right));
      }
    ],
    [
      CS.InOp,
      function (param$) {
        var cache$2, comparisons, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        if (right['instanceof'](JS.ArrayExpression) && right.elements.length < 5) {
          switch (right.elements.length) {
          case 0:
            if (needsCaching(this.left)) {
              return new JS.SequenceExpression([
                left,
                new JS.Literal(false)
              ]);
            } else {
              return new JS.Literal(false);
            }
          case 1:
            return new JS.BinaryExpression('===', left, right.elements[0]);
          default:
            if (needsCaching(this.left)) {
              return helpers['in'](expr(left), expr(right));
            } else {
              comparisons = map(right.elements, function (e) {
                return new JS.BinaryExpression('===', left, e);
              });
              return foldl1(comparisons, function (l, r) {
                return new JS.BinaryExpression('||', l, r);
              });
            }
          }
        } else {
          return helpers['in'](expr(left), expr(right));
        }
      }
    ],
    [
      CS.ExtendsOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return helpers['extends'](expr(left), expr(right));
      }
    ],
    [
      CS.InstanceofOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('instanceof', expr(left), expr(right));
      }
    ],
    [
      CS.LogicalAndOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('&&', expr(left), expr(right));
      }
    ],
    [
      CS.LogicalOrOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('||', expr(left), expr(right));
      }
    ],
    [
      CS.EQOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('===', expr(left), expr(right));
      }
    ],
    [
      CS.NEQOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('!==', expr(left), expr(right));
      }
    ],
    [
      CS.GTEOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('>=', expr(left), expr(right));
      }
    ],
    [
      CS.GTOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('>', expr(left), expr(right));
      }
    ],
    [
      CS.LTEOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('<=', expr(left), expr(right));
      }
    ],
    [
      CS.LTOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('<', expr(left), expr(right));
      }
    ],
    [
      CS.BitAndOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('&', expr(left), expr(right));
      }
    ],
    [
      CS.BitOrOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('|', expr(left), expr(right));
      }
    ],
    [
      CS.BitXorOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('^', expr(left), expr(right));
      }
    ],
    [
      CS.LeftShiftOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('<<', expr(left), expr(right));
      }
    ],
    [
      CS.SignedRightShiftOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('>>', expr(left), expr(right));
      }
    ],
    [
      CS.UnsignedRightShiftOp,
      function (param$) {
        var cache$2, left, right;
        {
          cache$2 = param$;
          left = cache$2.left;
          right = cache$2.right;
        }
        return new JS.BinaryExpression('>>>', expr(left), expr(right));
      }
    ],
    [
      CS.PreDecrementOp,
      function (param$) {
        var e;
        e = param$.expression;
        return new JS.UpdateExpression('--', true, expr(e));
      }
    ],
    [
      CS.PreIncrementOp,
      function (param$) {
        var e;
        e = param$.expression;
        return new JS.UpdateExpression('++', true, expr(e));
      }
    ],
    [
      CS.PostDecrementOp,
      function (param$) {
        var e;
        e = param$.expression;
        return new JS.UpdateExpression('--', false, expr(e));
      }
    ],
    [
      CS.PostIncrementOp,
      function (param$) {
        var e;
        e = param$.expression;
        return new JS.UpdateExpression('++', false, expr(e));
      }
    ],
    [
      CS.UnaryPlusOp,
      function (param$) {
        var e;
        e = param$.expression;
        return new JS.UnaryExpression('+', expr(e));
      }
    ],
    [
      CS.UnaryNegateOp,
      function (param$) {
        var e;
        e = param$.expression;
        return new JS.UnaryExpression('-', expr(e));
      }
    ],
    [
      CS.LogicalNotOp,
      function (param$) {
        var e;
        e = param$.expression;
        return new JS.UnaryExpression('!', expr(e));
      }
    ],
    [
      CS.BitNotOp,
      function (param$) {
        var e;
        e = param$.expression;
        return new JS.UnaryExpression('~', expr(e));
      }
    ],
    [
      CS.TypeofOp,
      function (param$) {
        var e;
        e = param$.expression;
        return new JS.UnaryExpression('typeof', expr(e));
      }
    ],
    [
      CS.DeleteOp,
      function (param$) {
        var e;
        e = param$.expression;
        return new JS.UnaryExpression('delete', expr(e));
      }
    ],
    [
      CS.Identifier,
      function () {
        return new JS.Identifier(this.data);
      }
    ],
    [
      CS.GenSym,
      function () {
        var memos, symbols;
        symbols = [];
        memos = [];
        return function () {
          var memo;
          if (in$(this, symbols)) {
            return memos[symbols.indexOf(this)];
          } else {
            symbols.push(this);
            memos.push(memo = genSym(this.data));
            return memo;
          }
        };
      }()
    ],
    [
      CS.Bool,
      CS.Int,
      CS.Float,
      CS.String,
      function () {
        return new JS.Literal(this.data);
      }
    ],
    [
      CS.Null,
      function () {
        return new JS.Literal(null);
      }
    ],
    [
      CS.Undefined,
      function () {
        return helpers.undef();
      }
    ],
    [
      CS.This,
      function () {
        return new JS.ThisExpression;
      }
    ],
    [
      CS.JavaScript,
      function () {
        return new JS.CallExpression(new JS.Identifier('eval'), [new JS.Literal(this.data)]);
      }
    ]
  ];
  function Compiler() {
    var cache$2, ctor, ctors, handler, size$;
    this.rules = {};
    for (var i$ = 0, length$ = defaultRules.length; i$ < length$; ++i$) {
      {
        cache$2 = defaultRules[i$];
        size$ = cache$2.length;
        ctors = size$ > 1 ? [].slice.call(cache$2, 0, size$ - 1) : [];
        handler = cache$2[size$ - 1];
      }
      for (var i$1 = 0, length$1 = ctors.length; i$1 < length$1; ++i$1) {
        ctor = ctors[i$1];
        this.addRule(ctor, handler);
      }
    }
  }
  Compiler.prototype.addRule = function (ctor, handler) {
    this.rules[ctor.prototype.className] = handler;
    return this;
  };
  Compiler.prototype.compile = function () {
    var defaultRule, generateSymbols, walk;
    walk = function (fn, inScope, ancestry, options) {
      var child, childName, children, jsNode, p;
      if ((null != ancestry[0] ? ancestry[0]['instanceof'](CS.Function, CS.BoundFunction) : void 0) && this === ancestry[0].body)
        inScope = union(inScope, concatMap(ancestry[0].parameters, beingDeclared));
      ancestry.unshift(this);
      children = {};
      for (var i$ = 0, length$ = this.childNodes.length; i$ < length$; ++i$) {
        childName = this.childNodes[i$];
        if (!(null != this[childName]))
          continue;
        children[childName] = in$(childName, this.listMembers) ? function (accum$) {
          var jsNode, member;
          for (var i$1 = 0, length$1 = this[childName].length; i$1 < length$1; ++i$1) {
            member = this[childName][i$1];
            jsNode = walk.call(member, fn, inScope, ancestry);
            inScope = union(inScope, envEnrichments(member, inScope));
            accum$.push(jsNode);
          }
          return accum$;
        }.call(this, []) : (child = this[childName], jsNode = walk.call(child, fn, inScope, ancestry), inScope = union(inScope, envEnrichments(child, inScope)), jsNode);
      }
      children.inScope = inScope;
      children.ancestry = ancestry;
      children.options = options;
      children.compile = function (node) {
        return walk.call(node.g(), fn, inScope, ancestry);
      };
      ancestry.shift();
      jsNode = fn.call(this, children);
      for (var cache$2 = [
            'raw',
            'line',
            'column',
            'offset'
          ], i$1 = 0, length$1 = cache$2.length; i$1 < length$1; ++i$1) {
        p = cache$2[i$1];
        jsNode[p] = this[p];
      }
      return jsNode;
    };
    generateSymbols = function () {
      var format, generatedSymbols, generateName;
      generatedSymbols = {};
      format = function (pre, counter) {
        var cache$2, div, mod;
        if (pre) {
          return '' + pre + '$' + (counter || '');
        } else if (counter < 26) {
          return String.fromCharCode(97 + counter);
        } else {
          cache$2 = divMod(counter, 26);
          div = cache$2[0];
          mod = cache$2[1];
          return format(pre, div - 1) + format(pre, mod);
        }
      };
      generateName = function (node, param$) {
        var cache$2, formatted, nsCounters, usedSymbols;
        {
          cache$2 = param$;
          usedSymbols = cache$2.usedSymbols;
          nsCounters = cache$2.nsCounters;
        }
        if (owns(generatedSymbols, node.uniqueId)) {
          return generatedSymbols[node.uniqueId];
        } else {
          nsCounters[node.ns] = owns(nsCounters, node.ns) ? 1 + nsCounters[node.ns] : 0;
          while (in$(formatted = format(node.ns, nsCounters[node.ns]), usedSymbols)) {
            ++nsCounters[node.ns];
          }
          return generatedSymbols[node.uniqueId] = formatted;
        }
      };
      return generateMutatingWalker(function (state) {
        var cache$2, declaredSymbols, declNames, decls, newNode, nsCounters, nsCounters_, params, usedSymbols;
        state.declaredSymbols = union(state.declaredSymbols, map(declarationsNeeded(this), function (id) {
          return id.name;
        }));
        cache$2 = state;
        declaredSymbols = cache$2.declaredSymbols;
        usedSymbols = cache$2.usedSymbols;
        nsCounters = cache$2.nsCounters;
        newNode = this['instanceof'](JS.GenSym) ? (newNode = new JS.Identifier(generateName(this, state)), usedSymbols.push(newNode.name), newNode) : this['instanceof'](JS.FunctionExpression, JS.FunctionDeclaration) ? (params = concatMap(this.params, collectIdentifiers), nsCounters_ = {}, function (accum$) {
          var k, v;
          for (k in nsCounters) {
            if (!isOwn$(nsCounters, k))
              continue;
            v = nsCounters[k];
            accum$.push(nsCounters_[k] = v);
          }
          return accum$;
        }.call(this, []), newNode = generateSymbols(this, {
          declaredSymbols: union(declaredSymbols, params),
          usedSymbols: union(usedSymbols, params),
          nsCounters: nsCounters_
        }), newNode.body = forceBlock(newNode.body), declNames = nub(difference(map(declarationsNeededRecursive(this.body), function (id) {
          return id.name;
        }), union(declaredSymbols, params))), decls = map(declNames, function (name) {
          return new JS.Identifier(name);
        }), decls.length > 0 ? newNode.body.body.unshift(makeVarDeclaration(decls)) : void 0, newNode) : generateSymbols(this, state);
        state.declaredSymbols = union(declaredSymbols, map(declarationsNeededRecursive(newNode), function (id) {
          return id.name;
        }));
        return newNode;
      });
    }();
    defaultRule = function () {
      throw new Error('compile: Non-exhaustive patterns in case: ' + this.className);
    };
    return function (ast, options) {
      var jsAST, rules;
      if (null == options)
        options = {};
      if (null != options.bare)
        options.bare;
      else
        options.bare = false;
      rules = this.rules;
      jsAST = walk.call(ast, function () {
        return (null != rules[this.className] ? rules[this.className] : defaultRule).apply(this, arguments);
      }, [], [], options);
      return generateSymbols(jsAST, {
        declaredSymbols: [],
        usedSymbols: union(jsReserved.slice(), collectIdentifiers(jsAST)),
        nsCounters: {}
      });
    };
  }();
  return Compiler;
}();
function in$(member, list) {
  for (var i = 0, length = list.length; i < length; ++i)
    if (i in list && list[i] === member)
      return true;
  return false;
}
function isOwn$(o, p) {
  return {}.hasOwnProperty.call(o, p);
}

});

require.define("/lib/coffee-script/js-nodes.js",function(require,module,exports,__dirname,__filename,process,global){// Generated by CoffeeScript 2.0.0-dev
var ArrayExpression, AssignmentExpression, BinaryExpression, BlockStatement, CallExpression, createNode, ctor, difference, exports, FunctionDeclaration, FunctionExpression, GenSym, handleLists, handlePrimitives, Identifier, isStatement, Literal, MemberExpression, NewExpression, node, nodeData, Nodes, ObjectExpression, params, Program, SequenceExpression, SwitchCase, SwitchStatement, TryStatement, UnaryExpression, UpdateExpression, VariableDeclaration, VariableDeclaration;
difference = require('./functional-helpers').difference;
exports = null != ('undefined' !== typeof module && null != module ? module.exports : void 0) ? 'undefined' !== typeof module && null != module ? module.exports : void 0 : this;
createNode = function (type, props) {
  return function (super$) {
    extends$(class$, super$);
    function class$() {
      var i, prop;
      for (var i$ = 0, length$ = props.length; i$ < length$; ++i$) {
        prop = props[i$];
        i = i$;
        this[prop] = arguments[i];
      }
    }
    class$.prototype.type = type;
    class$.prototype.childNodes = props;
    return class$;
  }(Nodes);
};
this.Nodes = Nodes = function () {
  function Nodes() {
  }
  Nodes.prototype.listMembers = [];
  Nodes.prototype['instanceof'] = function (ctors) {
    var ctor;
    ctors = 1 <= arguments.length ? [].slice.call(arguments, 0) : [];
    for (var i$ = 0, length$ = ctors.length; i$ < length$; ++i$) {
      ctor = ctors[i$];
      if (!(this.type === ctor.prototype.type))
        continue;
      return true;
    }
    return false;
  };
  Nodes.prototype.toJSON = function () {
    var child, json;
    json = { 'type': this.type };
    if (null != this.leadingComments)
      json.leadingComments = this.leadingComments;
    for (var i$ = 0, length$ = this.childNodes.length; i$ < length$; ++i$) {
      child = this.childNodes[i$];
      if (in$(child, this.listMembers)) {
        json[child] = function (accum$) {
          var p;
          for (var i$1 = 0, length$1 = this[child].length; i$1 < length$1; ++i$1) {
            p = this[child][i$1];
            accum$.push('undefined' !== typeof p && null != p ? p.toJSON() : void 0);
          }
          return accum$;
        }.call(this, []);
      } else {
        json[child] = null != this[child] ? this[child].toJSON() : void 0;
      }
    }
    if (null != this.line && null != this.column)
      json.loc = {
        start: {
          'line': this.line,
          'column': this.column
        }
      };
    if (null != this.offset)
      json.range = [
        this.offset,
        null != this.raw ? this.offset + this.raw.length : void 0
      ];
    if (null != this.raw)
      json.raw = this.raw;
    return json;
  };
  return Nodes;
}();
nodeData = [
  [
    'ArrayExpression',
    false,
    ['elements']
  ],
  [
    'AssignmentExpression',
    false,
    [
      'operator',
      'left',
      'right'
    ]
  ],
  [
    'BinaryExpression',
    false,
    [
      'operator',
      'left',
      'right'
    ]
  ],
  [
    'BlockStatement',
    true,
    ['body']
  ],
  [
    'BreakStatement',
    true,
    ['label']
  ],
  [
    'CallExpression',
    false,
    [
      'callee',
      'arguments'
    ]
  ],
  [
    'CatchClause',
    true,
    [
      'param',
      'body'
    ]
  ],
  [
    'ConditionalExpression',
    false,
    [
      'test',
      'consequent',
      'alternate'
    ]
  ],
  [
    'ContinueStatement',
    true,
    ['label']
  ],
  [
    'DebuggerStatement',
    true,
    []
  ],
  [
    'DoWhileStatement',
    true,
    [
      'body',
      'test'
    ]
  ],
  [
    'EmptyStatement',
    true,
    []
  ],
  [
    'ExpressionStatement',
    true,
    ['expression']
  ],
  [
    'ForInStatement',
    true,
    [
      'left',
      'right',
      'body'
    ]
  ],
  [
    'ForStatement',
    true,
    [
      'init',
      'test',
      'update',
      'body'
    ]
  ],
  [
    'FunctionDeclaration',
    true,
    [
      'id',
      'params',
      'body'
    ]
  ],
  [
    'FunctionExpression',
    false,
    [
      'id',
      'params',
      'body'
    ]
  ],
  [
    'GenSym',
    false,
    [
      'ns',
      'uniqueId'
    ]
  ],
  [
    'Identifier',
    false,
    ['name']
  ],
  [
    'IfStatement',
    true,
    [
      'test',
      'consequent',
      'alternate'
    ]
  ],
  [
    'LabeledStatement',
    true,
    [
      'label',
      'body'
    ]
  ],
  [
    'Literal',
    false,
    ['value']
  ],
  [
    'LogicalExpression',
    false,
    [
      'left',
      'right'
    ]
  ],
  [
    'MemberExpression',
    false,
    [
      'computed',
      'object',
      'property'
    ]
  ],
  [
    'NewExpression',
    false,
    [
      'callee',
      'arguments'
    ]
  ],
  [
    'ObjectExpression',
    false,
    ['properties']
  ],
  [
    'Program',
    true,
    ['body']
  ],
  [
    'Property',
    true,
    [
      'key',
      'value'
    ]
  ],
  [
    'ReturnStatement',
    true,
    ['argument']
  ],
  [
    'SequenceExpression',
    false,
    ['expressions']
  ],
  [
    'SwitchCase',
    true,
    [
      'test',
      'consequent'
    ]
  ],
  [
    'SwitchStatement',
    true,
    [
      'discriminant',
      'cases'
    ]
  ],
  [
    'ThisExpression',
    false,
    []
  ],
  [
    'ThrowStatement',
    true,
    ['argument']
  ],
  [
    'TryStatement',
    true,
    [
      'block',
      'handlers',
      'finalizer'
    ]
  ],
  [
    'UnaryExpression',
    false,
    [
      'operator',
      'argument'
    ]
  ],
  [
    'UpdateExpression',
    false,
    [
      'operator',
      'prefix',
      'argument'
    ]
  ],
  [
    'VariableDeclaration',
    true,
    [
      'kind',
      'declarations'
    ]
  ],
  [
    'VariableDeclarator',
    true,
    [
      'id',
      'init'
    ]
  ],
  [
    'WhileStatement',
    true,
    [
      'test',
      'body'
    ]
  ],
  [
    'WithStatement',
    true,
    [
      'object',
      'body'
    ]
  ]
];
for (var i$ = 0, length$ = nodeData.length; i$ < length$; ++i$) {
  {
    cache$ = nodeData[i$];
    node = cache$[0];
    isStatement = cache$[1];
    params = cache$[2];
  }
  exports[node] = ctor = createNode(node, params);
  ctor.prototype.isStatement = isStatement;
  ctor.prototype.isExpression = !isStatement;
}
cache$1 = exports;
Program = cache$1.Program;
BlockStatement = cache$1.BlockStatement;
Literal = cache$1.Literal;
Identifier = cache$1.Identifier;
FunctionExpression = cache$1.FunctionExpression;
CallExpression = cache$1.CallExpression;
SequenceExpression = cache$1.SequenceExpression;
ArrayExpression = cache$1.ArrayExpression;
BinaryExpression = cache$1.BinaryExpression;
UnaryExpression = cache$1.UnaryExpression;
NewExpression = cache$1.NewExpression;
VariableDeclaration = cache$1.VariableDeclaration;
ObjectExpression = cache$1.ObjectExpression;
MemberExpression = cache$1.MemberExpression;
UpdateExpression = cache$1.UpdateExpression;
AssignmentExpression = cache$1.AssignmentExpression;
GenSym = cache$1.GenSym;
FunctionDeclaration = cache$1.FunctionDeclaration;
VariableDeclaration = cache$1.VariableDeclaration;
SwitchStatement = cache$1.SwitchStatement;
SwitchCase = cache$1.SwitchCase;
TryStatement = cache$1.TryStatement;
handlePrimitives = function (ctor, primitives) {
  ctor.prototype.childNodes = difference(ctor.prototype.childNodes, primitives);
  return ctor.prototype.toJSON = function () {
    var json, primitive;
    json = Nodes.prototype.toJSON.call(this);
    for (var i$1 = 0, length$1 = primitives.length; i$1 < length$1; ++i$1) {
      primitive = primitives[i$1];
      json[primitive] = this[primitive];
    }
    return json;
  };
};
handlePrimitives(AssignmentExpression, ['operator']);
handlePrimitives(BinaryExpression, ['operator']);
handlePrimitives(GenSym, [
  'ns',
  'uniqueId'
]);
handlePrimitives(Identifier, ['name']);
handlePrimitives(Literal, ['value']);
handlePrimitives(MemberExpression, ['computed']);
handlePrimitives(UnaryExpression, ['operator']);
handlePrimitives(UpdateExpression, [
  'operator',
  'prefix'
]);
handlePrimitives(VariableDeclaration, ['kind']);
handleLists = function (ctor, listProps) {
  return ctor.prototype.listMembers = listProps;
};
handleLists(ArrayExpression, ['elements']);
handleLists(BlockStatement, ['body']);
handleLists(CallExpression, ['arguments']);
handleLists(FunctionDeclaration, ['params']);
handleLists(FunctionExpression, ['params']);
handleLists(NewExpression, ['arguments']);
handleLists(ObjectExpression, ['properties']);
handleLists(Program, ['body']);
handleLists(SequenceExpression, ['expressions']);
handleLists(SwitchCase, ['consequent']);
handleLists(SwitchStatement, ['cases']);
handleLists(TryStatement, ['handlers']);
handleLists(VariableDeclaration, ['declarations']);
function isOwn$(o, p) {
  return {}.hasOwnProperty.call(o, p);
}
function extends$(child, parent) {
  var key;
  for (key in parent)
    if (isOwn$(parent, key))
      child[key] = parent[key];
  function ctor() {
    this.constructor = child;
  }
  ctor.prototype = parent.prototype;
  child.prototype = new ctor;
  child.__super__ = parent.prototype;
  return child;
}
function in$(member, list) {
  for (var i = 0, length = list.length; i < length; ++i)
    if (i in list && list[i] === member)
      return true;
  return false;
}

});

require.define("/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {
  "name": "CoffeeScriptRedux",
  "author": "Michael Ficarra",
  "version": "2.0.0-dev",
  "homepage": "https://github.com/michaelficarra/CoffeeScriptRedux",
  "bugs": "https://github.com/michaelficarra/CoffeeScriptRedux/issues",
  "description": "Unfancy JavaScript",
  "keywords": [
    "coffeescript",
    "javascript",
    "language",
    "compiler"
  ],
  "main": "./lib/coffee-script/module",
  "bin": {
    "coffee": "./bin/coffee"
  },
  "repository": {
    "type": "git",
    "url": "git://github.com/michaelficarra/CoffeeScriptRedux.git"
  },
  "scripts": {
    "build": "make -j build",
    "test": "make -j test"
  },
  "devDependencies": {
    "mocha": "~1.6.0",
    "pegjs": "git://github.com/dmajda/pegjs.git#bea6b1fde74c8aebf802f9bcc3380c65b241e1b7",
    "browserify": "~1.16"
  },
  "dependencies": {
    "StringScanner": "~0.0.3"
  },
  "optionalDependencies": {
    "esmangle": "~0.0.8",
    "source-map": "~0.1.7",
    "escodegen": "~0.0.12",
    "cscodegen": "git://github.com/michaelficarra/cscodegen.git#73fd7202ac086c26f18c9d56f025b18b3c6f5383"
  },
  "engines": { "node": "0.6.x || 0.8.x" },
  "licenses": [
    {
      "type": "3-clause BSD",
      "url": "https://raw.github.com/michaelficarra/CoffeeScriptRedux/master/LICENSE"
    }
  ],
  "license": "3-clause BSD"
}
;

});

require.define("/node_modules/cscodegen/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./lib/cscodegen"}
});

require.define("/node_modules/cscodegen/lib/cscodegen.js",function(require,module,exports,__dirname,__filename,process,global){// Generated by CoffeeScript 1.3.3
(function() {
  var __hasProp = {}.hasOwnProperty,
    __slice = [].slice,
    __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  (function(exports) {
    var TAB, clone, eq, formatInterpolation, formatStringData, generate, indent, levels, needsParensWhenOnLeft, operators, parens, precedence;
    TAB = '  ';
    indent = function(code) {
      var line;
      return ((function() {
        var _i, _len, _ref, _results;
        _ref = code.split('\n');
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          line = _ref[_i];
          _results.push("" + TAB + line);
        }
        return _results;
      })()).join('\n');
    };
    parens = function(code) {
      return "(" + code + ")";
    };
    formatStringData = function(data) {
      return data.replace(/[^\x20-\x7e]|['\\]/, function(c) {
        var escape, pad;
        switch (c) {
          case '\0':
            return '\\0';
          case '\b':
            return '\\b';
          case '\t':
            return '\\t';
          case '\n':
            return '\\n';
          case '\f':
            return '\\f';
          case '\r':
            return '\\r';
          case '\'':
            return '\\\'';
          case '\\':
            return '\\\\';
          default:
            escape = (c.charCodeAt(0)).toString(16);
            pad = "0000".slice(escape.length);
            return "\\u" + pad + escape;
        }
      });
    };
    formatInterpolation = function(ast, options) {
      var left, right;
      switch (ast.className) {
        case "ConcatOp":
          left = formatInterpolation(ast.left, options);
          right = formatInterpolation(ast.right, options);
          return "" + left + right;
        case "String":
          return formatStringData(ast.data);
        default:
          return "\#{" + (generate(ast, options)) + "}";
      }
    };
    needsParensWhenOnLeft = function(ast) {
      switch (ast.className) {
        case 'Function':
        case 'BoundFunction':
        case 'NewOp':
          return true;
        case 'Conditional':
        case 'Switch':
        case 'While':
        case 'Block':
          return true;
        case 'PreIncrementOp':
        case 'PreDecrementOp':
        case 'UnaryPlusOp':
        case 'UnaryNegateOp':
        case 'LogicalNotOp':
        case 'BitNotOp':
        case 'DoOp':
        case 'TypeofOp':
        case 'DeleteOp':
          return needsParensWhenOnLeft(ast.expression);
        case 'FunctionApplication':
          return ast["arguments"].length > 0;
        default:
          return false;
      }
    };
    eq = function(nodeA, nodeB) {
      var i, prop, v, val, _i, _len;
      for (prop in nodeA) {
        if (!__hasProp.call(nodeA, prop)) continue;
        val = nodeA[prop];
        if (prop === 'raw' || prop === 'line' || prop === 'column') {
          continue;
        }
        switch (Object.prototype.toString.call(val)) {
          case '[object Object]':
            if (!eq(nodeB[prop], val)) {
              return false;
            }
            break;
          case '[object Array]':
            for (i = _i = 0, _len = val.length; _i < _len; i = ++_i) {
              v = val[i];
              if (!eq(nodeB[prop][i], v)) {
                return false;
              }
            }
            break;
          default:
            if (nodeB[prop] !== val) {
              return false;
            }
        }
      }
      return true;
    };
    clone = function(obj, overrides) {
      var newObj, prop, val;
      if (overrides == null) {
        overrides = {};
      }
      newObj = {};
      for (prop in obj) {
        if (!__hasProp.call(obj, prop)) continue;
        val = obj[prop];
        newObj[prop] = val;
      }
      for (prop in overrides) {
        if (!__hasProp.call(overrides, prop)) continue;
        val = overrides[prop];
        newObj[prop] = val;
      }
      return newObj;
    };
    levels = [['SeqOp'], ['Conditional', 'ForIn', 'ForOf', 'While'], ['FunctionApplication', 'SoakedFunctionApplication'], ['AssignOp', 'CompoundAssignOp', 'ExistsAssignOp'], ['LogicalOrOp'], ['LogicalAndOp'], ['BitOrOp'], ['BitXorOp'], ['BitAndOp'], ['ExistsOp'], ['EQOp', 'NEQOp'], ['LTOp', 'LTEOp', 'GTOp', 'GTEOp', 'InOp', 'OfOp', 'InstanceofOp'], ['LeftShiftOp', 'SignedRightShiftOp', 'UnsignedRightShiftOp'], ['PlusOp', 'SubtractOp'], ['MultiplyOp', 'DivideOp', 'RemOp'], ['UnaryPlusOp', 'UnaryNegateOp', 'LogicalNotOp', 'BitNotOp', 'DoOp', 'TypeofOp', 'PreIncrementOp', 'PreDecrementOp', 'DeleteOp'], ['UnaryExistsOp', 'ShallowCopyArray', 'PostIncrementOp', 'PostDecrementOp', 'Spread'], ['NewOp'], ['MemberAccessOp', 'SoakedMemberAccessOp', 'DynamicMemberAccessOp', 'SoakedDynamicMemberAccessOp', 'ProtoMemberAccessOp', 'DynamicProtoMemberAccessOp', 'SoakedProtoMemberAccessOp', 'SoakedDynamicProtoMemberAccessOp']];
    precedence = {};
    (function() {
      var level, op, ops, _i, _len, _results;
      _results = [];
      for (level = _i = 0, _len = levels.length; _i < _len; level = ++_i) {
        ops = levels[level];
        _results.push((function() {
          var _j, _len1, _results1;
          _results1 = [];
          for (_j = 0, _len1 = ops.length; _j < _len1; _j++) {
            op = ops[_j];
            _results1.push(precedence[op] = level);
          }
          return _results1;
        })());
      }
      return _results;
    })();
    operators = {
      SeqOp: ';',
      LogicalOrOp: 'or',
      LogicalAndOp: 'and',
      BitOrOp: '|',
      BitXorOp: '^',
      BitAndOp: '&',
      EQOp: 'is',
      NEQOp: 'isnt',
      LTOp: '<',
      LTEOp: '<=',
      GTOp: '>',
      GTEOp: '>=',
      InOp: 'in',
      OfOp: 'of',
      InstanceofOp: 'instanceof',
      LeftShiftOp: '<<',
      SignedRightShiftOp: '>>',
      UnsignedRightShiftOp: '>>>',
      PlusOp: '+',
      SubtractOp: '-',
      MultiplyOp: '*',
      DivideOp: '/',
      RemOp: '%',
      UnaryPlusOp: '+',
      UnaryNegateOp: '-',
      LogicalNotOp: 'not ',
      BitNotOp: '~',
      DoOp: 'do ',
      NewOp: 'new ',
      TypeofOp: 'typeof ',
      PreIncrementOp: '++',
      PreDecrementOp: '--',
      UnaryExistsOp: '?',
      ShallowCopyArray: '[..]',
      PostIncrementOp: '++',
      PostDecrementOp: '--',
      Spread: '...',
      FunctionApplication: '',
      SoakedFunctionApplication: '?',
      MemberAccessOp: '.',
      SoakedMemberAccessOp: '?.',
      ProtoMemberAccessOp: '::',
      SoakedProtoMemberAccessOp: '?::',
      DynamicMemberAccessOp: '',
      SoakedDynamicMemberAccessOp: '?',
      DynamicProtoMemberAccessOp: '::',
      SoakedDynamicProtoMemberAccessOp: '?::'
    };
    return exports.generate = generate = function(ast, options) {
      var a, absNum, arg, args, expression_, hasAlternate, i, isMultiline, key_, m, memberAccessOps, members_, needsParens, p, parameters, parent, parentClassName, prec, s, sep, src, usedAsExpression, _alternate, _argList, _args, _assignee, _block, _body, _consequent, _ctor, _expr, _fn, _indexingExpr, _left, _op, _paramList, _ref, _ref1, _right;
      if (options == null) {
        options = {};
      }
      needsParens = false;
      if ((_ref = options.precedence) == null) {
        options.precedence = 0;
      }
      if ((_ref1 = options.ancestors) == null) {
        options.ancestors = [];
      }
      parent = options.ancestors[0];
      parentClassName = parent != null ? parent.className : void 0;
      usedAsExpression = (parent != null) && parentClassName !== 'Block';
      src = (function() {
        var _i, _len, _ref2, _ref3, _ref4, _ref5, _ref6;
        switch (ast.className) {
          case 'Program':
            options.ancestors = [ast].concat(__slice.call(options.ancestors));
            if (ast.body != null) {
              return generate(ast.body, options);
            } else {
              return '';
            }
            break;
          case 'Block':
            options = clone(options, {
              ancestors: [ast].concat(__slice.call(options.ancestors)),
              precedence: 0
            });
            if (ast.statements.length === 0) {
              return generate((new Undefined).g(), options);
            } else {
              sep = parentClassName === 'Program' ? '\n\n' : '\n';
              return ((function() {
                var _i, _len, _ref2, _results;
                _ref2 = ast.statements;
                _results = [];
                for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
                  s = _ref2[_i];
                  _results.push(generate(s, options));
                }
                return _results;
              })()).join(sep);
            }
            break;
          case 'Conditional':
            options.ancestors.unshift(ast);
            options.precedence = 0;
            hasAlternate = (ast.consequent != null) && (ast.alternate != null);
            _consequent = generate((_ref2 = ast.consequent) != null ? _ref2 : (new Undefined).g(), options);
            _alternate = hasAlternate ? generate(ast.alternate, options) : "";
            isMultiline = _consequent.length > 90 || _alternate.length > 90 || __indexOf.call(_alternate, '\n') >= 0 || __indexOf.call(_consequent, '\n') >= 0;
            _consequent = isMultiline ? "\n" + (indent(_consequent)) : " then " + _consequent;
            if (hasAlternate) {
              _alternate = isMultiline ? "\nelse\n" + (indent(_alternate)) : " else " + _alternate;
            }
            return "if " + (generate(ast.condition, options)) + _consequent + _alternate;
          case 'Identifier':
            return ast.data;
          case 'Null':
            return 'null';
          case 'This':
            return 'this';
          case 'Undefined':
            return 'undefined';
          case 'Int':
            absNum = ast.data < 0 ? -ast.data : ast.data;
            if (absNum >= 1e12 || (absNum >= 0x10 && 0 === (absNum & (absNum - 1)))) {
              return "0x" + (ast.data.toString(16));
            } else {
              return ast.data.toString(10);
            }
            break;
          case 'Float':
            return ast.data.toString(10);
          case 'String':
            return "'" + (formatStringData(ast.data)) + "'";
          case 'ArrayInitialiser':
            options = clone(options, {
              ancestors: [ast].concat(__slice.call(options.ancestors)),
              precedence: precedence.AssignmentExpression
            });
            members_ = (function() {
              var _i, _len, _ref3, _results;
              _ref3 = ast.members;
              _results = [];
              for (_i = 0, _len = _ref3.length; _i < _len; _i++) {
                m = _ref3[_i];
                _results.push(generate(m, options));
              }
              return _results;
            })();
            switch (ast.members.length) {
              case 0:
                return '[]';
              case 1:
              case 2:
                for (i = _i = 0, _len = members_.length; _i < _len; i = ++_i) {
                  m = members_[i];
                  if (i + 1 !== members_.length) {
                    if (needsParensWhenOnLeft(ast.members[i])) {
                      members_[i] = parens(m);
                    }
                  }
                }
                return "[" + (members_.join(', ')) + "]";
              default:
                return "[\n" + (indent(members_.join('\n'))) + "\n]";
            }
            break;
          case 'ObjectInitialiser':
            options.ancestors = [ast].concat(__slice.call(options.ancestors));
            members_ = (function() {
              var _j, _len1, _ref3, _results;
              _ref3 = ast.members;
              _results = [];
              for (_j = 0, _len1 = _ref3.length; _j < _len1; _j++) {
                m = _ref3[_j];
                _results.push(generate(m, options));
              }
              return _results;
            })();
            switch (ast.members.length) {
              case 0:
                return '{}';
              case 1:
                return "{" + (members_.join(', ')) + "}";
              default:
                return "{\n" + (indent(members_.join('\n'))) + "\n}";
            }
            break;
          case 'ObjectInitialiserMember':
            options = clone(options, {
              ancestors: [ast].concat(__slice.call(options.ancestors)),
              precedence: precedence.AssignmentExpression
            });
            key_ = generate(ast.key, options);
            expression_ = generate(ast.expression, options);
            memberAccessOps = ['MemberAccessOp', 'ProtoMemberAccessOp', 'SoakedMemberAccessOp', 'SoakedProtoMemberAccessOp'];
            if (eq(ast.key, ast.expression)) {
              return "" + key_;
            } else if ((_ref3 = ast.expression.className, __indexOf.call(memberAccessOps, _ref3) >= 0) && ast.key.data === ast.expression.memberName) {
              return "" + expression_;
            } else {
              return "" + key_ + ": " + expression_;
            }
            break;
          case 'Function':
          case 'BoundFunction':
            options = clone(options, {
              ancestors: [ast].concat(__slice.call(options.ancestors)),
              precedence: precedence.AssignmentExpression
            });
            parameters = (function() {
              var _j, _len1, _ref4, _results;
              _ref4 = ast.parameters;
              _results = [];
              for (_j = 0, _len1 = _ref4.length; _j < _len1; _j++) {
                p = _ref4[_j];
                _results.push(generate(p, options));
              }
              return _results;
            })();
            options.precedence = 0;
            _body = !(ast.body != null) || ast.body.className === 'Undefined' ? '' : generate(ast.body, options);
            _paramList = ast.parameters.length > 0 ? "(" + (parameters.join(', ')) + ") " : '';
            _block = _body.length === 0 ? '' : _paramList.length + _body.length < 100 && __indexOf.call(_body, '\n') < 0 ? " " + _body : "\n" + (indent(_body));
            switch (ast.className) {
              case 'Function':
                return "" + _paramList + "->" + _block;
              case 'BoundFunction':
                return "" + _paramList + "=>" + _block;
            }
            break;
          case 'AssignOp':
            prec = precedence[ast.className];
            needsParens = prec < options.precedence;
            options = clone(options, {
              ancestors: [ast].concat(__slice.call(options.ancestors)),
              precedence: prec
            });
            _assignee = generate(ast.assignee, options);
            _expr = generate(ast.expression, options);
            return "" + _assignee + " = " + _expr;
          case 'CompoundAssignOp':
            prec = precedence[ast.className];
            needsParens = prec < options.precedence;
            options = clone(options, {
              ancestors: [ast].concat(__slice.call(options.ancestors)),
              precedence: prec
            });
            _op = operators[ast.op.prototype.className];
            _assignee = generate(ast.assignee, options);
            _expr = generate(ast.expression, options);
            return "" + _assignee + " " + _op + "= " + _expr;
          case 'SeqOp':
            prec = precedence[ast.className];
            needsParens = prec < options.precedence;
            options = clone(options, {
              ancestors: [ast].concat(__slice.call(options.ancestors)),
              precedence: prec
            });
            _left = generate(ast.left, options);
            _right = generate(ast.right, options);
            return "" + _left + "; " + _right;
          case 'LogicalOrOp':
          case 'LogicalAndOp':
          case 'BitOrOp':
          case 'BitXorOp':
          case 'BitAndOp':
          case 'LeftShiftOp':
          case 'SignedRightShiftOp':
          case 'UnsignedRightShiftOp':
          case 'EQOp':
          case 'NEQOp':
          case 'LTOp':
          case 'LTEOp':
          case 'GTOp':
          case 'GTEOp':
          case 'InOp':
          case 'OfOp':
          case 'InstanceofOp':
          case 'PlusOp':
          case 'SubtractOp':
          case 'MultiplyOp':
          case 'DivideOp':
          case 'RemOp':
          case 'ExistsOp':
            _op = operators[ast.className];
            if (((_ref4 = ast.className) === 'InOp' || _ref4 === 'OfOp' || _ref4 === 'InstanceofOp') && parentClassName === 'LogicalNotOp') {
              _op = "not " + _op;
            }
            prec = precedence[ast.className];
            needsParens = prec < options.precedence;
            options = clone(options, {
              ancestors: [ast].concat(__slice.call(options.ancestors)),
              precedence: prec
            });
            _left = generate(ast.left, options);
            if (needsParensWhenOnLeft(ast.left)) {
              _left = parens(_left);
            }
            _right = generate(ast.right, options);
            return "" + _left + " " + _op + " " + _right;
          case 'UnaryPlusOp':
          case 'UnaryNegateOp':
          case 'LogicalNotOp':
          case 'BitNotOp':
          case 'DoOp':
          case 'TypeofOp':
          case 'PreIncrementOp':
          case 'PreDecrementOp':
            _op = operators[ast.className];
            prec = precedence[ast.className];
            if (ast.className === 'LogicalNotOp') {
              if ((_ref5 = ast.expression.className) === 'InOp' || _ref5 === 'OfOp' || _ref5 === 'InstanceofOp') {
                _op = '';
                prec = precedence[ast.expression.className];
              }
              if ('LogicalNotOp' === parentClassName || 'LogicalNotOp' === ast.expression.className) {
                _op = '!';
              }
            }
            needsParens = prec < options.precedence;
            if (parentClassName === ast.className && ((_ref6 = ast.className) === 'UnaryPlusOp' || _ref6 === 'UnaryNegateOp')) {
              needsParens = true;
            }
            options = clone(options, {
              ancestors: [ast].concat(__slice.call(options.ancestors)),
              precedence: prec
            });
            return "" + _op + (generate(ast.expression, options));
          case 'UnaryExistsOp':
          case 'PostIncrementOp':
          case 'PostDecrementOp':
          case 'Spread':
            _op = operators[ast.className];
            prec = precedence[ast.className];
            needsParens = prec < options.precedence;
            options = clone(options, {
              ancestors: [ast].concat(__slice.call(options.ancestors)),
              precedence: prec
            });
            _expr = generate(ast.expression, options);
            if (needsParensWhenOnLeft(ast.expression)) {
              _expr = parens(_expr);
            }
            return "" + _expr + _op;
          case 'NewOp':
            _op = operators[ast.className];
            prec = precedence[ast.className];
            options = clone(options, {
              ancestors: [ast].concat(__slice.call(options.ancestors)),
              precedence: prec
            });
            _ctor = generate(ast.ctor, options);
            if (ast["arguments"].length > 0 && needsParensWhenOnLeft(ast.ctor)) {
              _ctor = parens(_ctor);
            }
            options.precedence = precedence['AssignOp'];
            args = (function() {
              var _j, _len1, _ref7, _results;
              _ref7 = ast["arguments"];
              _results = [];
              for (i = _j = 0, _len1 = _ref7.length; _j < _len1; i = ++_j) {
                a = _ref7[i];
                arg = generate(a, options);
                if ((needsParensWhenOnLeft(a)) && i + 1 !== ast["arguments"].length) {
                  arg = parens(arg);
                }
                _results.push(arg);
              }
              return _results;
            })();
            _args = ast["arguments"].length === 0 ? '' : " " + (args.join(', '));
            return "" + _op + _ctor + _args;
          case 'FunctionApplication':
          case 'SoakedFunctionApplication':
            if (ast.className === 'FunctionApplication' && ast["arguments"].length === 0 && !usedAsExpression) {
              return generate(new DoOp(ast["function"]), options);
            } else {
              options = clone(options, {
                ancestors: [ast].concat(__slice.call(options.ancestors)),
                precedence: precedence[ast.className]
              });
              _op = operators[ast.className];
              _fn = generate(ast["function"], options);
              if (needsParensWhenOnLeft(ast["function"])) {
                _fn = parens(_fn);
              }
              args = (function() {
                var _j, _len1, _ref7, _results;
                _ref7 = ast["arguments"];
                _results = [];
                for (i = _j = 0, _len1 = _ref7.length; _j < _len1; i = ++_j) {
                  a = _ref7[i];
                  arg = generate(a, options);
                  if ((needsParensWhenOnLeft(a)) && i + 1 !== ast["arguments"].length) {
                    arg = parens(arg);
                  }
                  _results.push(arg);
                }
                return _results;
              })();
              _argList = ast["arguments"].length === 0 ? '()' : " " + (args.join(', '));
              return "" + _fn + _op + _argList;
            }
            break;
          case 'MemberAccessOp':
          case 'SoakedMemberAccessOp':
          case 'ProtoMemberAccessOp':
          case 'SoakedProtoMemberAccessOp':
            _op = operators[ast.className];
            prec = precedence[ast.className];
            needsParens = prec < options.precedence;
            options = clone(options, {
              ancestors: [ast].concat(__slice.call(options.ancestors)),
              precedence: prec
            });
            if (ast.expression.className === 'This') {
              _expr = '@';
              if (ast.className === 'MemberAccessOp') {
                _op = '';
              }
            } else {
              _expr = generate(ast.expression, options);
              if (needsParensWhenOnLeft(ast.expression)) {
                _expr = parens(_expr);
              }
            }
            return "" + _expr + _op + ast.memberName;
          case 'DynamicMemberAccessOp':
          case 'SoakedDynamicMemberAccessOp':
          case 'DynamicProtoMemberAccessOp':
          case 'SoakedDynamicProtoMemberAccessOp':
            _op = operators[ast.className];
            prec = precedence[ast.className];
            needsParens = prec < options.precedence;
            options = clone(options, {
              ancestors: [ast].concat(__slice.call(options.ancestors)),
              precedence: prec
            });
            if (ast.expression.className === 'This') {
              _expr = '@';
            } else {
              _expr = generate(ast.expression, options);
              if (needsParensWhenOnLeft(ast.expression)) {
                _expr = parens(_expr);
              }
            }
            options.precedence = 0;
            _indexingExpr = generate(ast.indexingExpr, options);
            return "" + _expr + _op + "[" + _indexingExpr + "]";
          case 'ConcatOp':
            _left = formatInterpolation(ast.left, options);
            _right = formatInterpolation(ast.right, options);
            return "\"" + _left + _right + "\"";
          default:
            throw new Error("Non-exhaustive patterns in case: " + ast.className);
        }
      })();
      if (needsParens) {
        return parens(src);
      } else {
        return src;
      }
    };
  })(typeof exports !== "undefined" && exports !== null ? exports : this.cscodegen = {});

}).call(this);

});

require.define("/node_modules/escodegen/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"escodegen.js"}
});

require.define("/node_modules/escodegen/escodegen.js",function(require,module,exports,__dirname,__filename,process,global){/*
  Copyright (C) 2012 Michael Ficarra <escodegen.copyright@michael.ficarra.me>
  Copyright (C) 2012 Robert Gust-Bardon <donate@robert.gust-bardon.org>
  Copyright (C) 2012 John Freeman <jfreeman08@gmail.com>
  Copyright (C) 2011-2012 Ariya Hidayat <ariya.hidayat@gmail.com>
  Copyright (C) 2012 Mathias Bynens <mathias@qiwi.be>
  Copyright (C) 2012 Joost-Wim Boekesteijn <joost-wim@boekesteijn.nl>
  Copyright (C) 2012 Kris Kowal <kris.kowal@cixar.com>
  Copyright (C) 2012 Yusuke Suzuki <utatane.tea@gmail.com>
  Copyright (C) 2012 Arpad Borsos <arpad.borsos@googlemail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

/*jslint bitwise:true */
/*global escodegen:true, exports:true, generateStatement:true, generateExpression:true, generateFunctionBody:true, process:true, require:true, define:true*/

(function (factory, global) {
    'use strict';

    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js,
    // and plain browser loading,
    if (typeof define === 'function' && define.amd) {
        define(['exports'], function (exports) {
            factory(exports, global);
        });
    } else if (typeof exports !== 'undefined') {
        factory(exports, global);
    } else {
        factory((global.escodegen = {}), global);
    }
}(function (exports, global) {
    'use strict';

    var Syntax,
        Precedence,
        BinaryPrecedence,
        Regex,
        VisitorKeys,
        VisitorOption,
        SourceNode,
        isArray,
        base,
        indent,
        json,
        renumber,
        hexadecimal,
        quotes,
        escapeless,
        newline,
        space,
        parentheses,
        semicolons,
        safeConcatenation,
        directive,
        extra,
        parse,
        sourceMap;

    Syntax = {
        AssignmentExpression: 'AssignmentExpression',
        ArrayExpression: 'ArrayExpression',
        ArrayPattern: 'ArrayPattern',
        BlockStatement: 'BlockStatement',
        BinaryExpression: 'BinaryExpression',
        BreakStatement: 'BreakStatement',
        CallExpression: 'CallExpression',
        CatchClause: 'CatchClause',
        ComprehensionBlock: 'ComprehensionBlock',
        ComprehensionExpression: 'ComprehensionExpression',
        ConditionalExpression: 'ConditionalExpression',
        ContinueStatement: 'ContinueStatement',
        DirectiveStatement: 'DirectiveStatement',
        DoWhileStatement: 'DoWhileStatement',
        DebuggerStatement: 'DebuggerStatement',
        EmptyStatement: 'EmptyStatement',
        ExpressionStatement: 'ExpressionStatement',
        ForStatement: 'ForStatement',
        ForInStatement: 'ForInStatement',
        FunctionDeclaration: 'FunctionDeclaration',
        FunctionExpression: 'FunctionExpression',
        Identifier: 'Identifier',
        IfStatement: 'IfStatement',
        Literal: 'Literal',
        LabeledStatement: 'LabeledStatement',
        LogicalExpression: 'LogicalExpression',
        MemberExpression: 'MemberExpression',
        NewExpression: 'NewExpression',
        ObjectExpression: 'ObjectExpression',
        ObjectPattern: 'ObjectPattern',
        Program: 'Program',
        Property: 'Property',
        ReturnStatement: 'ReturnStatement',
        SequenceExpression: 'SequenceExpression',
        SwitchStatement: 'SwitchStatement',
        SwitchCase: 'SwitchCase',
        ThisExpression: 'ThisExpression',
        ThrowStatement: 'ThrowStatement',
        TryStatement: 'TryStatement',
        UnaryExpression: 'UnaryExpression',
        UpdateExpression: 'UpdateExpression',
        VariableDeclaration: 'VariableDeclaration',
        VariableDeclarator: 'VariableDeclarator',
        WhileStatement: 'WhileStatement',
        WithStatement: 'WithStatement',
        YieldExpression: 'YieldExpression',

    };

    Precedence = {
        Sequence: 0,
        Assignment: 1,
        Conditional: 2,
        LogicalOR: 3,
        LogicalAND: 4,
        BitwiseOR: 5,
        BitwiseXOR: 6,
        BitwiseAND: 7,
        Equality: 8,
        Relational: 9,
        BitwiseSHIFT: 10,
        Additive: 11,
        Multiplicative: 12,
        Unary: 13,
        Postfix: 14,
        Call: 15,
        New: 16,
        Member: 17,
        Primary: 18
    };

    BinaryPrecedence = {
        '||': Precedence.LogicalOR,
        '&&': Precedence.LogicalAND,
        '|': Precedence.BitwiseOR,
        '^': Precedence.BitwiseXOR,
        '&': Precedence.BitwiseAND,
        '==': Precedence.Equality,
        '!=': Precedence.Equality,
        '===': Precedence.Equality,
        '!==': Precedence.Equality,
        'is': Precedence.Equality,
        'isnt': Precedence.Equality,
        '<': Precedence.Relational,
        '>': Precedence.Relational,
        '<=': Precedence.Relational,
        '>=': Precedence.Relational,
        'in': Precedence.Relational,
        'instanceof': Precedence.Relational,
        '<<': Precedence.BitwiseSHIFT,
        '>>': Precedence.BitwiseSHIFT,
        '>>>': Precedence.BitwiseSHIFT,
        '+': Precedence.Additive,
        '-': Precedence.Additive,
        '*': Precedence.Multiplicative,
        '%': Precedence.Multiplicative,
        '/': Precedence.Multiplicative
    };

    Regex = {
        NonAsciiIdentifierPart: new RegExp('[\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0300-\u0374\u0376\u0377\u037a-\u037d\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u0483-\u0487\u048a-\u0527\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u05d0-\u05ea\u05f0-\u05f2\u0610-\u061a\u0620-\u0669\u066e-\u06d3\u06d5-\u06dc\u06df-\u06e8\u06ea-\u06fc\u06ff\u0710-\u074a\u074d-\u07b1\u07c0-\u07f5\u07fa\u0800-\u082d\u0840-\u085b\u08a0\u08a2-\u08ac\u08e4-\u08fe\u0900-\u0963\u0966-\u096f\u0971-\u0977\u0979-\u097f\u0981-\u0983\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bc-\u09c4\u09c7\u09c8\u09cb-\u09ce\u09d7\u09dc\u09dd\u09df-\u09e3\u09e6-\u09f1\u0a01-\u0a03\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a3c\u0a3e-\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a59-\u0a5c\u0a5e\u0a66-\u0a75\u0a81-\u0a83\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abc-\u0ac5\u0ac7-\u0ac9\u0acb-\u0acd\u0ad0\u0ae0-\u0ae3\u0ae6-\u0aef\u0b01-\u0b03\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3c-\u0b44\u0b47\u0b48\u0b4b-\u0b4d\u0b56\u0b57\u0b5c\u0b5d\u0b5f-\u0b63\u0b66-\u0b6f\u0b71\u0b82\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bbe-\u0bc2\u0bc6-\u0bc8\u0bca-\u0bcd\u0bd0\u0bd7\u0be6-\u0bef\u0c01-\u0c03\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c33\u0c35-\u0c39\u0c3d-\u0c44\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c58\u0c59\u0c60-\u0c63\u0c66-\u0c6f\u0c82\u0c83\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbc-\u0cc4\u0cc6-\u0cc8\u0cca-\u0ccd\u0cd5\u0cd6\u0cde\u0ce0-\u0ce3\u0ce6-\u0cef\u0cf1\u0cf2\u0d02\u0d03\u0d05-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d-\u0d44\u0d46-\u0d48\u0d4a-\u0d4e\u0d57\u0d60-\u0d63\u0d66-\u0d6f\u0d7a-\u0d7f\u0d82\u0d83\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0dca\u0dcf-\u0dd4\u0dd6\u0dd8-\u0ddf\u0df2\u0df3\u0e01-\u0e3a\u0e40-\u0e4e\u0e50-\u0e59\u0e81\u0e82\u0e84\u0e87\u0e88\u0e8a\u0e8d\u0e94-\u0e97\u0e99-\u0e9f\u0ea1-\u0ea3\u0ea5\u0ea7\u0eaa\u0eab\u0ead-\u0eb9\u0ebb-\u0ebd\u0ec0-\u0ec4\u0ec6\u0ec8-\u0ecd\u0ed0-\u0ed9\u0edc-\u0edf\u0f00\u0f18\u0f19\u0f20-\u0f29\u0f35\u0f37\u0f39\u0f3e-\u0f47\u0f49-\u0f6c\u0f71-\u0f84\u0f86-\u0f97\u0f99-\u0fbc\u0fc6\u1000-\u1049\u1050-\u109d\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u135d-\u135f\u1380-\u138f\u13a0-\u13f4\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f0\u1700-\u170c\u170e-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176c\u176e-\u1770\u1772\u1773\u1780-\u17d3\u17d7\u17dc\u17dd\u17e0-\u17e9\u180b-\u180d\u1810-\u1819\u1820-\u1877\u1880-\u18aa\u18b0-\u18f5\u1900-\u191c\u1920-\u192b\u1930-\u193b\u1946-\u196d\u1970-\u1974\u1980-\u19ab\u19b0-\u19c9\u19d0-\u19d9\u1a00-\u1a1b\u1a20-\u1a5e\u1a60-\u1a7c\u1a7f-\u1a89\u1a90-\u1a99\u1aa7\u1b00-\u1b4b\u1b50-\u1b59\u1b6b-\u1b73\u1b80-\u1bf3\u1c00-\u1c37\u1c40-\u1c49\u1c4d-\u1c7d\u1cd0-\u1cd2\u1cd4-\u1cf6\u1d00-\u1de6\u1dfc-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u200c\u200d\u203f\u2040\u2054\u2071\u207f\u2090-\u209c\u20d0-\u20dc\u20e1\u20e5-\u20f0\u2102\u2107\u210a-\u2113\u2115\u2119-\u211d\u2124\u2126\u2128\u212a-\u212d\u212f-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d7f-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u2de0-\u2dff\u2e2f\u3005-\u3007\u3021-\u302f\u3031-\u3035\u3038-\u303c\u3041-\u3096\u3099\u309a\u309d-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312d\u3131-\u318e\u31a0-\u31ba\u31f0-\u31ff\u3400-\u4db5\u4e00-\u9fcc\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua62b\ua640-\ua66f\ua674-\ua67d\ua67f-\ua697\ua69f-\ua6f1\ua717-\ua71f\ua722-\ua788\ua78b-\ua78e\ua790-\ua793\ua7a0-\ua7aa\ua7f8-\ua827\ua840-\ua873\ua880-\ua8c4\ua8d0-\ua8d9\ua8e0-\ua8f7\ua8fb\ua900-\ua92d\ua930-\ua953\ua960-\ua97c\ua980-\ua9c0\ua9cf-\ua9d9\uaa00-\uaa36\uaa40-\uaa4d\uaa50-\uaa59\uaa60-\uaa76\uaa7a\uaa7b\uaa80-\uaac2\uaadb-\uaadd\uaae0-\uaaef\uaaf2-\uaaf6\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uabc0-\uabea\uabec\uabed\uabf0-\uabf9\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe00-\ufe0f\ufe20-\ufe26\ufe33\ufe34\ufe4d-\ufe4f\ufe70-\ufe74\ufe76-\ufefc\uff10-\uff19\uff21-\uff3a\uff3f\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc]')
    };

    function getDefaultOptions() {
        // default options
        return {
            indent: null,
            base: null,
            parse: null,
            comment: false,
            format: {
                indent: {
                    style: '    ',
                    base: 0,
                    adjustMultilineComment: false
                },
                json: false,
                renumber: false,
                hexadecimal: false,
                quotes: 'single',
                escapeless: false,
                compact: false,
                parentheses: true,
                semicolons: true,
                safeConcatenation: false
            },
            moz: {
                starlessGenerator: false,
                parenthesizedComprehensionBlock: false
            },
            sourceMap: null,
            sourceMapWithCode: false,
            directive: false,
            verbatim: null
        };
    }

    function stringToArray(str) {
        var length = str.length,
            result = [],
            i;
        for (i = 0; i < length; i += 1) {
            result[i] = str.charAt(i);
        }
        return result;
    }

    function stringRepeat(str, num) {
        var result = '';

        for (num |= 0; num > 0; num >>>= 1, str += str) {
            if (num & 1) {
                result += str;
            }
        }

        return result;
    }

    isArray = Array.isArray;
    if (!isArray) {
        isArray = function isArray(array) {
            return Object.prototype.toString.call(array) === '[object Array]';
        };
    }

    // Fallback for the non SourceMap environment
    function SourceNodeMock(line, column, filename, chunk) {
        var result = [];

        function flatten(input) {
            var i, iz;
            if (isArray(input)) {
                for (i = 0, iz = input.length; i < iz; ++i) {
                    flatten(input[i]);
                }
            } else if (input instanceof SourceNodeMock) {
                result.push(input);
            } else if (typeof input === 'string' && input) {
                result.push(input);
            }
        }

        flatten(chunk);
        this.children = result;
    }

    SourceNodeMock.prototype.toString = function toString() {
        var res = '', i, iz, node;
        for (i = 0, iz = this.children.length; i < iz; ++i) {
            node = this.children[i];
            if (node instanceof SourceNodeMock) {
                res += node.toString();
            } else {
                res += node;
            }
        }
        return res;
    };

    SourceNodeMock.prototype.replaceRight = function replaceRight(pattern, replacement) {
        var last = this.children[this.children.length - 1];
        if (last instanceof SourceNodeMock) {
            last.replaceRight(pattern, replacement);
        } else if (typeof last === 'string') {
            this.children[this.children.length - 1] = last.replace(pattern, replacement);
        } else {
            this.children.push(''.replace(pattern, replacement));
        }
        return this;
    };

    SourceNodeMock.prototype.join = function join(sep) {
        var i, iz, result;
        result = [];
        iz = this.children.length;
        if (iz > 0) {
            for (i = 0, iz -= 1; i < iz; ++i) {
                result.push(this.children[i], sep);
            }
            result.push(this.children[iz]);
            this.children = result;
        }
        return this;
    };

    function hasLineTerminator(str) {
        return /[\r\n]/g.test(str);
    }

    function endsWithLineTerminator(str) {
        var ch = str.charAt(str.length - 1);
        return ch === '\r' || ch === '\n';
    }

    function shallowCopy(obj) {
        var ret = {}, key;
        for (key in obj) {
            if (obj.hasOwnProperty(key)) {
                ret[key] = obj[key];
            }
        }
        return ret;
    }

    function deepCopy(obj) {
        var ret = {}, key, val;
        for (key in obj) {
            if (obj.hasOwnProperty(key)) {
                val = obj[key];
                if (typeof val === 'object' && val !== null) {
                    ret[key] = deepCopy(val);
                } else {
                    ret[key] = val;
                }
            }
        }
        return ret;
    }

    function updateDeeply(target, override) {
        var key, val;

        function isHashObject(target) {
            return typeof target === 'object' && target instanceof Object && !(target instanceof RegExp);
        }

        for (key in override) {
            if (override.hasOwnProperty(key)) {
                val = override[key];
                if (isHashObject(val)) {
                    if (isHashObject(target[key])) {
                        updateDeeply(target[key], val);
                    } else {
                        target[key] = updateDeeply({}, val);
                    }
                } else {
                    target[key] = val;
                }
            }
        }
        return target;
    }

    function generateNumber(value) {
        var result, point, temp, exponent, pos;

        if (value !== value) {
            throw new Error('Numeric literal whose value is NaN');
        }
        if (value < 0 || (value === 0 && 1 / value < 0)) {
            throw new Error('Numeric literal whose value is negative');
        }

        if (value === 1 / 0) {
            return json ? 'null' : renumber ? '1e400' : '1e+400';
        }

        result = '' + value;
        if (!renumber || result.length < 3) {
            return result;
        }

        point = result.indexOf('.');
        if (!json && result.charAt(0) === '0' && point === 1) {
            point = 0;
            result = result.slice(1);
        }
        temp = result;
        result = result.replace('e+', 'e');
        exponent = 0;
        if ((pos = temp.indexOf('e')) > 0) {
            exponent = +temp.slice(pos + 1);
            temp = temp.slice(0, pos);
        }
        if (point >= 0) {
            exponent -= temp.length - point - 1;
            temp = +(temp.slice(0, point) + temp.slice(point + 1)) + '';
        }
        pos = 0;
        while (temp.charAt(temp.length + pos - 1) === '0') {
            pos -= 1;
        }
        if (pos !== 0) {
            exponent -= pos;
            temp = temp.slice(0, pos);
        }
        if (exponent !== 0) {
            temp += 'e' + exponent;
        }
        if ((temp.length < result.length ||
                    (hexadecimal && value > 1e12 && Math.floor(value) === value && (temp = '0x' + value.toString(16)).length < result.length)) &&
                +temp === value) {
            result = temp;
        }

        return result;
    }

    function escapeAllowedCharacter(ch, next) {
        var code = ch.charCodeAt(0), hex = code.toString(16), result = '\\';

        switch (ch) {
        case '\b':
            result += 'b';
            break;
        case '\f':
            result += 'f';
            break;
        case '\t':
            result += 't';
            break;
        default:
            if (json || code > 0xff) {
                result += 'u' + '0000'.slice(hex.length) + hex;
            } else if (ch === '\u0000' && '0123456789'.indexOf(next) < 0) {
                result += '0';
            } else if (ch === '\v') {
                result += 'v';
            } else {
                result += 'x' + '00'.slice(hex.length) + hex;
            }
            break;
        }

        return result;
    }

    function escapeDisallowedCharacter(ch) {
        var result = '\\';
        switch (ch) {
        case '\\':
            result += '\\';
            break;
        case '\n':
            result += 'n';
            break;
        case '\r':
            result += 'r';
            break;
        case '\u2028':
            result += 'u2028';
            break;
        case '\u2029':
            result += 'u2029';
            break;
        default:
            throw new Error('Incorrectly classified character');
        }

        return result;
    }

    function escapeDirective(str) {
        var i, iz, ch, single, buf, quote;

        buf = str;
        if (typeof buf[0] === 'undefined') {
            buf = stringToArray(buf);
        }

        quote = quotes === 'double' ? '"' : '\'';
        for (i = 0, iz = buf.length; i < iz; i += 1) {
            ch = buf[i];
            if (ch === '\'') {
                quote = '"';
                break;
            } else if (ch === '"') {
                quote = '\'';
                break;
            } else if (ch === '\\') {
                i += 1;
            }
        }

        return quote + str + quote;
    }

    function escapeString(str) {
        var result = '', i, len, ch, next, singleQuotes = 0, doubleQuotes = 0, single;

        if (typeof str[0] === 'undefined') {
            str = stringToArray(str);
        }

        for (i = 0, len = str.length; i < len; i += 1) {
            ch = str[i];
            if (ch === '\'') {
                singleQuotes += 1;
            } else if (ch === '"') {
                doubleQuotes += 1;
            } else if (ch === '/' && json) {
                result += '\\';
            } else if ('\\\n\r\u2028\u2029'.indexOf(ch) >= 0) {
                result += escapeDisallowedCharacter(ch);
                continue;
            } else if ((json && ch < ' ') || !(json || escapeless || (ch >= ' ' && ch <= '~'))) {
                result += escapeAllowedCharacter(ch, str[i + 1]);
                continue;
            }
            result += ch;
        }

        single = !(quotes === 'double' || (quotes === 'auto' && doubleQuotes < singleQuotes));
        str = result;
        result = single ? '\'' : '"';

        if (typeof str[0] === 'undefined') {
            str = stringToArray(str);
        }

        for (i = 0, len = str.length; i < len; i += 1) {
            ch = str[i];
            if ((ch === '\'' && single) || (ch === '"' && !single)) {
                result += '\\';
            }
            result += ch;
        }

        return result + (single ? '\'' : '"');
    }

    function isWhiteSpace(ch) {
        return '\t\v\f \xa0'.indexOf(ch) >= 0 || (ch.charCodeAt(0) >= 0x1680 && '\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\ufeff'.indexOf(ch) >= 0);
    }

    function isLineTerminator(ch) {
        return '\n\r\u2028\u2029'.indexOf(ch) >= 0;
    }

    function isIdentifierPart(ch) {
        return (ch === '$') || (ch === '_') || (ch === '\\') ||
            (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
            ((ch >= '0') && (ch <= '9')) ||
            ((ch.charCodeAt(0) >= 0x80) && Regex.NonAsciiIdentifierPart.test(ch));
    }

    function toSourceNode(generated, node) {
        if (node == null) {
            if (generated instanceof SourceNode) {
                return generated;
            } else {
                node = {};
            }
        }
        if (node.loc == null) {
            return new SourceNode(null, null, sourceMap, generated);
        }
        return new SourceNode(node.loc.start.line, node.loc.start.column, (sourceMap === true ? node.loc.source || null : sourceMap), generated);
    }

    function join(left, right) {
        var leftSource = toSourceNode(left).toString(),
            rightSource = toSourceNode(right).toString(),
            leftChar = leftSource.charAt(leftSource.length - 1),
            rightChar = rightSource.charAt(0);

        if (((leftChar === '+' || leftChar === '-') && leftChar === rightChar) || (isIdentifierPart(leftChar) && isIdentifierPart(rightChar))) {
            return [left, ' ', right];
        } else if (isWhiteSpace(leftChar) || isLineTerminator(leftChar) || isWhiteSpace(rightChar) || isLineTerminator(rightChar)) {
            return [left, right];
        }
        return [left, space, right];
    }

    function addIndent(stmt) {
        return [base, stmt];
    }

    function withIndent(fn) {
        var previousBase, result;
        previousBase = base;
        base += indent;
        result = fn.call(this, base);
        base = previousBase;
        return result;
    }

    function calculateSpaces(str) {
        var i;
        for (i = str.length - 1; i >= 0; i -= 1) {
            if (isLineTerminator(str.charAt(i))) {
                break;
            }
        }
        return (str.length - 1) - i;
    }

    function adjustMultilineComment(value, specialBase) {
        var array, i, len, line, j, ch, spaces, previousBase;

        array = value.split(/\r\n|[\r\n]/);
        spaces = Number.MAX_VALUE;

        // first line doesn't have indentation
        for (i = 1, len = array.length; i < len; i += 1) {
            line = array[i];
            j = 0;
            while (j < line.length && isWhiteSpace(line[j])) {
                j += 1;
            }
            if (spaces > j) {
                spaces = j;
            }
        }

        if (typeof specialBase !== 'undefined') {
            // pattern like
            // {
            //   var t = 20;  /*
            //                 * this is comment
            //                 */
            // }
            previousBase = base;
            if (array[1][spaces] === '*') {
                specialBase += ' ';
            }
            base = specialBase;
        } else {
            if (spaces & 1) {
                // /*
                //  *
                //  */
                // If spaces are odd number, above pattern is considered.
                // We waste 1 space.
                spaces -= 1;
            }
            previousBase = base;
        }

        for (i = 1, len = array.length; i < len; i += 1) {
            array[i] = toSourceNode(addIndent(array[i].slice(spaces))).join('');
        }

        base = previousBase;

        return array.join('\n');
    }

    function generateComment(comment, specialBase) {
        if (comment.type === 'Line') {
            if (endsWithLineTerminator(comment.value)) {
                return '//' + comment.value;
            } else {
                // Always use LineTerminator
                return '//' + comment.value + '\n';
            }
        }
        if (extra.format.indent.adjustMultilineComment && /[\n\r]/.test(comment.value)) {
            return adjustMultilineComment('/*' + comment.value + '*/', specialBase);
        }
        return '/*' + comment.value + '*/';
    }

    function addCommentsToStatement(stmt, result) {
        var i, len, comment, save, node, tailingToStatement, specialBase, fragment;

        if (stmt.leadingComments && stmt.leadingComments.length > 0) {
            save = result;

            comment = stmt.leadingComments[0];
            result = [];
            if (safeConcatenation && stmt.type === Syntax.Program && stmt.body.length === 0) {
                result.push('\n');
            }
            result.push(generateComment(comment));
            if (!endsWithLineTerminator(toSourceNode(result).toString())) {
                result.push('\n');
            }

            for (i = 1, len = stmt.leadingComments.length; i < len; i += 1) {
                comment = stmt.leadingComments[i];
                fragment = [generateComment(comment)];
                if (!endsWithLineTerminator(toSourceNode(fragment).toString())) {
                    fragment.push('\n');
                }
                result.push(addIndent(fragment));
            }

            result.push(addIndent(save));
        }

        if (stmt.trailingComments) {
            tailingToStatement = !endsWithLineTerminator(toSourceNode(result).toString());
            specialBase = stringRepeat(' ', calculateSpaces(toSourceNode([base, result, indent]).toString()));
            for (i = 0, len = stmt.trailingComments.length; i < len; i += 1) {
                comment = stmt.trailingComments[i];
                if (tailingToStatement) {
                    // We assume target like following script
                    //
                    // var t = 20;  /**
                    //               * This is comment of t
                    //               */
                    if (i === 0) {
                        // first case
                        result = [result, indent];
                    } else {
                        result = [result, specialBase];
                    }
                    result.push(generateComment(comment, specialBase));
                } else {
                    result = [result, addIndent(generateComment(comment))];
                }
                if (i !== len - 1 && !endsWithLineTerminator(toSourceNode(result).toString())) {
                    result = [result, '\n'];
                }
            }
        }

        return result;
    }

    function parenthesize(text, current, should) {
        if (current < should) {
            return ['(', text, ')'];
        }
        return text;
    }

    function maybeBlock(stmt, semicolonOptional, functionBody) {
        var result, noLeadingComment;

        noLeadingComment = !extra.comment || !stmt.leadingComments;

        if (stmt.type === Syntax.BlockStatement && noLeadingComment) {
            return [space, generateStatement(stmt, { functionBody: functionBody })];
        }

        if (stmt.type === Syntax.EmptyStatement && noLeadingComment) {
            return ';';
        }

        withIndent(function () {
            result = [newline, addIndent(generateStatement(stmt, { semicolonOptional: semicolonOptional, functionBody: functionBody }))];
        });

        return result;
    }

    function maybeBlockSuffix(stmt, result) {
        var ends = endsWithLineTerminator(toSourceNode(result).toString());
        if (stmt.type === Syntax.BlockStatement && (!extra.comment || !stmt.leadingComments) && !ends) {
            return [result, space];
        }
        if (ends) {
            return [result, base];
        }
        return [result, newline, base];
    }

    function generateVerbatim(expr, option) {
        var i, result;
        result = expr[extra.verbatim].split(/\r\n|\n/);
        for (i = 1; i < result.length; i++) {
            result[i] = newline + base + result[i];
        }

        result = parenthesize(result, Precedence.Sequence, option.precedence);
        return toSourceNode(result, expr);
    }

    function generateFunctionBody(node) {
        var result, i, len, expr;
        result = ['('];
        for (i = 0, len = node.params.length; i < len; i += 1) {
            result.push(node.params[i].name);
            if (i + 1 < len) {
                result.push(',' + space);
            }
        }
        result.push(')');

        if (node.expression) {
            result.push(space);
            expr = generateExpression(node.body, {
                precedence: Precedence.Assignment,
                allowIn: true,
                allowCall: true
            });
            if (expr.toString().charAt(0) === '{') {
                expr = ['(', expr, ')'];
            }
            result.push(expr);
        } else {
            result.push(maybeBlock(node.body, false, true));
        }
        return result;
    }

    function generateExpression(expr, option) {
        var result, precedence, currentPrecedence, i, len, raw, fragment, multiline, leftChar, leftSource, rightChar, rightSource, allowIn, allowCall, allowUnparenthesizedNew, property, key, value;

        precedence = option.precedence;
        allowIn = option.allowIn;
        allowCall = option.allowCall;

        if (extra.verbatim && expr.hasOwnProperty(extra.verbatim)) {
            return generateVerbatim(expr, option);
        }

        switch (expr.type) {
        case Syntax.SequenceExpression:
            result = [];
            allowIn |= (Precedence.Sequence < precedence);
            for (i = 0, len = expr.expressions.length; i < len; i += 1) {
                result.push(generateExpression(expr.expressions[i], {
                    precedence: Precedence.Assignment,
                    allowIn: allowIn,
                    allowCall: true
                }));
                if (i + 1 < len) {
                    result.push(',' + space);
                }
            }
            result = parenthesize(result, Precedence.Sequence, precedence);
            break;

        case Syntax.AssignmentExpression:
            allowIn |= (Precedence.Assignment < precedence);
            result = parenthesize(
                [
                    generateExpression(expr.left, {
                        precedence: Precedence.Call,
                        allowIn: allowIn,
                        allowCall: true
                    }),
                    space + expr.operator + space,
                    generateExpression(expr.right, {
                        precedence: Precedence.Assignment,
                        allowIn: allowIn,
                        allowCall: true
                    })
                ],
                Precedence.Assignment,
                precedence
            );
            break;

        case Syntax.ConditionalExpression:
            allowIn |= (Precedence.Conditional < precedence);
            result = parenthesize(
                [
                    generateExpression(expr.test, {
                        precedence: Precedence.LogicalOR,
                        allowIn: allowIn,
                        allowCall: true
                    }),
                    space + '?' + space,
                    generateExpression(expr.consequent, {
                        precedence: Precedence.Assignment,
                        allowIn: allowIn,
                        allowCall: true
                    }),
                    space + ':' + space,
                    generateExpression(expr.alternate, {
                        precedence: Precedence.Assignment,
                        allowIn: allowIn,
                        allowCall: true
                    })
                ],
                Precedence.Conditional,
                precedence
            );
            break;

        case Syntax.LogicalExpression:
        case Syntax.BinaryExpression:
            currentPrecedence = BinaryPrecedence[expr.operator];

            allowIn |= (currentPrecedence < precedence);

            result = join(
                generateExpression(expr.left, {
                    precedence: currentPrecedence,
                    allowIn: allowIn,
                    allowCall: true
                }),
                expr.operator
            );

            fragment = generateExpression(expr.right, {
                precedence: currentPrecedence + 1,
                allowIn: allowIn,
                allowCall: true
            });

            if (expr.operator === '/' && fragment.toString().charAt(0) === '/') {
                // If '/' concats with '/', it is interpreted as comment start
                result.push(' ', fragment);
            } else {
                result = join(result, fragment);
            }

            if (expr.operator === 'in' && !allowIn) {
                result = ['(', result, ')'];
            } else {
                result = parenthesize(result, currentPrecedence, precedence);
            }

            break;

        case Syntax.CallExpression:
            result = [generateExpression(expr.callee, {
                precedence: Precedence.Call,
                allowIn: true,
                allowCall: true,
                allowUnparenthesizedNew: false
            })];

            result.push('(');
            for (i = 0, len = expr['arguments'].length; i < len; i += 1) {
                result.push(generateExpression(expr['arguments'][i], {
                    precedence: Precedence.Assignment,
                    allowIn: true,
                    allowCall: true
                }));
                if (i + 1 < len) {
                    result.push(',' + space);
                }
            }
            result.push(')');

            if (!allowCall) {
                result = ['(', result, ')'];
            } else {
                result = parenthesize(result, Precedence.Call, precedence);
            }
            break;

        case Syntax.NewExpression:
            len = expr['arguments'].length;
            allowUnparenthesizedNew = option.allowUnparenthesizedNew === undefined || option.allowUnparenthesizedNew;

            result = join(
                'new',
                generateExpression(expr.callee, {
                    precedence: Precedence.New,
                    allowIn: true,
                    allowCall: false,
                    allowUnparenthesizedNew: allowUnparenthesizedNew && !parentheses && len === 0
                })
            );

            if (!allowUnparenthesizedNew || parentheses || len > 0) {
                result.push('(');
                for (i = 0; i < len; i += 1) {
                    result.push(generateExpression(expr['arguments'][i], {
                        precedence: Precedence.Assignment,
                        allowIn: true,
                        allowCall: true
                    }));
                    if (i + 1 < len) {
                        result.push(',' + space);
                    }
                }
                result.push(')');
            }

            result = parenthesize(result, Precedence.New, precedence);
            break;

        case Syntax.MemberExpression:
            result = [generateExpression(expr.object, {
                precedence: Precedence.Call,
                allowIn: true,
                allowCall: allowCall,
                allowUnparenthesizedNew: false
            })];

            if (expr.computed) {
                result.push('[', generateExpression(expr.property, {
                    precedence: Precedence.Sequence,
                    allowIn: true,
                    allowCall: allowCall
                }), ']');
            } else {
                if (expr.object.type === Syntax.Literal && typeof expr.object.value === 'number') {
                    if (result.indexOf('.') < 0) {
                        if (!/[eExX]/.test(result) && !(result.length >= 2 && result[0] === '0')) {
                            result.push('.');
                        }
                    }
                }
                result.push('.' + expr.property.name);
            }

            result = parenthesize(result, Precedence.Member, precedence);
            break;

        case Syntax.UnaryExpression:
            fragment = generateExpression(expr.argument, {
                precedence: Precedence.Unary,
                allowIn: true,
                allowCall: true
            });

            if (space === '') {
                result = join(expr.operator, fragment);
            } else {
                result = [expr.operator];
                if (expr.operator.length > 2) {
                    // delete, void, typeof
                    // get `typeof []`, not `typeof[]`
                    result = join(result, fragment);
                } else {
                    // Prevent inserting spaces between operator and argument if it is unnecessary
                    // like, `!cond`
                    leftSource = toSourceNode(result).toString();
                    leftChar = leftSource.charAt(leftSource.length - 1);
                    rightChar = fragment.toString().charAt(0);

                    if (((leftChar === '+' || leftChar === '-') && leftChar === rightChar) || (isIdentifierPart(leftChar) && isIdentifierPart(rightChar))) {
                        result.push(' ', fragment);
                    } else {
                        result.push(fragment);
                    }
                }
            }
            result = parenthesize(result, Precedence.Unary, precedence);
            break;

        case Syntax.YieldExpression:
            if (expr.delegate) {
                result = 'yield*';
            } else {
                result = 'yield';
            }
            if (expr.argument) {
                result = join(
                    result,
                    generateExpression(expr.argument, {
                        precedence: Precedence.Assignment,
                        allowIn: true,
                        allowCall: true
                    })
                );
            }
            break;

        case Syntax.UpdateExpression:
            if (expr.prefix) {
                result = parenthesize(
                    [
                        expr.operator,
                        generateExpression(expr.argument, {
                            precedence: Precedence.Unary,
                            allowIn: true,
                            allowCall: true
                        })
                    ],
                    Precedence.Unary,
                    precedence
                );
            } else {
                result = parenthesize(
                    [
                        generateExpression(expr.argument, {
                            precedence: Precedence.Postfix,
                            allowIn: true,
                            allowCall: true
                        }),
                        expr.operator
                    ],
                    Precedence.Postfix,
                    precedence
                );
            }
            break;

        case Syntax.FunctionExpression:
            result = 'function';
            if (expr.id) {
                result += ' ' + expr.id.name;
            } else {
                result += space;
            }

            result = [result, generateFunctionBody(expr)];
            break;

        case Syntax.ArrayPattern:
        case Syntax.ArrayExpression:
            if (!expr.elements.length) {
                result = '[]';
                break;
            }
            multiline = expr.elements.length > 1;
            result = ['[', multiline ? newline : ''];
            withIndent(function (indent) {
                for (i = 0, len = expr.elements.length; i < len; i += 1) {
                    if (!expr.elements[i]) {
                        if (multiline) {
                            result.push(indent);
                        }
                        if (i + 1 === len) {
                            result.push(',');
                        }
                    } else {
                        result.push(multiline ? indent : '', generateExpression(expr.elements[i], {
                            precedence: Precedence.Assignment,
                            allowIn: true,
                            allowCall: true
                        }));
                    }
                    if (i + 1 < len) {
                        result.push(',' + (multiline ? newline : space));
                    }
                }
            });
            if (multiline && !endsWithLineTerminator(toSourceNode(result).toString())) {
                result.push(newline);
            }
            result.push(multiline ? base : '', ']');
            break;

        case Syntax.Property:
            if (expr.kind === 'get' || expr.kind === 'set') {
                result = [
                    expr.kind + ' ',
                    generateExpression(expr.key, {
                        precedence: Precedence.Sequence,
                        allowIn: true,
                        allowCall: true
                    }),
                    generateFunctionBody(expr.value)
                ];
            } else {
                if (expr.shorthand) {
                    result = generateExpression(expr.key, {
                        precedence: Precedence.Sequence,
                        allowIn: true,
                        allowCall: true
                    });
                } else if (expr.method) {
                    result = [];
                    if (expr.value.generator) {
                        result.push('*');
                    }
                    result.push(generateExpression(expr.key, {
                        precedence: Precedence.Sequence,
                        allowIn: true,
                        allowCall: true
                    }), generateFunctionBody(expr.value));
                } else {
                    result = [
                        generateExpression(expr.key, {
                            precedence: Precedence.Sequence,
                            allowIn: true,
                            allowCall: true
                        }),
                        ':' + space,
                        generateExpression(expr.value, {
                            precedence: Precedence.Assignment,
                            allowIn: true,
                            allowCall: true
                        })
                    ];
                }
            }
            break;

        case Syntax.ObjectExpression:
            if (!expr.properties.length) {
                result = '{}';
                break;
            }
            multiline = expr.properties.length > 1;

            withIndent(function (indent) {
                fragment = generateExpression(expr.properties[0], {
                    precedence: Precedence.Sequence,
                    allowIn: true,
                    allowCall: true
                });
            });

            if (!multiline) {
                // issues 4
                // Do not transform from
                //   dejavu.Class.declare({
                //       method2: function () {}
                //   });
                // to
                //   dejavu.Class.declare({method2: function () {
                //       }});
                if (!hasLineTerminator(toSourceNode(fragment).toString())) {
                    result = [ '{', space, fragment, space, '}' ];
                    break;
                }
            }

            withIndent(function (indent) {
                result = [ '{', newline, indent, fragment ];

                if (multiline) {
                    result.push(',' + newline);
                    for (i = 1, len = expr.properties.length; i < len; i += 1) {
                        result.push(indent, generateExpression(expr.properties[i], {
                            precedence: Precedence.Sequence,
                            allowIn: true,
                            allowCall: true
                        }));
                        if (i + 1 < len) {
                            result.push(',' + newline);
                        }
                    }
                }
            });

            if (!endsWithLineTerminator(toSourceNode(result).toString())) {
                result.push(newline);
            }
            result.push(base, '}');
            break;

        case Syntax.ObjectPattern:
            if (!expr.properties.length) {
                result = '{}';
                break;
            }

            multiline = false;
            if (expr.properties.length === 1) {
                property = expr.properties[0];
                if (property.value.type !== Syntax.Identifier) {
                    multiline = true;
                }
            } else {
                for (i = 0, len = expr.properties.length; i < len; i += 1) {
                    property = expr.properties[i];
                    if (!property.shorthand) {
                        multiline = true;
                        break;
                    }
                }
            }
            result = ['{', multiline ? newline : '' ];

            withIndent(function (indent) {
                for (i = 0, len = expr.properties.length; i < len; i += 1) {
                    result.push(multiline ? indent : '', generateExpression(expr.properties[i], {
                        precedence: Precedence.Sequence,
                        allowIn: true,
                        allowCall: true
                    }));
                    if (i + 1 < len) {
                        result.push(',' + (multiline ? newline : space));
                    }
                }
            });

            if (multiline && !endsWithLineTerminator(toSourceNode(result).toString())) {
                result.push(newline);
            }
            result.push(multiline ? base : '', '}');
            break;

        case Syntax.ThisExpression:
            result = 'this';
            break;

        case Syntax.Identifier:
            result = expr.name;
            break;

        case Syntax.Literal:
            if (expr.hasOwnProperty('raw') && parse) {
                try {
                    raw = parse(expr.raw).body[0].expression;
                    if (raw.type === Syntax.Literal) {
                        if (raw.value === expr.value) {
                            result = expr.raw;
                            break;
                        }
                    }
                } catch (e) {
                    // not use raw property
                }
            }

            if (expr.value === null) {
                result = 'null';
                break;
            }

            if (typeof expr.value === 'string') {
                result = escapeString(expr.value);
                break;
            }

            if (typeof expr.value === 'number') {
                result = generateNumber(expr.value);
                break;
            }

            result = expr.value.toString();
            break;

        case Syntax.ComprehensionExpression:
            result = [
                '[',
                generateExpression(expr.body, {
                    precedence: Precedence.Assignment,
                    allowIn: true,
                    allowCall: true
                })
            ];

            if (expr.blocks) {
                for (i = 0, len = expr.blocks.length; i < len; i += 1) {
                    fragment = generateExpression(expr.blocks[i], {
                        precedence: Precedence.Sequence,
                        allowIn: true,
                        allowCall: true
                    });
                    result = join(result, fragment);
                }
            }

            if (expr.filter) {
                result = join(result, 'if' + space);
                fragment = generateExpression(expr.filter, {
                    precedence: Precedence.Sequence,
                    allowIn: true,
                    allowCall: true
                });
                if (extra.moz.parenthesizedComprehensionBlock) {
                    result = join(result, [ '(', fragment, ')' ]);
                } else {
                    result = join(result, fragment);
                }
            }
            result.push(']');
            break;

        case Syntax.ComprehensionBlock:
            if (expr.left.type === Syntax.VariableDeclaration) {
                fragment = [
                    expr.left.kind + ' ',
                    generateStatement(expr.left.declarations[0], {
                        allowIn: false
                    })
                ];
            } else {
                fragment = generateExpression(expr.left, {
                    precedence: Precedence.Call,
                    allowIn: true,
                    allowCall: true
                });
            }

            fragment = join(fragment, expr.of ? 'of' : 'in');
            fragment = join(fragment, generateExpression(expr.right, {
                precedence: Precedence.Sequence,
                allowIn: true,
                allowCall: true
            }));

            if (extra.moz.parenthesizedComprehensionBlock) {
                result = [ 'for' + space + '(', fragment, ')' ];
            } else {
                result = join('for' + space, fragment);
            }
            break;

        default:
            throw new Error('Unknown expression type: ' + expr.type);
        }

        return toSourceNode(result, expr);
    }

    function generateStatement(stmt, option) {
        var i, len, result, node, allowIn, functionBody, directiveContext, fragment, semicolon;

        allowIn = true;
        semicolon = ';';
        functionBody = false;
        directiveContext = false;
        if (option) {
            allowIn = option.allowIn === undefined || option.allowIn;
            if (!semicolons && option.semicolonOptional === true) {
                semicolon = '';
            }
            functionBody = option.functionBody;
            directiveContext = option.directiveContext;
        }

        switch (stmt.type) {
        case Syntax.BlockStatement:
            result = ['{', newline];

            withIndent(function () {
                for (i = 0, len = stmt.body.length; i < len; i += 1) {
                    fragment = addIndent(generateStatement(stmt.body[i], {
                        semicolonOptional: i === len - 1,
                        directiveContext: functionBody
                    }));
                    result.push(fragment);
                    if (!endsWithLineTerminator(toSourceNode(fragment).toString())) {
                        result.push(newline);
                    }
                }
            });

            result.push(addIndent('}'));
            break;

        case Syntax.BreakStatement:
            if (stmt.label) {
                result = 'break ' + stmt.label.name + semicolon;
            } else {
                result = 'break' + semicolon;
            }
            break;

        case Syntax.ContinueStatement:
            if (stmt.label) {
                result = 'continue ' + stmt.label.name + semicolon;
            } else {
                result = 'continue' + semicolon;
            }
            break;

        case Syntax.DirectiveStatement:
            if (stmt.raw) {
                result = stmt.raw + semicolon;
            } else {
                result = escapeDirective(stmt.directive) + semicolon;
            }
            break;

        case Syntax.DoWhileStatement:
            // Because `do 42 while (cond)` is Syntax Error. We need semicolon.
            result = join('do', maybeBlock(stmt.body));
            result = maybeBlockSuffix(stmt.body, result);
            result = join(result, [
                'while' + space + '(',
                generateExpression(stmt.test, {
                    precedence: Precedence.Sequence,
                    allowIn: true,
                    allowCall: true
                }),
                ')' + semicolon
            ]);
            break;

        case Syntax.CatchClause:
            withIndent(function () {
                result = [
                    'catch' + space + '(',
                    generateExpression(stmt.param, {
                        precedence: Precedence.Sequence,
                        allowIn: true,
                        allowCall: true
                    }),
                    ')'
                ];
            });
            result.push(maybeBlock(stmt.body));
            break;

        case Syntax.DebuggerStatement:
            result = 'debugger' + semicolon;
            break;

        case Syntax.EmptyStatement:
            result = ';';
            break;

        case Syntax.ExpressionStatement:
            result = [generateExpression(stmt.expression, {
                precedence: Precedence.Sequence,
                allowIn: true,
                allowCall: true
            })];
            // 12.4 '{', 'function' is not allowed in this position.
            // wrap expression with parentheses
            if (result.toString().charAt(0) === '{' || (result.toString().slice(0, 8) === 'function' && " (".indexOf(result.toString().charAt(8)) >= 0) || (directive && directiveContext && stmt.expression.type === Syntax.Literal && typeof stmt.expression.value === 'string')) {
                result = ['(', result, ')' + semicolon];
            } else {
                result.push(semicolon);
            }
            break;

        case Syntax.VariableDeclarator:
            if (stmt.init) {
                result = [
                    generateExpression(stmt.id, {
                        precedence: Precedence.Assignment,
                        allowIn: allowIn,
                        allowCall: true
                    }) + space + '=' + space,
                    generateExpression(stmt.init, {
                        precedence: Precedence.Assignment,
                        allowIn: allowIn,
                        allowCall: true
                    })
                ];
            } else {
                result = stmt.id.name;
            }
            break;

        case Syntax.VariableDeclaration:
            result = [stmt.kind];
            // special path for
            // var x = function () {
            // };
            if (stmt.declarations.length === 1 && stmt.declarations[0].init &&
                    stmt.declarations[0].init.type === Syntax.FunctionExpression) {
                result.push(' ', generateStatement(stmt.declarations[0], {
                    allowIn: allowIn
                }));
            } else {
                // VariableDeclarator is typed as Statement,
                // but joined with comma (not LineTerminator).
                // So if comment is attached to target node, we should specialize.
                withIndent(function () {
                    node = stmt.declarations[0];
                    if (extra.comment && node.leadingComments) {
                        result.push('\n', addIndent(generateStatement(node, {
                            allowIn: allowIn
                        })));
                    } else {
                        result.push(' ', generateStatement(node, {
                            allowIn: allowIn
                        }));
                    }

                    for (i = 1, len = stmt.declarations.length; i < len; i += 1) {
                        node = stmt.declarations[i];
                        if (extra.comment && node.leadingComments) {
                            result.push(',' + newline, addIndent(generateStatement(node, {
                                allowIn: allowIn
                            })));
                        } else {
                            result.push(',' + space, generateStatement(node, {
                                allowIn: allowIn
                            }));
                        }
                    }
                });
            }
            result.push(semicolon);
            break;

        case Syntax.ThrowStatement:
            result = [join(
                'throw',
                generateExpression(stmt.argument, {
                    precedence: Precedence.Sequence,
                    allowIn: true,
                    allowCall: true
                })
            ), semicolon];
            break;

        case Syntax.TryStatement:
            result = ['try', maybeBlock(stmt.block)];
            result = maybeBlockSuffix(stmt.block, result);
            for (i = 0, len = stmt.handlers.length; i < len; i += 1) {
                result = join(result, generateStatement(stmt.handlers[i]));
                if (stmt.finalizer || i + 1 !== len) {
                    result = maybeBlockSuffix(stmt.handlers[i].body, result);
                }
            }
            if (stmt.finalizer) {
                result = join(result, ['finally', maybeBlock(stmt.finalizer)]);
            }
            break;

        case Syntax.SwitchStatement:
            withIndent(function () {
                result = [
                    'switch' + space + '(',
                    generateExpression(stmt.discriminant, {
                        precedence: Precedence.Sequence,
                        allowIn: true,
                        allowCall: true
                    }),
                    ')' + space + '{' + newline
                ];
            });
            if (stmt.cases) {
                for (i = 0, len = stmt.cases.length; i < len; i += 1) {
                    fragment = addIndent(generateStatement(stmt.cases[i], {semicolonOptional: i === len - 1}));
                    result.push(fragment);
                    if (!endsWithLineTerminator(toSourceNode(fragment).toString())) {
                        result.push(newline);
                    }
                }
            }
            result.push(addIndent('}'));
            break;

        case Syntax.SwitchCase:
            withIndent(function () {
                if (stmt.test) {
                    result = [
                        join('case', generateExpression(stmt.test, {
                            precedence: Precedence.Sequence,
                            allowIn: true,
                            allowCall: true
                        })),
                        ':'
                    ];
                } else {
                    result = ['default:'];
                }

                i = 0;
                len = stmt.consequent.length;
                if (len && stmt.consequent[0].type === Syntax.BlockStatement) {
                    fragment = maybeBlock(stmt.consequent[0]);
                    result.push(fragment);
                    i = 1;
                }

                if (i !== len && !endsWithLineTerminator(toSourceNode(result).toString())) {
                    result.push(newline);
                }

                for (; i < len; i += 1) {
                    fragment = addIndent(generateStatement(stmt.consequent[i], {semicolonOptional: i === len - 1 && semicolon === ''}));
                    result.push(fragment);
                    if (i + 1 !== len && !endsWithLineTerminator(toSourceNode(fragment).toString())) {
                        result.push(newline);
                    }
                }
            });
            break;

        case Syntax.IfStatement:
            withIndent(function () {
                result = [
                    'if' + space + '(',
                    generateExpression(stmt.test, {
                        precedence: Precedence.Sequence,
                        allowIn: true,
                        allowCall: true
                    }),
                    ')'
                ];
            });
            if (stmt.alternate) {
                result.push(maybeBlock(stmt.consequent));
                result = maybeBlockSuffix(stmt.consequent, result);
                if (stmt.alternate.type === Syntax.IfStatement) {
                    result = join(result, ['else ', generateStatement(stmt.alternate, {semicolonOptional: semicolon === ''})]);
                } else {
                    result = join(result, join('else', maybeBlock(stmt.alternate, semicolon === '')));
                }
            } else {
                result.push(maybeBlock(stmt.consequent, semicolon === ''));
            }
            break;

        case Syntax.ForStatement:
            withIndent(function () {
                result = ['for' + space + '('];
                if (stmt.init) {
                    if (stmt.init.type === Syntax.VariableDeclaration) {
                        result.push(generateStatement(stmt.init, {allowIn: false}));
                    } else {
                        result.push(generateExpression(stmt.init, {
                            precedence: Precedence.Sequence,
                            allowIn: false,
                            allowCall: true
                        }), ';');
                    }
                } else {
                    result.push(';');
                }

                if (stmt.test) {
                    result.push(space, generateExpression(stmt.test, {
                        precedence: Precedence.Sequence,
                        allowIn: true,
                        allowCall: true
                    }), ';');
                } else {
                    result.push(';');
                }

                if (stmt.update) {
                    result.push(space, generateExpression(stmt.update, {
                        precedence: Precedence.Sequence,
                        allowIn: true,
                        allowCall: true
                    }), ')');
                } else {
                    result.push(')');
                }
            });

            result.push(maybeBlock(stmt.body, semicolon === ''));
            break;

        case Syntax.ForInStatement:
            result = ['for' + space + '('];
            withIndent(function () {
                if (stmt.left.type === Syntax.VariableDeclaration) {
                    withIndent(function () {
                        result.push(stmt.left.kind + ' ', generateStatement(stmt.left.declarations[0], {
                            allowIn: false
                        }));
                    });
                } else {
                    result.push(generateExpression(stmt.left, {
                        precedence: Precedence.Call,
                        allowIn: true,
                        allowCall: true
                    }));
                }

                result = join(result, 'in');
                result = [join(
                    result,
                    generateExpression(stmt.right, {
                        precedence: Precedence.Sequence,
                        allowIn: true,
                        allowCall: true
                    })
                ), ')'];
            });
            result.push(maybeBlock(stmt.body, semicolon === ''));
            break;

        case Syntax.LabeledStatement:
            result = [stmt.label.name + ':', maybeBlock(stmt.body, semicolon === '')];
            break;

        case Syntax.Program:
            len = stmt.body.length;
            result = [safeConcatenation && len > 0 ? '\n' : ''];
            for (i = 0; i < len; i += 1) {
                fragment = addIndent(
                    generateStatement(stmt.body[i], {
                        semicolonOptional: !safeConcatenation && i === len - 1,
                        directiveContext: true
                    })
                );
                result.push(fragment);
                if (i + 1 < len && !endsWithLineTerminator(toSourceNode(fragment).toString())) {
                    result.push(newline);
                }
            }
            break;

        case Syntax.FunctionDeclaration:
            result = [(stmt.generator && !extra.moz.starlessGenerator ? 'function* ' : 'function ') + stmt.id.name, generateFunctionBody(stmt)];
            break;

        case Syntax.ReturnStatement:
            if (stmt.argument) {
                result = [join(
                    'return',
                    generateExpression(stmt.argument, {
                        precedence: Precedence.Sequence,
                        allowIn: true,
                        allowCall: true
                    })
                ), semicolon];
            } else {
                result = ['return' + semicolon];
            }
            break;

        case Syntax.WhileStatement:
            withIndent(function () {
                result = [
                    'while' + space + '(',
                    generateExpression(stmt.test, {
                        precedence: Precedence.Sequence,
                        allowIn: true,
                        allowCall: true
                    }),
                    ')'
                ];
            });
            result.push(maybeBlock(stmt.body, semicolon === ''));
            break;

        case Syntax.WithStatement:
            withIndent(function () {
                result = [
                    'with' + space + '(',
                    generateExpression(stmt.object, {
                        precedence: Precedence.Sequence,
                        allowIn: true,
                        allowCall: true
                    }),
                    ')'
                ];
            });
            result.push(maybeBlock(stmt.body, semicolon === ''));
            break;

        default:
            throw new Error('Unknown statement type: ' + stmt.type);
        }

        // Attach comments

        if (extra.comment) {
            result = addCommentsToStatement(stmt, result);
        }

        fragment = toSourceNode(result).toString();
        if (stmt.type === Syntax.Program && !safeConcatenation && newline === '' &&  fragment.charAt(fragment.length - 1) === '\n') {
            result = toSourceNode(result).replaceRight(/\s+$/, '');
        }

        return toSourceNode(result, stmt);
    }

    function generate(node, options) {
        var defaultOptions = getDefaultOptions(), result, pair;

        if (options != null) {
            // Obsolete options
            //
            //   `options.indent`
            //   `options.base`
            //
            // Instead of them, we can use `option.format.indent`.
            if (typeof options.indent === 'string') {
                defaultOptions.format.indent.style = options.indent;
            }
            if (typeof options.base === 'number') {
                defaultOptions.format.indent.base = options.base;
            }
            options = updateDeeply(defaultOptions, options);
            indent = options.format.indent.style;
            if (typeof options.base === 'string') {
                base = options.base;
            } else {
                base = stringRepeat(indent, options.format.indent.base);
            }
        } else {
            options = defaultOptions;
            indent = options.format.indent.style;
            base = stringRepeat(indent, options.format.indent.base);
        }
        json = options.format.json;
        renumber = options.format.renumber;
        hexadecimal = json ? false : options.format.hexadecimal;
        quotes = json ? 'double' : options.format.quotes;
        escapeless = options.format.escapeless;
        if (options.format.compact) {
            newline = space = indent = base = '';
        } else {
            newline = '\n';
            space = ' ';
        }
        parentheses = options.format.parentheses;
        semicolons = options.format.semicolons;
        safeConcatenation = options.format.safeConcatenation;
        directive = options.directive;
        parse = json ? null : options.parse;
        sourceMap = options.sourceMap;
        extra = options;

        if (sourceMap) {
            if (typeof process !== 'undefined') {
                // We assume environment is node.js
                SourceNode = require('source-map').SourceNode;
            } else {
                SourceNode = global.sourceMap.SourceNode;
            }
        } else {
            SourceNode = SourceNodeMock;
        }

        switch (node.type) {
        case Syntax.BlockStatement:
        case Syntax.BreakStatement:
        case Syntax.CatchClause:
        case Syntax.ContinueStatement:
        case Syntax.DirectiveStatement:
        case Syntax.DoWhileStatement:
        case Syntax.DebuggerStatement:
        case Syntax.EmptyStatement:
        case Syntax.ExpressionStatement:
        case Syntax.ForStatement:
        case Syntax.ForInStatement:
        case Syntax.FunctionDeclaration:
        case Syntax.IfStatement:
        case Syntax.LabeledStatement:
        case Syntax.Program:
        case Syntax.ReturnStatement:
        case Syntax.SwitchStatement:
        case Syntax.SwitchCase:
        case Syntax.ThrowStatement:
        case Syntax.TryStatement:
        case Syntax.VariableDeclaration:
        case Syntax.VariableDeclarator:
        case Syntax.WhileStatement:
        case Syntax.WithStatement:
            result = generateStatement(node);
            break;

        case Syntax.AssignmentExpression:
        case Syntax.ArrayExpression:
        case Syntax.ArrayPattern:
        case Syntax.BinaryExpression:
        case Syntax.CallExpression:
        case Syntax.ConditionalExpression:
        case Syntax.FunctionExpression:
        case Syntax.Identifier:
        case Syntax.Literal:
        case Syntax.LogicalExpression:
        case Syntax.MemberExpression:
        case Syntax.NewExpression:
        case Syntax.ObjectExpression:
        case Syntax.ObjectPattern:
        case Syntax.Property:
        case Syntax.SequenceExpression:
        case Syntax.ThisExpression:
        case Syntax.UnaryExpression:
        case Syntax.UpdateExpression:
        case Syntax.YieldExpression:

            result = generateExpression(node, {
                precedence: Precedence.Sequence,
                allowIn: true,
                allowCall: true
            });
            break;

        default:
            throw new Error('Unknown node type: ' + node.type);
        }

        if (!sourceMap) {
            return result.toString();
        }

        pair = result.toStringWithSourceMap({file: options.sourceMap});

        if (options.sourceMapWithCode) {
            return pair;
        }
        return pair.map.toString();
    }

    // simple visitor implementation

    VisitorKeys = {
        AssignmentExpression: ['left', 'right'],
        ArrayExpression: ['elements'],
        ArrayPattern: ['elements'],
        BlockStatement: ['body'],
        BinaryExpression: ['left', 'right'],
        BreakStatement: ['label'],
        CallExpression: ['callee', 'arguments'],
        CatchClause: ['param', 'body'],
        ConditionalExpression: ['test', 'consequent', 'alternate'],
        ContinueStatement: ['label'],
        DirectiveStatement: [],
        DoWhileStatement: ['body', 'test'],
        DebuggerStatement: [],
        EmptyStatement: [],
        ExpressionStatement: ['expression'],
        ForStatement: ['init', 'test', 'update', 'body'],
        ForInStatement: ['left', 'right', 'body'],
        FunctionDeclaration: ['id', 'params', 'body'],
        FunctionExpression: ['id', 'params', 'body'],
        Identifier: [],
        IfStatement: ['test', 'consequent', 'alternate'],
        Literal: [],
        LabeledStatement: ['label', 'body'],
        LogicalExpression: ['left', 'right'],
        MemberExpression: ['object', 'property'],
        NewExpression: ['callee', 'arguments'],
        ObjectExpression: ['properties'],
        ObjectPattern: ['properties'],
        Program: ['body'],
        Property: ['key', 'value'],
        ReturnStatement: ['argument'],
        SequenceExpression: ['expressions'],
        SwitchStatement: ['discriminant', 'cases'],
        SwitchCase: ['test', 'consequent'],
        ThisExpression: [],
        ThrowStatement: ['argument'],
        TryStatement: ['block', 'handlers', 'finalizer'],
        UnaryExpression: ['argument'],
        UpdateExpression: ['argument'],
        VariableDeclaration: ['declarations'],
        VariableDeclarator: ['id', 'init'],
        WhileStatement: ['test', 'body'],
        WithStatement: ['object', 'body'],
        YieldExpression: ['argument']
    };

    VisitorOption = {
        Break: 1,
        Skip: 2
    };

    function traverse(top, visitor) {
        var worklist, leavelist, node, ret, current, current2, candidates, candidate, marker = {};

        worklist = [ top ];
        leavelist = [ null ];

        while (worklist.length) {
            node = worklist.pop();

            if (node === marker) {
                node = leavelist.pop();
                if (visitor.leave) {
                    ret = visitor.leave(node, leavelist[leavelist.length - 1]);
                } else {
                    ret = undefined;
                }
                if (ret === VisitorOption.Break) {
                    return;
                }
            } else if (node) {
                if (visitor.enter) {
                    ret = visitor.enter(node, leavelist[leavelist.length - 1]);
                } else {
                    ret = undefined;
                }

                if (ret === VisitorOption.Break) {
                    return;
                }

                worklist.push(marker);
                leavelist.push(node);

                if (ret !== VisitorOption.Skip) {
                    candidates = VisitorKeys[node.type];
                    current = candidates.length;
                    while ((current -= 1) >= 0) {
                        candidate = node[candidates[current]];
                        if (candidate) {
                            if (isArray(candidate)) {
                                current2 = candidate.length;
                                while ((current2 -= 1) >= 0) {
                                    if (candidate[current2]) {
                                        worklist.push(candidate[current2]);
                                    }
                                }
                            } else {
                                worklist.push(candidate);
                            }
                        }
                    }
                }
            }
        }
    }

    // based on LLVM libc++ upper_bound / lower_bound
    // MIT License

    function upperBound(array, func) {
        var diff, len, i, current;

        len = array.length;
        i = 0;

        while (len) {
            diff = len >>> 1;
            current = i + diff;
            if (func(array[current])) {
                len = diff;
            } else {
                i = current + 1;
                len -= diff + 1;
            }
        }
        return i;
    }

    function lowerBound(array, func) {
        var diff, len, i, current;

        len = array.length;
        i = 0;

        while (len) {
            diff = len >>> 1;
            current = i + diff;
            if (func(array[current])) {
                i = current + 1;
                len -= diff + 1;
            } else {
                len = diff;
            }
        }
        return i;
    }

    function extendCommentRange(comment, tokens) {
        var target, token;

        target = upperBound(tokens, function search(token) {
            return token.range[0] > comment.range[0];
        });

        comment.extendedRange = [comment.range[0], comment.range[1]];

        if (target !== tokens.length) {
            comment.extendedRange[1] = tokens[target].range[0];
        }

        target -= 1;
        if (target >= 0) {
            if (target < tokens.length) {
                comment.extendedRange[0] = tokens[target].range[1];
            } else if (token.length) {
                comment.extendedRange[1] = tokens[tokens.length - 1].range[0];
            }
        }

        return comment;
    }

    function attachComments(tree, providedComments, tokens) {
        // At first, we should calculate extended comment ranges.
        var comments = [], comment, len, i;

        if (!tree.range) {
            throw new Error('attachComments needs range information');
        }

        // tokens array is empty, we attach comments to tree as 'leadingComments'
        if (!tokens.length) {
            if (providedComments.length) {
                for (i = 0, len = providedComments.length; i < len; i += 1) {
                    comment = deepCopy(providedComments[i]);
                    comment.extendedRange = [0, tree.range[0]];
                    comments.push(comment);
                }
                tree.leadingComments = comments;
            }
            return tree;
        }

        for (i = 0, len = providedComments.length; i < len; i += 1) {
            comments.push(extendCommentRange(deepCopy(providedComments[i]), tokens));
        }

        // This is based on John Freeman's implementation.
        traverse(tree, {
            cursor: 0,
            enter: function (node) {
                var comment;

                while (this.cursor < comments.length) {
                    comment = comments[this.cursor];
                    if (comment.extendedRange[1] > node.range[0]) {
                        break;
                    }

                    if (comment.extendedRange[1] === node.range[0]) {
                        if (!node.leadingComments) {
                            node.leadingComments = [];
                        }
                        node.leadingComments.push(comment);
                        comments.splice(this.cursor, 1);
                    } else {
                        this.cursor += 1;
                    }
                }

                // already out of owned node
                if (this.cursor === comments.length) {
                    return VisitorOption.Break;
                }

                if (comments[this.cursor].extendedRange[0] > node.range[1]) {
                    return VisitorOption.Skip;
                }
            }
        });

        traverse(tree, {
            cursor: 0,
            leave: function (node) {
                var comment;

                while (this.cursor < comments.length) {
                    comment = comments[this.cursor];
                    if (node.range[1] < comment.extendedRange[0]) {
                        break;
                    }

                    if (node.range[1] === comment.extendedRange[0]) {
                        if (!node.trailingComments) {
                            node.trailingComments = [];
                        }
                        node.trailingComments.push(comment);
                        comments.splice(this.cursor, 1);
                    } else {
                        this.cursor += 1;
                    }
                }

                // already out of owned node
                if (this.cursor === comments.length) {
                    return VisitorOption.Break;
                }

                if (comments[this.cursor].extendedRange[0] > node.range[1]) {
                    return VisitorOption.Skip;
                }
            }
        });

        return tree;
    }

    // Sync with package.json.
    exports.version = '0.0.15';

    exports.generate = generate;
    exports.traverse = traverse;
    exports.attachComments = attachComments;

}, this));
/* vim: set sw=4 ts=4 et tw=80 : */

});

require.define("/node_modules/source-map/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./lib/source-map.js"}
});

require.define("/node_modules/source-map/lib/source-map.js",function(require,module,exports,__dirname,__filename,process,global){/*
 * Copyright 2009-2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE.txt or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
exports.SourceMapGenerator = require('./source-map/source-map-generator').SourceMapGenerator;
exports.SourceMapConsumer = require('./source-map/source-map-consumer').SourceMapConsumer;
exports.SourceNode = require('./source-map/source-node').SourceNode;

});

require.define("/node_modules/source-map/lib/source-map/source-map-generator.js",function(require,module,exports,__dirname,__filename,process,global){/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define(function (require, exports, module) {

  var base64VLQ = require('./base64-vlq');
  var util = require('./util');
  var ArraySet = require('./array-set').ArraySet;

  /**
   * An instance of the SourceMapGenerator represents a source map which is
   * being built incrementally. To create a new one, you must pass an object
   * with the following properties:
   *
   *   - file: The filename of the generated source.
   *   - sourceRoot: An optional root for all URLs in this source map.
   */
  function SourceMapGenerator(aArgs) {
    this._file = util.getArg(aArgs, 'file');
    this._sourceRoot = util.getArg(aArgs, 'sourceRoot', null);
    this._sources = new ArraySet();
    this._names = new ArraySet();
    this._mappings = [];
  }

  SourceMapGenerator.prototype._version = 3;

  /**
   * Add a single mapping from original source line and column to the generated
   * source's line and column for this source map being created. The mapping
   * object should have the following properties:
   *
   *   - generated: An object with the generated line and column positions.
   *   - original: An object with the original line and column positions.
   *   - source: The original source file (relative to the sourceRoot).
   *   - name: An optional original token name for this mapping.
   */
  SourceMapGenerator.prototype.addMapping =
    function SourceMapGenerator_addMapping(aArgs) {
      var generated = util.getArg(aArgs, 'generated');
      var original = util.getArg(aArgs, 'original', null);
      var source = util.getArg(aArgs, 'source', null);
      var name = util.getArg(aArgs, 'name', null);

      this._validateMapping(generated, original, source, name);

      if (source && !this._sources.has(source)) {
        this._sources.add(source);
      }

      if (name && !this._names.has(name)) {
        this._names.add(name);
      }

      this._mappings.push({
        generated: generated,
        original: original,
        source: source,
        name: name
      });
    };

  /**
   * A mapping can have one of the three levels of data:
   *
   *   1. Just the generated position.
   *   2. The Generated position, original position, and original source.
   *   3. Generated and original position, original source, as well as a name
   *      token.
   *
   * To maintain consistency, we validate that any new mapping being added falls
   * in to one of these categories.
   */
  SourceMapGenerator.prototype._validateMapping =
    function SourceMapGenerator_validateMapping(aGenerated, aOriginal, aSource,
                                                aName) {
      if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
          && aGenerated.line > 0 && aGenerated.column >= 0
          && !aOriginal && !aSource && !aName) {
        // Case 1.
        return;
      }
      else if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
               && aOriginal && 'line' in aOriginal && 'column' in aOriginal
               && aGenerated.line > 0 && aGenerated.column >= 0
               && aOriginal.line > 0 && aOriginal.column >= 0
               && aSource) {
        // Cases 2 and 3.
        return;
      }
      else {
        throw new Error('Invalid mapping.');
      }
    };

  /**
   * Serialize the accumulated mappings in to the stream of base 64 VLQs
   * specified by the source map format.
   */
  SourceMapGenerator.prototype._serializeMappings =
    function SourceMapGenerator_serializeMappings() {
      var previousGeneratedColumn = 0;
      var previousGeneratedLine = 1;
      var previousOriginalColumn = 0;
      var previousOriginalLine = 0;
      var previousName = 0;
      var previousSource = 0;
      var result = '';
      var mapping;

      // The mappings must be guarenteed to be in sorted order before we start
      // serializing them or else the generated line numbers (which are defined
      // via the ';' separators) will be all messed up. Note: it might be more
      // performant to maintain the sorting as we insert them, rather than as we
      // serialize them, but the big O is the same either way.
      this._mappings.sort(function (mappingA, mappingB) {
        var cmp = mappingA.generated.line - mappingB.generated.line;
        return cmp === 0
          ? mappingA.generated.column - mappingB.generated.column
          : cmp;
      });

      for (var i = 0, len = this._mappings.length; i < len; i++) {
        mapping = this._mappings[i];

        if (mapping.generated.line !== previousGeneratedLine) {
          previousGeneratedColumn = 0;
          while (mapping.generated.line !== previousGeneratedLine) {
            result += ';';
            previousGeneratedLine++;
          }
        }
        else {
          if (i > 0) {
            result += ',';
          }
        }

        result += base64VLQ.encode(mapping.generated.column
                                   - previousGeneratedColumn);
        previousGeneratedColumn = mapping.generated.column;

        if (mapping.source && mapping.original) {
          result += base64VLQ.encode(this._sources.indexOf(mapping.source)
                                     - previousSource);
          previousSource = this._sources.indexOf(mapping.source);

          // lines are stored 0-based in SourceMap spec version 3
          result += base64VLQ.encode(mapping.original.line - 1
                                     - previousOriginalLine);
          previousOriginalLine = mapping.original.line - 1;

          result += base64VLQ.encode(mapping.original.column
                                     - previousOriginalColumn);
          previousOriginalColumn = mapping.original.column;

          if (mapping.name) {
            result += base64VLQ.encode(this._names.indexOf(mapping.name)
                                       - previousName);
            previousName = this._names.indexOf(mapping.name);
          }
        }
      }

      return result;
    };

  /**
   * Externalize the source map.
   */
  SourceMapGenerator.prototype.toJSON =
    function SourceMapGenerator_toJSON() {
      var map = {
        version: this._version,
        file: this._file,
        sources: this._sources.toArray(),
        names: this._names.toArray(),
        mappings: this._serializeMappings()
      };
      if (this._sourceRoot) {
        map.sourceRoot = this._sourceRoot;
      }
      return map;
    };

  /**
   * Render the source map being generated to a string.
   */
  SourceMapGenerator.prototype.toString =
    function SourceMapGenerator_toString() {
      return JSON.stringify(this);
    };

  exports.SourceMapGenerator = SourceMapGenerator;

});

});

require.define("/node_modules/source-map/node_modules/amdefine/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./amdefine.js"}
});

require.define("/node_modules/source-map/node_modules/amdefine/amdefine.js",function(require,module,exports,__dirname,__filename,process,global){/** vim: et:ts=4:sw=4:sts=4
 * @license amdefine 0.0.4 Copyright (c) 2011, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/amdefine for details
 */

/*jslint node: true */
/*global module, process */
'use strict';

var path = require('path');

/**
 * Creates a define for node.
 * @param {Object} module the "module" object that is defined by Node for the
 * current module.
 * @param {Function} [require]. Node's require function for the current module.
 * It only needs to be passed in Node versions before 0.5, when module.require
 * did not exist.
 * @returns {Function} a define function that is usable for the current node
 * module.
 */
function amdefine(module, require) {
    var defineCache = {},
        loaderCache = {},
        alreadyCalled = false,
        makeRequire, stringRequire;

    /**
     * Trims the . and .. from an array of path segments.
     * It will keep a leading path segment if a .. will become
     * the first path segment, to help with module name lookups,
     * which act like paths, but can be remapped. But the end result,
     * all paths that use this function should look normalized.
     * NOTE: this method MODIFIES the input array.
     * @param {Array} ary the array of path segments.
     */
    function trimDots(ary) {
        var i, part;
        for (i = 0; ary[i]; i+= 1) {
            part = ary[i];
            if (part === '.') {
                ary.splice(i, 1);
                i -= 1;
            } else if (part === '..') {
                if (i === 1 && (ary[2] === '..' || ary[0] === '..')) {
                    //End of the line. Keep at least one non-dot
                    //path segment at the front so it can be mapped
                    //correctly to disk. Otherwise, there is likely
                    //no path mapping for a path starting with '..'.
                    //This can still fail, but catches the most reasonable
                    //uses of ..
                    break;
                } else if (i > 0) {
                    ary.splice(i - 1, 2);
                    i -= 2;
                }
            }
        }
    }

    function normalize(name, baseName) {
        var baseParts;

        //Adjust any relative paths.
        if (name && name.charAt(0) === '.') {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                baseParts = baseName.split('/');
                baseParts = baseParts.slice(0, baseParts.length - 1);
                baseParts = baseParts.concat(name.split('/'));
                trimDots(baseParts);
                name = baseParts.join('/');
            }
        }

        return name;
    }

    /**
     * Create the normalize() function passed to a loader plugin's
     * normalize method.
     */
    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(id) {
        function load(value) {
            loaderCache[id] = value;
        }

        load.fromText = function (id, text) {
            //This one is difficult because the text can/probably uses
            //define, and any relative paths and requires should be relative
            //to that id was it would be found on disk. But this would require
            //bootstrapping a module/require fairly deeply from node core.
            //Not sure how best to go about that yet.
            throw new Error('amdefine does not implement load.fromText');
        };

        return load;
    }

    makeRequire = function (systemRequire, exports, module, relId) {
        function amdRequire(deps, callback) {
            if (typeof deps === 'string') {
                //Synchronous, single module require('')
                return stringRequire(systemRequire, exports, module, deps, relId);
            } else {
                //Array of dependencies with a callback.

                //Convert the dependencies to modules.
                deps = deps.map(function (depName) {
                    return stringRequire(systemRequire, exports, module, depName, relId);
                });

                //Wait for next tick to call back the require call.
                process.nextTick(function () {
                    callback.apply(null, deps);
                });
            }
        }

        amdRequire.toUrl = function (filePath) {
            if (filePath.indexOf('.') === 0) {
                return normalize(filePath, path.dirname(module.filename));
            } else {
                return filePath;
            }
        };

        return amdRequire;
    };

    //Favor explicit value, passed in if the module wants to support Node 0.4.
    require = require || function req() {
        return module.require.apply(module, arguments);
    };

    function runFactory(id, deps, factory) {
        var r, e, m, result;

        if (id) {
            e = loaderCache[id] = {};
            m = {
                id: id,
                uri: __filename,
                exports: e
            };
            r = makeRequire(undefined, e, m, id);
        } else {
            //Only support one define call per file
            if (alreadyCalled) {
                throw new Error('amdefine with no module ID cannot be called more than once per file.');
            }
            alreadyCalled = true;

            //Use the real variables from node
            //Use module.exports for exports, since
            //the exports in here is amdefine exports.
            e = module.exports;
            m = module;
            r = makeRequire(require, e, m, module.id);
        }

        //If there are dependencies, they are strings, so need
        //to convert them to dependency values.
        if (deps) {
            deps = deps.map(function (depName) {
                return r(depName);
            });
        }

        //Call the factory with the right dependencies.
        if (typeof factory === 'function') {
            result = factory.apply(module.exports, deps);
        } else {
            result = factory;
        }

        if (result !== undefined) {
            m.exports = result;
            if (id) {
                loaderCache[id] = m.exports;
            }
        }
    }

    stringRequire = function (systemRequire, exports, module, id, relId) {
        //Split the ID by a ! so that
        var index = id.indexOf('!'),
            originalId = id,
            prefix, plugin;

        if (index === -1) {
            id = normalize(id, relId);

            //Straight module lookup. If it is one of the special dependencies,
            //deal with it, otherwise, delegate to node.
            if (id === 'require') {
                return makeRequire(systemRequire, exports, module, relId);
            } else if (id === 'exports') {
                return exports;
            } else if (id === 'module') {
                return module;
            } else if (loaderCache.hasOwnProperty(id)) {
                return loaderCache[id];
            } else if (defineCache[id]) {
                runFactory.apply(null, defineCache[id]);
                return loaderCache[id];
            } else {
                if(systemRequire) {
                    return systemRequire(originalId);
                } else {
                    throw new Error('No module with ID: ' + id);
                }
            }
        } else {
            //There is a plugin in play.
            prefix = id.substring(0, index);
            id = id.substring(index + 1, id.length);

            plugin = stringRequire(systemRequire, exports, module, prefix, relId);

            if (plugin.normalize) {
                id = plugin.normalize(id, makeNormalize(relId));
            } else {
                //Normalize the ID normally.
                id = normalize(id, relId);
            }

            if (loaderCache[id]) {
                return loaderCache[id];
            } else {
                plugin.load(id, makeRequire(systemRequire, exports, module, relId), makeLoad(id), {});

                return loaderCache[id];
            }
        }
    };

    //Create a define function specific to the module asking for amdefine.
    function define(id, deps, factory) {
        if (Array.isArray(id)) {
            factory = deps;
            deps = id;
            id = undefined;
        } else if (typeof id !== 'string') {
            factory = id;
            id = deps = undefined;
        }

        if (deps && !Array.isArray(deps)) {
            factory = deps;
            deps = undefined;
        }

        if (!deps) {
            deps = ['require', 'exports', 'module'];
        }

        //Set up properties for this module. If an ID, then use
        //internal cache. If no ID, then use the external variables
        //for this node module.
        if (id) {
            //Put the module in deep freeze until there is a
            //require call for it.
            defineCache[id] = [id, deps, factory];
        } else {
            runFactory(id, deps, factory);
        }
    }

    //define.require, which has access to all the values in the
    //cache. Useful for AMD modules that all have IDs in the file,
    //but need to finally export a value to node based on one of those
    //IDs.
    define.require = function (id) {
        if (loaderCache[id]) {
            return loaderCache[id];
        }

        if (defineCache[id]) {
            runFactory.apply(null, defineCache[id]);
            return loaderCache[id];
        }
    };

    define.amd = {};

    return define;
}

module.exports = amdefine;

});

require.define("/node_modules/source-map/lib/source-map/base64-vlq.js",function(require,module,exports,__dirname,__filename,process,global){/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 *
 * Based on the Base 64 VLQ implementation in Closure Compiler:
 * https://code.google.com/p/closure-compiler/source/browse/trunk/src/com/google/debugging/sourcemap/Base64VLQ.java
 *
 * Copyright 2011 The Closure Compiler Authors. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *  * Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above
 *    copyright notice, this list of conditions and the following
 *    disclaimer in the documentation and/or other materials provided
 *    with the distribution.
 *  * Neither the name of Google Inc. nor the names of its
 *    contributors may be used to endorse or promote products derived
 *    from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define(function (require, exports, module) {

  var base64 = require('./base64');

  // A single base 64 digit can contain 6 bits of data. For the base 64 variable
  // length quantities we use in the source map spec, the first bit is the sign,
  // the next four bits are the actual value, and the 6th bit is the
  // continuation bit. The continuation bit tells us whether there are more
  // digits in this value following this digit.
  //
  //   Continuation
  //   |    Sign
  //   |    |
  //   V    V
  //   101011

  var VLQ_BASE_SHIFT = 5;

  // binary: 100000
  var VLQ_BASE = 1 << VLQ_BASE_SHIFT;

  // binary: 011111
  var VLQ_BASE_MASK = VLQ_BASE - 1;

  // binary: 100000
  var VLQ_CONTINUATION_BIT = VLQ_BASE;

  /**
   * Converts from a two-complement value to a value where the sign bit is
   * is placed in the least significant bit.  For example, as decimals:
   *   1 becomes 2 (10 binary), -1 becomes 3 (11 binary)
   *   2 becomes 4 (100 binary), -2 becomes 5 (101 binary)
   */
  function toVLQSigned(aValue) {
    return aValue < 0
      ? ((-aValue) << 1) + 1
      : (aValue << 1) + 0;
  }

  /**
   * Converts to a two-complement value from a value where the sign bit is
   * is placed in the least significant bit.  For example, as decimals:
   *   2 (10 binary) becomes 1, 3 (11 binary) becomes -1
   *   4 (100 binary) becomes 2, 5 (101 binary) becomes -2
   */
  function fromVLQSigned(aValue) {
    var isNegative = (aValue & 1) === 1;
    var shifted = aValue >> 1;
    return isNegative
      ? -shifted
      : shifted;
  }

  /**
   * Returns the base 64 VLQ encoded value.
   */
  exports.encode = function base64VLQ_encode(aValue) {
    var encoded = "";
    var digit;

    var vlq = toVLQSigned(aValue);

    do {
      digit = vlq & VLQ_BASE_MASK;
      vlq >>>= VLQ_BASE_SHIFT;
      if (vlq > 0) {
        // There are still more digits in this value, so we must make sure the
        // continuation bit is marked.
        digit |= VLQ_CONTINUATION_BIT;
      }
      encoded += base64.encode(digit);
    } while (vlq > 0);

    return encoded;
  };

  /**
   * Decodes the next base 64 VLQ value from the given string and returns the
   * value and the rest of the string.
   */
  exports.decode = function base64VLQ_decode(aStr) {
    var i = 0;
    var strLen = aStr.length;
    var result = 0;
    var shift = 0;
    var continuation, digit;

    do {
      if (i >= strLen) {
        throw new Error("Expected more digits in base 64 VLQ value.");
      }
      digit = base64.decode(aStr.charAt(i++));
      continuation = !!(digit & VLQ_CONTINUATION_BIT);
      digit &= VLQ_BASE_MASK;
      result = result + (digit << shift);
      shift += VLQ_BASE_SHIFT;
    } while (continuation);

    return {
      value: fromVLQSigned(result),
      rest: aStr.slice(i)
    };
  };

});

});

require.define("/node_modules/source-map/lib/source-map/base64.js",function(require,module,exports,__dirname,__filename,process,global){/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define(function (require, exports, module) {

  var charToIntMap = {};
  var intToCharMap = {};

  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    .split('')
    .forEach(function (ch, index) {
      charToIntMap[ch] = index;
      intToCharMap[index] = ch;
    });

  /**
   * Encode an integer in the range of 0 to 63 to a single base 64 digit.
   */
  exports.encode = function base64_encode(aNumber) {
    if (aNumber in intToCharMap) {
      return intToCharMap[aNumber];
    }
    throw new TypeError("Must be between 0 and 63: " + aNumber);
  };

  /**
   * Decode a single base 64 digit to an integer.
   */
  exports.decode = function base64_decode(aChar) {
    if (aChar in charToIntMap) {
      return charToIntMap[aChar];
    }
    throw new TypeError("Not a valid base 64 digit: " + aChar);
  };

});

});

require.define("/node_modules/source-map/lib/source-map/util.js",function(require,module,exports,__dirname,__filename,process,global){/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define(function (require, exports, module) {

  /**
   * This is a helper function for getting values from parameter/options
   * objects.
   *
   * @param args The object we are extracting values from
   * @param name The name of the property we are getting.
   * @param defaultValue An optional value to return if the property is missing
   * from the object. If this is not specified and the property is missing, an
   * error will be thrown.
   */
  function getArg(aArgs, aName, aDefaultValue) {
    if (aName in aArgs) {
      return aArgs[aName];
    } else if (arguments.length === 3) {
      return aDefaultValue;
    } else {
      throw new Error('"' + aName + '" is a required argument.');
    }
  }
  exports.getArg = getArg;

  function join(aRoot, aPath) {
    return aPath.charAt(0) === '/'
      ? aPath
      : aRoot.replace(/\/*$/, '') + '/' + aPath;
  }
  exports.join = join;

});

});

require.define("/node_modules/source-map/lib/source-map/array-set.js",function(require,module,exports,__dirname,__filename,process,global){/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define(function (require, exports, module) {

  /**
   * A data structure which is a combination of an array and a set. Adding a new
   * member is O(1), testing for membership is O(1), and finding the index of an
   * element is O(1). Removing elements from the set is not supported. Only
   * strings are supported for membership.
   */
  function ArraySet() {
    this._array = [];
    this._set = {};
  }

  /**
   * Static method for creating ArraySet instances from an existing array.
   */
  ArraySet.fromArray = function ArraySet_fromArray(aArray) {
    var set = new ArraySet();
    for (var i = 0, len = aArray.length; i < len; i++) {
      set.add(aArray[i]);
    }
    return set;
  };

  /**
   * Because behavior goes wacky when you set `__proto__` on `this._set`, we
   * have to prefix all the strings in our set with an arbitrary character.
   *
   * See https://github.com/mozilla/source-map/pull/31 and
   * https://github.com/mozilla/source-map/issues/30
   *
   * @param String aStr
   */
  ArraySet.prototype._toSetString = function ArraySet__toSetString (aStr) {
    return "$" + aStr;
  };

  /**
   * Add the given string to this set.
   *
   * @param String aStr
   */
  ArraySet.prototype.add = function ArraySet_add(aStr) {
    if (this.has(aStr)) {
      // Already a member; nothing to do.
      return;
    }
    var idx = this._array.length;
    this._array.push(aStr);
    this._set[this._toSetString(aStr)] = idx;
  };

  /**
   * Is the given string a member of this set?
   *
   * @param String aStr
   */
  ArraySet.prototype.has = function ArraySet_has(aStr) {
    return Object.prototype.hasOwnProperty.call(this._set,
                                                this._toSetString(aStr));
  };

  /**
   * What is the index of the given string in the array?
   *
   * @param String aStr
   */
  ArraySet.prototype.indexOf = function ArraySet_indexOf(aStr) {
    if (this.has(aStr)) {
      return this._set[this._toSetString(aStr)];
    }
    throw new Error('"' + aStr + '" is not in the set.');
  };

  /**
   * What is the element at the given index?
   *
   * @param Number aIdx
   */
  ArraySet.prototype.at = function ArraySet_at(aIdx) {
    if (aIdx >= 0 && aIdx < this._array.length) {
      return this._array[aIdx];
    }
    throw new Error('No element indexed by ' + aIdx);
  };

  /**
   * Returns the array representation of this set (which has the proper indices
   * indicated by indexOf). Note that this is a copy of the internal array used
   * for storing the members so that no one can mess with internal state.
   */
  ArraySet.prototype.toArray = function ArraySet_toArray() {
    return this._array.slice();
  };

  exports.ArraySet = ArraySet;

});

});

require.define("/node_modules/source-map/lib/source-map/source-map-consumer.js",function(require,module,exports,__dirname,__filename,process,global){/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define(function (require, exports, module) {

  var util = require('./util');
  var binarySearch = require('./binary-search');
  var ArraySet = require('./array-set').ArraySet;
  var base64VLQ = require('./base64-vlq');

  /**
   * A SourceMapConsumer instance represents a parsed source map which we can
   * query for information about the original file positions by giving it a file
   * position in the generated source.
   *
   * The only parameter is the raw source map (either as a JSON string, or
   * already parsed to an object). According to the spec, source maps have the
   * following attributes:
   *
   *   - version: Which version of the source map spec this map is following.
   *   - sources: An array of URLs to the original source files.
   *   - names: An array of identifiers which can be referrenced by individual mappings.
   *   - sourceRoot: Optional. The URL root from which all sources are relative.
   *   - mappings: A string of base64 VLQs which contain the actual mappings.
   *   - file: The generated file this source map is associated with.
   *
   * Here is an example source map, taken from the source map spec[0]:
   *
   *     {
   *       version : 3,
   *       file: "out.js",
   *       sourceRoot : "",
   *       sources: ["foo.js", "bar.js"],
   *       names: ["src", "maps", "are", "fun"],
   *       mappings: "AA,AB;;ABCDE;"
   *     }
   *
   * [0]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit?pli=1#
   */
  function SourceMapConsumer(aSourceMap) {
    var sourceMap = aSourceMap;
    if (typeof aSourceMap === 'string') {
      sourceMap = JSON.parse(aSourceMap.replace(/^\)\]\}'/, ''));
    }

    var version = util.getArg(sourceMap, 'version');
    var sources = util.getArg(sourceMap, 'sources');
    var names = util.getArg(sourceMap, 'names');
    var sourceRoot = util.getArg(sourceMap, 'sourceRoot', null);
    var mappings = util.getArg(sourceMap, 'mappings');
    var file = util.getArg(sourceMap, 'file');

    if (version !== this._version) {
      throw new Error('Unsupported version: ' + version);
    }

    this._names = ArraySet.fromArray(names);
    this._sources = ArraySet.fromArray(sources);
    this._sourceRoot = sourceRoot;
    this.file = file;

    // `this._generatedMappings` and `this._originalMappings` hold the parsed
    // mapping coordinates from the source map's "mappings" attribute. Each
    // object in the array is of the form
    //
    //     {
    //       generatedLine: The line number in the generated code,
    //       generatedColumn: The column number in the generated code,
    //       source: The path to the original source file that generated this
    //               chunk of code,
    //       originalLine: The line number in the original source that
    //                     corresponds to this chunk of generated code,
    //       originalColumn: The column number in the original source that
    //                       corresponds to this chunk of generated code,
    //       name: The name of the original symbol which generated this chunk of
    //             code.
    //     }
    //
    // All properties except for `generatedLine` and `generatedColumn` can be
    // `null`.
    //
    // `this._generatedMappings` is ordered by the generated positions.
    //
    // `this._originalMappings` is ordered by the original positions.
    this._generatedMappings = [];
    this._originalMappings = [];
    this._parseMappings(mappings, sourceRoot);
  }

  /**
   * The version of the source mapping spec that we are consuming.
   */
  SourceMapConsumer.prototype._version = 3;

  /**
   * The list of original sources.
   */
  Object.defineProperty(SourceMapConsumer.prototype, 'sources', {
    get: function () {
      return this._sources.toArray().map(function (s) {
        return this._sourceRoot ? util.join(this._sourceRoot, s) : s;
      }, this);
    }
  });

  /**
   * Parse the mappings in a string in to a data structure which we can easily
   * query (an ordered list in this._generatedMappings).
   */
  SourceMapConsumer.prototype._parseMappings =
    function SourceMapConsumer_parseMappings(aStr, aSourceRoot) {
      var generatedLine = 1;
      var previousGeneratedColumn = 0;
      var previousOriginalLine = 0;
      var previousOriginalColumn = 0;
      var previousSource = 0;
      var previousName = 0;
      var mappingSeparator = /^[,;]/;
      var str = aStr;
      var mapping;
      var temp;

      while (str.length > 0) {
        if (str.charAt(0) === ';') {
          generatedLine++;
          str = str.slice(1);
          previousGeneratedColumn = 0;
        }
        else if (str.charAt(0) === ',') {
          str = str.slice(1);
        }
        else {
          mapping = {};
          mapping.generatedLine = generatedLine;

          // Generated column.
          temp = base64VLQ.decode(str);
          mapping.generatedColumn = previousGeneratedColumn + temp.value;
          previousGeneratedColumn = mapping.generatedColumn;
          str = temp.rest;

          if (str.length > 0 && !mappingSeparator.test(str.charAt(0))) {
            // Original source.
            temp = base64VLQ.decode(str);
            if (aSourceRoot) {
              mapping.source = util.join(aSourceRoot, this._sources.at(previousSource + temp.value));
            }
            else {
              mapping.source = this._sources.at(previousSource + temp.value);
            }
            previousSource += temp.value;
            str = temp.rest;
            if (str.length === 0 || mappingSeparator.test(str.charAt(0))) {
              throw new Error('Found a source, but no line and column');
            }

            // Original line.
            temp = base64VLQ.decode(str);
            mapping.originalLine = previousOriginalLine + temp.value;
            previousOriginalLine = mapping.originalLine;
            // Lines are stored 0-based
            mapping.originalLine += 1;
            str = temp.rest;
            if (str.length === 0 || mappingSeparator.test(str.charAt(0))) {
              throw new Error('Found a source and line, but no column');
            }

            // Original column.
            temp = base64VLQ.decode(str);
            mapping.originalColumn = previousOriginalColumn + temp.value;
            previousOriginalColumn = mapping.originalColumn;
            str = temp.rest;

            if (str.length > 0 && !mappingSeparator.test(str.charAt(0))) {
              // Original name.
              temp = base64VLQ.decode(str);
              mapping.name = this._names.at(previousName + temp.value);
              previousName += temp.value;
              str = temp.rest;
            }
          }

          this._generatedMappings.push(mapping);
          this._originalMappings.push(mapping);
        }
      }

      this._originalMappings.sort(this._compareOriginalPositions);
    };

  /**
   * Comparator between two mappings where the original positions are compared.
   */
  SourceMapConsumer.prototype._compareOriginalPositions =
    function SourceMapConsumer_compareOriginalPositions(mappingA, mappingB) {
      if (mappingA.source > mappingB.source) {
        return 1;
      }
      else if (mappingA.source < mappingB.source) {
        return -1;
      }
      else {
        var cmp = mappingA.originalLine - mappingB.originalLine;
        return cmp === 0
          ? mappingA.originalColumn - mappingB.originalColumn
          : cmp;
      }
    };

  /**
   * Comparator between two mappings where the generated positions are compared.
   */
  SourceMapConsumer.prototype._compareGeneratedPositions =
    function SourceMapConsumer_compareGeneratedPositions(mappingA, mappingB) {
      var cmp = mappingA.generatedLine - mappingB.generatedLine;
      return cmp === 0
        ? mappingA.generatedColumn - mappingB.generatedColumn
        : cmp;
    };

  /**
   * Find the mapping that best matches the hypothetical "needle" mapping that
   * we are searching for in the given "haystack" of mappings.
   */
  SourceMapConsumer.prototype._findMapping =
    function SourceMapConsumer_findMapping(aNeedle, aMappings, aLineName,
                                           aColumnName, aComparator) {
      // To return the position we are searching for, we must first find the
      // mapping for the given position and then return the opposite position it
      // points to. Because the mappings are sorted, we can use binary search to
      // find the best mapping.

      if (aNeedle[aLineName] <= 0) {
        throw new TypeError('Line must be greater than or equal to 1, got '
                            + aNeedle[aLineName]);
      }
      if (aNeedle[aColumnName] < 0) {
        throw new TypeError('Column must be greater than or equal to 0, got '
                            + aNeedle[aColumnName]);
      }

      return binarySearch.search(aNeedle, aMappings, aComparator);
    };

  /**
   * Returns the original source, line, and column information for the generated
   * source's line and column positions provided. The only argument is an object
   * with the following properties:
   *
   *   - line: The line number in the generated source.
   *   - column: The column number in the generated source.
   *
   * and an object is returned with the following properties:
   *
   *   - source: The original source file, or null.
   *   - line: The line number in the original source, or null.
   *   - column: The column number in the original source, or null.
   *   - name: The original identifier, or null.
   */
  SourceMapConsumer.prototype.originalPositionFor =
    function SourceMapConsumer_originalPositionFor(aArgs) {
      var needle = {
        generatedLine: util.getArg(aArgs, 'line'),
        generatedColumn: util.getArg(aArgs, 'column')
      };

      var mapping = this._findMapping(needle,
                                      this._generatedMappings,
                                      "generatedLine",
                                      "generatedColumn",
                                      this._compareGeneratedPositions)

      if (mapping) {
        return {
          source: util.getArg(mapping, 'source', null),
          line: util.getArg(mapping, 'originalLine', null),
          column: util.getArg(mapping, 'originalColumn', null),
          name: util.getArg(mapping, 'name', null)
        };
      }

      return {
        source: null,
        line: null,
        column: null,
        name: null
      };
    };

  /**
   * Returns the generated line and column information for the original source,
   * line, and column positions provided. The only argument is an object with
   * the following properties:
   *
   *   - source: The filename of the original source.
   *   - line: The line number in the original source.
   *   - column: The column number in the original source.
   *
   * and an object is returned with the following properties:
   *
   *   - line: The line number in the generated source, or null.
   *   - column: The column number in the generated source, or null.
   */
  SourceMapConsumer.prototype.generatedPositionFor =
    function SourceMapConsumer_generatedPositionFor(aArgs) {
      var needle = {
        source: util.getArg(aArgs, 'source'),
        originalLine: util.getArg(aArgs, 'line'),
        originalColumn: util.getArg(aArgs, 'column')
      };

      var mapping = this._findMapping(needle,
                                      this._originalMappings,
                                      "originalLine",
                                      "originalColumn",
                                      this._compareOriginalPositions)

      if (mapping) {
        return {
          line: util.getArg(mapping, 'generatedLine', null),
          column: util.getArg(mapping, 'generatedColumn', null)
        };
      }

      return {
        line: null,
        column: null
      };
    };

  SourceMapConsumer.GENERATED_ORDER = 1;
  SourceMapConsumer.ORIGINAL_ORDER = 2;

  /**
   * Iterate over each mapping between an original source/line/column and a
   * generated line/column in this source map.
   *
   * @param Function aCallback
   *        The function that is called with each mapping. This function should
   *        not mutate the mapping.
   * @param Object aContext
   *        Optional. If specified, this object will be the value of `this` every
   *        time that `aCallback` is called.
   * @param aOrder
   *        Either `SourceMapConsumer.GENERATED_ORDER` or
   *        `SourceMapConsumer.ORIGINAL_ORDER`. Specifies whether you want to
   *        iterate over the mappings sorted by the generated file's line/column
   *        order or the original's source/line/column order, respectively. Defaults to
   *        `SourceMapConsumer.GENERATED_ORDER`.
   */
  SourceMapConsumer.prototype.eachMapping =
    function SourceMapConsumer_eachMapping(aCallback, aContext, aOrder) {
      var context = aContext || null;
      var order = aOrder || SourceMapConsumer.GENERATED_ORDER;

      var mappings;
      switch (order) {
      case SourceMapConsumer.GENERATED_ORDER:
        mappings = this._generatedMappings;
        break;
      case SourceMapConsumer.ORIGINAL_ORDER:
        mappings = this._originalMappings;
        break;
      default:
        throw new Error("Unknown order of iteration.");
      }

      mappings.forEach(aCallback, context);
    };

  exports.SourceMapConsumer = SourceMapConsumer;

});

});

require.define("/node_modules/source-map/lib/source-map/binary-search.js",function(require,module,exports,__dirname,__filename,process,global){/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define(function (require, exports, module) {

  /**
   * Recursive implementation of binary search.
   *
   * @param aLow Indices here and lower do not contain the needle.
   * @param aHigh Indices here and higher do not contain the needle.
   * @param aNeedle The element being searched for.
   * @param aHaystack The non-empty array being searched.
   * @param aCompare Function which takes two elements and returns -1, 0, or 1.
   */
  function recursiveSearch(aLow, aHigh, aNeedle, aHaystack, aCompare) {
    // This function terminates when one of the following is true:
    //
    //   1. We find the exact element we are looking for.
    //
    //   2. We did not find the exact element, but we can return the next
    //      closest element that is less than that element.
    //
    //   3. We did not find the exact element, and there is no next-closest
    //      element which is less than the one we are searching for, so we
    //      return null.
    var mid = Math.floor((aHigh - aLow) / 2) + aLow;
    var cmp = aCompare(aNeedle, aHaystack[mid]);
    if (cmp === 0) {
      // Found the element we are looking for.
      return aHaystack[mid];
    }
    else if (cmp > 0) {
      // aHaystack[mid] is greater than our needle.
      if (aHigh - mid > 1) {
        // The element is in the upper half.
        return recursiveSearch(mid, aHigh, aNeedle, aHaystack, aCompare);
      }
      // We did not find an exact match, return the next closest one
      // (termination case 2).
      return aHaystack[mid];
    }
    else {
      // aHaystack[mid] is less than our needle.
      if (mid - aLow > 1) {
        // The element is in the lower half.
        return recursiveSearch(aLow, mid, aNeedle, aHaystack, aCompare);
      }
      // The exact needle element was not found in this haystack. Determine if
      // we are in termination case (2) or (3) and return the appropriate thing.
      return aLow < 0
        ? null
        : aHaystack[aLow];
    }
  }

  /**
   * This is an implementation of binary search which will always try and return
   * the next lowest value checked if there is no exact hit. This is because
   * mappings between original and generated line/col pairs are single points,
   * and there is an implicit region between each of them, so a miss just means
   * that you aren't on the very start of a region.
   *
   * @param aNeedle The element you are looking for.
   * @param aHaystack The array that is being searched.
   * @param aCompare A function which takes the needle and an element in the
   *     array and returns -1, 0, or 1 depending on whether the needle is less
   *     than, equal to, or greater than the element, respectively.
   */
  exports.search = function search(aNeedle, aHaystack, aCompare) {
    return aHaystack.length > 0
      ? recursiveSearch(-1, aHaystack.length, aNeedle, aHaystack, aCompare)
      : null;
  };

});

});

require.define("/node_modules/source-map/lib/source-map/source-node.js",function(require,module,exports,__dirname,__filename,process,global){/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define(function (require, exports, module) {

  var SourceMapGenerator = require('./source-map-generator').SourceMapGenerator;

  /**
   * SourceNodes provide a way to abstract over interpolating/concatenating
   * snippets of generated JavaScript source code while maintaining the line and
   * column information associated with the original source code.
   *
   * @param aLine The original line number.
   * @param aColumn The original column number.
   * @param aSource The original source's filename.
   * @param aChunks Optional. An array of strings which are snippets of
   *        generated JS, or other SourceNodes.
   */
  function SourceNode(aLine, aColumn, aSource, aChunks) {
    this.children = [];
    this.line = aLine;
    this.column = aColumn;
    this.source = aSource;
    if (aChunks != null) this.add(aChunks);
  }

  /**
   * Add a chunk of generated JS to this source node.
   *
   * @param aChunk A string snippet of generated JS code, another instance of
   *        SourceNode, or an array where each member is one of those things.
   */
  SourceNode.prototype.add = function SourceNode_add(aChunk) {
    if (Array.isArray(aChunk)) {
      aChunk.forEach(function (chunk) {
        this.add(chunk);
      }, this);
    }
    else if (aChunk instanceof SourceNode || typeof aChunk === "string") {
      if (aChunk) {
        this.children.push(aChunk);
      }
    }
    else {
      throw new TypeError(
        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
      );
    }
    return this;
  };

  /**
   * Add a chunk of generated JS to the beginning of this source node.
   *
   * @param aChunk A string snippet of generated JS code, another instance of
   *        SourceNode, or an array where each member is one of those things.
   */
  SourceNode.prototype.prepend = function SourceNode_prepend(aChunk) {
    if (Array.isArray(aChunk)) {
      for (var i = aChunk.length-1; i >= 0; i--) {
        this.prepend(aChunk[i]);
      }
    }
    else if (aChunk instanceof SourceNode || typeof aChunk === "string") {
      this.children.unshift(aChunk);
    }
    else {
      throw new TypeError(
        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
      );
    }
    return this;
  };

  /**
   * Walk over the tree of JS snippets in this node and its children. The
   * walking function is called once for each snippet of JS and is passed that
   * snippet and the its original associated source's line/column location.
   *
   * @param aFn The traversal function.
   */
  SourceNode.prototype.walk = function SourceNode_walk(aFn) {
    this.children.forEach(function (chunk) {
      if (chunk instanceof SourceNode) {
        chunk.walk(aFn);
      }
      else {
        if (chunk !== '') {
          aFn(chunk, { source: this.source, line: this.line, column: this.column });
        }
      }
    }, this);
  };

  /**
   * Like `String.prototype.join` except for SourceNodes. Inserts `aStr` between
   * each of `this.children`.
   *
   * @param aSep The separator.
   */
  SourceNode.prototype.join = function SourceNode_join(aSep) {
    var newChildren;
    var i;
    var len = this.children.length
    if (len > 0) {
      newChildren = [];
      for (i = 0; i < len-1; i++) {
        newChildren.push(this.children[i]);
        newChildren.push(aSep);
      }
      newChildren.push(this.children[i]);
      this.children = newChildren;
    }
    return this;
  };

  /**
   * Call String.prototype.replace on the very right-most source snippet. Useful
   * for trimming whitespace from the end of a source node, etc.
   *
   * @param aPattern The pattern to replace.
   * @param aReplacement The thing to replace the pattern with.
   */
  SourceNode.prototype.replaceRight = function SourceNode_replaceRight(aPattern, aReplacement) {
    var lastChild = this.children[this.children.length - 1];
    if (lastChild instanceof SourceNode) {
      lastChild.replaceRight(aPattern, aReplacement);
    }
    else if (typeof lastChild === 'string') {
      this.children[this.children.length - 1] = lastChild.replace(aPattern, aReplacement);
    }
    else {
      this.children.push(''.replace(aPattern, aReplacement));
    }
    return this;
  };

  /**
   * Return the string representation of this source node. Walks over the tree
   * and concatenates all the various snippets together to one string.
   */
  SourceNode.prototype.toString = function SourceNode_toString() {
    var str = "";
    this.walk(function (chunk) {
      str += chunk;
    });
    return str;
  };

  /**
   * Returns the string representation of this source node along with a source
   * map.
   */
  SourceNode.prototype.toStringWithSourceMap = function SourceNode_toStringWithSourceMap(aArgs) {
    var generated = {
      code: "",
      line: 1,
      column: 0
    };
    var map = new SourceMapGenerator(aArgs);
    this.walk(function (chunk, original) {
      generated.code += chunk;
      if (original.source != null
          && original.line != null
          && original.column != null) {
        map.addMapping({
          source: original.source,
          original: {
            line: original.line,
            column: original.column
          },
          generated: {
            line: generated.line,
            column: generated.column
          }
        });
      }
      chunk.split('').forEach(function (char) {
        if (char === '\n') {
          generated.line++;
          generated.column = 0;
        } else {
          generated.column++;
        }
      });
    });

    return { code: generated.code, map: map };
  };

  exports.SourceNode = SourceNode;

});

});

require.define("/lib/coffee-script/module.js",function(require,module,exports,__dirname,__filename,process,global){// Generated by CoffeeScript 2.0.0-dev
var CoffeeScript, Compiler, cscodegen, escodegen, escodegenCompactDefaults, escodegenFormatDefaults, formatParserError, fs, Nodes, Optimiser, Parser, path, pkg, Preprocessor;
fs = require('fs');
path = require('path');
formatParserError = require('./helpers').formatParserError;
Nodes = require('./nodes');
Preprocessor = require('./preprocessor').Preprocessor;
Parser = require('./parser');
Optimiser = require('./optimiser').Optimiser;
Compiler = require('./compiler').Compiler;
cscodegen = function () {
  try {
    return require('cscodegen');
  } catch (e$) {
    return;
  }
}.call(this);
escodegen = function () {
  try {
    return require('escodegen');
  } catch (e$) {
    return;
  }
}.call(this);
pkg = require('./../../package.json');
escodegenFormatDefaults = {
  indent: {
    style: '  ',
    base: 0
  },
  renumber: true,
  hexadecimal: true,
  quotes: 'auto',
  parentheses: false
};
escodegenCompactDefaults = {
  indent: {
    style: '',
    base: 0
  },
  renumber: true,
  hexadecimal: true,
  quotes: 'auto',
  escapeless: true,
  compact: true,
  parentheses: false,
  semicolons: false
};
module.exports = {
  Compiler: Compiler,
  Optimiser: Optimiser,
  Parser: Parser,
  Preprocessor: Preprocessor,
  Nodes: Nodes,
  VERSION: pkg.version,
  parse: function (coffee, options) {
    var e, parsed, preprocessed;
    if (null == options)
      options = {};
    try {
      preprocessed = Preprocessor.processSync(coffee);
      parsed = Parser.parse(preprocessed, {
        raw: options.raw,
        inputSource: options.inputSource
      });
      if (options.optimise) {
        return Optimiser.optimise(parsed);
      } else {
        return parsed;
      }
    } catch (e$) {
      e = e$;
      if (!(e instanceof Parser.SyntaxError))
        throw e;
      throw new Error(formatParserError(preprocessed, e));
    }
  },
  compile: function (csAst, options) {
    return Compiler.compile(csAst, options);
  },
  cs: function (csAst, options) {
  },
  js: function (jsAst, options) {
    if (null == options)
      options = {};
    if (!(null != escodegen))
      throw new Error('escodegen not found: run `npm install escodegen`');
    return escodegen.generate(jsAst, {
      comment: !options.compact,
      format: options.compact ? escodegenCompactDefaults : null != options.format ? options.format : escodegenFormatDefaults
    });
  },
  sourceMap: function (jsAst, name, options) {
    if (null == name)
      name = 'unknown';
    if (null == options)
      options = {};
    if (!(null != escodegen))
      throw new Error('escodegen not found: run `npm install escodegen`');
    return escodegen.generate(jsAst.toJSON(), {
      comment: !options.compact,
      sourceMap: name,
      format: options.compact ? escodegenCompactDefaults : null != options.format ? options.format : escodegenFormatDefaults
    });
  }
};
CoffeeScript = module.exports.CoffeeScript = module.exports;

});
return require("/lib/coffee-script/module.js");
})();

