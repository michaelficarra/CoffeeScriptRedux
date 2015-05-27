// Generated by CoffeeScript 0.8.5
var ArrayType, checkAcceptableObject, ClassScope, clone, console, FunctionScope, initializeGlobalTypes, ObjectType, pj, Possibilites, render, reporter, rewrite, Scope, Type, TypeSymbol, VarSymbol;
console = {
  log: function () {
  }
};
pj = function () {
  try {
    return require('prettyjson');
  } catch (e$) {
    return;
  }
}.call(this);
render = function (obj) {
  if (null != pj)
    return pj.render(obj);
};
cache$ = require('./type-helpers');
clone = cache$.clone;
rewrite = cache$.rewrite;
reporter = require('./reporter');
Type = function () {
  function Type() {
  }
  return Type;
}();
ObjectType = function (super$) {
  extends$(ObjectType, super$);
  function ObjectType(param$) {
    this.dataType = param$;
  }
  return ObjectType;
}(Type);
ArrayType = function (super$1) {
  extends$(ArrayType, super$1);
  function ArrayType(dataType) {
    this.array = dataType;
  }
  return ArrayType;
}(Type);
Possibilites = function (super$2) {
  extends$(Possibilites, super$2);
  function Possibilites(arr) {
    var i;
    if (null == arr)
      arr = [];
    for (var i$ = 0, length$ = arr.length; i$ < length$; ++i$) {
      i = arr[i$];
      this.push(i);
    }
  }
  return Possibilites;
}(Array);
checkAcceptableObject = function (this$) {
  return function (left, right, scope) {
    var cur, extended_list, i, key, l_arg, lval, r, results;
    if (null != (null != left ? left._base_ : void 0) && null != left._templates_)
      left = left._base_;
    console.log('checkAcceptableObject /', left, right);
    if (null != (null != right ? right.possibilities : void 0)) {
      results = function (accum$) {
        for (var i$ = 0, length$ = right.possibilities.length; i$ < length$; ++i$) {
          r = right.possibilities[i$];
          accum$.push(checkAcceptableObject(left, r, scope));
        }
        return accum$;
      }.call(this$, []);
      return results.every(function (i) {
        return !i;
      }) ? false : results.filter(function (i) {
        return i;
      }).join('\n');
    }
    if (left === 'Any')
      return false;
    if (null != left ? left._args_ : void 0) {
      if (left === void 0 || left === 'Any')
        return;
      if (null != left._args_)
        left._args_;
      else
        left._args_ = [];
      results = function (accum$1) {
        for (var i$1 = 0, length$1 = left._args_.length; i$1 < length$1; ++i$1) {
          l_arg = left._args_[i$1];
          i = i$1;
          accum$1.push(checkAcceptableObject(l_arg, right._args_[i], scope));
        }
        return accum$1;
      }.call(this$, []);
      return results.every(function (i) {
        return !i;
      }) ? false : results.filter(function (i) {
        return i;
      }).join('\n');
      if (right._return_ !== 'Any')
        return checkAcceptableObject(left._return_, right._return_, scope);
      return false;
    }
    if (null != (null != left ? left.array : void 0)) {
      if (right.array instanceof Array) {
        results = function (accum$2) {
          for (var i$2 = 0, length$2 = right.array.length; i$2 < length$2; ++i$2) {
            r = right.array[i$2];
            accum$2.push(checkAcceptableObject(left.array, r, scope));
          }
          return accum$2;
        }.call(this$, []);
        return results.every(function (i) {
          return !i;
        }) ? false : results.filter(function (i) {
          return i;
        }).join('\n');
      } else {
        return checkAcceptableObject(left.array, right.array, scope);
      }
    } else if (null != (null != right ? right.array : void 0)) {
      if (left === 'Array' || left === 'Any' || left === void 0) {
        return false;
      } else {
        return 'object deep equal mismatch ' + JSON.stringify(left) + ', ' + JSON.stringify(right);
      }
    } else if (typeof left === 'string' && typeof right === 'string') {
      cur = scope.getTypeInScope(left);
      extended_list = [left];
      while (cur._extends_) {
        extended_list.push(cur._extends_);
        cur = scope.getTypeInScope(cur._extends_);
      }
      if (left === 'Any' || right === 'Any' || in$(right, extended_list)) {
        return false;
      } else {
        return 'object deep equal mismatch ' + JSON.stringify(left) + ', ' + JSON.stringify(right);
      }
    } else if (typeof left === 'object' && typeof right === 'object') {
      results = function (accum$3) {
        for (key in left) {
          lval = left[key];
          accum$3.push(right[key] === void 0 && ('undefined' !== typeof lval && null != lval) && !(key === '_return_' || key === 'type' || key === 'possibilities') ? "'" + key + "' is not defined on right" : checkAcceptableObject(lval, right[key], scope));
        }
        return accum$3;
      }.call(this$, []);
      return results.every(function (i) {
        return !i;
      }) ? false : results.filter(function (i) {
        return i;
      }).join('\n');
    } else if (left === void 0 || right === void 0) {
      return false;
    } else {
      return 'object deep equal mismatch ' + JSON.stringify(left) + ', ' + JSON.stringify(right);
    }
  };
}(this);
initializeGlobalTypes = function (node) {
  node.addTypeObject('String', new TypeSymbol({ dataType: 'String' }));
  node.addTypeObject('Number', new TypeSymbol({
    dataType: 'Number',
    _extends_: 'Float'
  }));
  node.addTypeObject('Int', new TypeSymbol({ dataType: 'Int' }));
  node.addTypeObject('Float', new TypeSymbol({
    dataType: 'Float',
    _extends_: 'Int'
  }));
  node.addTypeObject('Boolean', new TypeSymbol({ dataType: 'Boolean' }));
  node.addTypeObject('Object', new TypeSymbol({ dataType: 'Object' }));
  node.addTypeObject('Array', new TypeSymbol({ dataType: 'Array' }));
  node.addTypeObject('Undefined', new TypeSymbol({ dataType: 'Undefined' }));
  return node.addTypeObject('Any', new TypeSymbol({ dataType: 'Any' }));
};
VarSymbol = function () {
  function VarSymbol(param$) {
    var cache$1;
    {
      cache$1 = param$;
      this.dataType = cache$1.dataType;
      this.explicit = cache$1.explicit;
    }
    if (null != this.explicit)
      this.explicit;
    else
      this.explicit = false;
  }
  return VarSymbol;
}();
TypeSymbol = function () {
  function TypeSymbol(param$) {
    var cache$1;
    {
      cache$1 = param$;
      this.dataType = cache$1.dataType;
      this['instanceof'] = cache$1['instanceof'];
      this._templates_ = cache$1._templates_;
      this._extends_ = cache$1._extends_;
    }
  }
  return TypeSymbol;
}();
Scope = function () {
  function Scope(param$) {
    var instance$;
    instance$ = this;
    this.extendTypeLiteral = function (a) {
      return Scope.prototype.extendTypeLiteral.apply(instance$, arguments);
    };
    if (null == param$)
      param$ = null;
    this.parent = param$;
    if (null != this.parent)
      this.parent.nodes.push(this);
    this.name = '';
    this.nodes = [];
    this._vars = {};
    this._types = {};
    this._this = {};
    this._returnables = [];
  }
  Scope.prototype.addReturnable = function (symbol, dataType) {
    return this._returnables.push(dataType);
  };
  Scope.prototype.getReturnables = function () {
    return this._returnables;
  };
  Scope.prototype.addType = function (symbol, dataType, _templates_) {
    return this._types[symbol] = new TypeSymbol({
      dataType: dataType,
      _templates_: _templates_
    });
  };
  Scope.prototype.addTypeObject = function (symbol, type_object) {
    return this._types[symbol] = type_object;
  };
  Scope.prototype.getType = function (symbol) {
    return this._types[symbol];
  };
  Scope.prototype.getTypeInScope = function (symbol) {
    return this.getType(symbol) || (null != this.parent ? this.parent.getTypeInScope(symbol) : void 0) || void 0;
  };
  Scope.prototype.addThis = function (symbol, dataType) {
    var n, obj, replacer, rewrite_to, T, t;
    if (null != (null != dataType ? dataType._base_ : void 0)) {
      T = this.getType(dataType._base_);
      if (!T)
        return;
      obj = clone(T.dataType);
      if (T._templates_) {
        rewrite_to = dataType._templates_;
        replacer = {};
        for (var i$ = 0, length$ = T._templates_.length; i$ < length$; ++i$) {
          t = T._templates_[i$];
          n = i$;
          replacer[t] = rewrite_to[n];
        }
        rewrite(obj, replacer);
      }
      return this._this[symbol] = new VarSymbol({ dataType: obj });
    } else {
      return this._this[symbol] = new VarSymbol({ dataType: dataType });
    }
  };
  Scope.prototype.getThis = function (symbol) {
    return this._this[symbol];
  };
  Scope.prototype.addVar = function (symbol, dataType, explicit) {
    var n, obj, replacer, rewrite_to, T, t;
    if (null != (null != dataType ? dataType._base_ : void 0)) {
      T = this.getType(dataType._base_);
      if (!T)
        return;
      obj = clone(T.dataType);
      if (T._templates_) {
        rewrite_to = dataType._templates_;
        replacer = {};
        for (var i$ = 0, length$ = T._templates_.length; i$ < length$; ++i$) {
          t = T._templates_[i$];
          n = i$;
          replacer[t] = rewrite_to[n];
        }
        rewrite(obj, replacer);
      }
      return this._vars[symbol] = new VarSymbol({
        dataType: obj,
        explicit: explicit
      });
    } else {
      return this._vars[symbol] = new VarSymbol({
        dataType: dataType,
        explicit: explicit
      });
    }
  };
  Scope.prototype.getVar = function (symbol) {
    return this._vars[symbol];
  };
  Scope.prototype.getVarInScope = function (symbol) {
    return this.getVar(symbol) || (null != this.parent ? this.parent.getVarInScope(symbol) : void 0) || void 0;
  };
  Scope.prototype.isImplicitVarInScope = function (symbol) {
    return this.isImplicitVar(symbol) || (null != this.parent ? this.parent.isImplicitVarInScope(symbol) : void 0) || void 0;
  };
  Scope.prototype.extendTypeLiteral = function (node) {
    var dataType, i, key, ret, val;
    switch (typeof node) {
    case 'object':
      if (node instanceof Array) {
        return function (accum$) {
          for (var i$ = 0, length$ = node.length; i$ < length$; ++i$) {
            i = node[i$];
            accum$.push(this.extendTypeLiteral(i));
          }
          return accum$;
        }.call(this, []);
      } else {
        ret = {};
        for (key in node) {
          val = node[key];
          ret[key] = this.extendTypeLiteral(val);
        }
        return ret;
      }
    case 'string':
      Type = this.getTypeInScope(node);
      dataType = null != Type ? Type.dataType : void 0;
      switch (typeof dataType) {
      case 'object':
        return this.extendTypeLiteral(dataType);
      case 'string':
        return dataType;
      }
    }
  };
  Scope.prototype.checkAcceptableObject = function (left, right) {
    var l, r;
    l = this.extendTypeLiteral(left);
    r = this.extendTypeLiteral(right);
    return checkAcceptableObject(l, r, this);
  };
  return Scope;
}();
ClassScope = function (super$3) {
  extends$(ClassScope, super$3);
  function ClassScope() {
    super$3.apply(this, arguments);
  }
  void 0;
  return ClassScope;
}(Scope);
FunctionScope = function (super$4) {
  extends$(FunctionScope, super$4);
  function FunctionScope() {
    super$4.apply(this, arguments);
  }
  void 0;
  return FunctionScope;
}(Scope);
module.exports = {
  checkAcceptableObject: checkAcceptableObject,
  initializeGlobalTypes: initializeGlobalTypes,
  VarSymbol: VarSymbol,
  TypeSymbol: TypeSymbol,
  Scope: Scope,
  ClassScope: ClassScope,
  FunctionScope: FunctionScope,
  ArrayType: ArrayType,
  ObjectType: ObjectType,
  Type: Type,
  Possibilites: Possibilites
};
function isOwn$(o, p) {
  return {}.hasOwnProperty.call(o, p);
}
function extends$(child, parent) {
  for (var key in parent)
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