{
var CS = require("./nodes"),

  constructorLookup =
    { '||': CS.LogicalOrOp
    , or: CS.LogicalOrOp
    , '&&': CS.LogicalAndOp
    , and: CS.LogicalAndOp
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
    , 'extends': CS.ExtendsOp
    , 'instanceof': CS.InstanceofOp
    , 'in': CS.InOp
    , 'of': CS.OfOp
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

  negatableOps = ['instanceof', 'in', 'of'],
  chainableComparisonOps = ['<=', '>=', '<', '>', '==', 'is', '!=', 'isnt'],

  rightAssocOps = [';', '=', '?', '**'],
  precedenceHierarchy =
    [ ['or', '||']
    , ['and', '&&']
    , ['|']
    , ['^']
    , ['&']
    , ['?']
    , ['is', '==', 'isnt', '!=']
    , ['instanceof', 'in', 'of', '<=', '>=', '<', '>']
    , ['<<', '>>', '>>>']
    , ['+', '-']
    , ['*', '/', '%']
    , ['**']
    ],

  precedenceTable = (function(){
    var table = {}, ops, op;
    for(var level = 0, l = precedenceHierarchy.length; level < l; ++level) {
      ops = precedenceHierarchy[level];
      for(var o = 0, k = ops.length; o < k; ++o) {
        op = ops[o];
        table[op] = level;
      }
    }
    return table;
  }()),

  RIGHT_ASSOCIATIVE = {},
  LEFT_ASSOCIATIVE = {},

  associativities = (function(){
    var result = {};
    for(var op in precedenceTable) {
      if(!{}.hasOwnProperty.call(precedenceTable, op)) continue;
      result[op] = LEFT_ASSOCIATIVE;
    }
    for(var i = 0, l = rightAssocOps.length; i < l; ++i) {
      result[rightAssocOps[i]] = RIGHT_ASSOCIATIVE;
    }
    return result;
  }());

  for(var i = 0, l = negatableOps.length; i < l; ++i) {
    (function(op){
      var fn = function(a, b){ return new CS.LogicalNotOp(new constructorLookup[op](a, b)); };
      fn.prototype = constructorLookup[op].prototype;
      var negatedOp = 'not ' + op;
      constructorLookup[negatedOp] = fn;
      precedenceTable[negatedOp] = precedenceTable[op];
      associativities[negatedOp] = associativities[op];
    }(negatableOps[i]));
  }


  var
  prefixConstructorLookup =
    { '++': CS.PreIncrementOp
    , '--': CS.PreDecrementOp
    , '+': CS.UnaryPlusOp
    , '-': CS.UnaryNegateOp
    , '!': CS.LogicalNotOp
    , 'not': CS.LogicalNotOp
    , '~': CS.BitNotOp
    , 'do': CS.DoOp
    , 'typeof': CS.TypeofOp
    , 'delete': CS.DeleteOp
    },

  postfixConstructorLookup =
    { '?': CS.UnaryExistsOp
    , '[..]': CS.ShallowCopyArray
    , '++': CS.PostIncrementOp
    , '--': CS.PostDecrementOp
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

  // TODO: clean up and use a functional approach; stack === recursion
  foldBinaryExpr = function(parts, ignoreChains) {
    var stack, chainStack, nextPrec, nextOp, className, ctor, prec, rightOperand, leftOperand, operator, i, expr;
    if(parts.length < 3) return parts[0]; // should never happen
    stack = [].slice.call(parts, 0, 3);
    parts = [].slice.call(parts, 3);

    while(parts.length > 0) {
      nextOp = parts[0];

      if(!ignoreChains && stack.length > 2) {
        operator = stack[stack.length - 2];
        // reduce chained comparisons
        if(chainableComparisonOps.indexOf(operator) >= 0 && chainableComparisonOps.indexOf(nextOp) >= 0) {
          chainStack = stack.slice(-3);
          stack = stack.slice(0, stack.length - 3);
          do {
            operator = nextOp;
            chainStack.push(parts.shift(), parts.shift());
            nextOp = parts[0];
            if(nextOp) {
              nextPrec = precedenceTable[nextOp];
              prec = precedenceTable[operator];
            }
          // TODO: I would love `a < b is c < d` to instead denote `(a < b) is (c < d)`
          } while(nextOp != null && (nextPrec > prec || chainableComparisonOps.indexOf(nextOp) >= 0));
          stack.push(new CS.ChainedComparisonOp(foldBinaryExpr(chainStack, true)));
          continue;
        }
      }

      // reduce
      while(
        stack.length > 2 &&
        (
          operator = stack[stack.length - 2],
          prec = precedenceTable[operator],
          nextPrec = precedenceTable[nextOp],
          nextPrec < prec ||
          chainableComparisonOps.indexOf(operator) >= 0 && chainableComparisonOps.indexOf(nextOp) >= 0 ||
          nextPrec == prec && associativities[operator] === LEFT_ASSOCIATIVE
        )
      ) {
        rightOperand = stack.pop();
        stack.pop(); // operator
        leftOperand = stack.pop();
        stack.push(new constructorLookup[operator](leftOperand, rightOperand));
      }
      // shift
      stack.push(parts.shift()); // operator
      stack.push(parts.shift()); // next operand
    }

    // reduce the rest of the stack
    expr = stack.pop();
    while(stack.length > 0)
      expr = new constructorLookup[stack.pop()](stack.pop(), expr);

    return expr;
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

  // TODO: refactor this
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

  // TODO: remove mutation?
  stripLeadingWhitespaceInterpolation = function(pieces){
    var indent = '', piece, match, i, l;
    for(i = 0, l = pieces.length; i < l; ++i) {
      piece = pieces[i];
      if(piece instanceof CS.String) {
        match = piece.data.match(i < l - 1 ? /\n(\s*)/ : /\n(\s*)[^$\s]/);
        if(!indent && match && match[1].length < indent.length) {
          indent = match[1];
        }
      }
    }
    if(indent) {
      for(i = 0, l = pieces.length; i < l; ++i) {
        piece = pieces[i];
        if(piece instanceof CS.String) {
          piece.data = piece.data.replace(new RegExp('\\n' + indent, 'g'), '\n');
          if(i === l - 1) piece.data = piece.data.replace(/(\n\s*)+$/, '');
          if(i === 0) piece.data = piece.data.replace(/^\n/, '');
        }
      }
    }
    return pieces;
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

}


program
  = leader:TERMINATOR? _ b:toplevelBlock? {
      return rp(new CS.Program(b || null));
    }

toplevelBlock
  = s:toplevelStatement ss:(_ TERMINATOR _ toplevelStatement)* TERMINATOR? {
      return rp(new CS.Block([s].concat(ss.map(function(s){ return s[3]; }))));
    }
  toplevelStatement = !(return / continue / break) s:statement { return s; }

block
  = s:statement ss:(_ TERMINATOR _ statement)* TERMINATOR? {
      return rp(new CS.Block([s].concat(ss.map(function(s){ return s[3]; }))));
    }


statement
  = expression
  / return
  / continue
  / break
  / throw
  / debugger
expression = expressionworthy / seqExpression

secondaryStatement
  = secondaryExpression
  / return
  / continue
  / break
  / throw
  / debugger
// secondaryExpression forbids anything lower precedence than assignmentExpression
secondaryExpression = expressionworthy / assignmentExpression
secondaryExpressionNoImplicitObjectCall = expressionworthy / assignmentExpressionNoImplicitObjectCall

// TODO: rename?
expressionworthy
  = functionLiteral
  / conditional
  / while
  / loop
  / try
  / forOf
  / forIn
  / class
  / switch
  / implicitObjectLiteral


seqExpression
  = left:postfixControlFlowExpression right:(_ ";" TERMINATOR? _ expression)? {
      if(!right) return left;
      return rp(new CS.SeqOp(left, right[4]));
    }

postfixControlFlowExpression
  = expr:secondaryStatement postfixes:(_ postfixControlFlowOp)* {
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
    }
  postfixControlFlowOp
    = kw:(IF / UNLESS) _ e:assignmentExpression { return {type: kw, cond: e}; }
    / kw:(WHILE / UNTIL) _ e:assignmentExpression { return {type: kw, cond: e}; }
    / FOR _ val:Assignable _ maybeKey:("," _ Assignable _)? IN _ list:assignmentExpression maybeStep:(_ BY _ assignmentExpression)? maybeFilter:(_ WHEN _ assignmentExpression)? {
        var key = maybeKey ? maybeKey[2] : null,
            step = maybeStep ? maybeStep[3] : new CS.Int(1).r('1').g(),
            filter = maybeFilter ? maybeFilter[3] : null;
        return 0,
          { type: 'for-in'
          , val: val, key: key, list: list, step: step, filter: filter
          };
      }
    / FOR _ maybeOwn:(OWN _)? key:Assignable _ maybeVal:("," _ Assignable _)? OF _ obj:assignmentExpression maybeFilter:(_ WHEN _ assignmentExpression)? {
        var own = !!maybeOwn,
            val = maybeVal ? maybeVal[2] : null,
            filter = maybeFilter ? maybeFilter[3] : null;
        return 0,
          { type: 'for-of'
          , own: own, key: key, val: val, obj: obj, filter: filter
          };
      }

assignmentExpression
  = assignmentOp
  / compoundAssignmentOp
  / existsAssignmentOp
  / binaryExpression
  assignmentOp
    = left:Assignable _ "=" !"=" right:
      ( TERMINDENT e:secondaryExpression DEDENT { return e; }
      / TERMINATOR? _ e:secondaryExpression { return e; }
      ) {
        return rp(new CS.AssignOp(left, right));
      }
  compoundAssignmentOp
    = left:CompoundAssignable _ !"?" op:CompoundAssignmentOperators "=" right:
      ( TERMINDENT e:secondaryExpression DEDENT { return e; }
      / TERMINATOR? _ e:secondaryExpression { return e; }
      ) {
        return rp(new CS.CompoundAssignOp(constructorLookup[op].prototype.className, left, right));
      }
  CompoundAssignmentOperators
    = $("&&" / AND / "||" / OR / "**" / [?&^|*/%] / "+" !"+" / "-" !"-" / "<<" / ">>>" / ">>")
  existsAssignmentOp
    = left:ExistsAssignable _ "?=" _ right:
      ( TERMINDENT e:secondaryExpression DEDENT { return e; }
      / TERMINATOR? _ e:secondaryExpression { return e; }
      ) {
        return rp(new CS.CompoundAssignOp(constructorLookup['?'].prototype.className, left, right));
      }
assignmentExpressionNoImplicitObjectCall
  = assignmentOpNoImplicitObjectCall
  / compoundAssignmentOpNoImplicitObjectCall
  / existsAssignmentOpNoImplicitObjectCall
  / binaryExpressionNoImplicitObjectCall
  assignmentOpNoImplicitObjectCall
    = left:Assignable _ "=" !"=" right:
      ( TERMINDENT e:secondaryExpressionNoImplicitObjectCall DEDENT { return e; }
      / TERMINATOR? _ e:secondaryExpressionNoImplicitObjectCall { return e; }
      ) {
        return rp(new CS.AssignOp(left, right));
      }
  compoundAssignmentOpNoImplicitObjectCall
    = left:CompoundAssignable _ !"?" op:CompoundAssignmentOperators "=" right:
      ( TERMINDENT e:secondaryExpressionNoImplicitObjectCall DEDENT { return e; }
      / TERMINATOR? _ e:secondaryExpressionNoImplicitObjectCall { return e; }
      ) {
        return rp(new CS.CompoundAssignOp(constructorLookup[op].prototype.className, left, right));
      }
  existsAssignmentOpNoImplicitObjectCall
    = left:ExistsAssignable _ "?=" _ right:
      ( TERMINDENT e:secondaryExpressionNoImplicitObjectCall DEDENT { return e; }
      / TERMINATOR? _ e:secondaryExpressionNoImplicitObjectCall { return e; }
      ) {
        return rp(new CS.CompoundAssignOp(constructorLookup['?'].prototype.className, left, right));
      }

binaryExpression
  = left:prefixExpression rights:(_ o:binaryOperator TERMINATOR? _ e:(expressionworthy / prefixExpression) { return [o, e]; })* {
      switch(rights.length) {
        case 0: return left;
        case 1: return rp(new constructorLookup[rights[0][0]](left, rights[0][1]));
        default: return rp(foldBinaryExpr([].concat.apply([left], rights)));
      }
    }
  binaryOperator
    = $(CompoundAssignmentOperators !"=")
    / "<=" / ">=" / "<" / ">" / "==" / IS / "!=" / ISNT
    / EXTENDS / INSTANCEOF / IN / OF
    / NOT _ op:(INSTANCEOF / IN / OF) { return 'not ' + op;  }
binaryExpressionNoImplicitObjectCall
  = left:prefixExpressionNoImplicitObjectCall rights:(_ o:binaryOperator TERMINATOR? _ e:(expressionworthy / prefixExpressionNoImplicitObjectCall) { return [o, e]; })* {
      switch(rights.length) {
        case 0: return left;
        case 1: return rp(new constructorLookup[rights[0][0]](left, rights[0][1]));
        default: return rp(foldBinaryExpr([].concat.apply([left], rights)));
      }
    }

prefixExpression
  = postfixExpression
  / DO _ e:(nfe / expressionworthy / prefixExpression) { return rp(new CS.DoOp(e)); }
  / ops:(PrefixOperators _)+ e:(expressionworthy / prefixExpression) {
      return rp(foldr(function(e, op){
        return new prefixConstructorLookup[op[0]](e);
      }, e, ops));
    }
  PrefixOperators
    = "++" / "--" / "+" / "-" / "!" / NOT / "~" / DO / TYPEOF / DELETE
  nfe
    = !unassignable a:identifier _ "=" _ f:functionLiteral { return rp(new CS.AssignOp(a, f)); }
prefixExpressionNoImplicitObjectCall
  = postfixExpressionNoImplicitObjectCall
  / DO _ e:(nfe / expressionworthy / prefixExpressionNoImplicitObjectCall) { return rp(new CS.DoOp(e)); }
  / ops:(PrefixOperators _)+ e:(expressionworthy / prefixExpressionNoImplicitObjectCall) {
      return rp(foldr(function(e, op){
        return new prefixConstructorLookup[op[0]](e);
      }, e, ops));
    }

postfixExpression
  = e:leftHandSideExpression ops:PostfixOperators* {
      return rp(foldl(function(e, op){
        return new postfixConstructorLookup[op](e);
      }, e, ops));
    }
  PostfixOperators
    = "?" / "[..]" / "++" / "--"
postfixExpressionNoImplicitObjectCall
  = e:leftHandSideExpressionNoImplicitObjectCall ops:PostfixOperators* {
      return rp(foldl(function(e, op){
        return new postfixConstructorLookup[op](e);
      }, e, ops));
    }

leftHandSideExpression = callExpression / newExpression
  argumentList
    = soaked:"?"? "(" _ a:argumentListContents? _ ")" {
        return rp(
          { op: soaked ? CS.SoakedFunctionApplication : CS.FunctionApplication
          , operands: [a || []]
          }
        );
      }
  argumentListContents
    = e:argument es:(_ ("," / TERMINATOR) _ argument)* ("," / TERMINATOR)? {
        return [e].concat(es.map(function(e){ return e[3]; }));
      }
    / TERMINDENT a:argumentListContents DEDENT TERMINATOR? { return a; }
  argument
    = spread
    / expression
  secondaryArgumentList
    = __ !([+-/] __) e:secondaryArgument es:(_ "," _ TERMINATOR? _ secondaryArgument)* obj:(","? TERMINDENT implicitObjectLiteral DEDENT)? {
        es = [e].concat(es.map(function(e){ return e[5]; }));
        if(obj) es.push(obj[2]);
        return es;
      }
    / TERMINDENT o:implicitObjectLiteral DEDENT { return [o]; }
  secondaryArgument
    = spread
    / secondaryExpression
leftHandSideExpressionNoImplicitObjectCall = callExpressionNoImplicitObjectCall / newExpressionNoImplicitObjectCall
  secondaryArgumentListNoImplicitObjectCall
    = __ !([+-/] __) e:secondaryArgumentNoImplicitObjectCall es:(_ "," _ TERMINATOR? _ secondaryArgumentNoImplicitObjectCall)* {
        es = [e].concat(es.map(function(e){ return e[5]; }));
        return es;
      }
  secondaryArgumentNoImplicitObjectCall
    = spreadNoImplicitObjectCall
    / secondaryExpressionNoImplicitObjectCall

callExpression
  = fn:memberExpression accesses:(argumentList / MemberAccessOps)* secondaryArgs:("?"? secondaryArgumentList)? {
      if(accesses) fn = createMemberExpression(fn, accesses);
      var soaked, secondaryCtor;
      if(secondaryArgs) {
        soaked = secondaryArgs[0];
        secondaryCtor = soaked ? CS.SoakedFunctionApplication : CS.FunctionApplication;
        fn = rp(new secondaryCtor(fn, secondaryArgs[1]));
      }
      return fn;
    }
callExpressionNoImplicitObjectCall
  = fn:memberExpressionNoImplicitObjectCall accesses:(argumentList / MemberAccessOps)* secondaryArgs:("?"? secondaryArgumentListNoImplicitObjectCall)? {
      if(accesses) fn = createMemberExpression(fn, accesses);
      var soaked, secondaryCtor;
      if(secondaryArgs) {
        soaked = secondaryArgs[0];
        secondaryCtor = soaked ? CS.SoakedFunctionApplication : CS.FunctionApplication;
        fn = rp(new secondaryCtor(fn, secondaryArgs[1]));
      }
      return fn;
    }

newExpression
  = memberExpression
  / NEW __ e:(expressionworthy / newExpression / prefixExpression) {
      return rp(new CS.NewOp(e, []));
    }
newExpressionNoImplicitObjectCall
  = memberExpressionNoImplicitObjectCall
  / NEW __ e:(expressionworthy / newExpressionNoImplicitObjectCall / prefixExpressionNoImplicitObjectCall) {
      return rp(new CS.NewOp(e, []));
    }

memberExpression
  = e:
    ( primaryExpression
    / NEW __ e:memberExpression args:argumentList { return rp(new CS.NewOp(e, args.operands[0])); }
    ) accesses:MemberAccessOps* {
      return createMemberExpression(e, accesses || []);
    }
  / NEW __ e:memberExpression args:secondaryArgumentList {
      return rp(new CS.NewOp(e, args));
    }
  memberAccess
    = e:( primaryExpression
      / NEW __ e:memberExpression args:argumentList { return rp(new CS.NewOp(e, args.operands[0])); }
      ) accesses:(argumentList MemberAccessOps / MemberAccessOps)+ {
        var acc = foldl(function(memo, a){ return memo.concat(a); }, [], accesses);
        return createMemberExpression(e, acc);
      }
  MemberNames
    = identifierName
  MemberAccessOps
    = TERMINATOR? _ "." TERMINATOR? _ e:MemberNames { return rp({op: CS.MemberAccessOp, operands: [e]}); }
    / "?." _ e:MemberNames { return rp({op: CS.SoakedMemberAccessOp, operands: [e]}); }
    / "[" _ e:expression _ "]" { return rp({op: CS.DynamicMemberAccessOp, operands: [e]}); }
    / "?[" _ e:expression _ "]" { return rp({op: CS.SoakedDynamicMemberAccessOp, operands: [e]}); }
    / "::" _ e:MemberNames { return rp({op: CS.ProtoMemberAccessOp, operands: [e]}); }
    / "::[" _ e:expression _ "]" { return rp({op: CS.DynamicProtoMemberAccessOp, operands: [e]}); }
    / "?::" _ e:MemberNames { return rp({op: CS.SoakedProtoMemberAccessOp, operands: [e]}); }
    / "?::[" _ e:expression _ "]" { return rp({op: CS.SoakedDynamicProtoMemberAccessOp, operands: [e]}); }
    / "[" _ left:assignmentExpression? _ ".." exclusive:"."? _ right:assignmentExpression? _ "]" {
        return rp({op: CS.Slice, operands: [!exclusive, left || null, right || null]});
      }
memberExpressionNoImplicitObjectCall
  = e:
    ( primaryExpression
    / NEW __ e:memberExpressionNoImplicitObjectCall args:argumentList { return rp(new CS.NewOp(e, args.operands[0])); }
    ) accesses:MemberAccessOps* {
      return createMemberExpression(e, accesses || []);
    }
  / NEW __ e:memberExpressionNoImplicitObjectCall args:secondaryArgumentListNoImplicitObjectCall {
      return rp(new CS.NewOp(e, args));
    }

primaryExpression
  = macro
  / Numbers
  / bool
  / null
  / undefined
  / contextVar
  / r:(THIS / "@") { return rp(new CS.This); }
  / identifier
  / range
  / arrayLiteral
  / objectLiteral
  / interpolation
  / JSLiteral
  / string
  / regexp
  / "(" TERMINDENT e:expression DEDENT TERMINATOR? ")" { return r(e.clone()); }
  / "(" _ e:expression _ TERMINATOR? _ ")" { return r(e.clone()); }
  contextVar
    = a:("@" { return rp(new CS.This); }) m:MemberNames {
        return rp(new CS.MemberAccessOp(a, m));
      }
  JSLiteral = "`" d:$([^`]*) "`" { return rp(new CS.JavaScript(d)); }


spread
  = e:postfixExpression "..." { return rp(new CS.Spread(e)); }
spreadNoImplicitObjectCall
  = e:postfixExpressionNoImplicitObjectCall "..." { return rp(new CS.Spread(e)); }


conditional
  = kw:(IF / UNLESS) _ cond:assignmentExpressionNoImplicitObjectCall body:conditionalBody elseClause:elseClause? {
      var constructor = 'unless' === kw ? CS.NegatedConditional : CS.Conditional;
      if('unless' === kw) cond = new CS.LogicalNotOp(cond).g();
      return rp(new constructor(cond, body.block, elseClause || null));
    }
  conditionalBody
    = _ TERMINDENT b:block DEDENT { return {block: b}; }
    / TERMINATOR? _ THEN _ s:statement { return {block: s}; }
    / _ THEN { return {block: null}; }
  elseClause = _ TERMINATOR? _ ELSE b:elseBody { return b; }
  elseBody = functionBody


while
  = kw:(WHILE / UNTIL) _ cond:assignmentExpressionNoImplicitObjectCall body:whileBody {
      var constructor = 'until' === kw ? CS.NegatedWhile : CS.While;
      if('until' === kw) cond = new CS.LogicalNotOp(cond).g();
      return rp(new constructor(cond, body.block));
    }
  whileBody = conditionalBody


loop
  = LOOP body:whileBody {
      return rp(new CS.Loop(body.block));
    }


try
  = TRY body:tryBody c:catchClause? f:finallyClause? {
      return rp(new CS.Try(body.block, c ? c.assignee : null, c ? c.block : null, f ? f.block : null));
    }
  tryBody = b:functionBody { return {block: b}; } / conditionalBody
  catchClause
    = TERMINATOR? _ CATCH _ e:Assignable body:conditionalBody {
      return r({block: body.block, assignee: e});
    }
  finallyClause
    = TERMINATOR? _ FINALLY body:tryBody {
      return r({block: body.block});
    }


class
  = CLASS name:(_ Assignable)? parent:(_ EXTENDS _ extendee)? body:classBody {
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
    }
  extendee = secondaryExpressionNoImplicitObjectCall
  classBody
    = _ TERMINDENT b:classBlock DEDENT { return b; }
    / _ THEN _ s:classStatement { return s; }
    // TODO: this should produce `null`, but that causes PEG.js to fail the parse
    / (_ THEN)? { return new CS.Block([]); }
  classBlock
    = s:classStatement ss:(_ TERMINATOR _ classStatement)* TERMINATOR? {
        return rp(new CS.Block([s].concat(ss.map(function(s){ return s[3]; }))));
      }
  classStatement
    = classProtoAssignment
    / staticAssignment
    / constructor
    / expression
  constructor
    = (key:ObjectInitialiserKeys { return key.instanceof(CS.String, CS.Identifier) && 'constructor' === key.data || null; }) _ ":" _ e:
      ( TERMINDENT e:expression DEDENT { return e; }
      / TERMINATOR? _ e:expression { return e; }
      ) {
        if(e.instanceof(CS.BoundFunction))
          e = c(new CS.Function(e.parameters, e.body).r(e.raw), e);
        return rp(new CS.Constructor(e));
      }
  staticAssignment
    = key:contextVar _ ":" _ e:expression {
        return rp(new CS.AssignOp(key, e));
      }
  classProtoAssignment
    = key:ObjectInitialiserKeys _ ":" _ e:
      ( TERMINDENT e:expression DEDENT { return r({expr: e}); }
      / TERMINATOR? _ e:expression { return r({expr: e}); }
      ) {
        if('constructor' === key.data) return null;
        return rp(new CS.ClassProtoAssignOp(key, e.expr));
      }


forBody = conditionalBody
forOf
  = FOR _ own:(OWN _)? key:Assignable _ maybeVal:("," _ Assignable _)? OF _ obj:assignmentExpressionNoImplicitObjectCall _ maybeFilter:(WHEN _ assignmentExpressionNoImplicitObjectCall _)? body:forBody {
      var val = maybeVal ? maybeVal[2] : null;
      var filter = maybeFilter ? maybeFilter[2] : null;
      return rp(new CS.ForOf(!!own, key, val, obj, filter, body.block));
    }
forIn
  = FOR _ val:Assignable _ maybeKey:("," _ Assignable _)? IN _ list:assignmentExpressionNoImplicitObjectCall _ maybeStep:(BY _ assignmentExpressionNoImplicitObjectCall _)? maybeFilter:(WHEN _ assignmentExpressionNoImplicitObjectCall _)? body:forBody {
      var key = maybeKey ? maybeKey[2] : null;
      var step = maybeStep ? maybeStep[2] : new CS.Int(1).r('1').g();
      var filter = maybeFilter ? maybeFilter[2] : null;
      return rp(new CS.ForIn(val, key, list, step, filter, body.block));
    }


switch
  = SWITCH _ e:(expressionworthy / assignmentExpression)? body:switchBody {
      return rp(new CS.Switch(e || null, body.cases, body['else'] || null));
    }
  switchBody
    = _ TERMINDENT b:switchBlock DEDENT { return r({cases: b.cases, 'else': b['else']}); }
    / _ THEN _ c:case { return r({cases: [c]}); }
    / _ THEN { return r({cases: []}); }
  switchBlock
    = c:case cs:(_ TERMINATOR _ case)* elseClause:(_ TERMINATOR _ elseClause)? TERMINATOR? {
        var cases = [c].concat(cs.map(function(w){ return w[3]; }));
        return r({cases: cases, 'else': elseClause ? elseClause[3] : null});
      }
  case
    = WHEN _ conditions:caseConditions body:caseBody {
        return rp(new CS.SwitchCase(conditions, body.block));
      }
  caseCondition = assignmentExpressionNoImplicitObjectCall
  caseConditions
    = c:caseCondition cs:(_ "," _ caseCondition)* {
        return [c].concat(cs.map(function(c){ return c[3]; }));
      }
  caseBody = conditionalBody


functionLiteral
  = params:("(" _ (TERMINDENT p:parameterList DEDENT TERMINATOR { return p; } / parameterList)? _ ")" _)?  arrow:("->" / "=>") body:functionBody? {
      var constructor;
      switch(arrow) {
        case '->': constructor = CS.Function; break;
        case '=>': constructor = CS.BoundFunction; break;
        default: throw new Error('parsed function arrow ("' + arrow + '") not associated with a constructor');
      }
      return rp(new constructor(params && params[2] || [], body || null));
    }
  functionBody
    = _ TERMINDENT b:block DEDENT { return b; }
    / _ s:statement { return s; }
  parameter
    = param:Assignable _ "=" _ default_:secondaryExpression {
        return rp(new CS.DefaultParam(param, default_));
      }
    / rest
    rest
      = a:Assignable rest:"..."? {
          return rp(rest ? new CS.Rest(a) : a);
        }
  parameterList
    = e:parameter es:(_ ("," TERMINATOR? / TERMINATOR) _ parameter)* {
        return [e].concat(es.map(function(e){ return e[3]; }));
      }


range
  = "[" _ left:secondaryExpression _ ".." exclusiveDot:"."? _ right:secondaryExpression _ "]" {
      var inclusive = !exclusiveDot;
      return rp(new CS.Range(inclusive, left, right));
    }


arrayLiteral
  = "[" members:arrayLiteralBody TERMINATOR? _ "]" {
      return rp(new CS.ArrayInitialiser(members));
    }
  arrayLiteralBody
    = TERMINDENT members:arrayLiteralMemberList DEDENT { return members; }
    / _ members:arrayLiteralMemberList? { return members || []; }
  arrayLiteralMemberList
    = e:arrayLiteralMember _ es:(arrayLiteralMemberSeparator _ arrayLiteralMember _)* arrayLiteralMemberSeparator? {
        return [e].concat(es.map(function(e){ return e[2]; }));
      }
  arrayLiteralMember
    = spread
    / expression
    / TERMINDENT o:implicitObjectLiteral DEDENT { return o; }
  arrayLiteralMemberSeparator
    = $(TERMINATOR _ ","?)
    / $("," TERMINATOR? _)
    // TODO: fix this:
    // $(DEDENT "," TERMINDENT)


objectLiteral
  = "{" members:objectLiteralBody TERMINATOR? _ "}" {
    return rp(new CS.ObjectInitialiser(members));
  }
  objectLiteralBody
    = TERMINDENT members:objectLiteralMemberList DEDENT { return members; }
    / _ members:objectLiteralMemberList? { return members || []; }
  objectLiteralMemberList
    = e:objectLiteralMember _ es:(objectLiteralMemberSeparator _ objectLiteralMember _)* ","? {
        return [e].concat(es.map(function(e){ return e[2]; }));
      }
  objectLiteralMemberSeparator = arrayLiteralMemberSeparator
  objectLiteralMember
    = implicitObjectLiteralMember
    / v:contextVar {
        var key = p(new CS.String(v.memberName).g());
        return rp(new CS.ObjectInitialiserMember(key, v));
      }
    / v:ObjectInitialiserKeys {
        return rp(new CS.ObjectInitialiserMember(v, v));
      }
  ObjectInitialiserKeys
    = i:identifierName { return rp(new CS.Identifier(i)); }
    / string
    / Numbers

// TODO: complete support for implicit objects
implicitObjectLiteral
  = members:implicitObjectLiteralMemberList {
    return rp(new CS.ObjectInitialiser(members));
  }
  implicitObjectLiteralMemberList
    = e:implicitObjectLiteralMember es:(implicitObjectLiteralMemberSeparator _ implicitObjectLiteralMember)* {
        return [e].concat(es.map(function(e){ return e[2]; }));
      }
  implicitObjectLiteralMemberSeparator
    = TERMINATOR ","? _
    / "," TERMINATOR?
  implicitObjectLiteralMember
    = key:ObjectInitialiserKeys _ ":" _ val:implicitObjectLiteralMemberValue {
        return rp(new CS.ObjectInitialiserMember(key, val));
      }
  implicitObjectLiteralMemberValue
    = expression
    / TERMINDENT o:implicitObjectLiteral DEDENT { return o; }


macro
  = "__LINE__" { return rp(new CS.Int(line())); }
  / "__FILENAME__" { return rp(new CS.String(options.inputSource || "")); }
  / "__DATE__" { return rp(new CS.String((new Date).toDateString().slice(4))); }
  / "__TIME__" { return rp(new CS.String((new Date).toTimeString().slice(0, 8))); }
  / "__DATETIMEMS__" { return rp(new CS.Int(+new Date)); }


bool
  = (TRUE / YES / ON) { return rp(new CS.Bool(true)); }
  / (FALSE / NO / OFF) { return rp(new CS.Bool(false)); }


Numbers
  = "0b" bs:$(bit+) { return rp(new CS.Int(parseInt(bs, 2))); }
  / "0o" os:$(octalDigit+) { return rp(new CS.Int(parseInt(os, 8))); }
  / "0x" hs:$(hexDigit+) { return rp(new CS.Int(parseInt(hs, 16))); }
  / base:decimal e:[eE] sign:[+-]? exponent:decimal {
      return rp(new CS.Float(parseFloat('' + base.data + e + sign + exponent.data, 10)));
    }
  / decimal

decimal
  // trailing and leading radix points are discouraged anyway
  = integral:integer fractional:$("." decimalDigit+)? {
      return fractional
        ? rp(new CS.Float(parseFloat(integral + fractional, 10)))
        : rp(new CS.Int(+integral));
    }

integer
  = "0"
  / $([1-9] decimalDigit*)

decimalDigit = [0-9]
hexDigit = [0-9a-fA-F]
octalDigit = [0-7]
bit = [01]


string
  = "\"\"\"" d:(stringData / "'" / $("\"" "\""? !"\""))+ "\"\"\"" {
      return rp(new CS.String(stripLeadingWhitespace(d.join(''))));
    }
  / "'''" d:(stringData / "\"" / "#" / $("'" "'"? !"'"))+ "'''" {
      return rp(new CS.String(stripLeadingWhitespace(d.join(''))));
    }
  / "\"" d:(stringData / "'")* "\"" { return rp(new CS.String(d.join(''))); }
  / "'" d:(stringData / "\"" / "#")* "'" { return rp(new CS.String(d.join(''))); }
  stringData
    = [^"'\\#]
    / UnicodeEscapeSequence
    / "\\x" h:$(hexDigit hexDigit) { return String.fromCharCode(parseInt(h, 16)); }
    / "\\0" !decimalDigit { return '\0'; }
    / "\\0" &decimalDigit { throw new SyntaxError(['string data'], 'octal escape sequence', offset(), line(), column()); }
    / "\\b" { return '\b'; }
    / "\\t" { return '\t'; }
    / "\\n" { return '\n'; }
    / "\\v" { return '\v'; }
    / "\\f" { return '\f'; }
    / "\\r" { return '\r'; }
    / "\\" c:. { return c; }
    / c:"#" !"{" { return c; }

interpolation
  = "\"\"\"" es:
    ( d:(stringData / "'" / s:$("\"" "\""? !"\""))+ { return rp(new CS.String(d.join(''))); }
    / "#{" _ e:expression _ "}" { return e; }
    )+ "\"\"\"" {
      return rp(createInterpolation(stripLeadingWhitespaceInterpolation(es)));
    }
  / "\"" es:
    ( d:(stringData / "'")+ { return rp(new CS.String(d.join(''))); }
    / "#{" _ e:expression _ "}" { return e; }
    )+ "\"" {
      return rp(createInterpolation(es));
    }


regexp
  = "///" es:
    ( [ \r\n]+ { return [rp(new CS.String('').g())]; }
    / s:[^\\/#[ \r\n]+ { return [rp(new CS.String(s.join('')).g())]; }
    / hereregexpData
    )+ "///" flags:[gimy]* {
      if(!isValidRegExpFlags(flags))
        throw new SyntaxError(['regular expression flags'], 'regular expression flags', offset(), line(), column());
      if(!flags) flags = [];
      var interp = createInterpolation(foldl(function(memo, e){ return memo.concat(e); }, [], es));
      if(interp instanceof CS.String) return p(new CS.RegExp(interp.data, flags));
      return rp(new CS.HeregExp(interp, flags));
    }
  / "/" d:(regexpData / d:[^/\\[\n]+ { return d.join(''); })* "/" flags:[gimy]* {
      if(!isValidRegExpFlags(flags))
        throw new SyntaxError(['regular expression flags'], 'regular expression flags', offset(), line(), column());
      return rp(new CS.RegExp(d.join(''), flags));
    }
  regexpData
    = "[" d:([^\\\]\n] / regexpData)* "]" { return '[' + d.join('') + ']'; }
    / $("\\" .)
  hereregexpData
    = "[" d:
      ( h:hereregexpData { return h[0]; }
      / s:[^\\/\]] { return p(new CS.String(s)); }
      )* "]" {
        return [p(new CS.String("["))].concat(d || []).concat([p(new CS.String("]"))]);
      }
    / d:$("\\" .) { return [rp(new CS.String(d))]; }
    / s:$("/" "/"? !"/") { return [rp(new CS.String(s))]; }
    / c:"#" !"{" { return [rp(new CS.String(c))]; }
    / "#{" _ e:expression _ "}" { return [e]; }


throw = THROW _ e:secondaryExpression { return rp(new CS.Throw(e)); }
return = RETURN _ e:secondaryExpression? { return rp(new CS.Return(e || null)); }
continue = CONTINUE { return rp(new CS.Continue); }
break = BREAK { return rp(new CS.Break); }
debugger = DEBUGGER { return rp(new CS.Debugger); }

undefined = UNDEFINED { return rp(new CS.Undefined); }
null = NULL { return rp(new CS.Null); }


unassignable = ("arguments" / "eval") !identifierPart
CompoundAssignable
  = memberAccess
  / !unassignable i:identifier { return i; }
  / contextVar
ExistsAssignable = CompoundAssignable
Assignable
  = memberAccess
  / !unassignable i:identifier { return i; }
  / contextVar
  / positionalDestructuring
  / namedDestructuring


positionalDestructuring
  = "[" members:positionalDestructuringBody  TERMINATOR? _ "]" {
      return rp(new CS.ArrayInitialiser(members));
    }
  positionalDestructuringBody
    = TERMINDENT members:positionalDestructuringMemberList DEDENT { return members; }
    / _ members:positionalDestructuringMemberList? { return members || []; }
  positionalDestructuringMemberList
    = e:positionalDestructuringMember es:(_ "," _ positionalDestructuringMember)* {
        return [e].concat(es.map(function(e){ return e[3]; }));
      }
  positionalDestructuringMember = rest / Assignable

namedDestructuring
  = "{" members:namedDestructuringBody TERMINATOR? _ "}" {
    return rp(new CS.ObjectInitialiser(members));
  }
  namedDestructuringBody
    = TERMINDENT members:namedDestructuringMemberList DEDENT { return members; }
    / _ members:namedDestructuringMemberList? { return members || []; }
  namedDestructuringMemberList
    = e:namedDestructuringMember es:(TERMINATOR? _ ("," / TERMINATOR) TERMINATOR? _ namedDestructuringMember)* {
        return [e].concat(es.map(function(e){ return e[5]; }));
      }
  namedDestructuringMember
    = key:ObjectInitialiserKeys _ ":" _ val:Assignable {
        return rp(new CS.ObjectInitialiserMember(key, val));
      }
    / v:contextVar {
        var key = rp(new CS.String(v.memberName));
        return rp(new CS.ObjectInitialiserMember(key, v));
      }
    / !unassignable i:identifier {
        return rp(new CS.ObjectInitialiserMember(i, i));
      }


identifier = !reserved i:identifierName { return rp(new CS.Identifier(i)); }
identifierName = $(identifierStart identifierPart*)
identifierStart
  = UnicodeLetter
  / [$_]
  / UnicodeEscapeSequence
identifierPart
  = identifierStart
// TODO: these produce lists and need to be joined
  / UnicodeCombiningMark
  / UnicodeDigit
  / UnicodeConnectorPunctuation
  / ZWNJ
  / ZWJ


__ = $(whitespace+ (blockComment whitespace+)?)
_ = __?

comment =  blockComment / singleLineComment
singleLineComment = $("#" (!TERM .)*)
blockComment = $("###" [^#] ([^#] / "#" "#"? !"#")* "###")

whitespace
  = [\u0009\u000B\u000C\u0020\u00A0\uFEFF\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]
  / "\r" // ignored to support windows line endings
  / $("\\" "\r"? "\n")

INDENT = ws:__ "\uEFEF" { return ws; }
DEDENT = ws:$(TERMINATOR? _) "\uEFFE" { return ws; }
TERM
  = $("\r"? "\n")
  / "\uEFFF" { return ''; }

TERMINATOR = $((_ comment? TERM blockComment?)+)

TERMINDENT = $(TERMINATOR INDENT)


// keywords
AND = $("and" !identifierPart)
BREAK = $("break" !identifierPart)
BY = $("by" !identifierPart)
CATCH = $("catch" !identifierPart)
CONTINUE = $("continue" !identifierPart)
CLASS = $("class" !identifierPart)
DELETE = $("delete" !identifierPart)
DEBUGGER = $("debugger" !identifierPart)
DO = $("do" !identifierPart)
ELSE = $("else" !identifierPart)
EXTENDS = $("extends" !identifierPart)
FALSE = $("false" !identifierPart)
FINALLY = $("finally" !identifierPart)
FOR = $("for" !identifierPart)
IF = $("if" !identifierPart)
IN = $("in" !identifierPart)
INSTANCEOF = $("instanceof" !identifierPart)
IS = $("is" !identifierPart)
ISNT = $("isnt" !identifierPart)
LOOP = $("loop" !identifierPart)
NEW = $("new" !identifierPart)
NO = $("no" !identifierPart)
NOT = $("not" !identifierPart)
NULL = $("null" !identifierPart)
OF = $("of" !identifierPart)
OFF = $("off" !identifierPart)
ON = $("on" !identifierPart)
OR = $("or" !identifierPart)
OWN = $("own" !identifierPart)
RETURN = $("return" !identifierPart)
SWITCH = $("switch" !identifierPart)
THEN = $("then" !identifierPart)
THIS = $("this" !identifierPart)
THROW = $("throw" !identifierPart)
TRUE = $("true" !identifierPart)
TRY = $("try" !identifierPart)
TYPEOF = $("typeof" !identifierPart)
UNDEFINED = $("undefined" !identifierPart)
UNLESS = $("unless" !identifierPart)
UNTIL = $("until" !identifierPart)
WHEN = $("when" !identifierPart)
WHILE = $("while" !identifierPart)
YES = $("yes" !identifierPart)

SharedKeywords
  = ("true" / "false" / "null" / "this" / "new" / "delete" / "typeof" /
  "instanceof" / "in" / "return" / "throw" / "break" / "continue" / "debugger" /
  "if" / "else" / "switch" / "for" / "while" / "do" / "try" / "catch" /
  "finally" / "class" / "extends" / "super") !identifierPart

JSKeywords
  = ("case" / "default" / "function" / "var" / "void" / "with" / "const" /
  "let" / "enum" / "export" / "import" / "native" / "implements" / "interface" /
  "package" / "private" / "protected" / "public" / "static" / "yield") !identifierPart

CSKeywords
  = ("undefined" / "then" / "unless" / "until" / "loop" / "off" / "by" / "when" /
  "and" / "or" / "isnt" / "is" / "not" / "yes" / "no" / "on" / "of") !identifierPart

StandardPredefinedMacros
  = "__" ("FILENAME" / "LINE" / "DATETIMEMS" / "DATE" / "TIME") "__"

reserved
  = StandardPredefinedMacros
  / SharedKeywords
  / CSKeywords
  / JSKeywords


// unicode
UnicodeEscapeSequence = "\\u" h0:hexDigit h1:hexDigit h2:hexDigit h3:hexDigit { return String.fromCharCode(parseInt(h0 + h1 + h2 + h3, 16)); }
UnicodeLetter = [\u0041-\u005A\u00C0-\u00D6\u00D8-\u00DE\u0100\u0102\u0104\u0106\u0108\u010A\u010C\u010E\u0110\u0112\u0114\u0116\u0118\u011A\u011C\u011E\u0120\u0122\u0124\u0126\u0128\u012A\u012C\u012E\u0130\u0132\u0134\u0136\u0139\u013B\u013D\u013F\u0141\u0143\u0145\u0147\u014A\u014C\u014E\u0150\u0152\u0154\u0156\u0158\u015A\u015C\u015E\u0160\u0162\u0164\u0166\u0168\u016A\u016C\u016E\u0170\u0172\u0174\u0176\u0178\u0179\u017B\u017D\u0181\u0182\u0184\u0186\u0187\u0189-\u018B\u018E-\u0191\u0193\u0194\u0196-\u0198\u019C\u019D\u019F\u01A0\u01A2\u01A4\u01A6\u01A7\u01A9\u01AC\u01AE\u01AF\u01B1-\u01B3\u01B5\u01B7\u01B8\u01BC\u01C4\u01C7\u01CA\u01CD\u01CF\u01D1\u01D3\u01D5\u01D7\u01D9\u01DB\u01DE\u01E0\u01E2\u01E4\u01E6\u01E8\u01EA\u01EC\u01EE\u01F1\u01F4\u01F6-\u01F8\u01FA\u01FC\u01FE\u0200\u0202\u0204\u0206\u0208\u020A\u020C\u020E\u0210\u0212\u0214\u0216\u0218\u021A\u021C\u021E\u0220\u0222\u0224\u0226\u0228\u022A\u022C\u022E\u0230\u0232\u023A\u023B\u023D\u023E\u0241\u0243-\u0246\u0248\u024A\u024C\u024E\u0370\u0372\u0376\u0386\u0388-\u038A\u038C\u038E\u038F\u0391-\u03A1\u03A3-\u03AB\u03CF\u03D2-\u03D4\u03D8\u03DA\u03DC\u03DE\u03E0\u03E2\u03E4\u03E6\u03E8\u03EA\u03EC\u03EE\u03F4\u03F7\u03F9\u03FA\u03FD-\u042F\u0460\u0462\u0464\u0466\u0468\u046A\u046C\u046E\u0470\u0472\u0474\u0476\u0478\u047A\u047C\u047E\u0480\u048A\u048C\u048E\u0490\u0492\u0494\u0496\u0498\u049A\u049C\u049E\u04A0\u04A2\u04A4\u04A6\u04A8\u04AA\u04AC\u04AE\u04B0\u04B2\u04B4\u04B6\u04B8\u04BA\u04BC\u04BE\u04C0\u04C1\u04C3\u04C5\u04C7\u04C9\u04CB\u04CD\u04D0\u04D2\u04D4\u04D6\u04D8\u04DA\u04DC\u04DE\u04E0\u04E2\u04E4\u04E6\u04E8\u04EA\u04EC\u04EE\u04F0\u04F2\u04F4\u04F6\u04F8\u04FA\u04FC\u04FE\u0500\u0502\u0504\u0506\u0508\u050A\u050C\u050E\u0510\u0512\u0514\u0516\u0518\u051A\u051C\u051E\u0520\u0522\u0524\u0526\u0531-\u0556\u10A0-\u10C5\u1E00\u1E02\u1E04\u1E06\u1E08\u1E0A\u1E0C\u1E0E\u1E10\u1E12\u1E14\u1E16\u1E18\u1E1A\u1E1C\u1E1E\u1E20\u1E22\u1E24\u1E26\u1E28\u1E2A\u1E2C\u1E2E\u1E30\u1E32\u1E34\u1E36\u1E38\u1E3A\u1E3C\u1E3E\u1E40\u1E42\u1E44\u1E46\u1E48\u1E4A\u1E4C\u1E4E\u1E50\u1E52\u1E54\u1E56\u1E58\u1E5A\u1E5C\u1E5E\u1E60\u1E62\u1E64\u1E66\u1E68\u1E6A\u1E6C\u1E6E\u1E70\u1E72\u1E74\u1E76\u1E78\u1E7A\u1E7C\u1E7E\u1E80\u1E82\u1E84\u1E86\u1E88\u1E8A\u1E8C\u1E8E\u1E90\u1E92\u1E94\u1E9E\u1EA0\u1EA2\u1EA4\u1EA6\u1EA8\u1EAA\u1EAC\u1EAE\u1EB0\u1EB2\u1EB4\u1EB6\u1EB8\u1EBA\u1EBC\u1EBE\u1EC0\u1EC2\u1EC4\u1EC6\u1EC8\u1ECA\u1ECC\u1ECE\u1ED0\u1ED2\u1ED4\u1ED6\u1ED8\u1EDA\u1EDC\u1EDE\u1EE0\u1EE2\u1EE4\u1EE6\u1EE8\u1EEA\u1EEC\u1EEE\u1EF0\u1EF2\u1EF4\u1EF6\u1EF8\u1EFA\u1EFC\u1EFE\u1F08-\u1F0F\u1F18-\u1F1D\u1F28-\u1F2F\u1F38-\u1F3F\u1F48-\u1F4D\u1F59\u1F5B\u1F5D\u1F5F\u1F68-\u1F6F\u1FB8-\u1FBB\u1FC8-\u1FCB\u1FD8-\u1FDB\u1FE8-\u1FEC\u1FF8-\u1FFB\u2102\u2107\u210B-\u210D\u2110-\u2112\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u2130-\u2133\u213E\u213F\u2145\u2183\u2C00-\u2C2E\u2C60\u2C62-\u2C64\u2C67\u2C69\u2C6B\u2C6D-\u2C70\u2C72\u2C75\u2C7E-\u2C80\u2C82\u2C84\u2C86\u2C88\u2C8A\u2C8C\u2C8E\u2C90\u2C92\u2C94\u2C96\u2C98\u2C9A\u2C9C\u2C9E\u2CA0\u2CA2\u2CA4\u2CA6\u2CA8\u2CAA\u2CAC\u2CAE\u2CB0\u2CB2\u2CB4\u2CB6\u2CB8\u2CBA\u2CBC\u2CBE\u2CC0\u2CC2\u2CC4\u2CC6\u2CC8\u2CCA\u2CCC\u2CCE\u2CD0\u2CD2\u2CD4\u2CD6\u2CD8\u2CDA\u2CDC\u2CDE\u2CE0\u2CE2\u2CEB\u2CED\uA640\uA642\uA644\uA646\uA648\uA64A\uA64C\uA64E\uA650\uA652\uA654\uA656\uA658\uA65A\uA65C\uA65E\uA660\uA662\uA664\uA666\uA668\uA66A\uA66C\uA680\uA682\uA684\uA686\uA688\uA68A\uA68C\uA68E\uA690\uA692\uA694\uA696\uA722\uA724\uA726\uA728\uA72A\uA72C\uA72E\uA732\uA734\uA736\uA738\uA73A\uA73C\uA73E\uA740\uA742\uA744\uA746\uA748\uA74A\uA74C\uA74E\uA750\uA752\uA754\uA756\uA758\uA75A\uA75C\uA75E\uA760\uA762\uA764\uA766\uA768\uA76A\uA76C\uA76E\uA779\uA77B\uA77D\uA77E\uA780\uA782\uA784\uA786\uA78B\uA78D\uA790\uA7A0\uA7A2\uA7A4\uA7A6\uA7A8\uFF21-\uFF3A\u0061-\u007A\u00AA\u00B5\u00BA\u00DF-\u00F6\u00F8-\u00FF\u0101\u0103\u0105\u0107\u0109\u010B\u010D\u010F\u0111\u0113\u0115\u0117\u0119\u011B\u011D\u011F\u0121\u0123\u0125\u0127\u0129\u012B\u012D\u012F\u0131\u0133\u0135\u0137\u0138\u013A\u013C\u013E\u0140\u0142\u0144\u0146\u0148\u0149\u014B\u014D\u014F\u0151\u0153\u0155\u0157\u0159\u015B\u015D\u015F\u0161\u0163\u0165\u0167\u0169\u016B\u016D\u016F\u0171\u0173\u0175\u0177\u017A\u017C\u017E-\u0180\u0183\u0185\u0188\u018C\u018D\u0192\u0195\u0199-\u019B\u019E\u01A1\u01A3\u01A5\u01A8\u01AA\u01AB\u01AD\u01B0\u01B4\u01B6\u01B9\u01BA\u01BD-\u01BF\u01C6\u01C9\u01CC\u01CE\u01D0\u01D2\u01D4\u01D6\u01D8\u01DA\u01DC\u01DD\u01DF\u01E1\u01E3\u01E5\u01E7\u01E9\u01EB\u01ED\u01EF\u01F0\u01F3\u01F5\u01F9\u01FB\u01FD\u01FF\u0201\u0203\u0205\u0207\u0209\u020B\u020D\u020F\u0211\u0213\u0215\u0217\u0219\u021B\u021D\u021F\u0221\u0223\u0225\u0227\u0229\u022B\u022D\u022F\u0231\u0233-\u0239\u023C\u023F\u0240\u0242\u0247\u0249\u024B\u024D\u024F-\u0293\u0295-\u02AF\u0371\u0373\u0377\u037B-\u037D\u0390\u03AC-\u03CE\u03D0\u03D1\u03D5-\u03D7\u03D9\u03DB\u03DD\u03DF\u03E1\u03E3\u03E5\u03E7\u03E9\u03EB\u03ED\u03EF-\u03F3\u03F5\u03F8\u03FB\u03FC\u0430-\u045F\u0461\u0463\u0465\u0467\u0469\u046B\u046D\u046F\u0471\u0473\u0475\u0477\u0479\u047B\u047D\u047F\u0481\u048B\u048D\u048F\u0491\u0493\u0495\u0497\u0499\u049B\u049D\u049F\u04A1\u04A3\u04A5\u04A7\u04A9\u04AB\u04AD\u04AF\u04B1\u04B3\u04B5\u04B7\u04B9\u04BB\u04BD\u04BF\u04C2\u04C4\u04C6\u04C8\u04CA\u04CC\u04CE\u04CF\u04D1\u04D3\u04D5\u04D7\u04D9\u04DB\u04DD\u04DF\u04E1\u04E3\u04E5\u04E7\u04E9\u04EB\u04ED\u04EF\u04F1\u04F3\u04F5\u04F7\u04F9\u04FB\u04FD\u04FF\u0501\u0503\u0505\u0507\u0509\u050B\u050D\u050F\u0511\u0513\u0515\u0517\u0519\u051B\u051D\u051F\u0521\u0523\u0525\u0527\u0561-\u0587\u1D00-\u1D2B\u1D62-\u1D77\u1D79-\u1D9A\u1E01\u1E03\u1E05\u1E07\u1E09\u1E0B\u1E0D\u1E0F\u1E11\u1E13\u1E15\u1E17\u1E19\u1E1B\u1E1D\u1E1F\u1E21\u1E23\u1E25\u1E27\u1E29\u1E2B\u1E2D\u1E2F\u1E31\u1E33\u1E35\u1E37\u1E39\u1E3B\u1E3D\u1E3F\u1E41\u1E43\u1E45\u1E47\u1E49\u1E4B\u1E4D\u1E4F\u1E51\u1E53\u1E55\u1E57\u1E59\u1E5B\u1E5D\u1E5F\u1E61\u1E63\u1E65\u1E67\u1E69\u1E6B\u1E6D\u1E6F\u1E71\u1E73\u1E75\u1E77\u1E79\u1E7B\u1E7D\u1E7F\u1E81\u1E83\u1E85\u1E87\u1E89\u1E8B\u1E8D\u1E8F\u1E91\u1E93\u1E95-\u1E9D\u1E9F\u1EA1\u1EA3\u1EA5\u1EA7\u1EA9\u1EAB\u1EAD\u1EAF\u1EB1\u1EB3\u1EB5\u1EB7\u1EB9\u1EBB\u1EBD\u1EBF\u1EC1\u1EC3\u1EC5\u1EC7\u1EC9\u1ECB\u1ECD\u1ECF\u1ED1\u1ED3\u1ED5\u1ED7\u1ED9\u1EDB\u1EDD\u1EDF\u1EE1\u1EE3\u1EE5\u1EE7\u1EE9\u1EEB\u1EED\u1EEF\u1EF1\u1EF3\u1EF5\u1EF7\u1EF9\u1EFB\u1EFD\u1EFF-\u1F07\u1F10-\u1F15\u1F20-\u1F27\u1F30-\u1F37\u1F40-\u1F45\u1F50-\u1F57\u1F60-\u1F67\u1F70-\u1F7D\u1F80-\u1F87\u1F90-\u1F97\u1FA0-\u1FA7\u1FB0-\u1FB4\u1FB6\u1FB7\u1FBE\u1FC2-\u1FC4\u1FC6\u1FC7\u1FD0-\u1FD3\u1FD6\u1FD7\u1FE0-\u1FE7\u1FF2-\u1FF4\u1FF6\u1FF7\u210A\u210E\u210F\u2113\u212F\u2134\u2139\u213C\u213D\u2146-\u2149\u214E\u2184\u2C30-\u2C5E\u2C61\u2C65\u2C66\u2C68\u2C6A\u2C6C\u2C71\u2C73\u2C74\u2C76-\u2C7C\u2C81\u2C83\u2C85\u2C87\u2C89\u2C8B\u2C8D\u2C8F\u2C91\u2C93\u2C95\u2C97\u2C99\u2C9B\u2C9D\u2C9F\u2CA1\u2CA3\u2CA5\u2CA7\u2CA9\u2CAB\u2CAD\u2CAF\u2CB1\u2CB3\u2CB5\u2CB7\u2CB9\u2CBB\u2CBD\u2CBF\u2CC1\u2CC3\u2CC5\u2CC7\u2CC9\u2CCB\u2CCD\u2CCF\u2CD1\u2CD3\u2CD5\u2CD7\u2CD9\u2CDB\u2CDD\u2CDF\u2CE1\u2CE3\u2CE4\u2CEC\u2CEE\u2D00-\u2D25\uA641\uA643\uA645\uA647\uA649\uA64B\uA64D\uA64F\uA651\uA653\uA655\uA657\uA659\uA65B\uA65D\uA65F\uA661\uA663\uA665\uA667\uA669\uA66B\uA66D\uA681\uA683\uA685\uA687\uA689\uA68B\uA68D\uA68F\uA691\uA693\uA695\uA697\uA723\uA725\uA727\uA729\uA72B\uA72D\uA72F-\uA731\uA733\uA735\uA737\uA739\uA73B\uA73D\uA73F\uA741\uA743\uA745\uA747\uA749\uA74B\uA74D\uA74F\uA751\uA753\uA755\uA757\uA759\uA75B\uA75D\uA75F\uA761\uA763\uA765\uA767\uA769\uA76B\uA76D\uA76F\uA771-\uA778\uA77A\uA77C\uA77F\uA781\uA783\uA785\uA787\uA78C\uA78E\uA791\uA7A1\uA7A3\uA7A5\uA7A7\uA7A9\uA7FA\uFB00-\uFB06\uFB13-\uFB17\uFF41-\uFF5A\u01C5\u01C8\u01CB\u01F2\u1F88-\u1F8F\u1F98-\u1F9F\u1FA8-\u1FAF\u1FBC\u1FCC\u1FFC\u02B0-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0374\u037A\u0559\u0640\u06E5\u06E6\u07F4\u07F5\u07FA\u081A\u0824\u0828\u0971\u0E46\u0EC6\u10FC\u17D7\u1843\u1AA7\u1C78-\u1C7D\u1D2C-\u1D61\u1D78\u1D9B-\u1DBF\u2071\u207F\u2090-\u209C\u2C7D\u2D6F\u2E2F\u3005\u3031-\u3035\u303B\u309D\u309E\u30FC-\u30FE\uA015\uA4F8-\uA4FD\uA60C\uA67F\uA717-\uA71F\uA770\uA788\uA9CF\uAA70\uAADD\uFF70\uFF9E\uFF9F\u01BB\u01C0-\u01C3\u0294\u05D0-\u05EA\u05F0-\u05F2\u0620-\u063F\u0641-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u0800-\u0815\u0840-\u0858\u0904-\u0939\u093D\u0950\u0958-\u0961\u0972-\u0977\u0979-\u097F\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E45\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EDC\u0EDD\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10D0-\u10FA\u1100-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17DC\u1820-\u1842\u1844-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191C\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16\u1A20-\u1A54\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BC0-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C77\u1CE9-\u1CEC\u1CEE-\u1CF1\u2135-\u2138\u2D30-\u2D65\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u3006\u303C\u3041-\u3096\u309F\u30A1-\u30FA\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400\u4DB5\u4E00\u9FCB\uA000-\uA014\uA016-\uA48C\uA4D0-\uA4F7\uA500-\uA60B\uA610-\uA61F\uA62A\uA62B\uA66E\uA6A0-\uA6E5\uA7FB-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA6F\uAA71-\uAA76\uAA7A\uAA80-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB\uAADC\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uABC0-\uABE2\uAC00\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA2D\uFA30-\uFA6D\uFA70-\uFAD9\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF66-\uFF6F\uFF71-\uFF9D\uFFA0-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC\u16EE-\u16F0\u2160-\u2182\u2185-\u2188\u3007\u3021-\u3029\u3038-\u303A\uA6E6-\uA6EF] / "\uD82C" [\uDC00\uDC01] / "\uD808" [\uDC00-\uDF6E] / "\uD869" [\uDED6\uDF00] / "\uD809" [\uDC00-\uDC62] / "\uD835" [\uDC00-\uDC19\uDC34-\uDC4D\uDC68-\uDC81\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB5\uDCD0-\uDCE9\uDD04\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD38\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD6C-\uDD85\uDDA0-\uDDB9\uDDD4-\uDDED\uDE08-\uDE21\uDE3C-\uDE55\uDE70-\uDE89\uDEA8-\uDEC0\uDEE2-\uDEFA\uDF1C-\uDF34\uDF56-\uDF6E\uDF90-\uDFA8\uDFCA\uDC1A-\uDC33\uDC4E-\uDC54\uDC56-\uDC67\uDC82-\uDC9B\uDCB6-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDCCF\uDCEA-\uDD03\uDD1E-\uDD37\uDD52-\uDD6B\uDD86-\uDD9F\uDDBA-\uDDD3\uDDEE-\uDE07\uDE22-\uDE3B\uDE56-\uDE6F\uDE8A-\uDEA5\uDEC2-\uDEDA\uDEDC-\uDEE1\uDEFC-\uDF14\uDF16-\uDF1B\uDF36-\uDF4E\uDF50-\uDF55\uDF70-\uDF88\uDF8A-\uDF8F\uDFAA-\uDFC2\uDFC4-\uDFC9\uDFCB] / "\uD804" [\uDC03-\uDC37\uDC83-\uDCAF] / "\uD800" [\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDE80-\uDE9C\uDEA0-\uDED0\uDF00-\uDF1E\uDF30-\uDF40\uDF42-\uDF49\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDD40-\uDD74\uDF41\uDF4A\uDFD1-\uDFD5] / "\uD80C" [\uDC00-\uDFFF] / "\uD801" [\uDC00-\uDC9D] / "\uD86E" [\uDC1D] / "\uD803" [\uDC00-\uDC48] / "\uD840" [\uDC00] / "\uD87E" [\uDC00-\uDE1D] / "\uD86D" [\uDF34\uDF40] / "\uD81A" [\uDC00-\uDE38] / "\uD802" [\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDD00-\uDD15\uDD20-\uDD39\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE60-\uDE7C\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72] / "\uD80D" [\uDC00-\uDC2E]
UnicodeCombiningMark = [\u0300-\u036F\u0483-\u0487\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u0711\u0730-\u074A\u07A6-\u07B0\u07EB-\u07F3\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u0900-\u0902\u093A\u093C\u0941-\u0948\u094D\u0951-\u0957\u0962\u0963\u0981\u09BC\u09C1-\u09C4\u09CD\u09E2\u09E3\u0A01\u0A02\u0A3C\u0A41\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A70\u0A71\u0A75\u0A81\u0A82\u0ABC\u0AC1-\u0AC5\u0AC7\u0AC8\u0ACD\u0AE2\u0AE3\u0B01\u0B3C\u0B3F\u0B41-\u0B44\u0B4D\u0B56\u0B62\u0B63\u0B82\u0BC0\u0BCD\u0C3E-\u0C40\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C62\u0C63\u0CBC\u0CBF\u0CC6\u0CCC\u0CCD\u0CE2\u0CE3\u0D41-\u0D44\u0D4D\u0D62\u0D63\u0DCA\u0DD2-\u0DD4\u0DD6\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0EB1\u0EB4-\u0EB9\u0EBB\u0EBC\u0EC8-\u0ECD\u0F18\u0F19\u0F35\u0F37\u0F39\u0F71-\u0F7E\u0F80-\u0F84\u0F86\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102D-\u1030\u1032-\u1037\u1039\u103A\u103D\u103E\u1058\u1059\u105E-\u1060\u1071-\u1074\u1082\u1085\u1086\u108D\u109D\u135D-\u135F\u1712-\u1714\u1732-\u1734\u1752\u1753\u1772\u1773\u17B7-\u17BD\u17C6\u17C9-\u17D3\u17DD\u180B-\u180D\u18A9\u1920-\u1922\u1927\u1928\u1932\u1939-\u193B\u1A17\u1A18\u1A56\u1A58-\u1A5E\u1A60\u1A62\u1A65-\u1A6C\u1A73-\u1A7C\u1A7F\u1B00-\u1B03\u1B34\u1B36-\u1B3A\u1B3C\u1B42\u1B6B-\u1B73\u1B80\u1B81\u1BA2-\u1BA5\u1BA8\u1BA9\u1BE6\u1BE8\u1BE9\u1BED\u1BEF-\u1BF1\u1C2C-\u1C33\u1C36\u1C37\u1CD0-\u1CD2\u1CD4-\u1CE0\u1CE2-\u1CE8\u1CED\u1DC0-\u1DE6\u1DFC-\u1DFF\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302F\u3099\u309A\uA66F\uA67C\uA67D\uA6F0\uA6F1\uA802\uA806\uA80B\uA825\uA826\uA8C4\uA8E0-\uA8F1\uA926-\uA92D\uA947-\uA951\uA980-\uA982\uA9B3\uA9B6-\uA9B9\uA9BC\uAA29-\uAA2E\uAA31\uAA32\uAA35\uAA36\uAA43\uAA4C\uAAB0\uAAB2-\uAAB4\uAAB7\uAAB8\uAABE\uAABF\uAAC1\uABE5\uABE8\uABED\uFB1E\uFE00-\uFE0F\uFE20-\uFE26\u0903\u093B\u093E-\u0940\u0949-\u094C\u094E\u094F\u0982\u0983\u09BE-\u09C0\u09C7\u09C8\u09CB\u09CC\u09D7\u0A03\u0A3E-\u0A40\u0A83\u0ABE-\u0AC0\u0AC9\u0ACB\u0ACC\u0B02\u0B03\u0B3E\u0B40\u0B47\u0B48\u0B4B\u0B4C\u0B57\u0BBE\u0BBF\u0BC1\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCC\u0BD7\u0C01-\u0C03\u0C41-\u0C44\u0C82\u0C83\u0CBE\u0CC0-\u0CC4\u0CC7\u0CC8\u0CCA\u0CCB\u0CD5\u0CD6\u0D02\u0D03\u0D3E-\u0D40\u0D46-\u0D48\u0D4A-\u0D4C\u0D57\u0D82\u0D83\u0DCF-\u0DD1\u0DD8-\u0DDF\u0DF2\u0DF3\u0F3E\u0F3F\u0F7F\u102B\u102C\u1031\u1038\u103B\u103C\u1056\u1057\u1062-\u1064\u1067-\u106D\u1083\u1084\u1087-\u108C\u108F\u109A-\u109C\u17B6\u17BE-\u17C5\u17C7\u17C8\u1923-\u1926\u1929-\u192B\u1930\u1931\u1933-\u1938\u19B0-\u19C0\u19C8\u19C9\u1A19-\u1A1B\u1A55\u1A57\u1A61\u1A63\u1A64\u1A6D-\u1A72\u1B04\u1B35\u1B3B\u1B3D-\u1B41\u1B43\u1B44\u1B82\u1BA1\u1BA6\u1BA7\u1BAA\u1BE7\u1BEA-\u1BEC\u1BEE\u1BF2\u1BF3\u1C24-\u1C2B\u1C34\u1C35\u1CE1\u1CF2\uA823\uA824\uA827\uA880\uA881\uA8B4-\uA8C3\uA952\uA953\uA983\uA9B4\uA9B5\uA9BA\uA9BB\uA9BD-\uA9C0\uAA2F\uAA30\uAA33\uAA34\uAA4D\uAA7B\uABE3\uABE4\uABE6\uABE7\uABE9\uABEA\uABEC] / "\uDB40" [\uDD00-\uDDEF] / "\uD834" [\uDD67-\uDD69\uDD7B-\uDD82\uDD85-\uDD8B\uDDAA-\uDDAD\uDE42-\uDE44\uDD65\uDD66\uDD6D-\uDD72] / "\uD804" [\uDC01\uDC38-\uDC46\uDC80\uDC81\uDCB3-\uDCB6\uDCB9\uDCBA\uDC00\uDC02\uDC82\uDCB0-\uDCB2\uDCB7\uDCB8] / "\uD800" [\uDDFD] / "\uD802" [\uDE01-\uDE03\uDE05\uDE06\uDE0C-\uDE0F\uDE38-\uDE3A\uDE3F]
UnicodeDigit = [\u0030-\u0039\u0660-\u0669\u06F0-\u06F9\u07C0-\u07C9\u0966-\u096F\u09E6-\u09EF\u0A66-\u0A6F\u0AE6-\u0AEF\u0B66-\u0B6F\u0BE6-\u0BEF\u0C66-\u0C6F\u0CE6-\u0CEF\u0D66-\u0D6F\u0E50-\u0E59\u0ED0-\u0ED9\u0F20-\u0F29\u1040-\u1049\u1090-\u1099\u17E0-\u17E9\u1810-\u1819\u1946-\u194F\u19D0-\u19D9\u1A80-\u1A89\u1A90-\u1A99\u1B50-\u1B59\u1BB0-\u1BB9\u1C40-\u1C49\u1C50-\u1C59\uA620-\uA629\uA8D0-\uA8D9\uA900-\uA909\uA9D0-\uA9D9\uAA50-\uAA59\uABF0-\uABF9\uFF10-\uFF19] / "\uD835" [\uDFCE-\uDFFF] / "\uD804" [\uDC66-\uDC6F] / "\uD801" [\uDCA0-\uDCA9]
UnicodeConnectorPunctuation = [\u005F\u203F\u2040\u2054\uFE33\uFE34\uFE4D-\uFE4F\uFF3F]
ZWNJ = "\u200C"
ZWJ = "\u200D"
